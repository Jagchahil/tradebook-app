import { NextRequest, NextResponse, after as afterResponse } from 'next/server';
import crypto from 'crypto';
import {
  usersDueDigest,
  bankEntriesForDigestMany,
  markDigestSentMany,
  addWaSend,
  countActiveSubscribers,
} from '../../../../lib/supabase';
import { sendText } from '../../../../lib/whatsapp';
import { buildDigest, decideDigest } from '../../../../lib/digest';
import { waSendsEnabled, globalDailyCapFor } from '../../../../lib/margin';

// The daily digest. "3 things landed from your bank today. Reply YES."
//
//   GET /api/cron/digest?secret=...
//
// THE ECONOMICS, BECAUSE THEY ARE THE WHOLE DESIGN.
//
// A ping per card payment would be lovely and we cannot afford it: a working
// tradesperson has twenty to sixty card payments a month, and our entire WhatsApp
// budget is NINETEEN sends per user per month (57.8p, lib/margin.ts). It would cost
// up to three times the whole budget and take the margin under 80%.
//
// One message a day fits. And most of them are FREE: Meta does not charge for a
// message sent inside the 24 hour window that opens whenever the USER last messaged
// us. So the loop is:
//
//     digest -> he replies YES -> his window reopens -> tomorrow's digest is FREE
//
// A man who files his books each day costs us nothing to reach. Only the first
// digest after a quiet spell is a paid template, and that is checked against the
// live budget before it goes.
//
// FREE SENDS ARE NOT BUDGETED, because they are free. Paid sends are, and they stop
// dead when the cap is hit. See lib/digest.ts.

export const runtime = 'nodejs';
export const maxDuration = 60;

const PAGE = 200;

// Vercel's scheduler sends `Authorization: Bearer <CRON_SECRET>`. Identical to the
// reminders cron on purpose: one way in, one thing to rotate, and constant time so
// the secret cannot be guessed a character at a time. Not configured means CLOSED.
function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get('authorization') || '';
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // The kill switch. One env var stops every proactive send we make.
  if (!waSendsEnabled()) {
    return NextResponse.json({ ok: true, skipped: 'sends_disabled' });
  }

  const subs = await countActiveSubscribers();
  const dailyCap = globalDailyCapFor(subs ?? 0);

  // Where we already are against today's global cap. addWaSend returns the running
  // count, so a paid send is only made when there is genuinely room for it.
  const sentToday = (await addWaSend(0)) ?? dailyCap;

  const cursor = req.nextUrl.searchParams.get('after');
  const page = await usersDueDigest(cursor, PAGE);

  // Everything this page needs, in two queries. See bankEntriesForDigestMany.
  const withPhones = page.users.filter((u) => u.phone_number);
  const entries = await bankEntriesForDigestMany(withPhones.map((u) => u.id));

  // DECIDE FIRST, SEND SECOND.
  //
  // The decision is pure and free, so it is made for the whole page in memory. That
  // means the WhatsApp budget is spent in a single, honest pass rather than drifting as
  // sends race each other.
  const plan: Array<{ id: string; phone: string; text: string; free: boolean }> = [];
  let skipped = 0;
  let budgetLeft = Math.max(0, dailyCap - sentToday);

  for (const u of withPhones) {
    const split = entries.get(u.id) ?? { filed: [], asking: [] };
    const decision = decideDigest({
      entryCount: split.filed.length + split.asking.length,
      lastInboundAt: u.last_inbound_at,
      lastDigestAt: u.last_digest_at,
      budgetLeft,
      sendsEnabled: true,
    });
    if (!decision.send) {
      skipped += 1;
      continue;
    }
    const text = buildDigest(split);
    if (!text) {
      skipped += 1;
      continue;
    }
    if (!decision.free) budgetLeft -= 1;
    plan.push({ id: u.id, phone: u.phone_number as string, text, free: decision.free });
  }

  const paid = plan.filter((p) => !p.free).length;

  // RESERVE THE SPEND BEFORE SPENDING IT.
  //
  // The counter used to go up after each send. If the function dies half way, the sends
  // happened and the count did not, so the next hop thinks it has money it has already
  // spent. Reserving up front means a crash makes us send LESS than we could, never
  // more. When the failure mode is "a bill", fail towards not spending.
  if (paid > 0) await addWaSend(paid);

  // Bounded concurrency. Serial was ninety seconds a page; unbounded would open two
  // hundred sockets to Meta at once and get us rate limited, which looks exactly like
  // being broken.
  const LANES = 8;
  let sentFree = 0;
  let sentPaid = 0;
  let cursorIdx = 0;
  const done: string[] = [];

  async function lane(): Promise<void> {
    for (;;) {
      const i = cursorIdx++;
      if (i >= plan.length) return;
      const job = plan[i];
      try {
        await sendText(job.phone, job.text);
        done.push(job.id);
        if (job.free) sentFree += 1;
        else sentPaid += 1;
      } catch {
        // One number failing is not the page failing. It is picked up tomorrow.
        skipped += 1;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(LANES, plan.length) }, lane));

  // One write for everyone who actually got a message. Only the ones who got one, so a
  // send that failed is retried tomorrow instead of being marked as delivered.
  await markDigestSentMany(done);

  // MORE USERS TO WALK? GO AND WALK THEM.
  //
  // This used to hand the cursor back in the JSON and stop, and NOTHING ON EARTH WAS
  // READING THAT JSON. Vercel calls this once a day, we answer "ok, and by the way
  // there are 99,800 more people", and the scheduler, which is not a person, does not
  // ring us back. So the digest reached the first 200 users by id and no one else, and
  // every id after those 200 got silence, forever, while the endpoint returned 200 OK.
  //
  // Same continuation the reminders cron already uses: hop to ourselves with the cursor,
  // AFTER the response has gone back, so Vercel is not waiting on us and the whole walk
  // is not trying to fit in one 60 second invocation.
  if (page.more && page.lastId) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://lekhio.app';
    const secret = process.env.CRON_SECRET;
    if (secret) {
      afterResponse(async () => {
        try {
          await fetch(`${appUrl}/api/cron/digest?after=${encodeURIComponent(page.lastId!)}`, {
            headers: { Authorization: `Bearer ${secret}` },
          });
        } catch {
          // The next daily run picks it up from the start. A missed digest is a
          // nuisance. A cron that retries in a tight loop is a bill.
        }
      });
    }
  }

  return NextResponse.json({
    ok: true,
    sentFree,
    sentPaid,
    skipped,
    budgetLeft,
    more: page.more,
    next: page.more ? page.lastId : null,
  });
}

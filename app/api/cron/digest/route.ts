import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  usersDueDigest,
  undigestedBankEntries,
  markDigestSent,
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
  let budgetLeft = Math.max(0, dailyCap - sentToday);

  const after = req.nextUrl.searchParams.get('after');
  const users = await usersDueDigest(after, PAGE);

  let sentFree = 0;
  let sentPaid = 0;
  let skipped = 0;
  let lastId: string | null = after;

  for (const u of users) {
    lastId = u.id;
    if (!u.phone_number) continue;

    const entries = await undigestedBankEntries(u.id);

    const decision = decideDigest({
      entryCount: entries.length,
      lastInboundAt: u.last_inbound_at,
      lastDigestAt: u.last_digest_at,
      budgetLeft,
      sendsEnabled: true,
    });

    if (!decision.send) {
      skipped += 1;
      continue;
    }

    const text = buildDigest(entries);
    if (!text) {
      skipped += 1;
      continue;
    }

    await sendText(u.phone_number, text);
    await markDigestSent(u.id);

    if (decision.free) {
      // Costs nothing. Not counted against the budget, because it is not spend.
      sentFree += 1;
    } else {
      // A paid template. Count it, and stop when the money runs out.
      await addWaSend(1);
      budgetLeft -= 1;
      sentPaid += 1;
    }
  }

  // More users to walk? Hand the cursor back so the next hop picks up where this
  // one stopped, rather than starting again and re-sending.
  const more = users.length === PAGE;

  return NextResponse.json({
    ok: true,
    sentFree,
    sentPaid,
    skipped,
    budgetLeft,
    more,
    next: more ? lastId : null,
  });
}

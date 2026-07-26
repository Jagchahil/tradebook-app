import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { after as afterResponse } from 'next/server';
import {
  trialsNeedingNudgePage,
  markTrialNudged,
  cronStarted,
  cronFinished,
  addWaSend,
} from '../../../../lib/supabase';
import { sendTemplate } from '../../../../lib/whatsapp';
import { decideTrialNudge, templateFor, paramsFor, type TrialRow } from '../../../../lib/trialnudge';

export const runtime = 'nodejs';

// A trial nudge run must be allowed to take its time. Without this it ran on the platform
// default, which is far shorter, so a long run was killed rather than finishing.
export const maxDuration = 60;

// Tell a man his free trial is ending, on WhatsApp, before he finds out by being locked out.
//
// Day 11: three days left. Day 14: it has ended, and nothing has been deleted. Two messages, ever.
// The policy lives in lib/trialnudge.ts and is pinned by tests. This route only carries it out.
//
// WHY THIS IS NOT AN APP STORE PROBLEM. The app itself contains no price and no link to pay, which
// is guideline 3.1.3(f) and the reason we keep 82% instead of 70%. But 3.1.3 also says, in Apple's
// own words: "Developers can send communications outside of the app to their user base about
// purchasing methods other than in-app purchase." He came to us on WhatsApp. We may answer there.
//
// SHIPS DARK. Nothing is sent until the two templates are approved in Meta and
// TRIAL_TEMPLATES_APPROVED is 'true'. Same pattern as the agent pings. A template send to an
// unapproved template does not error loudly, it just fails, and this codebase's whole failure mode
// is a green light with nothing behind it. So the gate is explicit.
//
// --- WHY THIS ROUTE IS SHAPED LIKE THE REMINDERS AND DIGEST CRONS ---
//
// It used to read every trialing subscription in one unbounded query and walk them in a plain
// serial `for` loop, with three awaits per man and no sense of the clock. That is fine at fifty
// trials and it is a silent failure at ten thousand: the function hits its wall part way down the
// list, Vercel kills it, and everyone below the cut is never told. Nothing errors. The endpoint
// returns 200. The men simply stop being warned, and the first they hear of it is being locked
// out of their own books.
//
// So it now uses the same three things the hardened crons use:
//   . a KEYSET CURSOR, so the walk resumes exactly where it stopped instead of restarting;
//   . a TIME BUDGET, so the page stops before the platform stops it, and hands the cursor on;
//   . BOUNDED CONCURRENCY, because serial is too slow and unbounded opens hundreds of sockets to
//     Meta at once, which looks exactly like being broken and gets us rate limited.
//
// And a hop counter, which the digest cron does not have: a cursor that somehow failed to advance
// would otherwise chain forever, and a cron that retries in a tight loop is a bill.
const SENDS_ENABLED = () => process.env.TRIAL_TEMPLATES_APPROVED === 'true';

const PAGE_SIZE = 200;
const BUDGET_MS = 40_000; // leaves room inside maxDuration to finish and hand off cleanly
const LANES = 8; // matches the digest cron's ceiling on concurrent Meta sends
const MAX_HOPS = 100; // 20,000 trials at a page each; a runaway guard, not a real ceiling

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
  if (!authorised(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const after = searchParams.get('after');
  const hop = Number(searchParams.get('hop') ?? '1') || 1;

  // Only the first hop opens the run. A continuation is the same run carrying on.
  if (!after) await cronStarted('trial');

  const started = Date.now();
  const page = await trialsNeedingNudgePage(after, PAGE_SIZE);

  if (page === null) {
    // We could not read. That is NOT "nobody needed telling", and we refuse to report it as such.
    // A cron that finishes ok having done nothing, because it could not see anything, is the exact
    // shape of every bug in this codebase. It finishes NOT ok, and the watchdog turns the light red.
    await cronFinished('trial', false, 0, 'could not read subscriptions');
    return NextResponse.json({ ok: false, error: 'unreadable' }, { status: 503 });
  }

  const now = new Date();
  let skipped = 0;

  // Decide first, send second. Working out who needs what is pure and fast; only the sending is
  // slow, so the concurrency belongs around the sends alone.
  //
  // The WHOLE row travels with the job, not just the phone. paramsFor reads current_period_end to
  // put the actual end date in the "three days left" message, so a job carrying anything less than
  // the real row would send every man a confidently wrong date.
  const plan: Array<{ phone: string; nudge: 'warn' | 'ended'; row: TrialRow }> = [];
  for (const row of page.rows) {
    const nudge = decideTrialNudge(row, now);
    if (!nudge || !row.phone) continue;
    if (!SENDS_ENABLED()) {
      // Dark. Count what we WOULD have sent, and do not mark the row, so that switching the flag on
      // tomorrow still catches everyone. A dry run that quietly marks people as told is a dry run
      // that loses them.
      skipped++;
      continue;
    }
    plan.push({ phone: row.phone, nudge, row });
  }

  let warned = 0;
  let ended = 0;
  let cursorIdx = 0;

  async function lane(): Promise<void> {
    for (;;) {
      const i = cursorIdx++;
      if (i >= plan.length) return;
      // Stop starting new sends once the budget is spent. Whatever is left on this page is picked
      // up by the next hop, which resumes from the same cursor, or by tomorrow's run. Nobody is
      // dropped, because nothing was marked for the ones we did not reach.
      if (Date.now() - started > BUDGET_MS) return;
      const job = plan[i];
      try {
        // Mark BEFORE sending. A crash between the two costs him one message. The other order
        // costs him the same message every morning until he blocks us. See markTrialNudged.
        const claimed = await markTrialNudged(job.phone, job.nudge);
        if (!claimed) continue; // somebody else already has this one
        await sendTemplate(job.phone, templateFor(job.nudge), 'en_GB', paramsFor(job.nudge, job.row));
        await addWaSend(1);
        if (job.nudge === 'warn') warned++;
        else ended++;
      } catch {
        // One number failing is not the page failing.
        skipped++;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(LANES, plan.length)) }, lane));

  // THE WALK IS OVER ONLY WHEN THERE IS NOTHING LEFT TO WALK.
  // Marking a HOP as finished would defeat the point: the failure we are guarding against is a
  // walk that stopped after one page and reported success.
  const lastHop = hop >= MAX_HOPS;
  if (!page.more || lastHop) {
    await cronFinished(
      'trial',
      !lastHop || !page.more,
      warned + ended,
      lastHop && page.more ? `stopped at the ${MAX_HOPS} hop guard with rows remaining` : undefined,
    );
  }

  if (page.more && page.lastId && !lastHop) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://lekhio.app';
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      await cronFinished('trial', false, warned + ended, 'CRON_SECRET missing: cannot continue past the first page');
    } else {
      afterResponse(async () => {
        try {
          await fetch(
            `${appUrl}/api/cron/trial?after=${encodeURIComponent(page.lastId!)}&hop=${hop + 1}`,
            { headers: { Authorization: `Bearer ${secret}` } },
          );
        } catch {
          // The next daily run picks it up from the start. A missed nudge is a nuisance.
          // A cron that retries in a tight loop is a bill.
        }
      });
    }
  }

  // Never the phone numbers, never the names. A cron log is not a place to put a customer list.
  return NextResponse.json({
    ok: true,
    sends_enabled: SENDS_ENABLED(),
    hop,
    warned,
    ended,
    would_have_sent: skipped,
    more: page.more,
  });
}

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { after as afterResponse } from 'next/server';
import {
  trialsNeedingNudgePage,
  markTrialNudged,
  cronStarted,
  cronFinished,
  addWaSend,
  emailForUser,
  getOptimiserInput,
  weeklyTotals,
  weeklyUpdateFactsFor,
} from '../../../../lib/supabase';
import { sendTemplate } from '../../../../lib/whatsapp';
import {
  decideTrialNudge, templateFor, paramsFor, trialWeekMessage, trialEndedMessage, type TrialRow,
} from '../../../../lib/trialnudge';
import { channelsFor } from '../../../../lib/routing';
import { templateSendable } from '../../../../lib/watemplates';
import { sendTrialWeekEmail, sendTrialEndedEmail, hasEmailConfig } from '../../../../lib/email';
import { weeklyInput, weeklyFigures } from '../../../../lib/weeklyupdate';
import { ledgerFor } from '../../../../lib/ledger';

export const runtime = 'nodejs';

// A trial nudge run must be allowed to take its time. Without this it ran on the platform
// default, which is far shorter, so a long run was killed rather than finishing.
export const maxDuration = 60;

// Tell a man his free trial is ending, before he finds out by being locked out.
//
// Day six of seven: his week, and one sentence saying it ends tomorrow. Day eight: it has ended and
// nothing has been deleted. Two messages, ever. The policy and the words both live in
// lib/trialnudge.ts and are pinned by tests. This route only carries them out.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 30 JULY: IT WAS WHATSAPP ONLY, AND ON 10 AUGUST THAT MEANT NOBODY.
//
// Every send in here was sendTemplate to row.phone, and decideTrialNudge opened by returning null
// when there was no phone. A web customer has no proved number until he binds one and launch one is
// the web, so the entire trial ladder reached zero people while reporting a clean run every morning.
//
// The channel is now lib/routing.ts's decision, asked per man at the moment of sending, and email
// is a real channel rather than a row in a table nobody read. What he is DUE is still
// decideTrialNudge's decision and nothing here second guesses it.
// ═══════════════════════════════════════════════════════════════════════════════════════════
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
// ⚠️ THIS GATE NOW GUARDS THE WHATSAPP HALF ONLY, AND THAT IS THE POINT OF SPLITTING IT.
//
// It exists because a template Meta has not approved fails silently rather than loudly, so nothing
// may reach one until somebody has confirmed it. That reasoning applies to TEMPLATES. It was
// applied to the whole route, so an unset flag meant a man heard nothing by any means, and the flag
// is unset today.
//
// Email needs no approval from anybody. lib/routing.ts drops whatsapp_template from the channel
// list when templateSendable says no, and the email channel stands on its own.
const TEMPLATES_ON = () => process.env.TRIAL_TEMPLATES_APPROVED === 'true';

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

// HIS WEEK, FROM THE SAME FUNCTIONS /app RENDERS AND THE WHATSAPP REPLY ANSWERS WITH.
//
// 🔴 ONE ENGINE, NEVER A SECOND. weeklyFigures() and ledgerFor() are the same calls the money screen
// makes. A cron that did its own arithmetic would be a fourth reader of one number, and
// /api/ledger's header lists the three times this codebase has already been caught that way. The
// day this message and his dashboard disagree by a pound is the day he stops believing either.
//
// Read for the handful of men on day six each morning, never for everybody.
//
// Fails towards the honest empty: if any read fails we say we have nothing to show him rather than
// inventing a confident zero, which is the same rule the 30 July reveal settled on.
async function weekFor(userId: string) {
  const empty = { income: 0, expenses: 0, profit: 0, saved: null as number | null, hasAnything: false };
  if (!userId) return empty;
  try {
    const [optimiser, totals, factsMap] = await Promise.all([
      getOptimiserInput(userId),
      weeklyTotals(userId),
      weeklyUpdateFactsFor([userId]).catch(() => null),
    ]);
    const figures = weeklyFigures(weeklyInput(totals, factsMap?.get(userId), new Date()));
    const ledger = ledgerFor(optimiser);
    return {
      income: figures.income,
      expenses: figures.expenses,
      profit: figures.profit,
      // ⚠️ NULL WHEN THE LEDGER REFUSES TO BE CONFIDENT, never a zero dressed up as an answer.
      // lib/ledger.ts will not draw a figure off three weeks of data, and `enough` is how it says so.
      saved: ledger.enough ? ledger.saved : null,
      hasAnything: figures.income !== 0 || figures.expenses !== 0,
    };
  } catch {
    return empty;
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
  const plan: Array<{ id: string; nudge: 'warn' | 'ended'; row: TrialRow & { id: string } }> = [];
  for (const row of page.rows) {
    const nudge = decideTrialNudge(row, now);
    // ⚠️ NO PHONE CHECK HERE ANY MORE. It used to sit on this line and it was a channel question
    // deciding a policy outcome: no number meant no message by any route, for ever.
    if (!nudge) continue;
    plan.push({ id: row.id, nudge, row });
  }

  let warned = 0;
  let ended = 0;
  let unreachable = 0;
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
        const userId = job.row.user_id ?? '';
        const email = userId ? await emailForUser(userId) : null;

        // 🔴 THE TABLE DECIDES, PER MAN, AT THE MOMENT OF SENDING. A channel we cannot reach him on
        // simply drops out, and lib/routing.ts drops whatsapp_template on its own when the template
        // is not sendable. Nothing here substitutes one channel for another.
        const channels = channelsFor(
          job.nudge === 'warn' ? 'trial_ending' : 'trial_ended',
          {
            hasPush: false,
            hasEmail: Boolean(email) && hasEmailConfig(),
            hasWhatsApp: Boolean(job.row.phone) && TEMPLATES_ON(),
          },
        );

        // ⚠️ AN EMPTY LIST IS SAID OUT LOUD AND THE ROW IS LEFT ALONE.
        //
        // A man we cannot reach today may be reachable tomorrow: he binds a phone, or an address
        // gets attached. Marking him told would spend the one message he was ever going to get on a
        // send that never happened, which is the silent failure this whole route is shaped around.
        if (channels.length === 0) {
          unreachable++;
          continue;
        }

        // Mark BEFORE sending. A crash between the two costs him one message. The other order
        // costs him the same message every morning until he blocks us. See markTrialNudged.
        const claimed = await markTrialNudged(job.id, job.nudge);
        if (!claimed) continue; // somebody else already has this one

        if (channels.includes('whatsapp_template') && job.row.phone && templateSendable(templateFor(job.nudge))) {
          await sendTemplate(job.row.phone, templateFor(job.nudge), 'en_GB', paramsFor(job.nudge, job.row));
          await addWaSend(1);
        }

        if (channels.includes('email') && email) {
          if (job.nudge === 'warn') {
            await sendTrialWeekEmail(email, trialWeekMessage(await weekFor(userId)));
          } else {
            await sendTrialEndedEmail(email, trialEndedMessage());
          }
        }

        if (job.nudge === 'warn') warned++;
        else ended++;
      } catch {
        // One man failing is not the page failing.
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
  // ⚠️ `unreachable` IS REPORTED BESIDE THE SENDS AND IS MEANT TO BE READ WITH THEM. A run that
  // warned nobody and could not reach forty people is not a quiet week, it is a broken channel, and
  // the only difference between those two readings is this number being on the page.
  return NextResponse.json({
    ok: true,
    templates_enabled: TEMPLATES_ON(),
    email_configured: hasEmailConfig(),
    hop,
    warned,
    ended,
    unreachable,
    failed: skipped,
    more: page.more,
  });
}

import { NextRequest, NextResponse, after } from 'next/server';
import crypto from 'crypto';
import {
  getDueReminders,
  claimDueReminder,
  getPhoneForUser,
  listNudgeTargetsPage,
  getNudgePrefsForUsers,
  cronStarted,
  cronFinished,
  sweepRateHits,
  sweepAuthSends,
  pruneOldRows,
  addWaSend,
  countActiveSubscribers,
} from '../../../../lib/supabase';
import { waSendsEnabled, waBudgetExceeded, globalDailyCapFor } from '../../../../lib/margin';
import { sendTemplate, hasSendConfig } from '../../../../lib/whatsapp';
import { sendExpoPush, isExpoPushToken } from '../../../../lib/push';
import { T_NUDGE, T_REMINDER, templateSendable } from '../../../../lib/watemplates';
import { hasBankFeedConfig } from '../../../../lib/bankfeed';
import {
  listWeeklyTargetsPage, emailsForUsers, trialingUserIds,
} from '../../../../lib/supabase';
import { channelsFor } from '../../../../lib/routing';
import { sendWeeklyReadyEmail, hasEmailConfig } from '../../../../lib/email';
import { syncPageResumable } from '../../../../lib/banksync';

// The reminder engine. Hit on a schedule (Vercel Cron, Supabase pg_cron, or any
// external cron such as cron-job.org). Guarded by CRON_SECRET.
//   ?job=due      send any reminders whose time has come
//   ?job=nudge    the "don't forget your expenses" text
//   ?job=weekly   a short weekly money summary
//   ?job=cleanup  prune idempotency, session and counter tables
//
// BUILT FOR 20,000+ USERS. A single serverless invocation cannot fan out that
// many WhatsApp sends inside its duration limit, so the fan out is RESUMABLE:
// every invocation acknowledges immediately, does up to ~40 seconds of sending
// in after(), and then triggers a continuation invocation of itself with a
// keyset cursor (?after=<last user id>&hop=<n>). The continuation also acks
// immediately, so no invocation ever waits on another. The cursor is strictly
// increasing and the hop count is capped, so a loop is impossible. This works
// on both the Hobby (60s) and Pro (300s) limits without knowing which we are on.

// Header-only and timing-safe. We do not accept the secret in the query string,
// because URLs end up in proxy and access logs and Referer headers. Send it as
// `Authorization: Bearer <CRON_SECRET>` from the scheduler.
function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // not configured means closed
  const header = req.headers.get('authorization') || '';
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  } catch {
    return false;
  }
}

export const runtime = 'nodejs';
export const maxDuration = 60;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://lekhio.app';
const SEND_BUDGET_MS = 40_000; // stop sending well inside the 60s Hobby limit
const PAGE_SIZE = 500;
const MAX_HOPS = 100; // 100 hops x thousands of sends per hop is far beyond 20k

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 27 JULY 2026: THE WEEKLY SUMMARY STOPPED BEING A PUSH.
//
// It used to send the figures as a paid WhatsApp template every Sunday, to everybody. Two things
// were wrong with that and only one of them was a bug.
//
// THE BUG: 'lekhio_weekly' and 'lekhio_weekly_v2' did not exist in Meta. Every Sunday send had
// been failing silently for weeks, and nothing anywhere knew. lib/watemplates.ts and its test now
// make that class of failure impossible to reintroduce.
//
// THE DESIGN ERROR, which is the more expensive one: every business-initiated WhatsApp message is
// paid for. At an 85% target margin, pushing a summary at every customer every week, forever, is a
// permanent line of cost for something most of them could simply look at. So the summary now lives
// in the product, free, where we control every word, and it is COMPUTED ON DEMAND rather than
// posted. WhatsApp carries it only when he asks, which is a reply inside the free inbound window
// and needs no template at all. Push is expensive, pull is free.
//
// What is left on a Sunday is a push notification that says the numbers are in, and nothing else.
// It carries no figures, so it needs no reads: this job no longer touches weeklyTotals or the
// weekly facts RPC, which is a page of database work per Sunday that simply stopped existing.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// The Sunday notification. Deliberately the whole message: what changed is that his numbers are
// ready, and the figures are one tap away in a place that is free to read.
const WEEKLY_PUSH_TITLE = 'Your week is ready';
const WEEKLY_PUSH_BODY = 'Your numbers for the week are in. Open Lekhio to see them.';

// Run an async task over a list with a fixed number of workers, so we never
// loop thousands of sequential awaits. Concurrency 20 keeps us under Meta's
// default ~80 messages a second too.
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const item = items[i++];
      try {
        await fn(item);
      } catch {
        // One failed send must not stop the rest.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

// Trigger the next hop. The continuation acks immediately (same handler), so
// this await resolves in milliseconds and never chains durations. `afterId` is
// nullable so this doubles as the kick off for a chain that starts with no
// cursor (the daily run starting the bank feed walk from the first connection).
async function triggerContinuation(job: string, afterId: string | null, hop: number): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return;
  const cursor = afterId ? `&after=${encodeURIComponent(afterId)}` : '';
  try {
    await fetch(
      `${APP_URL}/api/cron/reminders?job=${encodeURIComponent(job)}${cursor}&hop=${hop}`,
      { headers: { Authorization: `Bearer ${secret}` } },
    );
  } catch (err) {
    console.error('[cron] continuation trigger failed:', err instanceof Error ? err.message : err);
  }
}

// The nudge and weekly fan out, one budget's worth, then hand over the cursor.
// ⚠️ THE NUDGE ONLY. It used to serve the weekly notification too, with a `usesWhatsApp` flag
// branching almost every line, and that shared shape is what made the weekly notification phone
// gated: one target query, written for a job that needs a number, feeding a job that does not.
// See weeklyFanOut below.
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 A JOB THAT IS SWITCHED OFF ON PURPOSE MUST SAY SO, NOT GO QUIET.
//
// This cost us a 503 and an UptimeRobot page on 30 July, with nothing whatsoever wrong. The nudge
// has two deliberate off switches, the WhatsApp kill switch and the Meta template gate, and both
// used to `console.log` and return BEFORE the watchdog row was written. So a job we had chosen not
// to run was indistinguishable, to /api/health, from a job that had died. Eighty hours later the
// site went red and the whole product looked down.
//
// It is the house disease again: a check that cannot tell "no" from "nothing". The walk is over the
// moment we decide not to do it, so we record that it started, finished, and why it sent nothing.
// The watchdog keeps watching and the row carries the reason. Health stays green because the
// silence was ours.
//
// ⚠️ This is NOT the same as loosening the alarm. If the cron genuinely stops firing, no row is
// written by anybody and /api/health still goes red exactly as before.
// ═══════════════════════════════════════════════════════════════════════════════════════════
async function skippedOnPurpose(job: string, startAfter: string | null, why: string): Promise<void> {
  console.log(`[cron] job=${job} skipped: ${why}`);
  // Only on the first hop. A later page of a walk we already recorded must not restate the start.
  if (startAfter !== null) return;
  await cronStarted(job);
  await cronFinished(job, true, 0, `skipped on purpose: ${why}`);
}

async function fanOut(startAfter: string | null, hop: number): Promise<void> {

  const job = 'nudge' as const;
  const started = Date.now();
  let sent = 0;
  // ⚠️ ONLY THE NUDGE SPENDS MONEY NOW. The weekly job sends a push notification, which is free,
  // so the WhatsApp kill switch, the daily cap and the send budget below all apply to the nudge and
  // not to it. Gating a free send on a cost brake would mean a man stops hearing that his numbers
  // are ready because we are watching a bill he is not on.

  // Emergency brake: if proactive sends are switched off, do nothing. This is the
  // cost kill switch (scale audit); inbound service replies are unaffected.
  if (!waSendsEnabled()) {
    await skippedOnPurpose(job, startAfter, 'proactive WhatsApp sends are switched off (WHATSAPP_SENDS_ENABLED=false)');
    return;
  }

  // A nudge cannot go out until Meta has approved the template. This is the gate the reminder
  // engine never had, and its absence is exactly why four bad template names sat here unnoticed:
  // there was nothing that had to be switched on, so there was nothing anybody had to check.
  if (!templateSendable(T_NUDGE)) {
    await skippedOnPurpose(job, startAfter, `${T_NUDGE} is not approved in Meta yet (set REMINDER_TEMPLATES_APPROVED=true once it is)`);
    return;
  }
  // The day's send ceiling, DERIVED from the live paying base and the margin
  // target (lib/margin.ts), so WhatsApp spend can never outgrow revenue. A
  // failed count falls back to the safe floor rather than sending uncapped.
  const subs = await countActiveSubscribers();
  const dailyCap = globalDailyCapFor(subs ?? 0);

  // The weekly totals used to be fetched HERE, for EVERY USER ALIVE, in one payload, and
  // held in a Map before the paging loop below had even started. All the careful pagination
  // underneath it was decorative: at a hundred thousand users the function dies on that one
  // query and nobody gets a Monday brief at all.
  //
  // Now they are fetched per page, inside the loop, for the people we are about to text.

  // THE WATCHDOG. A walk that dies does not fail, it just never finishes, and the endpoint
  // keeps answering 200 while it does not finish. So we write down when a walk STARTS and
  // when it FINISHES, and /api/health goes red when a job has been quiet too long.
  //
  // Note it marks the finish of the WALK, not of a hop. Finishing a page is not finishing
  // the job, and conflating the two is precisely how the digest reached the first two
  // hundred users and reported success every single day.
  if (startAfter === null) {
    await cronStarted(job);
    await sweepRateHits(); // housekeeping, piggybacked. No separate schedule to forget.
    // Ninety days of hashed login attempts is enough to investigate an incident and short enough
    // that we are not keeping a record of every sign in for ever. Wired here rather than left as a
    // function nobody calls: this codebase's disease is a job that exists and never runs.
    await sweepAuthSends();
  }

  let cursor = startAfter;
  let runningTotal: number | null = null; // today's global proactive-send count
  for (;;) {
    // Stop before sending another page once the day's send budget is reached.
    // We can overshoot by at most one page (checked on the prior page's total).
    if (runningTotal != null && waBudgetExceeded(runningTotal, dailyCap)) {
      console.error(
        `[cron] job=${job} WhatsApp daily budget reached (${runningTotal}/${dailyCap}, subs=${subs ?? 'unknown'}), stopping with cursor set`,
      );
      // Deliberate, not a death. The day's money is spent and we stop on purpose, so the
      // walk counts as finished: the watchdog must not cry wolf about a guard working.
      await cronFinished(job, true, hop, `budget reached (${runningTotal}/${dailyCap})`);
      return;
    }
    const { targets, last } = await listNudgeTargetsPage(cursor, PAGE_SIZE);
    if (targets.length === 0) break;
    // Prefs for just this page, not the whole table on every hop.
    const prefs = await getNudgePrefsForUsers(targets.map((t) => t.user_id));
    const wanted = targets.filter((t) => {
      const p = prefs.get(t.user_id);
      return p ? p.daily_nudges : true;
    });

    // No figures are read here any more. The Sunday notification says the numbers are ready and
    // nothing else, so the two per page RPC round trips this job used to make (weeklyTotalsFor and
    // weeklyUpdateFactsFor) are gone. The figures are computed when he actually opens them, for the
    // few who do, instead of for everybody every week whether they look or not.
    // RESERVE THE SPEND BEFORE SPENDING IT. Same rule the digest follows.
    //
    // This used to count the sends AFTER the page had gone out. If the function died mid-page the
    // messages were sent and the counter never moved, so the next hop believed it still had money
    // it had already spent, and could go over the cap. Reserving up front means a crash makes us
    // send LESS than we could, never more. When the failure mode is a bill, fail towards not
    // spending.
    //
    // `wanted` is exactly who we are about to text, so this is not an estimate.
    if (wanted.length > 0) {
      const reserved = await addWaSend(wanted.length);
      if (reserved != null) runningTotal = reserved;
    }

    let pageSent = 0;
    await mapLimit(wanted, 20, async (t) => {
      await sendTemplate(t.phone, T_NUDGE, 'en_GB', []);
      sent++;
      pageSent++;
    });
    // Already counted, above, before the sends went out. If a send FAILED we have over-reserved
    // by one, which costs us nothing but a slightly early stop. That is the safe direction and it
    // is not worth a compensating write to correct.
    if (pageSent !== wanted.length) {
      console.error(`[cron] job=${job} sent ${pageSent} of ${wanted.length} reserved`);
    }
    if (!last) break; // final page done
    cursor = last;
    if (Date.now() - started > SEND_BUDGET_MS) {
      if (hop + 1 > MAX_HOPS) {
        console.error(`[cron] job=${job} hop cap reached at hop=${hop}, stopping with cursor set`);
        // NOT ok. The cap exists to stop a runaway, so hitting it means either we have
        // outgrown MAX_HOPS or a cursor is not advancing. Either way somebody after this
        // point got nothing, and somebody should hear about it.
        await cronFinished(job, false, hop, `hop cap reached at hop ${hop}, users after the cursor were not reached`);
        return;
      }
      console.log(`[cron] job=${job} hop=${hop} sent=${sent} continuing after=${cursor}`);
      await triggerContinuation(job, cursor, hop + 1);
      return;
    }
  }
  console.log(`[cron] job=${job} hop=${hop} sent=${sent} complete`);
  await cronFinished(job, true, hop);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE SUNDAY NOTIFICATION, AND ON 10 AUGUST THE OLD ONE WOULD HAVE REACHED NOBODY.
//
// It shared fanOut() with the nudge, so it inherited the nudge's target query, and that query
// filters `phone_number=not.is.null`. Then it sent an Expo push, which needs the mobile app. So a
// web customer failed BOTH gates: not in the list, and no app to receive it if he had been.
//
// Launch one is the web and the app is not released. The job would have run every Sunday at 23:00,
// called cronFinished(ok), and delivered zero messages. That is the house disease in its purest
// form: something that does nothing and looks completely fine.
//
// What changed, and none of it is new policy:
//   . it walks EVERY user, not only the ones with a number, via listWeeklyTargetsPage
//   . lib/routing.ts decides the channels, and `weekly_ready` has said ['push','email'] since
//     28 July. The email half simply did not exist. Now it does.
//   . a man mid trial is left out entirely, because he gets ONE message on day six that carries his
//     week, and a Sunday notification landing beside it is the second message Jag said he must not
//     get. On a seven day trial it can easily be the one that arrives on day one with nothing in it.
//
// ⚠️ IT COSTS NOTHING. Push and email are both free, so there is no send budget, no daily cap, no
// WhatsApp kill switch and no template gate in here. All of those exist in fanOut() to protect a
// bill this job is not on, and gating a free send on a cost brake would mean a man stops hearing
// that his numbers are ready because we are watching money he does not spend.
// ═══════════════════════════════════════════════════════════════════════════════════════════
async function weeklyFanOut(startAfter: string | null, hop: number): Promise<void> {
  const job = 'weekly' as const;
  const started = Date.now();
  let sent = 0;
  let noChannel = 0;
  let inTrial = 0;

  if (startAfter === null) await cronStarted(job);

  let cursor = startAfter;
  for (;;) {
    const { targets, last } = await listWeeklyTargetsPage(cursor, PAGE_SIZE);
    if (targets.length === 0) break;

    const ids = targets.map((t) => t.user_id);
    // Three reads per page rather than three per man, the same shape getNudgePrefsForUsers already
    // uses. A per user query inside a page loop is a page of round trips per page of customers.
    const [prefs, emails, trialing] = await Promise.all([
      getNudgePrefsForUsers(ids),
      emailsForUsers(ids),
      trialingUserIds(ids),
    ]);

    const wanted = targets.filter((t) => {
      if (trialing.has(t.user_id)) { inTrial++; return false; }
      const p = prefs.get(t.user_id);
      return p ? p.weekly_summary : true;
    });

    await mapLimit(wanted, 20, async (t) => {
      const email = emails.get(t.user_id) ?? null;
      const channels = channelsFor('weekly_ready', {
        hasPush: isExpoPushToken(t.expo_push_token),
        hasEmail: Boolean(email) && hasEmailConfig(),
        hasWhatsApp: false,
      });

      // ⚠️ REACHED NOBODY IS COUNTED, NOT SHRUGGED OFF. The old version logged a push token miss and
      // that instinct was right; what it could not see was that most of the base was never in the
      // list to begin with. These two numbers are meant to be read next to `sent`.
      if (channels.length === 0) { noChannel++; return; }

      if (channels.includes('push') && isExpoPushToken(t.expo_push_token)) {
        await sendExpoPush(t.expo_push_token as string, WEEKLY_PUSH_TITLE, WEEKLY_PUSH_BODY);
      }
      // BOTH, not one or the other. lib/routing.ts's own header is explicit that the channels in a
      // row are attempted rather than fallen back through: a man with the app gets the push AND the
      // email, because Jag's 28 July decision was that everybody gets the email.
      if (channels.includes('email') && email) {
        await sendWeeklyReadyEmail(email);
      }
      sent++;
    });

    if (!last) break;
    cursor = last;
    if (Date.now() - started > SEND_BUDGET_MS) {
      if (hop + 1 > MAX_HOPS) {
        console.error(`[cron] job=${job} hop cap reached at hop=${hop}, stopping with cursor set`);
        await cronFinished(job, false, hop, `hop cap reached at hop ${hop}, users after the cursor were not reached`);
        return;
      }
      console.log(`[cron] job=${job} hop=${hop} sent=${sent} continuing after=${cursor}`);
      await triggerContinuation(job, cursor, hop + 1);
      return;
    }
  }
  console.log(`[cron] job=${job} hop=${hop} sent=${sent} in_trial=${inTrial} no_channel=${noChannel} complete`);
  await cronFinished(job, true, hop);
}

// The bank feed sync as a RESUMABLE hop chain, mirroring fanOut() above. This is
// what actually reaches all 20,000+ connections: one invocation reads and syncs
// one keyset page within a budget, then triggers a continuation of itself with
// the cursor of the last connection id it saw. Each continuation acks
// immediately (same handler, work in after()), so no invocation ever waits on
// another and durations never chain.
//
// HOW THE CHAIN TERMINATES. Two independent guards, either of which stops it:
//   1. Completion. syncPageResumable reports done=true as soon as a page comes
//      back smaller than its page limit. Because connections are read strictly
//      ordered by id ascending and every hop asks for id greater than the last
//      cursor, the cursor is strictly increasing over a finite id set, so the
//      walk must reach a final short (or empty) page and stop. No further hop is
//      triggered once done is true.
//   2. Hop cap. Even if something went wrong (e.g. a cursor that failed to
//      advance), the hop counter is capped at MAX_HOPS. Once hop+1 would exceed
//      the cap we log and stop without triggering another hop. So a loop is
//      impossible: it ends on the last page, or on the cap, whichever comes
//      first.
async function bankFeedFanOut(startAfter: string | null, hop: number): Promise<void> {
  if (!hasBankFeedConfig()) return; // dormant without the bank feed keys
  const started = Date.now();
  let cursor = startAfter;
  let processed = 0;
  let inserted = 0;

  for (;;) {
    const remaining = SEND_BUDGET_MS - (Date.now() - started);
    if (remaining <= 0) {
      // Budget spent mid page set. Hand the cursor to a continuation so the walk
      // resumes exactly where it left off, unless we would exceed the hop cap.
      if (hop + 1 > MAX_HOPS) {
        console.error(`[cron] job=bankfeed hop cap reached at hop=${hop}, stopping with cursor set`);
        break;
      }
      if (!cursor) break; // no progress made yet, nothing to resume from
      console.log(`[cron] job=bankfeed hop=${hop} processed=${processed} inserted=${inserted} continuing after=${cursor}`);
      await triggerContinuation('bankfeed', cursor, hop + 1);
      return;
    }

    // Concurrency 5: each connection makes several TrueLayer calls (refresh then
    // per account transactions), so a smaller pool than the WhatsApp sends keeps
    // us well within TrueLayer's rate limits (429s are retried in bankfeed.ts).
    const page = await syncPageResumable(cursor, remaining, 5);
    processed += page.processed;
    inserted += page.inserted;

    if (page.done) break; // final short/empty page: the walk is complete

    // Guard against a stuck cursor (should never happen given id.asc ordering):
    // if the cursor did not advance, stop rather than loop forever.
    if (!page.lastId || page.lastId === cursor) break;
    cursor = page.lastId;

    // If the budget is now spent, the top of the loop handles the handover.
    if (Date.now() - started > SEND_BUDGET_MS) {
      if (hop + 1 > MAX_HOPS) {
        console.error(`[cron] job=bankfeed hop cap reached at hop=${hop}, stopping with cursor set`);
        break;
      }
      console.log(`[cron] job=bankfeed hop=${hop} processed=${processed} inserted=${inserted} continuing after=${cursor}`);
      await triggerContinuation('bankfeed', cursor, hop + 1);
      return;
    }
  }
  console.log(`[cron] job=bankfeed hop=${hop} processed=${processed} inserted=${inserted} complete`);
}

async function runJob(job: string, afterId: string | null, hop: number): Promise<void> {
  try {
    if (job === 'due') {
      if (hop === 1) await cronStarted('due');
      // One-time side jobs run ONLY on the first invocation (hop 1), before the
      // resumable send loop, so they always happen exactly once even when the
      // send loop hands over to a continuation. Housekeeping rides along with the
      // daily run so no extra cron entry is needed (the Hobby plan caps cron
      // jobs, and a bad cron config once silently blocked every deploy).
      if (hop === 1) {
        const { pruned } = await pruneOldRows();
        // Kick the bank feed walk and the agent walk as their OWN resumable
        // chains. Fire and forget: each acks immediately, so the due job never
        // waits on them. No-ops until those features are switched on.
        if (hasBankFeedConfig()) await triggerContinuation('bankfeed', null, 1);
        const cronSecret = process.env.CRON_SECRET;
        if (cronSecret) {
          try {
            await fetch(`${APP_URL}/api/cron/agent`, { headers: { Authorization: `Bearer ${cronSecret}` } });
          } catch (err) {
            console.error('[cron] agent kick failed:', err instanceof Error ? err.message : err);
          }
        }
        console.log(`[cron] job=due hop=1 pruned=${pruned} bankfeed=${hasBankFeedConfig() ? 'kicked' : 'dormant'} agent=kicked`);
      }

      // Resumable send. Every returned reminder is atomically claimed
      // (reminded=true) before sending, so the next getDueReminders page never
      // returns it again. The claim IS the cursor: the reminded=false set shrinks
      // every iteration, so the walk always makes progress and cannot loop. When
      // the budget is spent mid set, hand over to a continuation of the due job.
      const started = Date.now();
      let sent = 0;
      // Respect the proactive-send kill switch. Due reminders are not claimed
      // when sends are off, so they stay due and go out once sending resumes.
      // Same two gates as the nudge: the cost kill switch, and Meta having actually approved the
      // template. A due reminder is not claimed when either is off, so it stays due and goes out
      // once sending resumes, rather than being burned on a send that cannot land.
      const dueSendsOn = waSendsEnabled() && templateSendable(T_REMINDER);
      for (; dueSendsOn; ) {
        const due = await getDueReminders(new Date().toISOString(), PAGE_SIZE);
        if (due.length === 0) break;
        await mapLimit(due, 20, async (r) => {
          if (!(await claimDueReminder(r.id))) return; // another run took it
          const phone = await getPhoneForUser(r.user_id);
          if (!phone) return;
          await sendTemplate(phone, T_REMINDER, 'en_GB', [r.title]);
          sent++;
        });
        if (due.length < PAGE_SIZE) break; // final page
        if (Date.now() - started > SEND_BUDGET_MS) {
          if (hop + 1 > MAX_HOPS) {
            console.error(`[cron] job=due hop cap reached at hop=${hop}, stopping`);
            await cronFinished('due', false, hop, `hop cap reached at hop ${hop}, reminders after this point were not sent`);
            return;
          }
          console.log(`[cron] job=due hop=${hop} sent=${sent} continuing`);
          await triggerContinuation('due', null, hop + 1);
          return;
        }
      }
      console.log(`[cron] job=due hop=${hop} sent=${sent} complete`);
      await cronFinished('due', true, hop);
    } else if (job === 'nudge' || job === 'weekly') {
      if (job === 'weekly') await weeklyFanOut(afterId, hop);
      else await fanOut(afterId, hop);
    } else if (job === 'cleanup') {
      const { pruned } = await pruneOldRows();
      console.log(`[cron] job=cleanup pruned=${pruned}`);
    } else if (job === 'bankfeed') {
      // The resumable bank feed walk. The daily due job kicks off the first hop
      // (?job=bankfeed with no cursor); each hop self-continues with ?after=
      // until the whole linked set is covered. Also usable as a manual trigger.
      await bankFeedFanOut(afterId, hop);
    }
  } catch (err) {
    console.error('[cron] error', err instanceof Error ? err.message : err);
  }
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });
  if (!hasSendConfig()) return NextResponse.json({ error: 'WhatsApp is not configured yet.' }, { status: 503 });

  const params = new URL(req.url).searchParams;
  const job = params.get('job') ?? 'due';
  const afterId = params.get('after');
  const hop = Math.max(1, parseInt(params.get('hop') ?? '1', 10) || 1);

  if (!['due', 'nudge', 'weekly', 'cleanup', 'bankfeed'].includes(job)) {
    return NextResponse.json({ error: 'Unknown job.' }, { status: 400 });
  }
  if (hop > MAX_HOPS) {
    return NextResponse.json({ error: 'Hop cap reached.' }, { status: 400 });
  }

  // Acknowledge immediately, work in after(). This is what makes the
  // continuation chain safe: no invocation ever waits for another to finish.
  after(() => runJob(job, afterId, hop));
  return NextResponse.json({ ok: true, job, hop, scheduled: true });
}

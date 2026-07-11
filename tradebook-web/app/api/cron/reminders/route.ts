import { NextRequest, NextResponse, after } from 'next/server';
import crypto from 'crypto';
import {
  getDueReminders,
  claimDueReminder,
  getPhoneForUser,
  listNudgeTargetsPage,
  getNudgePrefsForUsers,
  weeklyTotals,
  weeklyTotalsAll,
  pruneOldRows,
  addWaSend,
  countActiveSubscribers,
} from '../../../../lib/supabase';
import { waSendsEnabled, waBudgetExceeded, globalDailyCapFor } from '../../../../lib/margin';
import { sendTemplate, hasSendConfig } from '../../../../lib/whatsapp';
import { hasBankFeedConfig } from '../../../../lib/bankfeed';
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

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tradebook-app-five.vercel.app';
const SEND_BUDGET_MS = 40_000; // stop sending well inside the 60s Hobby limit
const PAGE_SIZE = 500;
const MAX_HOPS = 100; // 100 hops x thousands of sends per hop is far beyond 20k

function gbp(n: number): string {
  return `£${Math.abs(n).toFixed(2)}`;
}

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
async function fanOut(job: 'nudge' | 'weekly', startAfter: string | null, hop: number): Promise<void> {
  const started = Date.now();
  let sent = 0;
  // Emergency brake: if proactive sends are switched off, do nothing. This is the
  // cost kill switch (scale audit); inbound service replies are unaffected.
  if (!waSendsEnabled()) {
    console.log(`[cron] job=${job} proactive WhatsApp sends disabled (WHATSAPP_SENDS_ENABLED=false), skipping`);
    return;
  }
  // The day's send ceiling, DERIVED from the live paying base and the margin
  // target (lib/margin.ts), so WhatsApp spend can never outgrow revenue. A
  // failed count falls back to the safe floor rather than sending uncapped.
  const subs = await countActiveSubscribers();
  const dailyCap = globalDailyCapFor(subs ?? 0);

  // One grouped aggregate for the weekly totals; falls back per user until the
  // weekly_totals_all RPC (supabase/schema.sql) is applied.
  const all = job === 'weekly' ? await weeklyTotalsAll() : null;
  const totalsMap = all ? new Map(all.map((r) => [r.user_id, r])) : null;

  let cursor = startAfter;
  let runningTotal: number | null = null; // today's global proactive-send count
  for (;;) {
    // Stop before sending another page once the day's send budget is reached.
    // We can overshoot by at most one page (checked on the prior page's total).
    if (runningTotal != null && waBudgetExceeded(runningTotal, dailyCap)) {
      console.error(
        `[cron] job=${job} WhatsApp daily budget reached (${runningTotal}/${dailyCap}, subs=${subs ?? 'unknown'}), stopping with cursor set`,
      );
      return;
    }
    const { targets, last } = await listNudgeTargetsPage(cursor, PAGE_SIZE);
    if (targets.length === 0) break;
    // Prefs for just this page, not the whole table on every hop.
    const prefs = await getNudgePrefsForUsers(targets.map((t) => t.user_id));
    const wanted = targets.filter((t) => {
      const p = prefs.get(t.user_id);
      return job === 'nudge' ? (p ? p.daily_nudges : true) : (p ? p.weekly_summary : true);
    });
    let pageSent = 0;
    if (job === 'nudge') {
      await mapLimit(wanted, 20, async (t) => {
        await sendTemplate(t.phone, 'lekhio_nudge', 'en_GB', []);
        sent++;
        pageSent++;
      });
    } else {
      await mapLimit(wanted, 20, async (t) => {
        const row = totalsMap ? totalsMap.get(t.user_id) ?? { income: 0, expenses: 0 } : await weeklyTotals(t.user_id);
        const profit = row.income - row.expenses;
        await sendTemplate(t.phone, 'lekhio_weekly', 'en_GB', [gbp(row.income), gbp(row.expenses), gbp(profit)]);
        sent++;
        pageSent++;
      });
    }
    // One counter write per page (not per message) keeps the daily budget honest
    // across hops and instances without a write per send.
    if (pageSent > 0) {
      const total = await addWaSend(pageSent);
      if (total != null) runningTotal = total;
    }
    if (!last) break; // final page done
    cursor = last;
    if (Date.now() - started > SEND_BUDGET_MS) {
      if (hop + 1 > MAX_HOPS) {
        console.error(`[cron] job=${job} hop cap reached at hop=${hop}, stopping with cursor set`);
        break;
      }
      console.log(`[cron] job=${job} hop=${hop} sent=${sent} continuing after=${cursor}`);
      await triggerContinuation(job, cursor, hop + 1);
      return;
    }
  }
  console.log(`[cron] job=${job} hop=${hop} sent=${sent} complete`);
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
      const dueSendsOn = waSendsEnabled();
      for (; dueSendsOn; ) {
        const due = await getDueReminders(new Date().toISOString(), PAGE_SIZE);
        if (due.length === 0) break;
        await mapLimit(due, 20, async (r) => {
          if (!(await claimDueReminder(r.id))) return; // another run took it
          const phone = await getPhoneForUser(r.user_id);
          if (!phone) return;
          await sendTemplate(phone, 'lekhio_reminder', 'en_GB', [r.title]);
          sent++;
        });
        if (due.length < PAGE_SIZE) break; // final page
        if (Date.now() - started > SEND_BUDGET_MS) {
          if (hop + 1 > MAX_HOPS) {
            console.error(`[cron] job=due hop cap reached at hop=${hop}, stopping`);
            break;
          }
          console.log(`[cron] job=due hop=${hop} sent=${sent} continuing`);
          await triggerContinuation('due', null, hop + 1);
          return;
        }
      }
      console.log(`[cron] job=due hop=${hop} sent=${sent} complete`);
    } else if (job === 'nudge' || job === 'weekly') {
      await fanOut(job, afterId, hop);
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

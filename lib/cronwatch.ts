// The cron watchdog. Pure policy, no I/O, so the node test runner can load it directly.
//
// THE FAILURE THIS EXISTS TO CATCH. Our crons walk users in pages and hop to themselves
// with a cursor. If a hop dies, the walk does not slow down and it does not error. It STOPS,
// at whatever user id it had reached, and every user past that point gets nothing, forever,
// while the endpoint keeps answering 200 OK.
//
// That is not hypothetical. The daily digest shipped that way this morning: it returned
// `{more: true, next: "<id>"}` and absolutely nothing was reading it, so it reached the
// first two hundred users by id and no one else, and reported success every single day.
// Nothing was broken. Something simply never happened. Nothing alerts on that.
//
// So each job writes down when it last FINISHED A WHOLE WALK, and this decides when that
// silence has gone on too long.

export interface CronRun {
  job: string;
  last_started: string | null;
  last_finished: string | null;
  last_ok: boolean | null;
  last_error: string | null;
}

// How long a job may be quiet before it is a problem.
//
// Since 16 July these jobs are no longer six separate cron entries. Vercel HOBBY permits only two
// crons, and running six on it silently stopped half of them (this file's whole reason to exist).
// So vercel.json holds DISPATCHERS (app/api/cron/daily) that kick the real jobs, and the ceilings
// below are the windows those jobs still run within. A ceiling too tight cries wolf, and an alarm
// that cries wolf gets muted, and a muted alarm is worse than no alarm because it looks like cover.
//
// ⚠️ THERE ARE THREE DISPATCH SLOTS, NOT TWO, AND THIS PARAGRAPH SAID TWO UNTIL 10 AUGUST 2026.
// Push 27 added the hourly slot that morning and the prose was never carried across, so the file
// read "two DISPATCHERS" and "the two dispatch slots" directly above a list of three. The Hobby
// limit sentence above is kept because it is why the dispatcher shape exists at all, but it no
// longer constrains us: Vercel and Supabase both moved to Pro on 4 August, which is what made a
// third entry possible. A reader who takes the count from the prose rather than from vercel.json
// ends up asking whether Vercel really registered all three, which is a question this file should
// answer rather than raise.
//
// The three dispatch slots, and what each still triggers:
//
//   hourly 0 *  * * *   -> due
//   am     0 7  * * *   -> due, cleanup, bankfeed, agent, trial, and (Mon/Wed/Fri) nudge
//   pm     0 23 * * *   -> metrics, digest, and (Sunday) weekly
//
//   due     kicked hourly              -> 4h   (three missed runs; see below)
//   digest  kicked pm, daily            -> 26h
//   agent   kicked am, daily            -> 26h
//   nudge   kicked am, Mon/Wed/Fri      -> 80h  (the real gap is Fri to Mon, 72h)
//   weekly  kicked pm, Sunday           -> 180h (a week, 168h, plus room)
//   trial   kicked am, daily            -> 26h
//   metrics kicked pm, daily            -> 26h  (and it CANNOT be backfilled. See below.)
export const MAX_QUIET_HOURS: Record<string, number> = {
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 26h WAS RIGHT AND IT WAS ALSO WHY NOBODY SAW THE REAL FAULT. TIGHTENED 10 AUGUST 2026.
  //
  // `due` ran once a day in the am slot, so a 26 hour ceiling was correct AND it meant the engine
  // could stop for most of a day without a word. Worse, a job that only ever runs at 08:00 can
  // only ever deliver at 08:00: a reminder set for 3pm arrived the following morning, every time,
  // and the watchdog had nothing to say because the job was running exactly as scheduled.
  //
  // It is hourly now, so the ceiling has to mean something again.
  //
  // ⚠️ FOUR HOURS, NOT ONE, AND THAT NUMBER IS DELIBERATE. This file's own header says a ceiling
  // too tight cries wolf, and an alarm that cries wolf gets muted, and a muted alarm is worse than
  // no alarm because it looks like cover. On 9 August a too eager alarm put /api/health at 503 and
  // paged the founder on launch eve over a job that was perfectly healthy. Four hours tolerates
  // three consecutive missed dispatches, which is a real stoppage rather than scheduler drift, and
  // it still catches a dead reminder engine inside a morning instead of inside a day.
  due: 4,
  digest: 26,
  // The agent walk. It has no cron entry of its own: the am dispatcher kicks it. It was the one
  // walk with no watchdog at all, so it could die mid-chain and every user past the cursor would
  // silently stop getting signals while /api/health stayed green.
  //
  // ⚠️ IT USED TO BE KICKED BY `due`, WHICH IS EXACTLY WHY IT MOVED. When `due` went hourly, a kick
  // living inside it would have become twenty four agent walks a day. It is daily work and it is
  // now dispatched by the slot that is actually daily.
  agent: 26,
  nudge: 80,
  weekly: 180,
  // The daily metrics snapshot. THE HISTORY CANNOT BE BACKFILLED.
  //
  // Every other cron in this list can be re-run and catch up. This one cannot. If it stops for a
  // week, that week of the company's revenue history is gone FOREVER, because the subscriptions
  // table only holds the CURRENT status of each row. A hole in a revenue chart is not a gap, it is
  // a fabrication waiting to happen: somebody will draw a straight line across it.
  metrics: 26,

  // The trial ending nudge (docs/39, lib/trialnudge.ts).
  //
  // A CRON THAT IS NOT IN THIS MAP IS A CRON NOBODY IS WATCHING. If this one stops, every man on a
  // free trial reaches day fifteen, finds himself locked out of his own books with no warning, and
  // blames us. It is the most expensive silence available to us: it takes the customer at the exact
  // moment he had decided we were worth paying for. Registering it here is what makes /api/health
  // go red instead of staying green while nothing happens.
  trial: 26,

  // The voice note reaper (app/api/cron/voicereap). Kicked in BOTH daily slots, so 26 hours is
  // already generous: it should be seen twice a day.
  //
  // 🔴 THIS ONE'S SILENCE BREAKS A WRITTEN PROMISE, NOT JUST A FEATURE. Every other job in this map
  // fails by not DOING something. This one fails by LEAVING SOMETHING BEHIND: a stale voice_jobs row
  // keeps its audio_base64 for ever, while the privacy policy says "the audio is deleted the moment
  // it has been read" and the data inventory says it is "wiped as soon as it is transcribed". Both
  // sentences quietly stop being true, and the customer is still waiting on a note we told him we
  // were writing up.
  //
  // It shipped on 9 August wired into both slots and registered in neither this map nor the cron
  // runs table, which is precisely the hole the heading above warns about, left by the same hand
  // that wrote the warning. Found in a walkthrough audit that evening, not by anything going wrong.
  voicereap: 26,

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 WHAT IS DELIBERATELY NOT IN THIS MAP, SO THE NEXT READER CAN TELL A DECISION FROM A HOLE.
  //
  // "A cron that is not in this map is a cron nobody is watching" cuts both ways: an absence has to
  // be readable as a choice, or every audit re-litigates it and one of them eventually guesses wrong.
  //
  //   nurture  (app/api/cron/nurture) SHIPS DARK. It returns immediately unless NURTURE_ENABLED is
  //            'true', and it is not. An alarm on a job that is deliberately switched off is a red
  //            /api/health that means nothing, and a health check people learn to ignore is worse
  //            than no health check. ⚠️ IT WRITES cronStarted/cronFinished ANYWAY, so the run
  //            history is there the day it is switched on, and turning it on is then one line here.
  //            Whoever flips NURTURE_ENABLED adds `nurture: 26` in the same commit.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
};

export interface CronAlarm {
  job: string;
  reason: 'never_run' | 'never_finished' | 'stale' | 'failed' | 'overdue' | 'unreadable';
  hoursQuiet: number | null;
  detail: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 NOT EVERY ALARM IS AN OUTAGE, AND CONFLATING THE TWO PAGED THE FOUNDER ON LAUNCH EVE.
//
// never_run was added to cronAlarms at 21:00 on 9 August. /api/health answers 503 on any alarm and
// UptimeRobot watches it, so within two minutes the site was reporting itself DOWN, on the evening
// before launch, because a cron added ninety minutes earlier had not reached its first dispatch
// slot yet (pm is 23:00 UTC). Nothing was wrong. Nobody was affected. The pager went off anyway.
//
// That is exactly the crying wolf this file's own header calls worse than no alarm at all, and it
// was committed by the person who wrote that header, in the commit that quoted it.
//
// THE DISTINCTION THAT WAS MISSING. The severity is not the same and never was:
//
//   stale / failed / never_finished  Something that WAS working has stopped, or is finishing
//                                    badly. Users are being missed right now. That is an outage
//                                    and a 503 is correct.
//   never_run                        A job is registered and has not been seen yet. It may be
//                                    mis-wired, or it may simply be new. It is worth SEEING and it
//                                    is not worth waking somebody for, because nothing that was
//                                    working has stopped.
//
// Visibility and severity are different questions, and push 23 answered the first one correctly by
// getting the second one wrong. So the alarm still exists, still names the job, and is split out
// here so that a caller can surface it without calling the site down.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export function blockingAlarms(alarms: CronAlarm[]): CronAlarm[] {
  return alarms.filter((a) => a.reason !== 'never_run');
}

// 🔴 IS THE CRON SIDE SERVING? null IN, false OUT, ON PURPOSE. listCronRuns() returns null on any
// failed read, and /api/health used to answer that with an empty alarm list, so a history it could
// NOT READ scored as healthy: the house disease, a signal that cannot tell "no" from "nothing".
// This is the one place that decides it, so a null read is a false here and the route cannot get it
// wrong again. A never_run job is a question, not an outage, so it does not block the public view.
export function cronsServing(runs: CronRun[] | null, now: Date = new Date()): boolean {
  return runs !== null && blockingAlarms(cronAlarms(runs, now)).length === 0;
}

export function unseenAlarms(alarms: CronAlarm[]): CronAlarm[] {
  return alarms.filter((a) => a.reason === 'never_run');
}

// Which jobs should be shouting? Empty array means all is well.
export function cronAlarms(runs: CronRun[], now: Date = new Date()): CronAlarm[] {
  const out: CronAlarm[] = [];
  const byJob = new Map(runs.map((r) => [r.job, r]));

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 IS THE SCHEDULER DEMONSTRABLY ALIVE? Everything below about never-run jobs turns on this.
  //
  // If NOTHING in this map has ever finished, this is a fresh environment rather than a broken
  // one, and firing an alarm for every job in the list helps nobody and teaches whoever sees it
  // that the alarms are noise. If something HAS finished, the dispatcher demonstrably works, and
  // a job in this map with no history at all is a wiring fault rather than a waiting one.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const schedulerAlive = runs.some((r) => r.last_finished);

  for (const [job, maxHours] of Object.entries(MAX_QUIET_HOURS)) {
    const run = byJob.get(job);

    // ═══════════════════════════════════════════════════════════════════════════════════════
    // 🔴 A JOB THAT HAS NEVER RUN WAS SKIPPED FOR EVER, AND THE SKIP WAS THE WHOLE HOLE.
    // Closed 9 August 2026, the same evening a job walked straight into it.
    //
    // The line here read `if (!run || (!run.last_finished && !run.last_started)) continue;` and
    // its comment said, in as many words: "a job that has never even started has never been
    // scheduled, and that is a different problem with a different fix." That fix was never
    // written. So the state this file exists to catch, A CRON THAT DOES NOTHING, was the one
    // state it structurally could not report, and /api/health stayed green through it.
    //
    // ⚠️ IT WAS NOT HYPOTHETICAL FOR LONG. voicereap was added to this map earlier the same
    // evening, with a note saying its failure mode is a customer's audio never being wiped and a
    // written privacy promise quietly going untrue. Registering it bought exactly nothing while
    // this line stood: if the wiring were wrong, it would never write a row, never be seen here,
    // and never be mentioned by anything. The registration LOOKED like coverage, which is worse
    // than no registration, because somebody had then ticked it off.
    //
    // ⚠️ THE FALSE ALARM IS BOUNDED AND THE MISS IS NOT, and that asymmetry decides it. Adding a
    // cron can now show one alarm until the next dispatch, at most half a day, and it clears
    // itself. The other way round, a cron that never runs is never mentioned by anything, for
    // ever. So this alarms, and the sentence says the benign case out loud so that whoever reads
    // it at two in the morning is not hunting a bug that is about to fix itself.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    if (!run || (!run.last_finished && !run.last_started)) {
      if (!schedulerAlive) continue;
      out.push({
        job,
        reason: 'never_run',
        hoursQuiet: null,
        detail: 'in the watch list and has never run once, while other jobs are running normally. '
          + 'If it was added within the last day this clears itself on the next dispatch. If it '
          + 'does not, it is not wired into app/api/cron/daily.',
      });
      continue;
    }

    if (!run.last_finished) {
      out.push({
        job,
        reason: 'never_finished',
        hoursQuiet: null,
        detail: 'started but has never reported finishing a full walk',
      });
      continue;
    }

    const quietMs = now.getTime() - new Date(run.last_finished).getTime();
    const quietHours = quietMs / 3_600_000;

    if (quietHours > maxHours) {
      out.push({
        job,
        reason: 'stale',
        hoursQuiet: Math.round(quietHours * 10) / 10,
        detail: `last finished ${Math.round(quietHours)}h ago, ceiling is ${maxHours}h`,
      });
      continue;
    }

    // It finished, and it finished recently, and it finished BADLY. A hop cap means users
    // past the cursor were never reached, which is exactly the silent gap we are hunting.
    if (run.last_ok === false) {
      out.push({
        job,
        reason: 'failed',
        hoursQuiet: Math.round(quietHours * 10) / 10,
        detail: run.last_error,
      });
    }
  }

  return out;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE JOB CAN BE PERFECTLY HEALTHY WHILE THE PROMISE IS BROKEN. 11 AUGUST 2026.
//
// Everything above this line watches the JOB: did it run, did it finish, did it finish badly. On
// 10 August the `due` job ran on time, finished, reported ok, and delivered nothing, because the
// WhatsApp template gate was shut. A man who asked at 13:23 on Sunday for a reminder at 08:00 on
// Monday got it at 12:43, four hours and forty three minutes after the sentence we sent him. The
// engine was green the whole time. Nothing in this file could have said otherwise, because nothing
// in this file was watching the thing he was promised.
//
// The gate was a launch day one off and it is shut no longer. What was NOT a one off is that it
// could happen again with nobody the wiser, which is the house disease wearing a different coat:
// a signal that cannot tell "nothing was due" from "everything was due and none of it went".
//
// So this watches the PROMISE. Is there a reminder that fell due, is still unsent, and has been
// waiting longer than the dispatch can honestly explain. That question has one right answer and it
// does not care why: a shut gate, a dead hop, a missing template, a scheduler that stopped. All of
// them look identical to the man waiting for his text, so all of them look identical here.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// How often the reminder engine is dispatched. vercel.json runs the hourly slot at `0 * * * *` and
// app/api/cron/daily sends that slot to /api/cron/reminders?job=due.
//
// ⚠️ test/reminderclock.test.mjs READS vercel.json AND HOLDS THIS NUMBER TO IT. Slow the dispatch
// down and the ceiling below has to move in the same commit, or the alarm starts crying wolf on a
// schedule somebody else chose. That is exactly how `due: 26` came to be correct and useless.
export const REMINDER_DISPATCH_INTERVAL_HOURS = 1;

// How late a reminder may be before it is a fault rather than a wait.
//
// THE ARITHMETIC, BECAUSE A CEILING NOBODY CAN DERIVE IS A CEILING SOMEBODY WILL LOOSEN.
//
//   A reminder due at 08:01 is not late at 08:30. The next pass is at 09:00 and it will go then.
//   The longest HONEST wait is therefore one whole dispatch interval, one hour, plus whatever
//   drift the scheduler adds.
//   A reminder still sitting there after TWO intervals has watched a pass come and go without
//   being sent. That is a missed pass, and a missed pass is a fault.
//
// Two hours, not one. One hour would fire on ordinary drift, and this file's own header says a
// ceiling too tight cries wolf, and an alarm that cries wolf gets muted, and a muted alarm is
// worse than no alarm because it looks like cover. On 9 August a too eager alarm put /api/health
// at 503 and paged the founder on launch eve over a job that was perfectly healthy.
export const REMINDER_MAX_LATE_HOURS = REMINDER_DISPATCH_INTERVAL_HOURS * 2;

export interface ReminderBacklog {
  /** How many reminders have fallen due and are still unsent. */
  overdue: number;
  /** The oldest of them, ISO. null when there are none. */
  oldestDue: string | null;
}

// 🔴 null IN, ALARM OUT, THE SAME RULE cronsServing() SETS FOUR LINES ABOVE. getReminderBacklog()
// returns null on any failed read, and "I could not look" is not "there is nothing there". A
// backlog we cannot see is the one state most likely to be hiding something, so it is the one
// state that must never score as healthy.
export function reminderAlarm(backlog: ReminderBacklog | null, now: Date = new Date()): CronAlarm | null {
  if (backlog === null) {
    return {
      job: 'due',
      reason: 'unreadable',
      hoursQuiet: null,
      detail: 'the reminder backlog could not be read, so nothing here can say whether reminders are going out',
    };
  }

  if (backlog.overdue === 0 || !backlog.oldestDue) return null;

  const lateMs = now.getTime() - new Date(backlog.oldestDue).getTime();
  if (!Number.isFinite(lateMs)) {
    return {
      job: 'due',
      reason: 'unreadable',
      hoursQuiet: null,
      detail: 'the oldest overdue reminder has an unreadable due time',
    };
  }

  const lateHours = lateMs / 3_600_000;
  if (lateHours <= REMINDER_MAX_LATE_HOURS) return null;

  return {
    job: 'due',
    reason: 'overdue',
    hoursQuiet: Math.round(lateHours * 10) / 10,
    detail: `${backlog.overdue} reminder${backlog.overdue === 1 ? '' : 's'} due and unsent, the oldest by `
      + `${Math.round(lateHours * 10) / 10}h. The dispatch runs every ${REMINDER_DISPATCH_INTERVAL_HOURS}h, `
      + `so a pass has come and gone without sending it.`,
  };
}

// Is the promise being kept? Empty backlog, or a backlog young enough that the next pass will
// clear it, is a yes. Anything else, including a backlog we cannot read, is a no.
export function remindersServing(backlog: ReminderBacklog | null, now: Date = new Date()): boolean {
  return reminderAlarm(backlog, now) === null;
}

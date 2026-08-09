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
// Since 16 July these jobs are no longer six separate cron entries. Vercel Hobby permits only TWO
// crons, and running six on it silently stopped half of them (this file's whole reason to exist).
// So vercel.json now holds two DISPATCHERS (app/api/cron/daily) that kick the real jobs, and the
// ceilings below are the windows those jobs still run within. A ceiling too tight cries wolf, and an
// alarm that cries wolf gets muted, and a muted alarm is worse than no alarm because it looks like
// cover. The two dispatch slots, and what each still triggers:
//
//   am   0 7  * * *   -> due, trial, and (Mon/Wed/Fri) nudge
//   pm   0 23 * * *   -> metrics, digest, and (Sunday) weekly
//
//   due     kicked am, daily            -> 26h  (a day, plus room for a late run)
//   digest  kicked pm, daily            -> 26h
//   agent   kicked by `due`, daily      -> 26h
//   nudge   kicked am, Mon/Wed/Fri      -> 80h  (the real gap is Fri to Mon, 72h)
//   weekly  kicked pm, Sunday           -> 180h (a week, 168h, plus room)
//   trial   kicked am, daily            -> 26h
//   metrics kicked pm, daily            -> 26h  (and it CANNOT be backfilled. See below.)
export const MAX_QUIET_HOURS: Record<string, number> = {
  due: 26,
  digest: 26,
  // The agent walk. It has no cron entry of its own: the daily `due` job kicks it. It was the one
  // walk with no watchdog at all, so it could die mid-chain and every user past the cursor would
  // silently stop getting signals while /api/health stayed green.
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
  reason: 'never_run' | 'never_finished' | 'stale' | 'failed';
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

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
// These are derived from vercel.json and they MUST stay in step with it. A ceiling that is
// too tight cries wolf, and an alarm that cries wolf gets muted, and a muted alarm is worse
// than no alarm because it looks like cover.
//
//   due     0 7 * * *        daily            -> 26h  (a day, plus room for a late run)
//   digest  0 18 * * *       daily            -> 26h
//   agent   (kicked by `due`) daily           -> 26h
//   nudge   0 8 * * 1,3,5    Mon, Wed, Fri    -> 80h  (the real gap is Fri to Mon, 72h)
//   weekly  0 17 * * 0       Sunday           -> 180h (a week, 168h, plus room)
export const MAX_QUIET_HOURS: Record<string, number> = {
  due: 26,
  digest: 26,
  // The agent walk. It has no cron entry of its own: the daily `due` job kicks it. It was the one
  // walk with no watchdog at all, so it could die mid-chain and every user past the cursor would
  // silently stop getting signals while /api/health stayed green.
  agent: 26,
  nudge: 80,
  weekly: 180,
};

export interface CronAlarm {
  job: string;
  reason: 'never_finished' | 'stale' | 'failed';
  hoursQuiet: number | null;
  detail: string | null;
}

// Which jobs should be shouting? Empty array means all is well.
export function cronAlarms(runs: CronRun[], now: Date = new Date()): CronAlarm[] {
  const out: CronAlarm[] = [];
  const byJob = new Map(runs.map((r) => [r.job, r]));

  for (const [job, maxHours] of Object.entries(MAX_QUIET_HOURS)) {
    const run = byJob.get(job);

    // A job we have NEVER seen finish. On a fresh deploy this is simply true and it is not
    // an emergency, so it is only an alarm once the job has actually started at some point
    // and never come back. A job that has never even started has never been scheduled, and
    // that is a different problem with a different fix.
    if (!run || (!run.last_finished && !run.last_started)) continue;

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

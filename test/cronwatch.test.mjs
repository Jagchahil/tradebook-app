// The cron watchdog. See lib/cronwatch.ts.
//
// What these tests protect: THE SILENCE. Every other alarm in the product fires when
// something goes wrong. This one has to fire when nothing happens at all, which is the
// harder problem, because nothing looks exactly like everything being fine.
//
// The two ways to get this wrong, and they are not symmetrical:
//
//   TOO LOOSE  a stopped cron goes unnoticed, and users quietly stop being served.
//   TOO TIGHT  it cries wolf, the alert gets muted, and then it is worse than nothing,
//              because now there IS an alarm and it means nothing.
//
// The weekly job finishes ONCE A WEEK. A naive "quiet for more than a day" check would
// scream about it every Tuesday until somebody turned it off. That test is below.

import { cronAlarms, MAX_QUIET_HOURS } from '../lib/cronwatch.ts';

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}`);
  }
}

const NOW = new Date('2026-07-12T12:00:00Z');
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3600_000).toISOString();

const run = (job, finishedHoursAgo, ok_ = true, error = null) => ({
  job,
  last_started: hoursAgo(finishedHoursAgo + 1),
  last_finished: finishedHoursAgo === null ? null : hoursAgo(finishedHoursAgo),
  last_ok: ok_,
  last_error: error,
});

console.log('\nThe cron watchdog\n');

// --- everything is fine -----------------------------------------------------------
const healthy = [run('due', 5), run('digest', 2), run('nudge', 20), run('weekly', 40)];
ok('all four ran recently: silence, which is the point', cronAlarms(healthy, NOW).length === 0);

// --- THE FALSE ALARM TEST. This is the one that matters most. ----------------------
//
// The weekly brief goes out on Sundays. On a Friday it has legitimately not finished for
// four and a half days. If that is an alarm, the alarm is useless.
const friday = [run('due', 5), run('digest', 2), run('nudge', 50), run('weekly', 110)];
ok('the WEEKLY job, quiet for 110h on a Friday, is NOT an alarm', cronAlarms(friday, NOW).length === 0);
ok('the NUDGE job, quiet 50h over a weekend, is NOT an alarm',
  cronAlarms([run('nudge', 50)], NOW).length === 0);
ok('nudge Friday to Monday is 72h and still fine', cronAlarms([run('nudge', 76)], NOW).length === 0);

// --- the real thing: a job that has stopped ---------------------------------------
const stopped = cronAlarms([run('digest', 30)], NOW);
ok('the DAILY digest, quiet for 30h, IS an alarm', stopped.length === 1);
ok('and it names the job', stopped[0].job === 'digest');
ok('and says it is stale', stopped[0].reason === 'stale');
ok('and says how long', stopped[0].hoursQuiet === 30);

ok('the daily due job, quiet 30h, is an alarm', cronAlarms([run('due', 30)], NOW)[0].reason === 'stale');
ok('the weekly job, quiet for NINE DAYS, is finally an alarm',
  cronAlarms([run('weekly', 220)], NOW)[0].reason === 'stale');

// A day and an hour is fine. Cron runs are not to the second and a late run is not a fault.
ok('25h quiet on a daily job is still fine (a late run is not a fault)',
  cronAlarms([run('digest', 25)], NOW).length === 0);
ok('27h quiet on a daily job is not', cronAlarms([run('digest', 27)], NOW).length === 1);

// --- finished, recently, and BADLY ------------------------------------------------
//
// The hop cap. The walk stopped before the end, so somebody past the cursor got nothing.
// It "finished" ten minutes ago, so no staleness check will ever catch it. This is the
// exact shape of the digest bug: a job that reports success while quietly serving nobody.
const capped = cronAlarms([run('digest', 1, false, 'hop cap reached at hop 20')], NOW);
ok('a job that finished RECENTLY but BADLY is still an alarm', capped.length === 1);
ok('and the reason is failure, not staleness', capped[0].reason === 'failed');
ok('and it carries the error through', capped[0].detail === 'hop cap reached at hop 20');

// --- started but never finished ---------------------------------------------------
const neverDone = cronAlarms(
  [{ job: 'digest', last_started: hoursAgo(3), last_finished: null, last_ok: null, last_error: null }],
  NOW,
);
ok('started three hours ago and never came back: alarm', neverDone.length === 1);
ok('and it says so plainly', neverDone[0].reason === 'never_finished');

// --- a fresh deploy must not scream ------------------------------------------------
//
// On day one nothing has run yet. That is not an outage, it is a Tuesday. A watchdog that
// is red out of the box teaches you to ignore it before it has ever told you anything true.
ok('no rows at all (fresh deploy): NOT an alarm', cronAlarms([], NOW).length === 0);
ok('a job absent from the table is not an alarm',
  cronAlarms([run('digest', 1)], NOW).length === 0);

// --- the ceilings match vercel.json ------------------------------------------------
ok('due is daily', MAX_QUIET_HOURS.due === 26);
// The agent walk is kicked by the daily `due` job. It was the ONLY cron with no watchdog: it
// could die mid-chain and every user past the cursor silently stopped getting signals, while the
// endpoint kept answering 200 and the dashboard stayed green.
ok('the AGENT walk is watched too', MAX_QUIET_HOURS.agent === 26);
ok('an agent that has gone quiet for 30h is an alarm',
  cronAlarms([run('agent', 30)], NOW)[0].reason === 'stale');
ok('and an agent that hit its hop cap is an alarm even though it just "finished"',
  cronAlarms([run('agent', 1, false, 'hop cap reached at hop 100')], NOW)[0].reason === 'failed');
ok('digest is daily', MAX_QUIET_HOURS.digest === 26);
ok('nudge clears the 72h Friday-to-Monday gap', MAX_QUIET_HOURS.nudge > 72);
ok('weekly clears the 168h week', MAX_QUIET_HOURS.weekly > 168);

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

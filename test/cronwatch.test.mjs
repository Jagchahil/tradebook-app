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

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { cronAlarms, blockingAlarms, unseenAlarms, MAX_QUIET_HOURS } from '../lib/cronwatch.ts';

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

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 EVERY CASE BELOW MODELS THE WHOLE TABLE, NOT ONE ROW OF IT. Added 9 August 2026.
//
// These cases used to call cronAlarms([run('nudge', 50)]) and assert silence. What each MEANS is
// "the nudge staleness rule is right". What the argument SAYS is something else: cron_runs holds a
// row for every job that has ever run, so a list of one is a table asserting that seven other jobs
// have never run in their lives, and cronAlarms now reports exactly that, correctly.
//
// So only() keeps each case focused on its one job while handing the function a table a real
// database could actually produce.
//
// ⚠️ IT READS MAX_QUIET_HOURS RATHER THAN LISTING THE JOBS BY HAND. A hand written list here goes
// stale the first time somebody adds a cron, and the failure then looks like the new cron being
// broken rather than the fixture being old.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const only = (...rows) => {
  const named = new Set(rows.map((r) => r.job));
  return [...rows, ...Object.keys(MAX_QUIET_HOURS).filter((j) => !named.has(j)).map((j) => run(j, 1))];
};

console.log('\nThe cron watchdog\n');

// --- everything is fine -----------------------------------------------------------
const healthy = only(run('due', 1), run('digest', 2), run('nudge', 20), run('weekly', 40));
ok('all four ran recently: silence, which is the point', cronAlarms(healthy, NOW).length === 0);

// --- THE FALSE ALARM TEST. This is the one that matters most. ----------------------
//
// The weekly brief goes out on Sundays. On a Friday it has legitimately not finished for
// four and a half days. If that is an alarm, the alarm is useless.
const friday = only(run('due', 1), run('digest', 2), run('nudge', 50), run('weekly', 110));
ok('the WEEKLY job, quiet for 110h on a Friday, is NOT an alarm', cronAlarms(friday, NOW).length === 0);
ok('the NUDGE job, quiet 50h over a weekend, is NOT an alarm',
  cronAlarms(only(run('nudge', 50)), NOW).length === 0);
ok('nudge Friday to Monday is 72h and still fine', cronAlarms(only(run('nudge', 76)), NOW).length === 0);

// --- the real thing: a job that has stopped ---------------------------------------
const stopped = cronAlarms(only(run('digest', 30)), NOW);
ok('the DAILY digest, quiet for 30h, IS an alarm', stopped.length === 1);
ok('and it names the job', stopped[0].job === 'digest');
ok('and says it is stale', stopped[0].reason === 'stale');
ok('and says how long', stopped[0].hoursQuiet === 30);

ok('the daily due job, quiet 30h, is an alarm', cronAlarms(only(run('due', 30)), NOW)[0].reason === 'stale');
ok('the weekly job, quiet for NINE DAYS, is finally an alarm',
  cronAlarms(only(run('weekly', 220)), NOW)[0].reason === 'stale');

// A day and an hour is fine. Cron runs are not to the second and a late run is not a fault.
ok('25h quiet on a daily job is still fine (a late run is not a fault)',
  cronAlarms(only(run('digest', 25)), NOW).length === 0);
ok('27h quiet on a daily job is not', cronAlarms(only(run('digest', 27)), NOW).length === 1);

// --- finished, recently, and BADLY ------------------------------------------------
//
// The hop cap. The walk stopped before the end, so somebody past the cursor got nothing.
// It "finished" ten minutes ago, so no staleness check will ever catch it. This is the
// exact shape of the digest bug: a job that reports success while quietly serving nobody.
const capped = cronAlarms(only(run('digest', 1, false, 'hop cap reached at hop 20')), NOW);
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
// ⚠️ THE BARE [] IS THE POINT HERE, not an oversight: only() would fill the table in and this
// case is precisely about the table being empty.
ok('no rows at all (fresh deploy): NOT an alarm', cronAlarms([], NOW).length === 0);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 A JOB THAT HAS NEVER RUN, WHILE THE OTHERS ARE RUNNING. Rewritten 9 August 2026.
//
// This pair used to read "a job absent from the table is not an alarm" and asserted silence. That
// was the hole, stated as a promise and pinned by a test, which is how it survived: lib/cronwatch's
// own comment called it "a different problem with a different fix" and the fix was never written.
//
// So the state this whole file exists to catch, A CRON THAT DOES NOTHING AT ALL, was the one state
// it could not report. voicereap was added to the watch map on 9 August and walked straight into
// it: registered, watched by nothing, and /api/health green throughout. A registration that looks
// like coverage is worse than none, because somebody has ticked it off.
//
// The two arms are not symmetrical and both matter:
//   nothing has ever finished  -> fresh environment. Silence. Six alarms on a new deploy is noise.
//   others are finishing fine  -> the dispatcher works, so this one is MIS-WIRED. Alarm.
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  // Everything healthy except voicereap, which has no row at all.
  const missing = only().filter((r) => r.job !== 'voicereap');
  const alarms = cronAlarms(missing, NOW);
  ok('🔴 A JOB THAT HAS NEVER RUN IS AN ALARM WHEN THE OTHERS ARE RUNNING', alarms.length === 1);
  ok('and it names the job that is missing, not one that is fine', alarms[0].job === 'voicereap');
  ok('and it says never_run, which is a different fault from stale', alarms[0].reason === 'never_run');
  ok('and the sentence tells whoever reads it at 2am what the benign case looks like',
    /clears itself on the next dispatch/.test(alarms[0].detail ?? ''));
  ok('🔴 AND IT SAYS WHERE TO LOOK IF IT DOES NOT CLEAR',
    /cron\/daily/.test(alarms[0].detail ?? ''));

  // ⚠️ THE OTHER ARM. Nothing has ever finished, so this is a fresh environment and not a broken
  // one. Without this gate a new deploy shows one alarm per registered job, which is exactly the
  // crying wolf this file's own header says is worse than no alarm at all.
  const nothingEver = Object.keys(MAX_QUIET_HOURS).map((j) => ({
    job: j, last_started: null, last_finished: null, last_ok: null, last_error: null,
  }));
  ok('🔴 BUT A WHOLE TABLE THAT HAS NEVER RUN IS A FRESH DEPLOY, AND STAYS SILENT',
    cronAlarms(nothingEver, NOW).length === 0);
}

// --- the ceilings match vercel.json ------------------------------------------------
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 `due` IS HOURLY SINCE 10 AUGUST 2026, AND THE CEILING HAD TO FOLLOW IT.
//
// It ran once a day, in the am slot, so a 26h ceiling was CORRECT and the engine could still only
// ever deliver at about 08:00. A reminder set for 3pm arrived the next morning, every time, and
// the watchdog had nothing to say because the job was running exactly as scheduled. A ceiling that
// matches a schedule nobody questioned will happily watch a broken feature for ever.
//
// Four hours, not one: three consecutive missed dispatches is a real stoppage, scheduler drift is
// not, and this file's header is emphatic that a ceiling too tight cries wolf. A too eager alarm
// paged Jag on launch eve over a perfectly healthy job.
// ═══════════════════════════════════════════════════════════════════════════════════════════
ok('🔴 due IS HOURLY, NOT DAILY', MAX_QUIET_HOURS.due === 4);
ok('🔴 AND A REMINDER ENGINE QUIET FOR 5 HOURS IS NOW AN ALARM, which 26h would have called fine',
  cronAlarms(only(run('due', 5)), NOW).some((a) => a.job === 'due' && a.reason === 'stale'));
ok('but an hour of quiet is not, so a single missed tick does not cry wolf',
  cronAlarms(only(run('due', 1)), NOW).length === 0);
ok('and three missed dispatches are tolerated, which is the drift allowance',
  cronAlarms(only(run('due', 3)), NOW).length === 0);
// The agent walk is kicked by the daily `due` job. It was the ONLY cron with no watchdog: it
// could die mid-chain and every user past the cursor silently stopped getting signals, while the
// endpoint kept answering 200 and the dashboard stayed green.
ok('the AGENT walk is watched too', MAX_QUIET_HOURS.agent === 26);
ok('an agent that has gone quiet for 30h is an alarm',
  cronAlarms(only(run('agent', 30)), NOW)[0].reason === 'stale');
ok('and an agent that hit its hop cap is an alarm even though it just "finished"',
  cronAlarms(only(run('agent', 1, false, 'hop cap reached at hop 100')), NOW)[0].reason === 'failed');
ok('digest is daily', MAX_QUIET_HOURS.digest === 26);
ok('nudge clears the 72h Friday-to-Monday gap', MAX_QUIET_HOURS.nudge > 72);
ok('weekly clears the 168h week', MAX_QUIET_HOURS.weekly > 168);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 AN ALARM IS NOT AUTOMATICALLY AN OUTAGE, AND GETTING THAT WRONG PAGED THE FOUNDER.
//
// never_run shipped at 21:00 on 9 August. /api/health answers 503 on any alarm and UptimeRobot
// polls it, so the site reported itself DOWN two minutes later, on launch eve, because a cron
// added ninety minutes earlier had not reached its first dispatch slot (pm is 23:00 UTC). Nothing
// was wrong. Nobody was affected. The pager went off anyway, which is the precise crying wolf this
// file's header calls worse than no alarm, committed by the hand that wrote the header.
//
// Visibility and severity are DIFFERENT QUESTIONS. The alarm was right; the 503 was not.
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\nAn alarm worth seeing is not always an alarm worth waking somebody for.\n');
{
  const missing = only().filter((r) => r.job !== 'voicereap');
  const a = cronAlarms(missing, NOW);
  ok('the never-run job is still reported, because it is still worth seeing', a.length === 1);
  ok('🔴 BUT IT DOES NOT BLOCK, so /api/health does not answer 503 for it',
    blockingAlarms(a).length === 0);
  ok('🔴 AND IT IS STILL RETRIEVABLE BY NAME, or splitting it out would just be hiding it',
    unseenAlarms(a).length === 1 && unseenAlarms(a)[0].job === 'voicereap');

  // ⚠️ THE REAL OUTAGE MUST STILL TAKE THE SITE DOWN. That is the half this split could break, and
  // breaking it would be far worse than the false page it exists to stop.
  const stopped = cronAlarms(only(run('digest', 30)), NOW);
  ok('🔴 A STALE CRON STILL BLOCKS, which is the whole reason this endpoint answers 503',
    blockingAlarms(stopped).length === 1 && blockingAlarms(stopped)[0].reason === 'stale');
  const bad = cronAlarms(only(run('digest', 1, false, 'hop cap reached')), NOW);
  ok('and so does one that finished badly', blockingAlarms(bad).length === 1);
  const never = cronAlarms(
    [{ job: 'digest', last_started: hoursAgo(3), last_finished: null, last_ok: null, last_error: null }],
    NOW,
  );
  ok('and so does one that started and never came back', blockingAlarms(never).length === 1);
  ok('the two splits are exhaustive: nothing falls between them',
    blockingAlarms(stopped).length + unseenAlarms(stopped).length === stopped.length);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 AND THE ONE CALLER THAT DECIDES 503 ACTUALLY USES THE SPLIT.
//
// Everything above proves the LIBRARY tells an outage from an unseen job. None of it proves the
// endpoint listens: /api/health could go on calling `alarms.length === 0` and every assertion in
// this file would stay green while the site kept reporting itself down. That was caught by
// deliberately reverting the route and watching this suite pass, which is the whole argument for
// revert-proving a guard rather than trusting it.
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const health = readFileSync(path.join(repo, 'app/api/health/route.ts'), 'utf8');
  ok('the health route imports the split rather than re-deciding severity itself',
    /import \{[^}]*blockingAlarms[^}]*\} from '\.\.\/\.\.\/\.\.\/lib\/cronwatch'/.test(health));
  ok('🔴 THE PUBLIC 503 IS DECIDED ON BLOCKING ALARMS ONLY, never on the raw list',
    /const cronsOk = blocking\.length === 0;/.test(health)
    && !/const cronsOk = alarms\.length === 0;/.test(health));
  ok('🔴 AND THE UNSEEN COUNT IS STILL SURFACED, or splitting it out is just hiding it',
    /cronsUnseen/.test(health));
  ok('the count is public and the names are not, the same rule staleness already follows',
    /cronsUnseen: unseen\.length/.test(health) && !/cronsUnseen: unseen\b(?!\.)/.test(health));
  ok('and the operator view behind the bearer still names them',
    /unseen: unseenAlarms\(alarms\)/.test(health));
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

// The brain's watchdog. See lib/knowledgewatch.ts and docs/105.
//
// What these tests protect: the difference between BEING RIGHT and NOT KNOWING.
//
// Khoji sat dead for five days in July 2026 and launchd reported success every morning, because
// a job that does nothing exits 0. In the same week the daily digest reached 200 users and
// returned 200 OK, and a tested llms.txt was built and never served. The house failure mode is
// not a crash. It is a green light with nothing behind it.
//
// So the load-bearing test in this file is not "does it spot a drift". It is:
//
//   A BROKEN EXTRACTOR MUST NEVER READ AS HEALTHY.
//
// If the differ cannot find the mileage rate on the page, the honest answer is "we do not know
// whether our engine is right", and that is an alarm. A watchdog that treats "no answer" as "no
// problem" is the bug it was built to catch, wearing the uniform of the fix.

import { knowledgeAlarms, knowledgeStatus, MAX_QUIET_HOURS_CAPTURE, MAX_QUIET_DAYS_REVIEW } from '../lib/knowledgewatch.ts';

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

const NOW = new Date('2026-07-12T21:00:00Z');
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const daysAgo = (d) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

const healthy = {
  newestItemAt: hoursAgo(2),
  newestReviewedAt: daysAgo(1),
  openDrift: [],
  openBlind: [],
};

// --- the happy path has to be genuinely quiet, or nobody trusts the loud one ---

ok('a brain that is learning, reviewed, and agreeing with GOV.UK raises NOTHING',
  knowledgeAlarms(healthy, NOW).length === 0);
ok('...and reports ok', knowledgeStatus(knowledgeAlarms(healthy, NOW)) === 'ok');

// --- 1. WE ARE WRONG. The whole reason the thing exists. ---

const drifted = { ...healthy, openDrift: [{ fact: 'mileageCarFirst10k', ours: 0.45, theirs: 0.55 }] };
ok('THE MILEAGE BUG: a constant that disagrees with GOV.UK is an alarm',
  knowledgeAlarms(drifted, NOW).some((a) => a.reason === 'engine_drift'));
ok('...and it names the fact, our number, and theirs, so it can be acted on without a search',
  /mileageCarFirst10k.*GOV\.UK says 0\.55.*our engine says 0\.45/.test(
    knowledgeAlarms(drifted, NOW).find((a) => a.reason === 'engine_drift').detail));
ok('...and drift outranks everything else in the one-word status',
  knowledgeStatus(knowledgeAlarms({ ...drifted, newestItemAt: hoursAgo(200) }, NOW)) === 'drift');

// --- 2. WE CANNOT TELL. The one a lesser watchdog gets wrong. ---

const blind = { ...healthy, openBlind: [{ fact: 'vatRegistrationThreshold' }] };
ok('SILENCE IS NOT SAFETY: a figure we could not read off the page is an ALARM, not a pass',
  knowledgeAlarms(blind, NOW).some((a) => a.reason === 'cannot_check'));
ok('...and it says so in plain words, not "no issues found"',
  /do not know if we are right/.test(knowledgeAlarms(blind, NOW)[0].detail));
ok('...and a blind brain never reports ok',
  knowledgeStatus(knowledgeAlarms(blind, NOW)) === 'blind');

// --- 3. IT HAS STOPPED. What actually happened, for five days, unnoticed. ---

ok('a watcher that has written nothing for 3 days is an alarm',
  knowledgeAlarms({ ...healthy, newestItemAt: hoursAgo(72) }, NOW).some((a) => a.reason === 'not_learning'));
ok('a watcher that ran this morning is not',
  !knowledgeAlarms({ ...healthy, newestItemAt: hoursAgo(20) }, NOW).some((a) => a.reason === 'not_learning'));
ok('the ceiling clears a single missed day, so one late run does not cry wolf',
  MAX_QUIET_HOURS_CAPTURE > 24);
ok('an empty table means it has NEVER run, and that is its own alarm',
  knowledgeAlarms({ ...healthy, newestItemAt: null }, NOW).some((a) => a.reason === 'never_run'));

// --- 4. THE QUEUE HAS STALLED. Collecting is not learning. ---

ok('nothing approved for a month means nothing new has reached Rakha: alarm',
  knowledgeAlarms({ ...healthy, newestReviewedAt: daysAgo(30) }, NOW).some((a) => a.reason === 'nothing_reviewed'));
ok('a fortnight is the ceiling, and a week inside it is fine',
  !knowledgeAlarms({ ...healthy, newestReviewedAt: daysAgo(7) }, NOW).some((a) => a.reason === 'nothing_reviewed')
  && MAX_QUIET_DAYS_REVIEW === 14);

// --- the combination that actually happened on 8 July ---
//
// The watcher had stopped AND our mileage constant was wrong AND every safeguard read green,
// because the only thing anyone was measuring was whether a model felt confident.
ok('the real 8 July state raises BOTH the drift and the stoppage, not one of them',
  knowledgeAlarms(
    { newestItemAt: hoursAgo(96), newestReviewedAt: daysAgo(4),
      openDrift: [{ fact: 'mileageCarFirst10k', ours: 0.45, theirs: 0.55 }], openBlind: [] },
    NOW,
  ).length === 2);

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

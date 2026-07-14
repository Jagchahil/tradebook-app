// KHOJI, SHAPED FOR A HUMAN. See lib/brain.ts.
//
// THE LOAD-BEARING TEST IN THIS FILE IS NOT "does it draw the brain".
//
// It is: A DEAD BRAIN MUST NEVER RENDER AS A HEALTHY ONE.
//
// The differ writes an incident row only when something is WRONG. So a differ that has died and a
// differ that ran perfectly produce the same thing: an empty incident table. For six days in July
// this system could not tell those two states apart, and it reported the second one.
//
// Every assertion below that looks paranoid is there because the alternative is a green light on a
// screen, above a tax engine nobody has checked, in front of a man who is about to sign his return.

import { vitals, coverage, knowledge, growth, STALE_HOURS } from '../lib/brain.ts';

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

console.log('\nbrain: what it checked, what it never checked, and what it has learned');

const NOW = new Date('2026-07-14T22:00:00Z');
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const daysAgo = (d) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

const goodRun = {
  ran_at: hoursAgo(5), tax_year: '2026/27',
  published: 61, checked: 42, agreed: 42, drifted: 0, blind: 0,
  unwatched: ['wdaMainRate', 'vatStandardRate'], ok: true,
};

// ---------------------------------------------------------------------------------------------
// 🔴 THE ONE THAT MATTERS: NO RUNS IS NOT GOOD NEWS.
// ---------------------------------------------------------------------------------------------

ok('THE BUG: an empty run history is "nobody has looked", NOT "nothing is wrong"',
  vitals([], NOW).pulse === 'never');

ok('...and it says so in English, without hedging',
  vitals([], NOW).says.includes('nobody has looked'));

ok('a dead brain and a healthy brain do NOT produce the same pulse',
  vitals([], NOW).pulse !== vitals([goodRun], NOW).pulse);

ok('a differ that has not run since the ceiling is UNWATCHED, not fine',
  vitals([{ ...goodRun, ran_at: hoursAgo(STALE_HOURS + 2) }], NOW).pulse === 'unwatched');

ok('one late night is not an alarm. It runs nightly and a watchdog that cries wolf gets muted',
  vitals([{ ...goodRun, ran_at: hoursAgo(26) }], NOW).pulse === 'checking');

// --- being wrong beats not knowing beats a quiet night ------------------------------------------

ok('DRIFT outranks everything: we are wrong, and that is worse than not knowing',
  vitals([{ ...goodRun, drifted: 1, blind: 3, ran_at: hoursAgo(400) }], NOW).pulse === 'wrong');

ok('BLIND outranks a stale run: a differ that cannot read the page is not "finding no problems"',
  vitals([{ ...goodRun, blind: 2, ran_at: hoursAgo(400) }], NOW).pulse === 'blind');

ok('the drift sentence names the consequence, not the metric',
  vitals([{ ...goodRun, drifted: 2 }], NOW).says.includes('every figure resting on it is wrong'));

ok('a clean run is allowed to be quietly good, and says WHAT was checked',
  vitals([goodRun], NOW).pulse === 'checking' && vitals([goodRun], NOW).says.includes('42 of 42'));

// ---------------------------------------------------------------------------------------------
// 🔴 COVERAGE. "0 drift" means the ones we LOOK AT are right.
// ---------------------------------------------------------------------------------------------
//
// The comfortable lie is to divide the constants we checked by the constants we have an extractor
// for, which is always 100%, always green, and always meaningless. The honest denominator is what
// the engine PUBLISHES: everything a user's tax bill actually rests on.

ok('coverage is measured against what the engine PUBLISHES, not against what we already watch',
  coverage(vitals([goodRun], NOW)).total === 61);

ok('...so it is NOT 100% on a perfect night, and it must not be',
  coverage(vitals([goodRun], NOW)).pct === 69);

ok('the unwatched constants are carried by NAME, so the gap has to be looked at',
  coverage(vitals([goodRun], NOW)).blind === 2
  && vitals([goodRun], NOW).unwatched.includes('vatStandardRate'));

ok('a brain with no runs claims no coverage at all',
  coverage(vitals([], NOW)).pct === 0);

// ---------------------------------------------------------------------------------------------
// 🔴 AN ALARM IS NOT A THING THE BRAIN HAS LEARNED.
// ---------------------------------------------------------------------------------------------
//
// The differ's incidents live in knowledge_items because it needed somewhere to shout. If they are
// counted as knowledge, then the day our tax engine goes wrong is the day the console cheerfully
// reports that the brain grew.

const items = [
  { status: 'reviewed', created_at: daysAgo(1), title: 'Mileage rates 2026/27', source_url: 'a' },
  { status: 'distilled', created_at: daysAgo(2), title: 'Class 4 NI', source_url: 'b' },
  { status: 'needs_distillation', created_at: daysAgo(2), title: 'Raw feed item', source_url: 'c' },
  { status: 'drift', created_at: daysAgo(1), title: 'ENGINE DRIFT', source_url: 'd' },
  { status: 'extractor_broken', created_at: daysAgo(1), title: 'CANNOT CHECK', source_url: 'e' },
];

ok('THE BUG: a drift incident does NOT count as knowledge',
  knowledge(items).total === 3);

ok('...it is counted as an incident, separately, where it belongs',
  knowledge(items).incidents === 2);

ok('only REVIEWED rows ever reach a user, and they are counted apart from the queue',
  knowledge(items).reviewed === 1 && knowledge(items).waiting === 1 && knowledge(items).raw === 1);

ok('an alarm on the growth chart would mean the engine going wrong looks like the brain growing',
  growth(items, 30, NOW).at(-1).total === 3);

// --- growth is real history, and history includes what came before the window -------------------

ok('the running total carries everything learned BEFORE the 30 day window',
  growth(
    [{ status: 'reviewed', created_at: daysAgo(200), title: 'old', source_url: 'x' },
     { status: 'reviewed', created_at: daysAgo(1), title: 'new', source_url: 'y' }],
    30, NOW,
  ).at(-1).total === 2);

ok('...and the day column only counts what landed IN the window',
  growth(
    [{ status: 'reviewed', created_at: daysAgo(200), title: 'old', source_url: 'x' },
     { status: 'reviewed', created_at: daysAgo(1), title: 'new', source_url: 'y' }],
    30, NOW,
  ).reduce((n, d) => n + d.n, 0) === 1);

ok('a row with no date is dropped rather than landing on a day the parser invented',
  growth([{ status: 'reviewed', created_at: null, title: 'x', source_url: 'z' }], 30, NOW)
    .every((d) => d.n === 0));

ok('an empty brain draws a flat zero and does not crash',
  growth([], 30, NOW).length === 30 && growth([], 30, NOW).at(-1).total === 0);

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

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

import { vitals, coverage, knowledge, growth, didCheck, isKnowledge, isLive, LANDING_WINDOW_DAYS, STALE_HOURS } from '../lib/brain.ts';

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


// ---------------------------------------------------------------------------------------------
// 🔴 A RUN THAT CHECKED NOTHING IS NOT A RUN. Written from the row that was on the live page.
// ---------------------------------------------------------------------------------------------
//
// 14 July, about an hour after the heartbeat shipped. The differ crashed on a typo of mine. The
// failure recorder worked perfectly and wrote an honest row: published 0, checked 0, agreed 0,
// drifted 0, blind 0, ok false.
//
// And this file read that row and rendered:
//
//     Checking. "0 of 0 constants were compared to their GOV.UK page and every one matched."
//
// GREEN. A crashed differ shown as a perfect night, by the screen built to make a dead differ
// impossible to miss. Zero drift out of zero checks is not a clean bill of health. It is an empty
// set wearing one, and I had walked straight past it because the numbers were all zero and zero
// looks like nothing is wrong.
//
// Worse, the same hole was in the alarm: lastDifferRunAt read the newest row of ANY kind, so a
// differ crash-looping at 3am every morning would write a fresh row nightly, hold the clock
// permanently green, and never compare a single constant to GOV.UK. A heartbeat monitor wired to
// the fact that the patient is still in the bed.

const CRASHED = {
  ran_at: hoursAgo(1), tax_year: null,
  published: 0, checked: 0, agreed: 0, drifted: 0, blind: 0, unwatched: [], ok: false,
};

ok('THE BUG: a crashed run must NOT read as "checking"',
  vitals([CRASHED], NOW).pulse !== 'checking');

ok('...and it must never say "every one matched", because nothing was compared to anything',
  !vitals([CRASHED], NOW).says.includes('matched'));

ok('a night of nothing but crashes is NEVER RUN, not a clean night',
  vitals([CRASHED, { ...CRASHED, ran_at: hoursAgo(25) }], NOW).pulse === 'never');

ok('...and it says the differ is FAILING, not idle. Busy is not the same as working',
  vitals([CRASHED], NOW).says.includes('failing, not idle'));

ok('a crash on top of a good night says the job is broken NOW',
  vitals([CRASHED, goodRun], NOW).pulse === 'failed');

ok('...and it still shows the good night\'s numbers, but dated, so nobody reads them as current',
  vitals([CRASHED, goodRun], NOW).checked === 42
  && vitals([CRASHED, goodRun], NOW).says.includes('did not finish'));

ok('THE CLOCK: staleness is measured from the last run that CHECKED something, not the last that ran',
  vitals([{ ...CRASHED, ran_at: hoursAgo(1) },
          { ...goodRun, ran_at: hoursAgo(200) }], NOW).hoursAgo === 200);

ok('so a differ crash-looping nightly cannot hold the clock green for ever',
  vitals([{ ...CRASHED, ran_at: hoursAgo(1) },
          { ...CRASHED, ran_at: hoursAgo(25) },
          { ...goodRun, ran_at: hoursAgo(200) }], NOW).hoursAgo > STALE_HOURS);

ok('a real DRIFT still outranks a broken job: being wrong beats the job being down',
  vitals([CRASHED, { ...goodRun, drifted: 1 }], NOW).pulse === 'wrong');

ok('didCheck is the one rule, and it is about comparisons, not exit codes',
  didCheck(goodRun) === true && didCheck(CRASHED) === false);


// ---------------------------------------------------------------------------------------------
// 🔴 THE TWO NUMBERS ON ONE PANEL THAT DISAGREED BY 82. Read off the live page, not the code.
// ---------------------------------------------------------------------------------------------
//
// The console showed, three inches apart, from one table:
//
//     9 approved. 39 waiting. 0 raw.        <- knowledge(): an ALLOWLIST of three statuses
//     "130 things Khoji has learned"        <- growth():    a BLOCKLIST of two statuses
//
// The gap was 82 rows with status `resolved`: drift incidents the differ CLOSED when we fixed the
// engine and the constant agreed again. An alarm that has been switched off. growth() had never
// heard of the status, so every one of them fell through into "things the brain has learned", and
// the console's reading was: our tax engine went wrong and was fixed, therefore the brain grew.
//
// The comment above knowledge() had warned about that exact sentence, while the code beneath it did
// it. A blocklist is a bet that you have already thought of every status that will ever exist.
//
// THE INVARIANT BELOW IS THE REAL FIX. Not the allowlist: the allowlist can be got wrong again. The
// invariant cannot be satisfied by two functions that disagree about what a fact is.

const RESOLVED = { status: 'resolved', created_at: daysAgo(1), title: 'was drift, now agrees', source_url: 'r' };

ok('THE BUG: a RESOLVED alarm is not a thing the brain learned',
  knowledge([...items, RESOLVED]).total === 3);

ok('...and it is not on the growth chart either. Fixing our own bug is not learning',
  growth([...items, RESOLVED], 30, NOW).at(-1).total === 3);

ok('THE INVARIANT: growth and knowledge must agree about what a fact is, ALWAYS',
  growth([...items, RESOLVED], 30, NOW).at(-1).total === knowledge([...items, RESOLVED]).total);

ok('...and it holds for a status nobody has invented yet, because the list is an ALLOWLIST',
  growth([...items, { status: 'some_future_status', created_at: daysAgo(1), title: 'x', source_url: 'f' }], 30, NOW).at(-1).total
  === knowledge([...items, { status: 'some_future_status', created_at: daysAgo(1), title: 'x', source_url: 'f' }]).total);

ok('a dismissed item is not knowledge either. A human looked at it and said no',
  isKnowledge({ status: 'dismissed', created_at: daysAgo(1), title: 'x', source_url: 'd' }) === false);

ok('and the four real statuses ARE knowledge, so the fix did not simply hide everything',
  ['needs_distillation', 'distilled', 'reviewed', 'actioned']
    .every((status) => isKnowledge({ status, created_at: daysAgo(1), title: 'x', source_url: 'k' })));


// ---------------------------------------------------------------------------------------------
// 🔴 THE BADGE THAT LIED ON ITS FIRST DAY. Read off the live queue, an hour after shipping it.
// ---------------------------------------------------------------------------------------------
//
// The review queue shouted "CHANGES THE TAX ENGINE" on a GOV.UK page effective 1 JANUARY 2019, and
// on another from 6 April 2017. The trading allowance has been £1,000 since 2017. Our engine holds
// it. Khoji compares it to GOV.UK every single night. NOTHING WAS CHANGING.
//
// `engine_impact` is a MODEL'S GUESS and the distiller had set it true on all 39 items. The loudest
// label on the screen was on everything, which means it was on nothing, and the one item that
// genuinely moves a rate would have hidden inside the noise.
//
// An alarm that always fires gets muted, and then you have no alarm AND you think you have one. So
// the shout is reserved for a change that is actually landing, decided by a FACT the model cannot
// fudge: the effective date on the row.

ok('THE BUG: a change that landed in 2017 is not news, and is not shouted about',
  isLive('2017-04-06', NOW) === false);

ok('...nor one from 2019',
  isLive('2019-01-01', NOW) === false);

ok('a change landing in the FUTURE is live. That is the whole point of the queue',
  isLive('2027-04-06', NOW) === true);

ok('a change that landed last week is live: we may not have acted on it yet',
  isLive(daysAgo(7), NOW) === true);

ok('the window is 120 days, and either side of it behaves',
  isLive(daysAgo(LANDING_WINDOW_DAYS - 1), NOW) === true
  && isLive(daysAgo(LANDING_WINDOW_DAYS + 1), NOW) === false);

ok('NO DATE means LIVE. Not knowing when it bites is not the same as it being harmless',
  isLive(null, NOW) === true && isLive(undefined, NOW) === true);

ok('...and so does a date we cannot parse. We shout rather than quietly swallow it',
  isLive('not a date', NOW) === true);

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

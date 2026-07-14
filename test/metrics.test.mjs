// The numbers the business is run on. See lib/metrics.ts.
//
// WHAT THESE TESTS PROTECT, AND IT IS NOT ARITHMETIC.
//
// A founder's dashboard is the screen he uses to decide whether to keep going. There are exactly two
// ways it can betray him, and both of them look like a healthy number:
//
//   1. IT INVENTS HISTORY. "MRR over time" drawn from data that only holds the CURRENT status is a
//      reconstruction, and a reconstruction with a trend line on it is a lie a man will raise money
//      against. We do not have the past. We say so.
//
//   2. IT PUBLISHES A RATE OFF TWO DATA POINTS. One trial, one conversion, "100% conversion". That
//      is not a fact, it is a coin landing heads, and a man who believes it will spend money he does
//      not have on adverts that do not work.
//
// This morning the team dashboard said "2 customers, MRR £13" on a day nobody had ever paid us,
// because a number was DERIVED from a lookup table instead of READ from what is true. These tests
// exist so the metrics page cannot do the same thing in a more sophisticated way.

import { confidence, rate, daily, signupDates, funnel, byChannel, historyNote, ENOUGH } from '../lib/metrics.ts';

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

console.log('\nmetrics: what is true, and what we do not know');

// ---------------------------------------------------------------------------------------------
// 🔴 THE ONE THAT MATTERS: A RATE OFF TOO FEW PEOPLE IS NOT A RATE.
// ---------------------------------------------------------------------------------------------
ok('1 trial, 1 conversion: the page must NOT say 100%',
  rate(1, 1).pct === null);

ok('...and it says WHY, in a way that stops you believing it',
  /Too few to mean anything/.test(rate(1, 1).conf.note));

ok('2 of 3: still not a rate', rate(2, 3).pct === null);
ok('19 is still not enough', rate(10, 19).pct === null);
ok(`${ENOUGH} IS enough, and only then does a number appear`, rate(10, ENOUGH).pct === 50);
ok('and at that point it says what it is based on', /Based on 20/.test(rate(10, 20).conf.note));

ok('nothing at all is honestly nothing, not zero percent',
  rate(0, 0).pct === null && rate(0, 0).conf.n === 0);

ok('the warning tells you how much ONE person would swing it',
  /swings this by 20 points/.test(confidence(5).note));

// ---------------------------------------------------------------------------------------------
// 🔴 AND THE OTHER ONE: WE DO NOT HAVE THE PAST. SAY SO.
// ---------------------------------------------------------------------------------------------
ok('no snapshots: the page says there is no history and it cannot be recovered',
  /no way to recover what came before/.test(historyNote([])));

ok('one day of history is NOT a chart, and the page admits it',
  /History starts here/.test(historyNote([{ day: '2026-07-14', customers: 1, paying: 0, trialing: 1, mrr_pence: 0 }])));

ok('with real history, it stops apologising and just shows the line',
  historyNote([1, 2, 3, 4].map((i) => ({ day: `2026-07-1${i}`, customers: i, paying: 0, trialing: 0, mrr_pence: 0 }))) === null);

// ---------------------------------------------------------------------------------------------
// SIGNUPS OVER TIME. This IS real history: a created_at is written once and never rewritten.
// ---------------------------------------------------------------------------------------------
const NOW = new Date('2026-07-14T12:00:00Z');

const series = daily(
  ['2026-07-14T09:00:00Z', '2026-07-14T10:00:00Z', '2026-07-12T08:00:00Z', '2026-06-01T00:00:00Z'],
  7,
  NOW,
);

ok('seven days, seven points', series.length === 7);
ok('today counted 2 signups', series[6].n === 2);
ok('two days ago counted 1', series[4].n === 1);
ok('a quiet day is 0, not missing', series[5].n === 0);

ok('THE RUNNING TOTAL INCLUDES EVERYONE WHO CAME BEFORE THE WINDOW. A 30 day chart that starts at ' +
   'zero when you already had 400 customers is a chart that makes you look like you are dying.',
  series[0].total === 1 && series[6].total === 4);

ok('a null date does not crash it, and does not become a phantom signup',
  daily([null, undefined, '', 'not a date', '2026-07-14T00:00:00Z'], 3, NOW).at(-1).n === 1);

// ---------------------------------------------------------------------------------------------
// THE FUNNEL. The one number that decides whether there is a business.
// ---------------------------------------------------------------------------------------------
const f = (status, internal = false) => ({ status, stripeId: null, internal });

const fn = funnel([
  f('active'), f('active'), f('past_due'),   // 3 paying
  f('canceled'), f('canceled'),              // 2 gone
  f('trialing'), f('trialing'),              // 2 still deciding
  f('active', true),                         // the demo account. NOT a customer, NOT a conversion.
]);

ok('the demo account is not in the funnel at all', fn.trialsStarted === 7);
ok('converted = active + past_due', fn.converted === 3);
ok('still trialing is its own thing', fn.stillTrialing === 2);
ok('lapsed = the trial ended and he never paid', fn.lapsed === 2);

ok('⚠️ A MAN STILL ON TRIAL HAS NOT FAILED TO CONVERT. He has not finished. The denominator is ' +
   'everybody who DECIDED (3 + 2 = 5), not everybody who started.',
  fn.conversion.conf.n === 5);

ok('...and with only 5 decided, it STILL refuses to print a percentage', fn.conversion.pct === null);

// With enough people, it speaks.
const big = funnel([
  ...Array(8).fill(null).map(() => f('active')),
  ...Array(12).fill(null).map(() => f('canceled')),
  ...Array(5).fill(null).map(() => f('trialing')),
]);
ok('with 20 decided (8 paid, 12 did not), conversion is 40% and it says so',
  big.conversion.pct === 40 && big.conversion.conf.enough);

// ---------------------------------------------------------------------------------------------
// WHICH CHANNEL ACTUALLY PAYS. Cost per acquisition is vanity. Cost per RETAINED customer is the
// business.
// ---------------------------------------------------------------------------------------------
const ch = byChannel([
  { source: 'meta', status: 'canceled', internal: false },
  { source: 'meta', status: 'canceled', internal: false },
  { source: 'meta', status: 'canceled', internal: false },
  { source: 'referral', status: 'active', internal: false },
  { source: 'referral', status: 'active', internal: false },
  { source: 'meta', status: 'active', internal: true },   // the demo. Never a marketing win.
]);

ok('channels are ranked by how many came', ch[0].source === 'meta' && ch[0].came === 3);
ok('the demo account is not credited to any channel', ch.find((c) => c.source === 'meta').came === 3);
ok('meta brought 3 and 0 of them pay', ch.find((c) => c.source === 'meta').paying === 0);
ok('referral brought 2 and BOTH pay', ch.find((c) => c.source === 'referral').paying === 2);

ok('but with 3 and 2 people, NEITHER gets a percentage. This is the whole point: the channel that ' +
   'LOOKS best on five people is how an advertising budget gets set on a coin flip.',
  ch.every((c) => c.conversion.pct === null));


// --- WHO COUNTS AS A SIGNUP ---------------------------------------------------------------------
//
// ⚠️ THIS BLOCK IS A REGRESSION TEST FOR A BUG THAT SHIPPED AND WAS FOUND BY LOOKING AT THE PAGE.
//
// The console said "CUSTOMERS 1" in one box and "2 people have signed up" three inches below it.
// The extra man was our own App Review demo account. Every other figure excluded internal accounts;
// the growth chart came from a SECOND query that had never heard of the word, so it counted him.
//
// A hundred per cent inflation of the only number that matters in month one, on the screen we would
// use to decide whether to keep going. Six code-reading passes had walked straight past it.
const DEMO = { joined: '2026-07-13T09:00:00Z', internal: true };
const REAL = { joined: '2026-06-30T09:00:00Z', internal: false };

ok('THE BUG: the App Review demo account is NOT a signup',
  signupDates([DEMO, REAL]).length === 1);

ok('the real man survives',
  signupDates([DEMO, REAL])[0] === REAL.joined);

ok('a comp is internal too, and a comp is not growth',
  signupDates([{ joined: '2026-07-01T00:00:00Z', internal: true }]).length === 0);

ok('a man with no joined date does not become a signup on a phantom day',
  signupDates([{ joined: null, internal: false }]).length === 0);

ok('THE WHOLE POINT: the chart and the customer count now agree',
  daily(signupDates([DEMO, REAL, REAL]), 30, new Date('2026-07-14T12:00:00Z')).at(-1).total === 2);

ok('nobody real is lost when EVERY account is internal',
  daily(signupDates([DEMO]), 30, new Date('2026-07-14T12:00:00Z')).at(-1).total === 0);

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

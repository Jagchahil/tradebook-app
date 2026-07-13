// The team dashboard. See lib/team.ts, app/team, app/api/team/overview.
//
// WHAT THESE TESTS PROTECT, AND IT IS NOT A FEATURE. IT IS A PROMISE.
//
// The app's settings screen says this to every user, in these exact words:
//
//     "Your records are encrypted and only you can see them."
//
// The team dashboard is the one place in the whole system where that sentence could quietly stop
// being true. Not by anybody deciding to break it, but by somebody, one busy afternoon, adding a
// column to a select because it would be handy to see. Doc 104's standing question is: is it TRUE?
// Not is it defensible. True.
//
// So the load-bearing test in this file is not "does the dashboard add up". It is:
//
//   A FINANCIAL COLUMN CANNOT REACH THE TEAM'S VIEW OF A CUSTOMER.
//
// It fails the build. It is checked against the ACTUAL allowlist that the ACTUAL SQL select is
// built from, so it cannot be satisfied by a comment or a good intention.
//
// And one more, which people find surprising until they think about it: NOT THE PHONE NUMBER. It is
// how a man is identified in this product, it is personal data, and the team has no operational need
// for it. Support happens on WhatsApp, where he messaged us first. If we ever do need it, that is a
// deliberate conversation and a changed promise, not a quiet extra column.

import {
  CUSTOMER_COLUMNS,
  FORBIDDEN_CUSTOMER_COLUMNS,
  normaliseSource,
  sourceLabel,
  isTeam,
  overview,
  PRICE_PENCE,
  SOURCES,
} from '../lib/team.ts';

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

console.log('\nteam: the promise, and the numbers');

// ---------------------------------------------------------------------------------------------
// THE PROMISE. This is the whole reason the file exists.
// ---------------------------------------------------------------------------------------------
for (const forbidden of FORBIDDEN_CUSTOMER_COLUMNS) {
  ok(`the team CANNOT see "${forbidden}"`, !CUSTOMER_COLUMNS.includes(forbidden));
}

ok('the team cannot see a phone number. He is identified by it, and support happens on WhatsApp.',
  !CUSTOMER_COLUMNS.includes('phone_number'));

// Belt and braces: nothing money-shaped, whatever it is called.
const MONEY_WORDS = /amount|income|expense|profit|tax|receipt|vendor|balance|owed|bill|transaction/i;
const moneyish = CUSTOMER_COLUMNS.filter((c) => MONEY_WORDS.test(c));
ok(`no column in the allowlist is money shaped (found: ${moneyish.join(', ') || 'none'})`, moneyish.length === 0);

ok('the allowlist is exactly what we think it is',
  CUSTOMER_COLUMNS.join(',') === 'id,name,trade_type,created_at,acquisition_source,acquisition_detail');

// ---------------------------------------------------------------------------------------------
// WHO IS ON THE TEAM.
// ---------------------------------------------------------------------------------------------
ok('an active member is on the team', isTeam({ email: 'a@b.c', name: 'A', role: 'owner', is_active: true }));
ok('a DEACTIVATED member is not, immediately', !isTeam({ email: 'a@b.c', name: 'A', role: 'owner', is_active: false }));
ok('a stranger is not on the team', !isTeam(null));
ok('an undefined member is not on the team', !isTeam(undefined));

// ---------------------------------------------------------------------------------------------
// WHERE THEY CAME FROM. A row we cannot classify is still a customer.
// ---------------------------------------------------------------------------------------------
ok('meta', normaliseSource('meta') === 'meta');
ok('in person, however it was typed', normaliseSource('In Person') === 'in_person' && normaliseSource('in-person') === 'in_person');
ok('referral', normaliseSource('REFERRAL') === 'referral');
ok('an unrecognised source is "unknown", NOT dropped: a man who came by a route we forgot to name still came',
  normaliseSource('tiktok') === 'unknown');
ok('null is unknown', normaliseSource(null) === 'unknown');
ok('empty is unknown', normaliseSource('') === 'unknown');
ok('the label is readable', sourceLabel('in_person') === 'In person' && sourceLabel(null) === 'Unknown');

// ---------------------------------------------------------------------------------------------
// THE NUMBERS WE RUN THE BUSINESS ON.
// ---------------------------------------------------------------------------------------------
const c = (over) => ({
  id: 'x', name: 'A man', trade: 'electrician', joined: '2026-07-01',
  source: 'meta', sourceDetail: null,
  status: 'active', plan: 'monthly', renews: '2026-08-01', cancelRequested: false,
  ...over,
});

const o = overview([
  c({ status: 'active', plan: 'monthly' }),
  c({ status: 'active', plan: 'annual' }),
  c({ status: 'trialing', plan: null, source: 'billboard' }),
  c({ status: 'past_due', plan: 'monthly', source: 'referral' }),
  c({ status: 'canceled', plan: 'monthly', source: 'organic' }),
  c({ status: 'active', plan: 'monthly', cancelRequested: true, source: 'in_person' }),
  c({ status: 'none', plan: null, source: 'tiktok-that-we-forgot' }),
], PRICE_PENCE);

ok('every customer is counted, including the one from a channel we never named', o.customers === 7);
ok('paying = active + past_due', o.active === 3 && o.pastDue === 1);
ok('a trial is counted as a trial', o.trialing === 1);
ok('a cancellation request is visible, because it is the one thing we can still act on', o.cancelRequested === 1);

// MRR, counted by hand from the seven above, because a test that computes the answer the same way
// the code does is not a test, it is a mirror:
//
//   active  monthly                    1299
//   active  annual                     1075   (12900 / 12, spread honestly)
//   trialing                              0   NOT revenue
//   past_due monthly                   1299   he is still ours, Stripe is still retrying
//   canceled monthly                      0   NOT revenue
//   active  monthly (cancel requested) 1299   he has not left yet, and he is still paying
//   none                                  0
//                                     ------
//                                       4972
//
// (My first pass at this said 6271, by counting three monthly subscribers when there are two. The
// code was right and the test was wrong, which is the correct way round for that to happen.)
const expected = 1299 + Math.round(12900 / 12) + 1299 + 1299;
ok(`MRR counts money we are ACTUALLY paid, and a trial is not revenue (${o.mrrPence} = ${expected})`,
  o.mrrPence === expected);

ok('a trial adds nothing to MRR. Counting it is how a founder invents a runway he does not have.',
  overview([c({ status: 'trialing', plan: null })], PRICE_PENCE).mrrPence === 0);

ok('a cancelled subscriber adds nothing to MRR',
  overview([c({ status: 'canceled', plan: 'monthly' })], PRICE_PENCE).mrrPence === 0);

ok('the annual plan is spread over twelve months, so it sits honestly beside a monthly one',
  PRICE_PENCE.annual === Math.round(12900 / 12));

ok('every source is present in the breakdown, even at zero, so nothing hides',
  SOURCES.every((s) => typeof o.bySource[s] === 'number'));
ok('the unclassifiable customer landed in unknown', o.bySource.unknown === 1);
ok('the sources add up to the customer count',
  SOURCES.reduce((n, s) => n + o.bySource[s], 0) === o.customers);

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

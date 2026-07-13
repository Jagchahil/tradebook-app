// The rule that decides whether a man can open his own books. See lib/entitlement.ts.
//
// WHAT THESE TESTS PROTECT
//
// The gate used to live in the mobile app and read:
//
//     const ok = !b || b.status === 'active' || b.status === 'trialing';
//
// It looks at the status and never at the date. A trial that ended in 2024 still says 'trialing',
// so it still passes. THE TRIAL COULD NEVER EXPIRE. It had never once misfired, because nothing in
// the product had ever granted a trial: the "Start free trial" button called router.replace and
// nothing else. The bug was invisible because the feature was missing.
//
// So the load-bearing test in this file is not "does a trial work". It is:
//
//   AN EXPIRED TRIAL IS NOT A TRIAL.
//
// If that assertion ever goes red, we are giving the product away forever and the revenue line
// will not tell us for months.
//
// The second thing these pin is the asymmetry, because it is a decision and not an accident:
// EVERY AMBIGUOUS CASE FAILS OPEN. Locking a man out of his own records costs him his books on the
// morning his tax is due. Letting him have another fortnight costs us £12.99. Those are not the
// same size of mistake, and the code must keep leaning the way we chose on purpose.

import { isEntitled, trialEndsAt, TRIAL_DAYS } from '../lib/entitlement.ts';

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

const NOW = new Date('2026-07-13T12:00:00Z');
const days = (n) => new Date(NOW.getTime() + n * 24 * 3600 * 1000).toISOString();

console.log('\nentitlement: the one rule');

// ---------------------------------------------------------------------------------------------
// THE GATE. The bug we actually had.
// ---------------------------------------------------------------------------------------------
ok('a live trial is entitled',
  isEntitled({ status: 'trialing', current_period_end: days(3) }, NOW) === true);

ok('AN EXPIRED TRIAL IS NOT ENTITLED  <-- the bug. The old gate said yes, forever.',
  isEntitled({ status: 'trialing', current_period_end: days(-1) }, NOW) === false);

ok('a trial that ended two years ago is not entitled',
  isEntitled({ status: 'trialing', current_period_end: '2024-01-01T00:00:00Z' }, NOW) === false);

ok('a trial expiring one second from now is still his',
  isEntitled({ status: 'trialing', current_period_end: new Date(NOW.getTime() + 1000).toISOString() }, NOW) === true);

ok('a trial that expired one second ago is not',
  isEntitled({ status: 'trialing', current_period_end: new Date(NOW.getTime() - 1000).toISOString() }, NOW) === false);

// ---------------------------------------------------------------------------------------------
// PAYING, AND NOT PAYING.
// ---------------------------------------------------------------------------------------------
ok('active is entitled', isEntitled({ status: 'active', current_period_end: days(20) }, NOW) === true);

ok('active is entitled even with a stale period end (Stripe owns that status, not us)',
  isEntitled({ status: 'active', current_period_end: days(-5) }, NOW) === true);

ok('past_due is ENTITLED: a bounced card is not eviction. Stripe retries for ~3 weeks, then cancels.',
  isEntitled({ status: 'past_due', current_period_end: days(-2) }, NOW) === true);

ok('canceled is not entitled', isEntitled({ status: 'canceled', current_period_end: days(-1) }, NOW) === false);
ok('unpaid is not entitled', isEntitled({ status: 'unpaid' }, NOW) === false);
ok('incomplete is not entitled', isEntitled({ status: 'incomplete' }, NOW) === false);
ok('"none" (no subscription row at all) is not entitled', isEntitled({ status: 'none' }, NOW) === false);
ok('an unknown status is not entitled, rather than guessed',
  isEntitled({ status: 'something_stripe_invented_last_week' }, NOW) === false);

ok('case does not decide a man\'s access', isEntitled({ status: 'ACTIVE' }, NOW) === true);

// ---------------------------------------------------------------------------------------------
// THE ASYMMETRY. Every ambiguous case fails OPEN, on purpose.
// ---------------------------------------------------------------------------------------------
ok('a trialing row with NO end date fails OPEN: our data is thin, not his entitlement false',
  isEntitled({ status: 'trialing', current_period_end: null }, NOW) === true);

ok('a trialing row with an unreadable date fails OPEN, for the same reason',
  isEntitled({ status: 'trialing', current_period_end: 'not a date' }, NOW) === true);

// ...but a MISSING SUBSCRIPTION is not ambiguity, it is an answer.
ok('null is not entitled here (the CALLER fails open on an unreadable server, not this function)',
  isEntitled(null, NOW) === false);
ok('undefined is not entitled', isEntitled(undefined, NOW) === false);
ok('a row with a null status is not entitled', isEntitled({ status: null }, NOW) === false);

// ---------------------------------------------------------------------------------------------
// THE FORTNIGHT WE ADVERTISE IS THE FORTNIGHT WE GRANT.
// The screen says 14 days. If this ever drifts, the product is lying to him again.
// ---------------------------------------------------------------------------------------------
ok('the trial is 14 days, the number on the screen', TRIAL_DAYS === 14);

const end = new Date(trialEndsAt(NOW));
const granted = Math.round((end.getTime() - NOW.getTime()) / (24 * 3600 * 1000));
ok(`a trial granted now ends in exactly 14 days (got ${granted})`, granted === 14);

ok('a freshly granted trial is entitled today', isEntitled({ status: 'trialing', current_period_end: trialEndsAt(NOW) }, NOW) === true);

ok('a freshly granted trial is NOT entitled on day 15',
  isEntitled({ status: 'trialing', current_period_end: trialEndsAt(NOW) }, new Date(NOW.getTime() + 15 * 24 * 3600 * 1000)) === false);

ok('a freshly granted trial IS still entitled on day 13',
  isEntitled({ status: 'trialing', current_period_end: trialEndsAt(NOW) }, new Date(NOW.getTime() + 13 * 24 * 3600 * 1000)) === true);

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

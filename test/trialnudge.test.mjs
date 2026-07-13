// The trial ending nudge. See lib/trialnudge.ts and app/api/cron/trial.
//
// WHAT THESE TESTS PROTECT
//
// Two things, and they pull in opposite directions.
//
//   1. HE MUST BE TOLD. A man whose trial ends with no warning opens the app on day fifteen, finds
//      himself locked out of his own books, and blames us. That is the most expensive silence
//      available to us: it takes the customer at the exact moment he had decided we were worth
//      paying for.
//
//   2. HE MUST NOT BE TOLD TWICE. This cron runs EVERY MORNING. Anything that lets the same message
//      through on two consecutive days does not send two messages, it sends one every day until he
//      blocks the number. So the "already told him" assertions below are not tidiness. They are the
//      difference between a useful product and harassment.
//
// And one thing that is neither: A MAN WITH A CARD ON FILE IS NOT OUR CONVERSATION. A Stripe trial
// converts by itself and Stripe emails him about it. Telling him to "pick a plan" would be
// confusing and faintly insulting.

import { decideTrialNudge, daysLeft, humanDate, templateFor, paramsFor, WARN_DAYS_BEFORE } from '../lib/trialnudge.ts';

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

const NOW = new Date('2026-07-13T09:00:00Z');
const inDays = (n) => new Date(NOW.getTime() + n * 24 * 3600 * 1000).toISOString();

// A local trial: no Stripe id, nothing sent yet.
const trial = (over) => ({
  phone: '+447700900123',
  status: 'trialing',
  current_period_end: inDays(10),
  stripe_subscription_id: null,
  trial_warn_sent_at: null,
  trial_end_sent_at: null,
  ...over,
});

console.log('\ntrial nudge: tell him once, and never twice');

// ---------------------------------------------------------------------------------------------
// THE WARNING. Three days out.
// ---------------------------------------------------------------------------------------------
ok('day 11 of 14 (3 days left): WARN', decideTrialNudge(trial({ current_period_end: inDays(3) }), NOW) === 'warn');
ok('2 days left: still warn (a missed cron run must not lose him)', decideTrialNudge(trial({ current_period_end: inDays(2) }), NOW) === 'warn');
ok('1 day left: still warn', decideTrialNudge(trial({ current_period_end: inDays(1) }), NOW) === 'warn');

ok('4 days left: SAY NOTHING. He is working.', decideTrialNudge(trial({ current_period_end: inDays(4) }), NOW) === null);
ok('10 days left: say nothing', decideTrialNudge(trial({ current_period_end: inDays(10) }), NOW) === null);
ok('day 1 of the trial: say nothing', decideTrialNudge(trial({ current_period_end: inDays(14) }), NOW) === null);

// ---------------------------------------------------------------------------------------------
// THE END.
// ---------------------------------------------------------------------------------------------
ok('the day it ends: ENDED', decideTrialNudge(trial({ current_period_end: inDays(0) }), NOW) === 'ended');
ok('a day after it ended: ENDED', decideTrialNudge(trial({ current_period_end: inDays(-1) }), NOW) === 'ended');

ok('it ended and he was never warned: he gets the ENDED message, not a late warning',
  decideTrialNudge(trial({ current_period_end: inDays(-2), trial_warn_sent_at: null }), NOW) === 'ended');

// ---------------------------------------------------------------------------------------------
// NEVER TWICE. This cron runs every single morning.
// ---------------------------------------------------------------------------------------------
ok('ALREADY WARNED: silence, or he gets it again tomorrow, and the day after, forever',
  decideTrialNudge(trial({ current_period_end: inDays(2), trial_warn_sent_at: '2026-07-12T09:00:00Z' }), NOW) === null);

ok('ALREADY TOLD IT ENDED: silence',
  decideTrialNudge(trial({ current_period_end: inDays(-1), trial_end_sent_at: '2026-07-12T09:00:00Z' }), NOW) === null);

ok('warned on day 11, and it has now ended: he still gets the ONE ending message',
  decideTrialNudge(trial({ current_period_end: inDays(-1), trial_warn_sent_at: '2026-07-10T09:00:00Z' }), NOW) === 'ended');

ok('warned AND told it ended: nothing left to say, ever',
  decideTrialNudge(trial({
    current_period_end: inDays(-3),
    trial_warn_sent_at: '2026-07-08T09:00:00Z',
    trial_end_sent_at: '2026-07-11T09:00:00Z',
  }), NOW) === null);

// ---------------------------------------------------------------------------------------------
// NOT OUR CONVERSATION.
// ---------------------------------------------------------------------------------------------
ok('A STRIPE TRIAL IS LEFT ALONE. He has a card; it converts by itself and Stripe emails him.',
  decideTrialNudge(trial({ current_period_end: inDays(2), stripe_subscription_id: 'sub_123' }), NOW) === null);

ok('an ACTIVE subscriber is never nudged', decideTrialNudge(trial({ status: 'active', current_period_end: inDays(2) }), NOW) === null);
ok('a CANCELED subscriber is never nudged', decideTrialNudge(trial({ status: 'canceled', current_period_end: inDays(-1) }), NOW) === null);
ok('a past_due subscriber is never nudged here (that is a card problem, not a trial)',
  decideTrialNudge(trial({ status: 'past_due', current_period_end: inDays(-1) }), NOW) === null);

// ---------------------------------------------------------------------------------------------
// WE DO NOT GUESS.
// ---------------------------------------------------------------------------------------------
ok('no end date: we do not know when it ends, so we SAY NOTHING rather than invent a date',
  decideTrialNudge(trial({ current_period_end: null }), NOW) === null);
ok('an unreadable end date: say nothing', decideTrialNudge(trial({ current_period_end: 'not a date' }), NOW) === null);
ok('no phone number: nothing to send to', decideTrialNudge(trial({ phone: null, current_period_end: inDays(1) }), NOW) === null);

// ---------------------------------------------------------------------------------------------
// THE WORDS HE ACTUALLY READS.
// ---------------------------------------------------------------------------------------------
ok('the warning is 3 days out', WARN_DAYS_BEFORE === 3);
ok('daysLeft counts whole days', daysLeft(inDays(3), NOW) === 3);

ok('the date is British, not an ISO string. He reads "27 July", not "2026-07-27T09:00:00Z".',
  humanDate('2026-07-27T09:00:00Z') === '27 July');

ok('the warn template carries the date', paramsFor('warn', trial({ current_period_end: '2026-07-27T09:00:00Z' }))[0] === '27 July');
ok('the ended template carries nothing', paramsFor('ended', trial()).length === 0);
ok('warn uses lekhio_trial_ending', templateFor('warn') === 'lekhio_trial_ending');
ok('ended uses lekhio_trial_ended', templateFor('ended') === 'lekhio_trial_ended');

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

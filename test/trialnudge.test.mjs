// The trial ending nudge. See lib/trialnudge.ts and app/api/cron/trial.
//
// WHAT THESE TESTS PROTECT
//
// Two things, and they pull in opposite directions.
//
//   1. HE MUST BE TOLD. A man whose trial ends with no warning opens the app on day eight, finds
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
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 30 JULY: TWO ASSERTIONS IN THIS FILE WERE REVERSED, AND BOTH HAD BEEN GREEN WHILE WRONG.
//
//   . "the warning is 3 days out" pinned a fourteen day trial's answer to a seven day trial. Three
//     days before the end of seven days is DAY FOUR. The test was not failing to catch the bug, it
//     was holding it in place.
//   . "no phone number: nothing to send to" encoded a CHANNEL as a POLICY. Every web customer has
//     no phone until he binds one, and launch one is the web, so that one line meant nobody would
//     be warned about anything on 10 August.
//
// Both are reversed below with the reasoning kept, the same way test/signupsic.test.mjs handled
// findSic's fallback on 27 July. The lesson is the one that keeps recurring here: an assertion is
// only as good as the world it was written about, and nothing tells you when that world moves.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// lib/trialnudge.ts imports lib/watemplates.ts with an extensionless specifier (the Next
// convention), which Node's type stripping cannot resolve, so both files are staged to a temp dir
// with the import rewritten. Same approach as test/presale.test.mjs and test/weeklyupdate.test.mjs.
import { pathToFileURL, fileURLToPath as _fu } from 'node:url';
import { mkdtempSync as _mk, readFileSync as _rf, writeFileSync as _wf } from 'node:fs';
import { tmpdir as _tmp } from 'node:os';
import _path from 'node:path';
const _lib = _path.resolve(_path.dirname(_fu(import.meta.url)), '../lib');
const _stage = _mk(_path.join(_tmp(), 'trialnudge-'));
_wf(_path.join(_stage, 'watemplates.ts'), _rf(_path.join(_lib, 'watemplates.ts'), 'utf8'));
_wf(
  _path.join(_stage, 'trialnudge.ts'),
  _rf(_path.join(_lib, 'trialnudge.ts'), 'utf8').replace("from './watemplates'", "from './watemplates.ts'"),
);
_wf(_path.join(_stage, 'money.ts'), _rf(_path.join(_lib, 'money.ts'), 'utf8'));
const {
  decideTrialNudge, daysLeft, humanDate, templateFor, paramsFor, WARN_DAYS_BEFORE,
  trialWeekMessage, trialEndedMessage, TRIAL_WEEK_SUBJECT, TRIAL_ENDED_SUBJECT,
} = await import(pathToFileURL(_path.join(_stage, 'trialnudge.ts')).href);
const { gbp0 } = await import(pathToFileURL(_path.join(_stage, 'money.ts')).href);

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
  current_period_end: inDays(6),
  stripe_subscription_id: null,
  trial_warn_sent_at: null,
  trial_end_sent_at: null,
  ...over,
});

console.log('\ntrial nudge: tell him once, on day six, and never twice');

// ---------------------------------------------------------------------------------------------
// 🔴 THE WARNING IS THE DAY BEFORE, WHICH ON A SEVEN DAY TRIAL IS DAY SIX.
// ---------------------------------------------------------------------------------------------
ok('day 6 of 7 (1 day left): WARN', decideTrialNudge(trial({ current_period_end: inDays(1) }), NOW) === 'warn');
ok('🔴 3 days left is DAY FOUR of seven and he hears NOTHING. This is the bug that was shipped.',
  decideTrialNudge(trial({ current_period_end: inDays(3) }), NOW) === null);
ok('2 days left (day five): still nothing. He is using it.',
  decideTrialNudge(trial({ current_period_end: inDays(2) }), NOW) === null);
ok('6 days left (day one): say nothing', decideTrialNudge(trial({ current_period_end: inDays(6) }), NOW) === null);
ok('the whole trial is silent until day six',
  [6, 5, 4, 3, 2].every((d) => decideTrialNudge(trial({ current_period_end: inDays(d) }), NOW) === null));

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
  decideTrialNudge(trial({ current_period_end: inDays(1), trial_warn_sent_at: '2026-07-12T09:00:00Z' }), NOW) === null);

ok('ALREADY TOLD IT ENDED: silence',
  decideTrialNudge(trial({ current_period_end: inDays(-1), trial_end_sent_at: '2026-07-12T09:00:00Z' }), NOW) === null);

ok('warned on day six, and it has now ended: he still gets the ONE ending message',
  decideTrialNudge(trial({ current_period_end: inDays(-1), trial_warn_sent_at: '2026-07-12T09:00:00Z' }), NOW) === 'ended');

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
  decideTrialNudge(trial({ current_period_end: inDays(1), stripe_subscription_id: 'sub_123' }), NOW) === null);

ok('an ACTIVE subscriber is never nudged', decideTrialNudge(trial({ status: 'active', current_period_end: inDays(1) }), NOW) === null);
ok('a CANCELED subscriber is never nudged', decideTrialNudge(trial({ status: 'canceled', current_period_end: inDays(-1) }), NOW) === null);
ok('a past_due subscriber is never nudged here (that is a card problem, not a trial)',
  decideTrialNudge(trial({ status: 'past_due', current_period_end: inDays(-1) }), NOW) === null);

// ---------------------------------------------------------------------------------------------
// WE DO NOT GUESS.
// ---------------------------------------------------------------------------------------------
ok('no end date: we do not know when it ends, so we SAY NOTHING rather than invent a date',
  decideTrialNudge(trial({ current_period_end: null }), NOW) === null);
ok('an unreadable end date: say nothing', decideTrialNudge(trial({ current_period_end: 'not a date' }), NOW) === null);

// 🔴 REVERSED ON 30 JULY. This asserted the opposite, and the reasoning it carried ("nothing to
// send to") was a CHANNEL question answered inside a POLICY function. Whether he is DUE something
// and whether we can REACH him are different questions, and lib/routing.ts owns the second one.
// With the old line in place, every web customer on 10 August would have been warned about nothing.
ok('🔴 NO PHONE IS NOT A REASON TO STAY SILENT. A web customer has no number and still has a trial.',
  decideTrialNudge(trial({ phone: null, current_period_end: inDays(1) }), NOW) === 'warn');
ok('and no phone still gets the ended message',
  decideTrialNudge(trial({ phone: null, current_period_end: inDays(-1) }), NOW) === 'ended');

// ---------------------------------------------------------------------------------------------
// 🔴 THE CONSTANT IS ASSERTED AGAINST THE TRIAL LENGTH, NOT AS A BARE NUMBER.
//
// "the warning is 3 days out" was true of a fourteen day trial and survived the change to seven
// with nothing going red. So the two are now tied together: TRIAL_DAYS lives in lib/entitlement.ts
// and this reads it out of the source, so moving one without the other fails the build.
// ---------------------------------------------------------------------------------------------
const entitlementSrc = _rf(_path.join(_lib, 'entitlement.ts'), 'utf8');
const trialDaysMatch = entitlementSrc.match(/export const TRIAL_DAYS\s*=\s*(\d+)/);
ok('TRIAL_DAYS is readable from lib/entitlement.ts', !!trialDaysMatch);
const TRIAL_DAYS = Number(trialDaysMatch?.[1]);
ok(`the warning lands on day ${TRIAL_DAYS - WARN_DAYS_BEFORE} of ${TRIAL_DAYS}, which must be the day before it ends`,
  TRIAL_DAYS - WARN_DAYS_BEFORE === TRIAL_DAYS - 1);
ok('🔴 the warning is ONE day out, not three', WARN_DAYS_BEFORE === 1);
// ⚠️ THE FIRST VERSION OF THIS ASSERTION GREPPED FOR "fourteen day" AND FAILED ON THE FILE'S OWN
// HEADER, which quotes the stale wording in order to explain the bug. A guard that forbids a file
// from describing its own history is a guard somebody deletes rather than fixes.
//
// So it checks the opposite and constructive thing: the reasoning must NAME the trial length that
// is actually in force. If TRIAL_DAYS moves again, the word goes stale and this goes red, which is
// the only outcome that makes somebody reread the file.
const WORDS = { 7: 'seven', 14: 'fourteen', 21: 'twenty one', 30: 'thirty' };
const lengthWord = WORDS[TRIAL_DAYS] ?? String(TRIAL_DAYS);
ok(`the file's own reasoning names the ${TRIAL_DAYS} day trial that is actually in force`,
  new RegExp(lengthWord, 'i').test(_rf(_path.join(_lib, 'trialnudge.ts'), 'utf8')));

ok('daysLeft counts whole days', daysLeft(inDays(3), NOW) === 3);
ok('the date is British, not an ISO string. He reads "27 July", not "2026-07-27T09:00:00Z".',
  humanDate('2026-07-27T09:00:00Z') === '27 July');
ok('the warn template carries the date', paramsFor('warn', trial({ current_period_end: '2026-07-27T09:00:00Z' }))[0] === '27 July');
ok('the ended template carries nothing', paramsFor('ended', trial()).length === 0);
ok('warn uses lekhio_trial_ending', templateFor('warn') === 'lekhio_trial_ending');
ok('ended uses lekhio_trial_ended', templateFor('ended') === 'lekhio_trial_ended');

// ---------------------------------------------------------------------------------------------
// THE DAY SIX MESSAGE. One message, his money first, ours last.
// ---------------------------------------------------------------------------------------------
console.log('\nthe day six message: his week, and one sentence about ours');

const week = (over) => ({ income: 1240, expenses: 310, profit: 930, saved: 84, hasAnything: true, ...over });

const full = trialWeekMessage(week());
ok('it is titled as his week, not as our trial', full.subject === TRIAL_WEEK_SUBJECT && /first week/i.test(full.subject));
ok('the figures lead', full.body.startsWith('£1,240 in, £310 out. That leaves £930.'));
ok('what we found him comes second', full.body.includes('We have found £84 you were not claiming.'));
ok('the trial sentence is last', full.body.trim().endsWith('Nothing gets deleted and your figures stay where they are.'));
ok('it says the trial ends tomorrow', full.body.includes('Your free trial ends tomorrow.'));

// 🔴 THE QUESTIONS DOOR IS THE LEKHIO CHATS ON THE WEB (31 July 2026). The one link the day six
// email carries points at /app/thread, the chats, built from NEXT_PUBLIC_APP_URL with the
// lekhio.app fallback. Never a domain we do not own: test/domain.test.mjs stands guard over that
// string repo wide, and this pins the target so the link cannot quietly point somewhere else.
const CHATS_URL = `${process.env.NEXT_PUBLIC_APP_URL || 'https://lekhio.app'}/app/thread`;
ok('the email invites questions into the Lekhio chats', /ask in your Lekhio chats/i.test(full.body));
ok('🔴 the link is the chats on the web, on our own domain', full.body.includes(CHATS_URL));
ok('🔴 never the domain we do not own', !/lekhio\.com/.test(full.body));
ok('the chats line sits before the trial sentence, which stays last',
  full.body.indexOf('/app/thread') < full.body.indexOf('Your free trial ends tomorrow.'));
ok('the source builds the link from NEXT_PUBLIC_APP_URL, never a bare string alone',
  /NEXT_PUBLIC_APP_URL/.test(_rf(_path.join(_lib, 'trialnudge.ts'), 'utf8')));

// 🔴 DOC 108: NEVER PRICE ON THE SAVING. "We found you £84, that is six months of Lekhio" is the
// obvious next sentence and it is forbidden. This is the one place the temptation actually lives.
ok('🔴 it never turns the saving into a pitch',
  !/months of|pays for itself|worth .* subscription|more than the cost|covers the/i.test(full.body));
ok('and it never mentions a price at all', !/£12\.99|£129|per month|a month/i.test(full.body));

// The saving line is OMITTED, never printed as a confident zero. Same rule the reveal learned.
ok('nothing found: the line is gone, not printed as £0',
  !trialWeekMessage(week({ saved: 0 })).body.includes('you were not claiming'));
ok('not confident enough to say: the line is gone too',
  !trialWeekMessage(week({ saved: null })).body.includes('you were not claiming'));
ok('but the figures and the trial sentence both survive that',
  trialWeekMessage(week({ saved: null })).body.includes('£1,240 in')
  && trialWeekMessage(week({ saved: null })).body.includes('ends tomorrow'));

// 🔴 THE HONEST EMPTY. A proud "£0 in, £0 out" on the single message of the whole trial reports our
// emptiness as if it were his week. The reveal learned this on 30 July.
const empty = trialWeekMessage(week({ income: 0, expenses: 0, profit: 0, saved: null, hasAnything: false }));
ok('🔴 an empty week says so plainly rather than printing zeros',
  empty.body.includes('nothing in your books yet') && !empty.body.includes('£0'));
// 🔴 31 JULY: THE BANK SENTENCE IS NOW BEHIND bankFeedOffered(), DEFAULT OFF, and this assertion
// was pinning the one message of the whole trial week at a door that does not open. TrueLayer
// declined production authorisation outright on 30 July and there is no other provider, so
// "connect your bank" was an instruction a customer could not carry out. The statement importer
// covers eleven UK banks and needs nobody's permission, so that is where the empty week points.
ok('and it points at a door that actually opens today',
  empty.body.includes('/app/money/upload') && !/connect your bank/i.test(empty.body));
ok('the empty version still says the trial ends tomorrow', empty.body.includes('ends tomorrow'));
ok('the empty version carries the same chats door', empty.body.includes('/app/thread'));

// A bad week is still his week, and the minus sign goes in front of the symbol.
const bad = trialWeekMessage(week({ income: 200, expenses: 640, profit: -440, saved: null }));
ok('a loss is shown honestly', bad.body.includes('That leaves -£440.'));

// The formatter is a deliberate local copy, because this module must load in a bare node test.
// It may not drift from lib/money.ts, so the two are compared directly.
ok('🔴 the money formatting matches lib/money.ts exactly', [0, 1, -1, 84, 1240, -440, 1234567].every((n) => {
  const m = trialWeekMessage(week({ income: n, expenses: 0, profit: 0, saved: null }));
  return m.body.includes(`${gbp0(n)} in,`);
}));

// ---------------------------------------------------------------------------------------------
// THE DAY AFTER.
// ---------------------------------------------------------------------------------------------
const ended = trialEndedMessage();
ok('the ended message exists and is titled plainly', ended.subject === TRIAL_ENDED_SUBJECT);
ok('it leads with his books being safe, before anything about money',
  ended.body.startsWith('Your trial has ended and your books are safe. Nothing has been deleted.'));
ok('it offers the card as the way back', /Add a card and it opens back up/.test(ended.body));
// 🔴 Gating the PRODUCT is fair. Implying we are holding HIS RECORDS is not, and would not be true.
ok('🔴 it never suggests we are holding his own records',
  !/locked|deleted your|we have your|held|hostage|cannot access your (books|records|data)/i.test(
    ended.body.replace('Nothing has been deleted.', ''),
  ));

// House style, every string a customer reads.
const ALL = [full.body, full.subject, empty.body, bad.body, ended.body, ended.subject];
ok('no em dashes or en dashes anywhere in the copy', ALL.every((s) => !/[–—]/.test(s)));

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

// The bank connect nudge. See lib/banknudge.ts for why it exists.
//
// The thing these tests actually protect: we must never offer a bank connection we
// cannot deliver, and we must never tell a user the product is broken when it is
// not. Both are one boolean away from being wrong.

import * as N from '../lib/banknudge.ts';

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

const OFFERABLE = { available: true, connected: false };
const CONNECTED = { available: true, connected: true };
const OFF = { available: false, connected: false };

console.log('\nBank connect nudge\n');

// --- shouldOfferBank -------------------------------------------------------
ok('offers when the feed works and they have not connected', N.shouldOfferBank(OFFERABLE) === true);
ok('does NOT offer when they already connected', N.shouldOfferBank(CONNECTED) === false);
ok('does NOT offer when the feed is not configured', N.shouldOfferBank(OFF) === false);

// 🔴 THE SECOND QUESTION, AND THE ONE THAT WAS GOING UNANSWERED. shouldOfferBank asks whether to
// offer a bank CONNECTION, which needs a provider. shouldOfferEasierRoute asks whether there is
// anything better than photographing every till slip, which is true with no provider at all,
// because the statement importer needs nobody. Both were being answered by the first function, so
// with `available` false the way out went unnamed on the one channel that reaches him in a van.
ok('there is always an easier route to name unless he has already connected',
  N.shouldOfferEasierRoute(OFF) === true && N.shouldOfferEasierRoute(OFFERABLE) === true);
ok('and none once he has connected, because it is being done for him',
  N.shouldOfferEasierRoute(CONNECTED) === false);
ok('does NOT offer when feed is off even if somehow connected', N.shouldOfferBank({ available: false, connected: true }) === false);

// --- busyMessage: OUR caps keep the honest "I am busy" ----------------------
for (const reason of ['kill_switch', 'global_daily_cap', 'global_monthly_cap']) {
  const m = N.busyMessage(reason, OFFERABLE);
  ok(`${reason} says we are busy, not that they hit a limit`, m.startsWith('I am a bit busy right now'));
  ok(`${reason} never pitches the bank (wrong moment, our fault)`, !m.includes('Connect your bank'));
}

// --- busyMessage: the USER's cap is not a fault -----------------------------
const userCap = N.busyMessage('user_daily_cap', OFFERABLE);
ok('user cap does NOT claim we are busy (that was the bug)', !userCap.includes('I am a bit busy'));
ok('user cap tells them nothing is lost', userCap.includes('Nothing is lost'));
ok('user cap tells them when to retry', userCap.includes('tomorrow'));
// 🔴 31 JULY: THE BANK SENTENCE IS NOW BEHIND bankFeedOffered(), DEFAULT OFF, AND THIS ASSERTION
// WAS HOLDING THE DEFECT IN PLACE. TrueLayer declined production authorisation on 30 July and
// Finexer want £650 a month, so there is nothing to connect to, and this line pinned a sentence
// that sent a man who had just been refused a receipt read at a door that does not open. It now
// pins BOTH sides: off, the way out has to be one he can take today; on, the old sentence returns.
ok('user cap names a way out he can take today', userCap.includes('Import a bank statement'));
ok('user cap never sends him at a bank we cannot connect', !userCap.includes('Connect your bank'));
process.env.BANK_FEED_OFFERED = 'true';
ok(
  'user cap offers the bank again the day the offer is switched back on',
  N.busyMessage('user_daily_cap', OFFERABLE).includes('Connect your bank'),
);
delete process.env.BANK_FEED_OFFERED;

const userCapConnected = N.busyMessage('user_daily_cap', CONNECTED);
ok('already connected: no pointless pitch', !userCapConnected.includes('Connect your bank'));
ok('already connected: reassures their bank is still logging', userCapConnected.includes('still being logged'));

const userCapNoFeed = N.busyMessage('user_daily_cap', OFF);
ok('feed off: NEVER offers a connection we cannot deliver', !userCapNoFeed.includes('Connect your bank'));
ok('feed off: still honest and reassuring', userCapNoFeed.includes('Nothing is lost'));

// --- the milestone nudge: at most once, only when useful --------------------
ok('milestone fires on exactly the 5th receipt', N.receiptMilestoneNudge(5, OFFERABLE) !== null);
ok('milestone does not fire on the 4th', N.receiptMilestoneNudge(4, OFFERABLE) === null);
ok('milestone does not fire again on the 6th (cannot nag)', N.receiptMilestoneNudge(6, OFFERABLE) === null);
ok('milestone does not fire on the 50th', N.receiptMilestoneNudge(50, OFFERABLE) === null);
ok('milestone silent when already connected', N.receiptMilestoneNudge(5, CONNECTED) === null);
// 🔴 THIS ASSERTION PINNED THE BUG. It read "milestone silent when the feed is not configured",
// and it was right when the only thing the nudge could say was "connect your bank". Then the
// fallback was written for exactly the no provider case, and this assertion went on holding the
// nudge silent so the fallback could never fire. A test that pins a feature shut is the same
// failure as test/walink.test.mjs pinning the welcome message at a door that had closed.
ok('🔴 the milestone DOES fire with no provider, and names the statement import',
  /import a bank statement/i.test(N.receiptMilestoneNudge(5, OFF) || ''));
ok('and it never names a bank connection when there is no provider to deliver one',
  !/connect your bank/i.test(N.receiptMilestoneNudge(5, OFF) || ''));
ok('milestone never fires at zero', N.receiptMilestoneNudge(0, OFFERABLE) === null);

// --- house style ------------------------------------------------------------
const allCopy = [
  N.bankOfferLine({ available: true, connected: false }),
  N.busyMessage('user_daily_cap', OFFERABLE),
  N.busyMessage('user_daily_cap', CONNECTED),
  N.busyMessage('user_daily_cap', OFF),
  N.busyMessage('kill_switch', OFF),
  N.receiptMilestoneNudge(5, OFFERABLE),
].join(' ');

ok('no em dashes, en dashes or minus signs anywhere in the copy', !/[–—−]/.test(allCopy));
ok('never claims we file or do their tax', !/we will file|we file your|do your tax/i.test(allCopy));
// 🔴 31 JULY: the offer is two sentences now, one per side of bankFeedOffered(). 'automatically'
// was specific to the feed. What this assertion was actually protecting is that the line names HIS
// benefit rather than our AI cost, and both sides have to keep doing that.
ok('the offer names the benefit, not our cost', N.bankOfferLine({ available: true, connected: false }).includes('no daily limit'));
process.env.BANK_FEED_OFFERED = 'true';
ok('and the bank version still names the benefit it always named', N.bankOfferLine({ available: true, connected: false }).includes('automatically'));
delete process.env.BANK_FEED_OFFERED;

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

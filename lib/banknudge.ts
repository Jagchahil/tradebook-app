// The bank connect nudge.
//
// WHY THIS EXISTS, IN MONEY.
//
// A receipt photo costs us an AI call, about 0.5p (Claude Vision). A bank
// transaction costs us NOTHING: it arrives through the feed and is categorised by
// the rules based vendor map in lib/categories.ts, with no model call at all. So a
// user who connects their bank is both cheaper to serve AND better served, because
// their money is logged whether or not they remember to photograph anything.
//
// That makes "connect your bank" the single highest leverage message in the whole
// product. See lib/margin.ts: the AI budget is the biggest variable cost we have,
// and every transaction that arrives by feed instead of by photo is one we do not
// pay for. It is the rare nudge where what is good for us and what is good for the
// user point the same way.
//
// WHAT THIS FIXES TODAY.
//
// The WhatsApp handler used ONE message for every reason the AI budget could
// refuse a request:
//
//   "I am a bit busy right now. Give me a few minutes and try again."
//
// That is true when OUR global cap or kill switch has tripped. It is a lie when the
// user has simply used up their own daily allowance, and it is the worst possible
// lie, because it tells someone whose receipt we just declined to read that the
// product is broken. Nothing is wrong. They hit a limit. And that moment, the
// instant they feel the limit, is exactly when connecting a bank is worth the most
// to them. So we tell the truth and offer the way out.
//
// This module is deliberately import free so it can be unit tested directly by the
// node test runner, which cannot resolve extensionless relative imports.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 31 JULY: EVERY SENTENCE BELOW POINTED AT A DOOR THAT DOES NOT OPEN.
//
// There is no bank provider. TrueLayer declined production authorisation outright on 30 July, and
// Finexer want £650 a month before a single connection, which we are not paying pre launch. So
// bankFeedOffered() went into lib/bankfeed.ts, default OFF, and every dead bank sentence in app/
// went behind it. These two did not, because they are copy in a lib rather than copy on a screen,
// and a grep for JSX found neither of them.
//
// The cost of leaving them is precisely measured: they fire at the exact moment a man has been
// refused something, which is the moment he is least able to shrug off being sent somewhere that
// does not exist. So when the offer is off the sentence names a door that opens TODAY. Importing a
// statement is the closest thing we have to a feed and it reads what eleven UK banks hand out
// (lib/statementimport.ts BANKS). When the offer comes back on, the old sentence returns unchanged.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// ⚠️ RE-DECLARED, NOT IMPORTED, for the reason in the paragraph above this one: an import of
// lib/bankfeed.ts would stop test/banknudge.test.mjs loading this file at all. It reads the SAME env
// var lib/bankfeed.ts bankFeedOffered() reads, at call time so no redeploy is needed, and only the
// exact string 'true' switches it on. test/wave9_nudges.test.mjs pins the two against each other so
// they cannot drift apart in silence.
function bankFeedOffered(): boolean {
  return process.env.BANK_FEED_OFFERED === 'true';
}

// Why the AI budget refused. Mirrors SpendReason in lib/aicost.ts.
export type AiBlockReason =
  | 'kill_switch'
  | 'global_daily_cap'
  | 'global_monthly_cap'
  | 'user_daily_cap';

export interface BankState {
  // The bank feed is actually configured and usable on the server right now.
  // This is hasBankFeedConfig(), NOT the marketing flag: we must never offer a
  // connection we cannot deliver.
  available: boolean;
  // This user already has a linked bank connection.
  connected: boolean;
}

// True when it is honest and useful to offer a bank connection: the feed works,
// and they have not already connected one.
export function shouldOfferBank(bank: BankState): boolean {
  return bank.available && !bank.connected;
}

// 🔴 A DIFFERENT QUESTION, AND CONFLATING THE TWO MADE THE FALLBACK UNREACHABLE.
//
// "Should we offer him a bank CONNECTION" needs the feed to work. "Should we tell him there is a
// better way than photographing every till slip" does not, because the statement importer at
// /app/money/import needs no provider, no consent flow and nothing from anybody.
//
// Both questions were being answered by shouldOfferBank, so with no provider `available` is false,
// and the two places that name a way out went quiet at once. The daily cap reply became "that is
// everything I can read for you today" WITH NO WAY OUT NAMED, and the five receipt nudge stopped
// firing entirely. The fallback copy sitting right there in bankOfferLine, written precisely for
// the no provider case, could never be reached by the channel it was written for.
//
// He is only past helping if he has ALREADY connected a bank, because then it is being done for
// him and there is nothing better to point at.
export function shouldOfferEasierRoute(bank: BankState): boolean {
  return !bank.connected;
}

// The offer itself. One line, plain, no pressure, and it names the benefit in the
// user's terms rather than ours.
//
// The bank sentence returns with bankFeedOffered(); until then the fallback names the door that
// does the same job today, and the benefit is still put in his terms rather than ours.
// ⚠️ IT TAKES THE STATE NOW, AND BOTH HALVES HAVE TO AGREE BEFORE IT NAMES THE BANK. bankFeedOffered()
// is the marketing switch and bank.available is hasBankFeedConfig(), which is whether the server can
// actually deliver one. Offering a connection on the strength of the switch alone is how a live
// signup ended up at a provider's "do not enter your bank credentials" banner on 31 July.
export function bankOfferLine(bank: BankState): string {
  return bankFeedOffered() && bank.available
    ? 'Want to stop hitting this? Connect your bank in the Lekhio app. Every payment in and out gets logged for you automatically, with no daily limit and no photos to remember.'
    : 'Want to stop hitting this? Import a bank statement in the Lekhio app, under Money. A whole month of spending lands in one go, with no daily limit and nothing to photograph.';
}

// The message we send when the AI budget refuses a request.
//
// The split matters. A global cap or the kill switch is OUR problem and the honest
// answer is "I am busy". The user's own daily cap is not a fault at all, and
// saying "I am busy" there is both untrue and alarming.
export function busyMessage(reason: AiBlockReason, bank: BankState): string {
  if (reason !== 'user_daily_cap') {
    // Our side. Keep it short, take the blame, promise nothing is lost.
    return 'I am a bit busy right now. Give me a few minutes and try again. Nothing is lost.';
  }

  const capped = 'That is everything I can read for you today. Nothing is lost. Send it again tomorrow and I will log it.';

  if (shouldOfferEasierRoute(bank)) {
    return `${capped}\n\n${bankOfferLine(bank)}`;
  }

  if (bank.connected) {
    // They already did the right thing. Reassure rather than nag: anything that
    // moved through the bank is already logged, cap or no cap.
    return `${capped}\n\nAnything paid by card or bank is still being logged for you automatically in the meantime.`;
  }

  return capped;
}

// A gentle nudge for people who are getting real value out of photos but have not
// connected a bank. Fires ONCE, on the nth receipt of a day, so it can never
// become nagging: at most one line, at most once per day, and only for people who
// are clearly active.
export const NUDGE_AFTER_RECEIPTS = 5;

export function receiptMilestoneNudge(receiptsToday: number, bank: BankState): string | null {
  // shouldOfferEasierRoute, not shouldOfferBank. See the note on that function: this nudge exists
  // to tell a man photographing his fifth receipt of the day that he does not have to, and that is
  // true with or without a provider. Gating it on the feed silenced it in exactly the months the
  // feed does not exist, which is now.
  if (!shouldOfferEasierRoute(bank)) return null;
  if (receiptsToday !== NUDGE_AFTER_RECEIPTS) return null;
  return bankFeedOffered() && bank.available
    ? 'That is five receipts today. You do not have to keep doing this. Connect your bank in the Lekhio app and anything you pay by card or transfer is logged for you the moment it happens.'
    : 'That is five receipts today. You do not have to keep doing this. Import a bank statement in the Lekhio app, under Money, and everything you paid by card or transfer lands in your books in one go.';
}

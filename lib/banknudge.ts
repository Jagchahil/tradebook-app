// The bank connect nudge.
//
// WHY THIS EXISTS, IN MONEY.
//
// A receipt photo costs us an AI call, about 0.5p (Claude Vision). A bank
// transaction costs us NOTHING: it arrives through the feed and is categorised by
// the rules based CATEGORY_MAP in lib/bankfeed.ts, with no model call at all. So a
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

// The offer itself. One line, plain, no pressure, and it names the benefit in the
// user's terms rather than ours.
export function bankOfferLine(): string {
  return 'Want to stop hitting this? Connect your bank in the Lekhio app. Every payment in and out gets logged for you automatically, with no daily limit and no photos to remember.';
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

  if (shouldOfferBank(bank)) {
    return `${capped}\n\n${bankOfferLine()}`;
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
  if (!shouldOfferBank(bank)) return null;
  if (receiptsToday !== NUDGE_AFTER_RECEIPTS) return null;
  return 'That is five receipts today. You do not have to keep doing this. Connect your bank in the Lekhio app and anything you pay by card or transfer is logged for you the moment it happens.';
}

// The same purchase, twice.
//
// A tradesperson buys cable at Screwfix on the card. Two things then happen:
//
//   1. The bank feed brings in the card payment, usually the same day.
//   2. That evening he photographs the receipt and sends it on WhatsApp.
//
// One purchase. Two entries. His costs are now inflated, his profit understated,
// and his tax bill is wrong in the other direction from the child tax credit.
//
// WHAT WAS ACTUALLY BROKEN, AND IT WAS THREE THINGS.
//
// 1. THE DEDUPE ONLY WORKED IN THE RARE DIRECTION. banksync skipped a bank line if
//    a matching WhatsApp capture already existed. But the bank feed is usually
//    FIRST (same day) and the photo comes later that evening. In that order nothing
//    was checked at all, and both rows were kept.
//
// 2. THE SAFETY NET WAS BLIND TO IT. The duplicate rule in lib/anomaly.ts keys on
//    the raw vendor string. The bank says "SCREWFIX 1234 LONDON"; the receipt says
//    "Screwfix". Different strings, so the one check meant to catch this never
//    fired on the case that matters.
//
// 3. WHEN IT DID MATCH, THE WRONG ONE WON. It dropped the BANK line, which carries
//    the exact amount and the exact date, and kept the photo, whose amount came out
//    of an OCR guess.
//
// THE RULE THAT FALLS OUT OF THAT: keep ONE entry, take the BANK's figures (they are
// facts, not readings), and keep the RECEIPT's evidence (the image, and the category
// the user actually chose). Nobody has to do anything.
//
// Import free, so the node runner can test it directly.

// Money must match within a penny. Card and receipt totals are the same number, and
// anything looser starts merging a £40 fill up with a different £40 fill up.
const PENCE_TOLERANCE = 0.02;

// A card payment settles a day or two after the receipt is printed, and a man does
// not always photograph it the same evening. Three days each way covers a weekend.
const DAYS_TOLERANCE = 3;

// Beyond this, two identical amounts at the same shop are more likely to be two
// genuine visits than one purchase counted twice.
const MAYBE_DAYS_TOLERANCE = 6;

export interface Entry {
  id?: string;
  vendor?: string | null;
  amount?: number | null;
  transaction_date?: string | null;
  source_type?: string | null;
}

export type MatchStrength =
  // Same money, same shop, same few days. One purchase. Merge it and say so.
  | 'same'
  // Same money and about the right time, but we cannot vouch for the shop. Ask.
  | 'maybe'
  // Not the same thing.
  | 'no';

function daysApart(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const t1 = new Date(`${String(a).slice(0, 10)}T00:00:00Z`).getTime();
  const t2 = new Date(`${String(b).slice(0, 10)}T00:00:00Z`).getTime();
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return null;
  return Math.abs(t1 - t2) / 86400_000;
}

// How sure are we that these two rows are one purchase?
//
// `key` is normaliseVendor from lib/memory.ts, passed in rather than imported so
// this module stays import free and so the two can never drift apart: the SAME
// normalisation that lets us learn "screwfix" is what lets us match it.
export function matchStrength(
  a: Entry,
  b: Entry,
  key: (v: string | null | undefined) => string,
): MatchStrength {
  const amtA = Number(a.amount ?? NaN);
  const amtB = Number(b.amount ?? NaN);
  if (!Number.isFinite(amtA) || !Number.isFinite(amtB)) return 'no';

  // Money out is money out. A refund and a purchase of the same size are not the
  // same event, so the sign must agree.
  if (Math.sign(amtA) !== Math.sign(amtB)) return 'no';
  if (Math.abs(Math.abs(amtA) - Math.abs(amtB)) > PENCE_TOLERANCE) return 'no';

  const days = daysApart(a.transaction_date, b.transaction_date);
  if (days === null) return 'no';

  const keyA = key(a.vendor);
  const keyB = key(b.vendor);

  // The confident case: same shop, same money, within a few days.
  if (keyA && keyA === keyB && days <= DAYS_TOLERANCE) return 'same';

  // BOTH shops are known and they are DIFFERENT. That settles it: two different
  // shops charging the same amount on the same day is a coincidence, not a
  // duplicate, and £84.30 at Screwfix has nothing to do with £84.30 at Toolstation.
  //
  // This deserves its own branch. Without it the code below would call them a
  // "maybe" purely because the money and the date lined up, and the user would be
  // asked to adjudicate a question with an obvious answer, over and over.
  if (keyA && keyB && keyA !== keyB) return 'no';

  // So we are here only when at least one shop is UNKNOWN: an unreadable bank
  // descriptor, or a receipt whose merchant did not come out of the photo. Same
  // money, right sort of time, but we genuinely cannot tell.
  //
  // Do NOT merge on our own. Merging two real purchases would quietly delete one of
  // his costs and raise his tax bill, and he would never know we had done it. Ask.
  if (days <= MAYBE_DAYS_TOLERANCE) return 'maybe';

  return 'no';
}

// Find the entry in `existing` that this new one duplicates, if any.
// Returns the best match: a confident one beats a possible one.
export function findDuplicate(
  incoming: Entry,
  existing: Entry[],
  key: (v: string | null | undefined) => string,
): { match: Entry; strength: MatchStrength } | null {
  let maybe: Entry | null = null;

  for (const e of existing) {
    if (e.id && e.id === incoming.id) continue; // never match a row against itself
    const s = matchStrength(incoming, e, key);
    if (s === 'same') return { match: e, strength: 'same' };
    if (s === 'maybe' && !maybe) maybe = e;
  }

  return maybe ? { match: maybe, strength: 'maybe' } : null;
}

// What the merged row should say.
//
// THE BANK WINS ON FIGURES. Its amount and date are facts: the money left the
// account, on that day, for that many pence. A receipt's amount came from reading a
// photograph, and a receipt's date is the date printed on the paper, which is not
// always the date the card was charged.
//
// THE RECEIPT WINS ON MEANING. It carries the image (the evidence HMRC would want)
// and, if the user picked one, the category they actually chose.
//
// So we take the truth from one and the meaning from the other, and there is one
// entry left, which is the right number of entries.
export interface Merged {
  amount: number;
  transaction_date: string;
  vendor: string;
  category: string | null;
  receipt_url: string | null;
}

export function merge(bank: Entry & { category?: string | null }, receipt: Entry & { category?: string | null; raw_input_url?: string | null }): Merged {
  return {
    // Facts, from the bank.
    amount: Number(bank.amount ?? receipt.amount ?? 0),
    transaction_date: String(bank.transaction_date ?? receipt.transaction_date ?? '').slice(0, 10),
    // A receipt names the shop properly. A bank descriptor is full of terminal ids.
    vendor: String(receipt.vendor || bank.vendor || '').trim(),
    // Meaning, from the receipt, falling back to whatever the bank line was given.
    category: receipt.category ?? bank.category ?? null,
    // The evidence.
    receipt_url: receipt.raw_input_url ?? null,
  };
}

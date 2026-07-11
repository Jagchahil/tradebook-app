// The brain. What Lekhio learns from the people using it.
//
// THE IDEA. Every correction a user makes is a lesson we should only ever have to
// learn once. They recategorise CITY ELECTRICAL from "other" to "materials". They
// tap "not business" on CHILD TAX CREDIT. They fix a category Claude guessed wrong.
// Today all of that is thrown away, and the next identical line gets guessed at from
// scratch. That is both worse for them and more expensive for us.
//
// TWO STORES, AND THEY MUST NOT BE CONFUSED.
//
//   user_rules       what THIS person taught us. "For me, CIRCLE K is fuel."
//                    Private, theirs, and it always wins.
//
//   vendor_patterns  what EVERYONE has taught us, as anonymous counts.
//                    "SCREWFIX -> materials, 8,412 people agree."
//                    NO user ids, NO amounts, NO personal data. An aggregate.
//                    A brand new user gets the benefit of every correction ever
//                    made, on day one, without a single AI call.
//
// WHAT THIS IS HONESTLY WORTH, WITHOUT OVERCLAIMING.
//
// It does NOT make receipt photos free: reading a total off a photo needs vision,
// and always will. What it does is let the BANK FEED get good without ever adding
// an AI call to it. Today an unrecognised bank line becomes "other", and the only
// way to do better would be to ask Claude about every line, which would destroy the
// one property that makes bank capture worth pushing (a bank transaction costs us
// nothing, see lib/margin.ts). The learning store lets us be accurate AND free, so
// we can keep driving people to the cheap channel instead of the expensive one.
//
// And it compounds. The longer someone stays, the more of their books are known
// vendors, and the less we ever have to guess.
//
// Import free, so the node runner can test it directly.

// --- normalising a vendor -----------------------------------------------------
//
// Bank descriptors are filthy. The same shop arrives as:
//
//   "SCREWFIX 1234 LONDON"      "SCREWFIX DIRECT LTD"       "SCREWFIX.COM"
//   "AMAZON INT'L*RT4G9"        "AMZNMKTPLACE"              "AMAZON.CO.UK"
//   "CARD PAYMENT TO SHELL"     "SHELL 4471"                "SHELL SERVICE STN"
//
// If the key does not survive that, nothing is ever learned twice and the whole
// store is useless. So we strip the noise banks add and keep the name.

// Words banks bolt on that say nothing about the merchant.
const NOISE = new Set([
  'card', 'payment', 'purchase', 'to', 'from', 'via', 'ref', 'reference',
  'ltd', 'limited', 'plc', 'llp', 'uk', 'gb', 'co', 'com', 'inc', 'the',
  'contactless', 'debit', 'credit', 'transfer', 'direct', 'dd', 'so',
  'online', 'store', 'shop', 'services', 'service', 'stn', 'branch',
  'int', 'intl', 'international', 'group', 'holdings', 'trading',
]);

// The town the card was used in tells us nothing about the merchant, and if we keep
// it, "SCREWFIX LONDON" and "SCREWFIX LEEDS" become two different shops and nothing
// is ever learned twice. Not exhaustive, and it does not need to be: an unstripped
// town just means we learn nothing from that line, which costs nothing.
const PLACES = new Set([
  'london', 'manchester', 'birmingham', 'leeds', 'liverpool', 'sheffield',
  'bristol', 'glasgow', 'edinburgh', 'cardiff', 'belfast', 'newcastle',
  'nottingham', 'leicester', 'coventry', 'bradford', 'stoke', 'wolverhampton',
  'plymouth', 'southampton', 'portsmouth', 'reading', 'derby', 'luton',
  'northampton', 'norwich', 'swindon', 'hull', 'preston', 'york', 'oxford',
  'cambridge', 'brighton', 'bolton', 'blackpool', 'middlesbrough', 'sunderland',
  'swansea', 'aberdeen', 'dundee', 'ipswich', 'exeter', 'gloucester', 'watford',
  'slough', 'crawley', 'basildon', 'chelmsford', 'colchester', 'cleveleys',
]);

export function normaliseVendor(raw: string | null | undefined): string {
  if (!raw) return '';

  const cleaned = String(raw)
    .toLowerCase()
    // Strip everything after a * or #: banks put terminal ids and refs there.
    .replace(/[*#].*$/, ' ')
    // Store numbers and card refs.
    .replace(/\b\d{2,}\b/g, ' ')
    // Punctuation to spaces, keeping letters, digits and & (B&Q, O2).
    .replace(/[^a-z0-9&]+/g, ' ')
    .trim();

  const words = cleaned
    .split(/\s+/)
    .filter((w) => w && !NOISE.has(w) && !PLACES.has(w))
    // A stray single letter is debris from a stripped reference, never a name.
    .filter((w) => w.length > 1);

  if (words.length === 0) return '';

  // TWO words, and this choice is deliberate.
  //
  // One word would be neater: "SCREWFIX 1234 LONDON" and "SCREWFIX LTD" would both
  // key on "screwfix" with no place list needed. But it also collapses vendors that
  // are NOT the same. "CIRCLE K" (a filling station) and "CIRCLE UK TRADING REFUND"
  // would both become "circle", and a lesson taught about one would be applied to
  // the other. The books would then be confidently wrong.
  //
  // The two failure modes are not equal:
  //
  //   a MISS  (the key does not match, so we learn nothing from that line)
  //           costs nothing. We fall through to the ordinary categoriser.
  //
  //   a COLLISION (two different merchants share a key)
  //           writes the wrong category into someone's books, silently, and they
  //           have no reason to doubt it.
  //
  // So we fail towards missing. Two words, with the noise and the town stripped
  // first so the real name survives.
  return words.slice(0, 2).join(' ');
}

// --- what we know -------------------------------------------------------------

export interface UserRule {
  vendor_key: string;
  category: string | null;
  is_personal: boolean | null;
  hits: number;
}

export interface VendorPattern {
  vendor_key: string;
  category: string;
  votes: number;
}

// A global pattern is only trusted once enough DIFFERENT people have taught it.
// Below this we do not use it, which also means a pattern can never be traced back
// to one person's books.
export const MIN_VOTES_TO_TRUST = 3;

export type KnowledgeSource = 'user' | 'crowd' | 'none';

export interface Knowledge {
  category: string | null;
  isPersonal: boolean | null;
  source: KnowledgeSource;
}

// What do we already know about this vendor, for this person?
//
// ORDER MATTERS AND IS NOT NEGOTIABLE:
//
//   1. What THEY taught us. Always wins. A plumber who books CIRCLE K as fuel and
//      a decorator who books it as meals are BOTH right, about their own business,
//      and the crowd must never overrule either of them.
//   2. What the crowd taught us, once enough people agree.
//   3. Nothing. Fall through to the ordinary categoriser, and then to AI.
export function recall(
  vendor: string | null | undefined,
  rules: UserRule[],
  patterns: VendorPattern[],
): Knowledge {
  const key = normaliseVendor(vendor);
  if (!key) return { category: null, isPersonal: null, source: 'none' };

  const mine = rules.find((r) => r.vendor_key === key);
  if (mine && (mine.category || mine.is_personal !== null)) {
    return {
      category: mine.category ?? null,
      isPersonal: mine.is_personal ?? null,
      source: 'user',
    };
  }

  // The crowd's best answer, if enough of them agree.
  const theirs = patterns
    .filter((p) => p.vendor_key === key && p.votes >= MIN_VOTES_TO_TRUST)
    .sort((a, b) => b.votes - a.votes)[0];

  if (theirs) {
    return { category: theirs.category, isPersonal: null, source: 'crowd' };
  }

  return { category: null, isPersonal: null, source: 'none' };
}

// --- what we learn ------------------------------------------------------------

export interface Lesson {
  vendorKey: string;
  category: string | null;
  isPersonal: boolean | null;
  // Whether this lesson should also be taught to the crowd. A category is a fact
  // about a merchant and is safe to pool. "Not business" is a fact about a PERSON,
  // not a merchant: one man's transfer to MR J SMITH is personal, another's is a
  // customer paying him. It stays private, always.
  shareable: boolean;
}

// Turn a correction into a lesson, or null when there is nothing to learn.
export function learn(input: {
  vendor: string | null | undefined;
  category?: string | null;
  isPersonal?: boolean | null;
}): Lesson | null {
  const vendorKey = normaliseVendor(input.vendor);
  if (!vendorKey) return null;

  const category = input.category ?? null;
  const isPersonal = input.isPersonal ?? null;
  if (category === null && isPersonal === null) return null;

  // "other" is not a lesson, it is the absence of one. Learning it would teach the
  // crowd to give up.
  const useful = category && category.toLowerCase() !== 'other' ? category : null;
  if (!useful && isPersonal === null) return null;

  return {
    vendorKey,
    category: useful,
    isPersonal,
    // Only a category is pooled, and only when the entry is NOT personal. We never
    // tell the crowd anything about someone's private life.
    shareable: Boolean(useful) && isPersonal !== true,
  };
}

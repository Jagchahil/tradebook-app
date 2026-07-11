// The pile. What a man sees the morning after he connects his bank.
//
// THE PROBLEM. A bank connect pulls ninety days. For a working tradesman that is two to three
// hundred lines, and the honest truth is that on day one we know almost nothing about him: no
// rules of his own, and CATEGORY_MAP is eight regexes covering about fifty of the big names. So
// most of it lands as "other", unconfirmed, waiting.
//
// THE OBVIOUS ANSWER IS THE WRONG ONE. A swipe deck over two hundred cards is a nicer way to
// ask two hundred questions, and eighty percent of the swipes are him rubber-stamping a thing
// we already knew. Doc 104: one less button at a time. A prettier button is still a button.
//
// TWO HUNDRED TRANSACTIONS IS NOT TWO HUNDRED DECISIONS. IT IS ABOUT TWENTY-FIVE VENDORS.
//
// He went to Screwfix fourteen times. That is ONE question. Answer it once and it covers all
// fourteen rows AND teaches a rule that files every future Screwfix payment for the rest of his
// life without asking. The pile collapses by an order of magnitude, and the collapsing is the
// product, not the swiping.
//
// So: group by vendor, sort by what is actually at stake, and hand him a short deck of real
// questions instead of a long deck of formalities.

// NO IMPORTS, ON PURPOSE.
//
// The node test runner loads these lib files directly, so a sibling import breaks it. The
// grouping key comes from normaliseVendor in lib/memory.ts, and I am NOT copying that function
// in here: two definitions of the same fact is precisely the bug that broke the undo tonight
// (TX_COLS and TX_SELECT drifted, and the detail screen went blind to is_personal).
//
// So it is passed in. The caller supplies the real normaliser, and so does the test, which
// means the real one is what gets tested.
export type KeyOf = (vendor: string) => string;

export interface PileEntry {
  id: string;
  vendor: string | null;
  description?: string | null;
  amount: number;            // negative = money out
  category: string | null;
  looks_personal?: boolean | null;
}

export type GroupKind =
  // He has never told us, and it does not smell of anything. A plain question.
  | 'ask'
  // It smells like a benefit, a refund, a bet, a transfer from a person. NEVER bulk confirmed.
  | 'careful'
  // Money IN. Always its own question, never bundled with the spending.
  | 'income';

export interface PileGroup {
  key: string;               // the normalised vendor, and the rule we would learn
  vendor: string;            // what to actually print
  kind: GroupKind;
  count: number;
  total: number;             // absolute pounds across the group
  suggested: string | null;  // our best guess at the category, or null if we have none
  ids: string[];
  // Only for 'careful'. Why we think it might not be business money, in his words, not ours.
  reason?: string;
}

// One decision, many rows. The whole point.
//
// Groups come back in the order he should be asked, and the order is BY MONEY, because a man
// deciding what to spend his attention on should spend it where the money is. A single £3,400
// payment to a builders merchant matters more than eleven £4 coffees, and no amount of
// alphabetical tidiness changes that.
//
// The 'careful' ones come FIRST regardless. They are the ones that will cost him if he gets
// them wrong, and they are the ones he must not be able to rush past.
export function buildPile(entries: PileEntry[], keyOf: KeyOf): PileGroup[] {
  const map = new Map<string, PileGroup>();

  for (const e of entries) {
    const vendor = (e.vendor ?? '').trim() || 'Unknown';
    const key = keyOf(vendor) || vendor.toLowerCase();

    const kind: GroupKind = e.looks_personal ? 'careful' : e.amount >= 0 ? 'income' : 'ask';

    // The kind is part of the key. A refund FROM Screwfix and a purchase AT Screwfix are the
    // same shop and completely different questions, and answering one must never answer the
    // other.
    const id = `${kind}:${key}`;

    const existing = map.get(id);
    if (existing) {
      existing.count += 1;
      existing.total += Math.abs(e.amount);
      existing.ids.push(e.id);
      // A group only keeps a suggestion if EVERY row in it agrees. One row saying "materials"
      // and another saying "fuel" is not a group with a suggestion, it is a group with a
      // disagreement, and offering him one of the two as if it were settled is a small lie.
      if (existing.suggested && normCat(e.category) !== existing.suggested) {
        existing.suggested = null;
      }
      continue;
    }

    map.set(id, {
      key,
      vendor,
      kind,
      count: 1,
      total: Math.abs(e.amount),
      suggested: normCat(e.category),
      ids: [e.id],
    });
  }

  const groups = [...map.values()];

  const rank: Record<GroupKind, number> = { careful: 0, income: 1, ask: 2 };
  groups.sort((a, b) => {
    if (rank[a.kind] !== rank[b.kind]) return rank[a.kind] - rank[b.kind];
    return b.total - a.total; // biggest money first. His attention is the scarce thing.
  });

  return groups;
}

// "other" is not a category, it is the absence of one. Printing it as though it were a guess we
// were making ("Filed under other?") is worse than admitting we do not know.
function normCat(c: string | null): string | null {
  const t = (c ?? '').trim().toLowerCase();
  if (!t || t === 'other' || t === 'uncategorised') return null;
  return t;
}

// THE GUARD ON THE FAST PATH.
//
// This is the function that stands between "confirm two hundred things quickly" and a man's
// child tax credit landing in his taxable income.
//
// A fast confirm is only ever allowed over money going OUT, on a vendor that does not smell of
// anything, where we have an actual category to confirm. Everything else is asked one at a
// time, at his pace, with the reason on the screen.
//
// It fails towards asking. Always. Getting this wrong in the other direction is not a bad user
// experience, it is a wrong tax return with his name on it.
export function canBulkConfirm(group: PileGroup): boolean {
  if (group.kind !== 'ask') return false;      // never income, never anything that smells
  if (!group.suggested) return false;          // we have no answer, so there is nothing to agree to
  return true;
}

// What the deck actually costs him, so we can tell him the truth before he starts.
export interface PileSummary {
  entries: number;
  decisions: number;   // groups, i.e. the number of times he must actually think
  careful: number;
  income: number;
  totalOut: number;
}

export function summarisePile(groups: PileGroup[]): PileSummary {
  return {
    entries: groups.reduce((n, g) => n + g.count, 0),
    decisions: groups.length,
    careful: groups.filter((g) => g.kind === 'careful').length,
    income: groups.filter((g) => g.kind === 'income').length,
    totalOut: groups.filter((g) => g.kind === 'ask').reduce((n, g) => n + g.total, 0),
  };
}

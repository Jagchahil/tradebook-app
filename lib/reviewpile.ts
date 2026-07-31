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
import { matchesOwnName } from './personal';

export type KeyOf = (vendor: string) => string;

// What he told us this account is FOR, answered once when he connected it.
//
// 🔴 WHY THIS EXISTS. On 28 July 2026 the one tap confident pile went live and was pointed at a
// real personal account. It offered to file, in a single press: a holiday train, two holiday
// coffees as "meals", and three months of overdraft fees as "bank charges". Six personal costs into
// a man's tax figures, one tap, no second thought.
//
// The merchant did not lie. The ACCOUNT did. Nothing in the product knew whether it was looking at
// an account he trades through or one he lives out of, so it read every line as a business decision
// waiting to be classified.
//
// 'mixed' is the default and the honest one for a sole trader, who legally has no separation and
// often runs everything through one current account. null means we never asked, which is every
// connection made before this existed, and it is treated as 'mixed' so nothing changes under them.
export type AccountUse = 'business' | 'personal' | 'mixed';

export function readAccountUse(value: unknown): AccountUse {
  return value === 'business' || value === 'personal' ? value : 'mixed';
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE CATEGORIES A MERCHANT CAN ACTUALLY SETTLE.
//
// The one tap path rests on one claim: that knowing WHO he paid is enough to know it was business.
// For some categories that is true and obvious. Nobody buys plasterboard, a cement mixer or a bag
// of ballast for a holiday, so a builders merchant settles the question by itself.
//
// For others the merchant tells you almost nothing, because the answer lives in the CIRCUMSTANCE:
//
//   meals          Subsistence is where HMRC is strictest and most of it is not allowable for a
//                  sole trader. A coffee near home is not a business cost because it came from a
//                  coffee shop. Suggesting it confidently invites OVER claiming, which is exactly
//                  as wrong as the drawings bug and in the opposite direction.
//   travel         A tradesman between sites is claiming. The same man commuting, or on holiday in
//                  Montenegro, is not. Trainline cannot tell you which.
//   fuel           Business miles or the family car. The pump does not know.
//   bank charges   An overdraft fee on a personal current account is not a business cost.
//   phone/software A phone bill and a streaming subscription arrive looking identical.
//
// ⚠️ THIS LIST IS DELIBERATELY SHORT, AND ERRS TOWARDS ASKING. A category wrongly left off costs
// him one tap. A category wrongly left on costs him an over claim he did not make and cannot see.
// Growing it is a tax judgement, not a UI one.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const MERCHANT_SETTLES: readonly string[] = [
  'materials',
  'tools',
  'equipment',
  'workwear',
  'subcontractor',
  'waste',
  'stock',
];

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
// ⚠️ THE CATEGORISER IS OPTIONAL AND IT MATTERS MORE THAN IT LOOKS.
//
// buildPile does NOT categorise: the keyword map runs once at import in lib/banksync.ts and the
// answer is stored on the row. So when the map learns a merchant, every row already in the database
// keeps the answer an OLDER map gave it, for ever.
//
// That is not hypothetical. "Transport for London" was added to the travel rule on 28 July 2026,
// and every TfL row already imported still carried nothing, so the pile kept asking about a
// merchant we had just claimed to know. Passing the CURRENT categoriser in fixes them all on the
// next read, in memory, and writes nothing: the stored category still only changes when he confirms.
export function buildPile(
  entries: PileEntry[],
  keyOf: KeyOf,
  ownNames: string[] = [],
  categorise?: (text: string) => string,
): PileGroup[] {
  const map = new Map<string, PileGroup>();

  for (const e of entries) {
    const vendor = (e.vendor ?? '').trim() || 'Unknown';
    const key = keyOf(vendor) || vendor.toLowerCase();

    // ⚠️ TWO SOURCES FOR THE SAME FACT, AND BOTH ARE NEEDED.
    //
    // looks_personal is set on the ROW at import time, which is what the SQL in confirm_pile checks,
    // so it is the guard that actually holds. But it only ever applied to rows imported AFTER the
    // check existed, and the own name check is new. Reading it again here means a row already
    // sitting in the database is classified correctly the next time he opens the pile, rather than
    // waiting for a backfill nobody runs.
    const self = matchesOwnName(e.vendor, ownNames);
    const kind: GroupKind = (e.looks_personal || self) ? 'careful' : e.amount >= 0 ? 'income' : 'ask';

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
      if (existing.suggested && suggestionFor(e, categorise) !== existing.suggested) {
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
      suggested: suggestionFor(e, categorise),
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

// The category to show for one row: what was stored, or what the CURRENT map says when nothing
// useful was stored. Never overwrites a real stored answer, so a category he chose himself always
// wins over a keyword guess.
function suggestionFor(e: PileEntry, categorise?: (text: string) => string): string | null {
  const stored = normCat(e.category);
  if (stored) return stored;
  if (!categorise) return null;
  return normCat(categorise(`${e.vendor ?? ''} ${e.description ?? ''}`.trim()));
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
export function canBulkConfirm(group: PileGroup, accountUse: AccountUse = 'mixed'): boolean {
  if (group.kind !== 'ask') return false;      // never income, never anything that smells
  if (!group.suggested) return false;          // we have no answer, so there is nothing to agree to

  // 🔴 NOTHING IS EVER PRESUMED ON AN ACCOUNT HE TOLD US HE DOES NOT TRADE THROUGH.
  // He can still file anything here one at a time. What he cannot do is file a screenful of his own
  // life in one press because a merchant looked familiar.
  if (accountUse === 'personal') return false;

  // And only where the merchant genuinely settles it. See MERCHANT_SETTLES.
  return MERCHANT_SETTLES.includes(group.suggested);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE THREE PILES. Added 28 July 2026, after Jag sat with 44 real rows and did not finish them.
//
// One flat list asks the same question of every group, so the ones we are sure about cost him
// exactly as much attention as the ones we have never seen. On his feed that meant twenty cards
// each rendering a twenty four option dropdown, including for Transport for London.
//
// Three piles, because there are only ever three situations and they deserve different questions:
//
//   known    We recognise the merchant and have a category. The question is "is that right",
//            which is a yes, and a yes to twenty of them should be ONE tap.
//   unknown  We have never seen it. The useful first question is NOT which of twenty four
//            categories, it is "is this business at all", which clears most of a personal-heavy
//            feed without categorising anything.
//   careful  It smells: his own name, a benefit, a refund, a bet. Never bulk, always the reason.
//
// PURE, and here rather than on a page, because the phone app has to draw the same three piles or
// the two surfaces will disagree about how much work he has left.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export interface PilePartition {
  known: PileGroup[];
  unknown: PileGroup[];
  careful: PileGroup[];
  income: PileGroup[];
}

export function partitionPile(groups: PileGroup[], accountUse: AccountUse = 'mixed'): PilePartition {
  const out: PilePartition = { known: [], unknown: [], careful: [], income: [] };
  for (const g of groups) {
    if (g.kind === 'careful') out.careful.push(g);
    else if (g.kind === 'income') out.income.push(g);
    else if (canBulkConfirm(g, accountUse)) out.known.push(g);
    else out.unknown.push(g);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 HOW MANY QUESTIONS HE ACTUALLY HAS, IN ONE PLACE, BECAUSE THREE SCREENS ASK IT.
//
// The Overview, the money log and the pile itself all show a "waiting on you" number, and until
// 31 July 2026 each worked it out for itself as known + unknown + careful. All three agreed, and
// all three were wrong the same way: they left out MONEY IN, because the pile had no section for
// it and nothing could be done about it anyway.
//
// Then a real statement import landed six rows, two of them payments in, and every screen in the
// product said four. £420 of a man's income counted nowhere and shown nowhere. See the pile page
// and supabase/APPLY_2026-07-31_confirm_income.sql for the whole of it.
//
// The lesson is the one this codebase keeps relearning: a count derived at a call site is a rule
// that has to be got right again at the next call site, and the copy that drifts is the one he is
// looking at. So it lives here, where a test can run it, and the three screens ask.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
export function waitingCount(p: PilePartition): number {
  return p.known.length + p.unknown.length + p.careful.length + p.income.length;
}

// ⚠️ THE SERVER RECOMPUTES THIS. THE CLIENT NEVER SENDS A LIST OF IDS TO CONFIRM.
//
// "Confirm all the ones you are sure about" is the most dangerous button in the product: one tap
// files many rows. If the page posted the ids, a crafted post could file anything, including the
// careful ones the whole design exists to protect. So the page posts nothing but the intent, and
// the server works out what it was confident about from the same functions that drew the screen.
//
// Returns each group's id list with the category it will be filed under, so a caller can apply them
// and report honestly how many actually landed.
export function bulkConfirmPlan(
  groups: PileGroup[],
  accountUse: AccountUse = 'mixed',
): Array<{ vendor: string; key: string; category: string; ids: string[] }> {
  return partitionPile(groups, accountUse).known.map((g) => ({
    vendor: g.vendor,
    key: g.key,
    // canBulkConfirm already guarantees a suggestion exists, so this is never the empty string.
    category: g.suggested as string,
    ids: g.ids,
  }));
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

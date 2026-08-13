// WHICH STREAM A COST BELONGS TO, AND THE ONE MISSING DOOR THAT MADE THE ENGINE LOOK WRONG.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 MONEY IN HAD A PROPERTY LANE. MONEY OUT NEVER DID. RUN 2, 12 August 2026.
//
// This is the whole of it, and it is worth stating plainly because the symptom looked like a broken
// tax engine and the tax engine was never broken.
//
// Everything needed to treat a landlord correctly was already here and already right:
//
//   lib/propertyengine.ts   the full Section 24 reducer, capped three ways, with the carry forward,
//                           the allowance exclusivity (with GOV.UK quoted in a red comment), no NI
//                           on rent, and the 2027/28 rates already loaded.
//   lib/yeartodate.ts       routes on income_type === 'property' and, inside that branch, splits
//                           mortgage interest OUT of ordinary expenses because "they get the
//                           Section 24 credit, not a deduction".
//   lib/incomeproof.ts      the same treatment again for the document a lender reads.
//
// And NOTHING COULD EVER SET income_type = 'property' ON A COST. The only writers were the manual
// entry route's rent direction and the pile's "It was rent" button, both money IN. So:
//
//   her rents      reached the property stream          £3,800
//   her agent fees could only be filed as 'other'         £475  -> deducted against her TRADE
//   her BTL interest, filed under the product's own
//   'mortgage interest' category, still landed in trade £2,440  -> deducted IN FULL, at 26%
//
// The consequences all follow from that one missing door, and every one of them was reported as a
// separate bug: the property stream showing "£3,800 in, £0 out"; the £1,000 allowance being applied
// on top of full interest relief (which s783A forbids); Class 4 leaking 6% of every pound of
// interest and agent fee routed through the trade; the quarterly update misreporting both streams;
// and Ways to Save telling a landlord to log costs she had already logged, while correctly printing
// the sentence "mortgage interest (a 20% tax credit)" directly above the wrong arithmetic.
//
// ⚠️ SO THE FIX IS NOT IN THE ENGINE AND MUST NOT BE. Anyone reading the symptoms would reach for
// taxPosition. The correct change is a door on the way IN, and this file is that door's rulebook.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export type Stream = 'trade' | 'property';

// ⚠️ THESE ARE COSTS OF LETTING A PROPERTY, AND NOTHING ELSE IS.
//
// 'mortgage interest' was already in lib/categories.ts and already had no auto rule, on purpose,
// because a regex on "mortgage" sweeps up a man's own home. It keeps that property: he chooses it.
// The other three are new, and they are the three a residential landlord actually pays.
//
// 🔴 'insurance' IS NOT HERE AND THAT IS DELIBERATE. A florist with a flat above the shop has
// public liability AND landlord cover, and the word alone cannot tell them apart. Sorting it by
// guess would move real money between two streams taxed differently. It stays trade unless he
// files it as 'property repairs'... which he would not, so the honest answer is that landlord
// insurance needs its own category the day a customer asks for it, and until then it is his to
// place. A category we cannot assign correctly is worse than one we have not built.
export const PROPERTY_CATEGORIES = [
  'mortgage interest',
  'letting agent',
  'property repairs',
  'ground rent',
] as const;

export type PropertyCategory = (typeof PROPERTY_CATEGORIES)[number];

// The subset that is a FINANCE cost: relieved as a basic rate tax reducer under Section 24, never
// deducted. lib/propertyengine.ts's isResidentialFinanceCost already recognises these downstream by
// matching "mortgage" or "interest" in the category; this list is the authoritative version and the
// suite pins the two together so they cannot drift apart.
export const PROPERTY_FINANCE_CATEGORIES = ['mortgage interest'] as const;

function clean(c: string | null | undefined): string {
  return String(c ?? '').trim().toLowerCase();
}

export function isPropertyCategory(category: string | null | undefined): boolean {
  return (PROPERTY_CATEGORIES as readonly string[]).includes(clean(category));
}

export function isPropertyFinanceCategory(category: string | null | undefined): boolean {
  return (PROPERTY_FINANCE_CATEGORIES as readonly string[]).includes(clean(category));
}

/**
 * The stream a chosen category files into.
 *
 * ⚠️ DEFAULTS TO TRADE, ALWAYS. An unknown category is a trade cost, which is what every row in
 * this product has been until today, so nothing a customer has already filed moves by a penny when
 * this ships. Only the four names above route anywhere new.
 */
export function streamFor(category: string | null | undefined): Stream {
  return isPropertyCategory(category) ? 'property' : 'trade';
}

/**
 * Whether to offer the property categories at all.
 *
 * ⚠️ DOC 103'S TEST: NEVER ASK A QUESTION WITH ONE SENSIBLE ANSWER. A plumber in a van has no
 * property, so four extra rows in his category list are four decisions he has to read past to reach
 * the one he wants. The pile already draws its "It was rent" button this way and this is the same
 * gate for the same reason, so the two halves of the property story appear and disappear together.
 */
export function offerPropertyCategories(hasRentalStream: boolean): boolean {
  return hasRentalStream === true;
}

/**
 * The categories to draw, in order, for this customer.
 * Trade categories keep their existing order exactly; the property ones are appended as a group so
 * they read as a set rather than being scattered through a tradesman's cost sheet.
 */
export function categoriesFor(all: readonly string[], hasRentalStream: boolean): string[] {
  const trade = all.filter((c) => !isPropertyCategory(c));
  if (!offerPropertyCategories(hasRentalStream)) return [...trade];
  const property = all.filter((c) => isPropertyCategory(c));
  return [...trade, ...property];
}

// Said once, where a landlord chooses one of these, so the 20% credit is never a surprise on the
// return. Matches the wording lib/propertyengine.ts and Ways to Save already use.
export const FINANCE_COST_NOTE =
  'Mortgage interest on a residential let is not deducted like an ordinary cost. Since Section 24 '
  + 'it is relieved as a basic rate tax credit instead, so it is kept apart from your other '
  + 'property costs and applied at 20%.';

export const PROPERTY_STREAM_NOTE =
  'Filed against your property, kept separate from your trade. Rent carries no National Insurance, '
  + 'so keeping the two apart is what stops your Class 4 bill running high.';

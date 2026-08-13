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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE PROPERTY EAR. R2-F18, 13 August 2026.
//
// Rosa said, into her phone:
//
//   "The Okafors' rent came in yesterday, nine hundred and fifty. That's the flat upstairs, not
//    the shop."
//
// Whisper transcribed it perfectly. The stream disambiguation is IN HER WORDS, said unprompted,
// in the exact form a person uses when they know two things could be confused. It was filed as
// TRADE INCOME, and the pile's rent button rescued it one button later.
//
// Everything above this line routes on a CATEGORY he picked off a list. Nothing routed on what he
// SAID, and voice is the input this product tells people to use.
//
// ⚠️ IT MUST BE ABLE TO SAY NO, AND THAT IS THE HARD HALF. Rosa pays £1,400 a month of SHOP RENT to
// SO BLOOM PROPERTIES. That is a trade cost. An ear that hears "rent" and reaches for the property
// stream would take a florist's largest deductible expense out of her trade and put it against her
// rental income, which is worse than the bug it fixes: the money in case was rescued by a button on
// the next screen, and a misfiled cost is silent.
//
// So the rule is: a PROPERTY MARKER is required (a flat, a tenant, a let, upstairs, the property),
// and any TRADE MARKER in the same breath (the shop, the unit, the premises, the yard) refuses.
// "Not the shop" is a property sentence and "rent on the shop" is a trade one, and the difference
// is which noun the rent belongs to, not which words appear.
//
// ⚠️ AND IT ONLY EVER PROPOSES. Nothing here confirms anything: the row still lands unconfirmed and
// he still presses. What it changes is which stream the row is waiting in, so his rent stops
// arriving as trade income and needing a correction he did not know he had to make.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

// A let property, in the words people actually use. Deliberately narrow: every one of these names
// a dwelling or a tenant, not a payment.
const PROPERTY_MARKERS = [
  'the flat', 'my flat', 'flat upstairs', 'upstairs flat', 'the upstairs',
  'my tenant', 'the tenant', 'tenants', 'the tenancy',
  'buy to let', 'the let', 'my let', 'the rental', 'my rental',
  // ⚠️ 'the property' AND 'my property' ARE DELIBERATELY NOT HERE. They are the loosest phrases a
  // landlord uses and the likeliest to appear inside a PAYEE's name: "paid the property developers",
  // "the property management people". The sabotage pass surfaced it. Every other marker in this list
  // names a dwelling or a tenant and cannot be a company, so narrowing the list beats bolting
  // exceptions onto it, and the sentences a real landlord speaks are still caught by the rest.
  'rental property', 'the house i rent out', 'i rent out',
  'the maisonette', 'the bedsit', 'the annexe',
];

// The trade, in the same words. If one of these is what the money is about, it is not property,
// however much the sentence talks about rent.
const TRADE_MARKERS = [
  'the shop', 'my shop', 'shop rent', 'rent on the shop', 'the unit', 'my unit',
  'the premises', 'the yard', 'the workshop', 'the studio', 'the salon', 'the cafe',
  'the stall', 'the pitch', 'the lockup', 'the lock up', 'the storage unit', 'the warehouse',
];

// "not the shop" is a PROPERTY sentence: he is telling us which one it is not. So a trade marker
// that is negated does not refuse. Matched as its own phrase rather than by parsing the sentence,
// because parsing English negation is a bigger promise than this needs to make.
const NEGATED_TRADE = [
  'not the shop', 'not my shop', 'not the business', 'not for the shop', 'nothing to do with the shop',
  'not the unit', 'not the premises', 'not the yard', 'not the workshop',
];

function hay(text: string | null | undefined): string {
  return ` ${String(text ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ')} `;
}

/**
 * Did he say, in his own words, that this money is about a property he lets?
 *
 * Null when he said nothing either way, which is almost every message and must stay the default.
 * 'property' only when a property marker is present and no un-negated trade marker is.
 *
 * ⚠️ NULL IS NOT 'trade'. The caller keeps whatever it was going to do, so a message this function
 * has no opinion about behaves exactly as it did before this function existed.
 */
export function spokenStream(text: string | null | undefined): Stream | null {
  const h = hay(text);
  if (!h.trim()) return null;

  const saidProperty = PROPERTY_MARKERS.some((m) => h.includes(` ${m} `));
  if (!saidProperty) return null;

  // Blank out the negated forms first, so "that's the flat upstairs, not the shop" keeps its
  // property marker and loses its trade one.
  let rest = h;
  for (const n of NEGATED_TRADE) rest = rest.split(` ${n} `).join(' ');

  const saidTrade = TRADE_MARKERS.some((m) => rest.includes(` ${m} `));
  if (saidTrade) return null;

  return 'property';
}

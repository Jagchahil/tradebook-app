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
import { matchesOwnName, looksLikePerson } from './personal';
import { isUncertainAmount } from './receiptconfidence';
import { shouldAskCapital } from './capital';
// The three CIS rates and nothing else. They live in FACTS because Khoji watches FACTS against
// GOV.UK every night, and a rate typed into a second file is a rate that stays at last year's
// number after an approved change lands. lib/capital.ts reaches through the same door for the same
// reason, so this adds no file to the chain any suite already stages.
import { FACTS } from './taxengine';

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
  // Where the row came from. 'whatsapp_image' and 'web_image' mean a MACHINE read the amount off a
  // photograph and no human has ever checked it. See MACHINE_READ_SOURCES below.
  source_type?: string | null;
  // 🔴 HOW WELL THE MACHINE COULD SEE THE TOTAL, OR NULL BECAUSE IT WAS NEVER ASKED. R2, 13 Aug.
  // source_type above says the amount is a READING. This says whether the reading was taken off
  // paper anybody could make out. lib/receiptconfidence.ts owns what the number means, and null is
  // NOT "clear": it is every row written before the question existed.
  confidence_score?: number | null;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 A CATEGORY ANSWER ABOUT BANK ROWS CONFIRMED AN AMOUNT NOBODY HAD EVER SEEN. RUN 2, 12 Aug 2026.
//
// A deliberately faded receipt was read as £110.55. The paper says £118.55. The parser gave up no
// signal that it was unsure, so the row went into the pile looking exactly like every other row.
//
// It then joined the PORTERS group, which was mostly bank lines. She answered the group once, the
// way this product asks her to ("answer once for a shop and we will file every future payment there
// the same way"), and that single press about a CATEGORY confirmed a machine's guess at an AMOUNT.
// The Home feed afterwards reads "Filed PORTERS WHOLESALE FLOWERS as stock. £110.55 out", beside a
// receipt from the same evening still correctly marked "waiting for your yes".
//
// Two promises collided and the wrong one won:
//   "answer once for a shop"      is about the CATEGORY, and is a good promise.
//   "nothing counts until you
//    have said it is right"       is about the FIGURE, and it is the one that guards money.
//
// ⚠️ THE FIX IS TO KEEP THE TWO SOURCES APART, NOT TO SLOW EVERYTHING DOWN. A photograph and a bank
// line are different kinds of evidence: the bank's amount is a FACT and the photograph's is a
// READING. Putting them in one group means one press answers for both. So the source class is part
// of the group key now, exactly as `kind` already is, and for exactly the same reason: "A refund
// FROM Screwfix and a purchase AT Screwfix are the same shop and completely different questions,
// and answering one must never answer the other."
//
// The bulk confirm survives, because the founder quit at two files out of eight when this product
// made him work one at a time and that finding stands. A screenful of photographs can still be
// filed in one press. What can no longer happen is a photograph being filed by a press that was
// about something else.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const MACHINE_READ_SOURCES = ['whatsapp_image', 'web_image'] as const;

export function isMachineRead(sourceType: string | null | undefined): boolean {
  return (MACHINE_READ_SOURCES as readonly string[]).includes(String(sourceType ?? '').trim().toLowerCase());
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
  // Every row in here came off a photograph, so every AMOUNT in here is a reading rather than a
  // fact. The screen says so, and it never mixes with bank sourced rows. See MACHINE_READ_SOURCES.
  readFromPhoto: boolean;
  // Every AMOUNT in here was read off paper the machine itself said it struggled with. The screen
  // says so and asks him to look at the figure, and it never mixes with readings we are sure of,
  // for the same reason a reading never mixes with a bank line. See lib/receiptconfidence.ts.
  uncertainAmount: boolean;
  // 🔴 THE PAYEE IS A HUMAN BEING, SO THERE IS NO RULE TO LEARN ABOUT HIM. R2-F6, 13 August 2026.
  //
  // Three of Rosa's wedding customers collapsed into one asking group, and the product offered to
  // learn a standing rule about all three at once. The group is still worth having: one press for
  // three wedding payments is the kindness this screen exists for. The RULE is not, because
  // lib/memory.ts already wrote down why a key collision is the worse failure ("writes the wrong
  // category into someone's books, silently, and they have no reason to doubt it") and a rule is
  // exactly how that comes true, months later, on a household nobody has met.
  //
  // The key is NOT changed to fix this. vendor_rules.vendor_key IS that normalisation, and changing
  // it orphans every rule every customer has ever taught. See looksLikePerson in lib/personal.ts.
  personLike: boolean;
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

    // 🔴 THE SOURCE CLASS IS PART OF THE KEY, for the same reason `kind` is. See
    // MACHINE_READ_SOURCES above: a photograph's amount is a reading, a bank line's is a fact, and
    // one press must never answer for both.
    const read = isMachineRead(e.source_type);

    // 🔴 AND SO IS WHETHER WE COULD ACTUALLY READ IT. R2, 13 August 2026.
    //
    // The line above stops a photograph's amount riding a BANK ROW's press. It does not stop a
    // photograph we could barely read riding the press of a photograph we read perfectly, and a
    // florist with eight Porters receipts in one upload has exactly that shape. The faded £110.55
    // and a crisp £324.69 are both readings, both from the same shop, both money out: same group,
    // one press, and the £8 nobody can ever question again.
    //
    // ⚠️ ONLY AN EXPLICIT LOW SCORE SPLITS. Null means the model was never asked, which is every
    // row written before today, and those must group exactly as they always have.
    const unsure = isUncertainAmount(e.confidence_score);

    // R2-F6. A person is not a shop, and only a shop has a category worth remembering.
    const person = looksLikePerson(vendor);

    // The kind is part of the key. A refund FROM Screwfix and a purchase AT Screwfix are the
    // same shop and completely different questions, and answering one must never answer the
    // other.
    const id = `${kind}:${read ? 'read' : 'given'}${unsure ? ':unsure' : ''}:${key}`;

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
      readFromPhoto: read,
      uncertainAmount: unsure,
      personLike: person,
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

  // 🔴 AND NEVER A SINGLE PAYMENT BIG ENOUGH TO BE A VEHICLE, WHOEVER IT WAS PAID TO.
  //
  // "It fails towards asking. Always." Six lines up, and this is the case that proved it. A car is
  // excluded from the Annual Investment Allowance and cannot come off his profit in one go, and
  // the ONLY way the product can know a payment was a car is to ask him. A merchant we recognise
  // does not settle that question: a man can buy a car from anybody, and a £60,000 line to a
  // familiar name swept up in a screenful of one tap confirms is exactly the £52,000 error that
  // lib/capital.ts exists to stop. So it drops out of the fast path and gets asked on its own.
  //
  // ⚠️ THIS IS NOT A REFUSAL, IT IS A DETOUR. The group still appears, in the section where every
  // card gets its own question, with the car question defaulted to "Not a car". A man whose
  // £1,400 was a materials order answers it with the press he was going to make anyway.
  if (shouldAskCapital(group.total, group.count)) return false;

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
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 IT COUNTED FOUR OF THE SIX THINGS ON THE SCREEN. 12 August 2026.
//
// This is the number the Overview and the Money page put in front of him: "4 questions waiting".
// The pile draws SIX kinds of question, because the VAT confirm arrived on 1 August and the CIS
// capture on 11 August, and neither was added here. So a subcontractor read "4 questions" and
// counted five on the page, and a headline that disagrees with the screen underneath it teaches
// him to stop trusting both.
//
// ⚠️ THE EXTRAS ARE PASSED IN RATHER THAN DERIVED, because whether a row carries a VAT or CIS
// question is a fact about the MAN (is he registered, is he in the scheme) and this module cannot
// see him. Defaulting to zero keeps every existing caller identical to the penny, which is exactly
// what a customer with neither question should still read.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
export function waitingCount(p: PilePartition, extras = 0): number {
  return p.known.length + p.unknown.length + p.careful.length + p.income.length
    + Math.max(0, Math.trunc(extras) || 0);
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
): Array<{ vendor: string; key: string; category: string; ids: string[]; personLike: boolean }> {
  return partitionPile(groups, accountUse).known.map((g) => ({
    vendor: g.vendor,
    key: g.key,
    // canBulkConfirm already guarantees a suggestion exists, so this is never the empty string.
    category: g.suggested as string,
    ids: g.ids,
    // R2-F6. Carried through so the CALLER can decide whether there is a rule worth learning. The
    // plan says what to file; whether it also becomes a law about this payee is a separate question
    // and the answer is no when the payee is a person. See looksLikePerson in lib/personal.ts.
    personLike: g.personLike,
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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 CIS. WHAT THE CONTRACTOR TOOK OFF BEFORE THE MONEY EVER REACHED HIS BANK.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE INCIDENT, 11 AUGUST 2026. RUN 1 of the customer week, walked as a groundworker.
//
// 401 rows imported from a real year of statements. 62 of them were contractor payments totalling
// £34,400, and every one of those was booked as income at its bank value after a single yes and no
// question: is this money in yours. It is. That was never the question that mattered. £4,400 and
// £2,800 across two tax years had already gone to HMRC out of those payments, and neither figure
// existed anywhere in this product, because neither figure ever touched his account.
//
// So his turnover was understated by exactly the tax taken, on his return and on the document he
// hands a lender, and the tax already paid on his behalf was invisible, which is how the product
// came to tell a man to put money by that HMRC was already holding.
//
// 🔴 THE INVARIANT THE REST OF THE PRODUCT NOW RESTS ON, AND THE REASON cisCapture() EXISTS AT ALL:
//
//        transactions.amount IS THE GROSS.  transactions.cis_deduction IS THE TAX ALREADY PAID.
//
// handleCIS in the WhatsApp webhook has stored it that way since the beginning, and the optimiser,
// the proof of income, the quarter pack and the payments on account test all read it that way.
// Section 6 of test/moneyspine.test.mjs holds every one of them to it, so it is the live invariant
// of a launched product rather than a convention. Getting the two columns the wrong way round here
// would put a wrong figure into five surfaces in one press, so the patch this file returns is named
// after the columns it fills. A caller cannot swap them without renaming a field.
//
// ⚠️ IT BELONGS AT THE REVIEW STEP AND NOWHERE EARLIER. lib/statementimport.ts is a reader: it turns
// a CSV into rows and it is not allowed to invent a figure that is not on the statement. The man is
// present here, and he is the only one who knows.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const round2 = (n: number) => Math.round(n * 100) / 100;

// The most that can arithmetically sit behind a deposit, and it is a real ceiling rather than a
// guess: 30 percent is the highest rate in the scheme, so a deposit of £400 cannot have had more
// than £171.43 taken off it by anybody. Same shape as vatFromGross in lib/vat.ts, and it is here
// for the same reason: a page and a route that each work it out are two answers to one question.
export function cisCeiling(net: number): number {
  if (!Number.isFinite(net) || net <= 0) return 0;
  const rate = FACTS.cisUnregisteredRate;
  return round2((net * rate) / (1 - rate));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE PROPOSAL, AND WHY IT IS PRINTED AND NEVER PREFILLED.
//
// He knows the deposit. He often has the contractor's payment and deduction statement in the van,
// and he often does not. So the product does the arithmetic for him and shows it: £400 in the bank,
// at 20 percent on labour with no materials, is £100 taken and a £500 job. That is the whole of the
// help we can honestly give, and it saves him doing division up a ladder.
//
// ⚠️ IT IS NOT PUT IN THE BOX FOR HIM, AND OUR OWN FLAGSHIP CIS CUSTOMER IS THE PROOF.
//
// Danny, the fixture section 6 of test/moneyspine.test.mjs is built on, turned over £25,400 gross
// and had £4,400 taken. That is 17.3 percent of the job, not 20, because £3,400 of it was materials
// and materials come out BEFORE the deduction is worked out. Run the proposal on the £21,000 that
// actually reached his bank and it says £5,250 was taken and the job was £26,250. Both figures are
// wrong, both are wrong in the direction that overstates his turnover, and if the box had been
// prefilled he would have pressed the button and never seen it.
//
// lib/control.ts holds the standard this is measured against: NEVER TAKE A NUMBER WITHOUT A RECEIPT
// for proof of income or anything going to HMRC. A prefilled figure is a number with no receipt
// wearing his consent. So the box starts empty, the arithmetic sits next to it where he can read it
// and copy it if it is right, and nothing is ever stored that he did not put there himself.
//
// ⚠️ THE FIGURES AND THE TWO SENTENCES COME BACK TOGETHER OR NOT AT ALL. That is the lib/control.ts
// pattern, and it is the same argument: a proposed gross printed on its own reads as a fact about
// his job, and it is not one, it is arithmetic with an assumption inside it. There is deliberately
// no exported function that hands over the numbers bare.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
export interface CisProposal {
  // What actually hit the bank. His fact, from his statement, never touched.
  net: number;
  // What 20 percent on labour only would have been. A sum, not a claim.
  deduction: number;
  gross: number;
  // Why the sum above may be wrong for this payment, in his words.
  assumes: string;
  // The three rates, because there are three and flattening them to "20 percent" is how a man with
  // gross payment status is asked for a deduction that does not exist, and a man on 30 percent is
  // told a third of what was taken.
  rates: string;
}

export const CIS_ASSUMES =
  'That is 20 percent of the labour and nothing else. Materials, plant hire and any VAT come off '
  + 'the job before the deduction is worked out, so if there were any on this one, less was taken '
  + 'than that. The statement your contractor gives you has the figure he actually used.';

export const CIS_RATES =
  'How much comes off depends on where you stand with HMRC: 20 percent if you are registered for '
  + 'CIS, 30 percent if you are not, and nothing at all if you have gross payment status.';

export function cisProposal(net: number): CisProposal | null {
  if (!Number.isFinite(net) || net <= 0) return null;
  const rate = FACTS.cisRegisteredRate;
  const gross = round2(net / (1 - rate));
  return {
    net: round2(net),
    deduction: round2(gross - net),
    gross,
    assumes: CIS_ASSUMES,
    rates: CIS_RATES,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHICH PAYMENTS IN GET THE QUESTION, AND THE TWO GATES ON IT.
//
// ⚠️ CIS IS NOT A PROPERTY OF THE ROW, IT IS A PROPERTY OF THE MAN, so this is deliberately NOT a
// fourth GroupKind. A kind would have to be decided in buildPile, which sees a bank line and cannot
// know whether the payer was a contractor, and it would ripple through partitionPile, waitingCount,
// the pile page and the phone app for a fact none of them own. The kind stays 'income'. What
// changes is that a man who has told us he is paid under CIS is asked one more thing about it.
//
//   1. HE TOLD US. worksUnderCis in lib/circumstances.ts, and only an explicit yes counts. A false
//      returns an EMPTY LIST, which is the byte for byte guarantee: a man who is not in the scheme
//      sees precisely the pile he saw yesterday, with no extra sentence, no extra box and no extra
//      press. Doc 103: a question with one sensible answer is a question we do not ask.
//
//   2. THE ROW CAN CARRY THE ANSWER. pileEntries in lib/supabase.ts names its columns one by one,
//      and until it names cis_deduction the field arrives undefined however well this is written.
//      An undefined field means the answer would have nowhere to go, and asking a man for a figure
//      we then discard is the exact failure the vat_registered date made for two and a half weeks
//      (lib/circumstances.ts says so in capitals). So an undefined field draws NOTHING: no wrong
//      number, no broken screen, and no question he answers into a hole. It is the same shape the
//      VAT columns shipped in on 1 August 2026 and it is switched on by the same one line.
//
// And a row that already carries a deduction is never asked about again, because it has been
// answered somewhere else and asking twice teaches him we are not listening.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
export interface CisRow {
  id: string;
  vendor: string | null;
  amount: number;
  cis_deduction?: number | string | null;
}

export interface CisAsk {
  id: string;
  vendor: string;
  proposal: CisProposal;
}

export function cisToAsk(rows: CisRow[], underCis: boolean): CisAsk[] {
  if (!underCis) return [];
  const out: CisAsk[] = [];
  for (const r of rows) {
    // Money IN only. A cost has no CIS in it: the scheme takes from what a subcontractor is PAID.
    if (!(r.amount > 0)) continue;
    if (r.cis_deduction === undefined) continue;
    const already = r.cis_deduction === null ? 0 : Number(r.cis_deduction);
    if (Number.isFinite(already) && already > 0) continue;
    const proposal = cisProposal(r.amount);
    if (!proposal) continue;
    out.push({ id: r.id, vendor: (r.vendor ?? '').trim() || 'Unknown', proposal });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHAT GETS STORED, AND IT IS THE ONLY PLACE IN THE PRODUCT THAT WORKS IT OUT.
//
// The fields are named after the columns on purpose. `amount` is the gross and `cis_deduction` is
// the tax already paid, and a caller holding this object cannot put them in the wrong order without
// renaming a field, which is the one bug that would put a wrong figure into five surfaces at once.
//
// 🔴 THE DEPOSIT IS THE FIXED POINT. He types what was taken; the gross is DERIVED from the bank
// figure plus that. Never the other way round. A gross typed in by hand would let the two columns
// stop reconciling to the money that actually moved, and then no reader could tell which of the
// three numbers was the wrong one. amount minus cis_deduction is the deposit, always, to the penny.
//
// ⚠️ AN EMPTY BOX IS NOT A ZERO. Zero is a real answer, and a man with gross payment status should
// be able to give it, but he has to say it. An empty box is a man who has not answered, and reading
// it as nought taken would file the deposit as the whole job on his silence. Same rule as the VAT
// branch in app/api/pile/route.ts, and the same reason.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
export interface CisRowPatch {
  amount: number;
  cis_deduction: number;
}

export function cisCapture(net: number, typed: string | number): CisRowPatch | null {
  if (!Number.isFinite(net) || net <= 0) return null;
  // A pound sign and a stray comma are him typing what he can see on the statement, not him being
  // wrong. Everything else is refused rather than coerced.
  const cleaned = String(typed ?? '').trim().replace(/[£,\s]/g, '');
  if (cleaned === '') return null;
  const taken = Number(cleaned);
  if (!Number.isFinite(taken) || taken < 0) return null;
  // Nothing above the 30 percent ceiling can be true of any subcontractor in the scheme, and a
  // figure typed one digit long would otherwise raise his turnover for ever on one press.
  if (taken > cisCeiling(net)) return null;
  return { amount: round2(net + taken), cis_deduction: round2(taken) };
}

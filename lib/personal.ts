// Is this actually business money?
//
// WHY THIS EXISTS. A REAL BUG, FOUND IN REAL BOOKS.
//
// The bank feed categoriser has a fallback: anything it cannot identify becomes
// "other" if it is money out, and "income" if it is money in. That is a reasonable
// GUESS. It became a dangerous FACT the moment the entry was confirmed, because
// every tax figure we produce sums confirmed entries.
//
// The first real set of books we looked at contained, all counted as trading income:
//
//   CHILD TAX CREDIT          +£345.13
//   CIRCLE UK TRADING REFUND   +£50.59
//   MR JOHN SMITH             +£137.60
//
// A child tax credit is a benefit. A refund is money coming back. A transfer from a
// person is probably not a job. None of it is self employed income, and all of it
// was inflating the profit we were about to calculate tax on.
//
// "Lekhio told me I owed tax on my child benefit" is the worst sentence that could
// ever be written about this product. So: we detect it, we tell the user plainly,
// and THEY decide. We never silently reclassify someone's money. The approval gate
// is the whole product.
//
// This module is deterministic and import free: no AI, no cost, and directly
// testable. It only ever SUGGESTS.

export type PersonalReason =
  // Money moving between his OWN accounts. The most confident call in this file, because it is the
  // only one we do not have to infer from the shape of a word: we know his name.
  | 'self'
  | 'benefit'
  | 'refund'
  | 'gambling'
  | 'transfer'
  | 'savings'
  | 'loan';

export interface PersonalHit {
  reason: PersonalReason;
  // Shown to the user, in their words, so they can judge it in one read.
  why: string;
}

// State benefits and tax credits. Not income from work, and never taxable as
// trading profit.
const BENEFIT = /\b(child tax credit|working tax credit|universal credit|child benefit|dwp|pip payment|personal independence|carers? allowance|jobseeker|jsa\b|esa\b|attendance allowance|housing benefit|state pension|pension credit|maternity allowance)\b/i;

// Money coming back is not money earned. Counting a refund as income taxes the
// user on their own money.
const REFUND = /\b(refund|refunded|reversal|reversed|chargeback|cashback|rebate|returned payment)\b/i;

// Gambling. Winnings are not taxable and stakes are not an expense, so neither
// side of it belongs in the books at all.
const GAMBLING = /\b(bet365|betfair|paddy ?power|william hill|ladbrokes|sky ?bet|coral\b|betfred|bwin|pokerstars|casino|lottery|camelot|national lottery)\b/i;

// Moving your own money about is not a transaction. It is the same money twice.
const SAVINGS = /\b(savings|isa\b|vault|pot transfer|round ?up|monzo pot|moneybox|plum\b|chip\b)\b/i;

// Personal lending and borrowing.
const LOAN = /\b(loan repayment|klarna|clearpay|laybuy|zilch|afterpay)\b/i;

// A payment to or from a person, rather than a business. Matches "MR JOHN SMITH",
// "MRS A PATEL", "MISS J O'BRIEN". Deliberately narrow: a title is required, so a
// sole trader trading under their own name is not swept up by accident.
const PERSON_NAME = /\b(mr|mrs|miss|ms|dr)\.? [a-z]/i;

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 HIS OWN NAME. Found 28 July 2026, on Jag's real second account, on the live site.
//
// The pile put a card at the top reading "Jag, £496, money out" with a blue File it button under
// it. That is a transfer to his own account. Drawings are not a business expense, so filing it
// takes £496 off his taxable profit that should not come off, which UNDERSTATES his tax. Of the two
// directions to be wrong in, that is the dangerous one, and it is the one a man does not notice
// because the number moved in his favour.
//
// Nothing above catches it. PERSON_NAME requires a title, deliberately, so that a sole trader
// trading under his own name is not swept up by accident, and that reasoning is sound. But it means
// the matcher can only ever guess at whether a string is a person. THIS check does not guess. We
// know who he is, and we were simply never asking.
//
// ⚠️ WHOLE WORDS, NEVER A SUBSTRING. A customer called "Jag" must not turn every payment to Jaguar,
// Jagged Edge Roofing or Jag Tools into a personal transfer, which is what a naive includes() would
// do, and it would quietly cost him real relief on real materials. Tokens are compared in sequence,
// so "jag" matches "jag" and never "jaguar".
// ═══════════════════════════════════════════════════════════════════════════════════════════

// Lowercase, punctuation to spaces, runs of space collapsed. "J. CHAHIL  LTD" -> "j chahil ltd".
export function normaliseNameKey(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Is this vendor line HIM? Compares whole word sequences, so a name is found inside a longer line
// ("PAYMENT TO J CHAHIL") without ever matching a longer word that merely starts the same way.
//
// A name under three characters is ignored outright: initials belong to too many suppliers, and the
// cost of a false positive here is a business cost he never gets to claim.
export function matchesOwnName(vendor: string | null | undefined, ownNames: string[] = []): boolean {
  const v = normaliseNameKey(vendor);
  if (!v) return false;
  const vTokens = v.split(' ');
  for (const raw of ownNames) {
    const n = normaliseNameKey(raw);
    if (n.length < 3) continue;
    const nTokens = n.split(' ');
    for (let i = 0; i + nTokens.length <= vTokens.length; i += 1) {
      if (nTokens.every((t, j) => t === vTokens[i + j])) return true;
    }
  }
  return false;
}

// Returns why this looks personal, or null when it looks like business.
//
// Order matters: the most specific and most confident checks come first, so the
// reason the user is shown is the most useful one available.
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE DIRECTION MATTERS FOR EXACTLY ONE OF THESE CHECKS, AND IT IS THE ONE THAT MATTERS MOST.
//
// Found by walking a real 78 row statement on 2 August 2026, on an electrician's account. Three
// domestic customers, MR A WHITELEY £1,450, MRS H BARLOW £920 and MRS D OKONKWO £680, were flagged
// by PERSON_NAME and dropped into the careful pile. A careful row has ONE button, "Not business
// money", and confirm_pile and confirm_income both refuse a flagged row in SQL, so there was no
// way to record them as income at all, by any route.
//
// For a domestic trade that is not an edge case. It is most of the book. The product was making
// understating income the only available action, which app/app/money/add correctly calls the one
// direction of error this product must never make easy.
//
// ⚠️ AND ONLY PERSON_NAME IS WRONG ON A CREDIT. Work through the others and every one of them is
// still right when the money is coming IN: his own name is a transfer between his accounts, a
// benefit is not trade income, a gambling win is not taxable, a refund is his own money back,
// savings interest is not trade income, and a loan is not income. Each of those genuinely belongs
// in the careful pile whichever way it points, and "not business money" is the correct answer to
// all of them. So the fix is one check, not the rule.
//
// A person paying money INTO a trading account is a customer. That is the ordinary case, and the
// warning that made sense on a payment out ("if it was family or a friend") reads as an accusation
// on a payment in.
//
// ⚠️ amount IS OPTIONAL AND ABSENT MEANS "TREAT IT AS A PAYMENT OUT", which is the behaviour every
// caller had before this existed. Widening a parameter that four call sites pass is how a check
// quietly stops running on the one caller nobody updated, so the default is the old behaviour and
// each caller opts in by handing over the figure it already has.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export function looksPersonal(
  vendor: string | null | undefined,
  description?: string | null,
  ownNames: string[] = [],
  amount?: number | null,
): PersonalHit | null {
  // FIRST, because it is the only check here that is not an inference. Everything below reads the
  // shape of a word and decides what it probably is. This one knows.
  //
  // ⚠️ THE VENDOR ONLY, NEVER THE DESCRIPTION. A description can carry his name for perfectly
  // ordinary reasons ("invoice for J Chahil"), and treating that as a transfer to himself would
  // throw away a real cost.
  if (matchesOwnName(vendor, ownNames)) {
    return {
      reason: 'self',
      why: 'This looks like money moving between your own accounts rather than a business cost. Money you move to yourself is drawings, and drawings are not an expense.',
    };
  }

  const text = `${vendor ?? ''} ${description ?? ''}`.trim();
  if (!text) return null;

  if (BENEFIT.test(text)) {
    return {
      reason: 'benefit',
      why: 'This looks like a benefit or a tax credit, not money you earned from work. Benefits are not taxable as self employed income, so counting this would push your tax bill up for no reason.',
    };
  }

  if (GAMBLING.test(text)) {
    return {
      reason: 'gambling',
      why: 'This looks like a bet. Gambling is not a business expense, and winnings are not taxable, so it should not be in your books either way.',
    };
  }

  if (REFUND.test(text)) {
    return {
      reason: 'refund',
      why: 'This looks like a refund, which is your own money coming back rather than money you earned. Counting it as income would mean paying tax on it twice.',
    };
  }

  if (SAVINGS.test(text)) {
    return {
      reason: 'savings',
      why: 'This looks like you moving your own money between your own accounts. It is the same money twice, so it does not belong in your books.',
    };
  }

  if (LOAN.test(text)) {
    return {
      reason: 'loan',
      why: 'This looks like a personal credit or buy now pay later payment rather than a business cost.',
    };
  }

  // 🔴 NOT ON MONEY IN. See the block above the signature: a person paying into a trading account
  // is a customer, and flagging him made a domestic trade's income unfilable. The check stays whole
  // for money out, where a payment to a person's name really might be family rather than a cost.
  const moneyIn = typeof amount === 'number' && Number.isFinite(amount) && amount > 0;
  if (!moneyIn && PERSON_NAME.test(text)) {
    return {
      reason: 'transfer',
      why: 'This looks like money to or from a person rather than a business. If it was a customer paying you, keep it. If it was family or a friend, it is not business income.',
    };
  }

  return null;
}

// A short label for the app chip.
export function personalLabel(reason: PersonalReason): string {
  switch (reason) {
    case 'benefit':
      return 'Looks like a benefit';
    case 'refund':
      return 'Looks like a refund';
    case 'gambling':
      return 'Looks like a bet';
    case 'savings':
      return 'Looks like your own money';
    case 'loan':
      return 'Looks personal';
    case 'self':
      return 'Looks like your own account';
    case 'transfer':
      return 'Looks like a personal transfer';
  }
}

export interface MaybePersonal {
  id: string;
  vendor: string | null;
  amount: number;
  transaction_date: string | null;
  reason: PersonalReason;
  why: string;
}

interface Row {
  id?: string;
  vendor?: string | null;
  description?: string | null;
  amount?: number | null;
  transaction_date?: string | null;
  confirmed?: boolean | null;
  is_personal?: boolean | null;
}

// Everything in someone's books that we think is not business money, and that they
// have not already told us about. We only ever raise it. They decide.
//
// 🔴 ownNames WAS BEING DROPPED ON THE FLOOR, SO THE ONE CHECK THAT DOES NOT GUESS NEVER RAN.
//
// looksPersonal takes his own names as a third argument and puts them FIRST, because knowing who he
// is beats inferring it from the shape of a word. This function called it with two arguments, so the
// parameter fell back to its empty default and the 'self' check was dead everywhere it mattered:
// /api/anomalies and /api/personal, the two places that ask him "is this really business money".
// A transfer to his own account went on being counted as a business cost, which takes money off his
// taxable profit that should not come off, and that is the direction he never notices because the
// number moved in his favour.
//
// ⚠️ THE ARGUMENT IS OPTIONAL AND DEFAULTS TO NONE, so a caller that has not read his names behaves
// exactly as it did before. Passing none can only ever raise FEWER rows, never more, so nothing a
// caller does by omission can cost him a real cost he is entitled to claim.
export function findPersonal(rows: Row[], ownNames: string[] = []): MaybePersonal[] {
  const out: MaybePersonal[] = [];
  for (const r of rows) {
    // Already marked personal by the user. Nothing to ask.
    if (r.is_personal === true) continue;
    const hit = looksPersonal(r.vendor, r.description, ownNames);
    if (!hit) continue;
    out.push({
      id: String(r.id ?? ''),
      vendor: r.vendor ?? null,
      amount: Number(r.amount ?? 0),
      transaction_date: r.transaction_date ?? null,
      reason: hit.reason,
      why: hit.why,
    });
  }
  // Biggest first: the ones distorting the tax bill most are the ones worth asking
  // about first.
  return out.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

// What marking these personal would do to the figures. This is the number that
// makes the user care, so we compute it honestly and show it.
export function impactOf(items: MaybePersonal[]): { incomeRemoved: number; expensesRemoved: number } {
  let incomeRemoved = 0;
  let expensesRemoved = 0;
  for (const i of items) {
    if (i.amount > 0) incomeRemoved += i.amount;
    else expensesRemoved += Math.abs(i.amount);
  }
  return {
    incomeRemoved: Math.round(incomeRemoved * 100) / 100,
    expensesRemoved: Math.round(expensesRemoved * 100) / 100,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 IS THIS PAYEE A PERSON, OR A SHOP? R2-F6, 13 August 2026.
//
// Rosa's three wedding customers collapsed into ONE asking group, so the product offered to learn a
// rule about three different households at once. She answered once, which was right, because the
// answer happened to be the same for all three. The next one will not be.
//
// 🔴 AND THE FILE THAT CAUSED IT ALREADY WROTE DOWN WHY THIS IS THE WORSE FAILURE. lib/memory.ts,
// normaliseVendor, in its own words:
//
//   "a COLLISION (two different merchants share a key) writes the wrong category into someone's
//    books, silently, and they have no reason to doubt it. So we fail towards missing."
//
// That reasoning is correct and the design that came out of it (two words, noise and towns stripped)
// defends well against SHOP against SHOP. It has no defence against PERSON against PERSON, and the
// odds there are far worse: human surnames collide constantly, and the one part that tells two
// people apart, the initial, is deliberately thrown away by a line that says
// "a stray single letter is debris from a stripped reference, never a name". On a UK bank feed,
// "M OKAFOR" and "L WYATT" are precisely what a person's payee line looks like.
//
// ⚠️ AND THE FIX IS NOT TO CHANGE THE KEY. vendor_rules.vendor_key IS that normalisation, so
// changing it orphans every rule every customer has ever taught this product. The collision is
// tolerable. What is not tolerable is turning a collision into a RULE, because a rule is exactly
// the mechanism by which "the wrong category is written silently, and they have no reason to doubt
// it" comes true, months later, on a household nobody has met yet.
//
// So: a person-like payee still GROUPS, because answering once is still the kindness, and one press
// about three wedding payments is one press. It just never becomes a standing rule, and the screen
// stops promising one.
//
// ⚠️ DEFAULTS TO FALSE, ALWAYS. An unrecognised payee is treated exactly as it is today. This only
// ever WITHHOLDS a promise; it can never add one.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

// Words that mean an organisation, so whatever else the line looks like it is not one person.
const COMPANY_WORDS = new Set([
  'ltd', 'limited', 'plc', 'llp', 'llc', 'inc', 'cic', 'cio', 'co', 'company', 'group', 'holdings',
  'services', 'service', 'supplies', 'supply', 'wholesale', 'trading', 'trade', 'stores', 'store',
  'energy', 'water', 'gas', 'telecom', 'telecoms', 'mobile', 'broadband', 'insurance', 'assurance',
  'bank', 'banking', 'finance', 'financial', 'mortgage', 'mortgages', 'council', 'hmrc', 'dvla',
  'motors', 'motor', 'garage', 'autos', 'auto', 'tyres', 'builders', 'merchants', 'merchant',
  'foods', 'food', 'catering', 'cafe', 'restaurant', 'hotel', 'pharmacy', 'clinic', 'dental',
  'solutions', 'systems', 'consulting', 'consultancy', 'partners', 'associates', 'agency',
  'properties', 'property', 'lettings', 'estates', 'management', 'maintenance', 'contractors',
  'waste', 'recycling', 'transport', 'logistics', 'couriers', 'delivery', 'payments', 'payouts',
  'sumup', 'stripe', 'paypal', 'worldpay', 'zettle', 'square', 'gocardless', 'klarna',
  'tesco', 'asda', 'sainsburys', 'aldi', 'lidl', 'costa', 'greggs', 'screwfix', 'toolstation',
]);

// Titles that only ever precede a person.
const PERSON_TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'sir', 'rev', 'prof']);

/**
 * Does this payee line look like a HUMAN BEING rather than a business?
 *
 * Conservative on purpose. False here means "treat it exactly as this product always has", which is
 * the safe direction, so only clear shapes say true:
 *
 *   a title            "MR J SMITH", "MRS OKAFOR"
 *   initial + surname  "M OKAFOR", "L WYATT"       (the standard UK bank payee shape)
 *   surname + initial  "OKAFOR M"
 *
 * Any company word anywhere refuses outright, so "PROPERTY MANAGEMENT M SMITH" is a business.
 */
export function looksLikePerson(vendor: string | null | undefined): boolean {
  const v = normaliseNameKey(vendor);
  if (!v) return false;
  // Any digit at all and it is a reference, a store number or an account, not a name.
  if (/\d/.test(v)) return false;

  const words = v.split(' ').filter(Boolean);
  if (words.length === 0) return false;
  // A company word ANYWHERE refuses outright, so "J SMITH PLUMBING SERVICES" is a business and
  // "M OKAFOR" beside a payment processor's name is that processor.
  if (words.some((w) => COMPANY_WORDS.has(w))) return false;

  if (PERSON_TITLES.has(words[0])) return true;

  // ⚠️ THE SHAPE IS LOOKED FOR ANYWHERE IN THE LINE, NOT MATCHED AGAINST THE WHOLE OF IT.
  //
  // The first draft required the entire payee to be the name, which is not what a statement looks
  // like: "FP CREDIT M OKAFOR WEDDING" is five words of which two are the person. Its own suite
  // caught that on the first run.
  //
  // ⚠️ AND A SURNAME MUST BE AT LEAST FOUR LETTERS, so "B AND Q" cannot read as an initial beside a
  // surname called "and". That loses a genuine Fox, Day or Lee, and losing them is the safe
  // direction: a miss leaves this product behaving exactly as it does today.
  const NAME_MIN = 4;
  for (let i = 0; i < words.length - 1; i += 1) {
    const a = words[i];
    const b = words[i + 1];
    const initialThenName = a.length === 1 && b.length >= NAME_MIN;
    const nameThenInitial = b.length === 1 && a.length >= NAME_MIN;
    if (initialThenName || nameThenInitial) return true;
  }
  return false;
}

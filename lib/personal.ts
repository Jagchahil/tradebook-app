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
export function looksPersonal(
  vendor: string | null | undefined,
  description?: string | null,
  ownNames: string[] = [],
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

  if (PERSON_NAME.test(text)) {
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

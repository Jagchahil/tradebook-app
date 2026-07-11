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

// Returns why this looks personal, or null when it looks like business.
//
// Order matters: the most specific and most confident checks come first, so the
// reason the user is shown is the most useful one available.
export function looksPersonal(vendor: string | null | undefined, description?: string | null): PersonalHit | null {
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
export function findPersonal(rows: Row[]): MaybePersonal[] {
  const out: MaybePersonal[] = [];
  for (const r of rows) {
    // Already marked personal by the user. Nothing to ask.
    if (r.is_personal === true) continue;
    const hit = looksPersonal(r.vendor, r.description);
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

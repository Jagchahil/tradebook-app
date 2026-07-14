// THE LEDGER. What Lekhio actually saved him, side by side, the way Tesla shows you the petrol.
//
// ---------------------------------------------------------------------------------------------
// "£12.99 SAVES YOU £2,000" IS NOT A SLOGAN. IT IS A SPECIFICATION.
//
// If we cannot show him the £2,000, we have not earned the £12.99, and the sentence is a lie.
// (doc 108, section 0.)
// ---------------------------------------------------------------------------------------------
//
// A Tesla does not tell you it is efficient. It shows you two numbers side by side: what the petrol
// would have cost, and what the charge did cost. The gap is the product, and you look at it every
// week without being asked to.
//
// ⚠️ THE HARDEST QUESTION IN THIS FILE, AND EVERYTHING DEPENDS ON THE ANSWER:
//
//   COMPARED TO WHAT?
//
// The tempting answer is "compared to what he WOULD have done without us", and that is a fantasy.
// We do not know what he would have done. A man with a shoebox might still have claimed his fuel.
// The moment this file starts guessing at a counterfactual, every number in it becomes a marketing
// number, he catches it once, and he never believes another figure we show him again.
//
// TESLA DOES NOT GUESS EITHER. It does not model what car you would have bought. It compares you to
// a DEFINED BASELINE: petrol, at today's price, over the miles you actually drove.
//
// So ours is defined too, and it is the most honest baseline available:
//
//   WITHOUT LEKHIO = the tax HMRC would charge him ON HIS GROSS INCOME, IF HE CLAIMED NOTHING.
//
// That is not a hypothetical. It is what happens to a man who never keeps a receipt. And for a CIS
// subcontractor it is not even a metaphor: HMRC's contractor deducts a percentage from his GROSS
// pay, with no allowance for the personal allowance and no allowance for a single expense. THE
// SHOEBOX MAN LITERALLY PAYS THIS NUMBER. That is why the CIS refund is the reason most tradesmen
// file at all.
//
// ---------------------------------------------------------------------------------------------
// THE THREE RULES. Break any one of them and the ledger becomes an advert.
//
//   1. REALISED ONLY. Every line is money he is NOT paying, on figures he has CONFIRMED. Never a
//      projection, never a conditional, never a "could". lib/taxoptimiser.ts carries Marriage
//      Allowance at estSaving 0 ON PURPOSE, because we do not know whether he is married. That
//      discipline is why a man believes the total. This file inherits it.
//
//   2. NOT ENOUGH IS NOT ZERO. With three weeks of data we say so, rather than draw a confident
//      number. lib/metrics.ts refuses to return a percentage below its threshold for exactly this
//      reason.
//
//   3. A REPAYMENT IS NOT A SAVING. A CIS refund is HIS OWN MONEY coming back. Adding it to "tax
//      saved" would double count it and inflate the headline. It gets its own column and its own
//      word. The same goes for a payments-on-account reduction, which is cashflow, not tax.
//
// ---------------------------------------------------------------------------------------------
// AND THE RULE THAT IS NOT ABOUT ARITHMETIC AT ALL. Doc 108 section 1.
//
// Finance Act 2026 Sch 22: a fee contingent on the tax saved is a DOTAS premium-fee hallmark, and
// it is the signature of the repayment-agent industry HMRC has spent years legislating against.
//
//   THIS NUMBER IS A SENTENCE WE SAY. IT MUST NEVER BECOME A NUMBER WE CHARGE.
//
// If anyone ever proposes pricing on this figure, the answer is no, and the reason is a statute.

import { FACTS, soleTraderTax } from './taxengine';

// Below this, a "saved" figure is noise dressed as a fact. Three months is when the projection in
// lib/taxoptimiser.ts is allowed to speak, and the same honesty applies here.
export const ENOUGH_MONTHS = 3;

export interface LedgerInput {
  monthsElapsed: number;
  // CONFIRMED figures only. Nothing "to review" belongs in a ledger.
  grossIncome: number;
  // The deductions he has actually claimed, broken out so we can tell him WHERE the money came from.
  expenses: number;          // receipts, bank lines, anything he confirmed as a business cost
  mileage: number;           // the £ value of miles claimed, not the miles
  homeOffice: number;        // the flat rate actually applied
  capitalAllowances: number; // AIA and the rest, on things he actually bought
  pension: number;           // contributions actually made
  // CIS suffered. HIS OWN MONEY, held by HMRC. A repayment, never a saving. See rule 3.
  cisSuffered: number;
}

export interface LedgerLine {
  key: string;
  label: string;
  deducted: number;   // the £ of deduction
  saved: number;      // the £ of TAX he is not paying because of it
  basis: string;      // plain English. He should be able to check our working.
}

export interface Ledger {
  enough: boolean;
  note: string | null;        // when we cannot honestly say, this says why

  // THE TWO NUMBERS. Everything else on the screen is a footnote to these.
  withoutLekhio: number;      // tax on the gross, claiming NOTHING
  withLekhio: number;         // tax he actually owes
  saved: number;              // the gap. The only number that matters.

  lines: LedgerLine[];

  // Separate, and it stays separate. Not a saving. His own money coming back.
  refundDue: number;
}

const round = (n: number) => Math.round(Number.isFinite(n) ? n : 0);

// The whole thing.
export function ledger(input: LedgerInput): Ledger {
  const gross = Math.max(0, input.grossIncome);

  const deductions: Array<{ key: string; label: string; amount: number; basis: string }> = [
    {
      key: 'expenses', label: 'Costs you logged', amount: Math.max(0, input.expenses),
      basis: 'Every receipt you sent and every bank line you confirmed as work.',
    },
    {
      key: 'mileage', label: 'Mileage', amount: Math.max(0, input.mileage),
      basis: `Your business miles at HMRC's rate. ${FACTS.mileageCarFirst10k * 100}p a mile for the first ${FACTS.mileageFirstBandMiles.toLocaleString('en-GB')}.`,
    },
    {
      key: 'home_office', label: 'Use of home', amount: Math.max(0, input.homeOffice),
      basis: 'The flat rate for doing your quotes and paperwork at home. No receipts needed.',
    },
    {
      key: 'capital', label: 'Tools and equipment', amount: Math.max(0, input.capitalAllowances),
      basis: 'The full cost of what you bought, off your profit, under the Annual Investment Allowance.',
    },
    {
      key: 'pension', label: 'Pension', amount: Math.max(0, input.pension),
      basis: 'What you put into your pension comes off your taxable profit.',
    },
  ].filter((d) => d.amount > 0);

  const totalDeducted = deductions.reduce((n, d) => n + d.amount, 0);

  // ⚠️ THE BASELINE. Read the header of this file before you change it.
  //
  // Tax on the GROSS, claiming nothing. Not a guess about his behaviour. A defined counterfactual,
  // and for a CIS subbie it is what actually happens to him.
  const withoutLekhio = round(soleTraderTax(gross).total);
  const withLekhio = round(soleTraderTax(Math.max(0, gross - totalDeducted)).total);
  const saved = Math.max(0, withoutLekhio - withLekhio);

  // ⚠️ NOT ENOUGH IS NOT ZERO.
  //
  // Two weeks in, a man has logged one receipt and the ledger would proudly report that Lekhio has
  // saved him £14. He would laugh at us, and he would be right to, and he would never look at this
  // screen again. Say we do not know yet. It costs nothing and it buys the number credibility for
  // the day it is worth looking at.
  if (input.monthsElapsed < ENOUGH_MONTHS || gross <= 0) {
    return {
      enough: false,
      note: gross <= 0
        ? 'Nothing confirmed yet. Send a receipt or connect the bank and this fills itself in.'
        : `Too early to say. Give it ${ENOUGH_MONTHS} months of real figures and this will mean something.`,
      withoutLekhio: 0, withLekhio: 0, saved: 0, lines: [],
      refundDue: round(Math.max(0, input.cisSuffered)),
    };
  }

  // ATTRIBUTION, AND WHY IT IS A SHARE AND NOT A SUM.
  //
  // Tax is banded, so "what did THIS deduction save" has no single answer: a pound of mileage and a
  // pound of fuel are worth exactly the same at the margin, and which one you call "the pound that
  // crossed the threshold" is arbitrary. Adding up per line savings computed independently would
  // OVERSTATE the total, because each would be measured from the same untouched top band.
  //
  // So the TOTAL is exact (two runs of the engine, no fudge), and each line takes its share of it.
  // We say so in the words rather than hide it, because a man who checks our working should find it.
  const lines: LedgerLine[] = deductions.map((d) => ({
    key: d.key,
    label: d.label,
    deducted: round(d.amount),
    saved: totalDeducted > 0 ? round((d.amount / totalDeducted) * saved) : 0,
    basis: d.basis,
  }));

  return {
    enough: true,
    note: null,
    withoutLekhio,
    withLekhio,
    saved: round(saved),
    lines: lines.sort((a, b) => b.saved - a.saved),

    // ⚠️ SEPARATE, AND IT STAYS SEPARATE.
    //
    // CIS is HIS MONEY, already taken, sitting with HMRC. Folding it into "tax saved" would double
    // count and it would flatter us by thousands. This product has already once quoted a man a CIS
    // refund that did not exist (it forgot the student loan). It does not get a second chance to
    // lie about CIS.
    refundDue: round(Math.max(0, input.cisSuffered)),
  };
}

// The sentence for the top of the screen. One line, his numbers, no adjectives.
export function headline(l: Ledger): string {
  if (!l.enough) return l.note ?? '';
  if (l.saved <= 0) return 'Nothing saved yet. Log a cost and this starts moving.';
  return `Lekhio has kept £${l.saved.toLocaleString('en-GB')} out of the taxman's hands this year.`;
}

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

import { FACTS, asPence } from './taxengine';
import { combinedIncomeTax } from './personalincome';

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

  // 🔴 EVERYTHING ELSE HE EARNS, because it decides what rate his TRADE is taxed at.
  //
  // Absent means a pure sole trader, and a pure sole trader's figures are unchanged to the penny.
  // See the baseline note below: this field exists because leaving it out gave a man with a PAYE
  // job his personal allowance twice and printed "With Lekhio £0" over a real tax bill.
  otherIncome?: {
    employment?: number;       // a PAYE job or a pension
    otherNonSavings?: number;  // property profit
    savings?: number;          // bank interest, not ISAs
    dividends?: number;
  };
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
      basis: `Your business miles at HMRC's rate. ${asPence(FACTS.mileageCarFirst10k)}p a mile for the first ${FACTS.mileageFirstBandMiles.toLocaleString('en-GB')}.`,
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
  //
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 30 JULY 2026: AND IT WAS GIVING A MAN WITH A JOB HIS PERSONAL ALLOWANCE TWICE.
  //
  // Found by loading the deployed Overview on a real account. On screen, in the largest type we
  // draw, it said "Put by for tax £26,579", and eight lines below it, "With Lekhio £0".
  //
  // Both came out of this codebase. The £26,579 is right. The £0 was this function calling
  // soleTraderTax on the TRADE ALONE for a man who also has a £30,000 salary. soleTraderTax hands
  // the trade a full personal allowance, so £12,307 of profit sitting on top of wages that have
  // already used that allowance up came out as nothing at all. HMRC does not do that. His trade
  // profit is taxed at the MARGIN, on top of everything else he earns.
  //
  // The cost was not only the impossible zero. "Without Lekhio" was understated the same way, so
  // the saving itself was wrong: £866 where the truth was nearer £934, and the gap grows into
  // hundreds for a man whose trade profit straddles the higher rate threshold.
  //
  // ⚠️ SO THE TRADE IS TAXED AT THE MARGIN, AND THE MARGIN IS WHERE THE REST OF HIS INCOME LEFT IT.
  //
  // Both figures are now "what his TRADE adds to his tax bill": his whole tax with the trade in it,
  // less his whole tax with the trade taken out. That is the honest answer to "what did this cost
  // me", and it is the only one that survives him having a job.
  //
  // ⚠️ NOTHING MOVES FOR A PURE SOLE TRADER, BY CONSTRUCTION. With no other income the second term
  // is zero and combinedIncomeTax of a trade alone IS soleTraderTax, which lib/taxoptimiser.ts's
  // own tests already pin. Every existing figure is identical to the penny.
  //
  // ⚠️ AND IT USES THE SAME ENGINE taxPosition USES, deliberately. Two readers over one man's tax
  // is what produced the contradiction in the first place.
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  // ⚠️ EMPLOYMENT AND PROPERTY GO IN. DIVIDENDS AND SAVINGS DELIBERATELY DO NOT.
  //
  // This is the line I got wrong first and it is worth the paragraph, because the difference on a
  // real account was £866 against £1,816 and the bigger one was ours to brag about.
  //
  // Wages and rent are NON SAVINGS income. They sit UNDERNEATH his trade in the stacking order, so
  // they use up his personal allowance and his basic band before his profit gets there. Leaving
  // them out is what handed him a second personal allowance. They belong here.
  //
  // Dividends and savings interest sit ON TOP. Trade profit does not get taxed differently because
  // of them, but they get taxed differently because of IT: adding profit underneath pushes his
  // dividends up a band. So including them would credit us with a saving that comes from where his
  // dividends happen to land at the end of the year, on a figure this file computes from four
  // months of realised trade. That is rule 1 of this file's header, in the exact words: never a
  // projection, never a conditional, never a "could".
  //
  // ⚠️ AND THE DIRECTION MATTERS MORE THAN THE PRECISION. Leaving them out UNDERSTATES what we
  // saved him. Understating is the direction a man forgives; a headline saving that shrinks when
  // his accountant checks it is the one he never forgives, and it is the one this file's header
  // calls a marketing number.
  const other = input.otherIncome;
  const wholeTaxWith = (tradeProfit: number) => combinedIncomeTax({
    selfEmployment: Math.max(0, tradeProfit),
    employment: Math.max(0, other?.employment ?? 0),
    otherNonSavings: Math.max(0, other?.otherNonSavings ?? 0),
  }).totalTax;

  // His tax with no trade at all. Everything above this line is what the trade costs him.
  const withoutTrade = wholeTaxWith(0);
  const withoutLekhio = round(wholeTaxWith(gross) - withoutTrade);
  const withLekhio = round(wholeTaxWith(Math.max(0, gross - totalDeducted)) - withoutTrade);
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
        // ⚠️ THE ONE THING HE CAN ACTUALLY DO. This said "send a receipt or connect the bank", and
        // sending a receipt means WhatsApp, which needs a proved number a web customer does not
        // have yet. Naming an action he cannot take is how an empty screen becomes a dead end.
        ? 'Nothing confirmed yet. Connect your bank and this fills itself in.'
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
  if (l.saved <= 0) return 'Nothing saved yet. Connect your bank and every cost starts counting.';
  return `Lekhio has kept £${l.saved.toLocaleString('en-GB')} out of the taxman's hands this year.`;
}

// ── One assembler, every surface ─────────────────────────────────────────────────────────────────
//
// ⚠️ THIS FUNCTION EXISTS BECAUSE THE ASSEMBLY BELOW USED TO LIVE INSIDE app/api/ledger/route.ts,
// AND THE WEB APP WOULD HAVE BEEN THE SECOND COPY OF IT.
//
// The route's own header says it plainly: two readers over the same money will drift, and the one
// that drifts is the one he believes. It has happened three times in this codebase already. A
// server rendered page that rebuilt these five lines for itself would be the fourth, and it would
// be the worst of them, because the disagreement would be between the number on his screen and the
// number in his quarter pack.
//
// So the route calls this, the web app calls this, and there is one place where the mileage is
// subtracted and the use of home is added.
export interface LedgerSource {
  monthsElapsed: number;
  ytdTradeIncome: number;
  ytdTradeExpenses: number;
  ytdCisSuffered: number;
  ytdMileage?: number;
  ytdHomeOffice?: number;

  // 🔴 THE REST OF HIS INCOME. All optional, all zero by default, so a caller that does not pass
  // them behaves exactly as it did before this existed. OptimiserInput already carries every one of
  // these, which is how this bug survived: the values were sitting in the object being passed in
  // and nothing read them.
  employmentIncome?: number;
  savingsIncome?: number;
  dividendIncome?: number;
  ytdPropertyIncome?: number;
  ytdPropertyExpenses?: number;
}

export function ledgerFor(input: LedgerSource): Ledger {
  // 🔴 THE MILEAGE IS MOVED, NOT ADDED. THE TOTAL DOES NOT CHANGE BY A PENNY.
  //
  // A mileage claim is already an ordinary transaction inside ytdTradeExpenses, so it has ALWAYS
  // been reducing his tax correctly. What it was not doing was showing up by name: the ledger's
  // whole job is to tell him WHERE the money came from, and mileage was buried inside "Costs you
  // logged". So it is subtracted from the expenses line and passed on its own. Same deduction,
  // same tax, same saved, one more line he can read.
  //
  // If you are ever tempted to pass ytdMileage WITHOUT subtracting it here, stop: that would count
  // it twice and overstate what we saved him, and this file's header explains why that is the one
  // lie the product cannot afford.
  const mileage = Math.max(0, input.ytdMileage ?? 0);

  return ledger({
    monthsElapsed: input.monthsElapsed,
    grossIncome: input.ytdTradeIncome,
    expenses: Math.max(0, input.ytdTradeExpenses - mileage),
    mileage,

    // 🔴 USE OF HOME IS ADDED, NOT MOVED, AND THAT IS THE OPPOSITE OF THE MILEAGE LINE ABOVE.
    //
    // The difference is not a style choice, it is a fact about the data. Use of home is an
    // ELECTION, not a transaction: lib/categories.ts refuses to create a 'home' category on
    // purpose, because a rule on rent or a household energy bill would sweep up a man's OWN HOUSE
    // and claim tax relief on it. So it cannot be inside expenses, and subtracting it the way
    // mileage is subtracted would UNDERSTATE his deductions by exactly the amount he elected.
    //
    // test/elections.test.mjs asserts both directions against this file's real output, so a future
    // refactor that "makes them consistent" has to break a test that explains why they are not.
    homeOffice: Math.max(0, input.ytdHomeOffice ?? 0),

    // STILL NOT WIRED, AND THESE ZEROS ARE HONEST RATHER THAN LAZY.
    //
    // pension is genuinely NOT CAPTURED ANYWHERE: there is no category and no election for it yet.
    // That zero really does understate him, and the fix is upstream, not here.
    //
    // capitalAllowances is a different case and the zero is LOAD BEARING. Tools and equipment are
    // logged as ordinary expense categories, so their cost is ALREADY inside the expenses line
    // above. Passing a figure here as well would count them twice.
    capitalAllowances: 0,
    pension: 0,

    // HIS OWN MONEY, HELD BY HMRC. Its own number on the screen, never added to "saved".
    cisSuffered: input.ytdCisSuffered,

    // 🔴 WHAT RATE HIS TRADE IS ACTUALLY TAXED AT. See the baseline note in ledger() above: without
    // this a man with a job was handed a second personal allowance and told his trade cost him
    // nothing. Property is netted here the same way the optimiser nets it.
    otherIncome: {
      employment: Math.max(0, input.employmentIncome ?? 0),
      otherNonSavings: Math.max(0, (input.ytdPropertyIncome ?? 0) - (input.ytdPropertyExpenses ?? 0)),
      savings: Math.max(0, input.savingsIncome ?? 0),
      dividends: Math.max(0, input.dividendIncome ?? 0),
    },
  });
}

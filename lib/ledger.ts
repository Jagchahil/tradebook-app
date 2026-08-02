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
  grossIncome: number;       // the TRADE gross. Rent has its own two fields below.
  // The deductions he has actually claimed, broken out so we can tell him WHERE the money came from.
  expenses: number;          // receipts, bank lines, anything he confirmed as a business cost
  mileage: number;           // the £ value of miles claimed, not the miles
  homeOffice: number;        // the flat rate actually applied
  capitalAllowances: number; // AIA and the rest, on things he actually bought
  pension: number;           // contributions actually made

  // 🔴 HIS RENT, AS ITS OWN STREAM, BECAUSE A LANDLORD HAD NO LEDGER AT ALL.
  //
  // grossIncome above is the trade, and it was the ONLY thing this file counted as income. So a
  // customer whose whole business is letting could confirm a year of rent and every one of his
  // property costs, open the screen whose entire job is to show what we saved him, and read
  // "Nothing confirmed yet". His property figures were in the object the whole time and were used
  // for one thing only: raising the rate his TRADE was taxed at, a trade he has not got.
  //
  // ⚠️ RENT IS NOT FOLDED INTO grossIncome, AND THAT IS THE POINT. Rental profit carries no Class 4
  // National Insurance. Adding it to the trade would charge him NI on his rent inside the very
  // figure we ask him to believe, which is the same error lib/incomeproof.ts was printing on a
  // document going to a lender. So it goes in as non savings income, taxed beside the trade and
  // never as it.
  //
  // Both default to 0, so a caller that has no property behaves exactly as it did before they
  // existed, to the penny.
  propertyIncome?: number;
  propertyExpenses?: number;

  // 🔴 THE TRADING ALLOWANCE HE HAS ELECTED, IF HE HAS. ITTOIA 2005 Part 6A.
  //
  // Its own line rather than a number folded into `expenses`, for the reason mileage got its own:
  // a deduction on a screen whose whole job is to be believed has to say where it came from, and
  // "Costs you logged: £1,000" would be false of a man who logged £4,000 and elected instead.
  //
  // ⚠️ WHEN THIS IS SET, THE CALLER SENDS ZERO FOR expenses, mileage AND homeOffice. That is not a
  // convention this file enforces, it is what the election MEANS (GOV.UK: "You cannot deduct any
  // other expenses or allowances if you claim the allowances"), and ledgerFor() below is the one
  // place that assembles it. A caller that sent both would be describing a man claiming twice.
  //
  // ⚠️ AND IT IS NOT ACCRUED BY MONTH, unlike the use of home flat rate, which is a rate PER MONTH
  // and so is only realised as the months happen. The trading allowance is one annual amount and
  // he is entitled to all of it for the year the moment the year starts, so the full figure is a
  // realised deduction in month one. Different facts, different treatment; rule 1 of this file is
  // not broken by either.
  tradingAllowance?: number;

  // CIS suffered. HIS OWN MONEY, held by HMRC. A repayment, never a saving. See rule 3.
  cisSuffered: number;

  // 🔴 EVERYTHING ELSE HE EARNS, because it decides what rate his TRADE is taxed at.
  //
  // Absent means a pure sole trader, and a pure sole trader's figures are unchanged to the penny.
  // See the baseline note below: this field exists because leaving it out gave a man with a PAYE
  // job his personal allowance twice and printed "With Lekhio £0" over a real tax bill.
  otherIncome?: {
    employment?: number;       // a PAYE job or a pension
    // Any other non savings income the ledger does not itemise. Rent used to arrive here as a NET
    // figure; it now has its own gross and costs above, so that his property costs can be shown as
    // the deduction they are instead of quietly vanishing into a net. A caller that only holds a
    // net figure can still put it here and nothing about it has changed.
    otherNonSavings?: number;
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
  const tradeGross = Math.max(0, input.grossIncome);
  const propertyGross = Math.max(0, input.propertyIncome ?? 0);

  // 🔴 A PROPERTY LOSS CANNOT COME OFF HIS TRADE, SO THE LEDGER ONLY EVER COUNTS THE PART THAT BIT.
  //
  // Property costs above the rent are not lost, but they are not a saving THIS year either: they are
  // carried forward against future rental profit. Counting the whole spend as a deduction would hand
  // that line a share of a saving it did not produce, which is failure mode 4 in this file's header
  // (the parts exceeding the whole) arriving through a new door.
  const propertyCosts = Math.min(propertyGross, Math.max(0, input.propertyExpenses ?? 0));

  // Everything he has taken in, both streams. The "nothing confirmed yet" gate further down runs on
  // this figure, and it used to run on the trade alone, which is exactly why a landlord could confirm
  // a year of rent and still be told nothing had been confirmed.
  const gross = tradeGross + propertyGross;

  const deductions: Array<{ key: string; label: string; amount: number; basis: string }> = [
    {
      // ⚠️ FIRST, BECAUSE WHEN IT IS ON IT IS THE ONLY ONE. The basis sentence says what it
      // replaced rather than only what it is: a man who sees one £1,000 line where last month he
      // had four lines of real costs has to be able to read WHY from the line itself, not work it
      // out from what is missing. The filter below drops it to nothing for everybody else.
      key: 'trading_allowance', label: 'Trading allowance', amount: Math.max(0, input.tradingAllowance ?? 0),
      basis: 'The flat allowance you elected for this tax year. It is claimed instead of your logged costs, your mileage and the use of home flat rate, never as well as them.',
    },
    {
      key: 'expenses', label: 'Costs you logged', amount: Math.max(0, input.expenses),
      basis: 'Every receipt you sent and every bank line you confirmed as work.',
    },
    {
      key: 'mileage', label: 'Mileage', amount: Math.max(0, input.mileage),
      basis: `Your business miles at HMRC's rate. ${asPence(FACTS.mileageCarFirst10k)}p a mile for the first ${FACTS.mileageFirstBandMiles.toLocaleString('en-GB')}.`,
    },
    {
      // ⚠️ THE SECOND SENTENCE IS NOT DECORATION AND IT IS NOT A HEDGE.
      //
      // HMRC allows the flat rate OR a share of his actual household bills, never both, and a man
      // who takes this line and also puts his gas bill through has claimed the same thing twice.
      // That is the one way use of home can still be double counted, and lib/elections.ts's header
      // rests on every place that describes the flat rate saying so. This line is the one it named
      // as not saying it. It says it now, on the screen where he reads what the claim actually is.
      key: 'home_office', label: 'Use of home', amount: Math.max(0, input.homeOffice),
      basis: 'The flat rate for doing your quotes and paperwork at home. No receipts needed, and it goes in instead of a share of your actual home bills rather than as well as.',
    },
    {
      // ⚠️ IT SAID "Tools and equipment", "the full cost", AND "Annual Investment Allowance", AND
      // ALL THREE ARE NOW WRONG FOR THE ONLY THING THAT REACHES THIS LINE. Tools are ordinary
      // costs and sit inside the expenses line above; the only figure that arrives here is the
      // allowance on a vehicle a man told the pile about, and a car is specifically excluded from
      // the AIA. A line explaining a deduction has to describe the deduction it is next to.
      key: 'capital', label: 'Vehicle allowance', amount: Math.max(0, input.capitalAllowances),
      basis: 'What a vehicle you told us about takes off your profit this year. A car is kept out of the Annual Investment Allowance, so it comes off a percentage a year instead of all at once. A brand new electric one comes off in full.',
    },
    {
      key: 'pension', label: 'Pension', amount: Math.max(0, input.pension),
      basis: 'What you put into your pension comes off your taxable profit.',
    },
    {
      key: 'property', label: 'Property costs', amount: propertyCosts,
      basis: 'Repairs, agent fees, insurance and the rest, off the rent you took in.',
    },
  ].filter((d) => d.amount > 0);

  // ⚠️ THE PROPERTY LINE COMES OFF THE RENT, NEVER OFF THE TRADE, so the two are totalled apart.
  // Subtracting his boiler service from his trade profit would move tax between two streams HMRC
  // keeps separate, and it would charge him Class 4 relief on a cost that never carried Class 4.
  const tradeDeducted = deductions
    .filter((d) => d.key !== 'property')
    .reduce((n, d) => n + d.amount, 0);
  const totalDeducted = tradeDeducted + propertyCosts;

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
  //
  // ⚠️ AND HIS RENT GOES IN AS RENT. It is non savings income like his wages, so it stacks
  // UNDERNEATH his trade and decides which band his profit lands in, but it carries no Class 4
  // National Insurance of its own. That is why it is a second argument here rather than another
  // pound added to the trade.
  const other = input.otherIncome;
  const wholeTaxWith = (tradeProfit: number, propertyProfit: number) => combinedIncomeTax({
    selfEmployment: Math.max(0, tradeProfit),
    employment: Math.max(0, other?.employment ?? 0),
    otherNonSavings: Math.max(0, propertyProfit) + Math.max(0, other?.otherNonSavings ?? 0),
  }).totalTax;

  // His tax with no business at all, trade or rent. Everything above this line is what his own
  // money costs him.
  const withoutTrade = wholeTaxWith(0, 0);
  const withoutLekhio = round(wholeTaxWith(tradeGross, propertyGross) - withoutTrade);
  const withLekhio = round(
    wholeTaxWith(Math.max(0, tradeGross - tradeDeducted), propertyGross - propertyCosts) - withoutTrade,
  );
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
        ? 'Nothing confirmed yet. Add your first entry or upload a bank statement, and this fills itself in.'
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
  if (l.saved <= 0) return 'Nothing saved yet. Get your costs in, by hand or by statement, and every one starts counting.';
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
// So the route calls this, the web app calls this, and there is one place where the mileage and the
// use of home are taken back off the expenses before either is shown on a line of its own.
export interface LedgerSource {
  monthsElapsed: number;
  ytdTradeIncome: number;
  ytdTradeExpenses: number;
  ytdCisSuffered: number;
  ytdMileage?: number;
  ytdHomeOffice?: number;
  // The use of home he TEXTED, already inside ytdTradeExpenses. See the note in ledgerFor() below,
  // and OptimiserInput.ytdHomeOfficeLogged, which is where it is counted. Default 0.
  ytdHomeOfficeLogged?: number;

  // 🔴 THE REST OF HIS INCOME. All optional, all zero by default, so a caller that does not pass
  // them behaves exactly as it did before this existed. OptimiserInput already carries every one of
  // these, which is how this bug survived: the values were sitting in the object being passed in
  // and nothing read them.
  employmentIncome?: number;
  savingsIncome?: number;
  dividendIncome?: number;
  ytdPropertyIncome?: number;
  ytdPropertyExpenses?: number;

  // Has he elected the trading allowance for this year. Optional and false by default, so every
  // caller written before it existed produces the identical ledger to the penny. See LedgerInput
  // .tradingAllowance above for what it does to the other three deduction lines, and why.
  tradingAllowanceElected?: boolean;

  // The vehicle allowance from getOptimiserInput. ⚠️ NOT A SLICE OF ytdTradeExpenses, unlike
  // ytdMileage and ytdHomeOffice: the car's cost has already been taken OUT of that figure
  // upstream, and this is what replaces it. See lib/taxoptimiser.ts OptimiserInput for the whole
  // story, including why reading it as a slice would double count in the direction that hurts him.
  ytdCapitalAllowances?: number;
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

  // 🔴 AND THE USE OF HOME IS MOVED TOO, WHICH IS THE OPPOSITE OF WHAT THIS FILE USED TO ARGUE.
  //
  // The comment that stood here said use of home is an ELECTION rather than a transaction, so it
  // "cannot be inside expenses" and must be added on top. That was true the day it was written and
  // false by the time anybody read it: app/api/whatsapp/route.ts handleHomeOffice writes a REAL
  // transaction, vendor 'Use of home', which lands in ytdTradeExpenses like any other cost. So a man
  // who elected AND texted his hours had the same deduction counted twice, and the comment was the
  // reason nobody looked.
  //
  // THE RULE, and lib/taxoptimiser.ts applies the identical one so the two cannot drift:
  //   take what he LOGGED out of expenses, always;
  //   then the deduction is what he ELECTED if there is an election, and what he logged if not.
  //
  // WHICH WAY EACH MAN'S MONEY MOVES, because that is the only question that matters here:
  //   ELECTED ONLY  nothing logged to take out, deduction is the election. Identical to today.
  //   TEXTED ONLY   taken off expenses and put straight back as the claim. Same total to the penny,
  //                 and now on a line with its name on it. He loses nothing.
  //   BOTH          counted ONCE, at the election, which is the authoritative figure. His deduction
  //                 falls, and that is the correct direction: it was never his twice. Nobody who was
  //                 entitled to the deduction loses it, only the duplicate goes.
  const loggedHomeOffice = Math.max(0, input.ytdHomeOfficeLogged ?? 0);

  // 🔴 THE TRADING ALLOWANCE REPLACES THE THREE LINES ABOVE IT RATHER THAN JOINING THEM.
  //
  // He elected to deduct one flat figure INSTEAD of his real costs, so on the screen that tells him
  // what we saved him, his real costs saved him nothing this year and saying otherwise would be the
  // one direction this file exists to prevent. Expenses, mileage and the use of home all go to zero
  // and the allowance stands alone. taxPosition() does the same thing to the same man's figures, so
  // the two cannot disagree about his profit.
  const electedTradingAllowance = input.tradingAllowanceElected === true;

  return ledger({
    monthsElapsed: input.monthsElapsed,
    grossIncome: input.ytdTradeIncome,
    tradingAllowance: electedTradingAllowance ? FACTS.tradingAllowance : 0,
    expenses: electedTradingAllowance ? 0 : Math.max(0, input.ytdTradeExpenses - mileage - loggedHomeOffice),
    mileage: electedTradingAllowance ? 0 : mileage,

    // The election if he has one, the rows he texted if he has not. A zero election is no election:
    // lib/elections.ts only ever accrues months that have happened, so nothing is lost by reading it
    // that way, and a negative can never draw a line. See the rule above.
    homeOffice: electedTradingAllowance ? 0 : (Math.max(0, input.ytdHomeOffice ?? 0) || loggedHomeOffice),

    // pension is STILL NOT WIRED, and the zero is honest rather than lazy: there is no category
    // and no election for it yet. That zero really does understate him, and the fix is upstream.
    //
    // 🔴 capitalAllowances IS WIRED NOW, AND THE ZERO THAT USED TO BE HERE WAS LOAD BEARING FOR A
    // REASON THAT NO LONGER HOLDS. The old comment said tools and equipment are logged as ordinary
    // expense categories so their cost is already inside the expenses line, and passing a figure
    // here would count them twice. That is still true OF TOOLS, and tools still never reach this
    // line. What reaches it is a vehicle: when a man tells the pile a payment was a car,
    // getOptimiserInput takes the whole cost OUT of ytdTradeExpenses and hands the allowance over
    // separately, so this is a replacement rather than an addition and nothing is counted twice.
    //
    // ⚠️ ZERO WHEN HE ELECTED THE TRADING ALLOWANCE, for the same reason expenses and mileage go
    // to zero six lines up: GOV.UK, "You cannot deduct any other expenses or allowances if you
    // claim the allowances." lib/taxoptimiser.ts capitalAllowanceOf() applies the identical rule
    // to the same man's figures, so the ledger and the tax cannot disagree about his profit.
    capitalAllowances: electedTradingAllowance ? 0 : Math.max(0, input.ytdCapitalAllowances ?? 0),
    pension: 0,

    // 🔴 HIS RENT, AS A STREAM, NOT AS A RATE ADJUSTMENT. It used to arrive NETTED, in otherIncome
    // below, where its only effect was to push his trade up a band. That is why a landlord with no
    // trade was told "Nothing confirmed yet" however much rent he had confirmed: the gross the
    // ledger tested was the trade's. Now the rent is income and the property costs are a deduction
    // with their own line, which is what they have always been.
    //
    // ⚠️ WHICH WAY THIS MOVES A MAN'S MONEY: UP, never down. His "with Lekhio" figure, the tax he
    // actually owes, is unchanged to the penny, because netting the rent before the engine and
    // netting it inside the engine give the same tax. What changes is the BASELINE: a man who
    // claimed nothing would be taxed on his whole rent, so his property costs are a real saving and
    // they now show as one.
    propertyIncome: Math.max(0, input.ytdPropertyIncome ?? 0),
    propertyExpenses: Math.max(0, input.ytdPropertyExpenses ?? 0),

    // HIS OWN MONEY, HELD BY HMRC. Its own number on the screen, never added to "saved".
    cisSuffered: input.ytdCisSuffered,

    // 🔴 WHAT RATE HIS TRADE IS ACTUALLY TAXED AT. See the baseline note in ledger() above: without
    // this a man with a job was handed a second personal allowance and told his trade cost him
    // nothing. Property is NOT here any more, it is a stream of its own above; putting it in both
    // places would tax his rent twice.
    otherIncome: {
      employment: Math.max(0, input.employmentIncome ?? 0),
      savings: Math.max(0, input.savingsIncome ?? 0),
      dividends: Math.max(0, input.dividendIncome ?? 0),
    },
  });
}

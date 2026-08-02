// lib/taxoptimiser.ts. The engine that answers "lower my tax as much as possible".
//
// It scans a user's confirmed figures and profile and returns every LEGITIMATE
// lever to reduce their tax, each with an estimated saving and an autonomy action
// class. It is deterministic maths on the canonical engine, no AI, no cost.
//
// The doctrine line, held here as everywhere: these are the real HMRC rules
// applied to the user's own numbers. It surfaces genuine reliefs the user is
// entitled to; it never invents a claim or coaches disguising personal as
// business. Every money lever (buying an asset, a pension contribution) is
// classed irreversible, so applyDial can never auto-execute it, only draft it
// for the user's yes. Timing and tax-treatment guidance only. You decide.

import { FACTS, soleTraderTax, homeOfficeFlatRateMonthly, marriageAllowance } from './taxengine';
// The property engine, doc 82 section 4. There is ONE place that knows how the £1,000 property
// allowance stands against actual costs, and it is lib/propertyengine.ts (verified against the
// HMRC technical note of 26 November 2025, see its header). The lever below asks it and repeats
// its answer; it never reworks the comparison, for the same reason no component holds a tax
// constant: two copies of a rule drift, and the copy that drifts is the one he is looking at.
import { propertyProfit, PROPERTY_FACTS, type PropertyTaxYear } from './propertyengine';
import { compare } from './ltdengine';
import { combinedIncomeTax, type PersonalIncomeResult } from './personalincome';
import { decideAction, type AutonomyLevel } from './autonomy';
import { studentLoanForSA, type StudentPlan } from './nistudentloan';

export interface OptimiserInput {
  startYear: number;
  monthsElapsed: number; // full months into the tax year, for projection confidence
  ytdTradeIncome: number;
  ytdTradeExpenses: number;
  ytdCisSuffered: number;
  employmentIncome: number; // annual PAYE salary, 0 if none
  // The student loan plans he is on. CIS is credited against income tax, Class 4 AND the student
  // loan on the real return, so a refund figure that ignores the loan promises him money he will
  // not get. Default [] so a caller that has no plans behaves exactly as before.
  studentPlans?: StudentPlan[];
  categoriesLogged: string[]; // distinct trade expense categories seen this year, lowercased
  homeOfficeClaimed: boolean;

  // 🔴 HAS HE ELECTED THE TRADING ALLOWANCE FOR THIS YEAR. ITTOIA 2005 Part 6A; HMRC BIM86015.
  //
  // Optional and defaulting to false, so every caller written before it existed behaves exactly as
  // it did, to the penny. It is a BOOLEAN and not an amount: the amount is FACTS.tradingAllowance,
  // watched nightly, and a figure captured here would go stale the day HMRC moved it.
  //
  // ⚠️ IT IS NOT A DEDUCTION THAT ADDS. It REPLACES his expenses, his mileage and the use of home
  // flat rate with one flat figure (GOV.UK: "You cannot deduct any other expenses or allowances if
  // you claim the allowances"), which is why it cannot simply be another field in tradeNetOf.
  tradingAllowanceElected?: boolean;
  // The £ of use of home he has actually accrued this year, from his election. Realised, never
  // projected: lib/elections.ts useOfHomeToDate() counts only months that have happened. Default 0
  // means no election, which is what a man who has never been asked has.
  ytdHomeOffice?: number;
  mileageClaimed: boolean;
  purchaseGoal?: { title: string; amount: number } | null;

  // 🔴 THE MILEAGE ALREADY INSIDE ytdTradeExpenses, CARRIED SEPARATELY SO THE LEDGER CAN NAME IT.
  //
  // A mileage claim is inserted as an ordinary transaction (vendor 'Mileage', category 'travel', a
  // negative amount), so its £ value is ALREADY counted in ytdTradeExpenses and already reducing his
  // tax. This field does NOT add anything. It says how much of that total was mileage, so the ledger
  // can show it on its own line instead of burying it in "Costs you logged".
  //
  // ⚠️ NEVER ADD THIS TO ytdTradeExpenses. It is a slice of that number, not an addition to it. The
  // ledger subtracts it from the expenses line and shows it separately, and the total is unchanged
  // to the penny. Adding it would overstate what we saved him, which is the one direction of error
  // this product does not get to make twice.
  //
  // Default 0, so a caller that does not compute it behaves exactly as before.
  ytdMileage?: number;

  // 🔴 THE USE OF HOME ALREADY INSIDE ytdTradeExpenses, AND THE REASON A MAN WAS DEDUCTED TWICE.
  //
  // ytdHomeOffice above is what he ELECTED. This is what he TEXTED: app/api/whatsapp/route.ts
  // handleHomeOffice writes a real transaction, vendor 'Use of home', which lands in
  // ytdTradeExpenses like any other cost. A man who did both got the same deduction twice, and
  // lib/ledger.ts said in its own comment that this could not happen because "use of home cannot
  // be inside expenses". It could, and it was.
  //
  // ⚠️ NEVER ADD THIS TO ytdTradeExpenses. It is a slice of that number, exactly like ytdMileage.
  // The rule both consumers follow: take this OUT of expenses, then put the election back in, and
  // where there is no election the logged rows ARE the claim so they go back in instead. That way
  // the deduction lands once whichever door he used, and nobody who already had it loses it.
  //
  // Default 0, so a caller that does not compute it behaves exactly as before.
  ytdHomeOfficeLogged?: number;
  // Property stream this year, for the property levers. Default 0.
  ytdPropertyIncome?: number;
  ytdPropertyExpenses?: number;

  // THE REST OF HIS INCOME, so the tax we show is his WHOLE tax and not just his trade. Default 0,
  // which means a caller that has not captured these behaves exactly as before: no savings, no
  // dividends, and the figure is the sole-trader figure. Employment is already carried above.
  //   savingsIncome    bank/building-society interest (NOT ISAs, which are tax free)
  //   dividendIncome   dividends, e.g. from his own company
  savingsIncome?: number;
  dividendIncome?: number;

  // WHAT HE HAS TOLD US ABOUT HIMSELF. { married: 'yes', partner_low_earner: 'no', ... }
  //
  // Optional, and absent means UNKNOWN, never NO. A caller that has not read the circumstances gets
  // exactly the behaviour it got before this field existed: the conditional wording, no promise, no
  // suppression. Silence from a caller must never be mistaken for an answer from a man.
  circumstances?: Record<string, string>;

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 HOW HE TRADES, AND WHETHER HE TRADES AT ALL. THIS FILE HAD NEITHER UNTIL 31 JULY 2026.
  //
  // Found by audit: grep this file for businessType or structure before that date and there was
  // nothing. So rule 4 below offered "Claim use of home", with a real pounds figure against it, to
  // a limited company director and to a landlord with no trade. Neither can claim a penny of it.
  // The flat rate is a SIMPLIFIED EXPENSE under ITTOIA 2005 s94H, which is a deduction in computing
  // the profits of a TRADE, and HMRC BIM75010 restricts it to individuals and to partnerships of
  // individuals. lib/elections.ts holds the rule, the two sources and the refusal sentences.
  //
  // ⚠️ THE RULE IS RESTATED HERE RATHER THAN IMPORTED, AND THAT IS NOT A CHOICE. Three test suites
  // stage this module into a temp directory with a fixed list of dependencies, because Node's type
  // stripping cannot resolve an extensionless relative import. Importing lib/elections.ts here
  // would break them on a module resolution error rather than on anything real. lib/circumstances.ts
  // and lib/persona.ts re-declare the same two literal unions for the same reason, and the tests
  // pin them against each other so they cannot drift apart in silence.
  //
  // BOTH OPTIONAL AND BOTH DEFAULTING TO UNDEFINED, which is UNKNOWN, which is refused nothing. A
  // caller that does not set them behaves exactly as it did before they existed. That direction is
  // deliberate and it is the same one lib/elections.ts takes: a director shown a lever he cannot
  // pull is a wrong sentence he can ignore, and a sole trader silently denied the flat rate because
  // a profile read failed is money off his return every month with nothing to show him why.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  businessType?: 'sole_trader' | 'partnership' | 'limited_company' | null;
  incomeShape?: 'trade' | 'property_only' | null;
}

export interface Optimisation {
  key: string;
  title: string;
  detail: string; // plain English, with the user's own numbers
  estSaving: number; // estimated £ saved this year, 0 when not quantifiable
  action: string; // maps to lib/autonomy classifyAction
  info?: boolean; // pure information, nothing to action (e.g. a refund building)
}

function round(n: number): number {
  return Math.round(Number.isFinite(n) ? n : 0);
}

// The rate the next pound of profit is taxed at (income tax plus Class 4 NI),
// which is what each pound of extra allowable deduction actually saves. Mirrors
// lib/agent.ts so a saving quoted here matches a saving quoted there.
export function marginalRate(projectedTotalIncome: number): number {
  if (projectedTotalIncome >= FACTS.personalAllowanceTaperFloor) return 0.62; // taper: 40 + 2 + 20
  if (projectedTotalIncome >= FACTS.class4UpperLimit) return 0.42; // 40 + 2
  if (projectedTotalIncome > FACTS.personalAllowance) return 0.26; // 20 + 6
  return 0;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE USE OF HOME, COUNTED ONCE, WHICHEVER DOOR HE CAME THROUGH.
//
// There are two doors and they used to be added together. An ELECTION (lib/elections.ts, his hours
// band turned into pounds a month) fills ytdHomeOffice. TEXTING his hours writes a real transaction,
// vendor 'Use of home', which lands inside ytdTradeExpenses like any other cost and fills
// ytdHomeOfficeLogged. A man who did both was deducted twice, and lib/ledger.ts carried a comment
// arguing that could not happen.
//
// THE RULE: take what he LOGGED out of expenses, always; then the deduction is what he ELECTED if
// there is an election, and what he logged if there is not.
//
// ⚠️ IT LIVES IN ONE FUNCTION HERE AND IN ONE EXPRESSION IN lib/ledger.ts ledgerFor(), and it is
// spelled the same way in both ON PURPOSE. It cannot be shared: three test suites stage this module
// into a temp directory with a fixed dependency list, because Node's type stripping cannot resolve
// an extensionless relative import, so a lib module may not take a new lib import. lib/persona.ts
// and lib/circumstances.ts re-declare shared literals for exactly the same reason. test/ledger.test.mjs
// runs the same grid of figures through both modules and fails if the two answers ever part company.
//
// ⚠️ WHICH WAY EACH MAN'S MONEY MOVES. Elected only: unchanged. Texted only: the same total to the
// penny, because it comes off the expenses and goes straight back on as the claim. Both: counted
// once, at the election, which is the authoritative figure. The duplicate goes; the deduction stays.
// ═════════════════════════════════════════════════════════════════════════════════════════════
export function homeOfficeParts(
  input: { ytdHomeOffice?: number; ytdHomeOfficeLogged?: number },
): { logged: number; deduction: number } {
  const logged = Math.max(0, input.ytdHomeOfficeLogged ?? 0);
  // A zero election is no election: useOfHomeToDate only ever accrues months that have happened,
  // so reading it this way costs nobody a penny and keeps the rule to one line.
  return { logged, deduction: Math.max(0, input.ytdHomeOffice ?? 0) || logged };
}

// His TRADE profit as the tax engines should see it: what he took in, less what he spent, with the
// use of home landing exactly once. Realised, never projected. Floored at zero, because a loss is
// carried, not refunded, and this file has never modelled loss relief.
function tradeNetOf(input: OptimiserInput): number {
  const home = homeOfficeParts(input);
  return Math.max(0, input.ytdTradeIncome - (input.ytdTradeExpenses - home.logged) - home.deduction);
}

// HIS WHOLE TAX, not just his trade. The figure an accountant puts at the bottom of the return:
// income tax across employment, self-employment, property, savings and dividends, stacked in the
// legal order (lib/personalincome.ts), plus Class 4 NIC on the trade. Projected to the full year the
// same way the levers are, and it says so, because a projection dressed as a fact is a lie. When the
// only income is a trade it equals soleTraderTax, so nothing an existing user sees moves.
export function taxPosition(
  input: OptimiserInput,
): PersonalIncomeResult & {
  projected: boolean;
  employmentTax: number;
  selfAssessmentTax: number;
  studentLoan: number;
  setAside: number;
  companyProfitExcluded: number;
} {
  // 🔴 THE USE OF HOME NOW REACHES THIS FIGURE AT ALL. ytdHomeOffice was declared on OptimiserInput
  // and read NOWHERE in this file, so a man who made the election saw not one penny come off the
  // number the app prints in its largest type. tradeNetOf() applies it, once, by the rule above.
  // His set aside FALLS, which is the correct direction: it is a deduction he is entitled to and
  // was already being shown on his ledger.
  const tradeNet = tradeNetOf(input);
  const canProject = input.monthsElapsed >= 3;
  const factor = canProject ? 12 / Math.max(1, input.monthsElapsed) : 1;

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE TRADING ALLOWANCE LANDS AFTER THE PROJECTION, AND GETTING THAT BACKWARDS WOULD HAVE
  // HANDED HIM AN ALLOWANCE OF £4,000 IN MONTH THREE.
  //
  // Every other figure in this function is a year to date amount multiplied up by 12/months. The
  // trading allowance is not that shape: it is ONE FLAT £1,000 for the whole tax year, whether he
  // is three months in or eleven. Subtracting it from the year to date figure and then projecting
  // would multiply the allowance by the same factor as the money, so a man three months into the
  // year would have been given four times the relief the law allows. The temptation to put it
  // inside tradeNetOf, where the use of home already sits, is exactly that mistake.
  //
  // So: project his GROSS trade income the way everything else is projected, then take the flat
  // allowance off the annual figure once.
  //
  // ⚠️ AND HIS COSTS DROP OUT ENTIRELY WHEN HE HAS ELECTED, which is the whole meaning of the
  // election and the reason lib/elections.ts refuses to offer it without both totals side by side.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const projTradeNet = input.tradingAllowanceElected
    ? Math.max(0, (Math.max(0, input.ytdTradeIncome) * factor) - FACTS.tradingAllowance)
    : tradeNet * factor;
  const propertyNet = Math.max(0, (input.ytdPropertyIncome ?? 0) - (input.ytdPropertyExpenses ?? 0)) * factor;
  const employment = Math.max(0, input.employmentIncome);

  // ═════════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 A COMPANY'S PROFIT IS NOT THE DIRECTOR'S INCOME, AND THIS FUNCTION USED TO CHARGE HIM
  // INCOME TAX AND CLASS 4 NATIONAL INSURANCE ON IT.
  //
  // This file had no idea what businessType was. So a director's company profit went in as
  // `selfEmployment`, which is the one slot that carries Class 4, and the answer became the headline
  // "put by for tax" figure in the largest type on the screen. It is the wrong tax, on the wrong
  // person, in the wrong entity: a company's trading profit is chargeable to CORPORATION TAX in the
  // company (CTA 2009 s2 charges the tax on a company's profits, s35 charges the profits of its
  // trade), and what reaches him personally is his salary and his dividends, which this function
  // already counts and taxes correctly.
  //
  // ⚠️ THE HARD PART IS NOT THE ARITHMETIC, IT IS WHICH WAY TO BE WRONG, so here is the reasoning.
  //
  // Simply deleting the profit makes his number much smaller, and a man who reads a smaller number
  // sets aside less. If he then owed that tax, we would have caused the harm we exist to prevent.
  // So the question is not "is the old figure too big", it is "is there any reading of a personal
  // set aside under which a company's trading profit belongs in it". There is not. He does not pay
  // it. His company does, on its own accounting period, at its own rate, on its own return, and
  // it is due nine months and a day after the company's year end rather than on 31 January. Every
  // component of the old number was wrong: the taxpayer, the tax, the rate and the date. A figure
  // that is right by accident is not a figure, and this one was not even that.
  //
  // The rest of this codebase's rule is that we would rather say something honest and incomplete
  // than a confident wrong number, and that an unknown is never treated as an answer. Both point
  // the same way here, because this is not an unknown: businessType === 'limited_company' is
  // something he told us at signup. So the engine does not produce a personal set aside from
  // company profit AT ALL, and it does not go quiet about it either: `companyProfitExcluded` carries
  // the profit that was left out, and setAsideBasisLine() below turns it into a sentence, so no
  // surface can print a smaller number with nothing to explain it. Saying "your company's own
  // Corporation Tax is not in this" is the honest incomplete answer. The old figure was the
  // confident wrong one.
  //
  // ⚠️ ONLY AN EXPLICIT COMPANY LOSES ANYTHING. undefined and null are unknown, and unknown behaves
  // exactly as it did before this existed, to the penny, which is the same direction
  // app/app/tax/page.tsx already takes when it withholds the MTD row from a director: hiding a real
  // obligation from a sole trader because a profile read timed out is by far the worse failure.
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  const isCompany = input.businessType === 'limited_company';
  const personalTradeNet = isCompany ? 0 : projTradeNet;
  const companyProfitExcluded = isCompany ? round(projTradeNet) : 0;

  const result = combinedIncomeTax({
    employment,
    selfEmployment: personalTradeNet,
    otherNonSavings: propertyNet,
    savings: Math.max(0, input.savingsIncome ?? 0),
    dividends: Math.max(0, input.dividendIncome ?? 0),
  });

  // WHAT SELF ASSESSMENT ACTUALLY COLLECTS, which is not the whole bill.
  //
  // result.totalTax is his WHOLE income tax plus Class 4. But his employer already takes the tax on
  // his salary off the payslip through PAYE every month. If we told him to set aside the whole
  // number he would be setting aside tax that has already left his wages, and putting by far too
  // much of his trade income. So the set-aside, and the January bill, is the whole tax MINUS the
  // income tax PAYE already covers on the salary alone. Class 4 stays in full: it is only ever
  // collected through Self Assessment, never the payslip.
  //
  // Salary-alone income tax is the right stand-in for PAYE: it is what a tax code on that salary
  // deducts across the year. Any extra tax on the salary caused by the rest of his income losing him
  // his personal allowance is a real Self Assessment liability, and this subtraction leaves it in,
  // exactly as HMRC would. When the salary is zero this term is zero and the SA figure equals the
  // whole bill, so nothing moves for a pure sole trader.
  const employmentTax = employment > 0 ? combinedIncomeTax({ employment }).incomeTax.total : 0;
  const selfAssessmentTax = Math.max(0, round(result.totalTax - employmentTax));

  // ═════════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE STUDENT LOAN, WHICH THIS FUNCTION USED TO LEAVE OUT OF A NUMBER CALLED "WHAT SELF
  // ASSESSMENT COLLECTS".
  //
  // Self Assessment collects it. A self employed man's repayment is not taken as he goes, it lands
  // in one lump with the January bill, and /student-loan-checker says on the live site that most tax
  // apps forget student loans exist and then January arrives. selfAssessmentTax above forgot it too.
  //
  // ⚠️ selfAssessmentTax IS LEFT EXACTLY AS IT WAS, and the loan is added as its own field beside
  // it. /api/optimise already publishes this object and the phone app already renders it, so
  // quietly moving a figure a customer may be looking at is not a change to make inside a dashboard
  // build. setAside is the honest total and the new surfaces read that.
  //
  // studentLoanForSA is the same function lib/agent.ts uses for the January rehearsal, so the
  // dashboard and the WhatsApp reply are working from one piece of arithmetic. It nets off whatever
  // payroll has already taken on the salary, which is why the salary goes in rather than being
  // ignored.
  //
  // The trade profit is the projected one, matching every other figure here, and property is left
  // out on purpose: whether rental profit counts towards a repayment depends on the unearned income
  // rules, and there is no sourced constant in this codebase for them. An understatement we can
  // explain beats a confident figure we cannot.
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  //
  // ⚠️ AND IT IS personalTradeNet, NOT projTradeNet, FOR THE SAME REASON. A director's company
  // profit is not self employed income, so it cannot be what his student loan is charged on. What
  // reaches him personally as dividends may count as unearned income above the £2,000 line, and
  // there is no sourced constant for that rule in this codebase, so it is left out and said so,
  // exactly as property is left out two paragraphs up. An understatement we can explain beats a
  // confident figure we cannot.
  const plans = input.studentPlans ?? [];
  const studentLoan = plans.length > 0 ? round(studentLoanForSA(personalTradeNet, employment, plans)) : 0;

  return {
    ...result,
    projected: canProject,
    employmentTax: round(employmentTax),
    selfAssessmentTax,
    studentLoan,
    // The company profit deliberately left out of every figure above. 0 for everybody else, so it
    // is never a line on a sole trader's screen. See the note above it.
    companyProfitExcluded,
    // ONE HONEST NUMBER. Doc 103: the screen a man opens to find out what he owes gets one figure,
    // not a stack he has to add up himself.
    setAside: selfAssessmentTax + studentLoan,
  };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHAT IS IN THE SET ASIDE FIGURE, IN WORDS, BECAUSE THE NUMBER ON ITS OWN LOOKS WRONG.
//
// Found on the deployed Overview on 30 July 2026. The screen said "Put by for tax £26,579", and
// directly underneath it "Profit £12,307". Both were correct and together they were unreadable: the
// £26,579 is his WHOLE personal tax across a salary, dividends, savings and a projected full year of
// trade, and the £12,307 is his business profit so far. Nothing on the screen said so, and a man
// who cannot reconcile two of our numbers stops believing both of them.
//
// lib/ledger.ts's header is the standard this fails: he should be able to check our working. So the
// figure names its own ingredients, and it names them HERE rather than in a React file, for the same
// reason lib/announcements.ts holds its own wording: what we are willing to claim about a man's tax
// is not a presentation decision.
//
// ⚠️ IT ONLY EVER LISTS A STREAM HE ACTUALLY HAS. For a pure sole trader the answer is one word,
// because listing "your wages" at zero is a line he has to read and reject on the one screen he came
// to for a number.
// ═════════════════════════════════════════════════════════════════════════════════════════════
export function setAsideBasis(input: OptimiserInput): string[] {
  // 🔴 THE BUSINESS IS NAMED ONLY WHEN THE FIGURE ACTUALLY CONTAINS ONE. It was seeded here
  // unconditionally while every other stream had a guard, so a customer whose whole business is
  // letting read "It covers your business and your rent" about a business he has not got, on four
  // surfaces, under the one number he came to the screen for. The comment directly above this
  // function already stated the rule it was breaking.
  //
  // TWO WAYS THERE IS NO BUSINESS IN THE FIGURE, and this list has to match taxPosition() exactly,
  // because a sentence that does not describe the number above it is worse than no sentence:
  //   NO TRADE INCOME CONFIRMED. A landlord, or a brand new account. Nothing of a trade is in it.
  //   A LIMITED COMPANY. His company's profit is excluded on purpose, see taxPosition(). What is
  //   left in the figure is his salary and his dividends, and those name themselves below.
  const hasTrade =
    Math.max(0, input.ytdTradeIncome) > 0 && input.businessType !== 'limited_company';
  const parts: string[] = hasTrade ? ['your business'] : [];
  if (Math.max(0, input.employmentIncome) > 0) parts.push('your wages');
  if (Math.max(0, (input.ytdPropertyIncome ?? 0) - (input.ytdPropertyExpenses ?? 0)) > 0) parts.push('your rent');
  if (Math.max(0, input.dividendIncome ?? 0) > 0) parts.push('your dividends');
  if (Math.max(0, input.savingsIncome ?? 0) > 0) parts.push('your savings interest');
  return parts;
}

// "your business, your wages and your dividends". An Oxford comma is not house style and a list of
// one must not come back with an "and" hanging off it.
export function inPlainList(parts: string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

// The sentence under the big number. Null when there is nothing worth explaining, which is a pure
// sole trader with no job and no dividends: for him the figure is simply his business's tax and
// saying so adds a line without adding a fact.
export function setAsideBasisLine(
  input: OptimiserInput,
  position: { studentLoan: number; employmentTax: number; companyProfitExcluded?: number },
): string | null {
  const parts = setAsideBasis(input);

  // ═════════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 A DIRECTOR IS TOLD WHAT IS NOT IN THE NUMBER, ALWAYS, AND BEFORE ANYTHING ELSE.
  //
  // taxPosition() refuses to charge him income tax and Class 4 on his company's profit, which is
  // right and which makes his figure much smaller than it was. A smaller number with no explanation
  // is the one way that fix could do harm: he reads it, sets aside less, and nothing on the screen
  // ever mentions the Corporation Tax his company still owes. So the engine that dropped the profit
  // is the thing that says so, in one sentence, on every surface that renders this line.
  //
  // ⚠️ AND IT OVERRIDES THE SILENCE BELOW RATHER THAN JOINING THE LIST. A director with no salary
  // and no dividends captured has an EMPTY list, and the guards below would return null and leave
  // the smaller number standing on its own with nothing beside it. The rest of the sentence is
  // still built normally around it, because his payslip has still paid some of what is left.
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  const excludedCompanyProfit = Math.max(0, position.companyProfitExcluded ?? 0) > 0;

  if (parts.length === 0 && !excludedCompanyProfit) return null;
  if (!excludedCompanyProfit && parts.length < 2 && position.studentLoan <= 0 && position.employmentTax <= 0) return null;
  // ⚠️ "and your savings interest and your student loan" is two ANDs in one sentence, which is how
  // the first version read on a real account. The loan is not another income stream, it is another
  // thing the January bill collects, so it joins with "plus" rather than pretending to be one.
  let line = parts.length > 0 ? `It covers ${inPlainList(parts)}` : '';
  if (line) line += position.studentLoan > 0 ? ', plus your student loan.' : '.';
  // ⚠️ AND IT SAYS WHAT HAS ALREADY BEEN PAID, or a man with a job reads this as a bill on top of
  // the tax his payslip has been taking all year.
  if (position.employmentTax > 0) {
    line += `${line ? ' ' : ''}The tax your wages have already paid through your payslip is taken off.`;
  }
  if (excludedCompanyProfit) {
    line += `${line ? ' ' : ''}Your company's profit is not in it. A company pays Corporation Tax on its own return, and this figure is your personal tax on what you take out.`;
  }
  return line;
}

// The common allowable costs a tradesperson usually has. Missing two or more of
// these while trading is a strong signal of unclaimed, tax-reducing spend.
const COMMON_COSTS = ['fuel', 'phone', 'insurance', 'tools'];

// Find every lever, richest first. Pure: same input, same list.
export function findOptimisations(input: OptimiserInput): Optimisation[] {
  const out: Optimisation[] = [];

  // The same trade profit taxPosition() works from, use of home applied once. Two functions in one
  // file that disagree about one man's profit is how this file's own bugs get written.
  const tradeNet = tradeNetOf(input);
  const canProject = input.monthsElapsed >= 3;
  const factor = canProject ? 12 / Math.max(1, input.monthsElapsed) : 1;
  const projTradeNet = tradeNet * factor;
  const propIncome = Math.max(0, input.ytdPropertyIncome ?? 0);
  const propExpenses = Math.max(0, input.ytdPropertyExpenses ?? 0);
  // 🔴 AND HIS RENT IS IN IT. His projected income across every stream we know about. Employment was
  // always here; savings and dividends were added so the marginal-rate levers below judge his rate on
  // his WHOLE income; property was left out, and it was read fourteen lines later in the same
  // function, so a landlord with a small trade had his levers priced at a rate his rent had already
  // pushed him past. taxPosition() has always counted it. Now they agree.
  //
  // ⚠️ NET, AND PROJECTED WITH THE SAME factor THE TRADE USES, because that is exactly what
  // taxPosition() does with it, and the two figures have to describe the same man.
  //
  // WHOSE SUGGESTIONS THIS MOVES, all through marginalRate(): pension_higher_rate, aia_timing,
  // missed_expenses, home_office and both marriage allowance cards. A landlord's rate can now only
  // go UP, so a quoted saving gets bigger and a lever that was silent may start speaking. Nothing
  // is taken away from anybody: a man with no property is unchanged to the penny.
  const projPropertyNet = Math.max(0, propIncome - propExpenses) * factor;
  const projTotalIncome =
    projTradeNet +
    projPropertyNet +
    Math.max(0, input.employmentIncome) +
    Math.max(0, input.savingsIncome ?? 0) +
    Math.max(0, input.dividendIncome ?? 0);
  const mRate = marginalRate(projTotalIncome);
  const cats = input.categoriesLogged.map((c) => c.toLowerCase());

  // 1. Pension to step back out of the 40% band. The biggest lever for a higher
  //    earner. Irreversible (moving money), so it can only ever be drafted.
  if (projTotalIncome > FACTS.class4UpperLimit) {
    const over = round(projTotalIncome - FACTS.class4UpperLimit);
    const saving = round(over * 0.2); // higher-rate relief on income pulled below the threshold
    out.push({
      key: 'pension_higher_rate',
      title: 'Step out of the 40% band',
      detail: `Your income is heading about £${over.toLocaleString('en-GB')} into the 40% higher rate. A pension contribution of up to that amount brings you back under and can save up to about £${saving.toLocaleString('en-GB')} in higher-rate tax. Your provider sets the amount. We are not a financial adviser, you decide.`,
      estSaving: saving,
      action: 'make_payment',
    });
  }

  // 2. Buying a planned asset before 5 April, so the whole cost lands this year
  //    under the Annual Investment Allowance. Irreversible (a purchase): draft only.
  const g = input.purchaseGoal;
  if (g && g.amount > 0 && mRate > 0) {
    const saving = round(g.amount * mRate);
    out.push({
      key: 'aia_timing',
      title: `Timing on ${g.title}`,
      detail: `If you buy ${g.title} (about £${round(g.amount).toLocaleString('en-GB')}) before 5 April, the whole cost comes off this year's tax under the Annual Investment Allowance, saving about £${saving.toLocaleString('en-GB')} at your rate. You choose when to buy.`,
      estSaving: saving,
      action: 'purchase',
    });
  }

  // 3. Costs the user is likely paying but not logging. Reversible admin: at the
  //    auto level Lekhio can prompt for these itself.
  const missing = COMMON_COSTS.filter((c) => !cats.includes(c));
  if (input.ytdTradeIncome > 0 && missing.length >= 2 && mRate > 0) {
    out.push({
      key: 'missed_expenses',
      title: 'Costs you may not be claiming',
      detail: `You have nothing logged this year for ${missing.join(', ')}. If you pay for these for work, logging them lowers your tax: every £100 of allowable cost saves about £${round(100 * mRate)} at your rate. Snap the receipts or text them and Lekhio sorts the rest.`,
      estSaving: 0,
      action: 'log_entry',
    });
  }

  // 4. Use of home. A flat rate with no receipts, missed by almost everyone.
  //
  // 🔴 BUT NOT OFFERED TO A MAN WHO CANNOT TAKE IT. See the businessType and incomeShape notes on
  // OptimiserInput: the flat rate is a simplified expense under ITTOIA 2005 s94H, so a limited
  // company is outside it (BIM75010) and a property business is not a trade. Written as two
  // inequalities rather than a membership test ON PURPOSE, so undefined and null both fall through
  // to the old behaviour. Only a KNOWN company and a KNOWN landlord are ever refused.
  const canClaimSimplifiedExpenses =
    input.businessType !== 'limited_company' && input.incomeShape !== 'property_only';
  if (!input.homeOfficeClaimed && canClaimSimplifiedExpenses && projTradeNet > 0 && mRate > 0) {
    const monthly = homeOfficeFlatRateMonthly(25); // the 25 to 50 hours a month band
    const saving = round(monthly * 12 * mRate);
    out.push({
      key: 'home_office',
      title: 'Claim use of home',
      detail: `Do your quotes, invoices or admin from home? You can claim a flat £${monthly} a month with no receipts to keep. Over a year that is about £${saving.toLocaleString('en-GB')} off your tax.`,
      estSaving: saving,
      action: 'apply_allowance_election',
    });
  }

  // 5. Mileage instead of fuel, where they log fuel but no miles. Cannot quantify
  //    without the miles, so it is a prompt, not a number.
  if (!input.mileageClaimed && (cats.includes('fuel') || cats.includes('van')) && projTradeNet > 0) {
    out.push({
      key: 'mileage',
      title: 'Claim your mileage',
      detail: `You are logging fuel but no mileage. For a van or car you can often claim more by logging miles at 55p a mile for the first 10,000 instead. Text "log 24 miles" whenever you drive for work.`,
      estSaving: 0,
      action: 'log_entry',
    });
  }

  // 6. A CIS refund building. Pure information, no action, but a big reassurance
  //    for subbies who overpay through the year.
  const taxDue = soleTraderTax(tradeNet).total;
  // CIS pays off the student loan too. See the note in lib/agent.ts.
  const slDue =
    (input.studentPlans ?? []).length > 0
      ? studentLoanForSA(tradeNet, input.employmentIncome, input.studentPlans as StudentPlan[])
      : 0;
  const owedSoFar = taxDue + slDue;
  if (input.ytdCisSuffered > owedSoFar && input.ytdCisSuffered > 0) {
    const refund = round(input.ytdCisSuffered - owedSoFar);
    out.push({
      key: 'cis_refund',
      title: 'A CIS refund is building',
      detail: `Contractors have deducted about £${round(input.ytdCisSuffered).toLocaleString('en-GB')} of CIS tax from you, more than the £${round(owedSoFar).toLocaleString('en-GB')} your profit owes so far. The difference, about £${refund.toLocaleString('en-GB')}, comes back when you file. Keep every deduction statement.`,
      estSaving: 0,
      info: true,
      action: 'confirm_prompt',
    });
  }

  // 7. Incorporation. The question every higher earner eventually asks. We answer
  //    it honestly from our own maths rather than reflexively pushing a company.
  //    On 2026/27 rates a sole trader who draws all their profit is usually better
  //    off, so at a profit where the question is live we say so, name the figure,
  //    and flag the one thing that flips it (leaving money in the business). If
  //    the maths ever favours a company for this user, the message flips. Pure
  //    information, never summed into the headline (estSaving 0); accountant note
  //    on both sides because it is a structural decision with real admin.
  if (projTradeNet >= 50000) {
    const comp = compare(Math.round(projTradeNet));
    const profitStr = round(projTradeNet).toLocaleString('en-GB');
    if (comp.winner === 'ltd' && comp.delta >= 1000) {
      out.push({
        key: 'incorporation',
        title: 'A limited company could save you tax',
        detail: `At your projected profit of about £${profitStr}, running as a limited company could leave roughly £${round(comp.delta).toLocaleString('en-GB')} more in your pocket a year, mostly through the lower tax on dividends. It adds filing and admin duties, so it is a real decision. Speak to an accountant before you switch, we can show them your numbers.`,
        estSaving: 0,
        info: true,
        action: 'confirm_prompt',
      });
    } else {
      const gap = Math.max(0, round(-comp.delta));
      out.push({
        key: 'incorporation',
        title: 'Should you go limited? Not yet',
        detail: `People ask us this a lot at your level. On this year's rates, staying a sole trader is currently the better deal for you by about £${gap.toLocaleString('en-GB')} a year, because you draw all your profit out and dividend tax has risen. A limited company starts to pay off when you leave money in the business rather than taking it all. If that changes, we will tell you. Our free sole trader against limited tool shows the full picture, and any accountant can talk it through.`,
        estSaving: 0,
        info: true,
        action: 'confirm_prompt',
      });
    }
  }

  // 8. Property costs. Rental income with almost no expenses logged means likely
  //    unclaimed deductions (mortgage interest for the 20% credit, repairs, agent
  //    fees, insurance). Reversible admin: a prompt to log them.
  //    (propIncome and propExpenses are read at the top of this function now, because his rent
  //    belongs in projTotalIncome and they were being declared after the figure that needed them.)
  if (propIncome > 0 && propExpenses < propIncome * 0.1) {
    out.push({
      key: 'property_costs',
      title: 'Property costs you may not be claiming',
      detail: `You have rental income but very little logged against it. Mortgage interest (a 20% tax credit), repairs, agent fees, insurance and ground rent all reduce your property tax. Log them and Lekhio applies the £1,000 property allowance or your actual costs, whichever leaves you better off.`,
      estSaving: 0,
      action: 'log_entry',
    });
  }

  // ═════════════════════════════════════════════════════════════════════════════════════════════
  // 8b. THE £1,000 PROPERTY ALLOWANCE AGAINST HIS ACTUAL COSTS, SAID OUT LOUD.
  //
  // Found by walking a landlord persona on the live site, 31 July 2026. The signup reveal told her
  // the rental allowance "reaches back 4 years, we handle this one", and then Ways to save said
  // "Nothing to suggest". Both sentences were individually defensible and together they were a
  // broken promise: the one screen whose job is to show the working never mentioned the one relief
  // she was promised.
  //
  // ⚠️ THE COMPARISON IS THE ENGINE'S, NOT OURS. propertyProfit() in lib/propertyengine.ts already
  // decides allowance against actuals and writes the reason in plain English, and this lever
  // repeats that sentence verbatim, then adds where the figures came from, because every figure
  // carries its basis. When he has confirmed rent, the engine speaks about HIS numbers. When we
  // only hold the flag (he ticked rental property at signup, or said yes to the rental question),
  // there are no numbers to speak about and the card says exactly that instead of estimating.
  //
  // ⚠️ estSaving IS 0 IN EVERY BRANCH, ON PURPOSE. The allowance is applied by the engine when the
  // figures are computed, not unlocked by him doing something, so a pounds figure here would be
  // counted twice the day anything sums these. info: true, a thing worth knowing, never a promise.
  //
  // ⚠️ AND 'no' SUPPRESSES THE FLAG BRANCH, THE SAME RULE AS MARRIAGE BELOW: only an explicit yes
  // opens the card, silence stays silent. Confirmed rent beats the flag either way, because money
  // he has logged is a fact whatever he answered.
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  // Which schedule applies. startYear 2027 onward is the post Budget property schedule; the
  // allowance itself is £1,000 in both years, but the year label must never be guessed.
  const propYear: PropertyTaxYear = input.startYear >= 2027 ? '2027-28' : '2026-27';
  const propAllowanceStr = PROPERTY_FACTS[propYear].propertyAllowance.toLocaleString('en-GB');
  const rentalSaidYes = (input.circumstances ?? {}).rental === 'yes';
  if (propIncome > 0) {
    const split = propertyProfit(propIncome, propExpenses, propYear);
    out.push({
      key: 'property_allowance',
      title: `The £${propAllowanceStr} property allowance, or your actual costs`,
      detail:
        `${split.note} Worked out on the £${round(propIncome).toLocaleString('en-GB')} of rent and `
        + `£${round(propExpenses).toLocaleString('en-GB')} of property costs you have confirmed this year.`,
      estSaving: 0,
      info: true,
      action: 'confirm_prompt',
    });
  } else if (rentalSaidYes) {
    out.push({
      key: 'property_allowance',
      title: `The £${propAllowanceStr} property allowance, or your actual costs`,
      detail:
        `You told us you have rental property. Rent is kept in its own stream, taxed its own way, `
        + `and once your rent and property costs are in, Lekhio takes the £${propAllowanceStr} property `
        + `allowance or your actual costs, whichever leaves you better off. No property figures are `
        + `logged yet, so there is no number to show you.`,
      estSaving: 0,
      info: true,
      action: 'log_entry',
    });
  }

  // ═════════════════════════════════════════════════════════════════════════════════════════════
  // MARRIAGE ALLOWANCE. £252 a year, and the whole point of having asked him anything.
  //
  // Until we had the facts, this block could only ever say "IF you are married, and IF they earn
  // little, THEN...". It said that to every man, married or not, for ever. Doc 103 calls that the
  // empty test: a row that does not apply to him most of the time teaches him to stop reading, and
  // then he misses the week it does apply.
  //
  // Now we have asked. So there are exactly three states, and the difference between them is the
  // difference between a tool and a leaflet:
  //
  //   HE SAID NO       -> say NOTHING. He is not married. It is not a relief, it is clutter.
  //   HE HAS NOT SAID  -> exactly what we did before: the conditional wording, and £0 in the total.
  //   HE SAID YES      -> the condition is gone, so we can finally be specific about HIS situation.
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  const circ = input.circumstances ?? {};
  const married = circ.married;                       // 'yes' | 'no' | 'skip' | undefined
  const partnerLow = circ.partner_low_earner;         // 'yes' | 'no' | 'skip' | undefined
  const ma = marriageAllowance(projTotalIncome);

  // ⚠️ 'no' SUPPRESSES. 'skip' AND undefined DO NOT.
  //
  // "Not now" is not "no". A man who would not answer has not told us he is single, and treating his
  // silence as a denial quietly deletes £252 a year from a married man's product and he never learns
  // it was there. Only an explicit no closes the door, which is exactly why the answer column is
  // text and not a boolean.
  const notMarried = married === 'no';

  if (!notMarried && ma.role === 'receiver') {
    // He earns between the personal allowance and the higher rate threshold, so he is the one who
    // can RECEIVE. Whether there is anything to receive turns entirely on what she earns.
    const confirmed = married === 'yes' && partnerLow === 'yes';
    const ruledOut = married === 'yes' && partnerLow === 'no';

    if (!ruledOut) {
      out.push({
        key: 'marriage_allowance_receive',
        title: confirmed
          ? `Your partner can hand you £${ma.worth}. They have to be the one to do it.`
          : 'If your wife or husband earns little, they can hand you £252',
        detail: confirmed
          ? // THE CONDITION IS GONE. He told us he is married and that she earns under the allowance,
            // we logged both answers in his own words, and now we may finally say "can" instead of "if".
            `You told me you are married and that they earn under £${FACTS.personalAllowance.toLocaleString('en-GB')}. `
            + `That means they can transfer £${ma.transfer.toLocaleString('en-GB')} of their tax free allowance to you, `
            + `worth £${ma.worth} off your bill every year, and they can backdate it four years. `
            + `⚠️ THEY have to make the claim, not you and not me. HMRC will not accept it from the partner receiving it. `
            + `Ten minutes at gov.uk/marriage-allowance, and they need both of your National Insurance numbers. Nothing else. No certificate.`
          : `If you are married or in a civil partnership and they earn under £${FACTS.personalAllowance.toLocaleString('en-GB')} a year, `
            + `they can transfer £${ma.transfer.toLocaleString('en-GB')} of their tax free allowance to you. `
            + `That is £${ma.worth} off your tax bill, every year, and it can be backdated four years. `
            + `THEY have to make the claim, not you. HMRC will not take it from the receiving partner. `
            + `It takes about ten minutes at gov.uk/marriage-allowance and you need both National Insurance numbers.`,

        // ⚠️ THE ONE PLACE IN THIS FILE WHERE A CIRCUMSTANCE BECOMES A NUMBER.
        //
        // estSaving feeds totalEstimatedSaving(), and a total is a promise. It was 0 here from the
        // day this block was written, on purpose, because £252 hung on a fact we did not have. We
        // have it now: he was asked, in plain words, and his answer is on the record with the exact
        // question he read next to it.
        //
        // So it goes in the total ONLY when both facts are yes. Not on a skip. Not on a guess. Not
        // on his income alone. This is the difference between the maximiser and a repayment agent.
        estSaving: confirmed ? ma.worth : 0,
        info: !confirmed,
        action: 'log_entry',
      });
    }
  }

  if (!notMarried && ma.role === 'giver') {
    // He is under his own personal allowance, so part of it is going to waste. HE is the transferor,
    // and the transferor is the one HMRC takes the claim from. This is the ONE branch of Marriage
    // Allowance where our own customer is the claimant, which makes it the one we can actually walk
    // him through instead of handing off.
    //
    // But he is only the giver if she has tax to pay. If she is under the allowance too, neither of
    // them pays a penny of income tax and there is nothing to transfer to. Say nothing at all: an
    // optimisation that cannot possibly save him money is an advert.
    const bothSkint = married === 'yes' && partnerLow === 'yes';

    if (!bothSkint) {
      const askedAndMarried = married === 'yes';
      out.push({
        key: 'marriage_allowance_give',
        title: 'You are not using all of your tax free allowance',
        detail:
          `You are on course to earn under £${FACTS.personalAllowance.toLocaleString('en-GB')}, so part of your tax free allowance is going to waste. `
          + (askedAndMarried
            ? `You told me you are married, so you can transfer £${ma.transfer.toLocaleString('en-GB')} of it to them, `
            : `If you are married or in a civil partnership, you can transfer £${ma.transfer.toLocaleString('en-GB')} of it to them, `)
          // ⚠️ THE CONDITION WE HAVE NOT ASKED ABOUT IS WELDED TO THE SENTENCE, NOT DROPPED.
          //
          // A higher rate partner cannot receive it. We never asked whether she is a higher rate
          // payer, only whether she is under the allowance, so we do not know, so we say so in the
          // same breath and we do NOT quantify it. The moment we start filling gaps with optimism
          // this becomes a leaflet.
          + `as long as they pay basic rate tax and not higher rate. `
          + `It saves THEM about £${ma.worth} a year and costs you nothing, because you were not going to use it. `
          + `You are the one who has to apply, and that is the good news: gov.uk/marriage-allowance, ten minutes, both National Insurance numbers.`,
        estSaving: 0, // The saving lands on HER bill, not his. It is not his money, so it is not his total.
        info: true,
        action: 'log_entry',
      });
    }
  }

  // Richest quantified saving first; information items sink to the bottom.
  return out.sort((a, b) => b.estSaving - a.estSaving);
}

// The headline number: the total quantified saving on the table this year.
export function totalEstimatedSaving(opts: Optimisation[]): number {
  return opts.reduce((s, o) => s + Math.max(0, o.estSaving), 0);
}

export interface DialledOptimisation extends Optimisation {
  mode: 'auto' | 'draft' | 'suggest'; // what Lekhio may do about it at the user's dial setting
  requiresApproval: boolean; // always true for the money levers
}

// Apply the autonomy dial to each lever. The money levers (pension, purchase)
// come back requiresApproval true and mode never 'auto', enforced in lib/autonomy.
export function applyDial(opts: Optimisation[], level: AutonomyLevel): DialledOptimisation[] {
  return opts.map((o) => {
    const d = decideAction(o.action, level);
    return { ...o, mode: d.mode, requiresApproval: d.requiresApproval };
  });
}

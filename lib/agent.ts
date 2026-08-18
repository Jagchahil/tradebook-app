// The Agentic Accountant v1: the deterministic signal engine (doc 84).
//
// Pure functions only: no network, no database, no AI. The nightly cron feeds
// each user's aggregates in, this returns the signals that should be active,
// with rendered copy. Every threshold comes from the canonical engines
// (taxengine, nistudentloan), never re hardcoded here. Unit tested in
// test/agent.test.mjs, same discipline as waintents.
//
// Doctrine, enforced in the copy: the agent suggests, never executes. No
// certainty claims. Category level guidance only, never named credit, car or
// finance products (the FCA line, doc 82 section 5). Visibly automated.
// Writing rule: no em dashes, no en dashes anywhere, including every message.

import { FACTS, soleTraderTax, homeOfficeFlatRateMonthly, mtdPosition, paymentsOnAccount } from './taxengine';
import { studentLoanForSA, STUDENT_PLANS, type StudentPlan } from './nistudentloan';
import { aprilDelta, PROPERTY_FACTS } from './propertyengine';
import { chaseMessage } from './waintents';
import { savingsMoves, type Move } from './rakhamoves';
import { computePosition, type BusinessType, type OwnerInput } from './position';
import { gbp0 } from './money';
import { SCOTLAND_LINE } from './scotland';

// --- Input ---------------------------------------------------------------------

export interface MonthTotals {
  month: string; // 'YYYY-MM'
  income: number; // confirmed income in the month
  expenses: number; // confirmed expenses in the month, positive number
  cis: number; // CIS deducted in the month
}

export interface UserGoal {
  id: string;
  kind: 'purchase' | 'income' | 'savings';
  title: string; // the user's own words
  amount: number;
  targetDate: string | null; // YYYY-MM-DD
}

// WHAT HIS BUSINESS INCOME ACTUALLY IS, re-declared here rather than imported from lib/persona.ts.
//
// ⚠️ THE IMPORT WOULD NOT BE FREE. test/agent.test.mjs and test/agentstructure.test.mjs both stage
// this module into a temp directory with a FIXED list of dependencies, because Node's type stripping
// cannot resolve an extensionless relative import, so a new import here breaks both suites on a
// module resolution error rather than on anything real. lib/circumstances.ts, lib/persona.ts,
// lib/elections.ts and lib/taxoptimiser.ts all re-declare the same literal union for the same
// reason. The strings are the ones lib/supabase.ts getBusinessProfile() hands back, and
// test/wave9_nudges.test.mjs pins them against lib/persona.ts so they cannot drift apart in silence.
export type IncomeShape = 'trade' | 'property_only';

export interface AgentInput {
  today: Date;
  // Confirmed monthly totals for the trailing 12 calendar months including the
  // current partial month, oldest first. Missing months may be omitted.
  months: MonthTotals[];
  // Confirmed totals for the trailing 7 days, for the Monday brief. Null when
  // the aggregates RPC predates the week extension; week based signals skip.
  week: { income: number; expenses: number; activeDays: number } | null;
  // The property stream this tax year (doc 82 s4/s5d). Null when the RPC
  // predates the split; landlord signals then skip and VAT uses gross income.
  property: { rents: number; expenses: number; finance: number; rents12: number } | null;
  // Overdue invoices for the chaser (doc 82 s5e item 3), oldest first, capped
  // by the caller. Null skips; the link is the public invoice page.
  invoices: Array<{ id: string; number: string; customer: string; total: number; daysOver: number; link: string }> | null;
  // Distinct trade expense categories this tax year, lowercased. Null skips
  // the completeness check (old RPC).
  categories: string[] | null;
  unconfirmedCount: number;
  // Equipment and tools spend this tax year (confirmed, category tools or equipment).
  equipmentSpendYtd: number;
  studentLoanPlan: StudentPlan | null; // undergraduate plan or null
  studentLoanPostgrad: boolean;
  employmentIncome: number; // annual PAYE salary saved on the account, 0 if none
  // Active goals (doc 82 section 5b). Empty array when none.
  goals: UserGoal[];

  // --- Structure (doc: structure-aware returns, 19 Jul). All optional and defaulting to the
  // sole-trader case, so an existing caller that omits them gets EXACTLY the old behaviour. The route
  // fills them from the user's profile so a limited company owner gets the right brain.
  businessType?: BusinessType; // 'sole_trader' (default) | 'limited_company' | 'partnership'
  dividendIncome?: number;     // dividends the owner draws (a company) or holds (other)
  savingsIncome?: number;      // savings interest, for the whole-person stack
  married?: boolean;           // for the Marriage Allowance move
  spouseHasSpareAllowance?: boolean; // their spouse earns under the personal allowance
  // A partner's percentage share of the partnership profit, 1 to 100, as captured at setup
  // (users.partnership_share, the same field getOptimiserInput already scales by). Defaults to 100,
  // the stored default, which treats the whole profit as theirs until they tell us otherwise.
  // Ignored for every other structure, so a sole trader cannot be accidentally halved.
  partnershipShare?: number;

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 WHETHER HMRC HAS WRITTEN TO HIM ABOUT MAKING TAX DIGITAL. HIS ANSWER, NOT OUR ARITHMETIC.
  //
  // This engine watches THIS year's money, and HMRC decides mandation from a return already filed
  // (2024/25 for April 2026), then writes to the people it has assessed. So two signals in this
  // file were stating a legal conclusion off a figure that cannot support one: mtd_mandation and
  // mtd_combined_trap both opened "Making Tax Digital applies to you" on year to date or projected
  // gross. They now describe the figure, name the real test, and ask him.
  //
  // ⚠️ REQUIRED, NOT OPTIONAL, and both routes that build an AgentInput were named by tsc for it.
  // Optional-with-a-default is how this codebase wrote the projection bug twice: it keeps the old
  // behaviour alive for whoever did not read the memo, silently, for ever.
  //
  // ⚠️ IT IS THE RAW ANSWER RATHER THAN A CALL INTO lib/circumstances.ts, ON PURPOSE. Two suites
  // stage this module with a FIXED dependency list and Node's type stripping cannot resolve an
  // extensionless import, so a new import here breaks both on module resolution rather than on
  // anything real. The routes map the answer with mtdStatedFrom() before it gets here.
  mtdStated: 'yes' | 'no' | null;

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE SELF ASSESSMENT BILL, FROM THE ONE ENGINE THAT KNOWS WHAT RENT IS. R2-F23, 13 Aug 2026.
  //
  // poa_cliff used to work this out for itself, as soleTraderTax(projectAnnual(d.ytdProfit)), and
  // derive() below blends every stream into a single profit. For a sole trader that is correct, and
  // it is what every parity suite pins. For a sole trader who is ALSO a landlord it is wrong twice
  // over: Class 4 National Insurance is charged on rental profit, which carries none, and the
  // £1,000 property allowance never lands, so GROSS rent is taxed.
  //
  // A florist walking production was texted "your Self Assessment bill is heading for about £1,708"
  // at 08:00 on 13 August. /app/tax said £1,171 thirty five minutes later, off the same books.
  // £394.15 of that gap was National Insurance on her rent, on a trade profit of £7,896 that owes
  // no Class 4 at all. The other £142.85 was the property allowance never being taken off.
  //
  // ⚠️ AND IT WAS NOT A WRONG SENTENCE, IT WAS A WRONG BUTTON. The signal carries a set_aside
  // action, so a customer doing the sensible thing put £537 of working capital aside for a bill
  // that does not exist. The doctrine block further down this file predicted exactly this ("a set
  // aside that is double what he owes") and gated poa_cliff off for LIMITED COMPANIES on 30 July
  // for the same class of error. Nobody asked the reverse question about landlords.
  //
  // So this number is no longer computed here. Both routes call taxPosition() on
  // getOptimiserInput(), the SAME two calls /app/tax makes to draw its own headline, and pass the
  // answer in. The phone and the page cannot drift apart again because they are one function call.
  //
  // ⚠️ REQUIRED, NOT OPTIONAL, for exactly the reason mtdStated above is: optional-with-a-default
  // keeps the old behaviour alive, silently, for whoever did not read the memo.
  //
  // ⚠️ NULL MEANS "COULD NOT BE COMPUTED", AND FOR A CUSTOMER WITH RENT NULL FIRES NOTHING. A trade
  // only customer falls back to the old arithmetic, which taxPosition equals to the penny for him
  // ("When the only income is a trade it equals soleTraderTax", lib/taxoptimiser.ts), so no
  // existing user's figure moves. No signal beats a wrong signal, every time.
  //
  // ⚠️ AND IT IS A NUMBER RATHER THAN AN IMPORT OF lib/taxoptimiser.ts, ON PURPOSE, for the same
  // reason mtdStated is a raw answer: two suites stage this module with a FIXED dependency list and
  // Node's type stripping cannot resolve an extensionless import, so a new import here would break
  // them on module resolution rather than on anything real.
  selfAssessmentBill: number | null;

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE PAYMENTS ON ACCOUNT BASE, WHICH IS NOT THE BILL ABOVE, AND NO ARITHMETIC ON THE BILL CAN
  // RECOVER IT. B30, 18 August 2026.
  //
  // gov.uk, derived live on 18 August from the Self Assessment Legal Framework manual SALF303:
  // "Capital gains tax and student loan repayments are excluded from the computation of payments on
  // account. So any capital gains tax or Student Loan repayment is simply payable as part of the
  // balancing payment on 31 January following the tax year." Class 4 National Insurance IS
  // included. The public page says the identical thing from the other side: the BALANCING payment
  // "will also include anything you owe for capital gains or student loans (if you're self
  // employed)".
  //
  // So January is TWO numbers with two different rules. The bill above is the balancing payment and
  // it correctly carries the loan. What HMRC asks for ON ACCOUNT is half the tax with the loan
  // taken out, and until today this engine worked it out as half the bill. A borrower was charged
  // half his student loan a year before HMRC will ask for it, and the error is always exactly half
  // his projected repayment.
  //
  // ⚠️ IT IS A SEPARATE FIELD RATHER THAN A SUBTRACTION HERE, because the loan inside the bill is
  // invisible from this file: the bill arrives as one number from taxPosition() and nothing about
  // it says how much of it is loan. tax is taxPosition().selfAssessmentTax, which has excluded the
  // loan since it was written; deductedAtSource is taxPosition().cisSuffered. Those are the exact
  // two arguments app/app/tax/page.tsx has passed to paymentsOnAccount() since 11 August, so the
  // page and the 08:00 text are now one function call, the way the bill already is.
  //
  // ⚠️ NULL MEANS "COULD NOT BE COMPUTED", AND A NULL BASE FIRES NOTHING. It deliberately does NOT
  // fall back to halving the bill: that fallback is the defect, and keeping it alive for whoever
  // did not read the memo is how a defect survives a fix. No signal beats a wrong signal, every
  // time. The trade only fallback below has its own pair (projTax and projCis) and never needs it.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  selfAssessmentPoa: { tax: number; deductedAtSource: number } | null;

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE SECOND AXIS: WHETHER HE TRADES AT ALL, WHICH businessType CANNOT ANSWER.
  //
  // A man who signs up through the Landlord chip is stored as a sole trader, because he files a
  // personal return and he is not a company, so he cleared every structure guard in this file and
  // was handed the whole trade corpus. See PROPERTY_ONLY_SUPPRESSED_SIGNALS below for what that
  // cost him, and lib/persona.ts for the trade provisions this axis exists to withhold with their
  // sources.
  //
  // OPTIONAL AND DEFAULTING TO UNDEFINED, WHICH IS UNKNOWN, WHICH IS REFUSED NOTHING. A caller that
  // never sets it gets exactly the output it got before this field existed, and only a KNOWN
  // 'property_only' ever has a signal withheld. That direction is the same one lib/taxoptimiser.ts
  // and lib/elections.ts take, and NIM74250 is why it is the right one: a guest house or a hotel IS
  // a trade, so an absence of information is never evidence of letting.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  incomeShape?: IncomeShape | null;

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 IS HE ALREADY VAT REGISTERED? WE WERE PUSHING "GO AND REGISTER" AT MEN WHO DID YEARS AGO.
  //
  // Found by auditing VAT on 31 July 2026. The vat_approach signal below computed its three tiers
  // from TURNOVER ALONE, because this field did not exist. Above the threshold it fires at ping
  // priority, which is a paid WhatsApp template, and it says "You have crossed the VAT threshold"
  // and "You normally have 30 days from the end of the month you crossed in to register".
  //
  // That reaches every VAT registered customer over the threshold, which is everyone who had to
  // register compulsorily, which is the core of this audience. It costs him nothing and it costs us
  // his trust in every other number in the app.
  //
  // lib/weeklyupdate.ts had this right all along (`if (haveTurnover && !input.vatRegistered)`), so
  // two paths disagreed and the wrong one was the one that spends money to send.
  //
  // ⚠️ FALSE IS THE SAFE DEFAULT HERE, AND IT IS THE ONE DEFAULT ON THIS INPUT THAT IS A VALUE
  // RATHER THAN A NULL. Treating unknown as registered would silence the warning for a man heading
  // straight past the threshold, and missing that has a date on it and costs him real money.
  // lib/weeklyupdate.ts makes the same call in the same words, deliberately.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  vatRegistered?: boolean;
}

export type SignalPriority = 'ping' | 'card';

// A prepared action a card can offer (doc 95 Phase 1.5). Rakha only ever
// PREPARES: the user taps to carry it out, and anything irreversible (sending to
// a customer) is a device action the user triggers by hand in their own
// messenger. Nothing here bypasses the approval gate.
export type AgentAction =
  | { kind: 'invoice_chase'; invoiceId: string; invoiceNumber: string; customer: string; total: number; link: string; draft: string }
  | { kind: 'set_aside'; amount: number; label: string }   // set a savings TARGET, never a transfer, Lekhio holds no money
  | { kind: 'open_confirm'; count: number };                // one tap to the entries that need a yes

export interface AgentSignal {
  signalKey: string;
  periodKey: string;
  priority: SignalPriority;
  title: string;
  body: string; // the in app card body
  waText: string; // the WhatsApp line pair, used to fill the approved template
  numbers: Record<string, number>; // the figures behind it, for the payload
  action?: AgentAction; // an optional one-tap prepared action for the card
}

// When the daily or weekly ping caps bite, higher priority wins. Doc 84 section 2,
// goal signals added per doc 82 section 5b. The threshold combo outranks nearly
// everything: one suggestion that solves two problems is the flagship moment.
export const PING_PRIORITY_ORDER: string[] = [
  'mtd_combined_trap',
  'mtd_mandation',
  'invoice_chase',
  'pa_taper',
  'goal_threshold_combo',
  'poa_cliff',
  'vat_approach',
  'class2_pension_year',
  'goal_purchase_timing',
  'aia_timing',
  'quarter_unconfirmed',
];

export const PING_CAP_PER_DAY = 1;
export const PING_CAP_PER_WEEK = 3;

// --- Date helpers ----------------------------------------------------------------

// The UK tax year containing d starts on 6 April.
export function taxYearStart(d: Date): Date {
  const y = d.getUTCMonth() > 3 || (d.getUTCMonth() === 3 && d.getUTCDate() >= 6) ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return new Date(Date.UTC(y, 3, 6));
}

export function taxYearLabel(d: Date): string {
  const s = taxYearStart(d);
  return `${s.getUTCFullYear()}-${String((s.getUTCFullYear() + 1) % 100).padStart(2, '0')}`;
}

export function taxYearEnd(d: Date): Date {
  const s = taxYearStart(d);
  return new Date(Date.UTC(s.getUTCFullYear() + 1, 3, 5));
}

const DAY_MS = 86400000;

// MTD quarterly periods: 6 Apr to 5 Jul, 6 Jul to 5 Oct, 6 Oct to 5 Jan, 6 Jan to 5 Apr.
export function mtdQuarter(d: Date): { label: string; end: Date } {
  const s = taxYearStart(d);
  const y = s.getUTCFullYear();
  const ends = [
    new Date(Date.UTC(y, 6, 5)),
    new Date(Date.UTC(y, 9, 5)),
    new Date(Date.UTC(y + 1, 0, 5)),
    new Date(Date.UTC(y + 1, 3, 5)),
  ];
  for (let i = 0; i < 4; i++) {
    if (d <= ends[i]) return { label: `${taxYearLabel(d)}Q${i + 1}`, end: ends[i] };
  }
  return { label: `${taxYearLabel(d)}Q4`, end: ends[3] };
}

// --- Aggregation helpers ----------------------------------------------------------

function monthDate(m: string): Date {
  return new Date(`${m}-01T00:00:00Z`);
}

function inTaxYear(m: string, today: Date): boolean {
  const d = monthDate(m);
  const s = taxYearStart(today);
  // A month belongs to the tax year if any part of it does; April is split, and
  // counting April with the year that starts in it is the convention we use for
  // monthly buckets everywhere (close enough for signals, exact for filings later).
  return d >= new Date(Date.UTC(s.getUTCFullYear(), 3, 1)) && d <= taxYearEnd(today);
}

export interface Derived {
  ytdIncome: number;
  ytdExpenses: number;
  ytdProfit: number;
  ytdCis: number;
  rolling12Income: number;
  monthsElapsed: number; // full months since the tax year started
  daysElapsed: number;
  daysInYear: number;
}

export function derive(input: AgentInput): Derived {
  const { today, months } = input;
  const start = taxYearStart(today);
  const end = taxYearEnd(today);
  let ytdIncome = 0;
  let ytdExpenses = 0;
  let ytdCis = 0;
  let rolling12Income = 0;
  for (const m of months) {
    rolling12Income += Math.max(0, m.income);
    if (inTaxYear(m.month, today)) {
      ytdIncome += Math.max(0, m.income);
      ytdExpenses += Math.max(0, m.expenses);
      ytdCis += Math.max(0, m.cis);
    }
  }
  const daysElapsed = Math.max(1, Math.floor((today.getTime() - start.getTime()) / DAY_MS) + 1);
  const daysInYear = Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;
  const monthsElapsed = Math.floor(daysElapsed / 30.44);
  return {
    ytdIncome,
    ytdExpenses,
    ytdProfit: Math.max(0, ytdIncome - ytdExpenses),
    ytdCis,
    rolling12Income,
    monthsElapsed,
    daysElapsed,
    daysInYear,
  };
}

// Projected annual figure from the year to date, by days elapsed. Only
// meaningful after three months of the year have run; callers must check
// monthsElapsed >= 3 before trusting it (computeSignals does).
export function projectAnnual(ytd: number, d: Derived): number {
  return Math.round((ytd / d.daysElapsed) * d.daysInYear);
}

// One formatter, in lib/money.ts. This used to print "£-4,200" for a projected loss.
const gbp = (n: number) => gbp0(n);

// --- The engine -------------------------------------------------------------------

export function computeSignals(input: AgentInput): AgentSignal[] {
  const d = derive(input);
  const today = input.today;
  const year = taxYearLabel(today);
  const canProject = d.monthsElapsed >= 3;
  const projProfit = canProject ? projectAnnual(d.ytdProfit, d) : 0;
  const projIncome = canProject ? projectAnnual(d.ytdIncome, d) : 0;
  const salary = Math.max(0, input.employmentIncome);
  const plans: StudentPlan[] = [];
  if (input.studentLoanPlan) plans.push(input.studentLoanPlan);
  if (input.studentLoanPostgrad) plans.push('postgrad');

  const out: AgentSignal[] = [];

  // --- Goal derived figures, computed early because goal aware signals
  // supersede their generic cousins: a suggestion tied to the user's own plan
  // beats a generic one, and firing both would be noise.
  const hrBoundary = FACTS.class4UpperLimit; // 50,270, where 40% starts
  const taxDueYtd = soleTraderTax(d.ytdProfit).total;
  // What the business has cleared after tax this year: the honest goal pot.
  const potNow = Math.max(0, d.ytdProfit - taxDueYtd);
  const purchaseGoals = input.goals.filter((g) => g.kind === 'purchase');
  // The rate the NEXT pound of profit is taxed at (income tax plus Class 4),
  // which is exactly what a deductible purchase saves per pound.
  const projTotalIncome = canProject ? projProfit + salary : 0;
  const marginalRate = !canProject
    ? 0
    : projTotalIncome >= FACTS.personalAllowanceTaperFloor
      ? 0.62 // 40% + 2% Class 4 + the allowance taper's extra 20 points
      : projTotalIncome >= hrBoundary
        ? 0.42 // 40% + 2%
        : projTotalIncome > FACTS.personalAllowance
          ? 0.26 // 20% + 6%
          : 0;
  let goalComboFired = false;
  let goalTimingFired = false;

  // G1. The flagship: heading over a threshold AND an open purchase goal that
  // would bring them back under. One suggestion, two problems solved.
  if (canProject && projTotalIncome > hrBoundary) {
    const overshoot = Math.round(projTotalIncome - hrBoundary);
    const fix = purchaseGoals.find((g) => g.amount >= overshoot);
    if (fix && overshoot >= 500) {
      goalComboFired = true;
      out.push({
        signalKey: 'goal_threshold_combo',
        periodKey: `${year}#g${fix.id.slice(0, 8)}`,
        priority: 'ping',
        title: 'Your goal could solve a tax problem',
        body: `At your current pace your income lands about ${gbp(overshoot)} over ${gbp(hrBoundary)}, where 40% tax starts. Your goal "${fix.title}" (${gbp(fix.amount)}) is a deductible business purchase: made this tax year it brings you back under the line AND you get the thing you were saving for. Two birds, one van. A suggestion from your numbers, not advice. You decide.`,
        waText: `your income is heading ${gbp(overshoot)} over the 40% line, and your goal "${fix.title}" would bring you back under if bought this tax year`,
        numbers: { overshoot, boundary: hrBoundary, goalAmount: fix.amount },
      });
    }
  }

  // G2. Purchase timing near year end: the goal aware version of the AIA nudge,
  // with the real after tax cost at the user's marginal rate.
  {
    const yearEndG = taxYearEnd(today);
    const daysToEndG = Math.floor((yearEndG.getTime() - today.getTime()) / DAY_MS);
    if (daysToEndG <= 56 && daysToEndG >= 0 && canProject && marginalRate > 0) {
      const g = purchaseGoals.find((x) => input.equipmentSpendYtd < x.amount && projProfit - x.amount > FACTS.personalAllowance);
      if (g) {
        goalTimingFired = true;
        const realCost = Math.round(g.amount * (1 - marginalRate));
        out.push({
          signalKey: 'goal_purchase_timing',
          periodKey: `${year}#g${g.id.slice(0, 8)}`,
          priority: 'ping',
          title: `"${g.title}" costs less before 5 April`,
          body: `Bought before 5 April, "${g.title}" comes off THIS year's profit under the Annual Investment Allowance. At your rate the ${gbp(g.amount)} really costs you about ${gbp(realCost)} after the tax saving. Buy it a week into April and the saving waits a year. Only for kit you genuinely need. A suggestion from your numbers, not advice. You decide.`,
          waText: `your goal "${g.title}" saves more before 5 April: at your rate the ${gbp(g.amount)} really costs about ${gbp(realCost)} after tax`,
          numbers: { amount: g.amount, realCost, marginalRatePct: Math.round(marginalRate * 100), daysToEnd: daysToEndG },
        });
      }
    }
  }

  // G3. The pot passed the goal: once per goal per year.
  for (const g of input.goals) {
    if (potNow >= g.amount) {
      out.push({
        signalKey: 'goal_within_reach',
        periodKey: `${year}#g${g.id.slice(0, 8)}`,
        priority: 'card',
        title: `"${g.title}" is within reach`,
        body: `What your business has cleared after tax this year (${gbp(potNow)}) now covers your goal "${g.title}" (${gbp(g.amount)}). Whether now is the moment is yours to call, but the money side is there.`,
        waText: `your after tax earnings this year (${gbp(potNow)}) now cover your goal "${g.title}"`,
        numbers: { pot: potNow, goalAmount: g.amount },
      });
    }
  }

  // G4. Monthly progress while a goal is still short. A dated goal gets the
  // weekly pacing; an undated goal still gets its gentle monthly pulse.
  if (canProject) {
    const monthKeyNow = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}`;
    for (const g of input.goals) {
      if (potNow >= g.amount) continue;
      const target = g.targetDate ? new Date(`${g.targetDate}T00:00:00Z`) : null;
      if (target && target <= today) continue;
      const gap = g.amount - potNow;
      const weeksLeft = target ? Math.max(1, Math.round((target.getTime() - today.getTime()) / (7 * DAY_MS))) : 0;
      const perWeek = target ? Math.ceil(gap / weeksLeft) : 0;
      out.push({
        signalKey: 'goal_progress',
        periodKey: `${monthKeyNow}#g${g.id.slice(0, 8)}`,
        priority: 'card',
        title: `"${g.title}": ${gbp(potNow)} of ${gbp(g.amount)} covered`,
        body: target
          ? `Towards "${g.title}" by ${target.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}: your after tax earnings this year cover ${gbp(potNow)} of the ${gbp(g.amount)}. Clearing about ${gbp(perWeek)} a week from here gets you there on time.`
          : `Towards "${g.title}": your after tax earnings this year cover ${gbp(potNow)} of the ${gbp(g.amount)}. ${gbp(gap)} to go. Give it a date in Money, Goals and I will pace it for you week by week.`,
        waText: target
          ? `"${g.title}": ${gbp(potNow)} of ${gbp(g.amount)} covered, about ${gbp(perWeek)} a week keeps you on track`
          : `"${g.title}": ${gbp(potNow)} of ${gbp(g.amount)} covered, ${gbp(gap)} to go`,
        numbers: target ? { pot: potNow, goalAmount: g.amount, perWeek, weeksLeft } : { pot: potNow, goalAmount: g.amount, gap },
      });
    }
  }

  // 1. VAT registration threshold, rolling 12 months, three tiers.
  // Residential rent is exempt from VAT, so the property stream is excluded
  // from the taxable turnover test once the RPC provides the split.
  const vat = FACTS.vatRegistrationThreshold;
  const vatTurnover = Math.max(0, d.rolling12Income - (input.property?.rents12 ?? 0));
  const vatPct = vatTurnover / vat;
  const vatTier = vatPct >= 1 ? 3 : vatPct >= 0.9 ? 2 : vatPct >= 0.8 ? 1 : 0;
  // 🔴 AND NOT ONE WORD OF IT TO A MAN WHO IS ALREADY REGISTERED. Every tier of this signal tells
  // him something about registering, and the top one tells him he has 30 days to do a thing he did
  // years ago. See AgentInput.vatRegistered for what it was doing before this line existed.
  if (vatTier > 0 && !input.vatRegistered) {
    out.push({
      signalKey: 'vat_approach',
      periodKey: `${year}#t${vatTier}`,
      priority: vatTier >= 2 ? 'ping' : 'card',
      title:
        vatTier === 3
          ? 'You have crossed the VAT threshold'
          : `You are at ${Math.floor(vatPct * 100)}% of the VAT threshold`,
      body:
        vatTier === 3
          ? `Your rolling 12 month turnover is ${gbp(vatTurnover)}, over the ${gbp(vat)} VAT registration threshold. You normally have 30 days from the end of the month you crossed in to register. Worth acting on now.`
          : `Your rolling 12 month turnover is ${gbp(vatTurnover)}. VAT registration becomes required at ${gbp(vat)}. Knowing early gives you choices: timing of invoices, the flat rate scheme, or planning for the price change.`,
      waText:
        vatTier === 3
          ? `your rolling 12 month turnover (${gbp(vatTurnover)}) has crossed the ${gbp(vat)} VAT threshold`
          : `your rolling 12 month turnover (${gbp(vatTurnover)}) is ${Math.floor(vatPct * 100)}% of the ${gbp(vat)} VAT threshold`,
      numbers: { rolling12: vatTurnover, threshold: vat, pct: Math.floor(vatPct * 100) },
    });
  }

  // 2. MTD mandation, on gross qualifying income (trade PLUS property, the
  // combined test) against the current threshold. When the combination alone
  // is what crosses the line, the sharper combined trap signal replaces this.
  const mtdThreshold = FACTS.mtdThreshold2026; // widen by year at the next Budget update
  const rentsYtd = input.property?.rents ?? 0;
  const tradeGrossYtd = Math.max(0, d.ytdIncome - rentsYtd);
  const combinedTrap = rentsYtd > 0 && tradeGrossYtd < mtdThreshold && d.ytdIncome >= mtdThreshold;
  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 🔴 HIS OWN ANSWER SILENCES BOTH MTD SIGNALS, AND IT HAS TO.
  //
  // He told us HMRC has not written to him. Sending "Making Tax Digital applies to you" to that
  // man is the product arguing with the customer about a fact only he holds, on WhatsApp, where he
  // cannot see our reasoning. And a man who told us it DID come already knows: a ping explaining
  // his own answer back to him is doc 103's empty test with a notification attached.
  //
  // ⚠️ SO BOTH SIGNALS ARE FOR THE UNSTATED MAN ONLY, and for him they ask rather than conclude.
  // ⚠️ AND SILENCE IS NOT THE FAILURE MODE HERE: the question itself still reaches every sole
  // trader through unansweredMtd(), whatever his figures, so nobody goes unasked.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  const mtdUnstated = mtdPosition({
    excluded: false, stated: input.mtdStated, grossQualifyingIncome: 0, startYear: 2026,
  }) === 'unstated_under';
  if (combinedTrap && mtdUnstated) {
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // 🔴 THE SAME SIGNAL REACHES TWO DIFFERENT MEN, AND IT USED TO SPEAK TO ONLY ONE OF THEM.
    //
    // The condition is "trade under the line, trade plus rent over it", and a PURE LANDLORD meets
    // it with a trade of zero. He was then sent: "Your trade alone (£0) sits under the £50,000
    // level, but with £52,000 of rent the combined £52,000 crosses it. Most landlords with a day
    // trade miss this." He has no trade, no day trade, and no combination. Three sentences about a
    // business he does not have, telling him about the one obligation that genuinely is his.
    //
    // 🔴 THE SIGNAL IS NOT SUPPRESSED FOR HIM AND MUST NEVER BE. Making Tax Digital for Income Tax
    // counts qualifying income from self employment AND property, so a man letting for more than
    // the threshold with no trade at all is mandated. Filtering him out to dodge the wording would
    // take a real obligation off the only screen that was going to tell him about it.
    //
    // So the copy branches on whether he has a trade at all, and neither branch says anything the
    // other man's figures would make false. The trade branch still names both streams and both
    // figures, which is the whole point of the trap and what test/agent.test.mjs pins.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    const hasTrade = tradeGrossYtd > 0;
    out.push({
      signalKey: 'mtd_combined_trap',
      periodKey: year,
      priority: 'ping',
      title: hasTrade
        ? 'Your trade plus your rent crosses the MTD line together'
        : 'Your rent crosses the Making Tax Digital line on its own',
      // 🔴 THE TRAP IS STILL WORTH SENDING, AND IT NO LONGER CONCLUDES. What people genuinely miss
      // is that the two streams ADD UP, and that is a fact about the rule rather than about him, so
      // it survives whole. What went is "so it applies to you", which is HMRC's call off a return
      // already filed. The last sentence asks him the one question that settles it.
      body: hasTrade
        ? `Making Tax Digital counts trade and property income TOGETHER. Your trade alone (${gbp(tradeGrossYtd)}) sits under the ${gbp(mtdThreshold)} level, but with ${gbp(rentsYtd)} of rent the combined ${gbp(d.ytdIncome)} crosses it. It is the adding up that people miss, because each stream on its own looks safe. HMRC decides who is actually in it from a tax return you have already filed, not this year, and writes to you. Has that letter come?`
        : `Making Tax Digital counts property income, not just self employment. Your rent of ${gbp(rentsYtd)} is over the ${gbp(mtdThreshold)} level on its own. Plenty of landlords take it for granted that it is a thing for the self employed. HMRC decides who is actually in it from a tax return you have already filed, not this year, and writes to you. Has that letter come?`,
      waText: hasTrade
        ? `trade (${gbp(tradeGrossYtd)}) plus rent (${gbp(rentsYtd)}) crosses the ${gbp(mtdThreshold)} Making Tax Digital level combined, which most people miss. HMRC decides it from a return already filed and writes to you: has that letter come?`
        : `your rent (${gbp(rentsYtd)}) is over the ${gbp(mtdThreshold)} Making Tax Digital level on its own, and it counts property income just as it counts self employment. HMRC decides it from a return already filed and writes to you: has that letter come?`,
      numbers: { tradeGross: tradeGrossYtd, rents: rentsYtd, combined: d.ytdIncome, threshold: mtdThreshold },
    });
  }
  const mtdHit = !combinedTrap && mtdUnstated && (d.ytdIncome >= mtdThreshold || (canProject && projIncome >= mtdThreshold));
  if (mtdHit) {
    const crossedNow = d.ytdIncome >= mtdThreshold;
    out.push({
      signalKey: 'mtd_mandation',
      periodKey: year,
      priority: 'ping',
      // 🔴 THE TITLE WAS A VERDICT AND THIS ENGINE HAS NO STANDING TO GIVE ONE. "Making Tax Digital
      // applies to you" was pushed to a man's phone off his running total, and worse, off a
      // PROJECTION of his running total. HMRC decides it from a return already filed. The signal
      // now says what it can see, names the test, and asks the one question that settles it.
      title: 'One question about Making Tax Digital',
      body: crossedNow
        ? `Your gross income this tax year is ${gbp(d.ytdIncome)}, over the ${gbp(mtdThreshold)} Making Tax Digital level. That is this year though, and HMRC decides who is in it from a tax return you have already filed, then writes to you to say so. Has that letter come? Tell me and I will keep the right things ready. Either way your records build themselves.`
        : `At your current pace your gross income lands around ${gbp(projIncome)} this year, past the ${gbp(mtdThreshold)} Making Tax Digital level. HMRC decides who is actually in it from a tax return you have already filed rather than this one, and writes to you. Has that letter come? Nothing to panic about either way: your Lekhio records already fit the quarterly rhythm.`,
      waText: crossedNow
        ? `your gross income (${gbp(d.ytdIncome)}) has passed the ${gbp(mtdThreshold)} Making Tax Digital level. HMRC decides it from a return already filed and writes to you: has that letter come?`
        : `your income is on track for ${gbp(projIncome)}, past the ${gbp(mtdThreshold)} Making Tax Digital level. HMRC decides it from a return already filed and writes to you: has that letter come?`,
      numbers: { ytdIncome: d.ytdIncome, projected: projIncome, threshold: mtdThreshold },
    });
  }

  // 3. Higher rate approach, projected total income crossing the 40% boundary.
  // Superseded by the goal combo when it fires: same fact, better suggestion.
  if (!goalComboFired && canProject && projProfit + salary >= hrBoundary && d.ytdProfit + salary < hrBoundary * 1.5) {
    out.push({
      signalKey: 'higher_rate_approach',
      periodKey: year,
      priority: 'card',
      title: 'Heading into the 40% band',
      body: `At your current pace your income lands around ${gbp(projProfit + salary)} this year, past ${gbp(hrBoundary)} where 40% tax starts on the top slice. Options people use, all standard: pension contributions, bringing planned kit purchases forward, or simply knowing the set aside number is higher this year. Your set aside figure already accounts for it.`,
      waText: `your income is on track for ${gbp(projProfit + salary)}, into the 40% band above ${gbp(hrBoundary)}`,
      numbers: { projected: projProfit + salary, boundary: hrBoundary },
    });
  }

  // 4. Personal allowance taper at £100,000.
  const taper = FACTS.personalAllowanceTaperFloor;
  if (canProject && projProfit + salary >= taper) {
    out.push({
      signalKey: 'pa_taper',
      periodKey: year,
      priority: 'ping',
      title: 'The £100k allowance trap is in sight',
      body: `At your current pace your income lands around ${gbp(projProfit + salary)}. Above ${gbp(taper)} you lose £1 of personal allowance for every £2 of income, an effective 60% rate on that slice. Pension contributions are the standard, fully legitimate way to bring income back under it. Worth planning before year end, not after.`,
      waText: `your income is on track for ${gbp(projProfit + salary)}, above the ${gbp(taper)} allowance taper where the effective rate hits 60%`,
      numbers: { projected: projProfit + salary, taper },
    });
  }

  // 5. Class 2 pension year rescue, late in the year.
  const spt = FACTS.class2SmallProfitsThreshold;
  if (d.monthsElapsed >= 9 && d.ytdProfit < spt && salary < 6500) {
    const cost = Math.round(FACTS.class2WeeklyRate * 52 * 100) / 100;
    out.push({
      signalKey: 'class2_pension_year',
      periodKey: year,
      priority: 'ping',
      title: 'Your State Pension year is at risk',
      body: `Your profit this tax year is ${gbp(d.ytdProfit)}, under the ${gbp(spt)} mark, and no job is covering you. As it stands this year may not count towards your State Pension. Voluntary Class 2, about ${gbp(cost)} for the whole year, protects it. You need 35 qualifying years for the full pension, and missed years are expensive to fix later.`,
      waText: `profit so far is ${gbp(d.ytdProfit)}, under ${gbp(spt)}, so this year may not count for your State Pension. About ${gbp(cost)} of voluntary Class 2 protects it`,
      numbers: { ytdProfit: d.ytdProfit, threshold: spt, cost },
    });
  }

  // 6. Student loan starts building.
  if (plans.length > 0) {
    const slDue = studentLoanForSA(d.ytdProfit, salary, plans);
    if (slDue > 0) {
      const label = plans.map((p) => STUDENT_PLANS[p].label).join(' plus ');
      out.push({
        signalKey: 'sl_threshold_cross',
        periodKey: year,
        priority: 'card',
        title: 'Your student loan has started building',
        body: `Your income has passed your ${label} threshold, so ${gbp(slDue)} of repayment has started building towards the January bill. It is already inside your set aside number, so nothing to do, just know it is there.`,
        waText: `your income passed the ${label} threshold, ${gbp(slDue)} of loan repayment is building and is already in your set aside number`,
        numbers: { due: slDue },
      });
    }
  }

  // 7. Payments on account cliff.
  //
  // 🔴 R2-F23 IS CLOSED, AND CLOSING IT MEANT ADMITTING THERE ARE TWO NUMBERS HERE, NOT ONE. B30,
  // 18 August 2026. The comment this replaces said "the figure comes from the route now, not from
  // here", and it was true of the BILL and quietly false about the HALF: the half was still worked
  // out in this block, by dividing the bill in two. Half the right number is not the right number
  // when HMRC halves a different one. See selfAssessmentPoa on AgentInput for gov.uk's own words.
  //
  // The florist who started R2-F23 was texted £1,708 against a page reading £1,171. The customer
  // who finished it was texted a January of £15,738 against a page implying £15,099, and the £639
  // between them is exactly half his projected student loan repayment, asked for a year early.
  //
  // ⚠️ AND THE HALVING IS NOT ARITHMETIC THIS FILE DOES ANY MORE. lib/taxengine.ts
  // paymentsOnAccount() is the one engine, and /app/tax and /api/thread have both called it since
  // 11 August. It carries three things this block did not: the £1,000 test on the RELEVANT AMOUNT
  // rather than on the whole bill, the 80 percent deducted at source excuse that a CIS
  // subcontractor is the taxpayer it was written for, and the halving. The last of those matters
  // most here, because until today this engine texted two payments on account to a groundworker
  // whose contractors have already paid four fifths of his year. That is the identical defect Run 1
  // found on /app/tax on 11 August, fixed there, and nowhere else.
  if (canProject) {
    const projTax = soleTraderTax(projProfit).total;
    const projSl = plans.length > 0 ? studentLoanForSA(projProfit, salary, plans) : 0;
    const projCis = projectAnnual(d.ytdCis, d);
    const blendedBill = Math.max(0, projTax + projSl - projCis);
    // Rent is what makes the blend wrong, so rent is what withholds the fallback.
    const hasRent = (input.property?.rents ?? 0) > 0;
    // ⚠️ typeof AND isFinite, NOT `!== null`. The field is required in TypeScript, but the suites
    // that drive this engine are .mjs and tsc never sees them, so an object that simply omits it
    // arrives as undefined. `undefined !== null` is TRUE, which would have walked a NaN straight
    // into a customer's set aside. Anything that is not a real number takes the safe path.
    const given = input.selfAssessmentBill;
    const haveGiven = typeof given === 'number' && Number.isFinite(given);
    const estBill = haveGiven
      ? Math.max(0, given as number)
      : hasRent ? null : blendedBill;

    // THE BASE TRAVELS WITH THE BILL IT BELONGS TO. A route that hands in a bill hands in the base
    // beside it, from the same taxPosition() call, because the two cannot be derived from each
    // other. The trade only fallback keeps its own pair: projTax is the tax, and projSl was never
    // inside it. Same typeof and isFinite discipline as the bill, and for the same reason.
    const p = input.selfAssessmentPoa;
    const baseTax = p && typeof p.tax === 'number' && Number.isFinite(p.tax) ? Math.max(0, p.tax) : null;
    const baseAtSource = p && typeof p.deductedAtSource === 'number' && Number.isFinite(p.deductedAtSource)
      ? Math.max(0, p.deductedAtSource)
      : 0;
    const base = haveGiven
      ? (baseTax === null ? null : { tax: baseTax, atSource: baseAtSource })
      : { tax: projTax, atSource: projCis };

    // The engine answers all three questions: is it required at all, is he excused because his
    // contractors already paid it, and how much is each instalment. The year is passed so the
    // schedule it returns is not lying about its own dates, even though this block prints none.
    const schedule = base === null
      ? null
      : paymentsOnAccount(base.tax, taxYearEnd(today).getUTCFullYear(), base.atSource);
    if (estBill !== null && schedule !== null && schedule.required) {
      const poa = schedule.eachPayment;
      // ⚠️ THE CLAUSE THAT EXPLAINS WHY THE SUM DOES NOT LOOK RIGHT, AND ONLY FOR THE MAN WHOSE SUM
      // DOES NOT LOOK RIGHT. Doc 103: a row he has to read and reject is a cost. Without a student
      // loan the payment on account IS half the bill and the sentence would be answering a question
      // he never asked. With one, he can divide two numbers on the screen and get a third, and a
      // product whose arithmetic he cannot reproduce is a product he stops believing.
      const loanClause = projSl > 0
        ? ' The payment on account is half your tax, not half the bill: HMRC never asks for a student loan repayment up front.'
        : '';
      out.push({
        signalKey: 'poa_cliff',
        periodKey: year,
        priority: 'ping',
        title: 'Payments on account will apply',
        // ⚠️ "roughly one and a half times what you expect" CAME OUT, and it was not a style edit.
        // It is only true of a man with no student loan and no tax deducted at source. For anybody
        // else it is a claim he can check against the two figures in the same sentence and find
        // wrong, which is the worst kind of copy: confident, checkable and false.
        body: `Your Self Assessment bill is heading for about ${gbp(estBill)}. Over ${gbp(FACTS.poaThreshold)}, HMRC also asks for half of next year's tax up front, so January is bigger than the bill itself: ${gbp(estBill)} for the year plus about ${gbp(poa)} on account.${loanClause} Brutal if it surprises you, boring if you set aside for it, and your set aside number can carry it from here.`,
        waText: `your Self Assessment bill is heading for about ${gbp(estBill)}, which switches on payments on account: January asks for roughly ${gbp(estBill + poa)} in total`,
        numbers: { estBill, poa, threshold: FACTS.poaThreshold },
        action: { kind: 'set_aside', amount: estBill, label: 'Tax set aside' },
      });
    }
  }

  // 8. CIS refund milestones.
  //
  // THE STUDENT LOAN IS PART OF WHAT CIS PAYS OFF.
  //
  // On the actual Self Assessment return, the CIS already deducted by contractors is credited
  // against income tax AND Class 4 AND the student loan repayment. This used to be
  // `ytdCis - taxDueYtd`, which forgot the loan entirely, so a subbie with a student loan was
  // told a refund bigger than the one he will actually get.
  //
  // Being wrong in that direction is the cruel one: he is not merely misinformed, he has been
  // promised money. He may well have spent it. The SET ASIDE figure a few lines above already
  // stacks the loan correctly (projTax + projSl - projCis); only this reassurance number was
  // out of step with it, which meant the product quietly disagreed with itself.
  const slDueYtd = plans.length > 0 ? studentLoanForSA(d.ytdProfit, salary, plans) : 0;
  const refund = Math.max(0, d.ytdCis - taxDueYtd - slDueYtd);
  // The highest milestone the refund has passed: 250, 500, 1000, then every 500.
  const milestone =
    refund >= 1000
      ? 1000 + Math.floor((refund - 1000) / 500) * 500
      : refund >= 500
        ? 500
        : refund >= 250
          ? 250
          : 0;
  if (milestone > 0) {
    out.push({
      signalKey: 'cis_refund_milestone',
      periodKey: `${year}#m${milestone}`,
      priority: 'card',
      title: `Your CIS refund passed ${gbp(milestone)}`,
      body: `The refund building from your CIS deductions is now about ${gbp(refund)}: tax already taken off your pay (${gbp(d.ytdCis)}) less the tax actually due on your profit so far. Every expense you log grows it. Settled when you file, and you approve first.`,
      waText: `the CIS refund building on your numbers just passed ${gbp(milestone)}, now about ${gbp(refund)}`,
      numbers: { refund, milestone, cis: d.ytdCis },
    });
  }

  // 9. Quiet expense month: the last closed calendar month against the prior
  // three. Months are built explicitly from today's date and looked up with a
  // zero default, so a month where NOTHING was logged (the strongest sign of
  // unlogged receipts) still triggers, and gaps in the input cannot distort it.
  const byMonth = new Map(input.months.map((m) => [m.month, m]));
  const monthKey = (offset: number): string => {
    const d2 = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, 1));
    return `${d2.getUTCFullYear()}-${String(d2.getUTCMonth() + 1).padStart(2, '0')}`;
  };
  const expensesIn = (offset: number): number => byMonth.get(monthKey(offset))?.expenses ?? 0;
  const lastClosedKey = monthKey(-1);
  const lastClosed = expensesIn(-1);
  const priorAvg = (expensesIn(-2) + expensesIn(-3) + expensesIn(-4)) / 3;
  // Require real history: all three prior months present in the input.
  const hasHistory = [-2, -3, -4].every((o) => byMonth.has(monthKey(o)));
  if (hasHistory && priorAvg >= 150 && lastClosed < priorAvg * 0.4) {
    out.push({
      signalKey: 'quiet_expenses',
      periodKey: lastClosedKey,
      priority: 'card',
      title: 'Last month looks light on expenses',
      body: `You logged ${gbp(lastClosed)} of expenses last month against a recent average of ${gbp(priorAvg)}. If it was a quiet month, ignore this. If receipts went unlogged, they are tax savings sitting in a jacket pocket: snap them on WhatsApp whenever, even weeks later.`,
      waText: `last month's expenses (${gbp(lastClosed)}) were well under your usual ${gbp(priorAvg)}. Missed receipts are missed tax savings, snap them any time`,
      numbers: { lastMonth: lastClosed, average: Math.round(priorAvg) },
    });
  }

  // 10. AIA timing: strong year, near year end, no big kit purchase yet.
  // Superseded by goal_purchase_timing when a purchase goal exists: the goal
  // version carries the user's own plan and the exact after tax cost.
  const yearEnd = taxYearEnd(today);
  const daysToEnd = Math.floor((yearEnd.getTime() - today.getTime()) / DAY_MS);
  if (!goalTimingFired && daysToEnd <= 56 && daysToEnd >= 0 && canProject && projProfit + salary >= hrBoundary && input.equipmentSpendYtd < 1000) {
    out.push({
      signalKey: 'aia_timing',
      periodKey: year,
      priority: 'ping',
      title: 'Buying kit before 5 April cuts this year’s bill',
      body: `Strong year: your profit is heading for about ${gbp(projProfit)}. If you were planning a van, big tools or other kit anyway, buying before 5 April means the whole cost comes off THIS year's profit under the Annual Investment Allowance, at your highest rate. Buy it a week into April and the saving waits a year. Only worth it for things you actually need, spending £1 to save 40p is not a plan. A suggestion from your numbers, not advice. You decide.`,
      waText: `your profit is heading for ${gbp(projProfit)}. Kit you were buying anyway saves more before 5 April than after, under the Annual Investment Allowance`,
      numbers: { projected: projProfit, daysToEnd },
    });
  }

  // 11. Quarter closing with unconfirmed entries.
  const q = mtdQuarter(today);
  const daysToQuarterEnd = Math.floor((q.end.getTime() - today.getTime()) / DAY_MS);
  if (daysToQuarterEnd <= 10 && daysToQuarterEnd >= 0 && input.unconfirmedCount >= 5) {
    out.push({
      signalKey: 'quarter_unconfirmed',
      periodKey: q.label,
      priority: 'ping',
      title: `${input.unconfirmedCount} entries to check before the quarter closes`,
      body: `The quarter ends in ${daysToQuarterEnd} ${daysToQuarterEnd === 1 ? 'day' : 'days'} and ${input.unconfirmedCount} entries are still waiting for your yes. Two minutes in the app keeps your quarterly figures complete and correct. Nothing is ever sent without you.`,
      waText: `${input.unconfirmedCount} entries need a quick check before the quarter closes in ${daysToQuarterEnd} ${daysToQuarterEnd === 1 ? 'day' : 'days'}`,
      numbers: { unconfirmed: input.unconfirmedCount, daysToQuarterEnd },
      action: { kind: 'open_confirm', count: input.unconfirmedCount },
    });
  }

  // 14. Section 24 exposure (doc 82 s5d): a higher rate landlord's mortgage
  // interest only earns relief at the credit rate while the rent is taxed at
  // the top slice. Making that arithmetic visible is the whole value.
  if (input.property && input.property.finance >= 1000 && canProject && projTotalIncome > hrBoundary) {
    const pf = PROPERTY_FACTS['2026-27'];
    const creditPct = Math.round(pf.s24CreditRate * 100);
    const topPct = projTotalIncome >= FACTS.additionalRateThreshold ? 45 : 40;
    out.push({
      signalKey: 's24_exposure',
      periodKey: year,
      priority: 'card',
      title: 'Your mortgage interest relief is capped',
      body: `Your rent is taxed at ${topPct}% on the top slice, but mortgage interest on a residential let only earns a ${creditPct}% credit (Section 24). On the ${gbp(input.property.finance)} of interest so far, that is relief of about ${gbp(Math.round(input.property.finance * pf.s24CreditRate))}, not ${gbp(Math.round((input.property.finance * topPct) / 100))}. Companies still deduct interest in full, which is why some landlords compare incorporating. Information, not advice: the comparison lives in the app under Pay yourself.`,
      waText: `your ${gbp(input.property.finance)} of mortgage interest earns ${creditPct}% relief while the rent is taxed at ${topPct}%, the Section 24 gap`,
      numbers: { finance: input.property.finance, creditPct, topPct },
    });
  }

  // 15. April 2027 preview (doc 82 s5d): what the new property rates do to
  // THIS user's numbers, a full year early. Year to date facts only.
  if (input.property && input.property.rents > 0) {
    const delta = aprilDelta({
      employmentIncome: salary,
      tradeProfit: Math.max(0, tradeGrossYtd - Math.max(0, d.ytdExpenses - input.property.expenses - input.property.finance)),
      rents: input.property.rents,
      propertyExpenses: input.property.expenses,
      financeCosts: input.property.finance,
      jointShare: 1,
    });
    if (delta.extraPerYear >= 25) {
      out.push({
        signalKey: 'property_rates_2027',
        periodKey: year,
        priority: 'card',
        title: 'April 2027, priced on your numbers',
        body: `From 6 April 2027 property income gets its own rates (22%, 42%, 47%) and the mortgage interest credit moves to 22%. On your year so far, that is about ${gbp(delta.extraPerYear)} more per year. Nobody else will tell you this early. Nothing to do today, but pricing rent reviews and planning with the real number beats finding out in 2028.`,
        waText: `the April 2027 property rates would add about ${gbp(delta.extraPerYear)} a year on your current numbers`,
        numbers: { extraPerYear: delta.extraPerYear, billNow: delta.now.incomeTax, billThen: delta.then.incomeTax },
      });
    }
  }

  // 17. Expense completeness: the claims most tradespeople have that this user
  // has not logged all year. Money left on the table, purely from category
  // presence, no patterns needed. Fires once a year, after four months of data.
  if (input.categories && d.monthsElapsed >= 4 && d.ytdExpenses > 500 && salary === 0) {
    const seen = input.categories.map((c) => c.toLowerCase());
    const has = (...words: string[]) => seen.some((c) => words.some((w) => c.includes(w)));
    const missing: string[] = [];
    if (!has('phone', 'mobile')) missing.push('phone and internet (the business share)');
    if (!has('insurance')) missing.push('public liability or tool insurance');
    if (!has('travel', 'fuel', 'mileage', 'diesel', 'petrol')) missing.push('mileage or fuel');
    if (!has('tools', 'equipment')) missing.push('tools and equipment');
    if (missing.length >= 2) {
      out.push({
        signalKey: 'expense_completeness',
        periodKey: `${year}#chk`,
        priority: 'card',
        title: 'Claims most trades have that you have not logged',
        body: `Nothing logged this year for: ${missing.join('; ')}. If you genuinely have none, ignore this. But most tradespeople do, and every missed claim is tax paid for nothing. Text them to Lekhio as they happen, even the small ones: it all comes off the bill.`,
        waText: `you have logged nothing this year for ${missing.length} common claims (${missing[0]} among them), worth a look`,
        numbers: { missingCount: missing.length, monthsIn: d.monthsElapsed },
      });
    }
  }

  // 18. Use of home (doc 82 s5, the optimiser's biggest quantified lever that is
  // not otherwise surfaced proactively). Pension shows up as higher_rate_approach
  // and pa_taper, AIA as aia_timing, so the one quantified saving Rakha does not
  // yet push is the flat rate use of home claim, missed by almost everyone. We
  // read it the same way expense_completeness does, from category presence, so no
  // new aggregate is needed, and quantify it exactly as lib/taxoptimiser does so
  // the figure matches the Ways to save screen. Card, once a year, trade led.
  if (input.categories && d.monthsElapsed >= 4 && d.ytdProfit > 0 && marginalRate > 0) {
    const claimsHome = input.categories.some((c) => c.toLowerCase().includes('home'));
    if (!claimsHome) {
      const monthly = homeOfficeFlatRateMonthly(25); // the 25 to 50 hours a month band
      const saving = Math.round(monthly * 12 * marginalRate);
      out.push({
        signalKey: 'home_office_saving',
        periodKey: `${year}#hom`,
        priority: 'card',
        title: 'A claim most trades miss: use of home',
        body: `Do your quotes, invoices or admin from home? You can claim a flat ${gbp(monthly)} a month for it, no receipts to keep. Over a year that is about ${gbp(saving)} off your tax at your rate. Say "claim use of home" and Lekhio adds it. A suggestion from your numbers, not advice. You decide.`,
        waText: `you can claim a flat ${gbp(monthly)} a month for working from home, about ${gbp(saving)} off your tax a year, just say "claim use of home"`,
        numbers: { monthly, saving, marginalRatePct: Math.round(marginalRate * 100) },
      });
    }
  }

  // 18b. The trading allowance, made VISIBLE. The engine already deducts the better of actual expenses
  // or the flat £1,000 (taxengine.taxableTradingProfit), so a low-cost trader never LOSES it. What they
  // never SEE is that Rakha secured it. This surfaces that saving: when projected trade costs are running
  // under £1,000, the flat allowance beats the receipts, and we say by how much, and that it is already
  // applied. Trade only (property has its own £1,000 allowance); sole trader only (a company does not get
  // it, so it sits in LTD_SUPPRESSED_SIGNALS). Read from the same figures the MTD and use-of-home signals
  // use, so no new aggregate is needed. Waits until the year is mature enough to project a cost base.
  if (canProject && d.monthsElapsed >= 6 && marginalRate > 0) {
    const propExpenses = input.property ? Math.max(0, input.property.expenses) + Math.max(0, input.property.finance) : 0;
    const tradeExpensesYtd = Math.max(0, d.ytdExpenses - propExpenses);
    const projTradeGross = projectAnnual(tradeGrossYtd, d);
    const projTradeExpenses = projectAnnual(tradeExpensesYtd, d);
    if (projTradeGross > FACTS.tradingAllowance && projTradeExpenses < FACTS.tradingAllowance) {
      const benefit = Math.round((FACTS.tradingAllowance - projTradeExpenses) * marginalRate);
      if (benefit >= 30) {
        out.push({
          signalKey: 'trading_allowance_saving',
          periodKey: `${year}#tra`,
          priority: 'card',
          // ═══════════════════════════════════════════════════════════════════════════════════
          // 🔴 THIS COPY WAS FALSE IN TWO DIRECTIONS AT ONCE UNTIL 1 AUGUST 2026.
          //
          // It read: "the flat £1,000 trading allowance beats totting up your actual expenses, so
          // Lekhio uses it automatically... Nothing for you to do." It went out as a card AND as a
          // paid WhatsApp template.
          //
          //   1. NOTHING APPLIED IT. taxengine.taxableTradingProfit(), the only function that could
          //      have, was called by no code in app/ or lib/. Every engine computed trade profit as
          //      plain income minus expenses. Same class of claim as "104 tests on the tax engine",
          //      except this one cost money to send.
          //
          //   2. IT IS NOT OURS TO APPLY. HMRC BIM86015: partial relief requires "an election by
          //      the individual... made by the individual completing a Self Assessment return." So
          //      telling him it is automatic and there is nothing to do was telling him not to
          //      decide the one thing only he can decide. CLAUDE.md: we PREPARE, he APPROVES.
          //
          // ⚠️ AND THE NEW COPY LEADS WITH THE COST, NOT THE BENEFIT. Electing does not add £1,000
          // to his deductions, it throws away every expense he has logged and puts £1,000 in their
          // place (GOV.UK: "You cannot deduct any other expenses or allowances if you claim the
          // allowances"). This signal only fires when his costs are running UNDER £1,000, so it is
          // the right call for the man reading it today, but his costs can change and the sentence
          // has to be true of him in November as well as tonight.
          // ═══════════════════════════════════════════════════════════════════════════════════
          title: 'The £1,000 trading allowance would beat your costs',
          body: `Your business costs this year are running under £1,000 (about ${gbp(projTradeExpenses)} at this pace). The flat £1,000 trading allowance is claimed instead of your real costs rather than as well as them, so on today's figures it would take roughly ${gbp(benefit)} more off your tax than your logged costs do. It is your election to make on your own return, so we have not made it for you: it is under You, then Allowances, and it comes off again in one tap. Keep sending receipts either way, because the day your real costs pass £1,000 you are better off without it. A suggestion from your numbers, not advice. You decide.`,
          waText: `your costs are running under £1,000, so the flat £1,000 trading allowance would beat them by about ${gbp(benefit)} of tax. It is claimed INSTEAD of your costs, not as well, and it is your election to make: open your Lekhio under You, then Allowances`,
          numbers: { benefit, projExpenses: projTradeExpenses, marginalRatePct: Math.round(marginalRate * 100) },
        });
      }
    }
  }

  // 16. The invoice chaser (doc 82 s5e item 3): Rakha DRAFTS, the user sends.
  // A nudge tier at 14 days and a firmer tier at 30, each firing once per
  // invoice per tier, at most two invoices per walk so nobody gets flooded.
  if (input.invoices) {
    for (const inv of input.invoices.slice(0, 2)) {
      const tier = inv.daysOver >= 30 ? 30 : inv.daysOver >= 14 ? 14 : 0;
      if (tier === 0) continue;
      const draft = chaseMessage(inv.customer, inv.number, inv.total, inv.daysOver, inv.link);
      out.push({
        signalKey: 'invoice_chase',
        periodKey: `inv-${inv.id.slice(0, 8)}#${tier}`,
        priority: tier === 30 ? 'ping' : 'card',
        title: `Invoice ${inv.number} is ${inv.daysOver} days unpaid`,
        body: `${gbp(inv.total)} from ${inv.customer || 'your customer'} is still outstanding. Here is a chase written in your voice, ready to forward:

"${draft}"

Send it as it is or tweak it first. You send, never me. Most invoices get paid within days of a polite nudge.`,
        waText: `invoice ${inv.number} (${gbp(inv.total)}, ${inv.customer || 'customer'}) is ${inv.daysOver} days unpaid, and I have a polite chase drafted for you, just say "chase invoice ${inv.number}"`,
        numbers: { total: inv.total, daysOver: inv.daysOver, tier },
        action: {
          kind: 'invoice_chase',
          invoiceId: inv.id,
          invoiceNumber: inv.number,
          customer: inv.customer || '',
          total: inv.total,
          link: inv.link || '',
          draft,
        },
      });
    }
  }

  // 12. The Monday brief (doc 82 section 5e item 1): the weekly heartbeat.
  // Plain facts, no projections, so every user with any data hears from Rakha
  // from their very first week. Card only, never a ping.
  if (today.getUTCDay() === 1 && input.week && (input.week.income > 0 || input.week.expenses > 0 || d.ytdIncome > 0)) {
    const w = input.week;
    const kept = Math.max(0, w.income - w.expenses);
    const quiet = w.income === 0 && w.expenses === 0;
    const watch =
      input.unconfirmedCount >= 5
        ? `This week's watchpoint: ${input.unconfirmedCount} entries are waiting for your yes. Two minutes in the app squares the books.`
        : daysToQuarterEnd <= 21
          ? `This week's watchpoint: the quarter closes in ${daysToQuarterEnd} ${daysToQuarterEnd === 1 ? 'day' : 'days'}. Your figures are ready when you are.`
          : `The year so far is carrying about ${gbp(taxDueYtd)} of tax. Your set aside number has it covered.`;
    out.push({
      signalKey: 'monday_brief',
      periodKey: `wk-${today.toISOString().slice(0, 10)}`,
      priority: 'card',
      title: 'Your Monday brief',
      body: quiet
        ? `Nothing logged last week. No judgement, some weeks are like that. ${watch}`
        : `Last week: ${gbp(w.income)} in, ${gbp(w.expenses)} out, ${gbp(kept)} kept. ${watch}`,
      waText: quiet
        ? `Monday brief: nothing logged last week, fresh start today`
        : `Monday brief: ${gbp(w.income)} in, ${gbp(w.expenses)} out last week, ${gbp(kept)} kept`,
      numbers: { weekIncome: w.income, weekExpenses: w.expenses, kept, activeDays: w.activeDays },
    });
  }

  // 13. The January rehearsal (doc 82 section 5e item 2): once a quarter,
  // filing day run early. Year to date facts only, no projections, so it
  // works from the very first quarter of data and kills the January fear.
  {
    const sYear = taxYearStart(today).getUTCFullYear();
    const qStarts = [
      new Date(Date.UTC(sYear, 3, 6)),
      new Date(Date.UTC(sYear, 6, 6)),
      new Date(Date.UTC(sYear, 9, 6)),
      new Date(Date.UTC(sYear + 1, 0, 6)),
    ];
    const qStart = [...qStarts].reverse().find((s) => s <= today) ?? qStarts[0];
    const daysSinceQuarterStart = Math.floor((today.getTime() - qStart.getTime()) / DAY_MS);
    const slShareYtd = plans.length > 0 ? studentLoanForSA(d.ytdProfit, salary, plans) : 0;
    const bill = Math.round(taxDueYtd + slShareYtd);
    if (daysSinceQuarterStart <= 6 && bill >= 400) {
      let jan31 = new Date(Date.UTC(today.getUTCFullYear(), 0, 31));
      if (today >= jan31) jan31 = new Date(Date.UTC(today.getUTCFullYear() + 1, 0, 31));
      const weeksTo31Jan = Math.max(1, Math.floor((jan31.getTime() - today.getTime()) / (7 * DAY_MS)));
      const perWeek = Math.ceil(bill / weeksTo31Jan);
      out.push({
        signalKey: 'january_rehearsal',
        periodKey: q.label,
        priority: 'card',
        title: 'January, rehearsed early',
        body: `If the year stopped today, the Self Assessment bill on it would be about ${gbp(bill)}${slShareYtd > 0 ? ' including your student loan' : ''}. About ${gbp(perWeek)} a week set aside from here has that covered by 31 January. The real bill grows as you earn and your set aside number tracks it, so January never gets to surprise you.`,
        waText: `if the year stopped today the bill is about ${gbp(bill)}, and ${gbp(perWeek)} a week from here covers it by 31 January`,
        numbers: { bill, perWeek, weeksTo31Jan },
      });
    }
  }

  // 14. Year end countdown (doc 82 section 5e item 6): the last six weeks before
  // 5 April, a weekly list of moves the user can still make this tax year, which
  // shrinks as the door closes. Seasonal and dormant the rest of the year. A
  // card, never a ping, so it informs without interrupting. Deterministic: it
  // only lists moves that actually apply to this user, so a quiet account with
  // nothing to act on gets nothing.
  {
    const yearEnd = taxYearEnd(today); // 5 April
    const daysToYearEnd = Math.floor((yearEnd.getTime() - today.getTime()) / DAY_MS);
    if (daysToYearEnd >= 0 && daysToYearEnd <= 42) {
      const weeksLeft = Math.max(1, Math.ceil((daysToYearEnd + 1) / 7));
      const moves: string[] = [];

      // Confirm anything still waiting, so it lands in this tax year.
      if (input.unconfirmedCount > 0) {
        moves.push(
          `Confirm the ${input.unconfirmedCount} ${input.unconfirmedCount === 1 ? 'entry' : 'entries'} waiting for your yes, so they count in ${year}.`,
        );
      }
      // Every late receipt is a deduction while it is still dated this year.
      moves.push('Send any receipts still sat on your phone. Every expense dated on or before 5 April lowers this year\'s bill.');

      // A deductible purchase the user already wants, framed as AIA timing.
      const firstPurchase = purchaseGoals[0];
      if (firstPurchase && marginalRate > 0) {
        const saving = Math.round(firstPurchase.amount * marginalRate);
        moves.push(
          `Buying ${firstPurchase.title} before 5 April puts the whole cost against this year under the Annual Investment Allowance. At your rate that is about ${gbp(saving)} off the tax on ${gbp(firstPurchase.amount)} spent. You decide.`,
        );
      }
      // Higher rate profit: a pension contribution is the classic year end lever.
      if (canProject && projTotalIncome > hrBoundary) {
        moves.push('A pension contribution before 5 April lowers the profit taxed at 40 percent. Your provider sets the amount, we are not a financial adviser, you decide.');
      }

      // Only fire when there is something to actually do beyond the generic
      // receipts line: real activity this year, or a purchase goal, or entries
      // to confirm. A dormant account is left alone.
      const worthSaying = d.ytdProfit > 0 || input.unconfirmedCount > 0 || purchaseGoals.length > 0;
      if (worthSaying) {
        const list = moves.map((m) => `. ${m}`).join('\n');
        out.push({
          signalKey: 'year_end_countdown',
          // Weekly bucket by weeks remaining, so it re-fires once a week through
          // the window and naturally shrinks (6 down to 1), never twice in a week.
          periodKey: `${year}-yec-w${weeksLeft}`,
          priority: 'card',
          title: `${weeksLeft} ${weeksLeft === 1 ? 'week' : 'weeks'} to 5 April`,
          body:
            `The ${year} tax year closes on 5 April. Moves you can still make before then:\n${list}\n` +
            'After 5 April these count against next year instead.',
          waText: `${weeksLeft} ${weeksLeft === 1 ? 'week' : 'weeks'} to 5 April. ${moves.length} ${moves.length === 1 ? 'move' : 'moves'} you can still make this tax year`,
          numbers: { weeksLeft, daysToYearEnd, ytdProfit: d.ytdProfit, taxDueYtd },
        });
      }
    }
  }

  return out.map(discloseScotland);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 SCOTLAND. B30, 18 AUGUST 2026. THE SAME FIGURE CARRIES THE SAME CAVEAT ON EVERY CHANNEL, AND
// THIS WAS THE CHANNEL WITH NO SCREEN BEHIND IT.
//
// J8 put SCOTLAND_LINE on the set aside answer on both chat routers on 17 August, on the argument
// that /app/tax prints it under the same number every time it is opened. This engine was left out,
// and on 18 August a Glasgow customer was texted a band derived January at 08:00 with no caveat
// anywhere in it, while every chat answer on the same account carried one.
//
// 🔴 AND THE EXCUSE THAT EXCUSED IT HAD ROTTED. test/scotland.test.mjs DID discover this file, from
// its imports, and somebody classified it: "The nudges. Same reasoning as the thread and WhatsApp:
// conversational, repeated, and pointed at a figure the app screens already caveat." Both of those
// surfaces reached the OPPOSITE conclusion on 17 August and moved to the disclosed list. The reason
// outlived its own premise, and the only thing the suite could check about it was that it was over
// forty characters long. It was never a blind spot in the discovery. It was a dead reason.
//
// ⚠️ AND THE OTHER HALF OF THAT EXCUSE IS FALSE ON THIS CHANNEL ANYWAY. "One tap behind a screen
// that already carries it" is what keeps the caveat off the levers, the what if and the CIS screen.
// A WhatsApp message is not one tap behind anything. It arrives on its own, on a phone, and there
// is no page above it.
//
// ⚠️ WHICH SIGNALS, AND THE BAR IS lib/scotland.ts's OWN: would a Scot be misled by THIS number if
// the line were absent. That lands it on the signals that state what he OWES, or state an England,
// Wales and Northern Ireland rate or threshold AS HIS. It stays off the ones that price a CHOICE,
// which is the same call the web makes on the levers and the what if.
//
// ⚠️ monday_brief IS DELIBERATELY NOT ON THE LIST, AND THE REASON IS WORTH THE LINE. Its waText
// carries no tax figure at all (in, out, kept), and its body reaches a tax figure on ONE of three
// branches, where it is a pointer to the set aside number rather than the number itself. The two
// signals that DO state that number, january_rehearsal and poa_cliff, both carry the line. It also
// happens to be the only one of these a limited company still receives, and ltdMondayBrief() then
// swaps its tax line for Corporation Tax, which is not devolved: a caveat about income tax bands
// under a CT600 figure would be worse than none. Measured: every other key below is already in
// LTD_SUPPRESSED_SIGNALS, so no company ever sees one of these.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
export const SCOTLAND_SIGNALS = new Set<string>([
  // What he owes, and what he is asked to put money aside against.
  'poa_cliff', 'january_rehearsal',
  // A rate or a threshold stated as his. These are the ones that are not merely uncaveated, they
  // are wrong for him: a Scot's higher rate does not start where this sentence says it does.
  'higher_rate_approach', 'pa_taper', 'goal_threshold_combo', 's24_exposure',
  // A position rather than a choice. The refund is his tax already paid netted against his bill,
  // and the April 2027 preview prices his rent at the bands this engine holds.
  'cis_refund_milestone', 'property_rates_2027',
]);

// ⚠️ THE WHATSAPP HALF DROPS THE TRAILING FULL STOP AND THE CARD KEEPS IT, WHICH IS PUNCTUATION AND
// NOT A SECOND VERSION OF THE SENTENCE. Every waText in this file ends without a stop, because the
// approved template interpolates "From your Lekhio agent: {{1}}." and supplies its own. A body
// ending in a stop would read "coming to Lekhio.. You approve everything". test/scotland.test.mjs
// asserts the constant still ENDS in a full stop, so the day somebody reworders it this breaks
// loudly instead of quietly double punctuating a paying customer's phone.
function discloseScotland(s: AgentSignal): AgentSignal {
  if (!SCOTLAND_SIGNALS.has(s.signalKey)) return s;
  return {
    ...s,
    body: `${s.body} ${SCOTLAND_LINE}`,
    waText: `${s.waText}. ${SCOTLAND_LINE.replace(/\.$/, '')}`,
  };
}

// Order the ping subset by importance for the noise caps. Cards pass through.
export function applyPingCaps(signals: AgentSignal[], pingsSentLast7Days: number): AgentSignal[] {
  const cards = signals.filter((s) => s.priority === 'card');
  const pings = signals
    .filter((s) => s.priority === 'ping')
    .sort((a, b) => PING_PRIORITY_ORDER.indexOf(a.signalKey) - PING_PRIORITY_ORDER.indexOf(b.signalKey));
  const weeklyRoom = Math.max(0, PING_CAP_PER_WEEK - pingsSentLast7Days);
  const allowed = Math.min(PING_CAP_PER_DAY, weeklyRoom);
  // Pings that lose their slot still land as in app cards, nothing is dropped.
  const kept = pings.slice(0, allowed);
  const demoted = pings.slice(allowed).map((s) => ({ ...s, priority: 'card' as SignalPriority }));
  return [...kept, ...demoted, ...cards];
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// STRUCTURE-AWARE RAKHA (doc: structure-aware returns, 19 Jul; partner share routed 30 Jul).
//
// computeSignals() above is, and stays, the SOLE-TRADER brain. It is deep, tested and correct for a
// sole trader, and it must come out of this wrapper UNCHANGED TO THE PENNY for one: the wrapper
// returns its output untouched for the default structure, and the tests pin that byte for byte.
//
// What it cannot be right about on its own is anyone else, and for months it was applied to everyone.
// The watchman was taxing a DIRECTOR as a sole trader: firing "you are heading into the 40% band" on
// profit that belongs to the COMPANY, and quoting a payments on account figure from soleTraderTax()
// to a man whose actual bills are a CT600 for the company and dividend tax on his own return. And it
// was taxing a PARTNER on the WHOLE FIRM: the shared books hold the whole partnership's money, the
// partner owes tax only on his slice (users.partnership_share, captured at setup, already scaled by
// getOptimiserInput), and the walk never passed the share in, so a half share partner was warned
// about thresholds his own income never goes near, and NOT warned about the ones it does (his Class 2
// pension year can be at risk while the firm's profit looks safe).
//
// lib/position.ts is the spine that knows all three structures and the returns each implies. So
// rather than surgically rewrite the sole-trader engine (and risk the numbers it already gets right),
// we route around it by structure:
//
//   SOLE TRADER      the engine, untouched. The baseline every parity test protects.
//   PARTNERSHIP      the engine run on the PARTNER'S SLICE of the books (his personal tax, his
//                    Class 2, his payments on account, his CIS share), while the signals that watch
//                    the FIRM (VAT registration is the partnership's own test, on its whole turnover)
//                    keep the whole books. Signals the law does not give a partner at any share (the
//                    trading allowance, MTD mandation on partnership income) are gated off entirely.
//   LIMITED COMPANY  the engine minus every signal that reads company profit as personal income,
//                    plus the structure-correct money moves from lib/rakhamoves.ts (which compute
//                    across BOTH returns via lib/position.ts), and the Monday brief's tax line
//                    swapped for the company's own Corporation Tax figure from the same spine.
//
// WHY GATING BEATS A WRONG NUMBER, HERE OF ALL PLACES. Rakha's entire value is being believed. A
// signal that is sometimes absent is a quiet week; a signal that is confidently wrong teaches the
// customer to ignore the one that matters, and a wrong TAX figure can move real money (a set aside
// that is double what he owes, a refund promise he spends). Where we can compute the right figure
// through the canonical engines we do; where we cannot yet, the signal does not fire for that
// structure. No signal beats a wrong signal, every time.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

// The sole-trader signals that assume the trading profit IS the person's income. Wrong for a company,
// where that profit is the company's and the owner's income is their salary plus dividends.
const LTD_SUPPRESSED_SIGNALS = new Set<string>([
  'higher_rate_approach', 'pa_taper', 'class2_pension_year', 'poa_cliff', 'sl_threshold_cross',
  'cis_refund_milestone', 'aia_timing', 'home_office_saving', 'trading_allowance_saving', 'expense_completeness',
  'mtd_mandation', 'mtd_combined_trap', 'january_rehearsal', 'year_end_countdown',
  'goal_threshold_combo', 'goal_purchase_timing', 'goal_within_reach', 'goal_progress',
  // THE LANDLORD SET, GATED 30 JUL. Both of these gate on projected profit plus salary, which for a
  // company reads the COMPANY'S profit as the landlord's personal income, and the April 2027 preview
  // prices a Self Assessment property delta off the company's trade figures. A director who is
  // privately a landlord deserves these computed on his salary plus dividends, which the sole-trader
  // engine cannot produce; until the landlord set is rebuilt on the whole-person engine, it is gated.
  's24_exposure', 'property_rates_2027',
]);

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE PROPERTY ONLY SET, GATED 31 JUL. The signals a man whose whole business is letting cannot use.
//
// 🔴 THE FIND. class2_pension_year's guard is a PROFIT test, and derive() sums every month bucket,
// which CONTAINS THE RENT. So a landlord having a lean year was told his State Pension year was at
// risk and that "about £X of voluntary Class 2 protects it". HMRC NIM74250: "A person whose
// activities in managing the property are those generally associated with being a landlord would not
// meet the definition of gainful employment for self-employed NICs purposes." He has no relevant
// profits, so there is no small profits threshold for him to fall under and no voluntary Class 2 to
// buy the year with at all. His route is Class 3, at several times the price. Quoting him the cheap
// number is worse than saying nothing, because he acts on it and finds out in January.
//
// ⚠️ ONLY A KNOWN 'property_only' IS EVER REFUSED, and the same manual page is why: NIM74250 carries
// the exception that a guest house or a hotel IS a trade. An unknown shape keeps every signal it has
// today. A wrong sentence a landlord can ignore is cheaper than silently taking a four figure relief
// off a sparky whose profile read came back empty, which is the same judgement lib/persona.ts,
// lib/elections.ts and lib/taxoptimiser.ts already made.
//
// It is a REFUSAL LIST, not an allow list, for lib/elections.ts's reason: an allow list refuses
// everything it has not heard of, so a signal added next month would go dark for landlords with
// nothing on any screen to say why. This fails the other way, which is the cheap way.
//
// AND IT IS STRUCTURE INDEPENDENT, applied last over whatever the structure branch produced. A
// landlord signs up as a sole trader (lib/persona.ts), but a property partnership and a property
// company are both real, and none of the three carries on a trade.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
const PROPERTY_ONLY_SUPPRESSED_SIGNALS = new Set<string>([
  // NIM74250, above. Not gainful employment, so no relevant profits and no voluntary Class 2.
  'class2_pension_year',
  // ITTOIA 2005 s94H is a SIMPLIFIED EXPENSE, a deduction in computing the profits of a TRADE, and
  // BIM75010 restricts the hours based flat rate to individuals and partnerships of individuals
  // carrying one on. A property business deducts a proportion of its ACTUAL costs instead (PIM2220),
  // which is a different claim, worked out a different way, and never the flat monthly figure this
  // signal quotes. lib/taxoptimiser.ts already refuses the same man the same lever.
  'home_office_saving',
  // The £1,000 TRADING allowance is ITTOIA 2005 Part 6A and is set against trading income. Property
  // income has its own separate £1,000 property allowance, with its own rules, which a man claiming
  // actual expenses on a mortgaged let usually should not take. The two reliefs must never be
  // conflated, and this signal's copy states that Lekhio "uses it automatically" on his return.
  'trading_allowance_saving',
  // Its missing list is trade shaped and its own copy says so out loud: "public liability or tool
  // insurance", "mileage or fuel", "tools and equipment", under a title reading "Claims most trades
  // have" and a body reading "most tradespeople do". Read the signal before trusting this row.
  'expense_completeness',
  // CAA 2001 s35 denies plant and machinery allowances for expenditure on plant in a DWELLING HOUSE,
  // which is most of what a residential landlord buys. This signal tells him flatly that "the whole
  // cost comes off THIS year's profit under the Annual Investment Allowance", and for the furniture,
  // white goods and fittings his money actually goes on, it does not come off at all.
  'aia_timing',
  // The same s35 denial, aimed at a goal he typed in his own words, which is worse rather than
  // better: nothing here can tell whether "new kitchen" is plant in a dwelling house, a capital
  // improvement or a repair, and the signal prices an exact after tax cost as though it could.
  'goal_purchase_timing',
]);

// The sole-trader signals a PARTNER must not receive at ANY share, because the law is different in
// kind, not merely in amount:
//   . trading_allowance_saving: the £1,000 trading allowance cannot be set against a partner's share
//     of partnership income (GOV.UK, Tax-free allowances on property and trading income: partnership
//     income is excluded). The signal would promise a saving the law does not give him.
//   . mtd_mandation / mtd_combined_trap: a partner's share of partnership profit is NOT Making Tax
//     Digital qualifying income. Partnerships are not yet mandated and have no announced date, so
//     "quarterly updates apply to you" is simply untrue for him today. His own property stream could
//     still cross alone; a property-only test for partners is follow-up work, and until it exists the
//     wrong warning stays off.
const PARTNERSHIP_SUPPRESSED_SIGNALS = new Set<string>(['trading_allowance_saving', 'mtd_mandation', 'mtd_combined_trap']);

// The signals that watch the FIRM rather than the partner, kept on the WHOLE books however small his
// share is. VAT registration is tested on the PARTNERSHIP'S taxable turnover, because the partnership
// itself is the registrable person; scaling that to his slice would hide a real registration duty.
// The quiet-month check watches the shared books' logging habit, which is not a tax figure at all.
const PARTNERSHIP_FIRM_SIGNALS = new Set<string>(['vat_approach', 'quiet_expenses']);

// The partner's share as a 0 to 1 factor. Validated exactly as lib/supabase.ts getBusinessProfile
// validates it: anything unset, non-finite or out of range means "the whole profit is his", which is
// the stored default and the safe one (it is what the engine always assumed).
function partnerShareOf(input: AgentInput): number {
  const pct = input.partnershipShare;
  return typeof pct === 'number' && Number.isFinite(pct) && pct > 0 && pct <= 100 ? pct / 100 : 1;
}

// The books through ONE PARTNER'S eyes: the money scaled to his share, everything else untouched.
// This is the same treatment lib/supabase.ts getOptimiserInput gives the optimiser ("each partner
// pays tax on their share", GOV.UK /set-up-business-partnership), applied to the walk's aggregates.
// The week, the invoices, the goals and the counts stay whole: they are facts about the books and
// about him, not tax figures. The property stream is scaled with the months because the month
// buckets already contain it and the engine derives the trade slice by subtraction; for the rare
// partner who also holds a WHOLLY personal let this understates the property side, which errs quiet
// rather than loud and is noted as follow-up in the structure tests.
function partnerView(input: AgentInput, share: number): AgentInput {
  return {
    ...input,
    months: input.months.map((m) => ({ ...m, income: m.income * share, expenses: m.expenses * share, cis: m.cis * share })),
    property: input.property
      ? {
          rents: input.property.rents * share,
          expenses: input.property.expenses * share,
          finance: input.property.finance * share,
          rents12: input.property.rents12 * share,
        }
      : null,
    equipmentSpendYtd: input.equipmentSpendYtd * share,
  };
}

function slugName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// Turn a rakhamoves Move into an AgentSignal the walk can store and render, same shape as every other.
function moveToSignal(m: Move, year: string): AgentSignal {
  const linkLines = m.links.length ? '\n\n' + m.links.map((l) => `${l.label}:\n${l.url}`).join('\n\n') : '';
  const saved = m.estSaving > 0 ? `${m.isEstimate ? 'about ' : ''}${gbp(m.estSaving)}` : '';
  return {
    signalKey: m.ownerName ? `${m.key}_${slugName(m.ownerName)}` : m.key,
    periodKey: `${year}#mv`,
    priority: m.urgency === 'now' ? 'ping' : 'card',
    title: m.title,
    body: m.why + linkLines,
    waText: saved ? `${m.title} (${saved})` : m.title,
    numbers: { estSaving: m.estSaving },
  };
}

// The account holder as a position.ts owner. One place, because the money moves and the Monday brief
// correction below must describe the SAME person to the spine or the two would quietly disagree.
function soloOwners(structure: BusinessType, input: AgentInput): OwnerInput[] {
  const salary = Math.max(0, input.employmentIncome);
  const dividends = Math.max(0, input.dividendIncome ?? 0);
  const savings = Math.max(0, input.savingsIncome ?? 0);
  return [{
    name: 'You',
    // In a company the salary and dividends the owner DRAWS are the company's, and their PAYE job (if
    // any) is separate; for a sole trader / partner the salary is an outside job that stacks on top.
    salary: structure === 'limited_company' ? salary : undefined,
    dividends: structure === 'limited_company' ? dividends : undefined,
    other: {
      employment: structure === 'limited_company' ? 0 : salary,
      savings,
      dividends: structure === 'limited_company' ? 0 : dividends,
    },
  }];
}

// THE MONDAY BRIEF'S TAX LINE, PUT ON THE COMPANY'S OWN RETURN. The brief itself is structure
// neutral (money in, money out, kept), which is why a director keeps it. But its quiet-week
// watchpoint used to read "The year so far is carrying about £X of tax" with X from
// soleTraderTax() ON THE COMPANY'S PROFIT: a sole trader's income tax and Class 4 quoted to a man
// whose company owes Corporation Tax. We rebuild the exact sentence the sole-trader engine wrote
// and replace it with the CT600 figure from the spine. The seam is pinned by a test in
// test/agentstructure.test.mjs, so if the engine's wording ever drifts the test goes red rather
// than the sole-trader line quietly leaking back to directors.
function ltdMondayBrief(sig: AgentSignal, input: AgentInput): AgentSignal {
  const d = derive(input);
  const soleLine = `The year so far is carrying about ${gbp(soleTraderTax(d.ytdProfit).total)} of tax. Your set aside number has it covered.`;
  if (!sig.body.includes(soleLine)) return sig;
  const pos = computePosition({
    type: 'limited_company',
    profit: Math.max(0, d.ytdProfit),
    owners: soloOwners('limited_company', input),
  });
  const ctLine = `The company's year so far is carrying about ${gbp(pos.business.corporationTax)} of Corporation Tax. Setting it aside as you go keeps the CT600 boring.`;
  return { ...sig, body: sig.body.replace(soleLine, ctLine) };
}

// Build the structure-aware money moves for this user from what the walk already holds. Single-owner
// today (the account holder); the co-owners arrive with the Companies House link (Layer 4).
export function moneyMoveSignals(input: AgentInput): AgentSignal[] {
  const structure: BusinessType = input.businessType ?? 'sole_trader';
  const d = derive(input);
  const canProject = d.monthsElapsed >= 3;
  const projProfit = canProject ? projectAnnual(d.ytdProfit, d) : d.ytdProfit;
  const year = taxYearLabel(input.today);
  const owners = soloOwners(structure, input);

  const purchase = input.goals.find((g) => g.kind === 'purchase');
  const moves = savingsMoves(
    { type: structure, profit: Math.max(0, projProfit), owners },
    {
      today: input.today,
      plannedPurchase: purchase ? { title: purchase.title, amount: purchase.amount } : null,
      equipmentSpendYtd: input.equipmentSpendYtd,
      married: input.married,
      spouseHasSpareAllowance: input.spouseHasSpareAllowance,
    },
  );
  return moves.map((m) => moveToSignal(m, year));
}

// THE ENTRY POINT THE WALK CALLS. Routes by structure so every threshold, alert and figure is
// computed under the customer's ACTUAL structure:
//   . a sole trader gets the engine untouched, byte for byte;
//   . a partner gets the engine on HIS SLICE of the books, the firm-level signals on the whole
//     books, and the signals the law does not give a partner gated off;
//   . a company gets the engine minus everything that reads its profit as personal income, plus the
//     structure-correct money moves, with the Monday brief's tax line moved onto the CT600.
//
// 🔴 AND THEN BY INCOME SHAPE, LAST. Structure answers HOW he trades and cannot answer WHETHER he
// trades at all, so the shape gate runs OVER whatever the structure branch produced rather than
// inside any one of them. computeSignals() stays shape blind, exactly as it stays structure blind:
// every gate this file adds lives in the wrapper, so the sole-trader engine below is still the one
// thing the parity tests can pin byte for byte.
export function computeSignalsForStructure(input: AgentInput): AgentSignal[] {
  return forIncomeShape(structureSignals(input), input);
}

// Drop the trade only signals when, and only when, he has told us letting is the whole business.
//
// ⚠️ WRITTEN AS AN INEQUALITY, NOT A MEMBERSHIP TEST, so undefined and null both fall straight
// through untouched. Same shape and same reason as lib/taxoptimiser.ts canClaimSimplifiedExpenses.
function forIncomeShape(signals: AgentSignal[], input: AgentInput): AgentSignal[] {
  if (input.incomeShape !== 'property_only') return signals;
  return signals.filter((s) => !PROPERTY_ONLY_SUPPRESSED_SIGNALS.has(s.signalKey));
}

function structureSignals(input: AgentInput): AgentSignal[] {
  const structure: BusinessType = input.businessType ?? 'sole_trader';
  const base = computeSignals(input);

  if (structure === 'partnership') {
    const kept = base.filter((s) => !PARTNERSHIP_SUPPRESSED_SIGNALS.has(s.signalKey));
    const share = partnerShareOf(input);
    // A full share means the whole profit really is his slice, so the whole-books run above is
    // already his personal run; only the structure gates apply. This is also the stored default, so
    // a partnership that has not told us its split yet errs on the side of warning too much, never
    // of hiding a threshold he is genuinely heading for.
    if (share >= 1) return kept;
    // Two runs of the ONE engine, never a second copy of any maths: his personal tax on the scaled
    // books, the firm's own tests on the whole books, merged by signal.
    const personal = computeSignals(partnerView(input, share)).filter(
      (s) => !PARTNERSHIP_SUPPRESSED_SIGNALS.has(s.signalKey) && !PARTNERSHIP_FIRM_SIGNALS.has(s.signalKey),
    );
    return [...personal, ...kept.filter((s) => PARTNERSHIP_FIRM_SIGNALS.has(s.signalKey))];
  }

  if (structure !== 'limited_company') return base;
  const kept = base
    .filter((s) => !LTD_SUPPRESSED_SIGNALS.has(s.signalKey))
    .map((s) => (s.signalKey === 'monday_brief' ? ltdMondayBrief(s, input) : s));
  const moves = moneyMoveSignals(input);
  const moveKeys = new Set(moves.map((m) => m.signalKey));
  // Moves first (they carry the real savings), then the neutral operational signals (VAT, invoices,
  // quarter close, the Monday brief) that apply to any structure.
  return [...moves, ...kept.filter((s) => !moveKeys.has(s.signalKey))];
}

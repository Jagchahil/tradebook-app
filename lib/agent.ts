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

import { FACTS, soleTraderTax } from './taxengine';
import { studentLoanForSA, STUDENT_PLANS, type StudentPlan } from './nistudentloan';
import { aprilDelta, PROPERTY_FACTS } from './propertyengine';

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
  unconfirmedCount: number;
  // Equipment and tools spend this tax year (confirmed, category tools or equipment).
  equipmentSpendYtd: number;
  studentLoanPlan: StudentPlan | null; // undergraduate plan or null
  studentLoanPostgrad: boolean;
  employmentIncome: number; // annual PAYE salary saved on the account, 0 if none
  // Active goals (doc 82 section 5b). Empty array when none.
  goals: UserGoal[];
}

export type SignalPriority = 'ping' | 'card';

export interface AgentSignal {
  signalKey: string;
  periodKey: string;
  priority: SignalPriority;
  title: string;
  body: string; // the in app card body
  waText: string; // the WhatsApp line pair, used to fill the approved template
  numbers: Record<string, number>; // the figures behind it, for the payload
}

// When the daily or weekly ping caps bite, higher priority wins. Doc 84 section 2,
// goal signals added per doc 82 section 5b. The threshold combo outranks nearly
// everything: one suggestion that solves two problems is the flagship moment.
export const PING_PRIORITY_ORDER: string[] = [
  'mtd_combined_trap',
  'mtd_mandation',
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

const gbp = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;

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

  // G4. Monthly progress against a dated goal, only while it is still short.
  if (canProject) {
    const monthKeyNow = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}`;
    for (const g of input.goals) {
      if (!g.targetDate || potNow >= g.amount) continue;
      const target = new Date(`${g.targetDate}T00:00:00Z`);
      const weeksLeft = Math.max(1, Math.round((target.getTime() - today.getTime()) / (7 * DAY_MS)));
      if (target <= today) continue;
      const gap = g.amount - potNow;
      const perWeek = Math.ceil(gap / weeksLeft);
      out.push({
        signalKey: 'goal_progress',
        periodKey: `${monthKeyNow}#g${g.id.slice(0, 8)}`,
        priority: 'card',
        title: `"${g.title}": ${gbp(potNow)} of ${gbp(g.amount)} covered`,
        body: `Towards "${g.title}" by ${target.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}: your after tax earnings this year cover ${gbp(potNow)} of the ${gbp(g.amount)}. Clearing about ${gbp(perWeek)} a week from here gets you there on time.`,
        waText: `"${g.title}": ${gbp(potNow)} of ${gbp(g.amount)} covered, about ${gbp(perWeek)} a week keeps you on track`,
        numbers: { pot: potNow, goalAmount: g.amount, perWeek, weeksLeft },
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
  if (vatTier > 0) {
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
  if (combinedTrap) {
    out.push({
      signalKey: 'mtd_combined_trap',
      periodKey: year,
      priority: 'ping',
      title: 'Your trade plus your rent crosses the MTD line together',
      body: `Making Tax Digital counts trade and property income TOGETHER. Your trade alone (${gbp(tradeGrossYtd)}) sits under the ${gbp(mtdThreshold)} level, but with ${gbp(rentsYtd)} of rent the combined ${gbp(d.ytdIncome)} crosses it. Most landlords with a day trade miss this. No panic: your Lekhio records already fit the quarterly rhythm, both streams.`,
      waText: `trade (${gbp(tradeGrossYtd)}) plus rent (${gbp(rentsYtd)}) crosses the ${gbp(mtdThreshold)} Making Tax Digital level combined, which most people miss`,
      numbers: { tradeGross: tradeGrossYtd, rents: rentsYtd, combined: d.ytdIncome, threshold: mtdThreshold },
    });
  }
  const mtdHit = !combinedTrap && (d.ytdIncome >= mtdThreshold || (canProject && projIncome >= mtdThreshold));
  if (mtdHit) {
    const crossedNow = d.ytdIncome >= mtdThreshold;
    out.push({
      signalKey: 'mtd_mandation',
      periodKey: year,
      priority: 'ping',
      title: 'Making Tax Digital applies to you',
      body: crossedNow
        ? `Your gross income this tax year is ${gbp(d.ytdIncome)}, over the ${gbp(mtdThreshold)} Making Tax Digital level. That means digital records and four short quarterly updates. The good news: Lekhio already keeps you ready, your records build themselves.`
        : `At your current pace your gross income lands around ${gbp(projIncome)} this year, past the ${gbp(mtdThreshold)} Making Tax Digital level. Nothing to panic about: your Lekhio records already fit the quarterly rhythm.`,
      waText: crossedNow
        ? `your gross income (${gbp(d.ytdIncome)}) has passed the ${gbp(mtdThreshold)} Making Tax Digital level, quarterly updates apply`
        : `your income is on track for ${gbp(projIncome)}, past the ${gbp(mtdThreshold)} Making Tax Digital level`,
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
  if (canProject) {
    const projTax = soleTraderTax(projProfit).total;
    const projSl = plans.length > 0 ? studentLoanForSA(projProfit, salary, plans) : 0;
    const projCis = projectAnnual(d.ytdCis, d);
    const estBill = Math.max(0, projTax + projSl - projCis);
    if (estBill > FACTS.poaThreshold) {
      const poa = Math.round(estBill / 2);
      out.push({
        signalKey: 'poa_cliff',
        periodKey: year,
        priority: 'ping',
        title: 'Payments on account will apply',
        body: `Your Self Assessment bill is heading for about ${gbp(estBill)}. Over ${gbp(FACTS.poaThreshold)}, HMRC also asks for half of next year in advance, so the first January bill is roughly one and a half times what you expect: the year's bill plus about ${gbp(poa)} on account. Brutal if it surprises you, boring if you set aside for it, and your set aside number can carry it from here.`,
        waText: `your Self Assessment bill is heading for about ${gbp(estBill)}, which switches on payments on account: January asks for roughly ${gbp(estBill + poa)} in total`,
        numbers: { estBill, poa, threshold: FACTS.poaThreshold },
      });
    }
  }

  // 8. CIS refund milestones.
  const refund = Math.max(0, d.ytdCis - taxDueYtd);
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

  return out;
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

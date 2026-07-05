// National Insurance and student loan engine, 2026/27.
//
// The canonical maths for the free NI checker and student loan checker on the
// website, and later the in app hubs. Same discipline as lib/taxengine.ts:
// published figures only, one source of numbers, imported by every surface,
// never re implemented by hand in a page. Figures verified against GOV.UK and
// the confirmed 2026/27 thresholds on 5 July 2026.
//
// IMPORTANT: when the next Budget lands, bump these figures together with
// lib/taxengine.ts FACTS and TAX_YEAR_VALID_UNTIL. The staleness guard there
// covers this module too, both carry 2026/27 figures.

import { FACTS, class4NIC, class2Voluntary } from './taxengine';

const round2 = (n: number) => Math.round(n * 100) / 100;

// --- National Insurance, published figures 2026/27 ---------------------------
// Class 1 employee thresholds and rates, unchanged from 2025/26.
export const NI_FACTS = {
  taxYear: '2026/27',
  // Class 1, employee (primary) contributions
  class1PrimaryThreshold: 12570, // annual, no NI below this
  class1UpperEarningsLimit: 50270,
  class1MainRate: 0.08, // between PT and UEL
  class1UpperRate: 0.02, // above UEL
  // Lower earnings limit: earn above this and the year still counts for the
  // State Pension even though no NI is actually paid between LEL and PT.
  class1LowerEarningsLimit: 6500, // £125 a week, unchanged from 2025/26
  // Self employed figures live in taxengine FACTS (class4*, class2*). Re
  // exported through niPosition below so callers need only this module.
} as const;

// Class 1 employee NI on an annual salary.
export function class1NIC(salary: number): number {
  if (salary <= NI_FACTS.class1PrimaryThreshold) return 0;
  const main =
    Math.min(salary, NI_FACTS.class1UpperEarningsLimit) - NI_FACTS.class1PrimaryThreshold;
  let nic = Math.max(0, main) * NI_FACTS.class1MainRate;
  if (salary > NI_FACTS.class1UpperEarningsLimit) {
    nic += (salary - NI_FACTS.class1UpperEarningsLimit) * NI_FACTS.class1UpperRate;
  }
  return round2(nic);
}

export type NIStatus = 'employed' | 'selfEmployed' | 'both';

export interface NIPosition {
  status: NIStatus;
  class1: number;
  class4: number;
  class2Voluntary: { weeklyRate: number; annual: number; compulsory: boolean };
  total: number; // class1 + class4, the amounts actually charged
  // State Pension qualifying year signals
  qualifiesViaEmployment: boolean; // earnings at or above the LEL
  qualifiesViaProfits: boolean; // profits at or above the small profits threshold
  voluntaryClass2Suggested: boolean; // no qualifying route, low profits, the £190 a year decision
  // When someone pays both Class 1 and Class 4, HMRC applies an annual maximum
  // and can refund the excess. We flag it rather than compute the maxima, the
  // exact figure needs their full record.
  annualMaximaMayApply: boolean;
}

// The whole NI position for the checker. salary is annual employment income,
// profit is self employed taxable profit. Either can be zero.
export function niPosition(salary: number, profit: number): NIPosition {
  const s = Math.max(0, salary);
  const p = Math.max(0, profit);
  const status: NIStatus = s > 0 && p > 0 ? 'both' : p > 0 ? 'selfEmployed' : 'employed';
  const class1 = s > 0 ? class1NIC(s) : 0;
  const class4 = p > 0 ? class4NIC(p) : 0;
  const qualifiesViaEmployment = s >= NI_FACTS.class1LowerEarningsLimit;
  const qualifiesViaProfits = p >= FACTS.class2SmallProfitsThreshold;
  return {
    status,
    class1,
    class4,
    class2Voluntary: class2Voluntary(),
    total: round2(class1 + class4),
    qualifiesViaEmployment,
    qualifiesViaProfits,
    voluntaryClass2Suggested: !qualifiesViaEmployment && !qualifiesViaProfits && (s > 0 || p > 0),
    annualMaximaMayApply:
      class1 > 0 && class4 > 0 && s + p > NI_FACTS.class1UpperEarningsLimit,
  };
}

// --- Student loans, published figures 2026/27 --------------------------------
// Thresholds confirmed for 2026/27. Plan 2 is frozen at this figure until
// April 2030. Plan 5 is frozen at 25,000 by design. Postgraduate has never
// moved from 21,000. Repayment is 9% above the threshold on plans 1, 2, 4
// and 5, and 6% on postgraduate. A plan loan and a postgraduate loan repay at
// the same time, each above its own threshold.
export type StudentPlan = 'plan1' | 'plan2' | 'plan4' | 'plan5' | 'postgrad';

export const STUDENT_PLANS: Record<
  StudentPlan,
  { label: string; threshold: number; rate: number; writeOff: string }
> = {
  plan1: {
    label: 'Plan 1',
    threshold: 26900,
    rate: 0.09,
    writeOff: '25 years after the April you were first due to repay, or at 65 for the oldest loans',
  },
  plan2: {
    label: 'Plan 2',
    threshold: 29385,
    rate: 0.09,
    writeOff: '30 years after the April you were first due to repay',
  },
  plan4: {
    label: 'Plan 4 (Scotland)',
    threshold: 33795,
    rate: 0.09,
    writeOff: '30 years after the April you were first due to repay',
  },
  plan5: {
    label: 'Plan 5',
    threshold: 25000,
    rate: 0.09,
    writeOff: '40 years after the April you were first due to repay',
  },
  postgrad: {
    label: 'Postgraduate loan',
    threshold: 21000,
    rate: 0.06,
    writeOff: '30 years after the April you were first due to repay',
  },
};

export interface StudentLoanResult {
  perPlan: { plan: StudentPlan; label: string; annual: number; monthly: number }[];
  annualTotal: number;
  monthlyTotal: number;
}

// Annual repayment on a total income figure for one or more plans. This is the
// same maths PAYE runs per pay period and Self Assessment runs on the year:
// the rate applied to income above each plan's threshold. The self employed
// repay through Self Assessment on total income for the year, in one lump with
// the January tax bill, which is the shock this checker exists to prevent.
export function studentLoanRepayment(income: number, plans: StudentPlan[]): StudentLoanResult {
  const y = Math.max(0, income);
  const seen = new Set<StudentPlan>();
  const perPlan = plans
    .filter((p) => (seen.has(p) ? false : (seen.add(p), true)))
    .map((plan) => {
      const { label, threshold, rate } = STUDENT_PLANS[plan];
      const annual = round2(Math.max(0, y - threshold) * rate);
      return { plan, label, annual, monthly: round2(annual / 12) };
    });
  const annualTotal = round2(perPlan.reduce((s, p) => s + p.annual, 0));
  return { perPlan, annualTotal, monthlyTotal: round2(annualTotal / 12) };
}

// Only one of plans 1, 2, 4, 5 can repay at a time (they are the undergraduate
// loan), but postgraduate stacks on top. The checker UI enforces this shape,
// the engine accepts any list so the rule lives here too.
export function validPlanSelection(plans: StudentPlan[]): boolean {
  const undergrad = plans.filter((p) => p !== 'postgrad');
  return undergrad.length <= 1;
}

// The student loan share that belongs in the Self Assessment set aside figure.
// Payroll already collects the loan on any PAYE salary as they go, so what
// lands on the January bill is the repayment on total income LESS what payroll
// already took: repay(profit + salary) - repay(salary). With no salary this is
// simply the repayment on profit. Never negative.
export function studentLoanForSA(
  annualProfit: number,
  annualSalary: number,
  plans: StudentPlan[],
): number {
  if (plans.length === 0) return 0;
  const total = studentLoanRepayment(Math.max(0, annualProfit) + Math.max(0, annualSalary), plans).annualTotal;
  const viaPayroll = studentLoanRepayment(Math.max(0, annualSalary), plans).annualTotal;
  return Math.max(0, Math.round((total - viaPayroll) * 100) / 100);
}

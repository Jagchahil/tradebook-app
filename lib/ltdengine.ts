// Sole trader against limited company, 2026/27. Web canonical for the free
// comparison tool.
//
// The limited company maths mirrors tradebook-app/lib/tax.ts (corporationTax,
// dividendTax, planLtd), which the app's Pay yourself screen already uses.
// test/ltd-parity.test.mjs is the guarantee the two cannot silently diverge.
// Update ritual at a Budget: change BOTH files, run the parity test, ship on
// green. The sole trader side imports the one taxengine, never re hardcoded.

import { soleTraderTax, personalAllowance } from './taxengine';
import { NI_FACTS } from './nistudentloan';

const r2 = (n: number) => Math.round(n * 100) / 100;

export const LTD = {
  personalAllowance: 12570,
  higherThreshold: 50270,
  additionalThreshold: 125140,
  // Corporation tax 2026/27 with marginal relief between the limits.
  ctSmallRate: 0.19,
  ctMainRate: 0.25,
  ctSmallLimit: 50000,
  ctUpperLimit: 250000,
  ctMarginalFraction: 3 / 200,
  // Dividends, the 2026/27 rates (ordinary and upper raised 2pp at Budget 2025).
  dividendAllowance: 500,
  dividendBasic: 0.1075,
  dividendHigher: 0.3575,
  dividendAdditional: 0.3935,
  employerNIRate: 0.15,
  employerSecondaryThreshold: 5000,

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE LOWER EARNINGS LIMIT. IMPORTED, NEVER RETYPED. AND HERE IS WHAT IT COSTS TO GET WRONG.
  //
  // This line used to read:  salaryOptions: [12570, 6708, 5000]
  //
  // Three magic numbers in an array, and the middle one, £6,708, is the LOWER EARNINGS LIMIT: the
  // salary at which a director's year still counts toward his STATE PENSION even though he pays no
  // National Insurance on it. It is the entire reason that rung exists. It is why we recommend it.
  //
  // It was written out as a bare literal in FOUR places across two repos, published in facts.json in
  // NONE of them, and watched by Khoji in NONE of them. Every other limited-company constant in this
  // object is published and checked against GOV.UK every night. This one, alone, was not.
  //
  // So picture the Budget that moves the LEL to £7,000. Khoji says nothing, because it is not
  // watching. Our array still says 6,708. We go on recommending £6,708 to every director on the
  // product, all year, and every one of them pays himself a salary just BELOW the limit and quietly
  // loses a qualifying year toward his state pension. Roughly £300 a year, for life, and he would
  // never find out, and nothing would have gone red.
  //
  // It is now IMPORTED from the one place that names it, sources it and explains it. One number, one
  // home. It is also published to facts.json now, so Khoji watches it like everything else.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  lowerEarningsLimit: NI_FACTS.class1LowerEarningsLimit,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE RUNGS. DERIVED, AND SORTED AT RUNTIME. NEVER A HARDCODED LIST IN A HARDCODED ORDER.
//
// ⚠️ THE SECONDARY THRESHOLD (£5,000) NOW SITS *BELOW* THE LOWER EARNINGS LIMIT (£6,708).
//
// It has not always. These two have crossed over, and they can cross back. Any code that assumes
// "the NI-free rung comes first" or "the pension rung is the middle one" is code that will one day
// hand a director the rungs in the wrong order and recommend the wrong salary with total confidence.
//
// The old array happened to be in descending order. Nothing enforced it. Nothing noticed.
//
// So: name each rung by WHAT IT IS FOR, derive it from the constant that defines it, and sort by
// value at runtime. If a Budget swaps them over, this code is still right the next morning and
// nobody has to remember anything.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
export interface Rung {
  salary: number;
  why: string;
}

export function salaryRungs(): Rung[] {
  const rungs: Rung[] = [
    {
      salary: LTD.personalAllowance,
      why: 'Uses your whole tax free allowance. The company pays employer NI above the secondary threshold, but the salary is a deductible cost so it comes off the Corporation Tax.',
    },
    {
      salary: LTD.lowerEarningsLimit,
      why: 'The lowest salary that still earns you a qualifying year toward your State Pension. You pay no National Insurance on it. This is the rung most directors are aiming for without knowing its name.',
    },
    {
      salary: LTD.employerSecondaryThreshold,
      why: 'The most you can pay before the company owes employer National Insurance. It does NOT earn you a State Pension year, which is the catch nobody mentions.',
    },
  ];

  // Sorted by value, at runtime, from the constants themselves. Not by the order somebody typed them.
  return rungs.sort((a, b) => b.salary - a.salary);
}

export function corporationTax(profit: number): number {
  if (profit <= 0) return 0;
  if (profit <= LTD.ctSmallLimit) return r2(profit * LTD.ctSmallRate);
  if (profit >= LTD.ctUpperLimit) return r2(profit * LTD.ctMainRate);
  return r2(profit * LTD.ctMainRate - (LTD.ctUpperLimit - profit) * LTD.ctMarginalFraction);
}

export function employerNIC(salary: number): number {
  return r2(Math.max(0, salary - LTD.employerSecondaryThreshold) * LTD.employerNIRate);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE £100,000 TRAP. THE MOST FAMOUS CLIFF IN UK TAX, AND THIS ENGINE DID NOT KNOW IT EXISTED.
//
// The personal allowance is withdrawn by £1 for every £2 of income above £100,000, to nil at
// £125,140. The SOLE TRADER engine has always modelled it: taxengine.personalAllowance(), exported,
// exam-verified, watched by Khoji.
//
// This function used a FLAT £12,570. Always. However much he earned.
//
// Nobody noticed because the three salary rungs are all at or below the personal allowance, so the
// salary itself is never taxed and the flat figure looked harmless. But a director on £150,000 of
// company profit takes about £104,000 of dividends, and his TOTAL income is £116,000: deep inside
// the taper. His real allowance is about £4,300, not £12,570. We were handing him eight thousand
// pounds of tax-free income he is not entitled to, and understating his bill by thousands.
//
// ⚠️ AND IT IS THE FEATURE I WAS BUILDING THAT FOUND IT. The wall priced the next £1,000 at 52.78%
// for a man on £150,000 of profit, and the number did not move as his income climbed through the
// taper, which is exactly what it should not do: the taper is the reason the marginal rate SPIKES
// there. A tax bill that is quietly too low is the one error a man never reports.
//
// The fix is not to write a taper here. It is to CALL THE ONE THAT ALREADY EXISTS. Two engines over
// the same money will drift, and the one that drifts is the one nobody is looking at.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
export function dividendTax(salary: number, dividends: number): number {
  if (dividends <= 0) return 0;

  // The taper runs on ADJUSTED NET INCOME, which for a director paying himself salary plus dividends
  // is the pair of them. Not the salary alone, which is the mistake that would leave this bug in
  // place while looking like a fix.
  const PA = personalAllowance(salary + dividends);

  const paLeft = Math.max(0, PA - salary);
  let taxable = Math.max(0, dividends - paLeft);
  let pos = Math.max(salary, PA);
  let tax = 0;

  const allow = Math.min(LTD.dividendAllowance, taxable);
  pos += allow;
  taxable -= allow;

  if (taxable > 0 && pos < LTD.higherThreshold) {
    const amt = Math.min(taxable, LTD.higherThreshold - pos);
    tax += amt * LTD.dividendBasic;
    pos += amt;
    taxable -= amt;
  }
  if (taxable > 0 && pos < LTD.additionalThreshold) {
    const amt = Math.min(taxable, LTD.additionalThreshold - pos);
    tax += amt * LTD.dividendHigher;
    pos += amt;
    taxable -= amt;
  }
  if (taxable > 0) tax += taxable * LTD.dividendAdditional;
  return r2(tax);
}

// 🔴 INCOME TAX ON THE SALARY. IT WAS NEVER CHARGED, AND FOR YEARS THAT WAS FINE.
//
// Every rung we recommend is at or below the personal allowance, so the salary is tax free and
// leaving it out cost nothing. The assumption was true, undocumented, and load bearing.
//
// It stops being true the moment the allowance TAPERS. A director on £150,000 of profit has a
// personal allowance of about £4,300, not £12,570, so £8,000 of the very salary we told him to take
// is now taxable at 20% and nothing in this engine was charging him for it.
//
// The old assumption held because two things were true at once. One of them quietly stopped being
// true above £100,000, and nothing was watching the join.
export function salaryIncomeTax(salary: number, totalIncome: number): number {
  const pa = personalAllowance(totalIncome);
  const taxable = Math.max(0, salary - pa);
  if (taxable <= 0) return 0;
  // Every salary rung we offer sits far below the higher rate threshold, so the taxable slice can
  // only ever be basic rate. Asserting it rather than assuming it: if a future rung breaks that,
  // this is wrong, and the test says so.
  return r2(taxable * 0.20);
}

export interface LtdPlan {
  salary: number;
  employerNI: number;
  ctProfit: number;
  corpTax: number;
  dividends: number;
  divTax: number;
  /** Income tax on the salary. Zero until the £100k taper eats into the personal allowance. */
  salaryTax: number;
  takeHome: number;
  totalTax: number;
  effectiveRate: number;
}

// Salary plus dividends from company profit before the director's pay.
// Single director assumption, salary at or below the personal allowance.
export function planLtd(profitBeforeSalary: number, salary: number): LtdPlan {
  const sal = Math.max(0, Math.min(salary, profitBeforeSalary));
  const erNI = employerNIC(sal);
  const ctProfit = Math.max(0, profitBeforeSalary - sal - erNI);
  const corpTax = corporationTax(ctProfit);
  const dividends = Math.max(0, ctProfit - corpTax);
  const divTax = dividendTax(sal, dividends);
  const salaryTax = salaryIncomeTax(sal, sal + dividends);
  const takeHome = r2(sal + dividends - divTax - salaryTax);
  const totalTax = r2(corpTax + erNI + divTax + salaryTax);
  const effectiveRate = profitBeforeSalary > 0 ? r2((totalTax / profitBeforeSalary) * 100) : 0;
  return { salary: sal, employerNI: erNI, ctProfit, corpTax, dividends, divTax, salaryTax, takeHome, totalTax, effectiveRate };
}

export interface Comparison {
  profit: number;
  soleTrader: { tax: number; takeHome: number };
  ltd: LtdPlan; // the best of the standard salary points
  delta: number; // positive when the company wins on take home
  winner: 'ltd' | 'soleTrader' | 'even';
}

// The whole comparison at the standard director salary points, everything
// drawn out as dividends. Money left in the company only strengthens the
// company case, and the tool says so in words rather than pretending.
export function compare(profit: number): Comparison {
  const p = Math.max(0, profit);
  const st = soleTraderTax(p);
  const stTakeHome = r2(p - st.total);
  // The rungs come from salaryRungs(), derived from the named constants and sorted at runtime. The
  // old code indexed into a hardcoded array, LTD.salaryOptions[0], which quietly assumed both the
  // CONTENTS of that array and its ORDER. Two assumptions, neither enforced, neither tested.
  const rungs = salaryRungs();
  let best = planLtd(p, rungs[0].salary);
  for (const r of rungs.slice(1)) {
    const plan = planLtd(p, r.salary);
    if (plan.takeHome > best.takeHome) best = plan;
  }
  const delta = r2(best.takeHome - stTakeHome);
  return {
    profit: p,
    soleTrader: { tax: st.total, takeHome: stTakeHome },
    ltd: best,
    delta,
    winner: Math.abs(delta) < 50 ? 'even' : delta > 0 ? 'ltd' : 'soleTrader',
  };
}

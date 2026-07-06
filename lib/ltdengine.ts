// Sole trader against limited company, 2026/27. Web canonical for the free
// comparison tool.
//
// The limited company maths mirrors tradebook-app/lib/tax.ts (corporationTax,
// dividendTax, planLtd), which the app's Pay yourself screen already uses.
// test/ltd-parity.test.mjs is the guarantee the two cannot silently diverge.
// Update ritual at a Budget: change BOTH files, run the parity test, ship on
// green. The sole trader side imports the one taxengine, never re hardcoded.

import { soleTraderTax } from './taxengine';

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
  salaryOptions: [12570, 6708, 5000],
} as const;

export function corporationTax(profit: number): number {
  if (profit <= 0) return 0;
  if (profit <= LTD.ctSmallLimit) return r2(profit * LTD.ctSmallRate);
  if (profit >= LTD.ctUpperLimit) return r2(profit * LTD.ctMainRate);
  return r2(profit * LTD.ctMainRate - (LTD.ctUpperLimit - profit) * LTD.ctMarginalFraction);
}

export function employerNIC(salary: number): number {
  return r2(Math.max(0, salary - LTD.employerSecondaryThreshold) * LTD.employerNIRate);
}

export function dividendTax(salary: number, dividends: number): number {
  if (dividends <= 0) return 0;
  const PA = LTD.personalAllowance;
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

export interface LtdPlan {
  salary: number;
  employerNI: number;
  ctProfit: number;
  corpTax: number;
  dividends: number;
  divTax: number;
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
  const takeHome = r2(sal + dividends - divTax);
  const totalTax = r2(corpTax + erNI + divTax);
  const effectiveRate = profitBeforeSalary > 0 ? r2((totalTax / profitBeforeSalary) * 100) : 0;
  return { salary: sal, employerNI: erNI, ctProfit, corpTax, dividends, divTax, takeHome, totalTax, effectiveRate };
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
  let best = planLtd(p, LTD.salaryOptions[0]);
  for (const s of LTD.salaryOptions.slice(1)) {
    const plan = planLtd(p, s);
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

// Exam suite for lib/propertyengine.ts, the landlord engine (doc 82 s4).
// Run with: node test/propertyengine.test.mjs   (Node 22.6+, type stripping)
//
// The first case is the worked example from the HMRC technical note of
// 26 November 2025 and must pass to the pound. Every other case is hand
// computed. Same discipline as the 71 case tax exam.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'property-'));
const fix = (s) => s.replace("from './taxengine'", "from './taxengine.ts'");
writeFileSync(path.join(stage, 'taxengine.ts'), readFileSync(path.join(lib, 'taxengine.ts'), 'utf8'));
writeFileSync(path.join(stage, 'propertyengine.ts'), fix(readFileSync(path.join(lib, 'propertyengine.ts'), 'utf8')));
const P = await import(pathToFileURL(path.join(stage, 'propertyengine.ts')).href);

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL ${name}`);
  }
};
const eq = (name, got, want) => {
  if (Math.abs(got - want) < 0.01) pass++;
  else {
    fail++;
    console.error(`FAIL ${name}: got ${got}, want ${want}`);
  }
};

const bill = (over) =>
  P.combinedBill({
    taxYear: '2026-27',
    employmentIncome: 0,
    tradeProfit: 0,
    rents: 0,
    propertyExpenses: 0,
    financeCosts: 0,
    ...over,
  });

// --- Exam 1: the HMRC annex example, locked -----------------------------------------
// Employment 30,000, property PROFIT 3,000, finance costs 1,000, 2027/28 rules.
// HMRC: earned tax 3,486, property tax 660, relief 220, total 3,926.
// The example states profit directly, so the inputs are rents 4,500 less
// expenses 1,500 (actuals beat the allowance, profit exactly 3,000).
{
  const r = bill({ taxYear: '2027-28', employmentIncome: 30000, rents: 4500, propertyExpenses: 1500, financeCosts: 1000 });
  eq('HMRC annex: earned tax', r.earnedTax, 3486);
  eq('HMRC annex: property tax at 22%', r.propertyTax, 660);
  eq('HMRC annex: Section 24 relief at 22%', r.s24Relief, 220);
  eq('HMRC annex: total income tax £3,926', r.incomeTax, 3926);
}

// --- Exam 2: the same person under current rules, and the delta ----------------------
// 2026/27 merged computation: (33,000 - 12,570) x 20% = 4,086, relief 200 -> 3,886.
{
  const d = P.aprilDelta({ employmentIncome: 30000, rents: 4500, propertyExpenses: 1500, financeCosts: 1000 });
  eq('same person 2026/27 bill', d.now.incomeTax, 3886);
  eq('April 2027 costs them £40 more', d.extraPerYear, 40);
}

// --- Exam 3: the sparky with a flat (trade + property) -------------------------------
// Trade 40,000, rents 12,000, expenses 2,000, finance 6,000.
// 2026/27: prop profit 10,000 (actuals beat allowance). Earned taxable 27,430
// at 20% = 5,486. Property all within basic band = 2,000. S24 = 20% x 6,000 =
// 1,200. Income tax 6,286. Class 4 = 6% x 27,430 = 1,645.80.
{
  const r = bill({ tradeProfit: 40000, rents: 12000, propertyExpenses: 2000, financeCosts: 6000 });
  ok('sparky: actual expenses used', !r.property.usedAllowance);
  eq('sparky: property profit', r.property.profit, 10000);
  eq('sparky: earned tax', r.earnedTax, 5486);
  eq('sparky: property tax', r.propertyTax, 2000);
  eq('sparky: S24 relief', r.s24Relief, 1200);
  eq('sparky: income tax', r.incomeTax, 6286);
  eq('sparky: class 4 on trade only', r.class4, 1645.8);
  eq('sparky: bill caused by the flat', r.taxCausedByProperty, 800);
  const d = P.aprilDelta({ tradeProfit: 40000, rents: 12000, propertyExpenses: 2000, financeCosts: 6000 });
  eq('sparky: April 2027 adds £80', d.extraPerYear, 80);
}

// --- Exam 4: higher rate employee landlord -------------------------------------------
// Salary 60,000, rents 24,000, expenses 4,000, finance 10,000.
// 2026/27: prop profit 20,000. Earned taxable 47,430: 37,700 at 20% + 9,730 at
// 40% = 11,432. Property all at 40% = 8,000. S24 = 2,000. Income tax 17,432.
{
  const r = bill({ employmentIncome: 60000, rents: 24000, propertyExpenses: 4000, financeCosts: 10000 });
  eq('higher rate: earned tax', r.earnedTax, 11432);
  eq('higher rate: property tax at 40%', r.propertyTax, 8000);
  eq('higher rate: income tax', r.incomeTax, 17432);
  const d = P.aprilDelta({ employmentIncome: 60000, rents: 24000, propertyExpenses: 4000, financeCosts: 10000 });
  eq('higher rate: property tax at 42% from 2027', d.then.propertyTax, 8400);
  eq('higher rate: S24 at 22% from 2027', d.then.s24Relief, 2200);
  eq('higher rate: April 2027 adds £200', d.extraPerYear, 200);
}

// --- Exam 5: the full time landlord (property is the job) ----------------------------
// No salary, no trade. Rents 45,000, expenses 9,000, finance 14,000.
// Prop profit 36,000. PA all spills to property: taxable 23,430 at 20% =
// 4,686. S24 = 20% x 14,000 = 2,800. Income tax 1,886. No NI at all.
{
  const r = bill({ rents: 45000, propertyExpenses: 9000, financeCosts: 14000 });
  eq('full timer: property tax', r.propertyTax, 4686);
  eq('full timer: earned tax is nil', r.earnedTax, 0);
  eq('full timer: S24 relief', r.s24Relief, 2800);
  eq('full timer: income tax', r.incomeTax, 1886);
  eq('full timer: no class 4 on property', r.class4, 0);
  // 2027/28: 23,430 at 22% = 5,154.60, S24 = 3,080. Income tax 2,074.60.
  const d = P.aprilDelta({ rents: 45000, propertyExpenses: 9000, financeCosts: 14000 });
  eq('full timer: 2027/28 income tax', d.then.incomeTax, 2074.6);
}

// --- Exam 6: the allowance election ---------------------------------------------------
{
  const a = P.propertyProfit(5000, 300, '2026-27');
  ok('allowance beats £300 of expenses', a.usedAllowance);
  eq('allowance: profit', a.profit, 4000);
  const b = P.propertyProfit(5000, 1800, '2026-27');
  ok('£1,800 of expenses beat the allowance', !b.usedAllowance);
  eq('actuals: profit', b.profit, 3200);
  const c = P.propertyProfit(800, 0, '2026-27');
  eq('rents within the allowance: nothing to tax', c.profit, 0);
  ok('and the note says so', c.note.includes('nothing to report'));
  const d = P.propertyProfit(6000, 7500, '2026-27');
  eq('loss carries forward', d.loss, 1500);
  eq('loss year profit is nil', d.profit, 0);
}

// --- Exam 7: the Section 24 cap -------------------------------------------------------
// Finance costs above property profit: relief capped at the profit.
// Rents 6,000, expenses 400 (allowance wins, profit 5,000), finance 9,000.
{
  const r = bill({ employmentIncome: 30000, rents: 6000, propertyExpenses: 400, financeCosts: 9000 });
  eq('S24 capped at the property profit', r.s24Relief, 1000); // 20% x 5,000
  eq('unrelieved finance carries forward', r.s24UnrelievedFinance, 4000);
}

// --- Exam 8: the taper still bites across streams -------------------------------------
// Salary 90,000 + rents 20,000 with no expenses: the £1,000 allowance applies,
// so property PROFIT is 19,000 and adjusted net income is 109,000.
// PA = 12,570 less (109,000 - 100,000) / 2 = 8,070. The engine caught what a
// hand calculation missed: the allowance reduces the taper too.
{
  const r = bill({ employmentIncome: 90000, rents: 20000, propertyExpenses: 0, financeCosts: 0 });
  eq('tapered personal allowance', r.personalAllowanceUsed, 8070);
}

// --- Exam 9: low earner, the allowance spills to property -----------------------------
// Salary 8,000, rents 10,000, no expenses (allowance, profit 9,000).
// PA: 8,000 against salary, 4,570 spills. Property taxable 4,430.
{
  const now = bill({ employmentIncome: 8000, rents: 10000 });
  eq('low earner 2026/27 property tax', now.propertyTax, 886); // 20%
  const then = bill({ taxYear: '2027-28', employmentIncome: 8000, rents: 10000 });
  eq('low earner 2027/28 property tax', then.propertyTax, 974.6); // 22%
}

// --- Exam 10: joint ownership ----------------------------------------------------------
{
  const r = bill({ employmentIncome: 30000, rents: 12000, propertyExpenses: 4000, financeCosts: 2000, jointShare: 0.5 });
  eq('half the rents', r.property.rents, 6000);
  eq('half the profit', r.property.profit, 4000);
  eq('half the S24 relief', r.s24Relief, 200);
}

// --- Exam 11: Rent a Room ---------------------------------------------------------------
{
  const a = P.rentARoom(6000, 900);
  ok('lodger under the limit is tax free', a.withinLimit && a.taxableWithRelief === 0);
  const b = P.rentARoom(9000, 1500);
  ok('over the limit, relief still better', !b.withinLimit && b.reliefIsBetter);
  eq('taxable is the excess only', b.taxableWithRelief, 1500);
  const c = P.rentARoom(9000, 8200);
  ok('heavy expenses flip the answer', !c.reliefIsBetter);
  eq('actuals taxable', c.taxableWithActuals, 800);
}

// --- Exam 12: year selection and copy hygiene -------------------------------------------
{
  ok('today is 2026/27', P.currentPropertyYear(new Date('2026-07-06T00:00:00Z')) === '2026-27');
  ok('6 April 2027 flips the schedule', P.currentPropertyYear(new Date('2027-04-06T00:00:00Z')) === '2027-28');
  ok('5 April 2027 does not', P.currentPropertyYear(new Date('2027-04-05T00:00:00Z')) === '2026-27');
  const r = bill({ employmentIncome: 30000, rents: 5000, propertyExpenses: 200, financeCosts: 500 });
  ok('notes carry no forbidden dashes', !/[–—−]/.test(r.property.note));
}

console.log(`propertyengine: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

// 🔴 HISTORICAL TAX YEARS. What a sole trader owed in each of the last four years, so Lekhio can help
// a man amend a prior return or answer "what should I have set aside in 2023/24".
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EVERY FIGURE IN THIS FILE IS SOURCED FROM GOV.UK, NOT FROM MEMORY. That rule is not optional here:
// the recent years are exactly where it is treacherous (the 2022 health-and-social-care levy, the
// 2024 Class 4 cut, the additional-rate threshold dropping to £125,140), and a wrong historical rate
// walks a false number into somebody's amended return, which is the worst thing this product can do.
//
// Sources, both HMRC, both Open Government Licence, both fetched 15 July 2026:
//   INCOME TAX  gov.uk/government/publications/rates-and-allowances-income-tax/
//               income-tax-rates-and-allowances-current-and-past
//   NIC         gov.uk/government/publications/rates-and-allowances-national-insurance-contributions/
//               rates-and-allowances-national-insurance-contributions
//
// WHAT THE SOURCE ACTUALLY SAYS, and it makes this build tight:
//   . Income tax is FROZEN identical across 2023/24 to 2026/27: PA £12,570, basic band £37,700,
//     additional-rate threshold £125,140, rates 20/40/45. So income tax is computed by the SAME
//     function every year, and a guard below screams the day that freeze ends.
//   . The ONLY thing that moved for a sole trader is CLASS 4 NI: 9% in 2023/24, then 6% from 2024/25.
//
// ⚠️ COVERAGE IS THE AMENDMENT WINDOW ON PURPOSE. 2023/24 to 2026/27 is roughly how far back a Self
// Assessment return can be amended. 2022/23 and earlier are deliberately NOT here yet: 2022/23 Class 4
// was a BLENDED annualised rate because the levy changed mid-year, and that needs its own careful
// sourcing rather than a guess. A year we do not hold returns null. We never invent one.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { incomeTaxOnProfit, FACTS } from './taxengine';

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface YearRates {
  taxYear: string;
  // Income tax (England, Wales, NI). Held explicitly even though frozen, so the guard can check them.
  personalAllowance: number;
  basicRateBand: number;
  additionalRateThreshold: number;
  // Class 4 NIC, the part that actually varies across the window.
  class4LowerLimit: number;
  class4UpperLimit: number;
  class4MainRate: number;
  class4UpperRate: number;
  // Class 2 (informational: since 6 April 2024 it is treated as paid, not payable, above the SPT).
  class2WeeklyRate: number;
  class2SmallProfitsThreshold: number;
  class2Payable: boolean;
  source: string;
}

const NIC_SRC = 'GOV.UK HMRC, Rates and allowances: National Insurance contributions (OGL, fetched 15 Jul 2026)';
const IT_SRC = 'GOV.UK HMRC, Income Tax rates and allowances for current and previous tax years (OGL, fetched 15 Jul 2026)';

export const TAX_YEARS: Record<string, YearRates> = {
  '2026-27': {
    taxYear: '2026-27',
    personalAllowance: 12570, basicRateBand: 37700, additionalRateThreshold: 125140,
    class4LowerLimit: 12570, class4UpperLimit: 50270, class4MainRate: 0.06, class4UpperRate: 0.02,
    class2WeeklyRate: 3.65, class2SmallProfitsThreshold: 7105, class2Payable: false,
    source: `${IT_SRC}; ${NIC_SRC}`,
  },
  '2025-26': {
    taxYear: '2025-26',
    personalAllowance: 12570, basicRateBand: 37700, additionalRateThreshold: 125140,
    class4LowerLimit: 12570, class4UpperLimit: 50270, class4MainRate: 0.06, class4UpperRate: 0.02,
    class2WeeklyRate: 3.50, class2SmallProfitsThreshold: 6845, class2Payable: false,
    source: `${IT_SRC}; ${NIC_SRC}`,
  },
  '2024-25': {
    taxYear: '2024-25',
    personalAllowance: 12570, basicRateBand: 37700, additionalRateThreshold: 125140,
    class4LowerLimit: 12570, class4UpperLimit: 50270, class4MainRate: 0.06, class4UpperRate: 0.02,
    class2WeeklyRate: 3.45, class2SmallProfitsThreshold: 6725, class2Payable: false,
    source: `${IT_SRC}; ${NIC_SRC}`,
  },
  '2023-24': {
    taxYear: '2023-24',
    personalAllowance: 12570, basicRateBand: 37700, additionalRateThreshold: 125140,
    // 🔴 THE ONE THAT MOVED. Class 4 main rate was 9% in 2023/24, cut to 6% from 2024/25.
    class4LowerLimit: 12570, class4UpperLimit: 50270, class4MainRate: 0.09, class4UpperRate: 0.02,
    // And in 2023/24 Class 2 was still PAYABLE (£3.45/wk) if profits reached the lower profits limit;
    // the "treated as paid" reform is from 6 April 2024.
    class2WeeklyRate: 3.45, class2SmallProfitsThreshold: 6725, class2Payable: true,
    source: `${IT_SRC}; ${NIC_SRC}`,
  },
};

export const SUPPORTED_TAX_YEARS = Object.keys(TAX_YEARS);

// 🔴 THE FREEZE GUARD. Income tax is computed by incomeTaxOnProfit(), which uses the CURRENT FACTS.
// That is only valid because income tax is frozen identical across the whole window. The moment a
// future year un-freezes the personal allowance or a band, this stops being true, and this predicate
// makes the test SCREAM rather than let a wrong allowance compute a wrong old-year bill.
export function incomeTaxIsFrozenAcrossWindow(): boolean {
  return SUPPORTED_TAX_YEARS.every((y) => {
    const r = TAX_YEARS[y];
    return r.personalAllowance === FACTS.personalAllowance
      && r.basicRateBand === FACTS.basicRateBand
      && r.additionalRateThreshold === FACTS.additionalRateThreshold;
  });
}

export interface YearTax {
  taxYear: string;
  incomeTax: number;
  class4: number;
  total: number;
  /** True where we hold the year. A year we do not have returns null from the compute, never a guess. */
}

// Class 4 with a SPECIFIC year's rate. The live class4NIC() hardcodes the current 6%, which is wrong
// for 2023/24, so this recomputes with the year's own main rate.
function class4ForYear(profit: number, y: YearRates): number {
  const p = Math.max(0, profit);
  if (p <= y.class4LowerLimit) return 0;
  const main = Math.min(p, y.class4UpperLimit) - y.class4LowerLimit;
  let nic = Math.max(0, main) * y.class4MainRate;
  if (p > y.class4UpperLimit) nic += (p - y.class4UpperLimit) * y.class4UpperRate;
  return round2(nic);
}

// 🔴 THE ANSWER FOR A GIVEN YEAR. Returns null for a year we do not hold, because a made-up old-year
// bill is worse than "I do not have that year".
export function soleTraderTaxForYear(profit: number, taxYear: string): YearTax | null {
  const y = TAX_YEARS[taxYear];
  if (!y) return null;
  // Income tax: frozen across the window, so the shared function is correct. (The guard proves it.)
  const incomeTax = round2(incomeTaxOnProfit(Math.max(0, profit)));
  const class4 = class4ForYear(profit, y);
  return { taxYear, incomeTax, class4, total: round2(incomeTax + class4) };
}

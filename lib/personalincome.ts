// THE WHOLE-PERSON INCOME TAX ENGINE. This is what turns "does your sole-trader tax" into "does your
// tax", the difference between a bookkeeper and an accountant.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// soleTraderTax() in taxengine.ts treats a trading profit as if it were the person's ONLY income.
// That is right for the wedge and wrong for a real life. A tradesperson very often also has: a PAYE
// job (or a pension), some savings interest, and, if they run through a company, dividends. Those do
// not sit in separate boxes. They STACK, in a fixed order, and the bands they fall into depend on
// everything below them. Getting that stack wrong is exactly the "confident wrong number he signs
// his name to" this whole codebase is built to prevent.
//
// THE ORDER, AND WHY IT IS NOT NEGOTIABLE (it is the law, not a preference):
//
//   1. Non-savings, non-dividend income first: employment, pension, self-employment, property.
//      Taxed at 20 / 40 / 45.
//   2. Savings income next, with two nil-rate bands stacked under it: the STARTING RATE FOR SAVINGS
//      (up to £5,000 at 0%, eaten £1-for-£1 by non-savings income above the personal allowance) and
//      the PERSONAL SAVINGS ALLOWANCE (£1,000 basic / £500 higher / £0 additional). Then 20 / 40 / 45.
//   3. Dividends last, as the top slice, with the DIVIDEND ALLOWANCE (£500 at 0%), then the dividend
//      rates.
//
// 🔴 NIL-RATE BANDS ARE NOT DEDUCTIONS. The starting rate, the PSA and the dividend allowance are
// taxed at 0% but they STILL OCCUPY BAND SPACE. A higher earner's dividend allowance can sit in the
// higher-rate band and push the taxed dividends above it up into additional rate. Treating them as
// deductions (subtracting them off the top) is the single most common way software gets this wrong,
// and it under-taxes. We walk a cursor up the bands so an allowance advances the cursor exactly like
// taxed income does.
//
// ONE ENGINE, ONE TRUTH. The band widths and rates are imported from taxengine (watched by Khoji via
// FACTS), and the dividend rates from ltdengine (the Pay-yourself engine, also watched). Nothing here
// re-types a rate. If a Budget moves one, it moves here too, because there is only one copy.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { FACTS, personalAllowance, class4NIC, class2Voluntary } from './taxengine';
import { LTD } from './ltdengine';

const r2 = (n: number) => Math.round(n * 100) / 100;

// The band boundaries, on TAXABLE income, exactly as incomeTaxOnProfit uses them: basic up to
// £37,700, higher up to £125,140, additional above. The higher band ends at the additional-rate
// threshold because by that income the personal allowance has fully tapered, so taxable == total.
const B1 = FACTS.basicRateBand; // 37,700, end of the 20% band
const B2 = FACTS.additionalRateThreshold; // 125,140, end of the 40% band

interface Rates { basic: number; higher: number; additional: number }
const ZERO: Rates = { basic: 0, higher: 0, additional: 0 };
const MAIN: Rates = { basic: FACTS.basicRate, higher: FACTS.higherRate, additional: FACTS.additionalRate };
const DIVIDEND: Rates = { basic: LTD.dividendBasic, higher: LTD.dividendHigher, additional: LTD.dividendAdditional };

// Place `amount` of income onto the band ladder starting at `cursor` (the taxable income already
// used below it), taxing each part at the rate for the band it falls in. Returns the tax and the new
// cursor. A nil-rate band is placed with ZERO rates: it pays nothing but still advances the cursor,
// which is the whole point.
function place(amount: number, rates: Rates, cursor: number): { tax: number; cursor: number } {
  let tax = 0;
  let amt = Math.max(0, amount);
  let c = cursor;
  // Guard: the loop can only advance, and the last band is unbounded, so it always terminates.
  let guard = 0;
  while (amt > 1e-9 && guard++ < 100) {
    const rate = c < B1 ? rates.basic : c < B2 ? rates.higher : rates.additional;
    const top = c < B1 ? B1 : c < B2 ? B2 : Infinity;
    const take = Math.min(amt, top - c);
    tax += take * rate;
    c += take;
    amt -= take;
  }
  return { tax, cursor: c };
}

export interface PersonalIncomeInput {
  /** Gross employment or pension income (PAYE). Non-savings, non-dividend. */
  employment?: number;
  /** Trading profit from self-employment. Non-savings, non-dividend, and the only slice that bears
   *  Class 4 NIC. */
  selfEmployment?: number;
  /** Other non-savings income: property (rental) profit, most pensions. Taxed with the above. */
  otherNonSavings?: number;
  /** Savings interest (bank, building society, most bonds). NOT ISAs, which are tax-free. */
  savings?: number;
  /** Dividend income. */
  dividends?: number;
}

export interface PersonalIncomeResult {
  totalIncome: number;
  personalAllowance: number;
  taxable: { nonSavings: number; savings: number; dividends: number; total: number };
  allowancesUsed: { startingRateForSavings: number; personalSavingsAllowance: number; dividendAllowance: number };
  incomeTax: { nonSavings: number; savings: number; dividends: number; total: number };
  /** Class 4 NIC on the self-employment slice only. Class 2 is voluntary and shown, not added. */
  class4NIC: number;
  class2Voluntary: number;
  /** Income tax plus Class 4 NIC. Employment Class 1 NIC is deducted at source and not included. */
  totalTax: number;
  /** Total tax over total income, as a percentage. */
  effectiveRate: number;
}

// THE WHOLE PICTURE. Give it any mix of the five income kinds; it returns the income tax computed
// across all of them stacked correctly, plus the self-employment NIC, plus the effective rate.
export function combinedIncomeTax(input: PersonalIncomeInput): PersonalIncomeResult {
  const employment = Math.max(0, input.employment ?? 0);
  const selfEmployment = Math.max(0, input.selfEmployment ?? 0);
  const otherNonSavings = Math.max(0, input.otherNonSavings ?? 0);
  const savings = Math.max(0, input.savings ?? 0);
  const dividends = Math.max(0, input.dividends ?? 0);

  const nonSavings = employment + selfEmployment + otherNonSavings;
  const totalIncome = nonSavings + savings + dividends;

  // Personal allowance, tapered on TOTAL income. Allocated to non-savings first, then savings, then
  // dividends: the order that is beneficial in the great majority of real cases, because savings and
  // dividends carry their own nil-rate bands on top.
  const pa = personalAllowance(totalIncome);
  const paNon = Math.min(pa, nonSavings);
  let paLeft = pa - paNon;
  const paSav = Math.min(paLeft, savings);
  paLeft -= paSav;
  const paDiv = Math.min(paLeft, dividends);

  const taxNon = nonSavings - paNon;
  const taxSav = savings - paSav;
  const taxDiv = dividends - paDiv;
  const taxableTotal = taxNon + taxSav + taxDiv;

  // The band a person is in, for the Personal Savings Allowance, is judged on total taxable income.
  const psa =
    taxableTotal <= B1 ? FACTS.personalSavingsAllowanceBasic :
    taxableTotal <= B2 ? FACTS.personalSavingsAllowanceHigher :
    0;

  // The starting rate for savings: up to £5,000, reduced £1 for every £1 of non-savings income above
  // the personal allowance (which is exactly taxNon), and capped by the savings actually present.
  const startingRateBand = Math.max(0, FACTS.savingsStartingRateBand - taxNon);

  let cursor = 0;

  // 1) Non-savings income.
  const nonRes = place(taxNon, MAIN, cursor);
  cursor = nonRes.cursor;

  // 2) Savings: 0% starting rate, then 0% PSA, then taxed. Each advances the cursor.
  const startingRateUsed = Math.min(taxSav, startingRateBand);
  const afterStarting = taxSav - startingRateUsed;
  const psaUsed = Math.min(afterStarting, psa);
  const taxedSavings = afterStarting - psaUsed;
  cursor = place(startingRateUsed, ZERO, cursor).cursor;
  cursor = place(psaUsed, ZERO, cursor).cursor;
  const savRes = place(taxedSavings, MAIN, cursor);
  cursor = savRes.cursor;

  // 3) Dividends: 0% allowance, then dividend rates. Top slice.
  const dividendAllowanceUsed = Math.min(taxDiv, LTD.dividendAllowance);
  const taxedDividends = taxDiv - dividendAllowanceUsed;
  cursor = place(dividendAllowanceUsed, ZERO, cursor).cursor;
  const divRes = place(taxedDividends, DIVIDEND, cursor);

  const itNon = r2(nonRes.tax);
  const itSav = r2(savRes.tax);
  const itDiv = r2(divRes.tax);
  const itTotal = r2(itNon + itSav + itDiv);

  const c4 = class4NIC(selfEmployment);
  const c2 = class2Voluntary().annual;
  const totalTax = r2(itTotal + c4);

  return {
    totalIncome: r2(totalIncome),
    personalAllowance: r2(pa),
    taxable: { nonSavings: r2(taxNon), savings: r2(taxSav), dividends: r2(taxDiv), total: r2(taxableTotal) },
    allowancesUsed: {
      startingRateForSavings: r2(startingRateUsed),
      personalSavingsAllowance: r2(psaUsed),
      dividendAllowance: r2(dividendAllowanceUsed),
    },
    incomeTax: { nonSavings: itNon, savings: itSav, dividends: itDiv, total: itTotal },
    class4NIC: r2(c4),
    class2Voluntary: r2(c2),
    totalTax,
    effectiveRate: totalIncome > 0 ? r2((totalTax / totalIncome) * 100) : 0,
  };
}

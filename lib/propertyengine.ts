// The landlord engine (doc 82 section 4, Phase E). Canonical web copy.
//
// Tax year aware BY DESIGN: Budget 2025 (26 Nov) gave property income its own
// rate schedule from 6 April 2027, so every rule here lives in PROPERTY_FACTS
// keyed by tax year. When the next Budget lands, add a year entry; never
// rewrite the maths. Source, verified 6 July 2026 against the HMRC technical
// note "Change to tax rates for property, savings and dividend income"
// (published 26 November 2025):
//   2026/27: property income is ordinary non savings income at 20/40/45,
//     Section 24 relief at 20 percent, allowances applied beneficially.
//   2027/28 (England, Wales, NI): property basic 22, higher 42, additional 47.
//     Property income taxed AFTER earned income, before savings and dividends.
//     The personal allowance must be set against earned income FIRST.
//     Section 24 relief at the property basic rate, 22 percent.
//   Unchanged: the £1,000 property allowance, the £7,500 Rent a Room limit,
//     carried forward property losses offset against property income only.
//   Property income carries NO National Insurance in either year.
//
// The HMRC annex example (employment 30,000, property profit 3,000, finance
// costs 1,000, total tax 3,926 under 2027/28 rules) is a locked exam case in
// test/propertyengine.test.mjs.

import { FACTS, personalAllowance, class4NIC } from './taxengine';

const round2 = (n: number) => Math.round(n * 100) / 100;

export type PropertyTaxYear = '2026-27' | '2027-28';

export interface PropertyYearFacts {
  label: string;
  // Rates applied to property income as it stacks on top of earned income.
  // For 2026/27 these equal the main rates, which reproduces the merged
  // "non savings" computation exactly; from 2027/28 they diverge.
  propertyBasicRate: number;
  propertyHigherRate: number;
  propertyAdditionalRate: number;
  // The Section 24 residential finance cost credit rate.
  s24CreditRate: number;
  propertyAllowance: number;
  rentARoomLimit: number;
}

export const PROPERTY_FACTS: Record<PropertyTaxYear, PropertyYearFacts> = {
  '2026-27': {
    label: '2026/27',
    propertyBasicRate: 0.2,
    propertyHigherRate: 0.4,
    propertyAdditionalRate: 0.45,
    s24CreditRate: 0.2,
    propertyAllowance: 1000,
    rentARoomLimit: 7500,
  },
  '2027-28': {
    label: '2027/28',
    propertyBasicRate: 0.22,
    propertyHigherRate: 0.42,
    propertyAdditionalRate: 0.47,
    s24CreditRate: 0.22,
    propertyAllowance: 1000,
    rentARoomLimit: 7500,
  },
};

export const PROPERTY_YEARS: PropertyTaxYear[] = ['2026-27', '2027-28'];

// Which schedule applies on a given date. The 2027/28 entry starts 6 Apr 2027;
// dates beyond the table clamp to the latest year we know (and the tools show
// the year label, so a stale table is visible, same discipline as taxengine).
export function currentPropertyYear(now: Date = new Date()): PropertyTaxYear {
  return now >= new Date(Date.UTC(2027, 3, 6)) ? '2027-28' : '2026-27';
}

// --- Property profit and the allowance election -----------------------------------

export interface PropertyProfitResult {
  rents: number;
  deduction: number;
  usedAllowance: boolean;
  profit: number; // never negative when the allowance is used
  loss: number; // carried forward against future property profits (actuals only)
  note: string;
}

// Compute both routes and take the better one, telling the user which and why.
// The £1,000 property allowance replaces actual expenses (never both) and
// cannot create a loss. Actual expenses can, and the loss carries forward.
export function propertyProfit(rents: number, actualExpenses: number, year: PropertyTaxYear): PropertyProfitResult {
  const f = PROPERTY_FACTS[year];
  const r = Math.max(0, rents);
  const e = Math.max(0, actualExpenses);
  if (r <= f.propertyAllowance && e <= r) {
    return {
      rents: r,
      deduction: r,
      usedAllowance: true,
      profit: 0,
      loss: 0,
      note: `Rents of £${Math.round(r).toLocaleString('en-GB')} sit within the £1,000 property allowance: nothing to tax and usually nothing to report.`,
    };
  }
  if (e >= f.propertyAllowance) {
    const profit = r - e;
    return {
      rents: r,
      deduction: e,
      usedAllowance: false,
      profit: Math.max(0, profit),
      loss: Math.max(0, -profit),
      note:
        profit < 0
          ? 'Actual expenses exceed rents: the loss carries forward against future property profits.'
          : 'Actual expenses beat the £1,000 property allowance, so they are deducted instead.',
    };
  }
  return {
    rents: r,
    deduction: f.propertyAllowance,
    usedAllowance: true,
    profit: Math.max(0, r - f.propertyAllowance),
    loss: 0,
    note: `The £1,000 property allowance beats your £${Math.round(e).toLocaleString('en-GB')} of expenses, so it is used instead.`,
  };
}

// --- Rent a Room -------------------------------------------------------------------

export interface RentARoomResult {
  gross: number;
  withinLimit: boolean;
  taxableWithRelief: number;
  taxableWithActuals: number;
  reliefIsBetter: boolean;
  note: string;
}

export function rentARoom(grossReceipts: number, actualExpenses: number, year: PropertyTaxYear = '2026-27'): RentARoomResult {
  const f = PROPERTY_FACTS[year];
  const g = Math.max(0, grossReceipts);
  const e = Math.max(0, actualExpenses);
  const withRelief = Math.max(0, g - f.rentARoomLimit);
  const withActuals = Math.max(0, g - e);
  const withinLimit = g <= f.rentARoomLimit;
  return {
    gross: g,
    withinLimit,
    taxableWithRelief: round2(withRelief),
    taxableWithActuals: round2(withActuals),
    reliefIsBetter: withRelief <= withActuals,
    note: withinLimit
      ? `Up to £${f.rentARoomLimit.toLocaleString('en-GB')} from a lodger in your own home is tax free under Rent a Room. Nothing to pay.`
      : withRelief <= withActuals
        ? `Over the £${f.rentARoomLimit.toLocaleString('en-GB')} limit, but opting into Rent a Room still beats deducting expenses: you pay tax on the excess only.`
        : 'Your expenses are high enough that the normal method beats Rent a Room this year.',
  };
}

// --- The combined bill across all three streams ------------------------------------

export interface CombinedInput {
  taxYear: PropertyTaxYear;
  employmentIncome: number; // PAYE salary, 0 if none
  tradeProfit: number; // self employed profit, 0 if none
  rents: number; // gross property income
  propertyExpenses: number; // allowable expenses EXCLUDING residential finance costs
  financeCosts: number; // residential mortgage interest and similar (Section 24)
  jointShare?: number; // your share of the property, 0 to 1, default 1
}

export interface CombinedResult {
  year: PropertyTaxYear;
  yearLabel: string;
  property: PropertyProfitResult;
  personalAllowanceUsed: number;
  earnedTax: number;
  propertyTax: number;
  s24Relief: number;
  s24UnrelievedFinance: number; // finance costs the cap left unrelieved (carry forward)
  class4: number; // trade only; property income carries no NI
  incomeTax: number; // earned + property, after the Section 24 reduction
  totalWithClass4: number;
  // The number landlords actually want: the whole bill minus the bill they
  // would face with no property at all.
  taxCausedByProperty: number;
  effectiveRateOnRents: number; // taxCausedByProperty / rents, 0 when no rents
}

// Tax on an amount stacking from a starting point through the taxable bands.
// Band edges on TAXABLE income: basic to 37,700, higher to 125,140, then
// additional. Rates are the year's schedule for the income type in question.
function stackedTax(startTaxable: number, amount: number, rates: [number, number, number]): number {
  const basicTop = FACTS.basicRateBand;
  const higherTop = FACTS.additionalRateThreshold;
  let tax = 0;
  let from = startTaxable;
  let left = amount;
  const bands: Array<[number, number]> = [
    [basicTop, rates[0]],
    [higherTop, rates[1]],
    [Infinity, rates[2]],
  ];
  for (const [top, rate] of bands) {
    if (left <= 0) break;
    if (from >= top) continue;
    const slice = Math.min(left, top - from);
    tax += slice * rate;
    from += slice;
    left -= slice;
  }
  return tax;
}

function billFor(input: CombinedInput, includeProperty: boolean): {
  property: PropertyProfitResult;
  pa: number;
  earnedTax: number;
  propertyTax: number;
  s24Relief: number;
  s24Unrelieved: number;
  incomeTax: number;
} {
  const f = PROPERTY_FACTS[input.taxYear];
  // Coerce every field: a tool omitting a stream must mean zero, never NaN.
  const share = Math.min(1, Math.max(0, input.jointShare ?? 1));
  const rents = includeProperty ? Math.max(0, input.rents || 0) * share : 0;
  const expenses = includeProperty ? Math.max(0, input.propertyExpenses || 0) * share : 0;
  const finance = includeProperty ? Math.max(0, input.financeCosts || 0) * share : 0;

  const property = propertyProfit(rents, expenses, input.taxYear);
  const earned = Math.max(0, input.employmentIncome || 0) + Math.max(0, input.tradeProfit || 0);
  const totalIncome = earned + property.profit;

  // The taper works on adjusted net income, which includes property profit.
  const pa = personalAllowance(totalIncome);

  // Allowance against earned income first, the balance against property.
  // This is the statutory ordering from April 2027, and for 2026/27 (where
  // earned and property share one rate schedule) it produces the same result
  // as the current beneficial ordering, so one algorithm serves both years.
  const earnedTaxable = Math.max(0, earned - pa);
  const paLeft = Math.max(0, pa - earned);
  const propertyTaxable = Math.max(0, property.profit - paLeft);

  const earnedTax = stackedTax(0, earnedTaxable, [FACTS.basicRate, FACTS.higherRate, FACTS.additionalRate]);
  const propertyTax = stackedTax(earnedTaxable, propertyTaxable, [
    f.propertyBasicRate,
    f.propertyHigherRate,
    f.propertyAdditionalRate,
  ]);

  // Section 24: relief at the year's credit rate on the LOWEST of finance
  // costs, property profits, and adjusted total income above the allowance.
  // The reduction cannot take the bill below zero; unrelieved finance costs
  // carry forward.
  const reliefBase = Math.min(finance, property.profit, Math.max(0, totalIncome - pa));
  const s24Relief = Math.min(f.s24CreditRate * Math.max(0, reliefBase), earnedTax + propertyTax);
  const s24Unrelieved = Math.max(0, finance - Math.max(0, reliefBase));

  return {
    property,
    pa,
    earnedTax,
    propertyTax,
    s24Relief,
    s24Unrelieved,
    incomeTax: earnedTax + propertyTax - s24Relief,
  };
}

export function combinedBill(input: CombinedInput): CombinedResult {
  const withProperty = billFor(input, true);
  const withoutProperty = billFor(input, false);
  const trade = Math.max(0, input.tradeProfit || 0);
  const class4 = trade > 0 ? class4NIC(trade) : 0;
  const share = Math.min(1, Math.max(0, input.jointShare ?? 1));
  const rents = Math.max(0, input.rents || 0) * share;
  const causedByProperty = Math.max(0, withProperty.incomeTax - withoutProperty.incomeTax);
  return {
    year: input.taxYear,
    yearLabel: PROPERTY_FACTS[input.taxYear].label,
    property: withProperty.property,
    personalAllowanceUsed: round2(withProperty.pa),
    earnedTax: round2(withProperty.earnedTax),
    propertyTax: round2(withProperty.propertyTax),
    s24Relief: round2(withProperty.s24Relief),
    s24UnrelievedFinance: round2(withProperty.s24Unrelieved),
    class4: round2(class4),
    incomeTax: round2(withProperty.incomeTax),
    totalWithClass4: round2(withProperty.incomeTax + class4),
    taxCausedByProperty: round2(causedByProperty),
    effectiveRateOnRents: rents > 0 ? round2((causedByProperty / rents) * 100) / 100 : 0,
  };
}

// The flagship comparison: the same numbers under this year's rules and under
// the April 2027 schedule, with the difference the headline.
export function aprilDelta(input: Omit<CombinedInput, 'taxYear'>): {
  now: CombinedResult;
  then: CombinedResult;
  extraPerYear: number;
} {
  const now = combinedBill({ ...input, taxYear: '2026-27' });
  const then = combinedBill({ ...input, taxYear: '2027-28' });
  return { now, then, extraPerYear: round2(then.incomeTax - now.incomeTax) };
}

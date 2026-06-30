// Lekhio canonical UK tax engine, 2026/27.
//
// This is the single source of truth for the numbers Lekhio works out: income
// tax, National Insurance, CIS, mileage, capital allowances, the trading
// allowance, VAT registration and MTD thresholds. The website calculator, the
// WhatsApp answers and the app all defer to the rules encoded here.
//
// Every figure is the published 2026/27 figure, with the source noted. The logic
// follows the method taught in the leading tax qualifications (ACCA TX, ICAEW
// Principles of Taxation, AAT Business and Personal Tax). It is tested by an
// exam-style suite in test/exams. Nothing here files anything. We prepare, the
// user approves, HMRC keeps them responsible.
//
// Pure functions only, no dependencies, so it runs the same in the browser, on
// the server, and in the test runner.

export const TAX_YEAR = '2026/27';

// --- Published figures, 2026/27 (England, Wales, Northern Ireland) ----------
export const FACTS = {
  taxYear: '2026/27',
  personalAllowance: 12570,
  personalAllowanceTaperFloor: 100000, // PA reduced £1 for every £2 of income above this
  personalAllowanceLostAt: 125140, // PA is nil at and above this
  basicRateBand: 37700, // width of the 20% band, on taxable income
  basicRate: 0.2,
  higherRate: 0.4,
  additionalRate: 0.45,
  additionalRateThreshold: 125140, // taxable income above this is taxed at 45%
  // National Insurance, self-employed
  class4LowerLimit: 12570,
  class4UpperLimit: 50270,
  class4MainRate: 0.06,
  class4UpperRate: 0.02,
  class2WeeklyRate: 3.65, // 2026/27; voluntary since April 2024, pay to protect benefits
  class2SmallProfitsThreshold: 7105,
  // Allowances and reliefs
  tradingAllowance: 1000,
  annualInvestmentAllowance: 1000000, // 100% relief on qualifying plant and machinery
  // Mileage, simplified expenses (raised from April 2026)
  mileageCarFirst10k: 0.55,
  mileageCarOver10k: 0.25,
  mileageMotorcycle: 0.24,
  mileageBicycle: 0.2,
  mileageFirstBandMiles: 10000,
  // Home, simplified flat rate per month by hours worked at home
  homeFlatRate25to50: 10,
  homeFlatRate51to100: 18,
  homeFlatRate101plus: 26,
  // VAT
  vatRegistrationThreshold: 90000,
  vatDeregistrationThreshold: 88000,
  vatStandardRate: 0.2,
  // CIS, deduction rates on labour (never on materials)
  cisRegisteredRate: 0.2,
  cisUnregisteredRate: 0.3,
  cisGrossRate: 0,
  // MTD for Income Tax, qualifying income thresholds by first mandated year
  mtdThreshold2026: 50000,
  mtdThreshold2027: 30000,
  mtdThreshold2028: 20000,
  // Capital allowances, writing down allowance pools
  wdaMainRate: 0.18, // main pool
  wdaSpecialRate: 0.06, // special rate pool (e.g. most cars, integral features)
  // Payments on account
  poaThreshold: 1000, // POAs apply once the Self Assessment bill exceeds this
  // Capital gains tax, 2026/27
  cgtAnnualExempt: 3000,
  cgtBasicRate: 0.18,
  cgtHigherRate: 0.24,
  badrRate: 0.18, // Business Asset Disposal Relief, from 6 April 2026
  badrLifetimeLimit: 1000000,
  // VAT flat rate scheme
  vatFlatRateLimitedCost: 0.165, // the limited cost trader rate
} as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

// --- Income tax -------------------------------------------------------------

// The personal allowance after the high-income taper. Adjusted net income is the
// figure the taper runs on. Reduced by £1 for every £2 above £100,000, to nil at
// £125,140.
export function personalAllowance(adjustedNetIncome: number): number {
  const pa = FACTS.personalAllowance;
  if (adjustedNetIncome <= FACTS.personalAllowanceTaperFloor) return pa;
  const reduction = Math.floor((adjustedNetIncome - FACTS.personalAllowanceTaperFloor) / 2);
  return Math.max(0, pa - reduction);
}

// Income tax on a trading profit treated as the person's only income. Bands are
// applied to taxable income (profit less personal allowance): 20% on the first
// £37,700, 40% up to £125,140, 45% above. This is the standard exam method.
export function incomeTaxOnProfit(profit: number): number {
  if (profit <= 0) return 0;
  const pa = personalAllowance(profit);
  const taxable = Math.max(0, profit - pa);

  const basic = Math.min(taxable, FACTS.basicRateBand);
  let tax = basic * FACTS.basicRate;

  const afterBasic = Math.max(0, taxable - FACTS.basicRateBand);
  const higherWidth = FACTS.additionalRateThreshold - FACTS.basicRateBand; // 87,440
  const higher = Math.min(afterBasic, higherWidth);
  tax += higher * FACTS.higherRate;

  const additional = Math.max(0, taxable - FACTS.additionalRateThreshold);
  tax += additional * FACTS.additionalRate;

  return round2(tax);
}

// --- National Insurance, self-employed -------------------------------------

// Class 4 NIC: 6% on profits between the lower and upper limits, 2% above.
export function class4NIC(profit: number): number {
  if (profit <= FACTS.class4LowerLimit) return 0;
  const main = Math.min(profit, FACTS.class4UpperLimit) - FACTS.class4LowerLimit;
  let nic = Math.max(0, main) * FACTS.class4MainRate;
  if (profit > FACTS.class4UpperLimit) {
    nic += (profit - FACTS.class4UpperLimit) * FACTS.class4UpperRate;
  }
  return round2(nic);
}

// Class 2 NIC has been voluntary since April 2024. There is no compulsory charge.
// Those below the small profits threshold may pay voluntarily to protect their
// state pension and benefits. Returned for information, not added to the bill.
export function class2Voluntary(): { weeklyRate: number; annual: number; compulsory: boolean } {
  return { weeklyRate: FACTS.class2WeeklyRate, annual: round2(FACTS.class2WeeklyRate * 52), compulsory: false };
}

// The whole personal tax position on a sole trader's profit: income tax plus
// Class 4 NIC. Class 2 is voluntary and excluded from the total.
export function soleTraderTax(profit: number): { incomeTax: number; class4: number; total: number } {
  const incomeTax = incomeTaxOnProfit(profit);
  const class4 = class4NIC(profit);
  return { incomeTax, class4, total: round2(incomeTax + class4) };
}

// --- Trading allowance ------------------------------------------------------

// Taxable trading profit, taking the better of actual expenses or the £1,000
// trading allowance. If gross income is £1,000 or less it is fully covered and
// need not be reported. The allowance cannot create a loss.
export function taxableTradingProfit(grossIncome: number, expenses: number): number {
  if (grossIncome <= FACTS.tradingAllowance) return 0;
  const deduction = Math.max(expenses, FACTS.tradingAllowance);
  return Math.max(0, round2(grossIncome - deduction));
}

// --- CIS, Construction Industry Scheme --------------------------------------

export type CisStatus = 'registered' | 'unregistered' | 'gross';

// The CIS deduction a contractor takes from a subcontractor's payment. Always on
// the labour element only, never on materials. 20% registered, 30% unregistered,
// 0% for gross status.
export function cisDeduction(labour: number, materials: number, status: CisStatus = 'registered'): { deduction: number; net: number } {
  const rate = status === 'gross' ? FACTS.cisGrossRate : status === 'unregistered' ? FACTS.cisUnregisteredRate : FACTS.cisRegisteredRate;
  const deduction = round2(Math.max(0, labour) * rate);
  const net = round2(Math.max(0, labour) + Math.max(0, materials) - deduction);
  return { deduction, net };
}

// --- Mileage, simplified expenses -------------------------------------------

export type Vehicle = 'car' | 'van' | 'motorcycle' | 'bicycle';

export function mileageClaim(miles: number, vehicle: Vehicle = 'car'): number {
  if (miles <= 0) return 0;
  if (vehicle === 'motorcycle') return round2(miles * FACTS.mileageMotorcycle);
  if (vehicle === 'bicycle') return round2(miles * FACTS.mileageBicycle);
  const first = Math.min(miles, FACTS.mileageFirstBandMiles);
  const over = Math.max(0, miles - FACTS.mileageFirstBandMiles);
  return round2(first * FACTS.mileageCarFirst10k + over * FACTS.mileageCarOver10k);
}

// --- Home, simplified flat rate ---------------------------------------------

// The monthly flat rate for working from home, by hours worked there per month.
// Under 25 hours: nothing under the simplified scheme.
export function homeOfficeFlatRateMonthly(hoursPerMonth: number): number {
  if (hoursPerMonth >= 101) return FACTS.homeFlatRate101plus;
  if (hoursPerMonth >= 51) return FACTS.homeFlatRate51to100;
  if (hoursPerMonth >= 25) return FACTS.homeFlatRate25to50;
  return 0;
}

// --- Capital allowances -----------------------------------------------------

// The Annual Investment Allowance gives 100% relief on qualifying plant and
// machinery in the year of purchase, up to £1,000,000.
export function annualInvestmentAllowance(spend: number): number {
  return round2(Math.min(Math.max(0, spend), FACTS.annualInvestmentAllowance));
}

// --- VAT --------------------------------------------------------------------

// Must register once taxable turnover in any rolling 12 months exceeds £90,000.
export function vatRegistrationRequired(rolling12mTurnover: number): boolean {
  return rolling12mTurnover > FACTS.vatRegistrationThreshold;
}

// --- MTD for Income Tax -----------------------------------------------------

// Whether MTD for Income Tax applies, by qualifying income and the tax year being
// tested. £50,000+ from April 2026, £30,000+ from April 2027, £20,000+ from 2028.
export function mtdForIncomeTaxRequired(qualifyingIncome: number, startYear: 2026 | 2027 | 2028 = 2026): boolean {
  const threshold = startYear >= 2028 ? FACTS.mtdThreshold2028 : startYear === 2027 ? FACTS.mtdThreshold2027 : FACTS.mtdThreshold2026;
  return qualifyingIncome > threshold;
}

// --- Capital allowances: writing down allowance -----------------------------

// The writing down allowance on a pool balance. Main pool 18%, special rate pool
// 6%. Used for spend over the AIA limit, or assets that do not qualify for AIA.
export function writingDownAllowance(poolBalance: number, pool: 'main' | 'special' = 'main'): number {
  const rate = pool === 'special' ? FACTS.wdaSpecialRate : FACTS.wdaMainRate;
  return round2(Math.max(0, poolBalance) * rate);
}

// --- Payments on account ----------------------------------------------------

// How Self Assessment is actually paid. Once your bill is over £1,000, HMRC asks
// for two payments on account towards next year, each half this year's bill, due
// 31 January and 31 July, on top of the balancing payment. This is the thing that
// surprises people, so we make it explicit.
export interface PaymentsOnAccount {
  required: boolean;
  eachPayment: number;
  firstDue: string;
  secondDue: string;
}

export function paymentsOnAccount(saBill: number, taxYearEnd = 2026): PaymentsOnAccount {
  const required = saBill > FACTS.poaThreshold;
  const each = required ? round2(saBill / 2) : 0;
  return {
    required,
    eachPayment: each,
    firstDue: `31 January ${taxYearEnd + 1}`,
    secondDue: `31 July ${taxYearEnd + 1}`,
  };
}

// --- Trading losses ---------------------------------------------------------

// The simplest, most common relief: a loss carried forward against future profits
// of the same trade. Returns the taxable profit after relief and any loss still
// carried forward. (Sideways relief against total income under s64 is also an
// option in the loss year; the assistant explains that case.)
export function lossCarriedForward(currentProfit: number, broughtForwardLoss: number): { taxableProfit: number; lossRemaining: number } {
  const used = Math.min(Math.max(0, broughtForwardLoss), Math.max(0, currentProfit));
  return {
    taxableProfit: round2(Math.max(0, currentProfit) - used),
    lossRemaining: round2(Math.max(0, broughtForwardLoss) - used),
  };
}

// --- Capital gains tax ------------------------------------------------------

// CGT on a gain, 2026/27. £3,000 tax free, then 18% or 24% on other assets, or
// 18% with Business Asset Disposal Relief on a qualifying business sale.
export function capitalGainsTax(gain: number, opts: { higherRate?: boolean; badr?: boolean } = {}): number {
  const taxable = Math.max(0, gain - FACTS.cgtAnnualExempt);
  if (taxable <= 0) return 0;
  const rate = opts.badr ? FACTS.badrRate : opts.higherRate ? FACTS.cgtHigherRate : FACTS.cgtBasicRate;
  return round2(taxable * rate);
}

// --- VAT flat rate scheme ---------------------------------------------------

// VAT due under the flat rate scheme: a single percentage of VAT-inclusive
// turnover. The percentage depends on the trade, with a 16.5% rate for limited
// cost traders. The caller supplies the trade's rate.
export function vatFlatRateDue(grossTurnover: number, ratePercent: number): number {
  return round2(Math.max(0, grossTurnover) * (ratePercent / 100));
}

// --- Allowable expense classification ---------------------------------------
// A compact, exam-aligned verdict for common trade costs. 'yes' fully allowable,
// 'partly' business proportion only, 'no' disallowable, 'depends' on the facts.
// This mirrors the deeper knowledge base used in the product and is checked by
// the exam suite against textbook treatment.

export type Verdict = 'yes' | 'partly' | 'no' | 'depends';

const EXPENSE_VERDICTS: Record<string, Verdict> = {
  tools: 'yes',
  materials: 'yes',
  fuel_business: 'partly',
  van_running_costs: 'partly',
  public_liability_insurance: 'yes',
  protective_clothing: 'yes',
  everyday_clothing: 'no',
  training_existing_skill: 'yes',
  training_new_trade: 'no',
  client_entertaining: 'no',
  staff_wages: 'yes',
  subcontractor_payments: 'yes',
  accountancy_fees: 'yes',
  fines_and_penalties: 'no',
  home_office_proportion: 'partly',
  phone_business_share: 'partly',
  mileage: 'yes',
  tools_personal_use: 'partly',
  lunch_working_locally: 'no',
  professional_subscriptions: 'yes',
};

export function classifyExpense(key: string): Verdict | null {
  return EXPENSE_VERDICTS[key] ?? null;
}

// --- Encoded concepts -------------------------------------------------------
// Short, gradeable canonical answers to the non-numeric facts a UK self-employed
// assistant must know, aligned to the qualification syllabuses. Used by the
// product to answer questions and by the exam suite to verify accuracy.

const CONCEPTS: Record<string, string | number> = {
  // Basis period reform: from 2024/25 profits are taxed on the tax-year basis,
  // whatever the accounting date.
  basis_of_assessment: 'tax-year basis',
  cash_basis_default_from: '2024/25',
  // Tax avoidance is legal, tax evasion is illegal. The illegal one:
  illegal_practice: 'evasion',
  // Records must be kept at least 5 years after the 31 January submission deadline.
  record_keeping_years: 5,
  // First MTD for Income Tax quarterly update (period 6 Apr to 5 Jul 2026).
  mtd_first_quarter_deadline: '2026-08-07',
  // Self assessment balancing payment and first payment on account due date.
  self_assessment_deadline: '2026-01-31',
  // CIS deductions are taken from the labour element only, never materials.
  cis_deducted_from: 'labour',
  // Badges of trade are the tests used to decide whether activity amounts to:
  badges_of_trade_decide: 'trading',
  // Whether the £1,000 trading allowance can create a loss.
  trading_allowance_creates_loss: 'no',
  // Entertaining clients is disallowable.
  client_entertaining_allowable: 'no',
  // Double-entry bookkeeping: total debits must equal total credits.
  double_entry: 'equal',
};

export function concept(key: string): string | number | null {
  return key in CONCEPTS ? CONCEPTS[key] : null;
}

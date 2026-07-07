// lib/taxoptimiser.ts. The engine that answers "lower my tax as much as possible".
//
// It scans a user's confirmed figures and profile and returns every LEGITIMATE
// lever to reduce their tax, each with an estimated saving and an autonomy action
// class. It is deterministic maths on the canonical engine, no AI, no cost.
//
// The doctrine line, held here as everywhere: these are the real HMRC rules
// applied to the user's own numbers. It surfaces genuine reliefs the user is
// entitled to; it never invents a claim or coaches disguising personal as
// business. Every money lever (buying an asset, a pension contribution) is
// classed irreversible, so applyDial can never auto-execute it, only draft it
// for the user's yes. Timing and tax-treatment guidance only. You decide.

import { FACTS, soleTraderTax, homeOfficeFlatRateMonthly } from './taxengine';
import { decideAction, type AutonomyLevel } from './autonomy';

export interface OptimiserInput {
  startYear: number;
  monthsElapsed: number; // full months into the tax year, for projection confidence
  ytdTradeIncome: number;
  ytdTradeExpenses: number;
  ytdCisSuffered: number;
  employmentIncome: number; // annual PAYE salary, 0 if none
  categoriesLogged: string[]; // distinct trade expense categories seen this year, lowercased
  homeOfficeClaimed: boolean;
  mileageClaimed: boolean;
  purchaseGoal?: { title: string; amount: number } | null;
}

export interface Optimisation {
  key: string;
  title: string;
  detail: string; // plain English, with the user's own numbers
  estSaving: number; // estimated £ saved this year, 0 when not quantifiable
  action: string; // maps to lib/autonomy classifyAction
  info?: boolean; // pure information, nothing to action (e.g. a refund building)
}

function round(n: number): number {
  return Math.round(Number.isFinite(n) ? n : 0);
}

// The rate the next pound of profit is taxed at (income tax plus Class 4 NI),
// which is what each pound of extra allowable deduction actually saves. Mirrors
// lib/agent.ts so a saving quoted here matches a saving quoted there.
export function marginalRate(projectedTotalIncome: number): number {
  if (projectedTotalIncome >= FACTS.personalAllowanceTaperFloor) return 0.62; // taper: 40 + 2 + 20
  if (projectedTotalIncome >= FACTS.class4UpperLimit) return 0.42; // 40 + 2
  if (projectedTotalIncome > FACTS.personalAllowance) return 0.26; // 20 + 6
  return 0;
}

// The common allowable costs a tradesperson usually has. Missing two or more of
// these while trading is a strong signal of unclaimed, tax-reducing spend.
const COMMON_COSTS = ['fuel', 'phone', 'insurance', 'tools'];

// Find every lever, richest first. Pure: same input, same list.
export function findOptimisations(input: OptimiserInput): Optimisation[] {
  const out: Optimisation[] = [];

  const tradeNet = Math.max(0, input.ytdTradeIncome - input.ytdTradeExpenses);
  const canProject = input.monthsElapsed >= 3;
  const factor = canProject ? 12 / Math.max(1, input.monthsElapsed) : 1;
  const projTradeNet = tradeNet * factor;
  const projTotalIncome = projTradeNet + Math.max(0, input.employmentIncome);
  const mRate = marginalRate(projTotalIncome);
  const cats = input.categoriesLogged.map((c) => c.toLowerCase());

  // 1. Pension to step back out of the 40% band. The biggest lever for a higher
  //    earner. Irreversible (moving money), so it can only ever be drafted.
  if (projTotalIncome > FACTS.class4UpperLimit) {
    const over = round(projTotalIncome - FACTS.class4UpperLimit);
    const saving = round(over * 0.2); // higher-rate relief on income pulled below the threshold
    out.push({
      key: 'pension_higher_rate',
      title: 'Step out of the 40% band',
      detail: `Your income is heading about £${over.toLocaleString('en-GB')} into the 40% higher rate. A pension contribution of up to that amount brings you back under and can save up to about £${saving.toLocaleString('en-GB')} in higher-rate tax. Your provider sets the amount. We are not a financial adviser, you decide.`,
      estSaving: saving,
      action: 'make_payment',
    });
  }

  // 2. Buying a planned asset before 5 April, so the whole cost lands this year
  //    under the Annual Investment Allowance. Irreversible (a purchase): draft only.
  const g = input.purchaseGoal;
  if (g && g.amount > 0 && mRate > 0) {
    const saving = round(g.amount * mRate);
    out.push({
      key: 'aia_timing',
      title: `Timing on ${g.title}`,
      detail: `If you buy ${g.title} (about £${round(g.amount).toLocaleString('en-GB')}) before 5 April, the whole cost comes off this year's tax under the Annual Investment Allowance, saving about £${saving.toLocaleString('en-GB')} at your rate. You choose when to buy.`,
      estSaving: saving,
      action: 'purchase',
    });
  }

  // 3. Costs the user is likely paying but not logging. Reversible admin: at the
  //    auto level Lekhio can prompt for these itself.
  const missing = COMMON_COSTS.filter((c) => !cats.includes(c));
  if (input.ytdTradeIncome > 0 && missing.length >= 2 && mRate > 0) {
    out.push({
      key: 'missed_expenses',
      title: 'Costs you may not be claiming',
      detail: `You have nothing logged this year for ${missing.join(', ')}. If you pay for these for work, logging them lowers your tax: every £100 of allowable cost saves about £${round(100 * mRate)} at your rate. Snap the receipts or text them and Lekhio sorts the rest.`,
      estSaving: 0,
      action: 'log_entry',
    });
  }

  // 4. Use of home. A flat rate with no receipts, missed by almost everyone.
  if (!input.homeOfficeClaimed && projTradeNet > 0 && mRate > 0) {
    const monthly = homeOfficeFlatRateMonthly(25); // the 25 to 50 hours a month band
    const saving = round(monthly * 12 * mRate);
    out.push({
      key: 'home_office',
      title: 'Claim use of home',
      detail: `Do your quotes, invoices or admin from home? You can claim a flat £${monthly} a month with no receipts to keep. Over a year that is about £${saving.toLocaleString('en-GB')} off your tax.`,
      estSaving: saving,
      action: 'apply_allowance_election',
    });
  }

  // 5. Mileage instead of fuel, where they log fuel but no miles. Cannot quantify
  //    without the miles, so it is a prompt, not a number.
  if (!input.mileageClaimed && (cats.includes('fuel') || cats.includes('van')) && projTradeNet > 0) {
    out.push({
      key: 'mileage',
      title: 'Claim your mileage',
      detail: `You are logging fuel but no mileage. For a van or car you can often claim more by logging miles at 45p a mile for the first 10,000 instead. Text "log 24 miles" whenever you drive for work.`,
      estSaving: 0,
      action: 'log_entry',
    });
  }

  // 6. A CIS refund building. Pure information, no action, but a big reassurance
  //    for subbies who overpay through the year.
  const taxDue = soleTraderTax(tradeNet).total;
  if (input.ytdCisSuffered > taxDue && input.ytdCisSuffered > 0) {
    const refund = round(input.ytdCisSuffered - taxDue);
    out.push({
      key: 'cis_refund',
      title: 'A CIS refund is building',
      detail: `Contractors have deducted about £${round(input.ytdCisSuffered).toLocaleString('en-GB')} of CIS tax from you, more than the £${round(taxDue).toLocaleString('en-GB')} your profit owes so far. The difference, about £${refund.toLocaleString('en-GB')}, comes back when you file. Keep every deduction statement.`,
      estSaving: 0,
      info: true,
      action: 'confirm_prompt',
    });
  }

  // Richest quantified saving first; information items sink to the bottom.
  return out.sort((a, b) => b.estSaving - a.estSaving);
}

// The headline number: the total quantified saving on the table this year.
export function totalEstimatedSaving(opts: Optimisation[]): number {
  return opts.reduce((s, o) => s + Math.max(0, o.estSaving), 0);
}

export interface DialledOptimisation extends Optimisation {
  mode: 'auto' | 'draft' | 'suggest'; // what Lekhio may do about it at the user's dial setting
  requiresApproval: boolean; // always true for the money levers
}

// Apply the autonomy dial to each lever. The money levers (pension, purchase)
// come back requiresApproval true and mode never 'auto', enforced in lib/autonomy.
export function applyDial(opts: Optimisation[], level: AutonomyLevel): DialledOptimisation[] {
  return opts.map((o) => {
    const d = decideAction(o.action, level);
    return { ...o, mode: d.mode, requiresApproval: d.requiresApproval };
  });
}

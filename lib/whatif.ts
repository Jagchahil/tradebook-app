// WHAT IF, the computation, lifted out of the page so one thing computes it and one thing tests it.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY THIS FILE EXISTS: /app/tax/what-if WAS A FIFTH MONEY SPINE SURFACE THE GUARD NEVER SAW.
//
// The page used lib/position.ts (computePosition) for its figures. That engine takes a bare profit
// and a stack of other income; it knows nothing of the vehicle writing down allowance or the
// Section 24 finance cost credit. So on an account with a car bought in an earlier year and a
// mortgaged let, the page printed "your confirmed profit is £37,000" where the Overview, the tax
// summary, both lender documents and the MTD quarter pack all read £36,217.45, and its tax tiles
// ran about £1,560 high (the £782.55 allowance it dropped, plus a £1,200 Section 24 credit it never
// applied). test/moneyspine.test.mjs imported six modules and this was not one of them.
//
// THE FIX IS THE SPINE'S OWN RULE: one source, every reader moves together. The personal figures
// now come from taxPosition with the projection switched off (project: false), the SAME call the
// Overview and the lender documents make, so the allowance, the property allowance, Section 24 and
// the student loan all land identically and cannot drift again. A limited company is the one
// exception: a change in company profit lands on the company's own Corporation Tax, not on the
// director's personal Self Assessment, so that arm still asks lib/position.ts for the company
// return. Both arms take a base that has the capital allowance already removed.
//
// ⚠️ THE BASE IS CONFIRMED, NOT PROJECTED, ON PURPOSE. A what if on top of a projection is a guess
// on a guess and a man could not check either half. taxPosition's project: false door is exactly
// what keeps this confirmed while still applying every rule the projected call applies.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { taxPosition, type OptimiserInput } from './taxoptimiser';
import { computePosition, type BusinessType, type OwnerInput } from './position';

export interface WhatIfResult {
  /** The confirmed taxable trade profit since 6 April, after the vehicle writing down allowance.
   *  This is the figure the Overview and the lender documents show, to the penny. */
  base: number;
  /** Tax on the confirmed base, whole pounds. Self Assessment plus student loan for an individual;
   *  the company's Corporation Tax movement is described separately by the page. */
  taxNow: number;
  /** Tax after the change he asked about, or null when he has asked nothing yet. */
  taxThen: number | null;
  /** taxThen - taxNow, whole pounds. Positive means more tax. */
  diff: number;
  /** Of a positive delta, roughly what he keeps after the extra tax. */
  kept: number;
  /** How much of the difference is the student loan, which Self Assessment collects with the bill.
   *  Zero for a company (its profit is not the director's income) and when no loan plan applies. */
  loanDiff: number;
  /** Company only, for the sentence: Corporation Tax now and after the change. */
  corpNow: number;
  corpThen: number;
}

// The account holder as a lib/position.ts owner, the mapping lib/agent.ts's soloOwners makes. Only
// the limited company arm uses this now; the individual arms go through taxPosition, which reads the
// whole OptimiserInput itself. Kept here so the two files that need it share one definition.
function ownersFor(structure: BusinessType, opt: OptimiserInput): OwnerInput[] {
  const salary = Math.max(0, opt.employmentIncome);
  const dividends = Math.max(0, opt.dividendIncome ?? 0);
  const savings = Math.max(0, opt.savingsIncome ?? 0);
  const property = Math.max(0, (opt.ytdPropertyIncome ?? 0) - (opt.ytdPropertyExpenses ?? 0));
  return [{
    name: 'You',
    salary: structure === 'limited_company' ? salary : undefined,
    dividends: structure === 'limited_company' ? dividends : undefined,
    other: {
      employment: structure === 'limited_company' ? 0 : salary,
      otherNonSavings: property,
      savings,
      dividends: structure === 'limited_company' ? 0 : dividends,
    },
  }];
}

/** The confirmed taxable trade profit after the vehicle writing down allowance. The car's whole
 *  cost was taken out of ytdTradeExpenses upstream and the allowance held in ytdCapitalAllowances,
 *  so the taxable figure is income minus the remaining expenses minus that allowance. This is the
 *  one number every money spine surface agrees on, and the what if used to omit the allowance. */
export function whatIfBase(opt: OptimiserInput): number {
  return Math.max(
    0,
    opt.ytdTradeIncome - opt.ytdTradeExpenses - (opt.ytdCapitalAllowances ?? 0),
  );
}

export function whatIf(
  opt: OptimiserInput,
  structure: BusinessType,
  delta: number | null,
): WhatIfResult {
  const base = whatIfBase(opt);

  if (structure === 'limited_company') {
    // A change in company profit lands on Corporation Tax, not the director's personal return, so
    // this arm keeps lib/position.ts, fed the allowance adjusted base. His personal tiles do not
    // move with company profit, which is exactly why the page shows the Corporation Tax movement.
    const owners = ownersFor(structure, opt);
    const now = computePosition({ type: structure, profit: base, owners });
    const then = delta !== null
      ? computePosition({ type: structure, profit: Math.max(0, base + delta), owners })
      : null;
    const taxNow = Math.round(now.combinedTax);
    const taxThen = then ? Math.round(then.combinedTax) : null;
    const diff = taxThen !== null ? taxThen - taxNow : 0;
    return {
      base,
      taxNow,
      taxThen,
      diff,
      kept: delta !== null && delta > 0 ? Math.max(0, delta - diff) : 0,
      loanDiff: 0,
      corpNow: Math.round(now.business.corporationTax),
      corpThen: then ? Math.round(then.business.corporationTax) : 0,
    };
  }

  // Sole trader or partner: the confirmed Self Assessment bill plus the student loan that lands with
  // it, straight from taxPosition with the projection off. A profit delta is a change in trade
  // income with the same costs, so it rides on ytdTradeIncome. taxPosition applies the allowance,
  // the property allowance, Section 24 and the loan, so this cannot disagree with the Overview.
  const now = taxPosition(opt, { project: false });
  const then = delta !== null
    ? taxPosition({ ...opt, ytdTradeIncome: opt.ytdTradeIncome + delta }, { project: false })
    : null;
  const taxNow = Math.round(now.selfAssessmentTax + now.studentLoan);
  const taxThen = then ? Math.round(then.selfAssessmentTax + then.studentLoan) : null;
  const diff = taxThen !== null ? taxThen - taxNow : 0;
  const loanDiff = then ? Math.round(then.studentLoan - now.studentLoan) : 0;
  return {
    base,
    taxNow,
    taxThen,
    diff,
    kept: delta !== null && delta > 0 ? Math.max(0, delta - diff) : 0,
    loanDiff,
    corpNow: 0,
    corpThen: 0,
  };
}

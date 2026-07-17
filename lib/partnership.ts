// PARTNERSHIP TAX, the third UK trading structure, alongside the sole trader and the limited company.
//
// A general partnership is TRANSPARENT: it pays no tax of its own. GOV.UK, /set-up-business-partnership:
// "Partners share the business's profits, and each partner pays tax on their share." The partnership
// files one return (SA800) showing the total profit and how it was split; then EACH partner is taxed
// individually on their slice, exactly like a sole trader, through their own Self Assessment: income
// tax and Class 4 National Insurance on their share of the profit.
//
// So this engine is an ALLOCATION layer over the sole-trader engine we already have and already trust
// (soleTraderTax, parity-guarded across web and mobile). It splits the profit, then taxes each share.
// No new tax constants, no second copy of the band maths.
//
// ⚠️ WHAT THIS DOES NOT DO, ON PURPOSE:
//  . Partners are NOT employees. They take DRAWINGS and a profit share, never a PAYE salary. A
//    "partner's salary" in an agreement is a PRIOR SLICE of the profit, not payroll, and that is how
//    `salary` is treated here: allocated first, off the top, then the balance shared by ratio.
//  . A partner's OTHER income (a job, savings, dividends) lifts the tax on their share into higher
//    bands. That is the whole-person engine's job (lib/personalincome.ts), run per partner. This
//    engine answers the partnership's own question: given the profit and the split, what does each
//    partner owe on their share. When a partner's only income is the partnership, that IS their bill.
//  . A negative share is a partner's LOSS. We report it and tax it at zero; loss relief is a separate
//    feature, and we do not silently invent it.

import { soleTraderTax } from './taxengine';

export interface Partner {
  name: string;
  // A fixed prior allocation off the top of the profit (a partnership "salary", NOT PAYE). Default 0.
  salary?: number;
  // The partner's weight when the residual profit (after salaries) is shared. If NO partner sets a
  // share, the residual is split equally. Weights need not sum to anything; they are relative.
  share?: number;
}

export interface PartnerResult {
  name: string;
  salary: number; // the prior slice they were allocated off the top
  residualShare: number; // their slice of the balance after salaries
  profitShare: number; // salary + residualShare, their total slice of the profit (can be negative)
  incomeTax: number; // income tax on their share, as a sole trader
  class4: number; // Class 4 NIC on their share
  total: number; // incomeTax + class4 on their share
  isLoss: boolean; // their share was negative: a loss, taxed at zero here
}

export interface PartnershipResult {
  profit: number;
  totalSalaries: number;
  residual: number; // profit minus salaries, shared by ratio (can be negative)
  partners: PartnerResult[];
  allocated: number; // sum of the partners' shares; equals profit (a check on the split)
  totalTax: number; // income tax + Class 4 added across every partner
}

export interface PartnershipInput {
  profit: number;
  partners: Partner[];
}

function r2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

// Split the profit across the partners and tax each share as a sole trader. Pure and deterministic.
export function partnershipTax(input: PartnershipInput): PartnershipResult {
  const profit = Number.isFinite(input.profit) ? input.profit : 0;
  const partners = Array.isArray(input.partners) ? input.partners : [];
  if (partners.length === 0) {
    return { profit, totalSalaries: 0, residual: profit, partners: [], allocated: 0, totalTax: 0 };
  }

  // Salaries are a prior charge, taken off the top before the balance is shared.
  const salaries = partners.map((p) => Math.max(0, p.salary ?? 0));
  const totalSalaries = salaries.reduce((s, v) => s + v, 0);
  const residual = profit - totalSalaries;

  // Weights for the residual. If nobody set a share, everyone shares it equally.
  const rawWeights = partners.map((p) => (typeof p.share === 'number' && p.share > 0 ? p.share : 0));
  const anyWeight = rawWeights.some((w) => w > 0);
  const weights = anyWeight ? rawWeights : partners.map(() => 1);
  const totalWeight = weights.reduce((s, v) => s + v, 0) || 1;

  const results: PartnerResult[] = partners.map((p, i) => {
    const salary = salaries[i];
    const residualShare = r2(residual * (weights[i] / totalWeight));
    const profitShare = r2(salary + residualShare);
    const taxable = Math.max(0, profitShare);
    const t = soleTraderTax(taxable);
    return {
      name: p.name,
      salary: r2(salary),
      residualShare,
      profitShare,
      incomeTax: r2(t.incomeTax),
      class4: r2(t.class4),
      total: r2(t.total),
      isLoss: profitShare < 0,
    };
  });

  const allocated = r2(results.reduce((s, r) => s + r.profitShare, 0));
  const totalTax = r2(results.reduce((s, r) => s + r.total, 0));

  return { profit, totalSalaries: r2(totalSalaries), residual: r2(residual), partners: results, allocated, totalTax };
}

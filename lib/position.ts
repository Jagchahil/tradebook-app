// THE STRUCTURE-AWARE POSITION. One entry point that answers, for ANY business structure, the two
// questions that are actually different questions: what does the BUSINESS owe, and what does each
// OWNER owe personally on what they took out.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// This is the spine the whole platform was missing. Until now Rakha computed everyone as a SOLE
// TRADER — it imports soleTraderTax and never branches on business_type — so a limited-company
// director or a partner got sole-trader logic applied to money that is taxed nothing like a sole
// trader's. The engines to do it right already existed and were trusted; they just were never routed.
//
// THE THREE STRUCTURES, AND THE TWO RETURNS EACH IMPLIES:
//
//   SOLE TRADER      No separate entity. The trade is declared ON the person's Self Assessment
//                    (SA103). One return. Business tax and personal tax are the same thing.
//
//   LIMITED COMPANY  The COMPANY is a separate taxpayer. It files its own Corporation Tax return
//                    (CT600) and pays corporation tax on its profit. Then whatever each owner draws
//                    out — salary and dividends — lands on THEIR personal Self Assessment (SA100),
//                    stacked on any other income they have. Two returns, at least: one for the
//                    company, one for EACH owner.
//
//   PARTNERSHIP      Transparent: the partnership files an SA800 showing the split but pays no tax
//                    itself. Each partner is taxed on their share through their own Self Assessment.
//                    One partnership return, plus one for EACH partner.
//
// It composes the engines we already have and already test — combinedIncomeTax (the whole-person
// stack), corporationTax/employerNIC (the company), partnershipTax (the split) — and never re-types
// a rate. Pure and deterministic, so Rakha and Puchio can both lean on it.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { combinedIncomeTax, type PersonalIncomeResult } from './personalincome';
import { corporationTax, employerNIC } from './ltdengine';
import { partnershipTax } from './partnership';

export type BusinessType = 'sole_trader' | 'limited_company' | 'partnership';

const r2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

// A person's income from OUTSIDE this business — a PAYE job, savings, property, dividends from other
// companies. It stacks on top of what they take from the business and can lift it into higher bands,
// which is the whole reason a company owner's personal return is not just "dividends × a rate".
export interface OwnerOtherIncome {
  employment?: number;      // a PAYE job outside this business, or a pension
  otherNonSavings?: number; // property (rental) profit, most other pensions
  savings?: number;         // bank/building-society interest (not ISAs)
  dividends?: number;       // dividends from OTHER companies
}

export interface OwnerInput {
  name: string;
  // Limited company: what THIS company pays this owner.
  salary?: number;
  dividends?: number;
  // Partnership: a prior slice off the top (a partnership "salary", not PAYE) and the residual weight.
  partnerSalary?: number;
  partnerShare?: number;
  other?: OwnerOtherIncome;
}

export interface PositionInput {
  type: BusinessType;
  /** The business's trading profit. For a company this is profit BEFORE the owners' salaries. */
  profit: number;
  /** The owners. A sole trader has exactly one; a company or partnership can have several. */
  owners: OwnerInput[];
}

export interface BusinessReturn {
  type: BusinessType;
  form: string;              // 'SA103' | 'CT600' | 'SA800'
  filesSeparately: boolean;  // a company/partnership files its own; a sole trader does not
  taxableProfit: number;
  corporationTax: number;    // the CT600 figure; 0 for a partnership and a sole trader
  employerNI: number;        // a company payroll cost; 0 otherwise
  distributable: number | null; // company: post-tax profit lawfully available as dividends; else null
  note: string;
}

export interface OwnerPosition {
  name: string;
  form: string;              // the personal return they file
  fromBusiness: { salary: number; dividends: number; profitShare: number };
  personal: PersonalIncomeResult; // their WHOLE personal return, business income stacked with the rest
}

export interface Position {
  type: BusinessType;
  business: BusinessReturn;
  owners: OwnerPosition[];
  businessTax: number;       // corporation tax + employer NI the business itself bears
  personalTax: number;       // summed across every owner's personal return
  combinedTax: number;       // the total burden on the money — what Rakha works to bring down
  /** Company only: owners who drew more in dividends than the company can lawfully distribute. */
  overdrawn: { drewTotal: number; available: number } | null;
}

// ── SOLE TRADER ────────────────────────────────────────────────────────────────────────────────
function soleTraderPosition(input: PositionInput): Position {
  const owner = input.owners[0] ?? { name: 'You' };
  const o = owner.other ?? {};
  const personal = combinedIncomeTax({
    selfEmployment: Math.max(0, input.profit),
    employment: o.employment,
    otherNonSavings: o.otherNonSavings,
    savings: o.savings,
    dividends: o.dividends,
  });
  const business: BusinessReturn = {
    type: 'sole_trader',
    form: 'SA103',
    filesSeparately: false,
    taxableProfit: r2(Math.max(0, input.profit)),
    corporationTax: 0,
    employerNI: 0,
    distributable: null,
    note: 'A sole trader has no separate business return. The trade is declared on your own Self Assessment (the SA103 pages), and there is one tax bill: yours.',
  };
  return {
    type: 'sole_trader',
    business,
    owners: [{
      name: owner.name,
      form: 'SA100 + SA103',
      fromBusiness: { salary: 0, dividends: 0, profitShare: r2(Math.max(0, input.profit)) },
      personal,
    }],
    businessTax: 0,
    personalTax: personal.totalTax,
    combinedTax: personal.totalTax,
    overdrawn: null,
  };
}

// ── LIMITED COMPANY ──────────────────────────────────────────────────────────────────────────────
function limitedCompanyPosition(input: PositionInput): Position {
  const owners = input.owners ?? [];
  const totalSalary = owners.reduce((s, o) => s + Math.max(0, o.salary ?? 0), 0);
  const erNI = owners.reduce((s, o) => s + employerNIC(Math.max(0, o.salary ?? 0)), 0);
  const ctProfit = Math.max(0, input.profit - totalSalary - erNI);
  const corpTax = corporationTax(ctProfit);
  const distributable = r2(Math.max(0, ctProfit - corpTax));

  const drewTotal = owners.reduce((s, o) => s + Math.max(0, o.dividends ?? 0), 0);
  const overdrawn = drewTotal > distributable + 0.01 ? { drewTotal: r2(drewTotal), available: distributable } : null;

  const ownerPositions: OwnerPosition[] = owners.map((o) => {
    const other = o.other ?? {};
    const personal = combinedIncomeTax({
      employment: Math.max(0, o.salary ?? 0) + Math.max(0, other.employment ?? 0),
      dividends: Math.max(0, o.dividends ?? 0) + Math.max(0, other.dividends ?? 0),
      otherNonSavings: other.otherNonSavings,
      savings: other.savings,
    });
    return {
      name: o.name,
      form: 'SA100',
      fromBusiness: { salary: r2(Math.max(0, o.salary ?? 0)), dividends: r2(Math.max(0, o.dividends ?? 0)), profitShare: 0 },
      personal,
    };
  });

  const business: BusinessReturn = {
    type: 'limited_company',
    form: 'CT600',
    filesSeparately: true,
    taxableProfit: r2(ctProfit),
    corporationTax: r2(corpTax),
    employerNI: r2(erNI),
    distributable,
    note: 'The company is its own taxpayer. It files a Corporation Tax return (CT600) and pays corporation tax on its profit after salaries. What is left is what can be paid out as dividends — and each owner is then taxed personally on the salary and dividends they take.',
  };

  const personalTax = r2(ownerPositions.reduce((s, op) => s + op.personal.totalTax, 0));
  const businessTax = r2(corpTax + erNI);
  return {
    type: 'limited_company',
    business,
    owners: ownerPositions,
    businessTax,
    personalTax,
    combinedTax: r2(businessTax + personalTax),
    overdrawn,
  };
}

// ── PARTNERSHIP ──────────────────────────────────────────────────────────────────────────────────
function partnershipPosition(input: PositionInput): Position {
  const owners = input.owners ?? [];
  const split = partnershipTax({
    profit: input.profit,
    partners: owners.map((o) => ({ name: o.name, salary: o.partnerSalary, share: o.partnerShare })),
  });

  const ownerPositions: OwnerPosition[] = owners.map((o, i) => {
    const share = split.partners[i]?.profitShare ?? 0;
    const other = o.other ?? {};
    // Their share is self-employment income for the whole-person stack; a loss is taxed at zero here.
    const personal = combinedIncomeTax({
      selfEmployment: Math.max(0, share),
      employment: other.employment,
      otherNonSavings: other.otherNonSavings,
      savings: other.savings,
      dividends: other.dividends,
    });
    return {
      name: o.name,
      form: 'SA100 + SA104',
      fromBusiness: { salary: r2(split.partners[i]?.salary ?? 0), dividends: 0, profitShare: r2(share) },
      personal,
    };
  });

  const business: BusinessReturn = {
    type: 'partnership',
    form: 'SA800',
    filesSeparately: true,
    taxableProfit: r2(input.profit),
    corporationTax: 0,
    employerNI: 0,
    distributable: null,
    note: 'A partnership is transparent: it files one return (SA800) showing the profit and how it was split, but pays no tax of its own. Each partner is then taxed on their share through their own Self Assessment.',
  };

  const personalTax = r2(ownerPositions.reduce((s, op) => s + op.personal.totalTax, 0));
  return {
    type: 'partnership',
    business,
    owners: ownerPositions,
    businessTax: 0,
    personalTax,
    combinedTax: personalTax,
    overdrawn: null,
  };
}

// THE ONE ENTRY POINT. Route by structure; a type we do not recognise is treated as a sole trader,
// which is the safe default (it is what the platform already assumed for everyone).
export function computePosition(input: PositionInput): Position {
  const owners = Array.isArray(input.owners) ? input.owners : [];
  const normalised: PositionInput = { ...input, owners: owners.length ? owners : [{ name: 'You' }] };
  if (input.type === 'limited_company') return limitedCompanyPosition(normalised);
  if (input.type === 'partnership') return partnershipPosition(normalised);
  return soleTraderPosition(normalised);
}

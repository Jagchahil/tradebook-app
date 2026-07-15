// 🔴 PRE-POPULATION. The user's own figures, pulled from HMRC with their consent, turned into a draft
// they approve. This file is the PURE part: parsing HMRC's response and working out what it means.
// The network call lives in lib/hmrc.ts; the orchestration in app/api/hmrc/prepopulate.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The flagship is CIS, because it is the number a subcontractor is most owed and least likely to
// claim. HMRC holds it: every contractor who paid him reported the tax they deducted. We read it, we
// set it against what he actually owes for that year (lib/taxyears.ts), and we show him the refund.
//
// The endpoint is verified against HMRC's OpenAPI spec (CIS Deductions MTD v3.0, read 15 Jul 2026):
//   GET /individuals/deductions/cis/{nino}/current-position/{taxYear}/{source}
//   scope read:self-assessment (which authorizeUrl already requests)
//   200 -> { totalDeductionAmount, totalCostOfMaterials, totalGrossAmountPaid, cisDeductions: [...] }
//
// 🔴 THE ONE RULE HERE, AND IT IS THE RULE OF THE WHOLE PRODUCT: a figure we pulled is a DRAFT, not a
// truth we act on. It is shown to the man for his yes. Nothing computed here is filed. We prepare; he
// approves. And a figure we COULD NOT read is never a zero: null is "we do not know", and the caller
// must say so rather than quietly telling him he is owed nothing.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { soleTraderTaxForYear } from './taxyears';

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface CisDeductions {
  /** true when HMRC returned CIS data. false is a real "no CIS on record", distinct from a read error. */
  found: boolean;
  /** The tax deducted at source and paid to HMRC on his behalf. The refund driver. */
  totalDeducted: number;
  totalGrossPaid: number;
  totalMaterials: number;
}

// Parse HMRC's CIS response into our shape. Defensive: HMRC may omit fields, and a missing number is
// treated as 0 for the total but NEVER invented. Shape verified against the OpenAPI 200 example.
export function parseCisDeductions(body: unknown): CisDeductions {
  const b = (body ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    found: true,
    totalDeducted: round2(num(b.totalDeductionAmount)),
    totalGrossPaid: round2(num(b.totalGrossAmountPaid)),
    totalMaterials: round2(num(b.totalCostOfMaterials)),
  };
}

/** What HMRC's NOT_FOUND (404) means: he simply has no CIS on record for that year. Not an error. */
export const NO_CIS: CisDeductions = { found: false, totalDeducted: 0, totalGrossPaid: 0, totalMaterials: 0 };

export interface CisPosition {
  taxYear: string;
  /** His actual tax bill for the year, on his profit (income tax + Class 4). */
  bill: number;
  /** CIS already paid to HMRC on his behalf. */
  cisDeducted: number;
  position: 'refund' | 'owing' | 'square';
  /** The size of the refund or the remaining bill. Always positive; `position` says which way. */
  amount: number;
}

// 🔴 THE ANSWER A SUBBIE ACTUALLY WANTS. Given his profit for a year and the CIS HMRC says was
// deducted, is he owed money back? Returns null for a year we do not hold rates for (never a guess).
export function cisPosition(taxYear: string, profit: number, cisDeducted: number): CisPosition | null {
  const tax = soleTraderTaxForYear(profit, taxYear);
  if (!tax) return null;
  const cis = round2(Math.max(0, cisDeducted));
  const net = round2(tax.total - cis); // positive: still owes. negative: owed a refund.
  return {
    taxYear,
    bill: tax.total,
    cisDeducted: cis,
    position: net < -0.005 ? 'refund' : net > 0.005 ? 'owing' : 'square',
    amount: round2(Math.abs(net)),
  };
}

// The line we show him. Plain, and it never promises a filing, only a draft to check.
export function cisPositionLine(p: CisPosition): string {
  if (p.position === 'refund') {
    return `For ${p.taxYear}, HMRC has £${p.cisDeducted.toLocaleString('en-GB')} of CIS deducted on your behalf, and your bill on that profit is £${p.bill.toLocaleString('en-GB')}. That looks like about £${p.amount.toLocaleString('en-GB')} owed back to you. Check the figures and, if they are right, I will get it ready for your approval.`;
  }
  if (p.position === 'owing') {
    return `For ${p.taxYear}, HMRC has £${p.cisDeducted.toLocaleString('en-GB')} of CIS deducted, and your bill on that profit is £${p.bill.toLocaleString('en-GB')}, so about £${p.amount.toLocaleString('en-GB')} would still be to pay. A guide from your figures, not a final bill, and nothing is filed without your yes.`;
  }
  return `For ${p.taxYear}, your CIS deducted (£${p.cisDeducted.toLocaleString('en-GB')}) and your bill on that profit come out roughly square.`;
}

// The whole draft for one year: what we read, what it means, and the reminder that it is his to
// approve. This is the object the app/WhatsApp surface renders. NOTHING here is filed.
export interface PrepopDraft {
  taxYear: string;
  cis: CisDeductions;
  position: CisPosition | null;
  /** true = the year's rates are supported and a position was computed. */
  computed: boolean;
  says: string;
}

export function buildCisDraft(taxYear: string, profit: number, cis: CisDeductions): PrepopDraft {
  const position = cis.found ? cisPosition(taxYear, profit, cis.totalDeducted) : null;
  return {
    taxYear,
    cis,
    position,
    computed: position !== null,
    says: !cis.found
      ? `HMRC has no CIS on record for you in ${taxYear}.`
      : position
        ? cisPositionLine(position)
        : `HMRC has £${cis.totalDeducted.toLocaleString('en-GB')} of CIS deducted for ${taxYear}, but I do not yet hold the tax rates for that year, so I cannot work out the refund. I have the last four years.`,
  };
}

// lib/incomeproof.ts. A clean, branded income summary a self employed person can
// hand to a mortgage broker, a landlord or a lender. Built only from their own
// confirmed figures. Pure, deterministic, no AI, no network.
//
// It is NOT an SA302 or a filed return, and it says so plainly. It is the summary
// an accountant would type on headed paper, generated in one tap from the records
// the user already keeps. No software rival offers this, and every self employed
// person needs one eventually. Unit tested in test/incomeproof.test.mjs.

import { incomeTaxOnProfit, class4NIC } from './taxengine';

export interface IncomeProofTxn {
  amount: number; // signed: positive income, negative expense
  transaction_date: string; // YYYY-MM-DD
  // 🔴 WHICH STREAM THIS ROW IS, AND THE REASON A LANDLORD WAS SHOWN NATIONAL INSURANCE ON RENT.
  //
  // 'property' marks the property stream; anything else is trade. It was NOT on this interface, so
  // every row was totted up as one profit and run through soleTraderTax, which adds Class 4. Class 4
  // is a charge on the profits of a TRADE (SSCBA 1992 s15). Rent is not a trade, it does not carry
  // it, and we were printing it on a document a man hands to a lender.
  //
  // The rows have always carried it: lib/supabase.ts selects income_type and both callers pass their
  // rows straight through. This interface simply did not ask for it. Optional, and absent means
  // trade, so every existing trade only summary is identical to the penny.
  income_type?: string | null;
}

export interface IncomeProof {
  businessName: string;
  taxYear: string; // e.g. 2026-27
  periodLabel: string; // e.g. 6 April 2026 to 5 April 2027
  income: number;
  expenses: number;
  profit: number;
  /** The two streams behind `profit`, each floored at zero, because tax is charged on them apart. */
  tradeProfit: number;
  propertyProfit: number;
  estimatedTax: number;
  /** The Class 4 inside estimatedTax. Zero for a pure landlord, which is the whole point. */
  nationalInsurance: number;
  /**
   * What to call estimatedTax on a screen, so no surface has to work out whether there is any
   * National Insurance in it and none of them can answer differently. app/app/proof-of-income
   * renders its own copy of this row and should read this rather than keep its own wording.
   */
  estimatedTaxLabel: string;
  txCount: number;
  generatedAt: string; // ISO
}

export function taxYearLabel(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })} ${d.getUTCFullYear()}`;
}

// Build the summary for one tax year (opening year, 6 April startYear to 5 April
// the year after). Totals every confirmed stream, the same way the app screen
// does, because a lender wants total self employed income, not one slice.
export function buildIncomeProof(
  txns: IncomeProofTxn[],
  businessName: string | null,
  startYear: number,
  now: Date = new Date(),
): IncomeProof {
  let income = 0;
  let expenses = 0;
  let tradeIncome = 0;
  let tradeExpenses = 0;
  let propertyIncome = 0;
  let propertyExpenses = 0;
  for (const t of txns) {
    const a = Number(t.amount) || 0;
    const isProperty = String(t.income_type ?? '').toLowerCase() === 'property';
    if (a >= 0) {
      income += a;
      if (isProperty) propertyIncome += a; else tradeIncome += a;
    } else {
      expenses += -a;
      if (isProperty) propertyExpenses += -a; else tradeExpenses += -a;
    }
  }
  const round2 = (n: number) => Math.round(n * 100) / 100;
  income = round2(income);
  expenses = round2(expenses);
  // The headline the lender reads: everything in, everything out. Unchanged.
  const profit = Math.max(0, round2(income - expenses));
  // The two streams, each floored at zero, because the tax below is charged on them apart, and what
  // a loss in one of them does to the other is a relief he CLAIMS rather than something a summary
  // may assume for him. For a trade only summary tradeProfit IS profit, to the penny.
  const tradeProfit = Math.max(0, round2(tradeIncome - tradeExpenses));
  const propertyProfit = Math.max(0, round2(propertyIncome - propertyExpenses));

  // ═════════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 NATIONAL INSURANCE ON THE TRADE ONLY. THE LINE UNDER THIS USED TO SAY IT ON RENT.
  //
  // This was soleTraderTax(profit).total over every confirmed row. Class 4 is charged on the profits
  // of a trade, profession or vocation; rental income is property income and carries none of it. So
  // a landlord's proof of income, the document he hands a mortgage broker, showed him National
  // Insurance he does not owe, over our name, on the one page whose entire job is to be believed by
  // somebody who checks.
  //
  // ⚠️ INCOME TAX IS STILL WORKED OUT ON THE TWO TOGETHER, and that is not a detail. Both are non
  // savings income and they share ONE personal allowance. Taxing them separately and adding the
  // answers would hand him the allowance twice, which is the same bug lib/ledger.ts had to be
  // rescued from in July, and it would understate the tax on the document. So: income tax on the
  // pair, Class 4 on the trade alone.
  //
  // ⚠️ WHICH WAY THIS MOVES A FIGURE. A trade only summary is identical to the penny, because
  // incomeTaxOnProfit(p) + class4NIC(p) IS soleTraderTax(p).total. A landlord's estimated tax falls,
  // which is correct: he was being charged a tax that is not his. Nobody's income or profit moves.
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  const nationalInsurance = round2(class4NIC(tradeProfit));
  const estimatedTax = round2(incomeTaxOnProfit(tradeProfit + propertyProfit) + nationalInsurance);

  return {
    businessName: (businessName ?? '').trim() || 'Your business',
    taxYear: taxYearLabel(startYear),
    periodLabel: `${longDate(`${startYear}-04-06`)} to ${longDate(`${startYear + 1}-04-05`)}`,
    income,
    expenses,
    profit,
    tradeProfit,
    propertyProfit,
    estimatedTax,
    nationalInsurance,
    // The words follow the figure. A man with no National Insurance in his number is not told there
    // is some, and nobody has to read the code to find out which he is.
    estimatedTaxLabel:
      nationalInsurance > 0 ? 'Estimated Income Tax and National Insurance' : 'Estimated Income Tax',
    txCount: txns.length,
    generatedAt: now.toISOString(),
  };
}

// ---- HTML document (print to PDF, branded like the quarter pack) -------------

const INK = '#111111';
const INDIGO = '#1B59A6';
const MUTED = '#5B6470';
const BORDER = '#ECECEC';
const OFF_WHITE = '#FBFAF7';
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function gbp(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `£${v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function row(label: string, value: string, opts: { bold?: boolean; muted?: boolean } = {}): string {
  const weight = opts.bold ? '700' : '400';
  const colour = opts.muted ? MUTED : INK;
  return (
    `<tr><td style="padding:11px 0;border-bottom:1px solid ${BORDER};font-weight:${weight};color:${colour}">${esc(label)}</td>` +
    `<td style="padding:11px 0;border-bottom:1px solid ${BORDER};text-align:right;font-weight:${weight};color:${colour};font-variant-numeric:tabular-nums">${esc(value)}</td></tr>`
  );
}

// A complete, self contained, print ready HTML document. No external assets.
export function renderIncomeProofHtml(p: IncomeProof): string {
  const generated = longDate(p.generatedAt.slice(0, 10));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Income summary ${esc(p.taxYear)} ${esc(p.businessName)}</title>
<style>
  @media print { .noprint { display:none !important } @page { margin: 18mm } }
  body { font-family:${FONT}; color:${INK}; margin:0; background:${OFF_WHITE}; -webkit-print-color-adjust:exact; print-color-adjust:exact }
  .sheet { max-width:720px; margin:0 auto; padding:34px 30px 44px }
  .brand { display:flex; align-items:center; gap:10px; font-weight:800; font-size:18px; letter-spacing:-0.02em }
  .brand .l { width:28px; height:28px; border-radius:8px; background:${INDIGO}; color:#fff; display:grid; place-items:center; font-weight:900 }
  h1 { font-size:24px; letter-spacing:-0.03em; margin:26px 0 2px }
  .muted { color:${MUTED} }
  .card { background:#fff; border:1px solid ${BORDER}; border-radius:16px; padding:22px 24px; margin-top:20px }
  table { width:100%; border-collapse:collapse }
  .stamp { display:inline-block; margin-top:18px; background:${OFF_WHITE}; border:1px solid ${BORDER}; border-radius:10px; padding:8px 12px; font-size:12px; font-weight:700; color:${INDIGO} }
  .note { font-size:12px; color:${MUTED}; line-height:1.6; margin-top:22px }
  .btn { display:inline-block; margin-top:24px; background:${INDIGO}; color:#fff; text-decoration:none; font-weight:700; padding:12px 20px; border-radius:11px; border:0; cursor:pointer; font-family:inherit; font-size:15px }
</style></head>
<body><div class="sheet">
  <div class="brand"><span class="l">L</span> Lekhio</div>

  <h1>Income summary</h1>
  <div class="muted">${esc(p.businessName)} &middot; tax year ${esc(p.taxYear)} (${esc(p.periodLabel)})</div>

  <div class="card">
    <table>
      ${row('Gross income', gbp(p.income))}
      ${row('Allowable expenses', gbp(p.expenses), { muted: true })}
      ${row('Net profit', gbp(p.profit), { bold: true })}
      ${row(p.estimatedTaxLabel, gbp(p.estimatedTax), { muted: true })}
    </table>
    <div class="stamp">Prepared by Lekhio &middot; ${esc(generated)} &middot; ${p.txCount} entries</div>
  </div>

  <button class="btn noprint" onclick="window.print()">Save as PDF</button>

  <p class="note">
    This is a summary prepared from the figures ${esc(p.businessName)} has recorded and confirmed in Lekhio, for income verification.
    It is not an HMRC document, an SA302, or a filed tax return, and it is only as complete as the records kept.
    The estimated tax figure is guidance based on the published ${esc(p.taxYear)} rates and does not include any other income, reliefs or allowances the person may have.
    For an official SA302 or tax year overview, the person can log in to their HMRC account. Some lenders ask for HMRC documents as well as a summary like this.
  </p>
</div></body></html>`;
}

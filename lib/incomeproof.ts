// lib/incomeproof.ts. A clean, branded income summary a self employed person can
// hand to a mortgage broker, a landlord or a lender. Built only from their own
// confirmed figures. Pure, deterministic, no AI, no network.
//
// It is NOT an SA302 or a filed return, and it says so plainly. It is the summary
// an accountant would type on headed paper, generated in one tap from the records
// the user already keeps. No software rival offers this, and every self employed
// person needs one eventually. Unit tested in test/incomeproof.test.mjs.

import { soleTraderTax } from './taxengine';

export interface IncomeProofTxn {
  amount: number; // signed: positive income, negative expense
  transaction_date: string; // YYYY-MM-DD
}

export interface IncomeProof {
  businessName: string;
  taxYear: string; // e.g. 2026-27
  periodLabel: string; // e.g. 6 April 2026 to 5 April 2027
  income: number;
  expenses: number;
  profit: number;
  estimatedTax: number;
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
  for (const t of txns) {
    const a = Number(t.amount) || 0;
    if (a >= 0) income += a;
    else expenses += -a;
  }
  income = Math.round(income * 100) / 100;
  expenses = Math.round(expenses * 100) / 100;
  const profit = Math.max(0, Math.round((income - expenses) * 100) / 100);
  return {
    businessName: (businessName ?? '').trim() || 'Your business',
    taxYear: taxYearLabel(startYear),
    periodLabel: `${longDate(`${startYear}-04-06`)} to ${longDate(`${startYear + 1}-04-05`)}`,
    income,
    expenses,
    profit,
    estimatedTax: soleTraderTax(profit).total,
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
      ${row('Estimated Income Tax and National Insurance', gbp(p.estimatedTax), { muted: true })}
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

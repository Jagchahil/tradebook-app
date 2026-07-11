// lib/quarterpack.ts. The quarter end pack: a shareable quarterly summary a
// tradesperson can hand to their accountant.
//
// This is deterministic and framework free, the same discipline as
// lib/bankfeed.ts and lib/waintents.ts. It takes confirmed transactions and a
// target tax year quarter, and produces both the structured pack and a print
// ready HTML document. There is no server side PDF library in this codebase, by
// design: documents are produced by the browser's own print to PDF, exactly as
// the invoice pages already work, so the accountant opens the pack and chooses
// Save as PDF. One source of numbers: every tax figure comes from the canonical
// engine in lib/taxengine.ts, never hand rolled here.
//
// Doctrine held: this is a summary of the user's own confirmed entries and the
// published HMRC figures. It is for the user and their accountant. It is not a
// filing to HMRC, and the tax figure is a clearly labelled running estimate, not
// a calculation submitted anywhere. Lekhio prepares, the user approves.

import { soleTraderTax, class2Voluntary, mtdForIncomeTaxRequired } from './taxengine';

// A confirmed transaction, in the engine's sign convention: a positive amount is
// income, a negative amount is an expense. Everything is optional and read
// defensively because rows come from several capture paths.
export interface PackTxn {
  amount: number;
  category?: string | null;
  vendor?: string | null;
  transaction_date: string; // YYYY-MM-DD
  cis_deduction?: number | null;
  income_type?: string | null; // 'property' marks the property stream; anything else is trade
}

export interface QuarterBounds {
  index: 1 | 2 | 3 | 4;
  taxYear: string; // e.g. 2026/27
  label: string; // e.g. Quarter 1, 6 April to 5 July 2026
  start: string; // inclusive YYYY-MM-DD
  end: string; // inclusive YYYY-MM-DD
}

export interface StreamSummary {
  income: number;
  expenses: number;
  net: number;
  expensesByCategory: Array<{ category: string; amount: number }>;
}

export interface EstimatedTax {
  tradeProfit: number;
  incomeTax: number;
  class4: number;
  class2: number;
  total: number;
  propertyProfitExcluded: number; // property profit is taxed separately, shown but not folded in
  note: string;
}

export interface QuarterPack {
  businessName: string;
  taxYear: string;
  period: QuarterBounds;
  generatedAt: string; // ISO
  // The quarter itself: this is the content of an MTD quarterly update.
  trade: StreamSummary;
  property: StreamSummary;
  cisSuffered: number;
  txCount: number;
  hasProperty: boolean;
  truncated: boolean; // the source data may be incomplete (row limit hit)
  // Year to date, up to and including this quarter, for the running tax picture.
  ytd: {
    trade: StreamSummary;
    property: StreamSummary;
    cisSuffered: number;
    grossQualifyingIncome: number; // trade gross + property gross, the MTD test base
    mtdApplies: boolean;
    mtdThreshold: number; // the MTD gross threshold for this tax year (50k/30k/20k)
    estimatedTax: EstimatedTax;
  };
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function isoDate(year: number, month1to12: number, day: number): string {
  const mm = String(month1to12).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

function prettyDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// The tax year label for a start year: 2026 -> "2026/27".
export function taxYearLabel(startYear: number): string {
  const end = (startYear + 1) % 100;
  return `${startYear}/${String(end).padStart(2, '0')}`;
}

// The bounds of a UK tax year quarter, using the standard MTD periods that run
// from the 6th: Q1 6 Apr to 5 Jul, Q2 6 Jul to 5 Oct, Q3 6 Oct to 5 Jan,
// Q4 6 Jan to 5 Apr. startYear is the year the tax year opens (2026 for 2026/27).
export function quarterBounds(startYear: number, index: 1 | 2 | 3 | 4): QuarterBounds {
  let start: string;
  let end: string;
  switch (index) {
    case 1:
      start = isoDate(startYear, 4, 6);
      end = isoDate(startYear, 7, 5);
      break;
    case 2:
      start = isoDate(startYear, 7, 6);
      end = isoDate(startYear, 10, 5);
      break;
    case 3:
      start = isoDate(startYear, 10, 6);
      end = isoDate(startYear + 1, 1, 5);
      break;
    case 4:
    default:
      start = isoDate(startYear + 1, 1, 6);
      end = isoDate(startYear + 1, 4, 5);
      break;
  }
  return {
    index,
    taxYear: taxYearLabel(startYear),
    label: `Quarter ${index}, ${prettyDay(start)} to ${prettyDay(end)}`,
    start,
    end,
  };
}

// Which tax year quarter a date falls in. The tax year opens on 6 April, so a
// date before then belongs to the previous tax year. ISO date strings compare
// correctly with < and >, so bounds checks are plain string comparisons.
export function quarterForDate(date: Date): { startYear: number; index: 1 | 2 | 3 | 4 } {
  const y = date.getUTCFullYear();
  const iso = isoDate(y, date.getUTCMonth() + 1, date.getUTCDate());
  const startYear = iso >= isoDate(y, 4, 6) ? y : y - 1;
  for (const index of [1, 2, 3, 4] as const) {
    const b = quarterBounds(startYear, index);
    if (iso >= b.start && iso <= b.end) return { startYear, index };
  }
  // A date exactly on a boundary is caught above; this is unreachable in practice.
  return { startYear, index: 4 };
}

// Split and total one set of rows into a stream summary. `wantProperty` selects
// the property rows (income_type === 'property'); false selects everything else
// (the trade stream), so the two calls partition the rows with no overlap.
function summariseStream(txns: PackTxn[], wantProperty: boolean): StreamSummary {
  let income = 0;
  let expenses = 0;
  const byCat = new Map<string, number>();
  for (const t of txns) {
    const isProperty = (t.income_type ?? '').toLowerCase() === 'property';
    if (isProperty !== wantProperty) continue;
    const amt = Number(t.amount);
    if (!Number.isFinite(amt) || amt === 0) continue;
    if (amt > 0) {
      income += amt;
    } else {
      const mag = -amt;
      expenses += mag;
      const cat = (t.category ?? 'other').trim().toLowerCase() || 'other';
      byCat.set(cat, (byCat.get(cat) ?? 0) + mag);
    }
  }
  const expensesByCategory = [...byCat.entries()]
    .map(([category, amount]) => ({ category, amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
  income = round2(income);
  expenses = round2(expenses);
  return { income, expenses, net: round2(income - expenses), expensesByCategory };
}

function cisTotal(txns: PackTxn[]): number {
  let sum = 0;
  for (const t of txns) {
    const c = Number(t.cis_deduction);
    if (Number.isFinite(c) && c > 0) sum += c;
  }
  return round2(sum);
}

function inRange(iso: string, start: string, end: string): boolean {
  return iso >= start && iso <= end;
}

export interface BuildInput {
  transactions: PackTxn[];
  startYear: number; // tax year opening year, e.g. 2026 for 2026/27
  quarter: 1 | 2 | 3 | 4;
  businessName?: string | null;
  now?: Date; // for the generated timestamp, injectable for tests
  // True when the transaction fetch hit its row limit and may be incomplete, so
  // the document warns rather than silently handing an accountant a short summary.
  truncated?: boolean;
}

// The MTD for Income Tax gross qualifying income threshold by tax year opening
// year: 50k (April 2026), 30k (April 2027), 20k (April 2028+).
function mtdThresholdFor(startYear: number): number {
  return startYear >= 2028 ? 20000 : startYear >= 2027 ? 30000 : 50000;
}
function mtdYearFor(startYear: number): 2026 | 2027 | 2028 {
  return startYear >= 2028 ? 2028 : startYear >= 2027 ? 2027 : 2026;
}

// Build the pack. Quarter figures cover the selected quarter only (the MTD
// update content). Year to date figures cover the tax year opening (6 April of
// startYear) up to and including the quarter end, and drive the running tax
// estimate.
export function buildQuarterPack(input: BuildInput): QuarterPack {
  const { transactions, startYear, quarter } = input;
  const period = quarterBounds(startYear, quarter);
  const taxYearStart = isoDate(startYear, 4, 6);

  const rows = Array.isArray(transactions) ? transactions.filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(String(t?.transaction_date))) : [];
  const quarterTx = rows.filter((t) => inRange(t.transaction_date, period.start, period.end));
  const ytdTx = rows.filter((t) => inRange(t.transaction_date, taxYearStart, period.end));

  const trade = summariseStream(quarterTx, false);
  const property = summariseStream(quarterTx, true);

  const ytdTrade = summariseStream(ytdTx, false);
  const ytdProperty = summariseStream(ytdTx, true);

  // The MTD for Income Tax test is on GROSS qualifying income, trade plus
  // property, before expenses. We test the year to date gross, which is
  // conservative: if it already clears the threshold, mandation certainly applies.
  const grossQualifying = round2(ytdTrade.income + ytdProperty.income);
  const mtdApplies = mtdForIncomeTaxRequired(grossQualifying, mtdYearFor(startYear));
  const mtdThreshold = mtdThresholdFor(startYear);

  // The running tax estimate is on trade net profit only. Property profit is
  // taxed on its own schedule (and from April 2027 its own rates), so folding it
  // into soleTraderTax would misstate the number. We show it separately instead.
  const tradeProfit = Math.max(0, ytdTrade.net);
  const st = soleTraderTax(tradeProfit);
  const c2 = class2Voluntary();
  const class2 = c2.compulsory ? c2.annual : 0;

  const estimatedTax: EstimatedTax = {
    tradeProfit: round2(tradeProfit),
    incomeTax: round2(st.incomeTax),
    class4: round2(st.class4),
    class2: round2(class2),
    total: round2(st.total + class2),
    propertyProfitExcluded: round2(Math.max(0, ytdProperty.net)),
    note:
      'A running estimate on your trade profit so far this tax year, using the published ' +
      taxYearLabel(startYear) +
      ' figures. It is for guidance, not a filing. Property profit, where present, is taxed separately and is not included here.',
  };

  return {
    businessName: (input.businessName ?? '').trim() || 'Your business',
    taxYear: taxYearLabel(startYear),
    period,
    generatedAt: (input.now ?? new Date()).toISOString(),
    trade,
    property,
    cisSuffered: cisTotal(quarterTx),
    txCount: quarterTx.length,
    hasProperty: ytdProperty.income > 0 || ytdProperty.expenses > 0,
    truncated: Boolean(input.truncated),
    ytd: {
      trade: ytdTrade,
      property: ytdProperty,
      cisSuffered: cisTotal(ytdTx),
      grossQualifyingIncome: grossQualifying,
      mtdApplies,
      mtdThreshold,
      estimatedTax,
    },
  };
}

// ---- HTML document rendering (print to PDF, branded like the invoice pages) --

const INK = '#111111';
const INDIGO = '#1B59A6';
const MUTED = '#5B6470';
const BORDER = '#ECECEC';
const OFF_WHITE = '#FBFAF7';
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function gbp(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `£${v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function streamRows(s: StreamSummary): string {
  if (s.expensesByCategory.length === 0) {
    return `<tr><td style="padding:6px 0;color:${MUTED}">No expenses logged in this period</td><td></td></tr>`;
  }
  return s.expensesByCategory
    .map(
      (e) =>
        `<tr><td style="padding:6px 0">${esc(titleCase(e.category))}</td>` +
        `<td style="padding:6px 0;text-align:right">${gbp(e.amount)}</td></tr>`,
    )
    .join('');
}

// A complete, self contained HTML document. No external assets, no scripts that
// matter to the content, print styled so Save as PDF yields a clean one document
// page. Safe to return straight from a route with Content-Type text/html.
export function renderQuarterPackHtml(pack: QuarterPack): string {
  const p = pack.property;
  const t = pack.trade;
  const showProperty = pack.hasProperty;
  const est = pack.ytd.estimatedTax;

  const propertyBlock = showProperty
    ? `
      <h3 style="margin:26px 0 6px;font-size:15px">Property, this quarter</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;font-weight:600">Rent received</td><td style="padding:6px 0;text-align:right;font-weight:600">${gbp(p.income)}</td></tr>
        ${streamRows(p)}
        <tr style="border-top:1px solid ${BORDER}"><td style="padding:8px 0;font-weight:700">Property profit this quarter</td><td style="padding:8px 0;text-align:right;font-weight:700">${gbp(p.net)}</td></tr>
      </table>`
    : '';

  const mtdLine = pack.ytd.mtdApplies
    ? `Your gross income so far this year (${gbp(pack.ytd.grossQualifyingIncome)}) is over the ${gbp(pack.ytd.mtdThreshold)} Making Tax Digital for Income Tax threshold for ${esc(pack.taxYear)}, so quarterly updates apply.`
    : `Your gross income so far this year is ${gbp(pack.ytd.grossQualifyingIncome)}. Making Tax Digital for Income Tax applies from £50,000 gross (from April 2026), £30,000 (April 2027), then £20,000 (April 2028).`;

  // A safety banner if the underlying data may have been capped, so a truncated
  // summary is never presented to an accountant as complete.
  const truncatedBanner = pack.truncated
    ? `<div style="background:#FDECEC;border:1px solid #F5B5B5;border-radius:10px;padding:12px 14px;margin:0 0 18px;font-size:13px;color:#8A1F1F">This summary may be incomplete: you have an unusually large number of entries and not all could be included. Please contact us before relying on these figures.</div>`
    : '';

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Quarterly summary, ${esc(pack.businessName)}, ${esc(pack.period.label)}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:${OFF_WHITE};color:${INK};font-family:${FONT};line-height:1.5}
  .wrap{max-width:820px;margin:0 auto;padding:32px 24px 64px}
  .paper{background:#fff;border:1px solid ${BORDER};border-radius:14px;padding:34px}
  h1{font-size:22px;margin:0 0 2px}
  h2{font-size:16px;margin:24px 0 6px}
  .muted{color:${MUTED}}
  .brand{color:${INDIGO};font-weight:800;letter-spacing:-0.3px}
  .kpis{display:flex;gap:14px;flex-wrap:wrap;margin:18px 0 6px}
  .kpi{flex:1 1 150px;border:1px solid ${BORDER};border-radius:12px;padding:14px 16px}
  .kpi .n{font-size:20px;font-weight:800}
  .kpi .l{font-size:12px;color:${MUTED}}
  table{width:100%;border-collapse:collapse;font-size:14px}
  .foot{margin-top:24px;font-size:12px;color:${MUTED}}
  .printbtn{display:inline-block;margin:0 0 18px;background:${INDIGO};color:#fff;border:none;border-radius:10px;padding:12px 18px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit}
  @media print{
    body{background:#fff}
    .no-print{display:none !important}
    .paper{border:none;border-radius:0;padding:0}
    .wrap{padding:0}
  }
</style>
</head>
<body>
  <div class="wrap">
    <button class="printbtn no-print" onclick="window.print()">Save as PDF or print</button>
    <div class="paper">
      <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px">
        <div>
          <h1><span class="brand">Lekhio</span> quarterly summary</h1>
          <div class="muted">${esc(pack.businessName)}</div>
        </div>
        <div class="muted" style="text-align:right">
          <div>${esc(pack.period.label)}</div>
          <div>Tax year ${esc(pack.taxYear)}</div>
        </div>
      </div>

      ${truncatedBanner}

      <div class="kpis">
        <div class="kpi"><div class="n">${gbp(t.income)}</div><div class="l">Trade income this quarter</div></div>
        <div class="kpi"><div class="n">${gbp(t.expenses)}</div><div class="l">Trade expenses this quarter</div></div>
        <div class="kpi"><div class="n">${gbp(t.net)}</div><div class="l">Trade profit this quarter</div></div>
        ${pack.cisSuffered > 0 ? `<div class="kpi"><div class="n">${gbp(pack.cisSuffered)}</div><div class="l">CIS suffered this quarter</div></div>` : ''}
      </div>

      <h2>Trade, this quarter</h2>
      <table>
        <tr><td style="padding:6px 0;font-weight:600">Income</td><td style="padding:6px 0;text-align:right;font-weight:600">${gbp(t.income)}</td></tr>
        ${streamRows(t)}
        <tr style="border-top:1px solid ${BORDER}"><td style="padding:8px 0;font-weight:700">Trade profit this quarter</td><td style="padding:8px 0;text-align:right;font-weight:700">${gbp(t.net)}</td></tr>
        ${pack.cisSuffered > 0 ? `<tr><td style="padding:6px 0" class="muted">CIS deducted at source (tax already paid)</td><td style="padding:6px 0;text-align:right" class="muted">${gbp(pack.cisSuffered)}</td></tr>` : ''}
      </table>

      ${propertyBlock}

      <h2>Year to date, and the running tax picture</h2>
      <table>
        <tr><td style="padding:6px 0">Trade profit so far this year</td><td style="padding:6px 0;text-align:right">${gbp(pack.ytd.trade.net)}</td></tr>
        ${showProperty ? `<tr><td style="padding:6px 0">Property profit so far this year</td><td style="padding:6px 0;text-align:right">${gbp(pack.ytd.property.net)}</td></tr>` : ''}
        <tr><td style="padding:6px 0">Estimated Income Tax on trade profit</td><td style="padding:6px 0;text-align:right">${gbp(est.incomeTax)}</td></tr>
        <tr><td style="padding:6px 0">Estimated Class 4 National Insurance</td><td style="padding:6px 0;text-align:right">${gbp(est.class4)}</td></tr>
        ${est.class2 > 0 ? `<tr><td style="padding:6px 0">Class 2 National Insurance</td><td style="padding:6px 0;text-align:right">${gbp(est.class2)}</td></tr>` : ''}
        <tr style="border-top:1px solid ${BORDER}"><td style="padding:8px 0;font-weight:700">Estimated tax set aside so far</td><td style="padding:8px 0;text-align:right;font-weight:700">${gbp(est.total)}</td></tr>
      </table>
      <p class="muted" style="font-size:13px;margin-top:8px">${esc(est.note)}</p>
      <p class="muted" style="font-size:13px">${esc(mtdLine)}</p>

      <div class="foot">
        Prepared by Lekhio from ${pack.txCount} confirmed ${pack.txCount === 1 ? 'entry' : 'entries'} in this quarter and the published HMRC figures for ${esc(pack.taxYear)}. These figures are for your records and your accountant. Lekhio prepares, you approve. This is not a submission to HMRC.
      </div>
    </div>
  </div>
</body>
</html>`;
}

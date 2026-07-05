// Tests for lib/agent.ts, the deterministic agent signal engine (doc 84).
// Run with: node test/agent.test.mjs   (Node 22.6+, pure type stripping)

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'agent-'));
const fix = (s) => s.replace("from './taxengine'", "from './taxengine.ts'").replace("from './nistudentloan'", "from './nistudentloan.ts'");
writeFileSync(path.join(stage, 'taxengine.ts'), readFileSync(path.join(lib, 'taxengine.ts'), 'utf8'));
writeFileSync(path.join(stage, 'nistudentloan.ts'), fix(readFileSync(path.join(lib, 'nistudentloan.ts'), 'utf8')));
writeFileSync(path.join(stage, 'agent.ts'), fix(readFileSync(path.join(lib, 'agent.ts'), 'utf8')));
const A = await import(pathToFileURL(path.join(stage, 'agent.ts')).href);

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL ${name}`);
  }
};
const eq = (name, got, want) => {
  const same = typeof want === 'number' ? Math.abs(got - want) < 0.005 : got === want;
  if (same) pass++;
  else {
    fail++;
    console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
};

// --- helpers -------------------------------------------------------------------
// Contiguous months ending at (and including) the month of `today`, spreading
// annual totals evenly, so projections are stable and history exists.
function monthsFor(today, count, { incomePerMonth = 0, expensesPerMonth = 0, cisPerMonth = 0 } = {}) {
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    out.push({
      month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
      income: incomePerMonth,
      expenses: expensesPerMonth,
      cis: cisPerMonth,
    });
  }
  return out;
}
function input(today, months, extra = {}) {
  return {
    today,
    months,
    unconfirmedCount: 0,
    equipmentSpendYtd: 0,
    studentLoanPlan: null,
    studentLoanPostgrad: false,
    employmentIncome: 0,
    ...extra,
  };
}
const keys = (signals) => signals.map((s) => s.signalKey);
const find = (signals, key) => signals.find((s) => s.signalKey === key);

// --- date helpers ----------------------------------------------------------------
eq('tax year start mid year', A.taxYearStart(new Date('2026-12-15T00:00:00Z')).toISOString().slice(0, 10), '2026-04-06');
eq('tax year start early April', A.taxYearStart(new Date('2026-04-05T00:00:00Z')).toISOString().slice(0, 10), '2025-04-06');
eq('tax year start 6 April', A.taxYearStart(new Date('2026-04-06T00:00:00Z')).toISOString().slice(0, 10), '2026-04-06');
eq('tax year label', A.taxYearLabel(new Date('2026-12-15T00:00:00Z')), '2026-27');
eq('tax year end', A.taxYearEnd(new Date('2026-12-15T00:00:00Z')).toISOString().slice(0, 10), '2027-04-05');
eq('Q1 label', A.mtdQuarter(new Date('2026-05-01T00:00:00Z')).label, '2026-27Q1');
eq('Q1 boundary day', A.mtdQuarter(new Date('2026-07-05T00:00:00Z')).label, '2026-27Q1');
eq('Q2 starts 6 July', A.mtdQuarter(new Date('2026-07-06T00:00:00Z')).label, '2026-27Q2');
eq('Q3 spans new year', A.mtdQuarter(new Date('2026-12-30T00:00:00Z')).label, '2026-27Q3');
eq('Q4 label', A.mtdQuarter(new Date('2027-02-01T00:00:00Z')).label, '2026-27Q4');

// --- derive and projection ---------------------------------------------------------
{
  const today = new Date('2026-12-15T00:00:00Z');
  const d = A.derive(input(today, monthsFor(today, 12, { incomePerMonth: 5000, expensesPerMonth: 1000 })));
  // Rolling 12 months counts everything; the tax year (Apr..Dec) counts 9 buckets.
  eq('rolling 12 income', d.rolling12Income, 60000);
  eq('ytd income Apr to Dec', d.ytdIncome, 45000);
  eq('ytd profit', d.ytdProfit, 36000);
  ok('months elapsed about 8', d.monthsElapsed === 8);
  const proj = A.projectAnnual(d.ytdIncome, d);
  ok('projection lands near 64k', proj > 62000 && proj < 67000);
}

// --- signal 1: VAT tiers ------------------------------------------------------------
{
  const today = new Date('2026-12-15T00:00:00Z');
  const at = (pm) => A.computeSignals(input(today, monthsFor(today, 12, { incomePerMonth: pm, expensesPerMonth: pm * 0.9 })));
  ok('79% no vat signal', !find(at(5900), 'vat_approach')); // 70,800
  const t1 = find(at(6100), 'vat_approach'); // 73,200 = 81%
  ok('80% fires tier 1', t1 && t1.periodKey.endsWith('#t1') && t1.priority === 'card');
  const t2 = find(at(6800), 'vat_approach'); // 81,600 = 90.7%
  ok('90% fires tier 2 as ping', t2 && t2.periodKey.endsWith('#t2') && t2.priority === 'ping');
  const t3 = find(at(7600), 'vat_approach'); // 91,200 over
  ok('100% fires tier 3 as ping', t3 && t3.periodKey.endsWith('#t3') && t3.priority === 'ping');
  ok('tier 3 says crossed', t3.title.toLowerCase().includes('crossed'));
  ok('tiers have distinct period keys', t1.periodKey !== t2.periodKey && t2.periodKey !== t3.periodKey);
}

// --- signal 2: MTD mandation --------------------------------------------------------
{
  const today = new Date('2026-12-15T00:00:00Z');
  const low = A.computeSignals(input(today, monthsFor(today, 12, { incomePerMonth: 3000 }))); // ytd 27k proj ~38k
  ok('under MTD level no signal', !find(low, 'mtd_mandation'));
  const cross = A.computeSignals(input(today, monthsFor(today, 12, { incomePerMonth: 6000 }))); // ytd 54k actual cross
  const m = find(cross, 'mtd_mandation');
  ok('actual cross fires ping', m && m.priority === 'ping');
  ok('mtd period is the tax year', m.periodKey === '2026-27');
  const projOnly = A.computeSignals(input(today, monthsFor(today, 12, { incomePerMonth: 4500 }))); // ytd 40.5k proj ~57k
  ok('projected cross fires too', Boolean(find(projOnly, 'mtd_mandation')));
}

// --- signal 3 and 4: higher rate and the taper ---------------------------------------
{
  const today = new Date('2026-12-15T00:00:00Z');
  const hr = A.computeSignals(input(today, monthsFor(today, 12, { incomePerMonth: 5000, expensesPerMonth: 800 }))); // proj profit ~53k
  const h = find(hr, 'higher_rate_approach');
  ok('projected past 50,270 fires card', h && h.priority === 'card');
  ok('under the band no signal', !find(A.computeSignals(input(today, monthsFor(today, 12, { incomePerMonth: 3000 }))), 'higher_rate_approach'));
  const taper = A.computeSignals(input(today, monthsFor(today, 12, { incomePerMonth: 10000, expensesPerMonth: 1500 }))); // proj profit ~108k
  const t = find(taper, 'pa_taper');
  ok('past 100k projected fires taper ping', t && t.priority === 'ping');
  ok('taper mentions 60%', t.body.includes('60%'));
  // Salary counts toward both boundaries.
  const withSalary = A.computeSignals(input(today, monthsFor(today, 12, { incomePerMonth: 2500, expensesPerMonth: 500 }), { employmentIncome: 90000 }));
  ok('salary pushes into taper', Boolean(find(withSalary, 'pa_taper')));
}

// --- projection gate: nothing projected in the first three months ---------------------
{
  const early = new Date('2026-05-20T00:00:00Z'); // month 1 of the tax year
  const s = A.computeSignals(input(early, monthsFor(early, 2, { incomePerMonth: 12000, expensesPerMonth: 1000 })));
  ok('no higher rate projection in month two', !find(s, 'higher_rate_approach'));
  ok('no taper projection in month two', !find(s, 'pa_taper'));
  ok('no poa projection in month two', !find(s, 'poa_cliff'));
  // But an ACTUAL crossing still fires (MTD at 24k ytd is under, so use VAT):
  const vat = A.computeSignals(input(early, monthsFor(early, 2, { incomePerMonth: 50000 })));
  ok('actual rolling VAT cross fires even early', Boolean(find(vat, 'vat_approach')));
}

// --- signal 5: the Class 2 pension year rescue -----------------------------------------
{
  const late = new Date('2027-01-20T00:00:00Z'); // month 9 of 2026/27
  const lowProfit = monthsFor(late, 10, { incomePerMonth: 500, expensesPerMonth: 100 }); // ytd well under 7,105
  const s = find(A.computeSignals(input(late, lowProfit)), 'class2_pension_year');
  ok('late year low profit fires ping', s && s.priority === 'ping');
  ok('names the £190 cost', s.body.includes('£190'));
  ok('salary above LEL suppresses it', !find(A.computeSignals(input(late, lowProfit, { employmentIncome: 9000 })), 'class2_pension_year'));
  const early = new Date('2026-09-15T00:00:00Z');
  ok('early in the year stays quiet', !find(A.computeSignals(input(early, monthsFor(early, 5, { incomePerMonth: 500 }))), 'class2_pension_year'));
}

// --- signal 6: student loan starts building --------------------------------------------
{
  const today = new Date('2026-12-15T00:00:00Z');
  const months = monthsFor(today, 12, { incomePerMonth: 4500, expensesPerMonth: 500 }); // ytd profit 36k
  const s = find(A.computeSignals(input(today, months, { studentLoanPlan: 'plan2' })), 'sl_threshold_cross');
  ok('plan2 over threshold fires card', s && s.priority === 'card');
  ok('set aside reassurance present', s.body.includes('set aside'));
  ok('no plan no signal', !find(A.computeSignals(input(today, months)), 'sl_threshold_cross'));
  const low = monthsFor(today, 12, { incomePerMonth: 2000 }); // ytd 18k under every threshold
  ok('under threshold no signal', !find(A.computeSignals(input(today, low, { studentLoanPlan: 'plan2' })), 'sl_threshold_cross'));
}

// --- signal 7: payments on account ------------------------------------------------------
{
  const today = new Date('2026-12-15T00:00:00Z');
  const s = find(A.computeSignals(input(today, monthsFor(today, 12, { incomePerMonth: 4000, expensesPerMonth: 1000 }))), 'poa_cliff'); // proj profit ~38k, bill well over 1k
  ok('healthy profit fires poa ping', s && s.priority === 'ping');
  ok('poa explains the double bill', s.body.toLowerCase().includes('half of next year') || s.body.toLowerCase().includes('on account'));
  // Heavy CIS at source keeps the bill under the threshold: no signal.
  const cisHeavy = A.computeSignals(input(today, monthsFor(today, 12, { incomePerMonth: 4000, expensesPerMonth: 1000, cisPerMonth: 800 })));
  ok('CIS covering the bill suppresses poa', !find(cisHeavy, 'poa_cliff'));
}

// --- signal 8: CIS refund milestones ------------------------------------------------------
{
  const today = new Date('2026-08-20T00:00:00Z');
  // Low profit, big CIS: profit ytd small so tax tiny, refund ~ CIS.
  const at = (cis) => find(A.computeSignals(input(today, monthsFor(today, 5, { incomePerMonth: 1500, expensesPerMonth: 1200, cisPerMonth: cis }))), 'cis_refund_milestone');
  ok('no refund no milestone', !at(0));
  const m250 = at(60); // ~300 across Apr..Aug
  ok('first milestone at 250', m250 && m250.periodKey.endsWith('#m250'));
  const m500 = at(120); // ~600
  ok('second milestone at 500', m500 && m500.periodKey.endsWith('#m500'));
  const m1000 = at(210); // ~1050
  ok('third milestone at 1000', m1000 && m1000.periodKey.endsWith('#m1000'));
  const m1500 = at(310); // ~1550
  ok('then every 500', m1500 && m1500.periodKey.endsWith('#m1500'));
  ok('milestones are cards not pings', m500.priority === 'card');
}

// --- signal 9: the quiet expense month -----------------------------------------------------
{
  const today = new Date('2026-12-15T00:00:00Z');
  // Nov quiet (50), Aug..Oct averaging 500.
  const months = monthsFor(today, 12, { incomePerMonth: 3000, expensesPerMonth: 500 });
  months[months.length - 2] = { ...months[months.length - 2], expenses: 50 }; // November
  const s = find(A.computeSignals(input(today, months)), 'quiet_expenses');
  ok('quiet month fires card', s && s.priority === 'card');
  eq('quiet month period key is that month', s.periodKey, '2026-11');
  // A month with NOTHING logged still fires (it is missing from the input).
  const gappy = months.filter((m) => m.month !== '2026-11');
  const g = find(A.computeSignals(input(today, gappy)), 'quiet_expenses');
  ok('a completely empty month fires too', g && g.numbers.lastMonth === 0);
  // Low averages stay quiet (hobby scale, not worth a nudge).
  const tiny = monthsFor(today, 12, { incomePerMonth: 500, expensesPerMonth: 100 });
  tiny[tiny.length - 2] = { ...tiny[tiny.length - 2], expenses: 10 };
  ok('small operations stay quiet', !find(A.computeSignals(input(today, tiny)), 'quiet_expenses'));
  // No history, no verdict.
  const fresh = monthsFor(today, 2, { incomePerMonth: 3000, expensesPerMonth: 0 });
  ok('no history no signal', !find(A.computeSignals(input(today, fresh)), 'quiet_expenses'));
}

// --- signal 10: AIA timing -------------------------------------------------------------------
{
  const nearEnd = new Date('2027-02-20T00:00:00Z'); // inside the last 8 weeks
  const strong = monthsFor(nearEnd, 12, { incomePerMonth: 6500, expensesPerMonth: 1000 }); // proj profit ~60k+
  const s = find(A.computeSignals(input(nearEnd, strong)), 'aia_timing');
  ok('strong year near year end fires ping', s && s.priority === 'ping');
  ok('carries the doctrine line', s.body.includes('not advice'));
  ok('no product names in the copy', !/ford|transit|vauxhall|barclay|financ(e|ing) deal/i.test(s.body));
  ok('kit already bought suppresses it', !find(A.computeSignals(input(nearEnd, strong, { equipmentSpendYtd: 4000 })), 'aia_timing'));
  const midYear = new Date('2026-10-15T00:00:00Z');
  ok('mid year stays quiet', !find(A.computeSignals(input(midYear, monthsFor(midYear, 12, { incomePerMonth: 6500, expensesPerMonth: 1000 }))), 'aia_timing'));
  const weakYear = find(A.computeSignals(input(nearEnd, monthsFor(nearEnd, 12, { incomePerMonth: 2000, expensesPerMonth: 500 }))), 'aia_timing');
  ok('modest year stays quiet', !weakYear);
}

// --- signal 11: quarter closing with unconfirmed entries ----------------------------------------
{
  const nearQ3End = new Date('2026-12-30T00:00:00Z'); // Q3 ends 5 Jan
  const months = monthsFor(nearQ3End, 6, { incomePerMonth: 2000, expensesPerMonth: 300 });
  const s = find(A.computeSignals(input(nearQ3End, months, { unconfirmedCount: 7 })), 'quarter_unconfirmed');
  ok('unconfirmed near quarter end fires ping', s && s.priority === 'ping');
  eq('quarter period key', s.periodKey, '2026-27Q3');
  ok('four entries stays quiet', !find(A.computeSignals(input(nearQ3End, months, { unconfirmedCount: 4 })), 'quarter_unconfirmed'));
  const early = new Date('2026-11-20T00:00:00Z'); // 46 days out
  ok('far from quarter end stays quiet', !find(A.computeSignals(input(early, months, { unconfirmedCount: 7 })), 'quarter_unconfirmed'));
}

// --- the noise caps ------------------------------------------------------------------------------
{
  const mk = (key) => ({ signalKey: key, periodKey: 'p', priority: 'ping', title: '', body: '', waText: '', numbers: {} });
  const card = { signalKey: 'cis_refund_milestone', periodKey: 'p', priority: 'card', title: '', body: '', waText: '', numbers: {} };
  const capped = A.applyPingCaps([mk('vat_approach'), mk('mtd_mandation'), mk('pa_taper'), card], 0);
  const pings = capped.filter((s) => s.priority === 'ping');
  eq('one ping per day', pings.length, 1);
  eq('most important ping wins', pings[0].signalKey, 'mtd_mandation');
  eq('losers demoted to cards, nothing dropped', capped.length, 4);
  const exhausted = A.applyPingCaps([mk('mtd_mandation')], 3);
  eq('weekly cap exhausted demotes all', exhausted.filter((s) => s.priority === 'ping').length, 0);
  eq('demoted signal still present', exhausted.length, 1);
}

// --- copy rules across every signal ---------------------------------------------------------------
{
  const today = new Date('2027-02-20T00:00:00Z');
  const busy = monthsFor(today, 12, { incomePerMonth: 8000, expensesPerMonth: 1200, cisPerMonth: 100 });
  busy[busy.length - 2] = { ...busy[busy.length - 2], expenses: 50 };
  const all = A.computeSignals(input(today, busy, { studentLoanPlan: 'plan2', unconfirmedCount: 8 }));
  ok('a busy user trips several signals', all.length >= 4);
  for (const s of all) {
    ok(`${s.signalKey}: no forbidden dashes`, !/[–—−]/.test(s.title + s.body + s.waText));
    ok(`${s.signalKey}: no certainty claims`, !/\byou will save\b|\bguaranteed\b/i.test(s.body));
    ok(`${s.signalKey}: has numbers payload`, Object.keys(s.numbers).length > 0);
  }
}

console.log(`agent: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

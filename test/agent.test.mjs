// Tests for lib/agent.ts, the deterministic agent signal engine (doc 84).
// Run with: node test/agent.test.mjs   (Node 22.6+, pure type stripping)

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'agent-'));
const fix = (s) =>
  s
    .replace("from './taxengine'", "from './taxengine.ts'")
    .replace("from './nistudentloan'", "from './nistudentloan.ts'")
    .replace("from './propertyengine'", "from './propertyengine.ts'")
    .replace("from './waintents'", "from './waintents.ts'");
writeFileSync(path.join(stage, 'taxengine.ts'), readFileSync(path.join(lib, 'taxengine.ts'), 'utf8'));
writeFileSync(path.join(stage, 'nistudentloan.ts'), fix(readFileSync(path.join(lib, 'nistudentloan.ts'), 'utf8')));
writeFileSync(path.join(stage, 'propertyengine.ts'), fix(readFileSync(path.join(lib, 'propertyengine.ts'), 'utf8')));
writeFileSync(path.join(stage, 'waintents.ts'), fix(readFileSync(path.join(lib, 'waintents.ts'), 'utf8')));
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
    week: null,
    property: null,
    invoices: null,
    categories: null,
    unconfirmedCount: 0,
    equipmentSpendYtd: 0,
    studentLoanPlan: null,
    studentLoanPostgrad: false,
    employmentIncome: 0,
    goals: [],
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


// --- goal signals (doc 82 section 5b) -------------------------------------------
{
  const van = { id: 'aaaabbbb-0000-0000-0000-000000000000', kind: 'purchase', title: 'the van', amount: 24000, targetDate: null };
  // G1 combo: projected ~6k over the 40% line, van goal covers the overshoot.
  const today = new Date('2026-12-15T00:00:00Z');
  const hot = monthsFor(today, 12, { incomePerMonth: 5500, expensesPerMonth: 800 }); // proj profit ~59k
  const combo = A.computeSignals(input(today, hot, { goals: [van] }));
  const c = find(combo, 'goal_threshold_combo');
  ok('combo fires as ping', c && c.priority === 'ping');
  ok('combo names the goal', c.body.includes('the van'));
  ok('combo period key carries the goal id', c.periodKey.includes('#gaaaabbbb'));
  ok('combo suppresses the generic higher rate card', !find(combo, 'higher_rate_approach'));
  ok('no goal means generic card returns', Boolean(find(A.computeSignals(input(today, hot)), 'higher_rate_approach')));
  // A goal too small to fix the overshoot does not fire the combo.
  const smallGoal = { ...van, id: 'ccccdddd-0000-0000-0000-000000000000', amount: 800 };
  const noCombo = A.computeSignals(input(today, hot, { goals: [smallGoal] }));
  ok('small goal no combo', !find(noCombo, 'goal_threshold_combo'));

  // G2 timing near year end, with the after tax cost at the marginal rate.
  const nearEnd = new Date('2027-02-20T00:00:00Z');
  const strong = monthsFor(nearEnd, 12, { incomePerMonth: 8000, expensesPerMonth: 1200 }); // proj profit ~74k, 42% marginal
  const t = find(A.computeSignals(input(nearEnd, strong, { goals: [van] })), 'goal_purchase_timing');
  ok('timing fires near year end', t && t.priority === 'ping');
  eq('after tax cost at 42%', t.numbers.realCost, Math.round(24000 * 0.58));
  ok('timing suppresses generic aia', !find(A.computeSignals(input(nearEnd, strong, { goals: [van] })), 'aia_timing'));
  ok('generic aia returns without a goal', Boolean(find(A.computeSignals(input(nearEnd, strong)), 'aia_timing')));
  // Tiny profits: the deduction saves nothing, no timing nudge.
  const weak = monthsFor(nearEnd, 12, { incomePerMonth: 2200, expensesPerMonth: 400 });
  ok('weak year no timing', !find(A.computeSignals(input(nearEnd, weak, { goals: [van] })), 'goal_purchase_timing'));

  // G3 within reach: after tax pot covers the goal.
  const smallVan = { ...van, id: 'eeeeffff-0000-0000-0000-000000000000', amount: 9000 };
  const mid = new Date('2026-12-15T00:00:00Z');
  const earner = monthsFor(mid, 12, { incomePerMonth: 3000, expensesPerMonth: 800 }); // ytd profit ~19.8k, tax ~1.9k, pot ~17.9k
  const w = find(A.computeSignals(input(mid, earner, { goals: [smallVan] })), 'goal_within_reach');
  ok('within reach fires as card', w && w.priority === 'card');
  ok('within reach quiet when short', !find(A.computeSignals(input(mid, earner, { goals: [van] })), 'goal_within_reach'));

  // G4 progress: dated goal still short, monthly period, per week figure.
  const dated = { ...van, id: 'abcdabcd-0000-0000-0000-000000000000', targetDate: '2027-03-15' };
  const p2 = find(A.computeSignals(input(mid, earner, { goals: [dated] })), 'goal_progress');
  ok('progress fires monthly card', p2 && p2.priority === 'card' && p2.periodKey.startsWith('2026-12#g'));
  ok('progress has a per week figure', p2.numbers.perWeek > 0);
  ok('reached goal has no progress card', !find(A.computeSignals(input(mid, earner, { goals: [{ ...dated, amount: 9000 }] })), 'goal_progress'));
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

// --- signal 12: the Monday brief ---------------------------------------------------
{
  const monday = new Date('2026-12-14T07:00:00Z'); // a Monday
  const tuesday = new Date('2026-12-15T07:00:00Z');
  const months = monthsFor(monday, 6, { incomePerMonth: 3000, expensesPerMonth: 800 });
  const week = { income: 850, expenses: 210, activeDays: 4 };

  const b = find(A.computeSignals(input(monday, months, { week })), 'monday_brief');
  ok('fires on a Monday with week data', !!b);
  ok('is a card, never a ping', b.priority === 'card');
  eq('period key is the Monday', b.periodKey, 'wk-2026-12-14');
  ok('three numbers in the body', b.body.includes('£850') && b.body.includes('£210') && b.body.includes('£640'));
  ok('kept figure in numbers', b.numbers.kept === 640);

  ok('does not fire on a Tuesday', !find(A.computeSignals(input(tuesday, months, { week })), 'monday_brief'));
  ok('skips when week is null (old RPC)', !find(A.computeSignals(input(monday, months)), 'monday_brief'));
  ok(
    'no data at all stays silent',
    !find(A.computeSignals(input(monday, [], { week: { income: 0, expenses: 0, activeDays: 0 } })), 'monday_brief'),
  );

  const quiet = find(
    A.computeSignals(input(monday, months, { week: { income: 0, expenses: 0, activeDays: 0 } })),
    'monday_brief',
  );
  ok('quiet week gets the gentle version', quiet && quiet.body.startsWith('Nothing logged last week'));

  const withUnconfirmed = find(A.computeSignals(input(monday, months, { week, unconfirmedCount: 12 })), 'monday_brief');
  ok('unconfirmed entries become the watchpoint', withUnconfirmed.body.includes('12 entries'));
}

// --- signal 13: the January rehearsal ------------------------------------------------
{
  // 6 July 2026 is day 0 of Q2: the rehearsal fires with YTD facts only.
  const qStart = new Date('2026-07-06T07:00:00Z');
  const months = monthsFor(qStart, 4, { incomePerMonth: 8000, expensesPerMonth: 2000 });
  const r = find(A.computeSignals(input(qStart, months)), 'january_rehearsal');
  ok('fires in the first week of a quarter', !!r);
  ok('is a card', r.priority === 'card');
  eq('period key is the quarter', r.periodKey, '2026-27Q2');
  ok('bill and perWeek are coherent', r.numbers.bill > 0 && r.numbers.perWeek >= Math.floor(r.numbers.bill / r.numbers.weeksTo31Jan));
  ok('no projection language', !/heading for|current pace/.test(r.body));

  const midQuarter = new Date('2026-08-15T07:00:00Z');
  ok(
    'silent mid quarter',
    !find(A.computeSignals(input(midQuarter, monthsFor(midQuarter, 5, { incomePerMonth: 8000, expensesPerMonth: 2000 }))), 'january_rehearsal'),
  );

  const tiny = find(A.computeSignals(input(qStart, monthsFor(qStart, 4, { incomePerMonth: 1100, expensesPerMonth: 400 }))), 'january_rehearsal');
  ok('tiny bills stay quiet', !tiny);

  // The loan only joins the bill once YTD profit clears the plan threshold,
  // so the SL case earns more: 4 months at 10k profit = 40,000 > 29,385.
  const richMonths = monthsFor(qStart, 4, { incomePerMonth: 12000, expensesPerMonth: 2000 });
  const richPlain = find(A.computeSignals(input(qStart, richMonths)), 'january_rehearsal');
  const withSl = find(
    A.computeSignals(input(qStart, richMonths, { studentLoanPlan: 'plan2' })),
    'january_rehearsal',
  );
  ok('student loan named when a plan is set', withSl && withSl.body.includes('including your student loan'));
  ok('loan raises the bill', withSl.numbers.bill > richPlain.numbers.bill);
  const underThreshold = find(A.computeSignals(input(qStart, months, { studentLoanPlan: 'plan2' })), 'january_rehearsal');
  ok('loan under threshold stays out of the bill', underThreshold && !underThreshold.body.includes('student loan'));
}

// --- signals 14 and 15 plus the combined trap: the landlord set (doc 82 s5d) ----------
{
  const today = new Date('2026-12-15T00:00:00Z');
  // A sparky with a flat: trade 30,600 gross YTD, rents 24,300 YTD combined in
  // months. Trade alone under 50k, combined over: the trap fires and the
  // generic mandation stays quiet.
  const months = monthsFor(today, 9, { incomePerMonth: 6100, expensesPerMonth: 1200 }); // ytd income 54,900
  const property = { rents: 24300, expenses: 3000, finance: 6000, rents12: 24300 };
  const sig = A.computeSignals(input(today, months, { property }));
  const trap = find(sig, 'mtd_combined_trap');
  ok('combined trap fires as ping', trap && trap.priority === 'ping');
  ok('trap replaces generic mandation', !find(sig, 'mtd_mandation'));
  ok('trap names both streams', trap.body.includes('£30,600') && trap.body.includes('£24,300'));

  // Trade alone over the line: generic fires, trap stays quiet.
  const bigTrade = A.computeSignals(input(today, monthsFor(today, 9, { incomePerMonth: 6500 }), {
    property: { rents: 1000, expenses: 0, finance: 0, rents12: 1000 },
  }));
  ok('trade alone over keeps generic', Boolean(find(bigTrade, 'mtd_mandation')));
  ok('no trap when trade alone crosses', !find(bigTrade, 'mtd_combined_trap'));

  // VAT excludes rent: 95,400 rolling gross of which 24,300 rent leaves 71,100
  // of taxable turnover, 79%: no VAT signal. Without the split it would fire.
  const vatMonths = monthsFor(today, 12, { incomePerMonth: 7950 }); // rolling 95,400
  ok('rent-blind VAT would fire', Boolean(find(A.computeSignals(input(today, vatMonths)), 'vat_approach')));
  ok('VAT ignores exempt rent', !find(A.computeSignals(input(today, vatMonths, { property })), 'vat_approach'));

  // Section 24 exposure: higher rate territory with real finance costs.
  const hrMonths = monthsFor(today, 9, { incomePerMonth: 7000, expensesPerMonth: 1000 });
  const s24 = find(A.computeSignals(input(today, hrMonths, { property })), 's24_exposure');
  ok('s24 exposure fires for the higher rate landlord', s24 && s24.priority === 'card');
  ok('s24 shows both percentages', s24.body.includes('40%') && s24.body.includes('20%'));
  ok('s24 holds the FCA line', !/apply for|this lender|this mortgage deal/i.test(s24.body));
  ok('no s24 card without finance costs', !find(
    A.computeSignals(input(today, hrMonths, { property: { ...property, finance: 0 } })),
    's24_exposure',
  ));

  // April 2027 preview prices the change on real numbers.
  const preview = find(A.computeSignals(input(today, hrMonths, { property })), 'property_rates_2027');
  ok('April 2027 preview fires', preview && preview.priority === 'card');
  ok('preview carries a per year figure', preview.numbers.extraPerYear >= 25);
  ok('preview names the new rates', preview.body.includes('22%') && preview.body.includes('42%'));

  // No property stream: none of the landlord set fires, nothing breaks.
  const none = A.computeSignals(input(today, hrMonths));
  ok('no landlord signals without the stream', !find(none, 's24_exposure') && !find(none, 'property_rates_2027') && !find(none, 'mtd_combined_trap'));

  for (const key of ['mtd_combined_trap', 's24_exposure', 'property_rates_2027']) {
    const found = [trap, s24, preview].find((x) => x && x.signalKey === key);
    ok(`${key}: no forbidden dashes`, found && !/[\u2013\u2014\u2212]/.test(found.title + found.body + found.waText));
  }
}

// --- signal 16: the invoice chaser (doc 82 s5e item 3) --------------------------------
{
  const today = new Date('2026-12-15T00:00:00Z');
  const months = monthsFor(today, 6, { incomePerMonth: 3000, expensesPerMonth: 800 });
  const inv = (daysOver, id = 'aaaabbbb-0000-0000-0000-000000000000') => ({
    id, number: '0012', customer: 'Dave Wilson', total: 850, daysOver, link: 'https://example.com/invoice/x',
  });

  const s14 = find(A.computeSignals(input(today, months, { invoices: [inv(18)] })), 'invoice_chase');
  ok('14 day tier fires as card', s14 && s14.priority === 'card');
  ok('card carries the forwardable draft', s14.body.includes('Hi Dave Wilson') && s14.body.includes('£850'));
  ok('draft includes the invoice link', s14.body.includes('https://example.com/invoice/x'));
  ok('approval gate in the copy', s14.body.includes('You send, never me'));
  eq('fire once per invoice per tier', s14.periodKey, 'inv-aaaabbbb#14');

  const s30 = find(A.computeSignals(input(today, months, { invoices: [inv(34)] })), 'invoice_chase');
  ok('30 day tier escalates to ping', s30 && s30.priority === 'ping');
  ok('firmer tone at 30 days', s30.body.includes('outstanding'));
  eq('the 30 tier has its own period key', s30.periodKey, 'inv-aaaabbbb#30');

  const many = A.computeSignals(input(today, months, {
    invoices: [inv(40, '11111111-0'), inv(35, '22222222-0'), inv(33, '33333333-0')],
  })).filter((x) => x.signalKey === 'invoice_chase');
  eq('never more than two chases per walk', many.length, 2);

  ok('under 14 days stays quiet', !find(A.computeSignals(input(today, months, { invoices: [inv(9)] })), 'invoice_chase'));
  ok('null invoices skip cleanly', !find(A.computeSignals(input(today, months)), 'invoice_chase'));
  ok('chase copy has no forbidden dashes', !/[\u2013\u2014\u2212]/.test(s14.title + s14.body + s14.waText + s30.body));
}

// --- signal 17: expense completeness ---------------------------------------------------
{
  const today = new Date('2026-12-15T00:00:00Z');
  const months = monthsFor(today, 8, { incomePerMonth: 3000, expensesPerMonth: 600 });
  const sparse = find(A.computeSignals(input(today, months, { categories: ['materials', 'other'] })), 'expense_completeness');
  ok('sparse categories fire the check', sparse && sparse.priority === 'card');
  ok('missing claims are named', sparse.body.includes('insurance') && sparse.body.includes('fuel'));
  ok('the escape hatch is honest', sparse.body.includes('If you genuinely have none, ignore this'));
  const full = A.computeSignals(input(today, months, {
    categories: ['materials', 'phone', 'insurance', 'travel', 'tools'],
  }));
  ok('complete categories stay quiet', !find(full, 'expense_completeness'));
  const employee = A.computeSignals(input(today, months, { categories: ['materials'], employmentIncome: 30000 }));
  ok('employees are not nagged about trade claims', !find(employee, 'expense_completeness'));
  ok('null categories skip (old RPC)', !find(A.computeSignals(input(today, months)), 'expense_completeness'));
  const early = new Date('2026-06-10T00:00:00Z');
  ok('too early in the year stays quiet', !find(
    A.computeSignals(input(early, monthsFor(early, 3, { incomePerMonth: 3000, expensesPerMonth: 600 }), { categories: ['materials'] })),
    'expense_completeness',
  ));
  ok('completeness copy has no forbidden dashes', !/[\u2013\u2014\u2212]/.test(sparse.title + sparse.body + sparse.waText));
}

// --- undated goals still get the monthly pulse ------------------------------------------
{
  const today = new Date('2026-12-15T00:00:00Z');
  const months = monthsFor(today, 8, { incomePerMonth: 4000, expensesPerMonth: 1000 });
  const g = find(
    A.computeSignals(input(today, months, {
      goals: [{ id: 'ffffeeee-0000-0000-0000-000000000000', kind: 'purchase', title: 'van', amount: 40000, targetDate: null }],
    })),
    'goal_progress',
  );
  ok('undated goal pulses monthly', !!g);
  ok('undated pulse invites a date', g.body.includes('Give it a date'));
  ok('no weekly pacing without a date', !g.body.includes('a week from here'));
}

// --- year end countdown (seasonal) -----------------------------------------------------
{
  // Too early: 49 days before 5 April is outside the six week window.
  const early = new Date('2027-02-15T00:00:00Z');
  const earlyOut = A.computeSignals(input(early, monthsFor(early, 12, { incomePerMonth: 4000, expensesPerMonth: 1000 })));
  ok('no countdown seven weeks out', !find(earlyOut, 'year_end_countdown'));

  // In window: 21 days before 5 April, with real profit this year.
  const mid = new Date('2027-03-15T00:00:00Z');
  const months = monthsFor(mid, 12, { incomePerMonth: 4000, expensesPerMonth: 1000 });
  const c = find(A.computeSignals(input(mid, months)), 'year_end_countdown');
  ok('countdown fires inside the six weeks', !!c);
  ok('countdown is a card, never a ping', c.priority === 'card');
  ok('countdown weeks left is 1..6', c.numbers.weeksLeft >= 1 && c.numbers.weeksLeft <= 6);
  ok('countdown title names the weeks', /week/.test(c.title) && c.title.includes('5 April'));
  ok('countdown always lists the receipts move', c.body.toLowerCase().includes('receipts'));
  ok('countdown copy has no forbidden dashes', !/[–—−]/.test(c.title + c.body + c.waText));

  // Dormant account inside the window: nothing to act on, so no nag.
  const dormant = find(A.computeSignals(input(mid, monthsFor(mid, 12, { incomePerMonth: 0, expensesPerMonth: 0 }))), 'year_end_countdown');
  ok('no countdown for a dormant account', !dormant);

  // Unconfirmed entries add the confirm move.
  const withUnconf = find(A.computeSignals(input(mid, months, { unconfirmedCount: 4 })), 'year_end_countdown');
  ok('countdown includes the confirm move', withUnconf.body.includes('4 entries'));

  // Higher rate profit plus a purchase goal: pension and AIA levers appear.
  const rich = monthsFor(mid, 12, { incomePerMonth: 6000, expensesPerMonth: 500 });
  const hr = find(
    A.computeSignals(input(mid, rich, {
      goals: [{ id: 'aaaabbbb-0000-0000-0000-000000000000', kind: 'purchase', title: 'a van', amount: 24000, targetDate: null }],
    })),
    'year_end_countdown',
  );
  ok('higher rate countdown mentions a pension move', hr.body.toLowerCase().includes('pension'));
  ok('countdown surfaces the AIA purchase timing', hr.body.includes('Annual Investment Allowance') && hr.body.includes('a van'));

  // Shrinking: near the last week before 5 April, fewer weeks and a distinct key.
  const late = new Date('2027-03-30T00:00:00Z');
  const c2 = find(A.computeSignals(input(late, monthsFor(late, 12, { incomePerMonth: 4000, expensesPerMonth: 1000 }))), 'year_end_countdown');
  ok('countdown shrinks as the door closes', c2.numbers.weeksLeft < c.numbers.weeksLeft);
  ok('each week has its own period key', c2.periodKey !== c.periodKey);
}

console.log(`agent: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

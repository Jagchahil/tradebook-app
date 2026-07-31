// Tests for the structure-aware routing in lib/agent.ts (computeSignalsForStructure + moneyMoveSignals).
//
// THE DEFECT THIS SUITE GUARDS AGAINST. Rakha, the proactive watchman, used to compute EVERYONE as a
// sole trader: a limited company director was warned about the 40% band on profit that belongs to the
// COMPANY, and a partner was taxed on the WHOLE FIRM'S books when the law taxes him only on his share
// (users.partnership_share, captured at setup and already used by the optimiser, but never routed
// into the walk). lib/position.ts knows all three structures; this suite proves the walk now routes
// through it, by running the SAME customer facts through all three structures and asserting:
//   . the sole trader baseline is BYTE IDENTICAL to the raw engine (no regression, to the penny),
//   . the figures differ exactly where the law differs (the partner's slice, the company's CT600),
//   . the whole-firm tests (VAT registration) keep the whole books for a partner,
//   . the signals a structure does not lawfully have are gated off rather than fired with a wrong
//     number (the trading allowance and MTD mandation for partners; the sole-trader set and the
//     landlord set for a company).
//   node test/agentstructure.test.mjs

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'agentstruct-'));
const fix = (s) => s.replace(/from '(\.\/[a-zA-Z0-9]+)'/g, "from '$1.ts'");
for (const f of ['taxengine', 'money', 'nistudentloan', 'propertyengine', 'ltdengine', 'personalincome', 'partnership', 'position', 'rakhamoves', 'waintents', 'agent']) {
  writeFileSync(path.join(stage, f + '.ts'), fix(readFileSync(path.join(lib, f + '.ts'), 'utf8')));
}
const A = await import(pathToFileURL(path.join(stage, 'agent.ts')).href);
const ENG = await import(pathToFileURL(path.join(stage, 'taxengine.ts')).href);
const LTD = await import(pathToFileURL(path.join(stage, 'ltdengine.ts')).href);
const MONEY = await import(pathToFileURL(path.join(stage, 'money.ts')).href);
const { computeSignals, computeSignalsForStructure } = A;
const gbp = MONEY.gbp0;

let pass = 0, fail = 0;
function ok(desc, cond) {
  if (cond) { pass++; process.stdout.write(`  PASS  ${desc}\n`); }
  else { fail++; process.stdout.write(`  FAIL  ${desc}\n`); }
}

// Contiguous months ending at (and including) the month of `today`, same helper as test/agent.test.mjs.
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
    today, months, week: null, property: null, invoices: null,
    categories: ['tools', 'fuel'], unconfirmedCount: 0, equipmentSpendYtd: 0,
    studentLoanPlan: null, studentLoanPostgrad: false, employmentIncome: 0, goals: [],
    ...extra,
  };
}
const keys = (sigs) => new Set(sigs.map((s) => s.signalKey));
const find = (sigs, key) => sigs.find((s) => s.signalKey === key);

// 12 contiguous months ending at March 2026 (inside the 2025-26 tax year), each £10,000 in / £500 out,
// so the year projects to a high profit and canProject is true.
const marchToday = new Date('2026-03-01T00:00:00Z');
const baseInput = input(marchToday, monthsFor(marchToday, 12, { incomePerMonth: 10000, expensesPerMonth: 500 }));

// 1. SOLE TRADER: the wrapper returns EXACTLY the existing engine (no regression, byte for byte).
{
  const st = computeSignalsForStructure({ ...baseInput, businessType: 'sole_trader' });
  const raw = computeSignals(baseInput);
  ok('sole trader: wrapper output matches computeSignals exactly', JSON.stringify(st) === JSON.stringify(raw));
  ok('sole trader still gets the sole-trader personal signals (e.g. higher-rate or PoA)', keys(st).has('higher_rate_approach') || keys(st).has('poa_cliff') || keys(st).has('pa_taper'));
  // A stray partnership share on a sole trader must be ignored: only the structure routes.
  const withShare = computeSignalsForStructure({ ...baseInput, businessType: 'sole_trader', partnershipShare: 50 });
  ok('sole trader: a partnership share left on the profile changes nothing', JSON.stringify(withShare) === JSON.stringify(raw));
}

// 2. LIMITED COMPANY: gets the money moves, and NOT the profit-as-personal-income signals.
{
  const ltd = computeSignalsForStructure({
    ...baseInput,
    businessType: 'limited_company',
    employmentIncome: 12570,   // director salary the company pays
    dividendIncome: 80000,     // dividends drawn
  });
  const k = keys(ltd);
  ok('ltd: gets the grounding both-sides summary', k.has('position_summary'));
  ok('ltd: gets a pension money-move on salary+dividends', [...k].some((x) => x.startsWith('pension_relief')));
  ok('ltd: does NOT get higher_rate_approach (that reads profit as personal income)', !k.has('higher_rate_approach'));
  ok('ltd: does NOT get pa_taper', !k.has('pa_taper'));
  ok('ltd: does NOT get poa_cliff (sole-trader PoA maths)', !k.has('poa_cliff'));
}

// 3. THE SAME BOOKS, THREE STRUCTURES. A Monday mid December, twelve months of £10,000 in and £3,000
//    out: tax-year profit £63,000, rolling turnover £120,000, week of £850 in / £210 out. One set of
//    facts; the law then differs by structure and the signals must differ with it.
{
  const monday = new Date('2026-12-14T00:00:00Z');
  const months = monthsFor(monday, 12, { incomePerMonth: 10000, expensesPerMonth: 3000 });
  const week = { income: 850, expenses: 210, activeDays: 4 };
  const invoices = [{ id: 'aaaabbbb-0000-0000-0000-000000000000', number: '0012', customer: 'Dave Wilson', total: 850, daysOver: 18, link: 'https://example.com/invoice/x' }];
  const facts = input(monday, months, { week, invoices });
  const ytdProfit = 63000; // 9 tax-year months of £7,000

  const sole = computeSignalsForStructure({ ...facts, businessType: 'sole_trader' });
  const partner = computeSignalsForStructure({ ...facts, businessType: 'partnership', partnershipShare: 50 });
  const ltd = computeSignalsForStructure({ ...facts, businessType: 'limited_company', employmentIncome: 12570, dividendIncome: 45000 });

  // The baseline again, on these facts: byte identical.
  ok('same books: sole trader output is byte identical to the raw engine', JSON.stringify(sole) === JSON.stringify(computeSignals(facts)));

  // THE 40% BAND. The firm projects about £91k of profit. The sole trader is genuinely heading into
  // the band; the half-share partner projects about £45k and is NOT. Same books, different law.
  ok('same books: the sole trader is warned about the 40% band', !!find(sole, 'higher_rate_approach'));
  ok('same books: the half-share partner is not (his slice stays under it)', !find(partner, 'higher_rate_approach'));
  ok('same books: the director is not either (the profit is the company\'s)', !find(ltd, 'higher_rate_approach'));

  // PAYMENTS ON ACCOUNT. Both self-assessed structures get the warning, but the partner's bill is his
  // own, and because tax is progressive his bill is less than half the whole-books bill, not exactly half.
  const soleP = find(sole, 'poa_cliff');
  const partP = find(partner, 'poa_cliff');
  ok('same books: PoA fires for the sole trader', !!soleP);
  ok('same books: PoA fires for the partner too, on his own bill', !!partP);
  ok('same books: the partner\'s estimated bill is below the whole-books bill', partP && soleP && partP.numbers.estBill < soleP.numbers.estBill);
  ok('same books: progressivity, twice the partner\'s bill is still under the sole trader\'s', partP && soleP && partP.numbers.estBill * 2 < soleP.numbers.estBill);
  ok('same books: the company never gets sole-trader PoA', !find(ltd, 'poa_cliff'));

  // VAT. Registration is tested on the BUSINESS'S taxable turnover, whoever owns it. All three see
  // the full £120,000, because the partnership (not the partner) is the registrable person.
  for (const [name, sigs] of [['sole trader', sole], ['partner', partner], ['ltd', ltd]]) {
    const v = find(sigs, 'vat_approach');
    ok(`same books: VAT watches the whole £120,000 turnover for the ${name}`, v && v.numbers.rolling12 === 120000);
  }

  // MTD. The sole trader has crossed the £50,000 line for real. The partner's share of partnership
  // profit is not MTD qualifying income (partnerships have no mandation date), and the company files
  // a CT600, not quarterly ITSA updates: both are gated, not mis-fired.
  ok('same books: MTD mandation fires for the sole trader', !!find(sole, 'mtd_mandation'));
  ok('same books: MTD mandation is gated for the partner (not qualifying income)', !find(partner, 'mtd_mandation'));
  ok('same books: MTD mandation is gated for the company', !find(ltd, 'mtd_mandation'));

  // THE MONDAY BRIEF. All three get the weekly heartbeat, and the money-in / money-out lines are the
  // books' own facts for all three. The TAX line is where the law differs, and now the figure does too.
  const soleMB = find(sole, 'monday_brief');
  const partMB = find(partner, 'monday_brief');
  const ltdMB = find(ltd, 'monday_brief');
  ok('same books: all three structures get the Monday brief', !!soleMB && !!partMB && !!ltdMB);
  ok('same books: the week\'s in and out figures are identical across structures', [soleMB, partMB, ltdMB].every((b) => b.body.includes('£850') && b.body.includes('£210')));
  const soleTax = ENG.soleTraderTax(ytdProfit).total;           // the whole books as one man's profit
  const partnerTax = ENG.soleTraderTax(ytdProfit / 2).total;    // his half, through the same engine
  const ctProfit = ytdProfit - 12570 - LTD.employerNIC(12570);  // company profit after salary and employer NI
  const corpTax = LTD.corporationTax(ctProfit);                 // the CT600 figure, through the company engine
  ok('same books: the sole trader\'s Monday tax line carries the whole-books figure', soleMB.body.includes(`${gbp(soleTax)} of tax`));
  ok('same books: the partner\'s Monday tax line carries HIS HALF, to the pound', partMB.body.includes(`${gbp(partnerTax)} of tax`));
  ok('same books: the partner\'s figure differs from the sole trader\'s', gbp(partnerTax) !== gbp(soleTax));
  ok('same books: the director\'s Monday tax line names Corporation Tax', ltdMB.body.includes('Corporation Tax'));
  ok('same books: the director\'s figure is the CT600 figure from the spine', ltdMB.body.includes(gbp(corpTax)));
  ok('same books: the sole-trader tax line is GONE from the director\'s brief', !ltdMB.body.includes(`${gbp(soleTax)} of tax`));
  ok('same books: the corrected briefs carry no forbidden dashes', ![partMB, ltdMB].some((b) => /[–—−]/.test(b.title + b.body + b.waText)));

  // THE INVOICE CHASER. An £850 invoice is an £850 invoice: the share scales tax, never the money a
  // customer actually owes the business.
  const chase = find(partner, 'invoice_chase');
  ok('same books: the partner\'s invoice chase keeps the full £850', chase && chase.numbers.total === 850);
}

// 4. THE LANDLORD SET IS GATED FOR A COMPANY. These facts fire s24_exposure and the April 2027
//    preview for a sole trader; both read projected profit plus salary as the landlord's personal
//    income, which for a director is the company's profit. Until they are rebuilt on the whole-person
//    engine, the company must get NEITHER, because a wrong Section 24 figure is worse than none.
{
  const today = new Date('2026-12-15T00:00:00Z');
  const months = monthsFor(today, 9, { incomePerMonth: 7000, expensesPerMonth: 1000 });
  const property = { rents: 24300, expenses: 3000, finance: 6000, rents12: 24300 };
  const sole = computeSignalsForStructure({ ...input(today, months, { property }), businessType: 'sole_trader' });
  const ltd = computeSignalsForStructure({ ...input(today, months, { property }), businessType: 'limited_company', employmentIncome: 12570 });
  ok('landlord: s24 exposure fires for the sole trader on these facts', !!find(sole, 's24_exposure'));
  ok('landlord: the 2027 preview fires for the sole trader on these facts', !!find(sole, 'property_rates_2027'));
  ok('landlord: s24 is gated for the company (it reads company profit as his income)', !find(ltd, 's24_exposure'));
  ok('landlord: the 2027 preview is gated for the company too', !find(ltd, 'property_rates_2027'));
}

// 5. CLASS 2, WHERE THE SHARE FLIPS THE SIGNAL ON. Late in the year the firm has £12,000 of profit:
//    over the £7,105 small profits threshold, so a sole trader's pension year is safe and the signal
//    rightly stays quiet. A HALF-SHARE partner's own profit is £6,000, UNDER the threshold: his State
//    Pension year genuinely is at risk while the firm's books look safe, and only the share-routed
//    engine can see it. This is the signal the old wrapper could never fire.
{
  const late = new Date('2027-01-20T00:00:00Z');
  const months = monthsFor(late, 10, { incomePerMonth: 1300, expensesPerMonth: 100 });
  const sole = computeSignalsForStructure({ ...input(late, months), businessType: 'sole_trader' });
  const partner = computeSignalsForStructure({ ...input(late, months), businessType: 'partnership', partnershipShare: 50 });
  ok('class 2: the sole trader is safe on £12,000 and gets no signal', !find(sole, 'class2_pension_year'));
  const c2 = find(partner, 'class2_pension_year');
  ok('class 2: the half-share partner\'s £6,000 fires the pension year rescue', !!c2);
  ok('class 2: the rescue quotes HIS profit, £6,000, not the firm\'s', c2 && c2.numbers.ytdProfit === 6000);
  ok('class 2: the £190 voluntary cost is unchanged (a constant, never rescaled)', c2 && c2.body.includes('£190'));
}

// 6. CIS FLOWS AT THE SHARE. CIS deducted from the partnership's payments is credited to partners by
//    share, exactly as the optimiser already scales it. £600 of deductions on tiny profits is a £600
//    refund for a sole trader (milestone £500); the half-share partner's £300 sits at milestone £250.
{
  const today = new Date('2026-08-20T00:00:00Z');
  const months = monthsFor(today, 5, { incomePerMonth: 1500, expensesPerMonth: 1200, cisPerMonth: 120 });
  const sole = find(computeSignalsForStructure({ ...input(today, months), businessType: 'sole_trader' }), 'cis_refund_milestone');
  const partner = find(computeSignalsForStructure({ ...input(today, months), businessType: 'partnership', partnershipShare: 50 }), 'cis_refund_milestone');
  ok('cis: the sole trader\'s refund passes the £500 milestone', sole && sole.periodKey.endsWith('#m500'));
  ok('cis: the half-share partner\'s refund sits at the £250 milestone', partner && partner.periodKey.endsWith('#m250'));
}

// 7. THE TRADING ALLOWANCE IS GATED FOR PARTNERSHIPS AT ANY SHARE. The £1,000 trading allowance
//    cannot be set against a partner's share of partnership income (GOV.UK, Tax-free allowances on
//    property and trading income), so the signal that says "the flat £1,000 beats your costs" would
//    promise a partner a saving the law does not give him. Gated even at a 100% share.
{
  const today = new Date('2026-12-15T00:00:00Z');
  const months = monthsFor(today, 8, { incomePerMonth: 3000, expensesPerMonth: 40 });
  const sole = computeSignalsForStructure({ ...input(today, months), businessType: 'sole_trader' });
  const partnerFull = computeSignalsForStructure({ ...input(today, months), businessType: 'partnership' });
  const partnerHalf = computeSignalsForStructure({ ...input(today, months), businessType: 'partnership', partnershipShare: 50 });
  ok('trading allowance: fires for the sole trader on these facts', !!find(sole, 'trading_allowance_saving'));
  ok('trading allowance: gated for a partnership at the default full share', !find(partnerFull, 'trading_allowance_saving'));
  ok('trading allowance: gated for a partnership at a half share', !find(partnerHalf, 'trading_allowance_saving'));
}

// 8. PARTNERSHIP AT A FULL SHARE: the engine minus only the structure gates. This block REPLACES the
//    old assertion that a partnership equals computeSignals unchanged. That old expectation ENCODED
//    THE DEFECT: on these facts the raw engine fires mtd_mandation on the whole firm's income, and a
//    partner's share of partnership profit is not MTD qualifying income, so "unchanged" was exactly
//    the wrong number reaching him. The right expectation: identical output minus the gated signals.
{
  const raw = computeSignals(baseInput);
  const gated = raw.filter((s) => !['trading_allowance_saving', 'mtd_mandation', 'mtd_combined_trap'].includes(s.signalKey));
  const pp = computeSignalsForStructure({ ...baseInput, businessType: 'partnership' });
  ok('partnership, full share: the engine minus the structure gates, nothing else changed', JSON.stringify(pp) === JSON.stringify(gated));
  ok('partnership, full share: the raw engine really was firing MTD here (the gate is doing work)', keys(raw).has('mtd_mandation') && !keys(pp).has('mtd_mandation'));
  // An invalid share is treated as the full share, mirroring getBusinessProfile's validation, so a
  // corrupt or half-answered setup can never silently shrink a partner's tax warnings.
  for (const bad of [0, 150, NaN]) {
    const b = computeSignalsForStructure({ ...baseInput, businessType: 'partnership', partnershipShare: bad });
    ok(`partnership: an invalid share (${bad}) falls back to the full share`, JSON.stringify(b) === JSON.stringify(pp));
  }
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

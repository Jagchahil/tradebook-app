// Tests for lib/quarterpack.ts, the quarter end pack: tax year quarter maths,
// the pack builder over confirmed transactions, and the print ready HTML.
// Run with: node test/quarterpack.test.mjs   (Node 22.6+, type stripping).
//
// quarterpack.ts imports the canonical engine with an extensionless specifier
// (the Next convention), which Node's type stripping cannot resolve directly, so
// we stage both files to a temp dir and rewrite the one relative import, the
// same approach as test/agent.test.mjs. taxengine.ts has no relative imports so
// it is copied verbatim.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'qpack-'));
const fix = (s) => s.replace("from './taxengine'", "from './taxengine.ts'");
writeFileSync(path.join(stage, 'taxengine.ts'), readFileSync(path.join(lib, 'taxengine.ts'), 'utf8'));
writeFileSync(path.join(stage, 'quarterpack.ts'), fix(readFileSync(path.join(lib, 'quarterpack.ts'), 'utf8')));
const Q = await import(pathToFileURL(path.join(stage, 'quarterpack.ts')).href);
const E = await import(pathToFileURL(path.join(stage, 'taxengine.ts')).href);

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};
const near = (a, b) => Math.abs(a - b) < 0.005;

console.log('\n=== quarterpack: tax year quarter bounds ===\n');
ok('tax year label 2026 -> 2026/27', Q.taxYearLabel(2026) === '2026/27');
ok('tax year label 2027 -> 2027/28', Q.taxYearLabel(2027) === '2027/28');

const q1 = Q.quarterBounds(2026, 1);
ok('Q1 starts 6 Apr 2026', q1.start === '2026-04-06');
ok('Q1 ends 5 Jul 2026', q1.end === '2026-07-05');
ok('Q1 label reads naturally', q1.label === 'Quarter 1, 6 April 2026 to 5 July 2026');
const q3 = Q.quarterBounds(2026, 3);
ok('Q3 crosses the year, 6 Oct 2026', q3.start === '2026-10-06');
ok('Q3 ends 5 Jan 2027', q3.end === '2027-01-05');
const q4 = Q.quarterBounds(2026, 4);
ok('Q4 starts 6 Jan 2027', q4.start === '2027-01-06');
ok('Q4 ends 5 Apr 2027', q4.end === '2027-04-05');

console.log('\n=== quarterpack: which quarter a date falls in ===\n');
const qf = (iso) => Q.quarterForDate(new Date(`${iso}T00:00:00Z`));
ok('6 Apr 2026 -> 2026/27 Q1', qf('2026-04-06').startYear === 2026 && qf('2026-04-06').index === 1);
ok('5 Jul 2026 -> Q1 (inclusive end)', qf('2026-07-05').index === 1);
ok('6 Jul 2026 -> Q2', qf('2026-07-06').index === 2);
ok('5 Jan 2027 -> Q3 (crosses calendar year)', qf('2027-01-05').startYear === 2026 && qf('2027-01-05').index === 3);
ok('6 Jan 2027 -> Q4', qf('2027-01-06').index === 4);
ok('5 Apr 2027 -> Q4 (last day of tax year)', qf('2027-04-05').startYear === 2026 && qf('2027-04-05').index === 4);
ok('1 Feb 2027 belongs to the 2026/27 tax year', qf('2027-02-01').startYear === 2026);

console.log('\n=== quarterpack: build over confirmed transactions ===\n');
// A quarter (Q1 2026/27) of trade activity, one property line, some CIS, plus a
// transaction OUTSIDE the quarter (earlier is impossible in Q1, so use a Q2 date)
// to prove the quarter window excludes it while YTD would include earlier ones.
const txns = [
  { amount: 1200, category: 'income', transaction_date: '2026-04-10' }, // trade income Q1
  { amount: 800, category: 'income', transaction_date: '2026-05-02', cis_deduction: 160 }, // trade income with CIS
  { amount: -240, category: 'materials', transaction_date: '2026-04-12' },
  { amount: -60, category: 'fuel', transaction_date: '2026-04-20' },
  { amount: -60, category: 'fuel', transaction_date: '2026-05-05' },
  { amount: 850, category: 'rent', transaction_date: '2026-06-01', income_type: 'property' }, // property income Q1
  { amount: -120, category: 'repairs', transaction_date: '2026-06-03', income_type: 'property' },
  { amount: 500, category: 'income', transaction_date: '2026-08-01' }, // Q2, must be excluded from Q1
  { amount: 99, category: 'income', transaction_date: 'not-a-date' }, // malformed, must be ignored
];

const pack = Q.buildQuarterPack({ transactions: txns, startYear: 2026, quarter: 1, businessName: 'Dave the Sparky', now: new Date('2026-07-10T09:00:00Z') });

ok('period is Q1 2026/27', pack.period.index === 1 && pack.taxYear === '2026/27');
ok('business name carried', pack.businessName === 'Dave the Sparky');
ok('quarter trade income = 2000', near(pack.trade.income, 2000));
ok('quarter trade expenses = 360 (240+60+60)', near(pack.trade.expenses, 360));
ok('quarter trade profit = 1640', near(pack.trade.net, 1640));
ok('quarter excludes the Q2 income (500 not counted)', !near(pack.trade.income, 2500));
ok('malformed-date row ignored', pack.txCount === 7);
ok('CIS suffered this quarter = 160', near(pack.cisSuffered, 160));

ok('property detected', pack.hasProperty === true);
ok('property income = 850', near(pack.property.income, 850));
ok('property expenses = 120', near(pack.property.expenses, 120));
ok('property net = 730', near(pack.property.net, 730));

// Expenses by category: fuel should aggregate the two lines (120) and sort with
// materials (240) first.
const cats = pack.trade.expensesByCategory;
ok('two trade expense categories', cats.length === 2);
ok('materials first at 240', cats[0].category === 'materials' && near(cats[0].amount, 240));
ok('fuel aggregated to 120', cats[1].category === 'fuel' && near(cats[1].amount, 120));

console.log('\n=== quarterpack: year to date and the tax estimate ===\n');
// YTD for Q1 equals the quarter (nothing earlier than 6 Apr exists). The trade
// net YTD is 1640; the estimate must match the canonical engine exactly.
const engineTax = E.soleTraderTax(1640);
ok('YTD trade net = 1640', near(pack.ytd.trade.net, 1640));
ok('estimated income tax matches engine', near(pack.ytd.estimatedTax.incomeTax, engineTax.incomeTax));
ok('estimated class 4 matches engine', near(pack.ytd.estimatedTax.class4, engineTax.class4));
ok('property profit shown as excluded from the trade estimate', near(pack.ytd.estimatedTax.propertyProfitExcluded, 730));
ok('gross qualifying income = trade gross + property gross = 2850', near(pack.ytd.grossQualifyingIncome, 2850));
ok('MTD does not apply at 2850 gross', pack.ytd.mtdApplies === false);

// A high earner crosses the MTD gross threshold.
const big = Q.buildQuarterPack({
  transactions: [{ amount: 60000, category: 'income', transaction_date: '2026-04-10' }],
  startYear: 2026, quarter: 1,
});
ok('MTD applies at 60000 gross', big.ytd.mtdApplies === true);
ok('default business name when none given', big.businessName === 'Your business');

console.log('\n=== quarterpack: HTML document ===\n');
const html = Q.renderQuarterPackHtml(pack);
ok('is a full HTML document', html.startsWith('<!doctype html>'));
ok('shows the business name', html.includes('Dave the Sparky'));
ok('shows the period label', html.includes('Quarter 1, 6 April 2026 to 5 July 2026'));
ok('shows trade profit figure', html.includes('£1,640.00'));
ok('shows CIS suffered', html.includes('£160.00'));
ok('has a print button, hidden in print', html.includes('window.print()') && html.includes('no-print'));
ok('states it is not a submission to HMRC', /not a submission to HMRC/i.test(html));
ok('marked noindex', html.includes('name="robots" content="noindex"'));

// HTML escaping of the business name (no injection through the document title/body).
const evil = Q.renderQuarterPackHtml(Q.buildQuarterPack({ transactions: [], startYear: 2026, quarter: 1, businessName: '<script>x</script>' }));
ok('business name is HTML escaped', evil.includes('&lt;script&gt;') && !evil.includes('<script>x</script>'));

console.log('\n=== quarterpack: writing rule (no em or en dashes) ===\n');
ok('rendered HTML has no em dash', !html.includes('—'));
ok('rendered HTML has no en dash', !html.includes('–'));
ok('rendered HTML has no U+2212 minus', !html.includes('−'));

console.log('\n=== quarterpack: MTD threshold is year-correct (scale audit M1) ===\n');
// A 2027/28 pack with gross of 35k: over the 30k April-2027 threshold but under
// the old hard-coded 50k. The fix must mark MTD as applying.
const p2027 = Q.buildQuarterPack({
  transactions: [{ amount: 35000, category: 'income', transaction_date: '2027-05-01' }],
  startYear: 2027, quarter: 1,
});
ok('2027 threshold is 30000, not 50000', p2027.ytd.mtdThreshold === 30000);
ok('35k gross clears the 2027 MTD threshold', p2027.ytd.mtdApplies === true);
const p2028 = Q.buildQuarterPack({ transactions: [{ amount: 25000, category: 'income', transaction_date: '2028-05-01' }], startYear: 2028, quarter: 1 });
ok('2028 threshold is 20000', p2028.ytd.mtdThreshold === 20000);
ok('25k gross clears the 2028 MTD threshold', p2028.ytd.mtdApplies === true);
ok('2026 threshold stays 50000', pack.ytd.mtdThreshold === 50000);
ok('2027 MTD line shows the correct threshold', Q.renderQuarterPackHtml(p2027).includes('£30,000'));

console.log('\n=== quarterpack: truncation warning (scale audit M2) ===\n');
ok('default pack is not truncated', pack.truncated === false);
ok('default pack shows no truncation warning', !html.includes('may be incomplete'));
const cut = Q.buildQuarterPack({ transactions: [{ amount: 100, category: 'income', transaction_date: '2026-05-01' }], startYear: 2026, quarter: 1, truncated: true });
ok('truncated flag carries through', cut.truncated === true);
ok('truncated pack renders a clear warning', Q.renderQuarterPackHtml(cut).includes('may be incomplete'));

console.log('\n=== quarterpack: MTD threshold reads live FACTS (override honesty) ===\n');
// The displayed MTD threshold must come from FACTS, not a hard-coded literal, so an
// approved override to the threshold moves the year-end document too. FACTS is mutable.
const savedMtd = E.FACTS.mtdThreshold2026;
E.FACTS.mtdThreshold2026 = 90000;
const pMoved = Q.buildQuarterPack({ transactions: [{ amount: 100, category: 'income', transaction_date: '2026-05-01' }], startYear: 2026, quarter: 1 });
ok('2026 MTD threshold follows an override to FACTS (90000)', pMoved.ytd.mtdThreshold === 90000);
ok('override MTD threshold renders in the document', Q.renderQuarterPackHtml(pMoved).includes('£90,000'));
E.FACTS.mtdThreshold2026 = savedMtd;
const pRestored = Q.buildQuarterPack({ transactions: [{ amount: 100, category: 'income', transaction_date: '2026-05-01' }], startYear: 2026, quarter: 1 });
ok('threshold returns to 50000 once the override is cleared', pRestored.ytd.mtdThreshold === 50000);

console.log('\n=== quarterpack: pre-filing final-check line ===\n');
const withCheck = Q.buildQuarterPack({ transactions: [{ amount: 5000, category: 'income', transaction_date: '2026-05-01' }], startYear: 2026, quarter: 1, finalCheck: 'SWEEP-RAN-2026' });
ok('finalCheck carries onto the pack', withCheck.finalCheck === 'SWEEP-RAN-2026');
const checkHtml = Q.renderQuarterPackHtml(withCheck);
ok('document shows the final-check heading', checkHtml.includes('Final check before you file'));
ok('document shows the assurance text', checkHtml.includes('SWEEP-RAN-2026'));
const noCheck = Q.buildQuarterPack({ transactions: [{ amount: 5000, category: 'income', transaction_date: '2026-05-01' }], startYear: 2026, quarter: 1 });
ok('no final-check block when none supplied', !Q.renderQuarterPackHtml(noCheck).includes('Final check before you file'));

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

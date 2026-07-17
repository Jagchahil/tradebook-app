// THE WHOLE-PERSON INCOME TAX ENGINE, PROVEN. Every expected figure below is hand-computed from the
// 2026/27 rules (personal allowance and its taper, the 20/40/45 bands, the savings starting rate and
// Personal Savings Allowance, the dividend allowance and the product's 10.75/35.75/39.35 dividend
// rates) and then checked against lib/personalincome.ts. If the engine and the worked example ever
// disagree, one of them is wrong, and this says which.
//
// Staged like brainmap/universe: the lib uses extensionless relative imports, Node's type-stripping
// loader needs the .ts, so we copy the dependency tree into a temp dir and rewrite the imports.

import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const stage = mkdtempSync(path.join(tmpdir(), 'personalincome-'));
const rewrite = (src) => src.replace(/from '\.\/([a-zA-Z0-9_]+)'/g, "from './$1.ts'");
for (const f of ['taxengine', 'nistudentloan', 'ltdengine', 'personalincome']) {
  writeFileSync(path.join(stage, f + '.ts'), rewrite(readFileSync(path.join(root, 'lib', f + '.ts'), 'utf8')));
}
const { combinedIncomeTax } = await import(pathToFileURL(path.join(stage, 'personalincome.ts')).href);

let pass = 0, fail = 0;
const approx = (a, b) => Math.abs(a - b) <= 0.01;
const t = (name, fn) => {
  try { fn(); pass++; } catch (e) { fail++; console.log(`  FAIL ${name}`); console.log('    ' + (e && e.message)); }
};

console.log('\npersonalincome: whole-person tax, every income kind stacked in the right order');

// T1, employment only. £30,000 wages: 20% on £17,430 = £3,486. No self-employment, so no Class 4.
t('employment only, basic rate', () => {
  const r = combinedIncomeTax({ employment: 30000 });
  assert.ok(approx(r.incomeTax.total, 3486), `income tax ${r.incomeTax.total}`);
  assert.ok(approx(r.class4NIC, 0), 'no NIC on employment');
  assert.ok(approx(r.totalTax, 3486), `total ${r.totalTax}`);
});

// T2, self-employment only. Must equal soleTraderTax(30000): £3,486 income tax + £1,045.80 Class 4.
t('self-employment only matches the sole-trader engine', () => {
  const r = combinedIncomeTax({ selfEmployment: 30000 });
  assert.ok(approx(r.incomeTax.total, 3486), `income tax ${r.incomeTax.total}`);
  assert.ok(approx(r.class4NIC, 1045.8), `class4 ${r.class4NIC}`);
  assert.ok(approx(r.totalTax, 4531.8), `total ${r.totalTax}`);
});

// T3, GOV.UK's own worked example. £16,000 wages + £200 interest: the £200 is covered by the
// starting rate for savings, so no tax on it. Income tax is 20% on £3,430 = £686.
t("GOV.UK example: £16k wages + £200 interest, savings tax-free", () => {
  const r = combinedIncomeTax({ employment: 16000, savings: 200 });
  assert.ok(approx(r.incomeTax.savings, 0), `savings tax ${r.incomeTax.savings}`);
  assert.ok(approx(r.allowancesUsed.startingRateForSavings, 200), 'starting rate covers it');
  assert.ok(approx(r.incomeTax.total, 686), `income tax ${r.incomeTax.total}`);
});

// T4, higher-rate savings. £60,000 wages + £2,000 interest: £500 PSA (higher rate), £1,500 at 40% =
// £600. Wages tax £11,432. Starting rate is nil because wages fill it.
t('higher-rate saver: £60k wages + £2k interest, £500 PSA then 40%', () => {
  const r = combinedIncomeTax({ employment: 60000, savings: 2000 });
  assert.ok(approx(r.allowancesUsed.personalSavingsAllowance, 500), 'PSA is £500 at higher rate');
  assert.ok(approx(r.allowancesUsed.startingRateForSavings, 0), 'no starting rate when wages fill it');
  assert.ok(approx(r.incomeTax.savings, 600), `savings tax ${r.incomeTax.savings}`);
  assert.ok(approx(r.incomeTax.total, 12032), `income tax ${r.incomeTax.total}`);
});

// T5, dividends in the higher band. £50,000 wages + £10,000 dividends: £500 allowance, £9,500 at the
// higher dividend rate 35.75% = £3,396.25. Wages tax £7,486 (all basic, £50k is under £50,270).
t('dividends stacked into higher rate: £50k wages + £10k dividends', () => {
  const r = combinedIncomeTax({ employment: 50000, dividends: 10000 });
  assert.ok(approx(r.allowancesUsed.dividendAllowance, 500), 'dividend allowance £500');
  assert.ok(approx(r.incomeTax.dividends, 3396.25), `dividend tax ${r.incomeTax.dividends}`);
  assert.ok(approx(r.incomeTax.total, 10882.25), `income tax ${r.incomeTax.total}`);
});

// T6, dividends in the basic band. £20,000 wages + £5,000 dividends: £500 allowance, £4,500 at the
// basic dividend rate 10.75% = £483.75. Wages tax 20% on £7,430 = £1,486.
t('dividends in the basic band: £20k wages + £5k dividends', () => {
  const r = combinedIncomeTax({ employment: 20000, dividends: 5000 });
  assert.ok(approx(r.incomeTax.dividends, 483.75), `dividend tax ${r.incomeTax.dividends}`);
  assert.ok(approx(r.incomeTax.total, 1969.75), `income tax ${r.incomeTax.total}`);
});

// T7, the full five-way stack. £40k employment + £15k self-employment + £1,500 interest + £3,000
// dividends. Non-savings £55k: £7,540 + £1,892 = £9,432. Savings: no starting rate, £500 PSA, £1,000
// at 40% = £400. Dividends: £500 allowance, £2,500 at 35.75% = £893.75. Class 4 on the £15k SE only.
t('the whole picture: employment + self-employment + savings + dividends', () => {
  const r = combinedIncomeTax({ employment: 40000, selfEmployment: 15000, savings: 1500, dividends: 3000 });
  assert.ok(approx(r.incomeTax.nonSavings, 9432), `non-savings ${r.incomeTax.nonSavings}`);
  assert.ok(approx(r.incomeTax.savings, 400), `savings ${r.incomeTax.savings}`);
  assert.ok(approx(r.incomeTax.dividends, 893.75), `dividends ${r.incomeTax.dividends}`);
  assert.ok(approx(r.incomeTax.total, 10725.75), `income tax ${r.incomeTax.total}`);
  assert.ok(approx(r.class4NIC, 145.8), `class4 ${r.class4NIC}`);
  assert.ok(approx(r.totalTax, 10871.55), `total ${r.totalTax}`);
});

// T8, the personal allowance taper. £110,000 wages + £5,000 dividends. PA tapered to £5,070. Wages
// tax £34,432. Dividends: £500 allowance, £4,500 at 35.75% = £1,608.75.
t('personal allowance taper: £110k wages + £5k dividends', () => {
  const r = combinedIncomeTax({ employment: 110000, dividends: 5000 });
  assert.ok(approx(r.personalAllowance, 5070), `PA ${r.personalAllowance}`);
  assert.ok(approx(r.incomeTax.nonSavings, 34432), `non-savings ${r.incomeTax.nonSavings}`);
  assert.ok(approx(r.incomeTax.dividends, 1608.75), `dividends ${r.incomeTax.dividends}`);
  assert.ok(approx(r.incomeTax.total, 36040.75), `income tax ${r.incomeTax.total}`);
});

// T9, additional rate. £150,000 self-employment. PA nil. £7,540 + £34,976 + £11,187 = £53,703 income
// tax. Class 4: £2,262 + £1,994.60 = £4,256.60.
t('additional rate: £150k self-employment profit', () => {
  const r = combinedIncomeTax({ selfEmployment: 150000 });
  assert.ok(approx(r.personalAllowance, 0), 'PA fully tapered');
  assert.ok(approx(r.incomeTax.total, 53703), `income tax ${r.incomeTax.total}`);
  assert.ok(approx(r.class4NIC, 4256.6), `class4 ${r.class4NIC}`);
  assert.ok(approx(r.totalTax, 57959.6), `total ${r.totalTax}`);
});

// T10, the starting rate for savings, partial. £14,000 wages + £3,000 interest. Only £1,430 of wages
// sits above the PA, so the starting rate band is £5,000 − £1,430 = £3,570, which covers all £3,000
// of interest. Savings tax nil. Wages tax 20% on £1,430 = £286.
t('starting rate for savings covers a low earner’s interest', () => {
  const r = combinedIncomeTax({ employment: 14000, savings: 3000 });
  assert.ok(approx(r.allowancesUsed.startingRateForSavings, 3000), 'all interest in the starting rate');
  assert.ok(approx(r.incomeTax.savings, 0), `savings tax ${r.incomeTax.savings}`);
  assert.ok(approx(r.incomeTax.total, 286), `income tax ${r.incomeTax.total}`);
});

// The nil-rate bands must OCCUPY band space, not be deducted. A crisp check: the dividend allowance on
// a higher earner sits in the higher band, so it cannot pull a taxed pound back down into basic.
t('nil-rate bands occupy band space (dividend allowance does not un-tax)', () => {
  const r = combinedIncomeTax({ employment: 60000, dividends: 1000 });
  // £500 allowance at 0%, £500 taxed at the higher dividend rate 35.75% = £178.75.
  assert.ok(approx(r.incomeTax.dividends, 178.75), `dividend tax ${r.incomeTax.dividends}`);
});

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ONE CAR, EVERY SURFACE, ONE TAXABLE FIGURE. (A1, 6 August 2026.)
//
// Until today a customer who bought a car read his tax two ways. The Overview (taxPosition) deducted
// the car's writing down allowance and showed a set aside of £2,686 on a taxable profit of £22,900.
// The tax summary (quarterpack) and the lender documents (incomeproof, bookshare) excluded the car
// from expenses but did NOT deduct the allowance, so they showed £25,000 of profit and £3,232 of
// tax. Three surfaces, one account, £546 apart, and the two that disagree with the Overview are the
// two a customer hands a lender and reads before January.
//
// THE FIX: the same allowance figure (lib/supabase.ts sumCapitalAllowances, the one getOptimiserInput
// already used) is now threaded into the quarter pack and the lender documents, and it comes off the
// taxable profit and the tax. The MTD SUBMISSION figure stays £25,000, correctly, because capital
// allowances are a year end adjustment and not part of a quarterly update.
//
// 🔴 EVERY ASSERTION RUNS AGAINST A NO CAR CONTROL. The same books with capitalAllowance 0 must be
// identical to the penny to what shipped before, so a man with no vehicle is untouched.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const lib = path.join(root, 'lib');
const fix = (s) => s.replace(/from '(\.\/[a-zA-Z0-9._-]+)'/g, "from '$1.ts'");
const stage = mkdtempSync(path.join(tmpdir(), 'lender-'));
for (const f of [
  'taxengine', 'money', 'capital', 'nistudentloan', 'ltdengine', 'personalincome',
  'propertyengine', 'autonomy', 'taxoptimiser', 'quarterpack', 'incomeproof', 'bookshare',
  // lib/scotland.ts, one exported sentence with no imports of its own, printed by both lender
  // documents staged above.
  'scotland',
]) {
  writeFileSync(path.join(stage, f + '.ts'), fix(readFileSync(path.join(lib, f + '.ts'), 'utf8')));
}
const O = await import(pathToFileURL(path.join(stage, 'taxoptimiser.ts')).href);
const QP = await import(pathToFileURL(path.join(stage, 'quarterpack.ts')).href);
const IP = await import(pathToFileURL(path.join(stage, 'incomeproof.ts')).href);
const BS = await import(pathToFileURL(path.join(stage, 'bookshare.ts')).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;

// The car business: income £33,000, ordinary costs £8,000, a £35,000 petrol car (special rate pool,
// 6% writing down allowance at 100% business use = £2,100 this year). Taxable profit £22,900.
const WDA = 2100;
const carTx = [
  { amount: 33000, transaction_date: '2026-06-01' },
  { amount: -8000, transaction_date: '2026-06-01' },
  { amount: -35000, transaction_date: '2026-06-01', writtenDown: true },
];

console.log('\nThe Overview, the tax summary and both lender documents read one taxable figure');

const tp = O.taxPosition({
  startYear: 2026, monthsElapsed: 12, daysElapsed: 365,
  ytdTradeIncome: 33000, ytdTradeExpenses: 8000, ytdCisSuffered: 0, employmentIncome: 0,
  categoriesLogged: ['materials'], homeOfficeClaimed: false, mileageClaimed: false,
  ytdCapitalAllowances: WDA, vehicleBoughtThroughBooks: true, businessType: 'sole_trader', incomeShape: 'trade',
});
ok('the Overview set aside is £2,686 (tax on the taxable £22,900)', near(tp.setAside, 2686));

const proof = IP.buildIncomeProof(carTx, 'Mechanic', 2026, new Date('2026-08-05'), null, WDA);
ok('proof of income shows taxable profit £22,900', proof.profit === 22900);
ok('proof of income tax matches the Overview at £2,686', near(proof.estimatedTax, 2686));
ok('proof of income still reports the £35,000 car apart', proof.capitalCost === 35000 && proof.capitalCount === 1);
ok('proof of income names the £2,100 allowance it deducted', near(proof.capitalAllowance, 2100));

const pack = QP.buildQuarterPack({ transactions: carTx.map((t) => ({ ...t })), startYear: 2026, quarter: 4, now: new Date('2027-04-30'), mtdStated: 'no', structure: 'sole_trader', capitalAllowance: WDA });
ok('the tax summary estimate matches the Overview at £2,686', near(pack.ytd.estimatedTax.total, 2686));
ok('🔴 but the MTD SUBMISSION figure stays £25,000, before capital allowances', pack.submission.trade.net === 25000);
ok('...and the mandation test is unmoved by the allowance', pack.ytd.grossQualifyingIncome === 33000);

const totals = BS.shareTotals(carTx.map((r) => ({ amount: r.amount, writtenDown: r.writtenDown === true })), WDA);
ok('share your books shows the same taxable profit £22,900', totals.profit === 22900);

console.log('\nThe no car control: capitalAllowance 0 is identical to what shipped before');
const proof0 = IP.buildIncomeProof(carTx, 'Mechanic', 2026, new Date('2026-08-05'), null, 0);
ok('proof of income with no allowance is the pre A1 figure, £25,000 profit', proof0.profit === 25000);
ok('...and its tax is the pre A1 £3,232', near(proof0.estimatedTax, 3231.8));
const pack0 = QP.buildQuarterPack({ transactions: carTx.map((t) => ({ ...t })), startYear: 2026, quarter: 4, now: new Date('2027-04-30'), mtdStated: 'no', structure: 'sole_trader' });
ok('the tax summary with no allowance is the pre A1 £3,232', near(pack0.ytd.estimatedTax.total, 3231.8));
const totals0 = BS.shareTotals(carTx.map((r) => ({ amount: r.amount, writtenDown: r.writtenDown === true })), 0);
ok('share your books with no allowance is the pre A1 £25,000', totals0.profit === 25000);

// A plain trader with no car: every figure identical whether or not the parameter exists.
const plain = [{ amount: 40000, transaction_date: '2026-06-01' }, { amount: -10000, transaction_date: '2026-06-01' }];
ok('a trader with no car is untouched: proof profit £30,000 either way',
  IP.buildIncomeProof(plain, 'Plumber', 2026, new Date('2026-08-05'), null, 0).profit === 30000
  && IP.buildIncomeProof(plain, 'Plumber', 2026, new Date('2026-08-05'), null).profit === 30000);

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

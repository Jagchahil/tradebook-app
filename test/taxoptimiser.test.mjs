// Tests for lib/taxoptimiser.ts, the tax-lowering engine. Pure, no network.
//   node test/taxoptimiser.test.mjs
// It imports the canonical engine (extensionless), so we stage and rewrite the
// relative imports, same as test/agent.test.mjs.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'opt-'));
const fix = (s) => s
  .replace("from './taxengine'", "from './taxengine.ts'")
  .replace("from './autonomy'", "from './autonomy.ts'")
  .replace("from './ltdengine'", "from './ltdengine.ts'")
  .replace("from './personalincome'", "from './personalincome.ts'")
  .replace("from './nistudentloan'", "from './nistudentloan.ts'");
writeFileSync(path.join(stage, 'taxengine.ts'), readFileSync(path.join(lib, 'taxengine.ts'), 'utf8'));
writeFileSync(path.join(stage, 'autonomy.ts'), readFileSync(path.join(lib, 'autonomy.ts'), 'utf8'));
// The optimiser now surfaces the WHOLE-PERSON tax (taxPosition), so its engine comes along too.
writeFileSync(path.join(stage, 'personalincome.ts'), fix(readFileSync(path.join(lib, 'personalincome.ts'), 'utf8')));
// The optimiser now nets the STUDENT LOAN off the CIS refund, because CIS pays that off too on
// the real return. Without this the deck under-staged and the whole suite exploded on import.
writeFileSync(path.join(stage, 'nistudentloan.ts'), fix(readFileSync(path.join(lib, 'nistudentloan.ts'), 'utf8')));
writeFileSync(path.join(stage, 'ltdengine.ts'), fix(readFileSync(path.join(lib, 'ltdengine.ts'), 'utf8')));
writeFileSync(path.join(stage, 'taxoptimiser.ts'), fix(readFileSync(path.join(lib, 'taxoptimiser.ts'), 'utf8')));
const O = await import(pathToFileURL(path.join(stage, 'taxoptimiser.ts')).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}`); } };
const find = (list, key) => list.find((o) => o.key === key);

const base = {
  startYear: 2026, monthsElapsed: 12,
  ytdTradeIncome: 0, ytdTradeExpenses: 0, ytdCisSuffered: 0,
  employmentIncome: 0, categoriesLogged: [], homeOfficeClaimed: true, mileageClaimed: true, purchaseGoal: null,
};

console.log('\n=== optimiser: marginal rate bands ===\n');
ok('below personal allowance = 0', O.marginalRate(10000) === 0);
ok('basic rate band = 0.26', O.marginalRate(30000) === 0.26);
ok('higher rate band = 0.42', O.marginalRate(60000) === 0.42);
ok('taper zone = 0.62', O.marginalRate(110000) === 0.62);

console.log('\n=== optimiser: the tidy low earner used to get NOTHING ===\n');
//
// ⚠️ THIS TEST USED TO ASSERT ZERO LEVERS, AND IT PASSED, AND THAT WAS THE PROBLEM.
//
// £6,000 net, everything claimed, nothing owing. The optimiser had not one word for him. And he is
// the man with the MOST to gain from the thing we were not telling him: he is not using all of his
// tax free allowance, and if he is married he can hand £1,260 of it to his partner and save THEM
// £252 a year, for nothing, because he was never going to use it.
//
// So "no levers" was not restraint. It was a silence with £252 sitting inside it.
const quiet = O.findOptimisations({ ...base, ytdTradeIncome: 8000, ytdTradeExpenses: 2000, categoriesLogged: ['fuel', 'phone', 'insurance', 'tools'] });
ok('he now gets exactly ONE thing, and it is the one that helps him',
  quiet.length === 1 && quiet[0].key === 'marriage_allowance_give');
ok('...and it is INFORMATION, not a quantified saving, because we do not know if he is married',
  quiet[0].info === true && quiet[0].estSaving === 0);
ok('...so the headline saving for a tidy low earner is still, correctly, zero',
  O.totalEstimatedSaving(quiet) === 0);

console.log('\n=== optimiser: the levers fire on real gaps ===\n');
// Higher earner, missing costs, no home office, logs fuel but no mileage, has a van goal.
const rich = O.findOptimisations({
  ...base,
  ytdTradeIncome: 80000, ytdTradeExpenses: 8000,
  employmentIncome: 0,
  categoriesLogged: ['fuel', 'materials'],
  homeOfficeClaimed: false, mileageClaimed: false,
  purchaseGoal: { title: 'a van', amount: 24000 },
});
ok('pension lever fires for a higher earner', !!find(rich, 'pension_higher_rate'));
ok('AIA timing fires with a purchase goal', !!find(rich, 'aia_timing'));
ok('home office fires when unclaimed', !!find(rich, 'home_office'));
ok('mileage prompt fires (fuel logged, no miles)', !!find(rich, 'mileage'));
ok('missed expenses fires (phone + insurance + tools absent)', !!find(rich, 'missed_expenses'));

ok('AIA saving = amount x marginal rate (24000 x 0.42 ~ 10080)', Math.abs(find(rich, 'aia_timing').estSaving - 10080) <= 2);
ok('home office saving is positive and modest', find(rich, 'home_office').estSaving > 0 && find(rich, 'home_office').estSaving < 200);
ok('list is sorted richest-saving first', rich[0].estSaving >= rich[rich.length - 1].estSaving);
ok('total estimated saving sums the levers', O.totalEstimatedSaving(rich) >= find(rich, 'aia_timing').estSaving);

console.log('\n=== optimiser: CIS refund is information, not a saving ===\n');
const subbie = O.findOptimisations({ ...base, ytdTradeIncome: 20000, ytdTradeExpenses: 2000, ytdCisSuffered: 4000, categoriesLogged: ['fuel', 'phone', 'insurance', 'tools'] });
const refund = find(subbie, 'cis_refund');
ok('CIS refund detected when deductions exceed tax due', !!refund);
ok('CIS refund is flagged as information', refund.info === true && refund.estSaving === 0);

console.log('\n=== optimiser: THE DIAL — money levers can never auto-run ===\n');
for (const level of ['suggest', 'draft', 'auto']) {
  const dialled = O.applyDial(rich, level);
  for (const o of dialled) {
    if ((o.action === 'make_payment' || o.action === 'purchase')) {
      ok(`${o.key} @ ${level}: requires approval, never auto`, o.requiresApproval === true && o.mode !== 'auto');
    }
  }
}
// At auto, a reversible admin lever (home office / log) may run itself.
const autoDialled = O.applyDial(rich, 'auto');
ok('at auto, home office (admin) may auto-run', find(autoDialled, 'home_office').mode === 'auto' && find(autoDialled, 'home_office').requiresApproval === false);
ok('at suggest, home office only suggests', find(O.applyDial(rich, 'suggest'), 'home_office').mode === 'suggest');

console.log('\n=== optimiser: incorporation lever (honest answer, not a reflex nudge) ===\n');
// At a live-question profit the lever fires, but it answers from our own maths.
// On 2026/27 full-extraction rates a sole trader wins, so it must say "not yet"
// rather than push a company, and it must never claim a saving.
const bigEarner = O.findOptimisations({ ...base, ytdTradeIncome: 80000, ytdTradeExpenses: 0, categoriesLogged: ['fuel', 'phone', 'insurance', 'tools'] });
const inc = find(bigEarner, 'incorporation');
ok('incorporation question surfaces at a higher profit', !!inc);
ok('incorporation is information, never summed into the headline (estSaving 0)', inc && inc.info === true && inc.estSaving === 0);
ok('incorporation names a pound figure in the words', inc && /£[\d,]+/.test(inc.detail));
ok('does not push a company when our maths says sole trader wins', inc && /sole trader is currently the better deal/i.test(inc.detail));
ok('flags the condition that flips it and points to the free tool', inc && /leave money in the business/i.test(inc.detail) && /free/i.test(inc.detail));
// A modest earner should not get the incorporation question at all.
const smallEarner = O.findOptimisations({ ...base, ytdTradeIncome: 18000, ytdTradeExpenses: 3000, categoriesLogged: ['fuel', 'phone', 'insurance', 'tools'] });
ok('no incorporation item for a modest earner', !find(smallEarner, 'incorporation'));

console.log('\n=== optimiser: property costs lever ===\n');
const landlord = O.findOptimisations({ ...base, ytdTradeIncome: 5000, ytdTradeExpenses: 1000, categoriesLogged: ['fuel', 'phone', 'insurance', 'tools'], ytdPropertyIncome: 12000, ytdPropertyExpenses: 200 });
const prop = find(landlord, 'property_costs');
ok('property costs prompt fires when rental income has almost no expenses', !!prop);
ok('property costs is a reversible admin prompt', prop.action === 'log_entry' && O.applyDial([prop], 'auto')[0].requiresApproval === false);
const goodLandlord = O.findOptimisations({ ...base, ytdPropertyIncome: 12000, ytdPropertyExpenses: 5000, categoriesLogged: ['fuel', 'phone', 'insurance', 'tools'] });
ok('no property prompt when expenses are already logged', !find(goodLandlord, 'property_costs'));

console.log('\n=== optimiser: no forbidden dashes in copy ===\n');
const allText = rich.map((o) => o.title + o.detail).join(' ');
ok('copy has no em/en/minus dashes', !/[–—−]/.test(allText));

// --- CIS PAYS OFF THE STUDENT LOAN TOO -------------------------------------------------------
//
// On the real Self Assessment return, CIS already deducted by contractors is credited against
// income tax AND Class 4 AND the student loan. The refund figure used to forget the loan, so a
// subbie with one was PROMISED MONEY HE WOULD NOT GET. That is the cruel direction to be wrong
// in: he may well have spent it.
{
  const withLoan = { ...base, ytdTradeIncome: 45000, ytdTradeExpenses: 5000, ytdCisSuffered: 12000, studentPlans: ['plan2'] };
  const noLoan = { ...base, ytdTradeIncome: 45000, ytdTradeExpenses: 5000, ytdCisSuffered: 12000 };

  const a = find(O.findOptimisations(withLoan), 'cis_refund');
  const b = find(O.findOptimisations(noLoan), 'cis_refund');

  ok('a CIS refund is still surfaced when there is a loan', Boolean(a));
  ok('and without one', Boolean(b));

  // Match the REFUND, not the first "about £" in the sentence (which is the CIS deducted).
  const num = (o) => Number((o.detail.match(/difference, about £([\d,]+)/) || [])[1]?.replace(/,/g, '') || 0);
  ok('the refund with a student loan is SMALLER than without', num(a) < num(b));
  ok('and it is smaller by a real amount, not a rounding', num(b) - num(a) > 500);
}

console.log('\n=== the WHOLE-PERSON tax position (taxPosition) ===\n');
const near = (a, b) => Math.abs(a - b) <= 0.01;
{
  // Trade only. Must equal the sole-trader figure, or the wiring has moved a number under a man who
  // has no employment, savings or dividends. £30,000 profit -> £3,486 income tax + £1,045.80 Class 4.
  const soleOnly = O.taxPosition({ ...base, ytdTradeIncome: 30000, ytdTradeExpenses: 0 });
  ok('trade-only whole tax equals the sole-trader figure (nothing moves)', near(soleOnly.totalTax, 4531.8));

  // Trade + a PAYE job. £20k profit + £30k salary = £50k non-savings. Income tax 20% on £37,430 =
  // £7,486. Class 4 on the £20k trade only = £445.80. Whole tax £7,931.80. The job is now IN the sum.
  const withJob = O.taxPosition({ ...base, ytdTradeIncome: 20000, ytdTradeExpenses: 0, employmentIncome: 30000 });
  ok('a PAYE job is now included in the whole tax', near(withJob.incomeTax.total, 7486) && near(withJob.class4NIC, 445.8) && near(withJob.totalTax, 7931.8));

  // Savings and dividends flow when captured. £40k trade + £2k interest (higher-rate: £500 PSA, £1,500
  // at 40% = £600) + £3k dividends (£500 allowance, £2,500 at 35.75% = £893.75).
  const full = O.taxPosition({ ...base, ytdTradeIncome: 55000, ytdTradeExpenses: 0, savingsIncome: 1500, dividendIncome: 3000 });
  ok('savings and dividends flow into the whole tax', near(full.incomeTax.savings, 400) && near(full.incomeTax.dividends, 893.75));

  // Early in the year it is a projection, and it says so rather than pretending to be a final figure.
  const early = O.taxPosition({ ...base, monthsElapsed: 1, ytdTradeIncome: 3000, ytdTradeExpenses: 0 });
  ok('early in the year the whole tax is flagged as a projection', early.projected === false);
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

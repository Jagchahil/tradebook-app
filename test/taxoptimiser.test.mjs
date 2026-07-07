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
const fix = (s) => s.replace("from './taxengine'", "from './taxengine.ts'").replace("from './autonomy'", "from './autonomy.ts'");
writeFileSync(path.join(stage, 'taxengine.ts'), readFileSync(path.join(lib, 'taxengine.ts'), 'utf8'));
writeFileSync(path.join(stage, 'autonomy.ts'), readFileSync(path.join(lib, 'autonomy.ts'), 'utf8'));
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

console.log('\n=== optimiser: nothing to suggest for a tidy low earner ===\n');
const quiet = O.findOptimisations({ ...base, ytdTradeIncome: 8000, ytdTradeExpenses: 2000, categoriesLogged: ['fuel', 'phone', 'insurance', 'tools'] });
ok('no levers when everything is claimed and income is low', quiet.length === 0);

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

console.log('\n=== optimiser: no forbidden dashes in copy ===\n');
const allText = rich.map((o) => o.title + o.detail).join(' ');
ok('copy has no em/en/minus dashes', !/[–—−]/.test(allText));

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

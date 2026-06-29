// Tests the HMRC MTD foundation: the transaction-to-payload mapping and the
// hard approval gate. Runs on plain Node (TypeScript read directly). No network.
//   node test/hmrc/run-hmrc-test.mjs

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const H = await import(`${pathToFileURL(path.resolve(here, '../../lib/hmrc.ts')).href}`);

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

const txns = [
  { amount: 5000, category: 'income' },     // turnover
  { amount: 1200, category: 'income' },     // turnover
  { amount: -400, category: 'materials' },  // costOfGoods
  { amount: -150, category: 'tools' },      // costOfGoods
  { amount: -800, category: 'subcontractor' }, // paymentsToSubcontractors
  { amount: -300, category: 'fuel' },       // carVanTravelExpenses
  { amount: -120, category: 'phone' },      // adminCosts
  { amount: -200, category: 'accountancy' },// professionalFees
  { amount: -90, category: 'meals' },       // otherExpenses
];

console.log('\n=== HMRC MTD foundation tests ===\n');

const full = H.buildPeriodicUpdate(txns, '2026-04-06', '2026-07-05');
ok('turnover sums income', full.periodIncome.turnover === 6200);
ok('costOfGoods merges materials + tools (550)', full.periodExpenses.costOfGoods === 550);
ok('paymentsToSubcontractors (800)', full.periodExpenses.paymentsToSubcontractors === 800);
ok('carVanTravelExpenses (300)', full.periodExpenses.carVanTravelExpenses === 300);
ok('adminCosts from phone (120)', full.periodExpenses.adminCosts === 120);
ok('professionalFees from accountancy (200)', full.periodExpenses.professionalFees === 200);
ok('otherExpenses from meals (90)', full.periodExpenses.otherExpenses === 90);
ok('period dates carried through', full.periodDates.periodStartDate === '2026-04-06' && full.periodDates.periodEndDate === '2026-07-05');

const consolidated = H.buildPeriodicUpdate(txns, '2026-04-06', '2026-07-05', { consolidated: true });
const totalExpenses = 400 + 150 + 800 + 300 + 120 + 200 + 90; // 2060
ok('consolidated expenses total (2060)', consolidated.periodExpenses.consolidatedExpenses === totalExpenses);
ok('consolidated has no category breakdown', Object.keys(consolidated.periodExpenses).length === 1);

// The approval gate must refuse without approved === true.
let threw = false;
try {
  await H.submitQuarterlyUpdate({
    nino: 'AA000000A', businessId: 'X', taxYear: '2026-27', accessToken: 't',
    payload: full, approved: false, fraud: {},
  });
} catch (e) {
  threw = e instanceof H.ApprovalRequiredError;
}
ok('submit refuses without explicit approval', threw);

// With approval but no credentials, it must NOT throw and must report dormant.
let dormant = null;
try {
  dormant = await H.submitQuarterlyUpdate({
    nino: 'AA000000A', businessId: 'X', taxYear: '2026-27', accessToken: 't',
    payload: full, approved: true, fraud: {},
  });
} catch {
  dormant = { ok: false, status: -1, body: 'threw' };
}
ok('approved + no credentials = dormant, no send', dormant && dormant.body === 'hmrc_not_configured');

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

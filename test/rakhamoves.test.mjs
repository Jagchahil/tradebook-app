// Tests for lib/rakhamoves.ts — Rakha's structure-aware money-moves engine. It composes the canonical
// engines through lib/position.ts, so we stage the whole chain and rewrite the extensionless imports,
// the same pattern as test/position.test.mjs and test/partnership.test.mjs.
//   node test/rakhamoves.test.mjs

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'rakhamoves-'));
const fix = (s) => s.replace(/from '(\.\/[a-zA-Z0-9]+)'/g, "from '$1.ts'");
for (const f of ['taxengine', 'nistudentloan', 'ltdengine', 'personalincome', 'partnership', 'position', 'rakhamoves']) {
  writeFileSync(path.join(stage, f + '.ts'), fix(readFileSync(path.join(lib, f + '.ts'), 'utf8')));
}
const M = await import(pathToFileURL(path.join(stage, 'rakhamoves.ts')).href);
const { savingsMoves } = M;

let pass = 0, fail = 0;
function ok(desc, cond) {
  if (cond) { pass++; process.stdout.write(`  PASS  ${desc}\n`); }
  else { fail++; process.stdout.write(`  FAIL  ${desc}\n`); }
}
const near = new Date('2026-03-01T00:00:00Z'); // 35 days to 5 April: buy-before-April is active
const has = (ms, k) => ms.find((m) => m.key === k);

// 1. SOLE TRADER, £80k, planning a £20k van. Pension + van + the grounding summary, savings computed.
{
  const ms = savingsMoves(
    { type: 'sole_trader', profit: 80000, owners: [{ name: 'Sam' }] },
    { today: near, plannedPurchase: { title: 'a van', amount: 20000 }, equipmentSpendYtd: 0 },
  );
  ok('sole trader: grounding summary always present', !!has(ms, 'position_summary'));
  ok('sole trader: pension move fires above 40% (~£5,946 back)', !!has(ms, 'pension_relief') && has(ms, 'pension_relief').estSaving > 4000);
  ok('sole trader: van AIA saving at the personal marginal rate (~£8,400)', !!has(ms, 'buy_before_april') && has(ms, 'buy_before_april').estSaving > 7000);
  ok('van move links GOV.UK guidance (category-level, no named product)', has(ms, 'buy_before_april').links.some((l) => l.url.includes('gov.uk')));
  ok('every move carries youDecide (Rakha suggests, you decide)', ms.every((m) => m.youDecide === true));
}

// 2. LIMITED COMPANY, single owner. The van saves CORPORATION tax, not the owner's marginal, because
//    it is the company that buys it. The pension is on the owner's salary + dividends.
{
  const ms = savingsMoves(
    { type: 'limited_company', profit: 120000, owners: [{ name: 'Dee', salary: 12570, dividends: 80000 }] },
    { today: near, plannedPurchase: { title: 'a van', amount: 20000 }, equipmentSpendYtd: 0 },
  );
  ok('ltd: pension fires on the owner\'s salary + dividends income', !!has(ms, 'pension_relief') && has(ms, 'pension_relief').estSaving > 0);
  ok('ltd: the van saves corporation tax (company buys it)', !!has(ms, 'buy_before_april') && has(ms, 'buy_before_april').estSaving > 0);
  ok('ltd single owner: no co-owner move', has(ms, 'co_owner_allowances') === undefined);
}

// 3. LIMITED COMPANY, two owners: the two-sets-of-allowances move appears (stated as fact, not a scheme).
{
  const ms = savingsMoves(
    { type: 'limited_company', profit: 120000, owners: [{ name: 'A', salary: 12570, dividends: 40000 }, { name: 'B', salary: 12570, dividends: 40000 }] },
    { today: near },
  );
  ok('two owners: the each-has-their-own-allowances move appears', !!has(ms, 'co_owner_allowances'));
}

// 4. OVERDRAWN dividends: the s455 / director's-loan warning appears and RANKS FIRST, above any saving.
{
  const ms = savingsMoves(
    { type: 'limited_company', profit: 30000, owners: [{ name: 'C', salary: 8000, dividends: 50000 }] },
    { today: near },
  );
  ok('overdrawing dividends is flagged and ranked first', ms[0].key === 'overdrawn_dividends');
}

// 5. MARRIAGE ALLOWANCE: a basic-rate owner whose spouse has spare allowance. £252, not an estimate.
{
  const ms = savingsMoves(
    { type: 'sole_trader', profit: 40000, owners: [{ name: 'Sam' }] },
    { today: near, married: true, spouseHasSpareAllowance: true },
  );
  ok('marriage allowance is offered, worth £252', !!has(ms, 'marriage_allowance') && has(ms, 'marriage_allowance').estSaving === 252);
}

// 6. PARTNERSHIP: each partner is an owner with their own personal moves. A partner over 40% gets pension.
{
  const ms = savingsMoves(
    { type: 'partnership', profit: 160000, owners: [{ name: 'P1', partnerShare: 1 }, { name: 'P2', partnerShare: 1 }] },
    { today: near },
  );
  ok('partnership: grounding summary present', !!has(ms, 'position_summary'));
  ok('partnership: a partner over the 40% line gets a pension move', !!has(ms, 'pension_relief'));
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

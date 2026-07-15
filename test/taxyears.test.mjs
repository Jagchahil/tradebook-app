// 🔴 HISTORICAL YEARS. Every figure sourced from GOV.UK; every total here hand-computed from the
// published rates and checked against the engine.

import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { tmpdir } from 'node:os';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const stage = mkdtempSync(path.join(tmpdir(), 'taxyears-'));
for (const f of ['taxengine', 'taxyears']) {
  writeFileSync(
    path.join(stage, f + '.ts'),
    readFileSync(path.join(root, 'lib', f + '.ts'), 'utf8').replace("from './taxengine'", "from './taxengine.ts'"),
  );
}
const Y = await import(pathToFileURL(path.join(stage, 'taxyears.ts')).href);
const E = await import(pathToFileURL(path.join(stage, 'taxengine.ts')).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.log(`  FAIL ${name}`); } };
const near = (a, b) => Math.abs(a - b) < 0.01;

console.log('\ntaxyears: what a sole trader owed, year by year, from GOV.UK');

// ── THE FREEZE GUARD. Income tax is computed by the shared function, valid ONLY while frozen. ──
ok('🔴 income tax is frozen identical across the window, so the shared function is correct',
  Y.incomeTaxIsFrozenAcrossWindow() === true);

// ── £30,000 profit, every year. Income tax is £3,486 in all of them; only Class 4 moves. ──
// income tax = (30000 - 12570) * 20% = 17430 * 0.2 = 3486.
ok('2023/24 £30k: 9% Class 4 -> total £5,054.70',
  (() => { const r = Y.soleTraderTaxForYear(30000, '2023-24'); return r && near(r.incomeTax, 3486) && near(r.class4, 1568.70) && near(r.total, 5054.70); })());

ok('2024/25 £30k: 6% Class 4 -> total £4,531.80 (the cut)',
  (() => { const r = Y.soleTraderTaxForYear(30000, '2024-25'); return r && near(r.class4, 1045.80) && near(r.total, 4531.80); })());

ok('2025/26 £30k: still 6% -> £4,531.80',
  (() => { const r = Y.soleTraderTaxForYear(30000, '2025-26'); return r && near(r.total, 4531.80); })());

ok('2026/27 £30k: 6% -> £4,531.80',
  (() => { const r = Y.soleTraderTaxForYear(30000, '2026-27'); return r && near(r.total, 4531.80); })());

// ── A higher earner across the Upper Profits Limit, £60,000. ──
// income tax: basic 37700*0.2=7540, higher (47430-37700)=9730*0.4=3892 -> 11432.
// 2023/24 Class 4: 37700*0.09 + (60000-50270)*0.02 = 3393 + 194.60 = 3587.60 -> total 15019.60.
ok('2023/24 £60k: total £15,019.60 (9% to the upper limit, then 2%)',
  (() => { const r = Y.soleTraderTaxForYear(60000, '2023-24'); return r && near(r.incomeTax, 11432) && near(r.class4, 3587.60) && near(r.total, 15019.60); })());

// 2026/27 Class 4: 37700*0.06 + 9730*0.02 = 2262 + 194.60 = 2456.60 -> total 13888.60.
ok('2026/27 £60k: total £13,888.60',
  (() => { const r = Y.soleTraderTaxForYear(60000, '2026-27'); return r && near(r.total, 13888.60); })());

// ── 🔴 PARITY WITH THE LIVE ENGINE. The current year MUST match soleTraderTax() exactly, or the
//    year-keyed path has quietly forked from the number we actually charge people today. ──
ok('🔴 the current year equals the live soleTraderTax() to the penny, every profit',
  [0, 8000, 15000, 30000, 55000, 60000, 120000, 180000].every((p) => {
    const y = Y.soleTraderTaxForYear(p, '2026-27');
    const live = E.soleTraderTax(p);
    return y && near(y.total, live.total) && near(y.incomeTax, live.incomeTax) && near(y.class4, live.class4);
  }));

// ── 🔴 A YEAR WE DO NOT HOLD RETURNS null. We never invent an old-year bill. ──
ok('🔴 a year outside the window returns null, not a guess',
  Y.soleTraderTaxForYear(30000, '2019-20') === null && Y.soleTraderTaxForYear(30000, '2021-22') === null);

ok('the supported years are exactly the four amendment-window years',
  Y.SUPPORTED_TAX_YEARS.length === 4
  && ['2023-24', '2024-25', '2025-26', '2026-27'].every((y) => Y.SUPPORTED_TAX_YEARS.includes(y)));

ok('every held year cites a GOV.UK source',
  Y.SUPPORTED_TAX_YEARS.every((y) => /GOV\.UK/.test(Y.TAX_YEARS[y].source)));

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

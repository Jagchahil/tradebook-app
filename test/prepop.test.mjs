// 🔴 PRE-POPULATION. Parsing HMRC's real CIS response and turning it into "you're owed £X".
// The sample body is HMRC's own OpenAPI 200 example (CIS Deductions MTD v3.0).

import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { tmpdir } from 'node:os';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const stage = mkdtempSync(path.join(tmpdir(), 'prepop-'));
for (const f of ['taxengine', 'taxyears', 'prepop']) {
  writeFileSync(
    path.join(stage, f + '.ts'),
    readFileSync(path.join(root, 'lib', f + '.ts'), 'utf8')
      .replace("from './taxengine'", "from './taxengine.ts'")
      .replace("from './taxyears'", "from './taxyears.ts'"),
  );
}
const P = await import(pathToFileURL(path.join(stage, 'prepop.ts')).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.log(`  FAIL ${name}`); } };
const near = (a, b) => Math.abs(a - b) < 0.01;

console.log('\nprepop: HMRC\'s CIS figures, turned into a refund a subbie can see');

// HMRC's own OpenAPI 200 example.
const HMRC_SAMPLE = {
  totalDeductionAmount: 12345.56,
  totalCostOfMaterials: 234234.33,
  totalGrossAmountPaid: 2342424.56,
  cisDeductions: [{}, {}],
};

// ── Parsing HMRC's shape ──
ok('parses HMRC\'s CIS response into our shape', (() => {
  const c = P.parseCisDeductions(HMRC_SAMPLE);
  return c.found && near(c.totalDeducted, 12345.56) && near(c.totalGrossPaid, 2342424.56) && near(c.totalMaterials, 234234.33);
})());

ok('🔴 a missing field is 0, never invented, and never a crash',
  (() => { const c = P.parseCisDeductions({ totalDeductionAmount: 500 }); return c.found && near(c.totalDeducted, 500) && c.totalGrossPaid === 0; })());

ok('null/garbage body does not throw', (() => { const c = P.parseCisDeductions(null); return c.totalDeducted === 0; })());

// ── The refund maths, against the year-keyed engine ──
// 2023/24 £30k profit -> bill £5,054.70. £6,000 CIS deducted -> refund £945.30.
ok('🔴 2023/24: £6,000 CIS on a £5,054.70 bill -> refund £945.30',
  (() => { const p = P.cisPosition('2023-24', 30000, 6000); return p && p.position === 'refund' && near(p.bill, 5054.70) && near(p.amount, 945.30); })());

// 2026/27 £30k -> bill £4,531.80. £6,000 CIS -> refund £1,468.20 (bigger, because Class 4 was cut).
ok('2026/27: same CIS, bigger refund because the bill is lower',
  (() => { const p = P.cisPosition('2026-27', 30000, 6000); return p && p.position === 'refund' && near(p.amount, 1468.20); })());

ok('under-deducted CIS shows as still owing, not a refund',
  (() => { const p = P.cisPosition('2023-24', 30000, 2000); return p && p.position === 'owing' && near(p.amount, 3054.70); })());

ok('CIS exactly equal to the bill comes out square',
  (() => { const p = P.cisPosition('2023-24', 30000, 5054.70); return p && p.position === 'square'; })());

ok('🔴 a year we do not hold returns null, never a guessed refund',
  P.cisPosition('2019-20', 30000, 6000) === null);

// ── The draft the user actually sees ──
ok('a refund draft says the number and offers to get it ready for HIS approval',
  (() => { const d = P.buildCisDraft('2023-24', 30000, P.parseCisDeductions({ totalDeductionAmount: 6000 })); return d.computed && /owed back to you/.test(d.says) && /your approval/.test(d.says); })());

ok('🔴 no CIS on record is stated plainly, not shown as a £0 refund',
  (() => { const d = P.buildCisDraft('2023-24', 30000, P.NO_CIS); return !d.computed && /no CIS on record/.test(d.says); })());

ok('CIS in a year we cannot compute is honest about the gap, not silent',
  (() => { const d = P.buildCisDraft('2019-20', 30000, P.parseCisDeductions({ totalDeductionAmount: 6000 })); return !d.computed && /do not yet hold the tax rates/.test(d.says); })());

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

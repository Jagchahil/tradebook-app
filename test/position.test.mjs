// Tests for lib/position.ts — the structure-aware spine that returns the BUSINESS return and each
// OWNER's personal return for a sole trader, a limited company, or a partnership.
//   node test/position.test.mjs
// It composes the canonical engines (extensionless imports), so we stage the whole chain and rewrite
// the relative imports to add .ts, the same pattern as test/partnership.test.mjs and test/taxyears.test.mjs.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'position-'));

// Add .ts to every relative sibling import so node's type stripping can resolve the chain.
const fix = (s) => s.replace(/from '(\.\/[a-zA-Z0-9]+)'/g, "from '$1.ts'");
for (const f of ['taxengine', 'nistudentloan', 'ltdengine', 'personalincome', 'partnership', 'position']) {
  writeFileSync(path.join(stage, f + '.ts'), fix(readFileSync(path.join(lib, f + '.ts'), 'utf8')));
}

const POS = await import(pathToFileURL(path.join(stage, 'position.ts')).href);
const ENG = await import(pathToFileURL(path.join(stage, 'taxengine.ts')).href);
const PI = await import(pathToFileURL(path.join(stage, 'personalincome.ts')).href);
const { computePosition } = POS;

let pass = 0;
let fail = 0;
const near = (a, b, eps = 0.5) => Math.abs(a - b) <= eps;
function ok(desc, cond) {
  if (cond) { pass++; process.stdout.write(`  PASS  ${desc}\n`); }
  else { fail++; process.stdout.write(`  FAIL  ${desc}\n`); }
}

// 1. SOLE TRADER: one return, and its bill must equal the sole-trader engine to the penny.
{
  const p = computePosition({ type: 'sole_trader', profit: 40000, owners: [{ name: 'Sam' }] });
  ok('sole trader files no separate business return', p.business.filesSeparately === false && p.business.form === 'SA103');
  ok('sole trader bill equals soleTraderTax(40000)', near(p.combinedTax, ENG.soleTraderTax(40000).total));
  ok('sole trader business tax is zero (it is all personal)', p.businessTax === 0);
}

// 2. LIMITED COMPANY, single owner: the company files a CT600 and pays corporation tax; the owner is
//    then taxed personally on salary + dividends. Two returns, two tax figures.
{
  const p = computePosition({ type: 'limited_company', profit: 60000, owners: [{ name: 'Dee', salary: 12570, dividends: 40000 }] });
  ok('company files a CT600 separately', p.business.filesSeparately === true && p.business.form === 'CT600');
  ok('company pays corporation tax', p.business.corporationTax > 0);
  ok('owner pays personal tax on dividends', p.owners[0].personal.totalTax > 0);
  ok('combined = business + personal, no double count', near(p.combinedTax, p.businessTax + p.personalTax));
  ok('distributable is reported for the company', typeof p.business.distributable === 'number' && p.business.distributable > 0);
}

// 3. MULTI-OWNER is the whole point: splitting dividends across two owners uses two sets of allowances
//    and lower bands, so the SAME company profit carries LESS personal tax than one owner taking it all.
{
  const one = computePosition({ type: 'limited_company', profit: 120000, owners: [{ name: 'A', salary: 12570, dividends: 80000 }] });
  const two = computePosition({ type: 'limited_company', profit: 120000, owners: [{ name: 'A', salary: 12570, dividends: 40000 }, { name: 'B', salary: 12570, dividends: 40000 }] });
  ok('two owners produce two personal returns', two.owners.length === 2);
  ok('splitting dividends lowers total personal tax', two.personalTax < one.personalTax);
}

// 4. THE ILLEGAL DIVIDEND GUARD: drawing more than the company can distribute is flagged, not hidden.
{
  const p = computePosition({ type: 'limited_company', profit: 30000, owners: [{ name: 'C', salary: 8000, dividends: 50000 }] });
  ok('over-drawing dividends is flagged', !!p.overdrawn && p.overdrawn.drewTotal > p.overdrawn.available);
}

// 5. PARTNERSHIP: SA800, transparent, each partner taxed on their share. With no other income a
//    partner's personal bill equals the whole-person engine run on their share.
{
  const p = computePosition({ type: 'partnership', profit: 80000, owners: [{ name: 'P1' }, { name: 'P2' }] });
  ok('partnership files an SA800 and pays no tax itself', p.business.form === 'SA800' && p.businessTax === 0);
  ok('even split gives each partner £40,000', near(p.owners[0].fromBusiness.profitShare, 40000, 1));
  ok('partner personal bill equals the whole-person engine on the share',
    near(p.owners[0].personal.totalTax, PI.combinedIncomeTax({ selfEmployment: 40000 }).totalTax));
}

// 6. OTHER INCOME STACKS: a partner (or owner) with a PAYE job on the side pays more on the same share,
//    because it lands in higher bands. This is exactly what the sole-trader-only engine got wrong.
{
  const plain = computePosition({ type: 'partnership', profit: 80000, owners: [{ name: 'P1' }, { name: 'P2' }] });
  const withJob = computePosition({ type: 'partnership', profit: 80000, owners: [{ name: 'P1', other: { employment: 40000 } }, { name: 'P2' }] });
  ok('a partner with an outside job pays more on the same share', withJob.owners[0].personal.totalTax > plain.owners[0].personal.totalTax);
}

// 7. GUARDS: an unknown type falls back to sole trader; empty owners does not throw.
{
  const unknown = computePosition({ type: 'weird', profit: 20000, owners: [] });
  ok('unknown structure falls back to sole trader safely', unknown.type === 'sole_trader' && unknown.owners.length === 1);
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

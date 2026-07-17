// Partnership engine parity guard.
//
// lib/partnership.ts exists in both repos, identical but for one import line (web pulls soleTraderTax
// from ./taxengine, the app from ./tax). Both sit on the sole-trader engine, which tax-parity already
// pins to the penny. This test proves the allocation layer on top agrees too, so a partnership sees
// the same split and the same bill whichever surface a partner opens.
//
// It reaches into the sibling app repo (../tradebook-app), so run-all skips it when the app is not
// checked out and runs it in CI, where both repos are present.
//
//   node test/partnership-parity.test.mjs

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const webLib = path.resolve(here, '../lib');
const appLib = path.resolve(here, '../../tradebook-app/lib');

if (!existsSync(path.join(appLib, 'partnership.ts'))) {
  console.log('\n  (mobile repo not present, skipping partnership parity)\n');
  process.exit(0);
}

// Stage a partnership module next to its engine, rewriting the extensionless relative import so Node's
// type stripping can resolve it. `engineFile` is the engine each side imports soleTraderTax from.
async function loadPartnership(libDir, engineFile, engineImport) {
  const stage = mkdtempSync(path.join(tmpdir(), 'pp-'));
  writeFileSync(path.join(stage, engineFile), readFileSync(path.join(libDir, engineFile), 'utf8'));
  const src = readFileSync(path.join(libDir, 'partnership.ts'), 'utf8').replace(engineImport, engineImport.replace(/'$/, ".ts'"));
  writeFileSync(path.join(stage, 'partnership.ts'), src);
  return import(pathToFileURL(path.join(stage, 'partnership.ts')).href + `?t=${Date.now()}`);
}

const web = await loadPartnership(webLib, 'taxengine.ts', "from './taxengine'");
const app = await loadPartnership(appLib, 'tax.ts', "from './tax'");

let pass = 0;
let fail = 0;
function ok(desc, cond) {
  if (cond) {
    pass++;
    process.stdout.write(`  PASS  ${desc}\n`);
  } else {
    fail++;
    process.stdout.write(`  FAIL  ${desc}\n`);
  }
}

// A spread of real partnership shapes: equal splits, unequal ratios, salaries-then-ratio, losses,
// three and four partners, and a sweep of profits across every tax band.
const scenarios = [];
for (const profit of [0, 15000, 30000, 45000, 60000, 90000, 100000, 125140, 150000, 260000]) {
  scenarios.push({ profit, partners: [{ name: 'A' }, { name: 'B' }] });
  scenarios.push({ profit, partners: [{ name: 'A', share: 70 }, { name: 'B', share: 30 }] });
  scenarios.push({ profit, partners: [{ name: 'A', salary: 20000, share: 50 }, { name: 'B', share: 50 }] });
  scenarios.push({ profit, partners: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] });
  scenarios.push({ profit, partners: [{ name: 'A', salary: 15000 }, { name: 'B', salary: 5000 }, { name: 'C' }, { name: 'D' }] });
}

let mismatches = 0;
let compared = 0;
for (const s of scenarios) {
  const w = web.partnershipTax(s);
  const a = app.partnershipTax(s);
  compared++;
  if (w.partners.length !== a.partners.length || Math.abs(w.totalTax - a.totalTax) > 0.01 || Math.abs(w.allocated - a.allocated) > 0.01) {
    mismatches++;
    if (mismatches <= 5) console.log(`   mismatch @ profit ${s.profit}, ${s.partners.length} partners: web £${w.totalTax} vs app £${a.totalTax}`);
    continue;
  }
  for (let i = 0; i < w.partners.length; i++) {
    if (Math.abs(w.partners[i].profitShare - a.partners[i].profitShare) > 0.01 || Math.abs(w.partners[i].total - a.partners[i].total) > 0.01) {
      mismatches++;
      if (mismatches <= 5) console.log(`   partner mismatch @ profit ${s.profit}, partner ${w.partners[i].name}`);
      break;
    }
  }
}

ok(`web and app partnership engines agree across ${compared} scenarios (${mismatches} mismatches)`, mismatches === 0);

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

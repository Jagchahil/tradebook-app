// Tax engine parity guard.
//
// The sole-trader tax maths exists as two hand-maintained copies:
//   web (canonical):  tradebook-web/lib/taxengine.ts   soleTraderTax()
//   app:              tradebook-app/lib/tax.ts          soleTraderTax()
//
// They are separate builds, so a single shared import across the two projects is
// not clean. Instead, THIS test is the guarantee that they cannot silently
// diverge. It imports BOTH engines and asserts soleTraderTax(profit) agrees to
// the penny across a wide sweep of profits, with extra checks around every band
// and threshold. If a future Budget rate change is applied to one file and not
// the other, this test fails loudly.
//
// Run with:
//   node test/tax-parity.test.mjs
//
// Requires Node 22.6+ (reads TypeScript directly via type stripping), or falls
// back to a one-off esbuild transpile, exactly like test/exams/run-exams.mjs.

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const webPath = path.resolve(here, '../lib/taxengine.ts');
const appPath = path.resolve(here, '../../tradebook-app/lib/tax.ts');

// Load a .ts engine. Node 22.6+ strips types and imports directly. If that is
// not available, fall back to a one-off esbuild transpile. No permanent
// dependency is needed to run this.
async function loadEngine(tsPath, tag) {
  try {
    return await import(`${pathToFileURL(tsPath).href}?t=${Date.now()}`);
  } catch (err) {
    const out = path.join(process.env.TMPDIR || '/tmp', `taxengine.parity.${tag}.mjs`);
    const candidates = [
      path.resolve(here, '../node_modules/.bin/esbuild'),
      '/tmp/node_modules/.bin/esbuild',
    ];
    const esbuild = candidates.find((p) => existsSync(p));
    if (!esbuild) {
      console.error('\nCould not load a tax engine.');
      console.error('This runs directly on Node 22.6 or newer. On older Node, install esbuild once: npm i -D esbuild');
      console.error(`Original error: ${err.message}\n`);
      process.exit(2);
    }
    execSync(`"${esbuild}" "${tsPath}" --format=esm --outfile="${out}"`, { stdio: 'inherit' });
    return import(`file://${out}?t=${Date.now()}`);
  }
}

const web = await loadEngine(webPath, 'web');
const app = await loadEngine(appPath, 'app');

let pass = 0;
let fail = 0;
const mismatches = [];

// The profits to check. A wide sweep plus, critically, the exact thresholds and
// the pounds either side of every band boundary, since off-by-one errors and
// taper rounding live at the edges.
const SWEEP = [
  0, 1, 5000, 10000, 12000, 12570, 20000, 30000, 37700, 50000, 50270, 60000,
  90000, 100000, 100001, 125000, 125140, 150000, 200000, 250000, 500000, 1000000,
];

// Every meaningful boundary in the sole-trader calculation. We test the exact
// value, one pound below, and one pound above each.
const BOUNDARIES = [
  12570, // personal allowance / Class 4 lower limit
  50270, // Class 4 upper limit
  100000, // personal allowance taper floor
  125140, // additional-rate threshold / personal allowance fully lost
  50270, // higher-rate income starts (PA + basic band)
];

const points = new Set();
for (const p of SWEEP) points.add(p);
for (const b of BOUNDARIES) {
  points.add(Math.max(0, b - 1));
  points.add(b);
  points.add(b + 1);
}
// A dense scan through the whole realistic range to catch any drift the named
// points miss. Every £250 from 0 to 300k, then coarser to 1m.
for (let p = 0; p <= 300000; p += 250) points.add(p);
for (let p = 300000; p <= 1000000; p += 5000) points.add(p);

const sorted = [...points].sort((a, b) => a - b);

for (const profit of sorted) {
  const w = web.soleTraderTax(profit);
  const a = app.soleTraderTax(profit);
  // Compare the whole result, not just total: incomeTax and class4 must match
  // too, so a compensating error cannot hide.
  const same =
    w.total === a.total && w.incomeTax === a.incomeTax && w.class4 === a.class4;
  if (same) {
    pass += 1;
  } else {
    fail += 1;
    mismatches.push({ profit, web: w, app: a });
  }
}

console.log('\n=== tax parity: soleTraderTax(web) vs soleTraderTax(app) ===\n');
console.log(`  Checked ${sorted.length} profit points.`);

if (mismatches.length > 0) {
  console.log('\n  MISMATCHES (the two engines have diverged):\n');
  for (const m of mismatches.slice(0, 20)) {
    console.log(
      `  FAIL  profit=${m.profit}  web=${JSON.stringify(m.web)}  app=${JSON.stringify(m.app)}`
    );
  }
  if (mismatches.length > 20) {
    console.log(`  ...and ${mismatches.length - 20} more.`);
  }
}

console.log(`\n  ${pass} passed, ${fail} failed.\n`);

if (fail > 0) {
  console.error(
    'PARITY BROKEN. The app and web sole-trader tax engines disagree.\n' +
      'Fix: make tradebook-app/lib/tax.ts and tradebook-web/lib/taxengine.ts\n' +
      'produce identical soleTraderTax numbers again (usually a rate or\n' +
      'threshold was changed in one file but not the other), then re-run.\n'
  );
  process.exit(1);
}

console.log('PARITY OK. Both engines agree on every profit checked.\n');

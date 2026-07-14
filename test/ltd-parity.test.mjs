// Parity: the web ltd engine against the app's lib/tax.ts limited company
// maths, which the Pay yourself screen has used since the redesign.
// Run with: node test/ltd-parity.test.mjs   (Node 22.6+, type stripping)

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const weblib = path.resolve(here, '../lib');
const applib = path.resolve(here, '../../tradebook-app/lib');

const stage = mkdtempSync(path.join(tmpdir(), 'ltd-parity-'));
writeFileSync(path.join(stage, 'taxengine.ts'), readFileSync(path.join(weblib, 'taxengine.ts'), 'utf8'));

// 🔴 BOTH ENGINES NOW IMPORT THE LOWER EARNINGS LIMIT INSTEAD OF RETYPING IT.
//
// It was £6,708, a bare literal in an anonymous array in BOTH files, and it is the salary at which a
// director's year still counts toward his STATE PENSION. Two copies of a number that decides a man's
// pension, and this parity test could only ever have caught them DISAGREEING, never both being
// stale together. Now there is one home for it and the engines import it, which is why the staging
// below has to carry nistudentloan across for each side.
writeFileSync(
  path.join(stage, 'nistudentloan.ts'),
  readFileSync(path.join(weblib, 'nistudentloan.ts'), 'utf8')
    .replace("from './taxengine'", "from './taxengine.ts'"),
);
// The app's nistudentloan imports './tax', which in the staging dir is apptax.ts. Rewire it, or the
// two sides of the parity test import two different files with the same name and the whole thing
// quietly tests nothing.
writeFileSync(
  path.join(stage, 'appnistudentloan.ts'),
  readFileSync(path.join(applib, 'nistudentloan.ts'), 'utf8')
    .replace("from './tax'", "from './apptax.ts'"),
);

writeFileSync(
  path.join(stage, 'webltd.ts'),
  readFileSync(path.join(weblib, 'ltdengine.ts'), 'utf8')
    .replace("from './taxengine'", "from './taxengine.ts'")
    .replace("from './nistudentloan'", "from './nistudentloan.ts'"),
);
writeFileSync(
  path.join(stage, 'apptax.ts'),
  readFileSync(path.join(applib, 'tax.ts'), 'utf8')
    .replace("from './nistudentloan'", "from './appnistudentloan.ts'"),
);
const web = await import(pathToFileURL(path.join(stage, 'webltd.ts')).href);
const app = await import(pathToFileURL(path.join(stage, 'apptax.ts')).href);

let pass = 0;
let fail = 0;
const agree = (name, a, b) => {
  if (Math.abs(a - b) < 0.01) pass++;
  else {
    fail++;
    console.error(`DIVERGE ${name}: web ${a}, app ${b}`);
  }
};

for (const profit of [0, 8000, 20000, 35000, 50270, 60000, 80000, 100000, 140000, 250000]) {
  // ⚠️ AND NOT [12570, 6708, 5000] HERE EITHER. A parity test that hardcodes the very numbers it is
  // meant to be guarding will go on passing, in perfect agreement, on two engines that are both
  // wrong. Take the rungs from the engine.
  for (const salary of web.salaryRungs().map((r) => r.salary)) {
    const w = web.planLtd(profit, salary);
    const a = app.planLtd(profit, salary);
    const tag = `p${profit} s${salary}`;
    agree(`${tag} corpTax`, w.corpTax, a.corpTax);
    agree(`${tag} divTax`, w.divTax, a.divTax);
    agree(`${tag} employerNI`, w.employerNI, a.employerNI);
    agree(`${tag} takeHome`, w.takeHome, a.takeHome);
    agree(`${tag} totalTax`, w.totalTax, a.totalTax);
  }
  // The sole trader side agrees with the app engine too.
  agree(`p${profit} sole trader`, web.compare(profit).soleTrader.tax, app.soleTraderTax(profit).total);
}

console.log(`ltd-parity: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

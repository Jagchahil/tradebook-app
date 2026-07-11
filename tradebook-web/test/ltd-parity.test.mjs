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
writeFileSync(
  path.join(stage, 'webltd.ts'),
  readFileSync(path.join(weblib, 'ltdengine.ts'), 'utf8').replace("from './taxengine'", "from './taxengine.ts'"),
);
writeFileSync(path.join(stage, 'apptax.ts'), readFileSync(path.join(applib, 'tax.ts'), 'utf8'));
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
  for (const salary of [12570, 6708, 5000]) {
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

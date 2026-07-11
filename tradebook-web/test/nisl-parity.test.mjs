// NI and student loan engine parity guard.
//
// Like the sole trader tax engine, the NI and student loan maths exists as two
// hand maintained copies:
//   web (canonical):  tradebook-web/lib/nistudentloan.ts
//   app:              tradebook-app/lib/nistudentloan.ts
//
// This test imports BOTH and asserts class1NIC, niPosition and
// studentLoanRepayment agree to the penny across a sweep, with checks on every
// threshold. If a Budget change is applied to one file and not the other, this
// fails loudly. Run with: node test/nisl-parity.test.mjs

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

// Stage each module with its relative import given an explicit .ts extension,
// so pure Node type stripping can load it. No esbuild needed.
function stage(moduleDir, moduleFile, depFile, depSpec) {
  const dir = mkdtempSync(path.join(tmpdir(), 'nislp-'));
  writeFileSync(path.join(dir, depFile), readFileSync(path.resolve(moduleDir, depFile), 'utf8'));
  writeFileSync(
    path.join(dir, moduleFile),
    readFileSync(path.resolve(moduleDir, moduleFile), 'utf8').replace(
      `from '${depSpec}'`,
      `from '${depSpec}.ts'`
    )
  );
  return import(pathToFileURL(path.join(dir, moduleFile)).href);
}

const web = await stage(path.resolve(here, '../lib'), 'nistudentloan.ts', 'taxengine.ts', './taxengine');
const app = await stage(path.resolve(here, '../../tradebook-app/lib'), 'nistudentloan.ts', 'tax.ts', './tax');

let pass = 0;
let fail = 0;
function agree(name, a, b) {
  if (Math.abs(a - b) < 0.005) pass++;
  else {
    fail++;
    console.error(`FAIL ${name}: web ${a} app ${b}`);
  }
}

// Class 1 across a sweep plus the thresholds themselves.
const salaries = [0, 5000, 6500, 12569, 12570, 12571, 20000, 30000, 50269, 50270, 50271, 80000, 125140, 200000];
for (const s of salaries) agree(`class1 at ${s}`, web.class1NIC(s), app.class1NIC(s));

// The combined position across mixed salary and profit points.
const points = [0, 5000, 7104, 7105, 12570, 20000, 35000, 50270, 90000];
for (const s of points) {
  for (const p of points) {
    const w = web.niPosition(s, p);
    const a = app.niPosition(s, p);
    agree(`position total ${s}/${p}`, w.total, a.total);
    if (w.qualifiesViaProfits !== a.qualifiesViaProfits || w.voluntaryClass2Suggested !== a.voluntaryClass2Suggested) {
      fail++;
      console.error(`FAIL flags at ${s}/${p}`);
    } else {
      pass++;
    }
  }
}

// Student loans: every plan, thresholds and rates identical, repayment agrees.
for (const plan of ['plan1', 'plan2', 'plan4', 'plan5', 'postgrad']) {
  agree(`${plan} threshold`, web.STUDENT_PLANS[plan].threshold, app.STUDENT_PLANS[plan].threshold);
  agree(`${plan} rate`, web.STUDENT_PLANS[plan].rate, app.STUDENT_PLANS[plan].rate);
  for (const y of [0, 20000, 21000, 25000, 26900, 29385, 33795, 40000, 60000, 125000]) {
    agree(
      `${plan} repay at ${y}`,
      web.studentLoanRepayment(y, [plan]).annualTotal,
      app.studentLoanRepayment(y, [plan]).annualTotal,
    );
  }
}
// Stacked plan plus postgrad.
for (const y of [25000, 35000, 50000, 90000]) {
  agree(
    `stacked at ${y}`,
    web.studentLoanRepayment(y, ['plan2', 'postgrad']).annualTotal,
    app.studentLoanRepayment(y, ['plan2', 'postgrad']).annualTotal,
  );
}


// The Self Assessment share function agrees across salary and profit mixes.
for (const s of [0, 15000, 34000, 60000]) {
  for (const p of [0, 10000, 30000, 80000]) {
    agree(
      `SA share ${s}/${p}`,
      web.studentLoanForSA(p, s, ['plan2', 'postgrad']),
      app.studentLoanForSA(p, s, ['plan2', 'postgrad']),
    );
  }
}

console.log(`nisl-parity: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

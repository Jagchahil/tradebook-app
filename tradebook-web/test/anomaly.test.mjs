// Tests for lib/anomaly.ts, the error catcher. Pure, no network.
//   node test/anomaly.test.mjs
// anomaly.ts has no relative imports, so we stage a copy and import it as is.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'anom-'));
writeFileSync(path.join(stage, 'anomaly.ts'), readFileSync(path.join(lib, 'anomaly.ts'), 'utf8'));
const A = await import(pathToFileURL(path.join(stage, 'anomaly.ts')).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}`); } };
const find = (list, key) => list.filter((o) => o.key === key);
const TODAY = '2026-07-07';

console.log('\n=== anomaly: duplicate receipts ===\n');
const dup = A.findAnomalies([
  { amount: -42.6, category: 'materials', vendor: 'Screwfix', transaction_date: '2026-07-01' },
  { amount: -42.6, category: 'materials', vendor: 'Screwfix', transaction_date: '2026-07-03' },
], TODAY);
ok('same vendor + amount within 5 days flags a duplicate', find(dup, 'duplicate').length === 1);
ok('duplicate is high severity', find(dup, 'duplicate')[0].severity === 'high');

const noDupFar = A.findAnomalies([
  { amount: -42.6, category: 'materials', vendor: 'Screwfix', transaction_date: '2026-07-01' },
  { amount: -42.6, category: 'materials', vendor: 'Screwfix', transaction_date: '2026-07-20' },
], TODAY);
ok('same spend 19 days apart is not a duplicate', find(noDupFar, 'duplicate').length === 0);
const noDupDiff = A.findAnomalies([
  { amount: -42.6, category: 'materials', vendor: 'Screwfix', transaction_date: '2026-07-01' },
  { amount: -42.6, category: 'materials', vendor: 'Toolstation', transaction_date: '2026-07-02' },
], TODAY);
ok('different vendors are not a duplicate', find(noDupDiff, 'duplicate').length === 0);

console.log('\n=== anomaly: uncategorised ===\n');
const unc = A.findAnomalies([
  { amount: -80, category: '', vendor: 'Cash', transaction_date: '2026-06-10' },
  { amount: -30, category: 'other', vendor: null, transaction_date: '2026-06-11' },
], TODAY);
ok('uncategorised expense over £50 fires', find(unc, 'uncategorised').length === 1);
ok('uncategorised under £50 stays quiet', find(unc, 'uncategorised').every((a) => a.amount >= 50));

console.log('\n=== anomaly: outlier vs category norm ===\n');
const out = A.findAnomalies([
  { amount: -100, category: 'materials', vendor: 'A', transaction_date: '2026-05-01' },
  { amount: -110, category: 'materials', vendor: 'B', transaction_date: '2026-05-02' },
  { amount: -95, category: 'materials', vendor: 'C', transaction_date: '2026-05-03' },
  { amount: -120, category: 'materials', vendor: 'D', transaction_date: '2026-05-04' },
  { amount: -600, category: 'materials', vendor: 'E', transaction_date: '2026-05-20' },
], TODAY);
ok('a 6x-median entry flags as an outlier', find(out, 'outlier').length === 1);
ok('outlier names the big amount', find(out, 'outlier')[0].amount === 600);
const noOutSmallSample = A.findAnomalies([
  { amount: -100, category: 'materials', vendor: 'A', transaction_date: '2026-05-01' },
  { amount: -600, category: 'materials', vendor: 'E', transaction_date: '2026-05-20' },
], TODAY);
ok('too few in the category to call an outlier', find(noOutSmallSample, 'outlier').length === 0);

console.log('\n=== anomaly: future dated ===\n');
const fut = A.findAnomalies([
  { amount: -50, category: 'fuel', vendor: 'BP', transaction_date: '2026-09-01' },
], TODAY);
ok('a future dated entry fires', find(fut, 'future_dated').length === 1);
const notFut = A.findAnomalies([
  { amount: -50, category: 'fuel', vendor: 'BP', transaction_date: '2026-07-07' },
], TODAY);
ok('todays date is not future dated', find(notFut, 'future_dated').length === 0);

console.log('\n=== anomaly: big expense, no supplier ===\n');
const nov = A.findAnomalies([
  { amount: -600, category: 'materials', vendor: null, transaction_date: '2026-06-01' },
  { amount: -600, category: 'materials', vendor: '', transaction_date: '2026-06-02' },
  { amount: -100, category: 'materials', vendor: null, transaction_date: '2026-06-03' },
], TODAY);
ok('a £600 expense with no supplier fires', find(nov, 'no_vendor').length >= 1);
ok('a £100 no-supplier expense stays quiet', find(nov, 'no_vendor').every((a) => a.amount >= 500));

console.log('\n=== anomaly: clean books + ordering + copy ===\n');
const clean = A.findAnomalies([
  { amount: -42.6, category: 'materials', vendor: 'Screwfix', transaction_date: '2026-06-01' },
  { amount: 500, category: 'income', vendor: 'Dave', transaction_date: '2026-06-02' },
], TODAY);
ok('tidy books produce no anomalies', clean.length === 0);
ok('summary reads clean when empty', /clean/i.test(A.summariseAnomalies(clean)));
ok('summary counts when not empty', /\d/.test(A.summariseAnomalies(dup)));

const mixed = A.findAnomalies([
  { amount: -42.6, category: 'materials', vendor: 'Screwfix', transaction_date: '2026-07-01' },
  { amount: -42.6, category: 'materials', vendor: 'Screwfix', transaction_date: '2026-07-03' },
  { amount: -600, category: 'materials', vendor: null, transaction_date: '2026-06-01' },
], TODAY);
ok('high severity sorts before low', mixed[0].severity === 'high');
const allText = mixed.map((a) => a.title + a.detail).join(' ') + A.summariseAnomalies(mixed);
ok('copy has no em/en/minus dashes', !/[–—−]/.test(allText));

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

// Tests for lib/incomeproof.ts, the branded income summary. Pure, no network.
//   node test/incomeproof.test.mjs
// It imports the canonical taxengine, so we stage and rewrite the relative import.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'ip-'));
const fix = (s) => s.replace("from './taxengine'", "from './taxengine.ts'");
writeFileSync(path.join(stage, 'taxengine.ts'), readFileSync(path.join(lib, 'taxengine.ts'), 'utf8'));
writeFileSync(path.join(stage, 'incomeproof.ts'), fix(readFileSync(path.join(lib, 'incomeproof.ts'), 'utf8')));
const IP = await import(pathToFileURL(path.join(stage, 'incomeproof.ts')).href);
const TE = await import(pathToFileURL(path.join(stage, 'taxengine.ts')).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}`); } };

const now = new Date('2026-12-01T00:00:00Z');

console.log('\n=== incomeproof: the maths ===\n');
const txns = [
  { amount: 20000, transaction_date: '2026-05-10' },
  { amount: 8400, transaction_date: '2026-08-10' },
  { amount: -6000, transaction_date: '2026-06-01' },
  { amount: -3140, transaction_date: '2026-09-01' },
];
const p = IP.buildIncomeProof(txns, 'A. Sparky Ltd', 2026, now);
ok('income sums the positives', p.income === 28400);
ok('expenses sum the negatives as positive', p.expenses === 9140);
ok('profit is income minus expenses', p.profit === 19260);
ok('estimated tax matches the canonical engine', p.estimatedTax === TE.soleTraderTax(19260).total);
ok('estimated tax is positive on a real profit', p.estimatedTax > 0);
ok('tax year label is 2026-27', p.taxYear === '2026-27');
ok('period label spans the tax year', /6 April 2026/.test(p.periodLabel) && /5 April 2027/.test(p.periodLabel));
ok('business name carried through', p.businessName === 'A. Sparky Ltd');
ok('entry count is kept', p.txCount === 4);

console.log('\n=== incomeproof: empty and defaults ===\n');
const empty = IP.buildIncomeProof([], '', 2026, now);
ok('no entries means zero everything', empty.income === 0 && empty.expenses === 0 && empty.profit === 0 && empty.estimatedTax === 0);
ok('blank business name falls back', empty.businessName === 'Your business');
ok('label helper works standalone', IP.taxYearLabel(2027) === '2027-28');

console.log('\n=== incomeproof: the document ===\n');
const html = IP.renderIncomeProofHtml(p);
ok('is a full html document', /<!doctype html>/i.test(html) && /<\/html>/i.test(html));
ok('shows the business name', html.includes('A. Sparky Ltd'));
ok('shows the net profit figure', html.includes('£19,260.00'));
ok('has a Save as PDF control', /Save as PDF/.test(html) && /window\.print\(\)/.test(html));
ok('is honest: not an SA302 or a filed return', /SA302/.test(html) && /not a filed tax return|not an HMRC document/i.test(html));
ok('carries a prepared by Lekhio stamp', /Prepared by Lekhio/.test(html));
ok('is noindex', /noindex/.test(html));
ok('document has no em/en/minus dashes', !/[–—−]/.test(html));

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

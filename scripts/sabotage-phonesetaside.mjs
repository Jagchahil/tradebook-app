// Sabotage harness for the phone's set aside, the sixth surface. Runs from the WEB repo and edits
// the APP repo, because test/tax-parity.test.mjs is the only guard that can see both.
// Same discipline as the other three: every edit proved to apply and proved unique, restores
// verified byte for byte, baseline re-checked at the end.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const web = path.resolve(import.meta.dirname, '..');
const app = path.resolve(web, '../tradebook-app');
const P = (rel) => (rel.startsWith('app:') ? path.join(app, rel.slice(4)) : path.join(web, rel));
const TEST = 'test/tax-parity.test.mjs';

function run() {
  let out = '';
  try {
    out = execFileSync('node', [P(TEST)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) { out = String(e.stdout ?? ''); }
  const m = out.match(/(\d+) passed, (\d+) failed\./);
  return m ? { passed: Number(m[1]), failed: Number(m[2]) } : { passed: -1, failed: -1 };
}

const base = run();
console.log(`baseline: ${base.passed} passed, ${base.failed} failed`);
if (base.failed !== 0) { console.log('BASELINE NOT GREEN. STOP.'); process.exit(1); }

const CASES = [
  // The defect itself, replayed: the deduction disappears from the engine.
  ['app:lib/tax.ts', 'setAside: Math.max(0, Math.round(liability - cis)),', 'setAside: Math.max(0, Math.round(liability)),', 'the engine stops deducting CIS', true],
  ['app:lib/tax.ts', 'refundLikely: Math.max(0, Math.round(cis - liability)),', 'refundLikely: 0,', 'the refund half disappears', true],
  ['app:lib/tax.ts', "const cis = businessType === 'limited_company' ? 0 : Math.max(0, cisSuffered);", 'const cis = Math.max(0, cisSuffered);', "a director's CIS starts reducing his company's Corporation Tax", true],
  ['app:lib/tax.ts', 'setAside: Math.max(0, Math.round(liability - cis)),', 'setAside: Math.round(liability - cis),', 'a big refund becomes a negative bill', true],
  ['app:lib/tax.ts', 'Math.max(0, businessTaxOnProfit(businessType, profit)) + Math.max(0, extraTax)', 'Math.max(0, businessTaxOnProfit(businessType, profit))', 'the student loan stops joining the bill', true],
  // The original defect: the screen has the function available and does not call it.
  ['app:app/(tabs)/you.tsx', 'const pos = setAsideAfterCis(businessType, Math.max(0, realProfit), realCis);', 'const pos = { setAside: Math.round(businessTaxOnProfit(businessType, Math.max(0, realProfit))), cis: 0, refundLikely: 0, liability: 0 };', 'the home screen goes back to doing the sum itself', true],
  ['app:app/tax-summary.tsx', '  const setAside = setAsideAfterCis(', '  const setAside0 = setAsideAfterCis(', 'the quarter screen stops calling it', true],
  ['app:lib/tax.ts', 'export function setAsideAfterCis(', 'export function setAsideAfterCisX(', 'the reader disappears entirely', true],
  // No operation controls.
  ['app:lib/tax.ts', '// A human label, so a company owner reads "Corporation Tax", not just "tax".', '// A human label for a company owner.', 'CONTROL: unrelated comment edit', false],
  ['app:app/(tabs)/you.tsx', 'TAX SET ASIDE · 2026/27', 'TAX SET ASIDE 2026/27', 'CONTROL: unrelated label edit', false],
];

let good = 0; let bad = 0;
for (const [rel, from, to, label, expectRed] of CASES) {
  const file = P(rel);
  const original = readFileSync(file, 'utf8');
  const i = original.indexOf(from);
  if (i < 0) { console.log(`  NEEDLE MISSING  ${label}`); bad++; continue; }
  if (original.indexOf(from, i + 1) >= 0) { console.log(`  NEEDLE AMBIGUOUS  ${label}`); bad++; continue; }
  const broken = original.slice(0, i) + to + original.slice(i + from.length);
  if (broken === original) { console.log(`  EDIT WAS A NO OP  ${label}`); bad++; continue; }
  writeFileSync(file, broken);
  const r = run();
  writeFileSync(file, original);
  if (readFileSync(file, 'utf8') !== original) { console.log('RESTORE FAILED. STOP.'); process.exit(1); }
  const correct = (r.failed > 0) === expectRed;
  if (correct) good++; else bad++;
  console.log(`  ${correct ? 'ok  ' : 'FAIL'} ${label}  (${r.passed}p/${r.failed}f)`);
}

const after = run();
console.log(`\n${good} correct, ${bad} wrong. restored baseline: ${after.passed} passed, ${after.failed} failed`);
if (after.failed !== 0 || after.passed !== base.passed) { console.log('BASELINE DRIFTED. STOP.'); process.exit(1); }

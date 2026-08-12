// Sabotage harness for ciscapture section 8. Every edit must be PROVED to apply before the suite
// is run, because a needle that silently missed produces a green run that reads like a passing
// control. That failure mode cost an hour on 11 August. Restores are verified byte for byte.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const P = (rel) => path.join(root, rel);
const PAGE = 'app/app/tax/cis/page.tsx';
const SB = 'lib/supabase.ts';
const TEST = 'test/ciscapture.test.mjs';

function run() {
  let out = '';
  try {
    out = execFileSync('node', [P(TEST)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    out = String(e.stdout ?? '');
  }
  const m = out.match(/(\d+) passed, (\d+) failed\./);
  if (!m) return { passed: -1, failed: -1 };
  return { passed: Number(m[1]), failed: Number(m[2]) };
}

const base = run();
console.log(`baseline: ${base.passed} passed, ${base.failed} failed`);
if (base.failed !== 0) { console.log('BASELINE NOT GREEN. STOP.'); process.exit(1); }

// [file, from, to, label, expectRed]  expectRed false means a no operation control.
const CASES = [
  [PAGE, '{gbp0(shownCis)}', '{gbp0(l.refundDue)}', 'hero goes back to the live ledger figure', true],
  [PAGE, "{priorYear ? `in ${yearLabel}` : 'this year'}", "this year", 'heading asserts this year again', true],
  [PAGE, '{shownCis > 0 ? (', '{l.refundDue > 0 ? (', 'card drawn on the live total again', true],
  [PAGE, '{priorYear ? null : (', '{false ? null : (', 'refund projection printed over a finished year', true],
  [PAGE, "{priorYear ? `for ${yearLabel}` : 'this year'}", "this year", 'empty state asserts this year again', true],
  [PAGE, 'const priorYear = year !== liveYear;', 'const priorYear = year !== thisYear;', 'year decided against the wrong reference', true],
  [PAGE, '    : l.refundDue;', '    : 0;', 'live year stops coming from the ledger', true],
  [PAGE, '? await cisRecordedForYear(', '? await Promise.resolve(0).then(() => 0) || await cisRecordedForYear(', 'prior reader no longer the guarded branch', true],
  [SB, 'export async function cisRecordedForYear', 'export async function cisRecordedForYearX', 'the prior year reader disappears', true],
  [SB, "        + '&cis_deduction=gt.0'\n", '', 'reader stops filtering to recorded deductions', true],
  [SB, "        + '&confirmed=eq.true&is_personal=eq.false&amount=gt.0'\n        + '&cis_deduction=gt.0'", "        + '&cis_deduction=gt.0'", 'reader stops scoping to confirmed business income', true],
  [SB, `      { headers: headers() },
    );
    if (!res.ok) return 0;
    const rows = (await res.json().catch(() => null)) as Array<Record<string, unknown>> | null;
    if (!Array.isArray(rows)) return 0;`, `      { headers: headers() },
    );
    const rows = (await res.json().catch(() => null)) as Array<Record<string, unknown>> | null;
    if (!Array.isArray(rows)) return 0;`, 'a failed read stops being zero', true],
  // No operation controls. These change the file without touching anything section 8 asserts, so a
  // red here means an assertion is anchored on something it does not mean to hold still.
  [PAGE, 'Keep every deduction statement.', 'Keep every deduction statement please.', 'CONTROL: unrelated copy edit', false],
  [SB, '&select=cis_deduction&limit=20000', '&select=cis_deduction&limit=19999', 'CONTROL: unrelated limit change', false],
];

let good = 0; let bad = 0;
for (const [rel, from, to, label, expectRed] of CASES) {
  const original = readFileSync(P(rel), 'utf8');
  const i = original.indexOf(from);
  if (i < 0) { console.log(`  NEEDLE MISSING  ${label}`); bad++; continue; }
  if (original.indexOf(from, i + 1) >= 0) { console.log(`  NEEDLE AMBIGUOUS  ${label}`); bad++; continue; }
  const broken = original.slice(0, i) + to + original.slice(i + from.length);
  if (broken === original) { console.log(`  EDIT WAS A NO OP  ${label}`); bad++; continue; }
  writeFileSync(P(rel), broken);
  const r = run();
  writeFileSync(P(rel), original);
  if (readFileSync(P(rel), 'utf8') !== original) { console.log('RESTORE FAILED. STOP.'); process.exit(1); }
  const wentRed = r.failed > 0;
  const correct = wentRed === expectRed;
  if (correct) good++; else bad++;
  console.log(`  ${correct ? 'ok  ' : 'FAIL'} ${label}  (${r.passed}p/${r.failed}f)`);
}

const after = run();
console.log(`\n${good} correct, ${bad} wrong. restored baseline: ${after.passed} passed, ${after.failed} failed`);
if (after.failed !== 0 || after.passed !== base.passed) { console.log('BASELINE DRIFTED. STOP.'); process.exit(1); }

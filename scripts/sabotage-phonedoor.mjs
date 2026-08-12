// Sabotage harness for the phone door gating added 12 August. Same discipline as the other two:
// every edit proved to apply and proved unique, restores verified byte for byte, baseline rechecked.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const P = (rel) => path.join(root, rel);
const PAGE = 'app/app/you/data/page.tsx';
const SB = 'lib/supabase.ts';
const TEST = 'test/datadoor.test.mjs';

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
  [PAGE, '{phoneTail ? (', '{true ? (', 'the door is drawn for everybody again', true],
  [PAGE, 'const phoneTail = await phoneTailForUser(user.id).catch(() => null);', 'const phoneTail = true;', 'the gate stops being fed by the reader', true],
  [PAGE, 'The number on this account ends {phoneTail}. Unplugging takes it off, and nothing', 'Unplugging takes your number off, and nothing', 'the number stops being named', true],
  [SB, 'export async function phoneTailForUser(', 'export async function phoneTailForUserX(', 'the reader disappears', true],
  [SB, 'return digits.length >= 4 ? digits.slice(-4) : null;', 'return digits.length >= 4 ? digits : null;', 'the whole number is handed over instead of four digits', true],
  [SB, '    if (!res.ok) return null;\n    const rows = (await res.json().catch(() => null)) as Array<{ phone_number: string | null }> | null;', '    const rows = (await res.json().catch(() => null)) as Array<{ phone_number: string | null }> | null;', 'a failed read stops hiding the door', true],
  // The success line is moved back inside the gate, where it vanishes on the redirect that earns it.
  [PAGE, `          {one('done') === 'unplugged' ? <p style={S.armed}>Done. That number is free to connect anywhere now.</p> : null}\n`, '', 'the confirmation no longer survives the thing it confirms', true],
  // The page starts reaching for something it has no business having.
  [PAGE, "import { phoneTailForUser } from '../../../../lib/supabase';", "import { phoneTailForUser, deleteUserData } from '../../../../lib/supabase';", 'the page imports the destruction as well', true],
  // No operation controls.
  [PAGE, 'Rather ask a person? Email info@lekhio.app', 'Rather ask a real person? Email info@lekhio.app', 'CONTROL: unrelated copy edit', false],
  [SB, '&select=phone_number&limit=1`,\n      { headers: headers() },\n    );\n    if (!res.ok) return null;', '&select=phone_number&limit=2`,\n      { headers: headers() },\n    );\n    if (!res.ok) return null;', 'CONTROL: unrelated limit change in the reader', false],
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
  const correct = (r.failed > 0) === expectRed;
  if (correct) good++; else bad++;
  console.log(`  ${correct ? 'ok  ' : 'FAIL'} ${label}  (${r.passed}p/${r.failed}f)`);
}

const after = run();
console.log(`\n${good} correct, ${bad} wrong. restored baseline: ${after.passed} passed, ${after.failed} failed`);
if (after.failed !== 0 || after.passed !== base.passed) { console.log('BASELINE DRIFTED. STOP.'); process.exit(1); }

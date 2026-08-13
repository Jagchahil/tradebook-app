// SABOTAGE R2-F25. Net the interest back off the profit and make sure the suite notices.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// This one matters more than most, because the bug it guards was ALREADY FIXED ONCE, on a
// different surface, on 6 August 2026, and came back on this one. A guard that would not have
// caught the second occurrence is not a guard.
//
//   1. ANCHOR ON THE CALL, not the import.
//   2. KILL EVERY CALL SITE.
//   3. ANCHOR THE ASSIGNMENT, not the identifier.
//   4. NO-OP CONTROLS must stay GREEN.
//
//   node test/sabotage-f25.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sab-f25-'));
  for (const d of ['lib', 'test', 'app']) cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  return dir;
}

function runSuite(dir) {
  try {
    const out = execFileSync('node', [path.join(dir, 'test/f25update.test.mjs')], {
      cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { red: /[1-9]\d* failed\./.test(out), out };
  } catch (e) {
    return { red: true, out: String(e.stdout ?? '') + String(e.stderr ?? '') };
  }
}

const edit = (dir, rel, from, to) => {
  const p = path.join(dir, rel);
  const s = readFileSync(p, 'utf8');
  if (!s.includes(from)) throw new Error(`ANCHOR MISSING in ${rel}: ${from.slice(0, 70)}`);
  writeFileSync(p, s.split(from).join(to));
};

const SABOTAGES = [
  // ── The finding itself ───────────────────────────────────────────────────────────────────
  {
    name: 'the interest is netted off property profit again, exactly as on 13 August',
    apply: (d) => edit(d, 'lib/quarterpack.ts',
      `      if (wantProperty && t.financeCost === true) {
        financeCost += mag;
        financeCount += 1;
        continue;
      }`, ''),
  },
  {
    name: 'the finance branch stops using `continue`, so it is counted AND deducted',
    apply: (d) => edit(d, 'lib/quarterpack.ts',
      `        financeCost += mag;
        financeCount += 1;
        continue;`,
      `        financeCost += mag;
        financeCount += 1;`),
  },
  {
    name: 'net goes back to subtracting finance',
    apply: (d) => edit(d, 'lib/quarterpack.ts',
      'net: round2(income - expenses),',
      'net: round2(income - expenses - financeCost),'),
  },
  {
    name: 'the wantProperty gate is dropped, so a trade loan loses its deduction',
    apply: (d) => edit(d, 'lib/quarterpack.ts',
      'if (wantProperty && t.financeCost === true) {',
      'if (t.financeCost === true) {'),
  },
  {
    name: 'the flag is read loosely, so undefined stops meaning false',
    apply: (d) => edit(d, 'lib/quarterpack.ts',
      'if (wantProperty && t.financeCost === true) {',
      'if (wantProperty && t.financeCost !== false) {'),
  },
  {
    name: 'the count is not kept, so the figure cannot be explained',
    apply: (d) => edit(d, 'lib/quarterpack.ts',
      '    financeCost: round2(financeCost),\n    financeCount,',
      '    financeCost: round2(financeCost),\n    financeCount: 0,'),
  },
  // ── The reader that never learned. This is the actual 6 August lesson. ───────────────────
  {
    name: 'the pack reader forgets financeCost again, which is the 6 August bug returning',
    apply: (d) => edit(d, 'lib/supabase.ts',
      `      financeCost:
        String(r.income_type ?? '').toLowerCase() === 'property' &&
        isResidentialFinanceCost(r.category as string | null, r.vendor as string | null),
    }));
}`,
      `    }));
}`),
  },
  {
    name: 'the pack reader flags every stream, not just property',
    apply: (d) => edit(d, 'lib/supabase.ts',
      `      financeCost:
        String(r.income_type ?? '').toLowerCase() === 'property' &&
        isResidentialFinanceCost(r.category as string | null, r.vendor as string | null),`,
      `      financeCost: isResidentialFinanceCost(r.category as string | null, r.vendor as string | null),`),
  },
  {
    name: 'the reader restates the rule instead of asking the one owner',
    apply: (d) => edit(d, 'lib/supabase.ts',
      `      financeCost:
        String(r.income_type ?? '').toLowerCase() === 'property' &&
        isResidentialFinanceCost(r.category as string | null, r.vendor as string | null),`,
      `      financeCost: String(r.category ?? '').toLowerCase().includes('mortgage'),`),
  },
  // ── The predicate's one owner ────────────────────────────────────────────────────────────
  {
    name: 'the predicate stops recognising a mortgage',
    apply: (d) => edit(d, 'lib/propertyengine.ts',
      "return hay.includes('mortgage') || hay.includes('interest');",
      "return false;"),
  },
  {
    name: 'the predicate says everything is finance, which would delete real deductions',
    apply: (d) => edit(d, 'lib/propertyengine.ts',
      "return hay.includes('mortgage') || hay.includes('interest');",
      "return true;"),
  },
  // ── The doctrine lock: quarterpack must stay at two relative imports ─────────────────────
  {
    name: 'quarterpack takes a third relative import, breaking three staged suites',
    apply: (d) => edit(d, 'lib/quarterpack.ts',
      "import { SCOTLAND_LINE } from './scotland';",
      "import { SCOTLAND_LINE } from './scotland';\nimport { isResidentialFinanceCost } from './propertyengine';"),
  },
  // ── It must reach the customer. A cost held out and not shown is the capital bug again. ──
  {
    name: 'the summary page stops printing the interest, so it silently vanishes',
    apply: (d) => edit(d, 'app/app/tax/summary/page.tsx',
      '{sub.property.financeCost > 0 ? (', '{false ? ('),
  },
  {
    name: 'the summary page stops saying WHY it is not in the profit',
    apply: (d) => edit(d, 'app/app/tax/summary/page.tsx',
      'Since Section 24 the interest on', 'The interest on'),
  },
  {
    name: 'the summary page stops naming the relief, so he is told no and nothing else',
    apply: (d) => edit(d, 'app/app/tax/summary/page.tsx',
      'it comes back as a\n                    20% credit against your tax instead',
      'it is simply not deductible'),
  },
  {
    name: 'the printable pack drops the interest note',
    apply: (d) => edit(d, 'lib/quarterpack.ts',
      '${p.financeCost > 0 ? `<p style="margin:8px 0 0;font-size:13px;color:${MUTED}">Residential mortgage interest of ${gbp(p.financeCost)} was paid in this period and is deliberately NOT deducted above. Since Section 24 it is relieved as a basic rate tax credit rather than an expense, and an update reports it in its own field for that reason.</p>` : \'\'}',
      ''),
  },
];

// NO-OP CONTROLS. Must stay GREEN.
const CONTROLS = [
  {
    name: 'a comment is reworded in quarterpack',
    apply: (d) => edit(d, 'lib/quarterpack.ts',
      '// Split and total one set of rows into a stream summary.',
      '// Split and total one set of rows into a stream summary (comment touched).'),
  },
  {
    name: 'the accumulators are declared on separate lines',
    apply: (d) => edit(d, 'lib/quarterpack.ts',
      '  let financeCost = 0;\n  let financeCount = 0;',
      '  let financeCost = 0;\n\n  let financeCount = 0;'),
  },
  {
    name: 'whitespace is added in the summary page property block',
    apply: (d) => edit(d, 'app/app/tax/summary/page.tsx',
      '<h2 className="lek-h2">Property, reported separately</h2>',
      '<h2 className="lek-h2">Property, reported separately</h2>\n'),
  },
];

let caught = 0, missed = 0;
console.log('SABOTAGES (each must go RED)');
for (const s of SABOTAGES) {
  const dir = scratch();
  try { s.apply(dir); }
  catch (e) { missed += 1; console.log(`  MISSED ${s.name}  [${e.message}]`); rmSync(dir, { recursive: true, force: true }); continue; }
  const r = runSuite(dir);
  if (r.red) { caught += 1; console.log(`  ok  ${s.name}`); }
  else { missed += 1; console.log(`  MISSED ${s.name}`); }
  rmSync(dir, { recursive: true, force: true });
}

let controlsOk = 0, controlsBad = 0;
console.log('\nCONTROLS (each must stay GREEN)');
for (const c of CONTROLS) {
  const dir = scratch();
  try { c.apply(dir); }
  catch (e) { controlsBad += 1; console.log(`  BAD ${c.name}  [${e.message}]`); rmSync(dir, { recursive: true, force: true }); continue; }
  const r = runSuite(dir);
  if (r.red) { controlsBad += 1; console.log(`  BAD ${c.name} went red`); }
  else { controlsOk += 1; console.log(`  ok  ${c.name}`); }
  rmSync(dir, { recursive: true, force: true });
}

console.log('');
console.log(`${caught}/${SABOTAGES.length} sabotages caught, ${controlsOk}/${CONTROLS.length} controls green.`);
console.log(`${caught + controlsOk} of ${SABOTAGES.length + CONTROLS.length}.`);
if (missed > 0 || controlsBad > 0) process.exit(1);

// SABOTAGE THE FINANCE PREDICATE. B68, 20 August 2026.
//
//   node test/sabotage-b68vendorcategory.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ONE PREDICATE DECIDES WHETHER A POUND IS DEDUCTED AT HIS MARGINAL RATE OR RELIEVED AT 20%, AND
// IT CAN BE WRONG IN BOTH DIRECTIONS FOR OPPOSITE REASONS.
//
//   TOO EAGER. A payee name overrules a category he chose, so ordinary repairs are relieved at 20%
//   instead of deducted. £200 out of a higher rate landlord's pocket per £1,000, silently. That is
//   the defect this item fixed and it is sabotaged first.
//
//   TOO DEAF. The vendor half is removed, so a bank feed line reading HALIFAX BTL MORTGAGE DD is
//   deducted in full against his rent, which is the thing Section 24 stopped in 2020. That is the
//   expensive direction and it is what stops the fix being "just delete the vendor".
//
// Plus the generic itself: the predicate falls through on the word categoriseBankLine returns for a
// line it cannot place, and if those two ever stop being the same word the fall through is dead.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sab-b68-'));
  for (const d of ['lib', 'test', 'app']) {
    cpSync(path.join(root, d), path.join(dir, d), { recursive: true, dereference: false });
  }
  return dir;
}

const SUITES = ['test/b68vendorcategory.test.mjs', 'test/f25update.test.mjs', 'test/incomeproof.test.mjs'];

function runSuite(dir) {
  for (const rel of SUITES) {
    try {
      const out = execFileSync('node', [path.join(dir, rel)], {
        cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (/[1-9]\d* failed\.?/.test(out)) return true;
      if (!/\d+ passed, 0 failed\.?/.test(out)) return true;
    } catch { return true; }
  }
  return false;
}

function baseline() {
  const dir = scratch();
  const red = runSuite(dir);
  rmSync(dir, { recursive: true, force: true });
  if (red) {
    console.log('🔴 BROKEN HARNESS: an UNMODIFIED scratch tree is already RED.');
    console.log('   1. lib/, app/ and test/ are all copied by scratch(), and both suites read all three');
    console.log('   2. the tally line matches the regex in runSuite');
    console.log('   3. df -h on TMPDIR: a suite that dies of ENOSPC scores as caught');
    process.exit(1);
  }
  console.log('BASELINE: an unmodified scratch tree is GREEN, so a red below is the sabotage.\n');
}

const edit = (dir, rel, from, to) => {
  const p = path.join(dir, rel);
  const s = readFileSync(p, 'utf8');
  if (!s.includes(from)) throw new Error(`ANCHOR MISSING in ${rel}: ${from.slice(0, 70)}`);
  writeFileSync(p, s.split(from).join(to));
};


const PE = 'lib/propertyengine.ts';
const CAT = 'lib/categories.ts';
const YT = 'lib/yeartodate.ts';
const PL = 'lib/propertylanes.ts';
const TO = 'lib/taxoptimiser.ts';
const SUITE = 'test/b68vendorcategory.test.mjs';

const BODY = `  const names = (s: string): boolean => s.includes('mortgage') || s.includes('interest');
  const cat = String(category ?? '').trim().toLowerCase();
  // A category that was chosen is a fact about the row. The vendor is a guess about it.
  if (cat && cat !== 'other') return names(cat);
  return names(String(vendor ?? '').toLowerCase());`;

const SABOTAGES = [
  // ── TOO EAGER: THE DEFECT ITSELF. ─────────────────────────────────────────────────────────
  {
    name: '🔴 THE DEFECT RESTORED: category and vendor read as one string, so a payee called'
      + ' INTEREST FREE FINANCE turns his repairs into a 20% credit',
    apply: (d) => edit(d, PE, BODY, `  const hay = \`\${category ?? ''} \${vendor ?? ''}\`.toLowerCase();
  return hay.includes('mortgage') || hay.includes('interest');`),
  },
  {
    name: '🔴 the category guard goes, so every row falls through to the vendor again',
    apply: (d) => edit(d, PE, "  if (cat && cat !== 'other') return names(cat);", ''),
  },
  {
    name: '🔴 the vendor is consulted IN ADDITION rather than instead, which is the same fault wearing a fix',
    apply: (d) => edit(d, PE, "  if (cat && cat !== 'other') return names(cat);",
      "  if (cat && cat !== 'other') return names(cat) || names(String(vendor ?? '').toLowerCase());"),
  },
  // ── TOO DEAF: THE EXPENSIVE DIRECTION. ───────────────────────────────────────────────────
  {
    name: '🔴 THE EXPENSIVE DIRECTION: the vendor half is deleted, so a bank feed HALIFAX BTL'
      + ' MORTGAGE DD is deducted in full against his rent, which Section 24 stopped in 2020',
    apply: (d) => edit(d, PE, "  return names(String(vendor ?? '').toLowerCase());", '  return false;'),
  },
  {
    name: '🔴 the generic stops falling through, so only a row with NO category at all reads its vendor',
    apply: (d) => edit(d, PE, "  if (cat && cat !== 'other') return names(cat);", '  if (cat) return names(cat);'),
  },
  {
    name: '🔴 the category branch stops reading the category, so mortgage interest he chose himself'
      + ' is deducted in full',
    apply: (d) => edit(d, PE, "  if (cat && cat !== 'other') return names(cat);", "  if (cat && cat !== 'other') return false;"),
  },
  {
    name: '🔴 the predicate says yes to every property cost, so a letting agent fee earns a 20% credit',
    apply: (d) => edit(d, PE, "  if (cat && cat !== 'other') return names(cat);", "  if (cat && cat !== 'other') return true;"),
  },
  // ── THE GENERIC, WHICH IS THE HINGE. ─────────────────────────────────────────────────────
  {
    name: '🔴 THE FALL THROUGH WORD DRIFTS FROM THE CATEGORISER\'S OWN FALLBACK, so the bank feed'
      + ' door quietly shuts and nothing errors',
    apply: (d) => edit(d, PE, "cat !== 'other'", "cat !== 'unsorted'"),
  },
  {
    name: '🔴 the categoriser\'s fallback changes and the predicate is not told',
    apply: (d) => edit(d, CAT, "  for (const [re, cat] of CATEGORY_MAP) if (re.test(text)) return cat;\n  return 'other';",
      "  for (const [re, cat] of CATEGORY_MAP) if (re.test(text)) return cat;\n  return 'misc' as Category;"),
  },
  // ── THE LIST IT IS PINNED AGAINST. ───────────────────────────────────────────────────────
  {
    name: '🔴 PROPERTY_FINANCE_CATEGORIES gains the letting agent, so the list and the predicate'
      + ' disagree about Section 24 and the suite is the only thing that can see it',
    apply: (d) => edit(d, PL, "export const PROPERTY_FINANCE_CATEGORIES = ['mortgage interest'] as const;",
      "export const PROPERTY_FINANCE_CATEGORIES = ['mortgage interest', 'letting agent'] as const;"),
  },
  // ── THE CALLERS. ─────────────────────────────────────────────────────────────────────────
  {
    name: '🔴 lib/yeartodate.ts stops asking the predicate and matches the two words by hand, which'
      + ' is how one rule becomes two answers',
    apply: (d) => edit(d, YT, '        if (isResidentialFinanceCost(r.category, r.vendor)) ytdPropertyFinance += -amt;',
      "        if (`${r.category ?? ''} ${r.vendor ?? ''}`.toLowerCase().includes('mortgage')) ytdPropertyFinance += -amt;"),
  },
  {
    name: '🔴 the reducer stops being applied at all, so the £200 measurement is meaningless and'
      + ' every landlord pays the full rate on his interest',
    apply: (d) => edit(d, TO, '  const propFinanceYtd = Math.max(0, input.ytdPropertyFinance ?? 0);', '  const propFinanceYtd = 0;'),
  },
  // ── THE SUITE'S OWN DERIVATIONS. ─────────────────────────────────────────────────────────
  {
    name: '🔴 THE VACUITY PROBE IS NEUTERED: the suite\'s copy of the OLD predicate is quietly'
      + ' updated to the new one, so it can no longer show that anything changed',
    apply: (d) => edit(d, SUITE, `const OLD = (category, vendor) => {
  const hay = \`\${category ?? ''} \${vendor ?? ''}\`.toLowerCase();
  return hay.includes('mortgage') || hay.includes('interest');
};`, 'const OLD = (category, vendor) => P.isResidentialFinanceCost(category, vendor);'),
  },
  {
    name: '🔴 THE GENERIC IS HARDCODED IN THE SUITE and the categoriser is changed under it, so a'
      + ' derived test stops being derived',
    apply: (d) => {
      edit(d, SUITE, "const GENERIC = C.categoriseBankLine('qqzz unplaceable statement narrative 4471');",
        "const GENERIC = 'other';");
      edit(d, CAT, "  for (const [re, cat] of CATEGORY_MAP) if (re.test(text)) return cat;\n  return 'other';",
        "  for (const [re, cat] of CATEGORY_MAP) if (re.test(text)) return cat;\n  return 'misc' as Category;");
    },
  },
];

// NO OP CONTROLS. Each changes the files and changes NOTHING these guards are about.
const CONTROLS = [
  {
    name: 'CONTROL: THE INNER HELPER IS RENAMED, and no guard here is about an identifier',
    apply: (d) => {
      edit(d, PE, "  const names = (s: string): boolean =>", "  const saysFinance = (s: string): boolean =>");
      edit(d, PE, "  if (cat && cat !== 'other') return names(cat);", "  if (cat && cat !== 'other') return saysFinance(cat);");
      edit(d, PE, "  return names(String(vendor ?? '').toLowerCase());", "  return saysFinance(String(vendor ?? '').toLowerCase());");
    },
  },
  {
    name: 'CONTROL: the two words are REORDERED inside the helper, which changes the source and no behaviour',
    apply: (d) => edit(d, PE, "s.includes('mortgage') || s.includes('interest')", "s.includes('interest') || s.includes('mortgage')"),
  },
  {
    name: 'CONTROL: a COMMENT is reworded and it quotes includes(\'mortgage\') and the word other back, on purpose',
    apply: (d) => edit(d, PE, '// 🔴 B68. A VENDOR NAME COULD OVERRULE A CATEGORY HE CHOSE HIMSELF. 20 August 2026.',
      "// Reworded comment. It mentions includes('mortgage'), includes('interest') and the category"
      + " other, and none of it is code.\n// 🔴 B68. A VENDOR NAME COULD OVERRULE A CATEGORY HE CHOSE HIMSELF. 20 August 2026."),
  },
  {
    name: 'CONTROL: whitespace is added inside the predicate body',
    apply: (d) => edit(d, PE, "  const cat = String(category ?? '').trim().toLowerCase();", "\n  const cat = String(category ?? '').trim().toLowerCase();"),
  },
];

const only = process.env.SAB_ONLY ? Number(process.env.SAB_ONLY) : null;
const from = process.env.SAB_FROM ? Number(process.env.SAB_FROM) : 0;
const to = process.env.SAB_TO ? Number(process.env.SAB_TO) : SABOTAGES.length;
const sliced = from !== 0 || to !== SABOTAGES.length || only !== null;

baseline();

let caught = 0;
const holes = [];
const list = only !== null ? [SABOTAGES[only]] : SABOTAGES.slice(from, to);
for (const s of list) {
  const dir = scratch();
  let applied = true;
  try { s.apply(dir); } catch (e) { applied = false; console.log(`  🔴 MISSED ANCHOR  ${s.name}\n     ${e.message}`); }
  if (applied) {
    if (runSuite(dir)) { caught += 1; console.log(`  CAUGHT  ${s.name}`); }
    else { holes.push(s.name); console.log(`  🔴 HOLE    ${s.name}`); }
  }
  rmSync(dir, { recursive: true, force: true });
}

let controlsGreen = 0;
const badControls = [];
const runControls = !process.env.SAB_SKIP_CONTROLS;
if (runControls) {
  for (const c of CONTROLS) {
    const dir = scratch();
    try {
      c.apply(dir);
      if (runSuite(dir)) { badControls.push(c.name); console.log(`  🔴 CONTROL RED  ${c.name}`); }
      else { controlsGreen += 1; console.log(`  control green  ${c.name}`); }
    } catch (e) { badControls.push(`${c.name} (anchor: ${e.message})`); }
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log(`\n${caught}/${list.length} sabotages caught, ${controlsGreen}/${runControls ? CONTROLS.length : 0} controls green.`);
if (sliced) console.log('NOT THE WHOLE PASS: run with no SAB_FROM, SAB_TO or SAB_ONLY for the full figure.');
if (holes.length) { console.log('\nHOLES:'); for (const h of holes) console.log(`  ${h}`); }
if (badControls.length) { console.log('\nBAD CONTROLS:'); for (const b of badControls) console.log(`  ${b}`); }
process.exitCode = holes.length || badControls.length || caught !== list.length ? 1 : 0;

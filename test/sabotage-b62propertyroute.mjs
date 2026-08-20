// SABOTAGE THE PROPERTY STREAM ROUTING. B62, 20 August 2026.
//
//   node test/sabotage-b62propertyroute.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE SPECIMEN IS THE ROUTING DECISION ITSELF, AND IT HAS TWO FAILURE DIRECTIONS THAT ARE NOT THE
// SAME BUG. This pass exists because fixing one of them by hand produces the other.
//
//   TOO LITTLE. A property cost stays in the trade stream, which is the defect that shipped:
//   Norah's bill 5,600.00 too HIGH and a 22,000 trade loss reported on a woman with no trade.
//
//   TOO MUCH. Mortgage interest reaches the property stream but lands in EXPENSES rather than in
//   finance, so it is deducted in full instead of being relieved at 20% under Section 24. That is
//   2,800.00 too LOW, and too low is the direction that earns a customer a penalty.
//
// Both are sabotaged, from every file that can cause them: the route, the category rulebook, the
// finance predicate and the reader that splits them.
//
// ⚠️ AND FOUR NO OP CONTROLS, TWO OF WHICH ARE THE POINT. Reordering the branch and renaming the
// local both change the source and neither changes a penny. test/landlord.test.mjs used to pin
// this decision character by character, which is precisely why it was green for the whole life of
// the defect, so a guard that reds on a reorder or a rename has learned nothing from that.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sab-b62-'));
  for (const d of ['lib', 'test', 'app']) {
    cpSync(path.join(root, d), path.join(dir, d), { recursive: true, dereference: false });
  }
  return dir;
}

const SUITES = ['test/b62propertyroute.test.mjs', 'test/landlord.test.mjs'];

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

const RT = 'app/api/money/manual/route.ts';
const PL = 'lib/propertylanes.ts';
const PE = 'lib/propertyengine.ts';
const DB = 'lib/supabase.ts';
const SUITE = 'test/b62propertyroute.test.mjs';
// The one line of lib/propertyengine.ts that decides a finance cost. Quoted once, here, so a
// rewrite of that predicate breaks ONE anchor rather than several.
const NAMES_LINE = "  const names = (s: string): boolean => s.includes('mortgage') || s.includes('interest');";

const LIVE = "      income_type: direction === 'rent' || streamFor(filedAs) === 'property' ? 'property' : undefined,";

const SABOTAGES = [
  // ── DIRECTION ONE: A PROPERTY COST STAYS IN THE TRADE STREAM. ─────────────────────────────
  {
    name: '🔴 THE DEFECT ITSELF: the line goes back to rent in only, and all four categories are dead ends again',
    apply: (d) => edit(d, RT, LIVE, "      income_type: direction === 'rent' ? 'property' : undefined,"),
  },
  {
    name: '🔴 the stream field goes altogether, so even rent in stops reaching the property stream',
    apply: (d) => edit(d, RT, LIVE, ''),
  },
  {
    name: '🔴 streamFor is inverted in the rulebook, so a property category files as trade and a trade one as property',
    apply: (d) => edit(d, PL, "  return isPropertyCategory(category) ? 'property' : 'trade';",
      "  return isPropertyCategory(category) ? 'trade' : 'property';"),
  },
  {
    name: '🔴 THE QUIET ONE: the rulebook loses ground rent, so one category silently stops routing',
    apply: (d) => edit(d, PL, "  'ground rent',\n] as const;", '] as const;'),
  },
  {
    name: '🔴 the route asks the rulebook about the RAW typed text rather than the category it filed,'
      + ' so a trailing space files a landlord cost as trade',
    apply: (d) => edit(d, RT, 'streamFor(filedAs)', 'streamFor(category)'),
  },
  {
    name: '🔴 THE LIST COMES BACK INTO THE ROUTE, which is the shape that rots the day a fifth category is added',
    apply: (d) => edit(d, RT, LIVE,
      "      income_type: direction === 'rent' || ['mortgage interest', 'letting agent', 'property repairs'].includes(filedAs) ? 'property' : undefined,"),
  },
  // ── DIRECTION TWO: IT REACHES PROPERTY BUT LANDS ON THE WRONG SIDE OF THE SPLIT. ──────────
  {
    name: '🔴 THE EXPENSIVE DIRECTION: mortgage interest stops being a finance cost, so it is deducted'
      + ' in full instead of relieved at 20% and the bill comes out 2,800.00 too LOW',
    // \u26a0\ufe0f RE ANCHORED 20 August 2026 BY B68, WHICH REWROTE THIS PREDICATE. The old anchor
    // quoted the one line body and went DEAD the moment that body grew a category branch. A dead
    // anchor throws before the tree is run and the pass counts the throw as a CATCH, so this pass
    // would have reported full marks while testing nothing. scripts/check-sabotage-anchors.mjs saw
    // it in a second; the gate could not.
    apply: (d) => edit(d, PE, NAMES_LINE,
      "  const names = (s: string): boolean => s.includes('buy to let');"),
  },
  {
    name: '🔴 the finance list is emptied, so the rulebook and the reader disagree about Section 24',
    apply: (d) => edit(d, PL, "export const PROPERTY_FINANCE_CATEGORIES = ['mortgage interest'] as const;",
      'export const PROPERTY_FINANCE_CATEGORIES = [] as const;'),
  },
  {
    name: '🔴 the finance list is WIDENED to the letting agent, which would relieve an ordinary'
      + ' deduction at 20% and cost the customer money',
    apply: (d) => edit(d, PL, "export const PROPERTY_FINANCE_CATEGORIES = ['mortgage interest'] as const;",
      "export const PROPERTY_FINANCE_CATEGORIES = ['mortgage interest', 'letting agent'] as const;"),
  },
  {
    name: '🔴 the reader stops splitting at all and puts every property cost into expenses',
    apply: (d) => edit(d, DB, '      if (isResidentialFinanceCost(r.category, r.vendor)) finance += Math.abs(a);\n      else expenses += Math.abs(a);',
      '      expenses += Math.abs(a);'),
  },
  {
    name: '🔴 the reader counts a cost as rent, so the stream is right and every figure on it is wrong',
    apply: (d) => edit(d, DB, '    if (a > 0) rents += a;', '    if (a !== 0) rents += Math.abs(a);'),
  },
  // ── OVER ROUTING: THE OTHER WAY TO PASS A WALKER THAT ONLY LOOKS AT PROPERTY. ─────────────
  {
    name: '🔴 every cost is marked property, which a walker that only checks the four would pass',
    apply: (d) => edit(d, RT, LIVE, "      income_type: 'property',"),
  },
  {
    name: '🔴 money IN is marked property too, so trade income stops carrying Class 4',
    apply: (d) => edit(d, RT, LIVE,
      "      income_type: direction !== 'out' || streamFor(filedAs) === 'property' ? 'property' : undefined,"),
  },
  {
    name: '🔴 the category collapses to other before the stream is decided, so nothing routes and the row lies about itself',
    apply: (d) => edit(d, RT, "(isCategory(trimmed) ? trimmed : 'other')", "'other'"),
  },
  // ── THE SUITE'S OWN DERIVATIONS. ──────────────────────────────────────────────────────────
  {
    name: '🔴 THE VACUITY PROBE IS NEUTERED: the deliberately broken stage is handed the line that'
      + ' already ships, so the suite can no longer prove it sees a failure',
    apply: (d) => edit(d, SUITE, `const OLD_LINE = "income_type: direction === 'rent' ? 'property' : undefined,";`,
      `const OLD_LINE = "income_type: direction === 'rent' || streamFor(filedAs) === 'property' ? 'property' : undefined,";`),
  },
  {
    name: '🔴 THE WALKER GOES BLIND: the rulebook loses a category AND the suite hardcodes the old four,'
      + ' so a derived test stops being derived and stays green while the product stops routing',
    apply: (d) => {
      edit(d, PL, "  'ground rent',\n] as const;", '] as const;');
      edit(d, SUITE, 'const PROPS = [...LANES.PROPERTY_CATEGORIES];',
        "const PROPS = ['mortgage interest', 'letting agent', 'property repairs'];");
    },
  },
  {
    // The first version of this one loosened a SINGLE assertion and was a HOLE, correctly: the
    // other four in that section still held. So it now blinds BOTH headline assertions and breaks
    // the reader in the same tree, which is what a person quietly weakening a suite would actually
    // have to do. If the per category drift check and the vacuously zero check cannot catch that,
    // section 3 is decoration.
    name: '🔴 THE SUITE IS BLINDED AND THEN THE READER IS BROKEN: both split assertions are'
      + ' loosened to floors and every property cost is pushed into expenses',
    apply: (d) => {
      edit(d, SUITE, '  split?.finance === expectedFinance);', '  (split?.finance ?? 0) >= 0);');
      edit(d, SUITE, '  split?.expenses === expectedExpenses);', '  (split?.expenses ?? 0) >= 0);');
      edit(d, DB, '      if (isResidentialFinanceCost(r.category, r.vendor)) finance += Math.abs(a);\n      else expenses += Math.abs(a);',
        '      expenses += Math.abs(a);');
    },
  },
];

// NO OP CONTROLS. Each changes the files and changes NOTHING these guards are about.
const CONTROLS = [
  {
    name: 'CONTROL: the two sides of the branch are REORDERED, which changes the source and no behaviour',
    apply: (d) => edit(d, RT, LIVE,
      "      income_type: streamFor(filedAs) === 'property' || direction === 'rent' ? 'property' : undefined,"),
  },
  {
    name: 'CONTROL: the LOCAL IS RENAMED, and a guard that reds here is about an identifier rather than about money',
    apply: (d) => {
      edit(d, RT, '  const filedAs = ', '  const filedCategory = ');
      edit(d, RT, '      category: filedAs,', '      category: filedCategory,');
      edit(d, RT, 'streamFor(filedAs)', 'streamFor(filedCategory)');
    },
  },
  {
    name: 'CONTROL: a COMMENT is reworded and it names all four property categories in prose, on purpose',
    apply: (d) => edit(d, RT, '      // ⚠️ THE RENT BRANCH STAYS FIRST AND STAYS EXPLICIT.',
      '      // Reworded comment naming mortgage interest, letting agent, property repairs and ground'
      + ' rent, none of which is code.\n      // ⚠️ THE RENT BRANCH STAYS FIRST AND STAYS EXPLICIT.'),
  },
  {
    name: 'CONTROL: whitespace is added inside the insertTransaction call',
    apply: (d) => edit(d, RT, '      confirmed: true,\n', '      confirmed: true,\n\n'),
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

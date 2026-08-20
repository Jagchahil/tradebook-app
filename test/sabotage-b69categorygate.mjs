// SABOTAGE THE CATEGORY GATE. B69, 20 August 2026.
//
//   node test/sabotage-b69categorygate.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A GATE ON A LIST HAS TWO FAILURES AND THE SECOND ONE COSTS A CUSTOMER MONEY.
//
//   IT DOES NOT SHUT. The four property categories go back to every account, and a plumber reads
//   past four rows that mean nothing to him on the screen he uses most.
//
//   IT SHUTS TOO FAR. A trade category is quietly dropped from the picker, so a man cannot file a
//   cost he actually has and loses the deduction. That is the expensive direction and it is why
//   the suite asserts the plumber's list is EXACTLY what it was, in order, rather than merely
//   free of property rows.
//
// Plus the one gate both halves share: the rent button and the category list must appear together
// or a landlord gets somewhere to log rent and nowhere to log what it costs him.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sab-b69-'));
  for (const d of ['lib', 'test', 'app']) {
    cpSync(path.join(root, d), path.join(dir, d), { recursive: true, dereference: false });
  }
  return dir;
}

const SUITES = ['test/b69categorygate.test.mjs', 'test/moneyweb.test.mjs', 'test/landlord.test.mjs'];

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


const ADD = 'app/app/money/add/page.tsx';
const PL = 'lib/propertylanes.ts';
const PILE = 'app/app/pile/page.tsx';
const SUITE = 'test/b69categorygate.test.mjs';

const CALL = '              {categoriesFor(CATEGORIES, rental).map((c) => (';

const SABOTAGES = [
  // ── IT DOES NOT SHUT. ─────────────────────────────────────────────────────────────────────
  {
    name: '🔴 THE GATE IS REMOVED and the whole list goes back into the picker, so a plumber is'
      + ' offered mortgage interest again',
    apply: (d) => edit(d, ADD, CALL, '              {CATEGORIES.map((c) => ('),
  },
  {
    name: '🔴 the gate is hardcoded open, which looks gated and is not',
    apply: (d) => edit(d, ADD, CALL, '              {categoriesFor(CATEGORIES, true).map((c) => ('),
  },
  {
    name: '🔴 categoriesFor stops filtering, so the module says gated and the screen shows everything',
    apply: (d) => edit(d, PL, '  const trade = all.filter((c) => !isPropertyCategory(c));', '  const trade = [...all];'),
  },
  {
    name: '🔴 THE GATE IS INVERTED: the plumber gets the property rows and the landlord loses them',
    apply: (d) => edit(d, PL, '  return hasRentalStream === true;', '  return hasRentalStream !== true;'),
  },
  // ── IT SHUTS TOO FAR, WHICH IS THE ONE THAT COSTS HIM. ───────────────────────────────────
  {
    name: '🔴 THE EXPENSIVE DIRECTION: the gate takes a TRADE category with it, so a man cannot file'
      + ' a cost he actually has and loses the deduction',
    apply: (d) => edit(d, PL, '  const trade = all.filter((c) => !isPropertyCategory(c));',
      "  const trade = all.filter((c) => !isPropertyCategory(c) && c !== 'insurance');"),
  },
  {
    name: '🔴 the trade categories come back in a different order, so the list he knows is reshuffled'
      + ' under him',
    apply: (d) => edit(d, PL, '  if (!offerPropertyCategories(hasRentalStream)) return [...trade];',
      '  if (!offerPropertyCategories(hasRentalStream)) return [...trade].reverse();'),
  },
  {
    name: '🔴 the four are scattered back through the cost sheet instead of appended as a set',
    apply: (d) => edit(d, PL, '  return [...trade, ...property];', '  return all.filter((c) => true);'),
  },
  {
    name: '🔴 the shared list is duplicated into the landlord\'s picker, so every row appears twice',
    apply: (d) => edit(d, PL, '  return [...trade, ...property];', '  return [...trade, ...property, ...property];'),
  },
  // ── THE ONE GATE BOTH HALVES SHARE. ──────────────────────────────────────────────────────
  {
    name: '🔴 THE LIST IS GATED ON A DIFFERENT CONDITION FROM THE RENT BUTTON, so a landlord gets'
      + ' somewhere to log rent and nowhere to log what it costs him',
    apply: (d) => edit(d, ADD, CALL, '              {categoriesFor(CATEGORIES, gate).map((c) => ('),
  },
  {
    name: '🔴 the rental flag stops being read from the account at all',
    apply: (d) => edit(d, ADD, '    accountHasRental(user.id),', '    Promise.resolve(false),'),
  },
  // ── THE MODULE THE WHOLE THING RESTS ON. ─────────────────────────────────────────────────
  {
    name: '🔴 THE QUIET ONE: the rulebook loses ground rent, so one category silently stops being'
      + ' offered to anybody',
    apply: (d) => edit(d, PL, "  'ground rent',\n] as const;", '] as const;'),
  },
  {
    name: '🔴 isPropertyCategory stops settling case, so a capital letter walks past the gate',
    apply: (d) => edit(d, PL, "  return String(c ?? '').trim().toLowerCase();", "  return String(c ?? '');"),
  },
  // ── THE OTHER SCREEN. ────────────────────────────────────────────────────────────────────
  {
    name: '🔴 the pile stops gating its own picker, so the two screens disagree about who is a landlord',
    apply: (d) => edit(d, PILE, '{categoriesFor(CATEGORIES, rental).map((c) => (', '{CATEGORIES.map((c) => ('),
  },
  {
    name: '🔴 a screen types one of the four itself, which is the list that rots',
    apply: (d) => edit(d, ADD, '              <option value="">Nothing fits. File it as other</option>',
      '              <option value="">Nothing fits. File it as other</option>\n              <option value="ground rent">ground rent</option>'),
  },
  // ── THE SUITE'S OWN DERIVATION. ──────────────────────────────────────────────────────────
  {
    name: '🔴 THE SUITE HARDCODES THE FOUR and the rulebook loses one, so a derived test stops being'
      + ' derived and the screen stops offering a category nobody notices',
    apply: (d) => {
      edit(d, SUITE, 'const PROPS = [...L.PROPERTY_CATEGORIES];',
        "const PROPS = ['mortgage interest', 'letting agent', 'property repairs'];");
      edit(d, PL, "  'ground rent',\n] as const;", '] as const;');
    },
  },
];

// NO OP CONTROLS. Each changes the files and changes NOTHING these guards are about.
const CONTROLS = [
  {
    name: 'CONTROL: the map PARAMETER is renamed, and no guard here is about an identifier',
    apply: (d) => edit(d, ADD, CALL + '\n                <option key={c} value={c}>{c}</option>',
      '              {categoriesFor(CATEGORIES, rental).map((cat) => (\n                <option key={cat} value={cat}>{cat}</option>'),
  },
  {
    name: 'CONTROL: a COMMENT is reworded and it names all four property categories in prose, on purpose',
    apply: (d) => edit(d, ADD, '            <label htmlFor="cat" style={S.label}>What it was, if it went out</label>',
      '            {/* Reworded comment naming mortgage interest, letting agent, property repairs and'
      + ' ground rent, none of which is code. */}\n            <label htmlFor="cat" style={S.label}>What it was, if it went out</label>'),
  },
  {
    name: 'CONTROL: whitespace is added inside the select',
    apply: (d) => edit(d, ADD, '            <select id="cat" name="category" defaultValue="" className="lek-field">',
      '\n            <select id="cat" name="category" defaultValue="" className="lek-field">'),
  },
  {
    name: 'CONTROL: a comment is reworded in lib/propertylanes.ts, which owns the rule but not the screen',
    apply: (d) => edit(d, PL, '/**\n * The categories to draw, in order, for this customer.',
      '/**\n * Reworded. The categories to draw, in order, for this customer.'),
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

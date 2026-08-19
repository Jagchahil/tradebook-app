// SABOTAGE THE GENERIC THEY. B42, 19 August 2026.
//
//   node test/sabotage-b42generic.mjs
//
// ═══════════════════════════════════════════════════════════
// The third party gate now reads an INDEFINITE GENERIC ANTECEDENT and lets the singular they
// through. That change has two failure directions and they are not equally expensive.
//
//   TOO NARROW costs a customer a re ask. The first question a new customer types comes back
//   "I can only see your books", which is where this item started.
//   TOO WIDE COSTS A DISCLOSURE. Every sabotage below marked DISCLOSURE widens the generic reading
//   until it swallows a question about a real person, which is the direction the argument above
//   NOT_A_PERSON exists to avoid. Those are the ones worth having.
//
// ⚠️ AND THE SUITE'S OWN DERIVATIONS ARE SABOTAGED TOO, because the assertion that every noun in
// GENERIC_SUBJECT_RE is WALKED is worth exactly what its walker can see.
// ═══════════════════════════════════════════════════════════

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sab-b42-'));
  for (const d of ['lib', 'test', 'app']) {
    cpSync(path.join(root, d), path.join(dir, d), { recursive: true, dereference: false });
  }
  return dir;
}

const SUITES = ['test/laneparity.test.mjs'];

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
    console.log('   1. every directory test/laneparity.test.mjs READS is copied by scratch()');
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

const WA = 'lib/waintents.ts';
const LP = 'test/laneparity.test.mjs';

const SABOTAGES = [
  {
    name: '🔴 the generic reading is reverted, so the first question a new customer types is refused again',
    apply: (d) => edit(d, WA, '  if (!named && GENERIC_SUBJECT_RE.test(b)) return false;', ''),
  },
  {
    name: '🔴 DISCLOSURE: the definite article joins the determiner list, so "the builder\'s turnover"'
      + ' becomes a generic question about any builder',
    apply: (d) => edit(d, WA, "`\\\\b(?:a|an|any|every|most|some|all)\\\\s+", "`\\\\b(?:a|an|the|any|every|most|some|all)\\\\s+"),
  },
  {
    name: '🔴 DISCLOSURE: the "else" lookahead goes, so "what is someone else\'s income" reads as generic',
    apply: (d) => edit(d, WA, "+ `|\\\\b(?:someone|somebody|anyone|anybody|everyone)\\\\b(?!\\\\s+else)`,",
      "+ `|\\\\b(?:someone|somebody|anyone|anybody|everyone)\\\\b`,"),
  },
  {
    name: '🔴 DISCLOSURE: the !named scoping goes, so a generic noun in the same sentence talks a'
      + ' NAMED person out of the gate',
    apply: (d) => edit(d, WA, '  if (!named && GENERIC_SUBJECT_RE.test(b)) return false;',
      '  if (GENERIC_SUBJECT_RE.test(b)) return false;'),
  },
  {
    name: '🔴 DISCLOSURE: the cheap fix the item rejected is applied instead, and "their" leaves'
      + ' THIRD_PARTY_RE',
    apply: (d) => edit(d, WA, "\\b(?:his|her|their|someone else'?s?|", "\\b(?:his|her|someone else'?s?|"),
  },
  {
    name: '🔴 the determiner run goes to zero words, so "a NEW sole trader" and "a NEWLY SELF EMPLOYED'
      + ' person" stop being generic',
    apply: (d) => edit(d, WA, '(?:\\\\w+\\\\s+){0,2}', '(?:\\\\w+\\\\s+){0,0}'),
  },
  {
    name: '🔴 a trade noun is deleted from the list, and the phrasing that walks it goes back to refused',
    apply: (d) => edit(d, WA, "'plasterer', 'roofer',", "'roofer',"),
  },
  {
    name: '🔴 THE QUIET ONE: the noun list is emptied except its first entry, which still reads like a list',
    apply: (d) => edit(d, WA, "const GENERIC_TRADE_NOUNS = [\n  'sole\\\\s+trader',", "const GENERIC_TRADE_NOUNS = [\n  'zzznotanoun',"),
  },
  {
    name: '🔴 the pattern loses its word boundary, so a determiner inside another word can open the gate',
    apply: (d) => edit(d, WA, "`\\\\b(?:a|an|any|every|most|some|all)\\\\s+", "`(?:a|an|any|every|most|some|all)\\\\s+"),
  },
  {
    name: '🔴 the check moves ABOVE the compared to escape hatch, changing the order of two gates',
    apply: (d) => {
      edit(d, WA, '  if (!named && GENERIC_SUBJECT_RE.test(b)) return false;', '');
      edit(d, WA, '  const named = namesAPerson(b, selfNames);',
        '  const named = namesAPerson(b, selfNames);\n  if (GENERIC_SUBJECT_RE.test(b)) return false;');
    },
  },
  {
    name: '🔴 DISCLOSURE: the money noun list drifts again, and income, account, bill and vat stop'
      + ' reaching a refusal, which is exactly the state B42 found the gate in',
    apply: (d) => edit(d, WA, "const THIRD_PARTY_MONEY_NOUNS = 'books|tax|figures|takings|profit|income|account|bill|turnover|vat';",
      "const THIRD_PARTY_MONEY_NOUNS = 'books|tax|figures|takings|profit|turnover';"),
  },
  {
    name: '🔴 the last line goes back to a SECOND typed vocabulary, so the two can drift apart again',
    apply: (d) => edit(d, WA, '  return new RegExp(`\\\\b(?:owe|owes|owed|earn|earns|made|makes|pay|pays|${THIRD_PARTY_MONEY_NOUNS})\\\\b`, \'i\').test(b);',
      '  return /\\bowe|owes|owed|earn|earns|made|makes|turnover|profit|tax|takings|books|figures|pay|pays\\b/i.test(b);'),
  },
  // ── THE SUITE'S OWN DERIVATIONS. ──────────────────────────────────────────────────────
  {
    name: '🔴 THE WALKED CHECK GOES BLIND: it reads a hardcoded noun list instead of the real pattern',
    apply: (d) => edit(d, LP, "    const nouns = (block.match(/'([^']+)'/g) || []).map((q) => q.slice(1, -1).replace(/\\\\\\\\/g, '\\\\'));",
      "    const nouns = ['sole\\\\s+trader', 'builder', 'plumber', 'electrician', 'roofer', 'joiner', 'decorator', 'tiler', 'landlord', 'contractor', 'person', 'people', 'freelancer', 'scaffolder', 'groundworker', 'landscaper', 'tradesman', 'tradesmen', 'tradesperson', 'plasterer'];"),
  },
  {
    name: '🔴 the boundary corpus is narrowed to the shapes that were never at risk',
    apply: (d) => edit(d, LP, "  const DEFINITE_AND_BARE = [\n    \"what is the builder's turnover\",\n    \"how much is the plumber's profit\",",
      "  const DEFINITE_AND_BARE = [\n"),
  },
  {
    name: '🔴 the per trade corpus is cut to one phrasing, so a deleted noun stops being visible',
    apply: (d) => edit(d, LP, "  const GENERIC_TRADES = [\n    'how does a self employed person work out their tax',",
      "  const GENERIC_TRADES = [\n"),
  },
];

// NO OP CONTROLS. Each changes the files and changes NOTHING these guards are about.
const CONTROLS = [
  {
    name: 'CONTROL: a LOCAL IS RENAMED in isAboutSomeoneElse, and a guard that reds here is about a name',
    apply: (d) => {
      edit(d, WA, '  const named = namesAPerson(b, selfNames);', '  const namesSomebody = namesAPerson(b, selfNames);');
      edit(d, WA, '  if (!THIRD_PARTY_RE.test(b) && !named) return false;', '  if (!THIRD_PARTY_RE.test(b) && !namesSomebody) return false;');
      edit(d, WA, '  if (!named && GENERIC_SUBJECT_RE.test(b)) return false;', '  if (!namesSomebody && GENERIC_SUBJECT_RE.test(b)) return false;');
      edit(d, WA, '  if (named) return true;', '  if (namesSomebody) return true;');
    },
  },
  {
    name: 'CONTROL: a COMMENT is reworded, and it names the definite article and "their" on purpose',
    apply: (d) => edit(d, WA, '// 🔴 B42. THE FIRST QUESTION A NEW CUSTOMER TYPES WAS REFUSED, AND THE REASON WAS A PRONOUN.',
      '// Reworded comment. It says the, their, someone else and a sole trader out loud, and none is code.'),
  },
  {
    name: 'CONTROL: a noun is REORDERED in the list, which changes the source and no behaviour',
    apply: (d) => edit(d, WA, "'plasterer', 'roofer', 'joiner',", "'roofer', 'plasterer', 'joiner',"),
  },
  {
    name: 'CONTROL: whitespace is added inside the noun list',
    apply: (d) => edit(d, WA, "const GENERIC_TRADE_NOUNS = [", "const GENERIC_TRADE_NOUNS = [\n"),
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

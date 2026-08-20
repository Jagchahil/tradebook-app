// SABOTAGE THE DERIVED LIB STAGE. B73, 20 August 2026.
//
//   node test/sabotage-b73stagedlib.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE THING THIS GUARDS IS AN ABSENCE, AND AN ABSENCE IS THE HARDEST THING TO KEEP.
//
// Twenty one suites used to bring a hand written list of siblings into their scratch copy of lib,
// and every list was right the day it was typed. The bill came due on 19 August: one new import in
// lib/propertyengine.ts turned 22 suites red, so the file could not gain an import at all, and B68
// was written import free because of it. After B73 the same probe turns 0 suites red.
//
// So the sabotages here are the ways the list comes back, plus the ways the derivation can be true
// and useless: a stage that skips a file, a rewrite that leaves a specifier unresolvable, a helper
// that reads the working directory instead of its own copy and so makes every OTHER sabotage pass
// in this corpus a hole.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sab-b73-'));
  for (const d of ['lib', 'test', 'app']) {
    cpSync(path.join(root, d), path.join(dir, d), { recursive: true, dereference: false });
  }
  return dir;
}

// ⚠️ THE TWO ENGINE SUITES ARE HERE ON PURPOSE. b73stagedlib alone would let a sabotage pass that
// breaks the stage in a way only a real import notices. propertyengine and landlord both drive
// lib/propertyengine.ts out of a stage, so a broken stage takes them down with it.
const SUITES = [
  'test/b73stagedlib.test.mjs',
  'test/propertyengine.test.mjs',
  'test/landlord.test.mjs',
];

function runSuite(dir) {
  for (const rel of SUITES) {
    try {
      const out = execFileSync('node', [path.join(dir, rel)], {
        cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (/[1-9]\d* failed\.?/.test(out)) return true;
      if (!/\d+ passed, 0 failed/.test(out)) return true;
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
    console.log('   1. lib/, test/ and app/ are all copied by scratch()');
    console.log('   2. every suite in SUITES prints "N passed, 0 failed"');
    console.log('   3. df -h on TMPDIR: a suite that dies of ENOSPC scores as caught, and this');
    console.log('      corpus lost a whole gate run to a full disk on 20 August');
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
const put = (dir, rel, body) => writeFileSync(path.join(dir, rel), body);

const HELP = 'test/stagelib.mjs';
const PE = 'test/propertyengine.test.mjs';

const WALK = "  for (const f of readdirSync(libDir)) {\n"
  + "    if (!f.endsWith('.ts')) continue;\n"
  + "    writeFileSync(path.join(dir, f), withExt(readFileSync(path.join(libDir, f), 'utf8')));\n"
  + "  }";
const LIBCONST = "export const LIB = path.resolve(here, '../lib');";
const EXTCONST = "const MODULE_EXT = /\\.(ts|tsx|js|jsx|mjs|cjs|json)$/;";

const SABOTAGES = [
  // ── THE LIST COMES BACK. ─────────────────────────────────────────────────────────────────
  {
    name: '🔴 THE HELPER GOES BACK TO A HAND WRITTEN LIST, which is the whole of what this item removed',
    apply: (d) => edit(d, HELP, WALK,
      "  for (const f of ['taxengine.ts', 'propertyengine.ts', 'scotland.ts']) {\n"
      + "    writeFileSync(path.join(dir, f), withExt(readFileSync(path.join(libDir, f), 'utf8')));\n"
      + "  }"),
  },
  {
    name: '🔴 A SUITE TYPES THE LIST BACK IN ITSELF, which is how this started twenty one times',
    apply: (d) => edit(d, PE, "const stage = stageLib('property-');",
      "const stage = mkdtempSync(path.join(tmpdir(), 'property-'));\n"
      + "const fix = (s) => s.replace(\"from './taxengine'\", \"from './taxengine.ts'\");\n"
      + "for (const f of ['taxengine', 'propertyengine']) {\n"
      + "  writeFileSync(path.join(stage, f + '.ts'), fix(readFileSync(path.join(lib, f + '.ts'), 'utf8')));\n"
      + "}"),
  },
  {
    name: '🔴 a suite stages the engine file by file instead, which is the same list without the brackets',
    apply: (d) => edit(d, PE, "const stage = stageLib('property-');",
      "const stage = mkdtempSync(path.join(tmpdir(), 'property-'));\n"
      + "writeFileSync(path.join(stage, 'taxengine.ts'), readFileSync(path.join(lib, 'taxengine.ts'), 'utf8'));\n"
      + "writeFileSync(path.join(stage, 'propertyengine.ts'), readFileSync(path.join(lib, 'propertyengine.ts'), 'utf8')\n"
      + "  .replace(\"from './taxengine'\", \"from './taxengine.ts'\"));"),
  },
  // ── THE DERIVATION IS TRUE AND USELESS. ──────────────────────────────────────────────────
  {
    name: '🔴 THE STAGE SKIPS ONE FILE, so the walk is derived and the hole is exactly where it was',
    apply: (d) => edit(d, HELP, "    if (!f.endsWith('.ts')) continue;",
      "    if (!f.endsWith('.ts')) continue;\n    if (f === 'propertylanes.ts') continue;"),
  },
  {
    name: 'the stage takes only the small files, which is a filter nobody would call a list',
    apply: (d) => edit(d, HELP, "    writeFileSync(path.join(dir, f), withExt(readFileSync(path.join(libDir, f), 'utf8')));",
      "    const src = readFileSync(path.join(libDir, f), 'utf8');\n"
      + "    if (src.length > 20000) continue;\n"
      + "    writeFileSync(path.join(dir, f), withExt(src));"),
  },
  {
    name: '🔴 THE COPY IS TAKEN WITHOUT THE REWRITE, so every relative import in the stage is unresolvable',
    apply: (d) => edit(d, HELP, "withExt(readFileSync(path.join(libDir, f), 'utf8'))",
      "readFileSync(path.join(libDir, f), 'utf8')"),
  },
  // ── THE REWRITE ITSELF. ──────────────────────────────────────────────────────────────────
  {
    name: '🔴 ANY DOTTED SUFFIX COUNTS AS AN EXTENSION AGAIN, which is the real defect this found:'
      + " lib/taxrules.ts and lib/universe.ts import './claimrules.data'",
    apply: (d) => edit(d, HELP, EXTCONST, "const MODULE_EXT = /\\.[a-z]+$/;"),
  },
  {
    name: 'the rewrite stops being idempotent, so a file staged twice becomes ./x.ts.ts',
    apply: (d) => edit(d, HELP, 'MODULE_EXT.test(spec) ? m :', 'false ? m :'),
  },
  {
    name: 'the rewrite stops reaching a parent relative specifier',
    apply: (d) => edit(d, HELP, "src.replace(/(from\\s+')(\\.[^']*?)(')/g", "src.replace(/(from\\s+')(\\.\\/[^']*?)(')/g"),
  },
  {
    name: 'the rewrite starts mangling package specifiers as well as relative ones',
    apply: (d) => edit(d, HELP, "src.replace(/(from\\s+')(\\.[^']*?)(')/g", "src.replace(/(from\\s+')([^']*?)(')/g"),
  },
  // ── THE ONE THAT WOULD MAKE EVERY OTHER SABOTAGE PASS IN THIS CORPUS A HOLE. ─────────────
  {
    name: '🔴 LIB IS READ OFF THE WORKING DIRECTORY, so a scratch tree silently stages the REAL repo'
      + ' and every sabotage in this corpus stops meaning anything',
    apply: (d) => edit(d, HELP, LIBCONST, "export const LIB = path.resolve(process.cwd(), 'lib');"),
  },
  // ── THE COMMENT STRIPPER, WHICH REALLY DID BLIND THIS FILE ON THE DAY IT WAS WRITTEN. ────
  {
    name: '🔴 A GLOB IS WRITTEN INTO A LINE COMMENT, which opens a block comment as far as the shared'
      + ' stripper is concerned and swallowed all three exports the first time',
    apply: (d) => edit(d, HELP, '// B73. ONE DERIVED COPY OF lib/,',
      '// Reads every lib/*.ts file.\n// B73. ONE DERIVED COPY OF lib/,'),
  },
  {
    name: 'the helper stops exporting the walk, so a suite that asks for a stage gets nothing',
    apply: (d) => edit(d, HELP, 'export function stageLib(', 'function stageLib('),
  },
];

// NO OP CONTROLS. Each changes the files and changes NOTHING these guards are about.
const CONTROLS = [
  {
    name: '🔴 CONTROL: A BRAND NEW lib FILE APPEARS AND NOBODY EDITS A TEST. This is the whole point'
      + ' of the item and it must be green, not caught',
    apply: (d) => put(d, 'lib/zzb73control.ts',
      "// A new lib file. The derived walk stages it the moment it exists.\nexport const ZZ_B73 = 1;\n"),
  },
  {
    name: 'CONTROL: the scratch directory prefixes are all renamed, which nothing may depend on',
    apply: (d) => {
      edit(d, PE, "stageLib('property-')", "stageLib('engine-scratch-')");
      edit(d, HELP, "prefix = 'stagelib-'", "prefix = 'derivedlib-'");
    },
  },
  {
    name: 'CONTROL: the helper\'s internal names are renamed and every guard captures behaviour rather'
      + ' than an identifier',
    apply: (d) => {
      edit(d, HELP, 'for (const f of readdirSync(libDir)) {', 'for (const entry of readdirSync(libDir)) {');
      edit(d, HELP, "    if (!f.endsWith('.ts')) continue;", "    if (!entry.endsWith('.ts')) continue;");
      edit(d, HELP, "    writeFileSync(path.join(dir, f), withExt(readFileSync(path.join(libDir, f), 'utf8')));",
        "    writeFileSync(path.join(dir, entry), withExt(readFileSync(path.join(libDir, entry), 'utf8')));");
    },
  },
  {
    name: 'CONTROL: a BLOCK comment is added to the helper that quotes the code back, on purpose',
    apply: (d) => edit(d, HELP, 'import { mkdtempSync,',
      '/* A block comment. It mentions readdirSync(libDir) and process.cwd() and neither is code. */\nimport { mkdtempSync,'),
  },
];

baseline();

let caught = 0;
let missed = 0;
let broken = 0;
for (const s of SABOTAGES) {
  const dir = scratch();
  let red;
  try { s.apply(dir); red = runSuite(dir); } catch (e) { red = null; console.log(`  BROKEN ${s.name}\n          ${e.message}`); }
  rmSync(dir, { recursive: true, force: true });
  if (red === null) { broken++; continue; }
  if (red) { caught++; console.log(`  CAUGHT  ${s.name}`); }
  else { missed++; console.log(`  MISSED  ${s.name}`); }
}

let green = 0;
let falsePositive = 0;
for (const c of CONTROLS) {
  const dir = scratch();
  let red;
  try { c.apply(dir); red = runSuite(dir); } catch (e) { red = null; console.log(`  BROKEN ${c.name}\n          ${e.message}`); }
  rmSync(dir, { recursive: true, force: true });
  if (red === null) { broken++; continue; }
  if (red) { falsePositive++; console.log(`  FALSE POSITIVE  ${c.name}`); }
  else { green++; console.log(`  ok      ${c.name}`); }
}

console.log(`\n  ${caught}/${SABOTAGES.length} sabotages caught, ${green}/${CONTROLS.length} controls green.`);
if (broken) console.log(`  BAD: ${broken} broken anchors`);
if (missed) console.log(`  BAD: ${missed} holes`);
if (falsePositive) console.log(`  BAD: ${falsePositive} false positives`);
process.exit(missed === 0 && falsePositive === 0 && broken === 0 ? 0 : 1);

// B73. A HAND WRITTEN LIST OF STAGED SIBLINGS ROTS, AND IT HAD STOPPED A FILE GAINING AN IMPORT.
//
//   node test/b73stagedlib.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// MEASURED ON 19 AUGUST AND MEASURED AGAIN ON 20 AUGUST. Adding one import to lib/propertyengine.ts
// turned 22 suites red, so the file the whole property engine lives in could not gain an import at
// all. B68 was then written import free BECAUSE of that, not because import free was better. A
// constraint that changes how production code gets written is not a test detail.
//
// After this item the same probe turns 0 suites red. That is the number this suite exists to keep.
//
// 🔴 AND THE GUARD IS NOT "COUNT THE SUITES". It is the invariant underneath: every relative import
// in every staged lib file must resolve to a file that is actually in the stage. A count would pass
// the day somebody adds a twenty second hand list.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { stageLib, withExt, LIB } from './stagelib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); }
};

const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// ---------------------------------------------------------------------------------------------
// 1. THE INVARIANT, EXECUTED. This is the whole item and it is a measurement, not a claim.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 1. every relative import in a staged lib resolves inside the stage ===\n');

const stage = stageLib('b73probe-');
const staged = readdirSync(stage).filter((f) => f.endsWith('.ts'));

ok('🔴 THE STAGE HOLDS EVERY lib/*.ts, so the list can never be short',
  staged.length === readdirSync(LIB).filter((f) => f.endsWith('.ts')).length && staged.length > 100);

{
  const broken = [];
  for (const f of staged) {
    const src = readFileSync(path.join(stage, f), 'utf8');
    for (const m of src.matchAll(/from\s+'(\.[^']*)'/g)) {
      const target = path.resolve(stage, m[1]);
      if (!existsSync(target)) broken.push(`${f} -> ${m[1]}`);
    }
  }
  ok('🔴 AND NOT ONE OF THEM POINTS AT A FILE THAT IS NOT THERE. This is the bug, at its root',
    broken.length === 0);
  if (broken.length) console.log('      ' + broken.slice(0, 8).join('\n      '));
}

{
  // The specific file the item is named after. It is asserted on its own so a failure says which.
  const pe = readFileSync(path.join(stage, 'propertyengine.ts'), 'utf8');
  const specs = [...pe.matchAll(/from\s+'(\.[^']*)'/g)].map((m) => m[1]);
  ok('🔴 lib/propertyengine.ts CAN GAIN AN IMPORT, because every one it has already resolves',
    specs.every((sp) => existsSync(path.resolve(stage, sp))));
  ok('...and it is staged under its own name rather than a rename that limits what it may bring',
    existsSync(path.join(stage, 'propertyengine.ts')));
}

// ---------------------------------------------------------------------------------------------
// 2. THE COPY IS THE ORIGINAL. If it drifts, every suite above is testing a file that does not ship.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 2. the staged copy differs ONLY in its import specifiers ===\n');
{
  const drifted = staged.filter((f) => (
    readFileSync(path.join(stage, f), 'utf8').replace(/(from\s+'\.[^']*)\.ts'/g, "$1'")
    !== readFileSync(path.join(LIB, f), 'utf8')
  ));
  ok('🔴 EVERY ONE OF THE STAGED FILES PUTS BACK TO THE REAL ONE, byte for byte',
    drifted.length === 0);
  if (drifted.length) console.log('      drifted: ' + drifted.slice(0, 8).join(', '));
}

ok('🔴 AND THE REWRITE IS IDEMPOTENT, so a file staged twice never becomes ./x.ts.ts',
  withExt(withExt("import { a } from './x';")) === "import { a } from './x.ts';");
ok('a specifier that already carries an extension is left exactly as it is',
  withExt("import a from './x.json';") === "import a from './x.json';");
ok('a package specifier is never touched',
  withExt("import { z } from '@supabase/supabase-js';") === "import { z } from '@supabase/supabase-js';");
ok('a parent relative specifier is rewritten too, not only a sibling',
  withExt("import { a } from '../lib/x';") === "import { a } from '../lib/x.ts';");

// ---------------------------------------------------------------------------------------------
// 3. THE HELPER RESOLVES lib FROM ITSELF, WHICH IS WHAT MAKES A SABOTAGE PASS MEAN ANYTHING.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 3. the stage follows the copy, not the working directory ===\n');

const helper = read('test/stagelib.mjs');
const helperCode = codeOnly(helper);
// 🔴 THE STRIPPED SOURCE STILL HOLDS THE CODE, WHICH IS NOT A PEDANTIC CHECK. A glob written
// inside a line comment in the helper opens a block comment as far as this stripper is concerned,
// and it once swallowed all three exports, leaving every assertion below testing an empty string
// and passing for the wrong reason. This is the tripwire for that.
ok('🔴 THE COMMENT STRIPPER CAN STILL SEE THE HELPER, so nothing below passes over a blank',
  /export const LIB/.test(helperCode)
  && /export const withExt/.test(helperCode)
  && /export function stageLib/.test(helperCode));
ok('🔴 LIB IS RESOLVED FROM import.meta.url, NEVER FROM process.cwd()',
  /path\.resolve\(here, '\.\.\/lib'\)/.test(helperCode) && !/process\.cwd\(\)/.test(helperCode));
ok('🔴 AND THE WALK IS DERIVED rather than a list somebody has to keep up to date',
  /readdirSync\(libDir\)/.test(helperCode) && !/for \(const f of \[/.test(helperCode));
ok('the helper is not a suite, so run-all never tries to run it as one',
  !/stagelib\.test\.mjs/.test(read('test/run-all.mjs')) && existsSync(path.join(root, 'test/stagelib.mjs')));

// ---------------------------------------------------------------------------------------------
// 4. NO SUITE STAGES lib/propertyengine.ts BY HAND ANY MORE. Derived, so a new one cannot hide.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 4. and nobody has typed the list back ===\n');
{
  const handLists = [];
  const renamed = [];
  for (const f of readdirSync(path.join(root, 'test'))) {
    if (!f.endsWith('.test.mjs')) continue;
    let src;
    try { src = readFileSync(path.join(root, 'test', f), 'utf8'); } catch { continue; }
    const code = codeOnly(src);
    for (const m of code.matchAll(/for \(const f of \[([^\]]*)\]\)/g)) {
      if (/'propertyengine'/.test(m[1])) handLists.push(f);
    }
    if (/writeFileSync\(\s*\n?\s*path\.join\(\w+, '[a-z]*propertyengine\.ts'\)/.test(code)) renamed.push(f);
  }
  ok('🔴 NOT ONE SUITE NAMES propertyengine IN A HAND WRITTEN STAGING LIST', handLists.length === 0);
  if (handLists.length) console.log('      ' + handLists.join(', '));
  ok('🔴 AND NOT ONE STAGES IT FILE BY FILE EITHER, which is the same list without the brackets',
    renamed.length === 0);
  if (renamed.length) console.log('      ' + renamed.join(', '));
}

{
  // The suites that drive the property engine really do use the helper. Named so a deletion of the
  // helper cannot pass by making the checks above vacuous.
  const users = readdirSync(path.join(root, 'test'))
    .filter((f) => f.endsWith('.test.mjs'))
    .filter((f) => {
      try { return /from '\.\/stagelib\.mjs'/.test(readFileSync(path.join(root, 'test', f), 'utf8')); }
      catch { return false; }
    });
  ok('🔴 AND THE HELPER IS ACTUALLY USED BY THE SUITES THAT WOULD OTHERWISE HAVE A LIST',
    users.length >= 20);
  ok('...including the parity suite, which used to rename both engines to stop them colliding',
    users.includes('property-parity.test.mjs'));
  ok('...and the engine suite itself', users.includes('propertyengine.test.mjs'));
}

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

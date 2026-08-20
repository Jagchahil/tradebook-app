// B73. ONE DERIVED COPY OF lib/, SO A HAND WRITTEN LIST OF SIBLINGS CANNOT ROT AGAIN.
//
// ⚠️ THIS IS NOT A SUITE. run-all.mjs discovers files ending .test.mjs, so this one is never
// run on its own; it is imported by the suites that need a staged lib.
//
// 🔴 AND THAT SENTENCE USED TO BE WRITTEN AS A GLOB, WHICH BLINDED EVERY READER OF THIS FILE.
// The shared comment stripper in the suites looks for a block comment opener, and a glob inside a
// line comment contains one, so it swallowed everything from here down to the next block comment
// close and three exports vanished before any assertion saw them. Found the same afternoon this
// file was written. Section 3 of test/b73stagedlib.test.mjs now fails loudly if it happens again.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHAT THIS EXISTS TO STOP, MEASURED RATHER THAN ASSERTED. 20 August 2026.
//
// Node 22 strips types, but only resolves a relative import that carries its extension. So a suite
// that wants to drive lib/propertyengine.ts for real copies it to a scratch directory and rewrites
// `from './taxengine'` to `from './taxengine.ts'`. Twenty one suites did that with a HAND WRITTEN
// LIST of which siblings to bring, and each list was correct on the day it was typed.
//
// The bill arrived on 19 August. Adding ONE import to lib/propertyengine.ts turned 22 suites red at
// once, so the file the entire property engine lives in could not gain an import at all. B68 was
// then shaped around that: its fix had to be written import free, and it was, and the shape is
// good, but the reason it had to be was this file's absence. A constraint that changes how code
// gets written is not a test detail.
//
// The backlog already carried the rule in smaller print: "a hand written list of staged imports
// rots, and it has now cost two suites and caught a third." This is that rule at full scale.
//
// 🟢 SO THE LIST IS DERIVED. Every TypeScript file in lib is copied, every relative specifier gains its
// extension, and there is nothing left to keep up to date. A new lib file is staged the moment it
// exists. Same form test/b19threelanes.test.mjs has used since 17 August and the three suites
// written on 20 August copied.
//
// ⚠️ AND STAGING A FILE IS NOT IMPORTING IT. The module graph is decided by what the entry module
// imports, so bringing all 137 costs a few milliseconds of copying and changes no behaviour. What
// it buys is that the graph can GROW without a human editing 21 lists.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

// 🔴 RESOLVED FROM THIS FILE, NEVER FROM process.cwd(). A sabotage pass copies test/ and lib/ into a
// scratch tree and runs the suite there, so `../lib` has to mean the lib beside THIS copy. Reading
// the working directory instead would have every sabotage silently test the real repo and every
// one of them would be a hole.
export const LIB = path.resolve(here, '../lib');

// The one rewrite. A specifier that already carries an extension is left exactly as it is, so a
// suite that stages a file twice cannot end up with './x.ts.ts'.
// 🔴 AND "ALREADY HAS AN EXTENSION" MEANS A MODULE EXTENSION, NOT ANY DOT. lib/taxrules.ts and
// lib/universe.ts both import './claimrules.data', and a test for any trailing dotted word read
// '.data' as an extension, left the specifier bare, and produced a staged file Node could not
// resolve. Two real files in this repo, found by the guard in section 1 the hour it was written.
const MODULE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json)$/;
export const withExt = (src) => src.replace(/(from\s+')(\.[^']*?)(')/g, (m, a, spec, b) => (
  MODULE_EXT.test(spec) ? m : `${a}${spec}.ts${b}`
));

/**
 * Copy every TypeScript file in lib into a fresh scratch directory, imports resolvable.
 * Returns the directory. The caller imports out of it with pathToFileURL, exactly as before.
 */
export function stageLib(prefix = 'stagelib-', libDir = LIB) {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  for (const f of readdirSync(libDir)) {
    if (!f.endsWith('.ts')) continue;
    writeFileSync(path.join(dir, f), withExt(readFileSync(path.join(libDir, f), 'utf8')));
  }
  return dir;
}

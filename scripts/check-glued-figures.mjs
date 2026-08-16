// A FIGURE GLUED TO THE WORD AFTER IT, AND WHY tsc CANNOT SEE IT.
//
//   node scripts/check-glued-figures.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Run 6, 14 August 2026. /app/pay-yourself printed "On the £23,295of profit left after your
// salary" and /app/tax/summary printed "your own figures for 2026/27added up". Read off production
// with textContent and then by character code: 50,57,53,111,102, which is 2 9 5 o f. Nothing at
// all between the figure and the word.
//
// 🔴 THE SOURCE IS CORRECT IN ALL THREE PLACES. There is a real 0x20 between the expression and
// the word, dumped byte by byte to be sure. SWC, which is what Next.js compiles with, strips the
// leading whitespace of those JSX text runs. TypeScript does not. Running the repo's own
// TypeScript over the same files emitted the space every time:
//
//   FILE                  PRODUCTION           ts.transpileModule
//   pay-yourself   :269   "£23,295of profit"   "\" of profit le..."   space KEPT
//   tax/summary    :178   "2026/27added up"    "\" added up. Th..."   space KEPT
//   proof-of-income:203   glued               "\" of tax was t..."   space KEPT
//
// So `npx tsc --noEmit` is STRUCTURALLY INCAPABLE of finding this, and so is any guard built on
// the TypeScript parser. Two attempts to derive a source level rule over-predicted by 60 and by 14
// respectively. The compiled output is the only honest detector, which is why this runs in CI
// AFTER `npm run build` and not in test/run-all.mjs, which never builds.
//
// ⚠️ AND A CHECK THAT COULD NOT RUN IS NOT A CHECK THAT PASSED. With no build to read this exits
// NON ZERO and says so. That is the Run 5 lesson: Boolean({}) is true, and a job that cannot see
// its input must never report success.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 AND THE THIRD WAY IT COULD LIE, FOUND ON 16 AUGUST 2026 BY IT ACTUALLY DOING SO.
//
// The two guards above catch a MISSING build directory and an EMPTY one. They do not catch a
// STALE one, and a stale one is the quietest of the three because it prints a real number and a
// clean bill of health.
//
// What happened: `npm run build` failed in a Linux workspace with "Failed to load SWC binary for
// linux/arm64", because node_modules held the darwin binary. This script then read a `.next` from
// an earlier build and reported:
//
//     No glued figures. 354 compiled chunks scanned.        exit 0
//
// The real build on the machine that could do one said 355. So the scanner reported success over
// output that predated the source it claimed to have checked, and it did it in the middle of a fix
// batch that was changing the very files this guard exists to protect.
//
// ⚠️ THE FIX IS A CLOCK, NOT A COUNT. If anything under app/, lib/ or components/ is NEWER than
// the newest compiled chunk, the build cannot have seen it, so the scan proves nothing. That is
// true whatever the reason: a failed build, a forgotten build, an edit made after building.
//
// ⚠️ AND IT IS DELIBERATELY BLIND TO WHETHER THE EDIT MATTERED. A touched comment trips it exactly
// like a rewritten screen. The scanner has no way to tell the difference, and guessing would put
// it right back to reporting a pass it has not earned. Running `npm run build` again is cheap. A
// customer reading "£23,295of profit" is not.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

export const CHUNK_DIR = '.next/server/chunks/ssr';

// The directories that can put a JSX text run into a compiled chunk. test/ and scripts/ are not
// here on purpose: editing a test cannot change the output this scans.
export const SOURCE_DIRS = ['app', 'lib', 'components'];

/** The newest mtime under a set of roots, or null if none of them exist. */
export function newestMtimeMs(root, dirs) {
  let newest = null;
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      try {
        const { mtimeMs } = statSync(full);
        if (newest === null || mtimeMs > newest) newest = mtimeMs;
      } catch { /* a file that vanished mid walk is not evidence of anything */ }
    }
  };
  for (const d of dirs) {
    const full = path.resolve(root, d);
    if (existsSync(full)) walk(full);
  }
  return newest;
}

// In a compiled JSX children array a text child is a string literal. A string child that begins
// with a LETTER, directly after an expression, is a figure glued to the next word: prose after a
// figure always needs a space. Everything else here is there to keep out CSS, props and markup.
export function findGlued(src) {
  const out = [];
  const re = /([\w)\]])\s*,\s*"([a-zA-Z][^"\\]{6,})"/g;
  let m;
  while ((m = re.exec(src))) {
    const s = m[2];
    if (!/^[a-z]+ [a-z]/.test(s)) continue;      // prose, not an identifier
    if (/[{};:#=<>]/.test(s)) continue;          // not css, not markup
    if (!/[.,]/.test(s)) continue;               // a real sentence fragment
    const before = src.slice(Math.max(0, m.index - 80), m.index + 1);
    if (/jsx\)\("br"/.test(before)) continue;    // a line break needs no space
    if (!/children\s*:\s*\[/.test(src.slice(Math.max(0, m.index - 400), m.index))) continue;
    out.push(s.slice(0, 60));
  }
  return out;
}

function main() {
  const dir = path.resolve(process.cwd(), CHUNK_DIR);
  if (!existsSync(dir)) {
    process.stdout.write(
      `\n  NO BUILD TO SCAN at ${CHUNK_DIR}.\n`
      + '  This check reads the COMPILED output because tsc cannot see this class of defect.\n'
      + '  Run `npm run build` first. Exiting non zero: a check that could not run has not passed.\n\n',
    );
    process.exit(1);
  }
  const hits = [];
  let scanned = 0;
  let newestChunk = 0;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    scanned += 1;
    const full = path.join(dir, f);
    const { mtimeMs } = statSync(full);
    if (mtimeMs > newestChunk) newestChunk = mtimeMs;
    for (const glue of findGlued(readFileSync(full, 'utf8'))) {
      hits.push({ f, glue });
    }
  }
  if (scanned === 0) {
    process.stdout.write(`\n  ${CHUNK_DIR} EXISTS BUT HOLDS NO CHUNKS. Same rule: exiting non zero.\n\n`);
    process.exit(1);
  }

  // 🔴 IS THIS BUILD OLDER THAN THE CODE IT CLAIMS TO HAVE COMPILED. See the header block.
  // Null means there is no source tree here at all to compare against, which is the case in the
  // synthetic fixtures the guards build, and there is nothing to be stale RELATIVE TO. The three
  // checks above have already proved there is a real chunk directory with real chunks in it.
  const newestSource = newestMtimeMs(process.cwd(), SOURCE_DIRS);
  if (newestSource !== null && newestSource > newestChunk) {
    const behindSeconds = Math.round((newestSource - newestChunk) / 1000);
    process.stdout.write(
      `\n  THE BUILD IS OLDER THAN THE SOURCE, by ${behindSeconds}s.\n`
      + `  ${scanned} chunks are here and they were compiled BEFORE the newest file under `
      + `${SOURCE_DIRS.join(', ')}.\n`
      + '  So this scan says nothing about the code you have. Run `npm run build` and try again.\n'
      + '  Exiting non zero: a check that read the wrong input has not passed.\n\n',
    );
    process.exit(1);
  }
  if (hits.length > 0) {
    process.stdout.write(`\n  ${hits.length} FIGURE(S) GLUED TO THE WORD AFTER THEM:\n\n`);
    for (const h of hits) process.stdout.write(`    ${h.f}\n      ...glued to> "${h.glue}"\n`);
    process.stdout.write(
      '\n  The source almost certainly LOOKS right. SWC strips the leading space of a JSX text run\n'
      + "  that follows an expression. Put {' '} at the end of the line before it, as this codebase\n"
      + '  already does in sixteen places in these same files.\n\n',
    );
    process.exit(1);
  }
  process.stdout.write(`\n  No glued figures. ${scanned} compiled chunks scanned, all newer than your source.\n\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();

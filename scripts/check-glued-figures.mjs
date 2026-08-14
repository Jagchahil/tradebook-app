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
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export const CHUNK_DIR = '.next/server/chunks/ssr';

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
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    scanned += 1;
    for (const glue of findGlued(readFileSync(path.join(dir, f), 'utf8'))) {
      hits.push({ f, glue });
    }
  }
  if (scanned === 0) {
    process.stdout.write(`\n  ${CHUNK_DIR} EXISTS BUT HOLDS NO CHUNKS. Same rule: exiting non zero.\n\n`);
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
  process.stdout.write(`\n  No glued figures. ${scanned} compiled chunks scanned.\n\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();

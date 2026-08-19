// THE ONE DOOR ONTO HIS FIGURES, AND WHAT A PAGE SAYS WHEN IT WILL NOT OPEN. B24, 19 August 2026.
//
//   node test/optimiserdoor.test.mjs
//
// ═════════════════════════════════════════════════════════════
// WHY THIS SUITE EXISTS.
//
// getOptimiserInput fails in TWO shapes and eleven pages asked about neither.
//
//   1. IT THROWS, and a server rendered page hands him a Next error boundary.
//   2. IT RESOLVES CARRYING rowsUnreadable, which does NOT throw, and hands back the same object
//      with every figure of his at zero.
//
// Shape 2 is the one that did the damage, because it is invisible. A man whose database was
// unreadable for ten seconds opened his Tax page and read that he had earned nothing, spent
// nothing and owed nothing, in the same confident type the true figures wear. lib/taxoptimiser.ts
// wrote the cost down on the day the field was added and nobody had come back for it.
//
// ⚠️ AND THE THING THIS SUITE REFUSES TO DO IS HOLD A LIST OF ELEVEN. B24 exists because a list
// was how the doors were counted, and a list of eleven is wrong the first time somebody adds a
// twelfth. So section 3 DERIVES the callers off disk and requires EVERY page among them to reach
// the signed line. A twelfth page that reaches it passes without anybody editing this file, and a
// twelfth that does not goes red on the gate that same minute.
//
// ⚠️ AND IT PROVES THE INSTRUMENT FIRST. Section 0 feeds the very same scanner a planted page that
// calls the reader and never reaches the line, and fails if the scanner calls it clean. A scanner
// that cannot see a miss reports zero misses for ever, which is exactly how eleven bare doors got
// to production.
// ═════════════════════════════════════════════════════════════

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  ok  ${name}`); } else { fail += 1; console.log(`  FAIL ${name}`); }
};

// Assert on the CODE, never on the prose around it. Safe form of the line comment strip, so a
// `https://` inside a string is not truncated: this repo has been bitten by the naive one four
// times. JSX block comments come out too, because a page's argument for its own guard is written
// in one and must not be able to satisfy the guard.
const codeOnly = (s) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// ── THE SCANNER, WRITTEN AS A PURE FUNCTION SO SECTION 0 CAN PROVE IT BITES ──────────────────
//
// A file is a DOOR if its code calls either name. It is a PAGE door or a ROUTE door by the file
// name Next itself gives them, which is a fact about the framework rather than a list we keep.
const CALLS_READER = /(?:getOptimiserInput|readOptimiserOrNull)\s*\(/;
const REACHES_LINE = /RecordsUnreadable/;

const isDoor = (code) => CALLS_READER.test(code);
const pageMissesTheLine = (file, code) => file.endsWith('page.tsx') && isDoor(code) && !REACHES_LINE.test(code);

// ── 0. THE INSTRUMENT, BEFORE ANY VERDICT ────────────────────────────────────────────────────
{
  const planted = 'const optimiser = await readOptimiserOrNull(user.id);\nreturn <main>{gbp0(0)}</main>;';
  ok('🔴 the scanner SEES a page door that never reaches the line',
    pageMissesTheLine('app/app/planted/page.tsx', planted) === true);
  ok('🔴 ...and clears the same page once it does',
    pageMissesTheLine('app/app/planted/page.tsx', `${planted}\nif (!optimiser) return <RecordsUnreadable current="/app" />;`) === false);
  ok('🔴 ...and a mention in a COMMENT is not a call, so codeOnly is doing work',
    isDoor(codeOnly('// getOptimiserInput(user.id) is what this used to do\nconst x = 1;')) === false);
  ok('🔴 ...and the line inside a JSX comment does not clear a door',
    pageMissesTheLine('app/app/planted/page.tsx', codeOnly(`${planted}\n{/* RecordsUnreadable would go here */}`)) === true);
  ok('🔴 ...and a ROUTE is never judged by the page rule, or the count in section 5 is a lie',
    pageMissesTheLine('app/api/planted/route.ts', planted) === false);
}

// ── 1. THE SENTENCE, VERBATIM, AND IT LIVES ONCE ─────────────────────────────────────────────
//
// Signed by delegation on 18 August 2026 and recorded in the backlog in these exact words. It is
// asserted character for character because it is customer copy: a session may not soften it,
// lengthen it or add a promise to it without Jag signing the new one.
const SIGNED = 'Lekhio could not read your records just now, so this page is not showing figures. Nothing has happened to your books. Refresh in a minute.';
const componentSrc = read('app/app/RecordsUnreadable.tsx');
{
  ok('🔴 the signed line is in RecordsUnreadable.tsx, character for character',
    componentSrc.includes(SIGNED));
  ok('🔴 ...as the ONE exported constant, so no door can carry its own copy',
    /export const RECORDS_UNREADABLE_LINE = '/.test(codeOnly(componentSrc)));
  ok('🔴 ...and it says nothing has happened to his books, which is the half that stops him panicking',
    SIGNED.includes('Nothing has happened to your books.'));
  ok('🔴 ...and it tells him when to come back rather than offering him a button to press',
    SIGNED.includes('Refresh in a minute.') && !/<button/i.test(codeOnly(componentSrc)));
  // The component is the only route to the sentence, so a page reaching the component reaches it.
  ok('🔴 the component renders the constant rather than a second copy of the words',
    /\{RECORDS_UNREADABLE_LINE\}/.test(codeOnly(componentSrc)));
  ok('🔴 ...and it keeps the nav, so the one screen telling him something broke does not strand him',
    /<AppNav/.test(codeOnly(componentSrc)));
  // The whole estate, so a second wording cannot appear anywhere and quietly diverge.
  const carriers = [];
  const walk = (dir) => {
    for (const e of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      // Dot directories are tooling, never product source, and app/.node holds broken symlinks
      // that make a naive stat walk die rather than report.
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) { walk(rel); continue; }
      if (!e.isFile() || !/\.(ts|tsx)$/.test(e.name)) continue;
      if (read(rel).includes('could not read your records just now')) carriers.push(rel);
    }
  };
  walk('app'); walk('lib');
  ok('🔴 the sentence is typed in exactly ONE file in app/ and lib/, derived',
    carriers.length === 1 && carriers[0] === 'app/app/RecordsUnreadable.tsx');
}

// ── 2. THE DOOR BEHAVES, AND THIS IS BEHAVIOUR RATHER THAN SPELLING ──────────────────────────
//
// readOptimiserOrNull's own body is lifted out of lib/supabase.ts and RUN, with getOptimiserInput
// injected, against the two failure shapes and a good read. A comment cannot satisfy this and a
// rename cannot break it. B41's lesson, applied to a door instead of to a formatter.
const supabaseSrc = read('lib/supabase.ts');
{
  const at = supabaseSrc.indexOf('export async function readOptimiserOrNull(');
  ok('🔴 readOptimiserOrNull exists in lib/supabase.ts', at !== -1);

  const open = supabaseSrc.indexOf('{', at);
  const end = supabaseSrc.indexOf('\n}', open);
  const body = supabaseSrc.slice(open + 1, end);
  ok('🔴 ...and its body could be lifted whole', body.includes('return input'));

  const build = (stub) => new Function('getOptimiserInput', `return async function readOptimiserOrNull(userId) {${body.replace(/:\s*OptimiserInput[^\n]*/g, '')}\n}`)(stub);

  const thrower = build(async () => { throw new Error('fetch failed'); });
  const unreadable = build(async () => ({ rowsUnreadable: true, ytdTradeIncome: 0, ytdTradeExpenses: 0 }));
  const good = build(async () => ({ rowsUnreadable: false, ytdTradeIncome: 4081.8, ytdTradeExpenses: 12 }));
  const results = await Promise.all([thrower('u'), unreadable('u'), good('u')]);

  ok('🔴 SHAPE 1, A THROWN READ, comes back as null rather than as an error boundary',
    results[0] === null);
  ok('🔴 SHAPE 2, rowsUnreadable, comes back as null rather than as a year of zeros',
    results[1] === null);
  ok('🔴 ...and a read that WORKED is handed straight through, untouched',
    results[2] !== null && results[2].ytdTradeIncome === 4081.8);
  // The vacuity check on this section: a door that returned null for everything would pass the two
  // above and be useless, and a door that returned the object for everything would pass the third.
  ok('🔴 ...so the door can tell the three apart, which is the only thing that makes it a door',
    results[0] === null && results[1] === null && results[2] !== null);
}

// ── 3. EVERY PAGE DOOR REACHES THE LINE. DERIVED OFF DISK, NEVER LISTED ──────────────────────
const doors = [];
{
  const walk = (dir) => {
    for (const e of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      // Same rule as section 1's walk, and for the same reason: a dot directory is tooling.
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) { walk(rel); continue; }
      if (!e.isFile() || !/\.(ts|tsx)$/.test(e.name)) continue;
      const code = codeOnly(read(rel));
      if (isDoor(code)) doors.push({ rel, code });
    }
  };
  walk('app');

  const pages = doors.filter((d) => d.rel.endsWith('page.tsx'));
  const routes = doors.filter((d) => d.rel.endsWith('route.ts'));

  // The floor, not the number. It stops a broken walk reporting "all clear" over an empty set,
  // and it deliberately does NOT pin eleven, because a twelfth page is allowed to exist.
  ok('🔴 the walk found the page doors at all, so a silent empty set cannot pass as clean',
    pages.length >= 11);
  ok('🔴 ...and every other file under app/ is accounted for as a page or a route',
    pages.length + routes.length === doors.length);

  const missing = pages.filter((d) => pageMissesTheLine(d.rel, d.code)).map((d) => d.rel);
  ok(`🔴 EVERY page door reaches the signed line, all ${pages.length} of them, derived (${missing.join(', ') || 'none missing'})`,
    missing.length === 0);

  // And not through a lookalike: each one names the component this suite has just proved carries
  // the constant, so there is exactly one wording in the product.
  const byName = pages.filter((d) => /RecordsUnreadable/.test(d.code) && /from '[^']*RecordsUnreadable'/.test(d.code));
  ok('🔴 ...and every one of them imports it from app/app/RecordsUnreadable, not a local copy',
    byName.length === pages.length);

  // The old bare name is gone from the pages entirely, so nobody can add a twelfth by copying a
  // sibling that still calls the raw read.
  const raw = pages.filter((d) => /getOptimiserInput\s*\(/.test(d.code)).map((d) => d.rel);
  ok(`🔴 no page calls the raw getOptimiserInput any more (${raw.join(', ') || 'none'})`,
    raw.length === 0);

  // 🔴 INSTEAD OF THE FIGURES, NEVER AS WELL AS THEM, AND THAT IS A DIFFERENT ASSERTION.
  //
  // A page that printed the line at the bottom of a screen of zeros would satisfy every check
  // above and would be the original fault with an apology stapled to it. So the line has to sit
  // where the null is: an early RETURN, or a ternary ARM. Both shapes are walked by a real page,
  // which is this file's own rule about unexercised alternatives: the return by the ten screens
  // whose figures ARE the page, the arm by /app/setup, which is mid signup and still owes him the
  // step he is standing on.
  //
  // ⚠️ AND IT MATCHES THE SHAPE RATHER THAN THE LOCAL'S NAME. Pinning `optimiser` would make a
  // rename go red, and a guard that a rename can break is a guard about a name.
  const PLACED = /(?:if \(!\w+\)\s*return\s*<RecordsUnreadable|\w+ === null \? \(\s*<RecordsUnreadable)/;
  const misplaced = pages.filter((d) => !PLACED.test(d.code)).map((d) => d.rel);
  ok(`🔴 every page shows the line INSTEAD of its figures, at the null, not underneath them (${misplaced.join(', ') || 'all placed'})`,
    misplaced.length === 0);
  ok('🔴 ...and BOTH placements are really used, so neither alternative is a hole with a name',
    pages.some((d) => /if \(!\w+\)\s*return\s*<RecordsUnreadable/.test(d.code))
    && pages.some((d) => /\w+ === null \? \(\s*<RecordsUnreadable/.test(d.code)));
}

// ── 4. THE ROUTES, COUNTED AND NAMED AS OUT OF SCOPE, WITH THE ARGUMENT ──────────────────────
//
// 🔴 THE DECISION, WRITTEN DOWN SO NOBODY RE DERIVES IT. Seven route.ts files hold THIRTEEN more
// calls, measured at head on 19 August 2026, and they are NOT in B24. The reason is not that they
// do not matter. It is that the signed sentence is a PAGE sentence: it says "this page is not
// showing figures", and no JSON endpoint, WhatsApp reply or chat answer can say it. A route needs
// a DIFFERENT sentence, that sentence is customer copy, and customer copy is Jag's to sign. The
// measurement is in the handback: five distinct failure behaviours across the thirteen, two of the
// seven are answering routers so the "wire three, say three" rule drags in a lane audit, and
// /api/ledger and /api/optimise are read only by the phone app, which is built and not shipped.
//
// ⚠️ SO THE COUNT IS PINNED, AND ONLY THE COUNT. A fourteenth route call reddens this on the gate
// the minute it is written, and whoever wrote it has to decide rather than inherit a silence. That
// is the whole lesson of B24 applied one level up: the thing that rots is an unwatched number.
{
  const routes = doors.filter((d) => d.rel.endsWith('route.ts'));
  const calls = routes.reduce((n, d) => n + (d.code.match(CALLS_READER) ? d.code.match(/(?:getOptimiserInput|readOptimiserOrNull)\s*\(/g).length : 0), 0);
  ok(`🔴 seven route files hold the optimiser read, derived (${routes.length})`, routes.length === 7);
  ok(`🔴 ...and thirteen calls between them, the number the decision was made on (${calls})`, calls === 13);
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

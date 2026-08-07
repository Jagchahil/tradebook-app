// THE RATCHET FOR TIER TWO ITEM I. Every page under app/app must carry HIS OWN destination
// through the sign in door, not just some of them. Run: node test/signinnext.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 FOUND 7 AUGUST 2026. 36 of the 37 pages under app/app bounced a signed out man to a bare
// `/in`, carrying no next=. He followed a link to his VAT page, proved who he is, and landed on
// the dashboard, one click from the thing he actually came for. Only app/app/you/billing did it
// right, because the footer's "Manage subscription" needed it first.
//
// lib/websession.ts's safeNext() and the /in and /api/auth/* doors that read it were already
// correct: the RECEIVING half of this was built. The SENDING half, one line per page, was not.
//
// ⚠️ WHY THIS IS 36 EDITS AND NOT ONE SHARED HELPER.
//
// The obvious fix is a shared guard: one function every page calls, or a check in
// app/app/layout.tsx that runs before any page renders. Both were tried on paper and both are
// blocked by test/webauth.test.mjs, which this suite does not own and must not fight:
//
//   . its `unguarded` check requires every page.tsx to contain the literal substring
//     'userFromSessionCookie' or 'sessionUser' IN ITS OWN SOURCE. A page that only calls a
//     shared helper, with the cookie read moved out of it, stops containing that substring and
//     the existing test goes red on all 37 at once.
//   . its `IN_REDIRECT` check requires a literal `redirect('/in...')` call with a STRING literal
//     argument (starts with a quote, immediately). `redirect(someHelper(path))` and
//     `redirect(\`/in?next=${x}\`)` both start with something other than a quote and neither
//     matches, so a route through a shared function or a template literal reads as "does not
//     redirect to /in at all" and fails that same test.
//
// Both routes to a shared runtime helper were checked and both fail an existing, un-owned test
// rather than the bug they were meant to fix. So this is the 36, each carrying its own literal,
// pre-encoded `redirect('/in?next=...')`, exactly the shape app/app/you/billing already used.
// See the return packet for the full reasoning; this file is the ratchet that follows from it.
//
// ⚠️ AND THE RATCHET WALKS THE FILESYSTEM RATHER THAN A LIST OF 37 NAMES, so it fails the build
// the day somebody adds page 38 and forgets, not merely today's count.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const appDir = path.join(repo, 'app/app');

const W = await import(pathToFileURL(path.join(repo, 'lib/websession.ts')).href);

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); } else { fail += 1; console.log(`  FAIL  ${name}`); }
};

// Same walk as test/webauth.test.mjs: dot directories and symlinks skipped. app/.node/bin/corepack
// is a broken symlink committed into this repo and lstat, never stat, is why walking it is safe.
function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e.startsWith('.') || e === 'node_modules') continue;
    const p = path.join(dir, e);
    let st;
    try { st = lstatSync(p); } catch { continue; }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) walk(p, out);
    else if (e === 'page.tsx') out.push(p);
  }
  return out;
}

const read = (p) => readFileSync(p, 'utf8');
const rel = (p) => path.relative(repo, p);

const pages = walk(appDir).sort();

console.log('\n1. EVERY PAGE, WALKED FRESH, NOT A HARDCODED LIST');
ok('the walk actually found pages, so this is not vacuous', pages.length > 30);
console.log(`   ${pages.length} page.tsx files found under app/app`);

// The route a page.tsx OWES, derived from where it lives, never from what its author typed. The
// root page maps to exactly /app; everything else is /app plus its folder path, slashes and all.
function ownRoute(file) {
  const relFromApp = path.relative(appDir, file).replace(/\\/g, '/');
  const dir = path.dirname(relFromApp);
  return dir === '.' ? '/app' : `/app/${dir}`;
}

console.log('\n2. EVERY PAGE CARRIES next=, AND IT IS ITS OWN ROUTE, NOT SOME OTHER PAGE\'S');
const REDIRECT_CALL = /redirect\(\s*(['"])(\/in[^'"]*)\1\s*\)/;

const problems = [];
for (const file of pages) {
  const src = read(file);
  const m = REDIRECT_CALL.exec(src);
  const expected = ownRoute(file);

  if (!m) {
    problems.push(`${rel(file)}: no redirect('/in...') found at all`);
    continue;
  }

  const target = m[2]; // e.g. "/in?next=%2Fapp%2Ftax%2Fvat" or bare "/in"
  const qIdx = target.indexOf('?next=');
  if (qIdx === -1) {
    problems.push(`${rel(file)}: 🔴 redirects to '${target}' with NO next=, so a signed out visitor loses his destination and lands on the dashboard`);
    continue;
  }

  const rawNext = target.slice(qIdx + '?next='.length);
  let decoded;
  try { decoded = decodeURIComponent(rawNext); } catch { decoded = null; }

  if (decoded === null) {
    problems.push(`${rel(file)}: next= is not validly percent-encoded ('${rawNext}')`);
    continue;
  }
  if (decoded !== expected) {
    problems.push(`${rel(file)}: next= decodes to '${decoded}', but this page's own route is '${expected}'`);
    continue;
  }
  // 🔴 AND IT MUST BE SOMETHING safeNext() WOULD ACTUALLY LET THROUGH UNCHANGED. A next= that
  // safeNext() would rewrite is a page quietly promising a destination it can never deliver.
  if (W.safeNext(decoded) !== decoded) {
    problems.push(`${rel(file)}: next='${decoded}' is not one safeNext() allows through unchanged`);
  }
}

ok(
  `🔴 EVERY PAGE UNDER app/app SENDS A SIGNED OUT VISITOR BACK TO ITSELF${problems.length ? `:\n     ${problems.join('\n     ')}` : ''}`,
  problems.length === 0,
);

console.log('\n3. THE OLD BUG, NAMED, STAYS DEAD');
// Anchoring on the exact shape of the original defect: a bare redirect('/in') with nothing after
// it. This is a subset of section 2 above, kept separate and worded plainly so a regression here
// reads as "the 7 August bug is back" rather than a generic diff.
const bare = pages.filter((f) => /redirect\(\s*['"]\/in['"]\s*\)/.test(read(f)));
ok(
  `🔴 NO PAGE REDIRECTS TO A BARE '/in' WITH NO next=${bare.length ? `: ${bare.map(rel).join(', ')}` : ''}`,
  bare.length === 0,
);

console.log('\n4. safeNext() IS AN ALLOWLIST, NOT A SANITISER: THE SHAPES IT MUST REFUSE');
// 🔴 SECURITY. The five shapes lib/websession.ts's own header names as real bypasses, executed
// against the real function, not merely read. Each must come back exactly AFTER_SIGN_IN, or a
// crafted next= could send a signed in man somewhere we did not choose.
const AFTER = W.AFTER_SIGN_IN;
ok('AFTER_SIGN_IN is the dashboard, so the refusals below are checked against the real default', AFTER === '/app');

const refused = [
  ['protocol relative URL', '//evil.example'],
  ['a scheme', 'https://evil.example'],
  ['a scheme hidden after the allowlisted prefix', '/app/https://evil.example'],
  ['a backslash', '/\\evil.example'],
  ['a backslash after the allowlisted prefix (browsers fold \\ to /)', '/app/\\evil.example'],
  ['an encoded protocol relative form, as delivered after one round of query decoding', '//evil.example'],
  ['a path that escapes with .. ', '/app/../../evil.example'],
  ['a single .. climb', '/app/../evil.example'],
  ['userinfo smuggling a real host after an @ ', 'https://lekhio.app@evil.example'],
  ['not a string at all', 42],
  ['empty', ''],
  ['over length', '/app/' + 'x'.repeat(200)],
];
for (const [label, input] of refused) {
  ok(`🔴 safeNext refuses ${label}: ${JSON.stringify(input)}`, W.safeNext(input) === AFTER);
}

// ⚠️ A FINDING BEYOND THE FIVE NAMED SHAPES. NOT ASSERTED HERE, BECAUSE lib/websession.ts IS NOT
// OWNED BY THIS LANE AND A FAILING ASSERTION AGAINST A FILE THIS SUITE CANNOT FIX WOULD JUST
// LEAVE THE GATE PERMANENTLY RED. Printed instead, every run, so it cannot be missed either.
//
// A next= that is DOUBLE percent-encoded survives Next's one round of query string decoding as a
// literal string containing '%2e%2e' rather than '..', so safeNext's own `v.includes('..')` check
// never sees a dot to refuse. safeNext returns it UNCHANGED, because it starts with '/app/' and
// contains none of the characters the function screens for. It is still confined to this OWN
// origin (there is no way to manufacture a bare '//' or a scheme this way), but new URL(next, ...),
// exactly what app/api/auth/verify/route.ts calls to build the real redirect, collapses the
// percent-encoded dot segment the way a browser's own URL parser does, and the destination lands
// OUTSIDE /app on this site. Reported in the return packet, first line. lib/websession.ts is not
// touched here.
{
  const smuggled = '/app/%2e%2e/team';
  const out = W.safeNext(smuggled);
  const resolvesOutsideApp = (() => {
    try { return !new URL(out, 'https://lekhio.app/api/auth/verify').pathname.startsWith('/app'); } catch { return false; }
  })();
  console.log(
    `  NOTE  known gap in lib/websession.ts (not owned by this lane): safeNext(${JSON.stringify(smuggled)}) `
    + `= ${JSON.stringify(out)}; new URL() later resolves it outside /app: ${resolvesOutsideApp}. See the return packet.`,
  );
}

console.log('\n5. THE PAGE THAT ALREADY DID THIS RIGHT STILL DOES, THE SAME WAY AS EVERYONE ELSE');
const billing = path.join(appDir, 'you/billing/page.tsx');
ok('app/app/you/billing/page.tsx exists and was walked', pages.includes(billing));
ok(
  "billing's own next= is /app/you/billing, no special case needed any more",
  read(billing).includes("redirect('/in?next=%2Fapp%2Fyou%2Fbilling')"),
);

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

// THE next= ALLOWLIST, HELD DOWN BY A TABLE. Run: node test/nextallowlist.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 FOUND 7 AUGUST 2026. safeNext() SCREENED THE STRING IT WAS GIVEN AND NOT THE PATH THAT
// GOT USED, AND THOSE ARE TWO DIFFERENT THINGS.
//
// `safeNext('/app/%2e%2e/team')` came back UNCHANGED. There was no `..` in it for the old
// `v.includes('..')` to find, it started with `/app/`, and it carried none of the screened
// characters. Then app/api/auth/verify/route.ts did what it has always done with the answer:
//
//     return NextResponse.redirect(new URL(next, req.url), 303);
//
// and the URL parser, which treats a percent encoded dot as a dot when it collapses dot
// segments, turned it into `/team`. The upper case `%2E%2E` did the same, and so did the half
// encoded `.%2e` and `%2e.` forms nobody had written down.
//
// ⚠️ THE SIZE OF IT, SAID HONESTLY, BECAUSE OVERSTATING IT IS ALSO A LIE. That is a SAME ORIGIN
// escape from the `/app` allowlist and NOT an open redirect. The `//` and scheme guards held, so
// it could never be aimed at another website, and every internal page it could reach carries its
// own authorisation. It landed a signed in customer somewhere other than his dashboard. Defence
// in depth failing, not books being read, and not new either: safeNext had been that shape for
// weeks. It was found on the day 36 more pages started feeding this function, which is the only
// reason it mattered enough to fix on a Friday.
//
// ⚠️ WHY THIS SUITE IS A TABLE AND NOT AN ARGUMENT.
//
// The losing move here is a blocklist: add `%2e`, then somebody finds `%252e`, then `%c0%ae`,
// then a fullwidth full stop, and each round is a discussion. So the fix validates the RESOLVED
// pathname rather than the raw string, and this file is the table that fix has to satisfy. The
// next person who thinks of a shape adds a ROW. He does not have to win an argument, and he
// cannot quietly decide it does not count.
//
// ⚠️ AND IT RUNS THE REAL ROUTE, NOT ONLY THE FUNCTION. Section 5 stages the real
// app/api/auth/verify/route.ts with the real lib/websession.ts and reads the Location header off
// the 303 it returns, because a guard that satisfies safeNext in isolation and still hands the
// browser `/team` has fixed nothing. Same staging technique as test/webauth.test.mjs section 10.
// Nothing leaves the machine: fetch is replaced by a fake GoTrue.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, readdirSync, lstatSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const read = (p) => readFileSync(p, 'utf8');

// lib/websession.ts imports nothing but node:crypto, so it loads straight through Node's type
// stripping with no staging, exactly as test/webauth.test.mjs loads it.
const W = await import(pathToFileURL(path.join(repo, 'lib/websession.ts')).href);
const AFTER = W.AFTER_SIGN_IN;

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); } else { fail += 1; console.log(`  FAIL  ${name}`); }
};

// ⚠️ THE ONE LINE THAT MATTERS, COPIED FROM THE ROUTE. Every assertion about "where does he
// actually land" goes through this, because this is what app/api/auth/verify/route.ts does with
// whatever safeNext hands back, and it is also what a browser does with a Location header.
const landsOn = (value) => {
  try { return new URL(value, 'https://lekhio.app/api/auth/verify').pathname; } catch { return '(threw)'; }
};
const insideApp = (p) => p === AFTER || p.startsWith(`${AFTER}/`);

console.log('\n1. THE GROUND THIS SUITE STANDS ON');
ok('AFTER_SIGN_IN is the dashboard, so every refusal below is measured against the real default', AFTER === '/app');
ok('the resolver used here really does collapse an encoded dot segment, so section 2 is not vacuous',
  landsOn('/app/%2e%2e/team') === '/team');
ok('...and it collapses the upper case form too', landsOn('/app/%2E%2E/team') === '/team');
ok('...and the half encoded form, which is the one nobody writes down', landsOn('/app/.%2e/team') === '/team');

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 2. THE TABLE.
//
// [ what it is, what is sent, what safeNext must return ]
//
// `AFTER` means refused, and refused means he lands on his dashboard. Anything else means the
// value is allowed through byte identical. There is deliberately no third outcome: safeNext
// either refuses or returns exactly what it was given, so a reviewer never has to work out what
// a "repaired" value became.
//
// ⚠️ ADDING A SHAPE IS ADDING A ROW. If you find a form that gets through, put it here first and
// watch this suite go red, then fix lib/websession.ts. A shape that is only ever discussed in a
// packet is a shape that comes back.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const TABLE = [
  // ── The escape as found. Five spellings of one climb, all of which the parser collapses.
  ['encoded dot dot, lower case', '/app/%2e%2e/team', AFTER],
  ['encoded dot dot, upper case', '/app/%2E%2E/team', AFTER],
  ['encoded dot dot, mixed case', '/app/%2e%2E/team', AFTER],
  ['half encoded dot dot, real dot first', '/app/.%2e/team', AFTER],
  ['half encoded dot dot, real dot last', '/app/%2e./team', AFTER],
  ['two encoded climbs in one value', '/app/%2e%2e/%2e%2e/team', AFTER],
  ['three encoded climbs in one value', '/app/%2e%2e/%2e%2e/%2e%2e/team', AFTER],
  ['an encoded climb that first goes deeper', '/app/x/%2e%2e/%2e%2e/team', AFTER],
  ['an encoded single dot segment, which the parser also removes', '/app/%2e/team', AFTER],

  // ── Encoding the encoding. The reason a blocklist of encodings is a losing game.
  ['double encoded dot dot', '/app/%252e%252e/team', AFTER],
  ['triple encoded dot dot', '/app/%25252e%25252e/team', AFTER],
  ['overlong UTF8 dot, two byte', '/app/%c0%ae%c0%ae/team', AFTER],
  ['overlong UTF8 dot, three byte', '/app/%e0%80%ae%e0%80%ae/team', AFTER],
  ['the IIS style %u escape', '/app/%uff0e%uff0e/team', AFTER],
  ['a one dot leader, percent encoded as UTF8', '/app/%e2%80%a4%e2%80%a4/team', AFTER],

  // ── Unicode characters that read as a dot or a slash to a human.
  ['one dot leader U+2024, raw', '/app/․․/team', AFTER],
  ['fullwidth full stop U+FF0E, raw', '/app/．．/team', AFTER],
  ['ideographic full stop U+3002, raw', '/app/。。/team', AFTER],
  ['fullwidth solidus U+FF0F, raw', '/app／team', AFTER],

  // ── Encoded separators and encoded escapes.
  ['encoded slash after an encoded climb', '/app/%2e%2e%2fteam', AFTER],
  ['encoded slash after a real climb', '/app/..%2fteam', AFTER],
  ['encoded slashes making a protocol relative form', '/app/%2f%2fevil.example', AFTER],
  ['fully encoded climb and slash', '/app/%2f..%2f..%2fteam', AFTER],
  ['encoded backslash', '/app/%5cevil.example', AFTER],
  ['encoded backslash before the prefix has ended', '/app%5c%5cevil.example', AFTER],
  ['an encoded climb wearing a path parameter', '/app/%2e%2e;/team', AFTER],

  // ── NUL, CR and LF, encoded and raw. A Location header is a header.
  ['encoded NUL', '/app/%00/team', AFTER],
  ['encoded NUL used to truncate', '/app/team%00.png', AFTER],
  ['raw NUL', '/app\u0000/team', AFTER],
  ['encoded CR LF, a header injection attempt', '/app/%0d%0aFoo', AFTER],
  ['raw CR LF', '/app/team\r\nFoo', AFTER],
  ['encoded tab, which the parser would have stripped', '/app/%09/team', AFTER],
  ['raw tab, which the parser would have stripped', '/app\t/team', AFTER],

  // ── The five shapes the file's own header always named. They held before and they hold now.
  ['protocol relative', '//evil.example', AFTER],
  ['protocol relative, encoded', '%2f%2fevil.example', AFTER],
  ['backslash protocol relative', '/\\evil.example', AFTER],
  ['slash then backslash', '/\\/evil.example', AFTER],
  ['a raw backslash after the prefix', '/app/\\evil.example', AFTER],
  ['an absolute URL', 'https://evil.example', AFTER],
  ['an absolute URL with a mixed case scheme', 'HtTpS://evil.example', AFTER],
  ['the javascript scheme', 'javascript:alert(1)', AFTER],
  ['a scheme hidden after the allowlisted prefix', '/app/https://evil.example', AFTER],
  ['userinfo smuggling a real host after an at sign', 'https://lekhio.app@evil.example', AFTER],
  ['an at sign inside the path', '/app/@evil.example', AFTER],
  ['a real climb', '/app/../team', AFTER],
  ['a real climb, twice', '/app/../../evil.example', AFTER],
  ['a real climb wearing a path parameter', '/app/..;/team', AFTER],
  ['a double slash inside the path', '/app//team', AFTER],
  ['a fragment', '/app/team#/../x', AFTER],
  ['a query string', '/app/team?next=//evil.example', AFTER],
  ['leading whitespace then a protocol relative form', '  //evil.example', AFTER],

  // ── Prefix confusion. `/appfoo` is not under `/app`.
  ['prefix confusion, no separator', '/appfoo', AFTER],
  ['prefix confusion carrying a climb', '/appfoo/../team', AFTER],
  ['prefix confusion, encoded separator', '/app%2fteam', AFTER],

  // ── Shapes that are not attacks, and still are not destinations.
  ['a trailing slash, which no page ever sends', '/app/', AFTER],
  ['not a string, a number', 42, AFTER],
  ['not a string, null', null, AFTER],
  ['not a string, undefined', undefined, AFTER],
  ['not a string, an object', {}, AFTER],
  ['not a string, an array holding a good path', ['/app/tax'], AFTER],
  ['empty', '', AFTER],
  ['whitespace only', '   ', AFTER],
  ['over the length cap', `/app/${'x'.repeat(200)}`, AFTER],

  // ── 🔴 AND THE ONES THAT MUST STILL WORK. 37 pages send these. Break one and a man proves who
  //    he is and lands somewhere he did not ask for, which is the bug the 36 edits just fixed.
  ['the dashboard itself', '/app', '/app'],
  ['a real route, one level', '/app/tax', '/app/tax'],
  ['a real route, two levels', '/app/tax/vat', '/app/tax/vat'],
  ['a real route with hyphens in the name', '/app/tax/what-if', '/app/tax/what-if'],
  ['a real route with several hyphens', '/app/tax/ways-to-save', '/app/tax/ways-to-save'],
  ['the route that has worked this way for weeks', '/app/you/billing', '/app/you/billing'],
  ['a real route under you', '/app/you/settings', '/app/you/settings'],
  ['a real route under invoices', '/app/invoices/new', '/app/invoices/new'],
  ['a real route with hyphens at the top level', '/app/proof-of-income', '/app/proof-of-income'],
  ['a route name with a digit, which no page uses yet but the allowlist permits', '/app/tax/2026', '/app/tax/2026'],
  ['a route name with an underscore, likewise', '/app/you/vat_group', '/app/you/vat_group'],
];

console.log('\n2. THE TABLE: WHAT safeNext RETURNS, AND WHERE THAT ACTUALLY LANDS HIM');
for (const [label, input, expected] of TABLE) {
  const got = W.safeNext(input);
  const where = landsOn(got);
  const refused = expected === AFTER;
  ok(
    `${refused ? '🔴 refuses' : 'allows through unchanged'} ${label}: ${JSON.stringify(input)}`
    + (got === expected ? '' : ` (got ${JSON.stringify(got)}, wanted ${JSON.stringify(expected)})`),
    got === expected,
  );
  // The second half of every row, and the half the old function failed. Not "what did the guard
  // say" but "what does the redirect the guard authorised actually resolve to".
  ok(
    `...and it lands inside ${AFTER}: ${where}`,
    insideApp(where) && (!refused || where === AFTER),
  );
}

console.log('\n3. EVERY PAGE THAT EXISTS ON DISK STILL ROUND TRIPS, BYTE IDENTICAL');
// The table above is a list somebody typed. This is the list that ships. Same walk as
// test/signinnext.test.mjs and test/webauth.test.mjs: dot directories and symlinks skipped,
// lstat and never stat, because app/.node/bin/corepack is a broken symlink in this repo.
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
const appDir = path.join(repo, 'app/app');
const pages = walk(appDir).sort();
ok('the walk found the pages, so this section is not vacuous', pages.length > 30);
const routes = pages.map((f) => {
  const d = path.dirname(path.relative(appDir, f).replace(/\\/g, '/'));
  return d === '.' ? '/app' : `/app/${d}`;
});
const mangled = routes.filter((r) => W.safeNext(r) !== r);
ok(
  `🔴 ALL ${routes.length} ROUTES UNDER app/app SURVIVE safeNext UNCHANGED${mangled.length ? `: ${mangled.join(', ')}` : ''}`,
  mangled.length === 0,
);
const misplaced = routes.filter((r) => landsOn(W.safeNext(r)) !== r);
ok(
  `🔴 AND EACH ONE STILL RESOLVES TO ITSELF THROUGH new URL()${misplaced.length ? `: ${misplaced.join(', ')}` : ''}`,
  misplaced.length === 0,
);

console.log('\n4. THE INVARIANT, OVER EVERYTHING, INCLUDING RUBBISH NOBODY THOUGHT OF');
// ⚠️ TWO PROMISES, AND THE SECOND ONE IS WHY THIS IS NOT WRAPPED IN A try. safeNext sits on the
// sign in path. A throw there is not a lost destination, it is a locked door for every customer
// at once, which is exactly what happened on 7 August when a daily cap failed closed. So the
// harness below calls it bare: an exception fails this suite with a stack trace, which is the
// honest outcome, rather than being swallowed into a tidy red tick.
//
// ⚠️ AND IT IS BUILT SEGMENT BY SEGMENT, NOT CHARACTER BY CHARACTER, WHICH IS THE DIFFERENCE
// BETWEEN A FUZZER AND A DECORATION. A random smear of characters almost never lands a clean
// `%2e%2e` between two slashes, so a character level generator ran four thousand times and found
// nothing, which would have shown this section green against the very bug it exists to catch.
// Drawing whole SEGMENTS from a dot heavy pool finds it in the first handful. Checked both ways:
// with lib/websession.ts put back to its old body, this section goes red.
const TOKENS = [
  '.', '..', '%2e', '%2E', '%2e%2e', '.%2e', '%2e.', '%252e', '%252e%252e', '%c0%ae', '%uff0e',
  '\u2024', '\uff0e', '\u3002', '%e2%80%a4', 'app', 'team', 'x', '', '%2f', '%5c', '\\', '%00',
  '%09', '@', ';', '%2523', 'tax', 'vat',
];
// A fixed seed, so a failure here is reproducible rather than a story about last Tuesday.
let seed = 20260807;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
let escaped = 0;
let notItself = 0;
const fuzzed = [];
for (let i = 0; i < 20000; i += 1) {
  let s = i % 4 === 0 ? '' : '/app';
  const segments = 1 + Math.floor(rnd() * 4);
  for (let k = 0; k < segments; k += 1) {
    let seg = '';
    const parts = 1 + Math.floor(rnd() * 2);
    for (let j = 0; j < parts; j += 1) seg += pick(TOKENS);
    s += `/${seg}`;
  }
  const got = W.safeNext(s);
  const where = landsOn(got);
  if (!insideApp(where)) { escaped += 1; if (fuzzed.length < 4) fuzzed.push(`${JSON.stringify(s)} -> ${JSON.stringify(got)} -> ${where}`); }
  if (got !== AFTER && got !== s.trim()) { notItself += 1; if (fuzzed.length < 4) fuzzed.push(`${JSON.stringify(s)} was repaired to ${JSON.stringify(got)}`); }
}
ok(
  `🔴 20000 GENERATED PATHS AND NOT ONE RESOLVES OUTSIDE ${AFTER}${escaped ? `: ${fuzzed.join(' | ')}` : ''}`,
  escaped === 0,
);
ok(
  `🔴 AND safeNext EITHER REFUSES OR RETURNS EXACTLY WHAT IT WAS GIVEN, NEVER A REPAIR${notItself ? `: ${fuzzed.join(' | ')}` : ''}`,
  notItself === 0,
);
// Values that are not strings at all, and one whose toString would throw if anything ever read it.
const NASTY = [
  Symbol('next'), 0, -1, NaN, Infinity, true, false, [], [[]], { toString() { throw new Error('no'); } },
  new Proxy({}, { get() { throw new Error('no'); } }), 'x'.repeat(100000), Object.create(null),
];
let threw = 0;
for (const n of NASTY) { try { if (W.safeNext(n) !== AFTER) threw += 1; } catch { threw += 1; } }
ok('🔴 NOTHING THAT IS NOT A PATH GETS ANYTHING BUT THE DASHBOARD, AND NOTHING THROWS', threw === 0);

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n5. AND THE REAL DOOR, RUN FOR REAL, BECAUSE THE ESCAPE HAPPENED IN THE ROUTE');
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// Sections 1 to 4 test a function. This posts a code to the real POST in
// app/api/auth/verify/route.ts, staged with the real lib/websession.ts and the real
// lib/logindoor.ts, and reads the Location header off the 303 it hands back. Only the two
// modules that reach the world are replaced. `new URL(next, req.url)` is the route's own line
// and is not stubbed, which is the whole point: that line is where `/team` came from.
const AUTH = await (async () => {
  process.env.WEB_SESSION_SECRET = 'a-test-secret-long-enough-to-clear-the-32-byte-bar';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.invalid';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-for-this-suite';
  const stage = mkdtempSync(path.join(tmpdir(), 'nextallowlist-'));
  const put = (n, s) => writeFileSync(path.join(stage, n), s);
  put('logindoor.ts', read(path.join(repo, 'lib/logindoor.ts')));
  put('websession.ts', read(path.join(repo, 'lib/websession.ts')));
  put('nextserver.ts', `
export class NextRequest {}
export const NextResponse = {
  redirect(url, status) {
    return { status, location: String(url), cookies: { set: () => {} } };
  },
};
`);
  put('ratelimit.ts', `
export function clientIp() { return '203.0.113.9'; }
export async function rateLimitedShared() { return false; }
`);
  put('supabase.ts', `
export async function verifyAccessToken() { return { id: 'u-1', phone: '+447700900999', email: 'dave@example.com' }; }
export async function ensureUserRow() { return true; }
export async function createWebSession() { return true; }
export async function reconcileSignupToUser() { return true; }
`);
  const fix = (s) => s.replace(/from 'next\/server'/g, "from './nextserver.ts'")
    .replace(/from '(?:\.\.\/)+lib\/([a-zA-Z]+)'/g, "from './$1.ts'");
  put('verify.ts', fix(read(path.join(repo, 'app/api/auth/verify/route.ts'))));
  const u = (f) => pathToFileURL(path.join(stage, f)).href;
  return { verify: await import(u('verify.ts')), WS: await import(u('websession.ts')) };
})();

// The fake GoTrue. A 200 with a token means the code was accepted, which is the branch that
// reaches the final redirect. Nothing leaves the machine.
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ access_token: 'a-token' }) });

const PENDING = AUTH.WS.pendingCookieValue({ channel: 'email', value: 'dave@example.com' });
ok('the staged door is configured, so the posts below really open a session', PENDING.length > 20);

const postNext = (next) => AUTH.verify.POST({
  url: 'https://lekhio.app/api/auth/verify',
  headers: new Headers({ origin: 'https://lekhio.app', host: 'lekhio.app' }),
  formData: async () => {
    const fd = new FormData();
    fd.append('code', '12345678');
    fd.append('remember', 'on');
    if (next !== undefined) fd.append('next', next);
    return fd;
  },
  cookies: { get: (n) => (n === 'lek_p' ? { value: PENDING } : undefined) },
});

// 🔴 THE FOUR THE ROUTE ACTUALLY GOT WRONG, POSTED AS A BROWSER WOULD POST THEM.
for (const smuggled of ['/app/%2e%2e/team', '/app/%2E%2E/team', '/app/.%2e/team', '/app/%2e%2e/%2e%2e/team']) {
  const res = await postNext(smuggled);
  const where = new URL(res.location).pathname;
  ok(`🔴 THE REAL DOOR SENDS ${JSON.stringify(smuggled)} TO ${where}, NOT OUT OF ${AFTER}`, where === AFTER);
  ok('...and it is still a 303, so nothing about the sign in changed shape', res.status === 303);
}

// And the destinations 37 pages depend on, through the same door.
for (const good of ['/app', '/app/tax/vat', '/app/you/billing', '/app/invoices/new', '/app/proof-of-income']) {
  const res = await postNext(good);
  ok(`🔴 THE REAL DOOR STILL DELIVERS ${good}`, new URL(res.location).pathname === good);
}
{
  const res = await postNext(undefined);
  ok('a post with no next at all still lands him on his dashboard', new URL(res.location).pathname === AFTER);
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

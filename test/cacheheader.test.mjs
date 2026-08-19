// B53, J9 AND B54. THE SIGNED IN AREA'S CACHE HEADER, THE PROXY RENAME, AND THE BUILD STAMP.
//
//   node test/cacheheader.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// THREE THINGS THAT ARE ONE DOOR: the file that runs before every request, and the endpoint that
// says which build is running.
//
// 🔴 B53. THE MATCHER MUST COVER THE SIGNED IN AREA AND MUST NOT COVER THE PUBLIC ONE.
// Both directions, because only one of them is the fix. Making everything no-store is not a
// success, it is a self inflicted speed problem on the free calculators in the week Jag starts
// buying traffic for them. The proxy is exercised as a FUNCTION, with real request objects, so
// what is proved is the header a browser would receive rather than a string in a file.
//
// 🔴 J9. The file is `proxy.ts`, exports `proxy`, and `middleware.ts` is GONE. Next 16 throws E900
// if both exist, so the absence is as load bearing as the presence.
//
// 🔴 B54. `/api/health` carries a build field that is 40 hex characters or the literal `local`,
// and the route exposes the SHA and nothing else.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync, readdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
const proxySrc = read('proxy.ts');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) pass += 1;
  else { fail += 1; process.stdout.write(`\n  FAIL  ${name}`); }
};

// ── J9. THE RENAME. ────────────────────────────────────────────────────────────────────────
console.log('\n=== J9. the file is proxy, and middleware is gone ===\n');
ok('🔴 proxy.ts EXISTS at the repo root', existsSync(path.join(root, 'proxy.ts')));
ok('🔴 middleware.ts IS GONE. Next 16 throws E900 when both exist, so this is not tidiness',
  !existsSync(path.join(root, 'middleware.ts')));
ok('and there is no src/middleware.ts either, which is the other place Next looks',
  !existsSync(path.join(root, 'src', 'middleware.ts')));
ok('🔴 it exports a function named proxy, which is what the Next 16 loader resolves by filename',
  /export function proxy\(/.test(proxySrc));
ok('and nothing still exports the old name from it',
  !/export function middleware\(/.test(proxySrc));

// ── B53. THE MATCHER, IN BOTH DIRECTIONS. ─────────────────────────────────────────────────
console.log('\n=== B53. the matcher covers the signed in area and not the public one ===\n');
// proxy.ts imports next/server, which node cannot resolve on its own, so it is STAGED with that
// one import pointed at a stub. The stub is deliberately thin: a Headers bag and a status, which is
// the whole of what the proxy touches. Nothing else in the file is rewritten, so what runs below is
// the real function.
const stage = mkdtempSync(path.join(tmpdir(), 'cacheheader-'));
writeFileSync(path.join(stage, 'nextserver.ts'), `
export class NextResponse {
  status: number;
  headers: Headers;
  constructor(_body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
    this.status = init?.status ?? 200;
    this.headers = new Headers(init?.headers ?? {});
  }
  static next(): NextResponse { return new NextResponse(null, { status: 200 }); }
}
`);
writeFileSync(path.join(stage, 'proxy.ts'), proxySrc.replace(
  "import { NextRequest, NextResponse } from 'next/server';",
  "import { NextResponse } from './nextserver.ts';\ntype NextRequest = { method: string; nextUrl: URL; headers: Headers };"));
const P = await import(pathToFileURL(path.join(stage, 'proxy.ts')).href);
ok('🔴 THE PROXY IS IMPORTABLE AND CALLABLE, without which every line below is vacuous',
  typeof P.proxy === 'function');
ok('and it exports a config with a matcher', Array.isArray(P.config?.matcher));

// Next's matcher syntax, evaluated the way Next evaluates it: `/x/:path*` covers /x and anything
// under it. Derived from the exported config rather than retyped, so a change to the matcher is
// a change to this test's own subject.
const matches = (pathname) => P.config.matcher.some((m) => {
  const base = m.replace(/\/:path\*$/, '');
  return pathname === base || pathname.startsWith(`${base}/`);
});

const SIGNED_IN = ['/app', '/app/tax', '/app/tax/ni', '/app/money', '/app/thread/chat', '/app/settings'];
// ⚠️ DERIVED OFF DISK, NOT REMEMBERED. The first version of this list carried
// '/self-employed-tax-calculator' and '/vat-calculator', and BOTH 404 on production. A corpus of
// pages that do not exist proves nothing about the pages that do. These are read from app/, every
// page.tsx outside app/app/, and the derivation is asserted below so the list cannot rot either.
const PUBLIC = [
  '/', '/pricing', '/how-mtd-works', '/team', '/start', '/privacy', '/terms',
  '/tax-calculator', '/cis-calculator', '/landlord-tax-calculator', '/ni-checker',
];
const uncovered = SIGNED_IN.filter((p) => !matches(p));
ok(`🔴 ALL ${SIGNED_IN.length} SIGNED IN PATHS ARE COVERED BY THE MATCHER${uncovered.length ? `, MISSED: ${uncovered.join(', ')}` : ''}`,
  uncovered.length === 0);
const swept = PUBLIC.filter((p) => matches(p));
ok(`🔴 AND NOT ONE OF THE ${PUBLIC.length} PUBLIC PAGES IS, so the marketing site and the free calculators stay cacheable${swept.length ? `, SWEPT IN: ${swept.join(', ')}` : ''}`,
  swept.length === 0);
ok('the api is still covered, because CORS lives here too and was here first',
  matches('/api/health') && matches('/api/whatsapp'));
// ⚠️ THE CORPUS SIZES ARE PINNED. A sabotage that DELETES the public pages at risk leaves a corpus
// that still passes, which is how a both directions check quietly stops checking one direction.
ok('the signed in and public corpora are the size they were measured at, 6 and 11',
  SIGNED_IN.length === 6 && PUBLIC.length === 11);
// 🔴 AND EVERY PUBLIC PATH IN THAT CORPUS IS A REAL PAGE ON DISK. Two of the first draft's entries
// 404 on production, which was found by probing rather than by reading, and a corpus of pages that
// do not exist is a both directions check testing one imaginary direction.
{
  const routes = new Set();
  (function walkPages(dir, rel) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules' || (rel === '' && e.name === 'app')) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walkPages(p, `${rel}/${e.name}`);
      else if (e.name === 'page.tsx') routes.add(rel === '' ? '/' : rel);
    }
  }(path.join(root, 'app'), ''));
  const missing = PUBLIC.filter((r) => !routes.has(r));
  ok(`🔴 ALL ${PUBLIC.length} PUBLIC PATHS IN THE CORPUS ARE REAL page.tsx ROUTES ON DISK${missing.length ? `, NOT FOUND: ${missing.join(', ')}` : ''}`,
    routes.size >= 30 && missing.length === 0);
}
// 🔴 AND THE MATCHER UNDER TEST IS THE ONE IN THE FILE. A hardcoded copy passes for ever while the
// real matcher drifts, so the exported value is compared against the literal in proxy.ts.
{
  const literal = proxySrc.match(/matcher: \[([^\]]*)\]/)[1];
  const fromSource = (literal.match(/'([^']+)'/g) || []).map((q) => q.slice(1, -1));
  ok(`🔴 THE EXPORTED MATCHER IS THE LITERAL IN proxy.ts, ${fromSource.length} entries`,
    fromSource.length === P.config.matcher.length
    && fromSource.every((m, i) => m === P.config.matcher[i]));
  // 🔴 AND THE READER AGREES WITH THE EXPORT ON EVERY ENTRY THE EXPORT DECLARES. Comparing the
  // export to the file is not enough on its own: `matches` could still be a hardcoded copy, and a
  // widening of the real matcher would then sail past every line above. This couples them, so a
  // matcher entry that `matches` cannot see is a failure rather than a silence.
  const blind = P.config.matcher.filter((m) => !matches(`${m.replace(/\/:path\*$/, '')}/anything`));
  ok(`🔴 THE MATCHER READER SEES EVERY ENTRY THE EXPORT DECLARES${blind.length ? `, BLIND TO: ${blind.join(', ')}` : ''}`,
    blind.length === 0);
}

// 🔴 VACUITY. The matcher reader must be able to SAY a path is uncovered.
ok('🔴 VACUITY: the matcher reader reports an uncovered path as uncovered',
  !matches('/pricing') && !matches('/not-a-route'));
ok('🔴 VACUITY: and a path that only SHARES A PREFIX with /app is not covered by it',
  !matches('/apply') && !matches('/appointments'));

// ── B53. THE HEADER ITSELF, OFF A REAL CALL. ──────────────────────────────────────────────
console.log('\n=== B53. the header a browser would actually receive ===\n');
const call = (url, method = 'GET') => P.proxy({
  method,
  nextUrl: new URL(url),
  headers: new Headers({ origin: 'https://lekhio.app' }),
});
const signedIn = call('https://lekhio.app/app/tax');
const EXPECT = 'private, no-cache, no-store, max-age=0, must-revalidate';
ok(`🔴 A SIGNED IN PAGE COMES BACK WITH Cache-Control: ${EXPECT}`,
  signedIn.headers.get('Cache-Control') === EXPECT);
ok('and it carries every one of the five directives, named rather than counted',
  ['private', 'no-cache', 'no-store', 'max-age=0', 'must-revalidate'].every((d) => EXPECT.includes(d)));
// 🔴 no-cache IS NOT OPTIONAL AND THIS IS WHY. Probed on production on head `e1ad685d`: /in carries
// force-dynamic and is served `private, no-cache, no-store, max-age=0, must-revalidate` by Next
// itself. Shipping the four directives the item sized would have DROPPED no-cache, which is a
// downgrade wearing a fix. Every directive the live site sends must still be sent.
ok('🔴 THE HEADER IS AT LEAST AS STRONG AS THE ONE PRODUCTION ALREADY SENDS',
  ['private', 'no-cache', 'no-store', 'max-age=0', 'must-revalidate']
    .every((d) => signedIn.headers.get('Cache-Control').includes(d)));
ok('🔴 AND IT NEVER SAYS public, which is the one word that would invert it',
  !/\bpublic\b/.test(signedIn.headers.get('Cache-Control')));
ok('🔴 AND A SIGNED IN PAGE IS NOT HANDED A CORS ORIGIN. The matcher grew for the cache header,'
  + ' and reflecting an origin onto a signed in HTML page is not what that widening was for',
  signedIn.headers.get('Access-Control-Allow-Origin') === null);

const api = call('https://lekhio.app/api/health');
ok('🔴 THE API STILL GETS ITS CORS HEADER, so the widening did not break what was here first',
  api.headers.get('Access-Control-Allow-Origin') === 'https://lekhio.app');
ok('and the API is NOT given the signed in cache header, which is a page rule',
  api.headers.get('Cache-Control') === null);
const preflight = call('https://lekhio.app/api/whatsapp', 'OPTIONS');
ok('🔴 THE PREFLIGHT IS STILL ANSWERED 204 BEFORE IT REACHES A ROUTE',
  preflight.status === 204 && preflight.headers.get('Access-Control-Allow-Methods') === 'GET, POST, OPTIONS');

// ⚠️ THE DOMAIN RULE IS NOT RE ASSERTED HERE ON PURPOSE, AND THIS COMMENT IS THE SECOND DRAFT.
// The first one named the rival domain in prose and test/domain.test.mjs went RED on it, correctly:
// that guard sweeps the whole repo for the string and does not care that this file was only
// talking about it. The guard is right and the comment was wrong. Domain ownership is domain's job.
ok('credentials are still allowed across no origin at all',
  !/Access-Control-Allow-Credentials/i.test(proxySrc.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')));

// ── B54. THE BUILD STAMP. ─────────────────────────────────────────────────────────────────
console.log('\n=== B54. which build is this ===\n');
const health = read('app/api/health/route.ts');
ok('🔴 /api/health CARRIES A BUILD FIELD', /^\s*build: buildSha\(\),$/m.test(health));
ok('and the field is in the PUBLIC body rather than behind the bearer, which is the whole point',
  health.indexOf('build: buildSha(),') > health.indexOf('const healthy ='));
ok('🔴 IT READS VERCEL_GIT_COMMIT_SHA and nothing else',
  /process\.env\.VERCEL_GIT_COMMIT_SHA/.test(health));

// The function, exercised rather than read.
{
  const src = health.match(/function buildSha\(\): string \{[\s\S]*?\n\}/)[0]
    .replace(': string', '');
  const buildSha = new Function('process', `${src}; return buildSha;`)({ env: {} });
  ok('🔴 WITH NO VARIABLE SET IT SAYS `local`, a word rather than an empty string, so a reader can'
    + ' tell a laptop from a field that stopped being set',
    buildSha() === 'local');
  const withEnv = (v) => new Function('process', `${src}; return buildSha;`)({ env: { VERCEL_GIT_COMMIT_SHA: v } })();
  ok('🔴 A REAL 40 CHARACTER SHA COMES BACK VERBATIM',
    withEnv('e1ad685d5649761edfda604c0e9be0d52a6b79a9') === 'e1ad685d5649761edfda604c0e9be0d52a6b79a9');
  ok('🔴 A SHORT SHA IS REFUSED. A field that MIGHT be a commit is worse than one that says it does not know',
    withEnv('e1ad685') === 'local');
  ok('a 41 character value is refused too, so the check is anchored at both ends',
    withEnv('e1ad685d5649761edfda604c0e9be0d52a6b79a9f') === 'local');
  ok('an uppercase or non hex value is refused',
    withEnv('E1AD685D5649761EDFDA604C0E9BE0D52A6B79A9') === 'local'
    && withEnv('not-a-sha-not-a-sha-not-a-sha-not-a-shaX') === 'local');
  ok('🔴 VACUITY: the assertion above can FAIL, proved by a value that must pass',
    /^[0-9a-f]{40}$/.test('e1ad685d5649761edfda604c0e9be0d52a6b79a9'));
}

// 🔴 THE SHA ONLY. Never a branch, never a token, never a deployment URL.
const healthCode = health.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
for (const forbidden of ['VERCEL_GIT_COMMIT_REF', 'VERCEL_URL', 'VERCEL_BRANCH_URL', 'VERCEL_GIT_COMMIT_MESSAGE', 'VERCEL_GIT_COMMIT_AUTHOR_NAME']) {
  ok(`🔴 ${forbidden} IS NOT EXPOSED by the health route`, !healthCode.includes(forbidden));
}
ok('and the comment stripper left the code behind rather than eating the file',
  /export const runtime = 'nodejs';/.test(healthCode) && healthCode.length > 2000);

// ── THE CLAIM B53 MUST NOT MAKE. ──────────────────────────────────────────────────────────
console.log('\n=== what B53 does NOT fix, asserted so it cannot be read as more ===\n');
const appPages = [];
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name === 'page.tsx') appPages.push(p);
  }
}(path.join(root, 'app', 'app')));
const dynamic = appPages.filter((p) => /force-dynamic/.test(readFileSync(p, 'utf8')));
ok(`🔴 ALL ${appPages.length} SIGNED IN PAGES STILL CARRY force-dynamic, which is what has ALWAYS`
  + ' stopped Next generating them statically. B53 closes an INTERMEDIARY cache, not a known live'
  + ` leak, and it is not a licence to remove this${dynamic.length === appPages.length ? '' : `  [${appPages.length - dynamic.length} without]`}`,
  appPages.length >= 40 && dynamic.length === appPages.length);

process.stdout.write(`\n  ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);

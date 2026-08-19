// SABOTAGE THE CACHE HEADER, THE RENAME AND THE BUILD STAMP. B53, J9 AND B54, 19 August 2026.
//
//   node test/sabotage-b53cacheheader.mjs
//
// ═══════════════════════════════════════════════════════════
// test/cacheheader.test.mjs claims three things and only one of them has an obvious failure mode.
//
//   THE CACHE HEADER has TWO failure directions and the second is the expensive one. Too narrow
//   leaves a signed in page with no header, which is where this started. TOO WIDE MAKES THE FREE
//   CALCULATORS UNCACHEABLE in the week Jag starts buying traffic for them, which is a self
//   inflicted speed problem on the pages a stranger meets first. Both are sabotaged.
//
//   THE RENAME fails by leaving the old file behind, which Next 16 does not warn about, it
//   THROWS E900 on. So the sabotage puts middleware.ts back.
//
//   THE BUILD STAMP fails by widening. A branch name, a deployment URL or a commit message on an
//   endpoint that answers a bare GET with no auth is a door, and the item said SHA only.
// ═══════════════════════════════════════════════════════════

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sab-b53-'));
  for (const d of ['lib', 'test', 'app']) {
    cpSync(path.join(root, d), path.join(dir, d), { recursive: true, dereference: false });
  }
  // proxy.ts is a FILE at the root and the suite reads it by name. A tree without it does not fail
  // that suite, it crashes it.
  cpSync(path.join(root, 'proxy.ts'), path.join(dir, 'proxy.ts'));
  return dir;
}

const SUITES = ['test/cacheheader.test.mjs'];

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
    console.log('   1. proxy.ts and every directory the suite READS is copied by scratch()');
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
const write = (dir, rel, body) => writeFileSync(path.join(dir, rel), body);

const PX = 'proxy.ts';
const HL = 'app/api/health/route.ts';
const SUITE = 'test/cacheheader.test.mjs';

const SABOTAGES = [
  // ── B53. THE MATCHER, BOTH DIRECTIONS. ────────────────────────────────────────────────
  {
    name: '🔴 the matcher goes back to the API only, so the signed in area has no header again',
    apply: (d) => edit(d, PX, "export const config = { matcher: ['/api/:path*', '/app/:path*'] };",
      "export const config = { matcher: '/api/:path*' };"),
  },
  {
    name: '🔴 THE EXPENSIVE DIRECTION: the matcher is widened to the WHOLE SITE, so the free'
      + ' calculators and the marketing pages become uncacheable',
    apply: (d) => edit(d, PX, "export const config = { matcher: ['/api/:path*', '/app/:path*'] };",
      "export const config = { matcher: ['/api/:path*', '/:path*'] };"),
  },
  {
    name: '🔴 a public calculator is added to the matcher by name, which is the same fault one page'
      + ' at a time',
    apply: (d) => edit(d, PX, "matcher: ['/api/:path*', '/app/:path*'] };",
      "matcher: ['/api/:path*', '/app/:path*', '/cis-calculator'] };"),
  },
  // ── B53. THE HEADER ITSELF. ───────────────────────────────────────────────────────────
  {
    name: '🔴 the header loses no-store and keeps only private, which still LOOKS like a cache rule',
    apply: (d) => edit(d, PX, "const SIGNED_IN_CACHE = 'private, no-cache, no-store, max-age=0, must-revalidate';",
      "const SIGNED_IN_CACHE = 'private, max-age=0';"),
  },
  {
    name: '🔴 THE DOWNGRADE THIS SESSION NEARLY SHIPPED: no-cache is dropped, so the header is'
      + ' WEAKER than the one production already sends and it still reads like a fix',
    apply: (d) => edit(d, PX, "const SIGNED_IN_CACHE = 'private, no-cache, no-store,",
      "const SIGNED_IN_CACHE = 'private, no-store,"),
  },
  {
    name: '🔴 THE QUIET ONE: private becomes public, so an intermediary is told it MAY store it',
    apply: (d) => edit(d, PX, "const SIGNED_IN_CACHE = 'private, no-cache, no-store,",
      "const SIGNED_IN_CACHE = 'public, no-cache, no-store,"),
  },
  {
    name: '🔴 the header stops being set at all while the matcher still covers the pages',
    apply: (d) => edit(d, PX, "  res.headers.set('Cache-Control', SIGNED_IN_CACHE);", ''),
  },
  {
    name: '🔴 the API branch goes, so CORS stops being answered and the widening breaks what was'
      + ' here first',
    apply: (d) => edit(d, PX, '  const isApi = req.nextUrl.pathname.startsWith(\'/api/\');', '  const isApi = false;'),
  },
  {
    name: '🔴 a CORS origin is reflected onto signed in HTML pages too, which is not what the'
      + ' widening was for',
    apply: (d) => edit(d, PX, "  const isApi = req.nextUrl.pathname.startsWith('/api/');", '  const isApi = true;'),
  },
  // ── J9. THE RENAME. ───────────────────────────────────────────────────────────────────
  {
    name: '🔴 middleware.ts comes back, which Next 16 does not warn about, it THROWS E900 on',
    apply: (d) => write(d, 'middleware.ts', readFileSync(path.join(d, PX), 'utf8')),
  },
  {
    name: '🔴 the exported function goes back to the old name, so the Next 16 loader finds nothing',
    apply: (d) => edit(d, PX, 'export function proxy(req: NextRequest) {', 'export function middleware(req: NextRequest) {'),
  },
  // ── B54. THE BUILD STAMP. ─────────────────────────────────────────────────────────────
  {
    name: '🔴 the build field goes, and proving a build is live costs a password again',
    apply: (d) => edit(d, HL, '      build: buildSha(),', ''),
  },
  {
    name: '🔴 THE QUIET ONE: the sha is no longer validated, so a truncated value is served as a commit',
    apply: (d) => edit(d, HL, "  return /^[0-9a-f]{40}$/.test(sha) ? sha : 'local';", "  return sha || 'local';"),
  },
  {
    name: '🔴 the empty case returns an empty string, so a laptop is indistinguishable from a field'
      + ' that stopped being set',
    apply: (d) => edit(d, HL, "  return /^[0-9a-f]{40}$/.test(sha) ? sha : 'local';",
      "  return /^[0-9a-f]{40}$/.test(sha) ? sha : '';"),
  },
  {
    name: '🔴 DOOR: the BRANCH NAME is exposed beside the sha on an endpoint with no auth',
    apply: (d) => edit(d, HL, '      build: buildSha(),',
      "      build: buildSha(),\n      branch: process.env.VERCEL_GIT_COMMIT_REF || 'local',"),
  },
  {
    name: '🔴 DOOR: the DEPLOYMENT URL is exposed, which is a way in rather than a fact',
    apply: (d) => edit(d, HL, '      build: buildSha(),',
      "      build: buildSha(),\n      at: process.env.VERCEL_URL || 'local',"),
  },
  {
    name: '🔴 the build field moves behind the bearer into the ?config=1 body, where it cannot'
      + ' answer the question it exists for',
    apply: (d) => {
      edit(d, HL, '      build: buildSha(),', '');
      edit(d, HL, '          stripe: stripeMode(),', '          build: buildSha(),\n          stripe: stripeMode(),');
    },
  },
  // ── THE SUITE'S OWN DERIVATIONS. ──────────────────────────────────────────────────────
  {
    name: '🔴 THE MATCHER READER GOES BLIND: the real matcher is widened to the whole site AND the'
      + ' suite hardcodes the old one, so a test that does not derive stays green while the file moves',
    apply: (d) => {
      edit(d, PX, "export const config = { matcher: ['/api/:path*', '/app/:path*'] };",
        "export const config = { matcher: ['/api/:path*', '/:path*'] };");
      edit(d, SUITE, 'const matches = (pathname) => P.config.matcher.some((m) => {',
        "const matches = (pathname) => ['/api/:path*', '/app/:path*'].some((m) => {");
    },
  },
  {
    name: '🔴 the public corpus is cut to the pages that were never at risk',
    apply: (d) => edit(d, SUITE, "const PUBLIC = [\n  '/', '/pricing', '/how-mtd-works', '/team', '/start', '/privacy', '/terms',",
      "const PUBLIC = [\n  '/privacy', '/terms',"),
  },
];

// NO OP CONTROLS. Each changes the files and changes NOTHING these guards are about.
const CONTROLS = [
  {
    name: 'CONTROL: a LOCAL IS RENAMED in the proxy, and a guard that reds here is about an identifier',
    apply: (d) => {
      edit(d, PX, "  const isApi = req.nextUrl.pathname.startsWith('/api/');", "  const onApiPath = req.nextUrl.pathname.startsWith('/api/');");
      edit(d, PX, '  if (isApi) {', '  if (onApiPath) {');
    },
  },
  {
    name: 'CONTROL: a COMMENT is reworded, and it says no-store and VERCEL_GIT_COMMIT_REF on purpose',
    apply: (d) => edit(d, PX, '// 🔴 B53. THE SIGNED IN AREA SET NO CACHE HEADER AT ALL. 19 August 2026.',
      '// Reworded comment. It mentions no-store, VERCEL_GIT_COMMIT_REF and VERCEL_URL, and none is code.'),
  },
  {
    name: 'CONTROL: the two matcher entries are REORDERED, which changes the source and no behaviour',
    apply: (d) => edit(d, PX, "matcher: ['/api/:path*', '/app/:path*'] };", "matcher: ['/app/:path*', '/api/:path*'] };"),
  },
  {
    name: 'CONTROL: whitespace is added inside the proxy body',
    apply: (d) => edit(d, PX, '  const res = NextResponse.next();\n  res.headers.set(', '  const res = NextResponse.next();\n\n  res.headers.set('),
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

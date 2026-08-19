// ═══════════════════════════════════════════════════════════════════════════════════════════════
// RUN 7 FIXES. node test/run7fixes.test.mjs
//
// Three small findings from the twenty point security sweep on 17 August 2026, each written as the
// SHAPE and not as the instance, because Run 6's best guard found a third case two people had read
// past by being written that way.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const MOBILE = path.resolve(root, '..', 'tradebook-app');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}`); } };
const read = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };
const codeOnly = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. NO ORIGIN IS REFLECTED IN PRODUCTION WITHOUT THE ENVIRONMENT BEING ASKED.
//
// proxy.ts reflected http://localhost:<any port> into Access-Control-Allow-Origin in
// production, while the comment two lines above said "in development any localhost port is
// allowed". Nothing authenticated leaked: Access-Control-Allow-Credentials is set nowhere in either
// repo and these routes carry a Bearer token, never a cookie. The defect was that a comment
// described a control the code did not have, which is worse than no comment.
//
// THE SHAPE, not the instance: any localhost or 127.0.0.1 test that decides a CORS origin must be
// guarded by an environment check in the SAME expression. A future second one fails here.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 1. no development origin is trusted in production ===\n');
const mw = read(path.join(root, 'proxy.ts'));
ok('proxy.ts exists', mw.length > 0);
const code = codeOnly(mw);
for (const m of code.matchAll(/^.*(?:localhost|127\.0\.0\.1).*$/gm)) {
  const line = m[0];
  if (!/origin/i.test(line)) continue;
  ok(`🔴 a localhost origin test is gated on the environment: ${line.trim().slice(0, 60)}`,
    /NODE_ENV|VERCEL_ENV/.test(line) || /NODE_ENV|VERCEL_ENV/.test(code.slice(Math.max(0, m.index - 200), m.index + line.length)));
}
// The reason the blast radius was small, asserted so it stays small. ⚠️ codeOnly FIRST: the first
// version of this line read the raw file, and the comment I had just written in proxy.ts
// explaining that this header is set nowhere CONTAINED THE HEADER NAME, so the guard failed on its
// own explanation. Comments are not code. It is the third time that has bitten in one day.
const corsSources = [path.join(root, 'proxy.ts'), path.join(root, 'next.config.mjs')]
  .concat(existsSync(MOBILE) ? [path.join(MOBILE, 'lib', 'api.ts')] : []);
for (const f of corsSources) {
  const src = codeOnly(read(f));
  ok(`🔴 credentials are never allowed across origins in ${path.basename(f)}`,
    !/Access-Control-Allow-Credentials/i.test(src));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. A NAME IS NOT A HEADER.
//
// The trader's own business name went raw into the From display name and the Subject of a message
// sent to HIS CUSTOMER, while esc() was applied correctly to the same value ten lines away in the
// HTML body. Not CRLF injection, since both reach Resend as JSON, but a name shaped like
// "Someone <spoof@example.com>" reads to a human as a second address.
//
// THE SHAPE: every value that becomes an email From or Subject passes through headerName().
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 2. no user supplied value reaches an email header untreated ===\n');
const email = read(path.join(root, 'lib', 'email.ts'));
ok('lib/email.ts exists', email.length > 0);
ok('🔴 headerName exists at all', /function headerName\(/.test(email));
ok('🔴 headerName strips angle brackets and quotes', /function headerName[\s\S]{0,400}?replace\(\/\[<>/.test(email));
ok('🔴 headerName strips newlines and control characters',
  /function headerName[\s\S]{0,600}?u0000-\\u001f/.test(email));
ok('🔴 headerName caps the length, because a header is not a paragraph',
  /function headerName[\s\S]{0,700}?slice\(0, ?\d+\)/.test(email));
// Every From built from a business name goes through it. Written as a sweep, not as one line.
const eCode = codeOnly(email);
for (const m of eCode.matchAll(/^\s*const from = .*$/gm)) {
  ok(`🔴 a From line uses a treated name: ${m[0].trim().slice(0, 55)}`,
    !/businessName/.test(m[0]) || /headerName|cleanName/.test(m[0]));
}
for (const m of eCode.matchAll(/^\s*const mark = .*$/gm)) {
  ok(`🔴 a Subject mark uses a treated name: ${m[0].trim().slice(0, 55)}`,
    !/businessName/.test(m[0]) || /headerName/.test(m[0]));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. THE SUPPLY CHAIN IS WATCHED, IN BOTH REPOS.
//
// Neither repo had Dependabot, Renovate, or any audit step. Both CI files were thorough about
// correctness and silent about dependencies, and the hand written overrides block pinning postcss
// and sharp proves this has already had to be done by hand once. This is the only finding in the
// sweep that gets worse on its own with no code change.
//
// THE SHAPE: no workflow may pin a deprecated action major, and every repo with a workflow has both
// an audit step and a Dependabot config.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 3. both repos watch their dependencies ===\n');
const REPOS = [['web', root]].concat(existsSync(MOBILE) ? [['mobile', MOBILE]] : []);
if (!existsSync(MOBILE)) console.log('  note  ../tradebook-app absent, mobile half skipped. ⚠️ A SKIP IS NOT A PASS.');
for (const [label, base] of REPOS) {
  const ci = read(path.join(base, '.github', 'workflows', 'ci.yml'));
  ok(`${label}: ci.yml exists`, ci.length > 0);
  // Deprecated majors, by shape. v4 of these two runs on Node 20 and the runner forces it to 24.
  for (const m of ci.matchAll(/uses:\s*(actions\/[a-z-]+)@v(\d+)/g)) {
    ok(`🔴 ${label}: ${m[1]} is not on a deprecated major (found v${m[2]})`, Number(m[2]) >= 5);
  }
  // ⚠️ THE TWO REPOS ARE DELIBERATELY GATED DIFFERENTLY, AND THE FIRST DRAFT GOT THE PHONE WRONG.
  //
  // On the web, `npm audit --omit=dev --audit-level=high` is exactly right and reports zero. On the
  // phone the same command reported twenty, because Expo puts its CLI, bundler and prebuild tooling
  // under `dependencies`, so --omit=dev omits almost nothing. Of those twenty, exactly ONE reached
  // shipped code (nanoid, cleared by npm audit fix inside semver); the rest are metro and xcode,
  // whose only offered fix installs expo@53, a three major downgrade.
  //
  // So the phone runs scripts/audit-gate.mjs, which asks whether an advisory reaches shipped code
  // and requires every toolchain one to be written down with a reason. That is stricter where it
  // matters, not weaker.
  if (label === 'web') {
    ok(`🔴 ${label}: CI fails on a high or critical advisory in shipped dependencies`,
      /npm audit[^\n]*--audit-level=(high|critical)/.test(ci));
    ok(`🔴 ${label}: the audit ignores dev only advisories, so a build tool cannot redden main`,
      /npm audit[^\n]*--omit=dev/.test(ci));
  } else {
    ok(`🔴 ${label}: CI runs the audit gate rather than a raw npm audit`,
      /node scripts\/audit-gate\.mjs/.test(ci));
    const gate = read(path.join(base, 'scripts', 'audit-gate.mjs'));
    ok(`🔴 ${label}: the gate exists`, gate.length > 0);
    // ⚠️ DIRECT VERSUS INHERITED. The first version of the gate asked only "does shipped code
    // import this name" and blocked on react-native, which every screen imports and which has NO
    // advisory of its own: it is listed purely because it depends on the community cli plugin.
    // Widening the exception list would have been weakening it to go green. The rule was split
    // instead, and this holds the split.
    ok(`🔴 ${label}: it blocks a package's OWN advisory when shipped code imports it`,
      /has its OWN advisory and shipped code imports it/.test(gate));
    ok(`🔴 ${label}: it distinguishes a direct advisory from an inherited one`,
      /directAdvisory/.test(gate) && /typeof x === 'object'/.test(gate));
    // ⚠️ ANCHORED ON THE FILTER ITSELF, NOT ON THE VARIABLE NAME. The first version asserted that
    // `undecidedParents` appeared somewhere, and a sabotage that replaced the expression with an
    // empty array left the name in place and stayed green. Run 5 section 10, item one: anchor
    // inside the block that does the work.
    ok(`🔴 ${label}: an inherited advisory is only tolerated when EVERY parent is written down`,
      /parents\.filter\(\(pn\) => !\(pn in TOOLCHAIN_ONLY\)\)/.test(gate)
      && /undecidedParents\.length/.test(gate));
    ok(`🔴 ${label}: it blocks anything not written down, so a NEW advisory still stops a push`,
      /UNDECIDED/.test(gate));
    ok(`🔴 ${label}: an exception must justify itself against the filesystem, not just claim`,
      /LIST LIES/.test(gate) && /importedByShippedCode/.test(gate));
    ok(`🔴 ${label}: a stale exception is a failure too, so the list cannot rot`, /STALE/.test(gate));
    ok(`🔴 ${label}: and it REFUSES to certify when npm never reached the registry`,
      /did not reach the registry/.test(gate) && /report\.error \|\| !report\.metadata/.test(gate));
    // The step is useless in the wrong directory. This workflow defaults to the WEBSITE checkout.
    ok(`🔴 ${label}: the gate step runs in the app checkout, not the website default`,
      /working-directory: tradebook-app\s*\n\s*run: node scripts\/audit-gate\.mjs/.test(ci));
  }
  const db = read(path.join(base, '.github', 'dependabot.yml'));
  ok(`🔴 ${label}: a Dependabot config exists`, db.length > 0);
  ok(`${label}: it watches npm`, /package-ecosystem:\s*npm/.test(db));
  ok(`${label}: and it watches the actions themselves`, /package-ecosystem:\s*github-actions/.test(db));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4. HOUSE STYLE, ON EVERYTHING RUN 7 TOUCHED.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 4. no dash used as punctuation in anything Run 7 wrote ===\n');
const TOUCHED = [
  path.join(root, 'proxy.ts'),
  path.join(root, '.github', 'dependabot.yml'),
  path.join(root, 'supabase', 'APPLY_2026-08-16_khoji_documents_rls.sql'),
];
if (existsSync(MOBILE)) {
  TOUCHED.push(path.join(MOBILE, 'lib', 'scotland.ts'));
  TOUCHED.push(path.join(MOBILE, 'hooks', 'useBusinessType.ts'));
  TOUCHED.push(path.join(MOBILE, '.github', 'dependabot.yml'));
}
for (const f of TOUCHED) {
  const src = read(f);
  ok(`no em dash, en dash or minus sign in ${path.basename(f)}`, src.length > 0 && !/[–—−]/.test(src));
}

console.log(`\n  run 7 fixes: ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);

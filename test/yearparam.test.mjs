// A YEAR OR A QUARTER READ OFF A QUERY STRING MUST NEVER BE ABLE TO COME OUT AS ZERO.
// Run: node test/yearparam.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS SUITE EXISTS, AND IT IS NOT A THEORY.
//
// app/api/income-proof/route.ts read the tax year like this:
//
//     const q = Number(sp.get('year'));
//     year = Number.isInteger(q) ? q : currentTaxYear(now);
//
// searchParams.get() returns null when the parameter is ABSENT. Number(null) is 0.
// Number.isInteger(0) is true. The guard passed, the documented default never ran, and the
// route printed TAX YEAR ZERO. Seen on production, signed in, at /api/income-proof with no
// query string, on an account holding 33000 of income and 8000 of expenses in 2026/27:
//
//     heading  "tax year 0-01 (NaN Invalid Date NaN to NaN Invalid Date NaN)"
//     Gross income £0.00, Allowable expenses £0.00, Net profit MINUS £832.50
//     footer   "guidance based on the published 0-01 rates"
//
// with a Save as PDF button on it. `?year=` empty does the same, because Number('') is 0 too.
// The same variable also went inside a SIGNED pack token on ?mode=link, so a link asked for
// without a year carried year 0 inside the signature: a permanent, shareable, correctly signed
// lender document that is wrong and cannot be corrected from outside the token.
//
// THE LESSON THIS SUITE ENFORCES. Number.isInteger is a TYPE test, not a guard. Zero is a
// perfectly good integer. What saves a year is the RANGE, which is what
// app/app/proof-of-income/page.tsx and app/api/quarter-pack/route.ts both had and this route
// did not.
//
// SO THE ROUTE LIST IS READ OFF THE DISK, NEVER TYPED HERE. Route number N plus one gets the
// same test the day somebody writes it, without anybody remembering to add it. Every claim
// about a file is preceded by a claim that the file, and the thing inside it, actually exist:
// an indexOf that returns minus one passes an ordering check for entirely the wrong reason,
// and a walk that silently finds nothing is a suite that passes forever while testing air.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, readdirSync, lstatSync, existsSync } from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}`); } };

const rel = (abs) => path.relative(repo, abs).split(path.sep).join('/');

// Call something that may not exist without taking the whole suite down with it. A ratchet that
// stops at its first failure hides the rest of them, and the rest of them are the point.
const MISSING = Symbol('missing');
const call = (fn, ...args) => {
  if (typeof fn !== 'function') return MISSING;
  try { return fn(...args); } catch { return MISSING; }
};

// ═══════════════════════════════════════════════════════════════════════════════════════════
// PART 1. THE RESOLVER ITSELF, CALLED DIRECTLY, WITH THE PARAMETER ABSENT.
//
// The disk sweep in part 2 reads source. This part runs the code. A fixed clock, and every
// expected answer written out as a literal rather than recomputed from the same two lines the
// library uses, so this checks the library rather than agreeing with it.
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== the premise: what the runtime actually does with an absent parameter ===\n');
ok('Number(null) is 0, which is why an absent parameter was not caught', Number(null) === 0);
ok('Number("") is 0, which is why an empty parameter was not caught either', Number('') === 0);
ok('Number.isInteger(0) is true, so it was never going to catch either of them', Number.isInteger(0) === true);

console.log('\n=== lib/proofyear.ts exists before anything is claimed about it ===\n');
const resolverFile = path.join(repo, 'lib/proofyear.ts');
ok('lib/proofyear.ts is on disk', existsSync(resolverFile));
const PY = existsSync(resolverFile) ? await import(pathToFileURL(resolverFile).href) : {};
ok('it exports resolveProofYear as a function', typeof PY.resolveProofYear === 'function');
ok('it exports isProofYear as a function', typeof PY.isProofYear === 'function');
ok('it exports currentTaxYear as a function', typeof PY.currentTaxYear === 'function');
ok('it exports a numeric PROOF_YEAR_MIN', Number.isInteger(PY.PROOF_YEAR_MIN));

// A fixed clock inside 2026/27. Every expectation below is a hand worked literal.
const NOW = new Date('2026-08-08T21:00:00Z');

console.log('\n=== the tax year boundary, hand worked ===\n');
ok('8 August 2026 sits in tax year 2026', call(PY.currentTaxYear, NOW) === 2026);
ok('1 January 2026 sits in tax year 2025', call(PY.currentTaxYear, new Date('2026-01-01T00:00:00Z')) === 2025);
ok('5 April 2027 is still tax year 2026', call(PY.currentTaxYear, new Date('2027-04-05T23:59:59Z')) === 2026);
ok('6 April 2027 is tax year 2027', call(PY.currentTaxYear, new Date('2027-04-06T00:00:00Z')) === 2027);

console.log('\n=== THE CASE THAT WAS LIVE: no year parameter at all ===\n');
ok('an ABSENT parameter resolves to the current tax year, not zero', call(PY.resolveProofYear, null, NOW) === 2026);
ok('an undefined parameter resolves to the current tax year', call(PY.resolveProofYear, undefined, NOW) === 2026);
ok('an EMPTY parameter resolves to the current tax year', call(PY.resolveProofYear, '', NOW) === 2026);
ok('whitespace resolves to the current tax year', call(PY.resolveProofYear, '   ', NOW) === 2026);
ok('and none of those can come back as zero',
  [null, undefined, '', '   '].every((raw) => call(PY.resolveProofYear, raw, NOW) === 2026));

console.log('\n=== junk, and years nobody can prove income for ===\n');
ok('junk resolves to the current tax year', call(PY.resolveProofYear, 'nonsense', NOW) === 2026);
ok('a literal zero is refused', call(PY.resolveProofYear, '0', NOW) === 2026);
ok('a negative year is refused', call(PY.resolveProofYear, '-2026', NOW) === 2026);
ok('a year below the floor is refused', call(PY.resolveProofYear, '1999', NOW) === 2026);
ok('a FUTURE year is refused, because nobody can prove income for it yet', call(PY.resolveProofYear, '2035', NOW) === 2026);
ok('next year is refused on the same reasoning', call(PY.resolveProofYear, '2027', NOW) === 2026);
ok('a fraction is refused', call(PY.resolveProofYear, '2026.5', NOW) === 2026);
ok('Infinity is refused', call(PY.resolveProofYear, 'Infinity', NOW) === 2026);
ok('NaN is refused', call(PY.resolveProofYear, 'NaN', NOW) === 2026);

console.log('\n=== and a real year still works, which is the point of having the parameter ===\n');
ok('this tax year is accepted', call(PY.resolveProofYear, '2026', NOW) === 2026);
ok('last tax year is accepted', call(PY.resolveProofYear, '2025', NOW) === 2025);
ok('the floor itself is accepted', call(PY.resolveProofYear, String(PY.PROOF_YEAR_MIN), NOW) === PY.PROOF_YEAR_MIN);
ok('the year below the floor is not', call(PY.resolveProofYear, String(PY.PROOF_YEAR_MIN - 1), NOW) === 2026);

console.log('\n=== isProofYear, which is the same test the signed token has to pass ===\n');
ok('zero is not a proof year', call(PY.isProofYear, 0, NOW) === false);
ok('null is not a proof year', call(PY.isProofYear, null, NOW) === false);
ok('undefined is not a proof year', call(PY.isProofYear, undefined, NOW) === false);
ok('a numeric string is not a proof year, because a token body must hold a number', call(PY.isProofYear, '2026', NOW) === false);
ok('NaN is not a proof year', call(PY.isProofYear, Number.NaN, NOW) === false);
ok('a fraction is not a proof year', call(PY.isProofYear, 2026.5, NOW) === false);
ok('a future year is not a proof year', call(PY.isProofYear, 2035, NOW) === false);
ok('this tax year is a proof year', call(PY.isProofYear, 2026, NOW) === true);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// PART 2. THE SWEEP. EVERY ROUTE ON DISK THAT READS A YEAR OR A QUARTER FROM A QUERY STRING.
//
// The rule each site has to pass is stated as the defect itself: THE GUARD MUST TELL ZERO
// APART FROM A REAL YEAR. Not "there is a guard", not "Number.isInteger appears", because both
// of those were true on the day this shipped. A comparison that answers the same for 0 and for
// 2026 has no opinion about zero, and Number.isInteger is exactly such a comparison.
//
// A site passes one of two ways:
//   INLINE     the value is bound to a name and that name is compared somewhere in the file
//              against a number, in a way whose answer differs for 0 and for a real year.
//   DELEGATED  the raw parameter is handed straight to a named resolver, which this suite then
//              imports FROM DISK, following the route's own import line, and calls with the
//              parameter absent. A resolver in this position takes (raw, now) so it can be
//              asked the question deterministically.
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== the walk: every route.ts under app/api, read off the disk ===\n');
const apiDir = path.join(repo, 'app/api');
ok('app/api is a directory on disk', existsSync(apiDir) && lstatSync(apiDir).isDirectory());

const walk = (dir, out = []) => {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e.startsWith('.') || e === 'node_modules') continue;
    const full = path.join(dir, e);
    let st;
    try { st = lstatSync(full); } catch { continue; }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) walk(full, out);
    else if (e === 'route.ts') out.push(full);
  }
  return out;
};
const routeFiles = walk(apiDir).sort();
// A walk that finds nothing would pass every check below while testing nothing at all.
ok(`the walk found a real set of API routes (${routeFiles.length})`, routeFiles.length > 50);

// The two routes that are known to read a year today. Named here ONLY so that a walk which
// stops finding them fails loudly rather than going quiet. The checks themselves are applied to
// whatever the walk returns, so a third route gets them without this list being touched.
const KNOWN = ['app/api/income-proof/route.ts', 'app/api/quarter-pack/route.ts'];
const found = routeFiles.map(rel);
for (const k of KNOWN) ok(`the walk found ${k}`, found.includes(k));

// A read off the query string, whatever the receiver is called.
const isQueryReceiver = (recv) => /(^|\.)searchParams$/.test(recv) || /^(sp|params|query|qs)$/.test(recv);
// year, quarter and the two single letter forms the pages use.
const YEARISH = /^(year|y|taxyear|tax_year|taxYear|startyear|start_year|startYear)$/;
const QUARTERISH = /^(quarter|q|qtr)$/;
// Ambiguous keys are only in scope when the code treats them as a number: /api/companies-house
// reads ?q= as a company search string, and that is not a quarter.
const UNAMBIGUOUS = /^(year|taxyear|tax_year|taxYear|startyear|start_year|startYear|quarter)$/;
const COERCERS = new Set(['Number', 'parseInt', 'parseFloat']);
const NOT_A_RESOLVER = new Set(['String', 'Boolean', 'JSON', 'encodeURIComponent', 'decodeURIComponent']);

// The innermost call this expression sits inside, so `Number(sp.get('year'))` reports Number and
// `resolveProofYear(sp.get('year'), now)` reports resolveProofYear.
function enclosingCall(line, idx) {
  let depth = 0;
  for (let i = idx - 1; i >= 0; i -= 1) {
    const c = line[i];
    if (c === ')') depth += 1;
    else if (c === '(') {
      if (depth === 0) {
        const m = /([A-Za-z_$][\w$.]*)\s*$/.exec(line.slice(0, i));
        return m ? m[1] : '';
      }
      depth -= 1;
    }
  }
  return '';
}

const NUM = '-?\\d[\\d_]*(?:\\.\\d+)?';
const escapeName = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Every comparison of this name against a number anywhere in the file, written either way round.
function atomsFor(src, ident) {
  const n = escapeName(ident);
  const out = [];
  for (const m of src.matchAll(new RegExp(`\\b${n}\\b\\s*(===|!==|==|!=|>=|<=|>|<)\\s*(${NUM})`, 'g'))) {
    out.push({ op: m[1], lit: Number(m[2].replace(/_/g, '')), flipped: false });
  }
  for (const m of src.matchAll(new RegExp(`(${NUM})\\s*(===|!==|==|!=|>=|<=|>|<)\\s*\\b${n}\\b`, 'g'))) {
    out.push({ op: m[2], lit: Number(m[1].replace(/_/g, '')), flipped: true });
  }
  return out;
}
function truth(atom, v) {
  const a = atom.flipped ? atom.lit : v;
  const b = atom.flipped ? v : atom.lit;
  if (atom.op === '>=') return a >= b;
  if (atom.op === '<=') return a <= b;
  if (atom.op === '>') return a > b;
  if (atom.op === '<') return a < b;
  if (atom.op === '===' || atom.op === '==') return a === b;
  return a !== b;
}
// The whole rule, in one line: does any comparison in this file answer differently for zero than
// it does for a real value? If none does, zero is indistinguishable from a real year and the
// route will print it.
const tellsZeroApart = (atoms, good) => atoms.some((a) => truth(a, 0) !== truth(a, good));

const sites = [];
for (const abs of routeFiles) {
  const src = readFileSync(abs, 'utf8');
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
    for (const m of line.matchAll(/([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\s*\.\s*get\(\s*'([^']*)'\s*\)/g)) {
      const recv = m[1].replace(/\s+/g, '');
      const key = m[2];
      if (!isQueryReceiver(recv)) continue;
      const kind = YEARISH.test(key) ? 'year' : QUARTERISH.test(key) ? 'quarter' : null;
      if (!kind) continue;
      const wrapper = enclosingCall(line, m.index);
      const numeric = COERCERS.has(wrapper);
      const delegated = wrapper !== '' && !numeric && !NOT_A_RESOLVER.has(wrapper);
      // An ambiguous key that nothing treats as a number is not a year or a quarter.
      if (!numeric && !delegated && !UNAMBIGUOUS.test(key)) continue;
      const bound = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/.exec(line);
      sites.push({
        file: rel(abs), abs, line: i + 1, key, kind, wrapper, numeric, delegated, src,
        ident: bound ? bound[1] : '',
      });
    }
  });
}

console.log('\n=== the sites the walk turned up ===\n');
sites.forEach((s) => console.log(`        ${s.file}:${s.line}  ?${s.key}=  via ${s.wrapper || '(bare)'}`));
ok(`the sweep found year or quarter query sites to test (${sites.length})`, sites.length >= 3);
// Existence first, on each thing the checks below then make claims about.
ok('it found the income proof year site',
  sites.some((s) => s.file === 'app/api/income-proof/route.ts' && s.key === 'year'));
ok('it found the quarter pack year site',
  sites.some((s) => s.file === 'app/api/quarter-pack/route.ts' && s.key === 'year'));
ok('it found the quarter pack quarter site',
  sites.some((s) => s.file === 'app/api/quarter-pack/route.ts' && s.key === 'q'));

console.log('\n=== no site accepts Number(null) ===\n');
const offenders = [];
const resolverCache = new Map();

for (const s of sites) {
  const good = s.kind === 'year' ? 2026 : 1;
  if (s.numeric) {
    if (!s.ident) {
      offenders.push(`${s.file}:${s.line}  ?${s.key}= is coerced with ${s.wrapper}() but not bound to a name, so no guard can be followed`);
      continue;
    }
    const atoms = atomsFor(s.src, s.ident);
    if (!tellsZeroApart(atoms, good)) {
      offenders.push(`${s.file}:${s.line}  ?${s.key}= becomes \`${s.ident}\`, and nothing in the file tells 0 apart from ${good}. Number(null) is 0 and it gets through.`);
    }
    continue;
  }
  if (!s.delegated) {
    offenders.push(`${s.file}:${s.line}  ?${s.key}= is read raw with no coercion and no resolver, so nothing can be checked`);
    continue;
  }
  // DELEGATED. Follow the route's own import line to the resolver on disk and ask it.
  const name = s.wrapper;
  const key = `${s.file}::${name}`;
  if (resolverCache.has(key)) continue;
  resolverCache.set(key, true);
  const imp = [...s.src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)]
    .find((m) => m[1].split(',').map((x) => x.trim()).includes(name));
  ok(`${s.file} imports ${name} where this suite can follow it`, Boolean(imp));
  if (!imp) { offenders.push(`${s.file}:${s.line}  ${name}() is not imported by name, so it cannot be exercised`); continue; }
  const base = path.resolve(path.dirname(s.abs), imp[2]);
  const candidate = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')].find((f) => existsSync(f) && lstatSync(f).isFile());
  ok(`${name} resolves to a file on disk`, Boolean(candidate));
  if (!candidate) { offenders.push(`${s.file}:${s.line}  ${name}() does not resolve to a file`); continue; }
  let mod = null;
  try { mod = await import(pathToFileURL(candidate).href); } catch { mod = null; }
  ok(`${rel(candidate)} imports cleanly`, mod !== null);
  ok(`${rel(candidate)} exports ${name} as a function`, mod !== null && typeof mod[name] === 'function');
  if (!mod || typeof mod[name] !== 'function') {
    offenders.push(`${s.file}:${s.line}  ${name}() could not be called`);
    continue;
  }
  const answers = [null, undefined, '', '   ', '0'].map((raw) => call(mod[name], raw, NOW));
  const bad = answers.filter((a) => (s.kind === 'year' ? a !== good : !(Number.isInteger(a) && a >= 1 && a <= 4)));
  if (bad.length) {
    offenders.push(`${s.file}:${s.line}  ${name}() answered ${JSON.stringify(bad)} for an absent or empty parameter, expected ${good}`);
  }
}
offenders.forEach((o) => console.log(`        ${o}`));
ok('every year or quarter query parameter under app/api refuses Number(null)', offenders.length === 0);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// PART 3. THE SIGNED LINK. The ?mode=link branch mints a pack token from the SAME variable, so
// a bad year there is not a bad page, it is a permanent shareable lender document that nothing
// outside the token can correct. Every indexOf below is checked for minus one BEFORE it is
// compared with another, because minus one is less than everything and would pass an ordering
// test while proving nothing.
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== the signed link cannot carry a year we would refuse ===\n');
const ipPath = path.join(repo, 'app/api/income-proof/route.ts');
ok('app/api/income-proof/route.ts is on disk', existsSync(ipPath));
const ip = existsSync(ipPath) ? readFileSync(ipPath, 'utf8') : '';

const iMint = ip.indexOf('packToken(');
const iResolve = ip.indexOf('resolveProofYear(');
const iModeLink = ip.indexOf("sp.get('mode') === 'link'");
ok('the route still mints a pack token', iMint !== -1);
ok('the route resolves the year through lib/proofyear.ts', iResolve !== -1);
ok('the route still has a mode=link branch', iModeLink !== -1);
ok('the year is resolved BEFORE anything is signed',
  iResolve !== -1 && iMint !== -1 && iResolve < iMint);
ok('and the branch that signs checks the year on the way in',
  iModeLink !== -1 && iMint !== -1 && iModeLink < iMint
  && ip.slice(iModeLink, iMint).includes('isProofYear(year'));

const iClaimGuard = ip.indexOf('isProofYear(claim.year');
const iClaimUse = ip.indexOf('year = claim.year');
ok('the route still has a capability token path', iClaimUse !== -1);
ok('a year read back OUT of a token is tested too, because a signature is not a sanity check', iClaimGuard !== -1);
ok('and it is tested before it is used', iClaimGuard !== -1 && iClaimUse !== -1 && iClaimGuard < iClaimUse);

// The old shape must not come back into this file under any name.
ok('the route no longer decides the year with a bare Number.isInteger',
  !/Number\.isInteger\([^)]*\)\s*\?/.test(ip));

// ═══════════════════════════════════════════════════════════════════════════════════════════
// PART 4. THE SCREEN AND THE PRINTED SHEET ARE ONE DOCUMENT.
//
// app/app/proof-of-income/page.tsx draws the same summary on his phone that this route prints
// for his lender. If the two disagree about which years exist, a man reads one set of figures
// and hands over another. So the floor is compared, not assumed.
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== the screen and the printed sheet agree about which years exist ===\n');
const pagePath = path.join(repo, 'app/app/proof-of-income/page.tsx');
ok('app/app/proof-of-income/page.tsx is on disk', existsSync(pagePath));
const page = existsSync(pagePath) ? readFileSync(pagePath, 'utf8') : '';
const pageRead = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*Number\(\s*one\('y'\)\s*\)/.exec(page);
ok('the page still reads its ?y= parameter where this suite can find it', Boolean(pageRead));
if (pageRead) {
  const atoms = atomsFor(page, pageRead[1]);
  ok('the page tells zero apart from a real year too', tellsZeroApart(atoms, 2026));
  const floors = atoms.filter((a) => (a.op === '>=' && !a.flipped) || (a.op === '<=' && a.flipped)).map((a) => a.lit);
  ok('the page states a floor for the year it will draw', floors.length > 0);
  ok(`the page floor and PROOF_YEAR_MIN are the same year (${floors[0]} and ${PY.PROOF_YEAR_MIN})`,
    floors.length > 0 && floors[0] === PY.PROOF_YEAR_MIN);
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

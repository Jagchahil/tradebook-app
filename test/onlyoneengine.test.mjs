// THERE IS ONE TAX ENGINE. THIS TEST MAKES SURE IT STAYS THAT WAY.
//
// WHAT THIS PROTECTS, AND WHY IT IS NOT PEDANTRY
//
// app/tax-calculator/Calc.tsx used to carry its OWN copy of the tax law: 12570, 50270, 37700,
// 125140, 0.2, 0.4, 0.45 and 0.06, typed straight into a marketing page.
//
// The danger is not "it might drift one day". It is worse and it is specific:
//
//   KHOJI WATCHES lib/taxengine.ts. IT DOES NOT WATCH ANY OTHER FILE.
//
// Khoji compares GOV.UK to the constants we publish at /facts.json, and /facts.json is built from
// the engine. So the morning after a Budget, Khoji would compare GOV.UK to the engine, find the
// engine correct, and report GREEN, while a second copy in a component quietly handed a wrong
// number to every man who visited the website.
//
// The alarm showing all clear while the product lies. That is the exact failure this codebase keeps
// producing, and the exact one Khoji exists to prevent. A second copy of a watched number is a way
// of standing OUTSIDE the watch.
//
// So: no file outside lib/ may contain a tax constant. Import it.

import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '..');

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

// The numbers that ARE the tax law. If one of these appears in a component, somebody has copied the
// engine rather than importing it.
const TAX_NUMBERS = [
  ['12570', 'the personal allowance'],
  ['50270', 'the Class 4 upper limit'],
  ['37700', 'the basic rate band'],
  ['125140', 'where the personal allowance runs out'],
  ['1048', 'the monthly personal allowance'],
];

// Files allowed to hold the law. lib/ is where it lives, and the tests and Khoji check it.
const ALLOWED = [
  /^lib\//,
  /^test\//,
  /^scripts\//,
  /^supabase\//,
  /^docs\//,
  /^khoji\//,
  /^app\/facts\.json\//,   // publishes FACTS, imported from the engine
  /^app\/rules\.json\//,
  /^app\/llms\.txt\//,     // quotes the figures for the machines, generated from the engine
];

// ⚠️ THIS CRASHED THE WHOLE SUITE ON ITS FIRST REAL RUN, and it is worth saying why.
//
// It used statSync, and it walked EVERY directory it found. The khoji folder carries a bundled
// node install with a DANGLING SYMLINK in it (.node/bin/corepack). statSync follows symlinks, the
// target does not exist, and it throws ENOENT. Not "returns false". THROWS. So a test whose job is
// to guard the tax engine took the entire test run down because of a broken shortcut in a folder it
// had no business looking in.
//
// Two fixes, and both are the point:
//   1. Do not walk what you do not need. Dot-directories and khoji are not TypeScript sources.
//   2. lstat, not stat. It does not follow the link, so a dead one is just a dead file.
//
// A guard that can crash is not a guard. It is a second thing that can break.
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'khoji', '.node', 'ios', 'android']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || name.startsWith('.')) continue;
    const full = path.join(dir, name);
    let st;
    try {
      st = lstatSync(full); // lstat: a dangling symlink is a file, not an exception
    } catch {
      continue; // unreadable? it is not a tax constant. Move on.
    }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

console.log('\nonly one tax engine');

const offenders = [];
for (const file of walk(root)) {
  const rel = path.relative(root, file);
  if (ALLOWED.some((re) => re.test(rel))) continue;

  const src = readFileSync(file, 'utf8');
  // Strip comments. A comment EXPLAINING why we removed the numbers must not itself trip the guard,
  // which is exactly the trap the domain guard fell into when it caught its own warning.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  for (const [n, what] of TAX_NUMBERS) {
    // Word boundary, so 125140 does not match inside a longer id, and 12570 does not match a date.
    if (new RegExp(`(?<![\\d.])${n}(?![\\d.])`).test(code)) {
      offenders.push(`${rel}: contains ${n} (${what})`);
    }
  }
}

ok(
  `no component outside lib/ carries a tax constant${offenders.length ? `\n     ${offenders.join('\n     ')}` : ''}`,
  offenders.length === 0,
);

// And the positive: the public calculator really does import the canonical engine, the way the CIS
// calculator always has. A file can pass the check above simply by having no numbers in it at all.
const calc = readFileSync(path.join(root, 'app/tax-calculator/Calc.tsx'), 'utf8');
ok('the public tax calculator imports the canonical engine',
  /from '\.\.\/\.\.\/lib\/taxengine'/.test(calc));
ok('and it uses soleTraderTax, not its own maths', /soleTraderTax\(/.test(calc));

const cis = readFileSync(path.join(root, 'app/cis-calculator/Calc.tsx'), 'utf8');
ok('the CIS calculator still imports it too (it always did this right)',
  /from '\.\.\/\.\.\/lib\/taxengine'/.test(cis));

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

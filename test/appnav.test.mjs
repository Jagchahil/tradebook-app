// The dashboard shell. Run: node test/appnav.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 A NAV IS A PROMISE, AND EVERY ITEM IN IT MUST LEAD SOMEWHERE.
//
// The web app had no navigation at all until 30 July: three pages, three hand rolled headers, and
// from his own books the only reachable things were the setup nudge and the pile. The fix is one
// component, and the risk a shared nav introduces is the opposite failure, a menu listing screens
// that were planned and never built.
//
// So every href in SECTIONS must resolve to a real page.tsx, and every page under app/app must
// render the nav and name itself. The phone app has forty five screens; this is what keeps the web
// app honest as it grows to meet them.
// ═══════════════════════════════════════════════════════════════════════════════════════════
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync, readdirSync, lstatSync } from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}`); } };

const nav = readFileSync(path.join(root, 'app/app/AppNav.tsx'), 'utf8');
// Read the hrefs out of SECTIONS itself rather than retyping them here. A list typed twice is a
// list that disagrees with itself the first time somebody edits one copy.
const block = nav.slice(nav.indexOf('export const SECTIONS'), nav.indexOf('export function AppNav'));
const hrefs = [...new Set([...block.matchAll(/href: '([^']+)'/g)].map((m) => m[1]))];

console.log('\n=== the nav leads somewhere real ===\n');
ok(`SECTIONS is readable and has items (${hrefs.length})`, hrefs.length >= 3);

const pageFor = (route) => {
  const dir = route === '/' ? 'app' : path.join('app', route.replace(/^\//, ''));
  return ['page.tsx', 'layout.tsx'].map((f) => path.join(root, dir, f)).some(existsSync);
};
const dead = hrefs.filter((h) => !pageFor(h));
dead.forEach((d) => console.log(`        ${d} is in the nav and has no page`));
ok('every href in the nav has a page behind it', dead.length === 0);

console.log('\n=== every screen carries the shell ===\n');
const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    if (e.startsWith('.')) continue;
    const full = path.join(dir, e);
    if (lstatSync(full).isSymbolicLink()) continue;
    if (lstatSync(full).isDirectory()) walk(full, out);
    else if (e === 'page.tsx') out.push(full);
  }
  return out;
};
const screens = walk(path.join(root, 'app/app')).map((f) => path.relative(root, f));
ok(`there are screens to check (${screens.length})`, screens.length >= 3);

// ⚠️ /app/setup IS EXEMPT AND THAT IS DELIBERATE. It is the seven step onboarding, and a man
// halfway through setting up should be finishing that, not wandering into his invoices. Every
// other screen gets the nav.
const SETUP = path.join('app', 'app', 'setup', 'page.tsx');
const missing = screens
  .filter((s) => s !== SETUP)
  .filter((s) => !readFileSync(path.join(root, s), 'utf8').includes('<AppNav current='));
missing.forEach((m) => console.log(`        ${m} does not render the nav`));
ok('every screen except setup renders the nav', missing.length === 0);

// A page that renders the nav but names a route the nav has never heard of highlights nothing, and
// nothing highlighted is how a man loses track of where he is.
const named = screens
  .filter((s) => s !== SETUP)
  .map((s) => [s, (readFileSync(path.join(root, s), 'utf8').match(/<AppNav current="([^"]+)"/) || [])[1]])
  .filter(([, c]) => c && !hrefs.includes(c));
named.forEach(([s, c]) => console.log(`        ${s} names "${c}", which is not in the nav`));
ok('every screen names a route the nav knows', named.length === 0);

console.log('\n=== the shell is server rendered, like the rest of the app ===\n');
ok('the nav is not a client component', !/^'use client'/m.test(nav));
ok('the dropdowns are <details>, so they work with no script', nav.includes('<details'));
ok('it uses the shared motion tokens rather than inventing timings', nav.includes('MOTION.'));
ok('no raw hex is painted in the shell', !/#[0-9a-f]{3,6}\b/i.test(nav));

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

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

// 🔴 THE ONE THAT SHIPPED BROKEN. The row held overflow-x:auto with overflow-y:visible, which CSS
// silently turns into auto on both axes, so the scroll box clipped the dropdowns hanging out of it
// and the carets opened onto nothing. A menu inside a scrolling row cannot be seen, so the row is
// not allowed to scroll.
const row = (nav.match(/\.lek-nav\{[^}]*\}/) || [''])[0];
ok('the nav row does not scroll, because a scroll box clips the menus inside it',
  !/overflow-x\s*:\s*(auto|scroll)/.test(row) && !/overflow\s*:\s*(auto|scroll)/.test(row));
ok('the nav row wraps instead', /flex-wrap\s*:\s*wrap/.test(row));

console.log('\n=== the desk rail: one component, css decides, always open ===\n');
//
// From BREAK.desk up the nav is a fixed left rail with every section's items visible, and in the
// hand the <details> clickers are untouched. The rail is a SECOND rendering of the same SECTIONS
// constant, because CSS cannot reveal a closed <details> (the panel sits in a browser slot author
// styles do not reach) and the open attribute cannot be forced on all five while they share a
// name. So the invariants are: same source of truth, no clicking on the desk, one of the two
// compositions always display:none, and the widths agreed through the shared constants.
ok('the rail exists', nav.includes('className="lek-side"'));
ok('🔴 THE BREAKPOINT COMES FROM BREAK.desk, NOT A NUMBER TYPED HERE',
  nav.includes('@media(min-width:${BREAK.desk}px)'));
ok('🔴 THE RAIL WIDTH COMES FROM THE SHARED SIDEBAR CONSTANT', nav.includes('width:${SIDEBAR}px'));
ok('the rail is fixed to the left edge',
  /\.lek-side\{display:block;position:fixed;top:0;left:0;bottom:0/.test(nav));
// ⚠️ NOT [^}]* HERE: the source being read interpolates ${SIDEBAR}, whose own closing brace ends
// a [^}]* match before the declaration being looked for. Bounded any-character instead.
ok('the rail scrolls its own overflow, so the last group is always reachable',
  /\.lek-side\{[\s\S]{0,220}?overflow-y:auto/.test(nav));
ok('the rail is hidden in the hand', nav.includes('.lek-side{display:none}'));
ok('and the phone bar is hidden on the desk', nav.includes('.lek-bar{display:none}'));

// The rail and the dropdowns must render the same nav, so both are generated from SECTIONS and
// neither retypes a label or an href. Exactly two walks: the phone one and the desk one.
ok('both compositions are generated from SECTIONS', (nav.match(/SECTIONS\.map/g) || []).length === 2);

// No clicking on the desk: everything after the rail begins is plain anchors, no <details>.
const railFrom = nav.indexOf('className="lek-side"');
ok('the rail is after the phone markup and holds no details at all',
  railFrom > 0 && !nav.slice(railFrom).includes('<details'));
// The current page is marked in both compositions, for the underline and for a screen reader.
ok('the rail marks the current page', (nav.match(/aria-current/g) || []).length >= 3);
// Signing out stays a form in both compositions, for the reason the phone bar comment gives.
ok('the rail can sign out, and it is still a form',
  (nav.match(/action="\/api\/auth\/signout" method="post"/g) || []).length === 2);

// The other half of the rail lives in APP_CSS: the content column has to move over to meet it, or
// the rail sits on top of the first card of every screen.
const tokens = readFileSync(path.join(root, 'lib/tokens.ts'), 'utf8');
ok('🔴 APP_CSS CLEARS THE RAIL, FROM THE SAME CONSTANT', tokens.includes('margin-left:max(${SIDEBAR'));

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

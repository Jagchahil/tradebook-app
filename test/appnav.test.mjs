// The floating shell. Run: node test/appnav.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 A NAV IS A PROMISE, AND EVERY ITEM IN IT MUST LEAD SOMEWHERE.
//
// On 5 August 2026 the web app's shell changed shape: the top bar with dropdowns and the desk
// sidebar became ONE floating bottom bar, Instagram shaped, at every width. Five items: Home,
// Money, the plus, Tax, You. The plus opens a glass sheet of six add actions, and Ask Lekhio
// floats top right as a round glass button. This web shell is the reference the native apps will
// copy, so this suite pins its shape, not just its existence.
//
// The risk a redesign introduces is the quiet one: a row that lived on the old sidebar and now
// lives nowhere. So this file holds the full mapping: every destination the old sidebar offered,
// and the exact place inside the new shell that still offers it.
// ═══════════════════════════════════════════════════════════════════════════════════════════
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync, readdirSync, lstatSync } from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}`); } };
const read = (p) => readFileSync(path.join(root, p), 'utf8');

const nav = read('app/app/AppNav.tsx');
// Read the hrefs out of the source itself rather than retyping them here. A list typed twice is a
// list that disagrees with itself the first time somebody edits one copy.
const sections = nav.slice(nav.indexOf('export const SECTIONS'), nav.indexOf('function TabIcon'));
const plus = nav.slice(nav.indexOf('export const PLUS_ACTIONS'), nav.indexOf('export const SECTIONS'));
const hrefs = [...new Set([...sections.matchAll(/href: '([^']+)'/g)].map((m) => m[1]))];
const plusHrefs = [...plus.matchAll(/href: '([^']+)'/g)].map((m) => m[1]);

console.log('\n=== the bar: five items, and the tabs are these four ===\n');

// The four tabs, in order, read from the top level of SECTIONS. The plus is the fifth item and
// sits between the two halves, which is why the render below is two slices of one constant.
const tabs = [...sections.matchAll(/^  \{\n    (?:\/\/[^\n]*\n    )*href: '([^']+)',\n    label: '([^']+)'/gm)]
  .map((m) => [m[1], m[2]]);
ok('there are exactly four tabs', tabs.length === 4);
ok('🔴 THE TABS ARE HOME, MONEY, TAX, YOU, IN THAT ORDER, AT THESE ROUTES',
  JSON.stringify(tabs) === JSON.stringify([
    ['/app', 'Home'], ['/app/money', 'Money'], ['/app/tax', 'Tax'], ['/app/you', 'You'],
  ]));
ok('the bar renders the plus BETWEEN the two halves of SECTIONS',
  nav.includes('SECTIONS.slice(0, 2).map(tab)') && nav.includes('SECTIONS.slice(2).map(tab)')
  && nav.indexOf('SECTIONS.slice(0, 2).map(tab)') < nav.indexOf('<details className="lek-plus">')
  && nav.indexOf('<details className="lek-plus">') < nav.indexOf('SECTIONS.slice(2).map(tab)'));
ok('the bar is a nav with a label', nav.includes('<nav className="lek-dock" aria-label="Your Lekhio">'));
ok('the active tab is marked for the eye and the screen reader',
  nav.includes("className={`lek-tab${on ? ' on' : ''}`}")
  && nav.includes("aria-current={on ? 'page' : undefined}"));
ok('a page under a tab lights the tab: the owner is found through SECTIONS items',
  /sec\.href === current \|\| sec\.items\.some\(\(i\) => i\.href === current\)/.test(nav));

console.log('\n=== the plus sheet: six actions, no script ===\n');

ok('🔴 THE SHEET HOLDS EXACTLY THESE SIX, PER DOC 103, AND A SEVENTH MUST ARGUE ONE OUT',
  JSON.stringify(plusHrefs) === JSON.stringify([
    '/app/invoices/new', '/app/diary', '/app/goals',
    '/app/money/add', '/app/money/capture', '/app/money/import',
  ]));
ok('the plus is a <details>, so it opens and closes with no client script',
  nav.includes('<details className="lek-plus">') && !/^'use client'/m.test(nav));
ok('the summary is the button, keyboard focusable by nature, and it says what it does',
  /<summary className="lek-plus-btn" aria-haspopup="true" aria-label="Add to your books">/.test(nav));
ok('the sheet renders every action from PLUS_ACTIONS, identically',
  nav.includes('PLUS_ACTIONS.map((a) => (')
  && nav.includes('className="lek-plus-item"'));

console.log('\n=== every route in the shell leads somewhere real ===\n');

ok(`SECTIONS is readable and has items (${hrefs.length})`, hrefs.length >= 10);
const pageFor = (route) => {
  const dir = route === '/' ? 'app' : path.join('app', route.replace(/^\//, ''));
  return ['page.tsx', 'layout.tsx'].map((f) => path.join(root, dir, f)).some(existsSync);
};
const dead = [...new Set([...hrefs, ...plusHrefs])].filter((h) => !pageFor(h));
dead.forEach((d) => console.log(`        ${d} is in the shell and has no page`));
ok('every href in the shell has a page behind it', dead.length === 0);

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
// other screen gets the shell.
const SETUP = path.join('app', 'app', 'setup', 'page.tsx');
const missing = screens
  .filter((s) => s !== SETUP)
  .filter((s) => !read(s).includes('<AppNav current='));
missing.forEach((m) => console.log(`        ${m} does not render the shell`));
ok('every screen except setup renders the shell', missing.length === 0);

// A page that renders the shell but names a route the shell has never heard of lights no tab, and
// nothing lit is how a man loses track of where he is.
const known = new Set([...hrefs, ...plusHrefs]);
const named = screens
  .filter((s) => s !== SETUP)
  .map((s) => [s, (read(s).match(/<AppNav current="([^"]+)"/) || [])[1]])
  .filter(([, c]) => c && !known.has(c));
named.forEach(([s, c]) => console.log(`        ${s} names "${c}", which is not in the shell`));
ok('every screen names a route the shell knows', named.length === 0);

console.log('\n=== 🔴 THE OLD SIDEBAR IS GONE, EVERYWHERE ===\n');
// The old shell was a top bar with <details> dropdowns plus a fixed desk rail. If any page still
// draws it, that page has two navs and the redesign shipped half done.
ok('the nav no longer contains the rail or the top bar',
  !nav.includes('lek-side') && !nav.includes('lek-bar') && !nav.includes('lek-drop')
  && !nav.includes('SIDEBAR'));
const relapsed = screens.filter((s) => /lek-side|lek-drop\b/.test(read(s)));
relapsed.forEach((s) => console.log(`        ${s} still renders old sidebar markup`));
ok('🔴 NO PAGE UNDER app/app RENDERS THE OLD SIDEBAR', relapsed.length === 0);
const tokens = read('lib/tokens.ts');
ok('APP_CSS no longer clears a rail: the column simply centres',
  !tokens.includes('margin-left:max(') && !/SIDEBAR/.test(tokens));
ok('🔴 APP_CSS KEEPS THE BAR OFF THE LAST ROW, FROM THE SHARED DOCK CONSTANT',
  tokens.includes('DOCK.clearance}px}') || tokens.includes('${DOCK.clearance}px'));

console.log('\n=== the glass, held to the tokens ===\n');
ok('the shell is server rendered, like the rest of the app', !/^'use client'/m.test(nav));
ok('no raw hex is painted in the shell', !/#[0-9a-f]{3,6}\b/i.test(nav));
ok('it uses the shared motion tokens rather than inventing timings', nav.includes('MOTION.'));
ok('🔴 THE GLASS RECIPE IS DECLARED ONCE and worn by the bar, the sheet and the ask button',
  (nav.match(/className="lek-glass /g) || []).length >= 3
  && nav.includes('.lek-glass{background:${PANEL};background:${edge(PANEL, 78)}'));
ok('the glass is a blur AND a saturate, from the one GLASS constant in tokens',
  nav.includes('backdrop-filter:${GLASS.blur}') && /blur\(\d+px\) saturate\([\d.]+\)/.test(tokens));
ok('🔴 THE BORDER IS THE SHARED GLASS.border ON EVERY SHELL CONTROL, never a local number',
  (nav.match(/border:\$\{GLASS\.border\}px solid/g) || []).length >= 3
  && !/border:\d+px solid/.test(nav));
ok('the translucent fill declares a solid token fallback FIRST, for the old Androids',
  /background:\$\{PANEL\};background:\$\{edge\(PANEL/.test(nav));
ok('definition comes from the border and an inset highlight, never a SHADOW token alone',
  !nav.includes('SHADOW.') && nav.includes('box-shadow:inset 0 1px 0'));

console.log('\n=== the bar floats, and five items fit a 375px phone ===\n');
ok('the bar is fixed to the foot and centred', nav.includes('.lek-dock-bar{position:fixed;z-index:40;left:50%;transform:translateX(-50%)'));
ok('it keeps a margin from the screen edges: a pill, not an edge to edge slab',
  nav.includes('width:calc(100% - ${SPACE.lg}px)') && nav.includes('border-radius:${RADIUS.pill}px'));
ok('it is capped at DOCK.maxWidth so a desk gets a pill too', nav.includes('max-width:${DOCK.maxWidth}px'));
ok('the tabs flex to fit: no fixed tab width to overflow a narrow phone',
  nav.includes('.lek-tab{flex:1 1 0;min-width:0'));
ok('the bar respects the phone\'s safe area', nav.includes('env(safe-area-inset-bottom'));

console.log('\n=== ask lekhio, floating top right ===\n');
ok('the button exists, is glass, links the thread, and is labelled for a screen reader',
  /<a href="\/app\/thread" className="lek-glass lek-ask" aria-label="Ask Lekhio">/.test(nav));
ok('it draws on every screen except the thread itself',
  /current === '\/app\/thread' \? null : \(/.test(nav));
// ⚠️ NOT [^}]* HERE: the source being read interpolates ${SPACE.sm}, whose own closing brace ends
// a [^}]* match before the declaration being looked for. Bounded any-character instead.
ok('it is fixed top right', nav.includes('.lek-ask{position:fixed;z-index:40;top:calc(')
  && /\.lek-ask\{[\s\S]{0,160}?right:\$\{SPACE\.sm\}px/.test(nav));

console.log('\n=== sign out survived the redesign, and it is still a POST ===\n');
// The old sidebar carried it; the profile hub carries it now. A GET that ends a session is a
// session any other site can end for him with an image tag, so it stays a form.
const you = read('app/app/you/page.tsx');
ok('the shell itself no longer signs out', !nav.includes('/api/auth/signout'));
ok('🔴 THE YOU PAGE SIGNS OUT, AS A FORM POST',
  /action="\/api\/auth\/signout" method="post"/.test(you) && /Sign out/.test(you));

console.log('\n=== 🔴 THE FULL MAPPING: every old sidebar door still has a home ===\n');
// Each destination the old sidebar offered, and the exact file inside the new shell whose markup
// offers it now. `null` for the file means the destination is a tab on the bar itself. The plus
// sheet is checked separately above; a row here may ALSO be on the plus, but every one of these
// must be findable by reading, not just by knowing.
const MAPPING = [
  ['/app', null],                                            // Overview: the Home tab
  ['/app/feed', 'app/app/page.tsx'],                         // Feed: flows under Home, heading opens it
  ['/app/money', null],                                      // Everything logged: the Money tab
  ['/app/pile', 'app/app/money/page.tsx'],                   // Waiting on you: the Money page row
  ['/app/goals', 'app/app/money/page.tsx'],                  // Goals: Money's doors, and the plus
  ['/app/money/add', 'app/app/money/page.tsx'],              // Add an entry: Money's doors, and the plus
  ['/app/money/capture', 'app/app/money/page.tsx'],          // Upload a till slip: Money's doors, and the plus
  ['/app/money/import', 'app/app/money/page.tsx'],           // Upload a statement: Money's doors, and the plus
  ['/app/tax', null],                                        // Where you stand: the Tax tab
  ['/app/tax/summary', 'app/app/tax/page.tsx'],              // Quarterly summary: the tax hub
  ['/app/tax/what-if', 'app/app/tax/page.tsx'],              // What if: the tax hub
  ['/app/tax/ways-to-save', 'app/app/tax/page.tsx'],         // Ways to save: the tax hub
  ['/app/tax/vehicle', 'app/app/tax/page.tsx'],              // Vehicles: the tax hub
  ['/app/tax/can-i-claim', 'app/app/tax/page.tsx'],          // Can I claim it: the tax hub
  ['/app/pay-yourself', 'app/app/tax/page.tsx'],             // Pay yourself: the tax hub
  ['/app/invoices', 'app/app/you/page.tsx'],                 // Every invoice: the You hub
  ['/app/invoices/new', 'app/app/invoices/page.tsx'],        // Make an invoice: the plus, and the list page
  ['/app/diary', 'app/app/you/page.tsx'],                    // Jobs diary: the You hub, and the plus
  ['/app/proof-of-income', 'app/app/you/page.tsx'],          // Proof of income: the You hub
  ['/app/share-books', 'app/app/you/page.tsx'],              // Share your books: the You hub
  ['/app/thread', 'app/app/AppNav.tsx'],                     // Ask Lekhio: the floating button, every screen
  ['/app/you', null],                                        // About you: the You tab
  ['/app/you/circumstances', 'app/app/you/page.tsx'],        // Circumstances: the You hub
  ['/app/you/elections', 'app/app/you/page.tsx'],            // Allowances: the You hub
  ['/app/connect', 'app/app/you/page.tsx'],                  // WhatsApp: the You hub's phone banner
  ['/app/you/billing', 'app/app/you/page.tsx'],              // Billing: the You hub
  ['/app/you/settings', 'app/app/you/page.tsx'],             // Settings: the You hub
];
const tabRoutes = new Set(tabs.map(([h]) => h));
for (const [dest, file] of MAPPING) {
  if (file === null) {
    ok(`${dest} is a tab on the bar`, tabRoutes.has(dest));
  } else {
    ok(`${dest} is offered by ${file}`, read(file).includes(`href="${dest}"`));
  }
}
ok('and nothing in the shell points at /account, the old portal door', !hrefs.includes('/account'));

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

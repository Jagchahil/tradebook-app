// The brand colour lock. Run: node test/tokens.test.mjs
//
// Three jobs, and the second one is the one that matters.
//
// 1. Nothing in the palette is a near miss of anything else in it. Two greens two ticks apart are
//    invisible in a diff and obvious on a screen, and that is exactly how we ended up with two.
// 2. Every accent and the ink that sits on top of it clears WCAG AA. Nudge an accent and this
//    recomputes the pair, so a colour change cannot quietly make a button unreadable. It already
//    would have caught white on the dark green "Approve and send to HMRC" button at 2.4:1.
// 3. The count of unnamed hexes in the tree only ever goes down.
//
// Plus a guard on the theme swap, which is a real bug this suite could not have found. See the
// note in lib/tokens.ts: the fix lives in JS, so the test checks the JS is still wired up.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const stage = mkdtempSync(path.join(tmpdir(), 'tokens-'));
writeFileSync(path.join(stage, 'tokens.ts'), readFileSync(path.join(root, 'lib/tokens.ts'), 'utf8'));
const T = await import(pathToFileURL(path.join(stage, 'tokens.ts')).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}`); } };

console.log('\n=== the palette is well formed ===\n');
const names = Object.keys(T.PALETTE);
ok('palette is not empty', names.length > 30);
ok('every entry is a six digit hex', names.every((n) => /^#[0-9A-F]{6}$/i.test(T.PALETTE[n])));

// Two colours this close are the same colour to a customer and a different one to a grep. That is
// how this codebase ended up with four greens, two reds, two golds and two WhatsApp greens.
//
// ⚠️ ACCENTS AND TEXT ONLY, NOT SURFACES. Backgrounds and tints are meant to sit close together:
// paper against panel, a page against a band. Every duplicate this codebase actually grew was an
// accent, so that is where the check earns its place. Widening it to surfaces only produces noise.
const GROUPS = {
  'light accents': ['RIVER', 'RIVER_DEEP', 'SAFFRON', 'SAFFRON_DEEP', 'GREEN', 'RED', 'WHATSAPP',
    'ON_SAFFRON_TINT', 'ON_GREEN_TINT'],
  'light text': ['INK', 'MUTED', 'BAND'],
  'dark accents': ['DARK_RIVER', 'DARK_RIVER_DEEP', 'DARK_SAFFRON', 'DARK_SAFFRON_DEEP', 'DARK_GREEN',
    'DARK_RED', 'WHATSAPP'],
  'dark text': ['DARK_INK', 'DARK_MUTED'],
};
const NEAR = 12;   // max difference on any one channel. Below this it is the same colour, typed twice.
const maxChannel = (a, b) => {
  const p = (h, i) => parseInt(h.replace('#', '').slice(i, i + 2), 16);
  return Math.max(Math.abs(p(a, 0) - p(b, 0)), Math.abs(p(a, 2) - p(b, 2)), Math.abs(p(a, 4) - p(b, 4)));
};
const nearMisses = [];
for (const [group, keys] of Object.entries(GROUPS)) {
  keys.forEach((k) => { if (!(k in T)) nearMisses.push(`${group} names ${k}, which does not exist`); });
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = T[keys[i]], b = T[keys[j]];
      if (typeof a !== 'string' || typeof b !== 'string' || a === b) continue;
      if (maxChannel(a, b) < NEAR) nearMisses.push(`${group}: ${keys[i]} ${a} vs ${keys[j]} ${b}`);
    }
  }
}
if (nearMisses.length) nearMisses.forEach((m) => console.log(`        ${m}`));
ok('no two colours in the same role are near misses of each other', nearMisses.length === 0);

console.log('\n=== contrast: what may sit on what ===\n');
ok('contrast of a colour with itself is 1', Math.abs(T.contrast('#1B59A6', '#1B59A6') - 1) < 1e-9);
ok('black on white is 21', Math.abs(T.contrast('#000000', '#FFFFFF') - 21) < 0.01);
ok('three digit hex is understood', Math.abs(T.contrast('#fff', '#FFFFFF') - 1) < 1e-9);
ok('there are pairs for both themes',
  T.ON_PAIRS.some((p) => p.theme === 'light') && T.ON_PAIRS.some((p) => p.theme === 'dark'));
for (const p of T.ON_PAIRS) {
  const r = T.contrast(p.bg, p.ink);
  ok(`${p.theme} ${p.name}: ink on ${p.bg} reads at ${r.toFixed(2)}`, r >= T.MIN_CONTRAST);
}
// The specific failures that started this. Kept as their own assertions so the reason survives.
ok('white on the dark river would NOT pass, which is why ON tokens exist',
  T.contrast(T.DARK_RIVER, '#FFFFFF') < T.MIN_CONTRAST);
ok('white on the dark green would NOT pass either',
  T.contrast(T.DARK_GREEN, '#FFFFFF') < T.MIN_CONTRAST);
ok('white on the WhatsApp green would NOT pass in either theme',
  T.contrast(T.WHATSAPP, '#FFFFFF') < T.MIN_CONTRAST);

console.log('\n=== the stylesheet is built from the palette ===\n');
ok('THEME_CSS declares a light root', T.THEME_CSS.includes(':root{'));
ok('THEME_CSS declares a dark block', T.THEME_CSS.includes('[data-theme="dark"]'));
ok('THEME_CSS carries the light river', T.THEME_CSS.includes(T.RIVER));
ok('THEME_CSS carries the dark river', T.THEME_CSS.includes(T.DARK_RIVER));
ok('THEME_CSS carries an on-river ink for each theme',
  T.THEME_CSS.includes(`--on-river:${T.ON_RIVER}`) && T.THEME_CSS.includes(`--on-river:${T.DARK_ON_RIVER}`));
// Every hex THEME_CSS emits must be a named colour. A literal in there is a colour with no name.
const inCss = [...new Set((T.THEME_CSS.match(/#[0-9A-Fa-f]{6}/g) || []).map((h) => h.toUpperCase()))];
const named = new Set(Object.values(T.PALETTE).map((h) => h.toUpperCase()));
ok('every hex in THEME_CSS is a named colour', inCss.every((h) => named.has(h)));

// ── The app's theme sheet: the same two palettes, hung off the DEVICE, with zero script. ──
//
// The app ships no client JavaScript, so it cannot run the toggle's swap. APP_THEME_CSS is how it
// still gets dark: prefers-color-scheme decides, the browser does the switching, and the values
// are the same two lists THEME_CSS uses, built from the same constants so they cannot drift.
ok('APP_THEME_CSS exists and declares a light root', T.APP_THEME_CSS.includes(':root{'));
ok('🔴 THE APP FOLLOWS THE DEVICE, NOT THE TOGGLE', T.APP_THEME_CSS.includes('@media(prefers-color-scheme:dark)')
  && !T.APP_THEME_CSS.includes('data-theme'));
ok('APP_THEME_CSS carries the light river', T.APP_THEME_CSS.includes(T.RIVER));
ok('APP_THEME_CSS carries the dark river', T.APP_THEME_CSS.includes(T.DARK_RIVER));
ok('APP_THEME_CSS carries an on-river ink for each theme',
  T.APP_THEME_CSS.includes(`--on-river:${T.ON_RIVER}`) && T.APP_THEME_CSS.includes(`--on-river:${T.DARK_ON_RIVER}`));
ok('the browser furniture follows the same query', T.APP_THEME_CSS.includes('color-scheme:light dark'));
const inAppCss = [...new Set((T.APP_THEME_CSS.match(/#[0-9A-Fa-f]{6}/g) || []).map((h) => h.toUpperCase()))];
ok('every hex in APP_THEME_CSS is a named colour', inAppCss.every((h) => named.has(h)));
ok('the two sheets carry identical dark values, not two lists maintained by hand',
  inAppCss.sort().join() === inCss.sort().join());
// And the shell sheet itself paints only with the variables: a hex in APP_CSS outside the theme
// block would be a colour the dark theme cannot reach.
ok('🔴 APP_CSS PAINTS WITH THE VARIABLES, NOT HEXES',
  !/#[0-9A-Fa-f]{6}/.test(T.APP_CSS.replace(T.APP_THEME_CSS, '')));
ok('APP_CSS clears the desk rail from the shared constant, plus one rhythm step of air',
  typeof T.SIDEBAR === 'number' && T.APP_CSS.includes(`margin-left:max(${T.SIDEBAR + T.SPACE.lg}px`));

console.log('\n=== the theme swap stays wired ===\n');
const site = readFileSync(path.join(root, 'app/_shared/site.tsx'), 'utf8');
ok('THEME_SWAP_JS turns transitions off for the swap', T.THEME_SWAP_JS.includes(T.THEME_SWAP_CLASS));
ok('THEME_SWAP_JS forces the reflow that makes it work', T.THEME_SWAP_JS.includes('offsetWidth'));
ok('THEME_SWAP_JS puts transitions back next frame', T.THEME_SWAP_JS.includes('requestAnimationFrame'));
ok('THEME_CSS kills transitions while the swap class is on',
  T.THEME_CSS.includes(`html.${T.THEME_SWAP_CLASS}`) && T.THEME_CSS.includes('transition:none !important'));
ok('site.tsx uses the shared swap helper', site.includes('THEME_SWAP_JS'));
// 🔴 The whole bug in one assertion. Every theme change must go through swapTheme, because a bare
// setAttribute leaves the body text, the nav and the buttons on the previous palette.
const bareSets = site.split('\n')
  .map((l, i) => [l, i + 1])
  .filter(([l]) => /setAttribute\(\s*'data-theme'/.test(l) && !l.trim().startsWith('//'));
if (bareSets.length) bareSets.forEach(([l, n]) => console.log(`        site.tsx:${n} ${l.trim().slice(0, 70)}`));
ok('no theme change in site.tsx bypasses swapTheme', bareSets.length === 0);
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THIS GUARD USED TO READ "the toggle reads back the choice it saves", AND IT WAS RIGHT WHEN IT
// WAS WRITTEN. The bug it caught was real: the toggle wrote localStorage and nothing ever read it,
// so a man's choice was lost the moment he clicked a link. The premise has since gone.
//
// 430fa37, 3 July, "Light-only theme sitewide", hid the toggle with display:none !important and
// left everything it drove still running. On 3 August that was reported live as "the website is
// stuck in dark mode, it should match my laptop": the stored choice still outranked the device
// FOREVER, and the button that made it no longer existed on any screen at any width. The state was
// reachable, permanent, and impossible to undo.
//
// So the claim inverts. There is no toggle, therefore there is no choice to persist, therefore
// nothing may outrank the device. Fixed to say the true thing rather than deleted, because the old
// wording is the record of why setItem and getItem were ever paired here.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
ok('🔴 NO STORED CHOICE OUTRANKS THE DEVICE, because there is no control left to make one',
  !site.includes("localStorage.setItem('lekhio-theme'")
  && !site.includes("localStorage.getItem('lekhio-theme'"));
ok('...and the stale key in an early visitor\'s browser is cleared rather than left as a landmine',
  site.includes("localStorage.removeItem('lekhio-theme')"));
ok('site.tsx no longer hand types a palette',
  !/--river:#[0-9A-Fa-f]{6}/.test(site) && !/--tx-mut:#[0-9A-Fa-f]{6}/.test(site));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 A COMMENT INSIDE A CSS TEMPLATE LITERAL IS SHIPPED TO EVERY VISITOR.
//
// Found on 3 August 2026 by MEASURING THE LIVE PAGE, not by reading it: 1,263 bytes of CSS
// comments, 4.1% of all the CSS on the front door, downloaded by everybody who has ever opened
// lekhio.app. TypeScript and JSX comments are stripped by the compiler and cost nothing, which is
// why this codebase can afford to explain itself everywhere. Inside a backtick block of CSS they
// are just characters and they go down the wire.
//
// The fix is not to stop writing them: the reasoning beside a rule is why anybody can safely change
// it later. They are stripped when the stylesheet is BUILT, by tagging the literal with css``.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== css comments never reach the browser ===\n');
ok('css`` strips a comment', !T.css`/* gone */ .a{color:red}`.includes('gone'));
ok('...and keeps the rule itself', /\.a\{color:red\}/.test(T.css`/* gone */ .a{color:red}`));
ok('...across several, including multi line', 
  !T.css`/* one */ .a{color:red} /* two\nlines */ .b{color:blue}`.includes('two'));
ok('...and never touches the // in a url, which is not a comment',
  T.css`.a{background:url(https://x.test/i.png)}`.includes('https://x.test/i.png'));
ok('it accepts a plain string too, for callers that already built one',
  T.css('/* x */ .c{top:0}').trim() === '.c{top:0}');

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THIS GUARD USED TO NAME THREE FILES, AND THE THREE IT NAMED WERE THE THREE ALREADY FIXED.
//
// It read:  for (const f of ['app/_shared/site.tsx', 'app/page.tsx', 'app/how-mtd-works/page.tsx'])
// It was green the moment it was written and it could never have gone red, because it tested the
// work rather than the claim. 2,880 further bytes of CSS comment were shipping while it passed:
// 1,135 in APP_CSS and 821 in AppNav, both on EVERY signed in page, and 180 inside the income
// summary a customer hands to a lender. Measured on the live site the next morning.
//
// ⚠️ A GUARD THAT NAMES THE FILES YOU JUST EDITED IS NOT A GUARD, IT IS A RECEIPT.
//
// So it sweeps the whole of app/ and lib/ instead, and it asserts the OUTCOME rather than the
// habit: no untagged template literal anywhere may contain a CSS comment. Tagging a stylesheet
// that has no comments in it changes not one byte, so it is not required. The moment somebody
// writes /* inside a bare backtick, wherever they do it, this goes red.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
const CSS_SKIP = ['node_modules', '.git', '.next', '_to_delete', '_scale_review'];
const cssWalk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    if (e.startsWith('.')) continue;
    const full = path.join(dir, e);
    const rel = path.relative(root, full);
    if (CSS_SKIP.some((s) => rel === s || rel.startsWith(s + path.sep))) continue;
    const st = lstatSync(full);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) cssWalk(full, out);
    else if (/\.(ts|tsx)$/.test(e) && !e.includes('fuse_hidden')) out.push(full);
  }
  return out;
};
// Find every template literal and note whether the identifier `css` sits immediately in front of
// it. ${...} is tracked so a nested backtick inside an interpolation does not close the outer one.
const literals = [];
for (const f of [...cssWalk(path.join(root, 'app')), ...cssWalk(path.join(root, 'lib'))]) {
  const src = readFileSync(f, 'utf8');
  for (let i = 0; ;) {
    const b = src.indexOf('`', i);
    if (b === -1) break;
    let j = b + 1;
    let depth = 0;
    for (; j < src.length; j++) {
      const c = src[j];
      if (c === '\\') { j++; continue; }
      if (c === '$' && src[j + 1] === '{') { depth++; j++; continue; }
      if (c === '}' && depth > 0) { depth--; continue; }
      if (c === '`' && depth === 0) break;
    }
    const body = src.slice(b + 1, j);
    if (/\/\*[\s\S]*?\*\//.test(body)) {
      literals.push({
        file: path.relative(root, f),
        line: src.slice(0, b).split('\n').length,
        tagged: /(^|[^A-Za-z0-9_$])css\s*$/.test(src.slice(Math.max(0, b - 40), b)),
      });
    }
    i = j + 1;
  }
}
const untagged = literals.filter((l) => !l.tagged);
ok(untagged.length === 0
  ? `no untagged template literal carries a CSS comment (${literals.length} carry one, all tagged)`
  : `UNTAGGED CSS COMMENT, it ships to the browser: ${untagged.map((l) => `${l.file}:${l.line}`).join(', ')}`,
untagged.length === 0);

// ⚠️ AND THE SWEEP ITSELF IS PROVED, because one that found nothing at all would also pass the line
// above. These four are known to carry comments inside a tagged stylesheet, so if the scanner ever
// stops seeing template literals this goes red before the guard above goes quietly green.
for (const f of ['lib/tokens.ts', 'app/_shared/site.tsx', 'app/page.tsx', 'app/app/AppNav.tsx']) {
  ok(`the sweep can still see the tagged stylesheet in ${f}`,
    literals.some((l) => l.file === f && l.tagged));
}

console.log('\n=== unnamed colours only ever go down ===\n');
// A hex that is not in the palette is a colour nobody named. Some are legitimate: a one off tint,
// a border, somebody else's brand inside a mock. They are not all worth a token. What is NOT
// acceptable is the number growing, so this is a ratchet, not a ban.
//
// ⚠️ RAISING THIS CEILING IS ALWAYS THE WRONG FIX. If it fails, name the colour in lib/tokens.ts
// or use one that is already named. app/team is excluded: internal screens, not the brand.
const CEILING = 40;
const SKIP = ['node_modules', '.git', '.next', '_to_delete', '_scale_review', path.join('app', 'team')];
const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    if (e.startsWith('.')) continue;              // toolchain caches, and some hold broken symlinks
    const full = path.join(dir, e);
    const rel = path.relative(root, full);
    if (SKIP.some((s) => rel === s || rel.startsWith(s + path.sep))) continue;
    const st = lstatSync(full);
    if (st.isSymbolicLink()) continue;            // never follow one out of the repo
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(e) && !e.includes('fuse_hidden')) out.push(full);
  }
  return out;
};
// FOREIGN colours are named too, just not by us. They belong to WhatsApp, to GOV.UK and to the
// operating system's window furniture, and lib/tokens.ts says so with the reason attached.
const foreign = new Set();
const collectForeign = (o) => Object.values(o).forEach((v) => {
  if (typeof v === 'string') foreign.add(v.toUpperCase()); else collectForeign(v);
});
collectForeign(T.FOREIGN);
const accounted = new Set([...named, ...foreign]);
const unnamed = new Map();
for (const file of walk(root)) {
  if (path.relative(root, file) === path.join('lib', 'tokens.ts')) continue;
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (line.trimStart().startsWith('//')) return;   // a hex quoted in a comment is not painted
    for (const h of line.match(/#[0-9A-Fa-f]{6}\b/g) || []) {
      const H = h.toUpperCase();
      if (accounted.has(H)) continue;
      if (!unnamed.has(H)) unnamed.set(H, `${path.relative(root, file)}:${i + 1}`);
    }
  });
}
if (unnamed.size > CEILING) {
  [...unnamed].slice(0, 12).forEach(([h, where]) => console.log(`        ${h}  ${where}`));
}
ok(`distinct unnamed colours ${unnamed.size} is at or under the ceiling of ${CEILING}`, unnamed.size <= CEILING);

// The specific duplicates this work removed. Named individually so nobody reintroduces one and
// stays under the ceiling by deleting an unrelated colour somewhere else.
const GONE = {
  '#1FA855': 'a second WhatsApp green',
  '#0F7B4F': 'a third brand green',
  '#157F3B': 'a fourth brand green',
  '#B42318': 'a second brand red',
  '#C6871A': 'a second gold',
  '#FDECEC': 'a second red tint',
  '#374151': 'a Tailwind grey standing in for MUTED',
  '#6B7280': 'a Tailwind grey standing in for MUTED',
  '#9CA3AF': 'a Tailwind grey standing in for MUTED',
  '#E5E7EB': 'a Tailwind grey standing in for LINE',
  '#EF4444': 'a Tailwind red standing in for RED',
};
for (const [hex, what] of Object.entries(GONE)) {
  ok(`${hex} is gone (${what})`, !unnamed.has(hex.toUpperCase()));
}

console.log('\n=== a surface that paints a raw colour cannot invert ===\n');
// 🔴 THE GAP NOTHING WAS ASKING ABOUT, FOUND 4 AUGUST 2026 BY WALKING THE SITE IN DARK.
//
// Two colour guards already existed and BOTH were true while the defect shipped:
//   . the ratchet above counts DISTINCT unnamed colours. Every colour in components/LeadCapture.tsx
//     is a palette colour, correctly named, so it had nothing to say.
//   . test/phonewidth.test.mjs bans raw hex outright, but only under app/app, which has ZERO.
// Neither of them asks the question that actually matters: DOES THIS SURFACE INVERT.
//
// components/LeadCapture.tsx renders on eleven public tool pages and wrote the palette's own values
// out longhand: RIVER_TINT as '#E9F1FA', INK as '#111111', and so on. In light that is identical to
// the token, to the byte, which is exactly why it survived review. In dark the page went to
// --bg #0E1116 and the card stayed #E9F1FA: a pale island on a black page, legible but plainly not
// part of the product. Proven by resolving the variables in a real browser at both settings.
//
// ⚠️ A RATCHET, NOT A BAN, AND THE CEILING IS THE HONEST NUMBER. Thirty surfaces paint a raw colour
// today and twenty nine of them are public marketing pages that are not being rewritten this week.
// Banning it outright would fail on all of them and be switched off within the day. Counting them
// and refusing to let the number grow is the promise we can actually keep.
//
// ⚠️ RAISING THIS CEILING IS ALWAYS THE WRONG FIX, same rule as the ratchet above. Use a token from
// lib/apptheme.ts, or edge(ACCENT, n) for a tinted panel's border, which derives from the accent and
// therefore inverts by construction.
//
// The list is DERIVED by walking the tree, never typed. The version of this that named its files
// would have listed the ones just edited and passed for ever.
const SURFACE_CEILING = 23;
const surfaces = [
  ...walk(path.join(root, 'app')),
  ...walk(path.join(root, 'components')),
].filter((f) => f.endsWith('.tsx'));
const painters = surfaces.filter((f) =>
  readFileSync(f, 'utf8').split('\n')
    .filter((l) => !l.trimStart().startsWith('//'))   // a hex in a comment is not painted
    .some((l) => /#[0-9A-Fa-f]{3,6}\b/.test(l)));
// ⚠️ COUNT THE SWEEP'S OWN OUTPUT. A walk that returns nothing passes every assertion it never
// makes, and this one has been wrong about its own scope once already.
ok(`the surface sweep actually walked something (${surfaces.length} files)`, surfaces.length >= 60);
if (painters.length > SURFACE_CEILING) {
  painters.slice(0, 12).forEach((f) => console.log(`        ${path.relative(root, f)}`));
}
ok(`surfaces painting a raw colour: ${painters.length}, at or under the ceiling of ${SURFACE_CEILING}`,
  painters.length <= SURFACE_CEILING);
// Named individually so it cannot come back while somebody else's file is tidied to stay under.
ok('components/LeadCapture.tsx paints with tokens, so it inverts on eleven public pages',
  !painters.some((f) => path.relative(root, f) === path.join('components', 'LeadCapture.tsx')));
// Three digit hex counts. The phonewidth rule matches six digits only, so '#fff' walked past it.
ok("and '#fff' counts as a raw colour, because it is one",
  /#[0-9A-Fa-f]{3,6}\b/.test('background:#fff'));

// 🔴 AND A SURFACE THAT NEVER RECEIVES A THEME SHEET CANNOT INVERT AT ALL, WHATEVER IT PAINTS WITH.
//
// Found 4 August by walking every public page in dark at 375px. FIVE of them came back light:
// /start, /privacy, /terms, /early-access and /register-your-business. All five import A11Y_CSS
// from lib/tokens and simply never import THEME_CSS, so the palette variables are undefined on
// them and the device setting reaches nothing. /start is the SIGNUP FLOW.
//
// ⚠️ THE RATCHET ABOVE COULD NOT HAVE CAUGHT THIS, and neither could phonewidth. Both ask what a
// file PAINTS WITH. This asks whether the page was ever handed a palette to paint from. A page can
// be perfectly tokenised and still render light if `var(--tx)` resolves to nothing.
//
// ⚠️ AND THE OBVIOUS FIX IS THE WRONG ONE. Adding THEME_CSS to a page that still holds light hex
// inline gives it a dark background under unchanged light text, which is the LeadCapture defect at
// full page scale. Tokenise first, theme second.
//
// A page passes if it takes the shared marketing shell (which emits THEME_CSS inside SharedHead)
// or names a theme sheet itself. Derived by walking the tree: app/ minus the signed in app and
// minus the API.
//
// 🔴 5 AUGUST: THE LINE THAT USED TO BE HERE WAS `.filter((r) => !r.includes('['))`, WITH THE NOTE
// "minus dynamic segments whose fixtures are not routes". THAT NOTE WAS FALSE AND IT HID 41 PAGES.
//
// app/for/[trade]/page.tsx sets `dynamicParams = false` and returns 39 slugs from
// generateStaticParams(). They are prerendered at build time, they are in the sitemap, and for a
// large share of arrivals one of them IS the website. app/share/[token] is the books an accountant
// opens. app/invoice/[id] is the document a customer pays from. Not one of them is a fixture.
//
// All three were unthemed. /for/[trade] rendered hardcoded light hex on 39 routes and stayed white
// on a dark phone; /share/[token] was fully tokenised and still painted nothing, because a var()
// with nothing declaring it silently resolves to nothing. The exclusion is gone. A dynamic route is
// a route.
const publicPages = walk(path.join(root, 'app'))
  .filter((f) => path.basename(f) === 'page.tsx')
  .map((f) => path.relative(root, f))
  .filter((r) => !r.startsWith(path.join('app', 'app') + path.sep))
  .filter((r) => !r.startsWith(path.join('app', 'api') + path.sep))
  // ⚠️ AND THIS FILTER IS NEW, THOUGH THE COMMENT ABOVE HAS CLAIMED IT SINCE THE DAY IT WAS
  // WRITTEN. The note said "minus app/team" and no such line existed, so seventeen internal
  // pages sat inside the customer-facing count and passed only because the old test matched an
  // import path. A comment describing a filter is not a filter.
  .filter((r) => !r.startsWith(path.join('app', 'team') + path.sep));
// The control for the paragraph above: if the bracket filter ever comes back, this goes red.
ok('🔴 the public page sweep still includes the DYNAMIC routes, which are 41 real pages',
  ['for', 'share', 'invoice'].every((seg) =>
    publicPages.some((r) => r.includes(`${seg}${path.sep}[`))));
// ⚠️ A PAGE THAT RENDERS NOTHING CANNOT BE UNTHEMED, and the first version of this check said
// app/account/page.tsx was broken. It is four lines and a redirect(): no markup, no colours, and
// the browser walk correctly showed it arriving on a themed app page. The browser caught the
// guard's false positive; the guard caught /hmrc/connected, which the browser walk missed because
// its page list was TYPED rather than derived. Two methods, each finding the other's mistake.
const rendersNothing = (src) => /^\s*redirect\(/m.test(src) && !/<[a-z]/.test(src);

// 🔴 THEME_CSS ON ITS OWN DOES NOT COUNT, AND THE FIRST VERSION OF THIS CHECK ACCEPTED IT.
//
// THEME_CSS declares `:root` and `[data-theme="dark"]`. Something has to SET that attribute, and
// the only thing that does is the swap script inside SharedHead. A page with no shell that imports
// THEME_CSS gets a stylesheet whose dark half can never match, and renders light for ever.
//
// That is exactly what happened here on 4 August: three pages were "fixed" by adding THEME_CSS,
// this assertion went green, and the browser walk showed all three still light. The guard was
// satisfied by an import rather than by an effect, twenty minutes after being written to catch
// precisely that. APP_THEME_CSS is the sheet that hangs off prefers-color-scheme with no script,
// which is how /in and the whole signed in app follow the device.
//
// So: the shared shell (script, sets data-theme) or APP_THEME_CSS (no script, follows the device).
// ⚠️ ON CODE ONLY, IN BOTH DIRECTIONS. The first version of this ran on the raw source and the
// sabotage sailed straight through, because the comment three lines above explaining the rule
// contains the string APP_THEME_CSS. A negative assertion firing on the note written to explain
// the removal is this repo's most repeated self inflicted wound; it is in the handover twice.
//
// 🔴 AND THE FIX FOR THAT WAS ITSELF SATISFIED BY AN IMPORT, WHICH IS THE THIRD TIME.
//
// The test became `/_shared\/site/.test(src)`, matching the shared shell's IMPORT PATH. On
// 5 August app/for/[trade]/page.tsx passed it with this line and nothing else:
//
//     import { Ic } from '../../_shared/site';        an icon. Not a shell. Not a stylesheet.
//
// 39 prerendered pages of hardcoded light hex, and the guard called them themed because they
// borrowed one icon from the module that happens to contain the shell. So the test is now on the
// EFFECT: the page must RENDER <SharedHead, or name a sheet that declares the palette itself.
// APP_CSS counts because its first line is ${APP_THEME_CSS}; that is asserted below rather than
// assumed here.
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const themed = (raw) => {
  const src = codeOnly(raw);
  return /<SharedHead\b/.test(src) || /\bAPP_THEME_CSS\b/.test(src) || /\bAPP_CSS\b/.test(src);
};
const unthemed = publicPages.filter((r) => {
  const src = readFileSync(path.join(root, r), 'utf8');
  if (rendersNothing(src)) return false;
  return !themed(src);
});
// The controls for the two paragraphs above, run as code rather than trusted as comments.
ok('🔴 a page holding ONLY THEME_CSS still counts as unthemed, because nothing sets data-theme',
  !themed("import { THEME_CSS } from '../../lib/tokens';") && themed("import { APP_THEME_CSS } from '../../lib/tokens';"));
ok('🔴 IMPORTING AN ICON FROM THE SHELL MODULE IS NOT A THEME SHEET, which is what let 39 pages past',
  !themed("import { Ic } from '../../_shared/site';") && themed("import { SiteNav } from '../_shared/site';\n  return <><SharedHead /></>;"));
// APP_CSS is only allowed to count because it carries APP_THEME_CSS. Read it and check, do not assume.
ok('APP_CSS actually embeds APP_THEME_CSS, which is the only reason it counts as a theme sheet',
  /export const APP_CSS\s*=\s*css`\s*\$\{APP_THEME_CSS\}/.test(readFileSync(path.join(root, 'lib', 'tokens.ts'), 'utf8')));
// ⚠️ A RATCHET AT THE TRUE NUMBER, NOT A BAN, AND HERE IS WHY IT IS NOT A COP OUT.
//
// Six pages were found unthemed on 4 August. Three were fixed the same hour because they were
// mechanical: their local consts already carried the palette's own values under the palette's own
// names. THREE ARE NOT MECHANICAL and were deliberately left, because at least one of them holds
// this, in app/register-your-business/Wizard.tsx:
//
//     <div style={{ background: INK, ... }}>          a deliberately DARK card on a LIGHT page
//       <h3 style={{ color: '#fff' }}>                white heading on it
//
// `INK` is var(--tx). In dark that resolves to #F3F5F8, so tokenising this the obvious way turns a
// dark card with white text into a WHITE card with white text. The right answer is the BAND pair,
// and it has to be checked in both appearances rather than swapped by pattern.
//
// 🔴 SO THE CEILING IS 3 AND IT MAY ONLY EVER GO DOWN. A new page arriving without a theme sheet
// fails this immediately, which is the thing that actually needed guarding. Lowering it is the
// only permitted edit.
//
// 🔴 ONE PAGE IS DELIBERATELY UNTHEMED, IT IS NAMED, AND NAMING IT COSTS SOMETHING.
//
// app/invoice/[id] is not a screen. It is the document his customer pays from and his customer's
// accountant checks, printed and attached to emails, opened months later by somebody who has never
// heard of us. It looks the same on every device on purpose. So it is allowed no theme sheet, and
// the price of that permission is the assertion below: it may not hold a single var(). A var() on
// a page with no palette resolves to NOTHING and fails silently, which is exactly how a PAID badge
// spent 5 August rendering black on mint instead of green.
const PAPER_BY_DESIGN = [path.join('app', 'invoice', '[id]', 'page.tsx')];
const UNTHEMED_CEILING = 0;
ok(`the public page sweep found something (${publicPages.length} pages)`, publicPages.length >= 20);
for (const rel of PAPER_BY_DESIGN) {
  const src = codeOnly(readFileSync(path.join(root, rel), 'utf8'));
  ok(`${rel} is unthemed on purpose, so it may not hold a var() that would resolve to nothing`,
    !/var\(\s*--/.test(src));
  ok(`  and it is still there to be checked`, unthemed.includes(rel));
}
const unthemedReal = unthemed.filter((r) => !PAPER_BY_DESIGN.includes(r));
if (unthemedReal.length) unthemedReal.forEach((r) => console.log(`        ${r}`));
ok(`🔴 PUBLIC PAGES WITH NO THEME SHEET: ${unthemedReal.length}, at or under the ceiling of ${UNTHEMED_CEILING}`,
  unthemedReal.length <= UNTHEMED_CEILING);
// Named individually, so the three that are left cannot be swapped for three different ones.
// ✅ 4 AUGUST, LATER THE SAME NIGHT: the ceiling went 3 to ZERO. All six are themed. The three
// that were "not mechanical" were done properly rather than skipped: Wizard.tsx's offer card moved
// from INK (var(--tx), which goes near WHITE in dark) to BAND (dark in BOTH appearances), the
// GOV.UK and browser chrome colours moved into FOREIGN instead of being tokenised, and /start's
// disabled Continue button stopped being white on pale blue at 1.52:1.
ok('🔴 NOTHING IS LEFT UNTHEMED, and the ceiling is zero so nothing may be added',
  UNTHEMED_CEILING === 0 && unthemedReal.length === 0);

// 🔴 AND THE DEFECT UNDER ALL OF IT, WHICH NO CEILING WAS ASKING ABOUT: A var() WITH NO PALETTE.
//
// `color: var(--on-green-tint)` on a page that declares no palette is not a colour. The property is
// invalid at computed-value time, so it falls back to `inherit`, and the text renders in whatever
// its parent was. `border: 1px solid var(--bd)` falls back to currentColor and draws a full
// strength INK hairline where a pale one was meant. `background: var(--panel)` becomes transparent.
//
// ⚠️ NONE OF THAT IS A CONTRAST FAILURE, WHICH IS WHY THE BROWSER WALK COULD NOT SEE IT. Black on
// mint passes AA comfortably. It is simply not the colour anybody chose. A sweep that reports only
// failures is blind to a colour that changed to a different passing colour, so this has to be read
// off the source. Two methods again, each finding what the other cannot.
//
// This is the actual rule, and it is stricter than the ceiling: a page may be unthemed, or it may
// use var(), and it may not be both. A fallback (`var(--green, #15803D)`) is exempt, because a
// fallback is the author saying out loud what happens when nothing is declared.
const varNoPalette = [];
for (const rel of publicPages) {
  const raw = readFileSync(path.join(root, rel), 'utf8');
  if (rendersNothing(raw)) continue;
  if (themed(raw)) continue;
  const names = [...codeOnly(raw).matchAll(/var\(\s*(--[a-z0-9-]+)\s*(,)?/g)]
    .filter((m) => !m[2]).map((m) => m[1]);
  if (names.length) varNoPalette.push(`${rel}  ${[...new Set(names)].join(' ')}`);
}
if (varNoPalette.length) varNoPalette.forEach((r) => console.log(`        ${r}`));
ok(`🔴 NO UNTHEMED PAGE WRITES A var() THAT RESOLVES TO NOTHING (${varNoPalette.length})`,
  varNoPalette.length === 0);
// Sabotage, both directions, so this cannot be a green light over an empty list.
{
  const probe = (src) => [...codeOnly(src).matchAll(/var\(\s*(--[a-z0-9-]+)\s*(,)?/g)].filter((m) => !m[2]).length;
  ok('  and the var() probe catches a bare one, ignores a fallback, and ignores a comment',
    probe("color: 'var(--tx)'") === 1
    && probe("color: 'var(--green, #15803D)'") === 0
    && probe('// color: var(--tx) was removed') === 0);
}

// 🔴 AND THE NAMES HAVE TO BE REAL, WHICH IS ITS OWN SILENT FAILURE.
//
// app/share/[token] read `var(--muted)` and `var(--line)`. Neither is declared anywhere in
// lib/tokens.ts; the palette calls them `--tx-mut` and `--bd`. A misspelt custom property is not an
// error, it is nothing, so the page rendered with no muted colour and hairlines at full ink and
// no build ever complained. Every custom property read anywhere under app/ must be one the palette
// actually declares.
// ⚠️ DERIVED FROM EVERY SHEET, NOT FROM AN ALLOWLIST. The palette is lib/tokens.ts, the marketing
// sheet adds its own aliases (--panel-2, --line, the teal), and a page may set one inline on an
// element (app/page.tsx sets --h per bar). All three are real declarations, so all three are read
// off the source. A hand-typed allowlist here would be the receipt problem again, one file down.
const declared = new Set();
for (const file of [path.join(root, 'lib', 'tokens.ts'), ...walk(path.join(root, 'app')).filter((f) => f.endsWith('.tsx'))]) {
  const src = codeOnly(readFileSync(file, 'utf8'));
  for (const m of src.matchAll(/(--[a-z0-9-]+)\s*:/g)) declared.add(m[1]);        // in a stylesheet
  for (const m of src.matchAll(/['"](--[a-z0-9-]+)['"]\s*:/g)) declared.add(m[1]); // inline on an element
}
// Derived, and counted, because a sweep over an empty set declares victory.
ok(`the palette declares something to check against (${declared.size} custom properties)`, declared.size >= 20);
const unknownVars = [];
for (const file of walk(path.join(root, 'app'))) {
  if (!file.endsWith('.tsx')) continue;
  const src = codeOnly(readFileSync(file, 'utf8'));
  const rel = path.relative(root, file);
  for (const m of src.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
    if (declared.has(m[1])) continue;
    unknownVars.push(`${rel}  ${m[1]}`);
  }
}
if (unknownVars.length) [...new Set(unknownVars)].forEach((r) => console.log(`        ${r}`));
ok(`🔴 EVERY var(--x) READ UNDER app/ NAMES A PROPERTY SOMETHING DECLARES (${new Set(unknownVars).size} unknown)`,
  unknownVars.length === 0);
ok('  and the declared set really would reject a made up name',
  !declared.has('--muted') && !declared.has('--nonsense-token') && declared.has('--tx-mut') && declared.has('--bd'));

// 🔴 --shadow, NAMED, BECAUSE IT IS THE ONE THIS FOUND AND THE ONE MOST LIKELY TO COME BACK.
//
// Thirty one rules read it. Nothing declared it. Every one was invalid and painted nothing, on the
// home page, the pricing cards, the quotes and the feature grid. The temptation on finding that is
// to declare it. Do not: lib/tokens.ts already ruled that the design carries in a hairline and not
// a shadow, because every shadow in this product is rgba(17,17,17,...) and vanishes on a dark
// panel. Declaring it would put a shadow on every marketing card that exists in one appearance
// only. The rules were removed instead, and the hairline border on each of them is what carries.
const shadowReaders = walk(path.join(root, 'app'))
  .filter((f) => f.endsWith('.tsx'))
  .filter((f) => /var\(\s*--shadow/.test(codeOnly(readFileSync(f, 'utf8'))));
ok(`🔴 NOTHING READS var(--shadow) (${shadowReaders.length}), because nothing declares it and nothing should`,
  shadowReaders.length === 0);
ok('  and the doctrine that decided it is still written down where it will be read',
  /a shadow does not/.test(readFileSync(path.join(root, 'lib', 'tokens.ts'), 'utf8')));
// The three that WERE fixed, named, so nobody can drop a theme sheet back off one of them and
// stay under the ceiling by fixing a different page.
for (const fixed of ['privacy', 'terms', path.join('hmrc', 'connected'),
  'early-access', 'register-your-business', 'start']) {
  ok(`${fixed} still receives a theme sheet`, !unthemed.some((r) => r.includes(fixed)));
}

console.log('\n=== no accent fill carries white text ===\n');
// 🔴 THE ONE THAT CAUGHT THE DUPLICATE. Fixing .approvebtn in the shared marketing CSS left the
// home page's own copy of the same rule untouched, because app/page.tsx duplicates it wholesale,
// and the "Approve and send to HMRC" button stayed at 2.37:1 on the deployed site after a build
// that looked like it had fixed it. A rule cannot be trusted to be in one place, so this greps for
// the SHAPE of the mistake across every file rather than for the file it was found in.
// ⚠️ AND IT IS NOT ONLY CSS RULES. Most of these were inline styles, and they only bite on a page
// that themes: on an app page RIVER is the raw #1B59A6 and white on it reads at 6.94:1, which is
// correct. Same identifier, different value, different verdict, so the check has to know which
// module the page imported its colours from.
// lib/apptheme.ts made every app page a themed page (its RIVER is var(--river) exactly as the
// marketing pages' is), so importing an accent from there counts the same as from _shared/site.
const themes = (src) => /const\s+(RIVER|GREEN|SAFFRON)\s*=\s*'var\(--/.test(src)
  || [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"][^'"]*(_shared\/site|lib\/apptheme)['"]/gs)]
    .some((m) => /\b(RIVER|RIVER_DEEP|GREEN|SAFFRON)\b/.test(m[1]));
const INLINE_WHITE = [
  /(?:background|backgroundColor):\s*(?:RIVER|GREEN|SAFFRON)\b[^}]{0,120}?color:\s*'#(?:fff|ffffff)'/,
  /color:\s*'#(?:fff|ffffff)'[^}]{0,120}?(?:background|backgroundColor):\s*(?:RIVER|GREEN|SAFFRON)\b/,
];
const accentWhite = [];
for (const file of walk(root)) {
  const rel = path.relative(root, file);
  const src = readFileSync(file, 'utf8');
  const isThemed = themes(src);
  src.split('\n').forEach((line, i) => {
    if (line.trimStart().startsWith('//')) return;
    if (isThemed && INLINE_WHITE.some((re) => re.test(line))) {
      accentWhite.push(`${rel}:${i + 1} inline accent fill with white text, on a page that themes`);
    }
    // Three syntaxes, because the same fault was written all three ways and the first two versions
    // of this guard each missed one: var(--river) in a plain rule, ${RIVER} interpolated into a
    // template, and a river gradient. All of them lift in dark mode; white does not.
    if (/background(-color)?:var\(--(river|green|saffron|red)\);color:#(fff|ffffff)\b/i.test(line)) {
      accentWhite.push(`${rel}:${i + 1} accent fill with white text`);
    }
    if (/background(-color)?:\$\{(RIVER|RIVER_DEEP|GREEN|SAFFRON|INK)\};color:#(fff|ffffff)\b/.test(line) && isThemed) {
      accentWhite.push(`${rel}:${i + 1} interpolated accent fill with white text`);
    }
    // ⚠️ THE BRAND MARK IS EXEMPT, AND IT IS THE ONLY THING THAT IS. The L chip is a river to
    // saffron gradient carrying a white letter, which is 2.2:1 at the saffron end and would fail
    // this check. WCAG 1.4.3 exempts logotypes from contrast minimums, precisely because a brand
    // mark is a picture of a name rather than something anybody has to read. Repainting the logo
    // to satisfy a rule written not to apply to it would be the wrong way round.
    //
    // Keyed on the river to saffron pair, which nothing else uses. Every readable surface is river
    // to river-deep, so this exemption cannot quietly swallow one.
    const isBrandMark = /linear-gradient\([^)]*var\(--river\)[^)]*var\(--saffron\)/.test(line);
    if (!isBrandMark
      && /linear-gradient\([^)]*var\(--river(-deep)?\)/.test(line)
      && /color:\s*'?#(fff|ffffff)/i.test(line)) {
      accentWhite.push(`${rel}:${i + 1} river gradient with white text, use --river-panel`);
    }
    // And the inverse: a fill that stays white in both themes must not take a themed accent as its
    // text, because the accent lifts in dark mode and the fill does not.
    if (/background(-color)?:#(fff|ffffff);color:var\(--(river|green|saffron|red)\)/i.test(line)) {
      accentWhite.push(`${rel}:${i + 1} white fill with a themed accent as text`);
    }
  });
}
if (accentWhite.length) accentWhite.forEach((w) => console.log(`        ${w}`));
ok('no CSS rule pairs an accent and white the wrong way round', accentWhite.length === 0);


// ---------------------------------------------------------------------------------------------
// 🔴 THE LOOK, LOCKED 1 AUGUST 2026. THESE ARE NOT STYLE PREFERENCES.
//
// Four looks were built on the same screen and the same markup, and the one chosen was chosen on
// the business rather than on taste. Each assertion below is one of those business reasons, so if
// somebody changes a number here they have to argue with the reason rather than with a number.
// The full argument is written at the top of lib/tokens.ts above RADIUS.
// ---------------------------------------------------------------------------------------------
const appOnly = T.APP_CSS.replace(T.APP_THEME_CSS, '');

// REASON 2. Dark follows the system and has no toggle, so whatever carries the design has to work
// in both. Every shadow in this file is ink on paper and vanishes on a dark panel, so a shadow may
// never be the thing that carries an affordance.
ok('🔴 no hover state in the app is carried by a shadow, because a shadow is invisible in dark',
  !/\.lek-hit:hover\{[^}]*box-shadow/.test(appOnly));
ok('the hover affordance is a border, which is identical in both appearances',
  /\.lek-hit:hover\{[^}]*border-color/.test(appOnly));

// REASON 1. The doctrine forbids looking like software. The sharper option was out on doctrine.
ok('the large radius stays at 16, panel rather than instrument', T.RADIUS.lg === 16);
ok('the radius scale is still three steps and a pill, not a fourth invented one',
  Object.keys(T.RADIUS).length === 4);

// The scale exists so two jobs never share a size. lead went to 18 and NOT to 17 for that reason.
ok('lead and strong are still different sizes, so neither is lying about mattering',
  T.TYPE.lead !== T.TYPE.strong && T.TYPE.lead > T.TYPE.strong);
ok('the type scale is still nine named jobs', Object.keys(T.TYPE).length === 9);

// The calm rule: the gap BETWEEN two cards is never smaller than the air INSIDE one, or the eye
// groups across the join instead of down the page.
ok('🔴 on a phone the gap between cards is not smaller than the padding inside one',
  appOnly.includes(`padding:${T.SPACE.md}px;margin-bottom:${T.SPACE.md}px`));
ok('and the same holds on a desk', appOnly.includes(`padding:${T.SPACE.xl}px;margin-bottom:${T.SPACE.xl}px`));
ok('the spacing rhythm was not broken to get there: no invented step',
  Object.values(T.SPACE).every((n) => [4, 8, 12, 16, 24, 32, 48].includes(n)));

// The one thing borrowed from the sharper option. Every screen here is a number a man came for.
ok('🔴 there is a shared tabular numeral rule, so columns of pounds line up',
  /\.lek-num\{[^}]*tabular-nums/.test(appOnly));
ok('and the money tile still uses it too', /\.lek-tile-value\{[^}]*tabular-nums/.test(appOnly));

// REASON 3. The palette is canonical and a polish may not touch it.
ok('🔴 river is still the canonical river', T.RIVER === '#1B59A6');
ok('saffron is still the canonical saffron', T.SAFFRON === '#E0A33E');
ok('ink is still ink', T.INK === '#111111');
ok('the font is still Inter, first in the stack', /^'Inter'/.test(T.FONT));

// And the argument itself has to stay in the file, because a future session reads the code, not a doc.
const tokensSrc = readFileSync(path.join(root, 'lib/tokens.ts'), 'utf8');
ok('the reasoning for the locked look is written down where it will be read',
  /THE LOOK, LOCKED 1 AUGUST 2026/.test(tokensSrc)
  && /Apple move/.test(tokensSrc)
  && /destination is a bank/i.test(tokensSrc));

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
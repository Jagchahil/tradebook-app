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
ok('the toggle reads back the choice it saves',
  site.includes("localStorage.setItem('lekhio-theme'") && site.includes("localStorage.getItem('lekhio-theme'"));
ok('site.tsx no longer hand types a palette',
  !/--river:#[0-9A-Fa-f]{6}/.test(site) && !/--tx-mut:#[0-9A-Fa-f]{6}/.test(site));

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
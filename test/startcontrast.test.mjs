// test/startcontrast.test.mjs. /start against WCAG AA, computed, never eyeballed.
// Run: node test/startcontrast.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 4 AUGUST FOUND /start READING AS LOW AS 2.70:1 IN LIGHT MODE. THIS FILE IS WHAT STOPS IT
// HAPPENING AGAIN WITHOUT ANYBODY NOTICING.
//
// lib/tokens.ts already carries that exact number in its own history: "saffron deep on its own
// tint reads at 2.7:1", the same shape of bug this page's shape suggestion box could have carried
// if its border and its ink were ever typed as raw values instead of the tokens built for a tint.
// tokens.test.mjs's ON_PAIRS holds the PALETTE itself to AA. This file holds this ONE PAGE to it,
// because a page can still fail even when every colour it reaches for is individually sound: the
// failure is in which ink was paired with which background, a fact only the page's own source
// carries.
//
// ⚠️ AN HONEST FINDING BEFORE THE NUMBERS BELOW. Every foreground/background pair this page
// actually draws, measured here in both themes, already clears 4.5:1 as the code stands, including
// the shape suggestion box before its own fix (INK on SAFFRON_TINT reads at 16.6:1 light, and
// DARK_INK on DARK_SAFFRON_TINT is even further from the line). This page was never carrying the
// 2.70:1 pattern itself. The fix applied here is still correct and still kept: ON_SAFFRON_TINT is
// the token lib/tokens.ts's own guard recomputes the day SAFFRON_TINT is retuned, and INK is not,
// so leaving INK in place would have been correct today and silently wrong the day that token
// changed. Section 4 below asserts the fix by reading the source directly, which is the only way a
// revert can be shown red for a change that was defence in depth rather than a repair of a number
// that was actually failing on this page.
//
// WHAT THIS FILE CHECKS, IN ORDER:
//   1. The real light and dark hex values, read out of the actual generated stylesheet rather than
//      a hand copied table, so this file cannot quietly drift from what a browser paints.
//   2. Every text-on-background pair this page draws, in both themes, against the same 4.5 the
//      palette itself is held to.
//   3. The specific invalid CSS bug found alongside the missing token: a hex alpha suffix glued
//      straight onto a var(), which lib/apptheme.ts's edge() exists to replace, checked anywhere in
//      this file, not only where it was first found.
//   4. That the shape suggestion box's ink is actually ON_SAFFRON_TINT in the source, so undoing
//      that change is visible here even though the number it protects against was never failing.
//   5. That the pair table above is not a list somebody could quietly stop maintaining: every
//      colour this page ever paints as text or as a fill is swept from the real source and checked
//      against the table, not assumed.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

// Same staging test/tokens.test.mjs uses. lib/tokens.ts and lib/apptheme.ts both import nothing on
// purpose (their own comments say so), so a copy in an isolated directory loads directly under bare
// node with no relative import to resolve.
const stage = mkdtempSync(path.join(tmpdir(), 'startcontrast-'));
writeFileSync(path.join(stage, 'tokens.ts'), readFileSync(path.join(root, 'lib/tokens.ts'), 'utf8'));
writeFileSync(path.join(stage, 'apptheme.ts'), readFileSync(path.join(root, 'lib/apptheme.ts'), 'utf8'));
const T = await import(pathToFileURL(path.join(stage, 'tokens.ts')).href);
const APP = await import(pathToFileURL(path.join(stage, 'apptheme.ts')).href);

const pageCode = readFileSync(path.join(root, 'app/start/page.tsx'), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL  ${name}`); } };
// A setup fact, not a page fact: if one of these is ever false the table below cannot mean
// anything, so it stops the file outright rather than reporting a false pass or fail.
function must(cond, msg) { if (!cond) throw new Error(`startcontrast setup: ${msg}`); }

console.log('\n=== 1. the real light and dark values, read out of the real generated stylesheet ===\n');

// Not a hand copied table. THEME_CSS is the literal CSS lib/tokens.ts hands the browser, so parsing
// it here means this file is reading the same values a customer's browser paints with. A change to
// what --on-saffron-tint resolves to in dark (currently DARK_SAFFRON itself, not a dedicated dark
// ink, see lib/tokens.ts's DARK_VARS) is caught here without a second copy anybody has to remember.
function parseVars(css, blockRe, label) {
  const m = blockRe.exec(css);
  must(m !== null, `${label} block missing from THEME_CSS`);
  const map = {};
  for (const decl of m[1].split(';')) {
    const d = decl.match(/(--[a-z-]+)\s*:\s*(#[0-9A-Fa-f]{3,6})/);
    if (d) map[d[1]] = d[2];
  }
  must(Object.keys(map).length > 10, `${label} block parsed to almost nothing; the regex above the parse is probably wrong, not the stylesheet`);
  return map;
}
const LIGHT_VAR = parseVars(T.THEME_CSS, /:root\{([^}]*)\}/, 'light (:root)');
const DARK_VAR = parseVars(T.THEME_CSS, /\[data-theme="dark"\]\{([^}]*)\}/, 'dark ([data-theme="dark"])');
ok('the light block parsed to real values', Object.keys(LIGHT_VAR).length > 10);
ok('the dark block parsed to real values', Object.keys(DARK_VAR).length > 10);
ok('light and dark disagree on at least the ink, which is the point of having two',
  LIGHT_VAR['--tx'] !== DARK_VAR['--tx']);

// lib/apptheme.ts's own export values name the css variable, e.g. INK -> 'var(--tx)'. Resolving
// through that string, rather than a hand typed APPTHEME_NAME -> TOKENS_NAME table of our own, is
// what stops this file becoming a second place the mapping could drift from lib/apptheme.ts's real
// one, the same reasoning APPTHEME_NAME's own header gives for why it holds no literal colour.
function hexFor(apphemeName, theme) {
  const ref = APP[apphemeName];
  must(typeof ref === 'string', `lib/apptheme.ts has no export named ${apphemeName}`);
  const m = /^var\((--[a-z-]+)\)$/.exec(ref);
  must(m !== null, `${apphemeName} = ${JSON.stringify(ref)}, which is not a var() reference`);
  const table = theme === 'light' ? LIGHT_VAR : DARK_VAR;
  const hex = table[m[1]];
  must(typeof hex === 'string', `${theme} THEME_CSS has no value for ${m[1]} (from ${apphemeName})`);
  return hex;
}

console.log('\n=== 2. every text this page draws, on the background it actually sits on, both themes ===\n');

// One row per pair the page actually paints, hand read off app/start/page.tsx. `where` is not
// decorative: it is how the next person confirms a row still matches the page rather than trusting
// that it once did. Anything reachable only through a border or a gradient (LINE, SAFFRON,
// SAFFRON_DEEP) carries no text and is intentionally not a row here; section 5 checks that
// omission is honest rather than assumed.
const PAIRS = [
  { name: 'ink-on-paper', ink: 'INK', bg: 'PAPER',
    where: 'body text, step headings, the bold email on the code screen' },
  { name: 'ink-on-panel', ink: 'INK', bg: 'PANEL',
    where: 'every text field, the phone number typed in, inactive chip labels' },
  { name: 'muted-on-paper', ink: 'MUTED', bg: 'PAPER',
    where: 'every field label, every hint line under a field, the footer Back button' },
  { name: 'river-on-paper', ink: 'RIVER', bg: 'PAPER',
    where: '"Step X of Y", "Back to home", "Send it again"' },
  { name: 'on-green-tint-on-green-tint', ink: 'ON_GREEN_TINT', bg: 'GREEN_TINT',
    where: 'the Secure setup badge, the free trial banner, the plan-locked-in tick' },
  { name: 'muted-on-surface', ink: 'MUTED', bg: 'SURFACE',
    where: 'the restored-answers notice text, the disabled Continue button label' },
  { name: 'river-on-surface', ink: 'RIVER', bg: 'SURFACE',
    where: 'the restored-answers notice\'s "Start over" button' },
  { name: 'on-river-on-river', ink: 'ON_RIVER', bg: 'RIVER',
    where: 'every primary button, the active radio tick' },
  { name: 'river-on-river-tint', ink: 'RIVER', bg: 'RIVER_TINT',
    where: 'the +44 chip, the check/mail circle, active Yes/No, "Try another"' },
  { name: 'ink-on-river-tint', ink: 'INK', bg: 'RIVER_TINT',
    where: 'the active trade-type/streams option title, the SIC code line' },
  { name: 'muted-on-river-tint', ink: 'MUTED', bg: 'RIVER_TINT',
    where: 'the active option description text, the SIC description' },
  { name: 'river-deep-on-river-tint', ink: 'RIVER_DEEP', bg: 'RIVER_TINT',
    where: 'the "Your likely SIC code" eyebrow, the closing step 6 paragraph' },
  { name: 'on-saffron-tint-on-saffron-tint', ink: 'ON_SAFFRON_TINT', bg: 'SAFFRON_TINT',
    where: 'THE FIX: the shape-suggestion paragraph ("That name ends in Ltd...")' },
  { name: 'muted-on-saffron-tint', ink: 'MUTED', bg: 'SAFFRON_TINT',
    where: 'the shape-suggestion "If it is not, carry on" line' },
  { name: 'red-on-paper', ink: 'RED', bg: 'PAPER',
    where: 'the code error message' },
  { name: 'muted-on-panel', ink: 'MUTED', bg: 'PANEL',
    where: 'the inactive trade-type/streams option description text' },
];

for (const p of PAIRS) {
  for (const theme of ['light', 'dark']) {
    const bg = hexFor(p.bg, theme);
    const ink = hexFor(p.ink, theme);
    const r = T.contrast(bg, ink);
    ok(`${theme} ${p.name}: ${p.ink} on ${p.bg} reads at ${r.toFixed(2)}:1, needs ${T.MIN_CONTRAST} (${p.where})`,
      r >= T.MIN_CONTRAST);
  }
}

console.log('\n=== 3. no hex alpha suffix glued straight onto a token, anywhere on this page ===\n');

// ⚠️ THE BORDER WAS `${SAFFRON_DEEP}33`, EIGHT DIGIT HEX GLUED TO A var(). lib/apptheme.ts's edge()
// comment says why that never draws: a var() reference cannot take an alpha suffix, so the browser
// reads an extra stray token, the whole border shorthand is invalid at computed value time, and it
// is dropped rather than merely wrong. Checked across the whole file, not the one spot it was found
// in: a token immediately followed by 2 to 8 hex digits is exactly that shape, and a legitimate use
// of a token is always followed by a quote, a space, a comma, a paren or a backtick, never straight
// into hex digits.
//
// ⚠️ COMMENTS STRIPPED FIRST, ON PURPOSE. The doctrine comment a few dozen lines below this one
// quotes the exact old broken string, `${SAFFRON_DEEP}33`, to explain what was wrong and why the
// fix works, the same way this file's own header quotes the 2.70:1 history. A regex that cannot
// tell a comment explaining a bug from the bug itself would fail this file for documenting its own
// fix honestly, which is the identical mistake test/tokens.test.mjs's APP_CSS sweep made once
// before it was widened, and the one startdraft.test.mjs's localStorage check made over "REJECTED:
// localStorage" in draft.ts's own doctrine comment. // to end of line only: this page has no code
// meaning that depends on a URL or anything else containing "//".
const codeOnly = pageCode.replace(/\/\/.*$/gm, '');
const alphaSuffixBug = /\$\{[A-Z][A-Z0-9_]*\}[0-9A-Fa-f]{2,8}\b/.exec(codeOnly);
ok('🔴 NO TOKEN ON THIS PAGE HAS A HEX ALPHA SUFFIX GLUED ONTO IT (the fix everywhere here is edge(TOKEN, percent))'
    + (alphaSuffixBug ? `, found: ${alphaSuffixBug[0]}` : ''),
  alphaSuffixBug === null);
ok('the shape suggestion box border actually uses edge(), the real fix, not just the absence of the bug',
  /border: `1px solid \$\{edge\(SAFFRON_DEEP, 20\)\}`/.test(pageCode));

console.log('\n=== 4. the fix itself, read from source, so a revert shows red here even though the number does not ===\n');

// Anchored on the box itself so this cannot drift onto some other SAFFRON_TINT use appearing later
// on the page. A generous window: long enough to hold the real paragraph, short enough that it
// cannot wander into the next, unrelated block of the file.
const shapeBoxAt = pageCode.indexOf('backgroundColor: SAFFRON_TINT');
ok('the shape suggestion box still exists (backgroundColor: SAFFRON_TINT)', shapeBoxAt !== -1);
const shapeBoxWindow = shapeBoxAt === -1 ? '' : pageCode.slice(shapeBoxAt, shapeBoxAt + 400);
ok('🔴 ITS TEXT USES ON_SAFFRON_TINT, THE TOKEN BUILT FOR A TINT, NOT THE MERELY ADEQUATE INK. '
    + 'INK already read at 16.6:1 here, so this page was never carrying the 2.70:1 failure itself; '
    + 'ON_SAFFRON_TINT is kept anyway because it is the ink lib/tokens.ts\'s own guard recomputes '
    + 'the day SAFFRON_TINT is retuned, and a plain INK is not.',
  /color: ON_SAFFRON_TINT/.test(shapeBoxWindow));

console.log('\n=== 5. the table above is swept from the real source, not trusted to stay current ===\n');

// Every name this page actually imports from lib/apptheme, read from the import line itself so
// adding a new one to the import is enough to be swept, with nothing to remember to also tell this
// file. `edge` and any other lower case helper is excluded by the leading capital the filter asks
// for, which is also true of every real colour export in lib/apptheme.ts.
const importLine = pageCode.match(/import \{([^}]*)\} from '\.\.\/\.\.\/lib\/apptheme';/);
must(importLine !== null, 'could not find the lib/apptheme import line on app/start/page.tsx to sweep');
const imported = importLine[1].split(',').map((s) => s.trim()).filter((s) => /^[A-Z]/.test(s));
ok('the sweep actually found real colour names to check, not an empty list', imported.length > 5);

// (?<!-) is load bearing: this page's own <style> block writes CSS TEXT like
// `.field:focus{border-color:${RIVER}!important}`, and a plain search for "color:" reads the tail
// of "border-color:" as a match. That is real CSS, shipped to the browser, and it is a border, not
// one of this page's own text-on-background pairs, so it must not count here.
function identsUsedAs(prop, src) {
  const re = new RegExp(`(?<!-)${prop}:\\s*([^,}]+)`, 'g');
  const found = new Set();
  let m;
  while ((m = re.exec(src))) {
    const tokRe = /\b([A-Z][A-Z0-9_]*)\b/g;
    let t;
    while ((t = tokRe.exec(m[1]))) found.add(t[1]);
  }
  return found;
}
const usedAsInk = identsUsedAs('color', pageCode);
const usedAsBg = identsUsedAs('backgroundColor', pageCode);
const inkCovered = new Set(PAIRS.map((p) => p.ink));
const bgCovered = new Set(PAIRS.map((p) => p.bg));
const missingInk = [...usedAsInk].filter((n) => imported.includes(n) && !inkCovered.has(n));
const missingBg = [...usedAsBg].filter((n) => imported.includes(n) && !bgCovered.has(n));
if (missingInk.length) console.log(`        drawn as text but not in the table above: ${missingInk.join(', ')}`);
if (missingBg.length) console.log(`        used as a fill but not in the table above: ${missingBg.join(', ')}`);
ok('every imported colour this page ever draws as TEXT is one of the inks checked in section 2', missingInk.length === 0);
ok('every imported colour this page ever paints as a FILL is one of the backgrounds checked in section 2', missingBg.length === 0);

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

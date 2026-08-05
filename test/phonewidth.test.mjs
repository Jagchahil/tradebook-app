// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE PHONE AND THE DARK, PINNED, BECAUSE NEITHER CAN BE WALKED.
//
// 🔴 WHY THIS SUITE EXISTS. Every other finding in this codebase came from walking the live site.
// These two cannot be: `resize_window` over the Cowork bridge reports success and the render does
// not change, the app sets frame-ancestors so it cannot be put in a narrow iframe, and the
// container's network cannot reach lekhio.app. A screenshot was never available.
//
// ⚠️ AND A SCREENSHOT WOULD HAVE BEEN WORSE ANYWAY. One glance at one screen on one day proves
// nothing about the screen somebody adds in September. What actually decides how this app renders
// on a phone is a small number of properties, and every one of them can be asserted here, on all
// 36 screens, for ever.
//
// THE FOUR THINGS THAT DECIDE IT:
//   1. The base CSS IS the phone case. BREAK.desk is only ever used as a min-width, so a screen
//      renders phone-first and the desk rules are additions. Get this wrong once and the phone
//      inherits a desk layout.
//   2. Dark inverts by construction. lib/apptheme.ts maps every colour to a var(--x) that flips in
//      an @media(prefers-color-scheme:dark) block, so a screen that uses those names is correct in
//      both appearances and one that writes #FFFFFF is a white card in dark mode for ever.
//   3. iOS Safari ZOOMS THE WHOLE PAGE when a field under 16px is focused. He did not ask to be
//      zoomed, and it happens on the first tap of onboarding.
//   4. A fixed pixel width wider than a phone is a horizontal scrollbar.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const fix = (s) => s.replace(/from '(\.\/[a-zA-Z0-9._-]+)'/g, "from '$1.ts'");
const stage = mkdtempSync(path.join(tmpdir(), 'phone-'));
for (const f of ['tokens', 'apptheme']) {
  writeFileSync(path.join(stage, `${f}.ts`), fix(readFileSync(path.join(root, 'lib', `${f}.ts`), 'utf8')));
}
const T = await import(pathToFileURL(path.join(stage, 'tokens.ts')).href);

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
};

// Every screen and every component under app/app.
const screens = [];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.isFile() && e.name.endsWith('.tsx')) screens.push(p);
  }
};
walk(path.join(root, 'app', 'app'));
const src = screens.map((p) => ({ p: path.relative(root, p), s: readFileSync(p, 'utf8') }));

// The smallest phone this product is designed for. An iPhone SE is 375 CSS pixels wide.
const NARROWEST = 375;
// Under this, iOS Safari zooms the page on focus. Not a guideline, a behaviour.
const NO_ZOOM = 16;

console.log('\n1. The base case is the phone, not the desk');
{
  ok('the suite actually found the screens', src.length >= 30);
  // 🔴 BREAK.desk AS A MIN-WIDTH, ALWAYS. A max-width query on the desk breakpoint would mean the
  // phone is the exception and the desk is the default, which is the opposite of how this is built.
  const wrongWay = src.filter((f) => new RegExp(`max-width:\\s*\\$\\{BREAK\\.desk`).test(f.s));
  ok('🔴 no screen treats the desk breakpoint as a max-width', wrongWay.length === 0);
  ok('the desk breakpoint is genuinely above phone width', T.BREAK.desk > 900);
  // The three column tile row has to stack, and it does it at BREAK.stack.
  ok('the tile grid stacks below a phone-ish width',
    T.BREAK.stack <= 420 && /max-width:\$\{?BREAK\.stack|max-width:420/.test(T.APP_CSS));
}

console.log('\n2. Dark inverts by construction, because nothing is a raw colour');
{
  // 🔴 THE WHOLE DARK TEST, AND IT IS A ONE LINER BECAUSE THE ARCHITECTURE DOES THE WORK.
  // lib/apptheme.ts exports INK, PANEL, RIVER and the rest as var(--x). A screen that imports those
  // is correct in both appearances without knowing dark exists. A screen that writes a hex is a
  // white card on a dark page, and no amount of walking would catch it on a light laptop.
  // 🔴 THE NAME OF THIS ASSERTION USED TO BE "NO SCREEN WRITES A RAW COLOUR", AND src IS app/app.
  //
  // That is the guard-family defect of 4 August in its own suite: a name claiming every screen, a
  // list holding one directory. It is why components/LeadCapture.tsx wrote the palette out longhand
  // across eleven public tool pages and nothing said a word, while this line sat green because
  // app/app happens to contain zero violations and always has.
  //
  // The ban stays exactly as strict here, because the signed in app IS held to zero. What changed
  // is that it now says which screens it means. The wider question, "does any customer facing
  // surface paint a raw colour", is a ratchet in test/tokens.test.mjs, because the public site has
  // twenty nine and is not being rewritten this week.
  //
  // ⚠️ SIX DIGITS ONLY WAS A SECOND HOLE IN THE SAME LINE: '#fff' is a raw colour and walked past
  // it. Matching three to six now, same as the appnav rule has always done.
  const rawHex = src.filter((f) => /#[0-9a-fA-F]{3,6}\b/.test(f.s));
  ok(`🔴 NO SCREEN UNDER app/app WRITES A RAW COLOUR${rawHex.length ? `\n     ${rawHex.map((f) => f.p).join('\n     ')}` : ''}`,
    rawHex.length === 0);
  const rawRgba = src.filter((f) => /rgba?\(\s*\d/.test(f.s));
  ok(`nor a raw rgb/rgba${rawRgba.length ? `\n     ${rawRgba.map((f) => f.p).join('\n     ')}` : ''}`,
    rawRgba.length === 0);
  // ⚠️ PALETTE IS THE RAW HEX SOURCE AND apptheme IS THE VAR MAPPING. Importing PALETTE into a
  // screen would compile a fixed colour into it and look exactly like using a token.
  const palette = src.filter((f) => /\bPALETTE\b/.test(f.s));
  ok('🔴 and no screen reaches past apptheme into the raw PALETTE', palette.length === 0);
  // The theme itself has to actually flip, or none of the above means anything.
  ok('the dark block exists and repoints the ink and the paper',
    /@media\(prefers-color-scheme:dark\)/.test(T.APP_CSS)
    && /--tx:#F3F5F8/.test(T.APP_CSS) && /--bg:#0E1116/.test(T.APP_CSS));
  // 🔴 THE SHADOW LESSON, PINNED. Every shadow in tokens is ink on paper and vanishes on a dark
  // panel, which is why the card lift uses a border instead. If a screen starts using SHADOW for
  // an affordance, half the customers lose it.
  // ⚠️ THIS ASSERTION WAS "no screen uses SHADOW" AND IT WAS TOO BLUNT. AppNav's dropdown does use
  // SHADOW.raised, and it is not a bug because the same rule sets a border: in light the shadow
  // lifts the menu off the page, in dark the shadow is invisible and the BORDER carries it. That is
  // exactly the reasoning that made the quiet look win. So the rule is not "no shadows", it is
  // "never a shadow ALONE", because a shadow alone is an affordance half the customers do not get.
  // ⚠️ THE RULE IS THE LINE. Walking back to the nearest '{' lands inside a ${RADIUS.md}
  // placeholder, not at the start of the CSS rule, so the border two declarations earlier was
  // invisible to the check. These sheets are one rule per line, so the line IS the rule.
  const shadowOnly = src.filter((f) => /\bSHADOW\b/.test(f.s))
    .filter((f) => f.s.split('\n')
      .some((line) => /box-shadow:\$\{SHADOW\./.test(line) && !/border:/.test(line)));
  ok(`🔴 no shadow does a job on its own, because a shadow is invisible on a dark panel${shadowOnly.length ? `\n     ${shadowOnly.map((f) => f.p).join('\n     ')}` : ''}`,
    shadowOnly.length === 0);
}

console.log('\n3. Nothing a man types into is small enough to zoom the page');
{
  const ZOOMY = /<(input|select|textarea)\b[^>]*?>/gs;
  const TYPE_ATTR = /type=\{?["']([a-z]+)["']/;
  // A radio, a checkbox, a submit and a hidden field cannot be typed into and never zoom.
  const SAFE = new Set(['radio', 'checkbox', 'submit', 'hidden', 'button', 'file']);
  const offenders = [];
  let checked = 0;

  for (const f of src) {
    for (const m of f.s.matchAll(ZOOMY)) {
      const whole = m[0];
      const tag = m[1];
      if (tag === 'input') {
        const t = TYPE_ATTR.exec(whole);
        // ⚠️ NO type ATTRIBUTE MEANS type=text, which is the case most likely to be missed.
        if (SAFE.has(t ? t[1] : 'text')) continue;
      }
      checked++;

      // The field is sized either by a style object on it or by a class in the page's own sheet.
      const styleRef = /style=\{S\.([A-Za-z0-9_]+)\}/.exec(whole);
      // ⚠️ ANY lek- CLASS ANYWHERE IN THE TAG, because className is sometimes an expression
      // (`className={x ? 'lek-field' : 'lek-field lek-bad'}`) and a literal-only regex reported a
      // field that was sized all along.
      const classRef = [...whole.matchAll(/\blek-[a-z0-9-]+/g)].map((m) => m[0]);
      let size = null;
      if (styleRef) {
        // ⚠️ BRACE MATCHED, NOT [^}]*. A style object is full of `1.5px solid ${LINE}` and the
        // template placeholder's own closing brace ends the match early, which reported every one
        // of these as unsized and would have had me "fixing" four fields that were already right.
        const at = f.s.indexOf(`${styleRef[1]}: {`);
        if (at >= 0) {
          let i = f.s.indexOf('{', at);
          let depth = 0;
          let end = i;
          for (; end < f.s.length; end++) {
            if (f.s[end] === '{') depth++;
            else if (f.s[end] === '}') { depth--; if (depth === 0) break; }
          }
          const decl = f.s.slice(i, end);
          const fs = /fontSize:\s*([A-Za-z0-9_.]+)/.exec(decl);
          if (fs) size = fs[1].startsWith('TYPE.') ? T.TYPE[fs[1].slice(5)] : Number(fs[1]);
        }
      }
      if (size === null && classRef.length) {
        // A field can carry more than one class; any of them may be the one that sizes it.
        for (const cls of classRef) {
          const rule = new RegExp(`\\.${cls}\\{[\\s\\S]*?font-size:(\\d+)px`).exec(f.s);
          if (rule) { size = Math.max(size ?? 0, Number(rule[1])); }
        }
      }
      if (size === null || !Number.isFinite(size) || size < NO_ZOOM) {
        offenders.push(`${f.p}  ${tag}${styleRef ? ` S.${styleRef[1]}` : ''}${classRef ? ` .${classRef[1]}` : ''}  size=${size}`);
      }
    }
  }

  ok('the sweep actually found fields to check, so it is not vacuously passing', checked >= 8);
  ok(`🔴 EVERY TYPEABLE FIELD IS ${NO_ZOOM}px OR LARGER${offenders.length ? `\n     ${offenders.join('\n     ')}` : ''}`,
    offenders.length === 0);
}

console.log('\n4. Nothing is wider than the narrowest phone');
{
  // A fixed width is only safe inside a min-width block, where it cannot reach a phone at all.
  const offenders = [];
  for (const f of src) {
    // Split on the desk media query: anything before the first one is base (phone) CSS.
    // ⚠️ (?<!max-|min-) MATTERS. A max-width is a CAP and is the opposite of a problem; matching
    // inside it reported AppNav's 960px reading cap as a phone overflow.
    for (const m of f.s.matchAll(/(?<!max-|min-)width:(\d{3,})px/g)) {
      const w = Number(m[1]);
      if (w <= NARROWEST) continue;
      const before = f.s.slice(0, m.index);
      const opens = (before.match(/@media\(min-width:/g) || []).length;
      const closes = (before.match(/\}`,?\s*$/gm) || []).length;
      // Cheap containment test: a wide width with no preceding min-width query is base CSS.
      if (opens === 0) offenders.push(`${f.p}  width:${w}px  (no min-width query above it)`);
      void closes;
    }
  }
  ok(`🔴 no base rule is wider than a ${NARROWEST}px phone${offenders.length ? `\n     ${offenders.join('\n     ')}` : ''}`,
    offenders.length === 0);
  // The reading column is capped, and the cap is comfortably under a phone's width plus padding.
  // ⚠️ THE SIDEBAR OFFSET DIED WITH THE SIDEBAR, 5 August 2026. The shell is a floating bottom
  // bar at every width, so the column simply centres, and what the phone needs guarded now is the
  // room under the bar: DOCK.clearance of bottom padding, or the bar sits on the last row.
  ok('the page wrapper is fluid on a phone, centres itself, and clears the floating bar',
    /\.lek-wrap\{box-sizing:border-box;max-width:672px;margin:0 auto/.test(T.APP_CSS)
    && !/margin-left:max\(/.test(T.APP_CSS)
    && T.APP_CSS.includes(`${T.DOCK.clearance}px`));
}

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

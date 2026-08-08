// THE RATCHET FOR THIS FIX. Run: node test/contrastapplication.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHAT THIS GUARDS. lib/tokens.ts already proves ON_SAFFRON_TINT and ON_GREEN_TINT clear AA on
// their own tints (test/tokens.test.mjs's ON_PAIRS). That was never the gap. The gap was pages
// that had SAFFRON_TINT and SAFFRON_DEEP both in scope and reached for the wrong one: the raw
// accent instead of the ON token, because both are plausible identifiers and nothing caught the
// mismatch. Found across nine public pages and one shared component on 7 August 2026, all at the
// same two numbers: SAFFRON_DEEP on SAFFRON_TINT reads 2.70:1, GREEN on GREEN_TINT reads 4.46:1,
// both under the 4.5:1 this product holds every pair to.
//
// So this does not re-check the tokens. It WALKS THE PUBLIC PAGES, finds every background/ink pair
// it can actually resolve from the source, and asks the same lib/tokens.ts contrast() function
// whether that REAL pair clears AA. A new page that writes tint: SAFFRON_TINT, fg: SAFFRON_DEEP
// fails this the day it is written, in both themes, with the file, the line and the number.
//
// ⚠️ COMPUTED, NOT PINNED. This resolves each pair to hex and calls contrast() at test time, so it
// keeps working if an accent's own value ever moves. A test asserting today's hex strings would
// pass forever on a page that quietly regressed to an old value with the same name.
// ═══════════════════════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, lstatSync, mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const stage = mkdtempSync(path.join(tmpdir(), 'contrastapp-'));
writeFileSync(path.join(stage, 'tokens.ts'), readFileSync(path.join(root, 'lib/tokens.ts'), 'utf8'));
const T = await import(pathToFileURL(path.join(stage, 'tokens.ts')).href);

let pass = 0;
let fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.log(`  FAIL  ${name}`); } };

// ---- var(--x) -> hex, BOTH themes, read out of T.THEME_CSS itself, not hand typed ----
const rootBlock = T.THEME_CSS.match(/:root\{([^}]*)\}/)[1];
const darkBlock = T.THEME_CSS.match(/\[data-theme="dark"\]\{([^}]*)\}/)[1];
const parseVars = (block) => {
  const map = {};
  for (const m of block.matchAll(/(--[a-z0-9-]+):(#[0-9A-Fa-f]{3,8})/g)) map[m[1]] = m[2].toUpperCase();
  return map;
};
const LIGHT_VAR_MAP = parseVars(rootBlock);
// Anything the dark block does not redeclare cascades from :root, same as a browser resolves it.
const DARK_VAR_MAP = { ...LIGHT_VAR_MAP, ...parseVars(darkBlock) };

// ---- lib/apptheme.ts's own export table: NAME -> 'var(--x)', read from its source ----
const apptheme = readFileSync(path.join(root, 'lib/apptheme.ts'), 'utf8');
const APPTHEME = {};
for (const m of apptheme.matchAll(/export const ([A-Z0-9_]+)\s*=\s*'(var\(--[a-z0-9-]+\))'/g)) {
  APPTHEME[m[1]] = m[2];
}

// ---- in-scope files: public marketing surface only ----
// EXCLUDED, and this is the whole exclusion list: app/app (L6, signed in app), app/start (L7),
// app/in (L5, sign in screen), app/api (no UI), app/team (internal, not customer facing).
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', '_to_delete', '_scale_review']);
const EXCLUDE_PREFIXES = [
  path.join('app', 'app') + path.sep,
  path.join('app', 'start') + path.sep,
  path.join('app', 'in') + path.sep,
  path.join('app', 'api') + path.sep,
  path.join('app', 'team') + path.sep,
];
const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    if (e.startsWith('.')) continue;
    const full = path.join(dir, e);
    if (SKIP_DIRS.has(e)) continue;
    const st = lstatSync(full);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) walk(full, out);
    else if (e.endsWith('.tsx')) out.push(full);
  }
  return out;
};
const files = walk(path.join(root, 'app'))
  .map((f) => path.relative(root, f))
  .filter((r) => !EXCLUDE_PREFIXES.some((p) => r.startsWith(p)));
// Not "under app/", but owned by nobody else and rendered on eleven of the pages above.
files.push(path.join('components', 'LeadCapture.tsx'));

console.log(`\n=== contrast application ratchet: ${files.length} public marketing files ===\n`);
ok(`the sweep actually found files (${files.length})`, files.length >= 35);

// ---- per file local alias table: NAME -> {var:'--x'} | {hex:'#xxxxxx'} ----
function localAliases(src) {
  const map = {};
  for (const m of src.matchAll(/const\s+([A-Z0-9_]+)\s*=\s*'var\((--[a-z0-9-]+)\)'/g)) map[m[1]] = { var: m[2] };
  for (const m of src.matchAll(/const\s+([A-Z0-9_]+)\s*=\s*'(#[0-9A-Fa-f]{3,8})'/g)) map[m[1]] = { hex: m[2].toUpperCase() };
  for (const m of src.matchAll(/const\s+([A-Z0-9_]+)\s*=\s*([A-Z0-9_]+);/g)) {
    if (!map[m[1]] && (map[m[2]] || APPTHEME[m[2]])) map[m[1]] = map[m[2]] ?? { var: APPTHEME[m[2]].slice(4, -1) };
  }
  for (const im of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"][^'"]*apptheme['"]/gs)) {
    for (const raw of im[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/)[0].trim();
      if (APPTHEME[name]) map[name] = { var: APPTHEME[name].slice(4, -1) };
    }
  }
  return map;
}

function resolveSimple(expr, aliases) {
  expr = expr.trim();
  const hexLit = expr.match(/^'?(#[0-9A-Fa-f]{3,8})'?$/);
  if (hexLit) { const h = hexLit[1].toUpperCase(); return { label: expr, light: h, dark: h }; }
  const varLit = expr.match(/^'var\((--[a-z0-9-]+)\)'$/);
  if (varLit) return { label: expr, light: LIGHT_VAR_MAP[varLit[1]], dark: DARK_VAR_MAP[varLit[1]] };
  const name = expr.replace(/^\(|\)$/g, '').trim();
  if (/^[a-zA-Z_$][\w$]*\.[a-zA-Z_$][\w$]*$/.test(name)) return null; // t.fg style: not statically known here
  if (aliases[name]?.var) return { label: name, light: LIGHT_VAR_MAP[aliases[name].var], dark: DARK_VAR_MAP[aliases[name].var] };
  if (aliases[name]?.hex) return { label: name, light: aliases[name].hex, dark: aliases[name].hex };
  if (APPTHEME[name]) { const v = APPTHEME[name].slice(4, -1); return { label: name, light: LIGHT_VAR_MAP[v], dark: DARK_VAR_MAP[v] }; }
  if (typeof T[name] === 'string' && /^#[0-9A-Fa-f]{6}$/.test(T[name])) return { label: name, light: T[name].toUpperCase(), dark: T[name].toUpperCase() };
  return null;
}

// Split a ternary into its condition and two branches, respecting nested parens so a condition
// like (a && b) does not confuse the split.
function splitTernary(expr) {
  let depth = 0;
  let qAt = -1;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === '?' && depth === 0) { qAt = i; break; }
  }
  if (qAt === -1) return null;
  let cAt = -1;
  depth = 0;
  for (let i = qAt + 1; i < expr.length; i++) {
    const c = expr[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ':' && depth === 0) { cAt = i; break; }
  }
  if (cAt === -1) return null;
  return {
    cond: expr.slice(0, qAt).trim(),
    then: expr.slice(qAt + 1, cAt).trim(),
    else: expr.slice(cAt + 1).trim(),
  };
}

// Resolve an expression to a list of {light, dark} candidates.
//
// ⚠️ SAME-CONDITION TERNARIES PAIR POSITIONALLY, NOT AS A CROSS PRODUCT. Reverted while proving
// this ratchet red (see the run log in the PR/return packet): treating
// `background: active ? RIVER : PANEL` and `color: active ? ON_RIVER : INK` as two independent
// two-way choices invents states that can never render (RIVER with INK; PANEL with ON_RIVER),
// because both ternaries read the same variable and switch together. That is a detector lying in
// the OTHER direction, and it is exactly the kind of false alarm this file exists not to raise.
// Different conditions, or only one side being a ternary, still fall through to the conservative
// cross product below.
function resolveExpr(expr, aliases) {
  const simple = resolveSimple(expr, aliases);
  if (simple) return simple.light && simple.dark ? [simple] : [];
  const t = splitTernary(expr);
  if (!t) return [];
  const thenR = resolveExpr(t.then, aliases);
  const elseR = resolveExpr(t.else, aliases);
  return [...thenR, ...elseR];
}

function pairedResolve(bgExpr, fgExpr, aliases) {
  const bgT = splitTernary(bgExpr.trim());
  const fgT = splitTernary(fgExpr.trim());
  if (bgT && fgT && bgT.cond === fgT.cond) {
    const branch1 = { bg: resolveExpr(bgT.then, aliases), fg: resolveExpr(fgT.then, aliases) };
    const branch2 = { bg: resolveExpr(bgT.else, aliases), fg: resolveExpr(fgT.else, aliases) };
    const pairs = [];
    for (const b of [branch1, branch2]) {
      for (const bg of b.bg) for (const fg of b.fg) pairs.push({ bg, fg });
    }
    return pairs;
  }
  const bgs = resolveExpr(bgExpr, aliases);
  const fgs = resolveExpr(fgExpr, aliases);
  const pairs = [];
  for (const bg of bgs) for (const fg of fgs) pairs.push({ bg, fg });
  return pairs;
}

const findings = [];
const seen = new Set();
function record(file, line, kind, bgExpr, fgExpr, aliases) {
  for (const { bg, fg } of pairedResolve(bgExpr, fgExpr, aliases)) {
    if (!bg?.light || !bg?.dark || !fg?.light || !fg?.dark) continue;
    const key = `${file}:${line}:${bg.light}:${fg.light}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({
      file, line, kind, bgExpr: bg.label, fgExpr: fg.label,
      bgLight: bg.light, fgLight: fg.light, rLight: T.contrast(bg.light, fg.light),
      bgDark: bg.dark, fgDark: fg.dark, rDark: T.contrast(bg.dark, fg.dark),
    });
  }
}

for (const rel of files) {
  const src = readFileSync(path.join(root, rel), 'utf8');
  const aliases = localAliases(src);

  // PATTERN 1: style={{ ... }} objects, brace balanced, background/backgroundColor + color inside.
  for (let i = 0; i < src.length; ) {
    const at = src.indexOf('style={{', i);
    if (at === -1) break;
    let j = at + 8;
    let depth = 2;
    const start = j;
    for (; j < src.length && depth > 0; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') depth--;
    }
    const body = src.slice(start, j - 2);
    i = j;
    const bg = body.match(/background(?:Color)?:\s*([^,]+?)\s*(?=,\s*[a-zA-Z]+:|$)/);
    const fg = body.match(/(?<!background)(?<!Color)\bcolor:\s*([^,]+?)\s*(?=,\s*[a-zA-Z]+:|$)/);
    if (bg && fg) record(rel, src.slice(0, at).split('\n').length, 'inline-style', bg[1], fg[1], aliases);
  }

  // PATTERN 2: object literal fields declared together and consumed as a pair elsewhere, e.g.
  // `tint: X, fg: Y` in either order (resources/page.tsx, file-your-tax-return/page.tsx, and the
  // features/mtdMeans tables in app/_shared/site.tsx all use this shape).
  for (const m of src.matchAll(/\b(tint|bg)\s*:\s*([^,\n]+?)\s*,\s*(fg|ink|accent)\s*:\s*([^,\n}]+)/g)) {
    record(rel, src.slice(0, m.index).split('\n').length, 'field-pair', m[2], m[4], aliases);
  }
  for (const m of src.matchAll(/\b(fg|ink|accent)\s*:\s*([^,\n]+?)\s*,\s*(tint|bg)\s*:\s*([^,\n}]+)/g)) {
    record(rel, src.slice(0, m.index).split('\n').length, 'field-pair', m[4], m[2], aliases);
  }

  // PATTERN 3: a CSS rule inside a plain (non tagged-template) stylesheet string, one selector per
  // line, background/backgroundColor and color on the SAME line. This is how app/compare/page.tsx's
  // .mk.no lived: a class rule, not a JSX inline style, so patterns 1 and 2 cannot see it.
  for (const line of src.split('\n')) {
    const bg = line.match(/\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?\{[^}]*?background(?:-color)?:\s*([^;}]+?)\s*[;}]/);
    const fg = line.match(/\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?\{[^}]*?color:\s*([^;}]+?)\s*[;}]/);
    if (bg && fg) {
      const lineNo = src.slice(0, src.indexOf(line)).split('\n').length;
      record(rel, lineNo, 'css-rule', bg[1].replace(/^var\((--[a-z0-9-]+)\)$/, "'var($1)'"), fg[1].replace(/^var\((--[a-z0-9-]+)\)$/, "'var($1)'"), aliases);
    }
  }
}

console.log(`resolved ${findings.length} background/ink pairs across the public surface\n`);
ok('the sweep actually resolved pairs, so this is not a vacuous pass', findings.length >= 40);

for (const f of findings) {
  ok(`${f.file}:${f.line} [${f.kind}] light ${f.bgExpr}/${f.fgExpr} = ${f.rLight.toFixed(2)}:1`, f.rLight >= T.MIN_CONTRAST);
  ok(`${f.file}:${f.line} [${f.kind}] dark  ${f.bgExpr}/${f.fgExpr} = ${f.rDark.toFixed(2)}:1`, f.rDark >= T.MIN_CONTRAST);
}

// ── Named regression guards for the specific defect this ratchet was built to catch. ──
//
// If SAFFRON_DEEP ever lands back on SAFFRON_TINT, or GREEN back on GREEN_TINT, anywhere in the
// resolved set, this fails by name, not just by count.
const onWrongTint = findings.filter((f) => (
  (f.bgExpr.includes('SAFFRON_TINT') && (f.fgExpr === 'SAFFRON_DEEP' || f.fgExpr.includes('saffron-deep')))
  || (f.bgExpr.includes('GREEN_TINT') && !f.bgExpr.includes('SAFFRON') && (f.fgExpr === 'GREEN' || /(?<!ON_)(?<!on-)GREEN\b/.test(f.fgExpr)) && !f.fgExpr.includes('ON_GREEN') && !f.fgExpr.includes('on-green'))
));
if (onWrongTint.length) onWrongTint.forEach((f) => console.log(`        REGRESSION: ${f.file}:${f.line} ${f.bgExpr}/${f.fgExpr}`));
ok('🔴 no page pairs the raw accent with its own tint again (the exact 7 August defect)', onWrongTint.length === 0);

// ── The ternary correlation fix is itself proved, so a future edit cannot quietly widen it back
// into a cross product without this going red. ──
{
  const probeAliases = { A: { hex: '#000000' }, B: { hex: '#FFFFFF' }, X: { hex: '#111111' }, Y: { hex: '#EEEEEE' } };
  const same = pairedResolve('cond ? A : B', 'cond ? X : Y', probeAliases);
  ok('same-condition ternaries pair positionally (2 pairs, not 4)', same.length === 2);
  ok('  ...and the pairing is the RIGHT way round',
    same.some((p) => p.bg.light === '#000000' && p.fg.light === '#111111')
    && same.some((p) => p.bg.light === '#FFFFFF' && p.fg.light === '#EEEEEE')
    && !same.some((p) => p.bg.light === '#000000' && p.fg.light === '#EEEEEE'));
  const different = pairedResolve('cond ? A : B', 'other ? X : Y', probeAliases);
  ok('different-condition ternaries fall back to the conservative cross product (4 pairs)', different.length === 4);
}

// ── rgba() overlays composited onto a fill, which none of the three PATTERNs above can see because
// the effective colour only exists once the overlay is blended onto whatever sits behind it. Found
// by hand on app/product ("what you pay" tick badges): .ba .new .m lays rgba(255,255,255,alpha) over
// the fixed --river-panel / --river-panel-deep gradient its parent .ba .new sits on, with #fff text
// on top. --river-panel does not invert with the theme (see RIVER_PANEL = RIVER in lib/tokens.ts),
// so the composite is one number, not two. Checked at the LIGHTER gradient stop, which is the worst
// case: at .22 alpha this read 4.22:1, under 4.5:1, so it was turned down to .16. Computed, not
// pinned: this re-reads the overlay's own alpha out of the live source text and recomposites it
// against T.RIVER_PANEL every run, so a future edit that nudges the alpha back up fails here with
// the real number, not a stale hex.
{
  const compositeHex = (overlayHex, alpha, baseHex) => {
    const parse = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [or, og, ob] = parse(overlayHex);
    const [br, bg, bb] = parse(baseHex);
    const mix = (o, b) => Math.round(o * alpha + b * (1 - alpha));
    return `#${[mix(or, br), mix(og, bg), mix(ob, bb)].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
  };
  const site = readFileSync(path.join(root, 'app/_shared/site.tsx'), 'utf8');
  const m = site.match(/\.ba \.new \.m\{background:rgba\(255,255,255,([.\d]+)\);color:#fff\}/);
  ok('the .ba .new .m badge rule is still where this check expects it', !!m);
  if (m) {
    const alpha = parseFloat(m[1]);
    const worstCaseBg = compositeHex('#FFFFFF', alpha, T.RIVER_PANEL);
    const r = T.contrast('#FFFFFF', worstCaseBg);
    ok(`app/_shared/site.tsx .ba .new .m composited on --river-panel (both themes, fixed fill) = ${r.toFixed(2)}:1`,
      r >= T.MIN_CONTRAST);
  }
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

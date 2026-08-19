// RESOLVE EVERY SABOTAGE ANCHOR AGAINST THE REAL TREE.
//
//   node scripts/check-sabotage-anchors.mjs
//
// A sabotage pass reports 34 of 34 caught while an anchor inside it is dead, because a dead anchor
// throws before the tree is ever run and the pass counts the throw as a catch. The gate cannot see
// it and only the Mac's full loop can, and the loop takes minutes. This takes a second.
//
// It does not trust a remembered helper name. Each pass defines its own (edit, editOnce, demote,
// swap, and more), so this reads every pass, finds the helpers that ASSERT an anchor (the ones whose
// body throws on a failed `includes`), works out which parameter is the file and which parameters
// are anchors, then resolves every call of those helpers and counts each anchor in the file it names.
//
// A count of 0 is DEAD. Anything not a plain string literal is reported as UNRESOLVED, never as
// resolved, because a harness that lies in either direction is worse than none.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = readdirSync(path.join(root, 'test')).filter((f) => /^sabotage-.*\.mjs$/.test(f)).sort();

// Walk from an opening bracket to its match, skipping strings, templates and comments.
function matchFrom(s, i) {
  const open = s[i];
  const close = open === '{' ? '}' : open === '(' ? ')' : ']';
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === '/' && s[j + 1] === '/') { j = s.indexOf('\n', j); if (j < 0) return -1; continue; }
    if (c === '/' && s[j + 1] === '*') { j = s.indexOf('*/', j + 2) + 1; if (j < 1) return -1; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      for (j++; j < s.length; j++) { if (s[j] === '\\') j++; else if (s[j] === q) break; }
      continue;
    }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return j; }
  }
  return -1;
}

// Split an argument list on top level commas.
function splitArgs(s) {
  const out = [];
  let depth = 0, start = 0;
  for (let j = 0; j < s.length; j++) {
    const c = s[j];
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      for (j++; j < s.length; j++) { if (s[j] === '\\') j++; else if (s[j] === q) break; }
      continue;
    }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) { out.push(s.slice(start, j)); start = j + 1; }
  }
  out.push(s.slice(start));
  return out.map((a) => a.trim());
}

const ESC = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0', '\\': '\\', "'": "'", '"': '"', '`': '`' };
// Resolve a plain string literal or a template with no substitution. Anything else returns null.
function literal(src) {
  const q = src[0];
  if (q !== '"' && q !== "'" && q !== '`') return null;
  if (src[src.length - 1] !== q) return null;
  const body = src.slice(1, -1);
  let out = '';
  for (let j = 0; j < body.length; j++) {
    const c = body[j];
    if (c === q) return null;
    if (c === '$' && q === '`' && body[j + 1] === '{') return null;
    if (c === '\n' && q !== '`') return null;
    if (c !== '\\') { out += c; continue; }
    const e = body[++j];
    if (e === 'u') {
      if (body[j + 1] === '{') { const end = body.indexOf('}', j); out += String.fromCodePoint(parseInt(body.slice(j + 2, end), 16)); j = end; }
      else { out += String.fromCharCode(parseInt(body.slice(j + 1, j + 5), 16)); j += 4; }
      continue;
    }
    if (e === 'x') { out += String.fromCharCode(parseInt(body.slice(j + 1, j + 3), 16)); j += 2; continue; }
    if (e === '\n') continue;
    out += Object.prototype.hasOwnProperty.call(ESC, e) ? ESC[e] : e;
  }
  return out;
}

function countIn(hay, needle) {
  if (needle === '') return 0;
  let n = 0, i = 0;
  for (;;) { const k = hay.indexOf(needle, i); if (k < 0) return n; n++; i = k + needle.length; }
}

const cache = new Map();
function readTarget(rel) {
  if (!cache.has(rel)) {
    const p = path.join(root, rel);
    cache.set(rel, existsSync(p) ? readFileSync(p, 'utf8') : null);
  }
  return cache.get(rel);
}

// Most passes bind their long anchors and their route paths to module level consts, so an argument
// that is a bare identifier is usually still statically known. Resolving those is the difference
// between a checker that reads a third of the anchors and one that reads nearly all of them.
function constMap(src) {
  const m = new Map();
  for (const c of src.matchAll(/(?:^|\n)const\s+([A-Za-z_$][\w$]*)\s*=\s*(?=['"`])/g)) {
    const start = c.index + c[0].length;
    // Scan to the terminating semicolon at depth zero, skipping over string bodies. A naive
    // [^;]* stops inside `sendText(from, X);` and loses the anchor.
    let j = start, depth = 0, end = -1;
    for (; j < src.length; j++) {
      const ch = src[j];
      if (ch === '"' || ch === "'" || ch === '`') {
        const q = ch;
        for (j++; j < src.length; j++) { if (src[j] === '\\') j++; else if (src[j] === q) break; }
        continue;
      }
      if (ch === '(' || ch === '[' || ch === '{') depth++;
      else if (ch === ')' || ch === ']' || ch === '}') depth--;
      else if (ch === ';' && depth === 0) { end = j; break; }
    }
    if (end < 0) continue;
    const v = concat(src.slice(start, end), m);
    if (v !== null) m.set(c[1], v);
  }
  return m;
}

// Split on top level + and resolve each part as a literal or a known const. Returns null if any part
// is not statically known.
function concat(src, consts) {
  const parts = [];
  let depth = 0, start = 0;
  for (let j = 0; j < src.length; j++) {
    const c = src[j];
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      for (j++; j < src.length; j++) { if (src[j] === '\\') j++; else if (src[j] === q) break; }
      continue;
    }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === '+' && depth === 0) { parts.push(src.slice(start, j)); start = j + 1; }
  }
  parts.push(src.slice(start));
  let out = '';
  for (const raw of parts) {
    const t = raw.trim();
    if (!t) return null;
    const lit = literal(t);
    if (lit !== null) { out += lit; continue; }
    if (consts && consts.has(t)) { out += consts.get(t); continue; }
    return null;
  }
  return out;
}

let resolved = 0, dead = 0, unresolved = 0, missingFile = 0;
const deadLines = [], unresolvedLines = [];

for (const f of files) {
  const src = readFileSync(path.join(root, 'test', f), 'utf8');
  const consts = constMap(src);

  // 1. Discover this file's OWN anchor asserting helpers.
  const helpers = new Map(); // name -> { fileIdx, anchorIdx: [] }
  const defRe = /(?:const\s+([A-Za-z_$][\w$]*)\s*=\s*\(([^)]*)\)\s*=>\s*\{|function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{)/g;
  let d;
  while ((d = defRe.exec(src))) {
    const name = d[1] || d[3];
    const params = (d[2] || d[4]).split(',').map((p) => p.trim().split('=')[0].trim()).filter(Boolean);
    const brace = src.indexOf('{', d.index + d[0].length - 1);
    const end = matchFrom(src, brace);
    if (end < 0) continue;
    const body = src.slice(brace, end);
    if (!/throw new Error/.test(body)) continue;
    const anchorIdx = [];
    for (const m of body.matchAll(/\.includes\(\s*([A-Za-z_$][\w$]*)\s*\)/g)) {
      const k = params.indexOf(m[1]);
      if (k >= 0 && !anchorIdx.includes(k)) anchorIdx.push(k);
    }
    let fileIdx = -1;
    const j = body.match(/path\.join\(\s*[A-Za-z_$][\w$]*\s*,\s*([A-Za-z_$][\w$]*)\s*\)/);
    if (j) fileIdx = params.indexOf(j[1]);
    if (anchorIdx.length && fileIdx >= 0) helpers.set(name, { fileIdx, anchorIdx });
  }
  if (!helpers.size) continue;

  // 2. Resolve every call of them.
  for (const name of helpers.keys()) {
    const { fileIdx, anchorIdx } = helpers.get(name);
    const callRe = new RegExp(`(^|[^\\w$.])${name}\\s*\\(`, 'g');
    let c;
    while ((c = callRe.exec(src))) {
      const open = src.indexOf('(', c.index + c[0].length - 1);
      // Skip the definition itself.
      if (/=>|function/.test(src.slice(Math.max(0, c.index - 12), open))) { /* still fine, args check below */ }
      const close = matchFrom(src, open);
      if (close < 0) continue;
      const args = splitArgs(src.slice(open + 1, close));
      if (args.length <= Math.max(fileIdx, ...anchorIdx)) continue;
      const line = src.slice(0, c.index).split('\n').length;
      const rel = concat(args[fileIdx], consts);
      if (rel === null) { unresolved += anchorIdx.length; unresolvedLines.push(`${f}:${line} ${name} file arg not a literal: ${args[fileIdx].slice(0, 40)}`); continue; }
      const target = readTarget(rel);
      if (target === null) { missingFile += anchorIdx.length; deadLines.push(`${f}:${line} ${name} TARGET FILE MISSING: ${rel}`); continue; }
      for (const k of anchorIdx) {
        const anchor = concat(args[k], consts);
        if (anchor === null) { unresolved++; unresolvedLines.push(`${f}:${line} ${name} arg ${k} not a literal: ${args[k].slice(0, 40)}`); continue; }
        const n = countIn(target, anchor);
        if (n === 0) { dead++; deadLines.push(`${f}:${line} ${name} DEAD in ${rel}: ${JSON.stringify(anchor.slice(0, 70))}`); }
        else resolved++;
      }
    }
  }
}

console.log(`passes read      ${files.length}`);
console.log(`anchors resolved ${resolved}`);
console.log(`DEAD             ${dead}`);
console.log(`missing target   ${missingFile}`);
console.log(`unresolved       ${unresolved}`);
if (deadLines.length) { console.log('\nDEAD ANCHORS'); for (const l of deadLines) console.log('  ' + l); }
if (process.env.SHOW_UNRESOLVED && unresolvedLines.length) { console.log('\nUNRESOLVED'); for (const l of unresolvedLines) console.log('  ' + l); }
process.exit(dead + missingFile ? 1 : 0);

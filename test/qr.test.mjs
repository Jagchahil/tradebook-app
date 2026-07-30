// THE QR CODE, CHECKED BY READING IT BACK. See lib/qr.ts.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ THIS SUITE DELIBERATELY DOES NOT ASSERT THE ENCODER AGAINST ITSELF.
//
// A QR encoder is the perfect subject for a test that passes while the product is broken. Every
// intermediate value is a number nobody can eyeball, the output is a picture, and a square that
// does not scan throws no error, logs nothing and looks completely fine on the screen. Assertions
// like "the matrix is 33 wide" and "the mask is in range" would all have stayed green through
// every one of the two real bugs found while writing it.
//
// So the centre of this file is a READER, written from the standard rather than from lib/qr.ts. It
// undoes the mask, walks the interleave backwards and parses the mode, the length and the bytes. A
// payload that does not come back out is a failure, whatever the encoder thinks.
//
// The two bugs it is standing guard over, both of which produced a confident and unscannable
// square:
//
//   . the format information was written least significant bit first, so every square announced
//     the wrong mask and every scanner unmasked it with the wrong pattern
//   . the second copy of the format information was written eight modules down the left edge
//     instead of seven, which put a format bit on top of the dark module
//
// The published format and version strings are checked separately, straight off the matrix,
// because those are the one part of a QR code with an external answer key.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const { encodeQr, qrSvg, qrPath, capacityBytes, MIN_VERSION, MAX_VERSION, QUIET_ZONE } =
  await import(`${pathToFileURL(path.resolve(here, '../lib/qr.ts')).href}`);

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

console.log('\nqr: a square that actually scans');

// ── The reader, written from ISO/IEC 18004 and not from lib/qr.ts ─────────────────────────────

const ALIGNMENT = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};
const SPECS = {
  1: [26, 10, 1, 16, 0, 0], 2: [44, 16, 1, 28, 0, 0], 3: [70, 26, 1, 44, 0, 0],
  4: [100, 18, 2, 32, 0, 0], 5: [134, 24, 2, 43, 0, 0], 6: [172, 16, 4, 27, 0, 0],
  7: [196, 18, 4, 31, 0, 0], 8: [242, 22, 2, 38, 2, 39], 9: [292, 22, 3, 36, 2, 37],
  10: [346, 26, 4, 43, 1, 44],
};
const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

// Which modules are structure rather than message. Recomputed here so the reader cannot inherit a
// mistake from the encoder's own idea of what it reserved.
function functionPlane(version) {
  const size = version * 4 + 17;
  const f = new Uint8Array(size * size);
  const mark = (r, c) => { if (r >= 0 && c >= 0 && r < size && c < size) f[r * size + c] = 1; };
  for (const [br, bc] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
    for (let r = -1; r <= 7; r += 1) for (let c = -1; c <= 7; c += 1) mark(br + r, bc + c);
  }
  for (let i = 0; i < size; i += 1) { mark(6, i); mark(i, 6); }
  for (const row of ALIGNMENT[version]) {
    for (const col of ALIGNMENT[version]) {
      const onFinder = (row === 6 && col === 6) || (row === 6 && col === size - 7)
        || (row === size - 7 && col === 6);
      if (onFinder) continue;
      for (let r = -2; r <= 2; r += 1) for (let c = -2; c <= 2; c += 1) mark(row + r, col + c);
    }
  }
  for (let i = 0; i < 9; i += 1) { mark(8, i); mark(i, 8); }
  for (let i = 0; i < 8; i += 1) { mark(8, size - 1 - i); mark(size - 1 - i, 8); }
  if (version >= 7) {
    for (let i = 0; i < 18; i += 1) {
      const a = Math.floor(i / 3);
      const b = (i % 3) + size - 11;
      mark(b, a); mark(a, b);
    }
  }
  return f;
}

// The fifteen format modules beside the top left finder, in the order the standard lays them out.
function readFormatCopy1(m) {
  const { size, modules } = m;
  const at = (r, c) => modules[r * size + c];
  const bits = [];
  for (let i = 0; i < 6; i += 1) bits.push(at(8, i));
  bits.push(at(8, 7), at(8, 8), at(7, 8));
  for (let i = 9; i < 15; i += 1) bits.push(at(14 - i, 8));
  return bits.join('');
}

// The other fifteen, seven down the bottom left and eight across the bottom right.
function readFormatCopy2(m) {
  const { size, modules } = m;
  const at = (r, c) => modules[r * size + c];
  const bits = [];
  for (let i = 0; i < 7; i += 1) bits.push(at(size - 1 - i, 8));
  for (let i = 7; i < 15; i += 1) bits.push(at(8, size - 15 + i));
  return bits.join('');
}

function readVersionInfo(m) {
  const { size, modules } = m;
  const bits = [];
  for (let i = 17; i >= 0; i -= 1) {
    const a = Math.floor(i / 3);
    const b = (i % 3) + size - 11;
    bits.push(modules[a * size + b]);
  }
  return bits.join('');
}

// Undo the mask, walk the zigzag, undo the interleave, and parse. Returns the payload string.
function readPayload(m) {
  const { size, version, mask, modules } = m;
  const fn = functionPlane(version);
  const un = Uint8Array.from(modules);
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (fn[r * size + c]) continue;
      if (MASKS[mask](r, c)) un[r * size + c] ^= 1;
    }
  }

  const bits = [];
  let upward = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (let lane = 0; lane < 2; lane += 1) {
        const col = right - lane;
        if (fn[row * size + col]) continue;
        bits.push(un[row * size + col]);
      }
    }
    upward = !upward;
  }
  const wire = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j += 1) v = (v << 1) | bits[i + j];
    wire.push(v);
  }

  const [, , g1n, g1d, g2n, g2d] = SPECS[version];
  const layout = [...Array(g1n).fill(g1d), ...Array(g2n).fill(g2d)];
  const blocks = layout.map(() => []);
  let at = 0;
  const maxData = Math.max(...layout);
  for (let i = 0; i < maxData; i += 1) {
    for (let b = 0; b < layout.length; b += 1) {
      if (i < layout[b]) blocks[b].push(wire[at++]);
    }
  }
  const data = blocks.flat();

  // Mode, count, payload. Anything other than byte mode is this module doing something it says it
  // does not do.
  const stream = [];
  for (const byte of data) for (let i = 7; i >= 0; i -= 1) stream.push((byte >> i) & 1);
  const take = (n) => { let v = 0; for (let i = 0; i < n; i += 1) v = (v << 1) | stream.shift(); return v; };
  const mode = take(4);
  if (mode !== 0b0100) return { mode, text: null };
  const count = take(version < 10 ? 8 : 16);
  let text = '';
  const bytes = [];
  for (let i = 0; i < count; i += 1) bytes.push(take(8));
  text = Buffer.from(bytes).toString('utf8');
  return { mode, count, text };
}

// ── The published answer keys ─────────────────────────────────────────────────────────────────
//
// Error correction level M, masks 0 to 7. These come from the standard, not from us, and they are
// the whole reason the least significant bit first bug could be caught at all: the square it drew
// was a perfectly valid one for a different mask.
const FORMAT_M = [
  '101010000010010', '101000100100101', '101111001111100', '101101101001011',
  '100010111111001', '100000011001110', '100111110010111', '100101010100000',
];
const VERSION_INFO = {
  7: '000111110010010100', 8: '001000010110111100',
  9: '001001101010011001', 10: '001010010011010011',
};

// ── The payload this actually exists to carry ─────────────────────────────────────────────────

const REAL = 'https://wa.me/447700900123?text=LEKHIO-8FTQ3M7KJH2WYRB4VN6X';

const real = encodeQr(REAL);
ok('the real connect link fits in a small square', real.version <= 5);
ok('🔴 the real connect link reads back out of its own square', readPayload(real).text === REAL);

// ── Every version, at exactly its stated capacity ─────────────────────────────────────────────
//
// The boundary is where a capacity table is wrong, and a capacity table that is wrong by one byte
// silently drops the last character of a link. The code on the end of ours is the part that matters.
let allVersions = true;
let allBoundaries = true;
for (let v = MIN_VERSION; v <= MAX_VERSION; v += 1) {
  const cap = capacityBytes(v);
  const full = 'A'.repeat(cap);
  const m = encodeQr(full);
  if (m.version !== v) allVersions = false;
  const back = readPayload(m);
  if (back.text !== full || back.count !== cap) allBoundaries = false;
}
ok(`every version 1 to ${MAX_VERSION} is chosen at exactly its own capacity`, allVersions);
ok('🔴 a full payload reads back byte for byte at every version', allBoundaries);

// One byte over the largest version is a refusal, never a smaller square that loses the end.
let threwOverCapacity = false;
try { encodeQr('A'.repeat(capacityBytes(MAX_VERSION) + 1)); } catch { threwOverCapacity = true; }
ok('one byte over the largest version throws rather than truncating', threwOverCapacity);

// ── The format information, against the published table ───────────────────────────────────────
//
// Both copies, because they are written by two different pieces of arithmetic and a square with one
// good copy still scans, which would hide the bug until a corner got dirty.
// ⚠️ ALL EIGHT MASKS, AND THE PAYLOADS BELOW ARE HERE BECAUSE OF WHAT A LAZY VERSION MISSED.
//
// The first draft looped over eight arbitrary payloads and checked whichever mask came back. Those
// eight inputs happened to select masks 0 and 2 between them, so six of the eight published strings
// were never compared with anything and the suite reported all green.
//
// The mask is chosen by the penalty rules and there is no way to ask for one, so these are real
// payloads found by search, one per mask, each recorded with the mask it selects. If a change to
// the penalty scoring moves one of them, the coverage assertion below goes red rather than the
// coverage quietly shrinking again.
const MASK_SAMPLES = [
  'https://lekhio.app/app/connect?n=x',
  `https://lekhio.app/app/connect?n=${'x'.repeat(83)}`,
  `https://lekhio.app/app/connect?n=${'x'.repeat(10)}`,
  `https://lekhio.app/app/connect?n=${'x'.repeat(2)}`,
  `https://lekhio.app/app/connect?n=${'x'.repeat(5)}`,
  'https://wa.me/447700900123?text=LEKHIO-YZW4YV3TDJ959ZEZJ9YG',
  `https://lekhio.app/app/connect?n=${'x'.repeat(14)}`,
  'https://wa.me/447700900123?text=LEKHIO-TCSTGSVECZ78CNAS8VMB',
];

let formatsRight = true;
let copiesAgree = true;
const masksSeen = new Set();
for (const sample of MASK_SAMPLES) {
  const m = encodeQr(sample);
  masksSeen.add(m.mask);
  if (readFormatCopy1(m) !== FORMAT_M[m.mask]) formatsRight = false;
  if (readFormatCopy1(m) !== readFormatCopy2(m)) copiesAgree = false;
  if (readPayload(m).text !== sample) formatsRight = false;
}
ok(`🔴 all eight masks are actually exercised (saw ${[...masksSeen].sort().join(',')})`,
  masksSeen.size === 8);
ok('🔴 the format information matches the published string for the mask it claims', formatsRight);
ok('🔴 both copies of the format information say the same thing', copiesAgree);

// The dark module. One module, fixed by the standard, and the second copy of the format information
// ran straight over it until this test existed.
let darkModuleSet = true;
for (let v = MIN_VERSION; v <= MAX_VERSION; v += 1) {
  const m = encodeQr('B'.repeat(capacityBytes(v)));
  if (m.modules[(m.size - 8) * m.size + 8] !== 1) darkModuleSet = false;
}
ok('🔴 the dark module is dark at every version', darkModuleSet);

// ── Version information, versions 7 and up ────────────────────────────────────────────────────
let versionInfoRight = true;
for (const v of [7, 8, 9, 10]) {
  const m = encodeQr('C'.repeat(capacityBytes(v)));
  if (readVersionInfo(m) !== VERSION_INFO[v]) versionInfoRight = false;
}
ok('the version information matches the published string from version 7 up', versionInfoRight);

// ── Finder and timing patterns ────────────────────────────────────────────────────────────────
const m5 = encodeQr('D'.repeat(capacityBytes(5)));
const atM5 = (r, c) => m5.modules[r * m5.size + c];
const finderOk = (br, bc) => {
  for (let r = 0; r < 7; r += 1) {
    for (let c = 0; c < 7; c += 1) {
      const ring = r === 0 || r === 6 || c === 0 || c === 6;
      const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      if (atM5(br + r, bc + c) !== (ring || core ? 1 : 0)) return false;
    }
  }
  return true;
};
ok('all three finder patterns are intact',
  finderOk(0, 0) && finderOk(0, m5.size - 7) && finderOk(m5.size - 7, 0));

let timingOk = true;
for (let i = 8; i < m5.size - 8; i += 1) {
  const want = i % 2 === 0 ? 1 : 0;
  if (atM5(6, i) !== want || atM5(i, 6) !== want) timingOk = false;
}
ok('the timing patterns alternate in both directions', timingOk);

// ── Refusals ──────────────────────────────────────────────────────────────────────────────────
let threwEmpty = false;
try { encodeQr(''); } catch { threwEmpty = true; }
ok('an empty payload throws', threwEmpty);

// 🔴 Non ASCII throws rather than drawing a square that scans as mojibake. A real scanner returned
// "caf?? ??4.50" for "café £4.50": correct bytes, no ECI header, wrong answer.
let threwUnicode = false;
try { encodeQr('café £4.50'); } catch { threwUnicode = true; }
ok('🔴 a non ASCII payload throws rather than encoding bytes a reader will misread', threwUnicode);

// ── The SVG ───────────────────────────────────────────────────────────────────────────────────
const svg = qrSvg(REAL, 240, 'Scan this with your phone');
ok('the svg is one self contained element', svg.startsWith('<svg') && svg.endsWith('</svg>'));
ok('🔴 the svg carries no script and fetches nothing',
  !/<script|href=|xlink:|<image|url\(/i.test(svg));
ok('the svg has the quiet zone, without which a scanner will not find the code',
  svg.includes(`viewBox="0 0 ${real.size + QUIET_ZONE * 2} ${real.size + QUIET_ZONE * 2}"`));
ok('the svg is labelled for a screen reader', svg.includes('role="img"') && svg.includes('aria-label='));
ok('the label is escaped rather than interpolated raw',
  qrSvg('HELLO', 10, 'a "quoted" <thing>').includes('&quot;quoted&quot; &lt;thing&gt;'));

// The code is a credential, so it must appear in the page exactly once: inside the square. A label
// that echoed it would put it in the accessibility tree and in any screenshot of the page.
ok('🔴 the alt text is not allowed to leak the payload it encodes',
  !qrSvg(REAL, 240, 'Scan this with your phone').includes('LEKHIO-8FTQ3M7KJH2WYRB4VN6X'));

// ── The path, which is what the page actually renders ─────────────────────────────────────────
//
// 🔴 THE PAGE DRAWS JSX FROM THESE NUMBERS RATHER THAN INJECTING MARKUP, so the string form above
// and the drawing below must describe the same square. Two producers of one picture is the shape
// of every drift bug in this codebase, so qrSvg is BUILT from qrPath and this proves it.
const drawing = qrPath(REAL);
ok('the drawing covers the square plus its quiet zone', drawing.span === real.size + QUIET_ZONE * 2);
ok('the drawing and the string describe the same square',
  svg.includes(`d="${drawing.path}"`) && svg.includes(`viewBox="0 0 ${drawing.span} ${drawing.span}"`));
ok('the path is run length encoded rather than one rectangle per module',
  drawing.path.length < real.size * real.size * 4);
ok('🔴 the path is nothing but path commands, so there is no markup to inject',
  /^[Mmhvz0-9 .-]+$/.test(drawing.path));

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

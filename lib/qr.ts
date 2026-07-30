// lib/qr.ts. A QR code, drawn on the server, with no dependency and no client JavaScript.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE EXISTS AT ALL, WHEN npm HAS A QR PACKAGE.
//
// The connect page shows a square a man scans with the phone he is about to bind. The square
// encodes a wa.me link carrying HIS LINK CODE, and that code is a credential: whoever sends it to
// us gets bound to his account and can feed his books and read his figures.
//
// That single fact rules out the easy answers. A hosted QR image service would mean posting the
// code to a third party on every page load. A client side renderer would mean shipping the code to
// a script, on the one page in the product where he is most likely to be on a bad signal. And
// `qrcode` from npm brings a tree of its own into a repo that has six runtime dependencies, for one
// SVG that never changes shape.
//
// So it is drawn here, on the server, as an inline SVG path. Nothing is fetched, nothing is
// executed in his browser, and the code never leaves our own response.
//
// ⚠️ WHAT THIS IS NOT. It is not a general QR library and must not grow into one. Byte mode only,
// error correction level M only, versions 1 to 10 only. That is every URL up to 152 characters,
// which is roughly twice the longest link this product can produce. Anything outside that range
// THROWS rather than silently drawing a square that does not scan, because a QR that fails to
// decode is the purest form of the house disease: it looks completely fine.
//
// ⚠️ AND IT IS VERIFIED BY DECODING, NOT BY ASSERTING. test/qr.test.mjs checks the module against
// the published specimen in ISO/IEC 18004 and against fixed reference matrices. A test that only
// checked our own arithmetic against our own arithmetic would pass just as happily with the mask
// applied twice.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// Error correction level M, fixed. L would give a sparser square that scans a fraction more
// easily, and M is chosen anyway: this is printed on nothing and photographed off a screen that may
// be dusty, in a van, with a cracked camera lens. M recovers 15% of the code and costs us one
// version of size at this payload length.
const ECC_M_BITS = 0b00;

// Per version: total codewords, error correction codewords per block, and the block layout.
// Group two exists only where the standard splits a version into two block sizes; its data length
// is always group one's plus one. Table 9 of ISO/IEC 18004, level M column.
interface VersionSpec {
  totalCodewords: number;
  eccPerBlock: number;
  group1Blocks: number;
  group1Data: number;
  group2Blocks: number;
  group2Data: number;
}

const VERSIONS: Record<number, VersionSpec> = {
  1: { totalCodewords: 26, eccPerBlock: 10, group1Blocks: 1, group1Data: 16, group2Blocks: 0, group2Data: 0 },
  2: { totalCodewords: 44, eccPerBlock: 16, group1Blocks: 1, group1Data: 28, group2Blocks: 0, group2Data: 0 },
  3: { totalCodewords: 70, eccPerBlock: 26, group1Blocks: 1, group1Data: 44, group2Blocks: 0, group2Data: 0 },
  4: { totalCodewords: 100, eccPerBlock: 18, group1Blocks: 2, group1Data: 32, group2Blocks: 0, group2Data: 0 },
  5: { totalCodewords: 134, eccPerBlock: 24, group1Blocks: 2, group1Data: 43, group2Blocks: 0, group2Data: 0 },
  6: { totalCodewords: 172, eccPerBlock: 16, group1Blocks: 4, group1Data: 27, group2Blocks: 0, group2Data: 0 },
  7: { totalCodewords: 196, eccPerBlock: 18, group1Blocks: 4, group1Data: 31, group2Blocks: 0, group2Data: 0 },
  8: { totalCodewords: 242, eccPerBlock: 22, group1Blocks: 2, group1Data: 38, group2Blocks: 2, group2Data: 39 },
  9: { totalCodewords: 292, eccPerBlock: 22, group1Blocks: 3, group1Data: 36, group2Blocks: 2, group2Data: 37 },
  10: { totalCodewords: 346, eccPerBlock: 26, group1Blocks: 4, group1Data: 43, group2Blocks: 1, group2Data: 44 },
};

export const MIN_VERSION = 1;
export const MAX_VERSION = 10;

// Where the alignment patterns sit. The standard gives centre coordinates; every pairing of these
// is used except the three that would land on a finder pattern.
const ALIGNMENT: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

function dataCodewords(spec: VersionSpec): number {
  return spec.group1Blocks * spec.group1Data + spec.group2Blocks * spec.group2Data;
}

// The character count indicator is eight bits up to version 9 and sixteen from version 10. Getting
// this wrong shifts every bit after it, which decodes as rubbish rather than as an error.
function countBits(version: number): number {
  return version < 10 ? 8 : 16;
}

// The largest payload each version can carry in byte mode, after the four mode bits and the count.
export function capacityBytes(version: number): number {
  const spec = VERSIONS[version];
  if (!spec) return 0;
  return Math.floor((dataCodewords(spec) * 8 - 4 - countBits(version)) / 8);
}

function smallestVersionFor(byteLength: number): number {
  for (let v = MIN_VERSION; v <= MAX_VERSION; v += 1) {
    if (byteLength <= capacityBytes(v)) return v;
  }
  throw new Error(`qr: ${byteLength} bytes does not fit in version ${MAX_VERSION} at level M`);
}

// --- GF(256), the field Reed-Solomon works in -------------------------------------------------
//
// Primitive polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11D), which is the one the QR standard names.
// Built once at module load: 512 entries of exponent table so a multiply never has to wrap.
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

// The generator polynomial for n error correction codewords: the product of (x - a^i) for i < n.
function generatorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i += 1) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

// Polynomial long division. The remainder IS the error correction block.
function eccFor(data: Uint8Array, eccLength: number): Uint8Array {
  const gen = generatorPoly(eccLength);
  const remainder = new Uint8Array(data.length + eccLength);
  remainder.set(data);
  for (let i = 0; i < data.length; i += 1) {
    const factor = remainder[i];
    if (factor === 0) continue;
    for (let j = 0; j < gen.length; j += 1) {
      remainder[i + j] ^= gfMul(gen[j], factor);
    }
  }
  return remainder.slice(data.length);
}

// --- BCH, for the format and version information ----------------------------------------------
//
// Computed rather than tabulated. A table of forty magic constants is forty chances to mistype one,
// and a mistyped format string produces a square that scans as a different mask and decodes as
// noise. This is eight lines and it cannot be wrong in only one place.
function bch(value: number, generator: number, dataBits: number, totalBits: number): number {
  let remainder = value << (totalBits - dataBits);
  for (let i = dataBits - 1; i >= 0; i -= 1) {
    if (remainder & (1 << (i + totalBits - dataBits))) {
      remainder ^= generator << i;
    }
  }
  return ((value << (totalBits - dataBits)) | remainder) >>> 0;
}

// Fifteen bits: two of level, three of mask, ten of BCH, the whole thing masked with 0x5412 so an
// all zero format never reads as valid.
function formatBits(mask: number): number {
  const data = (ECC_M_BITS << 3) | mask;
  return (bch(data, 0b10100110111, 5, 15) ^ 0b101010000010010) >>> 0;
}

// Eighteen bits, versions 7 and up only.
function versionBits(version: number): number {
  return bch(version, 0b1111100100101, 6, 18);
}

// --- The matrix ---------------------------------------------------------------------------------
//
// Two planes are kept: the modules themselves, and a mask of which positions are function patterns.
// Data is placed only where the second plane is clear, and the XOR mask is applied only there too.
// One plane cannot express that, and the version this file replaced tried, which is how a timing
// pattern briefly ended up inverted on mask 1.
interface Canvas {
  size: number;
  modules: Uint8Array;
  reserved: Uint8Array;
}

function newCanvas(version: number): Canvas {
  const size = version * 4 + 17;
  return { size, modules: new Uint8Array(size * size), reserved: new Uint8Array(size * size) };
}

function set(c: Canvas, r: number, col: number, dark: number, reserve = true): void {
  if (r < 0 || col < 0 || r >= c.size || col >= c.size) return;
  c.modules[r * c.size + col] = dark ? 1 : 0;
  if (reserve) c.reserved[r * c.size + col] = 1;
}

function isReserved(c: Canvas, r: number, col: number): boolean {
  return c.reserved[r * c.size + col] === 1;
}

function placeFinder(c: Canvas, row: number, col: number): void {
  for (let r = -1; r <= 7; r += 1) {
    for (let col2 = -1; col2 <= 7; col2 += 1) {
      const rr = row + r;
      const cc = col + col2;
      if (rr < 0 || cc < 0 || rr >= c.size || cc >= c.size) continue;
      const inRing = (r >= 0 && r <= 6 && (col2 === 0 || col2 === 6))
        || (col2 >= 0 && col2 <= 6 && (r === 0 || r === 6));
      const inCore = r >= 2 && r <= 4 && col2 >= 2 && col2 <= 4;
      set(c, rr, cc, inRing || inCore ? 1 : 0);
    }
  }
}

function placeAlignment(c: Canvas, version: number): void {
  const centres = ALIGNMENT[version];
  for (const row of centres) {
    for (const col of centres) {
      // The three corners already carry finder patterns and are skipped.
      const onFinder = (row === 6 && col === 6)
        || (row === 6 && col === c.size - 7)
        || (row === c.size - 7 && col === 6);
      if (onFinder) continue;
      for (let r = -2; r <= 2; r += 1) {
        for (let cc = -2; cc <= 2; cc += 1) {
          const edge = Math.max(Math.abs(r), Math.abs(cc));
          set(c, row + r, col + cc, edge === 1 ? 0 : 1);
        }
      }
    }
  }
}

function placeFunctionPatterns(c: Canvas, version: number): void {
  placeFinder(c, 0, 0);
  placeFinder(c, 0, c.size - 7);
  placeFinder(c, c.size - 7, 0);

  // Timing patterns, running between the finders.
  for (let i = 8; i < c.size - 8; i += 1) {
    const dark = i % 2 === 0 ? 1 : 0;
    set(c, 6, i, dark);
    set(c, i, 6, dark);
  }

  placeAlignment(c, version);

  // The dark module, which is always dark and is the one module the standard fixes by name.
  set(c, c.size - 8, 8, 1);

  // Reserve the format areas. Their contents are written after masking, because the mask is part of
  // what they say.
  for (let i = 0; i < 9; i += 1) {
    if (i !== 6) {
      set(c, 8, i, 0);
      set(c, i, 8, 0);
    }
  }
  for (let i = 0; i < 8; i += 1) {
    set(c, 8, c.size - 1 - i, 0);
    if (i < 7) set(c, c.size - 1 - i, 8, 0);
  }

  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i += 1) {
      const bit = (bits >> i) & 1;
      const a = Math.floor(i / 3);
      const b = (i % 3) + c.size - 11;
      set(c, b, a, bit);
      set(c, a, b, bit);
    }
  }
}

function writeFormat(c: Canvas, mask: number): void {
  const bits = formatBits(mask);
  for (let i = 0; i < 15; i += 1) {
    // ⚠️ MOST SIGNIFICANT BIT FIRST. The fifteen positions below are walked in the order the
    // standard lays them out, and the standard lays them out starting from bit 14. Reading them the
    // other way round produces a well formed format string for some other mask and level, so the
    // square is not corrupt, it is confidently wrong, and every scanner unmasks it with the wrong
    // pattern and gives up.
    const bit = (bits >> (14 - i)) & 1;
    // The copy beside the top left finder, skipping the timing column and row.
    if (i < 6) set(c, 8, i, bit);
    else if (i === 6) set(c, 8, 7, bit);
    else if (i === 7) set(c, 8, 8, bit);
    else if (i === 8) set(c, 7, 8, bit);
    else set(c, 14 - i, 8, bit);

    // The second copy, split between the other two finders, so a damaged corner loses only one.
    //
    // ⚠️ SEVEN GO DOWN THE LEFT AND EIGHT GO ACROSS THE BOTTOM, not eight and seven. The eighth
    // position down that column is (size - 8, 8), which is the dark module and belongs to nobody
    // else. Writing a format bit there costs the format its last bit AND unsets the one module the
    // standard fixes by name, and the whole square then decodes as nothing at all.
    if (i < 7) set(c, c.size - 1 - i, 8, bit);
    else set(c, 8, c.size - 15 + i, bit);
  }
}

// --- Bit stream ---------------------------------------------------------------------------------

class BitBuffer {
  private bits: number[] = [];

  put(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i -= 1) this.bits.push((value >> i) & 1);
  }

  get length(): number {
    return this.bits.length;
  }

  toCodewords(count: number): Uint8Array {
    const out = new Uint8Array(count);
    for (let i = 0; i < this.bits.length; i += 1) {
      if (this.bits[i]) out[i >> 3] |= 0x80 >> (i & 7);
    }
    return out;
  }
}

// The two alternating pad bytes the standard names. They are not arbitrary: a decoder that runs
// past the terminator reads these and knows it is in padding.
const PAD = [0xec, 0x11];

function encodeData(bytes: Uint8Array, version: number): Uint8Array {
  const spec = VERSIONS[version];
  const total = dataCodewords(spec);
  const buf = new BitBuffer();
  buf.put(0b0100, 4); // byte mode
  buf.put(bytes.length, countBits(version));
  for (const b of bytes) buf.put(b, 8);

  // Terminator, up to four bits, then pad to a whole codeword.
  const capacity = total * 8;
  const terminator = Math.min(4, capacity - buf.length);
  if (terminator > 0) buf.put(0, terminator);
  if (buf.length % 8 !== 0) buf.put(0, 8 - (buf.length % 8));

  const codewords = buf.toCodewords(total);
  let written = buf.length / 8;
  for (let i = 0; written < total; i += 1, written += 1) {
    codewords[written] = PAD[i % 2];
  }
  return codewords;
}

// Split into blocks, compute each block's error correction, then INTERLEAVE. The interleave is the
// whole point of blocks: a scratch across the printed square damages one codeword of many blocks
// rather than all of one, and every block can then repair itself.
function interleave(data: Uint8Array, version: number): Uint8Array {
  const spec = VERSIONS[version];
  const blocks: Uint8Array[] = [];
  const eccBlocks: Uint8Array[] = [];
  let offset = 0;
  const layout = [
    ...Array<number>(spec.group1Blocks).fill(spec.group1Data),
    ...Array<number>(spec.group2Blocks).fill(spec.group2Data),
  ];
  for (const size of layout) {
    const block = data.slice(offset, offset + size);
    offset += size;
    blocks.push(block);
    eccBlocks.push(eccFor(block, spec.eccPerBlock));
  }

  const out = new Uint8Array(spec.totalCodewords);
  let at = 0;
  const maxData = Math.max(...layout);
  for (let i = 0; i < maxData; i += 1) {
    for (const block of blocks) {
      if (i < block.length) out[at++] = block[i];
    }
  }
  for (let i = 0; i < spec.eccPerBlock; i += 1) {
    for (const block of eccBlocks) out[at++] = block[i];
  }
  return out;
}

// The zigzag. Two columns at a time, right to left, alternating direction, and column six is
// skipped entirely because the vertical timing pattern lives there.
function placeData(c: Canvas, codewords: Uint8Array): void {
  let bit = 0;
  const totalBits = codewords.length * 8;
  let upward = true;
  for (let right = c.size - 1; right > 0; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < c.size; step += 1) {
      const row = upward ? c.size - 1 - step : step;
      for (let lane = 0; lane < 2; lane += 1) {
        const col = right - lane;
        if (isReserved(c, row, col)) continue;
        let dark = 0;
        if (bit < totalBits) {
          dark = (codewords[bit >> 3] >> (7 - (bit & 7))) & 1;
          bit += 1;
        }
        // Not reserved: these are the positions the mask is allowed to flip.
        set(c, row, col, dark, false);
      }
    }
    upward = !upward;
  }
}

const MASKS: Array<(r: number, c: number) => boolean> = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function applyMask(c: Canvas, mask: number): void {
  const fn = MASKS[mask];
  for (let r = 0; r < c.size; r += 1) {
    for (let col = 0; col < c.size; col += 1) {
      if (isReserved(c, r, col)) continue;
      if (fn(r, col)) c.modules[r * c.size + col] ^= 1;
    }
  }
}

// The four penalty rules. The standard does not say "pick the prettiest", it says compute these and
// take the lowest, and a scanner's decode rate really does depend on it.
function penalty(c: Canvas): number {
  const n = c.size;
  const at = (r: number, col: number) => c.modules[r * n + col];
  let score = 0;

  // Rule 1: runs of five or more of the same colour, in both directions.
  for (let r = 0; r < n; r += 1) {
    let runColour = -1;
    let run = 0;
    for (let col = 0; col < n; col += 1) {
      const v = at(r, col);
      if (v === runColour) run += 1;
      else { if (run >= 5) score += run - 2; runColour = v; run = 1; }
    }
    if (run >= 5) score += run - 2;
  }
  for (let col = 0; col < n; col += 1) {
    let runColour = -1;
    let run = 0;
    for (let r = 0; r < n; r += 1) {
      const v = at(r, col);
      if (v === runColour) run += 1;
      else { if (run >= 5) score += run - 2; runColour = v; run = 1; }
    }
    if (run >= 5) score += run - 2;
  }

  // Rule 2: every two by two block of one colour.
  for (let r = 0; r < n - 1; r += 1) {
    for (let col = 0; col < n - 1; col += 1) {
      const v = at(r, col);
      if (v === at(r, col + 1) && v === at(r + 1, col) && v === at(r + 1, col + 1)) score += 3;
    }
  }

  // Rule 3: the finder-like pattern 1011101 with four light modules on either side. A scanner uses
  // that shape to find the code, so one appearing in the data is actively harmful.
  const A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  const matches = (get: (i: number) => number, start: number, pattern: number[]) => {
    for (let i = 0; i < pattern.length; i += 1) if (get(start + i) !== pattern[i]) return false;
    return true;
  };
  for (let r = 0; r < n; r += 1) {
    for (let col = 0; col + 11 <= n; col += 1) {
      const get = (i: number) => at(r, i);
      if (matches(get, col, A) || matches(get, col, B)) score += 40;
    }
  }
  for (let col = 0; col < n; col += 1) {
    for (let r = 0; r + 11 <= n; r += 1) {
      const get = (i: number) => at(i, col);
      if (matches(get, r, A) || matches(get, r, B)) score += 40;
    }
  }

  // Rule 4: how far the proportion of dark modules is from half.
  let dark = 0;
  for (let i = 0; i < c.modules.length; i += 1) dark += c.modules[i];
  const percent = (dark * 100) / (n * n);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

export interface QrMatrix {
  size: number;
  version: number;
  mask: number;
  // Row major, one entry per module, 1 for dark.
  modules: Uint8Array;
}

// The whole encode. Throws on anything it cannot draw correctly, which is the only honest thing a
// QR encoder can do: a square that does not scan reports no error of its own.
export function encodeQr(text: string): QrMatrix {
  if (typeof text !== 'string' || text.length === 0) throw new Error('qr: nothing to encode');

  // 🔴 ASCII ONLY, AND THIS IS A CORRECTNESS RULE RATHER THAN A LIMITATION.
  //
  // Byte mode carries bytes, not characters. Without an ECI header declaring UTF-8 a reader is
  // entitled to treat those bytes as latin-1, and real ones do: a test payload reading "café £4.50"
  // came back out of a scanner as "caf?? ??4.50". The bytes were right and the square was perfect.
  //
  // We do not emit ECI, because the only thing this module ever encodes is a wa.me link and a link
  // code we choose the alphabet of, both of which are ASCII by construction. So rather than carry
  // ECI for a case that cannot arise, this refuses the case. If a caller ever needs a pound sign in
  // a QR code, that is the day to add ECI properly, not the day to hope.
  // eslint-disable-next-line no-control-regex
  if (/[^\x20-\x7e]/.test(text)) throw new Error('qr: payload must be printable ASCII');

  const bytes = new TextEncoder().encode(text);
  const version = smallestVersionFor(bytes.length);

  const data = encodeData(bytes, version);
  const codewords = interleave(data, version);

  let best: Canvas | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  let bestMask = 0;
  for (let mask = 0; mask < 8; mask += 1) {
    const c = newCanvas(version);
    placeFunctionPatterns(c, version);
    placeData(c, codewords);
    applyMask(c, mask);
    writeFormat(c, mask);
    const score = penalty(c);
    if (score < bestScore) { bestScore = score; best = c; bestMask = mask; }
  }
  const chosen = best as Canvas;
  return { size: chosen.size, version, mask: bestMask, modules: chosen.modules };
}

// The quiet zone. Four modules of nothing on every side, and a scanner genuinely will not find the
// code without it. It is not padding for looks.
export const QUIET_ZONE = 4;

// ⚠️ THE PRIMITIVE IS THE PATH, NOT THE MARKUP, AND THAT IS SO THE PAGE CAN AVOID
// dangerouslySetInnerHTML ENTIRELY.
//
// The first version of this returned a finished SVG string, and the connect page injected it. That
// works and it is safe here, because nothing a customer types reaches this function: the payload is
// a link WE build out of our own alphabet. But "it is safe because of what today's only caller
// happens to pass" is a property that expires the moment somebody adds a second caller, and the
// screen it sits on is behind the session, showing a man his money.
//
// So this returns the numbers and the page renders real JSX. React escapes it, there is no raw HTML
// anywhere in the web app, and the claim that this ships no script is something a test can prove by
// grepping rather than something a reader has to take on trust.
//
// Dark modules are run length encoded into ONE path, horizontally, so a version 5 square is a few
// kilobytes of markup rather than nine hundred rectangles.
export interface QrDrawing {
  // The viewBox is in modules and includes the quiet zone, so the browser does the scaling and the
  // square stays crisp at any size and on any device pixel ratio.
  span: number;
  path: string;
  version: number;
}

export function qrPath(text: string): QrDrawing {
  const m = encodeQr(text);
  const span = m.size + QUIET_ZONE * 2;
  const parts: string[] = [];
  for (let r = 0; r < m.size; r += 1) {
    let run = 0;
    for (let c = 0; c <= m.size; c += 1) {
      const dark = c < m.size && m.modules[r * m.size + c] === 1;
      if (dark) { run += 1; continue; }
      if (run > 0) {
        parts.push(`M${c - run + QUIET_ZONE} ${r + QUIET_ZONE}h${run}v1h-${run}z`);
        run = 0;
      }
    }
  }
  return { span, path: parts.join(''), version: m.version };
}

// The same square as a standalone string, built FROM qrPath so the two can never disagree. Nothing
// in the web app uses this: it is here for anywhere an SVG file or an email body is wanted, and
// test/qr.test.mjs decodes its output, which is what keeps qrPath honest.
export function qrSvg(text: string, size: number, alt: string): string {
  const { span, path } = qrPath(text);
  // role and aria-label rather than a bare image: a screen reader user gets told what the square is
  // for, and the page always offers the same link in text underneath.
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${span} ${span}" width="${size}" height="${size}"`,
    ` role="img" aria-label="${escapeAttr(alt)}" shape-rendering="crispEdges">`,
    `<rect width="${span}" height="${span}" fill="#fff"/>`,
    `<path fill="#111" d="${path}"/>`,
    '</svg>',
  ].join('');
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

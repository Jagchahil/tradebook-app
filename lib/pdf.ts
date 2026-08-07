// lib/pdf.ts. A PDF, written by hand, with no dependency.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY THIS EXISTS RATHER THAN A LIBRARY, AND IT IS NOT NOT INVENTED HERE.
//
// The product had no way to produce a real file. Every document it hands a third party, the
// proof of income and the quarter pack, is a branded page the BROWSER saves as a PDF. That works
// and it stays. But a tradesman cannot forward a browser tab to a customer on WhatsApp, and
// WhatsApp is where these men actually work.
//
// The alternatives were a rendering engine (a headless browser, which does not belong in a
// serverless function) or a document library (a large dependency, a supply chain, and a new
// thing to keep patched). What an invoice actually needs is text, rules, and figures that line
// up in a column. That is a few hundred lines of a format that has been stable since 1993, and
// it is the same judgement lib/vat.ts made when it took zero imports: the small thing you fully
// understand beats the large thing you mostly trust.
//
// ⚠️ WHAT THIS DELIBERATELY CANNOT DO. No images, no embedded fonts, no colour beyond greys, no
// tables, no unicode beyond WinAnsi. Every one of those is a door to a malformed file, and a
// malformed file is worse than no file: it reaches a customer's accounts payable and makes the
// tradesman look like he cannot send an invoice. If a future document needs any of it, add it
// here deliberately with a test, or reach for a library then and not before.
//
// 🔴 THE POUND SIGN IS THE WHOLE REASON ENCODING IS DECLARED. PDF's default encoding does not
// carry it, so every figure on a British invoice would have printed as a wrong glyph or nothing
// at all. The fonts below declare WinAnsiEncoding, where the pound is byte 0xA3, and toBytes
// writes it as such. test/pdf.test.mjs reads a generated file back with an independent parser
// and asserts the pound survives, because "it looked fine on my screen" is not a check.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// A4 in points, which is the unit PDF thinks in. 72 to the inch.
export const A4_WIDTH = 595.28;
export const A4_HEIGHT = 841.89;

export type PdfFont = 'regular' | 'bold';

export interface TextOptions {
  size?: number;
  font?: PdfFont;
  /** 0 is black, 1 is white. Greys only: colour on an invoice is decoration and a risk. */
  grey?: number;
}

interface Op {
  content: string;
}

// ── Character widths, in units of 1/1000 of the font size ───────────────────────────────────
//
// ⚠️ THESE ARE WHY THE MONEY COLUMN LINES UP. Right aligning a figure means knowing how wide it
// is before it is drawn, and the only way to know that is the font's own metrics. Helvetica's
// have been fixed since Adobe published them, so this table cannot drift. Anything outside it
// falls back to the width of a digit, which is the commonest character in this document and
// therefore the least wrong guess available.
const W_REGULAR: Record<string, number> = {
  ' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191,
  '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500,
  K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  '[': 278, '\\': 278, ']': 278, '^': 469, _: 556, '`': 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222,
  k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278,
  u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  '{': 334, '|': 260, '}': 334, '~': 584, '£': 556,
};

const W_BOLD: Record<string, number> = {
  ' ': 278, '!': 333, '"': 474, '#': 556, $: 556, '%': 889, '&': 722, "'": 238,
  '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  ':': 333, ';': 333, '<': 584, '=': 584, '>': 584, '?': 611, '@': 975,
  A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556,
  K: 722, L: 611, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  '[': 333, '\\': 278, ']': 333, '^': 584, _: 556, '`': 333,
  a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278, j: 278,
  k: 556, l: 278, m: 889, n: 611, o: 611, p: 611, q: 611, r: 389, s: 556, t: 333,
  u: 611, v: 556, w: 778, x: 556, y: 556, z: 500,
  '{': 389, '|': 280, '}': 389, '~': 584, '£': 556,
};

const DIGIT_REGULAR = 556;

export function textWidth(text: string, size: number, font: PdfFont = 'regular'): number {
  const table = font === 'bold' ? W_BOLD : W_REGULAR;
  let units = 0;
  for (const ch of String(text ?? '')) {
    if (ch >= '0' && ch <= '9') units += DIGIT_REGULAR;
    else units += table[ch] ?? DIGIT_REGULAR;
  }
  return (units * size) / 1000;
}

// ⚠️ WRAPPING IS BY WORD AND NEVER MID WORD. A description that breaks in the middle of a word
// on a document a customer reads looks like a fault in the paperwork, and paperwork that looks
// faulty is paperwork that gets queried instead of paid.
export function wrapText(text: string, maxWidth: number, size: number, font: PdfFont = 'regular'): string[] {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (textWidth(candidate, size, font) <= maxWidth || !line) line = candidate;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

// ── Escaping and encoding ───────────────────────────────────────────────────────────────────
//
// 🔴 AN UNESCAPED BRACKET IN A CUSTOMER'S NAME BREAKS THE WHOLE FILE. A PDF string is delimited
// by round brackets, so "Ellis Roofing (Leyton) Ltd" would close the string early and leave the
// rest of the invoice as garbage instructions. A backslash does the same. This is not a nicety:
// it is the difference between a document and a corrupt download, and the name comes from a
// customer's own typing so it is entirely outside our control.
function escapeString(text: string): string {
  let out = '';
  for (const ch of String(text ?? '')) {
    const code = ch.codePointAt(0) ?? 63;
    if (ch === '(' || ch === ')' || ch === '\\') out += `\\${ch}`;
    else if (code === 10 || code === 13) out += ' ';
    else if (code < 32) out += ' ';
    else if (code < 127) out += ch;
    else if (code === 0x00a3) out += '\\243'; // pound, WinAnsi
    else if (code < 256) out += `\\${code.toString(8).padStart(3, '0')}`;
    // Anything above WinAnsi cannot be drawn with these fonts, so it is dropped rather than
    // written as a wrong glyph. A missing character is honest; a wrong one is not.
  }
  return out;
}

// ── The page ────────────────────────────────────────────────────────────────────────────────

export class PdfPage {
  private ops: Op[] = [];

  text(x: number, y: number, value: string, opts: TextOptions = {}): void {
    const size = opts.size ?? 10;
    const font = opts.font === 'bold' ? '/F2' : '/F1';
    const grey = clampGrey(opts.grey);
    // PDF's origin is the BOTTOM left. Callers think in distance from the top, which is how a
    // document is read and written, so the flip happens here once rather than at every call.
    const yy = round(A4_HEIGHT - y);
    this.ops.push({
      content: `${grey} g BT ${font} ${round(size)} Tf ${round(x)} ${yy} Td (${escapeString(value)}) Tj ET`,
    });
  }

  textRight(xRight: number, y: number, value: string, opts: TextOptions = {}): void {
    const size = opts.size ?? 10;
    const w = textWidth(value, size, opts.font ?? 'regular');
    this.text(xRight - w, y, value, opts);
  }

  line(x1: number, y1: number, x2: number, y2: number, opts: { width?: number; grey?: number } = {}): void {
    const grey = clampGrey(opts.grey ?? 0.8);
    this.ops.push({
      content: `${grey} G ${round(opts.width ?? 0.5)} w ${round(x1)} ${round(A4_HEIGHT - y1)} m ${round(x2)} ${round(A4_HEIGHT - y2)} l S`,
    });
  }

  stream(): string {
    return this.ops.map((o) => o.content).join('\n');
  }
}

function clampGrey(g: number | undefined): string {
  const v = typeof g === 'number' && Number.isFinite(g) ? Math.min(1, Math.max(0, g)) : 0;
  return round(v);
}

function round(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return (Math.round(v * 100) / 100).toString();
}

// ── The document ────────────────────────────────────────────────────────────────────────────

export class PdfDoc {
  private pages: PdfPage[] = [];

  // ⚠️ WRITTEN OUT RATHER THAN A PARAMETER PROPERTY. Node strips types to run these files
  // directly, and it refuses that shorthand, so the whole suite would fail to import this module.
  private readonly title: string;

  constructor(title = 'Document') {
    this.title = title;
  }

  addPage(): PdfPage {
    const page = new PdfPage();
    this.pages.push(page);
    return page;
  }

  get pageCount(): number {
    return this.pages.length;
  }

  // 🔴 THE CROSS REFERENCE TABLE IS BYTE OFFSETS, SO EVERYTHING IS MEASURED IN LATIN1, NOT UTF8.
  //
  // A PDF reader seeks to an absolute byte position for every object. Measuring those positions
  // in characters rather than bytes puts every one of them out by however many multi byte
  // characters came before, and the file opens as damaged. Escaping above has already reduced
  // the stream to single byte values, and latin1 in and latin1 out keeps it that way end to end.
  build(): Buffer {
    if (this.pages.length === 0) this.addPage();

    const objects: string[] = [];
    const pageIds: number[] = [];
    // 1 catalog, 2 pages, 3 font regular, 4 font bold, then a content and a page object per page.
    const firstPageObj = 5;
    for (let i = 0; i < this.pages.length; i += 1) pageIds.push(firstPageObj + i * 2 + 1);

    objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
    objects[2] = `<< /Type /Pages /Count ${this.pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`;
    objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;
    objects[4] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`;

    this.pages.forEach((page, i) => {
      const contentId = firstPageObj + i * 2;
      const pageId = contentId + 1;
      const stream = page.stream();
      const length = Buffer.byteLength(stream, 'latin1');
      objects[contentId] = `<< /Length ${length} >>\nstream\n${stream}\nendstream`;
      objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${round(A4_WIDTH)} ${round(A4_HEIGHT)}] `
        + `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    });

    const count = objects.length - 1;
    let body = '%PDF-1.4\n';
    const offsets: number[] = [];
    for (let id = 1; id <= count; id += 1) {
      offsets[id] = Buffer.byteLength(body, 'latin1');
      body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
    }

    const xrefAt = Buffer.byteLength(body, 'latin1');
    let xref = `xref\n0 ${count + 1}\n0000000000 65535 f \n`;
    for (let id = 1; id <= count; id += 1) {
      xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
    }
    const trailer = `trailer\n<< /Size ${count + 1} /Root 1 0 R /Info << /Title (${escapeString(this.title)}) /Producer (Lekhio) >> >>\n`
      + `startxref\n${xrefAt}\n%%EOF\n`;

    return Buffer.from(body + xref + trailer, 'latin1');
  }
}

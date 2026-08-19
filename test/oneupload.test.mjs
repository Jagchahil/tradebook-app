// THE ONE DOOR FOR UPLOADS, AND THE CEILING THAT REFUSED EVERY LONG RECEIPT.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS SUITE EXISTS TO PREVENT, IN TWO STORIES. 12 AUGUST 2026.
//
//   1. THE FOUNDER STOPPED HALF WAY. Feeding a customer's receipts through the capture page one
//      file at a time, he quit at two of eight and said nobody with a week of paperwork will do
//      this. The product had two upload doors, each taking one file, each making him say what
//      the file was before it would look. The one door (/app/money/upload) takes photographs
//      and CSVs together, sorts them itself, and walks the SAME two pipelines the old doors
//      walk. This suite holds the door open: the page, the multiple input, the route, both
//      pipeline calls, and the Money screen offering ONE row where two stood.
//
//   2. A 27 LINE TILL ROLL, PERFECTLY PRINTED, WAS REFUSED TWICE with "a clearer photograph
//      usually does it". parseReceipt's max_tokens sat at 300 from the days when the reply was
//      five fields; on 10 August the prompt gained line_items, one per printed line, and nobody
//      raised the ceiling to match a field that scales with the paper. The reply was CUT OFF
//      mid array, JSON.parse threw, and the whole reading came back null: the longest receipts,
//      the itemised ones the capture exists for, were exactly the ones refused. The ceiling now
//      fits the prompt, and a reply that still gets cut off gives up its LINES, never its MONEY,
//      through rescueTruncatedReceipt, which this suite exercises directly.
//
//   node test/oneupload.test.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { rescueTruncatedReceipt } from '../lib/receiptrescue.ts';
// S1, 19 August 2026. THE BYTE SNIFFER IS RUN HERE AGAINST REAL HEADERS, NOT ASSERTED ABOUT.
// Staged rather than imported directly, because lib/receiptingest.ts imports its siblings without
// the .ts extension and node cannot resolve those from source. Same staging the money suites use.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}`);
  }
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const s1Stage = mkdtempSync(path.join(tmpdir(), 's1-'));
{
  // 🔴 THE STUBS ARE DERIVED FROM receiptingest's OWN IMPORT STATEMENTS, never listed here. The two
  // functions under test are PURE and touch none of these, but the module graph still has to
  // resolve, and a hand written list of siblings is a list that rots the next time one is added.
  const s1Src = readFileSync(path.join(root, 'lib/receiptingest.ts'), 'utf8');
  const needs = new Map();
  const re = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*'\.\/([a-zA-Z]+)'/g;
  let m;
  while ((m = re.exec(s1Src))) {
    const names = m[1].split(',').map((x) => x.replace(/^\s*type\s+/, '').trim()).filter(Boolean);
    const list = needs.get(m[2]) ?? [];
    needs.set(m[2], list.concat(names));
  }
  ok('🔴 S1 VACUITY: the stub generator read receiptingest\'s sibling imports', needs.size >= 5);
  for (const [dep, names] of needs) {
    const body = names.map((n) => `export const ${n} = () => undefined;`).join('\n');
    writeFileSync(path.join(s1Stage, dep + '.ts'), body + '\n');
  }
}
writeFileSync(
  path.join(s1Stage, 'receiptingest.ts'),
  readFileSync(path.join(root, 'lib/receiptingest.ts'), 'utf8')
    .replace(/from '\.\/([a-zA-Z]+)'/g, "from './$1.ts'"),
);
const S1 = await import(pathToFileURL(path.join(s1Stage, 'receiptingest.ts')).href);
const { imageTypeFromBytes, bytesConfirmType, RECEIPT_IMAGE_TYPES } = S1;
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

// ⚠️ PRESENT AND ORDERED, NEVER JUST ORDERED. indexOf returns -1 for a missing needle, so a
// bare comparison passes when the first thing was deleted. Every ordering claim goes through
// this, per the repo's standing lesson.
function before(hay, a, b) {
  const i = hay.indexOf(a);
  const j = hay.indexOf(b);
  return i !== -1 && j !== -1 && i < j;
}

// ⚠️ NEGATIVE ASSERTIONS RUN ON THE CODE, NEVER ON THE PROSE AROUND IT. The comments in these
// files tell the story of what was removed, so a grep for the removed thing finds the story.
const codeOnly = (s) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

console.log('one door: the route');
{
  const route = read('app/api/money/upload/route.ts');
  const code = codeOnly(route);
  ok('the route exists and answers POST', /export async function POST\(/.test(code));
  ok('a no-script batch gets sixty seconds, said as route config', /export const maxDuration = 60/.test(code));
  // The CALL, with this route's own argument names in it, not the import line. An import is
  // not a wiring: the 12 August lesson, applied to the suite guarding the 12 August fix.
  ok('the receipt walk is CALLED with the web source type', /await ingestReceiptImage\(\{[\s\S]{0,200}?sourceType: 'web_image'/.test(code));
  ok('the statement walk is CALLED with the user and the text', /await ingestStatementCsv\(\{ userId, text \}\)/.test(code));
  ok('every photograph passes the one wallet', /await receiptSpendBlocked\(userId\)/.test(code));
  ok('the door takes MANY files under one name', /form\.getAll\('files'\)/.test(code));
  ok('the enhanced page has its one-file mode', /form\.get\('mass'\) === '1'/.test(code));
  ok('the no-script batch is capped, not silently truncated', /const NOJS_MAX_FILES = [1-8]\b/.test(code) && /files\.slice\(0, NOJS_MAX_FILES\)/.test(code) && /left=\$\{left\}/.test(code));
  ok('sorting is deterministic: images by the receipt allowlist', /RECEIPT_IMAGE_TYPES\.includes\(mediaType\)/.test(code));
  ok('sorting is deterministic: statements by extension and csv types', /endsWith\('\.csv'\)/.test(code));
  // The burst guards are the SAME KEYS as the single-file doors, so the two doors are one
  // allowance and neither can be played against the other.
  ok('receipt bursts share the capture door key at the raised ceiling', /rateLimitedShared\(`receiptweb:\$\{userId\}`, 40,/.test(code));
  ok('statement bursts share the import door key', /rateLimitedShared\(`stmtimport:\$\{userId\}`, 12,/.test(code));
}

console.log('one door: the page');
{
  const page = read('app/app/money/upload/page.tsx');
  ok('the page exists', existsSync(path.join(root, 'app/app/money/upload/page.tsx')));
  ok('one input, many files', /name="files"[^>]*type="file"[^>]*multiple|multiple[^>]*name="files"|type="file"[^>]*accept="image\/\*,\.csv,text\/csv" multiple/.test(page.replace(/\n\s*/g, ' ')));
  ok('the input takes photos AND csvs', /accept="image\/\*,\.csv,text\/csv"/.test(page));
  ok('the plain form posts to the one route', /action="\/api\/money\/upload" method="post" encType="multipart\/form-data"/.test(page));
  ok('the enhancer streams to the SAME route', page.includes("fetch('/api/money/upload'"));
  ok('the enhancer marks its one-file mode', page.includes("fd.append('mass', '1')"));
  ok('the enhancer never fires with nothing picked', page.includes('input.files.length === 0) return'));
}

console.log('one row where two stood');
{
  const money = codeOnly(read('app/app/money/page.tsx'));
  ok('the Money screen offers the one door', money.includes('href="/app/money/upload"'));
  ok('the till slip row is gone from the Money screen', !money.includes('href="/app/money/capture"'));
  ok('the statement row is gone from the Money screen', !money.includes('href="/app/money/import"'));
  const nav = codeOnly(read('app/app/AppNav.tsx'));
  ok('the plus sheet offers the one door', nav.includes("'/app/money/upload'"));
  ok('the plus sheet no longer offers the two old doors', !nav.includes("'/app/money/capture'") && !nav.includes("'/app/money/import'"));
  const gate = read('lib/gate.ts');
  ok('the route has its gate row, entitled like the work it is', /route: 'app\/api\/money\/upload', rule: 'entitled'/.test(gate));
}

console.log('the old doors still stand for open tabs');
{
  ok('the capture page still answers its URL', existsSync(path.join(root, 'app/app/money/capture/page.tsx')));
  ok('the import page still answers its URL', existsSync(path.join(root, 'app/app/money/import/page.tsx')));
}

console.log('one statement walk, two callers');
{
  const walk = codeOnly(read('lib/statementingest.ts'));
  ok('the walk exists', /export async function ingestStatementCsv\(/.test(walk));
  ok('the walk parses with the one engine injected', /parseStatement\(text, userId, \(line\) => mapBankTransaction\(line, categoriseBankLine\)\)/.test(walk));
  ok('the walk writes through the one insert', /await insertBankTransactions\(userId, fresh\)/.test(walk));
  ok('review counts stay honest about taught-personal rows', /Math\.max\(0, inserted - personalAmongFresh\)/.test(walk));
  const importRoute = codeOnly(read('app/api/money/import/route.ts'));
  ok('the import route is a CALLER of the walk', /await ingestStatementCsv\(\{ userId: user\.id, text \}\)/.test(importRoute));
  ok('the import route no longer carries its own copy of the walk', !/parseStatement\(/.test(importRoute) && !/insertBankTransactions\(/.test(importRoute));
}

console.log('one wallet, two callers');
{
  const wallet = codeOnly(read('lib/aibudget.ts'));
  ok('the wallet walk exists', /export async function receiptSpendBlocked\(/.test(wallet));
  ok('the wallet still judges with decideSpend before its own bump', /decideSpend\(\{ globalDay: globalDay - 1, globalMonth: globalMonth - 1, userDay: userDay - 1 \}, caps\)/.test(wallet));
  const receiptRoute = codeOnly(read('app/api/money/receipt/route.ts'));
  ok('the capture route is a CALLER of the wallet', /await receiptSpendBlocked\(user\.id\)/.test(receiptRoute));
  ok('the capture route no longer carries its own copy of the rings', !/decideSpend\(/.test(receiptRoute) && !/bumpAiUsage\(/.test(receiptRoute));
  ok('the capture route burst ceiling matches the one door', /rateLimitedShared\(`receiptweb:\$\{user\.id\}`, 40,/.test(receiptRoute));
}

console.log('the ceiling that refused every long receipt');
{
  const claude = read('lib/claude.ts');
  const code = codeOnly(claude);
  const ceiling = /const RECEIPT_MAX_TOKENS = (\d+)/.exec(code);
  ok('the ceiling is named and fits the prompt it serves', ceiling !== null && Number(ceiling[1]) >= 1200);
  ok('parseReceipt asks for the named ceiling, not a literal', /max_tokens: RECEIPT_MAX_TOKENS/.test(code));
  ok('the rescue lives pure and importable', /export function rescueTruncatedReceipt\(/.test(codeOnly(read('lib/receiptrescue.ts'))));
  // The ASSIGNMENT, not the call: a rescue whose answer is thrown away is the 12 August
  // vacuous-guard shape. parsed must take the rescued object.
  ok('a cut-off reply is rescued and the rescue is USED', /const saved = rescueTruncatedReceipt\(clean\(textBlock\)\)/.test(code) && /parsed = saved/.test(code));
  ok('an unrescuable reply still answers null', before(code, 'const saved = rescueTruncatedReceipt', 'if (!saved) {'));
}

console.log('the rescue itself, exercised');
{
  // A reply cut off mid line_items: the money fields sit whole in the prefix.
  const cut = '{"merchant_name": "BOOKER WHOLESALE", "amount": 147.63, "category": "materials",'
    + ' "transaction_type": "expense", "transaction_date": "2026-07-24", "vat": 24.61,'
    + ' "line_items": [ { "description": "CELLOPHANE ROLL CLR", "amount": 8.99 }, { "descri';
  const saved = rescueTruncatedReceipt(cut);
  ok('the money fields come back whole', saved !== null && saved.merchant_name === 'BOOKER WHOLESALE' && saved.amount === 147.63);
  ok('the top level amount wins, never a line amount', saved !== null && saved.amount !== 8.99);
  ok('the date rides along', saved !== null && saved.transaction_date === '2026-07-24');
  ok('the vat rides along when the prefix carries it', saved !== null && saved.vat === 24.61);
  ok('the lines are given up, empty and honest', saved !== null && Array.isArray(saved.line_items) && saved.line_items.length === 0);

  const noVat = rescueTruncatedReceipt('{"merchant_name": "PORTERS", "amount": 81.43, "category": "materials", "transaction_type": "expense", "transaction_date": null, "vat": null, "line_items": [ { "de');
  ok('a null vat stays null, never zero', noVat !== null && noVat.vat === null);

  ok('no amount in the prefix means no rescue, never a guess', rescueTruncatedReceipt('{"merchant_name": "PORTERS", "amou') === null);
  ok('a zero amount is refused, not rescued', rescueTruncatedReceipt('{"merchant_name": "X", "amount": 0, "cat') === null);
  ok('an empty string is refused', rescueTruncatedReceipt('') === null);
}


// ═══════════════════════════════════════════════════════════════════════════════════════════
// S1. NO DOOR ACCEPTS A DECLARED TYPE IT HAS NOT CONFIRMED FROM THE BYTES. 19 August 2026.
//
// Every upload path decided what a file WAS from what the sender CALLED it: File.type on the
// four web doors, Meta's metadata on WhatsApp. storeReceiptImage then wrote that string as the
// stored object's Content-Type, so the sender chose a header we later served back.
//
// 🔴 GUARDED AS THE SHAPE, NOT AS ONE PATH, WHICH IS WHAT THE ITEM ASKED FOR. The door list is
// DERIVED from the tree rather than typed here, so a SIXTH door cannot be added without either
// going through the checked walk or failing this block. A list of five would have been a list
// that rots the first time somebody adds a sixth.
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const rd = (rel) => readFileSync(path.join(root, rel), 'utf8');
  const ingest = codeOnly(rd('lib/receiptingest.ts'));

  // ── the sniffer itself, run against real headers rather than asserted about ──
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00]);
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x00, 0x00, 0x00]);
  const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00]);
  const elf = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]);

  ok('S1: every type we accept is recognised from its own first bytes',
    imageTypeFromBytes(jpeg) === 'image/jpeg' && imageTypeFromBytes(png) === 'image/png'
    && imageTypeFromBytes(gif) === 'image/gif' && imageTypeFromBytes(webp) === 'image/webp');
  ok('🔴 S1: and the whole accepted list is covered, derived rather than counted by hand',
    RECEIPT_IMAGE_TYPES.every((t) => [jpeg, png, gif, webp].some((b) => imageTypeFromBytes(b) === t)));
  ok('🔴 S1: a PDF, a ZIP and an ELF binary are none of them, whatever they are called',
    imageTypeFromBytes(pdf) === null && imageTypeFromBytes(zip) === null && imageTypeFromBytes(elf) === null);
  ok('🔴 S1: THE ATTACK, NAMED. A binary declared as a JPEG is refused',
    bytesConfirmType(elf, 'image/jpeg') === false && bytesConfirmType(zip, 'image/png') === false);
  ok('🔴 S1: and a REAL image lying about WHICH image it is, is refused too',
    bytesConfirmType(png, 'image/jpeg') === false && bytesConfirmType(jpeg, 'image/png') === false);
  ok('S1: an honest photograph still passes, or this guard would shut the product',
    bytesConfirmType(jpeg, 'image/jpeg') && bytesConfirmType(png, 'image/png')
    && bytesConfirmType(gif, 'image/gif') && bytesConfirmType(webp, 'image/webp'));
  ok('S1: a truncated header is refused rather than guessed at',
    imageTypeFromBytes(new Uint8Array([0xff, 0xd8])) === null
    && imageTypeFromBytes(new Uint8Array([])) === null
    && imageTypeFromBytes(webp.slice(0, 11)) === null);
  ok('S1: the declared type is normalised before it is compared, so a charset suffix cannot dodge it',
    bytesConfirmType(jpeg, 'IMAGE/JPEG; charset=binary'));

  // ── the check sits BEFORE the write, which is the whole point ──
  ok('🔴 S1: the bytes are checked BEFORE storeReceiptImage, not after the thing it prevents',
    ingest.indexOf('bytesConfirmType(bytes, mediaType)') > -1
    && ingest.indexOf('bytesConfirmType(bytes, mediaType)') < ingest.indexOf('storeReceiptImage(userId, bytes, mediaType)'));
  ok('🔴 S1: and a refusal returns nottype, which is NOT unread',
    /if \(!bytesConfirmType\(bytes, mediaType\)\) return \{ outcome: 'nottype' \};/.test(ingest));

  // ── THE SHAPE. Every door that puts uploaded bytes into storage is derived from the tree ──
  const walk = (dir, out = []) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, out);
      else if (/\.tsx?$/.test(e.name)) out.push(path.relative(root, full));
    }
    return out;
  };
  const STORERS = /\b(storeReceiptImage|storeJobPhotoImage)\s*\(/;
  const doors = walk(path.join(root, 'app'))
    .concat(walk(path.join(root, 'lib')))
    .filter((rel) => STORERS.test(codeOnly(rd(rel))));

  ok('🔴 S1 VACUITY: the door scan found doors at all',
    doors.length >= 2);
  const unchecked = doors.filter((rel) => {
    const src = codeOnly(rd(rel));
    // lib/supabase.ts DEFINES the two storers; it does not decide what a file is.
    if (rel === 'lib/supabase.ts') return false;
    return !/bytesConfirmType\s*\(/.test(src);
  });
  ok('🔴 S1: EVERY door that stores uploaded bytes confirms the type from the bytes first'
    + (unchecked.length ? ` [unchecked: ${unchecked.join(', ')}]` : ''),
    unchecked.length === 0);

  // ── and every caller of the walk answers the new outcome rather than falling through ──
  const CALLERS = walk(path.join(root, 'app')).filter((rel) => /ingestReceiptImage\s*\(\{/.test(codeOnly(rd(rel))));
  ok('🔴 S1 VACUITY: the caller scan found the walk\'s callers',
    CALLERS.length >= 4);
  const deaf = CALLERS.filter((rel) => !/'nottype'/.test(codeOnly(rd(rel))));
  ok('🔴 S1: and every caller of the walk SAYS something about a refused type'
    + (deaf.length ? ` [silent: ${deaf.join(', ')}]` : ''),
    deaf.length === 0);

  // ── the two chat channels say ONE sentence, from one place ──
  ok('🔴 S1: the wrong type sentence lives in lib/receiptingest.ts and nowhere else',
    /export const NOT_AN_IMAGE_REPLY = /.test(ingest)
    && !/I cannot read that kind of file/.test(codeOnly(rd('app/api/thread/route.ts')))
    && !/I cannot read that kind of file/.test(codeOnly(rd('app/api/whatsapp/route.ts'))));
  ok('🔴 S1: and BOTH chat channels send that one constant, so they cannot drift',
    /NOT_AN_IMAGE_REPLY/.test(codeOnly(rd('app/api/thread/route.ts')))
    && /NOT_AN_IMAGE_REPLY/.test(codeOnly(rd('app/api/whatsapp/route.ts'))));
  ok('S1: a refused type never reaches the parser, so it costs no AI call',
    ingest.indexOf('bytesConfirmType(bytes, mediaType)') < ingest.indexOf('parseReceipt(base64, mediaType)'));
}

console.log('');
console.log(`${pass} passed, ${fail} failed.`);
if (fail > 0) process.exit(1);

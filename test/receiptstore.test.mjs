// THE RECEIPT PHOTOGRAPH, KEPT. Stored first, parsed second, and never allowed to cost a figure.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// app/api/money/receipt used to read the image and throw it away, so the one piece of evidence
// HMRC would actually ask to see survived only as our reading of it. storeReceiptImage in
// lib/supabase.ts now puts it in the PRIVATE receipts bucket and the path lands in the row's
// raw_input_url. This suite is written against the failures that would ship quietly:
//
//   1. A LOST IMAGE LOSING THE FIGURES. Storage is evidence, never a dependency. If the upload
//      returns null the parse must still run and the row must still land, because the figures
//      are what his tax is prepared from. Pinned on the route's structure and at runtime.
//
//   2. A PATH THAT ESCAPES ITS OWNER. Every object lives under the user's own id. A nonce that
//      could carry ../ or a slash would let one man's receipt land in another man's folder, so
//      the path builder is pure, attacked here with traversal strings, and refuses odd shapes.
//
//   3. A PUBLIC BUCKET OF RECEIPTS. Doc 97 put it in writing that receipt images never sit in a
//      public bucket. The SQL creates the bucket private with a size limit and a mime allowlist,
//      and no storage policy grants anon or authenticated anything.
//
// Run: node test/receiptstore.test.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); }
};

const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const sqlCodeOnly = (src) => src.replace(/--[^\n]*/g, '');

const routeReceipt = read('app/api/money/receipt/route.ts');
const migration = read('supabase/APPLY_2026-07-31_goals_consolidation.sql');
const supa = read('lib/supabase.ts');

console.log('\nthe receipt photograph: kept privately, filed by owner, never worth more than the figures');

// The helpers are staged out of the tail of lib/supabase.ts, the diarygoals staging, so the
// functions on the bench are the ones production runs.
const OWNER = '11111111-1111-4111-8111-111111111111';
const stage = mkdtempSync(path.join(tmpdir(), 'receiptstore-'));
const tail = supa.slice(supa.indexOf('export interface DiaryJobDbRow'));
writeFileSync(path.join(stage, 'accessors.ts'), [
  `const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;`,
  `function config(): { url: string; key: string } { return { url: 'https://db.test', key: 'k' }; }`,
  `function headers(extra: Record<string, string> = {}): Record<string, string> {`,
  `  return { apikey: 'k', Authorization: 'Bearer k', 'Content-Type': 'application/json', ...extra };`,
  `}`,
  `async function insertTransaction(): Promise<void> { /* not the storage path's business */ }`,
  tail,
].join('\n'));
const S = await import(pathToFileURL(path.join(stage, 'accessors.ts')).href);

// ---------------------------------------------------------------------------------------------
// 1. THE PURE PATH. Owner scoped, extension from the allowlist, everything else refused.
// ---------------------------------------------------------------------------------------------
ok('the bucket has one name and it is receipts', S.RECEIPTS_BUCKET === 'receipts');
ok('the allowlisted types map to their honest extensions',
  S.receiptFileExtension('image/jpeg') === 'jpg' && S.receiptFileExtension('image/png') === 'png'
  && S.receiptFileExtension('image/webp') === 'webp' && S.receiptFileExtension('image/gif') === 'gif');
ok('a parameterised media type still reads', S.receiptFileExtension('image/jpeg; charset=binary') === 'jpg');
ok('🔴 an unknown type is refused, never guessed',
  S.receiptFileExtension('image/heic') === null && S.receiptFileExtension('application/pdf') === null
  && S.receiptFileExtension('') === null);

{
  const p = S.receiptStoragePath(OWNER, 'image/jpeg', '2026-07-31', 'abc-123');
  ok('🔴 the path is bucket, then THE OWNER, then the file: tenancy is the folder',
    p === `receipts/${OWNER}/2026-07-31-abc-123.jpg`);
  ok('🔴 a non uuid owner builds nothing, so no object can ever land outside a user folder',
    S.receiptStoragePath('not-a-user', 'image/jpeg', '2026-07-31', 'x') === null
    && S.receiptStoragePath('', 'image/jpeg', '2026-07-31', 'x') === null);
  ok('a broken day or an unknown type builds nothing',
    S.receiptStoragePath(OWNER, 'image/jpeg', '31/07/2026', 'x') === null
    && S.receiptStoragePath(OWNER, 'image/heic', '2026-07-31', 'x') === null);
  ok('🔴 a traversal nonce is stripped to its honest characters, never a path',
    S.receiptStoragePath(OWNER, 'image/png', '2026-07-31', '../../etc/passwd')
      === `receipts/${OWNER}/2026-07-31-etcpasswd.png`);
  ok('a nonce with nothing left in it builds nothing',
    S.receiptStoragePath(OWNER, 'image/png', '2026-07-31', '../..//') === null);
}

// ---------------------------------------------------------------------------------------------
// 2. THE UPLOAD AT RUNTIME. Null on every failure, the path on success, and never a throw.
// ---------------------------------------------------------------------------------------------
{
  const calls = [];
  let mode = 'ok'; // 'ok' | 'down' | 'throws'
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', headers: init.headers ?? {} });
    if (mode === 'throws') throw new Error('network gone');
    if (mode === 'down') return new Response('storage is having a minute', { status: 500 });
    return new Response('{}', { status: 200 });
  };
  const bytes = new Uint8Array([1, 2, 3, 4]);
  try {
    const stored = await S.storeReceiptImage(OWNER, bytes, 'image/jpeg');
    ok('🔴 a stored image answers with the raw_input_url path, inside the owner\'s folder',
      typeof stored === 'string' && stored.startsWith(`receipts/${OWNER}/`) && stored.endsWith('.jpg'));
    ok('and the upload went to the storage API under that same path',
      calls.at(-1).url === `https://db.test/storage/v1/object/${stored}` && calls.at(-1).method === 'POST');
    ok('the body\'s content type is the image\'s own, not JSON',
      calls.at(-1).headers['Content-Type'] === 'image/jpeg');

    const before = calls.length;
    ok('🔴 empty bytes and oversized bytes are refused before any network',
      (await S.storeReceiptImage(OWNER, new Uint8Array(0), 'image/jpeg')) === null
      && (await S.storeReceiptImage(OWNER, new Uint8Array(4 * 1024 * 1024 + 1), 'image/jpeg')) === null
      && calls.length === before);
    ok('an unknown media type is refused before any network too',
      (await S.storeReceiptImage(OWNER, bytes, 'image/heic')) === null && calls.length === before);

    mode = 'down';
    ok('🔴 a failed upload is null, the signal every caller must carry on past', (await S.storeReceiptImage(OWNER, bytes, 'image/jpeg')) === null);
    mode = 'throws';
    ok('🔴 a thrown fetch is null too: storage can never crash a capture route', (await S.storeReceiptImage(OWNER, bytes, 'image/jpeg')) === null);
    mode = 'ok';
  } finally {
    globalThis.fetch = realFetch;
  }
}

// ---------------------------------------------------------------------------------------------
// 🔴 3. THE ROUTE. Store first, parse second, and the figures never depend on the image.
// ---------------------------------------------------------------------------------------------
{
  const code = codeOnly(routeReceipt);
  ok('🔴 the image is stored BEFORE the parse: store first, parse second',
    code.indexOf('storeReceiptImage(user.id, bytes, mediaType)') > -1
    && code.indexOf('storeReceiptImage(') < code.indexOf('parseReceipt(base64, mediaType)'));
  ok('🔴 and AFTER the budget rings: a refused spend stores nothing',
    code.indexOf('decideSpend(') < code.indexOf('storeReceiptImage('));
  ok('🔴 a null from storage stops NOTHING: no early return sits between the store and the insert',
    !/if \(!storedPath\)/.test(code) && !/storedPath ===? null\)\s*return/.test(code));
  ok('the stored path lands on the inserted row as raw_input_url',
    /raw_input_url: storedPath/.test(code));
  ok('a merged receipt hands the bank line its image too, only when one was kept',
    /\.\.\.\(storedPath \? \{ raw_input_url: storedPath \} : \{\}\)/.test(code));
  ok('🔴 the route still writes through lib and nothing else: no inline storage call',
    !/storage\/v1/.test(code) && !/\bfetch\s*\(/.test(code));
  ok('the header says the rule in words: a lost image must never lose the figures',
    /lost image must never lose the figures/i.test(routeReceipt));
}

// ---------------------------------------------------------------------------------------------
// 🔴 4. THE BUCKET. Private, capped, allowlisted, and created in the consolidation file.
// ---------------------------------------------------------------------------------------------
ok('the bucket is created idempotently in the consolidation SQL',
  /insert into storage\.buckets/.test(migration) && /on conflict \(id\) do nothing/.test(migration));
{
  const bucketBlock = migration.slice(migration.indexOf('insert into storage.buckets'));
  ok('🔴 PRIVATE: public is false', /false/.test(sqlCodeOnly(bucketBlock).split('on conflict')[0]));
  ok('🔴 with a size limit matching the route\'s own ceiling',
    /4194304/.test(bucketBlock) && /MAX_BYTES = 4 \* 1024 \* 1024/.test(routeReceipt));
  ok('and the same mime allowlist the route enforces',
    ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].every((t) => bucketBlock.includes(t)));
  ok('🔴 no storage policy grants anyone anything: the service role only posture',
    !/create policy/.test(sqlCodeOnly(migration)) && !/storage\.objects/.test(sqlCodeOnly(migration)));
}

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

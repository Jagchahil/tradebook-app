// Tests for the two data rights doors: the UK GDPR export (Article 15) and the
// erasure (Article 17), both in lib/supabase.ts.
//
// THE DEFECT THIS SUITE GUARDS AGAINST: THE TWO DOORS EACH KEPT THEIR OWN LIST
// OF WHAT WE HOLD, AND BOTH LISTS WENT STALE IN THE ONE DIRECTION NOBODY SEES.
//
// exportUserData returned seven tables out of the twenty eight we hold, so a man
// who asked for his data got his receipts and his invoices and NOT ONE LINE OF
// HIS CHAT HISTORY. deleteUserData walked past allowance_elections,
// announcement_dismissals, signup_codes (his address), wa_out (his number) and
// every receipt photograph in the storage bucket, while the comment sitting above
// it promised it deleted "every row for this user across all tables, including
// the server-only ones that do not cascade".
//
// Neither was written on purpose, and that is the point. A hand written list is
// added to by whoever is looking at it, and the other list quietly becomes a
// false statement about a legal obligation. Nothing crashes. Nothing looks wrong.
// The export succeeds and is incomplete, the erasure answers ok and has kept his
// pictures, and the only person who could ever notice is the customer, who cannot
// see either list.
//
// So the fix is structural: ONE manifest, USER_DATA_TABLES, walked by both
// functions, and this suite proves the walk actually happens by RUNNING both
// against a stubbed transport and reading the requests they made. A source scan
// alone would pass on a list that is never read.
//
//   node test/datarights.test.mjs

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const libDir = path.join(repoRoot, 'lib');
const supabaseSrc = readFileSync(path.join(libDir, 'supabase.ts'), 'utf8');

// The module reads its url and service key at import time, so they go in first.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

// Stage lib/ so the real module graph imports under node's type stripping.
const stage = mkdtempSync(path.join(tmpdir(), 'datarights-'));
const fix = (s) =>
  s.replace(/from '(\.\/[a-zA-Z0-9_.-]+)'/g, (m, p) => (p.endsWith('.ts') ? m : `from '${p}.ts'`));
for (const f of readdirSync(libDir)) {
  if (f.endsWith('.ts')) writeFileSync(path.join(stage, f), fix(readFileSync(path.join(libDir, f), 'utf8')));
}
const SB = await import(pathToFileURL(path.join(stage, 'supabase.ts')).href);

let pass = 0, fail = 0;
function ok(desc, cond) {
  if (cond) { pass++; process.stdout.write(`  PASS  ${desc}\n`); }
  else { fail++; process.stdout.write(`  FAIL  ${desc}\n`); }
}

// One man, with all three identities, so every key kind in the manifest fires.
const USER_ID = '11111111-2222-3333-4444-555555555555';
const PHONE = '+447700900123';
// The address he typed and the address the table is keyed on are deliberately
// different: googlemail collapses to gmail and the plus tag comes off, and
// signup_codes stores only the normalised form. See lib/trialidentity.ts.
const EMAIL = 'Dave+tag@googlemail.com';
const EMAIL_NORM = 'dave@gmail.com';

const RECEIPT_OBJECTS = ['2026-08-01-aaa.jpg', '2026-08-02-bbb.png'];

// A transport that answers everything the way a healthy Supabase would, and
// records what it was asked for. `overrides` lets one call be made to fail.
function makeFetch(overrides = {}) {
  const calls = [];
  let listCalls = 0;
  const stub = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const body = init.body ? String(init.body) : null;
    calls.push({ url: String(url), method, body });
    const u = String(url);

    if (overrides.fail && overrides.fail(u, method)) {
      return new Response('{"message":"boom"}', { status: 500 });
    }
    if (overrides.missingTable && overrides.missingTable(u, method)) {
      return new Response('{"code":"PGRST205","message":"Could not find the table"}', { status: 404 });
    }
    // The storage listing: one page of objects, then empty, so the loop ends.
    if (u.includes('/storage/v1/object/list/')) {
      listCalls += 1;
      const page = listCalls === 1 ? RECEIPT_OBJECTS.map((name) => ({ name })) : [];
      return new Response(JSON.stringify(page), { status: 200 });
    }
    if (u.includes('/storage/v1/object/')) return new Response('{}', { status: 200 });
    if (u.includes('/auth/v1/admin/users/')) return new Response('{}', { status: 200 });
    if (method === 'DELETE') return new Response(null, { status: 204 });
    // getPhoneForUser, then the profile row, then every manifest read.
    if (u.includes('select=phone_number')) {
      return new Response(JSON.stringify([{ phone_number: PHONE }]), { status: 200 });
    }
    if (u.includes('/rest/v1/users?id=eq.')) {
      return new Response(JSON.stringify([{ id: USER_ID, phone_number: PHONE }]), { status: 200 });
    }
    return new Response('[]', { status: 200 });
  };
  return { stub, calls };
}

const realFetch = globalThis.fetch;
async function withFetch(overrides, run) {
  const { stub, calls } = makeFetch(overrides);
  globalThis.fetch = stub;
  try {
    const result = await run();
    return { result, calls };
  } finally {
    globalThis.fetch = realFetch;
  }
}

const MANIFEST = SB.USER_DATA_TABLES;

console.log('\nOne manifest, walked by both doors.\n');

ok('lib/supabase.ts exports USER_DATA_TABLES', Array.isArray(MANIFEST) && MANIFEST.length > 0);
ok('every manifest entry names a table, a key column and a key kind',
  MANIFEST.every((t) => typeof t.table === 'string' && t.table
    && typeof t.userKey === 'string' && t.userKey
    && ['user_id', 'email', 'email_norm', 'phone'].includes(t.keyKind)
    && typeof t.select === 'string' && t.select));
ok('no table is listed twice (one row per table, so the export cannot name a key twice)',
  new Set(MANIFEST.map((t) => t.table)).size === MANIFEST.length);

// The root cause. If either function ever grows its own list again, this fails
// before the behaviour drifts far enough for anybody to be harmed by it.
{
  const del = supabaseSrc.slice(supabaseSrc.indexOf('export async function deleteUserData'));
  const exp = supabaseSrc.slice(
    supabaseSrc.indexOf('export async function exportUserData'),
    supabaseSrc.indexOf('async function deleteReceiptImages'),
  );
  ok('deleteUserData reads USER_DATA_TABLES rather than a list of its own', del.includes('USER_DATA_TABLES'));
  ok('exportUserData reads USER_DATA_TABLES rather than a list of its own', exp.includes('USER_DATA_TABLES'));
}

// ═══════════════════════════════════════════════════════════════════════════
// THE TABLES THAT WERE MISSED, NAMED. A regression that quietly drops one of
// these is the original defect coming back, so each is asserted by name rather
// than left to the manifest to vouch for itself.
// ═══════════════════════════════════════════════════════════════════════════
const MUST_BE_HELD = [
  // The erasure used to walk past these four.
  'allowance_elections', 'announcement_dismissals', 'signup_codes', 'wa_out',
  // The export used to hold none of these.
  'messages', 'conversations', 'goals', 'diary_jobs', 'properties', 'circumstances',
  'vat_profiles', 'book_shares', 'hmrc_approvals', 'hmrc_connections', 'bank_connections',
  'user_rules', 'onboarding_progress', 'agent_signals', 'wa_links',
  // The learning pool, ownerless until 6 August 2026: rows now carry the asker
  // whose answer text is stored, so both doors must walk it. See
  // test/qacandidates.test.mjs for the write path itself.
  'qa_candidates',
  // And what was already right, which must stay right.
  'transactions', 'invoices', 'events', 'reminder_prefs', 'signups',
];
console.log('');
for (const t of MUST_BE_HELD) {
  ok(`${t} is in the manifest`, MANIFEST.some((e) => e.table === t));
}

// ═══════════════════════════════════════════════════════════════════════════
// AND NOW THE PART A SOURCE SCAN CANNOT DO: run both doors and read the wire.
// ═══════════════════════════════════════════════════════════════════════════
const { result: exported, calls: exportCalls } = await withFetch({}, () => SB.exportUserData(USER_ID, EMAIL));
const { result: erased, calls: deleteCalls } = await withFetch({}, () => SB.deleteUserData(USER_ID, EMAIL));

const deletes = deleteCalls.filter((c) => c.method === 'DELETE' && c.url.includes('/rest/v1/'));
const reads = exportCalls.filter((c) => c.method === 'GET' && c.url.includes('/rest/v1/'));
const valueFor = { user_id: USER_ID, email: EMAIL, email_norm: EMAIL_NORM, phone: PHONE };

console.log('\nEvery manifest table is read by the export and deleted by the erasure.\n');
for (const t of MANIFEST) {
  const filter = `/rest/v1/${t.table}?${t.userKey}=eq.${encodeURIComponent(valueFor[t.keyKind])}`;
  ok(`${t.table}: the erasure deletes it, filtered on ${t.userKey}`,
    deletes.some((c) => c.url.includes(filter)));
  ok(`${t.table}: the export reads it, filtered on ${t.userKey}`,
    reads.some((c) => c.url.includes(filter)));
  ok(`${t.table}: the export file has a key for it`,
    Object.prototype.hasOwnProperty.call(exported, t.table) && Array.isArray(exported[t.table]));
}

// The symmetry, stated as a property rather than a list, so a table added to one
// door by hand tomorrow is caught even though nobody thought to name it here.
console.log('\nNothing is deleted that is not also handed back, and the other way round.\n');
{
  const deletedTables = new Set(
    deletes.map((c) => c.url.split('/rest/v1/')[1].split('?')[0]),
  );
  // `users` is the profile row itself: exported under the singular key `user`.
  const missingFromExport = [...deletedTables].filter(
    (t) => t !== 'users' && !Object.prototype.hasOwnProperty.call(exported, t),
  );
  missingFromExport.forEach((t) => console.log(`        deleted but never exported: ${t}`));
  ok('every table the erasure deletes is also in the export', missingFromExport.length === 0);
  ok('the profile row itself is exported, under `user`', Object.prototype.hasOwnProperty.call(exported, 'user'));

  // ⚠️ receipt_images IS EXPORTED AND IS NOT A TABLE, so it cannot appear in deletedTables. It is
  // the storage bucket, handed back as signed links rather than as rows, and it is erased by
  // deleteReceiptImages against /storage/v1/object/receipts.
  //
  // 🔴 THE EXEMPTION IS EARNED PER RUN, NOT ASSERTED ONCE. A bare `k !== 'receipt_images'` in this
  // filter would be a permanent hole exactly where the property matters most: his photographs are
  // the one thing here that no foreign key cascades to, so the export handing them back while the
  // erasure quietly stopped deleting them is the shape of the original defect this suite exists
  // for. So the key is only forgiven if THIS RUN actually issued the bucket delete.
  const bucketWiped = deletes.some((c) => c.url.endsWith('/storage/v1/object/receipts'))
    || deleteCalls.some((c) => c.method === 'DELETE' && c.url.endsWith('/storage/v1/object/receipts'));
  ok('🔴 THE EXPORT HANDS BACK RECEIPT IMAGES AND THE ERASURE EMPTIES THE BUCKET IN THE SAME RUN',
    !Object.prototype.hasOwnProperty.call(exported, 'receipt_images') || bucketWiped);

  const exportedTables = Object.keys(exported).filter(
    (k) => k !== 'exported_at' && k !== 'user' && k !== 'receipt_images_note'
      && !(k === 'receipt_images' && bucketWiped)
      && Array.isArray(exported[k]),
  );
  const missingFromDelete = exportedTables.filter((t) => !deletedTables.has(t));
  missingFromDelete.forEach((t) => console.log(`        exported but never deleted: ${t}`));
  ok('every table the export hands back is also erased', missingFromDelete.length === 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// HIS PHOTOGRAPHS. Not rows, so nothing cascades to them, and deleting the
// transaction deletes the only pointer to the image and strands it forever.
// ═══════════════════════════════════════════════════════════════════════════
console.log('\nThe receipt images in the storage bucket.\n');
{
  const listed = deleteCalls.filter((c) => c.url.includes('/storage/v1/object/list/receipts'));
  ok('the erasure lists the receipts bucket', listed.length > 0);
  ok('it lists under his own folder and nobody else\'s',
    listed.every((c) => (c.body ?? '').includes(`"prefix":"${USER_ID}/"`)));

  const wiped = deleteCalls.filter(
    (c) => c.method === 'DELETE' && c.url.endsWith('/storage/v1/object/receipts'),
  );
  ok('the erasure deletes the objects it found', wiped.length > 0);
  ok('every object it deletes is inside his folder',
    wiped.length > 0 && wiped.every((c) => {
      const prefixes = JSON.parse(c.body ?? '{}').prefixes ?? [];
      return prefixes.length > 0 && prefixes.every((p) => p.startsWith(`${USER_ID}/`));
    }));
  ok('both of his receipts are named in the delete',
    wiped.some((c) => RECEIPT_OBJECTS.every((n) => (c.body ?? '').includes(n))));
  ok('it keeps listing until the folder answers empty',
    deleteCalls.filter((c) => c.url.includes('/storage/v1/object/list/receipts')).length >= 2);
}

// ═══════════════════════════════════════════════════════════════════════════
// WHAT THE EXPORT MUST NEVER HAND BACK. A bank or HMRC token is not data about
// him, it is a key to somebody else's building, and the export file ends up in a
// downloads folder, an email, a WhatsApp. The HMAC of a login code is the same.
// ═══════════════════════════════════════════════════════════════════════════
console.log('\nSecrets stay behind.\n');
const SECRET_COLUMNS = [
  'access_token', 'refresh_token', 'access_token_enc', 'refresh_token_enc',
  'token_expires_at', 'code_hash',
];
{
  for (const col of SECRET_COLUMNS) {
    ok(`no manifest select asks for ${col}`,
      MANIFEST.every((t) => !t.select.split(',').map((c) => c.trim()).includes(col)));
    ok(`no export read asks the database for ${col}`,
      reads.every((c) => {
        const select = decodeURIComponent((c.url.split('select=')[1] ?? '').split('&')[0]);
        return !select.split(',').map((s) => s.trim()).includes(col);
      }));
  }
  for (const t of ['bank_connections', 'hmrc_connections', 'signup_codes', 'wa_links']) {
    const entry = MANIFEST.find((e) => e.table === t);
    ok(`${t} is exported by a named column list, never select=*`, !!entry && entry.select !== '*');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// THE KEYS THAT ARE NOT THE USER ID. These tables cascade from nothing, so the
// filter is the only thing standing between his address or his number and a row
// that outlives the account.
// ═══════════════════════════════════════════════════════════════════════════
console.log('\nThe rows keyed by his address and his number.\n');
{
  const codes = deletes.filter((c) => c.url.includes('/rest/v1/signup_codes?'));
  ok('signup_codes is erased on the NORMALISED address the table is keyed on',
    codes.length > 0 && codes.every((c) => c.url.includes(`email_norm=eq.${encodeURIComponent(EMAIL_NORM)}`)));
  ok('signup_codes is not erased on the raw address, which would leave the row standing',
    codes.every((c) => !c.url.includes(encodeURIComponent(EMAIL))));

  ok('wa_out is erased by phone, since its user_id is set null rather than deleted',
    deletes.some((c) => c.url.includes(`/rest/v1/wa_out?phone=eq.${encodeURIComponent(PHONE)}`)));
  ok('wa_sessions is still erased by phone',
    deletes.some((c) => c.url.includes(`/rest/v1/wa_sessions?phone=eq.${encodeURIComponent(PHONE)}`)));

  ok('the auth identity is removed last', deleteCalls.at(-1).url.includes('/auth/v1/admin/users/'));
  ok('a healthy erasure answers ok', erased === true);
}

// A man with no address on file must not produce a filter with nothing after the
// `eq.`, which is an unbounded delete against everybody's rows.
console.log('\nA missing identity skips its rows, it does not widen the filter.\n');
{
  const { calls } = await withFetch({}, () => SB.deleteUserData(USER_ID, null));
  const emailish = calls.filter((c) => /email(_norm)?=eq\.(&|$)/.test(c.url));
  ok('no delete is issued with an empty address filter', emailish.length === 0);
  ok('no delete names signup_codes when there is no address on file',
    !calls.some((c) => c.url.includes('/rest/v1/signup_codes?')));
}

console.log('\nAn erasure that did not finish must not answer ok.\n');
{
  const { result } = await withFetch(
    { fail: (u, m) => m === 'DELETE' && u.includes('/rest/v1/messages?') },
    () => SB.deleteUserData(USER_ID, EMAIL),
  );
  ok('a failed table delete makes the whole erasure report failure', result === false);
}
{
  const { result } = await withFetch(
    { fail: (u) => u.includes('/storage/v1/object/list/receipts') },
    () => SB.deleteUserData(USER_ID, EMAIL),
  );
  ok('a bucket we could not read makes the whole erasure report failure', result === false);
}
{
  const { result } = await withFetch(
    { fail: (u, m) => m === 'DELETE' && u.endsWith('/storage/v1/object/receipts') },
    () => SB.deleteUserData(USER_ID, EMAIL),
  );
  ok('a failed image delete makes the whole erasure report failure', result === false);
}
{
  // The one forgiven answer. Several of these tables arrive by an APPLY_*.sql
  // pasted in by hand, and a table that is not there holds no rows for anybody.
  const { result } = await withFetch(
    { missingTable: (u, m) => m === 'DELETE' && u.includes('/rest/v1/wa_out?') },
    () => SB.deleteUserData(USER_ID, EMAIL),
  );
  ok('a table PostgREST cannot find is not counted as a failed erasure', result === true);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE INVARIANT THE ERASURE RESTS ON, AND THE COMMIT THAT WOULD BREAK IT.
//
// Two tables in the manifest are keyed by the customer's PHONE rather than his user id:
// support_tickets.phone, and ai_usage.key, WHICH HOLDS HIS NUMBER IN PLAIN TEXT. deleteUserData
// reads the number off his users row first and skips a table whose key is empty, which is right
// for a man with no address on file, and right for the number too, TODAY AND ONLY TODAY, because
// a phone number once set on users is never unset anywhere in the product. The bank has
// /api/bank/disconnect. The phone has no equivalent.
//
// ⚠️ THE DAY SOMEBODY ADDS ONE, THIS BECOMES A LIVE GDPR HOLE WITH NO SYMPTOM. The erasure would
// skip both tables in silence, answer ok, and leave his number sitting in ai_usage.key. Nothing
// throws. Nothing looks wrong. The only person who could notice is the customer, who cannot see
// the table.
//
// So this guard does not test behaviour, it tests that the WORLD the behaviour assumes still
// holds: it walks the server tree and goes red on any code writing a null phone_number onto users.
// It fires on the commit that breaks the invariant rather than on the complaint six months later.
//
// ⚠️ SCOPED TO THE users TABLE ON PURPOSE. A null phone_number written to any other table is not
// this defect, and a guard that shouts about things that are fine is a guard somebody switches off.
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\nThe phone a man can never unset, which two of these deletes are keyed by.\n');
{
  const files = [];
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(ts|tsx|mjs)$/.test(e.name)) files.push(full);
    }
  };
  for (const r of ['lib', 'app', 'scripts']) walk(path.join(repoRoot, r));

  ok('🔴 THE SWEEP FOUND FILES, without which every assertion below is vacuous',
    files.length > 50);

  // A write of a null number, in the shapes a tree of raw fetch calls actually produces:
  //   phone_number: null        an object literal in a PATCH or POST body
  //   phone_number: undefined   the same thing once JSON.stringify has dropped it
  //   phone_number: ''          the empty string, which `if (!value) continue` treats alike
  //   "phone_number": null      a hand written JSON body
  //
  // ⚠️ THE LOOKBEHIND IS THE WHOLE OF THE CORRECTNESS. Without `(?<![.\w])` this matches
  //     const phone = Array.isArray(urows) ? urows[0]?.phone_number : null;
  // which is a TERNARY reading the number, not a write of a null one, and lib/supabase.ts has one.
  // The first version of this guard reported that line and would have been switched off within a
  // week. Third detector today to ship a false positive; see test/readsweep.test.mjs for the other
  // two. A property access is never a property definition, so anything preceded by a dot or a word
  // character is not this.
  const NULLING = /(?<![.\w])(["']?)phone_number\1\s*:\s*(null|undefined|''|""|``)/;

  const offenders = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    if (!NULLING.test(src)) continue;
    // Only a write that lands on the users table is this defect, and in this tree the URL and the
    // body sit in the same function, so the same file naming both is the signal.
    if (/\/rest\/v1\/users\b/.test(src) || /from\(\s*['"]users['"]\s*\)/.test(src)) {
      // ═══════════════════════════════════════════════════════════════════════════════════════
      // 🔴 THE ONE ALLOWED UNSET, AND THE COMMIT THIS GUARD WAS WRITTEN TO FIRE ON. 12 August 2026.
      //
      // The warning this guard protects said: "THE DAY SOMEBODY ADDS A PHONE DISCONNECT, THIS
      // BECOMES A LIVE GDPR HOLE." That day is today. RUN 1 found a number bound to an account with
      // no unbind anywhere in the product, which took a real handset out of Lekhio permanently.
      //
      // disconnectPhone() is that door, and it closes the hole rather than opening it: it deletes
      // every phone keyed row FIRST, while users.phone_number still holds the key those rows are
      // found by, and refuses to unset the number at all if any of those deletes failed. Read its
      // header before touching this.
      //
      // ⚠️ SO THE INVARIANT NARROWS, IT DOES NOT LAPSE. What is held now is "no OTHER code unsets a
      // number", which is what was actually meant all along. A second function doing this, or this
      // function losing its ordering, still turns this red.
      const src2 = src;
      const allowed = /export async function disconnectPhone/.test(src2)
        // The clear MUST come before the unset, and both must be in the function that is allowed.
        && src2.indexOf("keyKind !== 'phone'") < src2.indexOf('phone_number: null')
        && /if \(!allOk\) return false;[\s\S]{0,900}?phone_number: null/.test(src2);
      if (!allowed) offenders.push(path.relative(repoRoot, f));
    }
  }
  ok(`🔴 NOTHING WRITES A NULL phone_number ONTO users${offenders.length ? ` (found: ${offenders.join(', ')})` : ''}`,
    offenders.length === 0);

  // ⚠️ AND THE DETECTOR IS PROVED AGAINST STRINGS IT MUST CATCH AND ONE IT MUST NOT.
  // A regex that matches nothing passes this file for ever, and would pass the real tree too.
  // Written after the readsweep detector shipped two rounds of false positives: a guard that
  // cannot see itself is not a guard.
  ok('the detector matches every shape it exists to catch',
    NULLING.test('body: JSON.stringify({ phone_number: null })')
    && NULLING.test('{ "phone_number": null }')
    && NULLING.test("{ phone_number: '' }")
    && NULLING.test('{ phone_number: undefined }'));
  ok('🔴 AND IT REJECTS THE TWO SHAPES THAT ARE NOT A WRITE, one of which is live in the tree',
    !NULLING.test('{ phone_number: e164 }')
    && !NULLING.test('const phone = Array.isArray(urows) ? urows[0]?.phone_number : null;')
    && !NULLING.test('as Array<{ id: string; phone_number: string | null }>'));

  // The landmine comment is the other half of this. A reader who deletes the note and keeps the
  // `continue` has removed the only warning standing at the site itself.
  const sb = readFileSync(path.join(repoRoot, 'lib/supabase.ts'), 'utf8');
  ok('🔴 THE NOTE AT THE SKIP STILL SAYS WHY THE SKIP IS SAFE',
    /never unset/.test(sb) && /ai_usage/.test(sb));
  ok('and it names this file, so the guard can be found from the code it guards',
    /test\/datarights\.test\.mjs/.test(sb));
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

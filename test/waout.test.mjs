// Tests for the wa_out outbound send counter: recordWaOut in lib/supabase.ts and the fire and
// forget hook in lib/whatsapp.ts graphSend.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS SUITE DEFENDS.
//
// Outbound WhatsApp sends used to be recorded nowhere per customer, so the margin view on /team
// MODELLED one reply per inbound instead of OBSERVING reality. The counter fixes that, and this
// suite pins the two properties that make it safe to have:
//
//   1. 🔴 RECORDING CAN NEVER HURT A SEND. The founder pastes SQL by hand, so until
//      supabase/APPLY_2026-07-31_wa_out.sql is run the table does not exist. A missing table, a
//      dead network, a thrown fetch, or no Supabase configuration at all must leave the send
//      exactly as it was: delivered, true, and inside Meta's 5 second webhook budget.
//
//   2. 🔴 NO CONTENT EVER REACHES THE COUNTER. The row is a kind, a customer key and a
//      timestamp. Never the body, never a template variable. Checked at runtime against what
//      the recorder actually posts, and statically against the one call site.
//
// Run: node test/waout.test.mjs   (Node 22.18+, type stripping). No network, fetch is mocked.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const lib = path.join(repo, 'lib');

// whatsapp.ts imports supabase.ts, which imports half of lib/, and bare Node under type
// stripping cannot resolve an extensionless relative import. So the whole of lib/ is staged
// with imports rewritten to .ts, the same trick as test/margin.test.mjs. Twice, because env is
// read at module load: stage A imports with NO Supabase configuration, stage B with it.
const fix = (s) => s.replace(/from '(\.\/[a-zA-Z0-9._-]+)'/g, "from '$1.ts'");
const stageDir = (label) => {
  const stage = mkdtempSync(path.join(tmpdir(), `waout-${label}-`));
  for (const f of readdirSync(lib)) {
    if (f.endsWith('.ts')) writeFileSync(path.join(stage, f), fix(readFileSync(path.join(lib, f), 'utf8')));
  }
  return stage;
};
const load = (stage, f) => import(pathToFileURL(path.join(stage, f)).href);

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

// The send path needs a token; the graph mock below accepts everything sent with it.
process.env.WHATSAPP_TOKEN = 'test-token';
process.env.WHATSAPP_PHONE_NUMBER_ID = '12345';
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── the fetch mock ───────────────────────────────────────────────────────────────────────────
// Dispatches on URL: the Graph API always accepts, Supabase behaves per `dbMode`. Every call is
// recorded so the suite can inspect exactly what the recorder posted.
const calls = [];
let dbMode = 'ok'; // 'ok' | 'missing_table' | 'down' | 'throw'
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  calls.push({ url: u, body: init.body ? String(init.body) : '' });
  if (u.includes('graph.facebook.com')) return new Response(JSON.stringify({ messages: [] }), { status: 200 });
  if (dbMode === 'throw') throw new TypeError('fetch failed');
  if (dbMode === 'down') return new Response('supabase is having a minute', { status: 500 });
  if (dbMode === 'missing_table') {
    return new Response(JSON.stringify({ code: '42P01', message: 'relation "public.wa_out" does not exist' }), { status: 404 });
  }
  return new Response(null, { status: 201 });
};
const settle = () => new Promise((r) => setTimeout(r, 20)); // let the unawaited insert land
const waOutCalls = () => calls.filter((c) => c.url.includes('/rest/v1/wa_out'));
const graphCalls = () => calls.filter((c) => c.url.includes('graph.facebook.com'));

// ── stage A: no Supabase configuration at all ────────────────────────────────────────────────
const A = stageDir('noconf');
const WA_A = await load(A, 'whatsapp.ts');
const SB_A = await load(A, 'supabase.ts');

console.log('\n1. 🔴 NO DATABASE CONFIGURED: RECORDING IS SKIPPED AND THE SEND IS UNTOUCHED');
{
  calls.length = 0;
  let threw = false;
  try {
    await SB_A.recordWaOut('freeform', '447700900123');
  } catch { threw = true; }
  ok('recordWaOut with no configuration resolves without throwing', threw === false);
  ok('and it never even attempts a request', calls.length === 0);

  calls.length = 0;
  let sent = false;
  try {
    sent = await WA_A.sendTextResult('447700900123', 'You logged a receipt.');
  } catch { threw = true; }
  await settle();
  ok('the send still goes to Meta and reports true', threw === false && sent === true);
  ok('no half configured insert was attempted', waOutCalls().length === 0);
}

// ── stage B: Supabase configured, behaviour per dbMode ───────────────────────────────────────
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
const B = stageDir('conf');
const WA = await load(B, 'whatsapp.ts');
const SB = await load(B, 'supabase.ts');

console.log('\n2. 🔴 A MISSING TABLE CANNOT BREAK A SEND (the founder has not pasted the SQL yet)');
{
  dbMode = 'missing_table';
  calls.length = 0;
  const sent = await WA.sendTextResult('447700900123', 'Logged. It is in your Lekhio.');
  await settle();
  ok('the send is delivered and reports true', sent === true);
  ok('the recorder did try (the hook is live)', waOutCalls().length === 1);
  ok('exactly one graph call, no retry storm from the failed insert', graphCalls().length === 1);
}

console.log('\n3. THE RECORDER NEVER THROWS, WHATEVER FETCH DOES');
{
  for (const mode of ['throw', 'down', 'ok']) {
    dbMode = mode;
    let threw = false;
    try {
      await SB.recordWaOut('template', '447700900123');
    } catch { threw = true; }
    ok(`recordWaOut survives dbMode "${mode}"`, threw === false);
  }

  dbMode = 'throw';
  calls.length = 0;
  let threw = false;
  let sent = false;
  try {
    sent = await WA.sendTextResult('447700900123', 'Morning. Two receipts logged.');
  } catch { threw = true; }
  await settle();
  ok('🔴 A FETCH THAT THROWS UNDER THE RECORDER STILL CANNOT TOUCH THE SEND', threw === false && sent === true);
}

console.log('\n4. WHAT IS RECORDED: THE KIND AND THE KEY, NEVER THE CONTENT');
{
  dbMode = 'ok';
  calls.length = 0;
  const SECRET = 'He owes HMRC four thousand pounds';
  await WA.sendText('447700900123', SECRET);
  await settle();
  const rows = waOutCalls();
  ok('a freeform text records one row', rows.length === 1);
  const posted = rows[0] ? JSON.parse(rows[0].body) : {};
  ok('the kind is freeform', posted.kind === 'freeform');
  ok('the key follows the per customer counter discipline (the phone)', posted.phone === '447700900123');
  ok('🔴 THE BODY IS NOT IN THE ROW', !rows[0].body.includes(SECRET));
  ok('the row is exactly kind, phone and user id, nothing else',
     Object.keys(posted).sort().join(',') === 'kind,phone,user_id');

  calls.length = 0;
  await WA.sendTemplate('447700900123', 'lekhio_reminder', 'en', ['Friday', SECRET]);
  await settle();
  const trows = waOutCalls();
  ok('a template send records one row', trows.length === 1);
  ok('and its kind is template (the paid ones)', trows.length === 1 && JSON.parse(trows[0].body).kind === 'template');
  ok('🔴 TEMPLATE VARIABLES NEVER REACH THE COUNTER', trows.every((r) => !r.body.includes(SECRET)));

  calls.length = 0;
  await WA.sendButtons('447700900123', SECRET, [{ id: 'yes', title: 'Approve' }]);
  await settle();
  const brows = waOutCalls();
  ok('a buttons send counts as freeform', brows.length === 1 && JSON.parse(brows[0].body).kind === 'freeform');
  ok('and carries no button or body text', brows.every((r) => !r.body.includes(SECRET) && !r.body.includes('Approve')));
}

console.log('\n5. A FAILED SEND IS NOT COUNTED (Meta did not bill it)');
{
  dbMode = 'ok';
  const failFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, body: init.body ? String(init.body) : '' });
    if (u.includes('graph.facebook.com')) return new Response('{}', { status: 400 }); // hard reject, no retry
    return new Response(null, { status: 201 });
  };
  calls.length = 0;
  const sent = await WA.sendTextResult('447700900123', 'This one Meta refuses.');
  await settle();
  ok('the send honestly reports false', sent === false);
  ok('and no wa_out row was written for it', waOutCalls().length === 0);
  globalThis.fetch = failFetch;
}

console.log('\n6. THE MONTH READER REFUSES HONESTLY AND NEVER LEAKS A PHONE');
{
  dbMode = 'down';
  ok('an unreadable table reads as null (fall back to the model), never a confident zero',
     (await SB.readWaOutMonth('2026-07')) === null);
  ok('a malformed month is refused the same way', (await SB.readWaOutMonth('2026-7')) === null);

  const monthFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, body: init.body ? String(init.body) : '' });
    if (u.includes('/rest/v1/wa_out')) {
      return new Response(JSON.stringify([
        { user_id: null, phone: '447700900123', kind: 'freeform' },
        { user_id: null, phone: '447700900123', kind: 'template' },
        { user_id: 'u-2', phone: null, kind: 'freeform' },
        { user_id: null, phone: '447999999999', kind: 'freeform' },
      ]), { status: 200 });
    }
    if (u.includes('/rest/v1/users')) {
      return new Response(JSON.stringify([{ id: 'u-1', phone_number: '447700900123' }]), { status: 200 });
    }
    return new Response(null, { status: 201 });
  };
  const month = await SB.readWaOutMonth('2026-07');
  ok('the month reads', month !== null && month.total === 4);
  ok('a phone joins to its user id and the phone itself never leaves',
     month.byUser['u-1']?.freeform === 1 && month.byUser['u-1']?.template === 1 &&
     !JSON.stringify(month).includes('447700900123'));
  ok('a direct user id row counts under that user', month.byUser['u-2']?.freeform === 1);
  ok('a stranger pools into the unmatched bucket, the same one /team already shows',
     month.byUser['unmatched']?.freeform === 1);
  globalThis.fetch = monthFetch;
  ok('an empty table reads as zero rows, which the margin side treats as "keep modelling"',
     (dbMode = 'ok', (await (async () => {
       const emptyFetch = globalThis.fetch;
       globalThis.fetch = async (url) => String(url).includes('/rest/v1/')
         ? new Response('[]', { status: 200 })
         : new Response(null, { status: 201 });
       const m = await SB.readWaOutMonth('2026-07');
       globalThis.fetch = emptyFetch;
       return m;
     })())?.total === 0));
}

console.log('\n7. THE CALL SITE, STATICALLY: ONE DOOR, NO CONTENT, NEVER AWAITED ON THE SEND PATH');
{
  // Comments stripped before scanning, the same discipline as test/watemplates.test.mjs: an
  // explanation of the rule must not be read as a breach of it.
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const waSrc = strip(readFileSync(path.join(lib, 'whatsapp.ts'), 'utf8'));

  const sites = [...waSrc.matchAll(/recordWaOut\s*\(/g)];
  ok('exactly one call site, inside graphSend, the door every send passes through', sites.length === 1);
  ok('the call is fire and forget (void), never awaited on the send path',
     /void recordWaOut\s*\(/.test(waSrc) && !/await recordWaOut/.test(waSrc));

  const callText = waSrc.slice(waSrc.indexOf('void recordWaOut'), waSrc.indexOf(');', waSrc.indexOf('void recordWaOut')));
  ok('🔴 THE CALL PASSES THE KIND AND THE RECIPIENT KEY, NOTHING CONTENT SHAPED',
     callText.includes("payload.type === 'template'") &&
     callText.includes('payload.to') &&
     !/\b(body|text|template\.|components|parameters|interactive)\b/.test(callText));

  // The recorder's own POST, in lib/supabase.ts: the JSON it builds carries exactly the three
  // counter fields, so content cannot be smuggled in from that side either.
  const sbSrc = strip(readFileSync(path.join(lib, 'supabase.ts'), 'utf8'));
  const rec = sbSrc.slice(sbSrc.indexOf('export async function recordWaOut'));
  const post = rec.slice(0, rec.indexOf('\n}'));
  ok('the recorder posts kind, phone and user_id and nothing else',
     /JSON\.stringify\(\{ kind, phone, user_id: userId \}\)/.test(post));
  ok('and it carries its own timeout so a hung insert cannot pin anything',
     /AbortSignal\.timeout\(/.test(post));
}

globalThis.fetch = realFetch;

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

// THE REDACTION CORPUS SUITE. Run: node test/redactcorpus.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS GUARDS
//
// redactPii (lib/supabase.ts) is the only thing standing between a man's typed question and a
// shared pool that staff read and that dedupes across users. Until 9 August 2026 it was four
// regexes: email, postcode, pound amount, and any run of seven or more digits. That let every
// national insurance number, every sort code, both IBANs, every spaced or hyphenated phone
// number and every normally grouped card number walk straight through. Thirty one of forty
// three synthetic leak strings survived it.
//
// ⚠️ THIS IS NOT A SOURCE SCAN, AND THE REASON IS IN THE REPO ALREADY.
// test/qacandidates.test.mjs made the argument first: "a source scan alone would pass on a
// redaction that is never applied". So every corpus string goes through the REAL
// logQaCandidate and the REAL upsertQaCache against a stubbed transport, and this suite reads
// what actually went on the wire. If the redaction stops being applied at a call site, or a
// call site stops calling it, this goes red for the right reason.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE LISTS ARE HELD BY EQUALITY, NOT BY COUNT AND NOT BY SUBSET
//
// A count goes green when one gap closes and another opens. A subset check lets a fixed gap sit
// on the list for ever, quietly claiming to be broken. Equality means the list has to be true.
// There are three:
//
//   LIVE_LEAKS            must be EMPTY. Any leak at all is a failure with a name.
//   LIVE_FALSE_POSITIVES  exactly ['vat-bare'], the one ordinary number the seven digit rule
//                         already destroyed before this work started. Inherited, named, not
//                         fixed, and it cannot grow without turning this red.
//   the fossil's score    exactly the thirty one it leaked on 8 August 2026, so the corpus can
//                         never quietly lose its teeth. See test/fixtures/redactbaseline.mjs.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// EXISTENCE BEFORE POSITION
//
// Every claim about a row's fate is preceded by a claim that the row exists, that its secret
// really is inside its own text, and that the harness actually reached the live function on all
// three call sites. A suite that measures nothing reports a clean sheet, and a clean sheet it
// did not earn is worse than a red one.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { MUST_REDACT, MUST_KEEP, CONTROL } from './fixtures/redactcorpus.mjs';
import { redactPiiBeforeWidening, LEAKED_BEFORE_WIDENING, ATE_BEFORE_WIDENING } from './fixtures/redactbaseline.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const libDir = path.join(repoRoot, 'lib');

// The module reads its url and service key at import time, so they go in first.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

// Stage lib/ so the real module graph imports under node's type stripping. Same approach as
// test/qacandidates.test.mjs, for the same reason: we want the shipped code, not a copy of it.
const stage = mkdtempSync(path.join(tmpdir(), 'redactcorpus-'));
const fix = (s) =>
  s.replace(/from '(\.\/[a-zA-Z0-9_.-]+)'/g, (m, p) => (p.endsWith('.ts') ? m : `from '${p}.ts'`));
for (const f of readdirSync(libDir)) {
  if (f.endsWith('.ts')) writeFileSync(path.join(stage, f), fix(readFileSync(path.join(libDir, f), 'utf8')));
}
const SB = await import(pathToFileURL(path.join(stage, 'supabase.ts')).href);

let pass = 0;
let fail = 0;
function ok(desc, cond) {
  if (cond) { pass++; process.stdout.write(`  PASS  ${desc}\n`); }
  else { fail++; process.stdout.write(`  FAIL  ${desc}\n`); }
}

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

// A transport that answers ok and records every request.
const realFetch = globalThis.fetch;
async function capture(run) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', body: init.body ? String(init.body) : null });
    return new Response('{}', { status: 200 });
  };
  try {
    await run();
  } finally {
    globalThis.fetch = realFetch;
  }
  return calls;
}

// Push a string through the LIVE redactor by its real call path and read what went on the wire.
// Returns null when nothing was written, which is a failure worth seeing rather than a silent
// zero.
async function liveViaQuestion(text) {
  const calls = await capture(() => SB.logQaCandidate(USER_ID, text, 'placeholder answer', [], false));
  const rpc = calls.find((c) => c.url.includes('/rest/v1/rpc/log_qa_candidate'));
  if (rpc) return JSON.parse(rpc.body).p_question ?? null;
  const ins = calls.find((c) => c.url.includes('/rest/v1/qa_candidates'));
  if (ins) return JSON.parse(ins.body).question ?? null;
  return null;
}

async function liveViaAnswer(text) {
  const calls = await capture(() => SB.logQaCandidate(USER_ID, 'a general question about tax rates', text, [], false));
  const rpc = calls.find((c) => c.url.includes('/rest/v1/rpc/log_qa_candidate'));
  if (rpc) return JSON.parse(rpc.body).p_answer ?? null;
  const ins = calls.find((c) => c.url.includes('/rest/v1/qa_candidates'));
  if (ins) return JSON.parse(ins.body).answer ?? null;
  return null;
}

async function liveViaCacheSample(text) {
  const calls = await capture(() => SB.upsertQaCache('a general question about tax rates', text, 'answer', []));
  const put = calls.find((c) => c.url.includes('/rest/v1/qa_cache'));
  return put ? (JSON.parse(put.body).question_sample ?? null) : null;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE MISS DETECTOR. Three tests, and the honest note about why there are three.
//
//   1. verbatim         the secret still there exactly as written
//   2. separators only  the secret still there once punctuation and spaces are stripped
//   3. digit run        any run of three or more digits from the secret still there
//
// Any one of the three means it survived.
//
// ⚠️ NOT ONE ROW IN THIS CORPUS NEEDS 2 OR 3 TODAY. Every leak the old function had was caught
// by the verbatim check, and I am saying so rather than implying the extra two are earning
// their keep right now. They are here for the failure a verbatim check cannot see: a PARTIAL
// redaction. A future widening that eats half an identifier and leaves the account digits
// standing removes the exact string and passes check 1 while the money is still on the page.
// That is the shape of mistake this suite exists to stop, so the detector is built for it now
// rather than after it happens.
const compact = (s) => s.replace(/[^0-9a-z]/gi, '').toLowerCase();
function survivalReasons(secret, out) {
  const reasons = [];
  if (out.includes(secret)) reasons.push('verbatim');
  const cs = compact(secret);
  if (cs.length >= 4 && compact(out).includes(cs)) reasons.push('separators only');
  for (const run of secret.match(/\d{3,}/g) || []) {
    if (out.includes(run)) reasons.push(`digit run ${run}`);
  }
  return reasons;
}

const sorted = (xs) => [...xs].sort();
const same = (a, b) => sorted(a).length === sorted(b).length && sorted(a).every((v, i) => sorted(b)[i] === v);

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== the corpus exists and is well formed, before anything is claimed about it ===\n');

ok('the must redact half is a non empty list', Array.isArray(MUST_REDACT) && MUST_REDACT.length > 0);
ok('the must keep half is a non empty list', Array.isArray(MUST_KEEP) && MUST_KEEP.length > 0);
ok('the must keep half is not a token gesture beside the must redact half',
  MUST_KEEP.length >= Math.floor(MUST_REDACT.length * 0.6));
{
  const ids = [...MUST_REDACT, ...MUST_KEEP].map((r) => r.id);
  ok('every corpus row has a unique id', new Set(ids).size === ids.length);
  ok('every must redact row carries its secret inside its own text',
    MUST_REDACT.every((r) => typeof r.text === 'string' && r.text.includes(r.secret)));
  ok('every must keep row carries the run it must keep inside its own text',
    MUST_KEEP.every((r) => typeof r.text === 'string' && r.text.includes(r.keep)));
  ok('every must keep row names the widening that would have eaten it',
    MUST_KEEP.every((r) => typeof r.trap === 'string' && r.trap.length > 10));
  const kinds = new Set(MUST_REDACT.map((r) => r.kind));
  for (const k of ['nino', 'phone', 'sortcode', 'account', 'iban', 'card', 'email', 'postcode', 'amount']) {
    ok(`the leak half covers ${k}`, kinds.has(k));
  }
  const keepKinds = new Set(MUST_KEEP.map((r) => r.kind));
  for (const k of ['date', 'invoice', 'jobref', 'vanreg', 'quantity', 'time', 'percent', 'vatno', 'companyno']) {
    ok(`the corruption half covers ${k}`, keepKinds.has(k));
  }
}
ok('nothing in the corpus writes the rival domain', ![...MUST_REDACT, ...MUST_KEEP]
  .some((r) => r.text.includes('lekhio') && !r.text.includes('lekhio.app')));

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== the harness really reaches the live function, on all three call sites ===\n');

const controlQ = await liveViaQuestion(CONTROL.text);
const controlA = await liveViaAnswer(CONTROL.text);
const controlC = await liveViaCacheSample(CONTROL.text);

ok('the question call site wrote something we can read', typeof controlQ === 'string' && controlQ.length > 0);
ok('the answer call site wrote something we can read', typeof controlA === 'string' && controlA.length > 0);
ok('the cache sample call site wrote something we can read', typeof controlC === 'string' && controlC.length > 0);
ok('logQaCandidate redacts the question (control)', typeof controlQ === 'string' && !controlQ.includes(CONTROL.secret));
ok('logQaCandidate redacts the answer (control)', typeof controlA === 'string' && !controlA.includes(CONTROL.secret));
ok('upsertQaCache redacts the question sample (control)', typeof controlC === 'string' && !controlC.includes(CONTROL.secret));
ok('and the redaction leaves a placeholder rather than emptying the text',
  typeof controlQ === 'string' && controlQ.includes('[email]'));

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== the live function, scored against the corpus ===\n');

const liveSurvived = [];
for (const row of MUST_REDACT) {
  const out = await liveViaQuestion(row.text);
  if (typeof out !== 'string') { ok(`${row.id}: the live write happened at all`, false); continue; }
  const reasons = survivalReasons(row.secret, out);
  if (reasons.length) {
    liveSurvived.push(row.id);
    console.log(`        LEAK  ${row.id.padEnd(18)} ${row.kind.padEnd(9)} ${reasons.join(', ')}`);
    console.log(`              ${out}`);
  }
}

const liveEaten = [];
for (const row of MUST_KEEP) {
  const out = await liveViaQuestion(row.text);
  if (typeof out !== 'string') { ok(`${row.id}: the live write happened at all`, false); continue; }
  if (!out.includes(row.keep)) {
    liveEaten.push(row.id);
    console.log(`        EATEN ${row.id.padEnd(18)} ${row.kind.padEnd(9)} lost "${row.keep}"`);
    console.log(`              ${out}`);
  }
}

console.log(`\n        live score: ${liveSurvived.length} of ${MUST_REDACT.length} leaks survive, `
  + `${liveEaten.length} of ${MUST_KEEP.length} ordinary numbers eaten\n`);

// The leak list must be EMPTY. Equality against the empty list, so a new gap cannot hide behind
// a shrinking count, and so nobody can add a "known gap" here without it being a visible edit.
const LIVE_LEAKS = [];
if (!same(liveSurvived, LIVE_LEAKS)) console.log(`        leaking: ${JSON.stringify(sorted(liveSurvived))}`);
ok('the live function leaks nothing the corpus asks it to redact', same(liveSurvived, LIVE_LEAKS));

// EXACTLY ONE ordinary number is destroyed, and it was destroyed before this work started: a
// bare nine digit VAT number, taken by the seven or more digit rule. Narrowing that rule to
// spare it would reopen the account number and phone number holes it exists to close. Inherited,
// named in lib/supabase.ts, and held by equality so it cannot grow.
const LIVE_FALSE_POSITIVES = ['vat-bare'];
if (!same(liveEaten, LIVE_FALSE_POSITIVES)) {
  console.log(`        measured: ${JSON.stringify(sorted(liveEaten))}`);
  console.log(`        recorded: ${JSON.stringify(sorted(LIVE_FALSE_POSITIVES))}`);
}
ok('the live function eats exactly the one number it already ate before the widening, and no other',
  same(liveEaten, LIVE_FALSE_POSITIVES));
ok('and that one is inherited, not introduced', same(LIVE_FALSE_POSITIVES, ATE_BEFORE_WIDENING));

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== the corpus still has teeth: the fossil must still fail it ===\n');
{
  // If this section ever goes quiet, the suite has gone blind and the green above means nothing.
  const fossilSurvived = MUST_REDACT
    .filter((row) => survivalReasons(row.secret, redactPiiBeforeWidening(row.text)).length)
    .map((row) => row.id);
  const fossilEaten = MUST_KEEP
    .filter((row) => !redactPiiBeforeWidening(row.text).includes(row.keep))
    .map((row) => row.id);
  console.log(`        the four rule version scores: ${fossilSurvived.length} of ${MUST_REDACT.length} leaks survive, `
    + `${fossilEaten.length} of ${MUST_KEEP.length} eaten`);
  ok('the corpus can still tell a leaking redactor from a tight one',
    fossilSurvived.length > 0 && liveSurvived.length === 0);
  if (!same(fossilSurvived, LEAKED_BEFORE_WIDENING)) {
    console.log(`        measured: ${JSON.stringify(sorted(fossilSurvived))}`);
    console.log(`        recorded: ${JSON.stringify(sorted(LEAKED_BEFORE_WIDENING))}`);
  }
  ok('and it scores the old function exactly as it was scored on 8 August 2026',
    same(fossilSurvived, LEAKED_BEFORE_WIDENING));
  ok('the old function ate the same one ordinary number the new one does', same(fossilEaten, ATE_BEFORE_WIDENING));
  // Derived from what was just measured, not read off the recorded list, so this line stays
  // true when somebody reverts the widening to watch this suite go red.
  const closed = fossilSurvived.filter((id) => !liveSurvived.includes(id));
  console.log(`        ${closed.length} leaks closed by the widening`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== the widening did not undo anything the four original rules already did ===\n');
{
  // Each original rule checked on its own, so a later edit cannot quietly drop one of them.
  const q = async (t) => (await liveViaQuestion(t)) ?? '';
  ok('email still goes', (await q('write to dave@example.com today')).includes('[email]'));
  ok('postcode still goes', (await q('the job at ZZ99 3CZ')).includes('[postcode]'));
  ok('pound amount still goes', (await q('it cost £43,250 all in')).includes('[amount]'));
  ok('a long digit run still goes', (await q('my utr is 1234567890')).includes('[number]'));
  // And the exact strings test/qacandidates.test.mjs pins, so that suite cannot drift.
  const pinned = 'Yes. Your £43,250 van qualifies. I will send it to dave@example.com, quote UTR '
    + '1234567890 and your postcode ZZ99 3CZ when you write to HMRC.';
  const out = await liveViaAnswer(pinned);
  for (const bit of ['£43,250', 'dave@example.com', '1234567890', 'ZZ99 3CZ']) {
    ok(`the pinned answer no longer carries ${bit}`, typeof out === 'string' && !out.includes(bit));
  }
  ok('the pinned answer is redacted, not emptied',
    typeof out === 'string' && out.includes('[amount]') && out.includes('[email]'));
  // test/qa-retention.test.mjs normalises "[amount]" to the bare word amount in a dedupe key, so
  // the amount token specifically must keep its name.
  ok('the amount token is still spelled [amount], which qa-retention depends on',
    (await q('it cost £43,250 all in')).includes('[amount]'));
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

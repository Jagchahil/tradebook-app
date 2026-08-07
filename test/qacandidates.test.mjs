// Tests for logQaCandidate in lib/supabase.ts, the write path into the
// qa_candidates learning pool.
//
// THE DEFECT THIS SUITE GUARDS AGAINST, IN TWO HALVES, BOTH SILENT.
//
// First: the question was PII redacted before it entered the shared review pool
// and THE ANSWER WAS NOT. Puchio composes a personal answer from the man's own
// books, so his figures, his address and his email echo straight into the
// answer text, and the pool stored them raw. The redaction on the question was
// a door locked next to an open window.
//
// Second: the row carried NO user_id, so a row holding a customer's figures
// could never be found again for a UK GDPR Article 15 export or an Article 17
// erasure. We held his data and could not answer for it. The row now carries
// the asker, and qa_candidates sits in USER_DATA_TABLES so both doors walk it
// (see test/datarights.test.mjs for the doors themselves).
//
// The suite runs the REAL logQaCandidate against a stubbed transport and reads
// the wire, the same way test/datarights.test.mjs does: a source scan alone
// would pass on a redaction that is never applied.
//
//   node test/qacandidates.test.mjs

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const libDir = path.join(repoRoot, 'lib');

// The module reads its url and service key at import time, so they go in first.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

// Stage lib/ so the real module graph imports under node's type stripping.
const stage = mkdtempSync(path.join(tmpdir(), 'qacand-'));
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

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

// A turn soaked in exactly the personal detail Puchio echoes back: the man's
// own figure, his email, his UTR shaped digit run, his postcode.
const QUESTION = 'Can I claim my new van against tax? It cost £43,250, my email is dave@example.com';
const ANSWER =
  'Yes. Your £43,250 van qualifies for capital allowances. I will send the summary to ' +
  'dave@example.com, quote UTR 1234567890 and your postcode SW1A 1AA when you write to HMRC.';
const RAW_BITS = ['£43,250', 'dave@example.com', '1234567890', 'SW1A 1AA'];

console.log('\nThe deduped write, which is the path every real question takes.\n');
{
  const calls = await capture(() =>
    SB.logQaCandidate(USER_ID, QUESTION, ANSWER, ['https://www.gov.uk/capital-allowances'], true),
  );
  const rpc = calls.find((c) => c.url.includes('/rest/v1/rpc/log_qa_candidate'));
  ok('the write goes through the dedupe RPC', !!rpc);
  const body = rpc ? JSON.parse(rpc.body) : {};

  for (const bit of RAW_BITS) {
    ok(`the stored answer does not carry ${bit === 'dave@example.com' ? 'his email' : bit === '1234567890' ? 'his UTR' : bit === 'SW1A 1AA' ? 'his postcode' : 'his figure'} (${bit})`,
      typeof body.p_answer === 'string' && !body.p_answer.includes(bit));
  }
  ok('the answer is redacted, not emptied: the placeholders stand where the detail was',
    typeof body.p_answer === 'string' && body.p_answer.includes('[amount]') && body.p_answer.includes('[email]'));
  ok('the question is still redacted too (the fix must not undo the old one)',
    typeof body.p_question === 'string' && !body.p_question.includes('£43,250') && !body.p_question.includes('dave@example.com'));
  ok('the row carries the asker, so the GDPR doors can find it', body.p_user_id === USER_ID);
}

console.log('\nThe fallback plain insert, for a question too short to dedupe.\n');
{
  // qaDedupeKey('??') is empty, so this write takes the plain insert path.
  const calls = await capture(() => SB.logQaCandidate(USER_ID, '??', ANSWER, [], false));
  const ins = calls.find((c) => c.url.includes('/rest/v1/qa_candidates'));
  ok('the write falls back to a plain insert', !!ins && ins.method === 'POST');
  const body = ins ? JSON.parse(ins.body) : {};
  for (const bit of RAW_BITS) {
    ok(`the fallback path stores no raw ${bit}`, typeof body.answer === 'string' && !body.answer.includes(bit));
  }
  ok('the fallback row carries the asker too', body.user_id === USER_ID);
}

console.log('\nThe edges: no user context, and the length cap.\n');
{
  // A write with no user to name must send an explicit null. An empty string in
  // a uuid column is a 400, and this best effort write would be lost with it.
  const calls = await capture(() => SB.logQaCandidate('', QUESTION, ANSWER, [], false));
  const rpc = calls.find((c) => c.url.includes('/rest/v1/rpc/log_qa_candidate'));
  const body = rpc ? JSON.parse(rpc.body) : {};
  ok('no user context becomes an explicit null, never an empty string',
    !!rpc && body.p_user_id === null);
}
{
  // The cap survives the redaction, and the redaction happens before the cap:
  // an email pushed past the 8000 mark by padding must still come out, and the
  // stored text must still respect the cap.
  const padded = 'x'.repeat(7990) + ' write to dave@example.com about the £43,250 van';
  const calls = await capture(() => SB.logQaCandidate(USER_ID, QUESTION, padded, [], false));
  const rpc = calls.find((c) => c.url.includes('/rest/v1/rpc/log_qa_candidate'));
  const body = rpc ? JSON.parse(rpc.body) : {};
  ok('a long answer is still capped at 8000 characters',
    typeof body.p_answer === 'string' && body.p_answer.length <= 8000);
  ok('the detail past the cap boundary was redacted, not truncated into view',
    typeof body.p_answer === 'string' && !body.p_answer.includes('dave@example.com') && !body.p_answer.includes('£43,250'));
}

console.log('\nThe GDPR manifest, so the row this suite proves is written can also be found.\n');
{
  const entry = (SB.USER_DATA_TABLES || []).find((t) => t.table === 'qa_candidates');
  ok('qa_candidates is in USER_DATA_TABLES', !!entry);
  ok('it is keyed on user_id, the column the write path fills',
    !!entry && entry.userKey === 'user_id' && entry.keyKind === 'user_id');
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

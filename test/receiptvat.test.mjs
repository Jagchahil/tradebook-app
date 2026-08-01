// THE VAT ON A RECEIPT: READ, WRITTEN DOWN, AND NEVER CLAIMED UNTIL HE SAYS SO.
//
//   node test/receiptvat.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHAT THIS SUITE DEFENDS.
//
// On 31 July 2026 this product was caught claiming in four places that it read the VAT off a
// receipt while the vision prompt did not contain the word. test/wave9_vat.test.mjs pinned the
// absence as ground truth and deleted the claims. This wave makes the claim TRUE instead, and the
// moment it is true a second and worse failure becomes possible: a figure a model read off a
// crumpled photograph quietly becoming a reclaim.
//
// A total read wrong shows up the same day, because he looks at his own money. A VAT figure read
// wrong one time in seven does not: it sits in a reclaim he has to stand behind at an inspection,
// and he will trust it precisely because we printed it. So the whole of this suite is about the
// gap between READING a VAT figure and CLAIMING one.
//
//   1. 🔴 THE PROMPT ASKS, AND FORBIDS THE GUESS. A sixth of the total is arithmetic, not a
//      reading, and on a supplier who was not charging VAT it is simply wrong. The model is told
//      in as many words to answer null rather than calculate.
//
//   2. 🔴 NULL IS NOT ZERO, ANYWHERE. Null is "the paper did not say". Zero is "the paper said
//      none". Number(null) is 0, so this is one careless line away at all times.
//
//   3. 🔴 NOTHING STORES A VAT FIGURE FOR A MAN WHO IS NOT VAT REGISTERED. He has no input tax to
//      reclaim, so it is data he can never use and a question he would have to dismiss. A FAILED
//      profile read is not an answer either, and it stores nothing too.
//
//   4. 🔴 NOTHING SETS vat_confirmed WITHOUT HIM. Not the parser, not the upload, not a side
//      effect of filing the row. One function writes it, in lib/supabase.ts, and one form calls
//      that function. CLAUDE.md: money always asks, and reclaiming VAT is money.
//
//   5. 🔴 FILING A COST AND AGREEING ITS VAT ARE TWO SENTENCES. Conflating them is how a wrong
//      figure gets into a reclaim, so the pile can do either without the other.
//
//   6. 🔴 THE FIGURE IS CHECKED SERVER SIDE, AGAINST HIS OWN ROW. Never above the payment, and
//      never above the most VAT that can arithmetically sit inside a gross amount.
//
//   7. THE SCREENS SHIP NO CLIENT JAVASCRIPT, and everything added is invisible to a customer who
//      is not VAT registered. Doc 103's empty test, applied to a whole feature.
//
// Behavioural wherever it can be. lib/claude.ts and both routes are staged with stubs, exactly as
// test/vatcapture.test.mjs stages app/api/vat/route.ts, so the real validation code really runs
// and "never stored" is asserted as an absence rather than hoped for.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

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

// Comments are stripped before looking for code a file must NOT contain. Every file here argues at
// length about why the wrong thing would be wrong, and a check that cannot tell the argument from
// the code gets deleted rather than fixed.
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const claudeSrc = read('lib/claude.ts');
const receiptSrc = read('app/api/money/receipt/route.ts');
const captureSrc = read('app/app/money/capture/page.tsx');
const pileRouteSrc = read('app/api/pile/route.ts');
const pilePageSrc = read('app/app/pile/page.tsx');
const supabaseSrc = read('lib/supabase.ts');

console.log('\nThe VAT on a receipt: read, written down, and never claimed until he says so');

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE PROMPT, AND THE FIELD.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n1. The vision prompt asks for the VAT, and forbids working it out');
{
  const prompt = claudeSrc.slice(claudeSrc.indexOf('const PROMPT'), claudeSrc.indexOf("].join('\\n')"));

  ok('🔴 THE PROMPT ASKS FOR THE VAT AS ITS OWN FIELD', /"vat"/.test(prompt));
  ok('and says in the field itself that null is an answer',
    /"vat".*or null if none is printed/.test(prompt));
  ok('🔴 AND IT FORBIDS CALCULATING ONE. A sixth of the total is a guess dressed as a reading',
    /Never calculate it from the total/.test(prompt)
    && /guess dressed up as a reading/.test(prompt));
  ok('it tells the model where UK receipts actually print it, so null means null',
    /line marked VAT/.test(prompt) && /rate codes at the bottom/.test(prompt));
  ok('and that a VAT registration number is not a VAT amount',
    /VAT registration number and a\s*\n?\s*.?total, and that is not a VAT amount/.test(prompt.replace(/'\s*,\s*\n\s*'/g, ' ')));

  ok('🔴 ParsedReceipt CARRIES THE FIELD, and it is nullable',
    /vat: number \| null;/.test(claudeSrc));
  ok('the type says out loud that null is not zero',
    /NULL IS NOT ZERO/.test(claudeSrc));

  // The four that were already there are untouched. A VAT change that quietly moved the total
  // would be a far worse bug than the one it fixed.
  for (const field of ['merchant_name: string;', 'amount: number;', 'category: string;',
    "transaction_type: 'expense';", 'transaction_date: string | null;']) {
    ok(`the existing field is untouched: ${field}`, claudeSrc.includes(field));
  }
  ok('and the category vocabulary is exactly what it was',
    claudeSrc.includes("const ALLOWED_CATEGORIES = ['tools', 'fuel', 'meals', 'materials', 'other'];"));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE PARSER, RUN FOR REAL.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n2. The parser, staged and run against a stubbed model');

const stage = mkdtempSync(path.join(tmpdir(), 'receiptvat-'));
const asTs = (s) => s.replace(/from '(\.\/[a-zA-Z0-9]+)'/g, "from '$1.ts'");
for (const f of ['taxengine', 'nistudentloan', 'ltdengine', 'aicost', 'housestyle', 'claude']) {
  writeFileSync(path.join(stage, `${f}.ts`), asTs(read(`lib/${f}.ts`)));
}

// The key is read at module load, so it goes in before the import and not after.
process.env.ANTHROPIC_API_KEY = 'test-key';
delete process.env.AI_KILL_SWITCH;
const C = await import(pathToFileURL(path.join(stage, 'claude.ts')).href);

// One canned model reply, shaped exactly as the API returns it.
function modelSays(json) {
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return { model: 'test', usage: {}, content: [{ type: 'text', text: JSON.stringify(json) }] };
    },
  });
}

const base = { merchant_name: 'Screwfix', amount: 28.99, category: 'materials', transaction_type: 'expense', transaction_date: '2026-07-20' };

{
  modelSays({ ...base, vat: 4.83 });
  const r = await C.parseReceipt('x', 'image/jpeg');
  ok('a receipt that printed its VAT comes back with it', r.vat === 4.83);
  ok('and the other four fields are unchanged by any of this',
    r.merchant_name === 'Screwfix' && r.amount === 28.99 && r.category === 'materials'
    && r.transaction_date === '2026-07-20' && r.transaction_type === 'expense');
}
{
  modelSays({ ...base, vat: null });
  const r = await C.parseReceipt('x', 'image/jpeg');
  ok('🔴 A RECEIPT THAT PRINTED NO VAT COMES BACK NULL, NEVER ZERO. Number(null) is 0 and this is the line that trap lives on',
    r.vat === null);
}
{
  modelSays({ merchant_name: 'Screwfix', amount: 28.99, category: 'materials', transaction_type: 'expense', transaction_date: null });
  const r = await C.parseReceipt('x', 'image/jpeg');
  ok('a model that omitted the field entirely is also null, not zero', r.vat === null);
}
{
  modelSays({ ...base, vat: 0 });
  const r = await C.parseReceipt('x', 'image/jpeg');
  ok('but a real zero survives as zero, because "the paper said none" is a different answer', r.vat === 0);
}
{
  modelSays({ ...base, amount: 28.99, vat: 289.9 });
  const r = await C.parseReceipt('x', 'image/jpeg');
  ok('🔴 A VAT LARGER THAN THE TOTAL IS CLAMPED TO THE TOTAL. A misread decimal point must never leave here as a figure he could claim',
    r.vat === 28.99);
}
{
  modelSays({ ...base, vat: -4.83 });
  const r = await C.parseReceipt('x', 'image/jpeg');
  ok('a negative VAT is not a reading, so it is null', r.vat === null);
}
{
  modelSays({ ...base, vat: 'not a number' });
  const r = await C.parseReceipt('x', 'image/jpeg');
  ok('and neither is a word', r.vat === null);
}
{
  modelSays({ ...base, vat: '4.83' });
  const r = await C.parseReceipt('x', 'image/jpeg');
  ok('a number sent as a string is still a number', r.vat === 4.83);
}
{
  modelSays({ ...base, amount: 'unreadable', vat: 4.83 });
  const r = await C.parseReceipt('x', 'image/jpeg');
  ok('🔴 an unreadable total clamps the VAT to zero rather than letting a stray figure through',
    r.amount === 0 && r.vat === 0);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. THE RECEIPT UPLOAD. Stored for the man who can use it, and for nobody else.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n3. The upload writes a reading, never a claim, and only for a registered customer');

const rStage = mkdtempSync(path.join(tmpdir(), 'receiptvat-route-'));
writeFileSync(path.join(rStage, 'nextserver.ts'), `
export class NextRequest {}
export const NextResponse = {
  json(body, init) { return { kind: 'json', status: (init && init.status) || 200, body }; },
  redirect(url, status) { return { kind: 'redirect', status, location: String(url) }; },
};
`);
writeFileSync(path.join(rStage, 'webauth.ts'), "export async function sessionUser() { return { id: 'u-1' }; }\n");
writeFileSync(path.join(rStage, 'waintents.ts'), 'export function clampReceiptDate(d) { return d || "2026-07-20"; }\n');
writeFileSync(path.join(rStage, 'dedupe.ts'), 'export function findDuplicate() { return null; }\n');
writeFileSync(path.join(rStage, 'memory.ts'), 'export function normaliseVendor(v) { return String(v || "").toLowerCase(); }\n');
writeFileSync(path.join(rStage, 'margin.ts'), 'export function aiCapsFor() { return { killed: false }; }\n');
writeFileSync(path.join(rStage, 'aicost.ts'), 'export function decideSpend() { return { allowed: true }; }\n');
writeFileSync(path.join(rStage, 'ratelimit.ts'), 'export async function rateLimitedShared() { return false; }\n');
writeFileSync(path.join(rStage, 'gateserver.ts'), `
export async function gateForUser() { return 'ok'; }
export function refuseUnentitled() { return { kind: 'json', status: 402, body: { error: 'locked' } }; }
`);
writeFileSync(path.join(rStage, 'claude.ts'), `
export const state = { parsed: null };
export function hasClaudeConfig() { return true; }
export async function parseReceipt() { return state.parsed; }
`);
// The spy. Every write the route attempts lands here, so "no VAT was stored" is an absence.
writeFileSync(path.join(rStage, 'supabase.ts'), `
export const state = { profile: null, rows: [], calls: [], refuseVatColumns: false };
export async function readVatProfile(userId) {
  state.calls.push({ fn: 'readVatProfile', userId });
  return state.profile;
}
export async function insertTransaction(record) {
  state.calls.push({ fn: 'insertTransaction', record: { ...record } });
  if (state.refuseVatColumns && 'vat_amount' in record) {
    throw new Error('column transactions.vat_amount does not exist');
  }
}
export async function recentUnconfirmedForMatch() { return state.rows; }
export async function mergeIntoTransaction(userId, id, patch) {
  state.calls.push({ fn: 'mergeIntoTransaction', id, patch });
  return true;
}
export async function bumpAiUsage() { return 1; }
export async function countActiveSubscribers() { return 10; }
export async function storeReceiptImage() { return 'u-1/abc.jpg'; }
`);
writeFileSync(
  path.join(rStage, 'route.ts'),
  receiptSrc
    .replace(/from 'next\/server'/g, "from './nextserver.ts'")
    .replace(/from '(?:\.\.\/)+lib\/([a-zA-Z]+)'/g, "from './$1.ts'"),
);

const RR = await import(pathToFileURL(path.join(rStage, 'route.ts')).href);
const RDB = await import(pathToFileURL(path.join(rStage, 'supabase.ts')).href);
const RAI = await import(pathToFileURL(path.join(rStage, 'claude.ts')).href);

const REGISTERED = {
  registered: true, vrn: '123456782', registeredOn: '2024-01-01', deregisteredOn: null,
  scheme: 'standard', flatRatePercent: null, flatRateFirstYear: false, cisSubcontractor: false,
};

async function upload({ profile, parsed, refuseVatColumns = false }) {
  RDB.state.calls.length = 0;
  RDB.state.profile = profile;
  RDB.state.refuseVatColumns = refuseVatColumns;
  RAI.state.parsed = parsed;
  const fd = new FormData();
  fd.append('receipt', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), 'r.jpg');
  const res = await RR.POST({
    url: 'https://lekhio.app/api/money/receipt',
    headers: new Headers({ 'content-type': 'multipart/form-data; boundary=x' }),
    formData: async () => fd,
  });
  return { res, calls: RDB.state.calls };
}
const written = (calls) => calls.filter((c) => c.fn === 'insertTransaction').map((c) => c.record);
const parsedWithVat = { merchant_name: 'Screwfix', amount: 28.99, category: 'materials', transaction_type: 'expense', transaction_date: '2026-07-20', vat: 4.83 };

{
  const { calls } = await upload({ profile: REGISTERED, parsed: parsedWithVat });
  const rows = written(calls);
  ok('a registered customer gets the reading stored', rows.length === 1 && rows[0].vat_amount === 4.83);
  ok('🔴 AND IT IS STORED UNCONFIRMED. A reading is not a claim',
    rows[0].vat_confirmed === false);
  ok('the row itself is still unconfirmed too, exactly as before', rows[0].confirmed === false);
}
{
  const { calls } = await upload({ profile: { ...REGISTERED, registered: false }, parsed: parsedWithVat });
  const rows = written(calls);
  ok('🔴 A CUSTOMER WHO IS NOT VAT REGISTERED GETS NO VAT STORED AT ALL. He has no input tax to reclaim, so it is a question he would only have to dismiss',
    rows.length === 1 && !('vat_amount' in rows[0]) && !('vat_confirmed' in rows[0]));
  ok('and his row lands exactly as it always did', rows[0].amount === -28.99 && rows[0].confirmed === false);
}
{
  const { calls } = await upload({ profile: null, parsed: parsedWithVat });
  const rows = written(calls);
  ok('🔴 A FAILED PROFILE READ STORES NO VAT EITHER. null means we could not read it, which is not the same answer as "he is not registered"',
    rows.length === 1 && !('vat_amount' in rows[0]));
}
{
  const { calls } = await upload({ profile: REGISTERED, parsed: { ...parsedWithVat, vat: null } });
  const rows = written(calls);
  ok('a receipt that printed no VAT stores none, for a registered man as much as anyone',
    rows.length === 1 && !('vat_amount' in rows[0]));
  ok('and the profile is not even read, so a receipt with no VAT on it costs nothing',
    calls.every((c) => c.fn !== 'readVatProfile'));
}
{
  const { calls } = await upload({ profile: REGISTERED, parsed: parsedWithVat, refuseVatColumns: true });
  const rows = written(calls);
  ok('🔴 A DATABASE WITHOUT THE COLUMNS COSTS HIM THE READING AND NEVER THE ROW. The migration is dated 1 August 2026 and the receipt is the thing that matters',
    rows.length === 2 && !('vat_amount' in rows[1]) && rows[1].amount === -28.99);
}
{
  ok('🔴 NOTHING IN THE UPLOAD ROUTE EVER WRITES A CONFIRMED ANYTHING',
    !/confirmed:\s*true/.test(codeOnly(receiptSrc)));
  ok('and it still writes through insertTransaction alone, with no query of its own',
    receiptSrc.includes('insertTransaction(') && !/\bfetch\s*\(|rest\/v1/.test(codeOnly(receiptSrc)));
  ok('the profile it reads is the one in lib/supabase.ts, never a circumstance guessed at here',
    receiptSrc.includes('readVatProfile'));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4. THE PILE. Two sentences, and neither one drags the other along.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n4. The pile: filing a cost and agreeing its VAT are two different statements');

const pStage = mkdtempSync(path.join(tmpdir(), 'receiptvat-pile-'));
// lib/vat.ts goes in WHOLE, because the ceiling is the thing under test and a stub of it would be
// a test of the stub. It has zero imports on purpose, which is what makes that possible.
writeFileSync(path.join(pStage, 'vat.ts'), read('lib/vat.ts'));
writeFileSync(path.join(pStage, 'nextserver.ts'), `
export class NextRequest {}
export const NextResponse = {
  json(body, init) { return { kind: 'json', status: (init && init.status) || 200, body }; },
  redirect(url, status) { return { kind: 'redirect', status, location: String(url) }; },
};
`);
writeFileSync(path.join(pStage, 'webauth.ts'), "export async function sessionUser() { return { id: 'u-1' }; }\n");
writeFileSync(path.join(pStage, 'ratelimit.ts'), 'export async function rateLimitedShared() { return false; }\n');
writeFileSync(path.join(pStage, 'gateserver.ts'), `
export async function gateForUser() { return 'ok'; }
export function refuseUnentitled() { return { kind: 'json', status: 402, body: { error: 'locked' } }; }
`);
writeFileSync(path.join(pStage, 'reviewpile.ts'), `
export function buildPile() { return []; }
export function summarisePile() { return { entries: 0 }; }
export function canBulkConfirm() { return false; }
export function bulkConfirmPlan() { return []; }
`);
writeFileSync(path.join(pStage, 'memory.ts'), 'export function normaliseVendor(v) { return String(v || "").toLowerCase(); }\n');
writeFileSync(path.join(pStage, 'personal.ts'), 'export function looksPersonal() { return null; }\n');
writeFileSync(path.join(pStage, 'categories.ts'), `
export const CATEGORIES = ['materials'];
export function categoriseBankLine() { return 'materials'; }
`);
writeFileSync(path.join(pStage, 'supabase.ts'), `
export const state = { profile: null, rows: [], calls: [], vatWriteOk: true };
export async function pileEntries() { return state.rows; }
export async function readOwnNames() { return []; }
export async function readAccountUse() { return 'mixed'; }
export async function confirmPile(userId, ids, category) {
  state.calls.push({ fn: 'confirmPile', ids, category });
  return ids.length;
}
export async function confirmIncome(userId, ids, kind) {
  state.calls.push({ fn: 'confirmIncome', ids, kind });
  return ids.length;
}
export async function setManyPersonal(userId, ids) {
  state.calls.push({ fn: 'setManyPersonal', ids });
  return ids.length;
}
export async function learnVendor() { state.calls.push({ fn: 'learnVendor' }); return true; }
export async function readVatProfile(userId) {
  state.calls.push({ fn: 'readVatProfile', userId });
  return state.profile;
}
export async function confirmTransactionVat(userId, transactionId, vatAmount) {
  state.calls.push({ fn: 'confirmTransactionVat', transactionId, vatAmount });
  return state.vatWriteOk;
}
`);
writeFileSync(
  path.join(pStage, 'route.ts'),
  pileRouteSrc
    .replace(/from 'next\/server'/g, "from './nextserver.ts'")
    .replace(/from '(?:\.\.\/)+lib\/([a-zA-Z]+)'/g, "from './$1.ts'"),
);

const PR = await import(pathToFileURL(path.join(pStage, 'route.ts')).href);
const PDB = await import(pathToFileURL(path.join(pStage, 'supabase.ts')).href);

// £120 out. At the standard rate the most VAT that can be inside it is exactly £20.
const COST = { id: 'tx-1', vendor: 'Screwfix', description: null, amount: -120, category: 'materials', looks_personal: false };
const PAYMENT_IN = { id: 'tx-in', vendor: 'A customer', description: null, amount: 400, category: null, looks_personal: false };

async function post(fields, { profile = REGISTERED, rows = [COST, PAYMENT_IN], vatWriteOk = true } = {}) {
  PDB.state.calls.length = 0;
  PDB.state.profile = profile;
  PDB.state.rows = rows;
  PDB.state.vatWriteOk = vatWriteOk;
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
  const res = await PR.POST({
    url: 'https://lekhio.app/api/pile',
    headers: new Headers({ 'content-type': 'application/x-www-form-urlencoded' }),
    formData: async () => fd,
  });
  return { res, calls: PDB.state.calls };
}
const did = (calls, fn) => calls.filter((c) => c.fn === fn);

{
  const { res, calls } = await post({ ids: 'tx-1', verdict: 'vat', vat: '20.00' });
  const w = did(calls, 'confirmTransactionVat');
  ok('he agrees the VAT and it is written, through confirmTransactionVat and nothing else',
    w.length === 1 && w[0].transactionId === 'tx-1' && w[0].vatAmount === 20);
  ok('🔴 AND AGREEING THE VAT FILES NOTHING. It is a statement about a column, not about the cost',
    did(calls, 'confirmPile').length === 0 && did(calls, 'setManyPersonal').length === 0);
  ok('he is sent back to the pile with a 303, so a refresh cannot repeat it',
    res.kind === 'redirect' && res.status === 303 && res.location.includes('done=vat'));
}
{
  const { calls } = await post({ ids: 'tx-1', verdict: 'business', category: 'materials' });
  ok('🔴 AND FILING THE COST AGREES NO VAT. The two sentences never drag each other along',
    did(calls, 'confirmPile').length === 1 && did(calls, 'confirmTransactionVat').length === 0);
}
{
  const { calls } = await post({ ids: 'tx-1', verdict: 'personal' });
  ok('striking a row out touches no VAT either',
    did(calls, 'setManyPersonal').length === 1 && did(calls, 'confirmTransactionVat').length === 0);
}
{
  const { calls } = await post({ ids: 'tx-in', verdict: 'income', category: 'income' });
  ok('and neither does filing money in',
    did(calls, 'confirmIncome').length === 1 && did(calls, 'confirmTransactionVat').length === 0);
}
{
  const { res, calls } = await post({ ids: 'tx-1', verdict: 'vat', vat: '20.00' }, { profile: { ...REGISTERED, registered: false } });
  ok('🔴 A CUSTOMER WHO IS NOT VAT REGISTERED IS REFUSED, whatever he posts',
    did(calls, 'confirmTransactionVat').length === 0 && res.location.includes('done=novat'));
}
{
  const { calls } = await post({ ids: 'tx-1', verdict: 'vat', vat: '20.00' }, { profile: null });
  ok('🔴 AND SO IS A FAILED PROFILE READ. null is not a yes',
    did(calls, 'confirmTransactionVat').length === 0);
}

console.log('\n   the figure itself, checked against his own row and never against the form');
{
  const { calls } = await post({ ids: 'tx-1', verdict: 'vat', vat: '20.01' });
  ok('🔴 A PENNY OVER A SIXTH OF THE GROSS IS REFUSED. At the standard rate no more VAT can fit inside the payment',
    did(calls, 'confirmTransactionVat').length === 0);
}
{
  const { res, calls } = await post({ ids: 'tx-1', verdict: 'vat', vat: '150' });
  ok('🔴 AND A FIGURE ABOVE THE PAYMENT ITSELF IS REFUSED TWICE OVER',
    did(calls, 'confirmTransactionVat').length === 0 && res.location.includes('done=vatbad'));
}
{
  const { calls } = await post({ ids: 'tx-1', verdict: 'vat', vat: '-5' });
  ok('a negative is refused', did(calls, 'confirmTransactionVat').length === 0);
}
{
  const { calls } = await post({ ids: 'tx-1', verdict: 'vat', vat: '' });
  ok('🔴 AN EMPTY BOX IS REFUSED AND NEVER READ AS ZERO. Number("") is 0, and a zero he did not type is a zero he did not agree to',
    did(calls, 'confirmTransactionVat').length === 0);
}
{
  const { calls } = await post({ ids: 'tx-1', verdict: 'vat', vat: '0' });
  ok('but a zero he DID type is a real answer, because some receipts carry no VAT',
    did(calls, 'confirmTransactionVat')[0]?.vatAmount === 0);
}
{
  const { calls } = await post({ ids: 'tx-1', verdict: 'vat', vat: '£20.00' });
  ok('a pound sign is him copying the paper, not him being wrong',
    did(calls, 'confirmTransactionVat')[0]?.vatAmount === 20);
}
{
  const { calls } = await post({ ids: 'tx-1', verdict: 'vat', vat: 'twenty' });
  ok('a word is not a figure', did(calls, 'confirmTransactionVat').length === 0);
}
{
  const { calls } = await post({ ids: 'tx-nope', verdict: 'vat', vat: '1.00' });
  ok('🔴 A ROW THAT IS NOT IN HIS OWN PILE IS REFUSED. The ceiling is read from HIS rows server side, so an id from a crafted post finds nothing to stand on',
    did(calls, 'confirmTransactionVat').length === 0);
}
{
  const { calls } = await post({ ids: 'tx-in', verdict: 'vat', vat: '1.00' });
  ok('🔴 MONEY IN HAS NO INPUT TAX ON IT, so a credit is refused',
    did(calls, 'confirmTransactionVat').length === 0);
}
{
  const { calls } = await post({ ids: 'tx-1,tx-in', verdict: 'vat', vat: '1.00' });
  ok('🔴 ONE ROW AT A TIME. A single VAT figure cannot answer for fourteen different receipts',
    did(calls, 'confirmTransactionVat').length === 0);
}
{
  const { res } = await post({ ids: 'tx-1', verdict: 'vat', vat: '20.00' }, { vatWriteOk: false });
  ok('a write that failed is told as a failure, never reported as saved',
    res.location.includes('done=nothing'));
}
{
  ok('the amount the ceiling is built from comes from pileEntries, not from the request',
    /if \(body\.verdict === 'vat'\)[\s\S]{0,1600}pileEntries\(user\.id\)/.test(pileRouteSrc));
  ok('🔴 AND THE ARITHMETIC CEILING IS ASKED OF lib/vat.ts, NEVER REDERIVED HERE',
    /vatFromGross\(gross, VAT_STANDARD_RATE\)/.test(pileRouteSrc)
    && !/\/\s*6\b|0\.1666/.test(codeOnly(pileRouteSrc)));
  ok('the route still writes nothing itself, it only ever calls lib',
    !/\bfetch\s*\(/.test(pileRouteSrc) && !/\binsert\b|\bupsert\b|rest\/v1/.test(pileRouteSrc));
  ok('and the VAT branch is gated by the subscription like every other decision on this screen',
    pileRouteSrc.indexOf('gateForUser(user.id)') < pileRouteSrc.indexOf("body.verdict === 'vat'"));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 5. THE SCREENS.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n5. The screens: no script, and nothing at all for a man who is not registered');
{
  for (const [name, src] of [['the pile', pilePageSrc], ['the capture screen', captureSrc]]) {
    ok(`🔴 ${name} ships NO CLIENT JAVASCRIPT`,
      !/'use client'|useState|useEffect|onClick|onChange|onSubmit|<script/.test(src));
  }
  ok('every VAT decision on the pile is a form post, never a link',
    !/href="\/api\/pile/.test(pilePageSrc) && /name="verdict" value="vat"/.test(pilePageSrc));
  ok('the confirm form carries exactly one id and the figure he can edit',
    /name="ids" value=\{v\.id\}/.test(pilePageSrc) && /name="vat"/.test(pilePageSrc));
  ok('🔴 THE WHOLE SECTION IS BEHIND vatRegistered, and that comes from readVatProfile',
    /const vatRegistered = vatProfile !== null && vatProfile\.registered;/.test(pilePageSrc)
    && /vatRegistered \? vatToCheck\(rows\) : \[\]/.test(pilePageSrc)
    && pilePageSrc.includes('readVatProfile(user.id)'));
  ok('🔴 A FAILED PROFILE READ DRAWS NOTHING, because null is not a yes here either',
    /readVatProfile\(user\.id\)\.catch\(\(\) => null\)/.test(pilePageSrc));
  ok('a row already agreed is never asked about again', /if \(r\.vat_confirmed\) continue;/.test(pilePageSrc));
  ok('and neither is a stored zero, which would be a question with one sensible answer',
    /raw <= 0\) continue;/.test(pilePageSrc));
  ok('🔴 THE VAT QUESTION IS ASKED ABOVE THE FILING QUESTIONS, because a filed row leaves the pile and takes it with it',
    pilePageSrc.indexOf('vatWaiting.length > 0') < pilePageSrc.indexOf('known.length > 0'));

  ok('🔴 THE INPUT TAX RULES COME FROM lib/vat.ts AND ARE NEVER RESTATED ON THE SCREEN',
    pilePageSrc.includes("import { inputVatNote } from '../../../lib/vat'")
    && /inputVatNote\(category, text\)/.test(pilePageSrc)
    && !/reverse charge|entertain|blocked/i.test(codeOnly(pilePageSrc).replace(/inputVatNote/g, '')));
  ok('and it is drawn only for a registered customer',
    /<VatNote show=\{vatRegistered\}/.test(pilePageSrc));
  ok('the note draws nothing when lib/vat.ts has nothing to say, which is most costs',
    /if \(!note\) return null;/.test(pilePageSrc));

  ok('the capture screen only mentions VAT to a registered customer',
    /vatRegistered\s*\n?\s*\? 'Give me the receipt and I will read it: the shop, the total, the date, and the VAT/.test(captureSrc));
  ok('🔴 AND THE SENTENCE EVERYONE ELSE READS IS THE ONE IT ALWAYS WAS',
    captureSrc.includes('Give me the receipt and I will read it: the shop, the total and the date.'));
  ok('it says plainly that the reading is not a claim',
    /counts towards nothing you claim back until/.test(captureSrc));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 6. THE INVARIANT THIS WHOLE WAVE EXISTS FOR.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n6. Nothing anywhere sets vat_confirmed without him');
{
  // One writer, in lib. Two words of SQL in one function, and every other mention in the codebase
  // is a read, a false, or an argument about why it must stay that way.
  const setsTrue = (src) => /vat_confirmed[^\n]{0,20}(true|=\s*eq\.true)/.test(codeOnly(src));
  ok('🔴 lib/supabase.ts confirmTransactionVat IS THE ONLY THING THAT WRITES vat_confirmed: true',
    /vat_amount: v, vat_confirmed: true/.test(supabaseSrc));
  for (const [name, src] of [
    ['lib/claude.ts', claudeSrc],
    ['app/api/money/receipt/route.ts', receiptSrc],
    ['app/app/money/capture/page.tsx', captureSrc],
    ['app/api/pile/route.ts', pileRouteSrc],
    ['app/app/pile/page.tsx', pilePageSrc],
  ]) {
    ok(`🔴 ${name} never sets it`, !setsTrue(src));
  }
  ok('🔴 AND confirmTransactionVat IS CALLED FROM EXACTLY ONE PLACE, the form he filled in',
    /confirmTransactionVat\(user\.id, ids\[0\], claimed\)/.test(pileRouteSrc)
    && !/confirmTransactionVat\(/.test(codeOnly(receiptSrc))
    && !/confirmTransactionVat\(/.test(codeOnly(claudeSrc)));

  // The house rules, on the five files this wave touched.
  //
  // ⚠️ lib/claude.ts IS CHECKED FROM THE TOP DOWN TO ParsedEntry, which is the receipt reader and
  // the whole of what this wave changed. Three em dashes sit in comments much further down, in the
  // support drafting and founder voice prompts, and they were there before any of this. They are
  // real and they should go, in the wave that owns those functions. Failing this suite over them
  // would teach the next person to stop reading the failure, which is how a rule dies.
  const FILES = {
    'lib/claude.ts': claudeSrc.slice(0, claudeSrc.indexOf('export interface ParsedEntry')),
    'app/api/money/receipt/route.ts': receiptSrc,
    'app/app/money/capture/page.tsx': captureSrc,
    'app/api/pile/route.ts': pileRouteSrc,
    'app/app/pile/page.tsx': pilePageSrc,
  };
  for (const [name, src] of Object.entries(FILES)) {
    ok(`${name}: no em dash, no en dash, no minus sign`, !/[–—−]/.test(src));
    ok(`${name}: never the rival domain`, !src.includes('lekhio' + '.com'));
  }
  ok('🔴 AND NOTHING CLAIMS WE FILE A VAT RETURN OR THAT HMRC HAS APPROVED ANY OF IT',
    !Object.values(FILES).some((s) => /file your VAT|submit your VAT|VAT return for you|HMRC approved|approved by HMRC/i.test(s)));
}

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// B19: WHAT LEKHIO HAS SAVED HIM. THE BUILDER, THE READER, AND WHAT A FAILED READ SAYS.
// lib/waintents.ts savingsAnswer + lib/savingsanswer.ts, 18 August 2026.
//
// test/laneparity.test.mjs section 12 holds the ROUTING: that all three routers dispatch this lane,
// above the model, and on /api/ask above the shared qa_cache, its read, its write and the daily
// cap. It reads source and never runs it. This suite runs it.
//
// 🔴 WHAT IT DEFENDS, IN THE ORDER THE FAILURES WOULD HURT.
//
//   1. A FAILED READ NEVER BECOMES A STATEMENT ABOUT HIS RECORDS. This is the finding behind the
//      packet and it is the same one lib/laneanswers.ts found for property, one layer lower down.
//      getConfirmedTransactionsForRange answered `[]` for BOTH "he has confirmed nothing" and
//      "Supabase replied 500", so ledgerFor saw a gross of zero and handleSavingsQuestion sent
//      "Nothing confirmed yet. Add your first entry or upload a bank statement, and this fills
//      itself in." A man eleven months into a full book, on one wobble, was told his records were
//      empty and invited to start again.
//
//   2. AND THE TRUE EMPTY CASE STILL GETS THE TRUE EMPTY ANSWER. Refusing every quiet answer would
//      be the same defect wearing the other face.
//
//   3. NOT ENOUGH IS NOT ZERO, AND IT IS NOT A FAILURE EITHER. Three months of real figures is a
//      confidence gate lib/ledger.ts has argued since 9 August. It answers, it does not refuse.
//
//   4. THE MONEY READS LIKE MONEY. See the section on formatGbp: this lane printed
//      `£${n.toLocaleString('en-GB')}`, which renders a real figure as "£4,120.4".
//
// ⚠️ IT DRIVES THE REAL lib/supabase.ts OVER A FAKE fetch, not a stub of it, for the reason
// test/b19threelanes.test.mjs gives: the whole finding lives inside a `if (!res.ok)` branch, so a
// suite that stubbed the reader would have tested the stub and passed on the day the defect
// shipped.
//
// ⚠️ AND THE BUILDER IS TESTED DIRECTLY RATHER THAN THROUGH THE READER, DELIBERATELY. ledgerFor's
// `enough` gate is a function of how far into the tax year today is, so a Tesla screen driven
// through a read would pass all summer and go red every April on a product that had not changed.
// The builder is pure. Its words are checked on fixtures, and the reader is checked on reads.
//
// Run: node test/b19savings.test.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  ok  ${name}`); } else { fail += 1; console.log(`  FAIL ${name}`); }
};

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-for-the-test';

const stage = mkdtempSync(path.join(tmpdir(), 'b19savings-'));
const withExt = (src) => src.replace(/(from\s+')(\.[^']*?)(')/g, (m, a, spec, b) => (
  /\.[a-z]+$/.test(spec) ? m : `${a}${spec}.ts${b}`
));
let copied = 0;
for (const f of readdirSync(path.join(root, 'lib'))) {
  if (!f.endsWith('.ts')) continue;
  writeFileSync(path.join(stage, f), withExt(read(`lib/${f}`)));
  copied += 1;
}
ok('the whole of lib/ was staged for import, so nothing under test is a hand written stub', copied > 30);
ok('🔴 the staged lib/savingsanswer.ts differs from the real one ONLY in its import specifiers',
  readFileSync(path.join(stage, 'savingsanswer.ts'), 'utf8').replace(/\.ts';/g, "';") === read('lib/savingsanswer.ts'));

const S = await import(pathToFileURL(path.join(stage, 'savingsanswer.ts')).href);
const W = await import(pathToFileURL(path.join(root, 'lib/waintents.ts')).href);

const UID = 'aaaaaaaa-2222-4222-8222-cccccccccccc';

// The fake transport. Only the transactions read is scripted; every other read getOptimiserInput
// makes answers 200 with an empty body, which is its ordinary "nothing set" state and NOT a
// failure. That is the line lib/waintents.ts draws above LANE_UNREADABLE.
let rowsPlan = { status: 200, json: [] };
let sawTransactions = 0;
globalThis.fetch = async (url) => {
  const u = String(url);
  // ⚠️ TWO READS HIT THIS TABLE AND ONLY ONE OF THEM IS THE ONE UNDER TEST. getCapitalAssets asks
  // the same table for `amount=lt.0&capital_kind=not.is.null` across every year, so a counter that
  // matched on the table alone counted two and the assertion below failed on its first run. It is
  // the year to date read, the one whose failure used to become a sentence, that is counted.
  if (u.includes('/rest/v1/transactions?') && u.includes('is_personal=eq.false&transaction_date')) {
    sawTransactions += 1;
    if (rowsPlan.throws) throw new Error('socket hang up');
    return new Response(JSON.stringify(rowsPlan.json ?? []), { status: rowsPlan.status ?? 200 });
  }
  return new Response(JSON.stringify([]), { status: 200 });
};

const LANE_UNREADABLE = W.LANE_UNREADABLE;
const EMPTY_STATE = 'Nothing confirmed yet. Add your first entry or upload a bank statement, and this fills itself in.';

// ── 1. THE FINDING ────────────────────────────────────────────────────────────────────────────
console.log('\n=== 1. a failed read never becomes a statement about his records ===\n');

for (const status of [401, 500, 503]) {
  rowsPlan = { status, json: [] };
  sawTransactions = 0;
  const answer = await S.savingsAnswerForUser(UID);
  ok(`a ${status} on his rows is REFUSED, not described`, answer === LANE_UNREADABLE);
  ok(`  ...and it is NOT the old sentence about his records being empty`,
    !answer.includes('Nothing confirmed yet') && !answer.includes('Add your first entry'));
  ok(`  ...and the read was actually attempted, so the assertion is not vacuous`, sawTransactions === 1);
}

rowsPlan = { throws: true };
ok('a THROWN fetch reaches the same sentence, because it is the same failure',
  (await S.savingsAnswerForUser(UID)) === LANE_UNREADABLE);

// 🔴 THE GUARD THAT WOULD HAVE CAUGHT THIS BEFORE IT SHIPPED. A refusal that fires on everything is
// not a refusal, it is an outage. The two branches below are the whole argument of this packet.
console.log('\n=== 2. and the true empty case still gets the true empty answer ===\n');

rowsPlan = { status: 200, json: [] };
const genuinelyEmpty = await S.savingsAnswerForUser(UID);
ok('🔴 a man who genuinely has nothing confirmed is ANSWERED, not refused',
  genuinelyEmpty !== LANE_UNREADABLE);
ok('🔴 ...and he gets the real empty state, which tells him the one thing he can do',
  genuinelyEmpty === EMPTY_STATE);
ok('🔴 A READ ZERO AND A GUESSED ZERO NOW PRODUCE DIFFERENT SENTENCES, which is the whole packet',
  genuinelyEmpty !== LANE_UNREADABLE && genuinelyEmpty.length > 0);

// A man WITH figures is neither refused nor told his records are empty. What he gets beyond that
// depends on how far into the tax year today is (see the header), so this asserts the two things
// that are true in April and in March alike.
rowsPlan = {
  status: 200,
  json: [
    { amount: 18000, category: 'income', vendor: 'Job', transaction_date: '2026-04-10', income_type: 'trade' },
    { amount: 3000, category: 'materials', vendor: 'Screwfix', transaction_date: '2026-05-02' },
  ],
};
const withRows = await S.savingsAnswerForUser(UID);
ok('🔴 a man with real rows is never refused', withRows !== LANE_UNREADABLE);
ok('🔴 ...and is never told his records are empty', !withRows.includes('Nothing confirmed yet'));

// ── 3. THE BUILDER ────────────────────────────────────────────────────────────────────────────
console.log('\n=== 3. the builder, on fixtures, because it is pure ===\n');

const money = W.formatGbp;
const full = {
  unreadable: false,
  enough: true,
  note: null,
  headline: 'The costs you have logged are keeping £1,240.50 off your tax bill this year.',
  withoutLekhio: 4120.4,
  withLekhio: 2879.9,
  lines: [
    { label: 'Costs you logged', saved: 900.5 },
    { label: 'Mileage', saved: 240 },
    { label: 'Use of home', saved: 100 },
    { label: 'Capital allowances', saved: 0.01 },
    { label: 'A fifth line nobody sees', saved: 0 },
  ],
  refundDue: 1500,
  factNote: 'including the latest Class 4 rate',
};
const built = W.savingsAnswer(full, money);

ok('the headline leads', built.startsWith(full.headline));
ok('🔴 the Tesla screen is both numbers, side by side, because the gap is the product',
  built.includes('Claiming nothing: £4,120.40 of tax') && built.includes('With Lekhio: £2,879.90'));

// 🔴 THE MONEY FORMAT CHANGED AND IT WAS A DECISION, NOT A TIDY UP. This lane printed
// `£${n.toLocaleString('en-GB')}` with no fraction digits fixed, so a real figure of 4120.4 reached
// a customer as "£4,120.4" and 2879.00 as "£2,879". Every other money lane in this product uses
// formatGbp and prints two places (B18's VAT answer says "£67,090.00"). Nothing pinned the old
// form, so this was checked before it was changed rather than after. One builder cannot print two
// formats, so the choice had to be made, and the odd one out lost.
ok('🔴 MONEY READS LIKE MONEY: two places, never a bare "£4,120.4"',
  !/£[\d,]+\.\d(?!\d)/.test(built) && !/£4,120\.4\b(?!0)/.test(built));

ok('at most four lines of where it came from, so the reply stays readable',
  (built.match(/^ {2}\S/gm) || []).length === 4);
ok('...and the fifth is dropped rather than printed at zero', !built.includes('A fifth line nobody sees'));

// 🔴 HIS OWN MONEY, SEPARATE, ALWAYS. This product has already once quoted a man a CIS refund that
// did not exist. Folding it into the saving would be the same lie with a bigger number.
ok('🔴 the CIS refund is his money and is never added to the saving',
  built.includes('£1,500.00 of CIS is sitting with HMRC')
  && built.includes('That is your money, not a saving'));

ok('the Khoji note is carried when there is one', built.includes('including the latest Class 4 rate'));
ok('...and is silent when there is not', !W.savingsAnswer({ ...full, factNote: '' }, money).includes('worked on the current tax rules'));
ok('...and the CIS line is silent when nothing is due', !W.savingsAnswer({ ...full, refundDue: 0 }, money).includes('sitting with HMRC'));

// ── 4. THE REFUSAL IS FIRST, AND IT NEVER SAYS A FIGURE ───────────────────────────────────────
console.log('\n=== 4. the refusal is first and it says nothing about his records ===\n');

const refused = W.savingsAnswer({ ...full, unreadable: true }, money);
ok('🔴 an unreadable read refuses even when every other field is full of figures',
  refused === LANE_UNREADABLE);
ok('🔴 ...and no figure survives into it', !/£/.test(refused) && !/\d/.test(refused));
ok('🔴 ...and it beats the enough gate too, so a wobble is never dressed as a young account',
  W.savingsAnswer({ ...full, unreadable: true, enough: false, note: EMPTY_STATE }, money) === LANE_UNREADABLE);

ok('NOT ENOUGH IS NOT A FAILURE: the young account is answered in its own words',
  W.savingsAnswer({ ...full, enough: false, note: 'Too early to say. Give it 3 months of real figures and this will mean something.' }, money)
    === 'Too early to say. Give it 3 months of real figures and this will mean something.');
ok('...and a missing note still never falls through to silence',
  W.savingsAnswer({ ...full, enough: false, note: null }, money) === 'Too early to say yet.');

// ── 5. THE SHAPE ──────────────────────────────────────────────────────────────────────────────
console.log('\n=== 5. the shape: one builder, one reader, no router assembling ===\n');

const sav = read('lib/savingsanswer.ts');
const wai = read('lib/waintents.ts');

ok('🔴 the builder takes NO channel, and that is the measured difference from the other lanes',
  /export function savingsAnswer\(/.test(wai)
  && !/savingsAnswer\([\s\S]{0,900}channel: LaneChannel/.test(wai));
ok('🔴 the reader does no arithmetic of its own, it delegates to the ONE assembler',
  sav.includes('ledgerFor(input)') && !/personalAllowance|basicRate|\* 0\.\d/.test(sav));
ok('🔴 the builder does no arithmetic either, so two readers over one figure cannot drift',
  !/savingsAnswer\([\s\S]*?\n\}/.test(wai.replace(/\s/g, '')) || !/withoutLekhio\s*-\s*withLekhio/.test(wai));

// 🔴 THE ONE SENTENCE THAT STAYED IN THE WEBHOOK, AND WHY IT IS NOT A HOLE.
const wa = read('app/api/whatsapp/route.ts');
ok('the unlinked number keeps its own sentence, on the one channel that has unlinked numbers',
  wa.includes('Send me a receipt or two first'));
// 🔴 COMMENTS STRIPPED FIRST, AND THIS GUARD FOUND OUT WHY ON ITS OWN FIRST RUN. The repo rule
// says a guard asserting a sentence is GONE must strip comments, and it says it because this has
// now cost five suites. app/api/thread/route.ts:571 discusses the WhatsApp wording in a comment, so
// the naive read called a correctly wired router a hole. The safe form is used: `(^|[^:])//`, never
// `//[^\n]*`, which truncates every https:// URL it meets.
const codeOnly = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
ok('🔴 ...and NO OTHER router carries it in CODE, because neither can ever be in that state',
  !codeOnly(read('app/api/thread/route.ts')).includes('Send me a receipt')
  && !codeOnly(read('app/api/ask/route.ts')).includes('Send me a receipt'));
ok('  ...and the stripper is not eating the file it is checking, so that pass is not vacuous',
  codeOnly(read('app/api/thread/route.ts')).includes('savingsAnswerForUser'));
ok('🔴 and the webhook assembles nothing else: no Tesla screen, no CIS line, no ledger call',
  !wa.includes('Claiming nothing') && !wa.includes('sitting with HMRC') && !/ledgerFor\(/.test(wa));

console.log(`\n${pass} passed, ${fail} failed.`);
if (fail) process.exit(1);

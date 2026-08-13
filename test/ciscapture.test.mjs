// CIS at the review step. What a contractor took off before the money ever reached his bank.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS SUITE EXISTS TO PREVENT, IN ONE STORY.
//
// 11 August 2026, RUN 1 of the customer week, walked as a groundworker. 401 rows imported from a
// real year of statements. 62 of them were contractor payments totalling £34,400, and that £34,400
// was NET: £4,400 and £2,800 had already been handed to HMRC on his behalf across two tax years.
//
// Every one of those 62 rows was booked as income at its bank value, because the only question the
// pile had for a payment in was whose money it is. That was never the question that mattered. So:
//
//   his turnover was understated by exactly the tax taken, on the return and on the document a
//   lender reads, and
//
//   the tax already paid for him was invisible, so the product told him to put by money HMRC was
//   already holding.
//
// A bank statement cannot see any of it. The £100 taken off a £500 job never touches his account,
// so the line says £400 and there is nothing in it to read. Only he can tell us, and until this
// change there was nowhere in the product for him to say it, and nothing anywhere that even asked
// whether he works under the scheme.
//
// 🔴 THE INVARIANT EVERY OTHER READER NOW RESTS ON, AND SECTION 1 IS ITS GUARD:
//
//        transactions.amount IS THE GROSS.  transactions.cis_deduction IS THE TAX ALREADY PAID.
//
// handleCIS in the WhatsApp webhook has stored it that way since the beginning. Section 6 of
// test/moneyspine.test.mjs holds the four readers to it. Getting the two columns the wrong way
// round puts a wrong figure into five surfaces on one press, so the arithmetic is tested here and
// the wording is not.
//
// AND THE FOUR THINGS THIS CHANGE MUST NOT DO:
//   2. A man who has not told us he works under CIS must be asked nothing new at all.
//   3. A proposed gross must never be stored without him putting it there himself. Materials come
//      out before the deduction is worked out, so the proposal is arithmetic, not a fact.
//   4. The three rates must not be flattened into "20 percent always".
//   5. The question must not ask for anything the Answer type cannot hold. This file has shipped
//      that mistake twice.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// Node's type stripping cannot follow an extensionless relative import, so the module and every
// file it reaches are staged with the rewrite the engine suites use. See test/subjectrule.test.mjs.
const fixImports = (s) => s.replace(/from '(\.\/[a-zA-Z0-9._-]+)'/g, "from '$1.ts'");
const stage = mkdtempSync(path.join(tmpdir(), 'ciscapture-'));
// ⚠️ EVERY FILE IN THE CHAIN, not just the one under test. lib/reviewpile.ts reaches personal,
// capital, taxengine and money, and a staging list that has to be edited by hand the next time it
// gains an import is a suite that goes red for a reason it was never written to protect.
for (const f of ['receiptconfidence', 'reviewpile', 'personal', 'capital', 'taxengine', 'money', 'vat', 'propertylanes']) {
  writeFileSync(path.join(stage, `${f}.ts`), fixImports(read(`lib/${f}.ts`)));
}
const staged = (f) => import(pathToFileURL(path.join(stage, `${f}.ts`)).href);

const R = await staged('reviewpile');
// lib/circumstances.ts has no imports at all, on purpose, which is what lets a test load it bare.
const C = await import(pathToFileURL(path.join(root, 'lib/circumstances.ts')).href);

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

// ⚠️ PRESENT AND ORDERED, NEVER JUST ORDERED. indexOf(a) < indexOf(b) is true when a is missing
// entirely, because indexOf returns -1. Two guards shipped vacuous on exactly that on 10 August.
function before(hay, a, b) {
  const i = hay.indexOf(a);
  const j = hay.indexOf(b);
  return i !== -1 && j !== -1 && i < j;
}

const round2 = (n) => Math.round(n * 100) / 100;
const pilePage = read('app/app/pile/page.tsx');
const pileRoute = read('app/api/pile/route.ts');
const circSrc = read('lib/circumstances.ts');

console.log('\n--- 1. THE INVARIANT. The gross into amount, the tax into cis_deduction, always ---\n');
{
  // DANNY. The customer section 6 of test/moneyspine.test.mjs is built on, to the penny: turnover
  // £25,400 gross with £4,400 taken, so £21,000 is what actually reached his bank. If the capture
  // path is right, typing the £4,400 off his contractor's statement against the £21,000 his bank
  // shows has to rebuild the exact row that fixture already trusts.
  const danny = R.cisCapture(21000, '4400');
  ok('DANNY: the £21,000 deposit plus the £4,400 taken is a £25,400 job',
    danny !== null && danny.amount === 25400);
  ok('🔴 DANNY: AND THE £4,400 LANDS IN cis_deduction, WHICH IS THE COLUMN EVERY READER LOOKS IN',
    danny.cis_deduction === 4400);
  ok('🔴 DANNY: THE TWO RECONCILE TO THE MONEY THAT ACTUALLY MOVED',
    round2(danny.amount - danny.cis_deduction) === 21000);
  ok('and the patch names the two columns and carries nothing else, so no call site can swap them',
    JSON.stringify(Object.keys(danny).sort()) === '["amount","cis_deduction"]');

  // The year RUN 1 found. 62 payments totalling £34,400 into his bank, £7,200 taken across it.
  const year = R.cisCapture(34400, '7200');
  ok('THE 62 PAYMENTS: £34,400 in the bank and £7,200 taken is £41,600 of turnover',
    year.amount === 41600 && year.cis_deduction === 7200);
  ok('🔴 WHICH IS £7,200 OF TURNOVER THAT WAS MISSING FROM HIS RETURN AND HIS LENDER DOCUMENT',
    year.amount - 34400 === 7200);

  // The whole invariant, swept, on deposits and deductions that are not round numbers, because a
  // swap or a lost penny hides best in figures that divide neatly.
  let wrongWayRound = 0;
  let doesNotReconcile = 0;
  let grossBelowDeposit = 0;
  for (const net of [12.5, 400, 483.27, 1000, 21000, 34400, 99999.99]) {
    for (const taken of [0, 0.01, 3.33, 100, 171.42]) {
      if (taken > R.cisCeiling(net)) continue;
      const p = R.cisCapture(net, String(taken));
      if (p === null) { doesNotReconcile++; continue; }
      if (p.cis_deduction !== round2(taken)) wrongWayRound++;
      if (round2(p.amount - p.cis_deduction) !== round2(net)) doesNotReconcile++;
      if (p.amount < net) grossBelowDeposit++;
    }
  }
  ok('🔴 THE DEDUCTION IS NEVER THE ONE IN amount, on any deposit in the pool', wrongWayRound === 0);
  ok('🔴 AND amount MINUS cis_deduction IS THE DEPOSIT, TO THE PENNY, EVERY TIME', doesNotReconcile === 0);
  ok('a capture can never make the gross smaller than the money that arrived', grossBelowDeposit === 0);

  // The deposit is the fixed point. He types what was TAKEN, and the gross is derived from his own
  // bank row, so a browser cannot send a gross that does not reconcile with anything.
  ok('the form sends what was taken and never a gross',
    /name="cis"/.test(pilePage) && !/name="gross"/.test(pilePage));
  ok('and the route says so in the shape it accepts',
    /cis\?: string \| number;/.test(pileRoute) && !/gross\?: string \| number;/.test(pileRoute));
}

console.log('\n--- 2. A MAN WHO IS NOT IN THE SCHEME IS ASKED NOTHING NEW ---\n');
{
  const rows = [
    { id: 'a', vendor: 'Bloggs Construction', amount: 400, cis_deduction: 0 },
    { id: 'b', vendor: 'Bloggs Construction', amount: 1200, cis_deduction: 0 },
    { id: 'c', vendor: 'Screwfix', amount: -120, cis_deduction: 0 },
  ];

  ok('🔴 HE HAS NOT SAID YES, SO THERE IS NOTHING TO ASK HIM. NOT ONE ROW.',
    R.cisToAsk(rows, false).length === 0);
  ok('and the same rows for a man who HAS said yes are two questions, so the guard is doing work',
    R.cisToAsk(rows, true).length === 2);
  ok('a cost is never asked about either: the scheme takes from what a subcontractor is PAID',
    R.cisToAsk(rows, true).every((a) => a.id !== 'c'));

  // Only an explicit yes is a yes. Everything else is "we have not been told", which is not a
  // licence to put a box in front of a man inviting a figure that does not exist.
  ok('a man who has answered nothing is not under CIS', C.worksUnderCis([]) === false);
  ok('a no is not a yes', C.worksUnderCis([{ key: 'cis', answer: 'no' }]) === false);
  ok('🔴 A SKIP IS NOT A YES EITHER, and a skip is not an answer at all',
    C.worksUnderCis([{ key: 'cis', answer: 'skip' }]) === false);
  ok('🔴 AND A FAILED READ OF HIS ANSWERS IS NOT A YES',
    C.worksUnderCis(null) === false && C.worksUnderCis(undefined) === false);
  ok('another question answered yes does not turn CIS on',
    C.worksUnderCis([{ key: 'married', answer: 'yes' }]) === false);
  ok('and his own yes does', C.worksUnderCis([{ key: 'cis', answer: 'yes' }]) === true);

  // The pile he already had is untouched. CIS is a fact about the MAN, so it is deliberately not a
  // fourth GroupKind: a kind would have to be decided in buildPile, which sees a bank line and
  // cannot know whether the payer was a contractor, and it would ripple through partitionPile,
  // waitingCount, this page and the phone app for a fact none of them own.
  const groups = R.buildPile(rows.map((r) => ({ ...r, category: null })), (v) => v.toLowerCase());
  ok('🔴 THE PILE STILL HAS EXACTLY THREE KINDS, and CIS is not one of them',
    groups.every((g) => ['ask', 'careful', 'income'].includes(g.kind))
    && !/GroupKind =[\s\S]{0,400}?'cis'/.test(read('lib/reviewpile.ts')));
  ok('and the money in groups are grouped exactly as they were, by payer',
    groups.filter((g) => g.kind === 'income').length === 1);

  // On the screen itself: every CIS word hangs off one list, and that list is empty for him.
  ok('the page asks lib/circumstances.ts rather than reading the rows itself',
    pilePage.includes('cisToAsk(rows, worksUnderCis(circRows))'));
  ok('🔴 AND EVERY CIS WORD ON THE SCREEN IS BEHIND cisWaiting, so an empty list draws nothing',
    before(pilePage, 'const cisWaiting', 'cisWaiting.length > 0')
    && (pilePage.match(/name="cis"/g) || []).length === 1
    && before(pilePage, 'cisWaiting.length > 0', 'name="cis"'));
  ok('🔴 AND IT IS ASKED ABOVE THE MONEY IN BUTTONS, because a row he files takes its question with it',
    before(pilePage, 'cisWaiting.length > 0', 'value="income"'));
  ok('the question is a form post like every other decision here, never a link',
    !/href="\/api\/pile/.test(pilePage) && /name="verdict" value="cis"/.test(pilePage));
  ok('and the screen still ships no client script',
    !/'use client'|useState|useEffect|onClick|onChange|onSubmit|<script/.test(pilePage));
}

console.log('\n--- 3. A PROPOSED GROSS IS NEVER STORED WITHOUT HIM ---\n');
{
  // The proposal is real arithmetic and it is worth printing: he knows the deposit, and dividing by
  // 0.8 up a ladder is not a thing to ask of anybody.
  const p = R.cisProposal(400);
  ok('a £400 deposit at the registered rate on labour only is £100 taken off a £500 job',
    p.deduction === 100 && p.gross === 500 && p.net === 400);

  // 🔴 AND OUR OWN FLAGSHIP CIS CUSTOMER IS THE PROOF THAT IT MUST NOT BE PUT IN THE BOX FOR HIM.
  // Danny turned over £25,400 and had £4,400 taken, which is 17.3 percent and not 20, because
  // £3,400 of the job was materials and materials come out before the deduction is worked out.
  const dannyProposal = R.cisProposal(21000);
  ok('🔴 THE PROPOSAL IS WRONG FOR DANNY, by £850 of turnover he never earned',
    dannyProposal.deduction === 5250 && dannyProposal.gross === 26250
    && dannyProposal.gross - 25400 === 850);
  ok('🔴 AND THE CAPTURE IGNORES IT COMPLETELY: what he types is what is stored',
    R.cisCapture(21000, '4400').cis_deduction === 4400
    && R.cisCapture(400, '80').cis_deduction === 80
    && R.cisCapture(400, '80').amount === 480);

  // An empty box is a man who has not answered. Reading it as nought taken would file the deposit
  // as the whole job on his silence, which is the one direction of error that reaches HMRC.
  ok('🔴 AN EMPTY BOX STORES NOTHING AT ALL. It is not a zero',
    R.cisCapture(400, '') === null && R.cisCapture(400, '   ') === null);
  ok('and nor is a word, or a dash, or anything else that is not a figure',
    R.cisCapture(400, 'twenty') === null && R.cisCapture(400, 'none') === null);
  ok('but a typed zero IS an answer, because a man with gross payment status has one to give',
    R.cisCapture(400, '0').cis_deduction === 0 && R.cisCapture(400, '0').amount === 400);
  ok('a pound sign and a comma are him copying his statement, not him being wrong',
    R.cisCapture(21000, '£4,400').cis_deduction === 4400);
  ok('a negative is refused rather than flipped', R.cisCapture(400, '-80') === null);

  // The box on the screen carries no figure. This is the assertion that goes red the day somebody
  // helpfully prefills it, which is the change that would put £850 into Danny's return unread.
  const form = pilePage.slice(pilePage.indexOf('name="cis"'), pilePage.indexOf('name="cis"') + 700);
  ok('🔴 THE BOX IS EMPTY ON THE SCREEN: no defaultValue, no proposal, nothing to press past',
    form.length > 100 && !/defaultValue/.test(form) && !/value=\{c\.proposal/.test(form));
  ok('and the figures are only ever reachable with the sentence that says what they assumed',
    typeof p.assumes === 'string' && p.assumes.length > 60
    && /materials/i.test(p.assumes)
    && pilePage.includes('{c.proposal.assumes}'));
  ok('🔴 THE SCREEN PRINTS THE ASSUMPTION BESIDE THE FIGURE, not underneath the fold',
    before(pilePage, 'c.proposal.gross', '{c.proposal.assumes}'));

  // The ceiling. A figure a digit too long would raise his turnover for ever on one press.
  ok('nothing above the highest rate in the scheme can be true, so it is refused',
    R.cisCapture(400, '171.43') !== null && R.cisCapture(400, '171.44') === null);
  ok('a mistyped £400 against a £400 deposit is refused rather than doubling his turnover',
    R.cisCapture(400, '400') === null);
}

console.log('\n--- 4. THREE RATES, NOT ONE. 20, 30, AND NOTHING AT ALL ---\n');
{
  ok('🔴 THE SENTENCE HE READS CARRIES ALL THREE',
    /20 percent/.test(R.CIS_RATES) && /30 percent/.test(R.CIS_RATES)
    && /gross payment status/.test(R.CIS_RATES));
  ok('and the question in lib/circumstances.ts carries all three in its source',
    (() => {
      const c = C.CIRCUMSTANCES.find((x) => x.key === 'cis');
      return /20 percent/.test(c.source) && /30 percent/.test(c.source)
        && /gross payment status/.test(c.source);
    })());
  ok('🔴 THE SCREEN NEVER RESTATES A RATE OF ITS OWN. It prints the module sentence',
    pilePage.includes('{CIS_RATES}') && !/percent/.test(codeOnly(pilePage)));

  // The ceiling is built from the UNREGISTERED rate, so a man on 30 percent is never told his own
  // deduction is impossible. The proposal is built from the registered one, because that is the
  // common case and it is labelled as an assumption rather than as his figure.
  ok('a man on 30 percent can enter his real deduction and it is accepted',
    R.cisCapture(700, '300') !== null && R.cisCapture(700, '300').amount === 1000);
  ok('🔴 WHICH THE 20 PERCENT PROPOSAL WOULD HAVE CALLED IMPOSSIBLE',
    R.cisProposal(700).deduction === 175 && R.cisCeiling(700) === 300);
  ok('and a man with gross payment status can say nothing was taken',
    R.cisCapture(700, '0').amount === 700);

  // Both rates come from FACTS, which Khoji diffs against GOV.UK every night. A rate typed into
  // this module is a rate that stays at last year's number after an approved change lands.
  const rp = read('lib/reviewpile.ts');
  ok('🔴 THE RATES COME FROM FACTS AND ARE NEVER TYPED IN HERE',
    /FACTS\.cisRegisteredRate/.test(rp) && /FACTS\.cisUnregisteredRate/.test(rp)
    && !/0\.2\b|0\.3\b/.test(codeOnly(rp)));
}

console.log('\n--- 5. THE QUESTION CANNOT BE ANSWERED WITH A VALUE Answer CANNOT HOLD ---\n');
{
  const c = C.CIRCUMSTANCES.find((x) => x.key === 'cis');
  ok('the question exists at all, which until 11 August 2026 it did not', Boolean(c));
  ok('it is one sentence he can answer without looking anything up',
    c.ask.endsWith('?') && c.ask.length < 160);

  // 🔴 THE THIRD OFFENCE THAT DID NOT HAPPEN. This file has twice shipped a question that asked for
  // something Answer cannot hold: the married question asked two facts, and vat_registered asked
  // for a DATE into a type that holds three words, so the date "went nowhere, every time, for
  // everybody". CIS has THREE rates and they cannot live in a yes and a no either.
  ok('🔴 IT ASKS FOR NO DATE, NO FIGURE AND NO RATE. There is no digit in it',
    !/[0-9]/.test(c.ask));
  ok('🔴 NOR ANY OF THE WORDS THAT WOULD MEAN IT WAS ASKING FOR ONE',
    !/\bwhen\b|\bdate\b|how much|what rate|per ?cent|registered for|status/i.test(c.ask));
  ok('and it is one fact, not two: no "and" holding a second question',
    !/\band\b.*\?/.test(c.ask) && (c.ask.match(/\?/g) || []).length === 1);

  // Every answer it can carry round trips over WhatsApp, and nothing else parses at all.
  ok('yes, no and skip round trip through the button id',
    ['yes', 'no', 'skip'].every((a) => {
      const p = C.parseButtonId(C.buttonId('cis', a));
      return p && p.key === 'cis' && p.answer === a;
    }));
  ok('🔴 AND A RATE POSTED AS AN ANSWER IS REFUSED AT THE DOOR, NOT STORED AND IGNORED',
    ['20', '30', 'gross', 'registered', '2026-04-06'].every((v) => C.parseButtonId(`circ_cis_${v}`) === null));

  // Where the rate goes instead, said on the row, because a fact we cannot hold has to have a
  // named home or it is a fact we have quietly decided not to collect.
  ok('🔴 THE ROW SAYS WHERE THE RATE MUST LIVE INSTEAD, rather than leaving it nowhere',
    /cis_subcontractor/.test(circSrc) && /three states/.test(circSrc));
  // ⚠️ THIS ASSERTION REPLACED A VACUOUS ONE, CAUGHT BEFORE THE FIRST SABOTAGE PASS. The first
  // version read `before(circSrc, 'ASKS HIM WHAT WAS ACTUALLY TAKEN', "key: 'cis'") === false`,
  // and the needle was never in the file, so before() returned false for the reason the helper
  // exists to catch and the comparison passed on nothing. The real claim is that the capture path
  // multiplies no payment by any rate, so that is what is read.
  const captureBody = /export function cisCapture[\s\S]*?\n}/.exec(read('lib/reviewpile.ts'))?.[0] ?? '';
  ok('and the capture applies no rate to a payment at all, because materials change the answer',
    captureBody.length > 200 && !/FACTS\./.test(captureBody) && /materials/i.test(R.CIS_ASSUMES));

  // Who it is for. A question built on a premise that is false of him teaches him in one screen
  // that we are running a list at him rather than listening.
  ok('🔴 IT IS GATED TO TRADE INCOME: a man whose whole business is letting has no contractor',
    Array.isArray(c.incomes) && c.incomes.length === 1 && c.incomes[0] === 'trade');
  const landlord = C.unanswered([], { structure: 'sole_trader', income: 'property_only' }).map((x) => x.key);
  const sparky = C.unanswered([], { structure: 'sole_trader', income: 'trade' }).map((x) => x.key);
  const director = C.unanswered([], { structure: 'limited_company', income: 'trade' }).map((x) => x.key);
  ok('a landlord is never asked it', !landlord.includes('cis'));
  ok('🔴 AND THE MAN THIS PRODUCT WAS BUILT FOR IS ASKED IT', sparky.includes('cis'));
  ok('a director is not, because his company reclaims through its payroll and not his January bill',
    !director.includes('cis'));
  ok('it is not a health question and it is not a compliance one, so it is in the money queue',
    c.specialCategory === undefined && c.mtd === undefined && c.worthOrder === 'huge');
  ok('a no is answered with something true rather than with the promise it just made false',
    c.untrueOn?.answer === 'no' && typeof c.untrueOn?.instead === 'string'
    && c.untrueOn.instead.length > 40);
}

console.log('\n--- 6. THE ROUTE FILES NOTHING UNTIL BOTH COLUMNS CAN BE WRITTEN ---\n');
{
  // The route is run for real against stubs, so these are assertions about what it DOES.
  const rStage = mkdtempSync(path.join(tmpdir(), 'ciscapture-route-'));
  const put = (name, body) => writeFileSync(path.join(rStage, name), body);
  // The real files for everything the route asks a question of. A stub of lib/reviewpile.ts would
  // be a test of the stub, and this branch is about what the pile decides.
  for (const f of ['receiptconfidence', 'reviewpile', 'personal', 'capital', 'taxengine', 'money', 'vat', 'circumstances', 'propertylanes']) {
    put(`${f}.ts`, fixImports(read(`lib/${f}.ts`)));
  }
  put('nextserver.ts', `
export class NextRequest {}
export const NextResponse = {
  json(body, init) { return { kind: 'json', status: (init && init.status) || 200, body }; },
  redirect(url, status) { return { kind: 'redirect', status, location: String(url) }; },
};
`);
  put('webauth.ts', "export async function sessionUser() { return { id: 'u-1' }; }\n");
  put('ratelimit.ts', 'export async function rateLimitedShared() { return false; }\n');
  put('gateserver.ts', `
export async function gateForUser() { return 'ok'; }
export function refuseUnentitled() { return { kind: 'json', status: 402, body: { error: 'locked' } }; }
`);
  put('memory.ts', 'export function normaliseVendor(v) { return String(v || "").toLowerCase(); }\n');
  put('categories.ts', `
export const CATEGORIES = ['materials'];
export function categoriseBankLine() { return 'materials'; }
`);
  put('supabase.ts', `
export const state = { rows: [], calls: [] };
const log = (fn, extra) => { state.calls.push({ fn, ...extra }); };
export async function pileEntries() { return state.rows; }
export async function readOwnNames() { return []; }
export async function readAccountUse() { return 'mixed'; }
export async function confirmPile(userId, ids, category) { log('confirmPile', { ids, category }); return ids.length; }
// RUN 2: a property cost files through its own door, so the stub has to offer it or the route
// cannot even be imported. See lib/propertylanes.ts.
export async function confirmPileProperty(userId, ids, category) { log('confirmPileProperty', { ids, category }); return ids.length; }
export async function confirmIncome(userId, ids, kind) { log('confirmIncome', { ids, kind }); return ids.length; }
export async function setManyPersonal(userId, ids) { log('setManyPersonal', { ids }); return ids.length; }
export async function learnVendor() { log('learnVendor', {}); return true; }
export async function setCapitalKind() { log('setCapitalKind', {}); return true; }
export async function readVatProfile() { log('readVatProfile', {}); return null; }
export async function confirmTransactionVat() { log('confirmTransactionVat', {}); return true; }
export async function readCircumstances() { return state.circumstances ?? [{ key: 'cis', answer: 'yes' }]; }
// The real one is an atomic PATCH guarded on the row's own amount and on cis_deduction being null.
// The stub records exactly what the route handed it, because the whole point of the assertions
// below is WHICH figure lands in WHICH column.
export async function recordCisOnIncome(userId, id, expectedNet, patch) {
  log('recordCisOnIncome', { id, expectedNet, patch });
  return state.cisWriteFails ? 0 : 1;
}
`);
  put('route.ts', read('app/api/pile/route.ts')
    .replace(/from 'next\/server'/g, "from './nextserver.ts'")
    .replace(/from '(?:\.\.\/)+lib\/([a-zA-Z]+)'/g, "from './$1.ts'"));

  const RT = await import(pathToFileURL(path.join(rStage, 'route.ts')).href);
  const DB = await import(pathToFileURL(path.join(rStage, 'supabase.ts')).href);

  const ID = '11111111-2222-4333-8444-555555555555';
  const PAYMENT_IN = { id: ID, vendor: 'Bloggs Construction', description: null, amount: 400, category: null, looks_personal: false };

  const post = async (fields, rows = [PAYMENT_IN], circumstances = [{ key: 'cis', answer: 'yes' }]) => {
    DB.state.calls.length = 0;
    DB.state.rows = rows;
    DB.state.circumstances = circumstances;
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
    const res = await RT.POST({
      url: 'https://lekhio.app/api/pile',
      headers: new Headers({ 'content-type': 'application/x-www-form-urlencoded' }),
      formData: async () => fd,
    });
    return { res, calls: DB.state.calls };
  };
  const did = (calls, fn) => calls.filter((c) => c.fn === fn);

  {
    // ⚠️ REWRITTEN 11 AUGUST 2026, EVENING. This block used to assert that a CIS answer filed
    // NOTHING, because the first design needed a migration before either column could be written
    // and a half fix that put the turnover right while losing the tax already paid would have been
    // the vat_registered date all over again. The refusal was correct for as long as it stood and
    // it is now obsolete: recordCisOnIncome() writes BOTH columns in one guarded PATCH and needs no
    // DDL. So the assertions move from "it files nothing" to "it files exactly the right two
    // figures", which is the claim that actually protects his books.
    const { res, calls } = await post({ ids: ID, verdict: 'cis', cis: '100' });
    const wrote = did(calls, 'recordCisOnIncome');
    ok('🔴 A CIS ANSWER IS WRITTEN, ONCE, THROUGH THE ONE FUNCTION THAT CAN DO IT ATOMICALLY',
      wrote.length === 1);
    ok('🔴 THE GROSS GOES IN amount: £400 banked plus £100 taken is £500 of turnover',
      wrote[0]?.patch?.amount === 500);
    ok('🔴 AND THE TAX ALREADY PAID GOES IN cis_deduction, NOT INTO HIS COSTS',
      wrote[0]?.patch?.cis_deduction === 100);
    ok('🔴 AND THE DEPOSIT STILL RECONCILES: amount less the deduction is what hit the bank',
      wrote[0].patch.amount - wrote[0].patch.cis_deduction === 400);
    ok('the row\'s own amount is handed over as the optimistic guard, read server side',
      wrote[0]?.expectedNet === 400);
    ok('🔴 THE MONEY IS NEVER TAKEN FROM THE BROWSER: only the id and what he typed are posted',
      !/body\.amount|body\.gross|body\.net/.test(pileRoute));
    ok('it does not ALSO file through confirmIncome, which would be two writes on one press',
      did(calls, 'confirmIncome').length === 0 && did(calls, 'confirmPile').length === 0);
    ok('and it does not quietly strike the payment out either',
      did(calls, 'setManyPersonal').length === 0);
    ok('nor teach a rule about a customer who pays him',
      did(calls, 'learnVendor').length === 0);
    ok('he is sent back to the pile with a 303, so a refresh cannot repeat it',
      res.kind === 'redirect' && res.status === 303);
    ok('🔴 AND A WRITE THAT MATCHED NO ROWS IS NOT REPORTED AS A SUCCESS',
      /applied \? 'ok' : 'cisbad'/.test(pileRoute));
  }
  {
    // A man who never said he is in the scheme cannot post one, page or no page.
    const { res, calls } = await post({ ids: ID, verdict: 'cis', cis: '100' }, [PAYMENT_IN], []);
    ok('🔴 A MAN WHO NEVER SAID HE WORKS UNDER CIS IS REFUSED AT THE DOOR, not just on the screen',
      did(calls, 'recordCisOnIncome').length === 0 && res.location.includes('done=nocis'));
  }
  {
    // One payment, one statement, one figure. A group would put one deduction on every row in it.
    const { calls } = await post({ ids: `${ID},22222222-2222-4333-8444-555555555555`, verdict: 'cis', cis: '100' });
    ok('🔴 A CIS FIGURE IS NEVER APPLIED TO A GROUP: one payment, one contractor statement',
      did(calls, 'recordCisOnIncome').length === 0);
  }
  {
    // The verdict is on the allowlist, so it can never be read as the plain file button and sent
    // down the business path with a category attached to it.
    const { calls } = await post({ ids: ID, verdict: 'cis', category: 'materials', cis: '100' });
    ok('🔴 A CIS POST CAN NEVER FALL THROUGH INTO THE FILE A COST PATH, whatever else is on it',
      did(calls, 'confirmPile').length === 0);
    // ⚠️ THE WHOLE ALLOWLIST, PINNED, so a verdict added quietly shows up here as a red rather
    // than as a new path nobody reviewed. RUN 2 added 'confirm_read': the one tap over rows read
    // off photographs, kept separate from confirm_known because a machine read amount and a bank
    // line's amount are different kinds of evidence. See lib/reviewpile.ts.
    // Then 'confirm_unsure', 13 August: a reading the model itself said it struggled with is a
    // different question again, so a yes about eight crisp receipts cannot carry a ninth faded one.
    // This guard went red when it was added, which is the guard working.
    ok('and the word is on the verdict allowlist rather than being read as business',
      /'personal', 'confirm_known', 'confirm_read', 'confirm_unsure', 'income', 'vat', 'cis'/.test(pileRoute));
  }
  {
    // CONTROL. Every other decision on this screen behaves exactly as it did.
    const { calls, res } = await post({ ids: ID, verdict: 'income', category: 'income' });
    ok('CONTROL: a plain money in confirm still files, through confirmIncome, exactly as before',
      did(calls, 'confirmIncome').length === 1 && did(calls, 'confirmIncome')[0].kind === 'income'
      && res.location.includes('done=incomefiled'));
  }

  // The route still writes nothing itself, and the two columns are named where the next person
  // will look for them.
  ok('the route calls lib and never the database', !/\bfetch\s*\(/.test(pileRoute) && !/rest\/v1/.test(pileRoute));
  // 🔴 AND THE COLUMN IS NAMED WHERE THE QUESTION IS TURNED ON. pileEntries lists its columns one
  // by one, so a column nobody names arrives undefined however well the screen is written, and the
  // page draws the question only for a row that can carry the answer.
  ok('🔴 THE PILE READ NAMES cis_deduction, which is what lets the question be drawn at all',
    /select=id,vendor,description,amount,category,looks_personal,vat_amount,vat_confirmed,cis_deduction/
      .test(read('lib/supabase.ts')));
  // The guards that make a bare PATCH as safe as the rpc would have been. Each one is a WHERE
  // clause in the same statement as the write, so none of them is a client side suggestion.
  const sb = read('lib/supabase.ts');
  // ⚠️ ANCHORED ON THE DECLARATION, AND IT WAS NOT AT FIRST. Sabotage caught it: the name also
  // appears in a comment on pileEntries, and that comment sits within 1600 characters of a select
  // carrying user_id=eq., so deleting the real tenancy guard left this assertion green on the wrong
  // function. Third vacuous assertion found this way today.
  ok('🔴 THE WRITE IS SCOPED TO HIS OWN BOOKS', /export async function recordCisOnIncome[\s\S]{0,1600}?user_id=eq\./.test(sb));
  ok('🔴 AND GUARDED ON THE AMOUNT THE PAGE ACTUALLY SHOWED HIM, so a moved row is refused',
    /export async function recordCisOnIncome[\s\S]{0,1600}?amount=eq\.\$\{expectedNet\.toFixed\(2\)\}/.test(sb));
  ok('🔴 AND A DEDUCTION CAN NEVER BE APPLIED TWICE, whatever a back button does',
    /export async function recordCisOnIncome[\s\S]{0,2200}?or=\(cis_deduction\.is\.null,cis_deduction\.eq\.0\)/.test(sb));
  // Once a real figure is in the column it is neither null nor zero, so the guard above still
  // refuses the second press. Zero is treated as unrecorded, never as an answer, and the screen
  // says so in words: leave it blank if nothing was taken off it.
  ok('and a recorded deduction is outside the guard, so the second press matches no rows',
    /leave it blank|Leave one blank/i.test(read('app/app/tax/cis/page.tsx')));
  ok('the invariant is re-checked at the write, not merely trusted from the caller',
    /patch\.amount - patch\.cis_deduction\) - expectedNet\) > 0\.005/.test(sb));

  // The screen does not draw a question the row cannot answer, so nobody meets that refusal. Same
  // shape the VAT columns shipped in on 1 August 2026: one line in the select turns it on.
  ok('🔴 A ROW THAT CANNOT CARRY THE ANSWER IS NEVER ASKED ABOUT',
    R.cisToAsk([{ id: 'x', vendor: 'Bloggs', amount: 400 }], true).length === 0);
  ok('and one that can is', R.cisToAsk([{ id: 'x', vendor: 'Bloggs', amount: 400, cis_deduction: 0 }], true).length === 1);
  ok('a row that already carries a deduction is never asked twice',
    R.cisToAsk([{ id: 'x', vendor: 'Bloggs', amount: 400, cis_deduction: 100 }], true).length === 0);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE PAYMENTS THE PILE WILL NEVER ASK ABOUT AGAIN.
//
// 🔴 THE HALF THAT ACTUALLY FIXED THE CUSTOMER. The pile question was built, proved and shipped,
// and Danny's Overview still read "Put by for tax £3,337" on a January that is a refund, because
// his 62 contractor deposits were confirmed weeks earlier in one bulk import and the pile is
// finished with them for ever. Fixing the engine did not fix the man.
//
// And it is not an edge case. A contractor has 14 days after the end of the tax month to hand over
// a payment and deduction statement, so the money lands first and the paperwork follows. The day
// he can answer is routinely weeks after the day he confirmed the payment.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n7. Recording a deduction against money he confirmed long ago\n');
{
  const sb = read('lib/supabase.ts');
  const page = read('app/app/tax/cis/page.tsx');
  const route = read('app/api/cis/route.ts');

  ok('🔴 THERE IS A READER FOR CONFIRMED INCOME CARRYING NO DEDUCTION', /export async function incomeRowsWithoutCis/.test(sb));
  ok('and it looks at CONFIRMED rows, which is the whole point of it',
    /incomeRowsWithoutCis[\s\S]{0,900}?confirmed=eq\.true/.test(sb));
  // 🔴 NULL OR ZERO. Found by walking production on 11 August: the column defaults to 0, so every
  // row that came in off a bank import carries a real zero and an is.null test matched nothing.
  // The screen shipped, drew nothing at all, and every suite here was green. A stub decides its
  // own column defaults, which is exactly why this class of defect survives a test suite.
  ok('🔴 AND AT ROWS WITH NOTHING RECORDED YET, WHICH IS NULL OR ZERO, NOT NULL ALONE',
    /incomeRowsWithoutCis[\s\S]{0,1400}?or\(cis_deduction\.is\.null,cis_deduction\.eq\.0\)/.test(sb)
    && !/incomeRowsWithoutCis[\s\S]{0,1400}?&cis_deduction=is\.null&/.test(sb));
  ok('🔴 AND RENT IS EXCLUDED WITHOUT DROPPING EVERY TRADE ROW WITH IT',
    /or\(income_type\.is\.null,income_type\.neq\.property\)/.test(sb)
    && !/&income_type=not\.eq\.property/.test(sb));

  ok('the CIS screen offers the question', /Was CIS taken off these/.test(page));
  ok('🔴 AND ONLY TO A MAN WHO SAID HE IS IN THE SCHEME', /worksUnderCis\(/.test(page));
  ok('doc 103 empty test: no section at all when there is nothing to record',
    /missing\.length > 0 \?/.test(page));
  ok('🔴 THE FIGURE IS PRINTED BESIDE THE BOX AND NEVER INTO IT, so a guess is never agreed by a press',
    /placeholder="0\.00"/.test(page) && !/defaultValue=\{[^}]*deduction/.test(page));
  ok('the three rates are named, never flattened to twenty percent', /CIS_RATES/.test(page));
  ok('one form per payment, so one statement is never applied to another payment',
    /missing\.map\(\(r\) => \{/.test(page) && /<form key=\{r\.id\}/.test(page));

  ok('the door checks the scheme answer itself, because a page is a suggestion',
    /worksUnderCis\(answers\)/.test(route));
  ok('🔴 THE MONEY IS READ SERVER SIDE: the browser sends an id and what he typed, never an amount',
    /incomeRowsWithoutCis\(/.test(route) && !/body\?\.amount|f\.get\('amount'\)/.test(route));
  ok('it writes through the one atomic function and nothing else',
    /recordCisOnIncome\(/.test(route) && !/\bfetch\s*\(/.test(route));
  ok('🔴 A REFUSED WRITE IS NOT DRESSED AS A SAVE', /applied \? 'saved' : 'gone'/.test(route));
  ok('read only stops it, exactly where it stops the pile', /refuseUnentitled\(/.test(route));
  ok('and the route has a decision in the paywall table',
    /route: 'app\/api\/cis'/.test(read('lib/gate.ts')));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE HERO BELONGS TO THE YEAR ON SCREEN.
//
// 🔴 FOUND 12 AUGUST 2026 BY PRESSING THE CHOOSER THAT SHIPPED THE DAY BEFORE. The year travelled
// through the form, the route, and the redirect. It did not travel to the top of the page. The hero
// was ledgerFor().refundDue, which is the live year and only ever the live year, under a heading
// that read "CIS taken off your pay this year" whichever chip was lit.
//
// So the 2025/26 screen showed £2,800 of 2026/27 money, labelled this year, directly above thirty
// six unanswered 2025/26 payments. He fills one in, lands back on the year he was on, and the big
// number does not move, because it never could. That is indistinguishable from the write failing,
// and preventing exactly that misreading is the reason y is carried through the form at all.
//
// ⚠️ AND THE REFUND PROJECTION BENEATH IT WAS WORSE THAN STALE. cis_refund is a running estimate
// of the year in progress. Printed over a finished year it answers a question about the return due
// this January with a guess about next January's.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n8. The figure at the top is the year he is looking at\n');
{
  const sb = read('lib/supabase.ts');
  const page = read('app/app/tax/cis/page.tsx');

  ok('🔴 THERE IS A READER FOR A YEAR THE LEDGER DOES NOT MODEL',
    /export async function cisRecordedForYear\(/.test(sb));
  ok('and it sums recorded deductions only, so an unanswered year cannot read as a refund',
    /export async function cisRecordedForYear\([\s\S]{0,1200}?cis_deduction=gt\.0/.test(sb));
  ok('over his own confirmed business income, the same window the list uses',
    /export async function cisRecordedForYear\([\s\S]{0,1200}?user_id=eq\./.test(sb)
    && /export async function cisRecordedForYear\([\s\S]{0,1200}?confirmed=eq\.true&is_personal=eq\.false/.test(sb)
    && /export async function cisRecordedForYear\([\s\S]{0,1200}?transaction_date=gte\./.test(sb)
    && /export async function cisRecordedForYear\([\s\S]{0,1200}?transaction_date=lte\./.test(sb));
  ok('🔴 A FAILED READ IS ZERO, NEVER A NUMBER THE DATABASE NEVER SAID',
    /export async function cisRecordedForYear\([\s\S]{0,1400}?if \(!res\.ok\) return 0;/.test(sb)
    && /export async function cisRecordedForYear\([\s\S]{0,1600}?\} catch \{\n {4}return 0;/.test(sb));

  // The live year keeps coming from the ledger. The comment at the top of the page has stood since
  // this product quoted a man a refund that did not exist, and a second reader over the live number
  // is the thing it forbids. The prior year has no first reader to disagree with.
  ok('🔴 THE PRIOR YEAR READER IS ONLY REACHED ON A PRIOR YEAR',
    /priorYear\s*\n?\s*\? await cisRecordedForYear\(/.test(page));
  ok('🔴 AND THE LIVE YEAR IS STILL THE LEDGER, NOT A SECOND OPINION ON THE SAME MONEY',
    /: l\.refundDue;/.test(page));
  ok('which year is decided against the live one, not against the chooser bounds',
    /const priorYear = year !== liveYear;/.test(page));

  ok('🔴 THE HEADING NAMES THE YEAR RATHER THAN ASSERTING THIS ONE',
    /CIS taken off your pay \{priorYear \? `in \$\{yearLabel\}` : 'this year'\}/.test(page));
  ok('🔴 AND THE FIGURE UNDER IT IS THE ONE THAT MATCHES THAT HEADING',
    /lek-hero">\{gbp0\(shownCis\)\}/.test(page)
    && !/lek-hero">\{gbp0\(l\.refundDue\)\}/.test(page));
  ok('the card is drawn on what is shown, so an empty prior year is not hidden behind a live total',
    /\{shownCis > 0 \? \(/.test(page) && !/\{l\.refundDue > 0 \? \(/.test(page));
  ok('and the empty state names the year too, because "this year" was the whole bug',
    /No CIS deductions on your books \{priorYear \? `for \$\{yearLabel\}` : 'this year'\}/.test(page));

  ok('🔴 THE LIVE YEAR REFUND PROJECTION IS NOT PRINTED OVER A FINISHED YEAR',
    /\{priorYear \? null : \(/.test(page)
    && before(page, '{priorYear ? null : (', 'Where the refund stands'));
  ok('and the projection is still drawn for the year it describes',
    /refundBuilding \? \(/.test(page) && before(page, 'Where the refund stands', '{refundBuilding.detail}'));

  // The save notice promises the figures above have moved. Before this fix that sentence was false
  // on every prior year press, which is the same lie the hero was telling, in the confirmation.
  ok('so "your figures above have moved" is now true on both years',
    /Saved\. Your figures above have moved\./.test(page)
    && before(page, 'const shownCis', 'Your figures above have moved'));
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
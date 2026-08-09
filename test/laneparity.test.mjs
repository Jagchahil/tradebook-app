// ═══════════════════════════════════════════════════════════════════════════════════════════
// LANE PARITY: ONE PHRASE, ONE LANE, ON BOTH CHANNELS.
//
// 🔴 WHY THIS SUITE EXISTS. On 8 August 2026, signed in as a sole trader on /app/thread, a man
// typed "when is my tax due" and Lekhio replied:
//
//   "Put by £0.00 for tax. That is what the year is heading for, on everything you have confirmed
//    so far. It is the same figure your Tax screen leads with, and Self Assessment collects it in
//    one bill."
//
// He asked WHEN and was told HOW MUCH, with no date anywhere in the sentence. One minute later, in
// the same chat, "when is the self assessment deadline" came back with 31 January 2027, 7 November
// 2026 and "Has that letter come?". The deadline lane was wired in and working the whole time.
// Only the ORDER was wrong: app/api/thread/route.ts ran matchTotalsQuestion() above
// isDeadlineQuestion(), app/api/whatsapp/route.ts ran them the other way round, and
// matchTotalsQuestion() takes any money word plus one of "how much", "what" or "my", so "my tax"
// handed it both and it ate the message before the deadline lane was ever reached.
//
// 🔴 AND WHY test/waintents.test.mjs DID NOT CATCH IT. That suite asserts
// isDeadlineQuestion('when is my tax due?') is true, and it is true, and it always was. A
// predicate returning the right answer proves nothing about whether the router ever calls it. The
// guard passed for the wrong reason for as long as the defect was live.
//
// 🔴 SO THIS SUITE TESTS THE ROUTERS, NOT THE PREDICATES. It reads both route files OFF DISK,
// works out which of the two gates each file reaches first and whether each gate carries the
// asksAmount tie break, then walks a fixed list of real phrasings through both derived orders and
// requires every phrase to land in the SAME lane on both channels AND in the lane a reader would
// expect. No line numbers are written down anywhere here, so reordering either file, or dropping
// the tie break from one of them, moves the derived order and turns this red.
//
// ⚠️ EXISTENCE IS ASSERTED BEFORE POSITION, EVERY TIME. String.indexOf returns minus one for a
// literal that is not there, minus one is less than every real index, and an ordering assertion
// built on it passes by the absence of the thing it is guarding. That exact trap already bit this
// project once, in test/thread.test.mjs, where a call site was renamed and the clause watching it
// went quietly vacuous. Every marker below is proved present, and proved to appear exactly once,
// before its index is compared with anything.
//
// Run alone with:  node test/laneparity.test.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8');

const W = await import(`${pathToFileURL(path.resolve(repoRoot, 'lib/waintents.ts')).href}`);

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};
const eq = (name, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}\n        got  ${g}\n        want ${w}`); }
};

// Comments are stripped before any index is taken. Both route files now carry comments that NAME
// both gates while explaining this very defect, and a comment mentioning matchTotalsQuestion above
// the deadline gate would otherwise read as the totals lane running first.
const stripComments = (s) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const waCode = stripComments(read('app/api/whatsapp/route.ts'));
const threadCode = stripComments(read('app/api/thread/route.ts'));

// ---------------------------------------------------------------------------------------------
// 1. THE MARKERS EXIST, EXACTLY ONCE EACH, BEFORE ANY INDEX IS USED.
// ---------------------------------------------------------------------------------------------
console.log('\n=== lane parity: the gates are found on disk, not assumed ===\n');

// Each router calls its gates with its own argument name (the webhook's `text`, the chat's `q`),
// which is what makes these markers the ROUTER'S call sites and not the ones inside the handlers
// below them (handleTotals calls matchTotalsQuestion(body), the tax guide flow calls
// isDeadlineQuestion(body)). The "exactly once" assertion is what holds that claim.
const occurrences = (code, needle) => code.split(needle).length - 1;

function markerIndex(label, code, needle) {
  const n = occurrences(code, needle);
  ok(`${label}: \`${needle}\` EXISTS in the router`, n > 0);
  ok(`${label}: ...and appears exactly once, so its index names one call site`, n === 1);
  return n === 1 ? code.indexOf(needle) : null;
}

const waDeadlineAt = markerIndex('whatsapp deadline gate', waCode, 'isDeadlineQuestion(text)');
const waTotalsAt = markerIndex('whatsapp totals gate', waCode, 'matchTotalsQuestion(text)');
const thDeadlineAt = markerIndex('thread deadline gate', threadCode, 'isDeadlineQuestion(q)');
const thTotalsAt = markerIndex('thread totals gate', threadCode, 'matchTotalsQuestion(q)');

const allFound = [waDeadlineAt, waTotalsAt, thDeadlineAt, thTotalsAt].every((i) => i !== null);
ok('🔴 all four gates were located, so the orders below are derived and not vacuous', allFound);

// ---------------------------------------------------------------------------------------------
// 2. THE LANE ORDER IS DERIVED FROM THOSE INDICES.
// ---------------------------------------------------------------------------------------------
// Never a line number. A file can grow a hundred lines above either gate and this still reads the
// same, and a lane swapped in either file reads differently the moment it happens.
const orderOf = (deadlineAt, totalsAt) => (deadlineAt < totalsAt
  ? ['deadline', 'totals']
  : ['totals', 'deadline']);

const waOrder = allFound ? orderOf(waDeadlineAt, waTotalsAt) : null;
const thOrder = allFound ? orderOf(thDeadlineAt, thTotalsAt) : null;

console.log('\n=== lane parity: the two derived orders ===\n');
console.log(`  whatsapp: ${waOrder ? waOrder.join(' then ') : 'NOT DERIVED'}`);
console.log(`  thread:   ${thOrder ? thOrder.join(' then ') : 'NOT DERIVED'}\n`);

eq('the webhook reaches the deadline gate before the totals gate', waOrder, ['deadline', 'totals']);
eq('🔴 and so does the chat, which is the whole fix', thOrder, ['deadline', 'totals']);
eq('the two channels run the two lanes in the SAME order', waOrder, thOrder);

// ---------------------------------------------------------------------------------------------
// 3. THE TIE BREAK IS DERIVED FROM DISK TOO, PER CHANNEL.
// ---------------------------------------------------------------------------------------------
// asksAmount() is what stops the deadline lane, now that it runs first, from eating a man asking
// for a figure ("how much tax is due on 31 January"). A channel that drops it widens its deadline
// lane, its phrases move, and the comparison below goes red on that channel alone.
const waGuarded = /isDeadlineQuestion\(text\)\s*&&\s*!asksAmount\(text\)/.test(waCode);
const thGuarded = /isDeadlineQuestion\(q\)\s*&&\s*!asksAmount\(q\)/.test(threadCode);

ok('the webhook gates its deadline lane on !asksAmount', waGuarded);
ok('the chat gates its deadline lane on !asksAmount', thGuarded);
ok('🔴 both channels carry the tie break, or neither does', waGuarded === thGuarded);
ok('asksAmount is imported from lib/waintents by both routers, so there is ONE definition',
  /\basksAmount\b/.test(waCode.slice(0, waCode.indexOf('export async function')))
  && /\basksAmount\b/.test(threadCode.slice(0, threadCode.indexOf('export async function'))));
// A router that re-declared the rule locally would satisfy every gate assertion above while the
// two channels drifted apart word by word. Neither may hold a copy: not the function, and not the
// date shapes that are the only part of it a reader would be tempted to paste.
ok('...and neither router keeps a private copy of the rule',
  !/function asksAmount/.test(waCode) && !/function asksAmount/.test(threadCode)
  && !/date\|day\|time\|month/.test(waCode) && !/date\|day\|time\|month/.test(threadCode));
ok('...while lib/waintents.ts holds the one definition it is imported from',
  (read('lib/waintents.ts').match(/export function asksAmount/g) || []).length === 1);

// ---------------------------------------------------------------------------------------------
// 4. THE PHRASES, HELD BY EQUALITY SO ONE CANNOT BE QUIETLY DROPPED.
// ---------------------------------------------------------------------------------------------
// Every entry is a sentence a customer would actually type. The expected lane is the one a reader
// would give it: a question about a DATE belongs to the deadline lane, a question about a FIGURE
// belongs to the totals lane, and the sentence says which it is.
const CASES = [
  // The reported defect and its immediate family. Each one is BOTH a deadline question and a
  // totals question today, so each one is decided purely by which gate the router reaches first.
  { phrase: 'when is my tax due', lane: 'deadline' },
  { phrase: 'when is my tax return due', lane: 'deadline' },
  { phrase: 'when is my tax bill due', lane: 'deadline' },
  { phrase: 'when is my tax payment due', lane: 'deadline' },
  { phrase: 'by when do i file my tax return', lane: 'deadline' },
  // The same question asked with "what", which is a date word in these two shapes and was being
  // eaten by the totals lane for the same reason "my" was.
  { phrase: 'what date is my tax return due', lane: 'deadline' },
  { phrase: 'what is the deadline for my tax return', lane: 'deadline' },
  // Deadline questions the totals matcher never wanted. They prove the lane still works at all,
  // which is the sentence that came back correctly one minute after the defect was seen.
  { phrase: 'when is the self assessment deadline', lane: 'deadline' },
  { phrase: 'when do i have to file', lane: 'deadline' },
  { phrase: 'when is the next quarterly update due', lane: 'deadline' },

  // 🔴 THE OTHER DIRECTION, WHICH IS WHY THIS FIX IS NOT A SWAP OF TWO LINES. Every phrase below
  // satisfies isDeadlineQuestion(), and every one of them is a man asking for a NUMBER. Putting
  // the deadline lane first without the tie break hands each of them a date instead, which is the
  // reported defect with the hands changed over.
  { phrase: 'how much tax is due', lane: 'totals' },
  { phrase: 'what tax is due', lane: 'totals' },
  { phrase: 'how much tax is due on 31 january', lane: 'totals' },
  { phrase: 'how much tax do i need to put aside before the deadline', lane: 'totals' },
  { phrase: 'what will my tax bill be when it is due', lane: 'totals' },
  // Neither of these is even a tax question. They ask what he earned and what he cleared, with a
  // deadline named only as the point to count up to.
  { phrase: 'how much did i make before the tax return deadline', lane: 'totals' },
  { phrase: 'how much profit before the tax deadline', lane: 'totals' },

  // Plain money questions, which no reordering should ever have touched. They hold the totals lane
  // in place while the deadline lane moves above it.
  { phrase: 'what do i owe', lane: 'totals' },
  { phrase: 'how much tax do i owe', lane: 'totals' },
  { phrase: 'how much tax do i owe by january', lane: 'totals' },
  { phrase: 'how much have i spent this month', lane: 'totals' },
];

// 🔴 HELD BY EQUALITY, NOT BY LENGTH. A count can be kept up by adding an easy phrase while a hard
// one is deleted. This is the literal list, and removing or rewording any entry is a failure that
// names the entry.
eq('the phrase list is exactly the agreed list, in order',
  CASES.map((c) => c.phrase),
  [
    'when is my tax due',
    'when is my tax return due',
    'when is my tax bill due',
    'when is my tax payment due',
    'by when do i file my tax return',
    'what date is my tax return due',
    'what is the deadline for my tax return',
    'when is the self assessment deadline',
    'when do i have to file',
    'when is the next quarterly update due',
    'how much tax is due',
    'what tax is due',
    'how much tax is due on 31 january',
    'how much tax do i need to put aside before the deadline',
    'what will my tax bill be when it is due',
    'how much did i make before the tax return deadline',
    'how much profit before the tax deadline',
    'what do i owe',
    'how much tax do i owe',
    'how much tax do i owe by january',
    'how much have i spent this month',
  ]);
eq('and every expected lane is one of the two lanes this suite knows about',
  [...new Set(CASES.map((c) => c.lane))].sort(), ['deadline', 'totals']);

// ---------------------------------------------------------------------------------------------
// 5. WALK EVERY PHRASE THROUGH BOTH DERIVED ORDERS.
// ---------------------------------------------------------------------------------------------
// The clock is fixed so a phrase cannot pass on a Tuesday and fail on a Wednesday.
const NOW = new Date('2026-08-09T10:00:00Z');

// The gate predicates, built from what the file on disk actually says. The functions themselves
// come from lib/waintents.ts, so this suite has no second copy of any rule.
const deadlineGate = (guarded) => (phrase) => (guarded
  ? W.isDeadlineQuestion(phrase) && !W.asksAmount(phrase)
  : W.isDeadlineQuestion(phrase));
const totalsGate = (phrase) => W.matchTotalsQuestion(phrase, NOW) !== null;

function laneFor(order, guarded, phrase) {
  if (!order) return 'ORDER NOT DERIVED';
  const gates = { deadline: deadlineGate(guarded), totals: totalsGate };
  for (const lane of order) {
    if (gates[lane](phrase)) return lane;
  }
  return 'neither';
}

console.log('\n=== lane parity: every phrase, both channels ===\n');

const routed = CASES.map((c) => ({
  phrase: c.phrase,
  want: c.lane,
  wa: laneFor(waOrder, waGuarded, c.phrase),
  thread: laneFor(thOrder, thGuarded, c.phrase),
}));

for (const r of routed) {
  ok(`"${r.phrase}" is the ${r.want} lane on WhatsApp`, r.wa === r.want);
  ok(`"${r.phrase}" is the ${r.want} lane in the chat`, r.thread === r.want);
  ok(`🔴 "${r.phrase}" gets ONE answer, not one per channel`, r.wa === r.thread);
}

eq('🔴 every phrase routes identically on both channels',
  routed.filter((r) => r.wa !== r.thread).map((r) => `${r.phrase}: whatsapp=${r.wa} thread=${r.thread}`),
  []);
eq('🔴 and every phrase routes to the lane a reader would give it',
  routed.filter((r) => r.thread !== r.want).map((r) => `${r.phrase}: got ${r.thread} want ${r.want}`),
  []);

// ---------------------------------------------------------------------------------------------
// 6. NOTHING BETWEEN THE TWO GATES ON WHATSAPP EATS ONE OF THESE PHRASES.
// ---------------------------------------------------------------------------------------------
// The webhook is a long else-if chain and the totals gate is not the next branch after the
// deadline gate. A phrase the tie break sends past the deadline lane has to survive every branch
// in between to reach handleTotals, so this walks the ones that are importable pure predicates and
// requires that none of them claims a listed phrase.
console.log('\n=== lane parity: the webhook middle does not swallow them ===\n');

const referral = await import(`${pathToFileURL(path.resolve(repoRoot, 'lib/referral.ts')).href}`);
const between = [
  ['isSetupRequest', (t) => W.isSetupRequest(t)],
  ['matchSalarySet', (t) => W.matchSalarySet(t) !== null],
  ['matchChaseRequest', (t) => Boolean(W.matchChaseRequest(t))],
  ['matchRentIn', (t) => Boolean(W.matchRentIn(t))],
  ['isPropertyQuestion', (t) => W.isPropertyQuestion(t)],
  ['matchGoalSet', (t) => Boolean(W.matchGoalSet(t))],
  ['isGoalDone', (t) => W.isGoalDone(t)],
  ['isGoalQuestion', (t) => W.isGoalQuestion(t)],
  ['matchStudentLoanPlanSet', (t) => Boolean(W.matchStudentLoanPlanSet(t))],
  ['isStudentLoanQuestion', (t) => W.isStudentLoanQuestion(t)],
  ['isNiQuestion', (t) => W.isNiQuestion(t)],
  ['isReferRequest', (t) => referral.isReferRequest(t)],
  ['isSavingsQuestion', (t) => W.isSavingsQuestion(t)],
  ['isWeeklySummaryRequest', (t) => W.isWeeklySummaryRequest(t)],
];

// Each of those names really does sit between the two gates in the file, which is checked here
// rather than trusted, and checked by index so a branch moved out from between them is noticed.
for (const [name] of between) {
  const idx = waCode.indexOf(`${name}(text)`);
  ok(`${name} EXISTS in the webhook chain`, idx > -1);
  ok(`...and sits between the two gates`, idx > -1 && allFound && idx > waDeadlineAt && idx < waTotalsAt);
}

const swallowed = [];
for (const c of CASES.filter((x) => x.lane === 'totals')) {
  for (const [name, f] of between) {
    if (f(c.phrase)) swallowed.push(`${c.phrase} taken by ${name}`);
  }
}
eq('no money phrase is taken by a branch between the two gates', swallowed, []);

// isExpenseCheck is private to the route file, so its trigger is read OUT of the file rather than
// copied here, and the phrases are proved to carry none of the words it needs.
const claimWordsSrc = waCode.match(/const CLAIM_WORDS = \/([^\n]+?)\/i;/);
ok('the expense checker\'s trigger was read out of the route file', Boolean(claimWordsSrc));
if (claimWordsSrc) {
  const claimWords = new RegExp(claimWordsSrc[1], 'i');
  eq('and no listed phrase carries a claim word, so the expense checker cannot take one',
    CASES.filter((c) => claimWords.test(c.phrase)).map((c) => c.phrase), []);
}

// ---------------------------------------------------------------------------------------------
// 7. THE HOUSE RULES.
// ---------------------------------------------------------------------------------------------
console.log('\n=== lane parity: house rules ===\n');

ok('🔴 the chat still passes a null MTD position, because article 9 keeps that fact off this surface',
  /mtdPosition: null/.test(threadCode) && !/circumstances/i.test(threadCode));
ok('...and the deadline answer in the chat still gets the asker, not an empty call',
  !/deadlineAnswer\(\s*\)/.test(threadCode) && /structure: optimiser\?\.businessType \?\? null/.test(threadCode));
ok('the chat still answers deterministically before the model is ever asked',
  allFound && thDeadlineAt < threadCode.indexOf('answerMoneyQuestion(q')
  && thTotalsAt < threadCode.indexOf('answerMoneyQuestion(q'));
// U+2013 and U+2014 by code point, so the house rule against those two characters is enforced by a
// file that does not itself contain either of them.
ok('no em dash and no en dash in any phrase', CASES.every((c) => !/[\u2013\u2014]/.test(c.phrase)));
ok('no hyphen used as a dash in any phrase either', CASES.every((c) => !/\s-\s/.test(c.phrase)));
ok('and not one phrase names a domain that is not ours',
  CASES.every((c) => !/lekhio\.(co|net|org|io)/i.test(c.phrase)));

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

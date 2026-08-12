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

// ---------------------------------------------------------------------------------------------
// 8. THREE ROUTERS, NOT TWO. THE LANES THAT MUST EXIST ON EVERY SURFACE THAT ANSWERS A QUESTION.
// ---------------------------------------------------------------------------------------------
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY THIS SECTION EXISTS, AND WHY THIS SUITE OF ALL SUITES WAS THE ONE THAT MISSED IT.
//
// This file was written to stop one phrase getting two answers on two channels. It has said "both
// channels" since the day it was written. THERE ARE THREE. app/api/ask is the in app accountant,
// it takes a typed question and returns an answer, and it was never in the comparison at all.
//
// So on 11 August RUN 1 closed two findings by building deterministic lanes, wiring them into
// app/api/thread, proving them by unit test and sabotage, and shipping. On 12 August the same two
// questions were put to the other two routers, live, and both fell through to the model:
//
//   "how do I delete all my data?"   ->  /api/ask: "usually under something like Settings,
//                                        Account, or Privacy", then "contact Lekhio support
//                                        directly". A guess about a door that exists, and the
//                                        exact support queue the finding was raised to remove.
//                                        AND IT SPENT ONE OF HIS SIX QUESTIONS FOR THE DAY.
//
//   "should I buy the van through the business or claim mileage?"
//                                    ->  /api/ask: a generic two routes answer that had never
//                                        heard of the vehicle already in his books.
//
// A lane is not shipped when it is written. It is shipped when every door that can be asked the
// question runs it. So the table below is the rule, the routers are read off disk, and adding a
// fourth answering surface without adding it here goes red on the file list, not silently.
//
// ⚠️ THIS IS A TABLE OF THE LANES THAT MUST BE EVERYWHERE, NOT OF EVERY LANE. Most of what
// lib/waintents.ts exports is about the WhatsApp channel itself: STOP and START, an acknowledgement
// of a receipt, "delete the last one". Those have no meaning in a box on a web page and requiring
// them there would make this suite go red for a reason it does not believe in. The bar for this
// table is narrow and it is written down: the answer must be one where being WRONG on a surface is
// a breach or an irreversible decision, never merely a worse reply.
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== lane parity: three routers ===\n');

// ⚠️ THE IMPORT BLOCK IS CUT OFF FIRST, AND THE FIRST DRAFT OF THIS SECTION IS THE REASON.
//
// It asserted that each router file CONTAINS the words isDataRightsRequest and vehicleAnswer.
// Sabotage replaced every call site with `false` on all three routers in turn and the suite stayed
// green all six times, because the names were still up in the import list. An import is not a
// wiring. It is a name a file happens to know, and this suite had just spent seven sections saying
// that a predicate returning the right answer proves nothing about whether the router calls it.
//
// So the imports go, and every marker below is a CALL, with that router's own argument name in it.
// Walks the prologue rather than searching for the last `from '...'` anywhere in the file, which
// is what the second draft did and it cut nine tenths of every router away. Comments are already
// stripped, so the prologue is exactly the run of import statements at the top, single line and
// multi line, and it ends at the first line of real code.
function cutImports(s) {
  const lines = s.split('\n');
  let depth = 0;
  let end = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i].trim();
    if (depth === 0 && t === '') continue;
    if (depth === 0 && !t.startsWith('import')) break;
    depth += (lines[i].match(/\{/g) ?? []).length - (lines[i].match(/\}/g) ?? []).length;
    end = i + 1;
  }
  return lines.slice(end).join('\n');
}
const askCode = stripComments(read('app/api/ask/route.ts'));
const ROUTERS = [
  ['whatsapp', cutImports(waCode), 'text'],
  ['thread', cutImports(threadCode), 'q'],
  ['ask', cutImports(askCode), 'question'],
];

ok('🔴 ALL THREE ANSWERING ROUTERS WERE READ, and each is a real file with a POST handler',
  ROUTERS.length === 3
  // The open paren matters. POST is a prefix of POSTX, and the first draft of this line called a
  // renamed handler a router.
  && ROUTERS.every(([, code]) => code.length > 500 && /export async function POST\(/.test(code)));
ok('...and cutting the imports did not cut the body away with them',
  ROUTERS.every(([, code]) => code.includes('await')));

// ⚠️ THE DISPATCH SITE IS NAMED PER ROUTER, NOT DERIVED FROM THE ARGUMENT NAME.
//
// The third draft used one shape, `isDataRightsRequest(<that router's arg>)`, and sabotage killed
// the webhook's dispatch branch without turning it red: the webhook calls the same predicate a
// second time inside alwaysAnswered(), the paywall exemption list, and that call kept the marker
// alive. A router that exempts a question from the paywall and then has nothing to answer it with
// is not a wired lane, it is a hole with a note on it.
//
// The three routers genuinely have three shapes, an else if chain, an early return and an
// assignment, so the honest thing is to write down which line is the dispatch on each.
const EVERYWHERE = [
  {
    lane: 'his data rights',
    sites: {
      whatsapp: '} else if (isDataRightsRequest(text)) {',
      thread: 'if (isDataRightsRequest(q)) return DATA_RIGHTS_ANSWER;',
      ask: 'if (!truth && isDataRightsRequest(question)) truth = DATA_RIGHTS_ANSWER;',
    },
    why: 'a wrong answer to "erase me" is a breach, and it must never be metered or refused for money',
  },
  {
    lane: 'the vehicle question',
    sites: {
      whatsapp: '} else if (isVehicleQuestion(text)) {',
      thread: 'if (isVehicleQuestion(q)) {',
      ask: 'if (!truth && isVehicleQuestion(question)) {',
    },
    why: 'the choice is locked for as long as he owns it, so a generic card is an irreversible wrong turn',
  },
  {
    lane: 'product truth',
    sites: {
      whatsapp: 'matchProductTruth(text) !== null',
      thread: 'matchProductTruth(q)',
      ask: 'matchProductTruth(question)',
    },
    why: 'a screenshot of Lekhio claiming HMRC approval is the same problem whichever box it was typed in',
  },
];

for (const { lane, sites, why } of EVERYWHERE) {
  for (const [name, code] of ROUTERS) {
    const site = sites[name];
    ok(`${lane}: DISPATCHED by the ${name} router  (${why})`,
      typeof site === 'string' && code.includes(site));
  }
}

// 🔴 AND IT RUNS BEFORE THE MODEL ON EVERY ONE OF THEM, which is the half that makes it free.
// A lane wired in below the paid call answers correctly and still charges him for the question.
// Each router's own name for the paid call, because they do not share one. Located by indexOf and
// asserted present before any comparison, so a rename turns this red rather than quietly true.
const modelCall = {
  whatsapp: 'answerMoneyQuestion(body',
  thread: 'answerMoneyQuestion(q',
  ask: 'answerAccountantQuestion(',
};
const rightsSite = EVERYWHERE[0].sites;
for (const [name, code] of ROUTERS) {
  const needle = modelCall[name];
  const modelAt = code.indexOf(needle);
  // The DISPATCH site, not any mention. On the webhook the paywall exemption calls the same
  // predicate, and comparing that index with the model's would have compared the wrong two things.
  const laneAt = code.indexOf(rightsSite[name]);
  ok(`${name}: the paid model call \`${needle}\` was located, so the comparison is not vacuous`,
    modelAt !== -1);
  ok(`${name}: ...and the data rights CALL was located too`, laneAt !== -1);
  ok(`🔴 ${name}: HE IS NEVER CHARGED A QUESTION FOR ASKING HOW TO LEAVE`,
    modelAt !== -1 && laneAt !== -1 && laneAt < modelAt);
  // The answer has to be the fixed one. A lane that fires early and then hands the question to the
  // model anyway is the defect wearing the fix's clothes.
  ok(`${name}: and the fixed words are what he gets`, code.includes('DATA_RIGHTS_ANSWER'));
}

// 🔴 AND THE PAYWALL NEVER ANSWERS IT EITHER. Same judgement as erasure, export and the phone
// unplug in lib/gate.ts: letting go is not a feature he can be charged for.
ok('🔴 THE WHATSAPP PAYWALL EXEMPTION NAMES THE DATA RIGHTS LANE',
  /function alwaysAnswered[\s\S]{0,900}?isDataRightsRequest\(text\)/.test(waCode));

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

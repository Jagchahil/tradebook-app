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

// ---------------------------------------------------------------------------------------------
// 6. B16. THE SCOTTISH RATES LANE, ON ALL THREE ROUTERS, BELOW THE FIGURE AND ABOVE THE MODEL.
// ---------------------------------------------------------------------------------------------
// 🔴 WHY THIS SECTION EXISTS, AND IT IS NOT THE REASON THE REST OF THIS SUITE EXISTS. Every lane
// above was wired and then found to be wired on one channel out of two or three. This one was
// written because the MODEL WAS WATCHED DISOBEYING AN INSTRUCTION IT HAD BEEN GIVEN.
//
// B2, 17 August 2026, a live Glasgow sole trader with money in the account. Two answers minutes
// apart on one account: "you're in Scotland so your tax rates are the same as the rest of the UK",
// which is false, and then a band table with a 41% higher rate, a 46% top rate and no advanced rate,
// which matches no tax year in force. 2026/27 Scotland is 19, 20, 21, 42, 45 and 48.
//
// The rule was moved into the prompt block both channels spread on the same day, and
// test/scotland.test.mjs section 2b holds it there. That guard is scoped to WHAT THE MODEL IS TOLD
// and it passed all the way through both of those answers. The lesson written up that day was that
// the scope of a guard is a place a defect can hide. So the question is now answered from code.
//
// THIS SECTION HOLDS THE ROUTING. test/scotland.test.mjs section 2d holds the words.
//
// ⚠️ AND THE ORDER IS THE ASSERTION, NOT JUST THE PRESENCE. Two bounds, and each is a real defect:
//   . BELOW the totals lane, because since J8 "how much should i put by for the taxman" is answered
//     with his figure AND the sentence. Hoisted above it, a man asking for a number gets a rule
//     instead, which is section 2 of this suite's own defect with the hands changed over.
//   . ABOVE the model, because a lane below the paid call answers correctly and still charges him
//     for the question, which is the judgement section 5 applies to the data rights lane.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 6. B16: the Scottish rates lane, derived from all three routers ===\n');

const scotSites = {
  whatsapp: 'isScottishRatesQuestion(text)',
  thread: 'isScottishRatesQuestion(q)',
  ask: 'isScottishRatesQuestion(question)',
};

for (const [name, code] of ROUTERS) {
  const needle = scotSites[name];
  const n = occurrences(code, needle);
  ok(`${name}: \`${needle}\` EXISTS in the router`, n > 0);
  ok(`${name}: ...and exactly once, so its index names one call site`, n === 1);
  const scotAt = n === 1 ? code.indexOf(needle) : -1;

  // The fixed words, from the one file that owns them. A lane that fires and then hands the
  // question to the model anyway is the defect wearing the fix's clothes.
  ok(`${name}: and the fixed words are what he gets, from lib/scotland.ts`,
    code.includes('SCOTTISH_RATES_ANSWER'));

  const modelNeedle = modelCall[name];
  const modelAt = code.indexOf(modelNeedle);
  ok(`${name}: the paid model call was located, so the bound below is not vacuous`, modelAt !== -1);
  ok(`🔴 ${name}: THE SCOTLAND LANE RUNS BEFORE THE MODEL, so it is free and it cannot be ignored`,
    scotAt !== -1 && modelAt !== -1 && scotAt < modelAt);
}

// The lower bound, on the two routers that HAVE a totals lane. /api/ask has none: it reads his
// figures into the model's context rather than answering a totals question from code, so there is
// no figure lane there for this one to undercut, and asserting an order against a gate that does not
// exist is how an ordering check passes by the absence of the thing it guards.
for (const [name, code, arg] of ROUTERS.filter(([n]) => n !== 'ask')) {
  const totalsNeedle = `matchTotalsQuestion(${arg})`;
  const totalsAt = code.indexOf(totalsNeedle);
  const scotAt = code.indexOf(scotSites[name]);
  ok(`${name}: the totals gate \`${totalsNeedle}\` was located`, totalsAt !== -1);
  ok(`🔴 ${name}: AND THE SCOTLAND LANE RUNS BELOW IT, so a man asking HOW MUCH still gets his figure`,
    totalsAt !== -1 && scotAt !== -1 && totalsAt < scotAt);
}

// ---------------------------------------------------------------------------------------------
// 6b. THE MATCHER HEARS THE CUSTOMER, AND EACH ASSERTION TURNS ON ONE THING.
// ---------------------------------------------------------------------------------------------
// 🔴 THE VACUITY RULE, LEARNED THE HARD WAY ON 17 AUGUST. The first B2-F3 guard asked "how much
// should i put by FOR TAX" to prove the matcher heard "put by". "tax" is itself a trigger, so the
// verb could have been anything, five sabotages walked straight through it and a control went red.
//
// So every phrase below carries the signal under test and NO OTHER signal of the same kind. The
// nation phrases name exactly one nation word each. The refusals name exactly one reserved tax.
const isScot = W.isScottishRatesQuestion;
ok('lib/waintents.ts exports isScottishRatesQuestion', typeof isScot === 'function');

// One nation word each, and the subject word is never itself a nation word.
const NATION_PHRASES = [
  ['scotland', 'i live in scotland, are the rates different'],
  ['scottish', 'do i pay the scottish rate of income tax'],
  ['scot', 'am a scot, what are my tax bands'],
  // 🔴 THE ONE THE REAL CUSTOMER TYPED. He opened with "am in glasgow mate" and never once typed
  // the word Scotland. A matcher that only hears the formal noun does not hear him.
  ['glasgow', 'am in glasgow mate do i pay the same income tax as england'],
  ['edinburgh', 'do i pay more tax living in edinburgh'],
  ['aberdeen', 'whats my tax band up here in aberdeen'],
  ['dundee', 'is the tax rate different in dundee'],
];
for (const [word, phrase] of NATION_PHRASES) {
  ok(`  it hears "${word}" on its own: ${JSON.stringify(phrase)}`, isScot(phrase) === true);
}

// 🔴 THE THREE RESERVED TAXES, REFUSED BY THE PREDICATE AND NOT BY ROUTER ORDER. Income tax rates
// and bands above the personal allowance are devolved. National Insurance, VAT and student loan
// repayment are NOT, so answering one of those with an income tax caveat states something false
// about his own figures. app/api/whatsapp/route.ts has lanes for all three ABOVE this one and would
// catch them anyway; app/api/thread/route.ts and app/api/ask/route.ts have none of the three, so
// order protects one channel out of three. The refusal has to live in the predicate.
const RESERVED_REFUSALS = [
  ['national insurance', 'in scotland do i pay the same national insurance'],
  ['ni', 'am in glasgow, is my ni rate the same'],
  ['class 4', 'is class 4 different in scotland'],
  ['vat', 'is vat different in scotland'],
  ['student loan', 'im in scotland which student loan plan am i on'],
  ['postgraduate', 'is my postgraduate loan rate different in scotland'],
];
for (const [word, phrase] of RESERVED_REFUSALS) {
  ok(`  🔴 it REFUSES "${word}", which is reserved and not devolved: ${JSON.stringify(phrase)}`,
    isScot(phrase) === false);
}

// Both halves are required, so neither signal alone can drag a message into this lane.
ok('  a tax question with no nation word is not this lane', isScot('whats the tax rates') === false);
ok('  a nation word with no tax word is not this lane', isScot('am in glasgow mate') === false);

// A money amount calls it off, the same refusal isVatQuestion and isPricing make and for the same
// reason: a figure being logged is not a question about the bands.
ok('  🔴 a money amount calls it off, so an entry is never eaten',
  isScot('paid £40 tax in glasgow') === false);

// ⚠️ AND THE PREDICATE IS NOT COPIED INTO ANY ROUTER. One definition, three callers, or the three
// channels drift apart word by word, which is what this whole suite is for.
ok('🔴 lib/waintents.ts holds the ONE definition',
  (read('lib/waintents.ts').match(/export function isScottishRatesQuestion/g) || []).length === 1);
for (const [name, code] of ROUTERS) {
  ok(`  ${name}: keeps no private copy of the rule`,
    !/function isScottishRatesQuestion/.test(code)
    && !/scotland\|scottish/i.test(code));
}

// ---------------------------------------------------------------------------------------------
// 7. B18. THE VAT LANE, ON ALL THREE ROUTERS, ANSWERED FROM HIS OWN ROWS.
// ---------------------------------------------------------------------------------------------
// 🔴 WHY THIS SECTION EXISTS, AND IT IS THE OLDEST SHAPE IN THIS SUITE. isVatQuestion has existed
// since Run 2 and was dispatched by app/api/whatsapp/route.ts and by nothing else, so a VAT question
// typed into the web chat or the in app accountant was answered by the MODEL.
//
// Asked "am in glasgow, is vat different up here" on 17 August 2026, signed in as a sole trader with
// 77 confirmed entries, the web chat returned: "No, VAT is the same across the UK, including
// Scotland. The threshold is £90,000 rolling 12-month turnover to register, and deregistration at
// £88,000." Every figure in it is correct and was checked against gov.uk live. The defect is that
// none of it is about him. On WhatsApp the same words read his real rolling twelve months and open
// with his own figure and his own headroom, because that is the only part of a threshold answer a
// man can act on, and crossing the line late is a penalty.
//
// ⚠️ THE SITES ARE NAMED PER ROUTER, for the reason section 5 gives: the three routers genuinely
// have three shapes, an else if chain, an early return and an assignment, and deriving one shape
// from the argument name is how a sabotage killed a branch without turning this red.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 7. B18: the VAT lane, derived from all three routers ===\n');

const vatSites = {
  whatsapp: 'isVatQuestion(text)',
  thread: 'isVatQuestion(q)',
  ask: 'isVatQuestion(question)',
};

for (const [name, code] of ROUTERS) {
  const needle = vatSites[name];
  const n = occurrences(code, needle);
  ok(`${name}: \`${needle}\` EXISTS in the router`, n > 0);
  ok(`${name}: ...and exactly once, so its index names one call site`, n === 1);
  const vatAt = n === 1 ? code.indexOf(needle) : -1;

  // 🔴 AND IT IS ANSWERED BY THE ONE READER. A lane that fires and then hands the question to the
  // model anyway is the defect wearing the fix's clothes, and this is the lane where that failure
  // would be invisible: the model's answer to a VAT question is fluent, correct about the statute,
  // and silent about him, which is exactly what was found live.
  ok(`${name}: and the answer comes from lib/vatanswer.ts, not from the model`,
    code.includes('vatAnswerForUser('));

  const modelNeedle = modelCall[name];
  const modelAt = code.indexOf(modelNeedle);
  ok(`${name}: the paid model call was located, so the bound below is not vacuous`, modelAt !== -1);
  ok(`🔴 ${name}: THE VAT LANE RUNS BEFORE THE MODEL, so a man near the line is never metered for it`,
    vatAt !== -1 && modelAt !== -1 && vatAt < modelAt);
}

// The upper bound, on the two routers that HAVE a totals lane. app/api/whatsapp/route.ts has run the
// VAT lane above the totals lane since Run 2 and says why in the chain: "should i register for vat"
// carries a quantity word, so matchTotalsQuestion claims it and answers a registration question with
// a set aside figure. /api/ask has no totals lane at all, so there is nothing there to order against
// and asserting one would pass by the absence of the thing it guards.
for (const [name, code, arg] of ROUTERS.filter(([n]) => n !== 'ask')) {
  const totalsNeedle = `matchTotalsQuestion(${arg})`;
  const totalsAt = code.indexOf(totalsNeedle);
  const vatAt = code.indexOf(vatSites[name]);
  ok(`${name}: the totals gate \`${totalsNeedle}\` was located`, totalsAt !== -1);
  ok(`🔴 ${name}: AND THE VAT LANE RUNS ABOVE IT, so "should i register for vat" is not eaten by it`,
    totalsAt !== -1 && vatAt !== -1 && vatAt < totalsAt);
}

// 🔴 AND ON /api/ask IT RUNS ABOVE THE SHARED CACHE, WHICH IS NOT A STYLE POINT.
//
// qa_cache is keyed on the QUESTION ALONE, with no user id, and is served to every other customer
// who ever asks the same thing. That route's own header spends a paragraph explaining that the
// guarantee has to be STRUCTURAL rather than hopeful: an answer that can be cached is composed with
// no personal input at all. This answer is nothing but personal input. It carries his rolling twelve
// month turnover and his distance from the line.
//
// The lane returns before questionNorm is ever computed, so no path reaches upsertQaCache with it.
// Held by index in both directions, and both markers proved present first.
{
  const askCodeOnly = ROUTERS.find(([n]) => n === 'ask')[1];
  const vatAt = askCodeOnly.indexOf(vatSites.ask);
  const normAt = askCodeOnly.indexOf('const questionNorm = normaliseQuestion(question);');
  const upsertAt = askCodeOnly.indexOf('upsertQaCache(');
  ok('ask: the cache key line was located, so the bound below is not vacuous', normAt !== -1);
  ok('ask: the cache WRITE was located too', upsertAt !== -1);
  ok('🔴 ask: HIS OWN TURNOVER FIGURE IS RETURNED BEFORE THE SHARED CACHE IS EVEN KEYED',
    vatAt !== -1 && normAt !== -1 && vatAt < normAt && vatAt < upsertAt);
}

// ⚠️ AND NO ROUTER ASSEMBLES ANY OF IT. This is the half that makes the parity durable rather than
// momentary: three routers calling one reader while one of them also keeps the sentences is two
// owners again, with a shared function standing next to them looking like the fix. The statutory
// tests, the card fee note and the standing sentence are named here because they are what the
// webhook used to hold, and they are the four things the other two channels never had.
for (const [name, code] of ROUTERS) {
  ok(`  ${name}: keeps no copy of the VAT sentences`,
    !/BACKWARD_TEST/.test(code) && !/FORWARD_TEST/.test(code)
    && !/CARD_FEE_NOTE/.test(code) && !/standingSentence\(/.test(code));
  ok(`  ${name}: and does not read the rows for itself either`,
    !/vatStanding\(/.test(code));
}

// One reader, one predicate, one set of words, each with exactly one home.
ok('🔴 lib/vatanswer.ts holds the ONE reader',
  (read('lib/vatanswer.ts').match(/export async function vatAnswerForUser/g) || []).length === 1);
ok('🔴 lib/waintents.ts holds the ONE predicate',
  (read('lib/waintents.ts').match(/export function isVatQuestion/g) || []).length === 1);
ok('🔴 lib/vatstanding.ts holds the ONE assembly',
  (read('lib/vatstanding.ts').match(/export function vatAnswer\(/g) || []).length === 1);

// ---------------------------------------------------------------------------------------------
// 7b. B20. THE NATION EAR THE VAT ANSWER USES, AND WHY IT IS NOT THE SCOTTISH ONE.
// ---------------------------------------------------------------------------------------------
// Income tax rates and bands above the personal allowance are devolved to SCOTLAND. Wales sets its
// rates equal to England's and Northern Ireland does not set them at all, so isScottishRatesQuestion
// must stay Scotland only: handing SCOTLAND_LINE to a man in Cardiff would tell him his income tax
// is computed at somebody else's rates, which is false.
//
// VAT is reserved and identical in all four nations, so the VAT answer needs a WIDER ear. Two
// different truths, two different lists, and this section holds them apart in both directions.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 7b. B20: the nation ear, wider than the Scottish one and deliberately so ===\n');

const namesNation = W.namesNation;
ok('lib/waintents.ts exports namesNation', typeof namesNation === 'function');

for (const word of ['scotland', 'glasgow', 'wales', 'cardiff', 'northern ireland', 'belfast', 'england']) {
  ok(`  the VAT ear hears "${word}"`, namesNation(`am in ${word}, is vat different up here`) === true);
}
ok('  and a message naming no nation at all is not a nation question',
  namesNation('should i be registered for vat, im scared im getting close') === false);

// 🔴 THE DIRECTION THAT MATTERS. The wider ear must NOT have been achieved by widening the Scottish
// one, because that list decides who is told his income tax is worked at other people's rates.
for (const phrase of ['do i pay a different tax rate in cardiff', 'are the tax bands different in belfast']) {
  ok(`  🔴 the SCOTTISH ear still refuses ${JSON.stringify(phrase)}, which is not a devolved question`,
    isScot(phrase) === false);
}
ok('  🔴 ...while the Scottish ear still hears Scotland, so widening one did not break the other',
  isScot('do i pay the scottish rate of income tax') === true);

// One definition each, and the VAT answer asks the wide one.
ok('🔴 lib/waintents.ts holds ONE namesNation',
  (read('lib/waintents.ts').match(/export function namesNation/g) || []).length === 1);
ok('🔴 the VAT reader asks it, so the yes or no is decided in one place',
  /namesNation\(body\)/.test(read('lib/vatanswer.ts')));
// And all three routers hand the message over. A router that passes only the id answers a question
// the customer did not ask, which reads exactly like a wired lane.
{
  const bodies = {
    whatsapp: 'vatAnswerForUser(userId, text)',
    thread: 'vatAnswerForUser(userId, q)',
    ask: 'vatAnswerForUser(userId, question)',
  };
  for (const [name, code] of ROUTERS) {
    ok(`  🔴 ${name}: hands his WORDS to the reader, not just his id`, code.includes(bodies[name]));
  }
}

// ---------------------------------------------------------------------------------------------
// 9. B19. THE THIRD PARTY GATE, ON ALL THREE ROUTERS, ABOVE EVERY LANE THAT READS HIS BOOKS.
// ---------------------------------------------------------------------------------------------
// 🔴 WHY THIS SECTION EXISTS. This one is not an answer lane and that is the point of it. It is the
// gate that stops a lane reading his books to answer a question that was not about them, and it has
// been found three separate times on three separate surfaces.
//
//   Run 1, 11 August: "what does the barber next door owe you lot then", asked ON THE CHAT ROUTER,
//                     answered with HER OWN set aside figure, £1,200, read out as though it were an
//                     answer to the question she asked.
//   Run 2, 13 August: isAboutSomeoneElse built, and wired into app/api/whatsapp/route.ts only.
//   Run 3, 13 August: "how much has jerome made this year", asked on BOTH channels by his business
//                     partner. WhatsApp gave the WHOLE FIRM'S turnover under Jerome's name with an
//                     invented expenses figure attached; the web chat invented a different pair.
//                     The chat router, the one Run 1's finding came from, still had no gate at all.
//
// AND THE THIRD ROUTER WAS NEVER WIRED, from Run 2 until B19 on 17 August. app/api/ask is the in
// app accountant, it takes a typed question, and it had no gate of any kind.
//
// ⚠️ THE ORDER IS THE WHOLE GUARD. A gate below the lanes it guards is not a gate, it is a second
// opinion nobody asks for. So it is held above the VAT lane and the vehicle lane on all three, above
// the totals lane on the two that have one, and above the paid model everywhere.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 9. B19: somebody else\'s money, derived from all three routers ===\n');

const elseSites = {
  whatsapp: '} else if (isAboutSomeoneElse(text)) {',
  thread: 'if (isAboutSomeoneElse(q)) return SOMEONE_ELSE_ANSWER;',
  ask: 'if (!truth && isAboutSomeoneElse(question)) truth = SOMEONE_ELSE_ANSWER;',
};

for (const [name, code, arg] of ROUTERS) {
  const site = elseSites[name];
  const n = occurrences(code, site);
  ok(`${name}: the third party GATE is dispatched  \`${site.trim()}\``, n > 0);
  ok(`${name}: ...and exactly once, so its index names one call site`, n === 1);
  const gateAt = n === 1 ? code.indexOf(site) : -1;

  // The refusal has to be the fixed words. A gate that fires and then lets the question through is
  // the defect wearing the fix's clothes, and on this lane the difference is a disclosure.
  ok(`${name}: and the fixed refusal is what he gets`, code.includes('SOMEONE_ELSE_ANSWER'));

  // Above every lane on this router that reads his rows. Both markers proved present first, because
  // indexOf returns minus one and minus one is less than every real index.
  for (const [lane, needle] of [['the VAT lane', `isVatQuestion(${arg})`], ['the vehicle lane', `isVehicleQuestion(${arg})`]]) {
    const laneAt = code.indexOf(needle);
    ok(`${name}: ${lane} \`${needle}\` was located, so the bound below is not vacuous`, laneAt !== -1);
    ok(`🔴 ${name}: THE GATE RUNS ABOVE ${lane}, which reads his own rows`,
      gateAt !== -1 && laneAt !== -1 && gateAt < laneAt);
  }

  const modelNeedle = modelCall[name];
  const modelAt = code.indexOf(modelNeedle);
  ok(`${name}: the paid model call was located too`, modelAt !== -1);
  ok(`🔴 ${name}: AND ABOVE THE MODEL, so his books are never handed over to answer about somebody else`,
    gateAt !== -1 && modelAt !== -1 && gateAt < modelAt);
}

// The totals lane, on the two routers that have one. It is the lane that recited her own figure in
// Run 1, so it is the one this gate was built to get in front of.
for (const [name, code, arg] of ROUTERS.filter(([n]) => n !== 'ask')) {
  const totalsNeedle = `matchTotalsQuestion(${arg})`;
  const totalsAt = code.indexOf(totalsNeedle);
  const gateAt = code.indexOf(elseSites[name]);
  ok(`${name}: the totals gate \`${totalsNeedle}\` was located`, totalsAt !== -1);
  ok(`🔴 ${name}: AND THE GATE RUNS ABOVE IT, which is Run 1's finding by name`,
    totalsAt !== -1 && gateAt !== -1 && gateAt < totalsAt);
}

// 🔴 AND ON /api/ask IT RUNS ABOVE THE SHARED CACHE, FOR A REASON THE OTHER TWO ROUTERS DO NOT HAVE.
//
// This route fails in two directions. WITH a first person word the question is personal, so
// transactionSummaryForUser hands the model his entire ledger while it composes an answer about
// somebody else. WITHOUT one it is classed GENERAL, so the model invents with no books at all and
// the invention is then written to qa_cache under the third party's name and served free to every
// other customer who ever asks it. Returning above questionNorm closes both, structurally.
{
  const askCodeOnly = ROUTERS.find(([n]) => n === 'ask')[1];
  const gateAt = askCodeOnly.indexOf(elseSites.ask);
  const normAt = askCodeOnly.indexOf('const questionNorm = normaliseQuestion(question);');
  const upsertAt = askCodeOnly.indexOf('upsertQaCache(');
  const summaryAt = askCodeOnly.indexOf('transactionSummaryForUser(');
  ok('ask: the cache key line was located, so the bounds below are not vacuous', normAt !== -1);
  ok('ask: the cache WRITE was located too', upsertAt !== -1);
  ok('ask: and the read of his books was located as well', summaryAt !== -1);
  ok('🔴 ask: THE REFUSAL RETURNS BEFORE THE SHARED CACHE IS EVEN KEYED',
    gateAt !== -1 && normAt !== -1 && gateAt < normAt && gateAt < upsertAt);
  ok('🔴 ask: AND BEFORE HIS BOOKS ARE READ FOR THE MODEL AT ALL',
    gateAt !== -1 && summaryAt !== -1 && gateAt < summaryAt);
}

// One gate, one refusal, each with exactly one home.
ok('🔴 lib/waintents.ts holds the ONE gate',
  (read('lib/waintents.ts').match(/export function isAboutSomeoneElse/g) || []).length === 1);
ok('🔴 lib/waintents.ts holds the ONE refusal',
  (read('lib/waintents.ts').match(/export const SOMEONE_ELSE_ANSWER/g) || []).length === 1);
// And no router keeps a copy of the words or a rule of its own for deciding who is a third party.
for (const [name, code] of ROUTERS) {
  ok(`  ${name}: keeps no private copy of the refusal or the rule`,
    !/I can only see your books/.test(code) && !/THIRD_PARTY_RE|namesAPerson\(/.test(code));
}

// ---------------------------------------------------------------------------------------------
// 9a. THE NAMED PERSON BRANCH, WHICH WAS LOAD BEARING AND GUARDED BY NOTHING.
// ---------------------------------------------------------------------------------------------
// 🔴 FOUND BY test/sabotage-b19lanes.mjs ON ITS FIRST RUN, 17 August 2026, AND IT IS THE CORPUS
// RULE ABOUT VACUOUS GUARDS BITING IN MINIATURE.
//
// isAboutSomeoneElse ends with two lines. `if (named) return true;` answers a question about a
// person by name, and the line under it falls back to a list of money words for the older "barber
// next door" shape. Deleting the named line entirely was NOT CAUGHT by any suite in this repo.
//
// The reason is that Run 3's three phrases each carry a SECOND signal. "how much has jerome MADE",
// "whats jerome's PROFIT" and "how much did priya EARN" all contain a word that is ALSO in the
// fallback list, so all three stayed true with the branch they were written for removed. Twelve
// ordinary phrasings do not: spent, taken, turned over, billed, paid, income, wages, money, share,
// account, bill and vat are in the named person patterns and in NEITHER fallback list. Every one
// of them silently stopped being a refusal.
//
// ⚠️ SO EACH PROBE BELOW CARRIES THE SIGNAL UNDER TEST AND NO OTHER SIGNAL OF THE SAME KIND, and
// that is asserted rather than asserted about. Swapping the NAME for a stoplisted word must make
// the same sentence fall through, which is the only way to know the name is what refused it. A
// phrase that stays true with the name taken out is proving the fallback, not this branch.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 9a. B19: the named person branch, isolated from the fallback ===\n');

const aboutElse = W.isAboutSomeoneElse;
ok('lib/waintents.ts exports isAboutSomeoneElse', typeof aboutElse === 'function');
ok('...and selfNameTokens beside it', typeof W.selfNameTokens === 'function');

const NAMED_PROBES = [
  'how much has jerome spent this year',
  'how much has jerome taken this year',
  'how much has jerome billed this year',
  "whats jerome's income",
  "whats jerome's wages",
  "whats jerome's share",
  "whats jerome's account",
];
for (const phrase of NAMED_PROBES) {
  const neutral = phrase.replace(/jerome/g, 'it');
  ok(`  🔴 refused: ${JSON.stringify(phrase)}`, aboutElse(phrase) === true);
  ok(`     ...and the NAME is what refused it, not a money word  (${JSON.stringify(neutral)} falls through)`,
    aboutElse(neutral) === false);
}

// The two directions that keep it usable. His own money is his, and his own name is not somebody
// else, which is what selfNameTokens is for on a caller that already holds the name.
ok('  his own spending is still his to ask about', aboutElse('how much have i spent this year') === false);
ok('  and a man asking about himself by name is not refused, where the caller knows the name',
  aboutElse('how much has jerome spent this year', W.selfNameTokens('Jerome Adeyemi')) === false);

// ---------------------------------------------------------------------------------------------
// 9b. THE DERIVED SCOPE TABLE. EVERY PREDICATE, EVERY ROUTER, WRITTEN DOWN OR RED.
// ---------------------------------------------------------------------------------------------
// 🔴 WHY THIS EXISTS AND WHY IT IS NOT ANOTHER HAND WRITTEN LIST. Sections 5 to 9 each hold ONE lane
// on three routers, and each of them was written the day somebody found that lane live on one router
// out of three. That is four findings with one shape, and the shape is that nothing in this repo
// could SEE the asymmetry. A hand written list of the lanes that matter cannot see it either: it
// only ever contains the lanes somebody has already been bitten by.
//
// So the names come off disk. Every predicate lib/waintents.ts exports, every router that dispatches
// it, derived. The table below declares which routers each one is EXPECTED on, and the assertion is
// equality in both directions, so:
//
//   - a predicate wired to fewer routers than declared goes red (a lane landed on one router),
//   - a predicate wired to MORE goes red (a lane was widened without anybody writing down why),
//   - a NEW predicate dispatched anywhere goes red by name until somebody classifies it,
//   - and a row for a predicate no router dispatches any more goes red, so the table cannot rot.
//
// ⚠️ THE CUT IS BY NAME AND IT IS DELIBERATE. `is*`, `match*` and `looksLike*` are the exports that
// DECIDE a lane. Answer builders (niAnswer, deadlineAnswer, vehicleAnswer) and helpers (formatGbp,
// entryDate) are not gates and classifying them would turn this table into a chore, which is how
// tables stop being read. TWO KNOWN EXCLUSIONS, both named rather than hidden: `asksAmount`, which is
// a tie break and has section 2 to itself, and `compoundAsk`, which appends a note rather than
// choosing a lane and is on WhatsApp and the thread only.
//
// ⚠️ AND ROUTER LOCAL PREDICATES ARE OUT OF SCOPE BY CONSTRUCTION. isCIS, isMileage, isHomeOffice,
// isPhoneShare, isSchedule, isHelp, isTaxTips, isReferRequest, isExpenseCheck and isQuestion are
// defined inside app/api/whatsapp/route.ts and exported by nothing, so they cannot be derived from
// lib/waintents.ts. If one of them ever needs to be on three surfaces it has to move into the shared
// file first, and that is the right order anyway.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 9b. the derived scope table: every predicate, every router ===\n');

const ALL3 = ['ask', 'thread', 'whatsapp'];
const WA_ONLY = ['whatsapp'];
const WA_THREAD = ['thread', 'whatsapp'];

// on: the routers this predicate is EXPECTED to be dispatched by, sorted. why: required whenever
// that is not all three, because an asymmetry with no reason written next to it is the defect.
const SCOPE = {
  // Everywhere. Being wrong on a surface is a breach or an irreversible decision, never merely a
  // worse reply, which is the bar section 5 wrote down.
  isAboutSomeoneElse: { on: ALL3, why: '' },
  isDataRightsRequest: { on: ALL3, why: '' },
  isVehicleQuestion: { on: ALL3, why: '' },
  isVatQuestion: { on: ALL3, why: '' },
  isScottishRatesQuestion: { on: ALL3, why: '' },
  matchProductTruth: { on: ALL3, why: '' },

  // Short of three, and each of these is a written decision or a written debt.
  isDeadlineQuestion: {
    on: WA_THREAD,
    why: 'B19 DEBT, NOT A DECISION: /api/ask has no deadline lane, so a man asking the in app '
      + 'accountant when his return is due is answered by the model. Deliberately left for its own '
      + 'item rather than folded into the privacy packet.',
  },
  matchTotalsQuestion: {
    on: WA_THREAD,
    why: 'section 7 records that /api/ask has no totals lane to order against. Whether it should '
      + 'have one is an open question and NOT a settled decision, because that route answers a '
      + 'personal money question from the model on transactionSummaryForUser instead.',
  },
  isNiQuestion: { on: WA_ONLY, why: 'B19 DEBT: niAnswer exists, is tested and reads his rows, and is dispatched by one router.' },
  isStudentLoanQuestion: { on: WA_ONLY, why: 'B19 DEBT: studentLoanAnswer exists, is tested and reads his rows, and is dispatched by one router.' },
  isPropertyQuestion: { on: WA_ONLY, why: 'B19 DEBT: propertyAnswer exists, is tested and reads his rows, and is dispatched by one router.' },
  isSavingsQuestion: {
    on: WA_ONLY,
    why: 'B19 DEBT, AND THE HARDEST OF THEM: there is NO pure builder. app/api/whatsapp/route.ts '
      + 'assembles the sentences inline in handleSavingsQuestion, so this lane cannot be wired to a '
      + 'second router without extracting one first, exactly as B18 had to for VAT.',
  },
  isIdentity: {
    on: WA_ONLY,
    why: 'B19 DEBT WITH A CATCH: the words are inline in the route AND they are channel specific. '
      + 'They say "right here in WhatsApp" and "text help to see the lot", so copying them to a web '
      + 'surface would tell a man in a browser to send a text. It needs a builder that takes the '
      + 'channel, not a move.',
  },

  // Correctly WhatsApp only. These are the channel itself, not answers about money. A box on a web
  // page has no last message to delete, no thread to stop, and no keyword to reserve.
  matchStopStart: { on: WA_ONLY, why: 'STOP and START are a messaging channel obligation and mean nothing in a web form.' },
  matchReservedWord: { on: WA_ONLY, why: 'reserved keywords exist because a text can only be words. A web form has buttons.' },
  matchAck: { on: WA_ONLY, why: 'acknowledging a receipt we sent is a reply to a message. There is no message here.' },
  matchEditLast: { on: WA_ONLY, why: 'the web has the row itself, with an edit on it.' },
  isDeleteLast: { on: WA_ONLY, why: 'the web has the row itself, with a delete on it.' },
  isGreeting: { on: WA_ONLY, why: 'nobody types hello into an accountant box.' },
  isThanks: { on: WA_ONLY, why: 'nobody types thanks into an accountant box.' },
  isVent: { on: WA_ONLY, why: 'a man swearing at his phone at 8pm is a WhatsApp shape.' },
  isNonWords: { on: WA_ONLY, why: 'a pocket dial sends "aaaa". A web form is typed on purpose.' },
  isSetupRequest: { on: WA_ONLY, why: 'setup on the web is the setup screens. He is already in them.' },
  isInvoiceThis: { on: WA_ONLY, why: 'the web has an invoice screen, and it is one tap away.' },
  matchInvoiceDraft: { on: WA_ONLY, why: 'the web has an invoice screen, and it is one tap away.' },
  matchChaseRequest: { on: WA_ONLY, why: 'chasing is a button on the invoice, on the web.' },
  matchRentIn: { on: WA_ONLY, why: 'a rent received is an ENTRY. Entries on the web go through the pile, not a sentence.' },
  looksLikeMoneyEntry: { on: WA_ONLY, why: 'an entry is not a question, and the web has a form for it.' },
  matchSalarySet: { on: WA_ONLY, why: 'a setting. The web has the settings screen it writes to.' },
  matchStudentLoanPlanSet: { on: WA_ONLY, why: 'a setting. The web has the settings screen it writes to.' },
  matchUseOfHomeElection: { on: WA_ONLY, why: 'an election. The web has the elections screen it writes to.' },
  matchGoalSet: { on: WA_ONLY, why: 'the goal is a WhatsApp feature end to end and has no web surface at all.' },
  isGoalQuestion: { on: WA_ONLY, why: 'the goal is a WhatsApp feature end to end and has no web surface at all.' },
  isGoalDone: { on: WA_ONLY, why: 'the goal is a WhatsApp feature end to end and has no web surface at all.' },
  isWeeklySummaryRequest: { on: WA_ONLY, why: 'a request to be SENT something. The web shows it instead.' },
  isSupportRequest: { on: WA_ONLY, why: 'the web has a support door on the page. A texter has only the text.' },
  isPricing: {
    on: WA_ONLY,
    why: 'OPEN QUESTION rather than a settled decision. What Lekhio costs is a product truth and a '
      + 'signed in man can ask it in the accountant box, where matchProductTruth does not carry '
      + 'price. Recorded here so it is a decision somebody takes rather than a gap nobody sees.',
  },
};

// Derived: the export list, off disk, and every dispatch site in every router.
const waintentsSrc = read('lib/waintents.ts');
const exportedNames = new Set();
for (const m of waintentsSrc.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/gm)) exportedNames.add(m[1]);
for (const m of waintentsSrc.matchAll(/^export\s+const\s+([A-Za-z0-9_]+)/gm)) exportedNames.add(m[1]);
ok('the export list was read off lib/waintents.ts, so the table below is derived', exportedNames.size > 30);

const GATE_NAME = /^(is|match|looksLike)[A-Z]/;
const EXCLUDED = new Set(['asksAmount', 'compoundAsk']);

const dispatchedOn = new Map();
for (const name of exportedNames) {
  if (!GATE_NAME.test(name) || EXCLUDED.has(name)) continue;
  const on = [];
  for (const [router, code] of ROUTERS) {
    if (new RegExp(`\\b${name}\\s*\\(`).test(code)) on.push(router);
  }
  if (on.length) dispatchedOn.set(name, on.sort());
}
ok('...and at least twenty predicates are dispatched by at least one router', dispatchedOn.size >= 20);

// Direction one: nothing is dispatched that nobody has classified.
const unclassified = [...dispatchedOn.keys()].filter((n) => !SCOPE[n]).sort();
ok(`🔴 EVERY DISPATCHED PREDICATE IS CLASSIFIED${unclassified.length ? `, MISSING: ${unclassified.join(', ')}` : ''}`,
  unclassified.length === 0);

// Direction two: nothing is classified that no router dispatches any more.
const rotted = Object.keys(SCOPE).filter((n) => !dispatchedOn.has(n)).sort();
ok(`🔴 AND NO ROW HAS ROTTED${rotted.length ? `, DEAD ROWS: ${rotted.join(', ')}` : ''}`,
  rotted.length === 0);

// Direction three: the routers a predicate is actually on are the routers the table says.
for (const [name, on] of [...dispatchedOn.entries()].sort()) {
  const want = SCOPE[name];
  if (!want) continue;
  eq(`  ${name}: dispatched by exactly the routers the table declares`, on, [...want.on].sort());
  ok(`  ${name}: ...and an asymmetry carries a written reason`,
    want.on.length === 3 || want.why.trim().length > 20);
}

// The tally, printed rather than asserted, so the remaining lane gap is visible in the run output of
// the suite that owns it instead of only in a handover document.
{
  const short = [...dispatchedOn.entries()].filter(([, on]) => on.length < 3).map(([n, on]) => `${n} (${on.join('+')})`);
  console.log(`\n  three routers: ${[...dispatchedOn.values()].filter((o) => o.length === 3).length}`
    + `   short of three: ${short.length}`);
  console.log(`  still short: ${short.sort().join(', ')}\n`);
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

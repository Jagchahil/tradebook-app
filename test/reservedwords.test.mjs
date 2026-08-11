// THE WORDS WE HAND OUT. Not whether a matcher is clever. Whether the road we named exists.
//
//   node test/reservedwords.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS SUITE EXISTS TO PREVENT, IN ONE STORY.
//
// 11 August 2026, walking production. A customer tried to connect his WhatsApp number. It was
// already bound to another and by then abandoned account, so bindingVerdict() returned 'taken' and
// linkMessage('taken') answered him in our own words:
//
//   "This number is already connected to a Lekhio account, so we have not changed anything. If that
//    is not you, reply SUPPORT and a person will look at it."
//
// He replied SUPPORT.
//
// isSupportRequest() did not match the bare word. Its five regexes each want a sentence ("let me
// speak to a human", "this is broken", "I want a refund") and none of them covers the single token
// the product had just put in his hand. So SUPPORT fell through roughly forty text branches in
// app/api/whatsapp/route.ts and landed on handleTextEntry, THE RECEIPT AND EXPENSE PARSER, which
// set about booking the word as a transaction. The only road out of the refusal was a dead end, and
// there were no words at all he could have sent to free his own number.
//
// Three more holes of the same shape were open on the same walk:
//
//   . alwaysAnswered() asked isSupportRequest(), so a read only or lapsed customer who texted
//     SUPPORT failed the always answered list and was handed the PAYWALL line.
//   . Bare START was eaten by isGetStarted(), four branches above matchStopStart(), so the word the
//     STOP reply promises him ("you can text START any time to switch them back on") reached the
//     welcome card and switched nothing back on.
//   . handleInvoiceFlow() and handleTaxGuideFlow() both run above matchStopStart() and both read a
//     bare "stop" as "cancel this flow", so a man who texted STOP mid invoice believed he had opted
//     out while his preferences row was never touched. Meta requires STOP to mean STOP.
//
// 🔴 AND EVERY EXISTING SUITE WAS GREEN THROUGH ALL OF IT. test/waintents.test.mjs asserts
// matchStopStart('start reminders'), the two word form, which the predicate has always got right. A
// predicate returning the correct answer proves nothing about whether the router ever calls it. So
// this suite tests the REGISTRY, the ROUTER and the COPY, and it derives all three from disk:
//
//   1. Every word in the registry is matched bare, in any case, with the punctuation a phone adds.
//   2. 🔴 EVERY WORD OUR OUTBOUND COPY TELLS HIM TO REPLY WITH HAS AN INBOUND OWNER. The words are
//      read out of lib/walink.ts and app/api/whatsapp/route.ts, not typed in here.
//   3. The router dispatches them ABOVE the invoice flow, the tax guide flow, the paywall and the
//      parser, proved by position in the shipping file.
//   4. A sentence is not an instruction: "stop the invoice" is still an invoice being cancelled.
//   5. Bare START reaches the opt in, and alwaysAnswered() is EXECUTED rather than read.
//   6. The ticket is not filed under an account nobody has proved he owns.
//
// ⚠️ EVERY ORDERING CLAIM GOES THROUGH before(). String.indexOf returns -1 for a marker that is not
// there, -1 is less than every real index, and `indexOf(a) < indexOf(b)` therefore PASSES when a is
// missing entirely. Two security guards shipped vacuous on exactly that on 10 August, and
// test/reminderclock.test.mjs carries the helper this one copies.
//
// ⚠️ lib/waintents.ts imports nothing but a TYPE, so it loads directly and needs none of the
// staging idiom in test/subjectrule.test.mjs. The two functions sliced out of the webhook further
// down DO need it, and they get it.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  RESERVED_WORDS,
  FLOW_WORDS,
  matchReservedWord,
  isReservedWord,
  isSupportRequest,
  supportReason,
  matchStopStart,
} from '../lib/waintents.ts';
import { linkMessage } from '../lib/walink.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const read = (rel) => readFileSync(path.join(repo, rel), 'utf8');

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

// ⚠️ PRESENT AND ORDERED, NEVER JUST ORDERED. Copied from test/reminderclock.test.mjs, and the
// reason is written out there: indexOf returns -1 for a missing needle, so a bare
// `indexOf(a) < indexOf(b)` passes by the ABSENCE of the thing it claims to guard.
function before(hay, a, b) {
  const i = hay.indexOf(a);
  const j = hay.indexOf(b);
  return i !== -1 && j !== -1 && i < j;
}

// Comments are stripped before any index is taken or any word is extracted. Both files below carry
// long comments that quote the copy and name the gates while explaining this very defect, and a
// comment saying "Reply NEXT or STOP" would otherwise read as outbound copy handing out two words.
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const ROUTER_FILE = 'app/api/whatsapp/route.ts';
const LINK_FILE = 'lib/walink.ts';
const routerRaw = read(ROUTER_FILE);
const router = stripComments(routerRaw);
const link = stripComments(read(LINK_FILE));

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n--- 1. THE REGISTRY. Every word in it is matched bare, in any case, punctuated ---\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════

ok('🔴 there IS a registry, without which every assertion below is vacuous',
  Array.isArray(RESERVED_WORDS) && RESERVED_WORDS.length > 0);

const WORDS = RESERVED_WORDS.map((r) => r.word);
ok('it holds at least SUPPORT, STOP and START, the three the incident named',
  ['SUPPORT', 'STOP', 'START'].every((w) => WORDS.includes(w)));
ok('no word appears in it twice', new Set(WORDS).size === WORDS.length);

for (const rule of RESERVED_WORDS) {
  const w = rule.word;
  // The entry has to carry a NAME against it. A word with no owner is the whole bug.
  ok(`${w}: names the handler that owns it inbound`,
    typeof rule.owner === 'string' && rule.owner.trim().length > 0);
  ok(`${w}: says which sentence of ours puts it in his hand`,
    typeof rule.handedOutBy === 'string' && rule.handedOutBy.trim().length > 0);
  ok(`${w}: is written in capitals, the way the copy hands it out`, w === w.toUpperCase());

  // 🔴 THE MATCHER OWNS IT IN EVERY SHAPE A PHONE CAN PRODUCE.
  const shapes = [
    w,                    // SUPPORT
    w.toLowerCase(),      // support
    ` ${w} `,             // a leading space from a fat thumb
    `${w}\n`,             // a trailing newline
    `${w}.`,              // the full stop his keyboard adds
    `${w}!`,              // shouted
    `${w}?`,              // asked
    `${w},`,              // trailing comma
    `  ${w.toLowerCase()}  `,
    w[0] + w.slice(1).toLowerCase(), // Support
  ];
  for (const s of shapes) {
    ok(`${w}: matched as ${JSON.stringify(s)}`, matchReservedWord(s) === w);
  }
  ok(`${w}: isReservedWord agrees with matchReservedWord`, isReservedWord(w) === true);
}

// Nothing, and things that are not words, are not instructions.
ok('an empty message is not a reserved word', matchReservedWord('') === null);
ok('whitespace only is not a reserved word', matchReservedWord('   \n ') === null);
ok('null is not a reserved word and does not throw', matchReservedWord(null) === null);
ok('undefined is not a reserved word and does not throw', matchReservedWord(undefined) === null);
ok('a word we never handed out is not reserved', matchReservedWord('banana') === null);
// No partial matching. A bare word is an instruction; a word with a word stuck to it is not.
ok('"stopped" is not STOP', matchReservedWord('stopped') === null);
ok('"supportive" is not SUPPORT', matchReservedWord('supportive') === null);
ok('"restart" is not START', matchReservedWord('restart') === null);

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n--- 2. 🔴 EVERY WORD IN OUTBOUND COPY HAS AN INBOUND OWNER ---\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// THE GUARD THAT WOULD HAVE CAUGHT 11 AUGUST. The words are READ OUT of the shipping copy rather
// than typed in here, so a new sentence that tells a customer to reply with something turns this
// red on the commit that writes it, and not on the support ticket six months later.
//
// The product prints a reply word in CAPITALS, every time, precisely so it reads as a token to send
// back rather than as part of the sentence ("reply SUPPORT", "text START", "Reply SEND", "reply
// SKIP"). That convention is what makes the extraction possible, and it is worth keeping for that
// reason alone.
const REPLY_WORD = /\b(?:[Rr]eply|[Tt]ext|[Ss]end|[Ss]ay|[Tt]ype|[Tt]ap)\s+(?:me\s+)?([A-Z]{2,})\b/g;

const outbound = new Map(); // word -> the files that hand it out
for (const [file, src] of [[ROUTER_FILE, router], [LINK_FILE, link]]) {
  for (const m of src.matchAll(REPLY_WORD)) {
    const w = m[1];
    if (!outbound.has(w)) outbound.set(w, []);
    if (!outbound.get(w).includes(file)) outbound.get(w).push(file);
  }
}
const outboundWords = [...outbound.keys()].sort();
console.log(`  words the copy tells him to reply with: ${outboundWords.join(', ') || 'NONE FOUND'}\n`);

// ⚠️ THE EXTRACTION IS PROVED TO WORK BEFORE ANYTHING IS CONCLUDED FROM IT. An extractor that
// silently stopped finding anything would make every assertion below pass on an empty set, which is
// the same vacuous pass the before() helper exists to refuse.
ok('🔴 the extraction found words at all, so this section is not empty',
  outboundWords.length >= 3);
ok('🔴 IT FOUND SUPPORT, the word lib/walink.ts hands a refused customer',
  outbound.has('SUPPORT') && outbound.get('SUPPORT').includes(LINK_FILE));
ok('🔴 AND IT FOUND START, the word the STOP reply promises him',
  outbound.has('START') && outbound.get('START').includes(ROUTER_FILE));

// The second kind of owner: a word that only means something inside the flow that offered it.
// SEND is the invoice approval, and reserving it would take the word out of the one step in the
// product where a customer's reply puts a document in front of another human being. So a flow word
// is held to a REAL anchored regex in the router that actually matches the bare word.
const routerLiterals = [...router.matchAll(/\/\^[^\n/]+\/[a-z]*/g)].map((m) => m[0]);
ok('regex literals were found in the router, so flow ownership can be checked at all',
  routerLiterals.length > 5);

function ownedByRouterRegex(word) {
  for (const lit of routerLiterals) {
    const cut = lit.lastIndexOf('/');
    const flags = lit.slice(cut + 1).replace(/[gy]/g, '');
    let re;
    try { re = new RegExp(lit.slice(1, cut), flags); } catch { continue; }
    if (re.test(word) || re.test(word.toLowerCase())) return true;
  }
  return false;
}

// 🔴 THE OWNERSHIP CHECK CAN FAIL. Without this line the loop below could be satisfied by one
// permissive regex somewhere in the file and would guard nothing.
ok('🔴 a word nothing handles is NOT owned by any router regex', ownedByRouterRegex('BANANA') === false);

const flowWords = FLOW_WORDS.map((f) => f.word);
ok('there is a flow word list too', Array.isArray(FLOW_WORDS) && FLOW_WORDS.length > 0);
ok('🔴 no word is claimed by BOTH registries, or two handlers own one word',
  flowWords.every((w) => !WORDS.includes(w)));

for (const f of FLOW_WORDS) {
  ok(`${f.word}: names the flow that owns it (${f.flow})`,
    typeof f.flow === 'string' && f.flow.trim().length > 0 && typeof f.owner === 'string');
  // 🔴 THE LIST IS NOT AN EXEMPTION. Each flow word has to be matched by a real anchored regex that
  // is in the shipping router today, or it is just a word nobody handles with a note beside it.
  ok(`🔴 ${f.word}: is matched by a real anchored regex in ${ROUTER_FILE}`,
    ownedByRouterRegex(f.word));
}

// 🔴 THE ASSERTION THE WHOLE SUITE EXISTS FOR.
for (const w of outboundWords) {
  const reserved = matchReservedWord(w) === w;
  const flow = flowWords.includes(w) && ownedByRouterRegex(w);
  ok(`🔴 "${w}", handed out by ${outbound.get(w).join(' and ')}, HAS AN INBOUND OWNER`,
    reserved || flow);
}

// The regression fixture itself, in the customer's own terms.
const taken = linkMessage('taken');
ok('the taken refusal still names a word to send back', /\bSUPPORT\b/.test(taken));
ok('🔴 AND THAT WORD IS OWNED, which is the whole of 11 August',
  matchReservedWord('SUPPORT') === 'SUPPORT' && isSupportRequest('SUPPORT') === true);
ok('the bare word reaches the desk in the human lane rather than the unclassifiable one',
  supportReason('SUPPORT') === 'human');

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n--- 3. THE ROUTER. Dispatched above the sessions, the paywall and the parser ---\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// Derived from the shipping file by POSITION, never by line number, so the file can grow a hundred
// lines above any of these and this reads the same, while moving one branch turns it red.
const pmFrom = router.indexOf('async function processMessage(');
const pm = pmFrom > 0 ? router.slice(pmFrom, router.indexOf('\n}\n', pmFrom)) : '';
ok('🔴 processMessage was found and read as one block, so the ordering below is real',
  pm.length > 500 && pm.includes('messageCapExceeded'));

const GATE = 'matchReservedWord(text)';
const DISPATCH = 'handleReservedWord(from, ';
ok('🔴 THE RESERVED GATE IS IN THE DISPATCHER', pm.includes(GATE));
ok('🔴 AND IT ACTUALLY CALLS A HANDLER', pm.includes(DISPATCH));

// Each of the four things that ate a reserved word, in the order the incident found them.
ok('🔴 RESERVED WORDS ARE DISPATCHED BEFORE THE INVOICE FLOW, whose CANCEL pattern reads a bare "stop" as "cancel this invoice"',
  before(pm, GATE, 'handleInvoiceFlow(from, text)'));
ok('🔴 BEFORE THE TAX GUIDE FLOW, whose TAXGUIDE_STOP does the same thing one flow over',
  before(pm, GATE, 'handleTaxGuideFlow(from, text)'));
ok('🔴 BEFORE THE PAYWALL, because a subscription line may never be the answer to a cry for help',
  before(pm, GATE, '!alwaysAnswered(text) && (await workIsPaused(from))'));
ok('🔴 AND BEFORE handleTextEntry, THE RECEIPT PARSER THAT TRIED TO BOOK THE WORD "SUPPORT"',
  before(pm, GATE, 'handleTextEntry(from, messageId, text)'));

// The three lanes that used to own these words by accident are all below it now.
ok('before isGetStarted, which used to eat a bare START', before(pm, GATE, 'isGetStarted(text)'));
ok('before matchStopStart, which never saw one', before(pm, GATE, 'matchStopStart(text)'));
ok('before isSupportRequest, which could not match the bare word',
  before(pm, GATE, 'isSupportRequest(text)'));

// ⚠️ AND IT IS NOT ABOVE THE BINDING CODE. handleConnectCode is the one door open to a number we do
// not know and it answers only a message carrying a hundred bit code. Putting a guess in front of a
// proof would be a different bug wearing this one's clothes.
ok('the binding code is still checked first', before(pm, 'handleConnectCode(from, text)', GATE));

// The handler itself: one word, one owner, and the flow he was in lets go of him.
const hrFrom = router.indexOf('async function handleReservedWord(');
const hr = hrFrom > 0 ? router.slice(hrFrom, router.indexOf('\n}\n', hrFrom)) : '';
ok('handleReservedWord exists and was read', hr.length > 40);
ok('🔴 SUPPORT is handed to handleSupportRequest', hr.includes('handleSupportRequest(from, text)'));
ok('🔴 STOP and START are handed to handleStopStart', /handleStopStart\(from, /.test(hr));
ok('🔴 THE HALF FINISHED FLOW IS CLEARED, or his next message answers a question we stopped asking',
  before(hr, 'clearSession(from)', 'handleSupportRequest'));
ok('and a failed clear may not swallow the STOP', /clearSession\(from\)\.catch\(/.test(hr));

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n--- 4. A BARE WORD IS AN INSTRUCTION. A SENTENCE IS NOT ---\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════

ok('🔴 "stop the invoice" IS NOT A RESERVED STOP', matchReservedWord('stop the invoice') === null);
{
  // Derived, not asserted from memory: the router's own CANCEL pattern still matches it.
  const cancel = /const CANCEL = (\/[^\n]+\/[a-z]*);/.exec(router);
  ok('the invoice CANCEL pattern was found on disk', cancel !== null);
  if (cancel) {
    const lit = cancel[1];
    const cut = lit.lastIndexOf('/');
    const re = new RegExp(lit.slice(1, cut), lit.slice(cut + 1).replace(/[gy]/g, ''));
    ok('🔴 "stop" alone still matches it, which is exactly why it had to be dispatched first',
      re.test('stop'));
    ok('and "cancel" still cancels the invoice, untouched by any of this', re.test('cancel'));
  }
}
ok('"stop the reminders" is not a bare word either', matchReservedWord('stop the reminders') === null);
ok('and matchStopStart still owns that phrasing', matchStopStart('stop the reminders') === 'stop');
ok('"start reminders" is not a bare word', matchReservedWord('start reminders') === null);
ok('and matchStopStart still owns it too', matchStopStart('start reminders') === 'start');
ok('"i need support with my invoice" is not the bare word',
  matchReservedWord('i need support with my invoice') === null);
ok('"get started" is not a bare START', matchReservedWord('get started') === null);

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n--- 5. BARE START REACHES THE OPT IN, AND THE PAYWALL NEVER ANSWERS SUPPORT ---\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════

ok('🔴 START IS A RESERVED WORD', matchReservedWord('START') === 'START');
ok('and the registry gives it to the opt in handler',
  RESERVED_WORDS.find((r) => r.word === 'START')?.owner === 'handleStopStart');
ok('🔴 AND THE ROUTER REACHES IT BEFORE THE WELCOME CARD', before(pm, GATE, 'isGetStarted(text)'));

// The second lock: the greeting matcher no longer carries the word at all, so even the FALLBACK is
// correct. Derived by executing the shipping regex, not by reading it.
{
  const gs = /function isGetStarted\(body: string\): boolean \{[\s\S]*?return (\/[^\n]+\/[a-z]*)\.test/.exec(router);
  ok('isGetStarted was found on disk with its regex', gs !== null);
  if (gs) {
    const lit = gs[1];
    const cut = lit.lastIndexOf('/');
    const re = new RegExp(lit.slice(1, cut), lit.slice(cut + 1).replace(/[gy]/g, ''));
    ok('🔴 A BARE "start" IS NO LONGER A GREETING', re.test('start') === false);
    ok('and "hi" still is', re.test('hi'));
    ok('and "hello" still is', re.test('hello'));
    ok('and "get started" still is', re.test('get started'));
  }
}

// alwaysAnswered is EXECUTED, not read. It is sliced verbatim out of the shipping webhook and staged
// as a module, twice, because running it once proves less than it looks.
//
// ⚠️ THE SECOND STAGING IS THE ONE THAT MATTERS, AND THE FIRST DRAFT OF THIS SUITE DID NOT HAVE IT.
// With every real predicate in place, alwaysAnswered('SUPPORT') is true through isSupportRequest and
// alwaysAnswered('STOP') is true through matchStopStart, so deleting the registry line from the list
// left the suite GREEN. It was proved by sabotage, which is what sabotage is for. The list has to
// cover a reserved word BECAUSE IT IS RESERVED, not because some neighbouring lane happens to catch
// today's three. The day a fourth word is added, the neighbour will not be there.
{
  const fnSource = (code, header) => {
    const i = code.indexOf(header);
    if (i < 0) return '';
    const end = code.indexOf('\n}\n', i);
    return end < 0 ? '' : code.slice(i, end + 3);
  };
  const alwaysSrc = fnSource(routerRaw, 'function alwaysAnswered(text: string): boolean {');
  const helpSrc = fnSource(routerRaw, 'function isHelp(body: string): boolean {');
  const helpRe = /^const HELP_RE = .*$/m.exec(routerRaw)?.[0] ?? '';
  ok('alwaysAnswered, isHelp and HELP_RE were all sliced out of the shipping file',
    alwaysSrc.length > 40 && helpSrc.length > 40 && helpRe.length > 20);

  const waHref = pathToFileURL(path.join(repo, 'lib/waintents.ts')).href;
  const stage = mkdtempSync(path.join(tmpdir(), 'reservedwords-'));
  const build = async (name, head) => {
    const file = path.join(stage, `${name}.ts`);
    writeFileSync(file, [head, alwaysSrc, 'export { alwaysAnswered };'].join('\n'));
    return import(pathToFileURL(file).href);
  };

  // 1. THE SHIPPING FUNCTION, WHOLE. Every predicate is the real one.
  const real = await build('real', [
    `import { matchReservedWord, matchStopStart, isSupportRequest, isIdentity, matchProductTruth, isPricing, isThanks } from '${waHref}';`,
    helpRe,
    helpSrc,
  ].join('\n'));

  for (const w of WORDS) {
    // 🔴 THE PAYWALL MAY NEVER ANSWER ONE OF THESE. For STOP it is not merely grubby, it is unlawful.
    ok(`🔴 alwaysAnswered("${w}") IS TRUE, so the paywall cannot answer it`,
      real.alwaysAnswered(w) === true);
    ok(`alwaysAnswered("${w.toLowerCase()}.") is true too, punctuation and all`,
      real.alwaysAnswered(`${w.toLowerCase()}.`) === true);
  }
  // And it is still a LIST rather than a door held open for everything.
  ok('alwaysAnswered is still false for ordinary work, or the paywall is decorative',
    real.alwaysAnswered('spent 40 on diesel') === false
    && real.alwaysAnswered('drove 24 miles') === false);

  // 2. 🔴 THE SAME FUNCTION WITH EVERY OTHER LANE SILENCED. Only the registry can answer now, so
  // this is red the moment the list stops asking it, whatever the neighbours happen to match.
  const alone = await build('alone', [
    `import { matchReservedWord } from '${waHref}';`,
    'const matchStopStart = () => null;',
    'const isSupportRequest = () => false;',
    'const isHelp = () => false;',
    'const isIdentity = () => false;',
    'const matchProductTruth = () => null;',
    'const isPricing = () => false;',
    'const isThanks = () => false;',
  ].join('\n'));

  for (const w of WORDS) {
    ok(`🔴 alwaysAnswered("${w}") IS TRUE ON THE REGISTRY ALONE, not by a neighbour's luck`,
      alone.alwaysAnswered(w) === true);
  }
  ok('and the silenced build still says no to ordinary work, so it is not stuck on true',
    alone.alwaysAnswered('spent 40 on diesel') === false);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n--- 6. THE TICKET IS FILED ON THE NUMBER, NOT UNDER A STRANGER\'S ACCOUNT ---\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// The man who replies SUPPORT to a 'taken' refusal is BY DEFINITION texting from a number bound to
// somebody else's account. findUserIdByPhone(from) answers "which account does this number feed",
// and the ticket asks "whose complaint is this". Those come apart in exactly this case, and filing
// it under the incumbent writes a stranger's words into another person's record.
{
  const hsFrom = router.indexOf('async function handleSupportRequest(');
  const hs = hsFrom > 0 ? router.slice(hsFrom, router.indexOf('\n}\n', hsFrom)) : '';
  ok('handleSupportRequest was found and read', hs.length > 200);
  ok('🔴 IT NO LONGER RESOLVES AN ACCOUNT BY NUMBER TO OWN THE TICKET',
    !hs.includes('findUserIdByPhone'));
  ok('🔴 AND THE ACCOUNT IS EXPLICITLY NULL, so the next reader sees a decision and not an omission',
    /userId: null/.test(hs));
  ok('the ticket is keyed on the number, which is the only thing Meta has authenticated',
    before(hs, 'phone: from', 'reason,'));
  ok('🔴 A SENDER WITH NO ACCOUNT OF HIS OWN STILL REACHES A HUMAN, so there is no early exit',
    !/replyNotLinked/.test(hs));
  // Opening the desk to a sender we cannot resolve opens the drafting call to him too, and he has no
  // subscription paying for it. It asks the same budget every other AI path in the webhook asks.
  ok('🔴 AND THE DRAFTING CALL IS BUDGETED, because the desk is now open to a stranger',
    before(hs, 'aiBudgetBlocked(from)', 'draftSupportReply('));
  // One verdict, one send. Section 7 of test/routing.test.mjs is why a second send is a conversation.
  ok('there is exactly one send in the handler',
    (hs.match(/\bsendText\s*\(/g) || []).length === 1);
  // The write is decided BEFORE the sentence, and the sentence depends on it. openTicket has always
  // returned whether the insert landed and nobody has ever looked, which is how a failed ticket got
  // answered with "I have passed this straight to a real person".
  ok('the ticket write is decided before anything is said',
    before(hs, 'const opened = await openTicket', 'sendText('));
  ok('🔴 AND A TICKET THAT DID NOT OPEN IS NOT ANSWERED WITH "I have passed this on"',
    /opened\s*\n?\s*\?/.test(hs) && /:\s*'I could not get that through to the team/.test(hs));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n--- 7. THE REFUSAL OFFERS A ROAD THAT EXISTS, AND PROMISES NOTHING WE DO NOT DO ---\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════

ok('the taken refusal still says nothing has changed', /have not changed anything/i.test(taken));
ok('🔴 IT SAYS A PERSON PICKS IT UP', /\bperson\b/i.test(taken));
ok('🔴 AND IT SAYS HE WILL HAVE TO PROVE BOTH SIDES, so he knows the shape of the road',
  /\bprove\b/i.test(taken) && /both/i.test(taken));
ok('and that it is done by hand, so nobody expects a button', /by hand/i.test(taken));
// 🔴 NO SELF SERVICE TAKEOVER. The argument is in lib/walink.ts above bindingVerdict: the man
// reading this may be the man who wants his colleague's books.
ok('🔴 IT NEVER OFFERS TO MOVE THE NUMBER ON HIS SAY SO',
  !/(we will move|automatically|reply YES to move|take it over)/i.test(taken));
// The rule the whole file already holds: the reader may be the attacker.
ok('it still names no account, no number and no address', !/@|\+\d|\d{6,}/.test(taken));

const COPY = [taken, ...['expired', 'spent', 'none', 'already', 'notuk', 'failed'].map(linkMessage)];
ok('no em dashes or en dashes anywhere in the refusal copy', COPY.every((s) => !/[–—]/.test(s)));
{
  // The two sentences this change added to the webhook are held to the same rule.
  const added = routerRaw.match(/'I could not get that through to the team[^']*'/g) || [];
  ok('the failed ticket sentence exists and carries no forbidden dash',
    added.length === 1 && !/[–—]/.test(added[0]));
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

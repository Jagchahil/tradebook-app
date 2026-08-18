// WHAT LEKHIO TELLS THE MODEL IT IS, GUARDED WHERE THE CLAIM ACTUALLY LIVES: ON THE WIRE.
//
//   node test/promptclaims.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY THIS SUITE EXISTS, AND WHY test/compliance.test.mjs COULD NEVER HAVE CAUGHT IT.
//
// compliance.test.mjs:196 asserts 'NOWHERE DO WE SAY "we file your tax". Not once, in any screen.'
// and it does it by scanning app/ recursively. That apparatus has held since 6 August 2026 and it
// is the right shape for a SCREEN, because a screen's words are in the source.
//
// B27 walked straight past all of it. "I'm Lekhio, your accountant for small business tax in the
// UK" was never in the source. It was GENERATED at runtime, by a model that lib/claude.ts had told
// "You are Lekhio, the accountant for a UK small business owner, answering in WhatsApp" and, three
// lines later, "You are their accountant". app/api/thread/route.ts calls that function, so both
// sentences composed every model answered question on the live web chat. Proved on production
// twice on 18 August 2026: once volunteered to "what can you do for me", and once as a direct YES
// to "are you an accountant".
//
// 🔴 SO THIS SUITE DOES NOT READ THE SOURCE. IT CAPTURES WHAT GOES ON THE WIRE.
// fetch is stubbed, the REAL exported entry points are called, and the assembled request body is
// pulled apart and scanned. What is guarded is what the model is actually told, after every
// spread, every template and every conditional block has run. A source scan would pass a prompt
// assembled out of two innocent looking halves.
//
// 🔴 AND IT PINS THE SHAPE, NEVER THE SENTENCE. llmstxt.test.mjs:108 pinned the literal words
// "bank feed is built but not yet switched on", the provider refused us, and the guard went on
// requiring a sentence that had become false, so the only thing keeping the overclaim alive was
// the test written to stop it. Every assertion here matches a SHAPE: a self ascription of a
// regulated title, a professional body's name, a channel the prompt cannot know it is on. The
// words underneath are free to improve.
//
// 🔴 AND WHERE A CLAIM IS GUARDED OUT, THE TRUE ONE IS ASSERTED IN. Silence is not honesty and a
// negative guard cannot tell the difference: deleting "the accountant" and saying nothing at all
// would pass every negative below. So the positives are here too, and they are deciders.
//
// ⚠️ THE CUSTOMER'S OWN WORDS ARE NOT OURS AND ARE NOT SCANNED. A man is entitled to type "are you
// on whatsapp", and his question is interpolated into the prompt. Every prompt below is therefore
// assembled from SENTINEL inputs, and the sentinels are subtracted before the scan and separately
// asserted to be PRESENT, so the suite cannot quietly be scanning a string it never captured.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const src = (rel) => readFileSync(path.join(root, rel), 'utf8');
const claudeSrc = src('lib/claude.ts');

// Staged the way claudebody.test.mjs stages it, so the real module runs with its real imports.
const fixImports = (s) => s.replace(/from '(\.\/[a-zA-Z0-9._-]+)'/g, "from '$1.ts'");
const stage = mkdtempSync(path.join(tmpdir(), 'promptclaims-'));
const staged = new Set();
const stageModule = (name) => {
  if (staged.has(name)) return;
  staged.add(name);
  const text = src(`lib/${name}.ts`);
  writeFileSync(path.join(stage, `${name}.ts`), fixImports(text));
  for (const m of text.matchAll(/from '\.\/([a-zA-Z0-9._-]+)'/g)) stageModule(m[1]);
};

// Read at module load, and nothing is ever sent: fetch is stubbed for every call below.
process.env.ANTHROPIC_API_KEY = 'promptclaims-suite-not-a-real-key';
delete process.env.AI_KILL_SWITCH;
stageModule('claude');
const C = await import(pathToFileURL(path.join(stage, 'claude.ts')).href);

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; } else { fail += 1; process.stdout.write(`\n  FAIL  ${name}`); }
};

// ── Capture the assembled request body, then reassemble the human text out of it. ────────────
const realFetch = globalThis.fetch;
const realError = console.error;
const realLog = console.log;
const GOOD = JSON.stringify({
  content: [{ type: 'text', text: '{}' }],
  model: 'claude-haiku-4-5-20251001',
  usage: { input_tokens: 1, output_tokens: 1 },
});

async function capture(fn) {
  let body = null;
  globalThis.fetch = async (_url, init) => {
    body = init && init.body ? String(init.body) : null;
    return { ok: true, status: 200, text: async () => GOOD, json: async () => JSON.parse(GOOD) };
  };
  console.error = () => {};
  console.log = () => {};
  try { await fn(); } catch { /* a parse failure downstream is not this suite's business */ }
  finally { globalThis.fetch = realFetch; console.error = realError; console.log = realLog; }
  if (!body) return '';
  let j;
  try { j = JSON.parse(body); } catch { return ''; }
  const out = [];
  for (const s of j.system || []) if (s && typeof s.text === 'string') out.push(s.text);
  for (const m of j.messages || []) {
    if (typeof m.content === 'string') { out.push(m.content); continue; }
    for (const part of m.content || []) if (part && part.type === 'text' && typeof part.text === 'string') out.push(part.text);
  }
  return out.join('\n');
}

// Sentinels stand in for everything the CUSTOMER supplies. They are subtracted before the scan.
const Q = 'ZZQUESTIONZZ';
const S = 'ZZSUMMARYZZ';
const D = 'ZZDRAFTZZ';

// ⚠️ EVERY ENTRY POINT IN THE MODULE, AND THE LIST IS DERIVED FROM THE SOURCE BELOW RATHER THAN
// TRUSTED. A hand written list of what to cover rots, and it has cost this repo two suites
// already. If somebody adds a ninth prompt tomorrow, this suite FAILS BY NAME until it is covered.
const CASES = [
  { name: 'parseReceipt', channelBlind: false, run: () => C.parseReceipt('aGk=', 'image/jpeg') },
  { name: 'parseSpokenTransaction', channelBlind: false, run: () => C.parseSpokenTransaction(Q) },
  { name: 'draftInvoice', channelBlind: false, run: () => C.draftInvoice(Q) },
  // 🔴 THE TWO THAT B27 IS ABOUT. Both answer a customer in his own words, and answerMoneyQuestion
  // has TWO callers on TWO channels (app/api/whatsapp and app/api/thread), so it may not name one.
  { name: 'answerMoneyQuestion', channelBlind: true, run: () => C.answerMoneyQuestion(Q, S, '') },
  { name: 'answerAccountantQuestion', channelBlind: true, run: () => C.answerAccountantQuestion(Q, S) },
  { name: 'answerExpenseQuestion', channelBlind: false, run: () => C.answerExpenseQuestion(Q) },
  // ⚠️ THE TWO SUPPORT PROMPTS ARE DELIBERATELY NOT channelBlind, AND THE REASON IS WRITTEN DOWN
  // RATHER THAN LEFT AS A GAP. Both open "the front desk for Lekhio, a UK bookkeeping and tax app
  // for sole traders that runs in WhatsApp". draftSupportReply's ONLY caller is
  // app/api/whatsapp/route.ts, so on that one the channel sentence is TRUE. improveSupportAnswer
  // is looser, but every word either produces is reviewed by a human on the team before it is
  // sent, which is a gate /app/thread does not have. They are held to the ROLE guard like
  // everything else; "front desk" is not a regulated title. Filed, measured, not widened into.
  { name: 'draftSupportReply', channelBlind: false, run: () => C.draftSupportReply(Q, [], 'Callum') },
  { name: 'improveSupportAnswer', channelBlind: false, run: () => C.improveSupportAnswer(Q, D) },
  { name: 'parseSchedule', channelBlind: false, run: () => C.parseSchedule(Q, '2026-08-18T09:00:00.000Z') },
];

// ── THE SHAPES. Each assertion carries the match on ONE thing, so each can be sabotaged alone. ──
//
// A ROLE CLAIM is a SELF ASCRIPTION of a regulated or professional title. It is deliberately NOT
// the bare word: "recommend they speak to a qualified accountant or adviser" is a good sentence
// and must survive, and so must "the way a good bookkeeper talks to a tradesperson". What may not
// survive is the model being TOLD it is one.
const SELF = String.raw`(?:you\s+are|you're|i\s+am|i'm|you\s+act\s+as|acting\s+as|act\s+as)`;
const TITLE = String.raw`(?:chartered\s+)?(?:accountant|tax\s+advisers?|tax\s+advisors?|financial\s+advisers?|financial\s+advisors?|advisers?|advisors?|tax\s+agent|solicitors?|barristers?|lawyers?|auditors?)`;
const ROLE_CLAIM = new RegExp(String.raw`\b${SELF}\b[^.!?\n]{0,40}?\b${TITLE}\b`, 'i');

// Claiming to BE HMRC, or to act for it. The prompts talk about HMRC constantly and must.
const HMRC_ROLE = new RegExp(String.raw`\b${SELF}\b[^.!?\n]{0,30}?\bhmrc\b|\b(?:on behalf of|acting for|authorised by|approved by)\s+hmrc\b`, 'i');

// A PROFESSIONAL BODY named at all. We are a member of none of them, and a model told it is
// "built on ACCA, ICAEW, CIOT, AAT" can paraphrase that into an affiliation on a customer's screen.
const BODY = /\b(ACCA|ICAEW|ICAS|CIOT|AAT|ATT|CIMA|CIPFA)\b/;

// A MESSAGING SERVICE named in a prompt that cannot know which one it is on.
const SERVICE = /\b(whats\s?app|sms|imessage|telegram|messenger|signal app)\b/i;

// The general form of "you are standing in X", so a future prompt that names a channel some other
// way is still caught even if it never types the word WhatsApp.
const PLACED = /\b(?:answering|replying|talking|speaking|writing|chatting)\b[^.!?\n]{0,25}?\b(?:in|on|via|through|inside)\s+(?:the\s+|this\s+)?(?:app|chat|website|web\s+chat|phone|browser)\b/i;

console.log('\nEvery prompt this module can put on the wire, captured and scanned.\n');

// ⚠️ THE COVERAGE CHECK, DERIVED. Not a comment asking somebody to remember.
{
  const exported = [...claudeSrc.matchAll(/^export async function ([A-Za-z0-9_]+)/gm)].map((m) => m[1]);
  const covered = new Set(CASES.map((c) => c.name));
  const missing = exported.filter((n) => !covered.has(n));
  ok(`🔴 EVERY ASYNC ENTRY POINT IS COVERED (missing: ${missing.join(', ') || 'none'})`, missing.length === 0);
  ok('and the derivation found entry points at all, so the check above is not vacuous', exported.length >= 8);
}

const captured = new Map();
for (const c of CASES) captured.set(c.name, await capture(c.run));

for (const c of CASES) {
  const raw = captured.get(c.name);
  // Subtract the customer's own words. What is left is ours, and only ours is guarded.
  const ours = raw.split(Q).join(' ').split(S).join(' ').split(D).join(' ');

  // VACUITY FIRST. A guard scanning an empty string passes everything.
  ok(`${c.name}: a prompt was actually captured off the wire`, raw.length > 200);
  ok(`${c.name}: the prompt is OURS, not the stub echoing back`, /\n/.test(ours) && ours.length > 150);

  ok(`🔴 ${c.name}: never told it IS an accountant, adviser, agent or other professional`, !ROLE_CLAIM.test(ours));
  ok(`🔴 ${c.name}: never told it IS HMRC or acts for HMRC`, !HMRC_ROLE.test(ours));
  ok(`🔴 ${c.name}: names no professional body`, !BODY.test(ours));

  if (c.channelBlind) {
    ok(`🔴 ${c.name}: names no messaging service, because it cannot know which one it is on`, !SERVICE.test(ours));
    ok(`🔴 ${c.name}: does not place the model in a screen or an app either`, !PLACED.test(ours));
  }
}

// ── THE TRUE ALTERNATIVE, ASSERTED IN. These are deciders, not decoration. ───────────────────
console.log('\nAnd what was guarded out is replaced by something true, not by silence.\n');
{
  const money = captured.get('answerMoneyQuestion').split(Q).join(' ').split(S).join(' ');
  const ask = captured.get('answerAccountantQuestion').split(Q).join(' ').split(S).join(' ');

  for (const [label, p] of [['answerMoneyQuestion', money], ['answerAccountantQuestion', ask]]) {
    ok(`🔴 ${label}: says positively what Lekhio IS, in the bookkeeping family`, /book-?keeping/i.test(p));
    ok(`🔴 ${label}: carries a standing instruction never to claim the role`, /never call lekhio their/i.test(p));
    ok(`${label}: still states prepare, approve, responsible`, /prepares?[^.]*approve[^.]*responsib/i.test(p));
  }

  // The capability half. It is one sentence and not two because BOTH callers of
  // answerMoneyQuestion take a receipt photograph: app/api/thread runs the same ingest walk as the
  // capture route. On the old build the model told a man on the web "You don't send me receipts,
  // mate", eleven words above a composer offering exactly that.
  ok('🔴 answerMoneyQuestion: tells the model a receipt photograph CAN be sent in this conversation',
    /photograph of a receipt in this conversation/i.test(money));
  // ⚠️ AND THE SAME SENTENCE MUST NOT BE HERE. /api/ask has one caller, the phone's Ask box, and it
  // is TEXT ONLY. This is the entire measured difference between the two prompts.
  ok('🔴 answerAccountantQuestion: carries NO photograph promise, because its one caller is text only',
    !/photograph of a receipt in this conversation/i.test(ask));

  // ══════════════════════════════════════════════════════════════════════════════════
  // 🔴 B31, 18 AUGUST 2026. BOTH PROMPTS FORBID MARKDOWN, AND ONE OF THEM DID NOT UNTIL TONIGHT.
  //
  // Found by the B27 sweep, measured twice before it was changed, because the item said the five
  // clean answers walked that day were evidence and not proof.
  //
  //   DERIVED OFF DISK: app/app/thread/chat/page.tsx prints the reply as a React TEXT CHILD inside
  //   a pre-wrap paragraph. No markdown renderer on the path, no dangerouslySetInnerHTML, no
  //   markdown dependency in package.json. The symbols show as literal characters.
  //
  //   WALKED ON PRODUCTION as +callum, on the build BEFORE this rule, on questions written to
  //   INVITE a list: TWO OF THREE model answers came back with markdown and the first carried NINE
  //   bold headings. A customer read "**Clothing.** High-visibility wear and safety boots".
  //
  // ⚠️ houseCopy() IS sanitiseDashes(text.trim()) AND STRIPS NO MARKUP, so nothing catches this at
  // the boundary either. A stripping pass was NOT added: the measurement says the prompt rule is
  // where accountantSystem() already solved it, and two solutions to one problem is how they drift.
  // ══════════════════════════════════════════════════════════════════════════════════
  const NO_MARKDOWN = /do not use any markdown/i;
  for (const [label, prompt] of [['answerMoneyQuestion', money], ['answerAccountantQuestion', ask]]) {
    ok(`🔴 ${label}: is told plainly not to use markdown`, NO_MARKDOWN.test(prompt));
    ok(`🔴 ${label}: ...and names the symbols, so "no markdown" cannot be read as a style note`,
      /no bold, no asterisks, no headers, no hash symbols/i.test(prompt));
    ok(`🔴 ${label}: ...and says WHY, which is that the symbols land on his screen as characters`,
      /literal characters/i.test(prompt));
    ok(`${label}: ...and still allows a hyphen bullet, which is the one list shape that survives`,
      /simple hyphen and a space/i.test(prompt));
  }
  // 🔴 AND THE ONE WORD THAT DIFFERS IS THE CHANNEL, WHICH IS THIS SUITE'S WHOLE SUBJECT.
  // accountantSystem() has ONE caller and may say "The app". answerMoneyQuestion has TWO, on two
  // channels, and may name neither, so its version of the same sentence is impersonal. If somebody
  // copies the other one across wholesale, the channel guard above catches "The app" and this
  // catches the reason.
  ok('🔴 answerMoneyQuestion: the markdown rule names NO app and NO channel, because it has two callers',
    NO_MARKDOWN.test(money) && !/\bthe app shows your reply\b/i.test(money));
  ok('🔴 answerAccountantQuestion: may say "The app", because its one caller IS the phone app',
    /the app shows your reply/i.test(ask));
}

// ── The guard can bite. Three specimens that MUST match, so a broken regex cannot pass quietly. ─
console.log('\nThe matchers can bite: the sentences this packet deleted must still be caught.\n');
{
  ok('the role shape catches the sentence that was live on 18 August',
    ROLE_CLAIM.test('You are Lekhio, the accountant for a UK small business owner.'));
  ok('the role shape catches the second one, three lines down',
    ROLE_CLAIM.test('You are their accountant.'));
  ok('the role shape catches a title nobody has used yet',
    ROLE_CLAIM.test("You're their tax adviser."));
  ok('the role shape LEAVES a good sentence alone (recommending a real professional)',
    !ROLE_CLAIM.test('For anything complex, recommend they speak to a qualified accountant or adviser.'));
  ok('the role shape LEAVES a tone simile alone',
    !ROLE_CLAIM.test('Style: plain English, the way a good bookkeeper talks to a tradesperson.'));
  ok('the role shape LEAVES the new denial alone, which is why the copy was worded as an instruction',
    !ROLE_CLAIM.test('Never call Lekhio their accountant, their adviser or their agent.'));
  ok('the channel shape catches the fragment that was live on 18 August',
    SERVICE.test('You are Lekhio, the accountant for a UK small business owner, answering in WhatsApp.'));
  ok('the placed shape catches a channel claim that never types a service name',
    PLACED.test('You are answering in the app.'));
  ok('the body shape catches the qualification claim found in the sweep',
    BODY.test('built on the rules taught in the leading qualifications (ACCA, ICAEW, CIOT, AAT)'));
}

process.stdout.write(`\n\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

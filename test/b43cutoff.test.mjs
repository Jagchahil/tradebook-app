// B43. THE FLAG THAT NOBODY READ. EVERY MODEL CALL EITHER READS stop_reason OR SAYS WHY NOT.
//
//   node test/b43cutoff.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS FOR.
//
// The API says, on every reply, whether OUR OWN CEILING cut it off. Until 19 August 2026 that flag
// was read in exactly one place in the estate, inside parseReceipt, whose ceiling had already been
// raised so it hardly needed it. FIVE calls sat at max_tokens 300 and read nothing, and a claim
// question on production came back ending "Home office. If you work from home", mid sentence, with
// nothing saying it had been cut.
//
// 🔴 THE GUARD IS THE SHAPE, NOT A LIST OF FIVE. The item was filed as "one plus two more", was re
// derived as five, and this suite found a further FOUR the item never named, because it does not
// carry a list: it WALKS lib/claude.ts, derives every model call site from the source, and requires
// each one to read the flag or to carry a written exemption naming why. A list of five rots the
// first time somebody adds a sixth, which is exactly how this item came to exist.
//
// 🔴 AND THE WALKER IS PROVED NON VACUOUS BEFORE ANY CLEAN RUN IS BELIEVED. Section 1b runs the
// SAME walker over synthetic sources: one with an uncovered call site, which it must REPORT, and
// one covered, which it must not. A scanner that cannot see a miss reports zero misses for ever,
// and this repo has shipped one of those before.
//
// 🔴 SECTIONS 2 AND 3 ARE BEHAVIOUR, NOT SHAPE. fetch is stubbed and the REAL exported functions
// are called, so what is proved is what a customer would actually get.
//
//   A PARSE that was cut comes back NULL. Every caller already renders that as an honest "I could
//   not read that", so no new customer sentence exists on that path.
//   An ANSWER that was cut comes back trimmed to its last COMPLETE sentence, then the signed line.
//   An answer that was NOT cut comes back BYTE FOR BYTE, which is the assertion that stops the
//   trim from eating a complete final sentence that happens to lack a full stop.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, mkdtempSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const src = (rel) => readFileSync(path.join(root, rel), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) pass += 1;
  else { fail += 1; process.stdout.write(`\n  FAIL  ${name}`); }
};

const claudeSrc = src('lib/claude.ts');

// ═══════════════════════════════════════════════════════════════════════════════════════════
// SECTION 1. THE SHAPE GUARD. DERIVED, NEVER LISTED.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// A model call site is a `max_tokens:` key inside the body of a POST to this file's API_URL. That
// is the definition, and it is read off the source rather than remembered, so a tenth call added
// tomorrow is walked the day it lands.
//
// Coverage is derived in two steps, so a caller that reads the flag THROUGH a helper still counts:
//   1. find every function in the file whose own body mentions stop_reason. Those are the readers.
//   2. a call site is covered when its enclosing function mentions stop_reason itself, or calls one
//      of the readers found in step 1.
// An EXEMPTION is the marker `STOP_REASON EXEMPT:` followed by a non empty reason, inside the same
// function. It is deliberately noisy to type and deliberately requires a sentence.

// Strip comments so a call site cannot be "covered" by PROSE about it. The `(^|[^:])//` form is
// the safe one: a bare `//` also eats the slashes in https:// and takes the rest of the line.
function stripComments(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

// The same job, LENGTH PRESERVING: every comment character becomes a space, so indices into the
// blanked copy and the original are the same character. Newlines are kept so line shape survives.
function blankComments(s) {
  const out = s.split('');
  const blank = (a, b) => { for (let k = a; k < b && k < out.length; k++) if (out[k] !== '\n') out[k] = ' '; };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      for (i++; i < s.length; i++) { if (s[i] === '\\') i++; else if (s[i] === q) break; }
      continue;
    }
    if (c === '/' && s[i + 1] === '/') {
      // ⚠️ NOT after a colon. A bare `//` also matches the slashes in https:// and would blank the
      // rest of that line, which on this file means blanking the API URL.
      if (i > 0 && s[i - 1] === ':') continue;
      let end = s.indexOf('\n', i); if (end < 0) end = s.length;
      blank(i, end); i = end; continue;
    }
    if (c === '/' && s[i + 1] === '*') {
      const end = s.indexOf('*/', i + 2);
      const stop = end < 0 ? s.length : end + 2;
      blank(i, stop); i = stop - 1; continue;
    }
  }
  return out.join('');
}

// 🔴 THE BODY IS FOUND BY MATCHING ITS BRACES, NOT BY RUNNING TO THE NEXT FUNCTION.
//
// The first version of this walker took a function's span as "from its declaration to the start of
// the next one", and it was GREEN FOR THE WRONG REASON on its very first run. That span swallowed
// everything BETWEEN two functions, including the `ClaudeReply` type declaration, whose one line
// `stop_reason?: string;` sits above readClaudeReply. So logUsage, which reads nothing and decides
// nothing, was derived as a READER of the flag, and all nine call sites were then "covered" through
// it. A guard that passes for the wrong reason is worse than no guard, because it is also a claim.
//
// ⚠️ AND THE SECOND VERSION WAS WRONG TOO, IN THE OPPOSITE DIRECTION. Taking "the first { after the
// declaration" as the body opener matched the brace inside a PARAMETER TYPE:
// `logUsage(feature: string, data: { model?: string ... })` and `draftSupportReply(..., kb?:
// Array<{ title: string ... }>)` both got two line bodies, and draftSupportReply's real call site
// fell OUTSIDE every span and was reported as "(top level)". Both faults are asserted below.
function matchPair(s, from, open, close) {
  let i = s.indexOf(open, from);
  if (i < 0) return -1;
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      for (j++; j < s.length; j++) { if (s[j] === '\\') j++; else if (s[j] === q) break; }
      continue;
    }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return j; }
  }
  return -1;
}

// From the end of the parameter list, the body opener is the first `{` seen at ANGLE depth zero, so
// a return type like Promise<{ a: string }> cannot be mistaken for the body.
function bodyOpener(s, afterParen) {
  let angle = 0;
  for (let j = afterParen; j < s.length; j++) {
    const c = s[j];
    if (c === '<') angle++;
    else if (c === '>') { if (angle > 0) angle--; }
    else if (c === '{' && angle === 0) return j;
    else if (c === ';') return -1;
  }
  return -1;
}

// Top level function declarations, each owning ONLY its own braced body.
function functionSpans(source) {
  const re = /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/gm;
  const out = [];
  let m;
  while ((m = re.exec(source)) !== null) {
    const closeParen = matchPair(source, m.index, '(', ')');
    if (closeParen < 0) continue;
    const open = bodyOpener(source, closeParen + 1);
    if (open < 0) continue;
    const close = matchPair(source, open, '{', '}');
    if (close < 0) continue;
    out.push({ name: m[1], start: m.index, end: close + 1, bodyStart: open });
  }
  return out;
}

function enclosing(spans, index) {
  for (const s of spans) if (index >= s.start && index < s.end) return s;
  return null;
}

// The walker. Returns every call site with a verdict, and NEVER a bare boolean, so a caller cannot
// mistake "nothing found" for "all covered".
function walkCallSites(source) {
  // 🔴 COMMENTS ARE BLANKED, NOT DELETED, so every index below still points at the same character
  // in the original. A stripped copy and an original of different lengths is how the first version
  // of this walker ended up attributing a call site to "(top level)".
  const code = blankComments(source);
  const spans = functionSpans(code);
  const codeOf = (s) => code.slice(s.start, s.end);

  // A reader reads the flag in its own CODE. Prose about stop_reason is not a read.
  const readers = new Set(spans.filter((s) => /stop_reason/.test(codeOf(s))).map((s) => s.name));

  // 🔴 AND READING IT THROUGH A HELPER COUNTS, to the fixed point. answerMoneyQuestion calls
  // finishAnswer calls wasCutOff reads the flag. Requiring the literal token in every function
  // would force the check to be copied nine times, which is the shape this item is about.
  for (let changed = true; changed; ) {
    changed = false;
    for (const s of spans) {
      if (readers.has(s.name)) continue;
      for (const r of readers) {
        if (r !== s.name && new RegExp(`\\b${r}\\s*\\(`).test(codeOf(s))) { readers.add(s.name); changed = true; break; }
      }
    }
  }

  const sites = [];
  const re = /max_tokens\s*:/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    const fn = enclosing(spans, m.index);
    const exemptMatch = fn ? source.slice(fn.start, fn.end).match(/STOP_REASON EXEMPT:\s*(\S[^\n]*)/) : null;
    sites.push({
      fn: fn ? fn.name : '(top level)',
      covered: fn ? readers.has(fn.name) : false,
      exempt: exemptMatch ? exemptMatch[1].trim() : null,
    });
  }
  return { sites, readers: [...readers] };
}

const walk = walkCallSites(claudeSrc);
const uncovered = walk.sites.filter((s) => !s.covered && !s.exempt);

ok('🔴 THE WALKER FOUND MODEL CALL SITES AT ALL, without which every line below is vacuous',
  walk.sites.length >= 9);
ok('and it found the functions that actually read the flag, rather than an empty reader set',
  walk.readers.length >= 1);
ok('🔴 EVERY MODEL CALL SITE IN lib/claude.ts READS stop_reason OR CARRIES A WRITTEN EXEMPTION'
  + (uncovered.length ? `  [uncovered: ${uncovered.map((u) => u.fn).join(', ')}]` : ''),
  uncovered.length === 0);
ok('no exemption is an empty one, because a reason nobody wrote is not a reason',
  walk.sites.every((s) => s.exempt === null || s.exempt.length > 8));

// 🔴 THE TWO WALKER FAULTS THAT ACTUALLY HAPPENED, ASSERTED AGAINST THE REAL FILE.
ok('🔴 NO CALL SITE FALLS OUTSIDE EVERY FUNCTION. A "(top level)" verdict is a WALKER fault, not a'
  + ' coverage one, and it is what a parameter type brace produced',
  walk.sites.every((s) => s.fn !== '(top level)'));
ok('🔴 logUsage IS NOT A READER OF THE FLAG. It reads token counts and decides nothing, and the'
  + ' first walker derived it as a reader because ClaudeReply sits above it',
  !walk.readers.includes('logUsage'));
ok('and the functions that DO read it are the ones that read it',
  walk.readers.includes('wasCutOff') && walk.readers.includes('parseReceipt')
  && walk.readers.includes('refuseIfCut') && walk.readers.includes('finishAnswer'));
ok('🔴 draftSupportReply IS WALKED. Its parameter carries Array<{ title: string; body: string }>,'
  + ' which is the exact shape that hid its call site',
  walk.sites.some((s) => s.fn === 'draftSupportReply'));
ok('and every one of the nine known call sites is attributed to a named function',
  walk.sites.length === 9 && new Set(walk.sites.map((s) => s.fn)).size === 9);

// ── 1b. VACUITY. THE WALKER CAN SEE A MISS. ────────────────────────────────────────────────
const SYNTH_BAD = `
// 🔴 THE DECOY. A type declaration mentioning the flag sits between two functions, exactly where
// ClaudeReply sits in the real file. A walker whose spans run to the next function swallows it and
// derives innocentHelper as a reader, which is the fault this fixture exists to keep caught.
function innocentHelper(x: number) {
  return x + 1;
}
type ClaudeReply = { stop_reason?: string };
function realReader(data: ClaudeReply) { return data.stop_reason === 'max_tokens'; }
function viaHelper(data: ClaudeReply) { return realReader(data); }
export async function coveredCall() {
  const res = await fetch(API_URL, { body: JSON.stringify({ max_tokens: 300 }) });
  const data = await readClaudeReply(res, 'x');
  innocentHelper(1);
  if (viaHelper(data)) return null;
  return 'ok';
}
export async function uncoveredCall() {
  const res = await fetch(API_URL, { body: JSON.stringify({ max_tokens: 300 }) });
  const data = await readClaudeReply(res, 'y');
  innocentHelper(2);
  return data.content;
}
`;
const synth = walkCallSites(SYNTH_BAD);
const synthMissing = synth.sites.filter((s) => !s.covered && !s.exempt).map((s) => s.fn);
ok('🔴 VACUITY: the walker SEES the uncovered synthetic call site',
  synthMissing.includes('uncoveredCall'));
ok('🔴 VACUITY: and it does NOT flag the covered one, so it is not simply flagging everything',
  !synthMissing.includes('coveredCall'));
ok('🔴 VACUITY: coverage is TRANSITIVE, so reading the flag through a helper still counts',
  synth.readers.includes('viaHelper') && synth.readers.includes('coveredCall'));
ok('🔴 VACUITY: AND THE DECOY IS NOT A READER. A type declaration between two functions must never'
  + ' make the function above it look as though it reads the flag',
  !synth.readers.includes('innocentHelper'));
ok('and prose about the flag is not a read either, because the body is stripped before it is tested',
  !walkCallSites(SYNTH_BAD.replace('  innocentHelper(2);', '  // stop_reason is handled elsewhere'))
    .sites.filter((x) => !x.covered && !x.exempt).map((x) => x.fn).includes('uncoveredCall') === false);

const SYNTH_PARAM_BRACE = `
function helper(feature: string, data: { model?: string; usage?: { out?: number } }): void {
  return;
}
type ClaudeReply = { stop_reason?: string };
export async function paramBraceCall(a: string, kb?: Array<{ title: string; body: string }>): Promise<{ x: string } | null> {
  const res = await fetch(API_URL, { body: JSON.stringify({ max_tokens: 300 }) });
  const data = await readClaudeReply(res, 'z');
  helper('z', data);
  return data.content;
}
`;
const paramWalk = walkCallSites(SYNTH_PARAM_BRACE);
ok('🔴 VACUITY: A PARAMETER TYPE BRACE DOES NOT TRUNCATE A BODY. The call site is attributed to its'
  + ' function rather than to "(top level)", which is how draftSupportReply escaped the first walker',
  paramWalk.sites.length === 1 && paramWalk.sites[0].fn === 'paramBraceCall');
ok('🔴 VACUITY: and that call site is REPORTED as uncovered, so the fix to the walker did not turn'
  + ' into a fix to the verdict',
  paramWalk.sites[0].covered === false);
ok('and an inline object RETURN type does not become the body either',
  !paramWalk.readers.includes('paramBraceCall'));

const SYNTH_EXEMPT = SYNTH_BAD.replace(
  'export async function uncoveredCall() {',
  'export async function uncoveredCall() {\n  // STOP_REASON EXEMPT: this one is a fixture and sends nothing.',
);
ok('🔴 VACUITY: a written exemption clears it, and an exemption is the ONLY other way through',
  walkCallSites(SYNTH_EXEMPT).sites.filter((s) => !s.covered && !s.exempt).length === 0);

const SYNTH_BLANK_EXEMPT = SYNTH_BAD.replace(
  'export async function uncoveredCall() {',
  'export async function uncoveredCall() {\n  // STOP_REASON EXEMPT: x',
);
ok('and a one word exemption does NOT clear it, because that is a shrug with a label on',
  walkCallSites(SYNTH_BLANK_EXEMPT).sites.some((s) => s.exempt !== null && s.exempt.length <= 8));

// ── 1c. THE COMMENT STRIPPER DID NOT EAT THE FILE. ─────────────────────────────────────────
const codeOnly = stripComments(claudeSrc);
ok('the comment stripper left the code behind rather than eating the file',
  /export async function answerMoneyQuestion\(/.test(codeOnly) && codeOnly.length > 5000);
ok('and it did NOT eat an https:// URL and the rest of its line with it',
  codeOnly.includes('https://api.anthropic.com/v1/messages'));

// ── 1d. THE SIGNED LINE IS TYPED EXACTLY ONCE IN THE PRODUCT. ──────────────────────────────
const SIGNED = 'That is as much as I can fit in one go. Ask me about any part of it and I will go deeper.';
function walkFiles(dir, out = []) {
  // withFileTypes and a dot skip. app/.node/bin holds a BROKEN SYMLINK, and a statSync walk dies on
  // it rather than reporting anything, which is a suite that cannot fail for the wrong reason.
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, out);
    else if (e.isFile() && /\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const productFiles = [...walkFiles(path.join(root, 'app')), ...walkFiles(path.join(root, 'lib'))];
const withSigned = productFiles.filter((p) => readFileSync(p, 'utf8').includes(SIGNED));
ok('🔴 THE SIGNED LINE IS TYPED IN EXACTLY ONE FILE UNDER app/ AND lib/, so it cannot drift'
  + (withSigned.length === 1 ? '' : `  [${withSigned.length}: ${withSigned.map((p) => path.relative(root, p)).join(', ')}]`),
  withSigned.length === 1);
ok('and that file is lib/claude.ts',
  withSigned.length === 1 && path.relative(root, withSigned[0]) === 'lib/claude.ts');
ok('🔴 THE WORDS ARE THE SIGNED WORDS, character for character',
  claudeSrc.includes(`  'That is as much as I can fit in one go. Ask me about any part of it and I will go deeper.';`));
ok('and it carries no forbidden dash, so houseCopy could never need to rewrite it',
  !/[–—−]/.test(SIGNED) && !/(\S) - (\S)/.test(SIGNED));

// ═══════════════════════════════════════════════════════════════════════════════════════════
// SECTION 2. BEHAVIOUR. THE REAL FUNCTIONS, WITH fetch STUBBED.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const fixImports = (s) => s.replace(/from '(\.\/[a-zA-Z0-9._-]+)'/g, "from '$1.ts'");
const stage = mkdtempSync(path.join(tmpdir(), 'b43cutoff-'));
const staged = new Set();
const stageModule = (name) => {
  if (staged.has(name)) return;
  staged.add(name);
  const text = src(`lib/${name}.ts`);
  writeFileSync(path.join(stage, `${name}.ts`), fixImports(text));
  for (const m of text.matchAll(/from '\.\/([a-zA-Z0-9._-]+)'/g)) stageModule(m[1]);
};
process.env.ANTHROPIC_API_KEY = 'b43-cutoff-suite-not-a-real-key';
delete process.env.AI_KILL_SWITCH;
stageModule('claude');
const C = await import(pathToFileURL(path.join(stage, 'claude.ts')).href);

const realFetch = globalThis.fetch;
const realError = console.error;
const realLog = console.log;
const reply = (body) => async () => ({
  ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body),
});
async function withReply(text, stop, fn) {
  globalThis.fetch = reply(JSON.stringify({
    content: [{ type: 'text', text }],
    model: 'claude-haiku-4-5-20251001',
    stop_reason: stop,
    usage: { input_tokens: 10, output_tokens: 20 },
  }));
  console.error = () => {};
  console.log = () => {};
  try { return await fn(); } finally {
    globalThis.fetch = realFetch; console.error = realError; console.log = realLog;
  }
}

ok('🔴 THE ENTRY POINTS EXIST AND ARE CALLABLE, without which section 2 is vacuous',
  ['parseSpokenTransaction', 'parseSchedule', 'draftInvoice', 'answerMoneyQuestion',
   'answerExpenseQuestion', 'draftSupportReply', 'improveSupportAnswer', 'answerAccountantQuestion']
    .every((n) => typeof C[n] === 'function'));
ok('and the module believes it is configured, or every call short circuits before the stub',
  C.hasClaudeConfig() === true);

// ── 2a. THE GOOD ARM FIRST, so the cut arm proves a difference rather than a broken stub. ──
const GOOD_ENTRY = JSON.stringify({ direction: 'expense', merchant_name: 'BP', amount: 40, category: 'fuel' });
const goodParse = await withReply(GOOD_ENTRY, 'end_turn', () => C.parseSpokenTransaction('forty quid of diesel at the BP'));
ok('🔴 AN UNCUT PARSE STILL COMES BACK PARSED, so this is not a guard that refuses everything',
  goodParse !== null && goodParse.amount === 40 && goodParse.merchant_name === 'BP');

// ── 2b. A CUT PARSE IS REFUSED AND NEVER WRITTEN. ─────────────────────────────────────────
const cutParse = await withReply(GOOD_ENTRY, 'max_tokens', () => C.parseSpokenTransaction('forty quid of diesel at the BP'));
ok('🔴 A CUT PARSE COMES BACK NULL EVEN WHEN THE JSON HAPPENS TO BE COMPLETE',
  cutParse === null);
const cutSchedule = await withReply(
  JSON.stringify({ is_event: true, title: 'Price up a job for Dave', kind: 'quote', starts_at: null, remind_at: null }),
  'max_tokens', () => C.parseSchedule('price up a job for dave tomorrow at 8', new Date(0).toISOString()));
ok('🔴 A CUT SCHEDULE PARSE COMES BACK NULL', cutSchedule === null);
const goodSchedule = await withReply(
  JSON.stringify({ is_event: true, title: 'Price up a job for Dave', kind: 'quote', starts_at: null, remind_at: null }),
  'end_turn', () => C.parseSchedule('price up a job for dave tomorrow at 8', new Date(0).toISOString()));
ok('and an uncut one still parses, so the schedule guard is not refusing everything',
  goodSchedule !== null && goodSchedule.kind === 'quote');

const INVOICE = JSON.stringify({ customer_name: 'Dave', line_items: [{ description: 'Rewire', amount: 450 }] });
ok('🔴 A CUT INVOICE DRAFT COMES BACK NULL. THIS ONE WAS NOT IN THE ITEM',
  (await withReply(INVOICE, 'max_tokens', () => C.draftInvoice('rewire 450'))) === null);
ok('and an uncut invoice draft still comes back with its lines',
  (await withReply(INVOICE, 'end_turn', () => C.draftInvoice('rewire 450')))?.line_items?.length === 1);

ok('🔴 A CUT SUPPORT PLAYBOOK REWRITE IS REFUSED, because a half one is saved and served for ever',
  (await withReply('Thanks for getting in touch, we', 'max_tokens', () => C.improveSupportAnswer('q', 'draft'))) === null);
ok('and an uncut one still comes back',
  typeof (await withReply('Thanks for getting in touch.', 'end_turn', () => C.improveSupportAnswer('q', 'draft'))) === 'string');

// ═══════════════════════════════════════════════════════════════════════════════════════════
// SECTION 3. THE ANSWER PATHS. TRIMMED, MARKED, AND NEVER TOUCHED WHEN NOT CUT.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const LONG_CUT = 'You can claim a few things here. Home office. If you work from home';
const cutMoney = await withReply(LONG_CUT, 'max_tokens', () => C.answerMoneyQuestion('what can i claim', 'summary'));
ok('🔴 A CUT ANSWER IS TRIMMED BACK TO ITS LAST COMPLETE SENTENCE',
  typeof cutMoney === 'string' && !/If you work from home/.test(cutMoney) && /Home office\./.test(cutMoney));
ok('🔴 AND IT CARRIES THE SIGNED LINE, EXACTLY, AT THE END',
  typeof cutMoney === 'string' && cutMoney.endsWith(SIGNED));
ok('and the signed line sits on its own line rather than running on from his answer',
  typeof cutMoney === 'string' && cutMoney.includes(`\n\n${SIGNED}`));

// 🔴 THE ASSERTION THE WHOLE TRIM RESTS ON.
const COMPLETE_NO_STOP = 'You can claim it, and the rate is 55p a mile\nSource: https://www.gov.uk/simplified-expenses';
const uncutMoney = await withReply(COMPLETE_NO_STOP, 'end_turn', () => C.answerMoneyQuestion('mileage', 'summary'));
ok('🔴 AN UNCUT ANSWER THAT ENDS WITHOUT A FULL STOP IS RETURNED BYTE FOR BYTE, so the trim CANNOT'
  + ' eat a complete final sentence that happens to lack one',
  uncutMoney === COMPLETE_NO_STOP);
ok('and an uncut answer never carries the signed line',
  typeof uncutMoney === 'string' && !uncutMoney.includes(SIGNED));

const uncutOrdinary = await withReply('You can claim it. General info, not advice for your exact situation.', 'end_turn',
  () => C.answerExpenseQuestion('can i claim my boots'));
ok('an ordinary uncut expense answer is returned unchanged and unmarked',
  uncutOrdinary === 'You can claim it. General info, not advice for your exact situation.');
ok('🔴 A CUT EXPENSE ANSWER IS MARKED TOO, so the second answering lane is wired',
  (await withReply('Yes you can. Boots that are genuine protective', 'max_tokens',
    () => C.answerExpenseQuestion('boots')))?.endsWith(SIGNED) === true);
ok('🔴 A CUT SUPPORT DRAFT IS MARKED, so the human editing it can SEE it was cut before he sends it',
  (await withReply('Thanks for getting in touch. We are looking into', 'max_tokens',
    () => C.draftSupportReply('my app is broken')))?.endsWith(SIGNED) === true);
ok('🔴 THE THIRD ROUTER IS WIRED TOO: the in app accountant on /api/ask marks a cut answer',
  (await withReply('The threshold is £90,000. If your turnover goes over', 'max_tokens',
    () => C.answerAccountantQuestion('vat threshold')))?.endsWith(SIGNED) === true);
ok('and the accountant leaves an uncut answer alone',
  (await withReply('The threshold is £90,000.', 'end_turn',
    () => C.answerAccountantQuestion('vat threshold'))) === 'The threshold is £90,000.');

// ── 3b. THE TRIM'S OWN EDGES. ─────────────────────────────────────────────────────────────
const noSentence = await withReply('You can claim a proportion of it if the room is', 'max_tokens',
  () => C.answerMoneyQuestion('home office', 'summary'));
ok('🔴 A CUT REPLY WITH NO COMPLETE SENTENCE KEEPS EVERY WORD HE WAS GIVEN, rather than becoming'
  + ' the note and nothing else',
  typeof noSentence === 'string' && noSentence.startsWith('You can claim a proportion of it if the room is')
  && noSentence.endsWith(SIGNED));

const halfDecimal = await withReply('Your bill this quarter is worked out below. You owe £47.', 'max_tokens',
  () => C.answerMoneyQuestion('what do i owe', 'summary'));
ok('🔴 A FULL STOP THAT IS HALF A DECIMAL IS NOT A SENTENCE END. "£47." when the model was writing'
  + ' £47.20 must never be kept as a finished figure',
  typeof halfDecimal === 'string' && !/You owe £47\./.test(halfDecimal)
  && /worked out below\./.test(halfDecimal));

const wholeDecimal = await withReply('You owe £47.20 this quarter. Pay by 31 January', 'max_tokens',
  () => C.answerMoneyQuestion('what do i owe', 'summary'));
ok('and a complete decimal mid sentence is untouched, so the decimal rule is not eating good money',
  typeof wholeDecimal === 'string' && /£47\.20 this quarter\./.test(wholeDecimal)
  && !/Pay by 31 January/.test(wholeDecimal));

// 🔴 THE ONE THAT DISCRIMINATES. The fixture above does NOT: its last terminator is the full stop
// after "quarter" either way, so it stays green with the mid number rule deleted. This one puts the
// decimal point AFTER the last real sentence end, which is the only shape where the rule decides.
const trailingDecimal = await withReply('Your total is £1,234. Add the VAT of £246.80', 'max_tokens',
  () => C.answerMoneyQuestion('what do i owe', 'summary'));
ok('🔴 A DECIMAL POINT IS NEVER THE LAST SENTENCE END. Cutting at one would serve £246. as a'
  + ' finished figure when the model was writing £246.80',
  typeof trailingDecimal === 'string' && !/246/.test(trailingDecimal)
  && /Your total is £1,234\./.test(trailingDecimal));

// 🔴 AND THIS ONE DISCRIMINATES TOO. A closing quote must be the LAST terminator for the rule to
// decide anything, so the quoted question is put at the END rather than at the start.
const quoted = await withReply('The rule is simple. He asked "can I claim it?" and the answer depends on', 'max_tokens',
  () => C.answerMoneyQuestion('q', 'summary'));
ok('🔴 A CLOSING QUOTE BELONGS TO THE SENTENCE IT CLOSES, so the trim keeps the whole quoted'
  + ' question rather than falling back to the sentence before it',
  typeof quoted === 'string' && quoted.includes('can I claim it?"')
  && !/and the answer depends on/.test(quoted));

// ── 3c. THE CEILINGS MOVED, AND THE CEILING IS NOT THE FIX. ───────────────────────────────
ok('🔴 THE THREE SHORT ANSWERING LANES SHARE ONE NAMED CEILING rather than three typed numbers',
  (claudeSrc.match(/max_tokens: ANSWER_MAX_TOKENS/g) || []).length === 3);
ok('and that ceiling is above the 300 that production was measured cutting off at',
  /const ANSWER_MAX_TOKENS = (\d+);/.test(claudeSrc)
  && Number(claudeSrc.match(/const ANSWER_MAX_TOKENS = (\d+);/)[1]) > 300);
ok('🔴 AND IT IS NOT SIMPLY THE ACCOUNTANT\'S 4000, because these are the SHORT lanes and a bigger'
  + ' ceiling here turns a two sentence promise into an essay',
  Number(claudeSrc.match(/const ANSWER_MAX_TOKENS = (\d+);/)[1]) < 4000);

// ── 3d. THE LOG NAMES THE CAUSE AND NEVER THE CONTENT. ────────────────────────────────────
const logged = [];
globalThis.fetch = reply(JSON.stringify({ content: [{ type: 'text', text: GOOD_ENTRY }], stop_reason: 'max_tokens' }));
console.error = (...a) => logged.push(a.map(String).join(' '));
console.log = () => {};
await C.parseSpokenTransaction('forty quid of diesel at the BP for the Okafor job');
globalThis.fetch = realFetch; console.error = realError; console.log = realLog;
ok('🔴 THE REFUSAL LOGS A LINE NAMING THE CEILING AS THE CAUSE, which is the distinction the'
  + ' ClaudeReply comment asked for and never had',
  logged.some((l) => /cut off at our own token ceiling/.test(l)));
ok('🔴 AND THE LOG CARRIES NO CUSTOMER CONTENT. Not his words, not the parsed merchant, not a figure',
  !logged.some((l) => /diesel|Okafor|BP|forty/i.test(l)));

process.stdout.write(`\n  ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);

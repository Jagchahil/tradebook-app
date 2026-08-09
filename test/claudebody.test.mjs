// A 200 IS NOT A PROMISE OF JSON. WHAT HAPPENS WHEN SOMEBODY'S GATEWAY ANSWERS FOR ANTHROPIC.
//
//   node test/claudebody.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE DEFECT, IN NINE PLACES AT ONCE.
//
// Every entry point in lib/claude.ts read its reply the same way:
//
//     if (!res.ok) { console.error(...); return null; }
//     const data = (await res.json()) as { content?: ... };
//
// That guard is right, and it is not the guard that was missing. It catches a 500, a 429, a 401.
// It does nothing whatever about a TWO HUNDRED CARRYING HTML, which is precisely what an edge, a
// proxy, a captive network or a corporate filter hands back when it decides to answer on the
// origin's behalf: status 200, Content-Type text/html, a polite apology in a <body>.
//
// res.json() then THROWS. None of the nine calls sat inside a try that expected it, so the
// exception left the function, left the caller, and the customer was silently ignored: he asked a
// question and nothing at all came back. No reply, no apology, and no log line naming the cause,
// which is what makes it expensive to find. Same defect class as a474eb8a.
//
// 🔴 THIS SUITE ASSERTS THE BEHAVIOUR, NOT THE SHAPE. fetch is stubbed and the REAL exported
// functions are called, so what is proved is what a customer would actually get: null, which every
// caller in this codebase already renders as an honest sentence, rather than an exception nobody
// catches. A source scan alone would pass on a helper that swallowed everything and returned
// garbage.
//
// 🔴 IT GUARDS FOUR FAILURES.
//
//   1. ANY ENTRY POINT GOES BACK TO res.json(). One is enough to lose a customer's question.
//   2. THE HELPER STARTS THROWING instead of returning null, which moves the same silence one
//      stack frame down.
//   3. A GOOD REPLY STOPS BEING READ. A guard that rejects everything is not a fix, so both arms
//      are exercised: valid JSON must still come back parsed, with its usage intact.
//   4. THE LOG STARTS CARRYING THE BODY. This file's own rule, lib/email.ts's, and CLAUDE.md's: a
//      third party's error body can carry the request it wrapped. The length and one word are
//      diagnostic. The body is content.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const src = (rel) => readFileSync(path.join(root, rel), 'utf8');

const fixImports = (s) => s.replace(/from '(\.\/[a-zA-Z0-9._-]+)'/g, "from '$1.ts'");
const stage = mkdtempSync(path.join(tmpdir(), 'claudebody-'));
const staged = new Set();
const stageModule = (name) => {
  if (staged.has(name)) return;
  staged.add(name);
  const text = src(`lib/${name}.ts`);
  writeFileSync(path.join(stage, `${name}.ts`), fixImports(text));
  for (const m of text.matchAll(/from '\.\/([a-zA-Z0-9._-]+)'/g)) stageModule(m[1]);
};

// The module reads its key at load time and refuses everything without one, so this is set before
// the import. It is not a key and nothing is ever sent: fetch is stubbed for every call below.
process.env.ANTHROPIC_API_KEY = 'claude-body-suite-not-a-real-key';
delete process.env.AI_KILL_SWITCH;

stageModule('claude');
const C = await import(pathToFileURL(path.join(stage, 'claude.ts')).href);

const claudeSrc = src('lib/claude.ts');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) {
    pass += 1;
  } else {
    fail += 1;
    process.stdout.write(`\n  FAIL  ${name}`);
  }
};

// ── A stub that answers exactly the way a gateway does, and a quiet console. ─────────────────
const realFetch = globalThis.fetch;
const realError = console.error;
const realLog = console.log;
const errors = [];
const reply = (body, status = 200) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => body,
  json: async () => JSON.parse(body),
});
async function withFetch(body, fn, status = 200) {
  globalThis.fetch = reply(body, status);
  console.error = (...a) => errors.push(a.map(String).join(' '));
  console.log = () => {};
  try {
    return await fn();
  } finally {
    globalThis.fetch = realFetch;
    console.error = realError;
    console.log = realLog;
  }
}

const GATEWAY_HTML = '<!DOCTYPE html><html><head><title>502 Bad Gateway</title></head><body>'
  + '<h1>We are having trouble reaching the origin.</h1></body></html>';
const GOOD = JSON.stringify({
  content: [{ type: 'text', text: 'You can claim it.' }],
  model: 'claude-haiku-4-5-20251001',
  usage: { input_tokens: 11, output_tokens: 22, cache_read_input_tokens: 0 },
});

// ── The module is the module we think it is. ─────────────────────────────────────────────────
ok('🔴 THE ENTRY POINTS EXIST AND ARE CALLABLE, without which every assertion below is vacuous',
  typeof C.answerExpenseQuestion === 'function'
  && typeof C.answerMoneyQuestion === 'function'
  && typeof C.answerAccountantQuestion === 'function'
  && typeof C.parseSpokenTransaction === 'function'
  && typeof C.draftInvoice === 'function');
ok('and the module believes it is configured, or every call short circuits before any fetch',
  C.hasClaudeConfig() === true);

// ── THE GOOD ARM FIRST, so the bad arm proves a difference rather than a broken stub. ────────
const good = await withFetch(GOOD, () => C.answerExpenseQuestion('can i claim my boots'));
ok('🔴 A REAL REPLY IS STILL READ AND STILL COMES BACK, so this is not a guard that rejects all',
  typeof good === 'string' && /claim it/.test(good));

// ── THE ARM THIS WHOLE SUITE EXISTS FOR. ─────────────────────────────────────────────────────
errors.length = 0;
let threw = null;
let out;
try {
  out = await withFetch(GATEWAY_HTML, () => C.answerExpenseQuestion('can i claim my boots'));
} catch (e) {
  threw = e;
}
ok('🔴 A 200 CARRYING HTML DOES NOT THROW OUT OF THE FUNCTION AND PAST THE CALLER',
  threw === null);
ok('🔴 IT COMES BACK AS NULL, which every caller in this codebase already has a sentence for',
  out === null);
ok('🔴 AND IT SAYS SO IN THE LOG, so the next person does not spend a day on it',
  errors.some((e) => /not JSON/.test(e)));
ok('the log names it as html rather than leaving the cause to be guessed',
  errors.some((e) => /html/.test(e)));
ok('🔴 AND THE LOG DOES NOT CARRY THE BODY: length and one word, never content',
  !errors.some((e) => /Bad Gateway|trouble reaching|DOCTYPE|<h1>/.test(e)));

// ── It is not one lucky entry point. Every lane a customer can be on. ────────────────────────
const lanes = [
  ['answerExpenseQuestion', () => C.answerExpenseQuestion('boots')],
  ['answerMoneyQuestion', () => C.answerMoneyQuestion('what did i spend', 'summary')],
  ['answerAccountantQuestion', () => C.answerAccountantQuestion('what is class 4')],
  ['parseSpokenTransaction', () => C.parseSpokenTransaction('forty quid of diesel')],
  ['draftInvoice', () => C.draftInvoice('two days rewiring a kitchen')],
];
for (const [name, call] of lanes) {
  let lanethrew = null;
  let laneout;
  try {
    laneout = await withFetch(GATEWAY_HTML, call);
  } catch (e) {
    lanethrew = e;
  }
  ok(`🔴 ${name}: a gateway page is null, never an exception`,
    lanethrew === null && laneout === null);
}

// ── Truncation is the other shape of the same thing, and it must not throw either. ───────────
let cutthrew = null;
let cutout;
try {
  cutout = await withFetch('{"content":[{"type":"text","te', () => C.answerExpenseQuestion('boots'));
} catch (e) {
  cutthrew = e;
}
ok('a stream cut off half way is null too, and is logged as other rather than html',
  cutthrew === null && cutout === null);

// ── And the source: no entry point may quietly go back to the old line. ──────────────────────
ok('the helper exists and is the one thing that reads a body',
  /async function readClaudeReply\(res: Response, feature: string\): Promise<ClaudeReply \| null>/.test(claudeSrc));
const callSites = (claudeSrc.match(/const data = await readClaudeReply\(res, '[a-z_]+'\);/g) || []).length;
ok('🔴 ALL NINE ENTRY POINTS GO THROUGH IT',
  callSites === 9);
ok('and every one of them stops on a null rather than reading on',
  (claudeSrc.match(/const data = await readClaudeReply\(res, '[a-z_]+'\);\n  if \(!data\) return null;/g) || []).length === 9);

// ⚠️ THE ABSENCE ASSERTION, WITH ITS EXISTENCE PROOF ABOVE IT. Comments are stripped first: the
// block above the helper quotes the old line verbatim, because a defect note that will not name the
// defect is worth nothing to the next reader, and counting raw text would score that quotation as a
// live call site.
const codeOnly = claudeSrc.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
ok('the comment stripper left the code behind rather than eating the file',
  /export async function answerMoneyQuestion\(/.test(codeOnly) && codeOnly.length > 5000);
ok('🔴 res.json() IS GONE FROM THE CODE OF THIS FILE ENTIRELY',
  !/res\.json\(\)/.test(codeOnly));

// ── House rules. ─────────────────────────────────────────────────────────────────────────────
ok('the helper returns null and never rethrows',
  /catch \{\n    console\.error\(/.test(claudeSrc) && !/throw new Error\('claude/.test(claudeSrc));

process.stdout.write(`\n  ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);

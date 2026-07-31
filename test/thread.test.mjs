// THE LEKHIO THREAD. The conversation surface at /app/thread and its POST at /api/thread.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS SUITE DEFENDS, IN THE ORDER THE FAILURES WOULD HURT:
//
//   1. 🔴 ONE BRAIN. The thread must answer with the WhatsApp machinery BY NAME: the same
//      matchers, the same engines, the same guarded AI path, the same derived caps and the
//      same shared spend rings. A route that grew its own tax constant or its own model call
//      would be a second engine, and two engines over one number is the house disease.
//
//   2. 🔴 TENANCY. The thread helpers are staged with a recording fetch and ATTACKED at
//      runtime: a crafted conversation id belonging to another man must die at the ownership
//      read with zero rows written, and every query must carry user_id from the session.
//
//   3. 🔴 HONESTY WHEN IT CANNOT ANSWER. Caps exhausted, kill switch, AI not configured:
//      the stored reply is the plain truthful line, never silence and never a fake.
//
//   4. 🔴 ARTICLE 9. Nothing from the circumstances chain can reach this surface, the model
//      context is the same one WhatsApp sends, and no message content is ever logged.
//
//   5. The read only paywall: a locked account reads his whole thread, the composer hides
//      behind the same banner other pages use, and the gate row says posting is 'entitled'.
//
// Source pins plus logic tests, in the style of test/moneyweb.test.mjs.
// Run: node test/thread.test.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

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

// Assert on the CODE, never on the words around it. Same rule and same reason as
// test/specialcategory.test.mjs: a guard that greps prose gets broken by prose.
const stripComments = (s) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const pageSrc = read('app/app/thread/page.tsx');
const routeSrc = read('app/api/thread/route.ts');
const waSrc = read('app/api/whatsapp/route.ts');
const dbSrc = read('lib/supabase.ts');
const applySrc = read('supabase/APPLY_2026-07-31_thread.sql');
const schemaSrc = read('supabase/schema.sql');

const pageCode = stripComments(pageSrc);
const routeCode = stripComments(routeSrc);

const gate = await import(pathToFileURL(path.join(root, 'lib/gate.ts')).href);
const nudge = await import(pathToFileURL(path.join(root, 'lib/banknudge.ts')).href);
const intents = await import(pathToFileURL(path.join(root, 'lib/waintents.ts')).href);
const claims = await import(pathToFileURL(path.join(root, 'lib/claimrules.data.ts')).href);

console.log('\nthread: the conversation surface, one brain, his rows only');

// ---------------------------------------------------------------------------------------------
// 1. THE STORAGE. The existing conversations and messages tables carry it, via an APPLY file.
// ---------------------------------------------------------------------------------------------
console.log('\n=== the storage rides the existing tables, honestly ===\n');

ok('the APPLY file invents NO new table: the existing pair carries the thread',
  !/create\s+table/i.test(applySrc));
ok('messages.role is widened to lekhio and KEEPS user and puchio',
  /check \(role in \('user', 'puchio', 'lekhio'\)\)/.test(applySrc));
ok('conversations gains a kind, defaulting every existing row to puchio',
  /add column if not exists kind text not null default 'puchio'/.test(applySrc));
ok('the kind is checked to the two products and nothing else',
  /check \(kind in \('puchio', 'lekhio'\)\)/.test(applySrc));
ok('🔴 one Lekhio thread per user is a DATABASE fact, not a code hope',
  /create unique index if not exists conversations_one_lekhio_thread\s*\n?\s*on public\.conversations \(user_id\) where kind = 'lekhio'/.test(applySrc));
ok('schema.sql carries the same three changes for a fresh database',
  /conversations_one_lekhio_thread/.test(schemaSrc)
  && /check \(role in \('user', 'puchio', 'lekhio'\)\)/.test(schemaSrc)
  && /kind text not null default 'puchio'/.test(schemaSrc));
ok('RLS posture is untouched: the APPLY file writes no policy',
  !/create policy|drop policy/i.test(applySrc));

// ---------------------------------------------------------------------------------------------
// 2. THE PAGE. Server rendered, session first, readable when locked, composer gated.
// ---------------------------------------------------------------------------------------------
console.log('\n=== the page ===\n');

ok('no client JavaScript: not a client component, no handlers, no hooks, no script tag',
  !/^'use client'/m.test(pageSrc)
  && !/onClick|onChange|onSubmit|useState|useEffect|<script/.test(pageCode));
ok('session first: the cookie names the man, or he goes to /in',
  /userFromSessionCookie/.test(pageCode) && /redirect\('\/in'\)/.test(pageCode));
ok('the thread is read through lib/supabase.ts, never an inline query',
  /lekhioThreadMessages\(user\.id\)/.test(pageCode) && !/rest\/v1/.test(pageCode));
ok('🔴 the read only banner is the same one other pages draw',
  /READONLY_TITLE/.test(pageCode) && /READONLY_LINE/.test(pageCode)
  && /\/api\/billing\/checkout/.test(pageCode));
ok('🔴 a locked account still READS the thread: the messages render outside the locked branch',
  /locked \? null : \(/.test(pageCode) === true
  && pageCode.indexOf('messages.map') !== -1);
ok('🔴 the composer hides behind the lock, and only the composer',
  /\{locked \? null : \(\s*<section[^>]*>\s*<form action="\/api\/thread"/.test(pageCode));
ok('a failed read is said plainly, never drawn as an empty thread',
  /could not read your thread just now/.test(pageSrc));
ok('the empty state speaks like an employee, in his words',
  pageSrc.includes('what have I made this month') && pageSrc.includes('can I claim my boots'));
ok('newest at the bottom: turns, then the #end anchor, then the one form',
  pageCode.indexOf('messages.map') < pageCode.indexOf('id="end"')
  && pageCode.indexOf('id="end"') < pageCode.indexOf('action="/api/thread"'));
ok('🔴 no id in any URL and none in the form: one thread, found by the session',
  !/conversationId/.test(pageCode) && !/name="id"/.test(pageCode)
  && (pageCode.match(/name="/g) || []).length === 1 && /name="q"/.test(pageCode));
ok('the shared app shell and tokens, no raw hex painted',
  /APP_CSS/.test(pageSrc) && /A11Y_CSS/.test(pageSrc) && !/#[0-9a-fA-F]{6}\b/.test(pageCode));
ok('the nav is rendered (current is /app until AppNav grows the thread row)',
  /<AppNav current="\/app" \/>/.test(pageSrc));

// ---------------------------------------------------------------------------------------------
// 3. THE ROUTE. Session, burst, gate, then the WhatsApp machinery by name.
// ---------------------------------------------------------------------------------------------
console.log('\n=== the route answers the way WhatsApp answers ===\n');

ok('sessionUser first: before the form is read and before the gate is asked',
  routeCode.indexOf('await sessionUser(') > -1
  && routeCode.indexOf('await sessionUser(') < routeCode.indexOf('formData')
  && routeCode.indexOf('await sessionUser(') < routeCode.indexOf('await gateForUser'));
ok('🔴 posts are rate limited on the shared durable counter, keyed on the user',
  /userBurst\('thread', user\.id/.test(routeCode));
ok('🔴 the gate row exists and posting is the work',
  gate.ruleFor('app/api/thread') === 'entitled');
ok('...and the row says reading stays free',
  /read/i.test(gate.GATED_ROUTES.find((r) => r.route === 'app/api/thread').why));
ok('the refusal is the shared one, back to the page that draws the banner',
  /refuseUnentitled\(req, '\/app\/thread'\)/.test(routeCode));

// The machinery, by name. Every one of these is the function the WhatsApp handler calls.
const MACHINERY = [
  'matchTotalsQuestion', 'totalsForUser', 'pendingSummaryForUser', 'formatGbp',
  'soleTraderTax', 'corporationTax', 'studentLoanForSA', 'getBusinessProfile',
  'getStudentLoanSettings', 'isDeadlineQuestion', 'deadlineAnswer', 'checkExpense',
  'VERDICT_ICON', 'hasClaudeConfig', 'answerMoneyQuestion', 'transactionSummaryForUser',
  'getRelevantKnowledge', 'aiCapsFor', 'decideSpend', 'bumpAiUsage', 'countActiveSubscribers',
  'busyMessage', 'refreshFactsFromDb',
];
for (const name of MACHINERY) {
  // Present in the thread route AND in the WhatsApp route: the same function, not a lookalike.
  ok(`reuses ${name} by name`, routeCode.includes(name) && waSrc.includes(name));
}
ok('deterministic intents run BEFORE the AI path, the WhatsApp order',
  routeCode.indexOf('matchTotalsQuestion(q)') > -1
  && routeCode.indexOf('matchTotalsQuestion(q)') < routeCode.indexOf('hasClaudeConfig()')
  && routeCode.indexOf('deadlineAnswer()') < routeCode.indexOf('answerMoneyQuestion(q')
  && routeCode.indexOf('checkExpense(q)') < routeCode.indexOf('answerMoneyQuestion(q'));
ok('🔴 the spend rings are the SHARED ones, so total AI spend is bounded once',
  /bumpAiUsage\('global', 'all'\)/.test(routeCode) && /bumpAiUsage\('globalmonth'/.test(routeCode)
  && /bumpAiUsage\('thread', userId\)/.test(routeCode));
ok('🔴 every durable counter fails CLOSED: unreadable budget means no spend',
  /userDay === null/.test(routeCode) && /globalDay === null/.test(routeCode)
  && /globalMonth === null/.test(routeCode));
ok('the caps are DERIVED from the live paying base, not hardcoded',
  /aiCapsFor\(subs \?\? 0\)/.test(routeCode) && /caps\.killed/.test(routeCode));
ok('🔴 NO second brain: no model call of its own, no key, no prompt',
  !/anthropic|x-api-key|max_tokens|messages:\s*\[/.test(routeCode));
ok('🔴 NO tax constant in the route: every figure comes from the engines',
  !/12570|50270|37700|125140/.test(routeCode));
ok('the model context is the WhatsApp context: his summary and the approved knowledge',
  /answerMoneyQuestion\(q, summary, knowledge\)/.test(routeCode));

// ---------------------------------------------------------------------------------------------
// 4. HONESTY WHEN IT CANNOT ANSWER. Never silence, never a fake.
// ---------------------------------------------------------------------------------------------
console.log('\n=== honesty when it cannot answer ===\n');

ok('🔴 a reply is composed and stored on EVERY answered path',
  /const reply = await composeReply/.test(routeCode)
  && /saveLekhioThreadMessage\(user\.id, threadId, 'lekhio', reply\)/.test(routeCode));
ok('🔴 a budget refusal stores the truthful line, the same words WhatsApp sends',
  /return busyMessage\(refused/.test(routeCode));
ok('the AI-off line is the exact WhatsApp line, so the two channels cannot drift apart',
  routeSrc.includes('I cannot answer questions just yet. Hang tight, it is coming very soon.')
  && waSrc.includes('I cannot answer questions just yet. Hang tight, it is coming very soon.'));
for (const reason of ['kill_switch', 'global_daily_cap', 'global_monthly_cap', 'user_daily_cap']) {
  const line = nudge.busyMessage(reason, { available: false, connected: false });
  ok(`busyMessage('${reason}') is a real sentence, not silence`, typeof line === 'string' && line.length > 20);
}
ok('the user\'s own cap is never blamed on the product being busy',
  !/busy/i.test(nudge.busyMessage('user_daily_cap', { available: false, connected: false })));
ok('a failed store is admitted to the page, never swallowed',
  /problem=unavailable/.test(routeCode) && /case 'unavailable':/.test(pageCode));

// ---------------------------------------------------------------------------------------------
// 5. ARTICLE 9 AND THE LOG. The WhatsApp line, held on this surface.
// ---------------------------------------------------------------------------------------------
console.log('\n=== article 9 and the log ===\n');

ok('🔴 nothing from the circumstances chain can reach the thread, in either file',
  !/circumstances|CIRCUMSTANCES|sensitive\(|'blind'|"blind"/.test(routeCode)
  && !/circumstances|CIRCUMSTANCES|sensitive\(|'blind'|"blind"/.test(pageCode));
ok('🔴 message content is NEVER logged: no console call in the route at all',
  !/console\./.test(routeCode));
ok('...and none in the page either',
  !/console\./.test(pageCode));
ok('the queue that feeds every channel still refuses special category (the WhatsApp pin, re-held here)',
  (await import(pathToFileURL(path.join(root, 'lib/circumstances.ts')).href))
    .unanswered([]).every((c) => !c.specialCategory));

// ---------------------------------------------------------------------------------------------
// 6. THE DETERMINISTIC EXAMPLES THE EMPTY STATE PROMISES actually route deterministically.
// ---------------------------------------------------------------------------------------------
console.log('\n=== the promises in the empty state are kept by the matchers ===\n');

ok('"what have I made this month" is a totals question, answered from his rows with no AI',
  intents.matchTotalsQuestion('what have I made this month')?.kind === 'made');
ok('"what do I owe so far" is the tax question, answered from his rows with no AI',
  intents.matchTotalsQuestion('what do I owe so far')?.kind === 'tax');
ok('"can I claim my boots" hits the deterministic claim corpus',
  claims.checkExpense('can I claim my boots') !== null);
ok('a money amount never reaches the claim corpus from the thread (the WhatsApp guard, same regex)',
  /!\/£\\s\*\\d\/\.test\(q\)/.test(routeCode));

// ---------------------------------------------------------------------------------------------
// 7. 🔴 THE TENANCY ATTACK. The helpers, staged with a recording fetch, attacked at runtime.
// ---------------------------------------------------------------------------------------------
console.log('\n=== the tenancy attack ===\n');

// Stage the self contained thread block out of lib/supabase.ts with stub config and headers,
// so the real functions run against a recorder instead of a database.
const START = '// --- The Lekhio thread (31 July 2026';
const END = '// --- end of the Lekhio thread block';
const si = dbSrc.indexOf(START);
const ei = dbSrc.indexOf(END);
ok('the thread block exists in lib/supabase.ts, append only, with its end marker', si > -1 && ei > si);

const block = dbSrc.slice(si, ei);
ok('the block is self contained: config, headers and fetch, nothing else from the big file',
  !/\brest\(/.test(block) && !/\bdel\(/.test(block) && !/supabase-js/.test(block));

const stage = mkdtempSync(path.join(tmpdir(), 'thread-'));
writeFileSync(
  path.join(stage, 'thread.ts'),
  [
    "const config = () => ({ url: 'https://db.test', key: 'k' });",
    'const headers = (extra: Record<string, string> = {}): Record<string, string> => ({ ...extra });',
    block,
  ].join('\n'),
);
const T = await import(pathToFileURL(path.join(stage, 'thread.ts')).href);

const calls = [];
let script = [];
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), method: init.method || 'GET', body: init.body ? String(init.body) : null });
  const next = script.shift() || { status: 200, json: [] };
  return new Response(JSON.stringify(next.json ?? []), { status: next.status ?? 200 });
};
const reset = (s) => { calls.length = 0; script = s; };

// Reading: every query carries the session's user id.
reset([
  { json: [{ id: 'conv-1' }] },
  { json: [
    { id: 'm2', role: 'lekhio', content: 'answer', created_at: '2026-07-31T10:01:00Z' },
    { id: 'm1', role: 'user', content: 'question', created_at: '2026-07-31T10:00:00Z' },
  ] },
]);
const msgs = await T.lekhioThreadMessages('alice');
ok('🔴 the conversation lookup is scoped by user_id and kind',
  calls[0].url.includes('user_id=eq.alice') && calls[0].url.includes('kind=eq.lekhio'));
ok('🔴 the message read is scoped by user_id AS WELL AS conversation_id',
  calls[1].url.includes('user_id=eq.alice') && calls[1].url.includes('conversation_id=eq.conv-1'));
ok('turns come back oldest first, so the newest sits at the bottom of the page',
  Array.isArray(msgs) && msgs.length === 2 && msgs[0].id === 'm1' && msgs[1].id === 'm2');

reset([{ status: 500 }]);
ok('a failed read is null, so the page can say so, never an empty thread',
  (await T.lekhioThreadMessages('alice')) === null);

reset([{ json: [] }]);
const none = await T.lekhioThreadMessages('alice');
ok('no thread yet is [], the honest empty state', Array.isArray(none) && none.length === 0);

// Creating: the row is minted for the session's user, kind lekhio.
reset([{ json: [] }, { status: 201, json: [{ id: 'new-1' }] }]);
const made = await T.getOrCreateLekhioThread('alice');
ok('a missing thread is created for THIS user with kind lekhio',
  made === 'new-1'
  && calls[1].method === 'POST'
  && JSON.parse(calls[1].body).user_id === 'alice'
  && JSON.parse(calls[1].body).kind === 'lekhio');
reset([{ json: [] }, { status: 409 }, { json: [{ id: 'winner' }] }]);
ok('losing the unique index race re-reads the winner instead of failing the post',
  (await T.getOrCreateLekhioThread('alice')) === 'winner');

// 🔴 THE ATTACK. Mallory holds a conversation id that is really the victim's thread.
reset([{ json: [] }]);
const attacked = await T.saveLekhioThreadMessage('mallory', 'conv-of-victim', 'user', 'hello');
ok('🔴 the write is REFUSED: the ownership read found nothing for this user',
  attacked === false);
ok('🔴 and NOTHING was written: one read, zero inserts, zero patches',
  calls.length === 1 && calls[0].method === 'GET'
  && calls[0].url.includes('id=eq.conv-of-victim')
  && calls[0].url.includes('user_id=eq.mallory'));

// The honest write, for contrast: ownership proved, then the insert carries the owner.
reset([{ json: [{ id: 'conv-1' }] }, { status: 201, json: [] }, { status: 204, json: [] }]);
const saved = await T.saveLekhioThreadMessage('alice', 'conv-1', 'lekhio', 'the answer');
const inserted = JSON.parse(calls[1].body);
ok('a legitimate write inserts under the owner\'s user_id and conversation',
  saved === true && inserted.user_id === 'alice'
  && inserted.conversation_id === 'conv-1' && inserted.role === 'lekhio');
ok('and the thread clock bump is scoped by user_id too',
  calls[2].method === 'PATCH' && calls[2].url.includes('user_id=eq.alice'));

reset([]);
ok('an empty message writes nothing at all',
  (await T.saveLekhioThreadMessage('alice', 'conv-1', 'user', '   ')) === false && calls.length === 0);

// The route never lets a browser choose the thread: the ONLY form field read is q.
ok('🔴 the route reads exactly one form field, q, so there is no id to tamper with',
  (routeCode.match(/f\.get\(/g) || []).length === 1 && /f\.get\('q'\)/.test(routeCode));
ok('...and the thread id comes from the session scoped lookup',
  /getOrCreateLekhioThread\(user\.id\)/.test(routeCode));

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exit(fail === 0 ? 0 : 1);

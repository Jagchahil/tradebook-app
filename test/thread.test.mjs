// THE LEKHIO CHATS. The chat view at /app/thread/chat and its POST at /api/thread.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS SUITE DEFENDS, IN THE ORDER THE FAILURES WOULD HURT:
//
//   1. 🔴 ONE BRAIN. The chat must answer with the WhatsApp machinery BY NAME: the same
//      matchers, the same engines, the same guarded AI path, the same derived caps and the
//      same shared spend rings. A route that grew its own tax constant or its own model call
//      would be a second engine, and two engines over one number is the house disease.
//
//   2. 🔴 TENANCY. The storage helpers are staged with a recording fetch and ATTACKED at
//      runtime: a crafted conversation id belonging to another man must die at the ownership
//      read with zero rows written, and every query must carry user_id from the session.
//
//   3. 🔴 HONESTY WHEN IT CANNOT ANSWER. Caps exhausted, kill switch, AI not configured:
//      the stored reply is the plain truthful line, never silence and never a fake. And
//      honesty when the database still enforces v1's one thread: a refused new chat is
//      reported blocked, never silently swapped for an old one.
//
//   4. 🔴 ARTICLE 9. Nothing from the circumstances chain can reach this surface, the model
//      context is the same one WhatsApp sends, and no message content is ever logged.
//
//   5. The read only paywall: a locked account reads every chat, the composer hides behind
//      the same banner other pages use, and the gate rows say posting is 'entitled'.
//
// ⚠️ RE-PINNED 31 JULY 2026, SAME DAY AS V1. /app/thread became the chat LIST and the words
// moved one tap deeper to /app/thread/chat behind a sealed reference (app/app/chatref.ts).
// The v1 page pins moved here onto the chat view; the v1 "one thread per user is a database
// fact" pin became its opposite on purpose (the widening APPLY drops that index); and the v1
// "exactly one form field" pin became "exactly two: the words and the sealed reference".
// The list page, the reference module and the Rakha view are pinned by
// test/chatsurface.test.mjs.
//
// Source pins plus logic tests, in the style of test/moneyweb.test.mjs.
// Run: node test/thread.test.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, mkdtempSync, writeFileSync, readdirSync } from 'node:fs';
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

const chatSrc = read('app/app/thread/chat/page.tsx');
const routeSrc = read('app/api/thread/route.ts');
const waSrc = read('app/api/whatsapp/route.ts');
const dbSrc = read('lib/supabase.ts');
const applySrc = read('supabase/APPLY_2026-07-31_thread.sql');
const applyChatsSrc = read('supabase/APPLY_2026-07-31_chats.sql');
const schemaSrc = read('supabase/schema.sql');

const chatCode = stripComments(chatSrc);
const routeCode = stripComments(routeSrc);

const gate = await import(pathToFileURL(path.join(root, 'lib/gate.ts')).href);
const nudge = await import(pathToFileURL(path.join(root, 'lib/banknudge.ts')).href);
const intents = await import(pathToFileURL(path.join(root, 'lib/waintents.ts')).href);
const claims = await import(pathToFileURL(path.join(root, 'lib/claimrules.data.ts')).href);

console.log('\nthread: the chat surface, one brain, his rows only');

// ---------------------------------------------------------------------------------------------
// 1. THE STORAGE. The existing conversations and messages tables carry it, via APPLY files.
// ---------------------------------------------------------------------------------------------
console.log('\n=== the storage rides the existing tables, honestly ===\n');

ok('the v1 APPLY file invents NO new table: the existing pair carries the chats',
  !/create\s+table/i.test(applySrc));
ok('messages.role is widened to lekhio and KEEPS user and puchio',
  /check \(role in \('user', 'puchio', 'lekhio'\)\)/.test(applySrc));
ok('conversations gains a kind, defaulting every existing row to puchio',
  /add column if not exists kind text not null default 'puchio'/.test(applySrc));
ok('the kind is checked to the two products and nothing else',
  /check \(kind in \('puchio', 'lekhio'\)\)/.test(applySrc));

// 🔴 THE WIDENING, RE-PINNED HONESTLY. v1 made "one Lekhio thread per user" a database fact
// (the partial unique index) as the creation race's referee. The chat list makes many chats
// the product, so the second APPLY of the day DROPS that index, with the reasoning in its
// header, and until it runs the code reports the refusal rather than papering over it (the
// createLekhioChat attack below, and the honest line pinned in test/chatsurface.test.mjs).
ok('the v1 APPLY created the one-thread index, kept as history',
  /create unique index if not exists conversations_one_lekhio_thread/.test(applySrc));
ok('🔴 the chats APPLY drops that index, and says why in its header',
  /drop index if exists public\.conversations_one_lekhio_thread/.test(applyChatsSrc)
  && /WHY ONE INDEX IS DROPPED/.test(applyChatsSrc));
ok('the chats APPLY changes nothing else: no table, no policy, no column, no constraint',
  !/create\s+table|create policy|drop policy|alter table|add column/i.test(applyChatsSrc));
ok('schema.sql carries the kind and role changes for a fresh database',
  /check \(role in \('user', 'puchio', 'lekhio'\)\)/.test(schemaSrc)
  && /kind text not null default 'puchio'/.test(schemaSrc));
ok('🔴 schema.sql drops the index AFTER creating it, so a fresh database lands where a migrated one does',
  schemaSrc.indexOf('drop index if exists public.conversations_one_lekhio_thread')
    > schemaSrc.indexOf('create unique index if not exists conversations_one_lekhio_thread'));
ok('RLS posture is untouched: neither APPLY file writes a policy',
  !/create policy|drop policy/i.test(applySrc) && !/create policy|drop policy/i.test(applyChatsSrc));

// ---------------------------------------------------------------------------------------------
// 2. THE CHAT VIEW. Server rendered, session first, reffed, readable when locked, composer gated.
// ---------------------------------------------------------------------------------------------
console.log('\n=== the chat view ===\n');

ok('no client JavaScript: not a client component, no handlers, no hooks, no script tag',
  !/^'use client'/m.test(chatSrc)
  && !/onClick|onChange|onSubmit|useState|useEffect|<script/.test(chatCode));
// 🔴 7 AUGUST 2026: widened to allow next=. Every page under app/app now carries its own
// destination through the sign in door (see test/signinnext.test.mjs), not just a bare '/in'.
ok('session first: the cookie names the man, or he goes to /in',
  /userFromSessionCookie/.test(chatCode) && /redirect\('\/in(\?[^']*)?'\)/.test(chatCode));
ok('🔴 the sealed reference is verified AND checked against the session before anything is read',
  chatCode.indexOf('verifyChatRef(ref)') > -1
  && chatCode.indexOf('chatRefBelongsTo(claim') > -1
  // The CALLS are ordered, not the imports: the belongs-to check runs before any row is read.
  && chatCode.indexOf('chatRefBelongsTo(claim') < chatCode.indexOf('chatMessagesForUser(user.id'));
ok('a missing, stale, tampered or borrowed reference lands on the chat list',
  /redirect\('\/app\/thread'\)/.test(chatCode));
ok('the chat is read through lib/supabase.ts, never an inline query',
  /chatMessagesForUser\(user\.id, claim\.id\)/.test(chatCode)
  && /chatForUser\(user\.id, claim\.id\)/.test(chatCode)
  && !/rest\/v1/.test(chatCode));
ok('🔴 the read only banner is the same one other pages draw',
  /READONLY_TITLE/.test(chatCode) && /READONLY_LINE/.test(chatCode)
  && /\/api\/billing\/checkout/.test(chatCode));
ok('🔴 a locked account still READS the chat: the messages render outside the locked branch',
  /locked \? null :/.test(chatCode) && chatCode.indexOf('messages.map') !== -1);
ok('🔴 the composer hides behind the lock, and only draws on a Lekhio chat',
  /\{locked \? null : kind === 'lekhio' \? \(/.test(chatCode)
  && /<form action="\/api\/thread"/.test(chatCode));
ok('a kept Puchio chat says plainly where new questions go, instead of a dead composer',
  chatSrc.includes('A kept chat, here to look back on'));
ok('a failed read is said plainly, never drawn as an empty chat',
  /could not read this chat just now/.test(chatSrc));
ok('the empty state speaks like an employee, in his words',
  chatSrc.includes('what have I made this month') && chatSrc.includes('can I claim my boots'));
ok('newest at the bottom: turns, then the #end anchor, then the one composer',
  chatCode.indexOf('messages.map') < chatCode.indexOf('id="end"')
  && chatCode.indexOf('id="end"') < chatCode.indexOf('action="/api/thread"'));
ok('🔴 no raw id in any URL or field: the composer carries the words, the sealed reference and the one receipt input, nothing else',
  (chatCode.match(/name="/g) || []).length === 3
  && /name="q"/.test(chatCode) && /name="c" value=\{ref/.test(chatCode)
  && /name="receipt"/.test(chatCode)
  && !/[?&]c=\$\{claim\.id/.test(chatCode) && !/[?&]c=\$\{conv/.test(chatCode));
// A message can be a receipt photograph as well as a question (5 August 2026), through ONE
// plain file input with no capture attribute: on a phone the picker itself offers Take a
// Photo beside the photo library and the files chooser, so the morning's dedicated camera
// input was a second control doing nothing the first could not, and it went the same
// afternoon. Not required, because words alone must keep working exactly as before. The
// route keeps its receipt then receipt_library fallback for old open tabs.
{
  const flat = chatCode.replace(/\s+/g, ' ');
  ok('🔴 the composer takes a receipt photograph, multipart, through one plain file input',
    /encType="multipart\/form-data"/.test(chatCode)
    && (flat.match(/type="file"/g) || []).length === 1
    && /name="receipt" type="file" accept="image\/\*" className/.test(flat));
  ok('🔴 with no capture attribute and no second picker, every route stays open on an iPhone',
    !/capture=/.test(flat) && !/receipt_library/.test(flat));
  ok('🔴 and it is never required', !/<input[^>]*required/.test(flat));
}
ok('the shared app shell and tokens, no raw hex painted',
  /APP_CSS/.test(chatSrc) && /A11Y_CSS/.test(chatSrc) && !/#[0-9a-fA-F]{6}\b/.test(chatCode));
ok('the nav knows the thread row now', /<AppNav current="\/app\/thread" \/>/.test(chatSrc));

// ---------------------------------------------------------------------------------------------
// 3. THE ROUTE. Session, reference, burst, gate, then the WhatsApp machinery by name.
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
  'isDeadlineQuestion', 'asksAmount', 'deadlineAnswer', 'checkExpense',
  'VERDICT_ICON', 'hasClaudeConfig', 'answerMoneyQuestion', 'transactionSummaryForUser',
  'getRelevantKnowledge', 'aiCapsFor', 'decideSpend', 'bumpAiUsage', 'countActiveSubscribers',
  'busyMessage', 'refreshFactsFromDb',
];
for (const name of MACHINERY) {
  // Present in the thread route AND in the WhatsApp route: the same function, not a lookalike.
  ok(`reuses ${name} by name`, routeCode.includes(name) && waSrc.includes(name));
}

// 🔴 WHAT HE OWES IS THE TAX HUB'S NUMBER (31 July 2026). The owe intent used to run its own
// little January (soleTraderTax plus the loan minus CIS) and disagreed with /app/tax, which
// leads with taxPosition() on getOptimiserInput(). One question, one figure: the pins below tie
// the thread to the tax hub BY NAME, the same way MACHINERY ties it to WhatsApp.
const taxHubCode = stripComments(read('app/app/tax/page.tsx'));
ok('🔴 the owe answer is taxPosition on getOptimiserInput, the tax hub\'s own call, in both files',
  /taxPosition\(optimiser\)/.test(routeCode) && /taxPosition\(optimiser\)/.test(taxHubCode)
  && /getOptimiserInput\(/.test(routeCode) && /getOptimiserInput\(/.test(taxHubCode));
// ⚠️ REWRITTEN 11 AUGUST 2026, AND IT IS A STRONGER ASSERTION THAN THE ONE IT REPLACES. It used
// to pin the literal `tax.setAside` on both sides. Both surfaces now lead with what a man still has
// to FIND, which is the bill less any tax his contractors already handed HMRC, so the field moved
// on both at once. Pinning the shared EXPRESSION rather than a field name is what makes the two
// unable to drift: if either surface picks a different one of the three figures taxPosition now
// returns, this goes red, which the old assertion could not have done.
// ⚠️ REWRITTEN 13 AUGUST 2026, RUN 3, AND IT IS STRONGER AGAIN. It pinned the shared EXPRESSION,
// on the reasoning that a shared expression cannot drift. It can, and it did: test/waintents.test.mjs
// pinned WhatsApp to `oweAnswer(tax.setAside, ...)` in a DIFFERENT suite, so when the CIS credit
// moved the web surfaces to setAsideAfterCis on 11 August, that other guard held WhatsApp still and
// stayed green. On 13 August WhatsApp said "Put by £37,457.00" while every web surface said £28,250.
// A regex can only pin the two places it is pointed at. So the rule is a FUNCTION now,
// billFromPosition() in lib/taxoptimiser.ts, and what is pinned is that every surface CALLS it.
const LEAD_FIGURE = /billFromPosition\(tax\)/;
ok('🔴 the figure spoken is the hub\'s hero number, chosen by the same FUNCTION in both files',
  LEAD_FIGURE.test(routeCode) && LEAD_FIGURE.test(taxHubCode)
  && /formatGbp\(leadFigure\)/.test(routeCode) && /gbp2\(billFromPosition\(tax\)\)/.test(taxHubCode));
ok('🔴 AND NEITHER SURFACE KEEPS A HAND WRITTEN COPY OF THE RULE',
  !/tax\.cisSuffered > 0 \? tax\.setAsideAfterCis : tax\.setAside/.test(routeCode)
  && !/tax\.cisSuffered > 0 \? tax\.setAsideAfterCis : tax\.setAside/.test(taxHubCode));
ok('what is inside the number is the shared sentence, lib/taxoptimiser\'s own words',
  /setAsideBasisLine\(optimiser, tax\)/.test(routeCode) && /setAsideBasisLine\(optimiser, tax\)/.test(taxHubCode));
ok('🔴 the little January is gone: no engine arithmetic of the owe branch\'s own',
  !/soleTraderTax|corporationTax|studentLoanForSA|getStudentLoanSettings|getBusinessProfile/.test(routeCode));
ok('and the answer says out loud whose figure it is',
  routeSrc.includes('It is the same figure your Tax screen leads with'));
ok('a projection is called a projection, the hub\'s own honesty',
  /tax\.projected\s*\?/.test(routeCode) && /heading for/.test(routeSrc));
ok('deterministic intents run BEFORE the AI path, the WhatsApp order',
  routeCode.indexOf('matchTotalsQuestion(q)') > -1
  && routeCode.indexOf('matchTotalsQuestion(q)') < routeCode.indexOf('hasClaudeConfig()')
  // 🔴 WAS `deadlineAnswer()`, WHICH WENT VACUOUS THE DAY THE CALL GAINED ITS ASKER.
  // indexOf returned -1 for a literal that no longer existed and -1 is less than everything, so
  // this clause passed for the wrong reason and guarded nothing. Assert the call site EXISTS first,
  // then assert the ordering, so the guard can never again be satisfied by its own absence.
  && routeCode.indexOf('deadlineAnswer(new Date()') > -1
  && routeCode.indexOf('deadlineAnswer(new Date()') < routeCode.indexOf('answerMoneyQuestion(q')
  && routeCode.indexOf('checkExpense(q)') < routeCode.indexOf('answerMoneyQuestion(q'));

// 🔴 AND THE ORDER *WITHIN* THE DETERMINISTIC INTENTS, WHICH NOTHING HELD UNTIL 9 AUGUST 2026.
//
// The clause above proves both lanes beat the model. It never said which of the two came first,
// and for as long as it did not, this route ran matchTotalsQuestion() above isDeadlineQuestion()
// while the webhook ran them the other way round. A sole trader typed "when is my tax due" on
// /app/thread and was told "Put by £0.00 for tax", a figure, with no date in the sentence, because
// matchTotalsQuestion() takes a money word plus "how much", "what" OR "my", and "my tax" is both.
//
// Existence first, position second, for the reason written four lines above this.
ok('🔴 the deadline lane is reached BEFORE the totals lane, the webhook order, so WHEN gets a date',
  routeCode.indexOf('isDeadlineQuestion(q)') > -1
  && routeCode.indexOf('matchTotalsQuestion(q)') > -1
  && routeCode.indexOf('isDeadlineQuestion(q)') < routeCode.indexOf('matchTotalsQuestion(q)'));
ok('...behind the asksAmount tie break, so "how much tax is due" still gets his figure',
  /isDeadlineQuestion\(q\) && !asksAmount\(q\)/.test(routeCode));

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

// 🔴 THE EMPTY TALLY IS CHANNEL AWARE, AND BOTH WORDINGS ARE PINNED (31 July 2026). The thread
// used to answer "Send Lekhio a receipt", which on the web is an instruction the account may not
// be able to take: the chat takes no receipts and his number may not be bound. The figures stay
// shared; only the sentence around them knows which channel it is on.
ok('🔴 the web thread\'s empty tally points at the Money pages, which always work',
  routeSrc.includes('Add what you earn and spend from the Money pages and the tally starts itself.'));
ok('🔴 and it no longer tells a web customer to send a receipt',
  !/Send Lekhio a receipt/.test(stripComments(routeSrc)));
ok('🔴 the WhatsApp wording is untouched: on that channel the receipt is in his hand',
  waSrc.includes('Send me a receipt or what you spent and I will start the tally.'));

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
  /problem=unavailable/.test(routeCode) && /case 'unavailable':/.test(chatCode));

// ---------------------------------------------------------------------------------------------
// 5. ARTICLE 9 AND THE LOG. The WhatsApp line, held on this surface.
// ---------------------------------------------------------------------------------------------
console.log('\n=== article 9 and the log ===\n');

ok('🔴 nothing from the circumstances chain can reach the chat, in either file',
  !/circumstances|CIRCUMSTANCES|sensitive\(|'blind'|"blind"/.test(routeCode)
  && !/circumstances|CIRCUMSTANCES|sensitive\(|'blind'|"blind"/.test(chatCode));
ok('🔴 message content is NEVER logged: no console call in the route at all',
  !/console\./.test(routeCode));
ok('...and none in the chat view either',
  !/console\./.test(chatCode));
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
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THIS ASSERTION USED TO GREP THE ROUTE FOR THE LITERAL `!/£\s*\d/.test(q)` AND CALL IT
// "the WhatsApp guard, same regex". IT WAS PROVING THE DEFECT.
//
// The regex was the same. It was also the ONLY one of isExpenseCheck()'s three conditions that
// had been copied over, and this line was the reason nobody looked: it read like parity had been
// checked. On 11 August 2026 a customer typed "delete all my data" into the chat and was handed
// 🟡 Phone and broadband, and "free subscription", a question about our price, came back a green
// tick about trade bodies. Both sentences were free of pound signs, so both walked straight past
// the one third of a guard this assertion was pinning in place.
//
// ⚠️ SO IT NO LONGER PINS A REGEX IN THE ROUTE, BECAUSE A REGEX IN THE ROUTE IS THE FAULT. The
// decision about what may reach the corpus belongs to the file that owns the corpus, and
// isClaimQuestion() in lib/claimrules.data.ts is now the one place it is written down. This
// asserts the route ASKS it, ahead of the lookup, and proves the money condition still holds by
// behaviour rather than by grep. The guard's full proof, including the negative set this suite
// never had, is test/datadoor.test.mjs.
// ═══════════════════════════════════════════════════════════════════════════════════════════
ok('a money amount never reaches the claim corpus from the thread (the corpus\'s own guard, asked by name)',
  /if \(isClaimQuestion\(q\)\) \{/.test(routeCode)
  && routeCode.indexOf('isClaimQuestion(q)') > -1
  && routeCode.indexOf('checkExpense(q)') > -1
  && routeCode.indexOf('isClaimQuestion(q)') < routeCode.indexOf('checkExpense(q)')
  && claims.isClaimQuestion('phone bill £45, 80% business') === false
  && claims.isClaimQuestion('can I claim my boots') === true);

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
ok('the thread block exists in lib/supabase.ts, self contained, with its end marker', si > -1 && ei > si);

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

const CONV = '5e6f7a8b-1111-4111-8111-222222222222';
const SIG = '7a8b9c0d-3333-4333-8333-444444444444';

// The list: one round trip, every filter carrying the session's user id, twice over.
reset([{ json: [{
  id: CONV, kind: 'lekhio', title: 'Lekhio',
  last_message_at: '2026-07-31T10:01:00Z', created_at: '2026-07-31T09:00:00Z',
  messages: [{ role: 'lekhio', content: 'the last answer' }],
}] }]);
const list = await T.listChatsForUser('alice');
ok('🔴 the chat list is scoped by user_id on the conversations AND on the embedded last line',
  calls[0].url.includes('user_id=eq.alice') && calls[0].url.includes('messages.user_id=eq.alice'));
ok('one round trip carries the rows and their last lines, newest activity first',
  calls.length === 1 && calls[0].url.includes('order=last_message_at.desc')
  && Array.isArray(list) && list.length === 1 && list[0].last?.content === 'the last answer');
reset([{ status: 500 }]);
ok('a failed list read is null, so the page can say so, never an empty list',
  (await T.listChatsForUser('alice')) === null);
reset([{ json: [] }]);
const noneYet = await T.listChatsForUser('alice');
ok('no chats yet is [], the honest empty state', Array.isArray(noneYet) && noneYet.length === 0);

// One chat's turns: every query carries the session's user id.
reset([{ json: [
  { id: 'm2', role: 'lekhio', content: 'answer', created_at: '2026-07-31T10:01:00Z' },
  { id: 'm1', role: 'user', content: 'question', created_at: '2026-07-31T10:00:00Z' },
] }]);
const msgs = await T.chatMessagesForUser('alice', CONV);
ok('🔴 the message read is scoped by user_id AS WELL AS conversation_id',
  calls[0].url.includes('user_id=eq.alice') && calls[0].url.includes(`conversation_id=eq.${CONV}`));
ok('turns come back oldest first, so the newest sits at the bottom of the page',
  Array.isArray(msgs) && msgs.length === 2 && msgs[0].id === 'm1' && msgs[1].id === 'm2');
reset([{ status: 500 }]);
ok('a failed read is null, so the page can say so, never an empty chat',
  (await T.chatMessagesForUser('alice', CONV)) === null);
reset([]);
ok('🔴 an id that is not a uuid never reaches a query at all',
  (await T.chatMessagesForUser('alice', 'x) or user_id=neq.nobody')) === null && calls.length === 0);

// The chat head, same scoping.
reset([{ json: [{ id: CONV, kind: 'lekhio', title: 'Lekhio' }] }]);
await T.chatForUser('alice', CONV);
ok('the chat head read is scoped by user_id as well as id',
  calls[0].url.includes('user_id=eq.alice') && calls[0].url.includes(`id=eq.${CONV}`));
reset([{ json: [] }]);
const notHis = await T.chatForUser('mallory', CONV);
ok('🔴 another man\'s chat id comes back as nobody\'s: [], and the view goes to the list',
  Array.isArray(notHis) && notHis.length === 0 && calls[0].url.includes('user_id=eq.mallory'));

// Starting a new chat: minted for THIS user, and HONEST when the database still says one.
reset([{ status: 201, json: [{ id: 'new-1' }] }]);
const made = await T.createLekhioChat('alice');
ok('a new chat is minted for THIS user with kind lekhio',
  made.ok === true && made.id === 'new-1'
  && calls[0].method === 'POST'
  && JSON.parse(calls[0].body).user_id === 'alice'
  && JSON.parse(calls[0].body).kind === 'lekhio');
reset([{ status: 409 }]);
const refused = await T.createLekhioChat('alice');
ok('🔴 the unrun migration (409 off the v1 one-thread index) is reported as blocked, honestly',
  refused.ok === false && refused.blocked === true);
ok('...and NOTHING was reused: one insert attempt, zero reads of other chats',
  calls.length === 1 && calls[0].method === 'POST');
reset([{ status: 500 }]);
const broke = await T.createLekhioChat('alice');
ok('any other failure is a plain no, never mislabelled as the migration',
  broke.ok === false && broke.blocked === false);

// Rakha's rows: scoped, and READ ONLY by construction.
reset([{ json: [{ id: SIG, signal_key: 'pension_relief', payload: { title: 'A pension move', body: 'the stored why' }, created_at: '2026-07-30T02:00:00Z' }] }]);
const flags = await T.rakhaFlagsForUser('alice');
ok('🔴 rakha flags are scoped by user_id, newest first, not dismissed',
  calls[0].url.includes('user_id=eq.alice') && calls[0].url.includes('dismissed_at=is.null')
  && calls[0].url.includes('order=created_at.desc'));
ok('what renders is the stored payload: the title and the why in Rakha\'s own words',
  Array.isArray(flags) && flags[0].title === 'A pension move' && flags[0].body === 'the stored why');
ok('🔴 the rakha read is READ ONLY: a GET and nothing else',
  calls.every((c) => c.method === 'GET'));
reset([{ json: [] }]);
const flag = await T.rakhaFlagForUser('mallory', SIG);
ok('🔴 one flag is scoped by user_id as well as id, so another man\'s reference shows nothing',
  Array.isArray(flag) && flag.length === 0
  && calls[0].url.includes('user_id=eq.mallory') && calls[0].url.includes(`id=eq.${SIG}`)
  && calls[0].method === 'GET');
reset([]);
ok('a non uuid signal id never reaches a query',
  (await T.rakhaFlagForUser('alice', 'DROP TABLE agent_signals')) === null && calls.length === 0);

// 🔴 THE ATTACK. Mallory holds a conversation id that is really the victim's chat.
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

// The route never lets a browser choose a chat by id: the ONLY form fields read are the words,
// the sealed reference and the two receipt fields, and the id the save uses is the VERIFIED
// claim's. Four fields since the evening of 5 August 2026, when the photograph gained its
// picker door beside the camera one.
ok('🔴 the route reads exactly four form fields: q, the sealed reference c, and the two receipt fields',
  (routeCode.match(/f\.get\(/g) || []).length === 4
  && /f\.get\('q'\)/.test(routeCode) && /f\.get\('c'\)/.test(routeCode)
  && /f\.get\('receipt'\)/.test(routeCode) && /f\.get\('receipt_library'\)/.test(routeCode));
ok('🔴 and the camera field is taken first, the picker field only when the camera one is empty',
  /asFile\(f\.get\('receipt'\)\) \?\? asFile\(f\.get\('receipt_library'\)\)/.test(routeCode));
ok('🔴 the reference is verified, kind checked, and checked against the session before any work',
  /verifyChatRef\(ref\)/.test(routeCode)
  && /claim\.kind !== 'chat'/.test(routeCode)
  && /chatRefBelongsTo\(claim, user\.id\)/.test(routeCode)
  // The CALLS are ordered, not the imports: the refusal comes before the counter and the write.
  && routeCode.indexOf('chatRefBelongsTo(claim') < routeCode.indexOf('await userBurst')
  && routeCode.indexOf('chatRefBelongsTo(claim') < routeCode.indexOf('saveLekhioThreadMessage(user.id'));
ok('...and the thread id is the verified claim\'s, never a raw form value',
  /const threadId = claim\.id/.test(routeCode));

// ---------------------------------------------------------------------------------------------
// 8. 🔴 A MESSAGE CAN BE A RECEIPT PHOTOGRAPH (5 August 2026). The route, staged and RUN.
//
// The photograph goes through the SAME walk as the capture route and the WhatsApp webhook,
// lib/receiptingest.ts, which goes on the bench REAL (with real dedupe and real vendor keys)
// so "an image message runs ingest" is asserted on what was written, not on prose. A text
// message must still answer exactly as before, with the ingest never woken.
// ---------------------------------------------------------------------------------------------
console.log('\n=== a message can be a receipt photograph, and words still work ===\n');

{
  const rt = mkdtempSync(path.join(tmpdir(), 'thread-route-'));
  const w = (name, src) => writeFileSync(path.join(rt, name), src);
  w('nextserver.ts', `
export class NextRequest {}
export const NextResponse = {
  json(body, init) { return { kind: 'json', status: (init && init.status) || 200, body }; },
  redirect(url, status) { return { kind: 'redirect', status, location: String(url) }; },
};
`);
  w('webauth.ts', "export async function sessionUser() { return { id: 'u-1' }; }\n");
  w('ratelimit.ts', 'export async function userBurst() { return false; }\n');
  w('gateserver.ts', `
export async function gateForUser() { return 'ok'; }
export function refuseUnentitled() { return { kind: 'json', status: 402, body: { error: 'locked' } }; }
`);
  w('claude.ts', `
export const state = { parsed: null };
export function hasClaudeConfig() { return true; }
export async function parseReceipt() { return state.parsed; }
export async function answerMoneyQuestion() { return 'the model answer'; }
`);
  w('banknudge.ts', "export function busyMessage() { return 'the busy line'; }\n");
  w('features.ts', 'export function hmrcFilingLive() { return false; }\n');
  w('aicost.ts', 'export function decideSpend() { return { allowed: true }; }\n');
  w('margin.ts', 'export function aiCapsFor() { return { killed: false }; }\n');
  w('waintents.ts', `
// The data rights lane. Stubbed to its plainest clause: the real matcher and its two findings are
// in lib/waintents.ts, and test/datadoor.test.mjs walks the whole phrase table through it.
export function isDataRightsRequest(q) { return /delete .*(data|account)/i.test(q); }
// The vehicle lane. Stubbed to its plainest clause; the real matcher, and the reason it refuses to
// name a winner, are in lib/waintents.ts and pinned by test/datadoor.test.mjs.
export function isVehicleQuestion(q) { return /\b(van|vehicle)\b[^.?!]{0,40}\b(claim|mileage)\b/i.test(q); }
export function vehicleAnswer() { return 'Tax, then Vehicle.'; }
export const DATA_RIGHTS_ANSWER = 'You, then Your data.';
export function matchProductTruth() { return null; }
export function productTruthAnswer() { return ''; }
export function matchTotalsQuestion() { return null; }
export function formatGbp(n) { return '£' + n; }
export function isDeadlineQuestion(q) { return /deadline/.test(q); }
// The tie break the deadline lane now runs behind, stubbed to its first and strongest clause: a
// named quantity is a money question whatever date words ride along. The real rule, and the reason
// there is one, is in lib/waintents.ts; test/laneparity.test.mjs walks BOTH routers through it.
export function asksAmount(q) { return /how much|how many/.test(q); }
export function deadlineAnswer() { return 'The deadline answer.'; }
export function clampReceiptDate(d) { return d || '2026-08-05'; }
// Somebody else's money. Stubbed to its plainest clause: a name next to a money verb. The real
// matcher, its stoplist, its false positive set and the two channels it now guards are owned by
// test/run3fixes.test.mjs. This sandbox walks the ROUTING, which is that the gate exists and sits
// above every lane that reads his rows.
export function isAboutSomeoneElse(q) { return /how much (has|did) [a-z]+ (made|make|earn|earned)/i.test(q); }
export const SOMEONE_ELSE_ANSWER = 'I can only see your books.';
// RUN 6 F7. Two questions in one message, and the half a first match router used to throw away
// without saying so. Stubbed to its plainest clause: two parts either side of an "and" that each
// carry a question word. The real detector, and the long list of ordinary messages it must stay
// SILENT on, are owned by test/run6fixes.test.mjs against the real lib/waintents.ts. What this
// sandbox walks is the WIRING: that the note goes on the OUTSIDE of the lane chain, so it cannot
// go stale when the chain is reordered, which is a thing that chain does about once a run.
export function compoundAsk(q) {
  const parts = String(q).split(/\\?|;|\\s+and\\s+/i).map((p) => p.trim())
    .filter((p) => p.split(/\\s+/).length >= 3 && /\\b(what|how|when|why|can|is)\\b/i.test(p));
  return parts.length >= 2 ? parts.slice(0, 3) : null;
}
export function compoundAskNote(asks) { return 'TWO QUESTIONS: ' + asks.join(' | '); }
// B16, 17 August 2026. The Scottish rates lane. Stubbed to its plainest clause, a nation word beside
// a tax word: the real matcher, its refusal of the three reserved taxes and the city names the real
// customer actually typed are owned by test/laneparity.test.mjs section 6b against the real
// lib/waintents.ts. What this sandbox walks is the ROUTING, which is that the gate exists, sits
// BELOW the totals lane so a man asking how much still gets his figure, and sits above the model.
export function isScottishRatesQuestion(q) {
  // ⚠️ DOUBLE BACKSLASHES: this stub lives inside a TEMPLATE LITERAL, where a single \\b is the
  // backspace character and not a word boundary. The first draft of this stub used \\b, the
  // predicate silently never matched, and the walk below came back with the model answer.
  return /\\b(scotland|scottish|glasgow)\\b/i.test(q) && /\\b(tax|rate|rates|band|bands)\\b/i.test(q);
}
// B18, 17 August 2026. The VAT lane, which this router did not have. Stubbed to its plainest
// clause, the word itself with no money amount beside it: the real matcher's refusal of a logged
// figure and of a statement of fact about his own registration is owned by test/waintents.test.mjs.
// What this sandbox walks is that the gate exists, that it sits above the model, and above all that
// what comes back is HIS POSITION and not the statute.
export function isVatQuestion(q) {
  // ⚠️ DOUBLE BACKSLASHES, for the reason written on the stub above.
  if (/\u00a3\\s*\\d/.test(q)) return false;
  return /\\bvat\\b/i.test(q);
}
// B19, 17 August 2026. The three lanes that had a pure builder, read his own rows, and were
// dispatched by app/api/whatsapp/route.ts and by nothing else. Each stubbed to its plainest clause,
// because the real matchers, their refusal of a logged amount and their negative sets are owned by
// test/waintents.test.mjs and test/laneparity.test.mjs section 11b against the real file. What this
// sandbox walks is the ROUTING and the half no static read can prove: that a customer typing one of
// these into this chat receives HIS OWN POSITION out of lib/laneanswers.ts and not the model.
export function isPropertyQuestion(q) {
  // ⚠️ DOUBLE BACKSLASHES, for the reason written on the two stubs above.
  return /\\b(propert(y|ies)|rentals?|landlord)\\b/i.test(q) && /\\b(how|what|doing|going|position|tax|owe)\\b/i.test(q);
}
export function isStudentLoanQuestion(q) { return /\\b(student loan|uni loan|postgrad(uate)? loan)\\b/i.test(q); }
export function isNiQuestion(q) { return /\\b(national insurance|class ?2|class ?4)\\b/i.test(q); }
// B19, 18 August 2026. The last money lane that had one door. Stubbed to its plainest clause for
// the reason written above: the real matcher, its 90 character ceiling and its "worth it" arm are
// owned by test/waintents.test.mjs against the real file, and what this sandbox walks is the
// ROUTING, so that a man asking THIS chat what Lekhio has saved him gets his own ledger and not a
// model paraphrasing his money.
export function isSavingsQuestion(q) { return /\\bsaved me\\b|\\bworth it\\b/i.test(q); }
// 🔴 B19, 18 August 2026. THE LAST LANE THAT HAD ONE DOOR, and the only one whose whole reply is a
// fixed string rather than a figure. The matcher is stubbed to its plainest three phrasings for the
// reason written above: the real one is anchored end to end and is owned by test/waintents.test.mjs
// against the real file. identityAnswer is stubbed to ECHO ITS CHANNEL rather than to any wording,
// on purpose and twice over: this sandbox walks the ROUTING, and the words themselves are Jag's
// sign off and will be edited again, so a stub that copied them would make this suite red every
// time somebody changed a sentence it does not own.
export function isIdentity(q) { return /^(who are you|what are you|what is lekhio)$/i.test(q.trim()); }
export function identityAnswer(channel) { return 'IDENTITY(' + channel + ')'; }
`);
  // ⚠️ isClaimQuestion IS STUBBED FALSE, ALONGSIDE A checkExpense THAT ANSWERS NOTHING. This
  // sandbox walks the ROUTING, not the corpus, and the two stubs agree: the claim lane produces no
  // reply here either way. The real guard, its three conditions and the negative set that proves it
  // refuses "delete all my data" live in test/datadoor.test.mjs against the real corpus.
  w('taxrules.ts', 'export function checkExpense() { return null; }\nexport function isClaimQuestion() { return false; }\nexport const VERDICT_ICON = {};\n');
  // ⚠️ hasTaxPosition IS STUBBED TRUE ON PURPOSE. This sandbox exists to walk the ROUTING, and its
  // getOptimiserInput returns {}, so the real rule would answer false and short circuit every owed
  // assertion here into the empty state. The rule itself, both of its arms, and the fact that both
  // chat lanes ask the one function, are owned by test/emptyposition.test.mjs against the real
  // lib/taxoptimiser.ts.
  w('taxoptimiser.ts', `
export function taxPosition() { return { setAside: 0, projected: false }; }
export function setAsideBasisLine() { return ''; }
export function hasTaxPosition() { return true; }
// The one door both chat lanes now lead with, stubbed to the rule it encodes: what he has to FIND,
// which is the bill less any CIS. The real function and the drift it exists to stop are owned by
// test/run3fixes.test.mjs and test/threadcollection.test.mjs.
export function billFromPosition(t) { return t.cisSuffered > 0 ? t.setAsideAfterCis : t.setAside; }
`);
  w('supabase.ts', `
export const state = { rows: [], writes: [], turns: [] };
export async function bumpAiUsage() { return 1; }
export async function countActiveSubscribers() { return 10; }
export async function refreshFactsFromDb() {}
export async function totalsForUser() { return null; }
export async function pendingSummaryForUser() { return null; }
export async function getOptimiserInput() { return {}; }
export async function transactionSummaryForUser() { return ''; }
export async function getRelevantKnowledge() { return []; }
export async function saveLekhioThreadMessage(userId, threadId, role, content) {
  state.turns.push({ userId, threadId, role, content });
  return true;
}
export async function recentUnconfirmedForMatch() { return state.rows; }
// RUN 2: the receipt walk asks a second question through its own reader, "did this photograph
// arrive recently". See lib/receiptingest.ts.
export async function recentlyCapturedForMatch() { return state.rows; }
export async function dropSupersededReceipts() { return 0; }
export async function insertTransaction(record) { state.writes.push({ fn: 'insert', record: { ...record } }); }
export async function mergeIntoTransaction(userId, id, patch) { state.writes.push({ fn: 'merge', id, patch }); return true; }
export async function storeReceiptImage() { return 'receipts/u-1/2026-08-05-x.jpg'; }
export async function readVatProfile() { return null; }
`);
  // 🔴 B18. THE ONE VAT READER, STUBBED SO THE WALK CAN TELL WHOSE BOOKS WERE OPENED. The real
  // lib/vatanswer.ts does two Supabase reads and hands lib/vatstanding.ts the rows; its window, its
  // refusal on a failed read and the order of the sentences it produces are owned by
  // test/run2fixes.test.mjs against the real files. What this sandbox proves is the half no static
  // read can: that a customer typing a VAT question into this chat receives HIS FIGURE, that the
  // reader was asked about HIS account, and that the model was never called.
  w('vatanswer.ts', `
export const state = { asked: [] };
export async function vatAnswerForUser(userId, body) {
  state.asked.push({ userId, body });
  return 'Your last twelve months come to \u00a383,562.07, so you are \u00a36,437.93 below the line.';
}
`);
  // 🔴 B19. THE ONE READER BEHIND THE OTHER THREE LANES, STUBBED THE SAME WAY AND FOR THE SAME
  // REASON. The real lib/laneanswers.ts reads his rows, his plan and his income shape; what it says
  // on a failed read, and the property empty state it used to guess, are owned by
  // test/b19threelanes.test.mjs against the real file. What this sandbox proves is the half no
  // static read can: that the chat answers these three from HIS ACCOUNT and never from the model.
  w('laneanswers.ts', `
export const state = { asked: [] };
export async function niAnswerForUser(userId) {
  state.asked.push({ lane: 'ni', userId });
  return 'National Insurance this tax year: \u00a31,982.40 Class 4 on your profit so far.';
}
export async function studentLoanAnswerForUser(userId, channel) {
  state.asked.push({ lane: 'studentloan', userId, channel });
  return 'About \u00a31,161.00 of student loan (Plan 2) is building up.';
}
export async function propertyAnswerForUser(userId, channel) {
  state.asked.push({ lane: 'property', userId, channel });
  return 'Property this tax year across 1 property: \u00a311.4k of rent in.';
}
`);
  // 🔴 B19, 18 AUGUST 2026. THE SAVINGS READER, STUBBED FOR THE SAME REASON AS THE TWO ABOVE. The
  // real lib/savingsanswer.ts runs getOptimiserInput and lib/ledger.ts and refuses on a failed read;
  // the refusal, the builder's words and the money format are owned by test/laneparity.test.mjs
  // section 12a and test/waintents.test.mjs against the real files. What this sandbox proves is that
  // this chat ASKS it, about THIS account, and never reaches the model with the question.
  w('savingsanswer.ts', `
export const state = { asked: [] };
export async function savingsAnswerForUser(userId) {
  state.asked.push({ lane: 'savings', userId });
  return 'The costs you have logged are keeping \u00a34,120.40 off your tax bill this year.';
}
`);
  w('chatref.ts', `
export function verifyChatRef(ref) { return ref === 'sealed' ? { kind: 'chat', id: 'conv-1' } : null; }
export function chatRefBelongsTo() { return true; }
`);
  // The REAL walk and its REAL matcher, wired to the stubs, exactly as production wires them.
  w('dedupe.ts', read('lib/dedupe.ts'));
  w('memory.ts', read('lib/memory.ts'));
  w('receiptconfidence.ts', read('lib/receiptconfidence.ts'));
  w('receiptingest.ts', read('lib/receiptingest.ts').replace(/from '\.\/([a-zA-Z]+)'/g, "from './$1.ts'"));
  // 🔴 AND THE REAL ENGINES BEHIND THE COLLECTION SENTENCE, 9 AUGUST 2026. The owed answer now
  // names the January date and, over the threshold, the two payments on account, all of it read
  // off paymentsOnAccount() with the year resolved through quarterForDate() exactly as the tax
  // hub resolves it. Those are dates and money in a sentence a customer acts on, so the real
  // arithmetic runs here rather than a stub's opinion of it. money and taxengine import nothing
  // at all; quarterpack imports only taxengine and scotland, so the graph stays shallow.
  w('money.ts', read('lib/money.ts'));
  w('taxengine.ts', read('lib/taxengine.ts'));
  w('scotland.ts', read('lib/scotland.ts'));
  w('quarterpack.ts', read('lib/quarterpack.ts').replace(/from '\.\/([a-zA-Z]+)'/g, "from './$1.ts'"));
  w('route.ts', routeSrc
    .replace(/from 'next\/server'/g, "from './nextserver.ts'")
    .replace(/from '(?:\.\.\/)+lib\/([a-zA-Z]+)'/g, "from './$1.ts'")
    .replace("from '../../app/chatref'", "from './chatref.ts'"));

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE STUBS ARE A HAND WRITTEN LIST, AND A HAND WRITTEN LIST OF IMPORTS HAS ALREADY COST THIS
  // PROJECT A RED CI. 17 August 2026.
  //
  // test/receiptvat.test.mjs stages lib/claude.ts and its imports the same way. One new import was
  // added to the real file, the list here did not hear about it, and the suite died with
  // ERR_MODULE_NOT_FOUND on a temp path. The local gate at the time grepped each suite for "N
  // failed", a CRASHING SUITE PRINTS NO SUCH LINE, so a dead suite counted as green and the handover
  // said 230 suites, 0 failed. CI #556 found it. It happened again HERE five hours later, when the
  // Scottish rates lane was wired into the route and this stub had never heard of it.
  //
  // So the list is now CHECKED AGAINST THE ROUTE, before the module is loaded. Every name the real
  // route imports from a module this sandbox stubs must be exported by the stub, and a missing one
  // fails BY NAME with the name in it, instead of throwing a stack trace three frames deep in the
  // module loader. The cure for a list that rots is not a longer list, it is a derived one.
  //
  // ⚠️ TYPE ONLY IMPORTS ARE ERASED BEFORE LOAD AND ARE DELIBERATELY NOT DEMANDED, the same
  // exemption test/receiptvat.test.mjs settled on and for the same reason: nothing resolves them at
  // runtime, so a stub that omits one is not a defect.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  {
    const stubbed = new Map();
    for (const f of readdirSync(rt)) {
      if (!f.endsWith('.ts')) continue;
      const src = readFileSync(path.join(rt, f), 'utf8');
      const names = new Set();
      for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|const|class|let|var)\s+([A-Za-z_$][\w$]*)/g)) {
        names.add(m[1]);
      }
      stubbed.set(f.replace(/\.ts$/, ''), names);
    }
    const wanted = [];
    const re = /import\s+(?!type\s)\{([^}]*)\}\s*from\s*'(?:(?:\.\.\/)+lib\/|\.\.\/\.\.\/app\/)([a-zA-Z]+)'/g;
    for (const m of routeSrc.matchAll(re)) {
      const mod = m[2];
      if (!stubbed.has(mod)) continue;
      for (const raw of m[1].split(',')) {
        const t = raw.trim();
        // The inline type specifier, `import { busyMessage, type AiBlockReason }`. Erased before
        // load, so a stub that omits it is not a defect. This is the exemption named above, and it
        // must SKIP the name rather than strip the keyword off it.
        if (/^type\s/.test(t)) continue;
        const n = t.split(/\s+as\s+/)[0].trim();
        if (n) wanted.push([mod, n]);
      }
    }
    ok('🔴 the stub check found real imports to check, so it is not vacuous', wanted.length >= 10);
    const holes = wanted.filter(([mod, n]) => !stubbed.get(mod).has(n));
    ok(`🔴 EVERY name the route imports from a stubbed module IS stubbed (${wanted.length} checked)`,
      holes.length === 0);
    if (holes.length) {
      for (const [mod, n] of holes) console.log(`        MISSING from the ${mod} stub: ${n}`);
    }
  }

  const R = await import(pathToFileURL(path.join(rt, 'route.ts')).href);
  const DB = await import(pathToFileURL(path.join(rt, 'supabase.ts')).href);
  const AI = await import(pathToFileURL(path.join(rt, 'claude.ts')).href);
  const RI = await import(pathToFileURL(path.join(rt, 'receiptingest.ts')).href);
  const SCOT = await import(pathToFileURL(path.join(rt, 'scotland.ts')).href);
  const VA = await import(pathToFileURL(path.join(rt, 'vatanswer.ts')).href);
  const LA = await import(pathToFileURL(path.join(rt, 'laneanswers.ts')).href);
  const SA = await import(pathToFileURL(path.join(rt, 'savingsanswer.ts')).href);

  const screwfix = {
    merchant_name: 'Screwfix', amount: 164.78, category: 'materials',
    transaction_type: 'expense',
      // Stubbing a typed function means honouring its type: parseReceipt always
      // returns an array here, empty when the paper was not itemised.
      line_items: [], transaction_date: '2026-08-05', vat: null,
  };
  const post = async ({ q, image, library, rows = [] }) => {
    DB.state.rows = rows;
    DB.state.writes.length = 0;
    DB.state.turns.length = 0;
    AI.state.parsed = screwfix;
    const fd = new FormData();
    fd.append('c', 'sealed');
    if (q !== undefined) fd.append('q', q);
    if (image) fd.append('receipt', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), 'r.jpg');
    if (library) fd.append('receipt_library', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), 'r.jpg');
    const res = await R.POST({ url: 'https://lekhio.app/api/thread', formData: async () => fd });
    return { res, turns: DB.state.turns, writes: DB.state.writes };
  };

  {
    const { res, turns, writes } = await post({ image: true });
    ok('🔴 AN IMAGE MESSAGE RUNS THE INGEST: one waiting row, negative, marked web_image, his',
      writes.length === 1 && writes[0].fn === 'insert'
      && writes[0].record.user_id === 'u-1' && writes[0].record.amount === -164.78
      && writes[0].record.confirmed === false && writes[0].record.source_type === 'web_image');
    ok('his turn says what he sent, and Lekhio\'s turn says what was read, in plain words',
      turns.length === 2
      && turns[0].role === 'user' && turns[0].content === 'A receipt photograph.'
      && turns[1].role === 'lekhio'
      && turns[1].content === 'Read your Screwfix receipt. £164.78, filed as materials, and it is waiting for your yes under Waiting on you.');
    ok('and the 303 lands back in the same chat, at the newest turn',
      res.kind === 'redirect' && res.status === 303 && res.location.includes('/app/thread/chat?c=sealed')
      && res.location.includes('#end'));
  }
  {
    const { turns, writes } = await post({ library: true });
    ok('🔴 A PHOTOGRAPH FROM THE PICKER FIELD, WITH NO CAMERA FIELD AT ALL, RUNS THE SAME INGEST',
      writes.length === 1 && writes[0].fn === 'insert'
      && writes[0].record.user_id === 'u-1' && writes[0].record.amount === -164.78
      && writes[0].record.confirmed === false && writes[0].record.source_type === 'web_image'
      && turns.length === 2 && turns[1].content.includes('waiting for your yes'));
  }
  {
    const dupRow = { id: 'r1', vendor: 'Screwfix', amount: -164.78, transaction_date: '2026-08-05', category: 'materials', source_type: 'whatsapp_image' };
    const { turns, writes } = await post({ image: true, rows: [dupRow] });
    ok('🔴 THE SAME RECEIPT TWICE IS REFUSED IN THE CHAT TOO: nothing written, and the refusal is the shared sentence',
      writes.length === 0
      && turns[1].content === RI.duplicateReceiptLine('Screwfix', 164.78, '2026-08-05')
      && turns[1].content.includes('I have not added it again'));
  }
  {
    const { turns, writes } = await post({ q: 'can I claim my receipt for the deadline', image: true });
    ok('words riding along with a photograph stay HIS words, and the reply is about the receipt',
      turns[0].content === 'can I claim my receipt for the deadline'
      && turns[1].content.includes('waiting for your yes') && writes.length === 1);
  }
  {
    const { turns, writes } = await post({ q: 'when is the tax deadline' });
    ok('🔴 A TEXT MESSAGE STILL ANSWERS EXACTLY AS BEFORE, and the ingest never wakes',
      writes.length === 0 && turns.length === 2
      && turns[0].content === 'when is the tax deadline'
      && turns[1].content === 'The deadline answer.');
  }
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 B16. THE SCOTTISH RATES LANE, RUN RATHER THAN READ. 17 August 2026.
  //
  // test/laneparity.test.mjs section 6 derives this lane's POSITION from the indices in all three
  // routers, which is the right guard for an ordering defect and is still only an argument about
  // where a call site sits. THIS is the one place in the tree where the thread route actually RUNS,
  // so it is the only place that can prove what a customer would receive.
  //
  // ⚠️ AND THE ASSERTION THAT MATTERS IS THE SECOND ONE: THE MODEL WAS NEVER ASKED. B2 caught the
  // model, on this exact surface, telling a Glasgow plumber his rates are the same as the rest of
  // the UK and then quoting a band table with a 41% higher rate. A lane that fires and then hands
  // the question to the model anyway is the defect wearing the fix's clothes, and the stub answer
  // is deliberately distinguishable ('the model answer') so it cannot pass by looking similar.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  {
    const { turns, writes } = await post({ q: 'am in glasgow mate do i pay the same income tax as england' });
    ok('🔴 A SCOTTISH RATES QUESTION IS ANSWERED FROM lib/scotland.ts, and the ingest never wakes',
      writes.length === 0 && turns.length === 2
      && turns[1].content === SCOT.SCOTTISH_RATES_ANSWER);
    ok('🔴 ...AND THE MODEL WAS NEVER ASKED, so the answer cannot be disobeyed and costs him nothing',
      turns.length === 2 && turns[1].content !== 'the model answer'
      && !/\b(?:19|20|21|41|42|45|46|48)\s*%/.test(turns[1].content));
  }
  // ⚠️ AND THE FIGURE STILL WINS WHEN HE ASKS FOR A FIGURE. Since J8 the set aside answer carries
  // the sentence itself, so hoisting the Scotland lane above the totals lane would hand a man
  // asking HOW MUCH a rule instead of his number. matchTotalsQuestion is stubbed to null in this
  // sandbox, so what this proves is the narrower and still useful half: a Scottish message naming a
  // quantity is not swallowed by the rates lane on its way past.
  {
    const { turns } = await post({ q: 'am in glasgow mate, how much should i be putting by for the taxman' });
    ok('⚠️ a Scottish message asking HOW MUCH is not eaten by the rates lane',
      turns.length === 2 && turns[1].content !== SCOT.SCOTTISH_RATES_ANSWER);
  }
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 B18. THE VAT LANE, RUN RATHER THAN READ. 17 August 2026.
  //
  // FOUND ON THIS SURFACE. Signed in as a Glasgow sole trader with 77 confirmed entries, this chat
  // was asked "am in glasgow, is vat different up here" and answered: "No, VAT is the same across
  // the UK, including Scotland. The threshold is £90,000 rolling 12-month turnover to register, and
  // deregistration at £88,000." Every figure correct, and not one of them his. isVatQuestion was
  // dispatched by the webhook and by nothing else, so the man who asked the most consequential
  // threshold question of his trading life on the web got the statute out of a model while his own
  // books sat one table away.
  //
  // ⚠️ THE THIRD ASSERTION IS THE ONE THAT COULD NOT BE MADE ANYWHERE ELSE. laneparity derives that
  // the call site sits above the model, which is an argument about indices. This RUNS the route, so
  // it can hold that the reader was handed THIS customer's id, which is the difference between a
  // wired lane and a lane that answers about somebody.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  {
    VA.state.asked.length = 0;
    const { turns, writes } = await post({ q: 'should i be registered for vat, im scared im getting close' });
    ok('🔴 A VAT QUESTION IS ANSWERED FROM HIS OWN ROWS, and the ingest never wakes',
      writes.length === 0 && turns.length === 2
      && turns[1].content === 'Your last twelve months come to £83,562.07, so you are £6,437.93 below the line.');
    ok('🔴 ...AND THE MODEL WAS NEVER ASKED, so he is not charged for it and it cannot invent a run rate',
      turns.length === 2 && turns[1].content !== 'the model answer');
    ok('🔴 ...AND THE READER WAS ASKED ABOUT HIS ACCOUNT, not merely called',
      VA.state.asked.length === 1 && VA.state.asked[0].userId === 'u-1');
    // 🔴 B20. AND HIS WORDS GO WITH HIS ID, so the reader can answer the yes or no he asked. The
    // sentence itself and the nation ear are owned by test/run2fixes.test.mjs and
    // test/laneparity.test.mjs against the real files; what this proves is that the router does not
    // drop the message on the floor, which is the only way a wired lane can still answer the
    // wrong question.
    ok('🔴 ...AND HIS WORDS WENT WITH IT, or the yes or no can never be answered',
      VA.state.asked.length === 1
      && VA.state.asked[0].body === 'should i be registered for vat, im scared im getting close');
  }
  // ══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 B19. NATIONAL INSURANCE, THE STUDENT LOAN AND THE PROPERTY STREAM, ON THIS SURFACE.
  //
  // All three predicates have existed since Run 2, all three had a pure builder, all three read his
  // own rows, and until 17 August 2026 all three were dispatched by app/api/whatsapp/route.ts and by
  // nothing else. So this chat, signed in, with his whole ledger one query away, answered "how much
  // national insurance do i pay" out of the MODEL.
  //
  // test/laneparity.test.mjs section 11 holds the routing by index on all three routers. This is the
  // one place composeOneLane actually RUNS, so it is the only place that can prove the reply a
  // customer receives came from his account rather than from a fluent guess.
  // ══════════════════════════════════════════════════════════════════════════════════════════
  for (const [q, lane, tell] of [
    ['how much national insurance do i pay', 'ni', 'Class 4 on your profit so far'],
    ['how much student loan will i owe', 'studentloan', 'student loan (Plan 2) is building up'],
    ['how are my properties doing', 'property', 'of rent in'],
  ]) {
    LA.state.asked.length = 0;
    const { turns } = await post({ q });
    ok(`🔴 ${JSON.stringify(q)} IS ANSWERED FROM HIS OWN ROWS ON THIS SURFACE`,
      turns.length === 2 && turns[1].content.includes(tell));
    ok('🔴 ...AND THE MODEL WAS NEVER ASKED, so it cannot invent a figure about his money',
      turns.length === 2 && turns[1].content !== 'the model answer');
    ok('🔴 ...AND THE READER WAS ASKED ABOUT HIS ACCOUNT, not merely called',
      LA.state.asked.length === 1 && LA.state.asked[0].lane === lane && LA.state.asked[0].userId === 'u-1');
    // 🔴 AND IT WAS TOLD WHERE HE IS STANDING. Two of the three lanes have an empty state that
    // offers a door, and only WhatsApp has it: "tell me here, like plan 2" and "text it as it lands"
    // are both instructions this surface cannot honour, because matchStudentLoanPlanSet and
    // matchRentIn are WhatsApp only by written decision. A router that does not say which channel it
    // is sends a man in a browser to type at a box that will not hear him.
    if (lane !== 'ni') {
      ok('🔴 ...AND THE READER WAS TOLD THIS IS THE WEB, so it never offers a WhatsApp only door',
        LA.state.asked.length === 1 && LA.state.asked[0].channel === 'web');
    }
  }
  // ══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 B19, 18 AUGUST 2026. WHAT LEKHIO HAS SAVED HIM, ON THIS SURFACE, FOR THE FIRST TIME.
  //
  // The last money lane with one door, and the one it had was WhatsApp. It was last because it was
  // the only lane with NO pure builder to move: the sentences were assembled inline in the webhook.
  // So a man signed in here, a month into paying us, typing the question a man types when he is
  // deciding whether to carry on paying us, was answered by the MODEL out of nothing.
  //
  // ⚠️ "was it worth it" IS THE SAME QUESTION AND IT IS THE DANGEROUS ONE. It carries no first
  // person word at all, which on /api/ask is what sends an answer into the shared qa_cache. Both
  // phrasings are walked here.
  // ══════════════════════════════════════════════════════════════════════════════════════════
  for (const q of ['what have you saved me', 'was it worth it']) {
    SA.state.asked.length = 0;
    const { turns } = await post({ q });
    ok(`🔴 ${JSON.stringify(q)} IS ANSWERED FROM HIS OWN LEDGER ON THIS SURFACE`,
      turns.length === 2 && turns[1].content.includes('off your tax bill this year'));
    ok('🔴 ...AND THE MODEL WAS NEVER ASKED, so his saving is never a fluent guess',
      turns.length === 2 && turns[1].content !== 'the model answer');
    ok('🔴 ...AND THE READER WAS ASKED ABOUT HIS ACCOUNT, not merely called',
      SA.state.asked.length === 1 && SA.state.asked[0].lane === 'savings'
      && SA.state.asked[0].userId === 'u-1');
    // ⚠️ AND IT TAKES NO CHANNEL, WHICH IS THE MEASURED DIFFERENCE FROM THE TWO LANES ABOVE. The
    // one sentence in this lane with a channel in it belongs to a state only WhatsApp has, an
    // unlinked phone number, so there is nothing here for a channel to switch. Asserted rather
    // than assumed, so a later caller cannot quietly start passing one and mean something by it.
    ok('🔴 ...AND WAS PASSED NO CHANNEL, because its words are true wherever he is standing',
      SA.state.asked.length === 1 && SA.state.asked[0].channel === undefined);
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 B19, 18 AUGUST 2026. WHO LEKHIO IS, ON THIS SURFACE, FOR THE FIRST TIME. THE LAST LANE.
  //
  // isIdentity has existed since Run 2 and the webhook was its only caller, because its two
  // sentences were assembled inline in that file. So a man signed in here who typed "who are you"
  // was handed to a paid model call, and the model chose the words for a reply that has to carry a
  // compliance sentence: that HE approves before anything goes to HMRC.
  //
  // ⚠️ THE ASSERTION IS ON THE CHANNEL, NOT ON THE WORDING, AND THAT IS DELIBERATE. The stub echoes
  // the channel it was given, so this proves the two things a router can get wrong (that the lane
  // fires at all, and that it says 'web' and not 'whatsapp') without pinning a sentence this suite
  // does not own. The repo has been bitten by guards that went on defending a sentence after the
  // fact changed; the WORDS are held once, in test/laneparity.test.mjs section 13, against the real
  // builder.
  // ══════════════════════════════════════════════════════════════════════════════════════════
  for (const q of ['who are you', 'what are you', 'what is lekhio']) {
    const { turns } = await post({ q });
    ok(`🔴 ${JSON.stringify(q)} IS ANSWERED BY THE LANE ON THIS SURFACE, not by the model`,
      turns.length === 2 && turns[1].content === 'IDENTITY(web)');
    ok('🔴 ...AND THE CHANNEL SAID web, so he is never told to send a text at a box that cannot take one',
      turns.length === 2 && !turns[1].content.includes('whatsapp'));
  }

  // ⚠️ AND THE TOTALS LANE DOES NOT EAT THEM. matchTotalsQuestion takes any money word plus one of
  // "how much", "what" or "my", so all three phrasings above satisfy it as well. It is stubbed null
  // here, so the ORDER is held by test/laneparity.test.mjs section 11 by index on all three routers,
  // and this line records why the walk above cannot prove it.

  // ⚠️ AND A VAT AMOUNT BEING LOGGED IS NOT A VAT QUESTION. "vat was £4.83" is a figure on a
  // receipt, and a lane that eats it turns an entry into a lecture about the threshold. The real
  // matcher refuses any message carrying a money amount; the stub carries that one clause, so this
  // walks the wiring rather than restating test/waintents.test.mjs.
  {
    VA.state.asked.length = 0;
    const { turns } = await post({ q: 'the vat on it was £4.83' });
    ok('⚠️ a VAT amount being logged never reaches the VAT lane',
      VA.state.asked.length === 0 && turns[1].content !== 'Your last twelve months come to £83,562.07, so you are £6,437.93 below the line.');
  }
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 RUN 6 F7. TWO QUESTIONS IN ONE MESSAGE, ANSWERED IN HALF, SILENTLY.
  //
  // This is the ONE place in the tree where composeReply actually RUNS, so it is the only place
  // that can prove the note is attached to the reply rather than merely present in the file. The
  // detector itself, and the fourteen ordinary messages it must stay silent on, are owned by
  // test/run6fixes.test.mjs against the real matcher.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  {
    // ⚠️ THE FIXTURE IS A DEADLINE PLUS A CLAIM, NOT A DEADLINE PLUS A "how much". The first
    // draft used the latter and the reply came back off the MODEL, because "how much" trips the
    // asksAmount tie break twenty lines up and the message falls past the deadline lane on
    // purpose. That is the router working exactly as the 9 August fix intends. It also meant the
    // assertion proved nothing about a deterministic lane, which is the case this finding is
    // about, so the fixture names one.
    const { turns } = await post({ q: 'when is the tax deadline and can i claim a van' });
    ok('🔴 A COMPOUND QUESTION IS TOLD SO, IN THE REPLY THAT REACHES THE CHAT',
      turns.length === 2 && /TWO QUESTIONS:/.test(turns[1].content));
    ok('...and the lane still answers, so the note is added to an answer and never instead of one',
      /The deadline answer\./.test(turns[1].content));
    ok('...with the note ABOVE the answer, because a person reads down',
      turns[1].content.indexOf('TWO QUESTIONS:') < turns[1].content.indexOf('The deadline answer.'));
  }
  {
    const { turns } = await post({ q: 'when is the tax deadline' });
    ok('🔴 AND ONE QUESTION GETS NO NOTE AT ALL, which is the case that must never regress',
      turns[1].content === 'The deadline answer.');
  }
  {
    const { res, turns } = await post({});
    ok('nothing at all is refused as empty, before any write',
      res.kind === 'redirect' && res.location.includes('problem=empty') && turns.length === 0);
  }
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exit(fail === 0 ? 0 : 1);

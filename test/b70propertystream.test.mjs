// B70. A ROW FILED BEFORE B62 KEEPS A WRONG BILL FOR EVER, AND NOTHING WOULD SAY SO. 20 Aug 2026.
//
//   node test/b70propertystream.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// B62 fixed the door. It cannot touch a row already written. So a landlord who typed his letting
// agent fee on 18 August still has it deducted against a trade he does not have.
//
// 🔴 THE DESIGN IS THE SPLIT, AND WITHOUT IT THIS WATCH WOULD BE MUTED IN A WEEK.
//
//   `misfiled` is every confirmed property category row outside the property stream, all time.
//   `+norah`'s three ARE in it, because they really are misfiled, and rule 9 forbids fixing them.
//   It is REPORTED, behind the bearer, as a to do list for the backfill.
//
//   `sinceFix` is only those written AFTER B62 shipped. It must be zero for ever, and it is the
//   ONLY one that alarms. A row written today that carries `letting agent` and is not in the
//   property stream means the routing has REGRESSED on a real customer's money.
//
// That is the B65 lesson applied a second time: a watch that is permanently red over a fixture we
// are forbidden to fix is a watch somebody turns off, and then it is worse than nothing.
//
// ⚠️ AND SECTION 5 READS THE MIGRATION ITSELF, because the four category strings in that SQL are a
// typed copy of a list that lives in a module, and a list typed into SQL rots the day a fifth is
// added. It is derived from lib/propertylanes.ts here rather than trusted.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); }
};
const before = (src, a, b) => src.indexOf(a) !== -1 && src.indexOf(b) !== -1 && src.indexOf(a) < src.indexOf(b);

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-for-the-test';

const stage = mkdtempSync(path.join(tmpdir(), 'b70-lib-'));
const withExt = (src) => src.replace(/(from\s+')(\.[^']*?)(')/g, (m, a, spec, b) => (
  /\.[a-z]+$/.test(spec) ? m : `${a}${spec}.ts${b}`
));
for (const f of readdirSync(path.join(root, 'lib'))) {
  if (!f.endsWith('.ts')) continue;
  writeFileSync(path.join(stage, f), withExt(read(`lib/${f}`)));
}
ok('🔴 the staged lib/cronwatch.ts differs from the real one in nothing at all',
  readFileSync(path.join(stage, 'cronwatch.ts'), 'utf8') === read('lib/cronwatch.ts'));

const W = await import(pathToFileURL(path.join(stage, 'cronwatch.ts')).href);
const DB = await import(pathToFileURL(path.join(stage, 'supabase.ts')).href);
const L = await import(pathToFileURL(path.join(stage, 'propertylanes.ts')).href);

const H = (over = {}) => ({
  misfiled: 0, accounts: 0, sinceFix: 0, since: W.PROPERTY_STREAM_SINCE, capped: false, ...over,
});

// ---------------------------------------------------------------------------------------------
// 🔴 1. THE POLICY, AND VACUITY FIRST: it must SEE a regression.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 1. the policy: one count alarms and the other never does ===\n');

{
  const a = W.misfiledPropertyAlarm(H({ misfiled: 4, accounts: 2, sinceFix: 1 }));
  ok('🔴 ONE ROW MISFILED SINCE THE FIX IS AN ALARM, because the routing has regressed',
    a !== null && a.job === 'property' && a.reason === 'failed');
  ok('...and it says what it costs him rather than reporting a field',
    /National Insurance on rent/.test(a.detail ?? '') && /Section 24/.test(a.detail ?? ''));
  ok('...and it names no account and no address', !/@/.test(a.detail ?? ''));
  ok('and propertyStreamServing agrees rather than deciding again',
    W.propertyStreamServing(H({ sinceFix: 1 })) === false);
}

// 🔴 THE ONE THAT MAKES THIS WATCH SURVIVABLE.
{
  ok('🔴 NORAH\'S THREE HISTORICAL ROWS ARE REPORTED AND DO NOT ALARM, which is the whole reason'
    + ' this watch will still be on in a month',
    W.misfiledPropertyAlarm(H({ misfiled: 3, accounts: 1, sinceFix: 0 })) === null);
  ok('...even when there are a great many of them',
    W.misfiledPropertyAlarm(H({ misfiled: 400, accounts: 40, sinceFix: 0 })) === null);
  ok('a clean estate is silent', W.misfiledPropertyAlarm(H()) === null);
}

{
  const a = W.misfiledPropertyAlarm(null);
  ok('🔴 A CHECK THAT COULD NOT RUN IS NOT A PASS', a !== null && a.reason === 'unreadable');
  ok('...and serving says no', W.propertyStreamServing(null) === false);
}
{
  const a = W.misfiledPropertyAlarm(H({ capped: true, sinceFix: 0 }));
  ok('🔴 A READ THAT RAN OUT OF ROOM IS UNREADABLE EVEN WITH ZERO REGRESSIONS',
    a !== null && a.reason === 'unreadable' && /row limit/.test(a.detail ?? ''));
}
ok('🔴 THE ALARM BLOCKS: its reason is not never_run, the one blockingAlarms drops',
  W.blockingAlarms([W.misfiledPropertyAlarm(H({ sinceFix: 1 }))]).length === 1);

// THE BOUNDARY. Derived against the commit that shipped B62, not typed twice.
{
  const B62_COMMIT = Date.parse('2026-08-19T22:18:41Z');
  const since = Date.parse(W.PROPERTY_STREAM_SINCE);
  ok('the boundary is a real instant', Number.isFinite(since));
  ok('🔴 AND IT IS AFTER B62 SHIPPED, so this can never accuse the product of a regression that'
    + ' predates the fix being live', since > B62_COMMIT);
  ok('...and it is not so far after that a real regression could hide behind it (inside a day)',
    since - B62_COMMIT < 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------------------------
// 2. THE READER, RUN FOR REAL.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 2. the reader, against a stubbed transport ===\n');

const realFetch = globalThis.fetch;
let seen = [];
let plan = { status: 200, json: [] };
globalThis.fetch = async (url) => {
  seen.push(String(url));
  if (plan.status && plan.status !== 200) return new Response('no', { status: plan.status });
  return new Response(typeof plan.json === 'string' ? plan.json : JSON.stringify(plan.json ?? []), { status: 200 });
};
const runReader = async (p, cats = L.PROPERTY_CATEGORIES) => {
  plan = p; seen = [];
  return DB.getPropertyStreamHealth(cats, W.PROPERTY_STREAM_SINCE);
};
const row = (user, createdAt) => ({ user_id: user, created_at: createdAt });
const BEFORE_FIX = '2026-08-18T09:00:00.000Z';
const AFTER_FIX = '2026-08-20T09:00:00.000Z';

{
  const h = await runReader({ json: [row('u1', BEFORE_FIX), row('u1', BEFORE_FIX), row('u2', BEFORE_FIX)] });
  ok('🔴 THE HISTORICAL ROWS ARE COUNTED AND THE ACCOUNTS ARE DEDUPED',
    h.misfiled === 3 && h.accounts === 2 && h.sinceFix === 0);
}
{
  const h = await runReader({ json: [row('u1', BEFORE_FIX), row('u2', AFTER_FIX)] });
  ok('🔴 AND A ROW WRITTEN AFTER THE FIX IS COUNTED SEPARATELY, which is the one that alarms',
    h.misfiled === 2 && h.sinceFix === 1);
}
{
  const h = await runReader({ json: [row('u1', null), row('u2', undefined)] });
  ok('🔴 A ROW WITH NO created_at IS NEVER COUNTED AS A REGRESSION, because this figure accuses the'
    + ' product and must not do it on a missing field',
    h.misfiled === 2 && h.sinceFix === 0);
}
{
  const h = await runReader({ json: [] });
  ok('a clean estate reads clean', h.misfiled === 0 && h.accounts === 0 && h.sinceFix === 0 && h.capped === false);
}
{
  const many = [];
  for (let i = 0; i < DB.PROPERTY_STREAM_READ_LIMIT; i += 1) many.push(row(`u${i}`, BEFORE_FIX));
  const h = await runReader({ json: many });
  ok('🔴 A READ THAT FILLED ITS LIMIT SAYS SO', h.capped === true);
  const h2 = await runReader({ json: many.slice(0, -1) });
  ok('...and one row short of it does not', h2.capped === false);
}
{
  ok('a failed read is null, never a clean zero', (await runReader({ status: 500 })) === null);
  ok('a body that is not an array is null too', (await runReader({ json: '{"message":"boom"}' })) === null);
  ok('🔴 AND AN EMPTY CATEGORY LIST IS null RATHER THAN A CLEAN ANSWER ABOUT NOTHING',
    (await runReader({ json: [] }, [])) === null);
}
{
  await runReader({ json: [] });
  const u = seen[0] ?? '';
  ok('🔴 IT ASKS ONLY ABOUT CONFIRMED ROWS OUTSIDE THE PROPERTY STREAM',
    u.includes('confirmed=eq.true') && u.includes('income_type=neq.property'));
  ok('🔴 AND ONLY ABOUT THE CATEGORIES THE MODULE NAMES',
    L.PROPERTY_CATEGORIES.every((c) => u.includes(encodeURIComponent(`"${c}"`))));
  ok('it reads the owner and the age and nothing else about his money',
    u.includes('select=user_id,created_at') && !u.includes('amount') && !u.includes('vendor'));
}
globalThis.fetch = realFetch;

// ---------------------------------------------------------------------------------------------
// 3. THE WIRING.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 3. the wiring ===\n');

const health = read('app/api/health/route.ts');
ok('/api/health imports the reader and the policy',
  health.includes('getPropertyStreamHealth') && health.includes('misfiledPropertyAlarm')
  && health.includes('propertyStreamServing'));
ok('🔴 AND IT HANDS THE CATEGORIES OVER FROM THE MODULE rather than letting the reader type them',
  /getPropertyStreamHealth\(PROPERTY_CATEGORIES, PROPERTY_STREAM_SINCE\)/.test(health)
  && /from '(\.\.\/)+lib\/propertylanes'/.test(health));
ok('🔴 THE PUBLIC VERDICT DEPENDS ON IT', /const healthy = [^;]*\bpropertyOk\b/.test(health));
ok('🔴 AND THE OPERATOR VERDICT DOES TOO', /const ok = [\s\S]{0,500}?misfiledProperty === null/.test(health));
ok('the stream is read before the verdict is formed',
  before(health, 'const propertyStream = await getPropertyStreamHealth', 'const healthy ='));
ok('the public body is one word', /property: propertyStream === null \? 'unknown'/.test(health)
  && /propertyOk \? 'ok' : 'misfiled'/.test(health));
ok('🔴 and never the counts', !/property: \{[\s\S]{0,400}status: healthy/.test(health));
ok('the operator body carries the to do list, which is the whole use of the row',
  /property: propertyStream === null \? 'unreadable' : \{[\s\S]{0,300}accounts: propertyStream\.accounts/.test(health));
ok('🔴 and carries capped, so a partial read cannot read as clean',
  /capped: propertyStream\.capped/.test(health));

// ---------------------------------------------------------------------------------------------
// 🔴 4. THE STAGEABLE TAIL, AGAIN, BECAUSE THIS READER LIVES IN IT.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 4. the tail still imports no values ===\n');
{
  const sb = read('lib/supabase.ts');
  const tail = sb.slice(sb.indexOf('export interface DiaryJobDbRow'));
  ok('the property stream reader lives in the stageable tail', tail.includes('getPropertyStreamHealth'));
  ok('🔴 AND THE TAIL STILL IMPORTS NO VALUES AT ALL, only types', !/^import (?!type )/m.test(tail));
  ok('🔴 AND THE READER TAKES THE CATEGORIES AS AN ARGUMENT rather than reaching for the module',
    !/getPropertyStreamHealth[\s\S]{0,600}PROPERTY_CATEGORIES/.test(tail));
}

// ---------------------------------------------------------------------------------------------
// 🔴 5. THE MIGRATION. A LIST TYPED INTO SQL ROTS, SO IT IS DERIVED HERE.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 5. the remedy the watch points at ===\n');

const sql = read('supabase/APPLY_2026-08-20_property_stream_backfill.sql');
const sqlList = `(${[...L.PROPERTY_CATEGORIES].map((c) => `'${c}'`).join(', ')})`;
ok('🔴 THE FOUR CATEGORIES IN THE SQL ARE lib/propertylanes.ts\'s, BYTE FOR BYTE',
  (sql.match(/in \('mortgage interest'[^)]*\)/g) ?? []).every((m) => m === `in ${sqlList}`)
  && sql.includes(`in ${sqlList}`));
ok('every statement that names them names ALL of them',
  (sql.match(/lower\(btrim\([a-z.]*category\)\) in /g) ?? []).length
  === (sql.match(new RegExp(sqlList.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length);
// \U0001F534 AND THE COUNT IS TAKEN STRAIGHT OFF THE MODULE, NOT OFF sqlList, WHICH IS THE ONE THAT
// CANNOT BE HARDCODED AWAY. A suite that typed its own copy of the four would agree with a SQL file
// that had also been left at four while the module grew to five, and the remedy would silently stop
// moving one category with nothing anywhere going red.
{
  const inLists = sql.match(/in \('[^)]*'\)/g) ?? [];
  ok('\U0001F534 EVERY LIST IN THE SQL IS AS LONG AS lib/propertylanes.ts SAYS IT SHOULD BE',
    inLists.length > 0
    && inLists.every((m) => (m.match(/'/g) ?? []).length / 2 === L.PROPERTY_CATEGORIES.length));
}
ok('🔴 THE UPDATE IS SCOPED TO ONE ACCOUNT AND CAN NEVER BE A SWEEP',
  /update public\.transactions[\s\S]{0,200}where user_id = '/.test(sql));
ok('...and it only ever moves CONFIRMED rows that are not already in the stream',
  /update public\.transactions[\s\S]{0,400}confirmed = true[\s\S]{0,200}income_type <> 'property'/.test(sql));
ok('🔴 AND IT RETURNS WHAT IT TOUCHED, because a patch that updates zero rows succeeds silently',
  /returning id, category, amount/.test(sql));
// \u26a0\ufe0f PINNED ON THE WARNING THAT SITS ON THE UPDATE, NOT ON THE WORD ANYWHERE IN THE FILE.
// The first version looked for /norah/i and /rule 9/i and was a HOLE: both appear in the header
// argument as well, so deleting the warning from the statement itself left the suite green. A guard
// that finds a word in a document has not found the sentence that stops somebody.
{
  const upd = sql.slice(0, sql.indexOf('update public.transactions'));
  ok('🔴 THE WARNING SITS DIRECTLY ABOVE THE UPDATE, where the hand is',
    /NEVER RUN THIS WITHOUT A user_id FILTER/.test(upd) && /NEVER RUN IT FOR/.test(upd)
    && /norah/i.test(upd));
  ok('...and the header still argues why, so the reason survives the warning being read past',
    /rule 9/i.test(sql) && /evidence/i.test(sql));
}
// \u26a0\ufe0f ANCHORED ON THE STATEMENTS, NOT ON THE WORDS. The first draft of this looked for
// 'select' before 'update' and went red on its own prose: the header comment argues about "a
// blanket update" two paragraphs above the first query. A guard that reads English as SQL is the
// comment stripping trap wearing a new hat.
ok('it reads before it writes, and reads again after',
  before(sql, 'select\n  t.user_id', 'update public.transactions')
  && sql.lastIndexOf('select\n  sum(') > sql.indexOf('update public.transactions'));
ok('no em dash, en dash, or hyphen used as a dash', !/[—–]/.test(sql));

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

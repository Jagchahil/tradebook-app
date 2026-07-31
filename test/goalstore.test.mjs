// ONE GOALS STORE. The founder's consolidation of user_goals into public.goals, held forever.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// APPLY_2026-07-31_diary_goals.sql said out loud that two goals tables is the house disease and
// that the founder would decide the reconciliation. He decided: public.goals wins, user_goals is
// read only legacy until launch two. This suite is written against the failures that would ship
// quietly:
//
//   1. A WRITER COMES BACK. One route or lib function quietly POSTing user_goals again and the
//      two stores fork: the app shows one truth, Rakha plans around another. The suite strips
//      comments and walks the whole server codebase asserting user_goals appears in NO code.
//
//   2. A CLEVER MAPPING. Somebody "improves" the migration to guess kind 'van' from a title
//      containing van, and the tax planner starts telling a man to spend money on the strength
//      of a fact nobody stated. The mapping is pinned honest here, in the TS and in the SQL,
//      byte for byte in agreement.
//
//   3. WRONG MATHS AT THE BOUNDARY. Pounds times one hundred into pence on the way in, pence
//      over one hundred into pounds on the way out, rounded once. A penny lost per goal is a
//      quiet lie on a money screen.
//
//   4. THE LEGACY DOORS DRIFT. WhatsApp's set goal, goals answer, and "goal done" must keep
//      their exact behaviour over the new store: same order, same cap, same return shapes, and
//      a failed read staying the quiet [] every caller already treats as a quiet day.
//
// Source pins plus a staged runtime attack, in the style of test/diarygoals.test.mjs.
// Run: node test/goalstore.test.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, lstatSync, mkdtempSync, writeFileSync } from 'node:fs';
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

// Comments stripped before looking for code a file must not contain: the headers argue at length
// about user_goals precisely because nothing may touch it, and a check that cannot tell the
// argument from the deed would fail the build over its own explanation.
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const sqlCodeOnly = (src) => src.replace(/--[^\n]*/g, '');

const GO = await import(pathToFileURL(path.join(root, 'lib/goals.ts')).href);
const migration = read('supabase/APPLY_2026-07-31_goals_consolidation.sql');
const supa = read('lib/supabase.ts');
const waRoute = read('app/api/whatsapp/route.ts');
const pageGoals = read('app/app/goals/page.tsx');

console.log('\none goals store: migrated honestly, written once, read the same by every surface');

// ---------------------------------------------------------------------------------------------
// 🔴 1. NO WRITER OF user_goals REMAINS. Not a writer, not a reader, not a mention in code.
// ---------------------------------------------------------------------------------------------
{
  const dirs = ['app', 'lib', 'components', 'scripts', 'khoji'];
  const offenders = [];
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    for (const e of entries) {
      if (e.startsWith('.') || e === 'node_modules') continue;
      const full = path.join(dir, e);
      if (lstatSync(full).isSymbolicLink()) continue;
      if (lstatSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.(ts|tsx|mjs)$/.test(e)) continue;
      if (codeOnly(readFileSync(full, 'utf8')).includes('user_goals')) offenders.push(path.relative(root, full));
    }
  };
  dirs.forEach((d) => walk(path.join(root, d)));
  ok(`🔴 user_goals appears in NO server code, comments aside${offenders.length ? `: ${offenders.join(', ')}` : ''}`,
    offenders.length === 0);

  // The table itself is NOT dropped: the unreleased phone app still reads it until launch two.
  ok('🔴 user_goals stays in schema.sql, read only legacy, with the decision written above it',
    /create table if not exists public\.user_goals/.test(read('supabase/schema.sql'))
    && /READ ONLY LEGACY/.test(read('supabase/schema.sql')));
  ok('🔴 and the migration never drops it', !/drop\s+table/i.test(sqlCodeOnly(migration)));
}

// ---------------------------------------------------------------------------------------------
// 🔴 2. THE MAPPING, HONEST AND IN ONE PLACE. lib/goals.ts and the SQL must agree.
// ---------------------------------------------------------------------------------------------
ok('purchase lands in other: NEVER guessed into van or tools', GO.fromLegacyKind('purchase') === 'other');
ok('savings lands in other too', GO.fromLegacyKind('savings') === 'other');
ok('income survives as itself, the one kind both stores mean the same way', GO.fromLegacyKind('income') === 'income');
ok('🔴 the SQL says the same words: income stays income, everything else is other',
  /when 'income' then 'income'/.test(migration) && /else 'other'/.test(migration));
{
  // The clever version would name van or tools inside the migration's CASE. It must never
  // exist. Comments are stripped first: the CASE's own comment names the words it refuses.
  const caseBlock = sqlCodeOnly(migration.slice(migration.indexOf('case ug.kind'), migration.indexOf('left(btrim')));
  ok('🔴 the migration CASE never names van or tools: no capital kind is invented from a label',
    !/van|tools|pension/.test(caseBlock));
}

// The read direction, for the doc 82 readers (the optimiser's purchaseGoal, Rakha's filters).
ok('a van goal reads as a purchase, which is a fact: it is a planned capital purchase',
  GO.toLegacyKind('van') === 'purchase' && GO.toLegacyKind('tools') === 'purchase');
ok('income reads as income', GO.toLegacyKind('income') === 'income');
ok('pension and other read as savings, the kind no tax rule fires on',
  GO.toLegacyKind('pension') === 'savings' && GO.toLegacyKind('other') === 'savings');
ok('🔴 the accepted price is real: a legacy purchase does NOT round trip back to purchase',
  GO.toLegacyKind(GO.fromLegacyKind('purchase')) === 'savings');

// ---------------------------------------------------------------------------------------------
// 3. THE MIGRATION FILE. Idempotent, pence, created_at kept, dropped goals left behind.
// ---------------------------------------------------------------------------------------------
ok('the goals table is created idempotently, exactly the proposed shape',
  migration.includes('create table if not exists public.goals')
  && migration.includes(`kind in ('van', 'tools', 'pension', 'income', 'other')`)
  && /amount_pence bigint check \(amount_pence is null or amount_pence > 0\)/.test(migration));
ok('🔴 RLS enabled, no policies: the service role only posture the diary holds',
  /alter table public\.goals enable row level security/.test(migration)
  && !/create policy/.test(sqlCodeOnly(migration)));
ok('🔴 pounds become pence by one multiplication, rounded once',
  /round\(ug\.amount \* 100\)::bigint/.test(migration));
ok('🔴 created_at is kept: the order he wrote his goals down in survives',
  /ug\.created_at/.test(migration));
ok('legacy ids are kept, which is what makes a second run a no op',
  /on conflict \(id\) do nothing/.test(migration));
ok('active becomes open, done stays done',
  /case ug\.status when 'done' then 'done' else 'open' end/.test(migration));
ok('🔴 dropped goals are left behind: neither open nor done would be true of them',
  /status in \('active', 'done'\)/.test(migration));
ok('titles are trimmed and clamped to the label check, and a blank title moves nothing',
  /left\(btrim\(ug\.title\), 120\)/.test(migration) && /char_length\(btrim\(ug\.title\)\) >= 1/.test(migration));
ok('the file marks user_goals read only legacy in the database itself',
  /comment on table public\.user_goals/.test(migration) && /READ ONLY LEGACY until launch two/.test(migration));
ok('no dash is used as a dash anywhere in the migration', !/[–—]/.test(migration));

// ---------------------------------------------------------------------------------------------
// 🔴 4. THE LEGACY DOORS AT RUNTIME. Staged like diarygoals: stub config, fake PostgREST.
// ---------------------------------------------------------------------------------------------
{
  const OWNER = '11111111-1111-4111-8111-111111111111';
  const G1 = 'aaaaaaaa-1111-4111-8111-111111111111'; // van, open, priced: the capital goal
  const G2 = 'bbbbbbbb-2222-4222-8222-222222222222'; // pension, open, priced: newest
  const G3 = 'cccccccc-3333-4333-8333-333333333333'; // other, open, NO figure: web only
  const G4 = 'dddddddd-4444-4444-8444-444444444444'; // van, done: history

  const stage = mkdtempSync(path.join(tmpdir(), 'goalstore-'));
  const tail = supa.slice(supa.indexOf('export interface DiaryJobDbRow'));
  ok('the goals accessors live in the stageable tail of lib/supabase.ts', tail.includes('getActiveGoals'));
  // lib/goals.ts is import free, so the real mapping sits under the staged accessors: the very
  // functions production runs, not lookalikes.
  writeFileSync(path.join(stage, 'goals.ts'), read('lib/goals.ts'));
  writeFileSync(path.join(stage, 'accessors.ts'), [
    `import { fromLegacyKind, toLegacyKind, isGoalKind } from './goals.ts';`,
    `const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;`,
    `function config(): { url: string; key: string } { return { url: 'https://db.test', key: 'k' }; }`,
    `function headers(extra: Record<string, string> = {}): Record<string, string> {`,
    `  return { apikey: 'k', Authorization: 'Bearer k', 'Content-Type': 'application/json', ...extra };`,
    `}`,
    `async function insertTransaction(): Promise<void> { /* never reached by the goal doors */ }`,
    tail,
  ].join('\n'));
  const S = await import(pathToFileURL(path.join(stage, 'accessors.ts')).href);

  const goalRows = [
    { id: G1, kind: 'van', label: 'New Transit', amount_pence: 2400000, target_date: '2027-03-01', status: 'open', created_at: '2026-07-01T00:00:00Z' },
    { id: G2, kind: 'pension', label: 'Pension pot', amount_pence: 500000, target_date: null, status: 'open', created_at: '2026-07-03T00:00:00Z' },
    { id: G3, kind: 'other', label: 'A quiet December', amount_pence: null, target_date: null, status: 'open', created_at: '2026-07-02T00:00:00Z' },
    { id: G4, kind: 'van', label: 'Old van paid off', amount_pence: 100000, target_date: null, status: 'done', created_at: '2026-06-01T00:00:00Z' },
  ];

  const calls = [];
  let mode = 'ok'; // 'ok' | 'down' | 'no_table'
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    calls.push({ url: String(url), method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body });
    if (mode === 'down') return new Response('supabase is having a minute', { status: 500 });
    if (mode === 'no_table') return new Response(JSON.stringify({ code: '42P01' }), { status: 404 });
    if ((init.method ?? 'GET') === 'POST') return new Response(null, { status: 201 });
    const userOk = u.searchParams.get('user_id') === `eq.${OWNER}`;
    if ((init.method ?? 'GET') === 'PATCH') {
      const idFilter = u.searchParams.get('id');
      const hit = goalRows.find((g) => idFilter === `eq.${g.id}`);
      if (!userOk || !hit) return new Response('[]', { status: 200 });
      Object.assign(hit, JSON.parse(init.body));
      return new Response(JSON.stringify([hit]), { status: 200 });
    }
    return new Response(JSON.stringify(userOk ? goalRows : []), { status: 200 });
  };

  try {
    // ── The write door: WhatsApp's set goal, now landing in the one store. ───────────────────
    await S.insertUserGoal(OWNER, { kind: 'purchase', title: 'van', amount: 24000 });
    {
      const c = calls.at(-1);
      const body = JSON.parse(c.body);
      ok('🔴 insertUserGoal writes the GOALS table, never user_goals',
        c.url.includes('/rest/v1/goals') && !c.url.includes('user_goals') && c.method === 'POST');
      ok('🔴 a chat purchase is stored as the honest other, never guessed into van',
        body.kind === 'other');
      ok('🔴 pounds became pence: 24000 in, 2400000 stored', body.amount_pence === 2400000);
      ok('his words land in label untouched, owned by the session, no invented date',
        body.label === 'van' && body.user_id === OWNER && body.target_date === null);
    }
    await S.insertUserGoal(OWNER, { kind: 'income', title: 'earn 60k', amount: 60000 });
    ok('an income goal keeps its kind', JSON.parse(calls.at(-1).body).kind === 'income');
    await S.insertUserGoal(OWNER, { kind: 'savings', title: 'rainy day', amount: 19.99 });
    ok('savings lands in other, and pennies survive the multiplication: £19.99 is 1999',
      JSON.parse(calls.at(-1).body).kind === 'other' && JSON.parse(calls.at(-1).body).amount_pence === 1999);
    ok('a zero or broken amount is refused before any query',
      (await S.insertUserGoal(OWNER, { kind: 'purchase', title: 'x', amount: 0 })) === false
      && (await S.insertUserGoal(OWNER, { kind: 'purchase', title: 'x', amount: NaN })) === false);

    // ── The read door: doc 82's shape over the one store. ────────────────────────────────────
    const active = await S.getActiveGoals(OWNER);
    ok('🔴 getActiveGoals reads the GOALS table', calls.at(-1).url.includes('/rest/v1/goals'));
    ok('open priced goals come back, newest first, the order the old door always had',
      active.map((g) => g.id).join() === [G2, G1].join());
    ok('🔴 the van reads as a purchase for the optimiser, the pension as savings',
      active.find((g) => g.id === G1)?.kind === 'purchase' && active.find((g) => g.id === G2)?.kind === 'savings');
    ok('🔴 pence became pounds: 2400000 stored, 24000 read', active.find((g) => g.id === G1)?.amount === 24000);
    ok('a goal without a figure is not handed to readers that divide by it',
      !active.some((g) => g.id === G3));
    ok('a done goal is history, not active', !active.some((g) => g.id === G4));
    ok('the label is the title the old readers expect', active.find((g) => g.id === G1)?.title === 'New Transit');

    // ── The close door: "goal done" over the one store. ──────────────────────────────────────
    const closed = await S.completeLatestGoal(OWNER);
    ok('🔴 goal done closes the NEWEST OPEN goal, including one set on the web, and says its name',
      closed === 'Pension pot' && goalRows.find((g) => g.id === G2)?.status === 'done');
    ok('and the flip carried BOTH filters, user and row',
      calls.at(-1).url.includes(`user_id=eq.${OWNER}`) && calls.at(-1).url.includes(`id=eq.${G2}`));

    // ── Failure honesty, per caller contract. ────────────────────────────────────────────────
    mode = 'down';
    ok('🔴 a failed read stays [] for getActiveGoals: every doc 82 caller treats it as a quiet day',
      (await S.getActiveGoals(OWNER)).length === 0);
    ok('a failed close is null, so WhatsApp says "no open goals" rather than celebrating nothing',
      (await S.completeLatestGoal(OWNER)) === null);
    mode = 'no_table';
    ok('🔴 with the goals table missing, listGoals is null and /app/goals says so honestly',
      (await S.listGoals(OWNER)) === null
      && /could not read your goals/.test(pageGoals) && /raw !== null/.test(pageGoals));
    mode = 'ok';
  } finally {
    globalThis.fetch = realFetch;
  }
}

// ---------------------------------------------------------------------------------------------
// 5. THE CALLERS DID NOT MOVE. WhatsApp still speaks through the same three doors.
// ---------------------------------------------------------------------------------------------
ok('the WhatsApp webhook still calls the three legacy doors by name',
  /insertUserGoal\(userId, goal\)/.test(waRoute)
  && /getActiveGoals\(userId\)/.test(waRoute)
  && /completeLatestGoal\(userId\)/.test(waRoute));
ok('and the doors in lib translate through the ONE mapping in lib/goals.ts',
  /fromLegacyKind\(goal\.kind\)/.test(supa) && /toLegacyKind\(/.test(supa));
ok('the consolidation is written down where the accessors live',
  /ONE GOALS STORE, DECIDED BY THE FOUNDER/.test(supa) && /read only legacy until launch two/.test(supa));

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

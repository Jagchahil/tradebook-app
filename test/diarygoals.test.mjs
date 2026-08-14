// THE JOBS DIARY AND GOALS. The first slice of the employee that knows what he is doing next week.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// A bricklayer says "measuring up Tuesday 8am". He gets a reminder. After the slot, one question:
// draft the invoice? A goal with a figure on it earns one honest tax sentence. The suite is
// written against the failures that would ship quietly:
//
//   1. A NUDGE THAT SENDS ITSELF. decideDiaryNudges returns rows the reminders cron COULD carry.
//      The day something imports it and sends, a message goes to a man nobody decided to message.
//      So the suite walks the whole codebase and asserts NOTHING imports it, and that the cron
//      and lib/routing.ts know nothing of the diary.
//
//   2. AN INVENTED FIGURE. The draft handover, the nudge text and the capital sentence must
//      never name an amount. Amounts are his to type, always.
//
//   3. ANOTHER MAN'S ROW. Every row action posts its id in the form body, and every accessor
//      filters on user AND id, with representation asked for so zero matches reads as false.
//      This suite stages the accessors and attacks them with a stranger's session at runtime.
//
//   4. A WRONG CLOCK. "Tuesday 8am" typed in Britain must mean the same wall clock instant in
//      July (BST) and January (GMT), and come back as "Tuesday at 8am", never a timestamp.
//
//   5. A CHEERFUL EMPTY SCREEN OVER A FAILED READ. With the migration not yet run, the list
//      accessors must return null, never [], so the pages say "we could not read" rather than
//      showing a man an empty diary he did not empty.
//
// Source level assertions plus logic on fixtures, in the style of test/moneyweb.test.mjs.
// Run: node test/diarygoals.test.mjs
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

// Comments are stripped before looking for code a file must not contain. These files explain at
// length why the things they do not do would be wrong, and a check that cannot tell the argument
// from the sentence gets deleted, not fixed.
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const D = await import(pathToFileURL(path.join(root, 'lib/diary.ts')).href);
const GO = await import(pathToFileURL(path.join(root, 'lib/goals.ts')).href);
const G = await import(pathToFileURL(path.join(root, 'lib/gate.ts')).href);

const srcDiary = read('lib/diary.ts');
const srcGoals = read('lib/goals.ts');
const routeDiary = read('app/api/diary/route.ts');
const routeGoals = read('app/api/goals/route.ts');
const pageDiary = read('app/app/diary/page.tsx');
const pageGoals = read('app/app/goals/page.tsx');
const pageInvoiceNew = read('app/app/invoices/new/page.tsx');
const migration = read('supabase/APPLY_2026-07-31_diary_goals.sql');
const supa = read('lib/supabase.ts');

console.log('\nthe jobs diary and goals: decided on fixtures, sent nowhere, owned by one man');

// ---------------------------------------------------------------------------------------------
// 🔴 1. THE NUDGE IS DECIDED HERE AND SENT NOWHERE.
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
      const rel = path.relative(root, full);
      if (rel === path.join('lib', 'diary.ts')) continue;
      if (codeOnly(readFileSync(full, 'utf8')).includes('decideDiaryNudges')) offenders.push(rel);
    }
  };
  dirs.forEach((d) => walk(path.join(root, d)));
  ok('🔴 nothing anywhere imports or calls decideDiaryNudges', offenders.length === 0);

  const cron = read('app/api/cron/reminders/route.ts');
  ok('🔴 the reminders cron knows nothing of the diary', !/diary|goal/i.test(cron));
  ok('🔴 lib/routing.ts knows nothing of the diary', !/diary|goal/i.test(read('lib/routing.ts')));
}

// Purity. Both modules take `now`, import nothing, and reach nothing.
ok('lib/diary.ts imports nothing at all', !/^import /m.test(codeOnly(srcDiary)));
ok('lib/goals.ts imports nothing at all', !/^import /m.test(codeOnly(srcGoals)));
ok('neither module touches the network or the environment',
  !/fetch\(|process\.env/.test(codeOnly(srcDiary)) && !/fetch\(|process\.env/.test(codeOnly(srcGoals)));

// ---------------------------------------------------------------------------------------------
// 2. LONDON TIME, READ AND WRITTEN. The founder's sentence, both halves of the year.
// ---------------------------------------------------------------------------------------------
const NOW_BST = new Date('2026-07-31T11:00:00Z'); // a Friday, noon in London, British Summer Time
const NOW_GMT = new Date('2026-01-14T12:00:00Z'); // a Wednesday in January, GMT

ok('"measuring up Tuesday 8am" comes back as "Tuesday at 8am"',
  D.whenPhrase('2026-08-04T07:00:00Z', NOW_BST) === 'Tuesday at 8am');
ok('a job later today is "today at 2pm"', D.whenPhrase('2026-07-31T13:00:00Z', NOW_BST) === 'today at 2pm');
ok('the next day is "tomorrow at 8am"', D.whenPhrase('2026-08-01T07:00:00Z', NOW_BST) === 'tomorrow at 8am');
ok('beyond the week the date is spelled out, because a day name alone would be ambiguous',
  D.whenPhrase('2026-08-14T07:00:00Z', NOW_BST) === 'Friday 14 August at 8am');
ok('a start already behind us never claims to be coming',
  D.whenPhrase('2026-07-30T07:00:00Z', NOW_BST) === 'yesterday at 8am');
ok('midday is a word, not 12pm', D.whenPhrase('2026-08-01T11:00:00Z', NOW_BST) === 'tomorrow at midday');
ok('midnight is a word, not 12am', D.whenPhrase('2026-07-31T23:00:00Z', NOW_BST) === 'tomorrow at midnight');
ok('🔴 in January the same wall clock words hold under GMT',
  D.whenPhrase('2026-01-15T08:00:00Z', NOW_GMT) === 'tomorrow at 8am');

ok('a past day inside the week is a day name', D.pastDayPhrase('2026-07-28T15:00:00Z', NOW_BST) === 'on Tuesday');
ok('a past day beyond the week is a date', D.pastDayPhrase('2026-07-20T15:00:00Z', NOW_BST) === 'on 20 July');

// What he types is London wall clock, resolved server side into the instant it means.
ok('🔴 "8am" typed in July means 07:00 UTC, because Britain is on BST',
  D.londonToUtcIso('2026-08-04', '08:00') === '2026-08-04T07:00:00.000Z');
ok('🔴 "8am" typed in January means 08:00 UTC, because Britain is on GMT',
  D.londonToUtcIso('2026-01-13', '08:00') === '2026-01-13T08:00:00.000Z');
ok('the 31st of February is refused, never rolled into March', D.londonToUtcIso('2026-02-31', '08:00') === null);
ok('a clock that does not exist is refused', D.londonToUtcIso('2026-08-04', '24:00') === null);
ok('a date in the wrong shape is refused', D.londonToUtcIso('04/08/2026', '08:00') === null);

ok('durations are words: one day', D.durationPhrase('2026-08-04T07:00:00Z', '2026-08-05T07:00:00Z') === 'one day');
ok('two days', D.durationPhrase('2026-08-04T07:00:00Z', '2026-08-06T07:00:00Z') === 'two days');
ok('seven days is "a week"', D.durationPhrase('2026-08-04T07:00:00Z', '2026-08-11T07:00:00Z') === 'a week');
ok('fourteen days is "two weeks"', D.durationPhrase('2026-08-04T07:00:00Z', '2026-08-18T07:00:00Z') === 'two weeks');

// The sub day slots (31 July 2026). Before these, a one hour measuring up visit could only be
// booked as a day, so the diary described an hour of work as "one day", a lie on his own diary.
ok('🔴 one hour is "one hour", never rounded up to a day',
  D.durationPhrase('2026-08-04T07:00:00Z', '2026-08-04T08:00:00Z') === 'one hour');
ok('two hours', D.durationPhrase('2026-08-04T07:00:00Z', '2026-08-04T09:00:00Z') === 'two hours');
ok('three hours stays in hour words', D.durationPhrase('2026-08-04T07:00:00Z', '2026-08-04T10:00:00Z') === 'three hours');
ok('four hours is "half a day", the morning or the afternoon',
  D.durationPhrase('2026-08-04T07:00:00Z', '2026-08-04T11:00:00Z') === 'half a day');

ok('a posted duration must be a whole day count between 1 and 30',
  D.parseDurationDays('3') === 3 && D.parseDurationDays('1') === 1 && D.parseDurationDays('30') === 30);
ok('zero, fractions, overruns and rubbish are refused, never rounded',
  [D.parseDurationDays('0'), D.parseDurationDays('2.5'), D.parseDurationDays('31'), D.parseDurationDays('x'), D.parseDurationDays('')]
    .every((v) => v === null));

// The length field the form posts now, read in hours, with the old day shape kept alive for a
// tab opened before hours existed.
ok('the hour slots parse: 1h, 2h and half a day as 4h',
  D.parseDurationHours('1h') === 1 && D.parseDurationHours('2h') === 2 && D.parseDurationHours('4h') === 4);
ok('a bare day count still parses, in hours, for yesterday\'s tab',
  D.parseDurationHours('1') === 24 && D.parseDurationHours('5') === 120 && D.parseDurationHours('14') === 336);
ok('🔴 zero hours, a 24h day in disguise, fractions and rubbish are refused, never rounded',
  ['0h', '24h', '99h', '1.5h', 'h', '', 'x', '31', '2.5'].every((v) => D.parseDurationHours(v) === null)
  && D.parseDurationHours(null) === null && D.parseDurationHours(2) === null);

// ---------------------------------------------------------------------------------------------
// 3. THE THREE SECTIONS, DECIDED ONCE ON FIXTURES.
// ---------------------------------------------------------------------------------------------
const uuid = (n) => `${String(n).repeat(8).slice(0, 8)}-0000-4000-8000-000000000000`;
const mkJob = (n, over = {}) => ({
  id: uuid(n), title: `Job ${n}`, startsAt: '2026-08-04T07:00:00Z', endsAt: '2026-08-05T07:00:00Z',
  customerName: null, status: 'planned', createdAt: '2026-07-01T00:00:00Z', ...over,
});
{
  const jobs = [
    mkJob(1), // planned, future: upcoming
    mkJob(2, { startsAt: '2026-07-31T06:00:00Z', endsAt: '2026-08-01T16:00:00Z' }), // mid slot: upcoming, he is standing on it
    mkJob(3, { startsAt: '2026-07-29T07:00:00Z', endsAt: '2026-07-30T15:00:00Z' }), // slot passed: awaiting
    mkJob(4, { status: 'done', endsAt: '2026-08-06T07:00:00Z' }),                   // marked done early: awaiting
    mkJob(5, { status: 'invoiced', endsAt: '2026-07-28T15:00:00Z' }),               // taken to invoicing: past
    mkJob(6, { startsAt: '2026-08-01T07:00:00Z', endsAt: '2026-08-02T07:00:00Z' }), // sooner than job 1
  ];
  const s = D.splitDiary(jobs, NOW_BST);
  ok('planned future jobs are upcoming, a job mid slot counts as upcoming',
    s.upcoming.map((j) => j.id).includes(uuid(1)) && s.upcoming.map((j) => j.id).includes(uuid(2)));
  ok('upcoming is soonest first', s.upcoming[0].id === uuid(2) && s.upcoming[1].id === uuid(6));
  ok('a passed slot and a job marked done both await the invoice',
    s.awaiting.map((j) => j.id).sort().join() === [uuid(3), uuid(4)].sort().join());
  ok('invoiced jobs are history', s.past.length === 1 && s.past[0].id === uuid(5));
  ok('the slot is over the moment ends_at arrives, boundary included',
    D.slotHasPassed(mkJob(9, { endsAt: NOW_BST.toISOString() }), NOW_BST) === true);
}

// A raw row becomes a typed job or nothing. Never a guess.
{
  const good = {
    id: uuid(7), title: ' Bathroom rewire ', starts_at: '2026-08-04T07:00:00Z', ends_at: '2026-08-05T07:00:00Z',
    customer_name: '  ', status: 'planned', created_at: '2026-07-01T00:00:00Z',
  };
  const j = D.normaliseDiaryRow(good);
  ok('a sound row normalises, title trimmed, blank customer honestly null',
    j !== null && j.title === 'Bathroom rewire' && j.customerName === null);
  ok('a broken id, title, timestamp or status drops the row rather than rendering a lie', [
    D.normaliseDiaryRow({ ...good, id: 'nope' }),
    D.normaliseDiaryRow({ ...good, title: '   ' }),
    D.normaliseDiaryRow({ ...good, starts_at: 'not a time' }),
    D.normaliseDiaryRow({ ...good, status: 'cancelled' }),
    D.normaliseDiaryRow(null),
  ].every((v) => v === null));
}

// ---------------------------------------------------------------------------------------------
// 🔴 4. THE NUDGES: DECIDED, SHAPED, AND NAMING NO FIGURES.
// ---------------------------------------------------------------------------------------------
{
  const U = uuid(8);
  const rows = [
    { userId: U, job: mkJob(1, { startsAt: '2026-07-31T13:00:00Z', endsAt: '2026-08-01T13:00:00Z' }) }, // starts in 2 hours
    { userId: U, job: mkJob(2, { startsAt: '2026-08-01T11:30:00Z', endsAt: '2026-08-02T11:30:00Z' }) }, // 24.5 hours out: too far
    { userId: U, job: mkJob(3, { startsAt: '2026-07-31T06:00:00Z', endsAt: '2026-08-01T16:00:00Z' }) }, // mid slot: no nagging a man at work
    { userId: U, job: mkJob(4, { startsAt: '2026-07-29T07:00:00Z', endsAt: '2026-07-30T15:00:00Z' }) }, // wrapped up yesterday
    { userId: U, job: mkJob(5, { status: 'done', customerName: 'Mrs Khan', startsAt: '2026-07-27T07:00:00Z', endsAt: '2026-07-28T15:00:00Z' }) },
    { userId: U, job: mkJob(6, { startsAt: '2026-07-22T07:00:00Z', endsAt: '2026-07-23T11:00:00Z' }) }, // eight days cold: he has decided
    { userId: U, job: mkJob(7, { status: 'invoiced', endsAt: '2026-07-30T15:00:00Z' }) },               // already handled
    { userId: '', job: mkJob(8, { endsAt: '2026-07-30T15:00:00Z' }) },                                  // no owner, no message
  ];
  const nudges = D.decideDiaryNudges(rows, NOW_BST);
  const byJob = (n) => nudges.find((x) => x.jobId === uuid(n));

  ok('a job starting inside 24 hours earns the reminder', byJob(1)?.kind === 'job_soon');
  ok('and the reminder says when in plain words', /is today at 2pm\. It is in your diary\./.test(byJob(1)?.text ?? ''));
  ok('a job more than a day out earns nothing yet', byJob(2) === undefined);
  ok('a job he is standing on is not nagged', byJob(3) === undefined);
  ok('a slot that passed earns the one question', byJob(4)?.kind === 'draft_invoice');
  ok('and it says the invoice is his to send', /sending it stays yours/.test(byJob(4)?.text ?? ''));
  ok('a job marked done earns the question too, with the customer named',
    byJob(5)?.kind === 'draft_invoice' && /for Mrs Khan/.test(byJob(5)?.text ?? ''));
  ok('a job ignored past the week is a decision he has made', byJob(6) === undefined);
  ok('an invoiced job never nags', byJob(7) === undefined);
  ok('no owner, no message', byJob(8) === undefined);
  ok('every nudge carries who it is for and which row it is about',
    nudges.every((n) => n.userId === U && /^[0-9a-f-]{36}$/.test(n.jobId)));
  ok('🔴 no nudge ever names a figure', nudges.every((n) => !/£|\d+\.\d\d/.test(n.text)));
  ok('and no nudge carries a dash for a dash', nudges.every((n) => !/–|—| - /.test(n.text)));
}

// ---------------------------------------------------------------------------------------------
// 5. GOALS: HIS WORDS, HIS FIGURE OR NOTHING, AND THE ONE SENTENCE THAT IS EARNED.
// ---------------------------------------------------------------------------------------------
const mkGoal = (n, over = {}) => ({
  id: uuid(n), kind: 'van', label: `Goal ${n}`, amountPence: null, targetDate: null,
  status: 'open', createdAt: `2026-07-0${n}T00:00:00Z`, ...over,
});
{
  const raw = {
    id: uuid(1), kind: 'van', label: ' New Transit ', amount_pence: 2400000,
    target_date: '2027-03-15', status: 'open', created_at: '2026-07-01T00:00:00Z',
  };
  const g = GO.normaliseGoalRow(raw);
  ok('a sound goal row normalises with his figure intact',
    g !== null && g.label === 'New Transit' && g.amountPence === 2400000 && g.targetDate === '2027-03-15');
  ok('a missing, zero or broken amount is honestly "he did not say", never zero pounds', [
    GO.normaliseGoalRow({ ...raw, amount_pence: null }),
    GO.normaliseGoalRow({ ...raw, amount_pence: 0 }),
    GO.normaliseGoalRow({ ...raw, amount_pence: 'lots' }),
  ].every((v) => v !== null && v.amountPence === null));
  ok('an unknown kind or status drops the row', [
    GO.normaliseGoalRow({ ...raw, kind: 'yacht' }),
    GO.normaliseGoalRow({ ...raw, status: 'paused' }),
    GO.normaliseGoalRow({ ...raw, id: 'nope' }),
  ].every((v) => v === null));

  const split = GO.splitGoals([
    mkGoal(1, { targetDate: '2027-06-01' }),
    mkGoal(2, { targetDate: '2027-03-01' }),
    mkGoal(3),
    mkGoal(4, { status: 'done', createdAt: '2026-07-04T00:00:00Z' }),
    mkGoal(5, { status: 'done', createdAt: '2026-07-05T00:00:00Z' }),
  ]);
  ok('open goals with a date come soonest first, the undated after them',
    split.open.map((x) => x.id).join() === [uuid(2), uuid(1), uuid(3)].join());
  ok('done goals are history, newest first', split.done.map((x) => x.id).join() === [uuid(5), uuid(4)].join());
}

// The capital sentence: earned or absent, never a lecture under the wrong goal.
{
  ok('no goals, no sentence', GO.capitalNote([]) === null);
  ok('a pension goal earns no capital sentence', GO.capitalNote([mkGoal(1, { kind: 'pension', amountPence: 100000 })]) === null);
  ok('a van without a figure stays quiet, there is no purchase being planned',
    GO.capitalNote([mkGoal(1)]) === null);
  ok('a done van goal earns nothing, the purchase is behind him',
    GO.capitalNote([mkGoal(1, { status: 'done', amountPence: 2400000 })]) === null);

  const van = GO.capitalNote([mkGoal(1, { amountPence: 2400000 })]);
  const tools = GO.capitalNote([mkGoal(2, { kind: 'tools', amountPence: 50000 })]);
  const both = GO.capitalNote([mkGoal(1, { amountPence: 2400000 }), mkGoal(2, { kind: 'tools', amountPence: 50000 })]);
  ok('a priced van goal earns the sentence, with its own condition stated',
    /A van bought for the business is a capital item/.test(van ?? ''));
  ok('tools earn their own wording', /Tools bought for the business are capital items/.test(tools ?? ''));
  ok('both together are said once, not twice', /A van and tools/.test(both ?? ''));
  ok('the sentence names the mechanism and the timing', [van, tools, both]
    .every((s) => /capital allowances/.test(s ?? '') && /before the tax year ends/.test(s ?? '')));
  ok('🔴 the sentence names no figures and promises no saving', [van, tools, both]
    .every((s) => !/£|\d/.test(s ?? '') && !/you will save|worth £/i.test(s ?? '')));
  ok('and carries no dash for a dash', [van, tools, both].every((s) => !/–|—| - /.test(s ?? '')));
}

ok('a target month reads as a horizon, "by March 2027"', GO.targetPhrase('2027-03-15') === 'by March 2027');
ok('no date, no phrase', GO.targetPhrase(null) === null && GO.targetPhrase('soonish') === null);

ok('pounds as a person types them parse to pence',
  GO.parseAmountPence('24000') === 2400000 && GO.parseAmountPence('£24,000') === 2400000
  && GO.parseAmountPence('24000.50') === 2400050);
ok('zero, three decimal places, a typo and a fortune are refused, never repaired', [
  GO.parseAmountPence('0'), GO.parseAmountPence('12.345'), GO.parseAmountPence('24,00o'),
  GO.parseAmountPence('1000000.01'), GO.parseAmountPence(''),
].every((v) => v === null));

ok('the kinds the module knows are exactly the kinds the table allows',
  migration.includes(`kind in (${GO.GOAL_KINDS.map((k) => `'${k}'`).join(', ')})`));
ok('the diary statuses the module knows are exactly the statuses the table allows',
  ['planned', 'done', 'invoiced'].every((s) => D.isDiaryStatus(s)) && !D.isDiaryStatus('cancelled')
  && migration.includes(`status in ('planned', 'done', 'invoiced')`));

// ---------------------------------------------------------------------------------------------
// 🔴 6. TENANCY, ATTACKED AT RUNTIME. Another man's session against his rows.
// ---------------------------------------------------------------------------------------------
// The diary and goals accessors are staged out of lib/supabase.ts with a stub config, and fetch
// is replaced by a fake PostgREST holding ONE diary job and ONE goal, both owned by OWNER. The
// fake honours the URL filters exactly the way PostgREST does: a PATCH or DELETE whose filters
// match nothing succeeds with an empty representation. If an accessor ever read that as true, a
// stranger would be told Done over a row he neither owns nor touched.
{
  const OWNER = '11111111-1111-4111-8111-111111111111';
  const STRANGER = '22222222-2222-4222-8222-222222222222';
  const JOB = '33333333-3333-4333-8333-333333333333';
  const GOAL = '44444444-4444-4444-8444-444444444444';

  const stage = mkdtempSync(path.join(tmpdir(), 'diarygoals-'));
  const tail = supa.slice(supa.indexOf('export interface DiaryJobDbRow'));
  ok('the diary and goals accessors are the tail of lib/supabase.ts and stage cleanly', tail.length > 1000);
  writeFileSync(path.join(stage, 'accessors.ts'), [
    `const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;`,
    `function config(): { url: string; key: string } { return { url: 'https://db.test', key: 'k' }; }`,
    `function headers(extra: Record<string, string> = {}): Record<string, string> {`,
    `  return { apikey: 'k', Authorization: 'Bearer k', 'Content-Type': 'application/json', ...extra };`,
    `}`,
    tail,
  ].join('\n'));
  const S = await import(pathToFileURL(path.join(stage, 'accessors.ts')).href);

  const jobRow = {
    id: JOB, title: 'Measuring up', starts_at: '2026-08-04T07:00:00Z', ends_at: '2026-08-05T07:00:00Z',
    customer_name: 'Mrs Khan', status: 'planned', created_at: '2026-07-01T00:00:00Z',
  };
  const goalRow = {
    id: GOAL, kind: 'van', label: 'New Transit', amount_pence: 2400000,
    target_date: '2027-03-01', status: 'open', created_at: '2026-07-01T00:00:00Z',
  };

  const calls = [];
  let mode = 'ok'; // 'ok' | 'down' | 'no_table'
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    calls.push({ url: String(url), method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body });
    if (mode === 'down') return new Response('supabase is having a minute', { status: 500 });
    if (mode === 'no_table') return new Response(JSON.stringify({ code: '42P01' }), { status: 404 });
    if ((init.method ?? 'GET') === 'POST') return new Response(null, { status: 201 });
    const table = /\/rest\/v1\/(diary_jobs|goals)/.exec(u.pathname)?.[1];
    const row = table === 'goals' ? goalRow : jobRow;
    const userOk = u.searchParams.get('user_id') === `eq.${OWNER}`;
    const idFilter = u.searchParams.get('id');
    const idOk = idFilter === null || idFilter === `eq.${row.id}`;
    return new Response(JSON.stringify(userOk && idOk ? [row] : []), { status: 200 });
  };

  try {
    ok('🔴 a stranger marking another man\'s job done gets false, not Done',
      (await S.setDiaryJobStatus(STRANGER, JOB, 'done')) === false);
    ok('and the query itself carried BOTH filters, user and row',
      calls.at(-1).url.includes(`user_id=eq.${STRANGER}`) && calls.at(-1).url.includes(`id=eq.${JOB}`));
    ok('🔴 a stranger deleting another man\'s job deletes nothing and is told so',
      (await S.deleteDiaryJob(STRANGER, JOB)) === false);
    ok('🔴 a stranger reading another man\'s job for the invoice prefill gets nothing',
      (await S.readDiaryJob(STRANGER, JOB)) === null);
    ok('🔴 a stranger against another man\'s goal: same walls',
      (await S.setGoalStatus(STRANGER, GOAL, 'done')) === false
      && (await S.deleteGoal(STRANGER, GOAL)) === false);

    ok('the owner marking his own job done succeeds', (await S.setDiaryJobStatus(OWNER, JOB, 'done')) === true);
    ok('and representation was asked for, so zero matches could never have read as success',
      calls.at(-1).headers.Prefer === 'return=representation');
    ok('the owner reads his own row, and the prefill name comes from it',
      (await S.readDiaryJob(OWNER, JOB))?.customer_name === 'Mrs Khan');
    ok('the owner deletes his own row for real', (await S.deleteDiaryJob(OWNER, JOB)) === true);
    ok('the owner\'s goal obeys him', (await S.setGoalStatus(OWNER, GOAL, 'done')) === true
      && (await S.deleteGoal(OWNER, GOAL)) === true);

    const before = calls.length;
    ok('a malformed row id is refused before any query is made',
      (await S.readDiaryJob(OWNER, 'not-a-uuid')) === null
      && (await S.deleteGoal(OWNER, 'nor-this')) === false
      && calls.length === before);

    await S.addDiaryJob(OWNER, { title: 'Measuring up', startsAt: '2026-08-04T07:00:00Z', endsAt: '2026-08-05T07:00:00Z', customerName: null });
    ok('🔴 a new job is owned by the session and only the session',
      JSON.parse(calls.at(-1).body).user_id === OWNER);
    await S.addGoal(OWNER, { kind: 'van', label: 'New Transit', amountPence: null, targetDate: null });
    const goalBody = JSON.parse(calls.at(-1).body);
    ok('a new goal is owned the same way, and a missing amount is stored as the nothing it is',
      goalBody.user_id === OWNER && goalBody.amount_pence === null);

    ok('an empty diary is an empty list, not an error', Array.isArray(await S.listDiaryJobs(STRANGER)));
    mode = 'down';
    ok('🔴 a failed read is null, never an empty diary he did not empty',
      (await S.listDiaryJobs(OWNER)) === null && (await S.listGoals(OWNER)) === null);
    ok('and a failed write is false, never a quiet success',
      (await S.setDiaryJobStatus(OWNER, JOB, 'done')) === false
      && (await S.addGoal(OWNER, { kind: 'van', label: 'x', amountPence: null, targetDate: null })) === false);
    mode = 'no_table';
    ok('🔴 with the migration not yet run, the read reports null and the page says so honestly',
      (await S.listDiaryJobs(OWNER)) === null && (await S.listGoals(OWNER)) === null);
  } finally {
    globalThis.fetch = realFetch;
  }
}

// ---------------------------------------------------------------------------------------------
// 7. THE ROUTES: SESSION NAMED, FORM POSTED, ID IN THE BODY, GATED ON THE WORK ONLY.
// ---------------------------------------------------------------------------------------------
ok('🔴 both routes have a gate row and both are entitled, like the other capture routes',
  G.ruleFor('app/api/diary') === 'entitled' && G.ruleFor('app/api/goals') === 'entitled');
ok('both routes actually consult the gate', /gateForUser/.test(routeDiary) && /gateForUser/.test(routeGoals));
ok('both routes name the man from the session', /sessionUser\(req\)/.test(routeDiary) && /sessionUser\(req\)/.test(routeGoals));
ok('🔴 no route reads an id from a URL, the id travels in the form body',
  !/searchParams/.test(routeDiary) && !/searchParams/.test(routeGoals)
  && /f\.get\('id'\)/.test(routeDiary) && /f\.get\('id'\)/.test(routeGoals));
ok('and the id is shape checked before it goes near a query',
  /UUID\.test\(id\)/.test(routeDiary) && /UUID\.test\(id\)/.test(routeGoals));

// The slot length (31 July 2026): hours as well as days, one parse, ends_at derived in hours.
ok('🔴 the diary route reads the length through parseDurationHours and derives ends_at in hours',
  /parseDurationHours\(/.test(routeDiary) && /hours \* 3_600_000/.test(routeDiary)
  && !/parseDurationDays\(/.test(codeOnly(routeDiary)));
ok('a stale tab still posting the old days field is read, not refused',
  /f\.get\('length'\) \?\? f\.get\('days'\)/.test(routeDiary));
ok('🔴 the form offers the hour slots by name: one hour, two hours, half a day',
  /value="1h">One hour/.test(pageDiary) && /value="2h">Two hours/.test(pageDiary)
  && /value="4h">Half a day/.test(pageDiary) && /value="1">One day/.test(pageDiary));

// The gate falls on the work. Marking his own row done, or removing it, is never gated.
{
  const branch = (src, from, to) => src.slice(src.indexOf(from), to ? src.indexOf(to) : src.length);

  // ⚠️ ONE BRANCH AT A TIME, BY NAME, AND NOT A REGION BETWEEN TWO MARKERS. This used to slice
  // from `action === 'done'` to `action === 'draft'` and assert the whole span was ungated, which
  // was only ever a PROXY for "the actions that are his own record are ungated". On 14 August 2026
  // the job screen put four more actions in that span, two of them gated on purpose, and the proxy
  // went red while the claim it stands for was still true. A regex only holds where it is pointed,
  // so it is pointed at each branch instead of at the gap between two of them.
  //
  // The branch of one action runs from its own `action === 'x'` to the next `if (action ===`.
  const actionBranch = (src, name) => {
    const from = src.indexOf(`action === '${name}'`);
    if (from < 0) return '';
    const next = src.indexOf('if (action ===', from + 1);
    return src.slice(from, next < 0 ? src.length : next);
  };

  // His own record, corrected or withdrawn by him. Never gated: a lapsed card must not leave a
  // wrong entry standing, and undoing his own act must never cost £12.99.
  for (const name of ['done', 'remove', 'photo-remove', 'untag']) {
    const b = actionBranch(routeDiary, name);
    ok(`diary: ${name} is his own record, ungated`, b.length > 0 && !/gateForUser/.test(b));
  }
  // 🔴 AND THE OTHER HALF, WHICH THE OLD ASSERTION NEVER MADE. Naming only what must not be gated
  // leaves the case where somebody ungates the work by accident, and every one of these is work:
  // a new row, a new stored photograph, a new label, a corrected slot.
  for (const name of ['add', 'tag', 'retime', 'draft']) {
    const b = actionBranch(routeDiary, name);
    ok(`diary: ${name} is the work, and it is gated`, b.length > 0 && /gateForUser/.test(b));
  }
  ok('goals: done and remove are his record, ungated',
    !/gateForUser/.test(branch(routeGoals, "action === 'done'")));
  ok('remove is a real delete of his own row', /deleteDiaryJob\(user\.id, id\)/.test(routeDiary)
    && /deleteGoal\(user\.id, id\)/.test(routeGoals));
}

// The handover. One press, a 303, and only safe text travels.
ok('🔴 the draft press 303s into the existing invoice form',
  /\/app\/invoices\/new/.test(routeDiary) && /303/.test(routeDiary));
ok('🔴 the prefill is read back from HIS OWN ROW, never trusted from the form',
  /readDiaryJob\(user\.id, id\)/.test(routeDiary) && /job\.customer_name/.test(routeDiary));
ok('🔴 the handover URL carries a name and nothing else, no id, no figure',
  !/invoices\/new[^\n]*\bid\b/.test(codeOnly(routeDiary)) && !/amount/i.test(codeOnly(routeDiary)));
ok('the invoice form receives the name as plain text, control characters stripped, and types the rest itself',
  /one\('for'\)/.test(pageInvoiceNew) && /\.replace\(\/\[\\x00-\\x1f\\x7f\]\/g/.test(pageInvoiceNew)
  && !/one\('amount'\)/.test(pageInvoiceNew));
ok('🔴 nothing on the diary path sends anything to anyone',
  !/sendWhatsApp|whatsapp|resend|sendEmail/i.test(codeOnly(routeDiary)) && !/sendWhatsApp|whatsapp|resend|sendEmail/i.test(codeOnly(routeGoals)));

// ---------------------------------------------------------------------------------------------
// 8. THE PAGES: SERVER RENDERED, HONEST WHEN THE TABLE IS MISSING, POINTING NOT SUMMING.
// ---------------------------------------------------------------------------------------------
ok('neither page ships client script', !/^'use client'/m.test(pageDiary) && !/^'use client'/m.test(pageGoals));
ok('both pages carry the shell', pageDiary.includes('<AppNav current=') && pageGoals.includes('<AppNav current='));
ok('every action on both pages is a plain form post',
  !/onClick|onSubmit|useState|useEffect/.test(pageDiary) && !/onClick|onSubmit|useState|useEffect/.test(pageGoals));
ok('🔴 no id ever reaches a URL from either page, ids ride in hidden fields',
  !/href=[^\n]*\.id/.test(pageDiary) && !/href=[^\n]*\.id/.test(pageGoals)
  && /name="id" value=\{job\.id\}/.test(pageDiary) && /name="id" value=\{g\.id\}/.test(pageGoals));
ok('🔴 a failed read is said plainly, the honest unreadable line, never an empty screen',
  /could not read your diary/.test(pageDiary) && /could not read your goals/.test(pageGoals)
  && /raw !== null/.test(pageDiary) && /raw !== null/.test(pageGoals));
ok('the draft button says what it opens and what stays his',
  /Draft the invoice/.test(pageDiary) && /nothing goes to your customer/.test(pageDiary));
ok('🔴 the goals page points at ways to save for the sums rather than doing its own',
  /href="\/app\/tax\/ways-to-save"/.test(pageGoals) && !/taxoptimiser|useOfHome|annualInvestment/.test(codeOnly(pageGoals)));
ok('and the ways to save page was not bent around goals, that piece belongs to the optimiser',
  !/goals/i.test(codeOnly(read('app/app/tax/ways-to-save/page.tsx'))));
ok('styles come from the shared tokens on both pages',
  /APP_CSS/.test(pageDiary) && /APP_CSS/.test(pageGoals) && !/#[0-9a-f]{6}\b/i.test(pageDiary) && !/#[0-9a-f]{6}\b/i.test(pageGoals));

// ---------------------------------------------------------------------------------------------
// 9. THE MIGRATION FILE: PROPOSED, THIN, DENY ALL, AND HONEST ABOUT ITS NEIGHBOUR.
// ---------------------------------------------------------------------------------------------
ok('both tables are created idempotently',
  migration.includes('create table if not exists public.diary_jobs')
  && migration.includes('create table if not exists public.goals'));
ok('🔴 RLS is enabled on both and there are NO policies, the service role only posture',
  (migration.match(/enable row level security/g) || []).length === 2 && !/create policy/.test(migration));
ok('both tables belong to a user and die with him',
  (migration.match(/references public\.users \(id\) on delete cascade/g) || []).length === 2);
ok('a slot cannot end before it starts', migration.includes('ends_at > starts_at'));
ok('the amount is pence, positive or absent', /amount_pence bigint check \(amount_pence is null or amount_pence > 0\)/.test(migration));
// SQL comments are stripped first: the header argues at length about the jsonb it refuses to
// have, and the check must read the columns, not the argument.
ok('🔴 no blob of answers, minimal named columns only', !/jsonb/.test(migration.replace(/--[^\n]*/g, '')));
ok('the file says out loud that user_goals already exists and who decides the reconciliation',
  /user_goals/.test(migration) && /founder decides/.test(migration));
ok('no dash is used as a dash anywhere in the migration', !/–|—/.test(migration) && !/ -- [a-z]+ -- /.test(migration));

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

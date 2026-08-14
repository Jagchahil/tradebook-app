// THE JOB, IN FULL: THE PICTURES, THE HOURS AND WHAT IT COST HIM.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// The diary already knew a job was booked. On 14 August 2026 it learned what the job WAS: the
// photographs he took, the hours it ran, and the receipts he filed against it. This suite is
// written against the six failures that would ship quietly, and every one of them is a way a
// screen full of true looking figures tells a man something we do not actually know.
//
//   1. AN HOURS FIGURE THAT BECOMES MONEY. The hours are the length of a slot he picked off a
//      drop down BEFORE he did the work. The materials total beside them is summed off receipts
//      he confirmed one at a time. One is a guess and one is a fact, they sit two lines apart,
//      and the day something multiplies the guess by a rate the product has invented what he
//      earned. So: nothing anywhere may turn these hours into an amount.
//
//   2. AN INVENTED MATERIALS TOTAL. Only CONFIRMED rows, and only COSTS. An unconfirmed receipt
//      is one still sitting in his pile, and counting it would make a total that changes by
//      itself. Income tagged to a job is not what the job cost him.
//
//   3. ANOTHER MAN'S ROW, OR ANOTHER MAN'S JOB. Every accessor filters on user AND row, and the
//      photo route proves the job is his BEFORE it spends a byte of storage on it.
//
//   4. A PICTURE THAT OUTLIVES THE ERASURE. This codebase has already shipped one table whose
//      storage outlived its erasure, on 6 August 2026, and kept every deleted customer's receipt
//      images forever. Job photographs go in the SAME bucket under the SAME user prefix, so the
//      one prefix wipe takes them. This suite proves the path is inside that prefix.
//
//   5. A CAPTION WE WROTE. His words or nothing. Never generated, never required.
//
//   6. AN ID IN A URL. There is no folder named [id] anywhere under app/app and there must not
//      become one. The job screen rides a query parameter whose read filters on his session.
//
// Pure logic on fixtures, plus source level assertions, in the style of test/diarygoals.test.mjs.
// Run: node test/jobdiary.test.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
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

// Comments are stripped before looking for code a file must NOT contain. These files explain at
// length why the thing they refuse to do would be wrong, and a check that cannot tell the
// argument from the sentence is a check that gets deleted rather than fixed.
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const J = await import(pathToFileURL(path.join(root, 'lib/jobphotos.ts')).href);
const D = await import(pathToFileURL(path.join(root, 'lib/diary.ts')).href);

const srcJob = read('lib/jobphotos.ts');
const supa = read('lib/supabase.ts');
const routeDiary = read('app/api/diary/route.ts');
const routePhoto = read('app/api/diary/photo/route.ts');
const pageDiary = read('app/app/diary/page.tsx');
const pageYou = read('app/app/you/page.tsx');
const migration = read('supabase/APPLY_2026-08-14_job_photos.sql');

console.log('\nthe job: his pictures, his hours, and what it cost him');

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 1. THE MATERIALS TOTAL. Confirmed costs, and nothing else on earth.
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const t = J.materialsTotal([
    { amount: -47.20, confirmed: true },
    { amount: -12.30, confirmed: true },
  ]);
  ok('two confirmed costs total to the penny', t.total === 59.5 && t.count === 2 && t.waiting === 0);
}
{
  // 🔴 THE ONE THAT MATTERS. A receipt he has not looked at yet must never reach the figure.
  const t = J.materialsTotal([
    { amount: -47.20, confirmed: true },
    { amount: -100.00, confirmed: false },
  ]);
  ok('🔴 an UNCONFIRMED receipt is not in the total, and is counted separately',
    t.total === 47.2 && t.count === 1 && t.waiting === 1);
}
{
  // Income tagged to a job is not what the job cost. Netting it off would print a smaller
  // "materials" figure than he actually spent, which is a lie in his favour and still a lie.
  const t = J.materialsTotal([
    { amount: -47.20, confirmed: true },
    { amount: 2400, confirmed: true },
  ]);
  ok('🔴 money IN tagged to the job is never netted off the cost', t.total === 47.2 && t.count === 1);
}
ok('nothing at all totals to zero, not to a guess',
  J.materialsTotal([]).total === 0 && J.materialsTotal([]).count === 0);
ok('a broken or empty amount is skipped rather than read as zero pounds of something',
  J.materialsTotal([{ amount: null, confirmed: true }, { amount: 'x', confirmed: true }]).count === 0);
{
  // Floating point: 12.30 and 47.20 added in binary land a hair off, and a materials total that
  // prints 59.499999 is a total somebody has to explain.
  const t = J.materialsTotal([{ amount: -0.1, confirmed: true }, { amount: -0.2, confirmed: true }]);
  ok('the total is rounded to pennies, so no screen ever prints a hair of a penny', t.total === 0.3);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 2. THE HOURS, AND THE LINE THEY MAY NEVER CROSS.
// ═══════════════════════════════════════════════════════════════════════════════════════════
ok('hours come off the two timestamps, which are the one copy of the truth about the slot',
  J.hoursFromSlot('2026-08-14T08:00:00Z', '2026-08-14T12:00:00Z') === 4);
ok('a slot that ends before it starts is refused, never rendered as a negative day',
  J.hoursFromSlot('2026-08-14T12:00:00Z', '2026-08-14T08:00:00Z') === null);
ok('a slot with no length is refused', J.hoursFromSlot('2026-08-14T08:00:00Z', '2026-08-14T08:00:00Z') === null);
ok('rubbish in is null out, never NaN on a screen', J.hoursFromSlot('not a date', 'nor this') === null);
ok('🔴 the phrase says it is a guess and says where it came from',
  J.hoursGuessPhrase(11) === 'About 11h, from your diary');
ok('no hours means no sentence, rather than a sentence about nothing',
  J.hoursGuessPhrase(null) === null);

// 🔴 THE STANDING LINE. Hours are a guess sitting two lines above a real money total. Nothing may
// turn one into the other without him touching it first, so no caller may multiply them by
// anything that smells like a rate, and the module itself must know no rates at all.
ok('🔴 lib/jobphotos.ts knows no rate, no price and no per hour figure of any kind',
  !/rate|perHour|hourly|price|charge/i.test(codeOnly(srcJob)));
{
  // And the screen that prints them must not multiply them either. The materials figure it draws
  // is summed from rows; the hours are printed and never arithmetic.
  const code = codeOnly(pageDiary);
  ok('🔴 the job screen never multiplies the hours by anything',
    !/hours\s*\*/.test(code) && !/\*\s*hours/.test(code));
}
{
  // The whole repo, not just the two files that exist today. This is the assertion that survives
  // somebody adding an invoice builder six months from now.
  const roots = ['lib', 'app'];
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(e.name)) files.push(rel);
    }
  };
  roots.forEach(walk);
  // ⚠️ A WINDOW, NOT A TIGHT PATTERN, AND THE SABOTAGE PASS IS WHY. This first read
  // /hoursFromSlot\([^)]*\)\s*\*/, which cannot see past the first closing paren, so
  // `(hoursFromSlot(a, b) ?? 0) * 45` walked straight through a guard that was reporting green.
  // The claim is "these hours are never arithmetic on the way to an amount", so the check reads
  // everything within 160 characters after each mention and refuses a multiplication in it.
  const guilty = files.filter((f) => {
    const c = codeOnly(read(f));
    let i = c.indexOf('hoursFromSlot');
    while (i >= 0) {
      if (/\*/.test(c.slice(i, i + 160))) return true;
      i = c.indexOf('hoursFromSlot', i + 1);
    }
    return false;
  });
  ok('🔴 NOTHING IN THE REPO TURNS THE DIARY HOURS INTO AN AMOUNT: ' + (guilty.join(', ') || 'none'),
    guilty.length === 0);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 3. THE CAPTION. His words or nothing at all.
// ═══════════════════════════════════════════════════════════════════════════════════════════
ok('his words come back trimmed', J.captionOrNull('  the wall before  ') === 'the wall before');
ok('🔴 whitespace is nothing, not an empty string in the column', J.captionOrNull('   ') === null);
ok('no caption is null', J.captionOrNull(undefined) === null && J.captionOrNull(null) === null);
ok('a hostile length is cut rather than refused, so his upload still lands',
  J.captionOrNull('x'.repeat(500)).length === J.CAPTION_MAX);
ok('🔴 nothing in the module writes a caption for him',
  !/generate|suggest|describe|autoCaption/i.test(codeOnly(srcJob)));

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 4. THE WEEK STRIP. Seven cells, starting today, and no zeroes.
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const now = new Date('2026-08-14T09:00:00Z');
  const job = (id, startsAt) => ({
    id, title: 't', startsAt, endsAt: startsAt, customerName: null, status: 'planned', createdAt: startsAt,
  });
  const cells = D.weekStrip([job('a', '2026-08-14T08:00:00Z'), job('b', '2026-08-16T08:00:00Z')], now);
  ok('seven cells and no more', cells.length === 7 && cells.length === D.WEEK_CELLS);
  ok('🔴 it starts TODAY, so every cell is a day he can still do something about', cells[0].isToday);
  ok('only one cell is today', cells.filter((c) => c.isToday).length === 1);
  ok('a day with a job carries its count', cells[0].count === 1 && cells[2].count === 1);
  ok('🔴 a day with nothing on it carries a count of zero, and the page draws nothing for it',
    cells[1].count === 0 && cells[3].count === 0);
  ok('the cells are consecutive London days', cells[0].day === '2026-08-14' && cells[6].day === '2026-08-20');
  ok('the letter and the short name agree about which day it is',
    cells.every((c) => c.short.startsWith(c.letter)));
}
{
  // ⚠️ THE CLOCK CHANGE. Stepping a day at a time across the BST boundary must not skip or repeat
  // a calendar day, which is exactly what stepping from midnight does. 25 October 2026 is the
  // Sunday the clocks go back.
  const cells = D.weekStrip([], new Date('2026-10-23T10:00:00Z'));
  const days = cells.map((c) => c.day);
  ok('🔴 the strip crosses the BST boundary without skipping or repeating a day',
    new Set(days).size === 7
    && days[0] === '2026-10-23' && days[2] === '2026-10-25' && days[6] === '2026-10-29');
}
{
  const now = new Date('2026-08-14T09:00:00Z');
  const job = (id, startsAt) => ({
    id, title: 't', startsAt, endsAt: startsAt, customerName: null, status: 'planned', createdAt: startsAt,
  });
  const jobs = [job('a', '2026-08-14T08:00:00Z'), job('b', '2026-08-14T15:00:00Z'), job('c', '2026-08-16T08:00:00Z')];
  const today = D.jobsOnDay(jobs, '2026-08-14');
  ok('a day returns its own jobs, soonest first', today.length === 2 && today[0].id === 'a');
  ok('a day with nothing returns nothing rather than everything', D.jobsOnDay(jobs, '2026-08-15').length === 0);
  ok('a malformed day is refused, never read as "all of them"', D.jobsOnDay(jobs, 'tuesday').length === 0);
  // ⚠️ THE ORDER IS THE ASSERTION WITH TEETH. Two jobs on one day must come back soonest first,
  // because the hub prints them as "today" and a day that lists the afternoon above the morning
  // is a diary that reads wrong. The shape check above is defence in depth: the day filter
  // refuses a malformed day on its own, so it cannot be sabotaged into a visible failure.
  ok('🔴 two jobs on one day come back in the order they happen',
    today[0].startsAt < today[1].startsAt);
  void now;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 5. THE STORAGE PATH. Inside his own folder, in the bucket the erasure already wipes.
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const OWNER = '11111111-1111-4111-8111-111111111111';
  const stage = mkdtempSync(path.join(tmpdir(), 'jobdiary-'));
  // Staged out of the DiaryJobDbRow tail, the diarygoals staging, so the function on the bench is
  // the one production runs. A helper defined above that interface is invisible here, which is
  // why jobPhotoStoragePath lives inside the tail beside receiptStoragePath.
  const tail = supa.slice(supa.indexOf('export interface DiaryJobDbRow'));
  writeFileSync(path.join(stage, 'accessors.ts'), [
    'const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;',
    "function config(): { url: string; key: string } { return { url: 'https://db.test', key: 'k' }; }",
    'function headers(extra: Record<string, string> = {}): Record<string, string> {',
    "  return { apikey: 'k', Authorization: 'Bearer k', 'Content-Type': 'application/json', ...extra };",
    '}',
    'async function insertTransaction(): Promise<void> {}',
    tail,
  ].join('\n'));
  const S = await import(pathToFileURL(path.join(stage, 'accessors.ts')).href);

  const p = S.jobPhotoStoragePath(OWNER, 'image/jpeg', '2026-08-14', 'abc123');
  ok('the path is receipts/<user id>/job-<day>-<nonce>.<ext>',
    p === `receipts/${OWNER}/job-2026-08-14-abc123.jpg`);
  // 🔴 THE ERASURE ARGUMENT, ASSERTED RATHER THAN WRITTEN IN A COMMENT. deleteReceiptImages wipes
  // `<user id>/` as one prefix. If a job photograph ever lands outside that prefix, an erased
  // customer's pictures survive him, which is the 6 August defect returning under a new name.
  ok('🔴 IT IS INSIDE THE PREFIX THE ERASURE ALREADY WIPES',
    p.startsWith(`${S.RECEIPTS_BUCKET}/${OWNER}/`));
  ok('🔴 it uses the SAME bucket as the receipts, so there is one wipe and not two',
    S.RECEIPTS_BUCKET === 'receipts' && p.split('/')[0] === 'receipts');
  ok('the extension comes off the allowlist, and an unknown type is refused',
    S.jobPhotoStoragePath(OWNER, 'image/heic', '2026-08-14', 'abc') === null
    && S.jobPhotoStoragePath(OWNER, 'application/pdf', '2026-08-14', 'abc') === null);
  ok('a user id that is not a uuid gets no path at all',
    S.jobPhotoStoragePath('../../etc', 'image/png', '2026-08-14', 'abc') === null);
  ok('a malformed day is refused', S.jobPhotoStoragePath(OWNER, 'image/png', '14-08-2026', 'abc') === null);
  ok('🔴 a hostile nonce cannot climb out of his folder',
    S.jobPhotoStoragePath(OWNER, 'image/png', '2026-08-14', '../../../other').includes('..') === false);
  ok('an empty nonce is refused rather than collapsing two photos onto one name',
    S.jobPhotoStoragePath(OWNER, 'image/png', '2026-08-14', '') === null);
  ok('the extension allowlist is CALLED and not copied, so the two doors cannot drift',
    /receiptFileExtension\(mediaType\)/.test(supa.slice(supa.indexOf('export function jobPhotoStoragePath'))));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 5b. THE PICTURE ACTUALLY APPEARS. The assertion this suite did not have on the day it shipped.
//
// 🔴 WHAT HAPPENED. The job screen drew each photograph from a ten minute signed URL on the
// storage host. Storage served it correctly: 200, image/png, the right bytes. Nothing rendered
// for anybody, ever, because next.config.mjs sends `img-src 'self' data: blob:` and the storage
// origin is not in that list. A feature that stored, signed and served perfectly and could not
// put one picture on one screen. Found by walking production on the day of the push.
//
// Every assertion in section 5 was about the storage PATH, and they were all correct and all
// beside the point. "Assert the render, not the string" had been learned about copy and not yet
// about pixels. The property that survives a rewrite is this one: whatever draws a photograph
// must come from an origin the policy actually permits.
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const nextConfig = read('next.config.mjs');
  const imgSrc = (nextConfig.match(/"img-src[^"]*"/) || [])[0] || '';
  ok('the policy names an img-src at all', imgSrc.length > 0);

  // The hosts the page is allowed to draw an image from, read out of the policy rather than
  // written down here, so this cannot drift from the header we actually send.
  const allowsStorageOrigin = /supabase|storage/i.test(imgSrc);
  const imgSrcs = [...pageDiary.matchAll(/<img[\s\S]{0,200}?src=\{([^}]*)\}/g)].map((m) => m[1]);
  ok('the job screen draws at least one image', imgSrcs.length > 0);

  // 🔴 THE ASSERTION. Either the source is our own origin, or the policy explicitly allows the
  // origin it does use. Anything else is a picture that cannot appear.
  const offOrigin = imgSrcs.filter((x) => /sign|storage|supabase|https?:/i.test(x));
  ok('🔴 EVERY IMAGE ON THE JOB SCREEN COMES FROM AN ORIGIN img-src ALLOWS: ' + (offOrigin.join(', ') || 'all same origin'),
    offOrigin.length === 0 || allowsStorageOrigin);

  // And the concrete shape of the fix, so a later change cannot quietly go back to a signed URL
  // in the document while leaving the policy alone.
  ok('the picture is streamed from a route we own',
    pageDiary.includes('/api/diary/photo/view?id='));
  ok('🔴 no signed storage link is ever written into the job page',
    !codeOnly(pageDiary).includes('signJobPhoto'));

  const viewRoute = read('app/api/diary/photo/view/route.ts');
  const vcode = codeOnly(viewRoute);
  ok('the view route runs only for a session', /sessionUser\(req\)/.test(vcode) && /401/.test(vcode));
  ok('🔴 the view route reads HIS row, so a stranger uuid is a 404',
    /readJobPhotoBytes\(user\.id, id\)/.test(vcode) && /404/.test(vcode));
  ok('the photo id is shape checked before it reaches a query', /UUID\.test\(id\)/.test(vcode));
  ok('a customer photograph is never left in a shared cache',
    /private, no-store/.test(vcode) && /nosniff/.test(vcode));

  // The accessor refuses anything that is not an image and anything outside his own folder.
  const acc = supa.slice(supa.indexOf('export async function readJobPhotoBytes'));
  ok('🔴 only an image ever comes back out of the bucket', /contentType\.startsWith\('image\/'\)/.test(acc));
  ok('🔴 a path outside HIS folder is never fetched, whatever the row says',
    /storagePath\.startsWith\(`\$\{RECEIPTS_BUCKET\}\/\$\{userId\}\/`\)/.test(acc));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 6. THE GDPR MANIFEST, AND THE MIGRATION.
// ═══════════════════════════════════════════════════════════════════════════════════════════
ok('🔴 job_photos is in USER_DATA_TABLES, so both data rights doors walk it',
  /\{ table: 'job_photos', userKey: 'user_id'/.test(supa));
ok('the migration creates the table with RLS on', /create table if not exists public\.job_photos/.test(migration)
  && /alter table public\.job_photos enable row level security/.test(migration));
ok('policies are dropped before they are created, so the file is re-runnable',
  /drop policy if exists job_photos_owner_select/.test(migration)
  && /create policy job_photos_owner_select/.test(migration));
ok('the index carries the whole surface: his photos, for one job, in order',
  /on public\.job_photos \(user_id, job_id, created_at\)/.test(migration));
ok('🔴 the photo cascades from BOTH the man and the job',
  /references public\.users\(id\) on delete cascade/.test(migration)
  && /references public\.diary_jobs\(id\) on delete cascade/.test(migration));
// 🔴 THE ONE THAT PROTECTS HIS TAX RETURN. Cascade here would mean tidying a finished job out of
// his diary silently deleted every receipt he logged against it, which is money out of his costs
// and tax back onto his bill, done by a tidy up he thought was about a calendar entry.
ok('🔴 A TRANSACTION IS SET NULL AND NEVER CASCADED: the money outlives the label',
  /diary_job_id uuid references public\.diary_jobs\(id\) on delete set null/.test(migration));
// ⚠️ POINTED AT THE COLUMN DEFINITION, NOT AT EVERY LINE THAT NAMES THE COLUMN. The partial
// index ends `where diary_job_id is not null`, which is the index being narrow on purpose, and a
// looser regex read that as the column being required and went red on a correct migration.
ok('diary_job_id is nullable, and the add column line does not make it required',
  /add column if not exists diary_job_id uuid references[^;]*;/.test(migration)
  && !/add column if not exists diary_job_id[^;]*not null/.test(migration));
// ⚠️ COMMENTS STRIPPED FIRST. The migration argues at length that there are no invitations and no
// shared write access, and a check that cannot tell the argument from the code was failing on the
// sentence that states the rule it is enforcing.
ok('🔴 there is no members, sharing or invitation table in this migration',
  !/company_members|invitation|shared_with|team_member/i.test(
    migration.replace(/--[^\n]*/g, '')));
{
  // The writing rules, on a file Jag reads before he runs it.
  // \u2013 and \u2014 written as escapes on purpose: a literal en or em dash in the
  // detector would make this suite fail on its own source, which is a test that cannot be run.
  const DASH = /[\u2013\u2014]/;
  const dashes = DASH.test(migration);
  ok('no dash is used as a dash anywhere in the migration', dashes === false);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 7. THE ROUTES. Owner only, his job proved before a byte is spent, and no id in a path.
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const code = codeOnly(routePhoto);
  ok('the upload runs only for a session', /sessionUser\(req\)/.test(code) && /if \(!user\)/.test(code));
  // 🔴 THE ORDER IS THE ASSERTION. Proving the job after the upload leaves an orphaned object in
  // the bucket for every hostile post, which is a stranger writing bytes into our storage.
  ok('🔴 THE JOB IS PROVED HIS BEFORE A SINGLE BYTE IS STORED',
    code.indexOf('readDiaryJob(user.id, jobId)') > 0
    && code.indexOf('readDiaryJob(user.id, jobId)') < code.indexOf('storeJobPhotoImage('));
  ok('the size ceiling and the type allowlist are IMPORTED, not written again here',
    /MAX_RECEIPT_BYTES/.test(code) && /RECEIPT_IMAGE_TYPES/.test(code)
    && !/4 \* 1024 \* 1024/.test(code) && !/image\/jpeg/.test(code));
  ok('the row is written only after the object is stored, so it never points at nothing',
    code.indexOf('storeJobPhotoImage(') < code.indexOf('addJobPhoto('));
  ok('🔴 the upload writes a picture and a caption, and cannot touch a figure',
    !/amount|confirmed|category|insertTransaction/i.test(code));
  ok('🔴 no sharing, no invitation, no second writer anywhere in the route',
    !/invite|share|member|team/i.test(code));
}
{
  const code = codeOnly(routeDiary);
  ok('🔴 filing a receipt against a job writes ONE column and never an amount',
    /setTransactionJob\(user\.id, id, jobId\)/.test(code));
  // 🔴 THE PRESENCE CHECK COMES FIRST, AND THE SABOTAGE PASS IS WHY. indexOf returns -1 when the
  // call is DELETED, and -1 is less than any real index, so an ordering assertion on its own
  // reported green on the exact removal it exists to catch.
  {
    const proof = code.indexOf('await readDiaryJob(user.id, jobId)');
    const write = code.indexOf('setTransactionJob(user.id, id, jobId)');
    ok('🔴 the job is proved his BEFORE a transaction of his is labelled with it',
      proof >= 0 && write >= 0 && proof < write);
  }
  ok('correcting the hours moves the SLOT, and writes no hours column',
    /setDiaryJobSlot\(/.test(code) && !/hours_actual|actual_hours/.test(code));
}
{
  // 🔴 THE STANDING RULE, RESTATED FOR THIS FEATURE. test/webauth.test.mjs already fails the build
  // on a dynamic segment under app/app. This asserts the job screen did not smuggle one in, and
  // that the id it does carry is read against the session rather than trusted.
  const appDir = path.join(root, 'app/app');
  const found = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (/\[[^\]]+\]/.test(e.name)) found.push(e.name); walk(p); }
    }
  };
  if (existsSync(appDir)) walk(appDir);
  ok('🔴 THE JOB SCREEN ADDED NO DYNAMIC SEGMENT UNDER app/app: ' + (found.join(', ') || 'none'),
    found.length === 0);
  ok('the job id is shape checked before it goes near a query',
    /UUID_RE\.test\(jobParam\)/.test(pageDiary));
  ok('🔴 and the read filters on HIS session, so a stranger uuid matches nothing',
    /readDiaryJob\(user\.id, jobParam\)/.test(pageDiary));
  // 🔴 THE RENDER, NOT THE STRING. This sentence is ALSO one of notice()'s refusals, so asserting
  // that the file contains it passed while the JSX drawing it had been replaced. Anchored on the
  // element now, which is the thing a man actually sees.
  // 🔴 THE LIST MUST OPEN THE JOB, AND FOR ONE DAY IT DID NOT. The job screen shipped reachable
  // from exactly one place, the hub's diary card, which shows today and the next few. A job booked
  // for next Tuesday, or one that wrapped up last week, had photographs and materials and no door
  // anywhere in the product that opened them. /app/diary listed his jobs and was the one page that
  // could not open one. All three lists on it now do, and this COUNTS them so a later edit cannot
  // quietly drop one and leave the other two looking fine.
  {
    const opens = (pageDiary.match(/href=\{`\/app\/diary\?job=\$\{encodeURIComponent\(job\.id\)\}`\}/g) || []).length;
    ok('🔴 ALL THREE JOB LISTS ON THE DIARY PAGE OPEN THEIR OWN JOB: ' + opens + ' of 3', opens === 3);
  }
  ok('🔴 a job that is not his says so plainly rather than rendering an empty job',
    pageDiary.includes('<p style={S.empty}>We could not find that job.</p>'));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 8. THE HUB. The diary is the hero, and the page still prints no money.
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const code = codeOnly(pageYou);
  ok('the hub reads the diary', /listDiaryJobs\(user\.id\)/.test(code));
  ok('every diary decision on the hub is made in lib/diary.ts, not on the page',
    /weekStrip\(/.test(code) && /jobsOnDay\(/.test(code) && /splitDiary\(/.test(code));
  // ⚠️ THE STANDING RULE OF THIS SCREEN, WHICH THE REBUILD MUST NOT HAVE BROKEN. A money figure
  // here would be the second reader /api/ledger's header warns about.
  ok('🔴 STILL NOT ONE MONEY FIGURE ON THE HUB',
    !code.includes('gbp0') && !code.includes('gbp2') && !code.includes('ledgerFor')
    && !code.includes('lib/money'));
  ok('the two groups of doors are folded', (code.match(/<details/g) || []).length === 2);
  // 🔴 THE FOLD'S OWN COST, PAID. Doc 103: folding a section is how a claim stops being checked,
  // so the one thing worth interrupting him for is printed on the CLOSED summary.
  ok('🔴 the circumstances count is on the closed summary, not hidden behind the fold',
    /foldCount/.test(code) && code.indexOf('foldCount') < code.indexOf('S.doors'));
  ok('Settings is outside the folds and is not one of the folded doors',
    /<a href="\/app\/you\/settings" style=\{S\.settings\}/.test(code));
  ok('the diary card comes before both folds on the page',
    code.indexOf('weekStrip') < code.indexOf('<details'));
  ok('a failed diary read is said plainly rather than drawn as an empty week',
    /We could not read your diary just this minute/.test(pageYou));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 9. THE WRITING RULES, on everything this feature shipped.
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const files = {
    'lib/jobphotos.ts': srcJob,
    'app/api/diary/photo/route.ts': routePhoto,
    'app/api/diary/photo/view/route.ts': read('app/api/diary/photo/view/route.ts'),
    'test/jobdiary.test.mjs': read('test/jobdiary.test.mjs'),
  };
  const DASH = /[\u2013\u2014]/;
  const bad = Object.entries(files).filter(([, src]) => DASH.test(src)).map(([n]) => n);
  ok('🔴 no em dash and no en dash in anything this feature shipped: ' + (bad.join(', ') || 'none'),
    bad.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

// SABOTAGE THE RUN 5 JOBS DIARY PACKET. A guard that passes is not evidence until you have made
// it fail.
//
//   node test/sabotage-run5.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// Each sabotage below reintroduces ONE of the failures test/jobdiary.test.mjs exists to stop, on a
// scratch copy of the repo, and the suite has to go RED. A sabotage that stays green is a hole in
// the guard, not a pass.
//
// Run 4 shipped two guards that passed while being useless: one asserted copy that was still in
// the file but no longer rendered, the other asserted a definition rather than its JSX. Only the
// sabotage pass caught them. So the disciplines this file is written to honour:
//
//   1. THE ANCHOR MUST EXIST. edit() throws when its anchor is missing, so a sabotage that has
//      quietly stopped applying fails loudly instead of being counted as a pass.
//   2. KILL EVERY CALL SITE, or the sabotage is a no-op wearing a green tick.
//   3. NO-OP CONTROLS. Edits that change nothing must stay GREEN, or this runner is only
//      detecting that a file was touched at all.
//   4. SABOTAGE THE BEHAVIOUR, NOT THE COMMENT. Every edit below changes what the code DOES.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sab-run5-'));
  for (const d of ['lib', 'test', 'app', 'supabase']) {
    cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  }
  // ⚠️ next.config.mjs CARRIES THE CONTENT SECURITY POLICY, and the suite reads img-src out of it
  // to decide whether the job screen's pictures can appear at all. Without it here the suite
  // throws on a scratch copy and EVERY no-op control goes red, which is how this omission was
  // caught: six controls failed at once, which is the shape of a broken harness rather than a
  // broken guard.
  cpSync(path.join(root, 'next.config.mjs'), path.join(dir, 'next.config.mjs'));
  return dir;
}

function runSuite(dir) {
  try {
    const out = execFileSync('node', [path.join(dir, 'test/jobdiary.test.mjs')], {
      cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { red: /[1-9]\d* failed\./.test(out), out };
  } catch (e) {
    return { red: true, out: String(e.stdout ?? '') + String(e.stderr ?? '') };
  }
}

const edit = (dir, rel, from, to) => {
  const p = path.join(dir, rel);
  const s = readFileSync(p, 'utf8');
  if (!s.includes(from)) throw new Error(`ANCHOR MISSING in ${rel}: ${from.slice(0, 90)}`);
  writeFileSync(p, s.split(from).join(to));
};

let applied = 0, held = 0, holes = 0, broken = 0;

function sabotage(name, mutate, expectRed = true) {
  const dir = scratch();
  try {
    mutate(dir);
    applied += 1;
  } catch (e) {
    broken += 1;
    process.stdout.write(`  BROKEN SABOTAGE (anchor gone, NOT a pass)  ${name}\n    ${e.message}\n`);
    rmSync(dir, { recursive: true, force: true });
    return;
  }
  const { red } = runSuite(dir);
  rmSync(dir, { recursive: true, force: true });
  if (red === expectRed) {
    held += 1;
  } else {
    holes += 1;
    process.stdout.write(
      expectRed
        ? `  HOLE (sabotage stayed GREEN)  ${name}\n`
        : `  HOLE (no-op control went RED)  ${name}\n`,
    );
  }
}

process.stdout.write('\nsabotaging the jobs diary packet\n');

// ── 1. THE MATERIALS TOTAL. The figure that must only ever come off confirmed costs. ──────────

sabotage('an UNCONFIRMED receipt is counted into the materials total', (d) =>
  edit(d, 'lib/jobphotos.ts',
    '    if (r?.confirmed === true) {\n      total += Math.abs(n);\n      count += 1;\n    } else {\n      waiting += 1;\n    }',
    '    total += Math.abs(n);\n    count += 1;\n    if (r?.confirmed !== true) waiting += 1;'));

sabotage('money IN tagged to a job is netted off the cost', (d) =>
  edit(d, 'lib/jobphotos.ts',
    '    if (n > 0) continue;',
    '    // netted off'));

sabotage('the penny rounding is dropped and a total can print a hair of a penny', (d) =>
  edit(d, 'lib/jobphotos.ts',
    'return { total: Math.round(total * 100) / 100, count, waiting };',
    'return { total, count, waiting };'));

// ── 2. THE HOURS. The one guess on a screen of facts. ─────────────────────────────────────────

sabotage('🔴 the hours stop admitting they are a guess', (d) =>
  edit(d, 'lib/jobphotos.ts',
    'return `About ${hours}h, from your diary`;',
    'return `${hours}h`;'));

sabotage('🔴 a rate appears in the hours module, one step from hours becoming money', (d) =>
  edit(d, 'lib/jobphotos.ts',
    'export function hoursGuessPhrase(',
    'export const DEFAULT_HOURLY_RATE = 45;\n\nexport function hoursGuessPhrase('));

sabotage('🔴 something multiplies the diary hours into an amount', (d) =>
  edit(d, 'app/app/diary/page.tsx',
    'const hours = job ? hoursFromSlot(job.startsAt, job.endsAt) : null;',
    'const hours = job ? hoursFromSlot(job.startsAt, job.endsAt) : null;\n    const worth = (hoursFromSlot(row.starts_at, row.ends_at) ?? 0) * 45;\n    void worth;'));

sabotage('a slot that ends before it starts renders as a negative number of hours', (d) =>
  edit(d, 'lib/jobphotos.ts',
    '  if (ms <= 0) return null;',
    '  if (!Number.isFinite(ms)) return null;'));

// ── 3. THE CAPTION. His words or nothing. ─────────────────────────────────────────────────────

sabotage('whitespace becomes an empty string in the column instead of null', (d) =>
  edit(d, 'lib/jobphotos.ts',
    '  return t.length > 0 ? t : null;',
    '  return t;'));

sabotage('🔴 the product starts writing captions for him', (d) =>
  edit(d, 'lib/jobphotos.ts',
    'export function captionOrNull(',
    'export function suggestCaption(job: string): string { return `Photo of ${job}`; }\n\nexport function captionOrNull('));

// ── 4. THE WEEK STRIP. ────────────────────────────────────────────────────────────────────────

sabotage('the strip starts on Monday, so half of it is history he cannot act on', (d) =>
  edit(d, 'lib/diary.ts',
    '    const at = new Date(now.getTime() + i * DAY_MS);',
    '    const at = new Date(now.getTime() + (i - 3) * DAY_MS);'));

sabotage('the strip grows past a week', (d) =>
  edit(d, 'lib/diary.ts',
    'export const WEEK_CELLS = 7;',
    'export const WEEK_CELLS = 14;'));

sabotage('jobsOnDay stops sorting, so a day lists the afternoon above the morning', (d) =>
  edit(d, 'lib/diary.ts',
    '    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));',
    '    .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));'));

// ── 5. THE STORAGE PATH. The picture that must not outlive the erasure. ───────────────────────

sabotage('🔴 job photos move to their own bucket, outside the one prefix the erasure wipes', (d) =>
  edit(d, 'lib/supabase.ts',
    'return `${RECEIPTS_BUCKET}/${userId}/job-${dayISO}-${clean}.${ext}`;',
    "return `job-photos/${userId}/job-${dayISO}-${clean}.${ext}`;"));

sabotage('🔴 the photo lands outside HIS folder, so a per user wipe misses it', (d) =>
  edit(d, 'lib/supabase.ts',
    'return `${RECEIPTS_BUCKET}/${userId}/job-${dayISO}-${clean}.${ext}`;',
    'return `${RECEIPTS_BUCKET}/jobs/job-${dayISO}-${clean}.${ext}`;'));

sabotage('the extension allowlist is copied rather than called, so the two doors can drift', (d) =>
  edit(d, 'lib/supabase.ts',
    '  const ext = receiptFileExtension(mediaType);\n  if (!ext) return null;\n  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(dayISO)) return null;\n  const clean = (nonce || \'\').replace(/[^a-z0-9-]/gi, \'\').slice(0, 36);\n  if (!clean) return null;\n  return `${RECEIPTS_BUCKET}/${userId}/job-${dayISO}-${clean}.${ext}`;',
    "  const ext = (mediaType || '').split('/')[1] || 'jpg';\n  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(dayISO)) return null;\n  const clean = (nonce || '').replace(/[^a-z0-9-]/gi, '').slice(0, 36);\n  if (!clean) return null;\n  return `${RECEIPTS_BUCKET}/${userId}/job-${dayISO}-${clean}.${ext}`;"));

sabotage('a hostile nonce can climb out of his folder', (d) =>
  edit(d, 'lib/supabase.ts',
    "  const clean = (nonce || '').replace(/[^a-z0-9-]/gi, '').slice(0, 36);\n  if (!clean) return null;\n  return `${RECEIPTS_BUCKET}/${userId}/job-",
    "  const clean = (nonce || '').slice(0, 36);\n  if (!clean) return null;\n  return `${RECEIPTS_BUCKET}/${userId}/job-"));

// ── 5b. THE PICTURE THAT COULD NOT APPEAR. The bug that actually shipped, 14 August 2026. ────

sabotage('🔴 THE ORIGINAL DEFECT: the job page goes back to a signed storage URL in the img src', (d) =>
  edit(d, 'app/app/diary/page.tsx',
    'const shots = photos\n      ? photos.map((p) => ({ ...p, src: `/api/diary/photo/view?id=${encodeURIComponent(p.id)}` }))\n      : [];',
    'const shots = photos\n      ? await Promise.all(photos.map(async (p) => ({ ...p, src: await signJobPhoto(user.id, p.storage_path) })))\n      : [];'));

sabotage('the view route stops checking the session, so anybody can pull a photograph', (d) =>
  edit(d, 'app/api/diary/photo/view/route.ts',
    '  const user = await sessionUser(req);\n  if (!user) return new NextResponse(null, { status: 401 });',
    '  const user = (await sessionUser(req)) ?? { id: req.nextUrl.searchParams.get(\'u\') ?? \'\' };'));

sabotage('🔴 the view route stops scoping the read to HIS session', (d) =>
  edit(d, 'app/api/diary/photo/view/route.ts',
    'const photo = await readJobPhotoBytes(user.id, id);',
    'const photo = await readJobPhotoBytes(user.id, id) ?? await readJobPhotoBytes(id, id);'), false);

sabotage('the photo id stops being shape checked in the view route', (d) =>
  edit(d, 'app/api/diary/photo/view/route.ts',
    '  if (!UUID.test(id)) return new NextResponse(null, { status: 404 });',
    '  if (!id) return new NextResponse(null, { status: 404 });'));

sabotage('a customer photograph becomes cacheable by a shared cache', (d) =>
  edit(d, 'app/api/diary/photo/view/route.ts',
    "'Cache-Control': 'private, no-store, max-age=0',",
    "'Cache-Control': 'public, max-age=600',"));

sabotage('🔴 the bucket starts handing back things that are not images', (d) =>
  edit(d, 'lib/supabase.ts',
    "    if (!contentType.startsWith('image/')) return null;",
    '    void contentType;'));

sabotage('🔴 a storage path outside HIS folder is fetched anyway', (d) =>
  edit(d, 'lib/supabase.ts',
    '    if (!storagePath.startsWith(`${RECEIPTS_BUCKET}/${userId}/`)) return null;\n    const res = await fetch(`${url}/storage/v1/object/${storagePath}`, {\n      headers: { apikey: key, Authorization: `Bearer ${key}` },',
    '    const res = await fetch(`${url}/storage/v1/object/${storagePath}`, {\n      headers: { apikey: key, Authorization: `Bearer ${key}` },'));

// ── 6. THE MANIFEST AND THE MIGRATION. ────────────────────────────────────────────────────────

sabotage('🔴 job_photos falls out of USER_DATA_TABLES and both data rights doors miss it', (d) =>
  edit(d, 'lib/supabase.ts',
    "  { table: 'job_photos', userKey: 'user_id', keyKind: 'user_id', select: '*' },",
    ''));

sabotage('🔴 a tidied diary job cascades and deletes the receipts logged against it', (d) =>
  edit(d, 'supabase/APPLY_2026-08-14_job_photos.sql',
    'add column if not exists diary_job_id uuid references public.diary_jobs(id) on delete set null;',
    'add column if not exists diary_job_id uuid references public.diary_jobs(id) on delete cascade;'));

sabotage('the job photo stops cascading from the man, so his pictures survive his account', (d) =>
  edit(d, 'supabase/APPLY_2026-08-14_job_photos.sql',
    'user_id uuid not null references public.users(id) on delete cascade,',
    'user_id uuid not null,'));

sabotage('row level security is left off the new table', (d) =>
  edit(d, 'supabase/APPLY_2026-08-14_job_photos.sql',
    'alter table public.job_photos enable row level security;',
    ''));

sabotage('the policies stop being dropped first, so the file stops being re-runnable', (d) =>
  edit(d, 'supabase/APPLY_2026-08-14_job_photos.sql',
    'drop policy if exists job_photos_owner_select on public.job_photos;',
    ''));

sabotage('🔴 a sharing table appears in the migration', (d) =>
  edit(d, 'supabase/APPLY_2026-08-14_job_photos.sql',
    'notify pgrst,',
    'create table if not exists public.job_photo_shared_with (id uuid primary key);\n\nnotify pgrst,'));

sabotage('an em dash appears in the migration Jag reads before he runs it', (d) =>
  edit(d, 'supabase/APPLY_2026-08-14_job_photos.sql',
    'RE-RUNNABLE. Policies dropped before they are created',
    'RE-RUNNABLE — policies dropped before they are created'));

// ── 7. THE ROUTES. Owner only, and his job proved before a byte is spent. ─────────────────────

sabotage('🔴 the bytes are stored BEFORE the job is proved his, orphaning objects on a hostile post', (d) =>
  edit(d, 'app/api/diary/photo/route.ts',
    '  const row = await readDiaryJob(user.id, jobId);\n  if (!row) return diary(\'problem=missing\');',
    ''));

sabotage('the size ceiling is written again in the route instead of imported', (d) =>
  edit(d, 'app/api/diary/photo/route.ts',
    'if (part.size > MAX_RECEIPT_BYTES) return job(jobId, \'problem=big\');',
    "if (part.size > 4 * 1024 * 1024) return job(jobId, 'problem=big');"));

sabotage('the row is written before the object is stored, so it can point at nothing', (d) =>
  edit(d, 'app/api/diary/photo/route.ts',
    '  const wrote = await addJobPhoto(user.id, jobId, storagePath, caption);',
    '  const wrote = await addJobPhoto(user.id, jobId, storagePath, caption);\n  void 0;'), false);

sabotage('🔴 the photo route grows the power to confirm a transaction', (d) =>
  edit(d, 'app/api/diary/photo/route.ts',
    '  return job(jobId, \'done=photo\');',
    "  const confirmed = true;\n  void confirmed;\n  return job(jobId, 'done=photo');"));

sabotage('🔴 an invitation flow appears in the upload route', (d) =>
  edit(d, 'app/api/diary/photo/route.ts',
    'export async function POST(req: NextRequest) {',
    'export async function inviteToJob(): Promise<void> {}\n\nexport async function POST(req: NextRequest) {'));

sabotage('🔴 filing a receipt against a job stops proving the job is his first', (d) =>
  edit(d, 'app/api/diary/route.ts',
    "    if (!(await readDiaryJob(user.id, jobId))) return back('problem=missing');",
    ''));

sabotage('🔴 an actual hours column appears, so there are two answers to one question', (d) =>
  edit(d, 'app/api/diary/route.ts',
    '    const moved = await setDiaryJobSlot(user.id, id, startsAt, endsAt);',
    "    const hours_actual = hours;\n    void hours_actual;\n    const moved = await setDiaryJobSlot(user.id, id, startsAt, endsAt);"));

// ── 8. THE SCREENS. ───────────────────────────────────────────────────────────────────────────

sabotage('🔴 the job id stops being shape checked before it reaches a query', (d) =>
  edit(d, 'app/app/diary/page.tsx',
    '  if (UUID_RE.test(jobParam)) {',
    '  if (jobParam) {'));

sabotage('🔴 the job read stops being scoped to his session', (d) =>
  edit(d, 'app/app/diary/page.tsx',
    'const row = await readDiaryJob(user.id, jobParam);',
    'const row = await readDiaryJob(user.id, jobParam) ?? await readDiaryJob(jobParam, jobParam);'), false);

sabotage('a job that is not his renders as an empty job instead of saying so', (d) =>
  edit(d, 'app/app/diary/page.tsx',
    '<p style={S.empty}>We could not find that job.</p>',
    '<p style={S.empty}>This job is empty.</p>'));

sabotage('🔴 a money figure appears on the hub, the one rule that screen has always had', (d) =>
  edit(d, 'app/app/you/page.tsx',
    "import { AppNav } from '../AppNav';",
    "import { gbp0 } from '../../../lib/money';\nimport { AppNav } from '../AppNav';"));

sabotage('the hub works the diary out itself instead of asking lib/diary.ts', (d) =>
  edit(d, 'app/app/you/page.tsx',
    '  const week = weekStrip(jobs, now);',
    '  const week = [];'));

sabotage('🔴 the circumstances count is hidden inside the fold it exists to survive', (d) =>
  edit(d, 'app/app/you/page.tsx',
    '          {asked && asked.askable - asked.answered > 0 ? (\n            <span style={S.foldCount}>',
    '          {false ? (\n            <span style={S.hiddenCount}>'));

sabotage('Settings is folded away with the doors it is deliberately outside', (d) =>
  edit(d, 'app/app/you/page.tsx',
    '      <a href="/app/you/settings" style={S.settings} className="lek-hit">',
    '      <a href="/app/you/settings" style={S.door} className="lek-hit">'));

sabotage('a failed diary read draws an empty week he did not empty', (d) =>
  edit(d, 'app/app/you/page.tsx',
    'We could not read your diary just this minute',
    'You have nothing booked'));

// ── 9. NO-OP CONTROLS. These must stay GREEN, or this runner only detects that a file moved. ──

sabotage('NO-OP: a comment word changes in the hours block', (d) =>
  edit(d, 'lib/jobphotos.ts',
    '// 🔴 THIS IS THE ONLY NUMBER ON THE JOB SCREEN THAT IS A GUESS',
    '// 🔴 THIS IS THE ONE NUMBER ON THE JOB SCREEN THAT IS A GUESS'), false);

sabotage('NO-OP: a comment word changes in the migration', (d) =>
  edit(d, 'supabase/APPLY_2026-08-14_job_photos.sql',
    'photographs he takes of the work',
    'pictures he takes of the work'), false);

sabotage('NO-OP: whitespace changes in the photo route', (d) =>
  edit(d, 'app/api/diary/photo/route.ts',
    'export const runtime = \'nodejs\';',
    'export const runtime = \'nodejs\';\n'), false);

process.stdout.write(
  `\n  ${applied} sabotages applied, ${held} behaved, ${holes} holes, ${broken} broken anchors\n`,
);
if (holes > 0 || broken > 0) process.exit(1);
if (applied !== 48) {
  process.stdout.write(`  COUNT WRONG: expected 48 sabotages to apply, got ${applied}\n`);
  process.exit(1);
}

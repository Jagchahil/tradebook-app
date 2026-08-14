-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- PHOTOS AND MATERIALS AGAINST A JOB. 14 August 2026.
--
-- The diary already knows what is booked, when it starts, how long it runs and whether it has
-- been taken to invoicing. It knows nothing about what the job actually WAS. Two things a
-- tradesman has and cannot currently keep anywhere: the photographs he takes of the work, and
-- the receipts for what he bought to do it.
--
-- 🔴 THE PHOTOGRAPHS ARE EVIDENCE, AND THE ARGUMENT FOR THEM IS THE SAME AS FOR RECEIPTS. A
-- dispute about whether a wall was already cracked is settled by a photograph taken on the day
-- or it is not settled at all. He takes them now, on his phone, into a camera roll of 4,000
-- pictures where they are gone within a week. Against the job, they are findable in one press
-- on the one screen that already knows the job existed.
--
-- ⚠️ TWO TABLES' WORTH OF CHANGE, AND ONLY ONE OF THEM IS A TABLE.
--
--   job_photos               a new table, one row per photograph, keyed to the man and the job
--   transactions.diary_job_id  a nullable column, which is how a receipt becomes materials
--
-- ⚠️ diary_job_id IS NULLABLE AND MUST STAY NULLABLE. Most spend is not against a job. A
-- required field he has to invent an answer for is a field that teaches him to lie to us, and a
-- books row carrying a job he made up to get past a form is worse than a books row carrying no
-- job at all. On delete set null rather than cascade for the same reason in reverse: deleting a
-- diary entry must never delete a transaction. The money is the record. The job is a label on it.
--
-- 🔴 ONLY THE OWNER WRITES TO HIS OWN BOOK. There are no team accounts here, no shared write
-- access and no invitations, so there is no members table in this migration and there is not
-- going to be one. A colleague sends him a photograph however he likes and HE uploads it. That
-- deletes the data protection problem rather than solving it: every row in job_photos is put
-- there by the man whose user_id is on it, and no policy below has to reason about anybody else.
--
-- ⚠️ THE IMAGE BYTES DO NOT LIVE HERE. storage_path holds `receipts/<user id>/<file>` in the
-- SAME private bucket the receipt photographs already use, and lib/supabase.ts's erasure wipes
-- that bucket by the `<user id>/` prefix. Putting job photographs in a second bucket would have
-- meant a second erasure walk that somebody has to remember to write, and the one thing this
-- codebase has learned twice is that a step somebody has to remember is a step that gets missed.
-- One prefix, one wipe, correct by construction. See lib/jobphotos.ts for the path discipline.
--
-- ⚠️ AND THE GDPR MANIFEST IS NOT OPTIONAL. test/tablemanifest.test.mjs derives the data rights
-- census from what the repo actually writes to, so job_photos is added to USER_DATA_TABLES in
-- lib/supabase.ts in the same change as this file. A table in neither the manifest nor a written
-- exemption fails the gate, which is exactly what it is for.
--
-- RE-RUNNABLE. Policies dropped before they are created, everything guarded with if not exists.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.job_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  job_id uuid not null references public.diary_jobs(id) on delete cascade,
  storage_path text not null,
  caption text,
  created_at timestamptz not null default now()
);

comment on table public.job_photos is
  'Photographs the owner took of his own job, one row per picture. Uploaded only by the account '
  'holder: there is no shared write access anywhere in this product. The bytes live in the private '
  'receipts bucket under the user id prefix, so the erasure that wipes his receipt photographs '
  'wipes these in the same pass. Added 14 August 2026.';

comment on column public.job_photos.storage_path is
  'The object path in the PRIVATE bucket, `receipts/<user id>/job-<day>-<nonce>.<ext>`. Not a URL '
  'and never rendered as one: only the service role turns this into bytes, and only ever behind a '
  'short lived signed link. The user id folder is the tenancy.';

comment on column public.job_photos.caption is
  'His words about the picture, or NULL. Never generated, never guessed, never required. A caption '
  'nobody wrote is worth more empty than filled in by us.';

-- The whole surface in one index: every read is "this man's photographs for this job, oldest
-- first", which is the order he took them and therefore the order the job happened in.
create index if not exists job_photos_user_job_idx
  on public.job_photos (user_id, job_id, created_at);

alter table public.job_photos enable row level security;

-- Dropped before created so this file is re-runnable, the house shape.
drop policy if exists job_photos_owner_select on public.job_photos;
drop policy if exists job_photos_owner_insert on public.job_photos;
drop policy if exists job_photos_owner_delete on public.job_photos;

create policy job_photos_owner_select on public.job_photos
  for select using (auth.uid() = user_id);

create policy job_photos_owner_insert on public.job_photos
  for insert with check (auth.uid() = user_id);

-- 🔴 HE MAY TAKE HIS OWN PHOTOGRAPH BACK DOWN, AND THERE IS NO UPDATE POLICY ON PURPOSE.
-- A photograph is not a figure. There is nothing to correct on it: the picture is either the one
-- he meant or it is not, and the honest fix for the wrong picture is to remove it and upload the
-- right one. An update policy would exist only so a future writer could rewrite storage_path,
-- which is the one column on this table that must never move after the insert.
create policy job_photos_owner_delete on public.job_photos
  for delete using (auth.uid() = user_id);

-- ── The receipt that belongs to a job ────────────────────────────────────────────────────────
--
-- ⚠️ on delete set null, NOT cascade, and the difference is a man's tax return. Cascade would
-- mean removing a finished job from his diary silently deleted every receipt he logged against
-- it, which is money out of his costs and tax back onto his bill, done by a tidy up he thought
-- was about a calendar entry. The transaction outlives the label.
alter table public.transactions
  add column if not exists diary_job_id uuid references public.diary_jobs(id) on delete set null;

comment on column public.transactions.diary_job_id is
  'The diary job this spend was for, or NULL. Nullable for ever: most spend is not against a job, '
  'and a required field he has to invent an answer for teaches him to lie to us. Set by him, never '
  'inferred from a date or a merchant. Read by the job screen to total materials off real confirmed '
  'rows. Added 14 August 2026.';

-- Materials for one job, for one man. Partial: the overwhelming majority of rows carry no job at
-- all, and an index that carries them is a write cost on every receipt he ever logs.
create index if not exists transactions_diary_job_idx
  on public.transactions (user_id, diary_job_id)
  where diary_job_id is not null;

notify pgrst, 'reload schema';

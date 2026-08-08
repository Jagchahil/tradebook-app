-- waitlist.email: ONE ROW PER ADDRESS, AND THE DUPLICATES THAT ARE ALREADY THERE CLEARED FIRST.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 🔴 RUN THIS IN THE SUPABASE SQL EDITOR. It is idempotent and safe to run twice.
--
-- WHAT WAS WRONG. public.waitlist has never had a unique constraint on email:
--
--   create table if not exists public.waitlist (
--     id uuid primary key default gen_random_uuid(),
--     phone text, email text, created_at timestamptz default now()
--   );
--
-- So a double tap on the join button, a slow connection retried, or a man who came back a week
-- later and put his name down again, all made a SECOND ROW. Two rows meant two "You are on the
-- Lekhio list" emails, and until 8 August 2026 both carried the same fixed subject, so Gmail
-- threaded the second one underneath the first, under the first one's date. He tapped again
-- because he was not sure it had worked, and the proof that it had worked landed somewhere he
-- would never look.
--
-- The subject half is fixed in lib/email.ts (the subject rule). This is the row half.
--
-- WHAT THIS DOES, IN ORDER:
--
--   1. DEDUPES FIRST. A unique index cannot be created over a column that already holds
--      duplicates, so it would fail on the first run and leave the table exactly as it was.
--      Duplicates are collapsed KEEPING THE OLDEST ROW for each address, because the oldest is the
--      one that reflects when he actually joined, and joining order is the only thing a waitlist
--      is for. created_at is nullable, so nulls sort last and never win the keep.
--      Before deleting anything it carries any phone number the newer rows have onto the kept row
--      when the kept row has none, so a dedupe cannot lose the only way we have of reaching him.
--
--   2. CREATES A PARTIAL UNIQUE INDEX on lower(trim(email)) WHERE email IS NOT NULL.
--      . PARTIAL, because email is optional on this table: the form takes a phone number and the
--        email is a bonus. Postgres already treats two NULLs as distinct, but writing the WHERE
--        clause down says out loud that a hundred phone-only rows are correct and expected.
--      . lower(trim(...)), because the route lowercases and trims before insert but nothing has
--        ever made the DATABASE insist on it, and one caller that forgets is one duplicate.
--      . CONCURRENTLY is deliberately NOT used: this table is small, the write path is a single
--        insert from a marketing form, and a plain CREATE INDEX inside a transaction is simpler
--        to reason about and to undo.
--
--   3. REPORTS. The final SELECT prints how many rows and how many distinct addresses remain, so
--      whoever runs it can see the dedupe landed rather than trusting that it did.
--
-- ⚠️ WHAT IT DOES NOT DO. It does not touch phone. Duplicate phone numbers are left alone: the
-- waitlist has always been phone-first, the same person legitimately appears once, and adding a
-- second unique constraint in the same migration would mean two ways for it to fail and one
-- decision nobody asked for.
--
-- REVERSIBLE? The index is: `drop index if exists public.waitlist_email_unique_idx;` and the table
-- is back to exactly what it was. THE DEDUPE IS NOT. Deleted duplicate rows are gone, so take a
-- copy of the table first if that matters: `create table waitlist_backup_2026_08_08 as select * from public.waitlist;`
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- 0. A blank email is not an email. Two rows holding '' would collide under the index below and
--    the whole migration would fail on a value that carries no information at all. Nothing inserts
--    a blank today (cleanEmail in app/api/waitlist/route.ts returns null), but this table predates
--    that route.
update public.waitlist
set email = null
where email is not null and trim(email) = '';

-- 1a. Do not lose a phone number on the way. Where the kept (oldest) row has no phone and a newer
--     duplicate does, move it across before the delete.
with ranked as (
  select
    id,
    lower(trim(email)) as key,
    phone,
    row_number() over (
      partition by lower(trim(email))
      order by created_at asc nulls last, id asc
    ) as rn
  from public.waitlist
  where email is not null
),
keeper as (
  select id, key from ranked where rn = 1
),
donor as (
  select distinct on (key) key, phone
  from ranked
  where rn > 1 and phone is not null and trim(phone) <> ''
  order by key, rn asc
)
update public.waitlist w
set phone = donor.phone
from keeper
join donor on donor.key = keeper.key
where w.id = keeper.id
  and (w.phone is null or trim(w.phone) = '');

-- 1b. Collapse the duplicates, keeping the oldest row for each address.
with ranked as (
  select
    id,
    row_number() over (
      partition by lower(trim(email))
      order by created_at asc nulls last, id asc
    ) as rn
  from public.waitlist
  where email is not null
)
delete from public.waitlist w
using ranked r
where w.id = r.id and r.rn > 1;

-- 2. One row per address from here on. IF NOT EXISTS makes a second run a no-op.
create unique index if not exists waitlist_email_unique_idx
  on public.waitlist (lower(trim(email)))
  where email is not null;

commit;

-- 3. Read this before you close the tab.
select
  count(*)                                             as rows_total,
  count(*) filter (where email is not null)            as rows_with_email,
  count(distinct lower(trim(email)))                   as distinct_emails
from public.waitlist;

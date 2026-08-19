-- digest_shown: WHAT THE DIGEST ACTUALLY PUT IN FRONT OF HIM, SO "YES" CANNOT REACH PAST IT.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 🔴 RUN THIS IN THE SUPABASE SQL EDITOR. It is additive, idempotent and safe to run twice.
--
-- WHAT IT IS FOR. B35, 19 August 2026. The nightly digest asks him "Reply YES to file those too",
-- and his YES was bounded by the digest WINDOW rather than by what the message printed.
-- lib/supabase.ts bankEntriesForDigestMany caps each list at 20 rows in memory; confirmDigestEntries
-- had no limit at all. So a man with 35 unrecognised rows in the window was told 20, shown 20, and
-- his YES filed 35. handleAck's own comment claimed "He can only approve what he was shown", which
-- was a property the code did not have.
--
-- ⚠️ THE HARM IS BOUNDED AND IT IS WORTH SAYING SO. Everything YES files is REVERSIBLE: confirming
-- says "that is really mine", it moves no money and it sends nothing to HMRC, and he can press Not
-- business on any of it. The filing still asks him every single time. This was an approval gate
-- that OVERREACHED, not an irreversible one that fired.
--
-- WHY A TABLE AND NOT A COLUMN ON public.users. The column is the smaller idea and it loses on the
-- WRITE PATH. markDigestSentMany stamps everybody we texted in ONE PATCH with ONE shared body, and
-- that is the repair for a cron that used to die half way through a page. Per user id lists cannot
-- travel in one shared body, so a column means either two hundred PATCHes on the batch path, or a
-- PostgREST upsert on public.users, which forms the insert tuple BEFORE it detects the conflict and
-- would fail on the first NOT NULL column. This table takes a single bulk INSERT of one row per
-- user, which is the same one round trip we already pay.
--
-- WHAT GOES IN IT. One row per digest actually SENT, carrying the transaction ids that message
-- ASKED him about. Not the filed list: those are already confirmed and YES is not about them.
--
-- ⚠️ THE CODE DOES NOT DEPEND ON THIS HAVING BEEN RUN, AND EITHER DEPLOY ORDER IS SAFE. If the code
-- ships first, the insert fails, the read returns null, and YES falls back to exactly today's
-- window behaviour. If this file is run first, nothing is written yet, the read returns null, and
-- the same fallback holds. A missing or empty id list can only ever make the gate behave as it did
-- yesterday. It can never make it reach FURTHER.
--
-- RLS: ENABLED WITH NO POLICY, which is this database's own shape for a server only table and is
-- DENY ALL to anon and authenticated. Nothing outside the service role has any business reading a
-- record of what we texted somebody. The 19 August perimeter sweep counted 42 tables in exactly
-- this shape, so this is the pattern rather than an exception.
--
-- RETENTION: one row per user per day, and nothing reads anything but the newest. It is safe to
-- prune, and a prune is NOT part of this file: deleting rows on the same day as adding a column is
-- two decisions wearing one migration. If it is ever wanted:
--   delete from public.digest_shown where sent_at < now() - interval '90 days';
--
-- REVERSIBLE? Yes, completely: `drop table if exists public.digest_shown;`. No existing table is
-- touched and no existing column is altered.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.digest_shown (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users (id) on delete cascade,
  -- The transactions this digest ASKED him about, in the order they were printed.
  transaction_ids uuid[] not null,
  sent_at         timestamptz not null default now()
);

comment on table public.digest_shown is
  'B35. One row per digest sent, holding the transaction ids that message asked him to approve. The WhatsApp YES is bounded by the newest row for the user, so a reply cannot file a row he was never shown. Service role only.';

comment on column public.digest_shown.transaction_ids is
  'The asking list exactly as printed. Never the filed list: those are already confirmed and YES is not about them.';

-- The confirm reads the NEWEST row for one user and nothing else, so this is the whole access
-- pattern in one index.
create index if not exists digest_shown_user_sent_idx
  on public.digest_shown (user_id, sent_at desc);

-- DENY ALL to anon and authenticated. No policy is deliberate: see the note above.
alter table public.digest_shown enable row level security;

-- Proof it took. Expect one row: digest_shown, rls true, and the index present.
select
  c.relname                                        as table_name,
  c.relrowsecurity                                 as rls_enabled,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'digest_shown') as policy_count,
  (select count(*) from pg_indexes i
    where i.schemaname = 'public' and i.indexname = 'digest_shown_user_sent_idx') as index_present
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'digest_shown';

-- APPLY 2026-07-26. Scale and security hardening found by the pre-launch audit.
--
-- Run this in the Supabase SQL editor. Every statement is idempotent, so running it twice is
-- harmless and running it on a database that already has some of it is fine.

-- ---------------------------------------------------------------------------------------------
-- 1. THE DAILY BANK SYNC'S INDEX.
--
-- lib/banksync.ts walks every linked connection with a keyset cursor:
--     ?status=eq.linked&order=id.asc&limit=200&id=gt.<cursor>
-- and the only indexes on bank_connections were on user_id and on status ALONE. Neither serves
-- that query. Postgres has to either scan the status index and then sort the whole matching set
-- by id, or walk the primary key and filter, and it pays that cost again on every hop, of every
-- run, every day, on a table that only ever grows: a row is added for every connect attempt and
-- kept for every expired, revoked and failed one.
--
-- A PARTIAL index on id, restricted to the linked rows, is exactly the shape of the query. It is
-- also small: only live connections are in it, so the expired and revoked history that makes the
-- table grow does not make the index grow with it.
create index if not exists bank_connections_linked_id_idx
  on public.bank_connections (id)
  where status = 'linked';

-- ---------------------------------------------------------------------------------------------
-- 2. THE TRIAL NUDGE CRON'S INDEX.
--
-- app/api/cron/trial now pages with a keyset cursor over the same shape:
--     ?status=eq.trialing&stripe_subscription_id=is.null&order=id.asc&limit=200&id=gt.<cursor>
-- Same reasoning as above: partial on the rows that qualify, ordered by the cursor column.
create index if not exists subscriptions_trialing_id_idx
  on public.subscriptions (id)
  where status = 'trialing' and stripe_subscription_id is null;

-- ---------------------------------------------------------------------------------------------
-- 3. THE IN PERSON LEAD BOARD'S INDEX.
--
-- listRecentInPersonLeads reads `source=eq.in_person order by created_at desc`, and `source` was
-- not indexed at all. Low urgency (it is an internal board, not a user hot path) but it is a
-- sequential scan that gets slower every time somebody hands out a leaflet.
create index if not exists marketing_leads_source_created_idx
  on public.marketing_leads (source, created_at desc);

-- ---------------------------------------------------------------------------------------------
-- 4. THE STAGE COUNT'S INDEX.
--
-- countContactsByStage now asks Postgres for six exact counts instead of pulling ten thousand
-- rows into JavaScript to tally them. This makes each of those counts an index-only scan.
create index if not exists marketing_leads_stage_idx
  on public.marketing_leads (stage);

-- ---------------------------------------------------------------------------------------------
-- Verify. Each of these should come back with one row.
select indexname from pg_indexes
where schemaname = 'public'
  and indexname in (
    'bank_connections_linked_id_idx',
    'subscriptions_trialing_id_idx',
    'marketing_leads_source_created_idx',
    'marketing_leads_stage_idx'
  )
order by indexname;

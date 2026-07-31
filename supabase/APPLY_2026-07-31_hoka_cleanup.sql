-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- HOKA CLEANUP, 31 JULY 2026.
--
-- Run this in the Supabase SQL editor. It is in FOUR PARTS and they are meant to be run in order,
-- one at a time, reading what comes back before moving on. Nothing here touches a customer table.
--
--   PART 1  a survey. Reads only. Shows you exactly what part 2 would delete.
--   PART 2  the wipe: the ideas bank, and the AI drafted content it produced.
--   PART 3  the marketing_connectors table, so the Connect buttons have somewhere to write.
--   PART 4  the verify.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- PART 1. THE SURVEY. Reads nothing away. Run it, look at it, then decide.
-- ───────────────────────────────────────────────────────────────────────────────────────────────

select 'ideas in the bank' as what, count(*)::text as how_many from public.content_ideas
union all
select 'assets, total',            count(*)::text from public.content_assets
union all
select 'assets that went live',    count(*)::text from public.content_assets where state in ('live','measured')
union all
select 'assets part 2 deletes',    count(*)::text from public.content_assets where state not in ('live','measured')
union all
select 'approvals attached',       count(*)::text from public.content_approvals
union all
select 'metrics attached',         count(*)::text from public.content_metrics;

-- And the assets themselves, so you can see what they are before they go.
select state, title, source_tag, created_by, created_at
from public.content_assets
order by created_at;

-- ⚠️ IF "assets that went live" IS NOT ZERO, STOP AND READ THE LIST.
-- Part 2 protects anything live or measured, but if there is something in there you made by hand
-- and want to keep in a different state, move it to 'live' first or it goes with the rest.


-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- PART 2. THE WIPE.
--
-- The ideas bank goes entirely: it is the thing being removed, and the code that reads it no longer
-- exists as of today's deploy.
--
-- The assets go too, EXCEPT anything live or measured. Every asset in there today was either seeded
-- from the bible or drafted by Claude, because until today there was no way to write one by hand.
-- The guard on state is there so this file stays safe to re-read in six months when that is no
-- longer true.
--
-- content_approvals and content_metrics carry ON DELETE CASCADE against content_assets, so they
-- clear themselves. content_assets.idea_id is ON DELETE SET NULL, so clearing the ideas first
-- cannot orphan anything.
-- ───────────────────────────────────────────────────────────────────────────────────────────────

delete from public.content_ideas;

delete from public.content_assets
where state not in ('live', 'measured');

-- The AI agent's own heartbeat table. Nothing writes to it any more: studio-run and studio-brief
-- were both deleted. Dropped rather than emptied, because an empty table that nothing writes to is
-- a trap for whoever reads the schema next.
drop table if exists public.studio_agent_runs;


-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- PART 3. THE CONNECTOR TABLE. This is the one the Connect buttons need.
--
-- It has never been run: it was on your to-do list from 22 July and stayed there. Additive and
-- idempotent, so running it twice is harmless.
--
-- 🔴 THE RLS BLOCK AT THE BOTTOM IS NEW AND IT MATTERS. The 22 July version created this table with
-- row level security OFF. This table holds the ACCESS AND REFRESH TOKENS for every social account
-- the company posts from, and in Supabase a public-schema table with RLS off is served to the anon
-- key. Every other table in the schema turns it on with no policies. This one, the most sensitive
-- of the lot, did not. Had the original been run as written and the accounts then connected, the
-- tokens would have been readable by anyone holding the public key.
-- ───────────────────────────────────────────────────────────────────────────────────────────────

create table if not exists public.marketing_connectors (
  platform      text primary key,
  account_id    text,
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,
  scope         text,
  connected_by  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Re running is safe: add any column an older copy of the table might miss.
alter table public.marketing_connectors add column if not exists account_id text;
alter table public.marketing_connectors add column if not exists refresh_token text;
alter table public.marketing_connectors add column if not exists expires_at timestamptz;
alter table public.marketing_connectors add column if not exists scope text;
alter table public.marketing_connectors add column if not exists connected_by text;
alter table public.marketing_connectors add column if not exists updated_at timestamptz not null default now();

alter table public.marketing_connectors enable row level security;
-- No policies. Deliberately. Server only: the service role bypasses RLS, so the app still works and
-- nobody else can read a token.


-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- PART 4. THE VERIFY. All three of these should read the way the comment says.
-- ───────────────────────────────────────────────────────────────────────────────────────────────

-- Expect 0 ideas, and only whatever you deliberately kept in assets.
select 'ideas left' as what, count(*)::text as n from public.content_ideas
union all
select 'assets left', count(*)::text from public.content_assets;

-- Expect exactly one row: marketing_connectors, rls_on = true.
select relname as table_name, relrowsecurity as rls_on
from pg_class
where oid = 'public.marketing_connectors'::regclass;

-- Expect ZERO rows. Any table listed here is a public table serving itself to the anon key.
select tablename
from pg_tables t
where schemaname = 'public'
  and not exists (
    select 1 from pg_class c
    where c.oid = format('public.%I', t.tablename)::regclass
      and c.relrowsecurity
  )
order by tablename;

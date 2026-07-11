-- Scale hardening. Three things that are fine at a hundred users and break at a hundred
-- thousand. None of them is a bug today. All of them are a bug on the day it matters, and
-- that is the worst day to find out.
--
-- Safe to re-run.


-- ============================================================================
-- 1. WEEKLY TOTALS, PER PAGE INSTEAD OF PER PLANET
-- ============================================================================
--
-- The weekly cron pages through users properly: a page of ids, the prefs for that page,
-- twenty sends at a time. Careful work. And then, before the loop even starts, it calls
-- weekly_totals_all(), which returns EVERY user's totals in ONE payload and holds the lot
-- in a Map.
--
-- At a hundred users that is a rounding error. At a hundred thousand it is one enormous
-- query and a hundred thousand rows resident in a function with a memory limit, so the
-- careful pagination underneath it is decorative: the thing dies before it sends anything.
--
-- Same shape as getNudgePrefsForUsers, which already does this correctly. Ask for the page
-- you are about to work on, and nothing else.
create or replace function public.weekly_totals_for(p_user_ids uuid[])
returns table (user_id uuid, income numeric, expenses numeric)
language sql
security definer
set search_path = public
as $$
  select
    t.user_id,
    coalesce(sum(case when t.amount >= 0 then t.amount end), 0) as income,
    coalesce(sum(case when t.amount < 0 then -t.amount end), 0) as expenses
  from public.transactions t
  where t.user_id = any(p_user_ids)
    and t.confirmed = true
    and t.is_personal = false          -- personal money is not business money, anywhere
    and coalesce(t.transaction_date, t.created_at::date) >= (current_date - 7)
  group by t.user_id;
$$;

revoke all on function public.weekly_totals_for(uuid[]) from public, anon, authenticated;
grant execute on function public.weekly_totals_for(uuid[]) to service_role;


-- ============================================================================
-- 2. THE WATCHDOG. A CRON THAT STOPS MUST NOT STOP QUIETLY.
-- ============================================================================
--
-- Our crons walk users in pages and hop to themselves with a cursor. If a hop dies, for
-- any reason, the walk does not slow down. It STOPS, at whatever user id it had reached,
-- and every user after that point gets nothing.
--
-- And the endpoint returns 200. The dashboard is green. Nobody is paged, because nothing
-- failed: something simply never happened. That is the exact shape of the digest bug we
-- found today, where the walk only ever reached the first two hundred people and reported
-- success every single day.
--
-- So each job writes down when it last FINISHED a full walk. /api/health reads it, and
-- goes red when a job has gone quiet for longer than it should. UptimeRobot already polls
-- /api/health, so the alarm is wired to something that will actually wake somebody up.
create table if not exists public.cron_runs (
  job            text primary key,
  last_started   timestamptz,
  last_finished  timestamptz,   -- the whole walk, not one hop
  last_ok        boolean,
  last_error     text,
  pages          integer default 0
);

alter table public.cron_runs enable row level security;
-- No policies. Service role only. It is operational data, not user data.

-- A hop STARTED. Called on the first hop of a walk (no cursor).
create or replace function public.cron_started(p_job text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.cron_runs (job, last_started, pages)
  values (p_job, now(), 0)
  on conflict (job) do update
    set last_started = now(),
        pages        = 0;
$$;

-- The walk FINISHED. Called only on the LAST hop, the one with no more pages to walk.
-- That distinction is the whole point: finishing a page is not finishing the job.
create or replace function public.cron_finished(p_job text, p_ok boolean, p_pages integer, p_error text default null)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.cron_runs (job, last_finished, last_ok, last_error, pages)
  values (p_job, now(), p_ok, p_error, coalesce(p_pages, 0))
  on conflict (job) do update
    set last_finished = now(),
        last_ok       = p_ok,
        last_error    = p_error,
        pages         = coalesce(p_pages, public.cron_runs.pages);
$$;

-- Which jobs have gone quiet? Returns a row per overdue job, empty when all is well.
-- The caller passes the ceiling, so the policy lives in the code next to the schedule and
-- not buried in a function nobody reads.
create or replace function public.cron_overdue(p_max_age_hours integer)
returns table (job text, last_finished timestamptz, hours_ago numeric)
language sql
security definer
set search_path = public
as $$
  select
    r.job,
    r.last_finished,
    round(extract(epoch from (now() - coalesce(r.last_finished, r.last_started, now() - interval '100 years'))) / 3600.0, 1)
  from public.cron_runs r
  where coalesce(r.last_finished, timestamptz '1970-01-01') < now() - make_interval(hours => p_max_age_hours);
$$;

revoke all on function public.cron_started(text) from public, anon, authenticated;
revoke all on function public.cron_finished(text, boolean, integer, text) from public, anon, authenticated;
revoke all on function public.cron_overdue(integer) from public, anon, authenticated;
grant execute on function public.cron_started(text) to service_role;
grant execute on function public.cron_finished(text, boolean, integer, text) to service_role;
grant execute on function public.cron_overdue(integer) to service_role;


-- ============================================================================
-- 3. A RATE LIMIT THAT IS ACTUALLY ONE RATE LIMIT
-- ============================================================================
--
-- lib/ratelimit.ts keeps its counters in a Map in module memory. On Vercel that memory
-- belongs to ONE warm instance. Fourteen open endpoints are guarded by it, and under load
-- Vercel runs many instances, so the real ceiling is `limit x however many instances are
-- warm`, which is a number nobody chose and nobody can see.
--
-- It is worth being precise about what this does and does not protect. It is NOT what
-- protects the AI spend: the daily and monthly caps live in add_ai_usage, in this database,
-- and they are properly shared. This is abuse control on the open endpoints, and the fix is
-- to put the counter where the caps already are.
--
-- ONE ROW PER KEY PER WINDOW. The window is truncated to a boundary, so the row key is
-- deterministic and the whole thing is a single atomic upsert with no read-then-write race.
create table if not exists public.rate_hits (
  bucket      text        not null,   -- key + window start, e.g. "ask:1.2.3.4:1752300000"
  hits        integer     not null default 0,
  expires_at  timestamptz not null,
  primary key (bucket)
);

alter table public.rate_hits enable row level security;
-- No policies. Service role only.

create index if not exists rate_hits_expiry_idx on public.rate_hits (expires_at);

-- Count this hit, and say whether the caller is over the limit.
--
-- Atomic. The insert-or-increment happens in one statement, so two requests landing at the
-- same instant cannot both read "9" and both decide they are fine.
create or replace function public.rate_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start bigint;
  v_bucket       text;
  v_hits         integer;
begin
  if p_key is null or length(p_key) = 0 or length(p_key) > 200 then
    return false;   -- a key we cannot trust is not a key we can count. Let it through;
                    -- this is a rate limiter, not an auth gate, and the auth gate is elsewhere.
  end if;

  -- Fixed windows, not sliding. A sliding window needs the timestamps kept, and this needs
  -- to be one cheap statement on a hot path. The cost of a fixed window is that a burst can
  -- straddle a boundary and get up to 2x the limit for a moment. That is an acceptable
  -- price for an abuse control; it would not be for a money cap, which is why the money cap
  -- is not built this way.
  v_window_start := (extract(epoch from now())::bigint / greatest(p_window_seconds, 1)) * greatest(p_window_seconds, 1);
  v_bucket := p_key || ':' || v_window_start::text;

  insert into public.rate_hits (bucket, hits, expires_at)
  values (v_bucket, 1, to_timestamp(v_window_start + p_window_seconds * 2))
  on conflict (bucket) do update
    set hits = public.rate_hits.hits + 1
  returning hits into v_hits;

  return v_hits > p_limit;
end $$;

-- Sweep the dead buckets. Called from the crons, so it needs no separate schedule.
create or replace function public.rate_hits_sweep()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.rate_hits where expires_at < now();
  get diagnostics v_deleted = row_count;
  return v_deleted;
end $$;

revoke all on function public.rate_hit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.rate_hits_sweep() from public, anon, authenticated;
grant execute on function public.rate_hit(text, integer, integer) to service_role;
grant execute on function public.rate_hits_sweep() to service_role;


-- ============================================================================
-- Verify. All five functions and both tables should be present.
-- ============================================================================
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('weekly_totals_for', 'cron_started', 'cron_finished', 'cron_overdue', 'rate_hit', 'rate_hits_sweep')
  ) as functions,   -- expect 6
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name in ('cron_runs', 'rate_hits')
  ) as tables;      -- expect 2

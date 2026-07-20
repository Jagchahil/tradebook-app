-- APPLY 2026-07-20: the worker Bridge (heartbeats + activity).
--
-- THE BRIDGE. The always-on Mac mini is where the workforce runs (Khoji, Munshi, and the new
-- Pehredaar/Kanjoos/Dakiya). Each worker POSTs its status to /api/team/bridge/sync (secret-gated,
-- x-munshi-secret) as it runs. The /team console reads it so the CEO can WATCH the team work:
--   worker_heartbeats — one upserted row per worker: is it alive, its status, its last headline.
--   worker_activity   — an append-only event log: the live "working now" feed.
--
-- No customer data EVER crosses this — a worker reports only its OWN status. Server only via the
-- service role (the team-gated API); RLS on with no client policy, exactly like team_todos.

create table if not exists public.worker_heartbeats (
  worker_key   text primary key,
  status       text not null default 'ok' check (status in ('ok','warn','alert','offline')),
  headline     text not null default '',
  detail       jsonb not null default '{}'::jsonb,
  last_run_at  timestamptz,
  updated_at   timestamptz not null default now()
);

create table if not exists public.worker_activity (
  id          uuid primary key default gen_random_uuid(),
  worker_key  text not null,
  kind        text not null default 'info' check (kind in ('start','done','found','info','warn','error')),
  message     text not null,
  at          timestamptz not null default now()
);
create index if not exists worker_activity_feed on public.worker_activity (at desc);
create index if not exists worker_activity_by_worker on public.worker_activity (worker_key, at desc);

alter table public.worker_heartbeats enable row level security;
alter table public.worker_activity   enable row level security;
-- No client policies: RLS on + no policy = clients read nothing directly; the service role (used only
-- by the team-gated API) bypasses it. Same posture as team_todos. Nobody reaches this without a
-- team_members row on the request, and the mini writes only through the secret-gated sync route.

notify pgrst, 'reload schema';

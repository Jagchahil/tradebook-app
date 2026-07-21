-- worker_reruns — one pending "please sweep again" request per worker.
-- Written by the team-gated /api/team/bridge/rerun (the Retry button), claimed + cleared by the mini
-- bot via the secret-gated /api/team/bridge/rerun/claim. Service-role only, same posture as
-- worker_heartbeats: RLS on, no policies, so the anon/auth keys can never see or touch it.

create table if not exists public.worker_reruns (
  worker_key   text primary key,
  requested_at timestamptz not null default now(),
  requested_by text
);

alter table public.worker_reruns enable row level security;
-- No policies on purpose: only the service role (used server-side) may read or write.

comment on table public.worker_reruns is
  'Pending off-schedule re-run requests, one row per worker. Enqueued by the console Retry button, claimed and deleted by the worker on the mini.';

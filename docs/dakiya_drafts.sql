-- Dakiya's inbox drafts. Run this once in the Supabase SQL editor (or via the Management API) before
-- Dakiya's reader is switched on. Same posture as worker_heartbeats and team_todos: RLS on, no public
-- policies, so ONLY the service role (used server-side) can read or write it. No customer financial data.

create table if not exists public.dakiya_drafts (
  id            uuid primary key default gen_random_uuid(),
  thread_id     text not null,                 -- Gmail thread id, for threading + dedup
  message_id    text,                          -- Message-ID of the email being answered (In-Reply-To)
  lane          text not null default 'general', -- 'sales' | 'support' | 'general'
  from_email    text not null,                 -- the customer's address
  from_name     text,
  to_alias      text not null,                 -- which Lekhio alias it hit; the reply sends FROM here
  subject       text not null default '',      -- their subject
  snippet       text not null default '',      -- a short preview of their message
  draft_subject text not null default '',      -- the drafted reply subject
  draft_body    text not null default '',      -- the drafted reply body (plain text)
  status        text not null default 'pending', -- 'pending' | 'sent' | 'dismissed'
  created_at    timestamptz not null default now(),
  decided_at    timestamptz
);

create index if not exists dakiya_drafts_thread on public.dakiya_drafts (thread_id);
create index if not exists dakiya_drafts_status on public.dakiya_drafts (status, created_at desc);

alter table public.dakiya_drafts enable row level security;
-- Intentionally no policies: the service role bypasses RLS and is the only thing that touches this
-- table, exactly like worker_heartbeats and team_todos. The anon/authenticated roles get nothing.

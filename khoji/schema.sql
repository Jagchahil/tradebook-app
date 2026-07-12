-- Khoji (Phase D, doc 82 section 5 Layer 2): the knowledge table the Mac mini
-- watcher writes, and a narrowly scoped database role for it to write with.
--
-- Run this ONCE in the Supabase SQL editor (project tradebook-prod). It is
-- idempotent. Replace the password placeholder with a strong secret before you
-- run it, and put that same secret in the mini's khoji/.env as KHOJI_DB_URL.
--
-- Security posture: the mini never holds the service role key. It connects to
-- Postgres directly as khoji_writer, a login role that can do nothing but read
-- and write this one table. Everything else in the database is off limits to it.

create table if not exists public.knowledge_items (
  id            uuid primary key default gen_random_uuid(),
  source_url    text unique not null,          -- dedupe key, one row per source item
  source_name   text,                          -- which feed it came from
  title         text,
  summary       text,                          -- the distilled plain English summary (null until distilled)
  effective_date date,                         -- when the change takes effect, if known
  affects       text,                          -- who it affects, plain text
  confidence    numeric,                       -- 0..1, the distiller's confidence
  engine_impact boolean default false,         -- true = a rate or rule change we must reflect in the tax engine
  status        text default 'needs_distillation', -- needs_distillation | distilled | reviewed | actioned | dismissed
  raw           jsonb,                          -- the raw feed item, for audit
  created_at    timestamptz default now(),
  distilled_at  timestamptz
);

comment on table public.knowledge_items is 'Khoji watcher output. GOV.UK / HMRC updates, distilled. Nothing user facing reads a row until it is reviewed and carries a primary source link.';

alter table public.knowledge_items enable row level security;

-- The restricted writer role for the Mac mini. Least privilege: read (for dedupe)
-- and write this one table, nothing else. Change the password before running.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'khoji_writer') then
    create role khoji_writer login password 'REPLACE_WITH_A_STRONG_PASSWORD';
  end if;
end
$$;

grant usage on schema public to khoji_writer;
grant select, insert, update on public.knowledge_items to khoji_writer;

-- RLS still applies to khoji_writer (it is not the service role), so it needs an
-- explicit policy. This one scopes all access to this role only.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'knowledge_items' and policyname = 'khoji_writer_rw'
  ) then
    create policy khoji_writer_rw on public.knowledge_items
      for all to khoji_writer using (true) with check (true);
  end if;
end
$$;

notify pgrst, 'reload schema';

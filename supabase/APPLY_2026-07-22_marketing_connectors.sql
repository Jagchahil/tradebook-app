-- Marketing connector tokens: one row per platform (meta, tiktok, google). Additive and idempotent.
-- Tokens are written encrypted by the app (lib/crypto.encryptSecret) when SECRET_ENCRYPTION_KEY is
-- set. Service role only, never exposed to the browser. No customer data here.

create table if not exists marketing_connectors (
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

-- Re running is safe: add any column that an older copy of the table might miss.
alter table marketing_connectors add column if not exists account_id text;
alter table marketing_connectors add column if not exists refresh_token text;
alter table marketing_connectors add column if not exists expires_at timestamptz;
alter table marketing_connectors add column if not exists scope text;
alter table marketing_connectors add column if not exists connected_by text;
alter table marketing_connectors add column if not exists updated_at timestamptz not null default now();

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 🔴 ROW LEVEL SECURITY. ADDED 31 JUL 2026, BEFORE THIS MIGRATION HAD EVER BEEN RUN.
--
-- This table holds the ACCESS AND REFRESH TOKENS for every social account the company posts from.
-- As written on 22 Jul it created them in the public schema with RLS OFF, which in Supabase means
-- PostgREST serves the rows to the anon key. Every other table in this schema that holds anything
-- (content_ideas, content_assets, the lot) turns RLS on with no policies and the comment "Server
-- only". This one did not, and it is the single most sensitive table of the set.
--
-- No policies, deliberately: the service role bypasses RLS, so the app keeps working and nobody
-- else can read a token.
-- ══════════════════════════════════════════════════════════════════════════════════════════════
alter table public.marketing_connectors enable row level security;
-- No policies. Deliberately. Server only.

-- Verify: this must come back with rowsecurity = true.
select relname, relrowsecurity as rls_on
from pg_class
where oid = 'public.marketing_connectors'::regclass;

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

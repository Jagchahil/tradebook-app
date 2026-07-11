-- ---------------------------------------------------------------------------
-- FIX: bank card never flips to "connected"
--
-- Root cause: production public.bank_connections was created from the older
-- (GoCardless shaped) definition, which has no updated_at column. lib/supabase.ts
-- (updateBankConnection / revokeBankConnections) writes updated_at on EVERY
-- PATCH, so PostgREST rejected every update with:
--     column "updated_at" of relation "bank_connections" does not exist
-- The TrueLayer callback could therefore never set status='linked' or store
-- bank_name, so /api/bank/status always returned connected:false and the app's
-- bank card never showed connected. Confirmed live: all rows stuck at 'created'.
--
-- Safe and non-destructive: adds the missing column (and, defensively, any other
-- TrueLayer columns) with sensible defaults. Existing rows get updated_at=now().
-- Re-runnable: every statement is `if not exists`.
-- ---------------------------------------------------------------------------

alter table public.bank_connections add column if not exists reference        text;
alter table public.bank_connections add column if not exists account_ids      jsonb not null default '[]';
alter table public.bank_connections add column if not exists last_synced_date date;
alter table public.bank_connections add column if not exists updated_at       timestamptz not null default now();

-- Tell PostgREST to refresh its schema cache so the new column is usable at once.
notify pgrst, 'reload schema';

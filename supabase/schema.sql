-- TradeBook database schema and security.
--
-- This reflects the REAL tradebook-prod schema as observed on 2026-06-24. The
-- tables already exist, so the create statements are documentation and no-ops.
-- The parts that actually change anything are: one added column for webhook
-- idempotency, its unique index, and the row level security block.
--
-- Safe to run more than once. Safe to run on the live database.
--
-- Run it in the Supabase SQL Editor for tradebook-prod.

-- ---------------------------------------------------------------------------
-- Tables (as they really are. Create statements are no-ops on existing tables.)
-- ---------------------------------------------------------------------------

create table if not exists public.users (
  id           uuid primary key,
  phone_number text,
  name         text,
  trade_type   text,
  is_active    boolean,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create table if not exists public.transactions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users (id) on delete cascade,
  amount           numeric,
  vendor           text,
  category         text,
  transaction_date date,
  description      text,
  source_type      text,
  raw_input_url    text,
  confidence_score numeric,
  confirmed        boolean default false,
  created_at       timestamptz default now()
);

create table if not exists public.monthly_summaries (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users (id) on delete cascade,
  year              int,
  month             int,
  total_income      numeric,
  total_expenses    numeric,
  transaction_count int,
  updated_at        timestamptz default now()
);

create table if not exists public.waitlist (
  id         uuid primary key default gen_random_uuid(),
  phone      text,
  email      text,
  created_at timestamptz default now()
);

create table if not exists public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid,
  event_type text,
  event_data jsonb,
  ip_address text,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Webhook idempotency
-- ---------------------------------------------------------------------------
-- The transactions table had no field for the WhatsApp message id. We add one
-- so a retried webhook delivery can never create a duplicate receipt. Additive
-- and safe. Existing rows get null.

alter table public.transactions add column if not exists raw_whatsapp_message_id text;

create unique index if not exists transactions_whatsapp_msg_uidx
  on public.transactions (raw_whatsapp_message_id)
  where raw_whatsapp_message_id is not null;

-- ---------------------------------------------------------------------------
-- Row level security (already applied 2026-06-24, kept here so it is repeatable)
-- ---------------------------------------------------------------------------

alter table public.users enable row level security;
alter table public.transactions enable row level security;
alter table public.monthly_summaries enable row level security;
alter table public.waitlist enable row level security;
alter table public.audit_log enable row level security;

-- users: a person can see and change only their own row.
drop policy if exists users_select_own on public.users;
create policy users_select_own on public.users
  for select using (auth.uid() = id);

drop policy if exists users_insert_own on public.users;
create policy users_insert_own on public.users
  for insert with check (auth.uid() = id);

drop policy if exists users_update_own on public.users;
create policy users_update_own on public.users
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- transactions: read your own. The webhook inserts with the service role key,
-- which bypasses RLS, so there is no app insert policy. The app can update and
-- delete its own rows so a user can confirm, edit, or remove a receipt.
drop policy if exists transactions_select_own on public.transactions;
create policy transactions_select_own on public.transactions
  for select using (auth.uid() = user_id);

drop policy if exists transactions_update_own on public.transactions;
create policy transactions_update_own on public.transactions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists transactions_delete_own on public.transactions;
create policy transactions_delete_own on public.transactions
  for delete using (auth.uid() = user_id);

-- monthly_summaries: read your own only.
drop policy if exists monthly_summaries_select_own on public.monthly_summaries;
create policy monthly_summaries_select_own on public.monthly_summaries
  for select using (auth.uid() = user_id);

-- waitlist and audit_log: no policies. RLS is on, so the anon key cannot read
-- or write them. The server uses the service role key, which bypasses RLS.
-- audit_log holds IP addresses, so this keeps it private.

-- ---------------------------------------------------------------------------
-- Conventions (decided 2026-06-24 while the transactions table was still empty)
-- ---------------------------------------------------------------------------
-- 1. Income vs expense is the sign of `amount`. Expenses are negative. There is
--    no transaction_type column.
-- 2. The webhook stores a receipt with vendor, a negative amount, category,
--    transaction_date, source_type 'whatsapp_image', and confirmed = false.
-- 3. `confirmed` is the user approval flag. Nothing should be treated as final
--    for tax until the user approves it.
-- 4. Do not disable RLS to make an insert work. Use the service role key.

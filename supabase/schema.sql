-- TradeBook database schema and security.
--
-- This file is the source of truth for the database. It is safe to run more than
-- once and safe to run against the existing tradebook-prod database. It only
-- creates things that are missing and it replaces the security policies each time.
--
-- How to run:
--   Supabase dashboard, project tradebook-prod, SQL Editor, paste this whole file, Run.
--
-- The big change from the old setup: row level security is ON. The webhook writes
-- transactions using the service role key, which bypasses these policies. The app
-- uses the public anon key, so the policies below make sure each person can only
-- read and change their own rows.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.users (
  id           uuid primary key,
  phone_number text,
  name         text,
  trade_type   text,
  created_at   timestamptz not null default now()
);

create table if not exists public.transactions (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references public.users (id) on delete cascade,
  merchant_name           text,
  amount                  numeric,
  category                text,
  transaction_type        text,
  receipt_url             text,
  raw_whatsapp_message_id text,
  created_at              timestamptz not null default now()
);

create table if not exists public.monthly_summaries (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users (id) on delete cascade,
  year           int,
  month          int,
  total_income   numeric,
  total_expenses numeric,
  created_at     timestamptz not null default now()
);

create table if not exists public.waitlist (
  id         uuid primary key default gen_random_uuid(),
  phone      text,
  email      text,
  created_at timestamptz not null default now()
);

-- Keep transaction_type honest. Only income or expense, or left empty.
-- Wrapped so re-running does not error if the constraint already exists.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'transactions_type_check'
  ) then
    alter table public.transactions
      add constraint transactions_type_check
      check (transaction_type is null or transaction_type in ('income', 'expense'));
  end if;
end $$;

-- Helpful indexes for the reads the app does.
create index if not exists transactions_user_created_idx
  on public.transactions (user_id, created_at desc);
create index if not exists monthly_summaries_user_idx
  on public.monthly_summaries (user_id);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.users enable row level security;
alter table public.transactions enable row level security;
alter table public.monthly_summaries enable row level security;
alter table public.waitlist enable row level security;

-- users: a person can see and change only their own row.
-- The row id equals their auth user id, including anonymous sign ins.
drop policy if exists users_select_own on public.users;
create policy users_select_own on public.users
  for select using (auth.uid() = id);

drop policy if exists users_insert_own on public.users;
create policy users_insert_own on public.users
  for insert with check (auth.uid() = id);

drop policy if exists users_update_own on public.users;
create policy users_update_own on public.users
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- transactions: a person can read only their own. Writes come from the webhook
-- using the service role key, which bypasses these policies, so there is no
-- insert policy for the app on purpose.
drop policy if exists transactions_select_own on public.transactions;
create policy transactions_select_own on public.transactions
  for select using (auth.uid() = user_id);

-- monthly_summaries: same rule. Read your own, writes are service role only.
drop policy if exists monthly_summaries_select_own on public.monthly_summaries;
create policy monthly_summaries_select_own on public.monthly_summaries
  for select using (auth.uid() = user_id);

-- waitlist: no policies at all. RLS is on, so the anon key cannot read or write
-- it. The website saves signups through the API using the service role key,
-- which bypasses RLS. This stops anyone from scraping or spamming the list with
-- the public key.

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
-- 1. If the app ever needs to let a user delete their own transactions from the
--    phone, add a delete policy: using (auth.uid() = user_id).
-- 2. Do not disable RLS to make an insert work. Use the service role key on the
--    server for that insert instead.

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
-- CIS tax deducted at source by a contractor. Stored on the gross income row.
-- It is tax already paid, never an expense, so it never touches profit.
alter table public.transactions add column if not exists cis_deduction numeric default 0;

create unique index if not exists transactions_whatsapp_msg_uidx
  on public.transactions (raw_whatsapp_message_id)
  where raw_whatsapp_message_id is not null;

-- ---------------------------------------------------------------------------
-- Bank connection scaffolding (Open Banking, doc 22). Laid dormant. The client
-- lib and the connect flow are wired when the aggregator account and the
-- BANK_TOKEN_KEY exist. Adding these now is safe and idempotent.
-- ---------------------------------------------------------------------------

-- Imported bank lines land in transactions with source_type 'bank' and a
-- provider external_id, deduped so a re-sync never double counts.
alter table public.transactions add column if not exists external_id text;
create unique index if not exists transactions_external_uidx
  on public.transactions (user_id, external_id)
  where external_id is not null;

create table if not exists public.bank_connections (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.users (id) on delete cascade,
  provider           text,
  access_token_enc   text,
  refresh_token_enc  text,
  consent_expires_at timestamptz,
  status             text default 'active',
  created_at         timestamptz default now()
);
-- Service role only. No user policies: these tokens are the crown jewels and the
-- app never reads them. The sync job uses the service role key.
alter table public.bank_connections enable row level security;

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

-- The app can insert its own transactions too, for example booking income when
-- an invoice is marked paid. The webhook still uses the service role key.
drop policy if exists transactions_insert_own on public.transactions;
create policy transactions_insert_own on public.transactions
  for insert with check (auth.uid() = user_id);

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
-- Invoicing (added 2026-06-24)
-- ---------------------------------------------------------------------------

-- A couple of business details on the user, used to fill out an invoice.
alter table public.users add column if not exists business_name text;
alter table public.users add column if not exists address text;

create table if not exists public.invoices (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users (id) on delete cascade,
  number           text,
  customer_name    text,
  customer_contact text,
  line_items       jsonb not null default '[]'::jsonb,
  subtotal         numeric not null default 0,
  tax              numeric not null default 0,
  total            numeric not null default 0,
  status           text not null default 'draft',
  notes            text,
  issued_date      date,
  due_date         date,
  paid_at          timestamptz,
  created_at       timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_status_check') then
    alter table public.invoices
      add constraint invoices_status_check
      check (status in ('draft', 'sent', 'paid'));
  end if;
end $$;

create index if not exists invoices_user_created_idx
  on public.invoices (user_id, created_at desc);

alter table public.invoices enable row level security;

-- The owner can do everything with their own invoices. The public invoice page
-- reads with the service role key on the server, so no public read policy.
drop policy if exists invoices_select_own on public.invoices;
create policy invoices_select_own on public.invoices
  for select using (auth.uid() = user_id);

drop policy if exists invoices_insert_own on public.invoices;
create policy invoices_insert_own on public.invoices
  for insert with check (auth.uid() = user_id);

drop policy if exists invoices_update_own on public.invoices;
create policy invoices_update_own on public.invoices
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists invoices_delete_own on public.invoices;
create policy invoices_delete_own on public.invoices
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- WhatsApp conversation state (for the guided invoice flow)
-- ---------------------------------------------------------------------------
-- Holds the in-progress step of a WhatsApp conversation (for example building an
-- invoice across a few messages). Keyed by the sender's number. Server only, the
-- webhook writes it with the service role key.

create table if not exists public.wa_sessions (
  phone      text primary key,
  flow       text,
  step       text,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.wa_sessions enable row level security;
-- No policies. Service role only. The anon key can never touch it.

-- ---------------------------------------------------------------------------
-- Signups (from the web onboarding flow at /start)
-- ---------------------------------------------------------------------------
-- Captures a completed web onboarding. This is the start of an account, written
-- before the live auth and billing are switched on. Server only, the /api/onboard
-- route writes it with the service role key.

create table if not exists public.signups (
  id             uuid primary key default gen_random_uuid(),
  phone          text not null,
  email          text,
  trade_type     text,
  name           text,
  trade          text,
  postcode       text,
  address        text,
  vat_registered boolean,
  created_at     timestamptz not null default now()
);

alter table public.signups enable row level security;
-- No policies. Service role only. The anon key can never touch it.

-- ---------------------------------------------------------------------------
-- Events (the diary and reminders)
-- ---------------------------------------------------------------------------
-- A job, quote, reminder, or note in the user's diary. Created from WhatsApp
-- ("price up a job for Dave tomorrow at 8am") or in the app. The cron sender
-- texts the user when remind_at is due. A user reads only their own rows.

create table if not exists public.events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  title      text not null,
  kind       text not null default 'reminder',
  starts_at  timestamptz,
  remind_at  timestamptz,
  reminded   boolean not null default false,
  notes      text,
  status     text not null default 'open',
  created_at timestamptz not null default now()
);

alter table public.events enable row level security;
create policy "events read own"   on public.events for select using (auth.uid() = user_id);
create policy "events insert own" on public.events for insert with check (auth.uid() = user_id);
create policy "events update own" on public.events for update using (auth.uid() = user_id);
create policy "events delete own" on public.events for delete using (auth.uid() = user_id);
create index if not exists events_user_idx   on public.events(user_id);
create index if not exists events_remind_idx on public.events(remind_at) where reminded = false;

-- ---------------------------------------------------------------------------
-- Reminder preferences
-- ---------------------------------------------------------------------------
-- Per user: whether the twice a day expense nudge and the weekly summary are on,
-- and at what times the nudge fires. Defaults are on.

create table if not exists public.reminder_prefs (
  user_id        uuid primary key,
  daily_nudges   boolean not null default true,
  morning_time   text not null default '08:00',
  evening_time   text not null default '18:00',
  weekly_summary boolean not null default true,
  updated_at     timestamptz not null default now()
);

alter table public.reminder_prefs enable row level security;
create policy "prefs read own"   on public.reminder_prefs for select using (auth.uid() = user_id);
create policy "prefs insert own" on public.reminder_prefs for insert with check (auth.uid() = user_id);
create policy "prefs update own" on public.reminder_prefs for update using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Indexes for scale (no-ops if they already exist)
-- ---------------------------------------------------------------------------
-- Keep the common per-user reads fast as the tables grow over a year of use.

create index if not exists transactions_user_idx         on public.transactions(user_id);
create index if not exists transactions_user_created_idx on public.transactions(user_id, created_at desc);
create index if not exists invoices_user_idx             on public.invoices(user_id);

-- ---------------------------------------------------------------------------
-- Processed messages (webhook idempotency)
-- ---------------------------------------------------------------------------
-- Every inbound WhatsApp message id is claimed here before it is handled, so a
-- Meta retry (which happens if we are slow to answer) never processes the same
-- message twice. Service only.

create table if not exists public.processed_messages (
  id         text primary key,
  created_at timestamptz not null default now()
);

alter table public.processed_messages enable row level security;
-- No policies. Service role only.

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

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

-- Marketing leads captured from the free tools (the consent engine). Each row is
-- a person who opted in, WITH the proof of consent (exact wording, timestamp, ip,
-- user agent) that UK PECR requires before we may email them marketing. Service
-- role only: RLS is on with no policy, so anon and authenticated clients cannot
-- read or write it.
create table if not exists public.marketing_leads (
  id              uuid primary key default gen_random_uuid(),
  email           text not null,
  source          text,
  result_note     text,
  consent         boolean not null default false,
  consent_text    text,
  consent_at      timestamptz,
  confirmed_at    timestamptz,
  ip              text,
  user_agent      text,
  unsubscribed_at timestamptz,
  created_at      timestamptz not null default now()
);
create unique index if not exists marketing_leads_email_uniq on public.marketing_leads (email);
alter table public.marketing_leads enable row level security;

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

-- One phone, one account. This is the hard backstop for the app<->WhatsApp link:
-- the webhook matches a sender to exactly one user by phone, so two accounts must
-- never hold the same number. The app already routes a phone to a single auth
-- user via OTP, but this makes it impossible at the database level regardless of
-- any code path. Partial, so the many historic phone-less rows are unaffected.
create unique index if not exists users_phone_unique_idx
  on public.users (phone_number) where phone_number is not null;
create index if not exists users_phone_idx on public.users (phone_number);

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
-- AI usage budget (hard cost cap)
-- ---------------------------------------------------------------------------
-- A durable per-day counter so a runaway or malicious sender can never run up an
-- insane AI bill. The webhook increments a per-phone key and a global key before
-- every paid AI call and refuses to spend once either is over its daily cap.
-- This is the hard backstop behind the in-memory burst limit. Service only.

create table if not exists public.ai_usage (
  day        date    not null default current_date,
  scope      text    not null,            -- 'phone' or 'global'
  key        text    not null,            -- the phone number, or 'all'
  count      integer not null default 0,
  primary key (day, scope, key)
);

alter table public.ai_usage enable row level security;
-- No policies. Service role only.

-- Atomic increment. Returns the new count for today so the caller can compare it
-- to the cap. One row per (day, scope, key); the unique key makes it race safe.
create or replace function public.increment_ai_usage(p_scope text, p_key text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v integer;
begin
  insert into public.ai_usage (day, scope, key, count)
  values (current_date, p_scope, p_key, 1)
  on conflict (day, scope, key)
  do update set count = public.ai_usage.count + 1
  returning count into v;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Signup offer (the register-your-business funnel)
-- ---------------------------------------------------------------------------
-- The free register tool offers first month free plus 20% off for life if the
-- user signs up straight after. We record the offer code on their signup so it
-- can be honoured when billing goes live. Additive and safe.
alter table public.signups add column if not exists offer text;

-- ---------------------------------------------------------------------------
-- Security: one phone number, one account
-- ---------------------------------------------------------------------------
-- A phone number identifies an account, so it must be unique. This stops an
-- attacker claiming a number that already belongs to someone else (the takeover
-- vector when sign-in is not yet OTP verified). Partial index, so any number of
-- accounts without a phone set yet are fine. On a live database, clear any
-- duplicate phone_number rows before running this. Real production sign-in must
-- still use phone OTP (EXPO_PUBLIC_OTP_ENABLED) so the number is proven, not just
-- typed.
create unique index if not exists users_phone_unique
  on public.users(phone_number) where phone_number is not null;

-- ---------------------------------------------------------------------------
-- Subscriptions (Stripe billing for the Lekhio subscription itself)
-- ---------------------------------------------------------------------------
-- One row per Stripe subscription. The web checkout creates the subscription and
-- the Stripe webhook keeps status, plan, price, and renewal date in sync. This is
-- the record of who is paying, on what plan, and whether they are still inside
-- their free trial. Service role only, written by the webhook. Additive and safe
-- to run on a live database.
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  plan text,                       -- 'monthly' or 'annual'
  offer text,                      -- 'setup20' for the founder price, else null
  status text,                     -- trialing, active, past_due, canceled, unpaid, incomplete
  amount_pence integer,            -- the recurring amount actually being charged
  current_period_end timestamptz,  -- when the next charge or renewal is due
  cancel_at_period_end boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- The account is keyed by phone (E.164 +44). Store it on the subscription so a
-- phone-only payer (email optional at signup) is recognised and entitlement can be
-- resolved by phone, not just email.
alter table public.subscriptions add column if not exists phone text;

create index if not exists subscriptions_email_idx on public.subscriptions(email);
create index if not exists subscriptions_customer_idx on public.subscriptions(stripe_customer_id);
create index if not exists subscriptions_phone_idx on public.subscriptions(phone);

alter table public.subscriptions enable row level security;
-- No policies. Service role only, the same as the other server-written tables.

-- ---------------------------------------------------------------------------
-- HMRC MTD connection: the OAuth tokens that let Lekhio file for a user. These
-- are highly sensitive, so the table is service-role only (the app never reads
-- the tokens; it only ever asks the server to act).
-- ---------------------------------------------------------------------------
create table if not exists public.hmrc_connections (
  user_id       uuid primary key references public.users(id) on delete cascade,
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,
  nino          text,
  business_id   text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table public.hmrc_connections enable row level security;
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

-- ---------------------------------------------------------------------------
-- ADDED 2 JULY 2026 (Fable audit, doc 74). APPLY THIS BLOCK IN THE SUPABASE SQL
-- EDITOR. Two items: the grouped weekly totals RPC (replaces the N plus one
-- weekly cron fan out) and the phone binding trigger (binds users.phone_number
-- to the OTP verified phone on the JWT, closing the deferred H1 finding).
-- Both are idempotent. The cron falls back to the old per user query until the
-- RPC exists, so applying late is safe; applying is still required for scale.
-- ---------------------------------------------------------------------------

-- Weekly totals for every user in one grouped pass. Confirmed entries only,
-- keyed off transaction_date (falling back to created_at) so the WhatsApp
-- summary agrees with the app.
create or replace function public.weekly_totals_all()
returns table (user_id uuid, income numeric, expenses numeric)
language sql
security definer
set search_path = public
as $$
  select
    t.user_id,
    coalesce(sum(case when t.amount >= 0 then t.amount end), 0) as income,
    coalesce(sum(case when t.amount < 0 then -t.amount end), 0) as expenses
  from public.transactions t
  where t.confirmed = true
    and coalesce(t.transaction_date, t.created_at::date) >= (current_date - 7)
  group by t.user_id;
$$;

-- Lock the function down: only the service role should call it.
revoke all on function public.weekly_totals_all() from public;
revoke all on function public.weekly_totals_all() from anon;
revoke all on function public.weekly_totals_all() from authenticated;
grant execute on function public.weekly_totals_all() to service_role;

-- Bind the stored phone to the verified phone on the JWT. OTP is the only login
-- path in production, so an authenticated session always carries the phone it
-- verified. This makes it impossible for a signed in client to point its account
-- at someone else's number, even with handcrafted REST calls. The service role
-- (webhook, server) is exempt. Clearing the phone (null) stays allowed.
-- NOTE: apply only while OTP login is ON (it is, and anonymous sign in is
-- disabled). Comparison is on national significant digits so formatting cannot
-- dodge the check.
create or replace function public.enforce_phone_binding()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  claims  json;
  role_c  text;
  jwt_ph  text;
  new_d   text;
  jwt_d   text;
begin
  begin
    claims := nullif(current_setting('request.jwt.claims', true), '')::json;
  exception when others then
    claims := null;
  end;
  role_c := coalesce(claims->>'role', '');
  -- Server side writes (service role, or no JWT at all) are trusted.
  if role_c <> 'authenticated' then
    return new;
  end if;
  if new.phone_number is null then
    return new;
  end if;
  jwt_ph := coalesce(claims->>'phone', '');
  new_d := regexp_replace(new.phone_number, '\D', '', 'g');
  jwt_d := regexp_replace(jwt_ph, '\D', '', 'g');
  -- Accept +44 E.164, national 07 form, or bare digits of the same number.
  if new_d = jwt_d
     or ('44' || ltrim(new_d, '0')) = jwt_d
     or new_d = ('44' || ltrim(jwt_d, '0')) then
    return new;
  end if;
  raise exception 'phone_number must match the phone verified on this account';
end;
$$;

drop trigger if exists users_phone_binding on public.users;
create trigger users_phone_binding
  before insert or update of phone_number on public.users
  for each row execute function public.enforce_phone_binding();

-- Scale indexes for 20,000+ users (added 2 July 2026, apply with the block above).
-- The cleanup job deletes processed_messages by age; without this index that
-- delete scans millions of rows.
create index if not exists processed_messages_created_idx on public.processed_messages(created_at);
-- The webhook's "latest unconfirmed entry" lookup (delete that / change it to X).
create index if not exists transactions_user_unconfirmed_idx
  on public.transactions(user_id, created_at desc) where confirmed = false;

-- ---------------------------------------------------------------------------
-- ADDED 2 JULY 2026, SECOND BLOCK (bank feeds foundation, doc 77). APPLY IN THE
-- SUPABASE SQL EDITOR WHEN BANK FEEDS ARE SWITCHED ON (harmless to apply now).
-- ---------------------------------------------------------------------------

-- One row per Open Banking consent journey. No tokens live here; GoCardless
-- holds the bank consent and we hold only the requisition id needed to read.
create table if not exists public.bank_connections (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users(id) on delete cascade,
  requisition_id   text not null,
  reference        text not null unique,
  institution_id   text,
  status           text not null default 'created', -- created | linked | failed | revoked
  account_ids      jsonb not null default '[]',
  last_synced_date date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.bank_connections enable row level security;
-- No policies. Service role only, same posture as hmrc_connections.

create index if not exists bank_connections_user_idx   on public.bank_connections(user_id);
create index if not exists bank_connections_status_idx on public.bank_connections(status);

-- Idempotent bank imports: the bank's own transaction id lives in external_id,
-- so re-syncing an overlapping window can never duplicate a row.
create unique index if not exists transactions_external_id_key
  on public.transactions(external_id) where external_id is not null;

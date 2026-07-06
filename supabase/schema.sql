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
-- Serves the confirmed-only totals (WhatsApp money answers, accountant export):
-- filter by user + confirmed=true, ordered by transaction_date. Partial so it
-- stays small (only confirmed rows). Applied to prod 2026-07-02.
create index if not exists transactions_user_confirmed_date_idx
  on public.transactions(user_id, transaction_date desc) where confirmed = true;
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

-- Defensive: upsertSubscription writes updated_at on EVERY Stripe webhook, and
-- reads order by updated_at.desc. If this table predates the column in any
-- environment, the bare `create table if not exists` above is a no-op and every
-- webhook PATCH would be rejected (billing silently frozen) -- the exact failure
-- we hit on bank_connections. Never rely on the create block to introduce a
-- written column; guarantee it with an explicit alter.
alter table public.subscriptions add column if not exists updated_at timestamptz not null default now();
create index if not exists subscriptions_phone_updated_idx on public.subscriptions(phone, updated_at desc);

create index if not exists subscriptions_email_idx on public.subscriptions(email);
create index if not exists subscriptions_customer_idx on public.subscriptions(stripe_customer_id);
create index if not exists subscriptions_phone_idx on public.subscriptions(phone);

alter table public.subscriptions enable row level security;
-- No policies. Service role only, the same as the other server-written tables.

-- ---------------------------------------------------------------------------
-- Stripe webhook idempotency + replay protection
-- ---------------------------------------------------------------------------
-- Every Stripe event id is claimed here once, before any state mutation, so a
-- Stripe retry (Stripe re-delivers when we are slow to answer 200) can never
-- reprocess the same event and, for example, book a payment twice or double a
-- subscription change. The webhook inserts the id right after the signature
-- check: a 201 means first delivery (proceed), a 409 means duplicate (answer
-- 200 and do nothing). Service role only, so anon and authenticated clients can
-- never read or write it. Additive and safe to run on a live database.
create table if not exists public.stripe_events (
  id         text primary key,
  type       text,
  created_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;
-- No policies. Service role only.

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
-- HMRC approval audit trail
-- ---------------------------------------------------------------------------
-- The non-negotiable rule is that we PREPARE and the user APPROVES. Every write
-- to HMRC (a quarterly update, a final declaration, a BSAS adjustment, a loss
-- record or claim) passes an explicit approved === true gate in lib/hmrc.ts.
-- This table is the durable record of each approval: who approved, what kind of
-- submission, the figures they signed off, and when. It is written best effort
-- with the service role key just before the HMRC network call, so we can always
-- prove a human approved the exact numbers that were filed. A user may read
-- their own approvals; only the server writes them. Additive and safe.
create table if not exists public.hmrc_approvals (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  submission_type text not null,
  calculation_id  text,
  period_key      text,
  figures         jsonb,
  approved_at     timestamptz not null default now()
);

alter table public.hmrc_approvals enable row level security;
-- A user can read their own approval history; the server writes with the
-- service role key, which bypasses RLS, so there is no insert policy.
create policy hmrc_approvals_own on public.hmrc_approvals
  for select using (auth.uid() = user_id);
create index if not exists hmrc_approvals_user_idx on public.hmrc_approvals (user_id, approved_at desc);

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

-- Per user totals in one server side pass, for the WhatsApp money answers
-- ("how much have I made / spent / owe this month"). Replaces fetching up to
-- 5000 rows over PostgREST and summing them in code, which was slow and silently
-- truncated the heaviest users at 5000 rows. Confirmed entries only, matching the
-- app's tax tab and the approved-only rule. The period is keyed off
-- transaction_date (falling back to created_at) when p_since is given, and the
-- category is filtered when p_category is given; both are optional (pass null to
-- skip). income sums the positive amounts, expenses the absolute value of the
-- negative ones, cis the CIS deductions, and count is every matching row. Called
-- with the service key, so it is locked to the service role only.
create or replace function public.user_totals(p_user_id uuid, p_since date, p_category text)
returns table (income numeric, expenses numeric, cis numeric, count bigint)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(sum(case when t.amount >= 0 then t.amount end), 0) as income,
    coalesce(sum(case when t.amount < 0 then -t.amount end), 0) as expenses,
    coalesce(sum(coalesce(t.cis_deduction, 0)), 0) as cis,
    count(*) as count
  from public.transactions t
  where t.user_id = p_user_id
    and t.confirmed = true
    and (p_since is null or coalesce(t.transaction_date, t.created_at::date) >= p_since)
    and (p_category is null or t.category = p_category);
$$;

-- Lock the function down: only the service role should call it.
revoke all on function public.user_totals(uuid, date, text) from public;
revoke all on function public.user_totals(uuid, date, text) from anon;
revoke all on function public.user_totals(uuid, date, text) from authenticated;
grant execute on function public.user_totals(uuid, date, text) to service_role;

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
-- ADDED 2 JULY 2026, SECOND BLOCK, REVISED SAME DAY (bank feeds via TrueLayer,
-- doc 77; GoCardless Bank Account Data closed to new signups so the fallback
-- provider is live). APPLY IN THE SUPABASE SQL EDITOR. Idempotent, and safe
-- whether or not the earlier GoCardless shaped block was ever applied.
-- ---------------------------------------------------------------------------

-- One row per Open Banking consent journey. TrueLayer issues per connection
-- OAuth tokens (1 hour access, long lived refresh); they live here, in a
-- service role only table with RLS and no policies, same posture as
-- hmrc_connections. The app never reads this table.
create table if not exists public.bank_connections (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users(id) on delete cascade,
  reference        text not null unique,
  status           text not null default 'created', -- created | linked | failed | expired | revoked
  account_ids      jsonb not null default '[]',
  access_token     text,
  refresh_token    text,
  token_expires_at timestamptz,
  last_synced_date date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Upgrade path if the earlier GoCardless shaped table exists: add every column
-- the TrueLayer flow needs and relax the requisition column it no longer uses.
-- The bare `create table if not exists` above is a no-op when the old table is
-- already present, so these alters are the ONLY thing that brings such a table
-- up to shape. updated_at MUST be here: lib/supabase.ts writes updated_at on
-- every bank_connections PATCH, so if the column is absent every status/token
-- update is rejected and connections stay stuck at 'created' (the bank card
-- never flips to connected). See migration APPLY_2026-07-02_bankconn_updated_at.sql.
alter table public.bank_connections add column if not exists access_token     text;
alter table public.bank_connections add column if not exists refresh_token    text;
alter table public.bank_connections add column if not exists token_expires_at timestamptz;
alter table public.bank_connections add column if not exists reference        text;
alter table public.bank_connections add column if not exists account_ids      jsonb not null default '[]';
alter table public.bank_connections add column if not exists last_synced_date date;
alter table public.bank_connections add column if not exists updated_at       timestamptz not null default now();
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'bank_connections'
               and column_name = 'requisition_id') then
    alter table public.bank_connections alter column requisition_id drop not null;
  end if;
end $$;

alter table public.bank_connections enable row level security;
-- No policies. Service role only.

create index if not exists bank_connections_user_idx   on public.bank_connections(user_id);
create index if not exists bank_connections_status_idx on public.bank_connections(status);

-- Idempotent bank imports: the provider's stable transaction id lives in
-- external_id, so re-syncing an overlapping window can never duplicate a row.
-- MUST be a full (non partial) unique index: PostgREST's on_conflict cannot
-- infer a partial one and every bulk insert fails with 42P10. Postgres treats
-- NULLs as distinct, so the app's own entries (external_id null) are unaffected.
drop index if exists public.transactions_external_id_key;
create unique index if not exists transactions_external_id_key
  on public.transactions(external_id);

-- The connected bank's display name (TrueLayer provider display_name), shown on
-- the app's bank card so the user can see which bank is linked.
alter table public.bank_connections add column if not exists bank_name text;
notify pgrst, 'reload schema';

-- HMRC fraud prevention: the latest device collected values (device id, browser
-- JS user agent, screen and window geometry, timezone, optional public port and
-- MFA), stored so the server can build the full Gov-Client / Gov-Vendor header
-- set at submit time. Device characteristics, not secrets, so plain jsonb. Table
-- stays service role only (RLS enabled, no policies, set at creation).
alter table public.hmrc_connections add column if not exists fraud_client jsonb;
alter table public.hmrc_connections add column if not exists fraud_collected_at timestamptz;
notify pgrst, 'reload schema';

-- Student loan and mixed income (Phase B, NI and student loan hubs). The plan
-- is asked once in the app and stored here so the app hub, the WhatsApp
-- answers and later the agent all read one source. employment_income is an
-- optional annual salary for people with a PAYE job alongside the trade, used
-- for the NI position and student loan threshold maths. All nullable, nothing
-- existing changes.
alter table public.users add column if not exists student_loan_plan text
  check (student_loan_plan in ('plan1','plan2','plan4','plan5'));
alter table public.users add column if not exists student_loan_postgrad boolean not null default false;
alter table public.users add column if not exists employment_income numeric;
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- The Agentic Accountant v1 (doc 84). Signals fired by the nightly engine.
-- ---------------------------------------------------------------------------
create table if not exists public.agent_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  signal_key text not null,
  period_key text not null,
  payload jsonb not null,
  priority text not null default 'card' check (priority in ('ping','card')),
  created_at timestamptz not null default now(),
  delivered_wa_at timestamptz,
  read_at timestamptz,
  dismissed_at timestamptz
);
-- Fire once per user per signal per period. The cron upserts with
-- on_conflict=user_id,signal_key,period_key and ignore-duplicates, so a retry
-- or a double hop can never double insert, structurally.
create unique index if not exists agent_signals_once
  on public.agent_signals(user_id, signal_key, period_key);
create index if not exists agent_signals_user_active
  on public.agent_signals(user_id, created_at desc) where dismissed_at is null;
alter table public.agent_signals enable row level security;
-- The app reads its own rows and can mark them read or dismissed. Inserts are
-- service role only: no insert policy exists on purpose.
drop policy if exists agent_signals_own_read on public.agent_signals;
create policy agent_signals_own_read on public.agent_signals
  for select using (auth.uid() = user_id);
drop policy if exists agent_signals_own_update on public.agent_signals;
create policy agent_signals_own_update on public.agent_signals
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Per user switch for the agent's WhatsApp pings (in app cards always show).
alter table public.reminder_prefs add column if not exists agent_pings boolean not null default true;

-- One round trip for everything the signal engine needs about a user: monthly
-- confirmed buckets for the trailing 12 months, the unconfirmed count, and the
-- tax year's equipment spend. Same N+1 discipline as user_totals.
create or replace function public.agent_user_aggregates(p_user_id uuid)
returns jsonb
language sql
stable
as $$
  with ty as (
    select case
      when extract(month from current_date) > 4
        or (extract(month from current_date) = 4 and extract(day from current_date) >= 6)
      then make_date(extract(year from current_date)::int, 4, 6)
      else make_date(extract(year from current_date)::int - 1, 4, 6)
    end as start
  ),
  tx as (
    select coalesce(transaction_date, created_at::date) as d,
           amount,
           coalesce(cis_deduction, 0) as cis,
           lower(coalesce(category, '')) as category,
           lower(coalesce(vendor, '')) as vendor,
           coalesce(income_type, 'trade') as income_type
    from public.transactions
    where user_id = p_user_id
      and confirmed = true
      and coalesce(transaction_date, created_at::date) >= (current_date - interval '12 months')::date
  )
  select jsonb_build_object(
    'months', coalesce((
      select jsonb_agg(jsonb_build_object('month', m, 'income', inc, 'expenses', exp, 'cis', c) order by m)
      from (
        select to_char(d, 'YYYY-MM') as m,
               sum(case when amount >= 0 then amount else 0 end) as inc,
               sum(case when amount < 0 then -amount else 0 end) as exp,
               sum(c1s.cis) as c
        from tx c1s
        group by 1
      ) buckets
    ), '[]'::jsonb),
    'unconfirmed', (
      select count(*) from public.transactions
      where user_id = p_user_id and confirmed = false
    ),
    'equipment', coalesce((
      select sum(-amount) from tx, ty
      where amount < 0 and category in ('tools', 'equipment') and d >= ty.start
    ), 0),
    'week', jsonb_build_object(
      'income', coalesce((select sum(amount) from tx where amount >= 0 and d >= current_date - 7), 0),
      'expenses', coalesce((select sum(-amount) from tx where amount < 0 and d >= current_date - 7), 0),
      'activeDays', (select count(distinct d) from tx where d >= current_date - 7)
    ),
    'categories', coalesce((
      select jsonb_agg(distinct category) from tx, ty
      where amount < 0 and income_type = 'trade' and d >= ty.start and category <> ''
    ), '[]'::jsonb),
    'property', jsonb_build_object(
      'rents', coalesce((select sum(amount) from tx, ty where income_type = 'property' and amount >= 0 and d >= ty.start), 0),
      'expenses', coalesce((select sum(-amount) from tx, ty
        where income_type = 'property' and amount < 0 and d >= ty.start
          and category not like '%mortgage%' and category not like '%interest%'
          and vendor not like '%mortgage%' and vendor not like '%interest%'), 0),
      'finance', coalesce((select sum(-amount) from tx, ty
        where income_type = 'property' and amount < 0 and d >= ty.start
          and (category like '%mortgage%' or category like '%interest%'
            or vendor like '%mortgage%' or vendor like '%interest%')), 0),
      'rents12', coalesce((select sum(amount) from tx where income_type = 'property' and amount >= 0), 0)
    )
  );
$$;
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Goals: what Rakha plans around (doc 82 section 5b). The user's own words
-- plus a number. vendor_note is the USER'S stated vendor, held and repeated
-- back, never sourced by us (the FCA line).
-- ---------------------------------------------------------------------------
create table if not exists public.user_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('purchase', 'income', 'savings')),
  title text not null,
  amount numeric not null check (amount > 0),
  target_date date,
  vendor_note text,
  status text not null default 'active' check (status in ('active', 'done', 'dropped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists user_goals_user_active
  on public.user_goals(user_id) where status = 'active';
alter table public.user_goals enable row level security;
drop policy if exists user_goals_own on public.user_goals;
create policy user_goals_own on public.user_goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Rakha on the lock screen (doc 82 section 5c). The token lands when the app
-- gains expo-notifications in the next EAS rebuild; until then the column sits
-- null and the cron's push path skips everyone. agent_push is the per user
-- "Rakha on your lock screen" switch, on by default like agent_pings.
-- ---------------------------------------------------------------------------
alter table public.users add column if not exists expo_push_token text;
alter table public.reminder_prefs add column if not exists agent_push boolean not null default true;
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- The property stream (doc 82 section 4, Phase E). No landlord mode: a
-- transaction simply belongs to a stream, trade by default so nothing
-- existing changes. Properties give rents a home per address; joint_share is
-- this user's ownership share (0 to 1) and scales their figures.
-- ---------------------------------------------------------------------------
create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  nickname text not null,
  joint_share numeric not null default 1 check (joint_share > 0 and joint_share <= 1),
  created_at timestamptz not null default now()
);
alter table public.properties enable row level security;
drop policy if exists properties_own on public.properties;
create policy properties_own on public.properties
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.transactions add column if not exists income_type text not null default 'trade';
alter table public.transactions drop constraint if exists transactions_income_type_check;
alter table public.transactions add constraint transactions_income_type_check
  check (income_type in ('trade', 'property'));
alter table public.transactions add column if not exists property_id uuid references public.properties(id) on delete set null;
create index if not exists transactions_user_stream
  on public.transactions(user_id, income_type);
notify pgrst, 'reload schema';

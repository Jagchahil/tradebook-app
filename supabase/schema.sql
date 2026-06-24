-- Enable UUID extension
create extension if not exists "pgcrypto";

-- Users (identified by WhatsApp phone number)
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  phone_number text unique not null,
  name text,
  trade_type text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Transactions
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  amount numeric(10,2) not null,
  vendor text,
  category text check (category in ('materials', 'fuel', 'tools', 'subcontractors', 'food', 'professional_fees', 'other')),
  transaction_date date not null default current_date,
  description text,
  source_type text check (source_type in ('photo', 'voice', 'text')),
  raw_input_url text,
  confidence_score numeric(3,2),
  confirmed boolean default true,
  created_at timestamptz default now()
);

-- Monthly summaries (updated via trigger)
create table if not exists monthly_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  year int not null,
  month int not null,
  total_expenses numeric(10,2) default 0,
  transaction_count int default 0,
  updated_at timestamptz default now(),
  unique(user_id, year, month)
);

-- Audit log (immutable)
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  event_type text not null,
  event_data jsonb,
  created_at timestamptz default now()
);

-- Indexes
create index if not exists idx_transactions_user_id on transactions(user_id);
create index if not exists idx_transactions_date on transactions(transaction_date desc);
create index if not exists idx_users_phone on users(phone_number);

-- Waitlist
create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  phone_number text unique,
  email text,
  trade_type text,
  created_at timestamptz default now()
);

create index if not exists idx_waitlist_phone on waitlist(phone_number);

-- Function: upsert monthly summary with incrementing totals
create or replace function increment_monthly_summary(
  p_user_id uuid,
  p_year int,
  p_month int,
  p_amount numeric
) returns void language plpgsql as $$
begin
  insert into monthly_summaries (user_id, year, month, total_expenses, transaction_count, updated_at)
  values (p_user_id, p_year, p_month, p_amount, 1, now())
  on conflict (user_id, year, month)
  do update set
    total_expenses = monthly_summaries.total_expenses + excluded.total_expenses,
    transaction_count = monthly_summaries.transaction_count + 1,
    updated_at = now();
end;
$$;

-- "Not business": keep personal money out of the books, and out of the tax bill.
--
-- THE BUG THIS FIXES.
--
-- The bank feed categoriser falls back to "income" for any credit it cannot
-- identify. That is a fine guess. It became a dangerous fact the moment the entry
-- was confirmed, because every tax figure we produce sums confirmed entries.
--
-- Real books, looked at on 11 July 2026, counted ALL of this as trading income:
--
--   CHILD TAX CREDIT          +£345.13
--   CIRCLE UK TRADING REFUND   +£50.59
--   MR JOHN SMITH             +£137.60
--
-- A benefit is not earnings. A refund is your own money coming back. So the profit
-- was overstated, and therefore so was the tax. "Lekhio told me I owed tax on my
-- child benefit" is the worst sentence anyone could write about this product.
--
-- is_personal marks money that is not business money. It is EXCLUDED from every
-- tax figure and from every share, automatically. The row is kept, not deleted, so
-- the user can always see it, change their mind, and so the books remain a true
-- record of what came through the account.
--
-- We only ever SUGGEST. The user decides. See lib/personal.ts.
--
-- Safe to re-run.

alter table public.transactions
  add column if not exists is_personal boolean not null default false;

-- Every tax figure now filters on this, so it is on the hot path of the quarterly
-- summary, the set aside, and the shared books view.
create index if not exists transactions_business_idx
  on public.transactions (user_id, is_personal, confirmed, transaction_date desc);

comment on column public.transactions.is_personal is
  'True when this is not business money (a benefit, a refund, gambling, a personal transfer, moving your own savings). Excluded from all tax figures and from all shared views. Suggested by lib/personal.ts, never applied without the user saying yes.';

-- Verify: the column exists and nothing has been marked yet.
select
  (select count(*) from information_schema.columns
    where table_name = 'transactions' and column_name = 'is_personal') as column_added,
  (select count(*) from public.transactions where is_personal = true)  as marked_personal;

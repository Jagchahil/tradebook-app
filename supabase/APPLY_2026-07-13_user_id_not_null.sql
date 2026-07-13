-- Applied to production 13 July 2026. Recorded here because a change made in the SQL editor and
-- nowhere else is a change that only one person knows about.
--
-- WHAT WAS WRONG
--
-- supabase/schema.sql declares:   user_id uuid not null references public.users (id)
-- Production actually had:        user_id uuid NULL
--
-- So the database would accept a transaction that BELONGS TO NOBODY.
--
-- WHY THAT MATTERS IN THIS PRODUCT, and it is not an abstract integrity concern.
--
-- A man photographs a receipt and sends it on WhatsApp. If the phone-number match fails for any
-- reason and any code path inserts the row without a user_id, then:
--
--   . the database accepts it,
--   . RLS makes it invisible to everyone, because `auth.uid() = NULL` is never true,
--   . it appears in nobody's totals and on nobody's tax return,
--   . and he gets a confirmation message.
--
-- He thinks it is logged. It is nowhere. That is a SILENT LOSS OF A USER'S MONEY DATA, which is the
-- exact failure shape this codebase keeps producing: everything succeeds, and nothing happened.
--
-- HOW IT WAS FOUND
--
-- Not by reading the schema. Six audits read the schema. It was found by writing a script that
-- attacked production with two real users, hitting a NOT NULL constraint the file said did not
-- exist, and then asking the database what it actually is instead of what we had written down.
--
-- Read the system, not the file.

-- Zero orphans existed when this ran, so nothing needed backfilling. If this is ever re-run against
-- a database that has them, it will FAIL rather than silently discard somebody's receipts. That is
-- deliberate: those rows are a person's money and a human should look at them.
select count(*) as orphan_transactions_must_be_zero
from public.transactions
where user_id is null;

alter table public.transactions
  alter column user_id set not null;

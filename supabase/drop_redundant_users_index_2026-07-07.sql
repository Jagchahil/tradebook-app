-- Drop the redundant duplicate index on public.users (Supabase advisor cleanup, 7 July 2026)
--
-- Context: schema.sql historically declared the same partial unique index on
-- users(phone_number) twice under two names:
--   users_phone_unique_idx  (canonical "one phone one account" backstop, kept)
--   users_phone_unique      (older twin, redundant, dropped here)
-- Postgres built both as separate physical indexes, which is the single remaining
-- Supabase performance advisor warning ("duplicate index"). They are byte identical
-- in definition, so dropping one changes no query behaviour and the unique
-- constraint is fully preserved by users_phone_unique_idx.
--
-- Run this in the Supabase SQL editor (project tradebook-prod), then re-run the
-- performance advisor to confirm it clears. Safe and idempotent.

drop index if exists public.users_phone_unique;

-- Optional extra tidy (not required to clear the advisor): the plain, non unique
-- index below is also redundant because the surviving unique index already serves
-- phone_number lookups. Uncomment to drop it too if the advisor later flags it.
-- drop index if exists public.users_phone_idx;

notify pgrst, 'reload schema';

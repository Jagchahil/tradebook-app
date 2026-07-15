-- SEAMLESS ONBOARDING: carry the web /start answers into the user's account.
--
-- `streams` stores the income streams the user ticked on /start (job, property, loan), which used
-- to be dropped. `reconciled_at` marks a signup once reconcileSignupToUser has applied it, so it can
-- never double-apply. `created_at` is added defensively so "the latest signup for this phone" has a
-- deterministic order (no-op if the column already exists).
--
-- The signups table is service-role only (no RLS policies), and reconcileSignupToUser runs with the
-- service role, so no grants or policies change here.

alter table public.signups add column if not exists streams text[];
alter table public.signups add column if not exists reconciled_at timestamptz;
alter table public.signups add column if not exists created_at timestamptz not null default now();

-- ============================================================================
-- Supabase advisor fixes, 7 July 2026. Paste this whole file into the
-- Supabase SQL editor and Run. It is idempotent and wrapped in a transaction,
-- so it is safe to run more than once and never leaves a table unprotected.
--
-- Clears:
--   . 25 performance warnings ("Auth RLS Initialization Plan")
--   . 3 unindexed foreign keys (audit_log, properties, transactions.property_id)
--   . 3 security warnings (2 SECURITY DEFINER execute grants + 1 search_path)
-- The 3 security lines were already applied by hand; they are repeated here so
-- this file is the single source of truth, and re-applying them is a no-op.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Security. Lock the two server-only SECURITY DEFINER functions to the
--    service role (both are only ever called server-side), and pin the
--    search_path on the aggregates function.
-- ----------------------------------------------------------------------------
revoke execute on function public.increment_ai_usage(text, text) from anon, authenticated, public;
revoke execute on function public.enforce_phone_binding() from anon, authenticated, public;
alter function public.agent_user_aggregates(uuid) set search_path = '';

-- ----------------------------------------------------------------------------
-- 2. Performance. Wrap auth.uid() in a scalar subquery so Postgres evaluates
--    it once per query instead of once per row. Same access rule, big speedup
--    at scale. Drop and recreate each flagged policy, inside the transaction.
-- ----------------------------------------------------------------------------

-- users
drop policy if exists users_select_own on public.users;
create policy users_select_own on public.users
  for select using ((select auth.uid()) = id);
drop policy if exists users_insert_own on public.users;
create policy users_insert_own on public.users
  for insert with check ((select auth.uid()) = id);
drop policy if exists users_update_own on public.users;
create policy users_update_own on public.users
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- transactions
drop policy if exists transactions_select_own on public.transactions;
create policy transactions_select_own on public.transactions
  for select using ((select auth.uid()) = user_id);
drop policy if exists transactions_insert_own on public.transactions;
create policy transactions_insert_own on public.transactions
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists transactions_update_own on public.transactions;
create policy transactions_update_own on public.transactions
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists transactions_delete_own on public.transactions;
create policy transactions_delete_own on public.transactions
  for delete using ((select auth.uid()) = user_id);

-- monthly_summaries
drop policy if exists monthly_summaries_select_own on public.monthly_summaries;
create policy monthly_summaries_select_own on public.monthly_summaries
  for select using ((select auth.uid()) = user_id);

-- invoices
drop policy if exists invoices_select_own on public.invoices;
create policy invoices_select_own on public.invoices
  for select using ((select auth.uid()) = user_id);
drop policy if exists invoices_insert_own on public.invoices;
create policy invoices_insert_own on public.invoices
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists invoices_update_own on public.invoices;
create policy invoices_update_own on public.invoices
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists invoices_delete_own on public.invoices;
create policy invoices_delete_own on public.invoices
  for delete using ((select auth.uid()) = user_id);

-- events
drop policy if exists "events read own" on public.events;
create policy "events read own" on public.events
  for select using ((select auth.uid()) = user_id);
drop policy if exists "events insert own" on public.events;
create policy "events insert own" on public.events
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "events update own" on public.events;
create policy "events update own" on public.events
  for update using ((select auth.uid()) = user_id);
drop policy if exists "events delete own" on public.events;
create policy "events delete own" on public.events
  for delete using ((select auth.uid()) = user_id);

-- reminder_prefs
drop policy if exists "prefs read own" on public.reminder_prefs;
create policy "prefs read own" on public.reminder_prefs
  for select using ((select auth.uid()) = user_id);
drop policy if exists "prefs insert own" on public.reminder_prefs;
create policy "prefs insert own" on public.reminder_prefs
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "prefs update own" on public.reminder_prefs;
create policy "prefs update own" on public.reminder_prefs
  for update using ((select auth.uid()) = user_id);

-- hmrc_approvals
drop policy if exists hmrc_approvals_own on public.hmrc_approvals;
create policy hmrc_approvals_own on public.hmrc_approvals
  for select using ((select auth.uid()) = user_id);

-- agent_signals
drop policy if exists agent_signals_own_read on public.agent_signals;
create policy agent_signals_own_read on public.agent_signals
  for select using ((select auth.uid()) = user_id);
drop policy if exists agent_signals_own_update on public.agent_signals;
create policy agent_signals_own_update on public.agent_signals
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- user_goals
drop policy if exists user_goals_own on public.user_goals;
create policy user_goals_own on public.user_goals
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- properties
drop policy if exists properties_own on public.properties;
create policy properties_own on public.properties
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ----------------------------------------------------------------------------
-- 3. Performance. Covering indexes for the unindexed foreign keys, so joins
--    and cascade deletes stay fast as the tables grow.
-- ----------------------------------------------------------------------------
create index if not exists audit_log_user_idx       on public.audit_log(user_id);
create index if not exists properties_user_idx      on public.properties(user_id);
create index if not exists transactions_property_idx on public.transactions(property_id);

commit;

-- After running: open the Advisors page, click Refresh (or Rerun linter).
-- Performance warnings should drop from 25 to 0, and the 3 unindexed FK
-- info items should clear. The only remaining item is the optional
-- "Leaked password protection" auth toggle, which is a dashboard setting.

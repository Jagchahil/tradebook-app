-- THE TRIAL ENDING NUDGE. Two columns, and they are what stop us messaging a man twice.
--
-- Apply in the Supabase SQL editor. Safe to re-run.
--
-- WHY
--
-- The cron at /api/cron/trial runs every morning and asks: whose free trial is nearly up? Without
-- somewhere to record "we have already told him", it would ask that question again tomorrow, and
-- the day after, and he would get the same message every morning until he blocked the number.
--
-- These two columns are the memory. They are written BEFORE the message is sent, not after. See the
-- long note on markTrialNudged in lib/supabase.ts: if we sent first and marked second, a crash
-- between the two would repeat the message forever, and the opposite failure only ever costs him
-- one message he did not get. That is the cheaper mistake and it is the one we chose.

alter table public.subscriptions add column if not exists trial_warn_sent_at timestamptz;
alter table public.subscriptions add column if not exists trial_end_sent_at  timestamptz;

-- The cron reads exactly this shape every morning: local trials (no Stripe id) that have not yet
-- been told. Keep it cheap, because it runs whether or not anybody is due.
create index if not exists subscriptions_trial_nudge_idx
  on public.subscriptions (status, current_period_end)
  where stripe_subscription_id is null;

-- Verify: both columns exist.
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'subscriptions'
  and column_name in ('trial_warn_sent_at', 'trial_end_sent_at')
order by column_name;

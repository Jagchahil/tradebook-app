-- ONE FREE TRIAL PER PHONE NUMBER. ENFORCED BY THE DATABASE, NOT BY THE APPLICATION.
--
-- Apply in the Supabase SQL editor. Safe to re-run.
--
-- WHY
--
-- lib/supabase.ts grantTrialIfNone() reads "does this phone have a subscription row?" and, if not,
-- inserts a 14 day trial. Two app launches a moment apart would both read "no", and both insert.
-- He would get two trials, and the count of paying users would be wrong forever after.
--
-- Checking before inserting is not a rule. It is a hope. The rule is a unique index.
--
-- PARTIAL, on purpose: it applies ONLY to rows with no stripe_subscription_id, which is to say
-- only to the trials and comps that WE grant. Real Stripe subscriptions are untouched, so a man
-- who trials, subscribes, cancels and subscribes again still accumulates his real Stripe rows
-- exactly as before. What he cannot ever do is collect a second free fortnight.
--
-- The demo account (supabase/demo_seed.sql) is also a local grant with no Stripe id, so it is
-- covered by this index too: exactly one, and demo_seed deletes before it inserts.

-- Any duplicates already sitting there? There should be none: nothing has ever granted a trial.
-- If this returns a row, DO NOT create the index yet. Look at the rows first: they are somebody's
-- billing history, and quietly deleting one is how a paying customer loses his subscription.
select phone, count(*) as local_rows
from public.subscriptions
where stripe_subscription_id is null and phone is not null
group by phone
having count(*) > 1;

create unique index if not exists subscriptions_one_local_grant_per_phone
  on public.subscriptions (phone)
  where stripe_subscription_id is null and phone is not null;

-- Verify: the index exists.
select indexname from pg_indexes
where tablename = 'subscriptions' and indexname = 'subscriptions_one_local_grant_per_phone';

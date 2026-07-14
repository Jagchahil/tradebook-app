-- THE ONLY WAY MRR EVER GETS A HISTORY: BY US WRITING IT DOWN, EVERY DAY, FROM TODAY.
--
-- Apply in the Supabase SQL editor. Safe to re-run.
--
-- WHY THIS TABLE HAS TO EXIST, AND WHY IT CANNOT BE BACKFILLED
--
-- A subscription row holds its CURRENT status and the time it was LAST touched. It does not hold a
-- history. So a man who subscribed in June and cancelled in July is, in that table, indistinguishable
-- from a man who never subscribed at all: one row, status 'canceled', updated last week.
--
-- Which means ANY chart of "MRR over time" drawn from the subscriptions table is a RECONSTRUCTION.
-- And a reconstruction, with a trend line on it, on the screen a founder uses to decide whether to
-- keep going, is not a chart. It is a lie he will raise money against.
--
-- So we do not reconstruct it. We start writing it down, once a day, and the page says "history
-- starts today" until there is some. Not knowing is not the same as being fine.
--
-- One row per day. The cron at /api/cron/metrics upserts, so running it twice in a day corrects the
-- day rather than duplicating it.

create table if not exists public.metrics_daily (
  day         date primary key,
  customers   integer not null default 0,   -- real customers. Internal accounts are NOT customers.
  paying      integer not null default 0,   -- active + past_due
  trialing    integer not null default 0,
  canceled    integer not null default 0,
  mrr_pence   integer not null default 0,   -- what Stripe is ACTUALLY charging. Not a price lookup.
  recorded_at timestamptz not null default now()
);

-- Service role only. This is the company's revenue history and nobody's browser needs it.
alter table public.metrics_daily enable row level security;
-- No policies, deliberately. Deny by default is the strongest state and the correct one here.

-- Verify.
select
  (select count(*) from public.metrics_daily) as days_recorded,
  (select indexname from pg_indexes where tablename = 'metrics_daily' limit 1) as pk;

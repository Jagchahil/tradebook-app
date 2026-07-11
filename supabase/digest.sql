-- The daily digest, and the free window.
--
-- last_inbound_at is the whole economics of this feature.
--
-- Meta does not charge for a WhatsApp message sent inside the 24 hour window that
-- opens when the USER last messaged. So a man who replies YES to his digest keeps
-- his own window open, and tomorrow's digest costs us NOTHING. The confirmation
-- loop pays for itself.
--
-- Without this column we would have to assume every send is a paid template. Our
-- entire WhatsApp budget is 57.8p per user per month, which is nineteen sends
-- (lib/margin.ts), so assuming the worst would mean sending far less than we can
-- actually afford.
--
-- last_digest_at stops us sending twice in a day. Twice is nagging, and nagging on
-- WhatsApp gets a business number blocked, which would end the product outright.
--
-- Safe to re-run.

alter table public.users add column if not exists last_inbound_at timestamptz;
alter table public.users add column if not exists last_digest_at  timestamptz;

comment on column public.users.last_inbound_at is
  'When this user last sent us a WhatsApp message. Inside 24 hours of it, our sends are FREE (Meta customer service window). Drives lib/digest.ts.';
comment on column public.users.last_digest_at is
  'When we last sent this user a daily digest. One a day, never two.';

-- The digest cron walks users who have something to tell. This index keeps that a
-- cheap lookup rather than a table scan at 100k users.
create index if not exists transactions_undigested_idx
  on public.transactions (user_id, confirmed, source_type, created_at desc)
  where confirmed = false;

select
  (select count(*) from information_schema.columns
    where table_name = 'users' and column_name in ('last_inbound_at', 'last_digest_at')) as columns_added;

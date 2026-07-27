-- ============================================================================
-- WEEKLY UPDATE FACTS. Card B: "Weekly WhatsApp update, toggle-able".
--
-- One bulk RPC for the page of users about to receive the Sunday evening
-- weekly WhatsApp update (job=weekly in app/api/cron/reminders/route.ts),
-- feeding lib/weeklyupdate.ts's personalLine(). Same shape and the same
-- reason as weekly_totals_for below it: ONE row per user in ONE round trip,
-- never one query per user, because this runs over the whole active base
-- every week and weekly_totals_for's own header already explains why that
-- once took the digest down.
--
-- Three facts, three sources:
--
--   rolling12m_taxable_turnover   Trade transactions only (income_type = 'trade',
--                                 or no income_type set, which defaults to 'trade'),
--                                 trailing 12 months. NULL for a user whose account
--                                 is under 3 months old: not enough history to say
--                                 honestly, the same ENOUGH_MONTHS rule lib/ledger.ts
--                                 already applies ("not enough is not zero"). If
--                                 ENOUGH_MONTHS ever changes in lib/ledger.ts, this
--                                 3 month literal has to change with it by hand, SQL
--                                 cannot import a TypeScript constant.
--
--   vat_registered                The vat_registered CIRCUMSTANCE (lib/circumstances.ts),
--                                 not a users table column: it is collected pre
--                                 onboarding on the web signup form and reconciled
--                                 into public.circumstances by reconcileSignupToUser().
--                                 answer = 'yes' means true. No row, or any other
--                                 answer, means false, which is the safe default: a
--                                 user we have not heard from still sees the threshold
--                                 fact if his own turnover warrants it.
--
--   ytd_gross_qualifying_income   Trade AND property transactions, this UK tax year
--                                 to date. Same base lib/quarterpack.ts's own
--                                 grossQualifyingIncome uses for the MTD test.
--
-- All three filter is_personal = false, same as weekly_totals_for: personal money
-- is not business money, anywhere.
create or replace function public.weekly_update_facts_for(p_user_ids uuid[])
returns table (
  user_id uuid,
  rolling12m_taxable_turnover numeric,
  vat_registered boolean,
  ytd_gross_qualifying_income numeric
)
language sql
security definer
set search_path = public
as $$
  with ty as (
    select case
      when extract(month from current_date) > 4
        or (extract(month from current_date) = 4 and extract(day from current_date) >= 6)
      then make_date(extract(year from current_date)::int, 4, 6)
      else make_date(extract(year from current_date)::int - 1, 4, 6)
    end as start
  ),
  turnover as (
    select t.user_id,
      sum(case when t.amount >= 0 and coalesce(t.income_type, 'trade') = 'trade' then t.amount else 0 end) as trade12
    from public.transactions t
    where t.user_id = any(p_user_ids)
      and t.confirmed = true
      and t.is_personal = false
      and coalesce(t.transaction_date, t.created_at::date) >= (current_date - interval '12 months')::date
    group by t.user_id
  ),
  ytd as (
    select t.user_id,
      sum(case when t.amount >= 0 then t.amount else 0 end) as gross
    from public.transactions t, ty
    where t.user_id = any(p_user_ids)
      and t.confirmed = true
      and t.is_personal = false
      and coalesce(t.transaction_date, t.created_at::date) >= ty.start
    group by t.user_id
  ),
  vat as (
    select user_id, (answer = 'yes') as registered
    from public.circumstances
    where user_id = any(p_user_ids) and key = 'vat_registered'
  )
  select
    u.id as user_id,
    case when u.created_at <= now() - interval '3 months'
      then coalesce(turnover.trade12, 0)
      else null
    end as rolling12m_taxable_turnover,
    coalesce(vat.registered, false) as vat_registered,
    coalesce(ytd.gross, 0) as ytd_gross_qualifying_income
  from public.users u
  left join turnover on turnover.user_id = u.id
  left join ytd on ytd.user_id = u.id
  left join vat on vat.user_id = u.id
  where u.id = any(p_user_ids);
$$;

revoke all on function public.weekly_update_facts_for(uuid[]) from public, anon, authenticated;
grant execute on function public.weekly_update_facts_for(uuid[]) to service_role;

-- Verify: expect 1 row, 'weekly_update_facts_for'.
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'weekly_update_facts_for';

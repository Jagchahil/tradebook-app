-- CRITICAL. Run this BEFORE the next web deploy.
--
-- THE BUG. We shipped "not business" today: a man taps it on CHILD TAX CREDIT, the
-- app takes the benefit out of his tax figures, and every REST query respects it.
--
-- Then he texts Lekhio "what do I owe", and the benefit is STILL IN THERE.
--
-- Because the three functions below, which are what WhatsApp and Rakha actually
-- answer from, filter `confirmed = true` and nothing else. They never learned about
-- is_personal. So the app told him one number and the text told him another, and the
-- one he trusts is the text.
--
-- That is worse than not shipping the feature at all. A man who has been told his
-- benefit is out of his books, and is then quoted a tax bill that still includes it,
-- has no way to know which number is lying to him.
--
-- Three functions, one missing line each:
--   user_totals            every WhatsApp money answer: what have I made, what do I
--                          owe, NI, student loan, the set aside, goals
--   weekly_totals_all      the Monday brief
--   agent_user_aggregates  everything Rakha says, and the whole tax optimiser
--
-- Safe to re-run.

-- 1. The WhatsApp money answers.
create or replace function public.user_totals(p_user_id uuid, p_since date, p_category text)
returns table (income numeric, expenses numeric, cis numeric, count bigint)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(sum(case when t.amount >= 0 then t.amount end), 0) as income,
    coalesce(sum(case when t.amount < 0 then -t.amount end), 0) as expenses,
    coalesce(sum(coalesce(t.cis_deduction, 0)), 0) as cis,
    count(*) as count
  from public.transactions t
  where t.user_id = p_user_id
    and t.confirmed = true
    and t.is_personal = false          -- <- the missing line
    and (p_since is null or coalesce(t.transaction_date, t.created_at::date) >= p_since)
    and (p_category is null or t.category = p_category);
$$;

revoke all on function public.user_totals(uuid, date, text) from public, anon, authenticated;
grant execute on function public.user_totals(uuid, date, text) to service_role;

-- 2. The Monday brief.
create or replace function public.weekly_totals_all()
returns table (user_id uuid, income numeric, expenses numeric)
language sql
security definer
set search_path = public
as $$
  select
    t.user_id,
    coalesce(sum(case when t.amount >= 0 then t.amount end), 0) as income,
    coalesce(sum(case when t.amount < 0 then -t.amount end), 0) as expenses
  from public.transactions t
  where t.confirmed = true
    and t.is_personal = false          -- <- the missing line
    and coalesce(t.transaction_date, t.created_at::date) >= (current_date - 7)
  group by t.user_id;
$$;

revoke all on function public.weekly_totals_all() from public, anon, authenticated;
grant execute on function public.weekly_totals_all() to service_role;

-- 3. Rakha and the tax optimiser. The `tx` CTE is the source for every figure this
--    function produces, so one line at the top fixes all of them.
--
--    NOTE the second, separate fix inside: the 'unconfirmed' count is its own query
--    and it also has to skip personal money, or Rakha nags a man to go and confirm a
--    child tax credit he has already told us to leave out.
create or replace function public.agent_user_aggregates(p_user_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with ty as (
    select case
      when current_date >= make_date(extract(year from current_date)::int, 4, 6)
        then make_date(extract(year from current_date)::int, 4, 6)
      else make_date(extract(year from current_date)::int - 1, 4, 6)
    end as start
  ),
  tx as (
    select coalesce(transaction_date, created_at::date) as d,
           amount,
           coalesce(cis_deduction, 0) as cis,
           lower(coalesce(category, '')) as category,
           lower(coalesce(vendor, '')) as vendor,
           coalesce(income_type, 'trade') as income_type
    from public.transactions
    where user_id = p_user_id
      and confirmed = true
      and is_personal = false          -- <- the missing line
      and coalesce(transaction_date, created_at::date) >= (current_date - interval '12 months')::date
  )
  select jsonb_build_object(
    'months', coalesce((
      select jsonb_agg(jsonb_build_object('month', m, 'income', inc, 'expenses', exp, 'cis', c) order by m)
      from (
        select to_char(d, 'YYYY-MM') as m,
               sum(case when amount >= 0 then amount else 0 end) as inc,
               sum(case when amount < 0 then -amount else 0 end) as exp,
               sum(c1s.cis) as c
        from tx c1s
        group by 1
      ) buckets
    ), '[]'::jsonb),
    'unconfirmed', (
      select count(*) from public.transactions
      where user_id = p_user_id
        and confirmed = false
        and is_personal = false        -- <- and here, or Rakha nags him to confirm a benefit
    ),
    'equipment', coalesce((
      select sum(-amount) from tx, ty
      where amount < 0
        and tx.d >= ty.start
        and tx.category in ('tools', 'equipment')
    ), 0),
    'categories', coalesce((
      select jsonb_agg(distinct tx.category)
      from tx, ty
      where amount < 0 and tx.d >= ty.start and tx.category <> ''
    ), '[]'::jsonb),
    'property', (
      select jsonb_build_object(
        'rents',    coalesce(sum(case when amount >= 0 and tx.d >= ty.start then amount else 0 end), 0),
        'expenses', coalesce(sum(case when amount < 0 and tx.d >= ty.start and tx.category <> 'mortgage interest' then -amount else 0 end), 0),
        'finance',  coalesce(sum(case when amount < 0 and tx.d >= ty.start and tx.category = 'mortgage interest' then -amount else 0 end), 0),
        'rents12',  coalesce(sum(case when amount >= 0 then amount else 0 end), 0)
      )
      from tx, ty
      where tx.income_type = 'property'
    ),
    'week', (
      select jsonb_build_object(
        'income',     coalesce(sum(case when amount >= 0 then amount else 0 end), 0),
        'expenses',   coalesce(sum(case when amount < 0 then -amount else 0 end), 0),
        'activeDays', count(distinct d)
      )
      from tx
      where d >= (current_date - 7)
    )
  );
$$;

revoke all on function public.agent_user_aggregates(uuid) from public, anon, authenticated;
grant execute on function public.agent_user_aggregates(uuid) to service_role;

-- Verify: all three now mention is_personal.
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('user_totals', 'weekly_totals_all', 'agent_user_aggregates')
      and pg_get_functiondef(p.oid) like '%is_personal%') as functions_fixed;

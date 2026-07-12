-- SECTION 24. A landlord was getting FULL relief on his mortgage interest instead of the
-- restricted 20% credit, on the web and WhatsApp surface. And the app disagreed with both.
--
-- THE BUG. `agent_user_aggregates` split property costs like this:
--
--     'expenses', ... where category <> 'mortgage interest'
--     'finance',  ... where category =  'mortgage interest'
--
-- and NOTHING IN THE PRODUCT EVER EMITTED THE CATEGORY 'mortgage interest'. It was not in
-- CATEGORIES, `categoriseBankLine` could not produce it, and the WhatsApp handler never wrote it.
-- So `finance` was always 0, the interest fell into `expenses`, and `combinedBill()` deducted it
-- IN FULL.
--
-- For a higher rate landlord with £6,000 of mortgage interest that is roughly £2,400 of relief
-- claimed where the law allows a £1,200 credit. A £1,200 understatement of tax, on a return with
-- his name on it. The Section 24 warning signal could never fire either, because it is gated on
-- `property.finance >= 1000` and finance was always zero.
--
-- MEANWHILE THE APP USED A DIFFERENT RULE ENTIRELY (properties.tsx: a text search for "mortgage"
-- or "interest"), so the same landlord saw one number in the app and a different one from Rakha.
-- That is exactly the cross-surface disagreement fix_personal_in_rpcs.sql was written to end.
--
-- THE FIX. ONE test, used by both:
--
--     it is a finance cost IF the category is 'mortgage interest'
--                          OR the vendor mentions "mortgage"
--
-- The category is now real and selectable (lib/categories.ts). The vendor clause keeps every row
-- already in someone's books working, so nobody's figures silently change under them.
--
-- WHY THERE IS NO AUTO RULE for the word "mortgage" in categoriseBankLine: it would sweep up a
-- man's OWN HOME mortgage and claim tax relief on it. He chooses this category himself.
--
-- Safe to re-run.

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
           coalesce(income_type, 'trade') as income_type,
           -- THE ONE TEST. lib/propertyengine.ts and the app must agree with this exactly.
           (lower(coalesce(category, '')) = 'mortgage interest'
             or lower(coalesce(vendor, '')) like '%mortgage%') as is_finance
    from public.transactions
    where user_id = p_user_id
      and confirmed = true
      and is_personal = false
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
        and is_personal = false
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
        -- Ordinary property costs: everything that is NOT a finance cost.
        'expenses', coalesce(sum(case when amount < 0 and tx.d >= ty.start and not tx.is_finance then -amount else 0 end), 0),
        -- The Section 24 pot. Restricted to a 20% credit, never deducted in full.
        'finance',  coalesce(sum(case when amount < 0 and tx.d >= ty.start and tx.is_finance then -amount else 0 end), 0),
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

-- Verify: the function now separates finance costs, and still excludes personal money.
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'agent_user_aggregates'
      and pg_get_functiondef(p.oid) like '%is_finance%'
      and pg_get_functiondef(p.oid) like '%is_personal%') as fixed;   -- expect 1

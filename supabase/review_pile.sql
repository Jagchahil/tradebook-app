-- The pile. What a man faces the morning after he connects his bank.
--
-- Safe to re-run.


-- ============================================================================
-- looks_personal: THE UNSWEEPABLE FLAG
-- ============================================================================
--
-- Not the same thing as is_personal, and the difference is the whole point.
--
--   is_personal     HE has decided this is not business money. It leaves the books.
--   looks_personal  WE think it might not be. It stays in the books, and it can never be
--                   swept up by a bulk confirm. He gets asked, once, plainly.
--
-- Why not just exclude it automatically? Because the two ways of being wrong are not equal.
-- Wrongly excluding a supplier refund makes a man UNDER-DECLARE HIS INCOME, and that is a
-- worse thing to be wrong about than paying slightly too much tax. So we never decide this
-- for him. We only make sure he cannot rush past it.
--
-- THE BUG THIS EXISTS TO KILL. lib/banksync.ts only ran the personal check on vendors it
-- already knew (`if (known.source === 'none') continue`). On day one of a bank connect we know
-- NOTHING, and every CREDIT is categorised 'income'. So a CHILD TAX CREDIT landed in a man's
-- books labelled income, with no flag on it at all. It survived only because it arrived
-- unconfirmed and he would probably have caught it while tapping through one at a time.
--
-- The moment we ship "confirm two hundred things quickly", that stops being true. A fast
-- confirm over an unflagged pile is a machine for sweeping benefits into taxable income.
alter table public.transactions
  add column if not exists looks_personal boolean not null default false;

-- The review pile is exactly this: unconfirmed, from the bank, not already excluded. It is the
-- hottest query in the feature, so it gets its own index.
create index if not exists transactions_pile_idx
  on public.transactions (user_id, confirmed, source_type)
  where confirmed = false and is_personal = false;


-- ============================================================================
-- confirm_pile: ONE DECISION, MANY ROWS, AND A GUARD THAT LIVES IN THE DATABASE
-- ============================================================================
--
-- He says "yes, all fourteen Screwfix payments are materials". That is one tap covering
-- fourteen rows, and it must be one statement, not fourteen round trips.
--
-- THE GUARD IS HERE, NOT ONLY IN THE APP. lib/reviewpile.ts refuses to offer a fast confirm on
-- income or on anything flagged, and it is well tested. But a guard that lives only in the
-- client is a suggestion. Anyone can POST whatever ids they like. So the rule is enforced
-- again, in the one place that cannot be bypassed:
--
--   * never a CREDIT (amount >= 0). Income is what HMRC cares about and it is always asked.
--   * never anything with looks_personal. No exceptions, no override flag, no way round it.
--
-- Rows that fail the guard are simply not touched, and the count comes back so the caller can
-- see the difference and say something honest about it.
create or replace function public.confirm_pile(
  p_user     uuid,
  p_ids      uuid[],
  p_category text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_done integer;
begin
  if p_ids is null or array_length(p_ids, 1) is null then
    return 0;
  end if;

  -- A bulk confirm with no category would file fourteen rows under nothing at all.
  if p_category is null or length(trim(p_category)) = 0 or length(p_category) > 40 then
    return 0;
  end if;

  update public.transactions t
     set category  = lower(trim(p_category)),
         confirmed = true
   where t.id = any(p_ids)
     and t.user_id = p_user          -- his rows. Never anyone else's, whatever he posts.
     and t.confirmed = false
     and t.amount < 0                -- MONEY OUT ONLY. A credit is never bulk confirmed.
     and t.looks_personal = false    -- and nothing that smells of a benefit. Ever.
     and t.is_personal = false;

  get diagnostics v_done = row_count;
  return v_done;
end $$;

revoke all on function public.confirm_pile(uuid, uuid[], text) from public, anon, authenticated;
grant execute on function public.confirm_pile(uuid, uuid[], text) to service_role;


-- ============================================================================
-- Verify.
-- ============================================================================
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'transactions' and column_name = 'looks_personal'
  ) as flag_column,        -- expect 1
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'confirm_pile'
  ) as confirm_fn;         -- expect 1

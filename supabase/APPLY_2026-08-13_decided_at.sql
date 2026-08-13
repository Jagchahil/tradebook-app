-- ============================================================================
-- WHEN HE ACTUALLY DECIDED. R2-F11, 13 August 2026.
-- ============================================================================
--
-- The Home feed is a list of sentences about a man's money, and every one of
-- them was stamped with created_at: the moment the row ARRIVED. That is the
-- right time for "Logged PORTERS" and "Read your Booker receipt", because
-- arriving IS what happened.
--
-- It is the wrong time for "Filed PORTERS as stock", which happened when he
-- pressed the button. A florist who imported a statement at 15:04 and answered
-- her pile at 17:00 read a feed that said she had filed things at 15:04, an
-- hour before she had opened the screen.
--
-- One rendering, two moments, and no single timestamp could be true of both.
--
-- ⚠️ decided_at, NOT confirmed_at, DELIBERATELY. Three different presses are a
-- decision: confirming a cost, filing money in, and saying "not business". The
-- last one does not set confirmed at all and must still be a dated event in the
-- log, because deciding something is personal is a decision he made and a thing
-- that happened. A column called confirmed_at would have quietly excluded it and
-- left the same bug in a third of the cases.
--
-- ⚠️ NULLABLE, AND NULL IS HONEST. Every row already in every book was decided
-- before this column existed and there is no record of when. The feed falls back
-- to created_at for those, exactly as it does today, and lib/supabase.ts says so
-- in a comment rather than pretending the fallback is the real time.
--
-- No backfill. Inventing a decision time for a year of history would be writing
-- a fact nobody observed into a log, which is the opposite of what this is for.

alter table public.transactions
  add column if not exists decided_at timestamptz;

comment on column public.transactions.decided_at is
  'When the customer decided about this row: confirmed it, filed it as income, or said it was not '
  'business. NULL for rows decided before 13 August 2026, and for rows still waiting. Never '
  'backfilled: a decision time nobody observed is not a fact.';


-- ============================================================================
-- The confirms, each stamping the moment.
-- ============================================================================
--
-- ⚠️ THESE BODIES WERE GENERATED FROM THE ORIGINAL FILES, NOT RETYPED, AND THAT
-- IS NOT FUSSINESS. The first draft of this migration restated confirm_pile from
-- memory and silently dropped this guard:
--
--   if p_category is null or length(trim(p_category)) = 0 or length(p_category) > 40 then
--     return 0;
--   end if;
--
-- Without it a bulk confirm with an empty category files every row in the group
-- under nothing at all. A display fix would have removed a money guard. The
-- bodies below are the originals from supabase/review_pile.sql and
-- supabase/APPLY_2026-08-13_property_expense_stream.sql with ONE line added, and
-- test/decidedat.test.mjs holds them to that: every guard in the original must
-- still be in the copy.
-- ============================================================================

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
         confirmed = true,
         decided_at = now()   -- R2-F11
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


create or replace function public.confirm_pile_property(
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
  v_cat  text;
begin
  if p_ids is null or array_length(p_ids, 1) is null then
    return 0;
  end if;

  v_cat := lower(trim(coalesce(p_category, '')));

  -- THE ALLOWLIST, IN THE DATABASE, BECAUSE A CLIENT SIDE ALLOWLIST IS A
  -- SUGGESTION. These four are lib/propertylanes.ts's PROPERTY_CATEGORIES and
  -- the suite pins the two lists together.
  if v_cat not in ('mortgage interest', 'letting agent', 'property repairs', 'ground rent') then
    return 0;
  end if;

  update public.transactions t
     set category    = v_cat,
         income_type = 'property',   -- THE WHOLE POINT OF THIS FUNCTION
         confirmed   = true,
         decided_at = now()   -- R2-F11
   where t.id = any(p_ids)
     and t.user_id = p_user
     and t.confirmed = false
     and t.amount < 0                -- money out only, exactly as confirm_pile
     and t.looks_personal = false
     and t.is_personal = false;

  get diagnostics v_done = row_count;
  return v_done;
end $$;

revoke all on function public.confirm_pile_property(uuid, uuid[], text) from public, anon, authenticated;
grant execute on function public.confirm_pile_property(uuid, uuid[], text) to service_role;


-- ============================================================================
-- Verify.
-- ============================================================================
-- Expect one row: the new column.
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'transactions' and column_name = 'decided_at';

-- Expect two rows, both functions present with 3 arguments each.
select proname, pronargs
  from pg_proc
 where proname in ('confirm_pile', 'confirm_pile_property')
 order by proname;

-- ⚠️ confirm_income IS NOT TOUCHED BY THIS FILE. Money in and "not business" are
-- stamped by the application through their own PATCH, so no third function body
-- has to be restated anywhere. See markPersonal and confirmIncome in
-- lib/supabase.ts.

-- ============================================================================
-- THE PROPERTY EXPENSE STREAM. RUN 2, 12 August 2026.
-- ============================================================================
--
-- Money IN has had a property lane since 31 July (confirm_income with p_category
-- = 'rent', which sets income_type = 'property'). Money OUT never had one.
--
-- So a landlord's rents reached the property stream and her COSTS could not.
-- Her letting agent's fee could only be filed as 'other' and was deducted
-- against her TRADE. Her buy to let mortgage interest, filed under the app's own
-- 'mortgage interest' category, landed in trade as well and was deducted IN
-- FULL, which is the thing Section 24 stopped in 2020.
--
-- Everything downstream was already correct and starved of input:
-- lib/yeartodate.ts routes on income_type = 'property' and splits finance costs
-- out inside that branch; lib/propertyengine.ts holds the whole Section 24
-- reducer with the allowance exclusivity. They were computing on £0 of property
-- costs because nothing could write one.
--
-- This migration adds the missing door and nothing else. No existing row moves.
--
-- ============================================================================
-- confirm_pile_property: the same one-tap confirm, filed to the other stream
-- ============================================================================
--
-- A separate function rather than a fifth argument on confirm_pile, deliberately:
--
--   * confirm_pile has one job and a guard that is easy to read in full. Adding
--     a stream argument means every existing caller passes a default and the
--     guard grows a branch, which is how a guard stops being obvious.
--   * the allowlist here is DIFFERENT and much narrower. Only four categories
--     may reach the property stream, and naming them in the database means a
--     hand rolled POST cannot file 'materials' as a property cost.
--   * a missing function returns 0 through the same path every other RPC uses,
--     so an app deployed before this migration says "that did not file" rather
--     than pretending it worked.
--
-- The money guards are IDENTICAL to confirm_pile and that is on purpose: money
-- out only, never a flagged row, never anyone else's rows. A property cost is
-- still a cost and gets no relaxation for being one.

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
         confirmed   = true
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
-- Expect one row, with proname = 'confirm_pile_property'.
select proname, pronargs
  from pg_proc
 where proname = 'confirm_pile_property';

-- ============================================================================
-- AFTER APPLYING: the repair for the account that was already wrong.
-- ============================================================================
--
-- Rows already confirmed under 'mortgage interest' are sitting in the trade
-- stream and are being deducted in full. They cannot be left there: the fix
-- only changes what happens NEXT unless the existing rows move too.
--
-- READ IT FIRST. This SELECT shows exactly what the UPDATE below would touch,
-- for one user, and nothing else. Run it, look at the rows, and only then
-- decide.
--
--   select id, transaction_date, vendor, amount, category, income_type
--     from public.transactions
--    where user_id = '<USER_ID>'
--      and confirmed = true
--      and amount < 0
--      and lower(category) = 'mortgage interest'
--      and coalesce(income_type, '') <> 'property'
--    order by transaction_date;
--
-- Then, only if those rows are all residential letting interest:
--
--   update public.transactions
--      set income_type = 'property'
--    where user_id = '<USER_ID>'
--      and confirmed = true
--      and amount < 0
--      and lower(category) = 'mortgage interest'
--      and coalesce(income_type, '') <> 'property';
--
-- ⚠️ NOT RUN AUTOMATICALLY, AND NOT WIDENED BEYOND 'mortgage interest'. A
-- customer may have filed his own HOME mortgage under this category, in which
-- case it should be personal rather than either stream, and only he knows.
-- Moving 'other' rows that "look like" agent fees would be the same guess this
-- codebase refuses everywhere else.

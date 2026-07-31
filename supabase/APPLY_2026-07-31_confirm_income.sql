-- APPLY 2026-07-31: confirm_income, the other half of confirm_pile. Run this whole file in the
-- Supabase SQL editor. It is idempotent.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 🔴 WHY THIS EXISTS: £420 OF A CUSTOMER'S INCOME WAS INVISIBLE, AND IT WAS INVISIBLE ON PURPOSE.
--
-- Found by importing a real bank statement on the live site on 31 July 2026. Six rows landed. Four
-- costs queued correctly. The two payments IN were read correctly, kept out of the expense queue
-- correctly, and then shown as one sentence: "2 of them are money in rather than money out. Those
-- are kept separate and are not waiting on you here."
--
-- And they were not waiting on him anywhere else either. /app/money lists only what he has
-- confirmed. The dashboard counted four things waiting, not six. There was no screen in the product
-- that listed unconfirmed income at all.
--
-- ⚠️ IT WAS A DELIBERATE DEFERRAL WHOSE OTHER HALF WAS NEVER BUILT. app/app/pile/page.tsx says so
-- in its own words: "confirm_pile refuses it outright, so it is counted in one honest line rather
-- than listed as rows he cannot act on, which would fail doc 103's empty test on every visit."
-- That reasoning is right about the screen and wrong about the money. A row he cannot act on
-- anywhere is not a tidy screen, it is income that never reaches his tax figures.
--
-- 🔴 AND UNDERSTATING INCOME IS THE ONE DIRECTION OF ERROR THIS PRODUCT MUST NEVER MAKE EASY.
-- app/app/money/add/page.tsx already says exactly that. An expense he forgets costs him money. An
-- income he never sees costs him a penalty, and it is the side HMRC actually looks at.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- WHY IT IS A SEPARATE FUNCTION AND NOT A FLAG ON confirm_pile.
--
-- confirm_pile exists to file MANY rows on ONE tap: fourteen Screwfix payments, one question. Its
-- guard is `amount < 0`, and the comment on it is the reason: "never a CREDIT. Income is what HMRC
-- cares about and it is always asked."
--
-- That rule is right and this function does not weaken it. Money in is still never swept up in a
-- bulk confirm across the whole pile: the screen asks about one payer at a time and this function
-- is called with one group's ids. What changes is only that there is now a door at all.
--
-- THE GUARDS, and they are the mirror image of confirm_pile's:
--   * money IN only (amount > 0). This function can never touch a cost.
--   * his rows only, whatever he posts.
--   * never anything with looks_personal. Those are the careful pile, which offers striking out
--     and never confirming, and that is unchanged. A flagged credit stays visible and unconfirmed
--     rather than being filed as income by a screen he tapped quickly.
--   * never already confirmed, and never is_personal.
--   * the category may only be 'income' or 'rent'. A credit filed as 'materials' would put income
--     on the expense side of his return, which is the bug lib/money.ts and the manual entry route
--     both already refuse at their own doors.
--
-- 🔴 income_type IS SET ONLY WHEN THE CATEGORY IS 'rent', AND ONLY EVER TO 'property'.
-- HMRC taxes the two streams differently: no National Insurance on rent, and Section 24 on the
-- mortgage interest. A rent payment filed as trade income overstates his Class 4 bill. This mirrors
-- app/api/money/manual, so every property income row in the product looks the same to every reader.
--
-- REVERSIBLE, like everything else here. A confirmed row is not final: it stays in his money log
-- and the same routes that undo a filed cost undo a filed payment.
--
-- UNTIL THIS FILE IS RUN the function does not exist, confirmIncome returns 0, and the income
-- section tells him plainly that it could not file it rather than claiming it did.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.confirm_income(
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

  -- 🔴 TWO WORDS, AND NOTHING ELSE IS ACCEPTED. Not a length check, not a sanitiser: an allowlist.
  -- Money in is either his trade income or it is rent, and the caller does not get to invent a
  -- third thing. Anything else files nothing and the count comes back zero.
  if v_cat not in ('income', 'rent') then
    return 0;
  end if;

  update public.transactions t
     set category    = v_cat,
         -- Only rent carries a stream, and it is only ever set, never cleared: nothing here
         -- rewrites a row that already knows what it is.
         income_type = case when v_cat = 'rent' then 'property' else t.income_type end,
         confirmed   = true
   where t.id = any(p_ids)
     and t.user_id = p_user          -- his rows. Never anyone else's, whatever he posts.
     and t.confirmed = false
     and t.amount > 0                -- MONEY IN ONLY. The exact mirror of confirm_pile.
     and t.looks_personal = false    -- the careful pile is struck out, never confirmed here.
     and t.is_personal = false;

  get diagnostics v_done = row_count;
  return v_done;
end $$;

revoke all on function public.confirm_income(uuid, uuid[], text) from public, anon, authenticated;
grant execute on function public.confirm_income(uuid, uuid[], text) to service_role;

-- The verify. One row back, and the two guards visible in the source.
select
  p.proname                                            as function_name,
  pg_get_function_result(p.oid)                        as returns,
  position('amount > 0' in pg_get_functiondef(p.oid))  > 0 as money_in_only,
  position('looks_personal = false' in pg_get_functiondef(p.oid)) > 0 as refuses_flagged
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'confirm_income';

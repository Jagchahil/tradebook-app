-- THE WEB SIGNUP COULD NOT SAY "TWO OF US", AND THE PRODUCT HAS BEEN READY FOR HIM SINCE 17 JULY.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- WHY. /start step 2 offered three answers: just me, a business name, a limited company. A
-- partnership was not one of them, so two people running a business together picked "A business
-- name", and lib/supabase.ts tradeTypeToBusinessType folded that to sole_trader. That file said so
-- out loud: "Partnership is not offered on the web, so it never arrives here."
--
-- GOV.UK, set up a business partnership: "each partner pays tax on their share." A partnership
-- keeps ONE set of books, and Lekhio sees all of it. Filed as a sole trader, every figure the
-- product shows a partner is the WHOLE FIRM'S: his set aside, his estimated bill, his Ways to
-- save, and the income summary a mortgage lender reads. Commit 0e9175e2 fixed exactly that defect
-- on the proof of income document for partners we already knew about. This closes the door that
-- was still creating new ones.
--
-- ⚠️ THE STRUCTURE ALONE IS NOT ENOUGH, WHICH IS WHY THIS COLUMN EXISTS. getBusinessProfile reads
-- a missing partnership_share as 100%, deliberately, so a half answered setup can never quietly
-- halve a sole trader's tax. That default is right for everybody except the one person the column
-- is for. So /start now asks the share on the same screen, with no prefilled guess, and this is
-- where it waits between signing up and proving the email address.
--
-- ⚠️ NULLABLE, AND NULL MEANS NOBODY WAS ASKED. Every signup written before today keeps exactly
-- the behaviour it has. Nothing is reinterpreted retrospectively, and app/app/setup still asks
-- anyone who arrives without an answer.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------------------------
-- PART 1. READ ONLY. Who this would have applied to. Run it first; it writes nothing.
--
-- Every one of these is somebody who may be a partnership sitting in the database as a sole
-- trader. It cannot be corrected from here, because only he knows: "A business name" is the
-- correct and common answer for a sole trader with a sign on his van. It is here so you know the
-- size of it, and so /app/setup can be pointed at them if there are any.
-- ---------------------------------------------------------------------------------------------
select
  count(*) filter (where trade_type = 'business')                as picked_a_business_name,
  count(*) filter (where trade_type = 'sole')                    as picked_just_me,
  count(*) filter (where trade_type = 'ltd')                     as picked_limited_company,
  count(*) filter (where trade_type = 'partnership')             as picked_partnership,
  count(*)                                                        as signups_total
from public.signups;

-- ---------------------------------------------------------------------------------------------
-- PART 2. THE CHANGE. One nullable column, with a constraint that matches the code.
--
-- 1 to 100, whole numbers. 0 is not an answer anybody means and would tell the engine he earns
-- nothing at all; over 100 is not a share of anything. app/api/onboard and lib/supabase.ts
-- createSignup each clamp to the same range independently, so this is the third door on one rule
-- and none of the three trusts the other two.
-- ---------------------------------------------------------------------------------------------
alter table public.signups
  add column if not exists partnership_share integer;

alter table public.signups
  drop constraint if exists signups_partnership_share_check;

alter table public.signups
  add constraint signups_partnership_share_check
  check (partnership_share is null or (partnership_share >= 1 and partnership_share <= 100));

comment on column public.signups.partnership_share is
  'Partnerships only. The individual partner''s percentage share of firm profit, 1 to 100, as he '
  'gave it at /start step 2. NULL means nobody asked, which is every row before 4 August 2026 and '
  'every signup that is not a partnership. Reconciled onto users.partnership_share when he proves '
  'his email address. See lib/supabase.ts reconcileSignupToUser.';

-- ---------------------------------------------------------------------------------------------
-- PART 3. VERIFY. Run this last.
--
-- IT MUST RETURN EXACTLY ONE ROW, and that row must read:
--
--   column_name        data_type   is_nullable
--   partnership_share  integer     YES
--
-- Anything else, including no rows at all, means PART 2 did not apply and the signup will silently
-- drop the answer he gave.
-- ---------------------------------------------------------------------------------------------
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'signups'
  and column_name = 'partnership_share';

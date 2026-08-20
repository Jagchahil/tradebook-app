-- 🔴 THE BACKFILL FOR ROWS FILED BEFORE B62. 20 August 2026. Apply in the Supabase SQL editor.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- WHAT THIS IS FOR, AND WHY IT IS NOT A SWEEP.
--
-- B62 (commit 6a475135, 19 August 2026) fixed the door: a typed property cost now reaches the
-- property stream. It cannot touch a row that was already written. So a landlord who typed his
-- letting agent fee on 18 August still has it deducted against a trade he does not have, and
-- nothing on any screen will ever tell him.
--
-- /api/health names the accounts that are in that state, behind the cron bearer, as
-- `property.misfiled` and `property.accounts`. This is the remedy you run for one of them.
--
-- 🔴 IT TAKES A user_id AND IT IS DELIBERATELY NOT A BLANKET UPDATE.
--
-- A sweep across the whole table would be one statement and it would be wrong, twice over:
--
--   1. Rule 9. `+norah`'s three misfiled rows ARE the B62 evidence and her wrong £11,832.00 is the
--      before. The corpus says never tidy them. A blanket update erases the only surviving proof
--      of a P1, in one keystroke, with no way back.
--   2. A property category on a row is strong evidence and it is not certainty. `mortgage interest`
--      on a sole trader's own home, typed by somebody who misread the picker, is a row that must
--      NOT move: it is not an allowable cost at all and moving it into the property stream would
--      hand him a Section 24 credit he is not entitled to. One account at a time means somebody
--      has looked.
--
-- ⚠️ SO: READ FIRST, MOVE SECOND, AND READ AGAIN. The three statements below are in that order and
-- the first one changes nothing.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- ── 1. WHO IS AFFECTED. Changes nothing. Run this on its own first. ────────────────────────
--
-- Returns one row per account with confirmed property category costs sitting outside the property
-- stream, newest first. The email comes from public.signups because public.users has no email
-- column: see the operating rules.
select
  t.user_id,
  s.email,
  count(*)                          as misfiled_rows,
  sum(abs(t.amount))                as misfiled_total,
  min(t.created_at)                 as oldest,
  max(t.created_at)                 as newest
from public.transactions t
left join public.signups s on s.user_id = t.user_id
where t.confirmed = true
  and t.income_type <> 'property'
  and lower(btrim(t.category)) in ('mortgage interest', 'letting agent', 'property repairs', 'ground rent')
group by t.user_id, s.email
order by newest desc;

-- ── 2. THE MOVE, FOR ONE ACCOUNT. Replace the uuid. Safe to re-run. ────────────────────────
--
-- ⚠️ NEVER RUN THIS WITHOUT A user_id FILTER, AND NEVER RUN IT FOR `+norah`. Her rows are the
-- evidence. If you are not certain which account you are holding, stop and run statement 1 again.
--
-- `returning` is not decoration: a PATCH that updates zero rows succeeds silently, and this file's
-- own corpus has one P1 (B65) that exists entirely because of that. Read the count that comes back.
update public.transactions
   set income_type = 'property'
 where user_id = '00000000-0000-0000-0000-000000000000'   -- <<< REPLACE, and check it twice
   and confirmed = true
   and income_type <> 'property'
   and lower(btrim(category)) in ('mortgage interest', 'letting agent', 'property repairs', 'ground rent')
returning id, category, amount, transaction_date, created_at;

-- ── 3. WHAT HE LOOKS LIKE NOW. Changes nothing. ────────────────────────────────────────────
--
-- Mortgage interest must NOT be in the expenses figure: it is relieved as a Section 24 basic rate
-- reducer, never deducted, and lib/propertyengine.ts makes that split at READ time from the
-- category. So a healthy landlord shows rent in, ordinary costs out, and finance held apart.
select
  sum(case when t.amount > 0 then t.amount else 0 end)                                        as rent_in,
  sum(case when t.amount < 0 and lower(btrim(t.category)) <> 'mortgage interest'
           then abs(t.amount) else 0 end)                                                     as ordinary_costs,
  sum(case when t.amount < 0 and lower(btrim(t.category)) =  'mortgage interest'
           then abs(t.amount) else 0 end)                                                     as finance_costs
from public.transactions t
where t.user_id = '00000000-0000-0000-0000-000000000000'   -- <<< the same uuid
  and t.confirmed = true
  and t.income_type = 'property';

-- ⚠️ AND THE FOUR CATEGORY STRINGS ABOVE ARE lib/propertylanes.ts's PROPERTY_CATEGORIES, byte for
-- byte, lower case and single spaced. test/b70propertystream.test.mjs reads this file and asserts
-- that, because a list typed into SQL is a list that rots the day a fifth category is added.

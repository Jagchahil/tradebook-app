-- APPLY 2026-07-31: users.income_shape, the second axis of who a customer is. Run this whole
-- file in the Supabase SQL editor. It is idempotent.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- WHY THIS COLUMN EXISTS.
--
-- The product had exactly one axis for who a customer is: users.business_type, sole trader or
-- partnership or limited company. That answers HOW a man trades. It cannot answer WHETHER he
-- trades, and a great deal of UK tax law turns on precisely that.
--
-- A landlord picking the Landlord chip on /start is mapped to 'sole_trader', because he files a
-- personal return and he is not a company. So he passed every guard in the codebase as a sole
-- trader and was shown the whole trade corpus. Walked live on 31 July 2026, he was asked what he
-- did before he went self employed, under this promise: "If you lose money in your first four
-- years, we can carry that loss back against the wages from your old job. HMRC send you a cheque."
--
-- That is ITA 2007 s72, early TRADE losses relief. A UK property business loss can only ever be
-- carried FORWARD against future profits of the same letting business, and when that business
-- ends the carried forward losses are simply lost. There is no carry back and there is no cheque.
-- The same hole was offering him voluntary Class 2 at a few pounds a week (NIM74250: a landlord's
-- ordinary activities are not gainful employment for self-employed NICs, so there is no Class 2
-- to buy the year with) and the use of home flat rate (ITTOIA 2005 s94H, a deduction in computing
-- the profits of a TRADE).
--
-- WHAT A VALUE MEANS.
--   'trade'          he carries on a trade, with or without rent alongside it
--   'property_only'  his business is letting property and there is no trade at all
--   NULL             we do not know, and he is asked everything
--
-- 🔴 NULL IS THE SAFE DIRECTION AND IT IS THE DEFAULT ON PURPOSE. Asking a landlord a trade
-- question is a nuisance he can say no to. Refusing to ask a sparky about his old employed job
-- because a column was never filled is four figures gone with no trace that it ever happened. So
-- there is no default, no backfill, and lib/persona.ts only ever writes 'property_only' when the
-- man HIMSELF said letting is his whole business. It is never inferred from a quiet month in the
-- money log: a roofer who logged nothing in July is not a landlord, and NIM74250's own exception
-- (a guest house IS a trade) is the reminder that letting and trading are not opposites.
--
-- WHO WRITES IT. reconcileFromSignup in lib/supabase.ts, once, from the trade word on the signup
-- row, through incomeShapeOfSignup in lib/persona.ts. Nothing else writes it today.
--
-- WHO READS IT. getBusinessProfile in lib/supabase.ts, and from there the four surfaces that ask
-- circumstances questions: /app/setup, /app/you/circumstances, /app/you and /app/pile.
--
-- UNTIL THIS FILE IS RUN the column does not exist, the select falls back, every customer reads
-- as unknown, and the product behaves exactly as it did before wave nine. test/persona.test.mjs
-- pins that degrade.
--
-- RLS POSTURE: unchanged. This is a column on an existing table that already has RLS enabled.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

alter table public.users
  add column if not exists income_shape text;

-- The check constraint is added separately and guarded, so re-running the file cannot fail on an
-- object that already exists. Only the two values this codebase writes are accepted: a typo that
-- reached the column would read back as an unknown shape through toIncomeShape anyway, but a
-- column that can hold anything is a column somebody will one day put a trade name in.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_income_shape_check'
  ) then
    alter table public.users
      add constraint users_income_shape_check
      check (income_shape is null or income_shape in ('trade', 'property_only'));
  end if;
end $$;

comment on column public.users.income_shape is
  'What his business income actually is: trade, property_only, or NULL for unknown. NULL means ask him everything. Written by reconcileFromSignup from the /start trade word. See lib/persona.ts.';

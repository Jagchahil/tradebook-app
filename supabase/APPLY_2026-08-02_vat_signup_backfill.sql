-- BACKFILL: the VAT answer given at signup never reached the table the app reads.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- WHY THIS EXISTS. Found by walking lekhio.app on 2 August 2026, on an account that answered
-- "yes" to "Are you VAT registered?" on /start step 6.
--
--   /app/you          "VAT registered, as you told us."
--   /app/tax/vat      "You are not VAT registered, so there is nothing to work out here."
--   /app/tax          no VAT door at all
--   /app/invoices/new no rate boxes, and none of the three reverse charge questions
--
-- The signup reconcile wrote the `vat_registered` circumstance and never a `vat_profiles` row,
-- and lib/supabase.ts readVatProfile answers a MISSING ROW with `registered: false` rather than
-- with null. That is right for a man who has never been asked and wrong for a man who answered on
-- the front door. So every VAT surface built on 1 August was dark for every customer who told us
-- the truth at signup.
--
-- The code fix is in lib/supabase.ts reconcileSignupToUser and test/vatsignup.test.mjs holds the
-- rule. This file repairs the accounts that already exist.
--
-- ⚠️ RUN THIS AFTER THE DEPLOY, NOT BEFORE. Nothing breaks either way, but running it first means
-- a customer who signs up in between is created wrong again and is not in the set this fixes.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------------------------
-- PART 1. READ ONLY. Who is affected, and what each of them was told.
-- Run this on its own first. It writes nothing.
-- ---------------------------------------------------------------------------------------------
select
  c.user_id,
  c.answer                                  as told_us_at_signup,
  c.channel,
  c.answered_at,
  (v.user_id is not null)                   as has_vat_profile,
  v.registered                              as profile_says,
  case
    when v.user_id is null and c.answer = 'yes' then 'BROKEN: says yes, the app reads him as not registered'
    when v.user_id is null and c.answer = 'no'  then 'harmless today, but the two stores disagree in shape'
    when v.user_id is null                      then 'skipped the question, no row is correct'
    when v.registered = (c.answer = 'yes')      then 'agrees'
    else 'DISAGREES: he has since changed it on /app/you/vat'
  end                                       as verdict
from public.circumstances c
left join public.vat_profiles v on v.user_id = c.user_id
where c.key = 'vat_registered'
order by (v.user_id is null) desc, c.answered_at;

-- ---------------------------------------------------------------------------------------------
-- PART 2. THE BACKFILL.
--
-- ⚠️ `on conflict do nothing` is the whole safety of this. A customer who has since set his VAT
-- details on /app/you/vat has the BETTER record, with a VRN and a registration date on it, and
-- this must never reach it. Only accounts with no row at all are touched.
--
-- ⚠️ AND 'skip' IS DELIBERATELY EXCLUDED. A man who would not say is not a man who said no. He
-- keeps no row, readVatProfile keeps synthesising "not registered", and he keeps being asked.
-- Writing a row for him would turn a refusal to answer into an answer, which is the exact thing
-- the circumstances table's own comment says a boolean column would do.
--
-- The 'no' answers ARE written, even though behaviour is identical either way (readVatProfile
-- synthesises exactly this row when there is none). It costs nothing and it means the invariant
-- in test/vatsignup.test.mjs is true of the DATA as well as of the code, so the next person to
-- reason about this does not have to rediscover that two stores can hold one answer.
-- ---------------------------------------------------------------------------------------------
insert into public.vat_profiles (user_id, registered)
select c.user_id, (c.answer = 'yes')
from public.circumstances c
where c.key = 'vat_registered'
  and c.answer in ('yes', 'no')
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------------------------
-- PART 3. VERIFY. Both queries must return ZERO rows.
-- ---------------------------------------------------------------------------------------------

-- 3a. Nobody who answered still lacks a profile.
select c.user_id, c.answer
from public.circumstances c
left join public.vat_profiles v on v.user_id = c.user_id
where c.key = 'vat_registered'
  and c.answer in ('yes', 'no')
  and v.user_id is null;

-- 3b. And no account holds two different answers to the one question. A row here is not a bug in
-- this migration: it is a customer who changed his mind on /app/you/vat, whose route writes both,
-- so it should be empty. If it is not, the two doors have drifted again and that is the finding.
select
  c.user_id,
  c.answer      as circumstance_says,
  v.registered  as profile_says,
  c.answered_at as circumstance_written,
  v.updated_at  as profile_written
from public.circumstances c
join public.vat_profiles v on v.user_id = c.user_id
where c.key = 'vat_registered'
  and c.answer in ('yes', 'no')
  and v.registered <> (c.answer = 'yes');

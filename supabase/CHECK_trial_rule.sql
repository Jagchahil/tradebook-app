-- THE ONE TRIAL PER PERSON RULE. Why did a fourth plus alias get a free week?
--
-- 🔴 READ ONLY. Nothing in this file changes anything. Run the whole thing and keep the output.
--
-- WHAT WE ALREADY KNOW, so you do not re-derive it:
--   . lib/trialidentity.ts decideTrialGrant is CORRECT. Given a prior grant on a plus stripped
--     email it refuses, and its own suite proves it.
--   . normaliseEmail STRIPS PLUS ALIASES, so dave+barber1@ and dave+barber9@ are one person.
--   . So the fault is UPSTREAM, in priorLocalGrants (lib/supabase.ts), which asks PostgREST five
--     questions and treats an unanswerable one as "no prior found".
--
-- THE HYPOTHESIS THIS FILE TESTS. Those five reads name the columns email_norm, signup_phone,
-- person_name and business_name on public.subscriptions. Those columns, and the partial unique
-- indexes that are the real backstop, come from APPLY_2026-07-29_web_account_and_trial_identity.sql.
-- If that migration was never applied, PostgREST answers every one of those reads with a 400,
-- priorLocalGrants returns an empty list every time, and NOTHING REFUSES ANYBODY, for ever, with
-- nothing logged. A permanently broken rule and a clean sheet look identical from the outside.
--
-- If part A comes back with missing columns, that is the whole answer and you do not need B, C or D.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- A. DO THE COLUMNS EVEN EXIST? Expect FOUR rows. Fewer than four is the bug.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
select 'A. identity columns on subscriptions. expect 4 rows' as check;
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'subscriptions'
  and column_name in ('email_norm', 'signup_phone', 'person_name', 'business_name')
order by column_name;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- B. DO THE INDEXES EXIST? These are the real backstop: the code hopes, the database rules.
--
-- The partial unique index is what turns a race, or a check we failed to run, into a 409 that
-- grantTrialWithIdentity already handles. Without it, two requests a second apart both win.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
select 'B. unique indexes that actually stop a second grant' as check;
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'subscriptions'
order by indexname;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- C. WHAT THE DATA ACTUALLY SAYS. Who holds more than one no card trial?
--
-- ⚠️ THIS NORMALISES THE EMAIL THE SAME WAY lib/trialidentity.ts DOES: lowercase, and everything
-- from a plus up to the at sign removed. If email_norm is missing this falls back to computing it
-- here, so part C answers even when part A has already told you the columns are gone.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
select 'C. people holding more than one no card trial, by normalised email' as check;
with rows as (
  select
    id,
    user_id,
    lower(regexp_replace(coalesce(email, ''), '\+[^@]*@', '@')) as norm,
    status,
    created_at,
    stripe_subscription_id
  from public.subscriptions
  where stripe_subscription_id is null
)
select
  norm                                   as normalised_email,
  count(*)                               as trials_held,
  count(distinct user_id)                as distinct_accounts,
  min(created_at)::date                  as first_granted,
  max(created_at)::date                  as last_granted
from rows
where norm <> ''
group by norm
having count(*) > 1
order by trials_held desc, last_granted desc
limit 50;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- D. THE SHAPE OF THE TABLE, so a wrong assumption anywhere above is visible.
--
-- In particular: how many no card trial rows carry NO user_id. Three of four production rows did
-- on 30 July, because they predate 29 July, and that is what nearly locked a paying customer out
-- of the product (see the paywall note). It matters here too: a row with no user_id cannot be
-- matched on the account key at all, so the email key is the only thing holding.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
select 'D. the shape of it' as check;
select
  count(*)                                                     as no_card_trial_rows,
  count(*) filter (where user_id is null)                      as rows_with_no_user_id,
  count(*) filter (where email is null or email = '')          as rows_with_no_email,
  count(distinct user_id)                                      as distinct_accounts,
  min(created_at)::date                                        as oldest,
  max(created_at)::date                                        as newest
from public.subscriptions
where stripe_subscription_id is null;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT TO DO WITH THE ANSWER
--
--   A came back with fewer than four rows
--       The migration was never applied. Run APPLY_2026-07-29_web_account_and_trial_identity.sql.
--       Every check has been failing open since the day the code shipped, which is why the fourth
--       alias sailed through. Nothing else needs changing: the code is right.
--
--   A is complete but B has no unique index on the identity columns
--       The code half is running but the database backstop is not, so a race can still double
--       grant. The migration's index half did not take. Re-run it.
--
--   A and B are both fine and C still shows duplicates
--       Then the reads are working and the rule genuinely let somebody through, which points at
--       decideTrialGrant or at the identity we hand it. Take one normalised email from C, find its
--       rows, and check what email_norm, signup_phone, person_name and business_name actually hold
--       on each. An empty email_norm on the FIRST row is the likeliest answer: nothing to match
--       against means nothing to refuse on.
--
--   Everything is fine and C is empty
--       Then it has been fixed since, and the code change of 1 August is what stops it going
--       quiet again: priorLocalGrants now counts the checks it could not answer and logs
--       "[trial-identity] DEGRADED", and grantTrialWithIdentity carries checkDegraded out with the
--       decision. Grep the Vercel logs for that marker to see whether the rule is running at all.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

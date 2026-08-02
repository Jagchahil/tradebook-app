-- A SECOND ALLOWANCE ELECTION: the £1,000 trading allowance.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- WHY. Until tonight lib/agent.ts sent a card, and a paid WhatsApp template, saying the trading
-- allowance "beats totting up your actual expenses, so Lekhio uses it automatically... Nothing for
-- you to do." Nothing applied it: taxengine.taxableTradingProfit() was called by no code at all.
--
-- And it could not have been ours to apply. HMRC BIM86015: partial relief requires "an election by
-- the individual for partial relief... made by the individual completing a Self Assessment
-- return." So the fix is not to compute it silently. It is to ask him, store what he said, and let
-- the engines read it, which is exactly what use_of_home already does.
--
-- ⚠️ THE TABLE ALREADY EXISTS (APPLY_2026-07-27_allowance_elections.sql). This migration only
-- widens it, and it is idempotent: run it twice and nothing changes.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------------------------
-- PART 1. READ ONLY. What is in there now. Run this first; it writes nothing.
-- ---------------------------------------------------------------------------------------------
select key, start_year, count(*) as rows, count(hours_band) as with_a_band
from public.allowance_elections
group by key, start_year
order by start_year desc, key;

-- ---------------------------------------------------------------------------------------------
-- PART 2. WIDEN THE KEY, AND TIE THE SHAPE OF A ROW TO IT.
--
-- 🔴 hours_band BECOMES NULLABLE, WHICH IS THE ONLY RISKY LINE IN THIS FILE, SO IT DOES NOT STAND
-- ALONE. The two elections are not the same shape: use_of_home stores WHICH BAND he is in because
-- the claim is a rate per month, and the trading allowance stores nothing at all because the row
-- existing IS the election and the amount comes from FACTS.
--
-- Dropping NOT NULL on its own would let a use_of_home row exist with no band, which would look
-- like a claim and pay nothing, and that is the exact disease the original file's own comment
-- named ("an election the engine has never heard of would sit here looking like a claim and do
-- nothing, which is the house disease"). So the constraint that replaces it is stricter than the
-- one it removes: it says a use_of_home row MUST have one of the three bands, and a trading
-- allowance row MUST have none.
-- ---------------------------------------------------------------------------------------------
alter table public.allowance_elections
  drop constraint if exists allowance_elections_key_check;

alter table public.allowance_elections
  add constraint allowance_elections_key_check
  check (key in ('use_of_home', 'trading_allowance'));

alter table public.allowance_elections
  alter column hours_band drop not null;

alter table public.allowance_elections
  drop constraint if exists allowance_elections_hours_band_check;

alter table public.allowance_elections
  drop constraint if exists allowance_elections_band_matches_key;

alter table public.allowance_elections
  add constraint allowance_elections_band_matches_key
  check (
    (key = 'use_of_home' and hours_band in (25, 51, 101))
    or (key = 'trading_allowance' and hours_band is null)
  );

comment on column public.allowance_elections.hours_band is
  'HMRC simplified expenses band for use_of_home: 25 (25 to 50 hours a month), 51 (51 to 100), 101 (101 or more). NULL for trading_allowance, which has no band: the row existing is the election and the amount comes from FACTS.tradingAllowance. The band_matches_key constraint holds the two shapes apart.';

comment on table public.allowance_elections is
  'A tax allowance the customer has elected to claim, per tax year. Stores the choice, never the rate: rates live in lib/taxengine.ts and are watched nightly. An election is never rolled forward to a new year on his behalf. The trading allowance REPLACES actual expenses rather than adding to them, so it is never written without him having seen both totals.';

-- ---------------------------------------------------------------------------------------------
-- PART 3. VERIFY. The first must return the two keys. The second must return ZERO rows.
-- ---------------------------------------------------------------------------------------------
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.allowance_elections'::regclass
  and conname in ('allowance_elections_key_check', 'allowance_elections_band_matches_key')
order by conname;

-- Any row whose shape does not match its key. There should never be one, and after the constraint
-- above there cannot be, but a migration that only asserts what it just did is not a check.
select user_id, key, start_year, hours_band
from public.allowance_elections
where (key = 'use_of_home' and (hours_band is null or hours_band not in (25, 51, 101)))
   or (key = 'trading_allowance' and hours_band is not null);

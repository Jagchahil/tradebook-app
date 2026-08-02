-- A CAR IS NOT PLANT AND MACHINERY, AND THE PILE HAD NOWHERE TO SAY SO.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- WHY. Walking a real 78 row Monzo export on 2 August 2026: one line, AUDI LEEDS, £60,000. It went
-- through the pile like any other payment, was filed under a category, and the whole £60,000 came
-- off his profit in the year he bought it. A £22,800 profit was reported as a £37,224 LOSS, his
-- set aside went to zero, Ways to save went silent, and the Overview told him Lekhio had saved him
-- £5,463 when the honest figure was about £2,809.
--
-- GOV.UK, claim capital allowances, business cars: "Cars do not qualify for: annual investment
-- allowance (AIA)." A car goes into a pool and earns a writing down allowance, 14% or 6% a year,
-- or 100% in year one for a new zero emission car until April 2027. Year one on that Audi is about
-- £3,600. We were £52,000 out, in the direction that gets HIM penalised.
--
-- ⚠️ AND THE PRODUCT ALREADY KNEW IT WAS A CAR. The pile printed the correct VAT blocking rule on
-- that exact row: "The VAT on buying a car is blocked unless it is genuinely never available for
-- private use." The fact was present, correct, and not consulted by the thing that needed it.
--
-- ⚠️ TWO COLUMNS, BOTH NULLABLE, AND NULL MEANS "NOBODY HAS BEEN ASKED". Every row written before
-- today keeps the behaviour it has: an ordinary cost, deducted in full. Nothing is reinterpreted
-- retrospectively, because a man's filed figures are his and we did not ask him at the time.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------------------------
-- PART 1. READ ONLY. The rows this would ever have applied to. Run it first; it writes nothing.
--
-- ONE payment over £1,000 is the population the question gets asked of, and both halves of that
-- matter. A car arrives as a single line; a merchant with fourteen payments adding to £4,000 is a
-- trade account, not a vehicle, and asking about it is the tedium that made him stop the first
-- time. £1,000 rather than £5,000 because a £1,500 banger is a real car and a real over claim, and
-- the question is defaulted to "Not a car" so the ones that are not cars cost him nothing to pass.
-- The threshold lives in lib/capital.ts CAPITAL_QUESTION_FROM; this query mirrors it.
-- ---------------------------------------------------------------------------------------------
select
  user_id,
  transaction_date,
  vendor,
  category,
  amount,
  confirmed
from public.transactions
where amount <= -1000
order by amount asc
limit 50;

-- ---------------------------------------------------------------------------------------------
-- PART 2. THE COLUMNS.
--
-- capital_kind      what HE told us the thing was. NOT our guess, and not derived from the vendor
--                   name: "AUDI LEEDS" could be a van, and a car could be bought from anybody.
--                   The four values are the four answers on the pile, and they are the four the
--                   law actually distinguishes between.
--
-- business_use_pct  CAA 2001 s205. A sole trader's car is almost never wholly business, and the
--                   allowance is restricted to the business proportion. Assuming 100% would be a
--                   quieter version of the same over claim this migration exists to stop, so it is
--                   asked and stored rather than assumed. Null with a car kind reads as 100 in the
--                   engine, which is the value the form defaults to, so the two cannot disagree.
-- ---------------------------------------------------------------------------------------------
alter table public.transactions
  add column if not exists capital_kind text,
  add column if not exists business_use_pct int;

alter table public.transactions
  drop constraint if exists transactions_capital_kind_check;

alter table public.transactions
  add constraint transactions_capital_kind_check
  check (capital_kind is null or capital_kind in
    ('not_a_car', 'car_zero_new', 'car_low_or_used_electric', 'car_other'));

alter table public.transactions
  drop constraint if exists transactions_business_use_pct_check;

alter table public.transactions
  add constraint transactions_business_use_pct_check
  check (business_use_pct is null or (business_use_pct between 1 and 100));

comment on column public.transactions.capital_kind is
  'What the customer told us a large purchase was, on the pile. Null means he was never asked and the row is an ordinary cost. Cars are excluded from the Annual Investment Allowance (CAA 2001 s38B) and earn a writing down allowance instead; lib/capital.ts holds the rule and lib/taxengine.ts holds the rates.';

comment on column public.transactions.business_use_pct is
  'The business proportion of a vehicle, as the customer stated it. CAA 2001 s205 restricts the allowance to it. Null reads as 100 in the engine, which is what the form defaults to.';

-- ---------------------------------------------------------------------------------------------
-- PART 3. VERIFY. The first must return two rows. The second must return ZERO.
-- ---------------------------------------------------------------------------------------------
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'transactions'
  and column_name in ('capital_kind', 'business_use_pct')
order by column_name;

-- Any row whose two columns disagree with each other. A business use share on something that is
-- not a vehicle at all, or a car with a nonsense share. There should never be one.
select id, user_id, vendor, amount, capital_kind, business_use_pct
from public.transactions
where (capital_kind is null and business_use_pct is not null)
   or (business_use_pct is not null and (business_use_pct < 1 or business_use_pct > 100));

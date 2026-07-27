-- THE ALLOWANCE ELECTION. Real money nobody was getting.
--
-- lib/taxoptimiser.ts rule 4 has been telling every customer to claim use of home, and emitting the
-- action 'apply_allowance_election', since it was written. NOTHING IMPLEMENTED IT. There was no way
-- for a man to say yes, so homeOfficeClaimed was false forever, the suggestion fired forever, and
-- /api/ledger passed homeOffice: 0 with a comment admitting the gap.
--
-- This is the table that lets him say yes. Between £120 and £312 a year of deduction for a tradesman
-- who does his quotes at the kitchen table, which is all of them.
--
-- ⚠️ AN ELECTION IS NOT AN EXPENSE, AND IT DELIBERATELY DOES NOT LIVE IN transactions.
--
-- lib/categories.ts refuses to create a 'home' category on purpose: a rule on the word rent, or on a
-- household energy bill, would sweep up a man's OWN HOUSE and claim tax relief on it. So use of home
-- is a CHOICE he makes, not a receipt he sends, and his actual gas bill never comes near the books.
--
-- Run this whole file in the Supabase SQL editor. It is idempotent.

create table if not exists public.allowance_elections (
  user_id    uuid not null,

  -- Which allowance. Constrained rather than free text: an election the engine has never heard of
  -- would sit here looking like a claim and do nothing, which is the house disease.
  key        text not null check (key in ('use_of_home')),

  -- ⚠️ THE TAX YEAR, AS ITS START YEAR, AND IT IS PART OF THE PRIMARY KEY.
  --
  -- An election is a choice about ONE year. A man who worked from home all of last year may be on a
  -- site all of this one, and rolling his election forward silently would be us claiming something
  -- on his behalf that he never said. That is the exact conduct Finance Act 2026 Sch 22 makes
  -- sanctionable, and it is also just dishonest. He elects again, or he does not claim.
  start_year int not null check (start_year between 2020 and 2100),

  -- HMRC's simplified expenses band, by hours worked at home per month: 25 to 50, 51 to 100, 101+.
  -- The BOUNDARY is stored, never the money. The rate lives in lib/taxengine.ts where khoji/diff.mjs
  -- checks it against GOV.UK every night, so if HMRC moves it, nothing in this table goes stale.
  hours_band int not null check (hours_band in (25, 51, 101)),

  elected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, key, start_year)
);

comment on table public.allowance_elections is
  'A tax allowance the customer has elected to claim, per tax year. Stores the HMRC hours band, never the rate: the rate lives in lib/taxengine.ts and is watched nightly. An election is never rolled forward to a new year on his behalf.';

comment on column public.allowance_elections.hours_band is
  'HMRC simplified expenses band: 25 (25 to 50 hours a month), 51 (51 to 100), 101 (101 or more).';

-- Every read is "this user, this year", which the primary key already covers leading on user_id.
-- No second index is needed and one would only be write cost.

alter table public.allowance_elections enable row level security;
drop policy if exists "elections read own"   on public.allowance_elections;
drop policy if exists "elections insert own" on public.allowance_elections;
drop policy if exists "elections update own" on public.allowance_elections;
drop policy if exists "elections delete own" on public.allowance_elections;
create policy "elections read own"   on public.allowance_elections for select using ((select auth.uid()) = user_id);
create policy "elections insert own" on public.allowance_elections for insert with check ((select auth.uid()) = user_id);
create policy "elections update own" on public.allowance_elections for update using ((select auth.uid()) = user_id);
-- HE CAN TAKE IT BACK. Doc 103: acting for a man is only kindness when it is reversible and it is
-- his. An election he made in error must be revocable by him, in one step, without asking us.
create policy "elections delete own" on public.allowance_elections for delete using ((select auth.uid()) = user_id);

notify pgrst, 'reload schema';

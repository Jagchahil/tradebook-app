-- VAT, end to end. The storage half.
--
-- 🔴 WHAT WAS WRONG. Read this before you decide any of it is over engineered.
--
-- The product has asked every customer, in the second highest value question it has, "Are you VAT
-- registered, AND WHEN DID YOU REGISTER?", and stored the answer as the string 'yes'. The date was
-- asked for and thrown away. Then it promised him this, in lib/circumstances.ts:
--
--   "When you registered you could have reclaimed the VAT on every tool and bit of kit you already
--    owned, going back four years. Almost nobody does. Every receipt you put in your Lekhio is kept
--    ready for exactly this."
--
-- That is Reg 111 of the VAT Regulations 1995, and the whole four year lookback hangs off the
-- registration date. We were promising a calculation we had thrown away the input for.
--
-- There is also no VAT number anywhere in the schema, no scheme, and no VAT on a transaction or an
-- invoice. invoices.tax exists, is written as a hardcoded 0, and is selected by nothing.
--
-- ⚠️ AND THE TRAP THIS TABLE EXISTS TO AVOID. The most common invoice this audience sends is a VAT
-- registered subcontractor billing a main contractor, where the supplier charges NO VAT and the
-- customer accounts for it: the CIS domestic reverse charge, VATA 1994 s55A. Hardcoding tax = 0 was
-- accidentally right for him. Naively adding 20% would have been WRONG for him, on the invoice he
-- sends most often. cis_subcontractor below is what lets us ask him the right question instead of
-- guessing, and vat_treatment on the invoice is what records the answer for good.
--
-- Run this whole file in the Supabase SQL editor. It is idempotent.
-- Part 1 is a read only survey. Parts 2 to 5 change things. Part 6 verifies.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- PART 1. SURVEY. Read only. Run it first and keep the output.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

select 'existing invoices, and what they hold today' as survey;
select
  count(*)                                        as invoices,
  count(*) filter (where coalesce(tax, 0) <> 0)   as with_any_tax,
  count(*) filter (where subtotal <> total)       as subtotal_differs_from_total
from public.invoices;

select 'how many customers say they are VAT registered' as survey;
select answer, count(*) as people
from public.circumstances
where key = 'vat_registered'
group by answer
order by people desc;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- PART 2. WHO HE IS FOR VAT.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.vat_profiles (
  user_id uuid primary key references public.users (id) on delete cascade,

  registered boolean not null default false,

  -- Nine digits, no GB prefix, no spaces. lib/vat.ts normalises and checks the modulus 97 digits
  -- before anything reaches here, so a typo is caught at the door rather than printed on an invoice.
  --
  -- ⚠️ A NUMBER THAT PASSES THAT CHECK IS WELL FORMED, NOT VERIFIED. We do not ask HMRC whether it
  -- is his, and no screen may say "verified". That would be the same class of claim as implying
  -- recognition, which CLAUDE.md forbids.
  vrn text check (vrn is null or vrn ~ '^[0-9]{9}$'),

  -- THE ONE THIS TABLE EXISTS FOR. The Reg 111 anchor. Without it the four year promise above is
  -- not a feature, it is a sentence.
  registered_on date,

  deregistered_on date,

  scheme text not null default 'standard'
    check (scheme in ('standard', 'flat_rate', 'cash', 'annual')),

  -- Only meaningful on the flat rate scheme: the sector percentage HMRC gave him. Stored as a
  -- percentage (9.5 means 9.5%), never as a fraction, because that is how his letter from HMRC
  -- reads and a man checking us against his letter is the point.
  flat_rate_percent numeric check (flat_rate_percent is null or (flat_rate_percent >= 0 and flat_rate_percent <= 100)),
  flat_rate_first_year boolean not null default false,

  -- Does he do construction work reported under CIS? This is the switch that decides whether an
  -- invoice screen asks him the reverse charge questions at all. A hairdresser must never see them.
  cis_subcontractor boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.vat_profiles is
  'What we know about a customer''s VAT position. One row per user. registered_on is the anchor for the Reg 111 pre registration reclaim, which the product has promised since 14 July 2026 and could not compute until this table existed.';

comment on column public.vat_profiles.vrn is
  'UK VAT registration number, nine digits, no prefix. Checked for shape by lib/vat.ts isValidVrn. Never verified against HMRC, so nothing may describe it as verified.';

comment on column public.vat_profiles.cis_subcontractor is
  'Whether he does construction work reported under CIS. Decides whether the CIS domestic reverse charge questions appear on an invoice at all.';

alter table public.vat_profiles enable row level security;
drop policy if exists "vat read own"   on public.vat_profiles;
drop policy if exists "vat insert own" on public.vat_profiles;
drop policy if exists "vat update own" on public.vat_profiles;
drop policy if exists "vat delete own" on public.vat_profiles;
create policy "vat read own"   on public.vat_profiles for select using ((select auth.uid()) = user_id);
create policy "vat insert own" on public.vat_profiles for insert with check ((select auth.uid()) = user_id);
create policy "vat update own" on public.vat_profiles for update using ((select auth.uid()) = user_id);
-- He can take it off us. Same reasoning as the elections table: a fact he gave us and now wants
-- gone is his to remove, in one step, without asking.
create policy "vat delete own" on public.vat_profiles for delete using ((select auth.uid()) = user_id);

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- PART 3. VAT ON WHAT HE SELLS.
--
-- ⚠️ NOTHING RECOMPUTES AN EXISTING INVOICE. Every row already in this table has tax = 0 and
-- total = subtotal, and it stays exactly as it is: vat_treatment comes out null, and every render
-- path treats null as "the way it printed on the day he sent it". An invoice a customer has
-- already been shown is a document, not a view, and changing one retrospectively is how a man ends
-- up in an argument he cannot win.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

alter table public.invoices add column if not exists vat_treatment text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'invoices_vat_treatment_check'
  ) then
    alter table public.invoices
      add constraint invoices_vat_treatment_check
      check (vat_treatment is null or vat_treatment in ('none', 'charged', 'reverse_charge'));
  end if;
end $$;

-- The VAT the CUSTOMER must account for under the reverse charge. It goes ON the document and it
-- is deliberately NOT part of total: VATREVCON37100 says it "should not be included in the amount
-- shown as total VAT charged". Two separate columns because they are two separate facts, and
-- collapsing them is precisely the mistake that would make the invoice wrong.
alter table public.invoices add column if not exists reverse_charge_vat numeric not null default 0;

-- The tax point, which is the date of supply and not necessarily the date the invoice was raised.
-- issued_date has been standing in for it. They are the same for most jobs and different for the
-- ones that matter.
alter table public.invoices add column if not exists tax_point date;

comment on column public.invoices.vat_treatment is
  'none (not VAT registered), charged (ordinary VAT), reverse_charge (CIS domestic reverse charge, VATA 1994 s55A). NULL means the invoice predates VAT support and must render exactly as it did when it was sent.';
comment on column public.invoices.reverse_charge_vat is
  'The VAT the customer must account for under the reverse charge. Shown on the invoice, never added to total. VATREVCON37100.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- PART 4. VAT ON WHAT HE BUYS.
--
-- ⚠️ NULL IS NOT ZERO HERE. A null vat_amount means we do not know what the VAT on this cost was,
-- which is the honest state for every row in the table today. Zero means we know it was nothing,
-- for instance an insurance premium. The VAT position screen counts only what he has CONFIRMED,
-- so an unread receipt can never quietly become a reclaim.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

alter table public.transactions add column if not exists vat_amount numeric;
alter table public.transactions add column if not exists vat_confirmed boolean not null default false;

comment on column public.transactions.vat_amount is
  'The VAT inside this transaction''s gross amount, in pounds. NULL means unknown, which is different from zero. Never used in a reclaim figure unless vat_confirmed is true.';
comment on column public.transactions.vat_confirmed is
  'Whether the customer has looked at the VAT figure and said yes. A vision read is a guess until he confirms it, and a VAT figure that is wrong 15% of the time is worse than none because he will trust it.';

-- Only confirmed VAT is ever summed, so the index carries the flag.
create index if not exists transactions_user_vat_idx
  on public.transactions (user_id, transaction_date)
  where vat_confirmed = true;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- PART 5. BACKFILL THE ONE FACT WE ALREADY HAD.
--
-- Anybody who answered the vat_registered question 'yes' gets a profile row with registered = true
-- and nothing else. That is exactly what we know about him: no number, no date, no scheme. The
-- screen then has something true to start from and one honest thing to ask him for.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

insert into public.vat_profiles (user_id, registered)
select c.user_id, true
from public.circumstances c
where c.key = 'vat_registered'
  and lower(c.answer) = 'yes'
on conflict (user_id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- PART 6. VERIFY. All four should read as described.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

select 'A. the new columns exist' as check;
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'invoices' and column_name in ('vat_treatment', 'reverse_charge_vat', 'tax_point'))
    or (table_name = 'transactions' and column_name in ('vat_amount', 'vat_confirmed'))
    or (table_name = 'vat_profiles'))
order by table_name, column_name;

select 'B. profiles seeded from the circumstance' as check;
select count(*) as vat_profiles_created from public.vat_profiles;

select 'C. no existing invoice was touched. every row should still be null treatment' as check;
select
  count(*)                                             as invoices,
  count(*) filter (where vat_treatment is null)        as untouched,
  count(*) filter (where reverse_charge_vat <> 0)      as should_be_zero
from public.invoices;

-- 🔴 D. THE ONE THAT CAUGHT marketing_connectors ON 31 JULY. Every public table must have row
-- level security on. That migration created the OAuth tokens for every social account with RLS
-- off, which in Supabase serves them to the anon key. This query must return ZERO ROWS.
select 'D. any public table with row level security OFF. must be empty' as check;
select c.relname as table_without_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false
order by 1;

notify pgrst, 'reload schema';

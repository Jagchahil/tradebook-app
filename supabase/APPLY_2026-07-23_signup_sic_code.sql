-- APPLY 2026-07-23: signups.sic_code, signups.sic_label.
--
-- AI SIC CODE MATCHING (build board, "Growth foundation"). The web /start signup now asks a limited
-- company signup what they do and offers the matching Companies House SIC code from lib/siccodes,
-- so it never has to be looked up separately later. This is informational only: we never file it
-- anywhere ourselves, the person confirms it themselves when they register at Companies House. See
-- app/api/onboard/route.ts, which re-derives the label server side from the code (never trusts
-- client-supplied text for the label), so what is stored is always our own canonical wording.
--
-- Additive and safe to run on a live database: two nullable columns on an existing table, nothing
-- else changes. Run once in the Supabase SQL editor (tradebook-prod).

alter table public.signups add column if not exists sic_code text;
alter table public.signups add column if not exists sic_label text;

notify pgrst, 'reload schema';

-- THE FORTNIGHT PROBLEM. Khoji's amendment watcher (khoji/amend.mjs).
--
-- Budget 2025's OOTLAR was SILENTLY AMENDED FIVE TIMES IN NINE DAYS. "Figures in paragraph 1.7 have
-- been amended." No announcement, no new URL. The page you read on Budget night and the page you read
-- a fortnight later are different documents wearing the same address.
--
-- diff.mjs cannot see this. It asks "does the NUMBER on the page still equal the number in our
-- engine". If HMRC moves an effective date, adds a band, or rewrites a footnote our extractor leans
-- on, the number is unchanged, the differ reports every constant agreed, and the light stays green.
-- It is not lying. It is answering the only question it was asked.
--
-- BEING LATE IS RECOVERABLE. BEING CONFIDENTLY WRONG FOR A FORTNIGHT IS NOT.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 🔴 STEP 1, AND IT IS THE ONE THAT MATTERS. `kind` ON THE HEARTBEAT.
--
-- khoji_runs is the DIFFER's pulse. lib/brain.ts reads the newest row and renders it to a human as
-- "62 of 62 constants matched". It does not know who wrote the row.
--
-- The amendment watcher runs nightly and would write here too. Without `kind`, the console would one
-- day read "23 of 23 constants matched" on a night when the differ was DEAD and the only thing that
-- ran was a watcher that never looked at a single tax constant. The number would be real and the
-- sentence would be a lie.
--
-- ⚠️ THE DEFAULT AND THE BACKFILL ARE BOTH LOAD BEARING. Every existing row IS a differ run. If they
-- come back null, `kind=eq.differ` matches nothing, the newest differ run reads as "never", and this
-- migration would itself turn the light red on a system that is working perfectly. A migration that
-- breaks the alarm it was written to sharpen is not a fix.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

alter table public.khoji_runs
  add column if not exists kind text not null default 'differ';

update public.khoji_runs set kind = 'differ' where kind is null;

create index if not exists khoji_runs_kind_ran_at_idx
  on public.khoji_runs (kind, ran_at desc);

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STEP 2. What each watched document looked like the last time we read it.
--
-- The detector is the CONTENT, not the timestamp. GOV.UK moves `updated_at` on republish for reasons
-- that have nothing to do with content: /income-tax-rates currently says public_updated_at is
-- November 2024 while updated_at is May 2026. An alarm wired to `updated_at` fires on noise, and an
-- alarm that fires on noise gets muted, and a muted alarm is worse than no alarm because we believe
-- we have one.
--
-- So we hash the Content API's own body text. No navigation, no scripts, no cookie banner. If the
-- hash moves, the document really changed.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- ⚠️ THE PRIMARY KEY IS THE DOCUMENT (api_url), NOT THE PAGE WE SCRAPE (web_url).
--
-- The first live dry run taught me this and nothing else would have. Six of the twenty-three URLs the
-- differ reads are CHAPTERS of three shared guides:
--
--     /capital-gains-tax/allowances  and  /capital-gains-tax/rates            -> one document
--     /register-for-vat              and  /register-for-vat/cancel...          -> one document
--     /simpler-income-tax.../vehicles and /simpler-income-tax.../working-from-home -> one document
--
-- They came back with IDENTICAL body hashes, because they ARE the same document. Key this table on
-- web_url and the day GOV.UK edits the capital gains guide we raise TWO incidents for ONE amendment.
-- An alarm that fires twice for one event is an alarm somebody learns to skim, and this codebase has
-- already had to kill a check (cisGrossRate) for exactly that sin.
create table if not exists public.khoji_documents (
  api_url           text primary key,
  web_url           text not null,
  content_id        text,

  -- 🔴 THE FINDING THAT SHAPED THE WHOLE DESIGN.
  --
  -- `change_history` is GOLD, and HMRC writes it in its own words: "The personal allowance rate for
  -- 2021 to 2022 has been CORRECTED to £12,570." A silent correction of a published tax figure,
  -- logged, dated, free, and nobody in this market reads it.
  --
  -- BUT IT ONLY EXISTS ON PUBLICATIONS. /income-tax-rates is a mainstream `guide` and carries NO
  -- amendment log at all. Neither does /vat-rates, /tax-on-dividends, /capital-allowances. The single
  -- most important page in our corpus, the one the personal allowance comes off, has no change
  -- history, so a watcher built on change_history alone would be blind exactly where it matters most
  -- while reporting that it was watching. Which is the worst thing a watcher can be.
  --
  -- Hence body_hash: the only signal that works on every page.
  schema_name       text,
  body_hash         text not null,
  change_count      integer not null default 0,
  latest_note       text,
  latest_change_at  timestamptz,

  public_updated_at timestamptz,
  updated_at        timestamptz,
  last_seen_at      timestamptz not null default now()
);

comment on table public.khoji_documents is
  'The last known state of every GOV.UK page a tax constant is read off. body_hash is the amendment detector: change_history exists only on publications, and the mainstream guides we depend on most (income-tax-rates, vat-rates) have no amendment log at all. A moved hash with no logged note IS the fortnight problem.';

notify pgrst, 'reload schema';

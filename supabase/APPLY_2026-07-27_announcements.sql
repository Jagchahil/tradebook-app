-- THE ANNOUNCEMENTS FEED. Where Khoji finally becomes visible to the people paying for it.
--
-- Khoji reads the law every night. A human approves what matters on the Brain desk. And then that
-- knowledge has, until today, disappeared straight into the tax engine, where no customer ever sees
-- it happen. The best thing this company owns has been completely invisible.
--
-- Two tables, and neither of them holds a fact about the law. The APPROVED knowledge already lives
-- in public.knowledge_items and it is not copied here: a second copy of a tax fact is a second copy
-- that can drift, and this codebase has been bitten by two readers over the same figure three times.
-- lib/announcements.ts reads knowledge_items directly and gates on status = 'reviewed'.
--
-- What IS here is the small amount that had nowhere to live:
--   1. announcements          a sentence a HUMAN wrote, in his own words
--   2. announcement_dismissals which customer has cleared which card
--
-- Run this whole file in the Supabase SQL editor. It is idempotent.

-- ---------------------------------------------------------------------------
-- 1. announcements: the human's own voice
-- ---------------------------------------------------------------------------
-- Two jobs. A plain product note ("you can now upload receipts from the web"), which cites nothing
-- because there is nothing to cite. And a shorter, plainer wording of a Khoji finding, which sets
-- knowledge_item_id, cites the same source, and SUPPRESSES the automatic card for that finding so
-- the same change is never announced twice in two different voices.
create table if not exists public.announcements (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  body              text,
  -- Optional for a product note. If it is set at all it must be a real https page: an uncheckable
  -- citation is worse than none, because it looks like one. lib/announcements.ts refuses the rest.
  source_url        text,
  -- When set, this row is a human's wording of that Khoji finding.
  knowledge_item_id uuid references public.knowledge_items(id) on delete set null,
  published_at      timestamptz not null default now(),
  -- A note that stops being true. Doc 103's empty test: a row that says nothing useful most of the
  -- time teaches him to stop looking, and then he misses the week it matters.
  expires_at        timestamptz,
  -- WHO SAID IT. The same accountability record as knowledge_items.reviewed_by, and for the same
  -- reason: when somebody later asks why we told six thousand men something, the answer has to be a
  -- name and a date, never "the system decided".
  created_by        text not null,
  created_at        timestamptz not null default now()
);

comment on table public.announcements is
  'Announcements a human wrote, shown in the customer banner. Approved Khoji findings are NOT copied here, they are read live from knowledge_items where status = reviewed. A row with knowledge_item_id set is a human rewording of that finding and suppresses the automatic card for it.';

comment on column public.announcements.created_by is
  'The team member who published this. A published announcement is read by every customer, so this is an accountability record, not metadata.';

-- The banner reads the live ones on every load. Index the read it actually does.
create index if not exists announcements_live_idx
  on public.announcements (published_at desc);

-- Suppression looks up by knowledge item. Partial, because most rows carry no link.
create index if not exists announcements_knowledge_item_idx
  on public.announcements (knowledge_item_id)
  where knowledge_item_id is not null;

-- SERVICE ROLE ONLY, no policy. Announcements are written on /team behind the team membership
-- check, and read by /api/announcements which verifies the customer's token itself. There is no
-- case where a browser should reach this table directly, so it is not given a way to.
alter table public.announcements enable row level security;

-- ---------------------------------------------------------------------------
-- 2. announcement_dismissals: he read it, he cleared it, it stays cleared
-- ---------------------------------------------------------------------------
-- The key is 'khoji:<knowledge_item_id>' or 'lekhio:<announcement_id>', built by khojiKey() and
-- manualKey() in lib/announcements.ts. Deliberately a text key rather than two nullable foreign
-- keys, so ONE dismissal covers both sources and one row means one card, on every surface.
--
-- ⚠️ THE KEY IS THE ID, NEVER A HASH OF THE TEXT. If we later fix a typo in an announcement, a man
-- who already dismissed it must not have it reappear as though it were news. That would train him
-- to ignore the banner, which is the only failure mode this feature really has.
create table if not exists public.announcement_dismissals (
  user_id          uuid not null,
  announcement_key text not null,
  dismissed_at     timestamptz not null default now(),
  primary key (user_id, announcement_key)
);

comment on table public.announcement_dismissals is
  'Which announcement a customer has cleared. Keyed by khoji:<id> or lekhio:<id> so a dismissal on the web is a dismissal on the phone.';

-- The read is always "everything this one user has dismissed". The primary key already leads on
-- user_id, so that read is covered and no second index is needed.

alter table public.announcement_dismissals enable row level security;
drop policy if exists "dismissals read own"   on public.announcement_dismissals;
drop policy if exists "dismissals insert own" on public.announcement_dismissals;
drop policy if exists "dismissals delete own" on public.announcement_dismissals;
create policy "dismissals read own"   on public.announcement_dismissals for select using ((select auth.uid()) = user_id);
create policy "dismissals insert own" on public.announcement_dismissals for insert with check ((select auth.uid()) = user_id);
create policy "dismissals delete own" on public.announcement_dismissals for delete using ((select auth.uid()) = user_id);

notify pgrst, 'reload schema';

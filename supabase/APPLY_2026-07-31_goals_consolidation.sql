-- ONE GOALS STORE, AND THE RECEIPTS BUCKET. The founder's reconciliation, written down and run.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- APPLY_2026-07-31_diary_goals.sql said out loud that two tables both meaning "what he is
-- saving for" is a second copy of a truth, and that the founder would decide the reconciliation
-- before it ran. He has decided: public.goals wins. It carries the kinds the tax sentence can
-- honestly reason about (a van is a capital item, a pension is not, and user_goals could never
-- say which), it holds pence like every other web surface, and it sits behind the service role
-- like its siblings. user_goals (Rakha's store from doc 82: kinds purchase, income, savings;
-- pounds; auth.uid() policies for the phone app) LOSES, and per that file's own rule its rows
-- are moved, not quietly abandoned.
--
-- 🔴 user_goals IS NOT DROPPED. The phone app is unreleased but its builds read user_goals with
-- auth.uid() policies, and dropping the table would turn every installed test build into an
-- error screen. It stays exactly as it is, READ ONLY LEGACY BY CONVENTION until launch two:
-- every server write path has been repointed at public.goals through lib/supabase.ts, and
-- test/goalstore.test.mjs fails the build if a writer of user_goals ever comes back. The drop
-- is launch two's decision, made when the phone app has a build that reads goals.
--
-- 🔴 THE KIND MAPPING IS HONEST, NEVER CLEVER, and it must stay byte for byte in agreement with
-- fromLegacyKind in lib/goals.ts:
--
--     purchase -> other      income -> income      savings -> other
--
-- A legacy 'purchase' titled "van" is NOT mapped to kind 'van'. The man never chose from the
-- new kinds, and guessing a capital item from a label would hand the tax planner a fact nobody
-- stated, on the strength of which it would tell him to spend money. The price is accepted: a
-- migrated "van for 24k" earns no capital sentence until he says so himself in a kind we can
-- trust. Amounts are pounds times one hundred into pence, rounded once. created_at is kept, so
-- the order he wrote his goals down in survives. Legacy ids are kept too, which is what makes
-- the migration idempotent: run twice, the second insert hits the primary key and does nothing.
--
-- ⚠️ WHAT IS NOT MIGRATED, SAID PLAINLY. 'dropped' goals stay behind: the new table's statuses
-- are open and done, and a goal he abandoned is neither, so carrying it forward as either would
-- be a lie about a decision he made. vendor_note stays behind with the legacy table for the
-- same reason it existed: it is the USER'S stated vendor, an FCA sensitive detail with no
-- column in the new shape. Both remain readable in user_goals until launch two rules on them.
--
-- Run this whole file in the Supabase SQL editor, AFTER APPLY_2026-07-31_diary_goals.sql
-- (it creates the same goals table if that file has not run, so order only matters for the
-- diary). It is idempotent.

create table if not exists public.goals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users (id) on delete cascade,

  -- Constrained rather than free text, the same reasoning as allowance_elections.key: a kind the
  -- planner has never heard of would sit here looking like a plan and do nothing. 'van' and
  -- 'tools' are named because they are the capital items the tax sentence can honestly reason
  -- about; everything else is honestly 'other'.
  kind         text not null check (kind in ('van', 'tools', 'pension', 'income', 'other')),

  -- His words for it. "New Transit", "Scaffold tower".
  label        text not null check (char_length(label) between 1 and 120),

  -- What it costs, in pence, if he said. Nullable: a goal without a figure is still a goal, and
  -- inventing one would be a figure on a money screen that nobody typed.
  amount_pence bigint check (amount_pence is null or amount_pence > 0),

  target_date  date,

  status       text not null default 'open' check (status in ('open', 'done')),

  created_at   timestamptz not null default now()
);

-- Every read is "this user's goals in the order he made them", so one index carries the surface.
create index if not exists goals_user_created_idx on public.goals (user_id, created_at);

comment on table public.goals is
  'Something the customer is saving towards. The kind is constrained so tax planning can reason deterministically about capital items. The amount is his own figure or nothing: never estimated, never filled in for him.';

alter table public.goals enable row level security;
-- No policies. Server written and server read only, the diary_jobs posture.

-- ---------------------------------------------------------------------------------------------
-- THE ROWS MOVE. active becomes open, done stays done, dropped stays behind (see the header).
-- Titles are trimmed and clamped to the new label check; a legacy row whose title was somehow
-- blank has nothing to say and is left in the legacy table rather than invented a name.
-- ---------------------------------------------------------------------------------------------
insert into public.goals (id, user_id, kind, label, amount_pence, target_date, status, created_at)
select
  ug.id,
  ug.user_id,
  case ug.kind
    when 'income' then 'income'
    else 'other'                          -- purchase and savings: honest, never guessed into van or tools
  end,
  left(btrim(ug.title), 120),
  round(ug.amount * 100)::bigint,         -- pounds into pence, once
  ug.target_date,
  case ug.status when 'done' then 'done' else 'open' end,
  ug.created_at                           -- the order he wrote them down in survives
from public.user_goals ug
where ug.status in ('active', 'done')
  and char_length(btrim(ug.title)) >= 1
  and ug.amount > 0                       -- the legacy check already guarantees this; belt and braces
on conflict (id) do nothing;              -- run twice, moved once

comment on table public.user_goals is
  'READ ONLY LEGACY until launch two. The founder consolidated goals into public.goals on 31 July 2026 (see APPLY_2026-07-31_goals_consolidation.sql): rows were migrated there, every server write path now goes through lib/supabase.ts to public.goals, and only unreleased phone app builds still read this table. Do not write it. Dropping it is launch two''s decision.';

-- ---------------------------------------------------------------------------------------------
-- THE RECEIPTS BUCKET. Private storage for the one piece of evidence HMRC would actually ask
-- to see: the photograph behind a parsed receipt. app/api/money/receipt used to read the image
-- and throw it away; lib/supabase.ts storeReceiptImage now uploads it here and writes the path
-- into transactions.raw_input_url, the column docs/03 reserved for exactly this.
--
-- 🔴 PRIVATE, AND NO STORAGE POLICIES ARE CREATED. public = false means no anonymous read, and
-- with no policies on storage.objects the anon and authenticated roles can do nothing here at
-- all: only the service role, which bypasses RLS, can read or write. That is the deny all
-- posture the goals table above holds, and doc 97 put it in writing that receipt images never
-- sit in a public bucket. The size limit matches the 4MB ceiling the upload route enforces, so
-- the bucket refuses what the route would have refused.
-- ---------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  4194304,  -- 4MB, the web route's MAX_BYTES, held in both places on purpose
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

notify pgrst, 'reload schema';

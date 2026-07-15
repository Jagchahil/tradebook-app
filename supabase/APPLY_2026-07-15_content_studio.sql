-- THE CONTENT STUDIO. The marketing engine, tracked in the team console.
--
-- Apply in the Supabase SQL editor. Safe to re-run.
--
-- WHAT THIS IS, AND THE ONE LINE IT SHARES WITH THE REST OF THE CONSOLE.
--
-- This is where an idea becomes a script, a script becomes an asset, an asset waits for Jag to say
-- yes, and a live post is measured. It is doc 111 (the creative bible) and doc 112 (this portal).
--
-- NONE OF THESE TABLES TOUCH A CUSTOMER'S DATA. Not a receipt, not a figure, not a phone number.
-- The only bridge to the customer world is a text tag on an asset, `source_tag`, which matches the
-- `acquisition_source` already on public.users. That lets the scoreboard say "this clip brought
-- eleven trials" by counting OUR own attribution, never by reading a single person's books.
--
-- RLS ON, ZERO POLICIES, on every table below. Nobody reads or writes these with an anon or a user
-- key. Only the service role, which only the server holds, exactly like team_members. The console
-- reaches them through /api/team/studio/*, which re-checks team_members on every request.

-- ============================================================================================
-- 1. IDEAS. The backlog anyone on the team can add to.
-- ============================================================================================
create table if not exists public.content_ideas (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  trade       text,                                  -- electrician, plumber, barber, ...
  format      text not null default 'video',         -- 'video' | 'carousel' | 'tip'
  promise     text not null default 'money',         -- 'money' | 'zero_habit' | 'honesty'
  note        text,
  votes       integer not null default 0,
  status      text not null default 'open',          -- 'open' | 'promoted' | 'parked'
  author      text,                                  -- the team email that added it
  created_at  timestamptz not null default now()
);

alter table public.content_ideas enable row level security;
-- No policies. Deliberately. Server only.

-- ============================================================================================
-- 2. ASSETS. An idea that is being made into something. The lifecycle lives in `state`.
-- ============================================================================================
--
-- state moves in one direction through the make loop (doc 111):
--   idea -> scripting -> generated -> awaiting_approval -> scheduled -> live -> measured
--
-- The server owns every transition. A client never posts a raw state string it invented.
create table if not exists public.content_assets (
  id            uuid primary key default gen_random_uuid(),
  idea_id       uuid references public.content_ideas(id) on delete set null,
  title         text not null,
  trade         text,
  format        text not null default 'video',
  promise       text not null default 'money',
  script        text,                                -- the words, from the bible template
  scene         text,                                -- the shot and vibe notes
  caption       text,                                -- the post caption
  file_url      text,                                -- reference to the generated file, null until made
  platforms     text[] not null default '{}',        -- target channels for this asset
  source_tag    text,                                -- the attribution tag it carries when live
  state         text not null default 'idea',
  scheduled_for timestamptz,
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists content_assets_state_idx on public.content_assets (state);
create index if not exists content_assets_source_idx on public.content_assets (source_tag);

alter table public.content_assets enable row level security;
-- No policies. Deliberately. Server only.

-- ============================================================================================
-- 3. APPROVALS. Every gate decision, with a name and a time. This is the audit trail.
-- ============================================================================================
--
-- Two kinds of gate (doc 112):
--   'publish'  Jag says an asset may go live.
--   'promote'  Jag says a proven post may become a paid ad, and sets a spend cap.
--
-- Nothing is deleted here. A rejection is a row, an approval is a row, a change of mind is a new
-- row. The history is the handover, and the answer to "who said yes, and when".
create table if not exists public.content_approvals (
  id              uuid primary key default gen_random_uuid(),
  asset_id        uuid not null references public.content_assets(id) on delete cascade,
  kind            text not null,                     -- 'publish' | 'promote'
  decision        text not null,                     -- 'approve' | 'reject' | 'changes'
  note            text,
  spend_cap_pence integer,                           -- only for a 'promote' approval
  decided_by      text not null,                     -- the team email. NEVER blank.
  created_at      timestamptz not null default now()
);

create index if not exists content_approvals_asset_idx on public.content_approvals (asset_id);

alter table public.content_approvals enable row level security;
-- No policies. Deliberately. Server only.

-- ============================================================================================
-- 4. METRICS. What a live post did. Entered by hand until an analytics connector exists.
-- ============================================================================================
--
-- ⚠️ WE HAVE NO ANALYTICS CONNECTOR YET. So these numbers are typed in by a human from the platform,
-- which is honest and fine at this volume. Trial to paid is NOT stored here: it is computed in the
-- app by matching `content_assets.source_tag` to `users.acquisition_source`, so the money number is
-- always the real one from our own records, never a figure someone copied wrong.
create table if not exists public.content_metrics (
  id          uuid primary key default gen_random_uuid(),
  asset_id    uuid not null references public.content_assets(id) on delete cascade,
  platform    text not null,                         -- tiktok | instagram | youtube | facebook | linkedin
  as_of       date not null default current_date,
  reach       integer not null default 0,
  saves       integer not null default 0,
  shares      integer not null default 0,
  clicks      integer not null default 0,            -- clicks through to a free tool
  trials      integer not null default 0,            -- trials the platform reports (soft signal)
  entered_by  text,
  created_at  timestamptz not null default now()
);

create index if not exists content_metrics_asset_idx on public.content_metrics (asset_id);

alter table public.content_metrics enable row level security;
-- No policies. Deliberately. Server only.

-- Verify.
select 'content_ideas' as t, count(*) from public.content_ideas
union all select 'content_assets', count(*) from public.content_assets
union all select 'content_approvals', count(*) from public.content_approvals
union all select 'content_metrics', count(*) from public.content_metrics;

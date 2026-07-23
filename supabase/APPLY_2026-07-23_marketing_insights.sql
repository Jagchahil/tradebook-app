-- APPLY 2026-07-23: marketing_insights.
--
-- THE CEO INSIGHT BOX (build board, "Content and the brain"). A single text field on the Growth
-- desk: Jag drops a field observation from Marketplace, a trade forum, or a customer chat, and it
-- is saved with the tag 'ceo_led_ideas'. The machine learns from data it can query; this is for the
-- thing data cannot see. Every row is server (service role) written and read, same posture as
-- team_todos and marketing_connectors: RLS on, no client policies, no customer data.
--
-- This is deliberately NOT the marketing brain card on the board ("The marketing brain": an
-- Obsidian vault, six note types, a nightly review). That is a separate, larger build. This table
-- is shaped so the brain can absorb it later (text, a tag, a source, a timestamp) without a
-- migration: when the brain exists, it reads this table as one of its note sources.
--
-- Additive and safe to run on a live database. Run once in the Supabase SQL editor (tradebook-prod).

create table if not exists public.marketing_insights (
  id         uuid primary key default gen_random_uuid(),
  text       text not null,
  tag        text not null default 'ceo_led_ideas',
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists marketing_insights_created_idx on public.marketing_insights (created_at desc);

alter table public.marketing_insights enable row level security;
-- No client policies: only the service role (used by the team-gated API) can read or write this.

comment on table public.marketing_insights is
  'CEO led field observations, tagged ceo_led_ideas, for the marketing brain to absorb once it exists. No customer data. Server (service role) access only.';

notify pgrst, 'reload schema';

-- SUPPORT KNOWLEDGE BASE. Jag's "Common Issues" notes, authored in Obsidian and synced in by a mini bot.
-- Each row is one common issue: a title, some match keywords, and the reply guidance/body. The Support
-- desk grounds its Claude draft in the matching rows and offers them as one-click pick-list replies. The
-- Obsidian vault is the source of truth; the sync REPLACES this table each run, so a deleted note
-- disappears here too. Service-role only: RLS on, no policies.

create table if not exists support_kb (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique not null,            -- stable id derived from the note filename
  title      text not null,
  keywords   text[] not null default '{}',    -- lowercased match terms
  body       text not null,                   -- the reply guidance
  updated_at timestamptz not null default now()
);

create index if not exists support_kb_slug on support_kb (slug);

alter table support_kb enable row level security;
-- No policies on purpose: reachable only with the service role key, from the server.

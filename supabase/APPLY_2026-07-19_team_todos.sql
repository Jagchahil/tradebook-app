-- APPLY 2026-07-19: team_todos.
--
-- The CEO to-do list, made real. Munshi (on the mini, from tomorrow 8am) REPLACES the day's list by
-- POSTing to /api/team/todos/sync; the console reads it and Jag ticks or approves. Two kinds:
--   'approve' = a bot has prepared it and can finish it on Jag's yes.
--   'needs'   = only Jag can do it.
-- No customer data. Server only via the service role (the team-gated API), same posture as the studio
-- tables. Seeded below with today's real items so the console is not empty before Munshi's first run.

create table if not exists public.team_todos (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'needs' check (kind in ('approve','needs')),
  buddy_key   text not null default 'munshi',
  text        text not null,
  from_label  text not null default '',
  where_hint  text,
  prio        text not null default 'md' check (prio in ('hi','md','lo')),
  done_label  text,
  done        boolean not null default false,
  sort        int not null default 100,
  created_at  timestamptz not null default now()
);
create index if not exists team_todos_order on public.team_todos (sort asc, created_at desc);
alter table public.team_todos enable row level security;
-- No client policies: RLS on + no policy = clients read nothing directly; the service role (used only
-- by the team-gated API) bypasses it. Nobody reaches this without a team_members row on the request.

-- Seed today's real items (id let default). Munshi will replace this list at 8am.
insert into public.team_todos (kind, buddy_key, text, from_label, where_hint, prio, done_label, sort) values
  ('approve','gyani','GOV.UK renamed the VAT registration page overnight. I found the new address and prepared the fix.','from Gyani · will publish it',null,'md','Published by Gyani',10),
  ('approve','munshi','Approve me to start, and your morning brief lands here from tomorrow.','from Munshi · runs itself once on',null,'hi','Munshi is on it',20),
  ('needs','hoka','Redo the App Store screenshots: real wordmark, one WhatsApp frame, benchmark vs Xero, QuickBooks, Monzo.','from Hoka · yours until I''m hired',null,'md',null,30),
  ('needs','mistri','Paste the OpenAI key into Vercel and redeploy, to switch voice notes on.','from Mistri','needs your Mac','md',null,40),
  ('needs','mistri','Turn on the Stripe customer portal in the dashboard so people can manage their own billing.','from Mistri','needs your Mac','lo',null,50);

notify pgrst, 'reload schema';

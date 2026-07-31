-- THE JOBS DIARY AND GOALS. The first slice of the employee that knows what he is doing next week.
--
-- A bricklayer says "measuring up Tuesday 8am". That is a diary row. When the slot has passed, the
-- job is a candidate for the one question worth asking: shall I draft the invoice? A goal ("a van
-- by March") is the other half: tax planning that knows he is saving for a capital item can reason
-- about buying it before the year end. Both tables are deliberately thin. lib/diary.ts and
-- lib/goals.ts hold every decision; nothing here computes anything.
--
-- ⚠️ COLUMNS ARE MINIMAL ON PURPOSE, THE SAME RULE AS onboarding_progress. No notes blob, no jsonb
-- of answers. A blob of what he said is a second copy of the truth, and this codebase has been
-- caught three times by two readers over one number. A job is what it is called, when it starts,
-- when it ends, who it is for, and where it has got to. If a future feature needs more, that is a
-- named column with a check, not a bag.
--
-- ⚠️ starts_at AND ends_at, NOT duration. The duration he types on the form is derived into
-- ends_at once, server side, so "has the slot passed" is a single timestamp comparison forever
-- after, and there are never two columns that could disagree about when a job finished.
--
-- 🔴 RLS POSTURE: ENABLED, NO POLICIES, SERVICE ROLE ONLY, and here is the decision written down.
-- Every read and write goes through lib/supabase.ts on the server with the service role key, and
-- every one of those queries is scoped by user_id from the session. No browser ever holds a key
-- that can reach these rows: the web app is server rendered with no client script at all. So the
-- posture is the one signups, subscriptions and onboarding_progress already hold: deny all, and
-- the service role bypasses. allowance_elections carries auth.uid() policies because it has a
-- surface these tables do not; granting policies nobody can use would only be a door to audit.
--
-- ⚠️ THERE IS ALREADY A user_goals TABLE IN schema.sql, AND THIS IS NOT IT, SAID OUT LOUD.
-- user_goals is Rakha's store from doc 82 (kinds purchase, income, savings; amount in pounds;
-- auth.uid() policies for the phone app), written by the WhatsApp agent paths. The goals table
-- below is the web slice's store: kinds the tax sentence can reason about (a van is a capital
-- item, a pension is not, and user_goals cannot say which), amounts in pence like the rest of
-- the web surfaces, service role only. Two tables that both mean "what he is saving for" is a
-- second copy of a truth, which this codebase treats as the house disease. Before this file is
-- run, the founder decides the reconciliation, and whichever table loses gets its rows moved,
-- not a quiet abandonment.
--
-- Run this whole file in the Supabase SQL editor. It is idempotent.

create table if not exists public.diary_jobs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,

  -- What he called it. "Measuring up", "Bathroom rewire". His words, never rewritten.
  title         text not null check (char_length(title) between 1 and 120),

  starts_at     timestamptz not null,
  ends_at       timestamptz not null check (ends_at > starts_at),

  -- Who the job is for, if he said. Nullable because plenty of jobs are for "the yard" or nobody
  -- in particular, and a required field he has to invent an answer for teaches him to lie to us.
  customer_name text check (customer_name is null or char_length(customer_name) between 1 and 120),

  -- Where the job has got to. 'invoiced' means he pressed the draft button and was handed a
  -- prefilled invoice form: it records that he took the job to invoicing, never that anything was
  -- sent. Nothing in this product sends anything to his customer, ever.
  status        text not null default 'planned' check (status in ('planned', 'done', 'invoiced')),

  created_at    timestamptz not null default now()
);

-- Every read is "this user's diary in date order", so one index carries the whole surface.
create index if not exists diary_jobs_user_starts_idx on public.diary_jobs (user_id, starts_at);

comment on table public.diary_jobs is
  'A job in the customer''s own diary. Thin on purpose: the upcoming and awaiting-invoice decisions live in lib/diary.ts, and status ''invoiced'' means he took the job to the invoice form, not that anything was sent.';

alter table public.diary_jobs enable row level security;
-- No policies. Server written and server read only, same posture as onboarding_progress.

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

create index if not exists goals_user_created_idx on public.goals (user_id, created_at);

comment on table public.goals is
  'Something the customer is saving towards. The kind is constrained so tax planning can reason deterministically about capital items. The amount is his own figure or nothing: never estimated, never filled in for him.';

alter table public.goals enable row level security;
-- No policies. Server written and server read only, same posture as diary_jobs above.

notify pgrst, 'reload schema';

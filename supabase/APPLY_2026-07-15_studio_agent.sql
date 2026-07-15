-- THE STUDIO AGENT HEARTBEAT. Apply after the content_studio migrations. Safe to re-run.
--
-- WHY THIS TABLE EXISTS BEFORE THE AGENT DOES ANYTHING USEFUL.
--
-- The Mac mini agent drafts content every morning. The expensive failure is not that it breaks
-- loudly, it is that it stops QUIETLY: launchd reports success, nothing new appears, and nobody
-- notices for a week because the studio was going to be quiet some days anyway. We have paid for
-- that exact lesson twice, with Khoji and with Rakha: a component that only writes when something
-- happens is indistinguishable, from the database, from a component that is dead.
--
-- So the agent writes a row EVERY run, success or failure, drafted something or drafted nothing.
-- The newest row is the heartbeat. If it is old, the bot is down, and that can go red on the console.
--
-- NO CUSTOMER DATA. It records that the agent ran, when, how many drafts it made, and whether it
-- threw. Nothing about any person.
create table if not exists public.studio_agent_runs (
  id          bigserial primary key,
  ran_at      timestamptz not null default now(),

  -- How many storyboards it drafted this run. Zero is a leg[itimate] answer (nothing to draft), and
  -- it is still a heartbeat: the run happened, it looked, there was nothing to do.
  drafted     integer not null default 0,

  -- How many ideas it considered. A run that considered nothing and drafted nothing may be healthy
  -- (empty backlog) but the console can tell the difference.
  considered  integer not null default 0,

  -- False when the run threw. A dead run still says so out loud rather than simply not existing that
  -- day, because a silent absence and a loud failure look identical from the database if only the
  -- healthy path ever writes.
  ok          boolean not null default true,

  note        text,
  duration_ms integer
);

create index if not exists studio_agent_runs_ran_at_idx on public.studio_agent_runs (ran_at desc);

alter table public.studio_agent_runs enable row level security;
-- No policies. Deliberately. Server only, like every other studio table.

-- Verify.
select count(*) as runs, max(ran_at) as last_run from public.studio_agent_runs;

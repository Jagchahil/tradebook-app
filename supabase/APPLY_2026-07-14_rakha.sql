-- 🔴 RAKHA'S HEARTBEAT. The organ that acts on the user's behalf, and leaves no trace.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Khoji has a heartbeat. The amendment watcher has one. The Budget loop has one. All three got them
-- because this brain once sat DEAD FOR FIVE DAYS while launchd reported success every morning, and
-- we learned, expensively, that A COMPONENT THAT ONLY WRITES WHEN SOMETHING HAPPENS IS
-- INDISTINGUISHABLE, FROM THE DATABASE, FROM A COMPONENT THAT IS DEAD.
--
-- Rakha has none. Its signals are computed on the way past a request and thrown away. There is no
-- table. So today we cannot tell you how many times Rakha has spoken to a user, whether it fired
-- this week, or whether it has been silently broken since Tuesday. IF IT STOPPED, NOTHING WOULD GO
-- RED.
--
-- And it is the organ whose silence costs the most. Khoji going quiet means we stop learning. Puchio
-- going quiet means a man asks a question and gets nothing, and he KNOWS, because he asked. Rakha
-- going quiet means the thing that was supposed to speak up FIRST, unprompted, about his money,
-- simply does not, and nobody finds out, because nobody was waiting for it.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ NOTE WHAT IS *NOT* IN THIS TABLE.
--
-- No figures. No amounts. No message text. The team console is forbidden financial data (task 13) and
-- that rule does not bend because a new table is convenient. What we need in order to know Rakha is
-- ALIVE is: it ran, when, how many signals it produced, and how many it actually sent. Nothing about
-- the man, and nothing about his money.

create table if not exists public.rakha_runs (
  id         bigserial primary key,

  ran_at     timestamptz not null default now(),

  -- How many users Rakha looked at. ⚠️ THE FIELD THAT MATTERS.
  --
  -- Same rule as khoji_runs.checked: A RUN THAT LOOKED AT NOBODY IS NOT A RUN. If this is zero, the
  -- run must not count as a heartbeat, however cheerfully it exited. The console reads the newest row
  -- WITH considered > 0, exactly as it does for the differ.
  considered integer not null default 0,

  -- How many signals it produced, and how many actually went out. The gap between them is the cap
  -- (PING_CAP_PER_DAY) doing its job, and it is worth being able to see it.
  signalled  integer not null default 0,
  sent       integer not null default 0,

  -- False when the run threw. A run that died still says so out loud, rather than simply not
  -- existing that day: a silent absence and a loud failure look identical from the database if only
  -- the healthy path ever writes.
  ok         boolean not null default true,

  duration_ms integer
);

create index if not exists rakha_runs_ran_at_idx on public.rakha_runs (ran_at desc);

alter table public.rakha_runs enable row level security;

-- No policy for anon or authenticated. With RLS on and no policy, the app cannot read this at all,
-- and it does not need to: it is an operational heartbeat, not user data. Only the service role, which
-- bypasses RLS, writes and reads it.
comment on table public.rakha_runs is
  'Rakha''s heartbeat. A row EVERY run, pass or fail. Rakha is the organ that acts on the user''s behalf and until today it left no trace, so a silent failure was invisible. `considered` is the load-bearing field: a run that looked at nobody is not a run. NO financial data, ever.';

notify pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- REMEMBER MY BROWSER. One column: which kind of session a row is.
--
-- From 31 July the sign in page carries an unticked "Remember my browser" box. Ticked, a session
-- is the ordinary ninety day sliding one. Unticked, the cookie is issued with no Max-Age so the
-- browser drops it on close, the row expires within hours, and lib/webauth.ts never slides it.
-- The choice is recorded HERE, on the row, because the row is the truth a cookie cannot argue
-- with: an unremembered session must not be extendable by anything a client resends.
--
-- The default is true because every existing row was opened before the question existed, under
-- the ninety day promise, and shortening a session a man was given without asking him is a silent
-- sign out. New rows never rely on the default: lib/supabase.ts writes the flag explicitly and
-- the parameter has no default value, so every door has to answer.
--
-- ⚠️ APPLY BEFORE DEPLOYING THE CODE THAT READS IT. readWebSession selects this column by name,
-- so a deploy against a database without it turns every web sign in away.
--
-- Run this whole file in the Supabase SQL editor (tradebook-prod). It is idempotent.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

alter table public.web_sessions
  add column if not exists remembered boolean not null default true;

comment on column public.web_sessions.remembered is
  'Whether "Remember my browser" was ticked when the session was opened. False: browser session cookie, hours long row, never slides. True: the ninety day sliding session. Rows from before 31 July 2026 predate the question and keep the ninety day promise they were opened under.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- THE WEB LOGIN. Two tables: how a man stays signed in, and what it cost us to let him in.
--
-- Until today the only logged in customer surface was the phone app, which holds a Supabase session
-- in the device keystore. The web app needs its own, and a browser cannot safely hold a token the
-- way a keystore can. So the browser gets an HttpOnly cookie carrying a session id, and
-- public.web_sessions holds what that id actually means. See lib/websession.ts for the full
-- reasoning.
--
-- The second table exists because of what was found in the Twilio console on 27 July. Read the next
-- section before deciding it is optional.
--
-- Run this whole file in the Supabase SQL editor (tradebook-prod). It is idempotent.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════


-- ── 1. THE SESSION ──────────────────────────────────────────────────────────────────────────────
--
-- ⚠️ WHY A TABLE AT ALL, WHEN THE COOKIE IS ALREADY SIGNED.
--
-- Because a signed cookie cannot be taken back. The session lasts ninety days on purpose, since
-- every SMS sign in costs roughly 7p to 10p and a weekly expiry would be a real line of cost for
-- showing a man a page he has already paid for. But ninety days of an un-revocable credential to a
-- man's books is not a trade worth making. A row can be revoked. A signature cannot.
--
-- ⚠️ WHAT IS DELIBERATELY NOT IN HERE.
--
-- No IP address, no user agent, no location. It would be easy to justify ("for security") and it
-- would be a log of where a man was and what he was holding when he looked at his own tax. We do
-- not need any of it to revoke a session, so we do not collect it. The app tells every customer
-- "your records are encrypted and only you can see them", and the shortest way to keep that
-- sentence true is to hold less.

create table if not exists public.web_sessions (
  -- The id that travels in the cookie. NOT a uuid default: it is generated in lib/websession.ts as
  -- 128 bits of url safe randomness, so the value in the cookie is never something a client chose
  -- and never a guessable sequence.
  id           text primary key check (id ~ '^[A-Za-z0-9_-]{22}$'),

  -- References auth.users, not public.users, for the same reason conversations does: a signed in
  -- identity can exist before a public.users profile row does. Cascades when the account is
  -- deleted, so account deletion takes every session with it and nothing outlives the man's data.
  user_id      uuid not null references auth.users(id) on delete cascade,

  created_at   timestamptz not null default now(),

  -- Moved at most once a day, never on every page view. See SESSION_TOUCH_AFTER_SECONDS.
  last_seen_at timestamptz not null default now(),

  -- The sliding expiry. Read server side, so an old cookie holding a later exp cannot outlive it.
  expires_at   timestamptz not null,

  -- Set when he signs out, or when we revoke. Never deleted, so "this session ended and when" is
  -- answerable, which a missing row cannot be.
  revoked_at   timestamptz
);

comment on table public.web_sessions is
  'A signed in browser session for the customer web app. The cookie carries only the id; the user is read from here, so a cookie can never assert whose books it wants. Deliberately holds no IP, user agent or location.';

-- Every lookup is by primary key. This index is for the other question: every live session for one
-- man, which is what "sign out on all devices" needs and what account deletion sweeps.
create index if not exists web_sessions_user_live
  on public.web_sessions(user_id) where revoked_at is null;

alter table public.web_sessions enable row level security;

-- ⚠️ NO POLICY IS CREATED ON PURPOSE, AND THE ABSENCE IS THE POINT.
--
-- With RLS on and no policy, the anon and authenticated roles can touch NOTHING here. Only the
-- service role, which bypasses RLS, reads or writes this table, and only ever from lib/supabase.ts
-- on the server. A session row is not the customer's data to read: it is the thing that decides
-- whether he is who he says he is, and a credential store its own holder can query is one SQL
-- injection away from being every credential store. Same posture as company_members and team_todos.


-- ── 2. WHAT IT COST TO LET HIM IN ───────────────────────────────────────────────────────────────
--
-- 🔴 WHY THIS TABLE EXISTS. READ THIS BEFORE DECIDING IT IS OVERKILL.
--
-- Verified in the Twilio console on 27 July 2026: the account is on TRIAL with £10.51 of credit,
-- owns no phone numbers, and has exactly ONE verified caller ID, which is Jag's own mobile. So SMS
-- login works for one person on earth today. The moment that account is upgraded and a card is
-- attached, the ceiling stops being £10.51 and becomes whatever the card allows.
--
-- That is the window where SMS pumping lives. Fraudsters control number ranges that earn revenue
-- share on delivered messages, point a script at a public "text me a code" button, and farm it.
-- Real companies have lost six figures over a weekend to exactly this.
--
-- ⚠️ ENFORCEMENT AND EVIDENCE ARE TWO DIFFERENT JOBS, AND THIS TABLE IS THE SECOND ONE.
--
-- The hard daily cap is enforced with the EXISTING rate_hit() function, because it is an atomic
-- Postgres upsert and a counter you can race is not a cap. Counting rows in this table to decide
-- whether to send would be check-then-write, which is the bug lib/margin.ts's header already warns
-- about. So rate_hit says yes or no, and this table answers the questions rate_hit cannot: how many
-- went today, what did they cost, was one target hammered, and did the refusals spike before anyone
-- noticed. Without it the first sign of trouble is a bill.
--
-- ⚠️ THE DESTINATION IS HASHED, NEVER STORED.
--
-- A raw list of every number and address that ever asked to sign in is a list of who our customers
-- are and when they were at their desk. We do not need it. We need to spot the SAME target being
-- hammered, and a keyed hash does that perfectly while being useless to anyone who reads the table.
-- The key is derived from WEB_SESSION_SECRET with its own domain prefix, so rotating that secret
-- makes historic rows unlinkable, which is a feature and not a bug.

create table if not exists public.auth_sends (
  id          bigint generated always as identity primary key,

  -- 'sms' or 'email'. Two channels, one login. Email is free and is the default door; SMS is the
  -- one that costs money and therefore the one worth watching.
  channel     text not null check (channel in ('sms', 'email')),

  -- HMAC of the E.164 number or the lowercased address. Never the value itself. See above.
  target_hash text not null check (length(target_hash) between 16 and 128),

  -- What actually happened, and the refusals matter more than the sends.
  --   sent             we asked the provider to send it
  --   refused_unknown  the number or address is not one of ours, so nothing was sent. This is the
  --                    single most valuable control: it collapses the attack surface from every
  --                    contact on earth to our own customer list.
  --   refused_capped   the global daily cap was already spent
  --   refused_rate     this target or this source had already asked too often
  --   failed           the provider refused or errored
  outcome     text not null check (outcome in ('sent', 'refused_unknown', 'refused_capped', 'refused_rate', 'failed')),

  created_at  timestamptz not null default now()
);

comment on table public.auth_sends is
  'One row per login code we were asked to send, for spend visibility and abuse forensics. The destination is a keyed hash, never the number or address. Enforcement lives in rate_hit(); this table is evidence, not a gate.';

-- The two questions asked of this table: what happened today, and was one target hammered.
create index if not exists auth_sends_recent on public.auth_sends (created_at desc);
create index if not exists auth_sends_target on public.auth_sends (target_hash, created_at desc);

alter table public.auth_sends enable row level security;
-- No policies. Service role only, same posture as web_sessions above.

-- RETENTION. Ninety days is long enough to investigate an incident and short enough that we are not
-- keeping a hashed record of every sign in for ever. Wired into the daily cron alongside
-- rate_hits_sweep, not left as a function nobody calls.
create or replace function public.auth_sends_sweep()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.auth_sends where created_at < now() - interval '90 days';
$$;

revoke all on function public.auth_sends_sweep() from public, anon, authenticated;


-- ── 3. THE LOOKUP THAT MAKES "NEVER SEND TO A STRANGER" CHEAP ───────────────────────────────────
--
-- Before a single code goes out, the number or address is looked up in the accounts we already
-- have. A miss sends nothing and shows the same neutral screen, so it costs us nothing and leaks
-- nothing about who is a customer.
--
-- public.users holds the phone and is already uniquely indexed on it. It has NO email column, so an
-- address is matched against public.signups (where a web signup's email lands before the account
-- exists) and against auth.users, which GoTrue already indexes. These two indexes cover the rest.
--
-- Emails are written lowercased by cleanEmail() in app/api/onboard/route.ts, so a plain index is
-- correct here and a lower() functional index would only be a second thing to keep in step.

create index if not exists signups_phone_idx on public.signups (phone);
create index if not exists signups_email_idx on public.signups (email) where email is not null;

notify pgrst, 'reload schema';

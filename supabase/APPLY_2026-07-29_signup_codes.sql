-- 🔴 WE SEND THE CODE OURSELVES. 29 July 2026. Apply in the Supabase SQL editor. Safe to re-run.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- WHY THIS EXISTS, AND WHY THE OBVIOUS ALTERNATIVE WAS REJECTED.
--
-- Signup mints the account on a proved email. The first attempt leaned on GoTrue to send the code,
-- and that failed in the field for a reason worth writing down: for a BRAND NEW address GoTrue does
-- not use the "Magic link or OTP" template at all, it uses "Confirm sign up", which is a link based
-- flow. Editing that template did not take: four sends over nine minutes all arrived with the old
-- body while the dashboard showed the new one saved.
--
-- ⚠️ THE FIX THAT WAS SUGGESTED FIRST, AND WHY IT WAS WITHDRAWN.
--
-- Turning "Confirm email" off would make GoTrue send the OTP template. It would also set
-- mailer_autoconfirm for the WHOLE PROJECT, which:
--
--   . applies to every flow, including email change on an existing account, not just signup;
--   . writes a FALSE FACT into the auth store, setting email_confirmed_at on every user whether or
--     not a human ever opened that inbox, so anything that later trusts that column trusts a lie we
--     planted ourselves;
--   . removes the mitigation that stands between an existing account and a second signup on the
--     same address.
--
-- That is a project wide change to fix one template. Refused. This table is the contained version:
-- we own the code, and the auth user is not created until the code comes back.
--
-- ⚠️ NOTHING EXISTS BEFORE PROOF. No auth user, no users row, no trial, no session. Until the right
-- code is typed, the entire footprint of a signup attempt is one row here and one email in somebody
-- else's inbox.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.signup_codes (
  id          uuid primary key default gen_random_uuid(),
  -- Normalised, so a plus tag or a gmail dot cannot buy a fresh bucket. See lib/trialidentity.ts.
  email_norm  text not null,
  -- What we actually sent to, kept because that is the address he will type back.
  email       text not null,
  -- 🔴 AN HMAC OF THE ADDRESS AND THE CODE TOGETHER, KEYED ON WEB_SESSION_SECRET. Never the code,
  -- and never a bare hash of it: six digits is a million values, so an unkeyed hash is a rainbow
  -- table somebody already has. Binding the address in means a hash lifted from one row cannot be
  -- replayed against another.
  code_hash   text not null,
  -- Five guesses and the code is dead, not merely wrong. Five in a million, once.
  attempts    integer not null default 0,
  expires_at  timestamptz not null,
  -- Single use. Set the moment a code is spent, and the spend is conditional on it being null.
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists signup_codes_lookup_idx
  on public.signup_codes (email_norm, created_at desc);

-- RLS ON, NO POLICIES. The same shape as signups and subscriptions, and stricter than any policy
-- we could write: the anon key can never see a row here, whatever else changes.
alter table public.signup_codes enable row level security;

-- 🔴 COUNTING A GUESS HAS TO BE ATOMIC, OR THE CAP IS DECORATION.
--
-- PostgREST cannot express "attempts = attempts + 1" through a PATCH, and the read then write
-- version has a hole in it: two guesses arriving together both read 3, both write 4, and five
-- attempts quietly becomes ten. A cap that can be doubled by pressing the button twice is not a
-- cap. The database does the sum.
--
-- security definer so it can write through RLS, and then REVOKED from anon and authenticated so
-- only the service role can call it. A function that increments a counter is harmless; a function
-- exposed to the anon key that touches a table nothing else can reach is not.
create or replace function public.increment_signup_attempt(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.signup_codes set attempts = attempts + 1 where id = p_id;
$$;

revoke all on function public.increment_signup_attempt(uuid) from public;
revoke all on function public.increment_signup_attempt(uuid) from anon;
revoke all on function public.increment_signup_attempt(uuid) from authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- AND THE BRIDGE FROM AN ADDRESS TO AN ACCOUNT.
--
-- findContactAccount('email', ...) resolves an address by reading the signups row and then the
-- PHONE on it, because public.users has no email column and the phone was the account key. Under an
-- email minted account that phone is deliberately empty, so the sign in door would find nothing and
-- every man who joined on the web would be unable to get back in the next day.
--
-- The signup row already knows both facts, so it becomes the bridge. Written at verify time, once
-- the address is proved.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

alter table public.signups add column if not exists user_id uuid;
create index if not exists signups_user_id_idx on public.signups (user_id);

notify pgrst, 'reload schema';

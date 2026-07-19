-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- COMPANY MEMBERS — the owners of a limited company, under one paid company account.
--
-- The model (Jag, 19 Jul): one company pays for one account. Companies House tells us who the owners
-- are (the persons with significant control, or the directors). Each owner gets a personal return under
-- that account. This table records those owners: seeded from the register, and linked to an owner's own
-- Lekhio login once they accept an invite.
--
-- This migration adds ONLY the table. It changes nothing about subscriptions, auth, or entitlement —
-- billing and per-owner logins are separate, deliberate steps. Read/written by the server (service
-- role) exactly like team_todos, so RLS is on with no client policies. No customer money or figures
-- live here; it is a roster of names from a public register.
-- Run once in the Supabase SQL editor (tradebook-prod). Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.company_members (
  id             uuid primary key default gen_random_uuid(),
  company_number text not null,                 -- the Companies House number this owner belongs to
  owner_user_id  uuid not null,                 -- the paying account holder (the company account)
  member_user_id uuid,                          -- the owner's OWN Lekhio user, once they accept (nullable)
  name           text not null,                 -- from the register
  role           text,                          -- 'owner' (a PSC) or 'director'
  control_band   text,                          -- the PSC control band, if known
  invite_email   text,                          -- where an invite was sent, if any
  status         text not null default 'pending'
                 check (status in ('pending', 'invited', 'active', 'declined')),
  created_at     timestamptz not null default now(),
  -- One row per named owner per company account, so re-seeding from the register never duplicates.
  unique (owner_user_id, company_number, name)
);

comment on table public.company_members is
  'Owners of a limited company under one paid company account, seeded from the Companies House register and linked to each owner''s own login once invited. No customer money or tax figures. Server (service role) access only.';

create index if not exists company_members_owner_idx on public.company_members (owner_user_id);
create index if not exists company_members_member_idx on public.company_members (member_user_id);

alter table public.company_members enable row level security;
-- No client policies: only the service role (used by our server routes) can read or write this, the
-- same posture as team_todos and the knowledge tables.

notify pgrst, 'reload schema';

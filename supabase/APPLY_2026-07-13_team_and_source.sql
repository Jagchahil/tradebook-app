-- THE TEAM DASHBOARD, AND WHERE OUR CUSTOMERS CAME FROM.
--
-- Apply in the Supabase SQL editor. Safe to re-run.
--
-- ============================================================================================
-- 1. THE TEAM
-- ============================================================================================
--
-- Who is allowed to see the dashboard. Membership is a row here and nothing else: there is no
-- "admin" flag hidden on a user, no password in an env var, no shared login. Add a person by
-- inserting a row, remove them by deleting one, and it takes effect on their next request.
--
-- RLS ON, ZERO POLICIES. That means NOBODY can read this table with an anon or a user key. Only
-- the service role, which only the server has. A team member cannot even read the team list from
-- the browser. That is the strongest state available to us and it is the correct one here: this
-- table is the key to the building.

create table if not exists public.team_members (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  name       text,
  role       text not null default 'member',   -- 'owner' | 'member'
  is_active  boolean not null default true,
  created_at timestamptz default now()
);

alter table public.team_members enable row level security;
-- No policies. Deliberately. See above.

-- ============================================================================================
-- 2. WHERE THE CUSTOMER CAME FROM
-- ============================================================================================
--
-- Meta, an organic post, a billboard, a face to face sale, a referral. Without this we are
-- spending money on adverts and guessing which ones worked, which is the most expensive way there
-- is to run a business.
--
--   acquisition_source  the channel, one of a small fixed set (see lib/team.ts)
--   acquisition_detail  the free text underneath it: which campaign, which billboard, which rep
--
-- Nullable, because everyone who signed up before today has no answer and we will not invent one.
-- They read as "unknown", which is the truth.

alter table public.users add column if not exists acquisition_source text;
alter table public.users add column if not exists acquisition_detail text;

create index if not exists users_acquisition_source_idx on public.users (acquisition_source);

-- ============================================================================================
-- 3. SEED THE FIRST TEAM MEMBER (you)
-- ============================================================================================
--
-- Change the email if this is not the address you will sign in with. The dashboard sends a magic
-- link to it, so it must be one you can actually open.

insert into public.team_members (email, name, role)
values ('jagchahil12@gmail.com', 'Jag', 'owner')
on conflict (email) do update set is_active = true, role = 'owner';

-- Verify.
select email, role, is_active from public.team_members order by created_at;

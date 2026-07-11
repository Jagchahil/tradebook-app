-- The brain. What Lekhio learns from the people using it.
--
-- TWO STORES. THEY MUST NOT BE CONFUSED.
--
--   user_rules       What THIS person taught us. "For me, CIRCLE K is fuel."
--                    Private. Theirs. It always wins over the crowd, because a
--                    plumber booking CIRCLE K as fuel and a decorator booking it
--                    as meals are BOTH right about their own business.
--
--   vendor_patterns  What EVERYONE taught us, as anonymous counts.
--                    "screwfix -> materials, 8,412 votes."
--                    NO user ids. NO amounts. NO dates. NO personal data of any
--                    kind. It is an aggregate and nothing else, and a pattern is
--                    only ever served once at least 3 different people agree, so
--                    nothing can be traced back to one person's books.
--
-- WHY IT IS WORTH BUILDING. A bank transaction costs us NO AI today, because it is
-- categorised by a rules map (lib/bankfeed.ts). Anything the map does not know
-- becomes "other". The only way to do better would be to ask Claude about every
-- bank line, which would destroy the one property that makes the bank feed the
-- channel we want everyone on (see lib/margin.ts). This store lets the bank feed
-- get ACCURATE while staying FREE. And it compounds: the longer someone stays, the
-- more of their books are vendors we already know.
--
-- Safe to re-run.

-- --- what this person taught us ----------------------------------------------

create table if not exists public.user_rules (
  user_id     uuid not null references public.users (id) on delete cascade,
  -- The normalised vendor. "SCREWFIX 1234 LONDON", "SCREWFIX DIRECT LTD" and
  -- "SCREWFIX.COM" all reduce to "screwfix". See normaliseVendor in lib/memory.ts.
  vendor_key  text not null,
  category    text,
  is_personal boolean,
  hits        integer not null default 1,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  primary key (user_id, vendor_key)
);

alter table public.user_rules enable row level security;

drop policy if exists "own rules select" on public.user_rules;
create policy "own rules select" on public.user_rules
  for select using (auth.uid() = user_id);

drop policy if exists "own rules write" on public.user_rules;
create policy "own rules write" on public.user_rules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- --- what everyone taught us, anonymously ------------------------------------
--
-- There is deliberately no user_id here and there never will be. This table is the
-- only thing in the system that pools anything across accounts, so it holds the
-- absolute minimum that is useful: a merchant, a category, and how many people
-- said so.

create table if not exists public.vendor_patterns (
  vendor_key text not null,
  category   text not null,
  votes      integer not null default 1,
  updated_at timestamptz default now(),
  primary key (vendor_key, category)
);

-- NOT readable by users directly. It is served only through the code paths that
-- categorise, using the service role, so nobody can mine it.
alter table public.vendor_patterns enable row level security;
-- No policies: with RLS on and no policy, anon and authenticated get nothing.

-- --- learning ------------------------------------------------------------------
--
-- One call, so a lesson is written atomically and a correction can never half land.
--
-- p_share is FALSE for anything personal. "Not business" is a fact about a PERSON,
-- not about a merchant: one man's transfer to MR J SMITH is his brother, another's
-- is a customer paying him. It is learned for THAT USER and never pooled.

create or replace function public.learn_vendor(
  p_user     uuid,
  p_key      text,
  p_category text,
  p_personal boolean,
  p_share    boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_key is null or length(trim(p_key)) = 0 then
    return;
  end if;

  -- What this person knows. The newest correction wins, and we count how often it
  -- has been useful.
  insert into public.user_rules (user_id, vendor_key, category, is_personal, hits)
  values (p_user, p_key, p_category, p_personal, 1)
  on conflict (user_id, vendor_key) do update
    set category    = coalesce(excluded.category, public.user_rules.category),
        is_personal = coalesce(excluded.is_personal, public.user_rules.is_personal),
        hits        = public.user_rules.hits + 1,
        updated_at  = now();

  -- What everyone knows. Categories only, never anything personal.
  if p_share and p_category is not null then
    insert into public.vendor_patterns (vendor_key, category, votes)
    values (p_key, p_category, 1)
    on conflict (vendor_key, category) do update
      set votes      = public.vendor_patterns.votes + 1,
          updated_at = now();
  end if;
end $$;

revoke all on function public.learn_vendor(uuid, text, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.learn_vendor(uuid, text, text, boolean, boolean) to service_role;

-- Verify.
select
  (select count(*) from public.user_rules)      as rules_learned,
  (select count(*) from public.vendor_patterns) as patterns_pooled;

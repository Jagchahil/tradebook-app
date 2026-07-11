-- CRITICAL. The shared brain can be poisoned by one person, in three requests.
--
-- THE BUG. vendor_patterns is the ONLY table in Lekhio that pools anything across
-- accounts. lib/memory.ts serves a pattern to EVERY user once it has 3 votes, and
-- both the vendor and the category are attacker controlled (the category is just a
-- text column on his own transaction, which he can PATCH freely under his own RLS).
--
-- learn_vendor did `votes = votes + 1` on EVERY call, with no per-user dedupe. And
-- /api/learn re-learns the same transaction on every POST, rate limited at 300 an
-- hour. So:
--
--     POST /api/learn {id} x3   ->   votes = 3   ->   served to every other user
--
-- One man, three requests, and "SCREWFIX is gambling" is in everyone's books.
--
-- AND IT MADE A CLAIM WE WERE NOT KEEPING. Both memory.sql and lib/memory.ts said a
-- pattern is only trusted once "3 DIFFERENT people agree", and that therefore
-- nothing can be traced back to one person's books. That was not what the SQL did.
-- Three votes could be, and in the attack always were, one person. The privacy
-- property we told ourselves we had, we did not have.
--
-- THE FIX. Count PEOPLE, not requests. A vote is now a row keyed on the user, so a
-- man can only ever vote once for a given vendor and category, however many times he
-- taps. The claim becomes true, and the attack needs three separate real accounts
-- to move a single vendor by a single vote.
--
-- Safe to re-run.

-- Who voted for what. One row per person per vendor per category. This is the whole
-- fix: the primary key makes a second vote from the same person a no-op.
--
-- It holds a user_id, so unlike vendor_patterns it is NOT anonymous, and it is
-- therefore locked down hard: no policies, service role only, and it cascades on
-- user delete so an erasure request takes the votes with it.
create table if not exists public.vendor_pattern_votes (
  vendor_key text not null,
  category   text not null,
  user_id    uuid not null references public.users (id) on delete cascade,
  created_at timestamptz default now(),
  primary key (vendor_key, category, user_id)
);

alter table public.vendor_pattern_votes enable row level security;
-- No policies. With RLS on and no policy, anon and authenticated read nothing.

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
declare
  v_new_voter boolean := false;
begin
  if p_key is null or length(trim(p_key)) = 0 then
    return;
  end if;

  -- Cap the length of anything that gets stored, so a huge string cannot be used to
  -- bloat the table or the payload we send to every other user.
  if length(p_key) > 60 or (p_category is not null and length(p_category) > 40) then
    return;
  end if;

  -- What this person knows. Private to them. Unchanged.
  insert into public.user_rules (user_id, vendor_key, category, is_personal, hits)
  values (p_user, p_key, p_category, p_personal, 1)
  on conflict (user_id, vendor_key) do update
    set category    = coalesce(excluded.category, public.user_rules.category),
        is_personal = coalesce(excluded.is_personal, public.user_rules.is_personal),
        hits        = public.user_rules.hits + 1,
        updated_at  = now();

  -- What everyone knows. Categories only, never anything personal.
  if p_share and p_category is not null then

    -- ONE VOTE PER PERSON. The primary key does the work: if he has already voted
    -- for this vendor and category, the insert does nothing and v_new_voter stays
    -- false, so the public count does not move however many times he taps.
    insert into public.vendor_pattern_votes (vendor_key, category, user_id)
    values (p_key, p_category, p_user)
    on conflict (vendor_key, category, user_id) do nothing;

    get diagnostics v_new_voter = row_count;

    if v_new_voter then
      insert into public.vendor_patterns (vendor_key, category, votes)
      values (p_key, p_category, 1)
      on conflict (vendor_key, category) do update
        set votes      = public.vendor_patterns.votes + 1,
            updated_at = now();
    end if;
  end if;
end $$;

revoke all on function public.learn_vendor(uuid, text, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.learn_vendor(uuid, text, text, boolean, boolean) to service_role;

-- Rebuild the public counts from the votes, so any votes stacked up by the old
-- function (which counted requests, not people) are corrected to the real number of
-- distinct people who actually said it.
update public.vendor_patterns p
   set votes = coalesce((
         select count(*) from public.vendor_pattern_votes v
          where v.vendor_key = p.vendor_key and v.category = p.category
       ), 0);

-- A pattern with nobody behind it is not a pattern.
delete from public.vendor_patterns where votes < 1;

-- Verify: no pattern can now claim more votes than it has distinct voters.
select
  (select count(*) from public.vendor_patterns)      as patterns,
  (select count(*) from public.vendor_pattern_votes) as votes,
  (select count(*) from public.vendor_patterns p
     where p.votes <> (select count(*) from public.vendor_pattern_votes v
                        where v.vendor_key = p.vendor_key and v.category = p.category)
  ) as mismatched;   -- must be 0

-- Share my books. Renames and rescopes the accountant grant built earlier today.
--
-- WHY THIS MIGRATION EXISTS.
--
-- Two things were wrong with the first version, and a single real test found both.
--
-- 1. THE FRAMING. It was called "give my accountant access". Lekhio's whole pitch
--    is that you do not need to pay an accountant. Shipping a feature named after
--    the accountant concedes he exists and quietly demotes us to the thing that
--    feeds him. The people who actually need to see a tradesperson's books are
--    usually a MORTGAGE BROKER, a lender on a van, a landlord, or a grant
--    application. An accountant is one option, not the headline.
--
-- 2. THE SCOPE, which is the serious one. It shared EVERY confirmed entry, ever,
--    with no date range and no exclusions. The first real test link contained
--    CHILD TAX CREDIT, BET365 and personal transfers. Nobody wants to hand their
--    mortgage broker their betting account. Sharing your books should not mean
--    sharing your life.
--
-- So: rename it, and let the user choose a date range and leave categories out.
--
-- Safe to re-run. Renames are guarded so a second run is a no-op.

begin;

-- Rename the table, if it has not already been renamed.
do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'public' and table_name = 'accountant_grants')
     and not exists (select 1 from information_schema.tables
              where table_schema = 'public' and table_name = 'book_shares')
  then
    alter table public.accountant_grants rename to book_shares;
    alter table public.book_shares rename column accountant_name  to recipient_name;
    alter table public.book_shares rename column accountant_email to recipient_email;
  end if;
end $$;

-- If the first migration was never run, create it outright.
create table if not exists public.book_shares (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users (id) on delete cascade,
  recipient_name  text,
  recipient_email text,
  revoked_at      timestamptz,
  expires_at      timestamptz not null,
  last_viewed_at  timestamptz,
  view_count      integer not null default 0,
  created_at      timestamptz default now()
);

-- THE SCOPE. This is the fix that matters.
--
-- from_date            only entries on or after this date are shared. Null means
--                      everything, which the app never offers by default.
-- exclude_categories   categories the recipient must never see. The app shows the
--                      user their own real categories and lets them untick.
--
-- Both are enforced on the server when the page is built, never in the template,
-- so a future design change cannot quietly widen what leaves the building.
alter table public.book_shares add column if not exists from_date date;
alter table public.book_shares add column if not exists exclude_categories text[] not null default '{}';

create index if not exists book_shares_user_idx
  on public.book_shares (user_id, created_at desc);
create index if not exists book_shares_live_idx
  on public.book_shares (user_id) where revoked_at is null;

alter table public.book_shares enable row level security;

drop policy if exists "own grants select" on public.book_shares;
drop policy if exists "own grants insert" on public.book_shares;
drop policy if exists "own grants update" on public.book_shares;
drop policy if exists "own grants delete" on public.book_shares;

drop policy if exists "own shares select" on public.book_shares;
create policy "own shares select" on public.book_shares
  for select using (auth.uid() = user_id);

drop policy if exists "own shares insert" on public.book_shares;
create policy "own shares insert" on public.book_shares
  for insert with check (auth.uid() = user_id);

drop policy if exists "own shares update" on public.book_shares;
create policy "own shares update" on public.book_shares
  for update using (auth.uid() = user_id);

drop policy if exists "own shares delete" on public.book_shares;
create policy "own shares delete" on public.book_shares
  for delete using (auth.uid() = user_id);

-- The view counter, renamed with the table.
drop function if exists public.touch_accountant_grant(uuid);

create or replace function public.touch_book_share(p_share uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.book_shares
     set last_viewed_at = now(),
         view_count     = view_count + 1
   where id = p_share
     and revoked_at is null
     and expires_at > now();
$$;

revoke all on function public.touch_book_share(uuid) from public, anon, authenticated;
grant execute on function public.touch_book_share(uuid) to service_role;

-- Kill any link created before the scope existed. They share everything, which is
-- exactly the thing we are fixing, so they must not keep working.
update public.book_shares
   set revoked_at = now()
 where revoked_at is null
   and from_date is null;

commit;

-- Verify: 12 columns, and no live share without a date range.
select
  (select count(*) from information_schema.columns
    where table_name = 'book_shares')                                as columns,
  (select count(*) from public.book_shares
    where revoked_at is null and from_date is null)                  as unscoped_live_shares;

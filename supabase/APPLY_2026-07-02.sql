-- ADDED 2 JULY 2026 (Fable audit, doc 74). APPLY THIS BLOCK IN THE SUPABASE SQL
-- EDITOR. Two items: the grouped weekly totals RPC (replaces the N plus one
-- weekly cron fan out) and the phone binding trigger (binds users.phone_number
-- to the OTP verified phone on the JWT, closing the deferred H1 finding).
-- Both are idempotent. The cron falls back to the old per user query until the
-- RPC exists, so applying late is safe; applying is still required for scale.
-- ---------------------------------------------------------------------------

-- Weekly totals for every user in one grouped pass. Confirmed entries only,
-- keyed off transaction_date (falling back to created_at) so the WhatsApp
-- summary agrees with the app.
create or replace function public.weekly_totals_all()
returns table (user_id uuid, income numeric, expenses numeric)
language sql
security definer
set search_path = public
as $$
  select
    t.user_id,
    coalesce(sum(case when t.amount >= 0 then t.amount end), 0) as income,
    coalesce(sum(case when t.amount < 0 then -t.amount end), 0) as expenses
  from public.transactions t
  where t.confirmed = true
    and coalesce(t.transaction_date, t.created_at::date) >= (current_date - 7)
  group by t.user_id;
$$;

-- Lock the function down: only the service role should call it.
revoke all on function public.weekly_totals_all() from public;
revoke all on function public.weekly_totals_all() from anon;
revoke all on function public.weekly_totals_all() from authenticated;
grant execute on function public.weekly_totals_all() to service_role;

-- Bind the stored phone to the verified phone on the JWT. OTP is the only login
-- path in production, so an authenticated session always carries the phone it
-- verified. This makes it impossible for a signed in client to point its account
-- at someone else's number, even with handcrafted REST calls. The service role
-- (webhook, server) is exempt. Clearing the phone (null) stays allowed.
-- NOTE: apply only while OTP login is ON (it is, and anonymous sign in is
-- disabled). Comparison is on national significant digits so formatting cannot
-- dodge the check.
create or replace function public.enforce_phone_binding()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  claims  json;
  role_c  text;
  jwt_ph  text;
  new_d   text;
  jwt_d   text;
begin
  begin
    claims := nullif(current_setting('request.jwt.claims', true), '')::json;
  exception when others then
    claims := null;
  end;
  role_c := coalesce(claims->>'role', '');
  -- Server side writes (service role, or no JWT at all) are trusted.
  if role_c <> 'authenticated' then
    return new;
  end if;
  if new.phone_number is null then
    return new;
  end if;
  jwt_ph := coalesce(claims->>'phone', '');
  new_d := regexp_replace(new.phone_number, '\D', '', 'g');
  jwt_d := regexp_replace(jwt_ph, '\D', '', 'g');
  -- Accept +44 E.164, national 07 form, or bare digits of the same number.
  if new_d = jwt_d
     or ('44' || ltrim(new_d, '0')) = jwt_d
     or new_d = ('44' || ltrim(jwt_d, '0')) then
    return new;
  end if;
  raise exception 'phone_number must match the phone verified on this account';
end;
$$;

drop trigger if exists users_phone_binding on public.users;
create trigger users_phone_binding
  before insert or update of phone_number on public.users
  for each row execute function public.enforce_phone_binding();

-- Scale indexes for 20,000+ users (added 2 July 2026, apply with the block above).
-- The cleanup job deletes processed_messages by age; without this index that
-- delete scans millions of rows.
create index if not exists processed_messages_created_idx on public.processed_messages(created_at);
-- The webhook's "latest unconfirmed entry" lookup (delete that / change it to X).
create index if not exists transactions_user_unconfirmed_idx
  on public.transactions(user_id, created_at desc) where confirmed = false;

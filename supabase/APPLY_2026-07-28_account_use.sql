-- 🔴 WHAT IS THIS ACCOUNT FOR. Asked once, at connect. 28 July 2026.
--
-- The one tap confident pile went live and was pointed at a real personal account. It offered to
-- file, in a single press: a holiday train, two holiday coffees as "meals", and three months of
-- overdraft fees as "bank charges". Six personal costs into a man's tax figures, one tap.
--
-- The merchant did not lie. The ACCOUNT did. Nothing knew whether it was looking at an account he
-- trades through or one he lives out of, so it read every line as a business decision waiting to
-- be classified.
--
-- NULL is deliberate and is NOT a mistake: it means we never asked, which is true of every
-- connection made before today. lib/reviewpile.ts readAccountUse() reads null as 'mixed', which is
-- exactly how those connections already behave, so nothing changes underneath anybody.
--
-- Idempotent. Safe to run more than once.

alter table public.bank_connections
  add column if not exists account_use text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bank_connections_account_use_check'
  ) then
    alter table public.bank_connections
      add constraint bank_connections_account_use_check
      check (account_use is null or account_use in ('business', 'personal', 'mixed'));
  end if;
end $$;

notify pgrst, 'reload schema';

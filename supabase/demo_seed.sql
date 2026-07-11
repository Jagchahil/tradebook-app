-- Demo account for App Store and Play Store review.
--
-- WHY THIS EXISTS
--
-- Lekhio signs in with a phone OTP. An Apple reviewer sits in California and
-- cannot receive an SMS sent to a UK mobile. "We were unable to sign in" is the
-- single most common reason an app like ours gets rejected, and it happens before
-- the reviewer has seen a thing.
--
-- So we hand them an account that does not need a real SMS: a phone number in the
-- UK's RESERVED range with a fixed OTP configured in Supabase (see docs/102).
--
-- +44 7700 900xxx is reserved by Ofcom for drama and testing. It is never
-- allocated to a real person, so this number can never collide with a real user
-- and no real SMS is ever sent to it.
--
-- The account also needs:
--   . an ACTIVE subscription row, or the paywall locks the reviewer out and they
--     reject us for exactly the thing we restructured the app to avoid
--   . real looking data, because an empty app reads as an incomplete app
--
-- SAFE TO RE-RUN. Idempotent: deletes and rebuilds the demo user's data every
-- time, and touches no other account.

begin;

-- The reserved demo number and its fixed identity.
-- The uuid is hardcoded so this script is idempotent and so the Supabase Auth user
-- (created in the dashboard, see docs/102) can be matched to it exactly.
--
-- ⚠️ AFTER creating the auth user in the dashboard, paste ITS uuid here, replacing
-- the placeholder below. The auth user and this row MUST share an id.
do $$
declare
  demo_id    uuid := '00000000-0000-4000-8000-000000000001'; -- <-- REPLACE with the real auth uuid
  demo_phone text := '+447700900123';
  today      date := current_date;
begin

  -- The profile.
  insert into public.users (id, phone_number, name, trade_type, is_active)
  values (demo_id, demo_phone, 'Demo Account', 'electrician', true)
  on conflict (id) do update
    set phone_number = excluded.phone_number,
        name         = excluded.name,
        trade_type   = excluded.trade_type,
        is_active    = true;

  -- Wipe any previous demo data so re-running gives a clean, identical account.
  delete from public.transactions where user_id = demo_id;
  delete from public.subscriptions where phone = demo_phone;

  -- ACTIVE subscription. Without this the reviewer hits the paywall screen and
  -- cannot see the product. No Stripe ids: this is a local grant, not a real
  -- customer, so it can never be billed and never appears in Stripe.
  insert into public.subscriptions (phone, plan, status, amount_pence, current_period_end, cancel_at_period_end)
  values (demo_phone, 'monthly', 'active', 1299, now() + interval '365 days', false);

  -- A realistic, boring month of a working electrician. Mixed income and expenses,
  -- mixed sources, some confirmed and some awaiting review, so the reviewer can see
  -- the approval gate actually doing something.
  insert into public.transactions
    (user_id, amount, vendor, category, transaction_date, description, source_type, confirmed)
  values
    (demo_id,  1450.00, 'Harding Builders',   'Income',        today - 2,  'Consumer unit upgrade, 3 bed semi', 'whatsapp_text',  true),
    (demo_id,   -84.30, 'City Electrical',    'Materials',     today - 2,  'Cable, back boxes, breakers',      'whatsapp_image', true),
    (demo_id,   -62.15, 'Shell',              'Fuel',          today - 3,  'Diesel',                            'whatsapp_image', true),
    (demo_id,   980.00, 'M. Okafor',          'Income',        today - 5,  'Rewire, first floor',               'whatsapp_text',  true),
    (demo_id,  -213.40, 'Screwfix',           'Tools',         today - 6,  'Impact driver and bits',            'whatsapp_image', true),
    (demo_id,   -45.00, 'NICEIC',             'Subscriptions', today - 9,  'Monthly membership',                'bank_feed',      true),
    (demo_id,  -128.90, 'City Electrical',    'Materials',     today - 11, 'Consumer unit',                     'whatsapp_image', true),
    (demo_id,   -18.60, 'Costa',              'Meals',         today - 12, 'Site coffee run',                   'whatsapp_image', false),
    (demo_id,  2100.00, 'Ravensworth Ltd',    'Income',        today - 14, 'Commercial lighting install',       'whatsapp_text',  true),
    (demo_id,   -74.25, 'Toolstation',        'Materials',     today - 15, 'Trunking and clips',                'whatsapp_image', false),
    (demo_id,   -55.00, 'Vodafone',           'Phone',         today - 18, 'Monthly bill',                      'bank_feed',      true),
    (demo_id,  -890.00, 'Ford Finance',       'Vehicle',       today - 20, 'Van payment',                       'bank_feed',      true),
    (demo_id,   640.00, 'J. Whitaker',        'Income',        today - 23, 'EV charger install',                'whatsapp_text',  true),
    (demo_id,   -32.80, 'Shell',              'Fuel',          today - 25, 'Diesel',                            'whatsapp_image', true);

end $$;

commit;

-- Verify: should show one active subscription and 14 transactions.
select
  (select count(*) from public.transactions t
     join public.users u on u.id = t.user_id
    where u.phone_number = '+447700900123')                       as demo_transactions,
  (select status from public.subscriptions
    where phone = '+447700900123' order by updated_at desc limit 1) as demo_subscription;

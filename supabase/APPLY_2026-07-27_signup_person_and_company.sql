-- APPLY 2026-07-27: the director's own name, and the Companies House lookup result.
--
-- TWO GAPS FOUND BY COMPLETING A REAL SIGNUP ON lekhio.app.
--
-- 1. ONE NAME FIELD WAS DOING TWO JOBS. /start had a single `name`, relabelled by trade type:
--    "Company name" for a limited company, "Trading name" for a business, "Your full name" for a
--    sole trader. So a limited company signup captured the COMPANY and never the person, and the
--    success screen greeted a test signup called "Test Coffee Shop Ltd" as "Test". A man called
--    Dave who runs Smith Electrical Ltd was greeted "Hi Smith", in a product whose entire pitch is
--    that it feels like a person. `person_name` is now captured separately.
--
-- 2. THE COMPANIES HOUSE LOOKUP WAS PROMISED ON THE WEB AND NEVER HAPPENED THERE.
--    The copy said "We will look your company up on the Companies House register and fill the
--    details in for you", and app/start never called anything. The lookup IS built and works, in
--    the MOBILE setup flow (tradebook-app/app/setup.tsx), which can call /api/companies-house
--    because by then the user is signed in and sends a token.
--
--    /start has no session at any point (/api/onboard is an unauthenticated fire and forget POST),
--    so it cannot make that call, and opening the endpoint to anonymous callers would reopen the
--    hole the 26 July audit closed: one shared Companies House key, 600 requests per five minutes,
--    and the failure mode is company lookup quietly dying for every real customer mid signup.
--
--    So the lookup now runs SERVER SIDE inside /api/onboard, where the key already lives. He does
--    not watch it fill in live on /start, and the copy no longer claims he will. The live type
--    ahead comes to the web app's own setup screen, mirroring mobile, at build order item 6.
--
-- Additive and safe on a live database: five nullable columns on an existing table.

alter table public.signups add column if not exists person_name       text;
alter table public.signups add column if not exists company_number    text;
alter table public.signups add column if not exists company_name      text;
alter table public.signups add column if not exists registered_office text;

-- ⚠️ WHY THE OUTCOME IS RECORDED AND NOT JUST THE RESULT.
--
-- Three nulls in the columns above could mean the lookup found nothing, or that it was never run,
-- or that Companies House was down, or that no key is configured. Those are four different facts
-- and they need four different responses from us, and this codebase's whole disease is a silent
-- state that looks like every other silent state. So the outcome is written down every time.
--
--   matched      we found the company and the columns above are filled
--   no_match     we searched and the register had nothing under that name
--   not_ltd      he is a sole trader or a trading name, so there was nothing to look up
--   unavailable  no API key configured, or Companies House did not answer
alter table public.signups add column if not exists company_lookup text
  check (company_lookup is null or company_lookup in ('matched', 'no_match', 'not_ltd', 'unavailable'));

comment on column public.signups.person_name is
  'The human being signing up, captured separately from the business name. A limited company signup used to store only the company, so we greeted the director by his company.';

comment on column public.signups.company_lookup is
  'The OUTCOME of the server side Companies House lookup, not just its result. Distinguishes found, searched and found nothing, nothing to look up, and could not look up.';

notify pgrst, 'reload schema';

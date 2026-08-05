-- THE TESTIMONIALS TABLE. Where a REAL customer quote finally has somewhere to live that is not the
-- code.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 🔴 WHY THIS MAKES THE ANTI INVENTION RULE STRONGER, NOT WEAKER.
--
-- Until today the reviews array in app/_shared/site.tsx was empty ON PURPOSE, and a comment held the
-- line. A comment is a rule somebody follows until the afternoon they are in a hurry. The array could
-- have held an invented quote, and the only thing stopping it was a test asserting it stayed empty.
--
-- Now no review text lives in the code at all. The homepage reads published rows from HERE at render
-- time, and the ONLY way a row gets in is the founder typing it on the auth gated /team marketing
-- desk, which stamps WHO added it and WHEN. That is the same accountability record as an announcement
-- or a Khoji approval: when somebody later asks why we printed a named tradesman's words on the front
-- door, the answer is a name and a date, never "the system decided".
--
--   CAP 3.47  hold documentary evidence a testimonial is genuine, and contact details for the person.
--   CAP 3.50  never feature a testimonial without permission.
--   DMCC Act 2024, Schedule 20 paragraph 13, in force 6 April 2025: fake reviews are a banned
--             practice. The founder holds the evidence and the permission off system. This table
--             holds only what he chose to publish, and who chose it.
--
-- Run this whole file in the Supabase SQL editor. It is idempotent.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.testimonials (
  id          uuid primary key default gen_random_uuid(),
  -- The customer's own words. Never generated, never edited into shape by us: it is a quote or it is
  -- nothing.
  quote       text not null,
  name        text not null,
  -- The descriptor line under the name, e.g. "Electrician, Leeds". One field, the way the front door
  -- renders it, so there is nothing to assemble at read time and nothing to get wrong.
  trade       text not null,
  rating      int not null check (rating between 1 and 5),
  -- How we came to hold it, e.g. "in person", "WhatsApp". For our own records of where the evidence
  -- and the permission sit, not shown to the customer.
  source      text,
  -- Live by default. Unpublishing hides a row without destroying the record that it was said.
  published   boolean not null default true,
  -- WHO ADDED IT. The same accountability column as announcements.created_by and for the same reason:
  -- a testimonial on the front door is read by everyone, so it carries a name, not metadata.
  created_by  text not null,
  created_at  timestamptz default now()
);

comment on table public.testimonials is
  'Real customer testimonials, added by the founder on the auth gated /team desk and shown on the public homepage. No review text lives in code. Each row records who published it, the same accountability record as announcements.';

comment on column public.testimonials.created_by is
  'The team member who added this. A published testimonial is read by every visitor, so this is an accountability record, not metadata.';

-- SERVICE ROLE ONLY, no policy. Testimonials are written on /team behind the team membership check,
-- and read for the public homepage by a server component using the service role. There is no case
-- where a browser should reach this table directly, so it is not given a way to. This matches the
-- announcements table pattern exactly.
alter table public.testimonials enable row level security;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- VERIFY (run after the migration, it should return a single count)
-- ---------------------------------------------------------------------------
-- select count(*) as testimonials from public.testimonials;

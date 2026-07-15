-- 🔴 KHOJI_LAW. The per-source freshness of the primary law, written nightly by khoji/lawwatch.mjs
-- and read by the console to colour the constellation's twelve legal fields.
--
-- The first version of lawwatch.mjs fetched and hashed the law pages and then wrote NOTHING (the DB
-- line was a comment), so the law nodes were dim for ever while I claimed they would light up. This
-- table is where the freshness now lands. It holds ONLY public tax-law source hashes and verdicts:
-- no user, no money, nothing that belongs to anybody.
--
-- Same posture as khoji_documents (proven in the 14 Jul audit): RLS on, and the only writer is the
-- khoji_writer service credential on the mini. The web app reads it through the service role, which
-- bypasses RLS. anon and authenticated get nothing.

create table if not exists public.khoji_law (
  url         text primary key,
  field       text not null,
  kind        text,
  body_hash   text,
  verdict     text,
  ok          boolean not null default true,
  checked_at  timestamptz not null default now()
);

create index if not exists khoji_law_field_idx on public.khoji_law (field);

alter table public.khoji_law enable row level security;

grant select, insert, update on public.khoji_law to khoji_writer;

-- The mini's credential may read and write the law-freshness rows, and nothing else in this table's
-- world matters: it is public law, and bypassrls=false on khoji_writer was proven on 14 Jul, so this
-- USING(true) is bounded to the one non-user role.
drop policy if exists khoji_law_writer_rw on public.khoji_law;
create policy khoji_law_writer_rw on public.khoji_law for all to khoji_writer using (true) with check (true);

notify pgrst, 'reload schema';

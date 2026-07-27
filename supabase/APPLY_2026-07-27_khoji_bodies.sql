-- Card A: "Khoji's memory, beyond gov.uk". Same shape as supabase/APPLY_2026-07-15_khoji_law.sql,
-- for the professional/regulatory body watcher (khoji/bodies.mjs). One row per source: its last
-- known content hash and verdict, which is what the console would read to colour a "bodies"
-- freshness indicator the same way it already colours the law fields (readLawFreshness).
--
-- Every source this table will ever hold a row for passed an explicit terms-of-use + robots.txt
-- check on 27 Jul 2026 (see khoji/bodies.json and khoji/bodies.mjs's header). This table does not
-- enforce that itself, khoji/bodies.mjs's ALLOWED_HOSTS guard does, in code, before a single row is
-- ever written.
create table if not exists public.khoji_bodies (
  url         text primary key,
  name        text not null,
  field       text,
  body_hash   text,
  verdict     text,
  ok          boolean not null default true,
  checked_at  timestamptz not null default now()
);

create index if not exists khoji_bodies_field_idx on public.khoji_bodies (field);

alter table public.khoji_bodies enable row level security;

-- The mini's credential may read and write this table's freshness rows, and nothing else in this
-- table's world matters: it is public professional-body guidance, not user data. Same bounded
-- USING(true) khoji_law already proved safe on 14 Jul, restricted to the one non-user role.
grant select, insert, update on public.khoji_bodies to khoji_writer;

drop policy if exists khoji_bodies_writer_rw on public.khoji_bodies;
create policy khoji_bodies_writer_rw on public.khoji_bodies for all to khoji_writer using (true) with check (true);

notify pgrst, 'reload schema';

-- Verify: expect 1 row.
select table_name from information_schema.tables
  where table_schema = 'public' and table_name = 'khoji_bodies';

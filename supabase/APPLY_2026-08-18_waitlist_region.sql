-- waitlist.region: WHICH GATE TURNED HIM AWAY, SO THE LIST IS SEGMENTABLE.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 🔴 RUN THIS IN THE SUPABASE SQL EDITOR. It is additive, idempotent and safe to run twice.
--
-- WHAT IT IS FOR. B33, 18 August 2026. The signup now asks a man to confirm he lives inside the
-- region Lekhio works tax out for, and a man who cannot confirm it is offered the waitlist instead
-- of a fifteen minute interview that would end in a number worked out at somebody else's rates.
--
-- Those rows have to be tellable apart from /early-access rows. Both are people waiting for
-- something, but they are waiting for DIFFERENT things: an early access row wants to be let in, and
-- a region row wants his part of the world to be supported at all. Mailing one when the other's
-- thing happens is the exact failure this column exists to prevent. Without it, the two are one
-- undifferentiated list and the only honest thing to do with it is nothing.
--
-- WHAT GOES IN IT. A slug derived from lib/region.ts's REGION constant, for example
-- 'england-wales-or-northern-ireland'. Never anything a customer typed: app/api/waitlist refuses
-- anything that is not a plain lowercase slug.
--
-- ⚠️ IT RECORDS THE GATE, NOT THE MAN. It is NOT where he lives, and it must never be read as that.
-- We did not ask where he is and we do not know: lib/scotland.ts's standing rule is that this
-- product does not detect a nation and must never claim to. All this column says is "the gate that
-- named THIS region is the one that turned this person away", which is all we are entitled to know
-- and is exactly enough to write to him if that region's answer ever changes.
--
-- ⚠️ AND OLD ROWS ARE LEFT NULL ON PURPOSE. A null means nothing turned this person away, which is
-- true of every /early-access row ever written. Backfilling any value would be inventing a fact.
--
-- ⚠️ THE CODE DOES NOT DEPEND ON THIS HAVING BEEN RUN. lib/supabase.ts insertWaitlistSignup sends
-- the region, and if PostgREST answers 400 for an unknown column it drops the region and saves the
-- row anyway, once, logging that this file is outstanding. Losing a turned away man's address over
-- a bookkeeping column is the worst outcome available, so the code fails towards keeping him. Run
-- this and that fallback stops firing.
--
-- REVERSIBLE? Yes, completely: `alter table public.waitlist drop column if exists region;`. No
-- existing row is touched and no existing column is altered.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

alter table public.waitlist add column if not exists region text;

-- Only ever queried as "everybody the <region> gate turned away", so the index is partial: the
-- nulls are the whole of the old table and there is nothing to look up among them.
create index if not exists waitlist_region_idx
  on public.waitlist (region)
  where region is not null;

-- Read this before you close the tab. Expect the region count to be 0 until the first visitor is
-- turned away, and to be the ONLY thing that ever grows in that column.
select
  count(*)                                          as rows_total,
  count(*) filter (where region is null)            as rows_no_gate,
  count(*) filter (where region is not null)        as rows_from_a_region_gate,
  count(distinct region)                            as distinct_regions
from public.waitlist;

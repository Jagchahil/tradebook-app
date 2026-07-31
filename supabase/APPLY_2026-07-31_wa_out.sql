-- APPLY 2026-07-31: wa_out, the outbound WhatsApp send counter. Run this whole file in the
-- Supabase SQL editor. It is idempotent.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- WHY THIS TABLE EXISTS, AND WHY IT IS NOT ai_usage.
--
-- The 80 percent margin floor is a number the console watches, and cost per customer already
-- shows BY NAME on /team. But outbound WhatsApp sends were recorded NOWHERE per customer, so
-- the margin view could only MODEL one service reply per inbound message instead of OBSERVING
-- what we actually sent. From 1 October 2026 Meta bills per outbound MESSAGE, so the modelled
-- column is a guess about the exact thing the invoice will state.
--
-- ai_usage was considered and refused: it is a (day, scope, key, count) counter with no kind
-- column, so the split this table exists for (freeform against template, because templates are
-- the paid ones today) would have to be smuggled into the scope string, and its 60 day sweep
-- would erase the months the margin view reads. lib/messagecost.ts proposed this dedicated
-- table on the day the counters were first read, and this file is that proposal landing.
--
-- WHAT A ROW IS. One outbound send that Meta ACCEPTED, written fire and forget by graphSend in
-- lib/whatsapp.ts, the one door every send already passes through. The customer key (user_id
-- where the caller has it, otherwise the phone), the kind, a timestamp. NEVER the message
-- content and NEVER a template variable: this is a counter, not a log.
--
-- UNTIL THIS FILE IS RUN the table does not exist, the insert fails into a swallow, sends are
-- untouched, and /team keeps saying its figures are modelled. The day it runs, the observed
-- counts take over on their own. test/waout.test.mjs pins the degrade.
--
-- RLS POSTURE: enabled, NO policies. Service role only, the same posture as ai_usage. The
-- server writes and reads with the service role through lib/supabase.ts.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.wa_out (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        references public.users (id) on delete set null,
  phone      text,
  kind       text        not null check (kind in ('freeform', 'template')),
  created_at timestamptz not null default now()
);

alter table public.wa_out enable row level security;
-- No policies. Service role only.

-- The reader counts a calendar month per customer, so the month window is the index.
create index if not exists wa_out_created_at_idx on public.wa_out (created_at);

notify pgrst, 'reload schema';

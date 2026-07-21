-- WHATSAPP SUPPORT TICKETS. When a paying customer asks for a human, complains, or reports a problem
-- in their WhatsApp thread, the webhook opens a ticket here for Jag to answer from the console. The
-- reply goes back into the SAME WhatsApp thread, free-form, inside Meta's 24-hour customer service
-- window. Service-role only: RLS is ON with no policies, so the anon/authenticated keys can never read
-- it. No customer financial figures live here — only the message that asked for help and the drafted
-- reply.

create table if not exists support_tickets (
  id               uuid primary key default gen_random_uuid(),
  phone            text not null,                 -- the customer's WhatsApp number (the thread key)
  user_id          uuid,                          -- linked Lekhio user, if we could resolve one
  customer_name    text,
  reason           text not null default 'other', -- human | complaint | problem | billing | other
  customer_message text not null,                 -- the message that triggered the escalation
  draft_reply      text default '',               -- Claude's suggested reply, for Jag to edit
  status           text not null default 'open',  -- open | answered | dismissed
  opened_at        timestamptz not null default now(),
  last_inbound_at  timestamptz not null default now(), -- last time the customer messaged; drives the 24h window
  decided_at       timestamptz
);

-- At most ONE open ticket per phone. A second escalation from the same customer updates the open one
-- rather than stacking duplicates in the console.
create unique index if not exists support_tickets_one_open_per_phone
  on support_tickets (phone) where status = 'open';

create index if not exists support_tickets_status_opened
  on support_tickets (status, opened_at desc);

alter table support_tickets enable row level security;
-- No policies on purpose: reachable only with the service role key, from the server.

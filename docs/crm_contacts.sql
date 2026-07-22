-- CRM foundation. Extend marketing_leads into the full contact model, and add the timeline.
-- ADDITIVE and NON-DESTRUCTIVE: every existing column and the email double opt-in / consent / nurture
-- flow stays exactly as it is. New columns default to null or a sensible value, so existing rows are
-- untouched. Safe to run more than once (IF NOT EXISTS everywhere).

-- 1) The contact model, layered onto marketing_leads (already keyed by email, with consent + nurture).
alter table marketing_leads
  add column if not exists name           text,
  add column if not exists whatsapp       text,                                   -- E.164, the WhatsApp channel
  add column if not exists wa_consent     boolean not null default false,
  add column if not exists wa_consent_at  timestamptz,
  add column if not exists stage          text not null default 'lead',           -- lead|warming|checkout|trial|paid|dormant
  add column if not exists stream         text,                                   -- ad-barbers | organic | free-tool | ...
  add column if not exists entry_point    text,                                   -- which form/tool/landing captured them
  add column if not exists source_tag     text,                                   -- campaign / utm, mirrors Hoka's source_tag
  add column if not exists checkout_stage text,                                   -- viewed|details_in|payment_opened|abandoned|paid
  add column if not exists app_user_id    uuid,                                   -- links to the app user once they convert
  add column if not exists meta           jsonb not null default '{}'::jsonb;     -- utm, referrer, tool params

create index if not exists marketing_leads_whatsapp_idx on marketing_leads (whatsapp);
create index if not exists marketing_leads_stage_idx    on marketing_leads (stage);
create index if not exists marketing_leads_stream_idx   on marketing_leads (stream);

-- 2) The timeline. Every touch on a contact, the spine of the CRM record and what lets a bot pick up
--    mid-conversation. Keyed to the contact's email (the stable id in marketing_leads).
create table if not exists contact_events (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  created_at  timestamptz not null default now(),
  kind        text not null,      -- tool_used|form_submitted|wa_sent|wa_replied|email_sent|email_opened|checkout_opened|checkout_abandoned|paid|note
  channel     text,               -- whatsapp|email|web
  detail      text,
  payload     jsonb not null default '{}'::jsonb
);
create index if not exists contact_events_email_idx on contact_events (email, created_at desc);
create index if not exists contact_events_kind_idx  on contact_events (kind);

-- Service-role only, same posture as marketing_leads: the app writes these server side, never the
-- browser. RLS on with no public policy means only the service role (which bypasses RLS) can touch it.
alter table contact_events enable row level security;

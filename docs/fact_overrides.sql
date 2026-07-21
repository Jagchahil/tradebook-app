-- THE LIVE FACTS LAYER. Khoji learns, a human approves, the number moves everywhere.
--
-- Each row is ONE approved change to ONE engine constant (a key in lib/taxengine FACTS), carrying the
-- date it takes effect and the GOV.UK source it was read from. lib/facts.ts merges the approved,
-- in-force rows over the hardcoded defaults at runtime, so the moment a human approves a new figure it
-- is the figure every calculation and every answer uses, app and WhatsApp, with no deploy. An
-- announced-but-not-yet-law change sits here with a future effective_from and applies on its own date.
--
-- SAFETY: a human approved it (approved_by is never null), the key must be one the engine holds, and
-- the value must pass lib/facts bounds. Nothing here is trusted blindly.
create table if not exists fact_overrides (
  id             uuid primary key default gen_random_uuid(),
  fact_key       text not null,                 -- a numeric key in FACTS, e.g. 'vatRegistrationThreshold'
  value          double precision not null,     -- the new value
  effective_from date not null,                 -- applies from this date; a future date waits
  effective_to   date,                          -- optional end (a temporary measure)
  source_url     text,                           -- the GOV.UK / legislation page it was read from
  note           text,                           -- one line of human context
  knowledge_item_id uuid,                        -- the Khoji card this came from, if any
  approved_by    text not null,                  -- the email of the human who approved it
  approved_at    timestamptz not null default now(),
  superseded     boolean not null default false  -- an 'undo' flips this true rather than deleting history
);

-- The reader wants the live rows for a key, newest-effective first.
create index if not exists fact_overrides_key_idx on fact_overrides (fact_key, effective_from desc) where superseded = false;

alter table fact_overrides enable row level security;
-- Server-role only. No client ever reads or writes this table directly; it flows through the review
-- endpoint (write) and lib/facts (read), both server-side with the service key.

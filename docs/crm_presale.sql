-- CRM step 3: presale follow-up progress. Additive, non-destructive, idempotent.
alter table marketing_leads
  add column if not exists presale_stage   int not null default 0,   -- how many presale ladder steps sent
  add column if not exists presale_last_at timestamptz;              -- when the last presale touch went

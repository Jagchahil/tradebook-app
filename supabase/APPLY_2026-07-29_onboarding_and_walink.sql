-- THE REST OF THE JOURNEY, IN ONE MIGRATION. 29 July 2026. Safe to re-run.
--
-- Everything left in the customer journey needs these, so they go down together and the SQL editor
-- is opened once rather than six times.

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 1. ONBOARDING HAS TO BE RESUMABLE, AND THIS TABLE IS DELIBERATELY ALMOST EMPTY.
--
-- A barber does a fifteen minute onboarding between customers and WILL be interrupted at minute
-- eight. Today /start holds every answer in the browser and commits at the end, so an interruption
-- loses the lot and he does not come back.
--
-- 🔴 THERE IS NO answers COLUMN, AND THAT IS THE DESIGN RATHER THAN AN OMISSION.
--
-- The obvious shape is a jsonb blob of everything he has said, flushed to the real tables at the
-- end. That is a SECOND COPY OF THE TRUTH, and this codebase has been caught three times by two
-- readers over one number: the copy that drifts is the one he believes. It would also leave his
-- marriage answer sitting in a scratch column, unlogged, while lib/circumstances.ts insists the log
-- IS the defence under Finance Act 2026 Sch 22.
--
-- So every answer is written to its real home the moment he gives it: the business type to
-- public.users, a relief to public.circumstances with the verbatim wording he saw, the account use
-- to public.bank_connections. This table records only WHICH STEP HE IS ON. Resuming is then just
-- putting him back on that step, because the answers are already applied.
--
-- If a future step has no real home to write to, that is a signal the step needs one, not a signal
-- to add a blob here.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.onboarding_progress (
  user_id      uuid primary key references public.users (id) on delete cascade,
  step         text not null default 'welcome',
  started_at   timestamptz not null default now(),
  completed_at timestamptz,
  updated_at   timestamptz not null default now()
);

alter table public.onboarding_progress enable row level security;
-- No policies. Server written only, the same shape as signups and subscriptions.

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 2. BINDING WHATSAPP, WITH THE PROOF TRAVELLING HIS WAY.
--
-- The number typed at signup is proved by nobody, and users.phone_number is a SEND TARGET, so it
-- stays empty until somebody proves it. The obvious way to prove it is to text him a code, which
-- means Twilio, which is why this looked launch blocking.
--
-- 🔴 THE DIRECTION WAS THE UNEXAMINED ASSUMPTION. WhatsApp is itself a proof channel.
--
-- He sends US a code from his own WhatsApp. The webhook sees the code and the sender's number in
-- the same payload, and Meta has already authenticated that account. No Twilio, no SMS, no cost,
-- and it proves something better than a text does: an SMS proves he can read a message on a SIM,
-- this proves he controls the actual WhatsApp account the receipts will arrive from.
--
-- ⚠️ THE CODE MUST NOT BE SIX DIGITS, AND THIS IS THE WHOLE RISK.
--
-- A guessed code sent from a stranger's WhatsApp would bind THAT stranger's number to this man's
-- account. The stranger could then feed his books, and would receive his weekly figures. He taps to
-- copy this code rather than typing it from memory, so there is no reason for it to be short: it is
-- long and opaque, and guessing stops being something anyone attempts.
--
-- Looked up BY HASH, because the webhook receives the code and needs the row, not the other way
-- round. Single use, and short lived.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.wa_links (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  -- HMAC keyed on WEB_SESSION_SECRET, never the code. The same rule as signup_codes.
  code_hash   text not null,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  -- The number that actually arrived, kept so a support question has an answer.
  bound_phone text,
  created_at  timestamptz not null default now()
);

create index if not exists wa_links_hash_idx on public.wa_links (code_hash) where consumed_at is null;
create index if not exists wa_links_user_idx on public.wa_links (user_id, created_at desc);

alter table public.wa_links enable row level security;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 3. WHEN A NUMBER WAS PROVED, AS A FACT RATHER THAN AN INFERENCE.
--
-- Today "is this number proved" is inferred from users.phone_number being non null, which was fine
-- while the only way to get a number onto that row was to prove it. From today there are two kinds
-- of number in the system and only one of them is proved, so the fact gets written down.
--
-- ⚠️ THE RULE THIS ENCODES: users.phone_number MAY ONLY EVER BE WRITTEN BY A PATH THAT HAS JUST
-- PROVED THAT NUMBER, and that path sets this column in the same write. Anything that finds a
-- phone_number with no phone_verified_at beside it is looking at a bug.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

alter table public.users add column if not exists phone_verified_at timestamptz;

notify pgrst, 'reload schema';

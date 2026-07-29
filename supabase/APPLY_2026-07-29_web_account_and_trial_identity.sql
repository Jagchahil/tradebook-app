-- 🔴 THE ACCOUNT IS CREATED ON A VERIFIED EMAIL, AND THE TRIAL REMEMBERS WHO HE WAS.
-- 29 July 2026. Apply in the Supabase SQL editor. Safe to re-run.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- PART ONE. WHY users.phone_number STOPS BEING NOT NULL.
--
-- This reads like a loosening and it is the opposite. Until today an account could only be minted
-- by proving a phone, so the column was never empty, so it was marked NOT NULL. From today an
-- account is minted by proving an EMAIL, and the number he typed at signup has been proved by
-- nobody.
--
-- ⚠️ AND AN UNPROVED NUMBER MAY NOT BE WRITTEN WHERE A SENDER READS.
--
-- users.phone_number is not a label. It is a send target and a match key:
--
--   . the daily digest cron sends to it
--   . the agent cron sends to it
--   . the nudge fan out sends to it
--   . inbound WhatsApp matches a message to an account by it
--
-- So a man who fat fingers one digit at signup would not create a dormant risk. He would create an
-- account whose weekly figures get texted to a stranger on the next cron run, and whose WhatsApp
-- a stranger could feed. That is the receipts leak the "phone is the account key" rule was written
-- to prevent, arriving through the back door.
--
-- The column therefore stays EMPTY until the number is proved, and the typed number lives on the
-- signups row, which is exactly what it is: something somebody typed.
--
-- ✅ THE SENDERS ALREADY COPE, which is why this is safe today rather than after an audit. Every
-- one of them was written defensively against a constraint that told them they need not be:
-- listNudgeTargetsPage and the digest page both filter phone_number=not.is.null in the query
-- itself, and the agent cron checks the field before it sends. Nothing has to change to make this
-- safe. What changes is that the empty case now actually happens.
--
-- ✅ AND THE LOGIN DOOR STAYS SHUT BY ITSELF. findContactAccount matches on equality, so a null
-- number can never be matched by the SMS door. A man with an email account and an unproved number
-- cannot be reached through that number by anyone, including himself, until he proves it.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

alter table public.users alter column phone_number drop not null;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- PART TWO. THE TRIAL HAS TO REMEMBER WHO HE WAS.
--
-- The old guard was one free trial per phone number, enforced by a partial unique index. That
-- worked while the phone was the account key. It does not work now: the number is typed, unproved,
-- and a man can type a different one every time.
--
-- So the subscription records every identifier we hold at the moment we grant, and the grant
-- refuses when it recognises him.
--
-- 🔴 signup_phone IS A SEPARATE COLUMN FROM phone, AND THAT IS THE WHOLE POINT.
--
-- subscriptions.phone is ALSO a send target: /api/cron/trial calls sendTemplate(row.phone, ...)
-- straight off it. Putting the typed number there would text a stranger the news that somebody
-- else's trial is ending. signup_phone is read by exactly one thing, the duplicate check, and is
-- never handed to a sender. phone stays reserved for a number that has been proved.
--
-- ⚠️ AND NAME AND BUSINESS ARE STORED TO FLAG, NEVER TO REFUSE.
--
-- There are a great many Dave Smiths and more than one Smith Electrical. lib/entitlement.ts
-- already sets out the asymmetry in writing: locking a man out of his own books is worse than
-- giving a chancer another fortnight. Email and phone are specific enough to refuse on. A name
-- is not, and refusing a genuine new trader because he shares a name with a customer is the
-- worst mistake available here. These two columns exist so a human can look, not so code can
-- slam a door.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

alter table public.subscriptions add column if not exists user_id       uuid;
-- The email he actually proved, lowercased with gmail dots and plus tags stripped, so that
-- dave@gmail.com, d.a.v.e@gmail.com and dave+1@gmail.com are one person rather than three trials.
-- Normalised in lib, never in the database, so one function owns the rule.
alter table public.subscriptions add column if not exists email_norm    text;
-- The number he TYPED. Unproved. Never sent to. See the note above.
alter table public.subscriptions add column if not exists signup_phone  text;
alter table public.subscriptions add column if not exists person_name   text;
alter table public.subscriptions add column if not exists business_name text;

-- ONE LOCAL GRANT PER ACCOUNT, and per proved email. The same shape as
-- subscriptions_one_local_grant_per_phone, and for the same reason its header gives: checking
-- before inserting is not a rule, it is a hope. The rule is a unique index.
--
-- PARTIAL on stripe_subscription_id is null, so real Stripe rows are untouched and a man who
-- trials, pays, cancels and comes back still accumulates his real billing history exactly as
-- before. What he cannot do is collect a second free week.
create unique index if not exists subscriptions_one_local_grant_per_user
  on public.subscriptions (user_id)
  where stripe_subscription_id is null and user_id is not null;

create unique index if not exists subscriptions_one_local_grant_per_email
  on public.subscriptions (email_norm)
  where stripe_subscription_id is null and email_norm is not null;

-- The duplicate lookups. Not unique: a repeat attempt must be RECOGNISED and refused in code with
-- a sentence he can act on, not rejected by a constraint violation he never sees.
create index if not exists subscriptions_signup_phone_idx  on public.subscriptions (signup_phone);
create index if not exists subscriptions_business_name_idx on public.subscriptions (business_name);
create index if not exists subscriptions_person_name_idx   on public.subscriptions (person_name);

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- PART THREE. RECONCILE HAS TO JOIN ON SOMETHING THAT EXISTS.
--
-- reconcileSignupToUser reads users.phone_number and looks up the signups row by it. Under an
-- email minted account that column is empty, so it would find nothing and every answer he gave at
-- /start would be silently dropped. That is the same failure as losing his onboarding, wearing a
-- different hat.
--
-- The join moves to the email, which is the thing he actually proved. This index is what stops
-- that becoming a sequential scan of every signup we have ever taken.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

create index if not exists signups_email_idx on public.signups (email);

notify pgrst, 'reload schema';

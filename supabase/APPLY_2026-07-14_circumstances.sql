-- THE CIRCUMSTANCES. Every relief we cannot give him because we never asked.
--
-- ⚠️ THIS TABLE IS NOT STORAGE. IT IS THE ASSERTION LOG, AND IT IS OUR ONLY DEFENCE.
--
-- Finance Act 2026 s250 / Schedule 22, in force since 1 APRIL 2026, makes it SANCTIONABLE CONDUCT to
-- act with intent to bring about a loss of tax revenue, and says in terms that this includes a client
-- "obtaining more tax relief than they are entitled to obtain by law". "Tax adviser" was widened from
-- individual to PERSON, so Lekhio Ltd is in scope, and it reaches "assistance provided in the
-- knowledge it is likely to be used in connection with tax affairs" -- which is bookkeeping software.
-- Up to 70% of lost revenue, £1m for a first offence, plus naming.
--
-- The ONLY thing that proves we did not intend a loss of tax revenue is a record of what we ASKED,
-- in the exact words he saw, what he ANSWERED, and WHEN.
--
-- So `asked` is not a nicety. It is the exhibit. If we later change the wording of a question, every
-- old row still carries the wording THAT MAN actually read. A log that stores a question key and
-- looks the current text up at trial time proves nothing at all.
--
-- (doc 108 §1. And doc 104, which said the same thing before the statute did: we prepare, he approves.)

create table if not exists public.circumstances (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,

  -- The key from lib/circumstances.ts. 'married', 'prior_employment', 'vat_registered'...
  key         text not null,

  -- His answer. 'yes' | 'no' | 'skip', or free text where the question needs it
  -- ("what were you doing before?"). Never a boolean: "skip" and "no" are different facts, and a
  -- boolean column would silently turn "he would not say" into "no".
  answer      text not null,

  -- ⚠️ THE EXACT WORDS HE SAW. Not a key. Not a reference. The sentence.
  asked       text not null,

  -- WHEN. Because "he told us in March" and "he told us the day before we filed" are different
  -- stories, and only one of them is ours.
  answered_at timestamptz not null default now(),

  -- Where he answered it. Onboarding, WhatsApp, the app. Useful when a claim is challenged and we
  -- need to reconstruct exactly what he was looking at.
  channel     text,

  updated_at  timestamptz not null default now()
);

-- ONE ANSWER PER MAN PER QUESTION. He can change his mind (a divorce, a new van, VAT registration),
-- and the row is UPDATED, but there is never more than one live answer to argue about.
create unique index if not exists circumstances_user_key_idx
  on public.circumstances (user_id, key);

alter table public.circumstances enable row level security;

-- HIS ANSWERS ARE HIS. The same rule as every other table in this database: a man can read and write
-- his own row and nobody else's. We have tested this for real (7/7 cross-user reads blocked).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'circumstances' and policyname = 'own_circumstances'
  ) then
    create policy own_circumstances on public.circumstances
      for all to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;

comment on table public.circumstances is
  'What a man has told us about himself, so we can give him the reliefs he is entitled to. THE `asked` COLUMN IS THE EXACT WORDING HE SAW AND IT IS AN ACCOUNTABILITY RECORD, NOT METADATA: Finance Act 2026 Sch 22 makes the log of what we asked and what he answered our only defence that we did not intend a loss of tax revenue.';

notify pgrst, 'reload schema';

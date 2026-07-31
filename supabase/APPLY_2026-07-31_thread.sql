-- APPLY 2026-07-31: the Lekhio thread (v1). Run this whole file in the Supabase SQL editor.
-- It is idempotent.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- WHY THIS FILE EXISTS INSTEAD OF A NEW PAIR OF TABLES, AND INSTEAD OF NO FILE AT ALL.
--
-- The thread is the in house conversation surface at /app/thread: his questions, Lekhio's
-- answers, on our own turf, off the metered WhatsApp channel. conversations and messages
-- (doc 95, Puchio chat memory) already hold exactly this shape: threads owned by a user,
-- turns inside a thread, RLS scoped to the owner, content living only in Supabase. Growing a
-- second pair of tables that mean "a conversation" would be the house disease, two copies of
-- one truth.
--
-- But the tables as they stand CANNOT carry the thread honestly, in two small ways:
--
--   1. messages.role is checked to ('user', 'puchio'). The thread's replies are Lekhio's,
--      composed by the same deterministic intents and the same guarded AI path as WhatsApp,
--      not Puchio's ask surface. Filing them as 'puchio' would repurpose a labelled speaker,
--      and the day anybody filters by role the two products' words would be indistinguishable.
--
--   2. Nothing distinguishes the ONE standing Lekhio thread from Puchio's many per question
--      chats. Finding "the thread" by title would be a magic string a user's own first
--      question could collide with.
--
-- So: a kind on the conversation, a wider role check, and a partial unique index that makes
-- "one Lekhio thread per user" a fact the database enforces rather than a hope the code holds.
-- Nothing is dropped, nothing is rewritten, and every existing Puchio row keeps meaning
-- exactly what it meant.
--
-- RLS POSTURE: UNCHANGED, ON PURPOSE. conversations_own and messages_own already say
-- auth.uid() = user_id for all four verbs, which covers the new rows the same as the old.
-- The web server reads and writes with the service role and scopes every query by user_id
-- itself, per the lib/supabase.ts rule.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- 1. The kind. Every existing row is Puchio's, so the default backfills correctly.
alter table public.conversations add column if not exists kind text not null default 'puchio';
alter table public.conversations drop constraint if exists conversations_kind_check;
alter table public.conversations add constraint conversations_kind_check
  check (kind in ('puchio', 'lekhio'));

-- 2. One Lekhio thread per user. The route reads or creates it; a race between two of its own
-- requests resolves here, in the database, not in a code path that hopes it was first.
create unique index if not exists conversations_one_lekhio_thread
  on public.conversations (user_id) where kind = 'lekhio';

-- 3. Lekhio may speak in messages. 'puchio' stays: the ask surface keeps its own name.
alter table public.messages drop constraint if exists messages_role_check;
alter table public.messages add constraint messages_role_check
  check (role in ('user', 'puchio', 'lekhio'));

notify pgrst, 'reload schema';

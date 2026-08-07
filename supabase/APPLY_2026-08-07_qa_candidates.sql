-- qa_candidates: AN OWNER FOR EVERY NEW ROW, AND THE RAW ANSWER PATH CLOSED.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 🔴 RUN THIS IN THE SUPABASE SQL EDITOR BEFORE THE CODE THAT PAIRS WITH IT DEPLOYS.
--
-- The paired code change (lib/supabase.ts, logQaCandidate) sends a user_id with every learning
-- candidate and calls an eight parameter log_qa_candidate. If the code ships first, every candidate
-- write fails until this runs. The write is best effort and swallowed, so nothing a customer sees
-- breaks, but with the manifest change in the same deploy a GDPR ERASURE would also report failure,
-- because deleting qa_candidates rows filtered on a column that does not exist is an error. An
-- erasure that reports failure when it should have succeeded is the loud, safe direction, and this
-- file is how it never happens at all. SQL first, then deploy. It is idempotent, safe to run twice.
--
-- WHAT THIS FIXES. Two defects found 6 August 2026 in the qa_candidates learning pool:
--
--   1. The write path redacted the QUESTION and stored the ANSWER raw. A personal answer is
--      composed from the man's own books, so his figures, his email and his address echoed
--      straight into a shared review table. The redaction fix is in code; this file's part is
--      dropping the old RPC so the raw path cannot outlive the deploy.
--   2. No user_id on the row, so a row holding a customer's figures could never be found again
--      for a UK GDPR Article 15 export or an Article 17 erasure.
--
-- THE SHAPE. user_id is NULLABLE and BARE (no foreign key), the same shape as
-- allowance_elections: legacy rows have no owner to name and age out via the retention sweep
-- (lib/qaretention.ts, terminal rows after 90 days, unreviewed after 365), and erasure walks
-- USER_DATA_TABLES rather than relying on a cascade. The pool dedupes across users, so the id
-- kept is the asker WHOSE ANSWER TEXT IS STORED: the RPC refreshes user_id in step with the
-- answer while the row is still unreviewed, never after a human has acted on it. RLS is
-- unchanged: service role only, no user policy, the app never reads this table directly.
--
-- THE DROP. The old seven parameter log_qa_candidate is removed, not kept alongside. It is the
-- path that writes unredacted answers with no owner. A still running old deploy that calls it
-- after this runs loses its best effort learning row (caught, silent, never blocks an answer),
-- and that is the right trade: from the moment this file runs, nothing can write a raw answer.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

alter table public.qa_candidates
  add column if not exists user_id uuid;

-- The GDPR doors filter on user_id; without an index each export or erasure walks the whole pool.
create index if not exists qa_candidates_user
  on public.qa_candidates(user_id);

drop function if exists public.log_qa_candidate(text, text, text, jsonb, boolean, boolean, boolean);

create or replace function public.log_qa_candidate(
  p_question_norm  text,
  p_question       text,
  p_answer         text,
  p_sources        jsonb,
  p_used_knowledge boolean,
  p_all_recognised boolean,
  p_engine_impact  boolean,
  p_user_id        uuid
) returns void
language sql
set search_path = public
as $$
  insert into public.qa_candidates
    (question_norm, question, answer, sources, used_knowledge,
     all_sources_recognised, engine_impact, user_id, seen_count, last_seen_at)
  values
    (p_question_norm, p_question, p_answer, p_sources, coalesce(p_used_knowledge, false),
     coalesce(p_all_recognised, false), coalesce(p_engine_impact, false), p_user_id, 1, now())
  on conflict (question_norm) do update set
    seen_count             = public.qa_candidates.seen_count + 1,
    last_seen_at           = now(),
    answer                 = case when public.qa_candidates.status = 'unreviewed'
                                  then excluded.answer else public.qa_candidates.answer end,
    -- The owner travels with the answer: whoever's answer text the row holds is whose data it is.
    -- Frozen together the moment a human reviews or dismisses.
    user_id                = case when public.qa_candidates.status = 'unreviewed'
                                  then excluded.user_id else public.qa_candidates.user_id end,
    sources                = case when public.qa_candidates.status = 'unreviewed'
                                  then excluded.sources else public.qa_candidates.sources end,
    used_knowledge         = case when public.qa_candidates.status = 'unreviewed'
                                  then excluded.used_knowledge else public.qa_candidates.used_knowledge end,
    all_sources_recognised = case when public.qa_candidates.status = 'unreviewed'
                                  then excluded.all_sources_recognised else public.qa_candidates.all_sources_recognised end,
    engine_impact          = case when public.qa_candidates.status = 'unreviewed'
                                  then excluded.engine_impact else public.qa_candidates.engine_impact end;
$$;
revoke execute on function public.log_qa_candidate(text, text, text, jsonb, boolean, boolean, boolean, uuid) from anon, authenticated, public;
grant execute on function public.log_qa_candidate(text, text, text, jsonb, boolean, boolean, boolean, uuid) to service_role;
notify pgrst, 'reload schema';

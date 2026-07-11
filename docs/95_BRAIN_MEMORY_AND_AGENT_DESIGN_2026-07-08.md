# 95: The learning brain, chat memory, and the agent, design and plan (8 July 2026)

> The design for making Puchio remember and learn, giving clients a chat history like DMs, cutting credit cost by reusing answers, and wiring Rakha to the brain and to prepared actions. Written before the code, on purpose (CLAUDE.md rule: the docs lead, the code follows). Two guardrails run through all of it and are never crossed. Writing rule holds: no em dashes, no en dashes, no hyphens as dashes.

## The vision (Jag, 8 July)

1. When someone asks Puchio something the brain does not already cover, Puchio answers it properly, then that answer is saved so the same or a similar question is answered from the brain next time, not re-researched, to save credit.
2. Every chat shows up in a Messages section like Instagram DMs, so the client can go back to it. Starting a fresh question is a new chat.
3. Similar questions are matched so the brain answers without a new AI call, and stored answers are kept current by the same daily checks Khoji already runs.
4. Rakha (the proactive agent) reads the brain, so what it suggests is fully up to date, and where a suggestion needs an action carried out (HMRC and elsewhere), Lekhio prepares it and can carry it out after approval.

## The two guardrails (never crossed)

- **The review gate.** Nothing becomes shared tax knowledge until a human has reviewed it and it carries a primary source link. This is why Khoji distils then waits for approval. A self answered question cannot silently become the answer everyone else gets, or one wrong answer spreads to every user. So "Puchio learns" must always route new answers through review before they are reused for other people.
- **The approval gate.** Anything irreversible (file to HMRC, move money, send to a third party) always needs an explicit human yes, at every autonomy level. This already lives in code (`lib/autonomy.ts` `decideAction`, and every `lib/hmrc.ts` submit throws unless `approved === true`). Rakha suggests and prepares. It never files on its own.

## What already exists (so we do not rebuild it)

- **Puchio reads the brain.** `/api/ask` calls `getRelevantKnowledge`, folds reviewed, source linked items into the answer, and cites them. Proven live on 8 July (a VAT answer cited the gov.uk source).
- **The approval gate is fully built and correct.** `lib/autonomy.ts` classifies every action as admin, prepare, or irreversible, and guarantees irreversible always needs approval regardless of the autonomy dial. `lib/hmrc.ts` enforces `approved === true` on every submit, and writes a durable `hmrc_approvals` audit row first. HMRC filing itself is dormant (sandbox) until production recognition, which is gated on the company number.
- **The autonomy dial IS the "how much Lekhio does for you" tab.** `settings.tsx`: Suggest, Prepare, Auto, with the footer "anything that files to HMRC or moves money always asks you first." Auto only ever applies to safe reversible admin.
- **Rakha already produces 24 proactive signals** (VAT approach, MTD mandation, higher rate approach, payments on account, CIS refund milestones, quarter unconfirmed, invoice chase, year end countdown, and more), deterministically from the tax engine, capped for noise (1 ping a day, 3 a week), delivered to the app feed, WhatsApp (when templates approved), and push. It does NOT yet read the knowledge base.
- **What does NOT exist yet:** any chat persistence or Messages list (chat is in memory only, no conversations or messages table), any answer cache or embeddings, any web research, and any link from Rakha to the knowledge base.

## The design, feature by feature

### 1. Chat memory and the Messages tab (DMs)

New tables (RLS scoped to the user, same pattern as everything else):
- `conversations` (id, user_id, title, created_at, updated_at, last_message_at).
- `messages` (id, conversation_id, user_id, role in ['user','puchio'], content, sources jsonb, created_at).

`/api/ask` gains an optional `conversationId`. If absent, it creates a new conversation and titles it from the first question. It stores the user question and Puchio's answer (with the source links) as two message rows. A new `/api/conversations` returns the user's threads for the Messages list, and `/api/conversations/[id]` returns a thread's messages.

App: a Messages tab that lists conversations newest first (title, snippet, time), tap to open the thread, a New chat button that starts a fresh conversation. The existing Puchio screen becomes thread aware.

Privacy: chat content lives only in Supabase (never logged elsewhere), RLS means a user sees only their own, and we can encrypt the content column at rest with the existing `lib/crypto` if we decide the sensitivity warrants it.

This is clean, high value, and has no safety landmine. It is also the foundation for the learning loop (you cannot reuse answers you never stored). So it is Phase 1.

### 2. The learning loop (answer once, reuse safely)

The honest version of "Puchio saves its answer and reuses it," keeping the review gate:

1. Puchio answers a question as it does now (expert prompt, the tax engine, and any reviewed knowledge).
2. Every answer is logged to a `qa_candidates` table (question, answer, the sources used, was_knowledge_used, user_id, created_at, status default 'unreviewed'). Personal figures are stripped, only the general tax question and answer are kept.
3. A light review surface (a filtered view, or a simple screen) lets a human (you, later an accountant) approve a good general answer. On approval it becomes a reviewed knowledge item (or a reviewed cached answer), source linked, exactly like a Khoji item.
4. Once approved, the same or a close question is served from the brain with no Sonnet call. That is the credit saving, and it only ever serves human approved answers to other people.

"Research using the correct links, sites, law": rather than give Puchio an open web browser inside a tax answer (which invites confident wrong citations), a question the brain cannot answer well is flagged and fed to Khoji as a targeted GOV.UK lookup, so the answer that gets stored is distilled from a real source and then reviewed. Research becomes "grow the brain from a source," not "let the model improvise a citation." Safer, and it reuses everything we built today.

### 3. Semantic cache (match similar questions, save the most credit)

To answer a similar question without a new AI call, we match meaning, not exact words. That needs embeddings. Plan: enable `pgvector` in Supabase, store an embedding on each approved cached answer, embed the incoming question, and if cosine similarity is over a threshold, serve the cached answer for free. Below the threshold, Puchio answers live. Embeddings come from a cheap embedding model (a small OpenAI or open model, isolated like `lib/transcribe.ts`, since Anthropic has none).

Freshness: each cached answer records which knowledge items and figures it depended on. When Khoji's daily run changes one of those (a threshold moves, `engine_impact`), the dependent cached answers are marked stale and drop out of the cache until re-approved. That is the "cross referenced daily with new info" you asked for, done safely.

This is the biggest credit saver but the most engineering (a new provider and pgvector), so it is Phase 2. A simpler Phase 1.5 can match normalised exact questions (no embeddings) to start banking savings sooner.

### 4. Rakha and the brain

Rakha's signals should stay deterministic and exam tested, because thresholds that drive tax maths must be verified constants, not free text. So "Rakha fully up to date" means two things:
- **Freshness of the numbers:** when Khoji flags `engine_impact` (a rate or threshold changed), that is the trigger to update `lib/taxengine.ts` and its exams. Rakha then uses the new constant automatically. This keeps a human and the exam suite between a web rumour and the maths, which is correct for tax.
- **Source backed suggestions:** each Rakha card can carry the relevant reviewed knowledge link, so a VAT approach nudge shows the current threshold with its gov.uk source. Small change, high trust. This is a safe Phase 1 addition.

### 5. Rakha to prepared actions

The architecture is already right and already built: Rakha suggests, Lekhio prepares, you approve with a tap, then it submits through the recognised path. Irreversible actions can never skip that, by code, not prompt. Two honest limits:
- **HMRC filing is externally gated.** It stays in sandbox until Lekhio is HMRC recognised, which is gated on the company number. So live "carry it out on HMRC" is not switchable today no matter what we build. What we can do now is tighten the prepare then one tap approve UX so the moment recognition lands, a Rakha suggestion flows straight into a prepared, approvable filing.
- **Non HMRC actions can improve now.** A Rakha invoice chase can become "prepare the chase, one tap to send." A set aside nudge can become "move it to the set aside view, one tap." These use the same approval classification and are safe to wire.

## Phasing

**Phase 1, now, safe, no external gate:**
- Chat memory plus the Messages tab (feature 1).
- Log every Q and A to `qa_candidates` and a simple review-to-approve path (feature 2, steps 1 to 3).
- Rakha cards carry reviewed knowledge source links (feature 4, source backed).

**Phase 1.5:**
- Normalised exact question cache served from approved answers (early credit saving without embeddings).
- One tap prepare-and-approve on the safe Rakha actions (invoice chase, set aside).

**Phase 2:**
- pgvector plus embeddings for true semantic caching, with staleness tied to Khoji's daily run (feature 3).
- Targeted Khoji lookups triggered by questions the brain could not answer (feature 2, the research route).

**Externally gated (not switchable now):**
- Live HMRC actions from a Rakha suggestion, waiting on HMRC production recognition (company number first).

## Credit economics (why this pays for itself)

Today every Puchio question is a Sonnet call. With the cache, the second and later times a common question is asked, it is free. On a base of many users asking the same handful of questions (VAT threshold, can I claim X, when is MTD), the hit rate is high, so the cache should remove a large share of Sonnet calls. The hard per phone and global caps still bound the worst case. Net effect: the brain gets cheaper to run as it grows, which is the opposite of the usual AI cost curve.

## Decisions (Jag, 8 July)

1. **Auto approve when every source is a recognised authority.** The human review step is replaced by a domain trust gate: if an item's sources are all on the recognised allowlist, it is approved automatically into the brain, no manual step. Items with no recognised source, or a mixed or unknown source, still wait for a human. One safety carve out kept, because it is the exact error we caught on 8 July (a distiller stating VAT at 85k while citing the correct page): an item flagged `engine_impact` (it changes a rate, threshold or allowance that the tax maths depends on) always gets a human confirm before it feeds the engine, even from a recognised source. Everything is logged and removable.
2. **Recognised sources only.** The allowlist is authoritative sites only: `gov.uk` and `legislation.gov.uk`, the professional bodies (ICAEW, ACCA, CIOT, ATT, AAT, ICAS), and vetted accountancy and tax authorities. It is a config list, easy to extend, tight by default. Anything off the list does not auto approve.
3. **HMRC recognition will be on before launch,** so the prepared then approved filing path is built now as if live, and simply switches to the live host when recognition lands.

Khoji already fetches gov.uk only, so its distilled items qualify for auto approve today (recognised source, not `engine_impact`, reasonable confidence), which removes the manual approve step we did by hand on 8 July.

## What we are NOT doing, and why

- Not letting Puchio serve its own unreviewed answer to other users (review gate).
- Not giving Puchio an open web browser inside a tax answer (confident wrong citations). Research grows the brain through a source instead.
- Not letting Rakha file or move money on its own (approval gate), and not pretending live HMRC actions are available before recognition.

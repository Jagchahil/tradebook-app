# 96: Hard test, security and scale audit (8 July 2026)

> A three-agent hard test run after the doc 95 Phase 1 build (Puchio chat memory, Messages, the learning log): a deep security review of the new feature, a full "hack proof" sweep of the whole web and app, and a 100k scale review of the new write path. Every real finding and the fix applied. Read alongside docs 88 and 94. Writing rule holds: no em dashes, no en dashes, no hyphens as dashes.

## Verdict

The full-codebase sweep found **no blocker and no high-severity code vulnerability**, and no way for one user to reach another user's data, forge a webhook, replay a payment, escalate through a capability token, or reach HMRC without approval. The code is hardened. The single biggest real risk is operational, not code: anonymous auth is still on and `REJECT_ANON_USERS` defaults to false, which is already the top launch gate (docs 88, 93). The hard test on today's new feature did find one real write-side IDOR and a set of smaller issues, all now fixed.

## Fixed this session (today's Phase 1 feature)

- **HIGH, write-side IDOR (fixed).** `/api/ask` accepted a client supplied `conversationId` and `saveMessage` wrote to it without checking ownership, so a crafted id could attach a message row to another user's thread (the victim could not read it, but it was a real integrity hole). Fix: new `conversationOwnedBy(userId, id)` check, and the route now trusts a supplied id only if it belongs to the caller, otherwise it starts a fresh thread.
- **MEDIUM, recognised-source allowlist (fixed).** `isRecognisedSource` gates auto approval of tax content. It now strips userinfo and port, rejects a junk authority, and trims whitespace, so the allowlist cannot be widened by a crafted authority and a legitimate URL carrying a port or stray space still matches. The dangerous bypasses (`gov.uk@evil.com`, `gov.uk.evil.com`) were already closed; this tightens the edges.
- **MEDIUM, response latency (fixed).** The persistence writes (create, two message inserts, the last_message_at bump, the candidate log) ran serially on the response the user waits on, adding roughly 300ms. Now the two messages are one batched insert, and the whole persistence block runs in `after()` so the user waits on none of it. New-thread create stays inline because the client needs the id back.
- **LOW, GDPR erasure (fixed).** Account delete now removes `messages` and `conversations` explicitly (they also cascade from auth.users, but explicit delete means chat history is erased even if the final auth delete fails), matching the pattern used for every other table.
- **LOW, unauthenticated checkout (fixed).** `/api/billing/checkout` is a pre-signup funnel with no auth; it now rate limits per IP (12 per 10 minutes) so it cannot be used to mass create Stripe Checkout sessions with arbitrary emails.
- **LOW, learning-corpus privacy (fixed).** The user question logged to the shared `qa_candidates` pool is now PII redacted first (emails, UK postcodes, currency amounts, long digit runs), so the learning store does not become a record of users' personal figures and names. The inaccurate "no personal figures" comment was corrected.

## Confirmed genuinely solid (re-verified adversarially)

Auth and IDOR on every authed route (identity always from the verified token, never client input; `conversations/[id]` double scoped on user id and conversation id). WhatsApp webhook signature (constant time, raw body, fail closed) and media host pinning. Stripe webhook signature, timestamp tolerance, idempotency, amount and currency recheck. RLS on every table (owner policy or intentional service-role-only deny-all, including `qa_candidates`). No secret in any `NEXT_PUBLIC_` or `EXPO_PUBLIC_` var. PostgREST filters percent encoded, HTML routes escaped, no SQL string concat. Capability tokens HMAC, single-user bound, expiry, timing-safe, fail closed. Every HMRC submit throws unless approved. Full security header set, no open redirects, cron secret required.

## Still open (tracked, not code fixes)

- **HIGH, operational: close anonymous auth.** With `REJECT_ANON_USERS=false`, a hand-crafted anonymous Supabase JWT passes `verifyAccessToken` on every authed route. Disable anonymous sign-in in Supabase and set `REJECT_ANON_USERS=true` before real users. Launch gate, task 1.
- **MEDIUM, config: dedicated token secrets.** `PACK_TOKEN_SECRET`, `LEAD_TOKEN_SECRET`, `HMRC_STATE_SECRET` fall back to the service role key as the HMAC secret when unset. Not exploitable today, but set them. Launch gate, task 2.
- **MEDIUM, scale: `qa_candidates` growth.** One row per answer, forever, no prune. At 100k users this is the one genuinely unbounded low-value growth surface. Add a retention or dedupe job before heavy scale (a normalised-question dedupe, or delete old dismissed and auto-approved rows). New task added. Phase 2, when the cache consumes this table.
- **LOW, known:** the in-memory burst limiter is per instance (durable DB caps are the real backstop, move to Upstash before high volume), and the public invoice page shows the tradesperson's own phone number on an unauthenticated capability link (random UUID, not enumerable) which is worth a product decision.

## Result

Ship the fixes above (web only, no app change this round). After deploy, the new feature is hardened and the wider app has a clean adversarial bill of health, with the anon-auth close remaining the one gate that turns "hardened code" into "hardened product" before real users.

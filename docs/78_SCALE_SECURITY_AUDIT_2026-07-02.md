# Scale & Security Audit — 2 July 2026 (20,000-user readiness)

Prompted by the bank-card bug (production `bank_connections` was missing an `updated_at` column, so every PATCH from `updateBankConnection` was silently rejected and connections never became `linked`). That was fixed and verified live. This audit then swept the whole codebase across four lenses — scale/reliability, security/data, money correctness, and schema drift — to make sure nothing of that class remains before scaling to 20k+ users.

Live production was checked directly in the Supabase SQL editor. Good news: the drift class has **no other live instance** right now — `subscriptions.updated_at`, `bank_connections.updated_at`, and the full unique index `transactions_external_id_key` all exist in prod. The remaining items are latent (would bite a fresh DB rebuild) or hardening.

---

## Fixed in this session

| # | Area | Fix | File |
|---|------|-----|------|
| 1 | **Bank card (live bug)** | Added missing `updated_at` column to prod `bank_connections`; PostgREST cache reloaded; verified. Repo schema upgrade-path now adds `updated_at` + `reference` + `account_ids` + `last_synced_date`; migration file added. | prod DB; `supabase/schema.sql`; `supabase/APPLY_2026-07-02_bankconn_updated_at.sql` |
| 2 | Reliability | `updateBankConnection` now logs PostgREST errors instead of failing silently (this class of bug can never again be invisible). | `tradebook-web/lib/supabase.ts` |
| 3 | Money correctness | `totalsForUser` (WhatsApp "how much have I made / spent / owe") now filters `confirmed=eq.true`, so un-reviewed bank lines are never shown as a settled figure. Matches the app's tax tab and the approved-only rule. | `tradebook-web/lib/supabase.ts` |
| 4 | GDPR erasure | `deleteUserData` now also purges `bank_connections`, `audit_log`, `wa_sessions`, `marketing_leads`, and `waitlist`-by-email. | `tradebook-web/lib/supabase.ts` |
| 5 | Reliability | Bank token refresh now distinguishes **transient** failures (429/5xx/network/missing-config → retry, leave linked) from **genuine** auth failures (400/401 → expire). Stops false "reconnect your bank" nags when TrueLayer rate-limits. | `tradebook-web/lib/bankfeed.ts`, `tradebook-web/lib/banksync.ts` |
| 6 | Schema hardening | Defensive `alter … add column if not exists updated_at` for `subscriptions` (latent twin of the bank bug — it's written on every Stripe webhook) + supporting index. | `supabase/schema.sql` |

**Deploy note:** items 2–5 are code and take effect on the next deploy of `tradebook-web` (sync the repo copy → deploy repo → push, per the usual flow). Item 1 (the DB column) is already live. Item 6's schema change applies on the next `schema.sql`/migration run; prod already has the column, so it's belt-and-suspenders.

---

## Update — build pass (same day)

Since the table above, the following backlog items were **built** (code in the repo copy, verified by a review agent; deploy `tradebook-web` to activate). Prod already has the supporting tables/columns.

- **B (TrueLayer backoff)** — `truelayerFetch` with 429/5xx/`Retry-After` backoff + per-call `AbortSignal.timeout`, used by all TrueLayer calls. Done.
- **A (resumable bank sync)** — keyset paging + `job=bankfeed` self-continuation hop chain (mirrors the nudge cron) with bounded concurrency and a hop cap. Done.
- **C (token encryption)** — `lib/crypto.ts` AES-256-GCM; bank + HMRC tokens encrypt on write / decrypt on read. **Safe no-op until `BANK_TOKEN_KEY` is set** (then rotate existing plaintext tokens).
- **D (anon rejection, code side)** — `verifyAccessToken` rejects anonymous JWTs, **gated behind `REJECT_ANON_USERS=true`** so it ships without breaking the current pre-OTP app. The Supabase dashboard toggle + OTP is still yours to do.
- **E (approval audit trail)** — `hmrc_approvals` table + best-effort write at every HMRC submit gate. Done.
- **F (Stripe idempotency)** — `stripe_events` guard + 300s webhook timestamp tolerance. Done.
- **G (tax staleness)** — `TAX_YEAR_VALID_UNTIL` + `isTaxYearStale`. (Full two-engine unification still pending.)
- Also: GDPR `deleteUserData` completed; WhatsApp money answers confirmed-only; `updateBankConnection` error logging; `subscriptions.updated_at` defensive alter.

Prod DDL applied this session: `bank_connections.updated_at`, `stripe_events`, `hmrc_approvals`.

**Still needing you (not code):** turn off anonymous sign-in + enable phone OTP/SMS in Supabase then set `REJECT_ANON_USERS=true`; generate `BANK_TOKEN_KEY` and rotate tokens; confirm `CRON_SECRET` in Vercel; full tax-engine unification; remaining MEDIUM/LOW items below.

## Remaining backlog (prioritized, with exact fixes)

### CRITICAL — do before real users at scale

**A. Daily bank sync cannot finish for 20k users (scale).**
`lib/banksync.ts` `syncAllLinked` loops connections **serially** inside a ~25s budget, capped at 500 rows. At ~1–3s/connection that clears only ~10–25 of 20,000 per day; the rest never sync, and `order=last_synced_date.asc` means the same oldest ones get retried while the bulk starve. Fix: give bank sync its own **resumable keyset + self-continuation chain** (the nudge/weekly cron in `app/api/cron/reminders/route.ts` already does exactly this via `fanOut`/`mapLimit`) with bounded concurrency (~5–10) to respect TrueLayer limits; drive by pagination, drop the 500 cap.

**B. TrueLayer has no rate-limit/backoff handling (scale).**
`lib/bankfeed.ts` (`listAccounts`, `getBookedTransactions`, `exchangeCode`) treat every non-200 as a flat `null`. Once (A) makes the cron run concurrently, a burst will hit 429s. Fix: detect 429/5xx, honour `Retry-After`, exponential backoff with jitter, cap global concurrency. (The refresh path's transient/auth split is already done — item 5.)

**C. Bank & HMRC OAuth tokens stored in plaintext (security).**
`bank_connections.access_token/refresh_token` and `hmrc_connections.access_token/refresh_token` are plaintext. A refresh token = ongoing read access to a live bank; an HMRC token = tax-account access. Also contradicts the public "encrypted, never plaintext" claim on the security/privacy pages. Fix: AES-256-GCM field encryption in one `lib/crypto.ts` keyed from `BANK_TOKEN_KEY` env; encrypt in `createBankConnection`/`updateBankConnection`/`saveHmrcConnection`, decrypt only in sync/refresh; rotate existing plaintext tokens. Until done, soften the marketing claim.

**D. Anonymous sign-in must be turned OFF at the Supabase project (security).**
The app's `__DEV__`/`EXPO_PUBLIC_OTP_ENABLED` guards are client-side only. If anonymous sign-in is enabled in the Supabase project (it currently is — it was used to reach the web build during this audit), anyone with the public anon key (shipped in the app) can mint an authenticated JWT via the Auth REST endpoint. **Launch gate:** disable "Allow anonymous sign-ins" in Supabase Auth settings **and** confirm phone OTP + an SMS provider are live first (disabling anon before OTP works would break login). This is a dashboard action, not code.

### HIGH

**E. Persist an approval audit trail for HMRC submissions.**
The "we prepare, you approve" gate is correctly enforced server-side (every `hmrc.ts` submit throws `ApprovalRequiredError` unless `approved === true`), but the approval isn't recorded. Before live HMRC recognition, write an `approval` row (user id, calculation/submission id, the exact figures approved, timestamp) at each gate.

**F. Stripe webhook replay / idempotency.**
`app/api/stripe/webhook/route.ts` verifies the signature but doesn't record processed `event.id` or check timestamp age; a captured valid event can be replayed to revert subscription state. Fix: `stripe_events(id primary key)` insert-guard at the top (mirror `claimMessage`/`processed_messages`) and reject events older than ~5 min.

**G. Unify the two tax engines + add a staleness guard.**
`tradebook-web/lib/taxengine.ts` and `tradebook-app/lib/tax.ts` are hand-maintained copies (currently numerically identical — verified). Next Budget change applied to one and not the other silently diverges app vs WhatsApp. Fix: single shared source or a CI parity test; add a `TAX_YEAR_VALID_UNTIL` guard so stale rates surface instead of shipping silently.

**H. `weekly_totals_all` recomputed on every continuation hop (scale).**
An all-user unbounded `GROUP BY` over the whole transactions table, recomputed each hop of the weekly chain. Compute once and pass forward, or window it by keyset page.

### MEDIUM / LOW (see agent detail)

Per-call fetch timeouts (`AbortSignal`) on Claude/Whisper/TrueLayer/Supabase; move `totalsForUser`/`recentUnconfirmedCaptures` aggregation into Postgres RPCs + add the partial index `transactions(user_id, transaction_date desc) where confirmed=false`; back the in-memory burst limiter with the durable counter; dedicated `HMRC_STATE_SECRET` (don't share the service-role key for OAuth state signing); confirm `CRON_SECRET` set in Vercel (else reminders + bank sync silently 401); make the due-reminders job resumable; bidirectional bank-vs-receipt dedupe (bank line imported before the photographed receipt isn't deduped); delete the stale duplicate `create table … bank_connections` and duplicate `users_phone_unique` index in `schema.sql`.

---

## What's already solid (verified, so it isn't re-litigated)

WhatsApp webhook acks in <5s and defers work via `after()`, with atomic `processed_messages` idempotency; `x-hub-signature-256` verified constant-time; Stripe signature verified before any mutation and invoice amount re-checked before booking income; OAuth `state` HMAC-signed + TTL + timing-safe; service-role key is server-only and absent from the client bundle; **no API route trusts a client-supplied `user_id`**; RLS enabled on every table with correct own-row policies on user-facing tables and service-role-only on sensitive ones; phone-binding DB trigger; SSRF guard on media download; durable per-phone + global AI spend caps; model tiering (Haiku for extraction, Sonnet for accountant Q&A) with prompt caching; HMRC submit gates enforced server-side.

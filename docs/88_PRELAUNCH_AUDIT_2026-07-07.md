# 88: Pre-launch audit and fixes (7 July 2026)

> A three-agent audit (security + RLS, scale to 100k+, UX + functional) run before the Friday launch, plus every fix applied. Read doc 81 (master) and doc 87 (competitor + pricing) alongside. Writing rule holds: no em dashes, no en dashes, no hyphens as dashes.

## Verdict

The build is in strong shape. **No code security vulnerabilities.** RLS is correct on every table, every authed route is scoped to the caller, tokens and webhooks are signed, no secret reaches the client. The live Supabase security advisor agrees: 0 errors. What stood between the code and launch was one real data bug (now fixed) and a set of scale and UX polish items (now fixed). The only remaining launch items are operational config, already on the doc 81 checklist.

## Security (agent 1): solid

- RLS enabled on every table. User tables scope with `(select auth.uid()) = user_id` and matching with-check clauses. Server-only tables (bank_connections, hmrc_connections, wa_sessions, ai_usage, stripe_events, subscriptions, signups, waitlist, audit_log, marketing_leads, processed_messages) are correctly RLS-on-no-policy (deny all except the service role). No table missing RLS. Live advisor: 0 errors, 1 warning (optional leaked-password toggle), 11 info (the intentional server-only tables).
- Every authed API route verifies the Supabase bearer via `verifyAccessToken` and derives the user id from the token, never from client input. No IDOR across optimise, anomalies, income-proof, quarter-pack, autonomy, bank/*, hmrc/*, billing/*, account/*. Mutations filter on `user_id` alongside any row id; edits/deletes also require `confirmed=false`.
- Capability tokens (packtoken, used by quarter-pack and income-proof) are HMAC-SHA256, single-user bound, 20-minute expiry, timing-safe compared, fail closed. Cannot be forged or replayed across users.
- WhatsApp webhook validates `x-hub-signature-256` (constant time) on every inbound and fails closed without the app secret. Phone matching is exact canonical only; one person cannot act as another. Media downloads are host-pinned to Meta CDNs.
- Stripe webhook: signature + timestamp tolerance + event-id idempotency; invoice payments re-check amount and currency before booking.
- No hardcoded secrets. No service-role or server key in the app bundle; every `EXPO_PUBLIC_*` is safe to expose. HTML documents (income proof, quarter pack) escape user input; the public invoice page renders via JSX (auto-escaped). No XSS, no SQL injection (all PostgREST filters `encodeURIComponent` their input).

**Security config gates for launch (config, not code, already tracked in doc 81):**
1. Disable anonymous sign-in in the Supabase project and set `REJECT_ANON_USERS=true` (once OTP is the live login).
2. Set `BANK_TOKEN_KEY` before any bank feed or live HMRC go-live (token encryption at rest is a no-op until then).
3. Set dedicated `PACK_TOKEN_SECRET`, `HMRC_STATE_SECRET`, `LEAD_TOKEN_SECRET` so the service-role key is not reused as an HMAC secret.

## Scale to 100k+ (agent 2): fixed

- **FIXED (was HIGH): the reminders `due` job is now resumable.** It was a single `getDueReminders` capped at 100, so on a heavy deadline day only 100 reminders fired. It now pages (500 at a time) and hands over to a continuation when the send budget is spent; the atomic `claimDueReminder` marks each `reminded=true` so the next page never repeats one (the claim is the cursor, progress guaranteed, no loop). The one-time side jobs (prune, bank-feed kick, agent kick) now run only on hop 1.
- **FIXED (was MEDIUM): the nudge/weekly fan out no longer reads the whole prefs table on every hop.** New `getNudgePrefsForUsers(userIds)` fetches prefs for just the current page.
- Verified solid: all fan-outs resumable with keyset cursors, 40s budget inside the 60s limit, hop cap 100, bounded concurrency, `after()`-deferred work so no invocation waits on another. Bank sync bounds intact (MAX_ROWS 1000, page 200, concurrency 5, idempotent on external_id); the new `history_from` range did not remove a bound. `increment_ai_usage` RPC is atomic; AI spend paths fail closed. WhatsApp webhook acks within 5s (heavy work deferred). Hot-path indexes present.
- NOTE (not urgent, AI dormant): `lib/aicost.ts` (`decideSpend`/`resolveCaps`) is built and tested but not yet the single chokepoint; live caps are hardcoded in the routes (`ask` 6/day + 3000 global, WhatsApp 120/phone + 4000 global, draft 500 global) and the kill switch reaches all AI via `claude.ts` `aiEnabled()`. Wire `decideSpend` in when AI goes live so the numbers cannot drift. Worst-case Anthropic spend is bounded by the global caps regardless of user count.

## UX and functional (agent 3): fixed

- **FIXED (was CRITICAL): CIS logged with no pound sign.** `isCIS` required a `£`, but our own onboarding teaches "Dave paid 500, 100 CIS held" (no £), so it booked £500 income and dropped the deduction. `isCIS` now accepts bare numbers with a payment context, and a new `£`-optional `moneyAmounts` parser (skips percentages) reads them. Tested.
- **FIXED: literal HTML entities** (`&ldquo;`, `&apos;`, etc.) were rendering on the Feed and five other app screens. Replaced with real characters everywhere.
- **FIXED: tax-guide mileage wording.** 45p is correct for a 2025/26 return; the copy now says so and notes 55p from 2026/27 (what we use when you log a trip today), removing the apparent contradiction.
- **FIXED: the "You" tab** no longer shows fake unlocked badges or hardcoded percentages to an empty account, and uses confirmed-only counts.
- **FIXED: Invoices** pull-to-refresh now has error handling so it cannot hang.
- **FIXED: blank transaction rows** now fall back to "Payment" / "Uncategorised".
- **FIXED: Ways to save** distinguishes a failed fetch ("Could not check right now") from a genuinely empty result, instead of always saying "nothing to save".
- **FIXED: Proof of income** on-screen figure now caps at today to match the PDF.
- **FIXED: "invoice this"** no longer hijacks a user who is midway through the guided create-invoice flow (it hands back to the flow if a session is active).
- **FIXED: referral copy** softened to honest sharing (no implied reward that is not live).
- FALSE ALARM: the paywall "already subscribed" path is correct (the server returns Stripe's real `trialing` status, which it already accepts).
- Price consistency verified: £12.99/mo, £129/yr everywhere across app, web, WhatsApp, JSON-LD; no user-facing £12.99, no "founder", no "TradeBook".

## Remaining minor (post-launch, not blocking)

- L1: the Transactions error state is not retryable in place (leave and re-enter the tab).
- L2: staging URL `tradebook-app-five.vercel.app` shown where copy says lekhio.app; flips at domain launch (config).
- L3: Invoices "paid this month" filters by due date, not a paid date, so paid timing can miscount (needs a paid_at field on the app Invoice type).
- Wire `aicost.decideSpend` into the AI routes when AI credit lands.

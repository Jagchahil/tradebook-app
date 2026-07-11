# 97 · Session log — 8 July 2026 · Phase 1.5, premium icon redesign, security audit

Continues docs 95 (brain/agent design) and 96 (hard-test audit). Three workstreams shipped this session: Phase 1.5 (Rakha one-tap actions + credit cache), the full premium icon redesign (app + website), and a security audit against the "vibe-coded sites get hacked" checklist. Everything below is deployed and building green unless stated.

Repos (per doc 81): web edits → `~/Projects/tradesman/tradebook` (remote `tradebook-app`) → Vercel → **lekhio.app**. Mobile → `~/Projects/tradesman/tradebook-app` (remote `tradebook-mobile`) → EAS/Expo. Cowork edit folders under `~/Documents/Claude/Projects/Tradesman/…` are copied across with rsync.

---

## 1. Phase 1.5 — Rakha one-tap actions + credit-saving cache (doc 95)

Rakha moves from suggest-only to **prepare one-tap actions**; the human still taps. Nothing irreversible fires server-side.

### Chunk 1 — invoice chase (deployed: web `fade38c`, app `4628427`)
- `lib/agent.ts`: new `AgentAction` union; `invoice_chase` signal carries `{ invoiceId, invoiceNumber, customer, total, link, draft }`.
- `app/api/cron/agent/route.ts`: signal payload now forwards `action: s.action ?? null`.
- `tradebook-app/lib/send.ts` (NEW): `sendToCustomer` — device-side send (whatsapp:// → sms: → mailto: → Share). Nothing leaves Lekhio's servers; the user taps send in their own messenger, which keeps the approval gate honest and free.
- `accountant.tsx`: `ChaseAction` component — Prepare a chase → editable draft → send from own messenger → marks invoice sent.

### Chunk 2 — set-aside + check-entries (deployed: web `fa9fa61`, app `1b60930`)
- `set_aside` action on the `poa_cliff` signal → app `SetAsideAction` creates a **savings goal** (`createGoal`, target 31 Jan). No money is ever moved or held; fully reversible.
- `open_confirm` action on the `quarter_unconfirmed` signal → app button routes to `/things-to-check`.
- `AgentAction` union mirrored in `tradebook-web/lib/agent.ts` and `tradebook-app/lib/supabase.ts`.

### Feature B — general-answer credit cache (deployed: web `fa9fa61`; SQL run in Supabase; Khoji patched on the mini)
The credit saver: a **general** question (no personal context) answered once from recognised sources is served to everyone else for free — before the paid model and before the daily cap, even when a user has used up their paid questions.
- New table `public.qa_cache` + RPC `public.bump_qa_cache_hit` (end of `supabase/schema.sql`; ran in the SQL editor). Service-role only, RLS on, no policy.
- `tradebook-web/lib/supabase.ts`: `normaliseQuestion`, `isGeneralQuestion` (conservative — any first-person marker = treated as personal, never cached), `lookupQaCache` (active + 21-day freshness window), `bumpQaCacheHit`, `upsertQaCache`.
- `app/api/ask/route.ts`: cache lookup runs **before** the paid path; on a miss it answers as before, then populates the cache **only** when the question is general AND every source is recognised (`allSourcesRecognised`). Two write-time gates → a served answer can never contain another user's figures and is always source-backed.
- Invalidation: `khoji/watch.mjs` (on the Mac mini) marks the whole cache stale on any run that distils an `engine_impact` item (a tax figure changed). Best-effort/try-caught. The 21-day TTL is the backstop.

Verify gate: `cd tradebook-web && node test/run-all.mjs` → 23 suites / 3,618 assertions green.

---

## 2. Premium icon redesign — app + website

**Design decision (Jag):** minimal like Apple + tech like Monzo, **keep the existing brand colours** (River `#1B59A6`, Saffron `#E0A33E`, warm paper) and **keep the L-chip logo** (no rebrand; the "Pulse" abstract mark was liked but not adopted). **Kill the crane** everywhere — it was the 🏗️ emoji used as the CIS icon, not the launcher (`icon.png` was already clean).

**Rule (Jag): keep emoji in WhatsApp context** so it still feels like a mate texting — applies to `api/whatsapp` bot messages and the WhatsApp-style demo bubbles on the marketing site. Also kept: ✓ ✕ ★ △ marks, 🇬🇧 badges, one-off status ✅/⚠️.

### App (React Native) — deployed `a78113e`, `042c621`
Standardised on **Ionicons** (already a dependency). Converted every screen's emoji → Ionicons outline in brand colours. The Rakha `SIGNAL_ICONS` dict in `accountant.tsx` now maps signals → Ionicons names. Screens: Feed, Puchio, You, Tax, Invoices, Settings, Add, Messages (primary, `a78113e`); tour, achievements, cis, goals, diary, national-insurance, student-loan, properties, what-if, wrapped, things-to-check, can-i-claim, tax-summary, file-return, Puchio in-chat avatars (detail, `042c621`). Typecheck clean throughout.

### Website (Next.js) — deployed `bb102e1`, `44cf007`, `496c3bb` (green)
No Ionicons on web, so built an inline-SVG icon component **`Ic`** in `app/_shared/site.tsx`, **keyed by the emoji it replaces** (`<Ic e="📸" color="var(--river)" size={26} />`) with the emoji itself as a graceful fallback — so any missed swap shows the old emoji, never a broken string. ~45 hand-drawn line icons.
Converted: homepage, product, pricing, how-mtd-works, resources, compare, security, for-landlords, `for/[trade]`, start, wizard, onboarding, all 6 calculators, footer, hero-mock feed.

**Build gotcha (fixed):** commits `ce29813` and `c290fca` went **red** — `app/for/[trade]/page.tsx` imported `Ic` from `'../../../_shared/site'` (three levels, overshoots to root) when it should be `'../../_shared/site'` (two levels; `lib` is three because it sits outside `app`, `_shared` is inside). Fixed in `496c3bb` → green. Lesson: the babel parser used for local validation checks **syntax only**, not module resolution — wrong import paths pass the parser and only fail the real Vercel build.

**Local validation:** the cowork web copy has no `node_modules`, so `next build` can't run in the sandbox. Every web change was validated with `@babel/parser` (jsx + typescript) installed in the outputs dir, and spot-checked on the live site via Chrome (SVGs render sharp). Watch the Vercel deploy for the true gate.

---

## 3. Security audit — vs the "vibe-coded sites get hacked" checklist (doc 88 confirmed, extended)

Audited against the viral list (Supabase no RLS / API keys in the JS bundle / no rate limiting / public staging) plus extras. **Result: clean, no code vulnerabilities.**

- **RLS:** 25 tables, 26 policies, **every** policy `auth.uid() = owner` (script-verified). No permissive/anon-read policies. A user can only ever see their own rows — enforced three ways: DB RLS, the app querying as the user's own session, and API routes scoping to `verifyAccessToken(token).id` (never a client-supplied id → no IDOR; the earlier `/api/ask` write-IDOR was already fixed with `conversationOwnedBy`).
- **Secrets:** only `NEXT_PUBLIC_`/`EXPO_PUBLIC_` URL + anon key reach the client (web + app). No service-role / Anthropic / Stripe / WhatsApp secrets client-side. `.env*` gitignored.
- **Rate limiting:** all 33 API routes protected (rate limit OR `CRON_SECRET` constant-time OR token/signature). No password login to brute-force — sign-in is phone OTP, rate-limited by Supabase.
- **Webhooks:** WhatsApp verifies `x-hub-signature-256` (fails closed); Stripe verifies signature + idempotency. Receipt images stream to Vision in memory — never stored in a public bucket. CORS reflects allow-listed origins only, Bearer-header auth (no cookie/CSRF). No debug/admin routes.

**Operator access (honest framing):** Lekhio is **not** end-to-end encrypted — the server must read receipts and compute tax — so the service-role key and the Supabase dashboard owner **can** read the data, like any non-E2E finance app. The correct claim (for privacy copy/marketing) is "encrypted at rest and in transit, no other user can see your data, never sold, least-privilege access" — **not** "even we can't see it," which would be false.

**Hardening done this session (via Chrome):**
- Supabase org has **one member** (Jag, Owner) — access already locked down.
- **MFA now ENABLED** on the Supabase account (Google Authenticator).
- Vercel "Protected Sourcemaps" already on.

**Deliberately NOT done:** Vercel Deployment Protection. On the **Hobby** plan it can't exclude the production domain (that's a Pro $150/mo feature), so enabling it would put **lekhio.app behind a Vercel login and break the public site**. Not needed anyway — preview URLs run the same auth + RLS as production.

**Remaining launch gate (Jag deferring until Stripe is live):** set `REJECT_ANON_USERS=true` + disable anonymous sign-ins in Supabase Auth. The app currently calls `signInAnonymously` for testing; the rejection is already wired in `verifyAccessToken`. This is doc 93 / launch task #1.

---

## Deploy summary (commits this session)
- Web (`tradebook`→Vercel→lekhio.app): `fade38c` (chase), `fa9fa61` (set_aside/open_confirm + credit cache), `bb102e1` + `44cf007` (icons core), `ce29813`/`c290fca` (icons long tail — red), `496c3bb` (import-path fix, **green**).
- App (`tradebook-app`): `4628427` (chase), `1b60930` (set_aside/check), `a78113e` (icons primary), `042c621` (icons detail).
- SQL run in Supabase editor: `qa_cache` table + `bump_qa_cache_hit` RPC.
- Mac mini: `khoji/watch.mjs` engine_impact cache invalidation.

## 4. qa_candidates retention + dedupe (doc 96 scale item / task 17) — 8 Jul, later

The one genuinely unbounded low value growth surface (doc 96): one qa_candidates row per answer, forever, no prune, and nothing in the repo reads or reviews it yet, so every row sits `unreviewed` indefinitely. Fixed two ways.

**Write time dedupe (the primary bound).** New pure module `tradebook-web/lib/qaretention.ts` exports `qaDedupeKey` (lowercase, strip punctuation, collapse whitespace, cap 500). New SQL RPC `public.log_qa_candidate` upserts on a normalised question key: the same question asked again bumps `seen_count` on the one row instead of inserting a new one, so the table can never grow faster than the number of DISTINCT questions. A human's `reviewed`/`dismissed` or an `auto_approved` is NEVER overwritten — the answer and flags refresh only while the row is still `unreviewed`. Schema adds `question_norm` (plain unique index; Postgres NULLs are distinct so legacy null rows never collide), `seen_count`, `last_seen_at`. `logQaCandidate` now redacts, computes the key, and calls the RPC; if a question is too short to normalise it falls back to the old plain insert so nothing is dropped.

**Retention (the backstop).** `qaPrunePaths` (same module) builds the PostgREST DELETE plan; `pruneOldRows` (the `?job=cleanup` cron) now runs it after the existing prunes, using the same batched delete. Trims: terminal candidate rows (`dismissed`/`auto_approved`/`reviewed`) older than 90 days, `unreviewed` older than 365 days (hard backstop), and `qa_cache` rows past the 21 day read TTL plus a margin (28 days, unservable dead weight).

Signature of `logQaCandidate` unchanged (one caller, `/api/ask`). New suite `test/qa-retention.test.mjs`: 30 assertions, pure, no network. Full suite 24/24, 3,648 green. `@babel/parser` clean on `qaretention.ts` + `supabase.ts`.

**Deploy order (SQL first).** Run the new block in `supabase/schema.sql` (the `alter table qa_candidates …`, the `qa_candidates_norm_uniq` index, and `create or replace function public.log_qa_candidate`) in the Supabase SQL editor FIRST — it is additive and idempotent, safe on the live table. Then rsync `lib/qaretention.ts`, `lib/supabase.ts`, `test/qa-retention.test.mjs` into `~/Projects/tradesman/tradebook`, push, and deploy. If the web ships before the SQL, the RPC 404s but `logQaCandidate` is best effort in a try/catch, so candidates just are not logged until the SQL runs — no user impact. Verify after: hit `?job=cleanup` on the reminders cron with the `CRON_SECRET` bearer and confirm a 200.

## Still open (not code — config/launch)
1. `REJECT_ANON_USERS=true` + anon sign-ins off (after Stripe) — the launch gate.
2. Stripe live account + webhook (doc 93). Decision 8 Jul: open Stripe as **Lekhio Ltd** (wait for the Tide CRN), not as a sole trader, so tasks 1 to 3 are all gated on incorporation.
3. HMRC production credentials, D-U-N-S, app-store enrolment, Meta payment/verification, business bank — all waiting on the Lekhio Ltd CRN (docs 92/93).

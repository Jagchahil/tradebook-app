# 74: Fable 5 Audit Findings (2 July 2026)

> Phase 1 deliverable of the master audit brief (doc 73). Ranked findings across every area, with severity, effort, file references and recommendations. The ordered build plan (Phase 2) is at the end. Baseline verified before any change: tax exam suite green (all questions pass), HMRC unit suite 28/28 green.

## Executive summary: the ten highest impact findings

1. **The accountant AI prompt contradicts the verified engine.** `lib/claude.ts:344` tells the model the main pool WDA is 18%. The engine (`lib/taxengine.ts:63`) was corrected to 14% for 2026/27. A user asking the accountant about capital allowances gets a wrong figure the rest of the product gets right. Fixed this session by deriving the prompt from FACTS.
2. **Two HMRC write paths have no approval gate.** `createBroughtForwardLoss` (`lib/hmrc.ts:553`) and `createLossClaim` (`lib/hmrc.ts:573`) POST to HMRC without an `approved === true` gate, unlike every other submit. Sandbox-only today, but the rule is the gate is built before the automation. Fixed this session.
3. **Money questions always burn AI.** "How much have I spent this month" is deterministic arithmetic over the user's own rows, yet it routes to Claude with a 150 row prompt. A deterministic totals handler removes the single biggest steady state AI cost and answers faster. Built this session.
4. **CIS and phone share parsers drop thousands separators.** `£1,200` parses as £1 in `handleCIS` (`route.ts:545`) and `handlePhoneShare` (`route.ts:641`). The main money parser handles commas; these two do not. Real money-corruption bug. Fixed this session.
5. **Receipt date is thrown away.** The webhook stores today's date in `transaction_date` (`route.ts:275`), so a back-dated receipt lands in the wrong quarter once AI parsing is on. The app already keys tax periods off `transaction_date`. Fixed this session: the vision prompt now extracts the receipt date and the webhook stores it (clamped to a sane range).
6. **No cross-instance message rate limit.** `lib/ratelimit.ts` is per warm instance. The durable AI cap protects the wallet, but reply storms are only softly limited. Fixed this session with a durable per-phone daily message cap through the existing `ai_usage` counter, no new infrastructure, fails closed for AI and open for plain replies.
7. **Weekly summary cron is N+1.** One `weeklyTotals` query per user (`cron/reminders/route.ts:86`). Fixed this session with a single grouped RPC (`weekly_totals_all`) plus a safe per-user fallback until the SQL is applied.
8. **No prompt caching and one model for every task.** Every call uses Sonnet, no `cache_control` on the stable accountant system prompt. Fixed this session: Haiku for structured parsing tasks, Sonnet kept for the accountant, cache_control on the accountant system prompt. Projected steady state cost falls by roughly 70 to 80 per cent per active user.
9. **Phone identity binding is still client-writable.** Mitigated by OTP plus the unique index, but the full fix (a database trigger binding `users.phone_number` to the OTP-verified JWT) is written this session as SQL to apply in the Supabase editor. Until applied, the mitigation stands.
10. **Mobile screens contradict the engine.** `achievements.tsx` and `wrapped.tsx` use flat 26%/42% approximations and `cis.tsx` re-implements tax due, instead of calling `soleTraderTax()`. Fixed this session.

**Top remaining risks (not fixable from here, or deliberately deferred):** HMRC production recognition is still the gating strategic item (doc 66, do not submit, founder decision). Open Banking bank feeds remain the top competitive gap (spec doc 22, a build of real size, sequenced after recognition). App store presence and reviews. Scottish income tax rates are not modelled; acceptable while the audience is rUK, but note it in the accountant prompt and marketing honesty. ICO registration before real members of the public.

---

## A. Code quality and architecture

| # | Sev | Effort | Where | Finding and recommendation |
|---|-----|--------|-------|-----------------------------|
| A1 | High | S | `lib/claude.ts:344` | Accountant system prompt hardcodes WDA 18% main pool; engine says 14%. Derive from FACTS. **Fixed.** |
| A2 | High | M | `app/api/whatsapp/route.ts:275,458` | `transaction_date` always today. Store the parsed receipt date; accept "yesterday" in typed entries. **Fixed.** |
| A3 | High | M | `app/api/cron/reminders/route.ts:86`, `lib/supabase.ts:730` | Weekly summary N+1. Replace with one grouped aggregate RPC. **Fixed (RPC plus fallback; SQL to apply).** |
| A4 | Med | S | `lib/supabase.ts:120` | Invoice numbering pulls every invoice row to count them, and has a read-then-write race. Use `Prefer: count=exact` head request. **Fixed.** |
| A5 | Med | S | `lib/supabase.ts:36` | Comment says per-phone AI cap "fails open"; the route fails closed on the global cap. Comment corrected, and per-phone now also fails closed for AI spend. **Fixed.** |
| A6 | Med | M | `lib/ratelimit.ts` | In-memory limiter is per instance. Durable per-phone daily message cap added via `ai_usage` counters. **Fixed.** |
| A7 | Low | S | `lib/supabase.ts:761` | `transactionSummaryForUser` pulls 150 rows into prompts. Reduced to 60 and now used only by the accountant path; money questions are deterministic. **Fixed.** |
| A8 | Low | S | `app/api/whatsapp/route.ts` | The dispatch if-chain works and is auditable, but pure parsers are untestable inside the route file. Pure intent logic extracted to `lib/waintents.ts` with unit tests. **Fixed.** |

## B. Security (penetration test pass)

Verified good, do not regress: both webhooks verify signatures (WhatsApp HMAC, Stripe signed events); HMRC OAuth state is HMAC-signed with TTL and timing-safe compare after the hardcoded fallback removal; service role key is server-only; RLS with owner policies on user tables; anonymous sign-in disabled in the dashboard; GDPR delete verifies every sub-delete; public invoice page redacts both sides' personal contact details; PostgREST filter inputs are `encodeURIComponent`ed; cron requires a Bearer CRON_SECRET with timing-safe compare and is closed when unset; durable AI budget fails closed globally.

| # | Sev | Effort | Where | Finding and recommendation |
|---|-----|--------|-------|-----------------------------|
| B1 | High | M | `supabase/schema.sql` | Client can still write its own `users.phone_number` (mitigated by OTP plus unique index). Full fix is a trigger binding the phone to the JWT phone claim, service role exempt. **SQL written this session; apply in the Supabase SQL editor.** |
| B2 | High | S | `lib/hmrc.ts:553,573` | Loss creation endpoints POST to HMRC without an approval gate. Both now require `approved === true` and throw `ApprovalRequiredError` otherwise. **Fixed, tests added.** |
| B3 | Med | S | `app/api/whatsapp/route.ts:124` | Burst limit is in-memory only. Durable daily per-phone cap added. **Fixed.** |
| B4 | Med | S | webhook media path | Media downloads have no size cap before base64 into memory or the AI call. Cap added at 8 MB. **Fixed in `lib/whatsapp.ts`.** |
| B5 | Low | S | `app/api/billing/status` | Reported as IDOR by the audit fan-out; verified NOT an IDOR (token verified server side, phone derived from the verified user id). No change. |
| B6 | Low | S | marketing sends | STOP over WhatsApp did not opt the user out of nudge templates. Deterministic STOP handler now writes `reminder_prefs`. **Fixed.** |

## C. Tax engine correctness

Every constant in `lib/taxengine.ts` was re-verified against the values already cross-checked to GOV.UK on 30 June (doc 64) and each carries a source comment. No mismatches found between `taxengine.ts`, `taxrules.ts` and the app's `lib/tax.ts` constants. The single contradiction was the accountant prompt (A1).

Coverage gaps in the exam bank (fewer than 3 questions): dividends interaction with the personal allowance, employer NI, corporation tax marginal relief, sideways loss relief, CGT with BADR stacking, multi-year WDA. **12 new exam questions added this session; suite must stay green.** Scottish rates are out of scope for 2026/27 and now stated honestly in the accountant prompt.

## D. HMRC MTD integration

Endpoint inventory re-checked (obligations, cumulative quarterly submission, BSAS, losses, calculation trigger, final declaration) with versioned Accept headers; the sandbox harness remains the proof. Live spec re-verification against the HMRC developer hub needs network access to the hub and is recorded as a pre-production checklist item in doc 66 rather than guessed at here. Loss creation gates were the one rule breach (B2, fixed). Property income sources: out of scope for the trade wedge; recorded in doc 66 with reasons (no property landlord persona in the target market yet; add before widening the ICP). Fraud prevention client-side collection: the collect points exist for the connect flow; completing full production collection remains on the recognition checklist. Do not touch live, do not submit the production application (standing rule).

## E and F. Design system and motion (web)

| # | Sev | Effort | Finding |
|---|-----|--------|---------|
| E1 | High | M | No shared token file; each page declares its own palette constants. Verified: the values are consistent across pages (the "three diverging reds" claim from the audit fan out did not hold), so the risk is future drift, not present inconsistency. **`lib/tokens.ts` added as the canonical source; pages migrate as they are touched.** |
| E2 | High | S | `:focus-visible` existed only on the tax return guide and calculator fields; buttons and links elsewhere had no focus ring. **A shared `A11Y_CSS` block now injects visible focus styles on every page.** |
| E3 | High | S | Only the hero chat respected `prefers-reduced-motion`. **A blanket reduced-motion guard now ships on every page and disables all animation under the preference.** |
| E4 | Low | done | Verified: the homepage hero already demonstrates the "text it, it's logged" moment with an animated WhatsApp chat, keyframed in CSS with a reduced-motion fallback. Kept; no change needed. |

## G. Mobile app

| # | Sev | Effort | Finding |
|---|-----|--------|---------|
| G1 | High | S | `achievements.tsx:67` and `wrapped.tsx:62` use flat 26%/42%; `cis.tsx:24` re-implements tax due. All now call `soleTraderTax()`. **Fixed.** |
| G2 | Med | S | Eight one-off hex colours bypass `theme.ts`. **Moved into theme tokens.** |
| G3 | Med | S | `accountant.tsx` shows no activity indicator while sending. **Fixed.** |
| G4 | Low | S | `diary.tsx` is unreachable from any screen. Left in place but linked from Settings, since reminders write events. |
| G5 | Low | S | Referral UI: doc 65 flagged it; the settings screen contains a share link only, no server reward path. It remains honest (gives a share message, promises nothing). Building the reward mechanic is a founder pricing decision; not built. |
| G6 | Med | M | No offline cache. Recorded as roadmap; not built this session (needs design for stale-data honesty). |

## H. Customer journey

The first minute is sound: OTP, then WhatsApp deep link, then the first deterministic entry works with zero AI. Friction found and fixed: a bare "yes", "thanks" or greeting after the first entry fell through to the generic prompt (now warm deterministic replies); money questions needed AI credit (now deterministic); STOP did nothing (now opts out). Remaining friction is external: SMS OTP costs and the domain.

## I. AEO

`robots.ts` does not block AI crawlers (a fan-out claim that proved false; the wildcard allow covers them). `llms.txt` is accurate. Gap: tool pages lacked structured data. **FAQPage JSON-LD added to the tax calculator and CIS calculator pages; HowTo added to the file-your-tax-return guide.** The monthly assistant-check ritual is documented in doc 71.

## J. SaaS versus GaaS future proofing

The approval gate is already the moat and is now uniformly enforced (B2). Outcome events: receipt captured, quarter prepared and filed already exist as data (transactions, submissions); a dedicated events stream is deferred until there is volume to price on. Model layer is swappable (`lib/claude.ts` single boundary, transcription isolated). Autonomy dial: everything remains propose-and-approve by default; no automation was added without a gate.

## K. Competitor matrix

Based on the 30 June audit (docs 64, 65 section 9), re-checked for major moves where possible from here. No structural change in 48 hours.

| Competitor | HMRC recognised | WhatsApp capture | Voice | CIS depth | Bank feeds | Price | Our edge / exposure |
|---|---|---|---|---|---|---|---|
| Coconut | Yes | No | No | Basic | Yes | ~£10/mo | Edge: capture UX, CIS. Exposure: feeds, recognition. |
| QuickBooks Sole Trader | Yes | No | No | Add-on | Yes | ~£10/mo | Edge: simplicity, WhatsApp. Exposure: brand, feeds. |
| FreeAgent | Yes | Send-only | No | Yes | Yes | Free via banks | Exposure: free via NatWest/Mettle. Edge: trade focus. |
| Xero Simple | Yes | No | No | Yes | Yes | ~£10/mo | Exposure: accountant network. |
| Sage | Yes | No | No | Yes | Yes | varies | Exposure: enterprise trust. |
| ANNA | Yes | No | Partial | Basic | Yes | Free tier files MTD | Exposure: free filing. Edge: WhatsApp, CIS, approval clarity. |
| untied | Yes | No | No | Basic | Yes | ~£6/mo | Exposure: price. |
| Accounted/Penny, TaskDrop, Snapfile, Snyp | No | Yes (capture only) | Partial | No | No | varies | Edge: full loop, tax engine, approval gate. They validate the channel. |

Priority to close, in order: HMRC recognition (in progress, external), Open Banking feeds (top retention lever, doc 22 spec), GPS mileage (label exists, honest), accountant portal, app store reviews.

## L. AI cost

Call sites and disposition after this session: receipt vision (Haiku, was Sonnet), spoken/typed entry parse (Haiku), invoice draft (Haiku), schedule parse (Haiku), expense Q&A fallback (Haiku), money questions (now deterministic first, Haiku fallback), accountant (Sonnet, system prompt cached with `cache_control`). Output caps were already present (300 to 700 tokens). Durable caps verified and per-phone now fails closed. Projected cost per active user per month at 6 messages a day: previously roughly £0.90 to £1.20; now roughly £0.15 to £0.30, dominated by receipt vision. Global cap bounds worst case spend at roughly £25 a day even under attack.

## M. WhatsApp deterministic router

Existing deterministic intents (verified): get started, help, mileage, CIS, home office, phone share, typed money entries, expense checker, tax tips, invoice flow, tax guide flow, schedule detection (AI for time parsing only). Added this session, all zero AI: balance and totals questions (spent, made, profit, tax so far, what do I owe) computed from the user's own rows with a period filter (today, this week, this month, this quarter, this year); tax deadline questions; greetings and thanks; bare yes/no acknowledgements; who are you / are you a bot; pricing questions; STOP and START for nudges; delete last entry and change last entry amount (unconfirmed entries only, so no approval question arises); comma and k-suffix amounts. Full intent map documented in `lib/waintents.ts` header. AI is now reserved for: receipt vision, voice transcription, open ended accountant questions, unusual entry phrasings, invoice line drafting, schedule time parsing.

## N. Performance, accessibility, technical SEO

Focus states and reduced motion were the two real accessibility failures (fixed). Tool pages have labels on inputs (verified). Sitemap and robots serve and cover the pages. Canonicals and metadataBase remain deploy-repo work tied to the real domain (doc 65 section 6b) and are listed there; not done from here because `app/layout.tsx` lives only in the deploy repo and the domain is not live.

## O. Data integrity, GDPR, observability

Idempotency verified: webhook claims message ids atomically; invoice mark-paid flips status atomically before booking income and verifies amount and currency. Export and erasure cover every table including phone and email keyed rows; erasure reports honestly. Logs carry no message content or PII (re-verified on every touched path). Health: the cron logs counts only. Weekly totals keyed off `created_at` while the app keys off `transaction_date`; the new RPC uses `transaction_date` with a `created_at` fallback so the summary agrees with the app.

## P. Testing and CI

Added: unit tests for every new deterministic intent and parser fix (`test/waintents.test.mjs`), two new HMRC gate tests, 12 new exam questions. All suites green. CI remains a deploy-repo concern (GitHub Actions on `tradebook-app`); the workflow file is included in the sync so it lands with the push: typecheck, tests, build on every push.

---

## Phase 2: the ordered build plan (executed this session)

1. **Batch 1, WhatsApp correctness and deterministic router** (M, A, B parts). Pure logic in `lib/waintents.ts` plus route wiring. Highest value, fully unit-testable, no schema change, cannot break the live loop because every new intent is additive and the existing paths are regression-tested.
2. **Batch 2, cost and structure** (L, A). `lib/claude.ts` model tiering, caching, FACTS-derived prompt; receipt date; summary shrink; invoice count fix; durable message cap.
3. **Batch 3, HMRC gates and tests** (D, B2). Additive `approved` parameters, suite extended.
4. **Batch 4, web polish** (E, F, I, N). Tokens, focus, reduced motion, hero animation, JSON-LD.
5. **Batch 5, mobile** (G). Engine-consistent figures, theme tokens, spinner, diary link.
6. **Batch 6, tests and schema SQL** (P, C, B1, A3). Exam bank expansion, new SQL (trigger plus RPC) delivered for manual application, clearly flagged.
7. **Ship**: sync to the deploy repo, typecheck and build, deploy, verify live, changelog (doc 75), update docs 65, 66, 71.

Everything in batches 1 to 6 is reversible by revert; nothing removes an approval gate or touches live HMRC; no secret is read or logged.

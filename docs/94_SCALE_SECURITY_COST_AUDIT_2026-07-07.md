# 94: Scale, security and cost audit (7 July 2026, evening)

> A three-agent audit run the evening of 7 July, after the day's launch-prep changes (domain moved to lekhio.app, support emails wired to info@lekhio.app, the redundant users index dropped, AI credit funded and capped). Purpose: confirm nothing broke, re-confirm the backend holds at 100,000 users, and produce a real cost projection now that the AI caps and provider pricing are known. This is an analytical/architectural review plus a cost model, not a live load test (we do not hammer production). Read alongside doc 88 (the morning's pre-launch audit) and doc 93 (launch runbook). Writing rule holds: no em dashes, no en dashes, no hyphens as dashes.

## Verdict

Green across all three lenses. Today's changes are safe, the architecture is ready for 100k active users with one medium item to tidy before you actually reach six figures, and at £12.99 a month Lekhio runs at roughly 95 percent gross margin. No blocker, no high-severity finding. The only follow-ups are low-severity cosmetic cleanups and one memory-bound cron read to range before scale.

## Lens 1: Security and today's URL change, SAFE

The domain move is driven end to end by the `NEXT_PUBLIC_APP_URL` env var, not hardcoded, so pointing it at https://lekhio.app cascades correctly to the sitemap, robots (indexing now open), the `SITE` constant that feeds JSON-LD and canonicals, llms.txt, the bank/pack/lead/referral token base URLs, and the CORS allowlist. The content security policy has no domain pin that lekhio.app would violate (connect-src and img-src are domain-relative). Verified live: lekhio.app/robots.txt now returns `Allow: /` with the sitemap and host on lekhio.app.

Core security posture is unchanged and correct: row level security on every table; the WhatsApp webhook validates `x-hub-signature-256` over the raw body with a constant-time compare and fails closed; the Stripe webhook verifies the signature and is idempotent via a claimed event id and re-checks amount and currency; every authed API route derives the user id from the Supabase-validated JWT (no IDOR); capability tokens are HMAC-SHA256 with timing-safe compare; no secret is exposed through `NEXT_PUBLIC_`.

The dropped index is confirmed harmless: `users_phone_unique_idx` remains as a UNIQUE partial index on `phone_number`, so one-phone-one-account is fully preserved. The support-email change is cosmetic (display and mailto text plus the `EMAIL_FROM` default).

Low-severity cosmetic cleanups (none affect security or function):
- `middleware.ts` CORS allowlist still lists the old `lekhio.app` and `www.lekhio.app` alongside lekhio.app. Harmless (only widens to a domain you own, and auth is Bearer-token not cookies), tidy when convenient.
- `lib/email.ts` `sendWelcomeEmail` fallback URL is still `https://lekhio.app`, only used if the env var is unset (it is set), so live behaviour is correct.
- Two display-only strings still read `lekhio.app` (`product/OnboardingShow.tsx`, `invoice-generator/Generator.tsx`), worth updating for brand consistency.
- `file-your-tax-return/page.tsx` has a hardcoded `metadataBase` pointing at the Vercel URL (pre-existing, not from today), so that page's OG/canonical drift off lekhio.app. There is also a stray `.fuse_hidden` backup file next to it to delete (gitignored per doc 81).

## Lens 2: 100,000-user scale, READY

Every fan-out is resumable with a strictly-increasing keyset or claim cursor, a 40 second send budget inside the 60 second function limit, a `MAX_HOPS=100` cap, and immediate `after()` acks so invocations never chain durations:
- The reminders `due` job pages 500 at a time and uses an atomic `claimDueReminder` (flip `reminded=false` to `true`, return true only if this call did it), so nothing repeats or is skipped, backed by a partial index. One-time side jobs run only on hop 1.
- Nudge and weekly prefs are fetched per page via `getNudgePrefsForUsers` (bounded IN-list), not the whole table. The old whole-table `listAllNudgePrefs` is now orphaned dead code (delete it so nobody re-wires it).
- The agent cron mirrors the same pattern.

AI and message spend is bounded by durable, atomic, fail-closed caps: 120 AI calls per phone per day and a global daily cap, via the `ai_usage` table and an atomic `increment_ai_usage` RPC; the `ask` route adds its own per-user and global caps. Context is capped (60 rows for money answers, 4000 chars of user content). The in-memory rate limiter is only a supplement; the durable DB counters are the real backstop across serverless instances.

The WhatsApp webhook acks Meta within 5 seconds and defers all heavy work (media, AI, transcription, DB, reply) to a background task, idempotent via `processed_messages`. Bank sync (dormant) is bounded (1000 rows per account, 200 per page, concurrency 5, idempotent on external_id). Hot-path indexes are present on transactions, users, invoices, events and subscriptions, including the partial confirmed-only and unconfirmed indexes.

One MEDIUM to fix before you actually reach six figures: the weekly summary cron loads `weekly_totals_all`, one row per active user, into a single invocation's memory at the start of every weekly hop. It works, but it is the one remaining unbounded in-memory read on a cron path. Bound it with a keyset range (the same `afterId, limit` window the other jobs use) before the active base gets large. It falls back to per-user totals if the RPC is absent, so there is no correctness risk, only a memory ceiling.

Two LOW items, both already known from doc 88: wire `aicost.decideSpend` in as the single cap chokepoint when AI goes fully live so the per-route numbers cannot drift, and delete the orphaned `listAllNudgePrefs`.

## Lens 3: Real cost projection at 100,000 active users

Grounded in the actual code (`lib/claude.ts`, `lib/aicost.ts`, `lib/transcribe.ts`): extraction, receipt vision, parsing, drafting and scheduling run on Claude Haiku 4.5 (80p per million input tokens, 400p output); only the accountant chat runs on Claude Sonnet 5 (240p in, 1200p out), with the system prompt cached; voice notes use Whisper at 0.006 dollars a minute. The binding worst-case ceiling is the per-phone 120-calls-a-day hard cap.

Assumed usage for an active sole trader per month: 25 receipt photos, 15 text or voice expense parses, 10 voice notes, 6 accountant chat questions, 4 invoice or schedule drafts, 4 out-of-window proactive WhatsApp templates, and roughly half a login. Well under the hard cap.

Per active user per month (EXPECTED): Anthropic about 9p, Whisper about 1.6p, WhatsApp templates about 10p (service replies within the 24 hour window are free and unlimited), Twilio Verify OTP about 4p, platform allocation about 1.5p. Variable cost per user about 26p. Stripe takes 1.5 percent plus 20p, about 39.5p on £12.99.

Per-provider monthly cost at 100k (EXPECTED):
- Anthropic (Claude): about £9,000
- OpenAI Whisper: about £1,600
- WhatsApp templates (Meta): about £10,000
- Twilio Verify (OTP): about £4,000
- Supabase Pro (scaled): about £500
- Vercel Pro (scaled): about £700
- Resend (optional): about £300
- TrueLayer bank feed: £0 at launch (dormant, ICO-gated), roughly £4,500 if live at 30 percent connect
- Stripe fees: about £39,500 (a revenue deduction, not a cloud cost)

Infrastructure subtotal excluding Stripe and TrueLayer is about £27,300 a month. With Stripe, total cost of goods is about £66,800 a month against roughly £1.299m of revenue.

Blended cost per user per month: about 8.5p LOW, 26p EXPECTED, up to about £1.02 HIGH (a user pinned near the per-phone cap all month). Including Stripe: about 48p to 66p to £1.41. The hard caps mathematically bound even the abuse case under £1.50.

Gross margin versus £12.99: about 96 percent LOW, 95 percent EXPECTED, 89 percent HIGH. The annual plan (£129) holds about 95 to 96 percent because the card fee is charged once a year, not twelve times.

Biggest cost drivers and the levers:
1. Stripe card fees, about £39.5k a month, roughly 60 percent of all cost of goods, because the AI is so cheap. Lever: push annual billing (one fee a year, not twelve) and consider a lower-fee acquirer or Direct Debit once volume justifies it.
2. WhatsApp business-initiated templates, about £10k. Lever: send nudges inside the free 24 hour service window whenever the user has messaged, cap default proactive templates to about one nudge plus a weekly summary, use Utility not Marketing rates.
3. Twilio Verify OTP, about £4k, the priciest per-unit item. Lever: move OTP to WhatsApp authentication templates or longer-lived app session tokens so logins are rarer.

Anthropic itself is third-tier and hard-capped, so the AI bill can never run away. The dominant cost is billing structure, not AI.

## Action list out of this audit

Before six figures (not launch-blocking):
- Range the weekly `weekly_totals_all` cron read with a keyset window (MEDIUM).
- Wire `aicost.decideSpend` as the single AI cap chokepoint when AI is fully live (LOW).
- Delete the orphaned `listAllNudgePrefs` (LOW).

Cosmetic, any time:
- Remove stale `lekhio.app` literals from the middleware CORS allowlist and the `email.ts` welcome fallback.
- Update the two display strings and the hardcoded `metadataBase` in `file-your-tax-return` to lekhio.app, and delete the stray `.fuse_hidden` file.

Cost levers to bank the margin:
- Favour annual billing, keep proactive WhatsApp nudges inside the free service window, and plan to move OTP off SMS.

## Plan: audit again at launch

Run the full three-lens audit once more right before go-live, because the still-gated pieces (live HMRC filing, live bank feeds, OTP as the live login, the paywall flip) are exactly the risky surfaces and none of them are exercised yet. Tonight's pass confirms the current build and today's changes are clean; the launch pass will confirm the final one.

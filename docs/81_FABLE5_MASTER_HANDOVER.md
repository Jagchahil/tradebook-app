# 81: Fable 5 Master Handover, the complete state of Lekhio (3 July 2026, evening)

> Read this first, on its own, in any new chat. It is the single, complete, self contained source of truth for Lekhio. It supersedes doc 80 (which superseded doc 65). It covers what Lekhio is, the entire build, exactly how to run the app on the phone, exactly how to push website and app changes, the security posture after five audits, the full HMRC and bank and billing and AI status, everything parked with its reason and trigger, the debugging playbook of every expensive lesson learned, and the ordered critical path to paying customers. Where an older doc holds deeper detail, this doc points to it. When something changes, update this doc. Writing rule for this and all Lekhio text: no em dashes, no en dashes, no hyphens used as dashes. Full stops or commas instead.

---

> **Latest sessions (read after this doc):** doc 95 (brain/memory + agent design), doc 96 (hard-test audit), and **doc 97 (8 July: Phase 1.5 Rakha one-tap actions + credit cache, the full premium icon redesign of app AND website, and the security audit vs the "vibe-coded sites get hacked" checklist, clean, MFA now enabled)**. Doc 97 has the commit map and current state. Net since this doc was written: the app and website were fully redesigned to a premium line-icon set (Ionicons in the app, an inline-SVG `Ic` set on the web, crane removed, WhatsApp emoji kept), Rakha now prepares one-tap actions, Puchio has a credit-saving general-answer cache, and Supabase MFA is on. The one open launch gate remains `REJECT_ANON_USERS` after Stripe.

---

## 0. Snapshot, where Lekhio is right now

Lekhio is a WhatsApp first bookkeeping and Making Tax Digital preparation tool for UK self employed tradespeople. The core loop is live end to end: a tradesperson texts the business WhatsApp number, the entry is parsed and stored under their phone keyed account, and it appears in the mobile app to confirm. Three surfaces are built and working: the mobile app (a full Instagram style redesign, native on the phone via an EAS development build), the marketing website plus free tools (live on Vercel), and the backend API (Next.js on Vercel, Supabase, integrations). The tax engine is verified against 2026/27 HMRC figures. Five audits have been run, the most recent on 3 July across backend security and 20,000 user scale, the mobile app, and the website. All runnable backend tests pass. There are no known blockers and no known critical security holes in the code.

Update, 5 July session (full log doc 83, plan doc 82): Phases A and B of the feature expansion shipped. Two new free website tools (`/ni-checker`, `/student-loan-checker`) on a new canonical engine module `lib/nistudentloan.ts` (mirrored in the app, guarded by a 256 point parity test). Two new app screens under Money (National Insurance, Student loan) working from confirmed data, with the plan and an optional PAYE salary stored on the users row. The set aside figure now automatically includes the student loan's Self Assessment share once the plan is set (quarterly summary, WhatsApp tax answer, the hub). New deterministic WhatsApp intents: NI questions, student loan questions, and "plan 2" to set the plan from chat. The waintents suite grew from 61 to 85, plus two new suites (50 engine tests, 256 parity). A pre existing site wide dark mode React 418 hydration error (the theme toggle icon) was found and fixed. Next: doc 82 Phase C, the Agentic Accountant v1.

What stands between here and paying customers is external, not code: incorporate the company, register with the ICO, point the real domain, fund a few accounts (most importantly add Anthropic API credit, which is the single thing gating every AI feature), and complete HMRC production recognition. Every one of those is tracked in section 12 with its trigger.

One correction carried forward and made honest this session: anonymous sign in is NOT yet closed. Phone OTP is built but is not the live login. The app still signs in anonymously, so the backend flag `REJECT_ANON_USERS` is set to `false` (setting it true rejects the app's own users with 401 on every authed route). Flipping it on, after OTP is the live login and anonymous sign in is disabled in Supabase, is a launch gate. Full detail in section 9.

---

## 1. What Lekhio is

Who it is for: UK sole traders in the trades. Electricians, plumbers, builders, plasterers, roofers, joiners, decorators, tilers, gas engineers, scaffolders, groundworkers, landscapers, bricklayers, handymen, and any self employed person, with a special focus on Construction Industry Scheme (CIS) subcontractors.

The promise: "Text it. It's in your Lekhio." All day to day interaction is on WhatsApp: photos of receipts, voice notes, typed expenses and income, questions about money. Everything is logged, categorised and stored automatically. Quarterly MTD summaries are prepared and sent to the user to approve before anything reaches HMRC.

The three pillars, in build order. One, back office bookkeeping plus MTD, the current focus and the wedge. Two, a marketing engine that generates ad creatives, Phase 2, not started. Three, Connect, a trade job matching network, Phase 3, not started. Do not start a later pillar before the earlier one ships.

The non negotiables. We prepare, the user approves. Never "we file your tax." Never imply HMRC endorsement. Every irreversible action, money, filing, sending a message, has a human approval gate built before the automation it guards. UK GDPR applies. Encryption in transit and at rest. Never log WhatsApp message content to any external service beyond Supabase.

Deeper detail: docs 01 vision, 02 product, 05 compliance.

---

## 2. The three repos and the golden rule

There are three separate code locations. Never mix them up. This has caused real outages.

1. **Web deploy repo.** Local `~/Projects/tradesman/tradebook`. Git remote `github.com/Jagchahil/tradebook-app.git`. Vercel project `tradebook1/tradebook-app`, serving `tradebook-app-five.vercel.app`. This is the Next.js App Router website AND all API routes.
2. **Mobile deploy repo.** Local `~/Projects/tradesman/tradebook-app`. Git remote `github.com/Jagchahil/tradebook-mobile.git`. Expo and React Native. Not deployed to a server. It runs on the phone as an EAS development build (section 4).
3. **Cowork edit folders, where Claude edits.** `~/Documents/Claude/Projects/Tradesman/tradebook-web`, `.../tradebook-app`, `.../docs`, and `.../supabase/schema.sql`. These are NOT the deploy repos. Edits must be copied across. The cowork web copy is partial (no `package.json` or `node_modules`), so the real typecheck and `next build` only run in the deploy repo's CI.

The confusingly named remotes, memorise this: the web folder `tradebook` pushes to remote **tradebook-app**. The mobile folder `tradebook-app` pushes to remote **tradebook-mobile**. Always `cd ~/Projects/tradesman/tradebook` before pushing the website.

Which URL is what, so nobody confuses them again:
- The **website** is live at `https://tradebook-app-five.vercel.app`. It is on Vercel, not localhost, and it is not down. It becomes `lekhio.app` when the domain is connected.
- **localhost:8081 or 8082** is only ever the Expo mobile app's dev server (a browser preview of the app). It is not the website.
- The **phone app** is the EAS development build installed on the Samsung.

---

## 3. How to RUN the app on the phone (the way Jag actually runs it)

The mobile app runs as an **EAS development build installed on the Samsung**. This is not Expo Go, and not a browser. The app name and launcher icon are baked into that native build, so the display name "Lekhio" and the blue L icon only appear after a fresh EAS build (the current app.json name is already "Lekhio" and the icon assets are the Lekhio branding).

**To run the app on the phone (normal day to day):**
```
cd ~/Projects/tradesman/tradebook-app
rsync -a "$HOME/Documents/Claude/Projects/Tradesman/tradebook-app/app/" ./app/
rsync -a "$HOME/Documents/Claude/Projects/Tradesman/tradebook-app/lib/" ./lib/
rsync -a "$HOME/Documents/Claude/Projects/Tradesman/tradebook-app/components/" ./components/
npx expo start --dev-client --clear
```
Then open the installed **Lekhio** app on the Samsung. It connects to this Metro server over the same Wi Fi. If it will not connect over the network, add `--tunnel`.

**To rebuild the native app (when app.json, native modules, name, or icon change, or the installed build is stale):**
```
cd ~/Projects/tradesman/tradebook-app
npx eas-cli build --profile development --platform android
```
EAS builds in the cloud, about ten to twenty minutes, then gives a QR and an install link. On the Samsung, open the Camera, scan the QR, download the APK, install it (allow install from unknown sources). Delete the old build. If it errors with "no development profile", run `npx eas-cli build:configure` once first. The EAS project is `@jagchahil/tradebook-app` (id `a500a134-5f03-4adc-8ec0-1e9d920ee242`). Note: the "install on emulator" prompt at the end fails with `adb ENOENT` because there is no Android emulator on the Mac. That is harmless, ignore it, the build itself is fine.

**Web preview of the app (only when a browser preview is explicitly wanted):** same rsync, then `npx expo start --web --clear`, opens at localhost:8081. Note: authed API calls (bank, AI) are CORS limited in the browser, so the phone dev build is the true test. See section 15 CORS.

---

## 4. How to PUSH changes

### Website (the marketing site AND all API routes)
Copy the changed files from cowork `tradebook-web` into the deploy repo, then commit and push. When a change touches or depends on anything in `lib/`, copy the whole `lib`, not a single file, or the build can go stale.
```
COWORK="$HOME/Documents/Claude/Projects/Tradesman"
WEB="$HOME/Projects/tradesman/tradebook"
cp "$COWORK/tradebook-web/lib/"*.ts "$WEB/lib/"
# then the specific changed files, for example a route or a shared file:
cp "$COWORK/tradebook-web/app/_shared/site.tsx" "$WEB/app/_shared/site.tsx"
cp "$COWORK/tradebook-web/middleware.ts" "$WEB/middleware.ts"
cd "$WEB" && git add -A && git commit -m "..." && git push
```
For a whole folder like `app/_shared`, an `rsync -a "$COWORK/tradebook-web/app/_shared/" "$WEB/app/_shared/"` is cleaner. Vercel auto deploys `main` to production on push. To force a deploy and see the real build error, `cd ~/Projects/tradesman/tradebook && npx vercel --prod`. The CLI prints the actual validation or build failure, which is the best diagnostic.

### Mobile app (version control, not a server deploy)
```
COWORK="$HOME/Documents/Claude/Projects/Tradesman"
APP="$HOME/Projects/tradesman/tradebook-app"
rsync -a "$COWORK/tradebook-app/app/" "$APP/app/"
rsync -a "$COWORK/tradebook-app/lib/" "$APP/lib/"
rsync -a "$COWORK/tradebook-app/components/" "$APP/components/"
cd "$APP" && git add -A && git commit -m "..." && git push
```
Committing does not change what is on the phone. The phone reflects JS changes when Metro reloads (rsync plus `npx expo start --dev-client`), and reflects native or name or icon changes only after a fresh EAS build (section 3).

### Database
Schema changes go into `supabase/schema.sql` in cowork, but Vercel does not apply them. Run the SQL in the Supabase SQL editor (project tradebook-prod). Most statements are idempotent (`create ... if not exists`, `add column if not exists`), and a `notify pgrst, 'reload schema';` line tells PostgREST to pick up new columns immediately.

---

## 5. The complete build

### Web API routes (24, all live), CORS handled centrally
`account/delete`, `account/export` (GDPR self service). `ask` (accountant Q and A, AI gated, fails closed on the durable cap). `bank/callback`, `bank/connect`, `bank/disconnect`, `bank/institutions`, `bank/status` (TrueLayer Open Banking, dormant behind config). `billing/checkout`, `billing/portal`, `billing/status` (Stripe subscriptions). `cron/reminders` (the daily due, nudge and weekly summary jobs, resumable). `draft-invoice` (AI invoice draft, durable per IP and global caps). `health`. `hmrc/callback`, `hmrc/connect`, `hmrc/fraud` (MTD OAuth and device fraud header collection). `lead`, `lead/confirm` (double opt in marketing capture). `onboard`. `pay/[id]` (invoice Stripe checkout, rate limited). `stripe/webhook`. `unsubscribe`. `waitlist`. `whatsapp` (the core webhook, acknowledges Meta immediately and processes in the background).

A single Next.js `middleware.ts` (added this session) adds CORS headers and answers the OPTIONS preflight on every `/api` response. Allowlist is the production origins plus any `localhost` port for the Expo web build. It uses `NextResponse.next()` so it never consumes the webhook body. No route sets its own CORS (the old per route draft-invoice CORS was removed). Native apps ignore CORS entirely.

### Web libraries (20)
`taxengine` (the canonical 2026/27 engine), `taxrules`, `taxguide`, `waintents` (the deterministic WhatsApp intent router, unit tested), `claude` (Anthropic client, model tiering, cost caps, model IDs fixed this session), `whatsapp` (Meta Cloud client), `supabase` (all DB access, RLS aware, service role only), `stripe`, `bankfeed` (TrueLayer client, retry and backoff), `banksync` (resumable keyset paging, bounded concurrency), `hmrc` (the full MTD API surface with the approval gate), `fraud` (fraud header collection and sanitisation), `crypto` (AES-256-GCM at rest, no op until keyed), `email` (Resend), `leadtoken`, `ratelimit`, `siccodes`, `tokens` (the colour palette), `trades`, `transcribe` (Whisper, the isolated non Anthropic AI exception).

### Website public pages
Homepage, product, how-mtd-works, compare, pricing, security and trust, resources (the free tools hub), tax-calculator, cis-calculator, invoice-generator, can-i-claim, file-your-tax-return, register-your-business, privacy, terms, start (onboarding), early-access, invoice/[id] (the public capability URL invoice), for/[trade] (statically generated trade landing pages), hmrc/connected, plus robots, sitemap and llms.txt routes for SEO and AI discoverability. All render top to bottom (the blank homepage bug is fixed, section 15). All five free tools are branded, dark mode aware, and use correct 2026/27 figures.

### Mobile app, the Instagram style redesign (this session)
Five tabs: **Feed** (index), **Money** (tax), a centre **plus** capture, **Invoices**, **You** (profile). Plus the screens: accountant (renamed "Lekhio AI", styled as a chat), add, bank-connect, can-i-claim, cis, diary, file-return, goals, pay-yourself, paywall, profile, proof-of-income, tax-summary, transactions, settings, transaction/[id], invoice/[id], invoice/new, wrapped, achievements, year-summary, and the auth screens index, phone (OTP), subscribe. Shared `Logo` component matches the website. App libraries: `format`, `fraud`, `goal`, `insights`, `review`, `supabase`, `tax` (the Ltd optimiser and its own sole trader engine, kept in exact parity with the web engine, 1,354 point parity test), `taxrules`, `theme`, plus two added this session: `nav` (a crash safe `goBack` that falls back to home when there is no history, so the back control never throws on a refresh or deep link) and `preview` (sample demo data gated on `__DEV__`, shared by the feed and invoices tabs and their detail screens so a tapped demo card opens matching sample detail rather than a dead end). The tab bar adds the device safe area inset so labels never clip under the home indicator.

### Database
Row level security on every table. Core tables: `users` (unique partial index on `phone_number`, one phone one account, server side phone binding trigger), `transactions` (with `cis_deduction`, `transaction_date`, `external_id`, `raw_whatsapp_message_id`, `confirmed`), `monthly_summaries`, `invoices`, `waitlist`, `marketing_leads`, `audit_log`, `bank_connections` (TrueLayer tokens, service role only, encrypted), `hmrc_connections` (OAuth tokens encrypted, plus `fraud_client` jsonb and `fraud_collected_at`), `wa_sessions`, `signups`, `processed_messages` (webhook idempotency), `stripe_events` (Stripe idempotency), `hmrc_approvals` (approval audit trail), `ai_usage` (durable per phone and global spend caps with the atomic increment RPC), plus the `weekly_totals_all` and `user_totals` aggregate RPCs.

### What works today with zero AI credit
Typed money ("spent 40 on diesel", "Dave paid 500"), mileage ("log 24 miles") at 2026/27 rates, CIS ("Dave paid 400, 80 CIS deducted") with gross, net and deduction handled correctly, totals and balance questions, tax estimate, deadlines, invoice capture, tax tips, home office, phone share, STOP and START, delete last and edit last on unconfirmed entries. All deterministic regex in `lib/waintents.ts`, no AI call, so it runs for free and never breaches Meta's five second webhook window.

---

## 6. Tests and verification

One command runs everything now (added the session logged in doc 86): `node test/run-all.mjs` discovers and runs every suite, aggregates pass and fail, prints a summary, and exits non zero on any failure. It skips `test/logic.test.js` with a clear note when the `typescript` module is absent (the partial cowork copy), and runs it in the deploy repo CI where the module exists. As of doc 86 there are roughly 3,346 assertions green across 14 runnable suites, including three added that session: `crypto.test.mjs` (28, AES-256-GCM round trip, legacy plaintext passthrough, wrong key and tamper rejection, key form parsing), `stripe.test.mjs` (25, the idempotency claim mapping and the subscription row builder, extracted with no behaviour change to `lib/stripewebhook.ts`), and `quarterpack.test.mjs` (51, the quarter end pack). The two most security sensitive pieces, Stripe webhook idempotency and token encryption at rest (both were already built and wired, see sections 8 and 11), now carry regression coverage.

All green as of this session. Run from the deploy repo where node_modules exist. The three parallel audit agents this session re ran the pure node suites from the cowork copy: tax exam suite all correct, WhatsApp intents 61 of 61, tax parity app vs web 1,354 of 1,354, bank feed 28 of 28, HMRC 30 of 30, fraud collection 29 of 29. Total 148 of 148 across the runnable suites. One suite (`test/logic.test.js`) needs the `typescript` npm module to transpile `taxguide.ts` in memory, so it only runs in the deploy repo's CI, not the cowork copy. The mobile app typechecks clean under `tsc --noEmit` (the only diagnostics were module resolution artifacts for `@expo/vector-icons` and `expo-linear-gradient` in the isolated workspace, not real errors). The deploy repo runs the full typecheck and `next build` in CI on every push at `.github/workflows/ci.yml`, the real gate the cowork web copy cannot run locally.

---

## 7. This session's deep audit (three agents), findings and what was fixed

Three read only audit agents ran in parallel: backend security plus 20k scale, the mobile app, and the website plus SEO and accessibility.

**Backend: no blocker, no code level high.** The two catastrophic paths (WhatsApp webhook, Stripe webhook) and every HMRC and money write are correct and fail closed. CORS middleware verified correct (allowlist, OPTIONS 204, Vary Origin, no webhook clash, never `*` with credentials). WhatsApp webhook verifies `x-hub-signature-256` over the raw body with a constant time compare, acks in under five seconds, processes in the background, idempotent via `processed_messages`. Stripe webhook verifies signature with a replay window and constant time compare, checks amount and currency against the invoice before booking income, idempotent via `stripe_events`. HMRC writes throw unless approved and record a durable approval row first. Fraud headers sanitised so no CRLF injection. Token encryption AES-256-GCM with fresh IV, no op until keyed. TrueLayer resilience: retry with backoff honouring Retry-After, distinguishes transient from genuine auth failure so a blip never mass expires connections. Resumable scale paths: keyset paging, bounded concurrency, 40 second time budget with hop handover, `MAX_HOPS=100`. N+1 removed via DB side RPCs. AI context capped at 120 rows and 4000 chars, durable caps fail closed. No secret exposed via `NEXT_PUBLIC_`. Remaining backend items, all hardening not blockers: `listAllNudgePrefs` uses a large limit that is fine at current volume but should be keyset paged before a large fraction of 20k users toggle a preference; set a dedicated `LEAD_TOKEN_SECRET` so the lead HMAC does not reuse the service role key; the in memory burst limiter does not hold across serverless instances (the durable daily caps do, they are the real backstop, move to Upstash before high volume); `schema.sql` defines `bank_connections` twice (harmless, only the first `if not exists` runs, the real columns are added by explicit `add column` after).

**Mobile app: no blocker, no high.** Fixed this session: `what-if.tsx` profit prefill now filters confirmed only (it was the sole confirmed only miss); `phone.tsx` back control now uses the crash safe `goBack`. Confirmed correct: no secrets, only `EXPO_PUBLIC_*`, anon fallback double gated to `__DEV__`, PREVIEW gated on `__DEV__` (can never ship sample data), tax parity, CIS handled as tax paid not an expense, confirmed only totals everywhere else, crash safe back everywhere, preview aware detail screens, safe area tab bar, paywall fails open, the AI is "Lekhio AI" never a human, no em or en dash or U+2212 anywhere in the app. Remaining, cosmetic: eight unused `router` imports (do not break the build since `noUnusedLocals` is off), three orphan routes reachable only by deep link (`goals`, `achievements`, `year-summary`), and `add.tsx` "the HMRC approved rate" wording which is factually correct but could read "the HMRC rate."

**Website: no compliance blocker.** Fixed this session: the U+2212 minus signs in `product` and `file-your-tax-return` are now ASCII hyphens; the homepage testimonials now carry an "Illustrative examples, based on real trades" label; the compare page absolute superlatives ("no other app on the market", "the only one in WhatsApp") are softened to provable wording; `robots.ts` now blocks all indexing while on the temporary Vercel domain (until `NEXT_PUBLIC_APP_URL` is set to the real domain), so Google never indexes the temp host; the `SITE` constant and the `llms.txt` site line are now driven by `NEXT_PUBLIC_APP_URL`, so all JSON-LD and the AI discovery file auto correct the moment the domain is set; the invoice generator seeds its dates in a client effect after mount, removing the last hydration mismatch risk (the same class as the footer year bug fixed earlier). Confirmed correct: the reveal visibility fix is in place site wide (`.reveal{opacity:1}` by default plus a noscript fallback), all 2026/27 tax figures correct in every calculator, "we prepare you approve" holds on every page, no implied HMRC endorsement, ICO wording is "completing our registration" not "registered", per page metadata and JSON-LD present, global keyboard focus rings via `A11Y_CSS`, responsive breakpoints on every section, no dead internal links, footer year is static. Remaining, enhancement not blocker: several form inputs across signup and the calculators have visible labels but not `htmlFor`/`id` association or `aria-label`; the product page tab switchers and the compare table tick marks are not keyboard or screen reader labelled; the `tax-calculator` reimplements the tax maths by hand rather than importing the engine (correct today, could drift at the next Budget, the CIS calculator correctly imports the engine); a couple of legal copy consistency points (one footer says "a Lekhio Ltd company" while others say only "Lekhio", and the terms scope "sole trader" while onboarding also allows companies), both for the founder to reconcile when the company is incorporated.

Nothing from the audits is launch blocking. Every fix listed here was pushed and is live: the website fixes deployed green (deployment `b07226a`, after one build failure that was found and fixed, see section 15), and the mobile fixes are JS so they reload over Metro with no rebuild. The live site renders top to bottom with zero console errors.

---

## 8. Security posture, after five audits, and the honest anonymous auth state

The two catastrophic paths are correct (section 7). The site serves a full set of security headers site wide through `next.config.mjs`: HSTS with preload, X-Frame-Options DENY, X-Content-Type-Options nosniff, a strict Referrer-Policy, a locked Permissions-Policy, and a content security policy. Invoice and pay capability URLs send `no-referrer` and `noindex`. The bank OAuth callback sends `no-referrer`. Bank and HMRC OAuth tokens are encrypted at rest (active once `BANK_TOKEN_KEY` is set). The service role key is server only. PostgREST filters are percent encoded. PII and message content are kept out of logs. RLS is on every table, and service role only tables (`bank_connections`, `hmrc_connections`) have RLS with no policies.

The honest anonymous sign in state, corrected this session. This is the single biggest pre launch risk: an anonymous session with a self typed phone is an account takeover vector. Phone OTP is fully built but it is NOT yet the live login. The app still falls back to `signInAnonymously()`, so every real session today is anonymous. Because of that, `REJECT_ANON_USERS=true` on the backend rejects the app's own users, returning 401 on every authed route (this was found happening this session and the flag was set to `false`). So this risk is NOT closed, it is deferred to launch. The proper close, in order: switch the app login to OTP (turn on `EXPO_PUBLIC_OTP_ENABLED` and confirm the Twilio Verify SMS path), disable anonymous sign in at the Supabase project, then set `REJECT_ANON_USERS=true`. The app already hard gates the anonymous fallback to `__DEV__`, but the deployed build's login path still depends on this sequence.

Full audit history: docs 50, 58, 64, 78, 79, and this session's three agent audit in section 7.

---

## 9. Tax engine

Canonical engine `tradebook-web/lib/taxengine.ts`. Every 2026/27 figure verified against GOV.UK: personal allowance 12,570 with taper, the income tax bands, Class 2 (7,105 small profits threshold, 3.65 a week), Class 4 (6 percent and 2 percent), dividends (500 allowance, 10.75 / 35.75 / 39.35 percent), mileage (55p car and van for the first 10,000 miles then 25p, this is the correct 2026/27 uplift, do not "fix" it to 45p), the 1,000 trading allowance, Annual Investment Allowance 1m, VAT thresholds 90k and 88k, the MTD thresholds (50k now, 30k from 2027, 20k from 2028), CIS at 20 / 30 / 0 percent applied to labour only never materials, capital gains (3,000 exempt, 18 and 24 percent), corporation tax (19 and 25 percent with marginal relief 3/200), employer NI (15 percent over 5,000), writing down allowance main pool 14 percent. The app's `lib/tax.ts` limited company optimiser is in exact parity (1,354 point test). Money screens on both app and website derive every figure from the engine. Memory: tax engine.

---

## 10. HMRC Making Tax Digital, full status

Filing code complete and correct against HMRC's current live API. Submissions use the cumulative period summary at `vnd.hmrc.5.0+json`. Obligations v3.0. Year end Individual Calculations v8.0. BSAS v7.0. Individual Losses v6.0. Full fraud prevention header set for the WEB_APP_VIA_SERVER connection method. Proven end to end in the HMRC sandbox on 1 and 2 July via `scripts/hmrc-sandbox-demo.mjs` exercising the real `lib/hmrc.ts`: create test user, OAuth connect, obligations, cumulative period summary (204), year end calculation (202) and final declaration (204), BSAS (200), losses create and claim (201), and the Test Fraud Prevention Headers validator returned VALID_HEADERS. The approval gate held on every write. This is the recognition evidence.

Device side fraud header collection is built: the app collects device only values (persisted device id, user agent, screen and window geometry, timezone) and forwards them to `/api/hmrc/fraud`, which sanitises them, stores the snapshot on the `hmrc_connections` row, and reports which headers are missing. At submit time the server merges that with the request derived public IP and timestamp. Two values are omitted by design (client public port, and multi factor, since OTP is at login not per submission). The vendor public IP will be detected at runtime when the submit route is built (Vercel egress IPs are dynamic).

What is left, and its gate. Recognition is an application on the HMRC Developer Hub with the sandbox evidence attached, roughly ten working days. The answer pack is drafted in doc 72. Jag's decision (2 July): apply as **Lekhio Ltd** after incorporating, using the company registration number as the registration evidence, so the production application is trigger gated on Companies House incorporation. Confirm during the application whether the origin should be WEB_APP_VIA_SERVER or MOBILE_APP_DIRECT. Re verify every endpoint version against the live HMRC OpenAPI specs before submitting. Full checklist doc 66, answer pack doc 72.

---

## 11. Bank feeds, billing, and AI

**Bank feeds (TrueLayer).** Built and proven in the TrueLayer sandbox, and verified working from the app this session: with `BANK_CLIENT_ID`, `BANK_CLIENT_SECRET` and `BANK_SANDBOX` set (they are set in Vercel), `/api/bank/status` returns 200, the Settings bank card flips from the coming soon teaser to Connect, and the connect screen loads the TrueLayer sandbox bank picker in test mode. Bank transactions land in `transactions` as unconfirmed, with capture dedupe so a photographed receipt and its card line do not double count, and the approval gate applies. Tokens are server side only, encrypted, service role only. The live gate is unchanged: ICO registration, a privacy policy update naming TrueLayer and the AIS basis, and the TrueLayer production commercial agreement, then swap `BANK_SANDBOX` off and add production keys. One historical fix: the prod `bank_connections` table was missing an `updated_at` column so every update was rejected, fixed on prod and in the repo. Plan doc 77.

**Billing (Stripe).** Subscription billing built and deployed. Web checkout, a 30 day free trial with no card, a webhook that stores the subscription keyed to the phone with idempotency. Pricing consistent everywhere (launch price, decided 7 July, docs 87 and 88): 12.99 a month, 129 a year, a 14 day trial with no card, founder tier retired (founder equals standard). Plan is to raise to 19.99 and 199 once live HMRC filing ships, with existing subscribers kept at 12.99 for life because Stripe locks the amount at signup. Switches on with the live Stripe key and webhook secret. The app paywall is built and off by default (`EXPO_PUBLIC_PAYWALL_ENABLED`), fails open so a glitch never locks out a payer. Pricing decision (doc 77): no general free tier, a money back guarantee on the pricing page instead (drafted, not shipped), and a free CIS refund tracker tier held in reserve as a wedge if conversion disappoints.

**AI (Anthropic plus Whisper).** All AI features (receipt photo parsing via Claude Vision, voice note transcription via Whisper, the "Lekhio AI" accountant chat, free text expense parsing, AI invoice drafting) are built and gated. This session fixed a real defect: `lib/claude.ts` used model IDs that no longer exist, so every Anthropic call failed with a 502. They are now the current valid strings, `claude-sonnet-5` for the accountant and `claude-haiku-4-5-20251001` for extraction and drafting. With that fixed and CORS and anon resolved, the ONLY remaining AI blocker is Anthropic account credit: the live Vercel logs show the exact response is "invalid_request_error, your credit balance is too low." Add credit at console.anthropic.com Plans and Billing, set a hard monthly spend cap and a budget alert first (the durable per phone and global caps already guard runaway loops), and the whole AI layer comes alive with no further code change. Whisper needs `OPENAI_API_KEY` set with a little credit. Mileage, CIS and typed money already work with zero AI.

---

## 12. The critical path to paying customers

Everything blocking paying customers is external, not code. In order:
1. **Add Anthropic API credit** (unblocks all AI: receipt photos, voice notes, the accountant chat, AI invoice drafting). Set a spend cap first. This is the cheapest and fastest to unblock and the most visible.
2. **Incorporate Lekhio Ltd** (unblocks HMRC recognition and Meta business verification). About 50 pounds, usually same day.
3. **Register with the ICO** (required before real users' data, and before live bank feeds). About 52 a year. Do not claim "registered" until done.
4. **Point the real domain.** Buy lekhio.app, add it in Vercel Settings Domains, set `NEXT_PUBLIC_APP_URL=https://lekhio.app`. This auto fixes robots, sitemap, the JSON-LD SITE, llms.txt, and canonicals (all made env driven this session). Then submit the sitemap to Google Search Console on the real domain.
5. **Switch the app to OTP for real users:** turn on OTP as the live login, disable anonymous sign in in Supabase, then set `REJECT_ANON_USERS=true`. Also set `BANK_TOKEN_KEY` (token encryption) and confirm `CRON_SECRET` is set.
5b. **Supabase advisors, final hardening.** The 7 July sweep is applied on prod (`supabase/advisor_fixes_2026-07-07.sql`, also baked into `schema.sql`): all RLS policies wrap `auth.uid()` in `(select auth.uid())` for per query evaluation, the two server only SECURITY DEFINER functions (`increment_ai_usage`, `enforce_phone_binding`) have execute revoked from anon and authenticated, `agent_user_aggregates` has a pinned `search_path`, and the three foreign keys are indexed. Result: performance 25 warnings down to 1, security 6 down to 1, 0 errors on both. Two optional items remain for a fully clean board, both benign and safe to do at launch: **(a)** enable **Leaked Password Protection** under Authentication, Sign In or Providers (the one remaining security warning); **(b)** drop the redundant **duplicate index on `public.users`** (the one remaining performance warning, a pre existing spare index, keep the unique one). Re run the linter after each to confirm it clears.
6. **Submit the HMRC production application** as Lekhio Ltd with the doc 72 pack, wait out the review.
7. **Fund the platform:** Vercel Pro (before commercial launch), Supabase Pro (before real users), Stripe live keys and webhook plus the Lekhio brand on Checkout, the Apple (79 a year) and Google (25 once) developer accounts, then build with EAS and submit to the stores early because review queues are slow.
8. **Bank feeds live** once the ICO, the privacy policy update, and the TrueLayer production agreement are done: swap `BANK_SANDBOX` off, add production keys.
9. **Flip the paywall** (`EXPO_PUBLIC_PAYWALL_ENABLED=true`) and rebuild at soft launch. Soft launch to the 15 to 25 friendly tradespeople in the doc 77 cohort.

The software is ready to move the moment these clear.

---

## 13. Built but dormant, and everything parked, with the trigger

AI features: gated until `ANTHROPIC_API_KEY` has credit and `OPENAI_API_KEY` is set. HMRC filing: sandbox by default, switches live only after recognition and `HMRC_BASE_URL` set to the live host. Bank feeds: dormant behind config, live gate is ICO plus privacy update plus TrueLayer production agreement. Stripe live: test mode works, swap live keys and webhook and add the brand to Checkout. Paywall: off, flip `EXPO_PUBLIC_PAYWALL_ENABLED=true` and rebuild. Review asks: dormant until `EXPO_PUBLIC_REVIEW_URL` set (a Trustpilot page). Cloudflare Turnstile: inert until `TURNSTILE_SECRET` set (CSP already allowlists the host). The money back guarantee copy: drafted (doc 77 appendix), not shipped, gated on the pricing decision locked and the company existing. The free CIS refund tracker tier: held in reserve, deploy only if trial to paid conversion falls under 35 percent or acquisition cost stays above one month of revenue. Google Search Console and sitemap submission: parked until lekhio.app is live. HMRC production recognition: parked on incorporation. ICO registration: parked until real users. Company incorporation: parked on Jag's decision. Meta business verification: parked on incorporation. App store submission: parked on the paid developer accounts. Marketing engine (Phase 2) and Connect (Phase 3): not started by design. Property income for MTD: out of scope until the customer widens beyond trades sole traders. Structural scale follow ups before AI at high volume: move the burst limiter to Upstash, set `LEAD_TOKEN_SECRET`, keyset page the nudge prefs fetch, pre compute rolling summaries. Full reasons and triggers: doc 80 section 14 and doc 77.

---

## 14. Aesthetics without function, honest about placeholders

None are broken, they are labelled placeholders or gated features. "File straight to HMRC" shows a SOON badge and a coming soon alert, not a working filing button. The Lekhio AI chat returns a "not switched on" state until AI credit is added (currently the credit balance error). Receipt photo and voice capture accept the message but the photo to data and audio to text steps are AI gated. "Automatic mileage tracking, coming soon" on the Add screen is a label, manual mileage is real. Homepage testimonials are illustrative composites, now labelled "Illustrative examples, based on real trades", and must never be presented as real reviews in ads. GPS auto mileage and an accountant portal are not built (real roadmap items). PREVIEW sample data in the app is real looking demo content, gated on `__DEV__`, so it fills the app for a demo but can never reach a production user.

---

## 15. Debugging playbook, every expensive lesson

- **"Pushed but not live"** usually means a blocked or failed Vercel deploy, not the code. Diagnose with `npx vercel --prod` from the deploy repo. A Hobby incompatible cron once silently blocked every deploy for six hours. There must be exactly one Next config file (`.mjs` wins over `.ts`).
- **"Row exists but the app shows nothing"** is a chain: is the app on the right account (anonymous sessions were the culprit), is the RLS select policy applied in prod, does the select reference a column that exists in prod (a missing `cis_deduction` once broke all reads, a missing `updated_at` broke all bank updates). The service role key being set to the anon key returns HTTP 200 with zero rows (RLS applies) and cost hours once.
- **API features that work on the phone but fail in the Expo web build are almost always CORS, not config.** The browser blocks the cross origin call and the app reads the thrown error as "off" or "unavailable". The fix is CORS headers on the API (now the global `middleware.ts`). Native apps are unaffected. This is why the bank card showed SOON and the chat failed only in the browser.
- **A 401 on every authed route while the token is valid and unexpired** means the backend is rejecting the session type, not the token. `REJECT_ANON_USERS=true` while the app signs in anonymously does exactly this. To inspect a Supabase session fast, decode the JWT payload in the browser console with `atob(token.split('.')[1])` and read `is_anonymous`, `iss` and `exp`.
- **A 502 from an AI route** is the route swallowing an Anthropic error to null. Read the real cause in the Vercel Logs tab by clicking the 502 row, where a bad model ID or "credit balance too low" shows plainly. Two causes hit us this session: dead model IDs, then no account credit.
- **A blank page below the fold on the website** was reveal sections stuck at `opacity:0` because a one time scroll reveal script did not re run on a client side navigation. The fix is to make reveal content visible by default (`.reveal{opacity:1}`), so content never depends on the script. Also watch for React hydration mismatches (error 418) from client varying values rendered during SSR (a `new Date()`), which can cause an intermittent blank flash. Fixed the footer year and the invoice generator dates this session.
- **The phone app runs an EAS development build, not Expo Go and not a browser.** The app name and icon are baked at build time, so a rename or new icon needs a fresh `eas build`, not just Metro. See section 3.
- **A web edit that passes a syntax or babel parse can still fail the real `next build`, because babel does not typecheck.** This session a `React.useEffect(...)` was added to a file that imports React only for its type (`React.CSSProperties`, with no runtime `React` value import, only `{ useMemo, useState }`). It passed a babel parse but failed the Vercel typecheck, and two Vercel deploys went red before it was caught. The lesson: for any web change the real gate is the deploy repo's CI or a local `next build`, not a parse. On any red Vercel deploy, open the failed deployment and read its build log for the exact error rather than guessing. Prefer importing a hook directly (`import { useEffect } from 'react'`) over `React.useEffect` unless React is imported as a value. Also, a git commit in the deploy repo can sweep in stray `.fuse_hidden*` files that the filesystem leaves when a file is replaced while open; they are now gitignored, remove any that appear.
- **esbuild syntax checks but does not typecheck**, so reason about types for web changes; the app repo runs real `tsc`. `schema.sql` is not auto applied, run it in the SQL editor. Keep `toUkE164` (app) and `normalizeUkPhone` (web) byte identical or a user's WhatsApp identity splits from their app account.

---

## 16. Environment variables, complete

Vercel, web. `ANTHROPIC_API_KEY` (set, but the account needs credit), `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (the real service role secret, not the anon key), `OPENAI_API_KEY` (voice, not yet set), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY` and `EMAIL_FROM` (optional invoicing), `NEXT_PUBLIC_APP_URL` (set this to the real domain when it lands, it auto fixes robots, sitemap, JSON-LD, llms.txt, canonicals), `HMRC_STATE_SECRET` (set), `HMRC_CLIENT_SECRET` (set), `HMRC_CLIENT_ID`, `HMRC_REDIRECT_URI`, `HMRC_BASE_URL` (leave unset for sandbox), `CRON_SECRET`, `BANK_TOKEN_KEY` (activates token encryption), `REJECT_ANON_USERS` (set to `false`, MUST stay false while the app signs in anonymously or every authed call 401s, flip to true only once OTP is the live login and anon is off in Supabase), the bank set `BANK_CLIENT_ID`, `BANK_CLIENT_SECRET`, `BANK_SANDBOX` (all set, sandbox verified). Optional caps: `DRAFT_GLOBAL_DAILY`, `DRAFT_IP_DAILY`, `ASK_DAILY_LIMIT`, `ASK_GLOBAL_DAILY`. To set later: `LEAD_TOKEN_SECRET`, `TURNSTILE_SECRET`, `HMRC_VENDOR_PUBLIC_IP` (or runtime detection), `HMRC_VENDOR_VERSION`.

App, Expo (`EXPO_PUBLIC_*`, safe to expose): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_OTP_ENABLED` (must be on and confirmed working for real user builds), `EXPO_PUBLIC_API_URL` (defaults to the Vercel URL), `EXPO_PUBLIC_PAYWALL_ENABLED` (off until launch), `EXPO_PUBLIC_REVIEW_URL` (set when the Trustpilot page exists), `EXPO_PUBLIC_PREVIEW` (leave unset, PREVIEW is `__DEV__` gated so production is always clean; set to `false` to turn demo data off in dev).

Never paste secrets to the assistant. Enter them straight into Vercel or Supabase.

---

## 17. Costs to launch and run

Near zero fixed cost until revenue. One off and annual founder items: company formation 100 one off direct at Companies House from 1 Feb 2026, or 14.99 through Tide which also opens the free business account (0 as a sole trader), ICO 52 a year, domain about 10 to 40 a year, Apple Developer about 79 a year, Google Play 25 once, business bank account 0 (Tide, Mettle, Starling). Recurring platform: Vercel Pro about 16 a month (move off Hobby before a commercial launch), Supabase Pro about 20 a month (before real users, for backups and no auto pause), Resend free to 3,000 a month, Expo EAS free to start. Per use and tiny: Anthropic roughly 20p to 60p per heavy user a month, Whisper pennies, Twilio Verify about 7 to 10p per login, WhatsApp Cloud API about 1 to 4p per message, TrueLayer sandbox free (production is a commercial deal), Stripe 1.5 percent plus 20p per UK card charge. Floor to run a compliant commercial launch is roughly 36 a month plus the annual founder items. Two paying customers cover the fixed monthly cost. Full breakdown doc 77.

---

## 18. Document index and memory

Deeper detail lives in: 01 vision, 02 product, 05 compliance, 06 stack, 08 progress, 09 audit, 10 API costs, 11 and 37 and 46 competitor work, 35 and 36 file your own return buildspec, 50 and 58 and 64 earlier security audits, 65 the previous handover, 66 HMRC recognition checklist and the fraud update, 67 SaaS versus GaaS, 68 GTM, 69 retention, 70 outbound, 71 AI discoverability, 72 the HMRC production answer pack, 73 to 75 the Fable audit and changelog, 76 app store listing, 77 the pre launch game plan (bank feeds, pricing, reviews, full cost table), 78 the scale and security audit, 79 the four lens audit and competitor benchmark, 80 the prior master (this doc supersedes it), 82 the feature expansion plan (NI, student loan, landlords, the Agentic Accountant, with the FCA line and the April 2027 property rates), 83 the 5 July session log (Phases A and B shipped). 90 the deployment and ops playbook.

The Cowork memory index carries the same facts in short form for fast recall across chats, including the environment map (website vs app vs localhost), how to run the app on the phone (EAS dev build), the repo sync mapping, the CORS middleware, the AI model IDs fix, and every audit. Read the memory first in a new chat, then this doc.

This doc, 81, is the current master. When something changes, update it.

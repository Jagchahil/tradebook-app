# 85: Session log, 6 July 2026 evening. The complete system run and the onboarding rebuild

> Doc 81 remains the master handover, doc 82 the expansion plan (updated in place all day), doc 83 the log for 5 July through 6 July afternoon. This covers the evening: the zero credit "build it all" run and the onboarding rebuild across every touchpoint. Read 81 first in a new chat, then 82, then 83, then this.

---

## 1. The zero credit run ("build it all and more, we need a complete system")

Everything below is deterministic, costs no AI credit, and shipped the same evening.

**The invoice chaser** (doc 82 s5e item 3, the strategic one). Overdue invoices, 14 days past issue or any days past a due date, produce Rakha signals: a friendly nudge card at 14 days, a firmer ping at 30, at most two per walk. The chase message is drafted in the user's own voice INSIDE the card, ready to forward, with the public invoice link. On WhatsApp, "chase invoice 12" or "who owes me" returns the draft instantly. The approval gate is the product: Rakha drafts, the user sends, we never message a customer. Jag's verdict on testing: "the who owes me is perfect". A regex trap was caught by the tests: "inv" backtracked inside the word "invoice" and captured "oice" as an invoice number, fixed by requiring a digit in the token.

**Show the maths** (s5e item 5). Every Rakha card in the app now expands to "How I worked this out": the numbers payload rendered as labelled figures with the line "straight from your confirmed entries and the published HMRC figures, no guesses". Trust as a feature.

**The expense completeness check.** The aggregates RPC (v5) now returns the distinct trade expense categories for the tax year. After four months of data, a trader with real expenses but nothing logged for two or more of phone, insurance, mileage or fuel, and tools gets one card a year naming what is missing, with an honest escape hatch ("if you genuinely have none, ignore this"). Employees with salaries are not nagged.

**Sole trader vs limited, the free tool.** `lib/ltdengine.ts` is the web canonical of the app's limited company maths (corporation tax with marginal relief, the 2026/27 dividend rates, employer NI, the three director salary points), guarded by `test/ltd-parity.test.mjs` (160 points against the app engine). `/sole-trader-vs-limited` gives the honest answer: winner, the gap in pounds, and the accountancy cost reality check that most comparisons skip. A "too close to call" band under £50 says so.

**The landlord landing page.** `/for-landlords`: the three landlord personas, the April 2027 urgency block, the what-Lekhio-does grid, cross links to the three property adjacent tools. Wired into the footer trade column, sitemap and llms.txt.

**Small but real:** undated goals now get their monthly `goal_progress` pulse (with an invitation to add a date for weekly pacing); settings gained an accountant CSV export (confirmed tax year entries: date, type, stream, who, category, amount, CIS).

## 2. The onboarding rebuild ("it feels childish, not informative, we need it way better at all touch points")

Rebuilt as ONE journey across three surfaces, each handing to the next.

**The website.** `/start` grew a sixth step, "Anything alongside the work?": a multi select (PAYE job, rental property, student loan) where each option teaches why it changes the tax picture. The answers travel in the onboarding payload. The finish screen now lays out the three step path (download the app, take the tour, finish setup on WhatsApp) with a green button that opens the WhatsApp setup directly.

**The app.** `app/tour.tsx`: a five slide swipeable tour on first launch (capture, the approval gate, the streams, the two helpers, the two minute setup), gated on an AsyncStorage flag, skippable, re reachable from the Feed welcome. The final slide's green button opens WhatsApp with "setup" already typed. The Feed's first run welcome was rewritten to match.

**WhatsApp.** The deep setup, v2: six steps, adult copy, every question explaining what it sharpens. How the money comes in (self employed, job plus own work, mostly property), CIS (teaching the "Dave paid 500, they held 100 CIS" habit), student loan with Plan 2, Plan 5 and free text for the rest, PAYE salary via "salary 32000", property (Section 24 and April 2027 explained), and a goal for Rakha. Stateless throughout: buttons carry the next step, free text setters already existed as intents, nothing to lose. The welcome flow's middle button is now "Set me up right".

**The animation.** The whole journey was designed as a four stage auto playing storyboard, presented in chat, and then, at Jag's "drop it straight in", rebuilt site native as `app/product/OnboardingShow.tsx` and shipped on the product page under "From first click to running itself." Every frame is a real screen, no fiction.

## 3. Where the system stands

21 Rakha signals across trade, property, goals, invoices and habits. Ten free web tools plus two landing surfaces (trades pages, landlords). Three income streams handled the way HMRC taxes them, with parity guarded engines web and app (tax 1,354, property 1,008, ltd 160, NI and student loan 256). WhatsApp captures, answers, chases, onboards and configures. The app tours, approves, exports and shows its working. All deterministic, all on zero AI credit, roughly 1,900 test assertions green.

**Deploys this evening:** web d143ac6 (chaser, maths, completeness, RPC v5 applied), d93f68d (onboarding bundle: ltd tool, landing page, /start, deep setup, tour handoff), plus the OnboardingShow drop. Mobile 96cde10 (show the maths), 33a971b (the tour). Prod SQL: RPC v5 with categories.

## 4. What remains, honestly

**Gated, not buildable tonight:** C4 (Meta template approval plus a WhatsApp payment method), native push and paywall (one EAS rebuild, batched), Phase D Khoji (Anthropic credit plus a Mac mini session, the mini runs the personal bot so Phase D isolates itself), AI features themselves (credit).

**Buildable next, zero credit, in rough value order:**
1. Doc 81 master handover refresh (superseded by the 82/83/85 chain but its snapshot sections have drifted).
2. ~~Hardening backlog from the scale audit: Stripe webhook idempotency, bank token encryption at rest.~~ DONE (next session, doc 86). Both mechanisms were already built and wired (idempotency via stripe_events plus claimStripeEvent, token encryption via lib/crypto.ts through supabase.ts and banksync.ts); the real gap was zero regression coverage on the two most security sensitive pieces. Now locked: test/crypto.test.mjs (28) and, after extracting the pure logic to lib/stripewebhook.ts with no behaviour change, test/stripe.test.mjs (25).
3. ~~A single test runner (one command runs all suites) for the playbook.~~ DONE (doc 86). test/run-all.mjs runs every suite, aggregates pass and fail, prints a summary, exits non zero on any failure, and skips logic.test.js with a clear note when the typescript module is absent (the cowork copy). One command: node test/run-all.mjs.
4. ~~The quarter end pack: the quarterly summary as a shareable document for accountants.~~ DONE (doc 86). lib/quarterpack.ts (pure, 51 tests): tax year quarter maths, the pack builder over confirmed entries (trade and property streams, expenses by category, CIS suffered, year to date running tax estimate from the canonical engine, MTD gross test), and a print ready branded HTML document (Save as PDF, the invoice page mechanism, no server PDF library). Served at GET /api/quarter-pack (own token, own account, confirmed only, never a submission to HMRC).
5. Year end countdown mode (seasonal, fires from late February, can sit dormant).
6. The review and referral engine from doc 77's growth plan.

---

## 5. The full board (the close out state, 6 July 2026, late)

### Done and live in production

**Capture and books.** WhatsApp receipt photos (Claude Vision, credit gated), voice notes (Whisper), deterministic text logging (expenses, income with CIS, mileage, rent), the app add screen with the rental toggle, bank feed plumbing (dormant until GoCardless and ICO), invoices with public share links and email. Everything unconfirmed until the user's yes; confirmed only totals everywhere.

**Engines, all parity guarded.** taxengine (2026/27, 71 exam cases plus 1,354 parity), nistudentloan (NI plus all loan plans, SA share, 256 parity), propertyengine (tax year keyed, April 2027 schedule, S24 cap, allowance election, rent a room, 52 exams plus 1,008 parity, HMRC annex to the pound), ltdengine (corporation tax, dividends, director salary points, 160 parity), waintents (137 tests), agent (21 signals, 167 tests).

**Rakha, the agent.** Nightly resumable walk at 07:00 kicked by the due job. 21 deterministic signals: VAT (rent excluded), MTD (combined test plus the combined trap), higher rate, taper, Class 2 pension year, student loan cross, payments on account, CIS milestones, quiet expenses, AIA timing, quarter unconfirmed, four goal signals, Monday brief, January rehearsal, S24 exposure, property rates 2027, invoice chaser (drafts in the user's voice), expense completeness. Noise caps 1 a day, 3 a week, demotion not dropping. Surfaces: chat cards with show the maths, Feed banner, Money tab top signal, WhatsApp templates (gated), push (server ready, dormant).

**The two helpers.** Puchio (answers, credit gated) and Rakha (watches, live), explained in app settings and on the product page. Khoji reserved for Phase D.

**Onboarding, one journey.** Web /start six steps including the streams question, app five slide tour, WhatsApp six step deep setup, all handing to each other, animated on the product page.

**Goals.** Server side, WhatsApp settable, Feed widget with live progress, goal aware tax signals, undated goals pulse monthly.

**Web.** Ten free tools (tax, CIS, invoice, can I claim, NI, student loan, landlord, rent a room, sole trader vs limited, file your return guide) plus register your business, trades pages, the landlords landing page, product with the journey animation, pricing, security, sitemap and llms.txt current. Stripe billing built (switches on with keys). HMRC sandbox round trip passed (production credentials pending founder setup).

**Exports and trust.** Accountant CSV, the quarter end pack (a branded print to PDF quarterly summary at /api/quarter-pack, confirmed only, streams split, running tax estimate, MTD line, never a submission), full data download, GDPR delete, proof of income, the approval gate everywhere, no WhatsApp content in logs.

**Tests.** One command, node test/run-all.mjs, runs every suite (engines, parity, agent, waintents, plus the new crypto, stripe and quarterpack suites), aggregates the result, and exits non zero on any failure. The two most security sensitive pieces, Stripe webhook idempotency and token encryption at rest, now carry regression coverage. Roughly 3,346 assertions green across 14 runnable suites (logic.test.js runs in the deploy CI, which has the typescript module).

### To do, each with its trigger

**Config, Jag, minutes each:** WhatsApp payment method (unlocks C4 with template approval → set AGENT_TEMPLATES_APPROVED=true, first ping to Jag, confirm STOP). Check the three Meta templates for Active. UptimeRobot already live.

**One EAS rebuild, batched:** expo-notifications (permission after first Rakha card, token write, deep link, badge, diary toggle: spec in doc 82 s5c) plus the paywall flip.

**Credit gated:** Puchio answers, receipt vision, voice transcription at volume; then Phase D Khoji on the Mac mini (isolated from the personal bot, driven remotely, doc 82 s5).

**Zero credit build backlog:** the six item list at the top of this section.

**Pattern gated (need usage history):** rent gap, pattern nudges, allowance election nudge, incorporation crossover alert.

**Launch gates unchanged (doc 81 s12):** Anthropic credit, incorporation, ICO registration, lekhio.app domain (swap checklist in doc 82 s5f), OTP switchover plus REJECT_ANON_USERS, HMRC production recognition, platform funding, bank feeds, paywall.

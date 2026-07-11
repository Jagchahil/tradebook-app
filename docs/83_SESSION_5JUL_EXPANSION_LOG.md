# 83: Session log, 5 July 2026. Phases A and B of the feature expansion, shipped

> What this session built, verified and deployed, and exactly where the build now stands. Doc 81 remains the master handover (updated this session where facts changed). Doc 82 is the feature expansion plan this session executed the first two phases of. Read 81 first in a new chat, then 82 for the roadmap, then this for what is newest.

---

## 1. What was decided

The five feature expansion, planned in doc 82 and signed off by Jag with build order **A, B, C, D, E**: (A) free NI checker and student loan checker on the website, (B) both rebuilt in depth in the app on real data, (C) the Agentic Accountant v1, deterministic signals, no AI cost, (D) agent layers 2 and 3, the Mac mini knowledge watcher plus AI drafted suggestions, (E) the landlord module. Two lines were locked: the agent v1 stays on the guidance side of the FCA line (no named credit, car or finance product recommendations, no affiliate links, parked with an FCA trigger), and everything stays inside the prepare and approve doctrine.

Key tax facts verified for the plan (5 July 2026): NI unchanged for 2026/27 (Class 1 8 and 2 percent, Class 4 6 and 2 percent, Class 2 voluntary at 3.65 a week, small profits threshold 7,105, LEL 6,500). Student loan thresholds 2026/27: Plan 1 26,900, Plan 2 29,385 (frozen to April 2030), Plan 4 33,795, Plan 5 25,000 (frozen by design), postgraduate 21,000; 9 percent, postgrad 6 percent, a plan loan and postgrad repay simultaneously. Landlords, for Phase E: the November 2025 Budget gives property income its own rates from April 2027 (22, 42, 47 percent), raises the Section 24 credit to 22 percent, and changes personal allowance ordering, so the landlord engine must be tax year aware from day one. MTD's threshold is gross trade plus property combined.

## 2. What shipped, Phase A (website)

**One engine, no hand maths.** `tradebook-web/lib/nistudentloan.ts` is the canonical NI and student loan module (Class 1, the combined `niPosition`, State Pension qualifying logic, the voluntary Class 2 decision, `STUDENT_PLANS`, `studentLoanRepayment`, `validPlanSelection`, and later `studentLoanForSA`). It imports Class 4 and Class 2 from `taxengine.ts`, so there is one source of NI numbers. The audit lesson from the old tax-calculator (hand rolled maths drifts) was applied from the start.

**Two free tools, live.** `/ni-checker` and `/student-loan-checker`, both on the existing free tool pattern (SharedHead, SiteNav, SiteFooter, dark mode, JSON-LD FAQ schema, LeadCapture after a result, labels properly associated with inputs). Wired into the resources hub, the nav dropdown and panel, the footer, `sitemap.ts` and `llms.txt`. Verified live in Chrome with correct maths (Class 1 £1,394 on a £30,000 salary; Plan 2 £415 at £34,000 with the self employed January warning).

**A site wide bug found and fixed during verification.** Every page threw React error 418 for dark mode visitors: the pre hydration theme script sets the toggle icon to the sun before React hydrates, so SSR text (moon) mismatched. Fixed with `suppressHydrationWarning` on the toggle button in `app/_shared/site.tsx`. This was pre existing (the 3 July audit ran in light mode and saw zero errors) and explains the "intermittent blank flash" class in the doc 81 playbook.

## 3. What shipped, Phase B (app, WhatsApp, database)

**Database.** Three nullable `users` columns, applied to prod and in `supabase/schema.sql`: `student_loan_plan` (checked to plan1/2/4/5), `student_loan_postgrad`, `employment_income`. One source read by the app, the WhatsApp answers, and later the agent.

**App.** `tradebook-app/lib/nistudentloan.ts` is the hand maintained mirror of the web module (same discipline as `lib/tax.ts`), guarded by a new parity test. Two new screens reached from Money: **National Insurance** (live Class 4 from confirmed entries, an optional PAYE salary input saved to the account with a debounce, the pension year status card, the £190 voluntary Class 2 prompt when profits sit under 7,105 with no job covering, the annual maxima note for high earners with both) and **Student loan** (plan picker saved to the account, postgrad toggle, the January figure building on real numbers, the write off note, the shock explainer). `getUserProfile` and `updateUserProfile` carry the new fields.

**The set aside number now includes everything, automatically.** Class 4 NI always was inside `soleTraderTax`. Now, once a plan is stored, the student loan folds in with no further input: the quarterly summary's piggy bank figure adds this quarter's slice and names the loan when present; the WhatsApp "how much tax do I owe" answer includes it ("including £X of student loan"); the hub hero shows the same figure. The subtlety handled correctly everywhere: with a PAYE salary, payroll already collects the loan on the salary, so all surfaces use the Self Assessment share only, `studentLoanForSA = repay(profit + salary) minus repay(salary)`, never negative. Class 1 stays out of set aside deliberately, the employer takes it at source.

**WhatsApp, zero AI, same pattern as waintents.** New deterministic intents, placed before the totals matcher so "owe" is not swallowed: "how much national insurance do I pay" (Class 4 on the year to date, Class 1 if a salary is saved, the pension year line), "how much student loan will I owe" (the stored plan against year to date income), and texting just "plan 2" (or "my student loan is plan 2") saves the plan from chat, voice first, no form. Conservative matchers, tested against false positives ("plan 2 rewires next week" does not match).

## 4. Verification, all green

New: `test/nistudentloan.test.mjs` 50 of 50 (engine, thresholds, the SA share cases). `test/nisl-parity.test.mjs` 256 of 256 (web vs app across Class 1 sweeps, mixed positions, every plan, the SA share). `test/waintents.test.mjs` extended from 61 to 85 (the new matchers, setters and answer formatters). Unchanged and re run: tax parity 1,354 of 1,354, the exam suite all correct. Every touched file esbuild parses clean, zero forbidden dashes. Live site re checked in Chrome after deploy: both tools calculate correctly, console clean after the 418 fix.

## 5. Deploys (all pushed by Jag this session)

Web repo `tradebook-app`: `8fe755e` (the two free tools), `4c61f6d` (WhatsApp intents, account settings, the 418 fix), `96791c9` (student loan folded into set aside, SA share). Mobile repo `tradebook-mobile`: `e20d14f` (the two hubs), `20b5f6a` (set aside includes the loan, hub shows the SA share). Prod SQL applied in the Supabase editor (the three users columns, success confirmed). All app changes are JS only, no EAS rebuild needed.

## 6. Where the build stands now

Everything in doc 81 still holds: the core WhatsApp loop live end to end, the redesigned app on the phone via the EAS dev build, the website live on Vercel, the tax engine verified, five audits, no known blockers. On top of that, Lekhio now has seven free website tools, NI and student loan handled in depth on real data, and a set aside number that is the whole January picture (income tax, Class 4, CIS credited, student loan included) which no competitor in this space does.

The launch gates are unchanged (doc 81 section 12): Anthropic credit, incorporation, ICO, the domain, the OTP switchover and anon close, HMRC recognition, platform funding, bank feeds, the paywall.

## 7. Phase C, shipped the same evening (addendum)

The session kept going and Phase C went from plan (doc 84) to shipped code in one push. Also fixed on the way in: a dark mode contrast sweep across the whole website after Jag spotted unreadable hero chat bubbles (five real bugs, all the hardcoded-colour-next-to-theme-variable disease: the homepage hero phone, the can-i-claim mockup, the file-your-tax-return MTD band, and the CIS, NI and student loan calculator tint cards; the app is immune, its theme is static light).

**C1, the engine.** `tradebook-web/lib/agent.ts`: 11 deterministic signals (VAT tiers at 80/90/100 percent, MTD mandation on actual or projected gross, higher rate approach, the 100k taper, the Class 2 pension year rescue, student loan threshold cross, the payments on account cliff, CIS refund milestones, quiet expense months including completely empty ones, AIA timing in the last 8 weeks, quarter end with unconfirmed entries). Pure functions, thresholds imported from the engines, projections gated on 3 months of history, noise caps (1 ping a day, 3 a week, losers demoted to cards, nothing dropped). `test/agent.test.mjs`: 90 of 90, including copy rules (no dashes, no certainty claims, no product names).

**C2, the walk.** `agent_signals` on prod (fire once unique index, RLS, inserts service role only) plus the `agent_user_aggregates` RPC. `api/cron/agent` on the reminders skeleton (constant time secret check, ack in `after()`, keyset cursor, 40 second budget, hop cap). Deliberately NO new vercel.json cron entry (the Hobby cron cap once blocked deploys): the daily 07:00 due job kicks the chain. Insert only until `AGENT_TEMPLATES_APPROVED=true`.

**C4 groundwork.** The three Meta utility templates were submitted live in the session (agent_threshold_alert, agent_deadline_alert, agent_opportunity, all English (UK), one variable each), status In review. Before flipping sends on, a payment method must also be added to the WhatsApp business account.

**C3, Rakha.** The agent's name is **Rakha** (ਰਾਖਾ, the guardian), the same Punjabi spirit as Lekhio: Lekhio keeps the books, Rakha watches them. On the chat screen, below Lekhio AI, Rakha's card stream (icon, finding, "Tell me more" into the chat, dismiss), loading and read marking against `agent_signals` under RLS. On the Feed, an unread banner ("Rakha has spotted 2 things in your numbers"). On the diary screen, a "Rakha alerts on WhatsApp" toggle writing `reminder_prefs.agent_pings`. Deploys: web `fafb490`, mobile `3c4d1cb`.

## 8. Next session (superseded by section 9, kept for the record)

Verify Rakha on the phone (a test row SQL is in the chat log; the real rows arrive with the first 07:00 cron walk), eyeball a few days of signal quality in `agent_signals`, then flip C4 when the templates go Active and the WhatsApp payment method is added. Then Phase D (the Mac mini knowledge watcher plus AI drafted suggestions, gated on Anthropic credit and a setup session on the machine) and Phase E (landlords, the largest build, the engine must be April 2027 aware from day one, doc 82 section 4). The launch gates in doc 81 section 12 are unchanged.

## 9. The session kept going: goals, names, and the front door (addendum, small hours of 6 July)

Rakha was verified live on Jag's phone (a hand inserted test signal appeared as a card in the chat and as the Feed banner, then was cleaned up). Then four more builds shipped before bed.

**The two helpers, explained and sold.** App Settings gained a "Your two helpers" card and the website product page gained a matching "Two helpers. One answers, one watches." section, replacing the old coming soon card (which is now "Rakha gets sharper", honestly pointing at Phase D).

**Goals, doc 82 section 5b, built in full.** A `user_goals` table on prod (kind purchase, income or savings, the title in the user's own words, an optional target date, an optional `vendor_note` that is only ever the user's stated vendor repeated back, the FCA line held). Four new engine signals: `goal_threshold_combo` (the flagship: the higher rate warning rewritten around what it does to the goal) and `goal_purchase_timing` (AIA timing quoting the real after tax cost of the purchase at the user's marginal rate) suppress their generic cousins; `goal_within_reach` and a monthly `goal_progress` round it out. The agent test suite grew to 106. WhatsApp understands "my goal is a van for 24k" (saved from chat, title extracted from the user's words), "how are my goals doing" and "goal done", waintents suite at 99. The app goals screen was rebuilt on the account (the old on device income target migrates itself on first open, nothing anyone set is lost), multi goal with progress bars and a Money tab entry.

**The front door.** The WhatsApp welcome was rebuilt: a brand image card, six real examples you could send right now, and three tappable quick reply buttons (first receipt, first expense, help), sent free form inside the 24 hour session so no template approval is needed. Verified live on Jag's phone. The app's first run moment now matches: an empty Feed shows "You're in 🎉" with three numbered steps and one big green button that opens WhatsApp with "Get started" already typed. Two thumb presses from install to first receipt.

**Names.** The AI answerer is now **Puchio** (from puchh, to ask, the same root plus io shape as Lekhio), renamed everywhere in app and on the product page. The family: Lekhio keeps the books, Puchio answers when you ask, Rakha speaks before you ask. Khoji (the seeker) is reserved for the Phase D watcher. Guru was rejected out of respect (sacred in Sikhi, never a bot name); Ustad and Gyani rejected as too heavy. The WhatsApp number's display name stays Lekhio per Meta policy; profile branding steps are in doc 82 section 5f.

**The goal on the front page.** Jag's call: the goal is the emotional centre of the product, so it now lives at the top of the Feed as a widget. Icon, title in the user's words, a live progress bar and "£X of £Y cleared after tax", the same confirmed only, after tax pot maths as the Goals screen and Rakha so every surface agrees. Multiple goals show "+N more". No goal yet shows a quiet set a goal card lower down instead.

**Deploys.** Web: `fc7d8fe` (goals engine, cron, WhatsApp), `3ac7103` (welcome flow), `54ff7a2` (Puchio on the product page). Mobile: `4224ed1` (goals screen), `6660200` (first run welcome), `99c2f7a` (Puchio everywhere), `f5b418a` (the Feed goal widget). Prod SQL: `user_goals` applied and confirmed. All app changes JS only, no EAS rebuild.

**Actually next.** The 07:00 cron walk writes the first real signals; eyeball `agent_signals` for noise. Flip C4 when the three templates go Active and a payment method is on the WhatsApp account. Brand the WhatsApp number profile. Then doc 82 section 6b: the Monday brief and January rehearsal signals, the push notification spec, then Phase D or E.

## 10. Morning of 6 July: Rakha proven live, and two real bugs found by refusing to trust silence

The 07:00 walk inserted nothing. Instead of accepting "the signals are gated, silence is correct", we proved each link of the chain, and that discipline caught two production breaks that would have kept Rakha silent forever.

**Bug one: the walk could not authenticate.** `CRON_SECRET` existed only inside Vercel, marked Sensitive (uncopyable), and matched nothing on the machine. Fix: rotated the secret (openssl on Jag's machine, into `.env.local` and the Vercel env var, then a redeploy, since env edits only apply to new deployments). Two traps for the playbook: piping into pbcopy carries a trailing newline that Vercel flags as "starts and ends with whitespace" and which breaks the constant time compare; and copying terminal output to paste into chat overwrites the clipboard holding the secret.

**Bug two: the `agent_user_aggregates` RPC was never on prod.** Saturday's SQL run applied the `agent_signals` table block but not the function below it. The walk called the RPC per user, failed, and the per user error handling (correctly) swallowed it and moved on, reporting ok. Fix: ran the function block; it returned Jag's real aggregates on the next call.

**The proof.** With Jag's actual aggregates in hand, the signal engine was run locally and predicted exactly: an `mtd_mandation` ping plus `poa_cliff` and `higher_rate_approach` cards (the projection gate opened this very day: 92 days into the tax year is the third month; the £23,000 July test invoice projects a £97,000 year). The re run walk then inserted exactly those three rows. Prediction matched reality row for row. Also verified as correct restraint: `goal_threshold_combo` stayed quiet because the £24,000 van cannot cover a £46,500 overshoot, and the goal signals need either a target date or a filled pot. Debugging method worth keeping: test the RPC directly in the SQL editor, simulate the engine locally on the real aggregates, then diff against what the walk wrote.

**The front door got its face.** The number profile now carries the blue L (kept at `brand/whatsapp-profile.png`), the tagline led description, category Finance and banking, and the website. Display name was already Lekhio. Everything still pointing at the temp URL, plus Instagram, Facebook Page, blue tick and payment method, is parked with triggers in doc 82 section 5f.

**Product note from watching real signals:** goals without a target date get no monthly `goal_progress` card. Worth loosening so an undated goal still gets a gentle monthly pulse.

**Where this leaves the build:** Rakha is live in production end to end on real data. Tomorrow's 07:00 walk runs unattended with a working secret and RPC. The C4 flip remains gated on Meta template approval plus the payment method. Next: doc 82 section 6b order, the Monday brief signal first.

## 11. The rest of 6 July: the heartbeat, the lock screen, and the whole landlord module

The day did not stop. In order, all shipped and verified live:

**The Monday brief and the January rehearsal** (engine signals 12 and 13, agent tests to 126). The brief is Rakha's weekly heartbeat: last week in three numbers plus one watchpoint, plain facts, fires for anyone with data from week one. The rehearsal runs filing day early once a quarter: the bill if the year stopped today and the weekly amount that covers it by 31 January. The aggregates RPC gained a trailing seven day week object; a null week skips gracefully, which was observed working in production when the pre SQL walk inserted only the rehearsal and the post SQL walk added the brief. Both landed on Jag's phone the same hour, five signals total.

**Push groundwork to the JS limit** (doc 82 s5c updated). The Money tab now carries Rakha's top signal as a compact card. The server side is complete and dormant: lib/push.ts speaks the Expo push API, the cron pushes every new ping to any user holding a token, `users.expo_push_token` and `reminder_prefs.agent_push` sit on prod. The native half (permission after the first card, the token write, the deep link, the badge, the diary toggle) is specced for the next EAS rebuild, batched with the paywall.

**Phase E, the landlord module, nearly all of it in one afternoon.** Facts re verified against the HMRC technical note itself (26 November 2025): property rates 22/42/47 from 6 April 2027, Section 24 relief at 22 percent, the allowance ordering change, Rent a Room and the property allowance unchanged. Jag's design instruction became the architecture: no landlord mode, just streams. `lib/propertyengine.ts` (canonical, tax year keyed, 52 exams, the HMRC annex example locked to the pound) plus the app mirror guarded by 1,008 parity points. Two free tools live and verified with correct maths: /landlord-tax-calculator (the headline nobody else shows: the tax the property adds now, and plus £X a year from April 2027) and /rent-a-room-checker (the £7,500 rule and the election). The property stream on prod: a properties table, `income_type` on transactions defaulting trade, the app hub (Money, Your properties) with per property cards and the April 2027 row, the 🏠 toggle on the add screen, and WhatsApp understanding "rent 950 in from flat 2" (the amount parsed before "from", because flat 2 once read as £2) and "how are my properties doing". Rakha then learned the landlord's world: `mtd_combined_trap` (a ping when trade alone is under the MTD line but trade plus rent crosses it, replacing the generic signal), `s24_exposure` (the 20p relief against 40p tax arithmetic made visible), `property_rates_2027` (April 2027 priced on the user's own year), and a real correction on the way through: the VAT signal no longer counts VAT exempt residential rent toward the registration threshold. Engine at 18 signals, 144 tests, every suite green.

**The day's deploys:** web 2b2a450, cd35acd, 7218ed0, 70e0775, abf6b4d; mobile 4dbcb97, 784b5a5, d87269e. Prod SQL: the week RPC, push columns, the property stream, RPC v4 with the property split. All applied and confirmed.

**What remains of Phase E:** the landlord landing page, property category guidance (repairs against improvements), and the four pattern based signals (rent_gap, allowance_election, incorporation_crossover, and pattern nudges) that want real usage history first. Everything else on the board is config or gated: C4 when Meta approves and a payment method lands, push when the EAS rebuild happens, Phase D when the Anthropic credit and a Mac mini session line up (the mini runs Jag's personal bot, so Phase D isolates itself: own directory, own launchd labels, check what runs first).

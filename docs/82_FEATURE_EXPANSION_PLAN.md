# 82: Feature Expansion Plan. NI checker, student loan checker, landlords, and the Agentic Accountant (5 July 2026)

> Planned this session, before any code. Covers the five new features Jag specified, the verified tax facts they rest on, the architecture, the compliance lines, the phasing, and the decision points that need Jag's call. Doc 81 remains the master for the existing build. When this plan changes, update this doc first.

---

## 0. What we are adding, in one paragraph

Two free website tools (a National Insurance checker and a student loan repayment checker) that feed the SEO flywheel exactly like the existing five free tools. Both rebuilt in depth inside the app, wired to the user's real numbers. A landlord module covering the two personas: a landlord with a normal job (PAYE plus property) and a landlord whose main income is property. And the headline feature, the Agentic Accountant: a proactive agent that lives below Lekhio AI in the app's chat area, continuously watches HMRC updates and the user's own numbers, and pings actionable suggestions through the app and WhatsApp. Everything stays inside the existing doctrine: we prepare, the user approves, we never imply HMRC endorsement, and no suggestion ever executes anything.

---

## 1. Verified tax facts these features rest on (checked 5 July 2026)

**National Insurance 2026/27.** Unchanged from 2025/26. Class 1 employee: 8 percent between £12,570 and £50,270, 2 percent above. Employer: 15 percent above £5,000 (already in the engine). Class 2: voluntary, £3.65 a week, small profits threshold £7,105 (already in the engine). Class 4: 6 percent between £12,570 and £50,270, then 2 percent (already in the engine). The new work is Class 1 (for employed plus self employed mixers and landlords with jobs) and the checker UX, not new maths.

**Student loans 2026/27.** Plan 1 threshold £26,900. Plan 2 £29,385 (now frozen at this figure until April 2030). Plan 4 £33,795. Plan 5 £25,000 (frozen by design). Postgraduate £21,000 (never changed). Rates: 9 percent above threshold on Plans 1, 2, 4, 5, and 6 percent on postgraduate. A person can hold a plan loan and a postgraduate loan at once, both repay simultaneously. Self employed repay through Self Assessment on total income, not just profits over the threshold on payroll. This is a real pain point Lekhio can own: subbies with student loans get a shock SA bill nobody warned them about.

**Landlord tax, the critical timeline.** 2026/27: property profits are taxed at normal income tax rates, finance costs (mortgage interest) get a 20 percent basic rate credit only (Section 24), property allowance £1,000, rent a room £7,500 (£3,750 joint). **From April 2027 (the November 2025 Budget): property income gets its own rate schedule, 22 percent basic, 42 percent higher, 47 percent additional, and the finance cost credit rises to 22 percent. Also from April 2027 the personal allowance must be set against employment, trading and pension income first, before property, savings or dividend income.** MTD for Income Tax: mandatory from April 2026 at £50,000 gross qualifying income, and the threshold is gross self employment plus gross property income combined, before expenses. £30,000 from April 2027, £20,000 from April 2028. This timeline means the landlord engine must be tax year aware from day one, and it also means every tradesperson with a side rental is closer to MTD mandation than they think, which is our wedge.

All figures to be re verified against GOV.UK primary sources at build time for each phase, per the existing engine discipline.

---

## 2. Website free tools (Phase A)

Two new pages under the existing free tools hub pattern (resources index, SharedHead, SiteNav, SiteFooter, dark mode aware, JSON-LD, llms.txt entry, sitemap entry).

**NI checker (`/ni-checker`).** Inputs: employment status (employed, self employed, both), salary and or profits. Outputs: Class 1, Class 2, Class 4 breakdown, total NI for the year, what it buys (State Pension qualifying years), and the voluntary Class 2 decision for low profit years (£190 a year to protect a pension year, usually worth it). CTA into Lekhio.

**Student loan checker (`/student-loan-checker`).** Inputs: plan or plans (1, 2, 4, 5, postgrad, or both a plan and postgrad), income, employed or self employed. Outputs: annual and monthly repayment, the SA repayment for the self employed (the shock bill warning), what happens near payoff (switch to direct debit to avoid overpaying), and write off dates by plan. CTA into Lekhio.

**Engine rule, learned from the audit:** the existing tax-calculator hand rolls its maths and was flagged as drift risk. These two tools do it right: the NI and student loan maths go into the canonical engine layer (`lib/taxengine.ts` or a sibling `lib/nistudentloan.ts` exporting from taxengine), the pages import it, and the app later imports the same module. One source of numbers, tested like the tax engine, exam suite extended to cover it.

---

## 3. App deep versions (Phase B)

Same engine modules, but wired to the user's real Lekhio data instead of typed inputs.

**NI hub.** Live Class 2 and Class 4 position from actual confirmed profits, State Pension qualifying year tracker, the voluntary Class 2 prompt when profits sit under £7,105, and a mixed income view for people with PAYE jobs (Class 1 from their stated salary plus Class 4 from Lekhio profits, with the annual maxima explained in plain English).

**Student loan hub.** Onboarding asks plan type once. Then: repayment building up in real time from confirmed income, the SA repayment forecast alongside the tax set aside figure (one number, "put this much away", loan included), a near payoff warning, and the interaction with going over thresholds. This makes Lekhio's core "always know your number" promise include the loan, which no competitor in this space does.

Both hubs are screens reachable from the Money tab, plus WhatsApp intents ("how much student loan will I owe", "am I paying NI") answered deterministically from the engine, zero AI cost, same pattern as `waintents`.

---

## 4. Landlord module (Phase C or D, Jag picks the order)

**The two personas.** One: employed or trading person with one or two rentals on the side (PAYE or trade income plus property pages). Two: portfolio landlord whose main income is property. Same engine, different emphasis. Persona one cares about the marginal rate their rent lands on and the combined MTD gross income trap. Persona two cares about Section 24 pain, incorporation comparison, and quarterly MTD mechanics.

**Data model.** A `income_type` dimension on transactions (`trade` or `property`, default `trade` so nothing existing changes), an optional `properties` table (nickname, address area, joint ownership percent), and property specific categories (rent received, mortgage interest, repairs, agent fees, insurance, ground rent). Repairs versus improvements is the classic trap, so capture guidance lives at the category level.

**Engine extension, tax year aware.** Property profit computation with the expenses versus £1,000 property allowance election (compute both, apply the better one, tell the user which and why). Section 24 finance cost credit at 20 percent for 2026/27 and 22 percent from 2027/28. The separate property rate schedule (22/42/47) and the personal allowance ordering change from April 2027. Rent a room where it applies. Joint ownership split. The combined MTD gross income test across trade plus property. Extend the exam suite with landlord cases before shipping, same discipline as the 71 case tax exam.

**Tax efficiency levers, all fully compliant, information not regulated advice.** Allowance versus actuals election. Expenses completeness checklists per category. Timing of repairs before year end. Section 24 arithmetic made visible so the user sees the real effective rate. Incorporation comparison using the Ltd optimiser that already exists in `lib/tax.ts` (companies still deduct interest in full, so this comparison is now sharper than ever, and we already have the engine for it). Joint ownership and Form 17 explained as information with a "speak to an accountant or solicitor to action this" line. Pension contributions to manage the higher rate boundary. Every lever framed as "here is the rule, here is your number, you decide", never "do this".

**Surfaces.** App: a property section (portfolio view, per property profit, the levers above). WhatsApp: "rent came in 850 for flat 2", "paid 320 mortgage interest", parsed deterministically. Website: a landlord landing page plus a Section 24 calculator as a free tool later (Phase E candidate, strong SEO because the April 2027 change will drive search volume all year).

**Positioning note for Jag.** This widens the customer beyond trades sole traders, which doc 81 had parked. The wedge framing that keeps it coherent: start with "tradespeople with a rental on the side" (persona one, same buyer we already have), and let full time landlords arrive through the free tools. No repositioning of the homepage needed yet.

**Phase E STARTED 6 July, facts re verified at source and the engine shipped.** The HMRC technical note of 26 November 2025 was read directly and confirms: property rates 22/42/47 from 6 April 2027 (England, Wales, NI); Section 24 relief moves to the property basic rate, 22 percent; the ordering change means the personal allowance MUST go against earned income first from 2027/28 (today it is applied beneficially); property allowance and Rent a Room unchanged; carried forward property losses stay property only; taxation order becomes earned, then property, then savings, then dividends; around 2.4 million landlords pay more. Jag's design instruction, adopted: **no landlord mode, just streams.** Nobody is asked "are you a landlord": salary on the users row, trade transactions, property transactions, and every archetype (day job plus rentals, trade plus rentals, property as the income) is just a mix the one engine computes. `lib/propertyengine.ts` is the canonical module: PROPERTY_FACTS keyed by tax year (add a year entry at the next Budget, never rewrite maths, and Khoji will watch for exactly that), the allowance election computed automatically, the Section 24 credit with the statutory cap and carry forward note, joint ownership, Rent a Room, and `aprilDelta` which prices the same numbers under both years. 52 exam cases in `test/propertyengine.test.mjs`, the HMRC annex example (£3,926) locked to the pound. Two free tools live the same day: `/landlord-tax-calculator` (headline: the tax the property adds now, plus "+£X a year from April 2027", the number nobody else shows this early) and `/rent-a-room-checker` (the £7,500 rule and the election). Both wired into the hub, nav, footer, sitemap and llms.txt. Still to come in Phase E: the app property hub on real transactions (`income_type` column, properties table, per property view), WhatsApp rent intents, the s5d Rakha landlord signals, and the landlord landing page.

---

## 5. The Agentic Accountant (the headline, Phase C or D)

**The concept.** Two AIs, one chat surface. Lekhio AI stays what it is: quick, reactive answers. Below it lives the Agent: proactive, always watching, never asked. It monitors the user's own numbers and the outside world (HMRC updates, Budget changes, deadlines, rates) and pushes suggestion cards into the app and, for the important ones, a WhatsApp ping. First of its kind in this market: the most proactive accountant on the planet.

**Architecture, four layers, built in this order.**

**Layer 1: deterministic monitors (no AI, no cost, works today).** A nightly job (existing Vercel cron pattern, resumable, same discipline as `cron/reminders`) computes signals per user from confirmed data: approaching the VAT threshold (£90,000 rolling 12 months), approaching MTD mandation (gross trade plus property versus 50/30/20k by year), crossing into higher rate (£50,270), approaching the personal allowance taper (£100,000), profits under the Class 2 small profits threshold (pension year at risk), student loan threshold crossings, payment on account cliffs, CIS refund milestones, unusually low expense months (missed receipts), quarter end approaching with unconfirmed entries. Each signal has a template message, zero AI, exactly like `waintents`. This alone is already "the most proactive accountant" most tradespeople have ever had.

**Layer 2: the knowledge watcher (the Mac mini).** The always on Mac mini runs a scheduled watcher (a Node or Claude Code script, run on a launchd timer): it pulls GOV.UK and HMRC publication feeds, Budget and rate change announcements, MTD guidance updates, and relevant professional updates, distils each into a structured `knowledge_items` row in Supabase (summary, effective date, who it affects, source URL, confidence), using the Anthropic API for the distillation. Nothing user facing reads a knowledge item until it carries a primary GOV.UK source link. The Mac mini holds only a scoped service key and writes to that one table, least privilege. This is also the mechanism that keeps the tax engine honest: when the watcher sees a rate change, it opens an item flagged `engine_impact` for us to update the engine and exams.

**Layer 3: the suggestion engine (needs Anthropic credit).** Combines Layer 1 signals, the user's numbers, and Layer 2 knowledge to draft suggestion cards with Claude: a plain English recommendation, the numbers behind it, the source, and what to do next. Examples in scope: "You are £4,100 from the VAT threshold on a rolling year. Here is what registering means and what your options are." "Your profit is strong this year. If you need a van, buying before 5 April means the whole cost comes off this year's tax bill under AIA. Here is the maths on your numbers." "New HMRC guidance changed the rules on X, it affects you because Y, nothing to do until Z." Cost control: existing `ai_usage` durable caps, batch nightly, Haiku for classification, Sonnet for drafting, cap suggestions per user per week.

**Layer 4: delivery.** In app: the agent's stream lives in the chat area below Lekhio AI, cards with a "tell me more" that hands into the Lekhio AI conversation with context. WhatsApp: high value signals only, respecting Meta's rules: outside a 24 hour customer service window, proactive sends require pre approved template messages, so we submit a small set of utility templates ("threshold alert", "deadline alert", "opportunity alert") for approval, and users control frequency in nudge preferences (STOP and START already work). Everything the agent sends is logged to `audit_log`.

**The hard compliance line, stated plainly.** Suggesting a category of action with the tax maths ("now is a good time to buy a van, here is why") is tax guidance and fine. Recommending specific credit products, specific car finance deals, or specific credit cards is consumer credit broking and financial promotion territory, which is FCA regulated. We do not do that without FCA permissions or a partner who holds them. The compliant v1: the agent explains the tax position, shows the user's own numbers, links to neutral comparison resources, and says "we are not a financial adviser, this is not financial advice". Named product recommendations and affiliate or referral revenue go on the roadmap behind an FCA advice step (a real revenue line later, done properly). Same doctrine as tax: we prepare the decision, the user makes it.

**Agent doctrine, non negotiable.** The agent suggests, never executes. No money moved, nothing filed, no message sent to a third party, ever. It never claims certainty about the future ("your numbers support" not "you will save"). Every claim carries its source. It is always visibly AI, never a human.

---

## 5b. Goals: what Rakha plans around (added by Jag, 6 July, build first next session)

**The idea.** Users tell Lekhio what they are working towards, and Rakha plans their tax around it. A goal is the user's own words plus a number: "a van, £24,000, by March, the Transit from the dealer I like." Rakha holds the goal all year and connects it to everything it already watches.

**Why the current goal feature does not cut it.** `lib/goal.ts` stores one income target on the device in AsyncStorage, invisible to the backend, so the agent cannot see it. Goals move server side.

**Data.** A `user_goals` table: id, user_id, kind (`purchase` | `income` | `savings`), title (the user's words), amount, target_date nullable, vendor_note nullable (the user's own stated vendor, held and repeated back, never sourced by us), status (`active` | `done` | `dropped`), created_at. RLS: user reads and writes own rows; the cron reads with the service role. The app's goals screen is rebuilt on this table (and stops being an orphan route), with the old AsyncStorage income target migrated on first open.

**Engine signals (deterministic, Phase C engine, no AI needed).**
- `goal_purchase_timing`: an active purchase goal, near year end or profit projected into a higher band, and the AIA maths favours buying before 5 April. The card shows the real after-tax cost at the user's marginal rate ("bought before April this van really costs you £14,400").
- `goal_threshold_combo`: projected income crossing a boundary AND an open purchase goal that would bring it back under. One suggestion solves both, the flagship completeness moment.
- `goal_progress`: set-aside pace against the goal amount and target date ("on track for February" or "£40 a week short").
- `goal_within_reach`: the set-aside pot passes the goal amount.

**WhatsApp intents (deterministic).** "my goal is a van for 24k" creates it, "how is my van looking" answers with progress and the tax angle, "goal done" closes it. Same waintents discipline, tested.

**Phase D multiplier.** Once the knowledge watcher lives, goals become context for AI drafted suggestions: a rule change that affects a goal ("the AIA treatment for X changed, your van goal is affected") gets surfaced with a source. Goals are also the natural personalisation seed for the whole agent.

**The line, restated.** The vendor in a goal is the USER'S note. Rakha repeats their words back and does the tax maths on their number. It never recommends finance, credit, or named products it sourced itself (FCA, section 5). Timing and tax treatment guidance only. You decide.

## 5c. Rakha's surfaces and notifications (added 6 July)

**Where Rakha speaks today:** the card stream on the chat screen, the unread banner on the Feed, and WhatsApp pings (built, gated on C4: templates Active plus a payment method on the WhatsApp account). **The missing surface is native push notifications**, and it matters: push is free per message where WhatsApp costs pennies, it lights the lock screen, and it is what makes a proactive agent FEEL proactive.

**Push spec.** `expo-notifications` (a native module, so it ships with the next EAS rebuild, not Metro): ask permission at the right moment (after the user's first Rakha card, never on first launch), store the Expo push token on the users row, and the nightly cron sends a push for `ping` priority signals through the Expo push API alongside or instead of WhatsApp. Same noise caps, same `agent_pings` style preference (its own toggle: "Rakha on your lock screen"), deep link straight to the chat screen, app icon badge = unread signal count. Delivery preference per user eventually: push, WhatsApp, or both, with WhatsApp the default for the target customer since they live there. One more small surface: the Money tab shows the single most important active signal as a compact card above the tools, so Rakha is felt everywhere money is looked at.

**Push groundwork, BUILT 6 July (everything JS allows):** the Money tab top signal card is live (pings outrank cards, tap opens the chat). Server side is complete and dormant: `lib/push.ts` sends through the Expo push API by plain fetch, the cron's walk pushes every new ping to any user holding a token (its own `agent_push` preference, no Meta gate since push needs no template approval), and prod carries `users.expo_push_token` plus `reminder_prefs.agent_push`. **Left for the EAS rebuild, all app side:** install `expo-notifications`, ask permission after the first Rakha card renders (never on first launch), write the token to the users row, handle the `{screen: 'accountant'}` deep link, set the icon badge to the unread count, and show the "Rakha on your lock screen" toggle on the diary screen (the preference column already exists, on by default). Batch with the paywall rebuild: one rebuild, not two. The moment one token exists, the first ping after the next walk lights a lock screen with zero further server work.

## 5d. Landlord signals for Rakha (feeds Phase E, added 6 July)

When the landlord module lands, Rakha learns the landlord's world. Deterministic signals from day one of Phase E:

**BUILT 6 July evening: items 1 to 3** (s24_exposure as a card for higher rate landlords with real finance costs, showing the credit rate against the top slice rate; property_rates_2027 pricing April 2027 on the user's own year to date through aprilDelta; mtd_combined_trap as a ping that REPLACES the generic MTD signal when the combination alone crosses the line). The aggregates RPC now splits the property stream (rents, expenses, finance, trailing 12 month rents), and the VAT signal was corrected on the way through: residential rent is VAT exempt, so it no longer counts toward the registration threshold test. Engine at 18 signals, 144 tests. Items 4 to 7 below (rent_gap, repairs_vs_improvements, allowance_election, incorporation_crossover) need pattern history or category data that arrives with real landlord usage: build once the stream has lived a while.

1. `s24_exposure`: finance costs high relative to rents, showing the REAL effective rate after the 20 percent credit ("your mortgage interest relief is capped, your effective rate on rents is X percent").
2. `property_rates_2027`: on this user's actual rents, what the April 2027 property rates (22/42/47) change their bill by, a full year before it bites. Nobody else will tell them this early.
3. `mtd_combined_trap`: gross trade PLUS gross rents crossing the MTD threshold together, the trap doc 82 section 4 identified.
4. `rent_gap`: an expected rent (learned from the payment pattern) not logged this month. Missed rent or missed logging, either way worth a nudge.
5. `repairs_vs_improvements`: a large one off property expense triggers the distinction card BEFORE they file it wrong (repairs deduct now, improvements only against capital gains later).
6. `allowance_election`: at year end, computes both the £1,000 property allowance and actual expenses and says which wins.
7. `incorporation_crossover`: when Section 24 pain passes the point where the Ltd comparison (the `planLtd` engine that already exists) starts to favour incorporating, flag it as information with the "speak to an accountant to action" line.
8. Phase D powered: landlord law watch (deposit rules, EPC deadlines, Renters' Rights obligations) from the knowledge watcher, personalised to whether they hold property.

## 5e. Rakha ideas backlog, ranked (my additions, added 6 July)

Deterministic, buildable in Phase C's engine, no AI cost:

**STATUS 6 July evening, the zero credit run:** items 1, 2, 3 and 5 below are BUILT (the Monday brief, the January rehearsal, the invoice chaser with drafts in Rakha's voice behind the approval gate, and show the maths as an expander on every card), plus beyond this list: the expense completeness check, the /sole-trader-vs-limited free tool on a parity guarded ltd engine, the /for-landlords landing page, undated goals now pulse monthly, an accountant CSV export in settings, and a stateless WhatsApp guided setup ("setup": student loan, plan, PAYE salary, property, all by button and short text). Remaining from this list: 4 (pattern nudges) and item 7 and the Phase D pair, all wanting either usage history or the watcher.

**UPDATE (doc 86, next session):** item 6, the year end countdown, is now BUILT as Rakha signal 22 `year_end_countdown` (last six weeks to 5 April, a weekly shrinking list of moves, a card not a ping, dormant otherwise). Also this session: the review engine was confirmed already built and dormant in the app (`lib/review.ts`), and the referral half doc 77 deferred was built on doctrine, `lib/referral.ts` plus the WhatsApp "invite" intent and `?ref=` attribution, with the REWARD parked as a gated Jag decision (the loop and attribution are live, only the payout mechanic is deferred). And the quarter end pack is now reachable from the app Money tab through a signed capability link, no EAS rebuild needed.

1. **The Monday brief.** One message at the start of the week: last week in three numbers, this week's watchpoints, one suggested action. A weekly heartbeat that makes Rakha a habit, not an interruption. (High value, easy, builds on the weekly summary plumbing.)
2. **The January rehearsal.** Once a quarter Rakha runs filing day early: "if the year ended today the bill is £X, you have £Y set aside, the gap is £Z, here is the weekly amount that closes it." Kills the January fear permanently, which is the brand promise.
3. **The invoice chaser.** Unpaid invoices past 14 and 30 days: Rakha drafts the polite chase message and the user sends it with one tap. Cashflow is the number one pain for trades, and the invoices table already exists. Approval gate intact: Rakha drafts, the user sends.
4. **Pattern nudges, not generic nudges.** Rakha learns each user's logging rhythm (fuel most Mondays, materials near month end) and only chases what is genuinely missing against their own pattern. Generic reminders train people to ignore; pattern nudges feel like being known.
5. **"Show the maths."** Every Rakha card expands to the exact calculation behind it. Trust is the product; an agent that shows its working is one people follow.
6. **Year end countdown mode.** The last six weeks before 5 April, a weekly "moves you can still make" list, personalised and shrinking as the door closes.
7. **Rakha remembers.** A dismissed suggestion stays dismissed for the year, and "not interested in pension talk" style preferences are respected. An agent that repeats itself is a nag; one that remembers is a colleague. (Structurally started: `dismissed_at` exists.)

Phase D powered, once the watcher lives: **the Budget morning message** ("the Budget just changed your bill by £X, on your numbers, here is why" the same day, sourced) and, at real scale and with care, **anonymised peer context** ("electricians at your turnover typically log £X of tool costs; you are at £Y, worth checking what you are missing").

## 5f. The WhatsApp front door (added 6 July, welcome flow BUILT same night)

**Welcome flow, shipped.** The first hello is now: a brand image card, a warm message with six real examples (receipt, expense, mileage, income, a goal, a question), and three tappable quick reply buttons (Log a receipt, Text an expense, Everything I do). Buttons are free form inside the 24 hour session, no templates needed; the webhook parses `interactive.button_reply` and each button teaches by inviting a real first action. Unknown numbers still get the honest signup pointer.

**Branding the number, DONE 6 July morning:** display name was already **Lekhio** (Meta reviews display names and they must reflect the business, so the front door stays Lekhio rather than a character name). Applied in WhatsApp Manager, Phone numbers, Profile: the blue L app icon as profile photo (source file kept at `brand/whatsapp-profile.png`, 640 by 640), description "Text it. It's in your Lekhio. Bookkeeping and tax help for UK self employed tradespeople, all through WhatsApp. Snap a receipt or text your miles and it is logged ready for tax.", category Finance and banking, website `https://tradebook-app-five.vercel.app`.

**Parked for later, with triggers (Jag asked to keep this list here):**
- **Domain swap, trigger = lekhio.app connected in Vercel.** Update in one sweep: the WhatsApp profile website field above; `NEXT_PUBLIC_APP_URL` in Vercel (drives invoice links, the welcome image URL, and the agent cron's self fetch); `EMAIL_FROM` plus Resend domain verification when invoice email switches on; the UptimeRobot monitor URL on /api/health. Sitemap and llms.txt follow the env automatically.
- **WhatsApp payment method, trigger = ready to switch on Rakha's pings.** Meta blocks business initiated sends without it; the Add payment method banner sits on the Phone numbers page. Gates C4 together with template approval.
- **Instagram and Facebook Page connect, trigger = the social accounts exist.** The profile has Connect Instagram and Connect a Page buttons; linking them adds credibility signals to the WhatsApp profile. No accounts yet, park until the marketing phase.
- **Official business account (blue tick), trigger = incorporation plus own domain.** Submit request button is on the Profile tab; Meta checks brand evidence, so apply after Lekhio Ltd exists and lekhio.app is live, not before.
- **Business email on the profile, trigger = domain email exists** (e.g. hello@lekhio.app; left blank rather than using a personal address).

**Naming structure, DECIDED 6 July:** the NUMBER is Lekhio (the place), the characters live inside. **Puchio** (from puchh, ask, built like Lekhio: root plus io) is the answerer, renamed from "Lekhio AI" across the app chat screen, what-if, pay-yourself, insights, settings explainer and the product page the same night. **Rakha** watches. **Khoji** (the tracker who hunts) is reserved for the Phase D knowledge watcher, completing the family: "Puchio answers. Rakha watches. Khoji digs. Your whole back office lives in Lekhio." Rejected: Ustad and Gyani (too Punjabi sounding for the brand), Guru (sacred in Sikhi, off limits for a chatbot). AI-ness stays visible in surrounding copy per the honesty doctrine.

## 6. Phasing and effort

**Phase A. Website NI checker plus student loan checker.** Engine modules first, then two pages. Small, fast, pure SEO win, no new infrastructure. Also unblocks Phase B since the app imports the same modules.

**Phase B. App NI hub plus student loan hub.** Screens, onboarding plan question, WhatsApp intents. Medium.

**Phase C recommended: Agent Layer 1 plus Layer 4 (deterministic agent v1).** Signals, the in app agent stream, WhatsApp templates submitted for approval. No AI credit needed, visible differentiation immediately, and the agent ships before the automation it would ever guard (there is none, it only suggests). Medium.

**Phase D. Agent Layers 2 and 3.** Mac mini watcher plus AI suggestions. Gated on Anthropic credit (critical path item 1 in doc 81) and the Mac mini setup session with Jag. Medium, mostly new surface not new risk.

**Phase E. Landlord module.** Schema, engine extension, exams, screens, intents, landing page. The largest single piece. Its free tool (Section 24 calculator) can ship with it or trail it.

A to B to C can proceed with zero external spend. D needs API credit. E needs nothing external but the most build time.

---

## 6b. Tomorrow's execution order (set 6 July, ~2.30am, for the next session)

1. **Goals (section 5b).** Table, screen rebuild, migration, the four engine signals, WhatsApp intents. The flagship is `goal_threshold_combo`.
2. **The Monday brief and the January rehearsal (section 5e items 1 and 2).** Both ride the existing cron and engine, small builds, big feel.
3. **C4 flip** the moment the three templates show Active and the WhatsApp payment method is added: set `AGENT_TEMPLATES_APPROVED=true`, send the first real ping to Jag's own number, confirm STOP.
4. **Push notifications spec into the app (section 5c)** as far as JS allows, with the native `expo-notifications` piece queued for the next EAS rebuild (batch it with the paywall flip rebuild later, one rebuild not two).
5. **Then Phase D** (Mac mini plus credit, the moment both are available) or **Phase E landlords** (sections 4 and 5d together: module plus its Rakha signals in one build), Jag's call on the day.

Also carried: eyeball the first real agent walk's rows in `agent_signals` for noise before C4 sends anything.

## 7. Decision points for Jag

1. **Build order.** Recommended A, B, C, D, E. The main alternative is pulling landlords (E) ahead of the agent (C and D) if landlord acquisition matters sooner.
2. **The FCA line.** Confirm the v1 agent stays on the guidance side (no named credit or finance product recommendations, no affiliate links) until there is an FCA route. Recommended: yes, hold the line, park the revenue idea with a trigger.
3. **WhatsApp templates.** Proactive agent pings need Meta approved message templates. Approve submitting three utility templates when Phase C starts.
4. **Agent naming.** The stream needs a name that is not "Lekhio AI" (taken). Working options: "Your Agent", "Lekhio Watch", "The Lookout". Decide at Phase C build.
5. **Landlord positioning.** Recommended: quiet capability plus free tools first, "trades with a rental" framing, no homepage repositioning until it proves demand.
6. **Mac mini.** Phase D needs a setup session on the machine itself (script, launchd schedule, scoped Supabase key). Jag hosts, we write it.

---

## 8. What this plan deliberately does not touch

The critical path in doc 81 section 12 is unchanged and still gates paying customers (credit, incorporation, ICO, domain, OTP switchover, HMRC recognition, funding, bank feeds, paywall). This plan adds product depth in parallel, it does not replace launch work. Phase 2 marketing engine and Phase 3 Connect remain not started by design.

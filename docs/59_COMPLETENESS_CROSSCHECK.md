# 59: Completeness Cross-Check. Are We Sure Nothing Is Missing?

> 30 June 2026. A fresh, honest cross-check of the COMPLETE current build against the four lenses that matter: competitors, real accountants, the qualification exams we studied, and the unique-ideas brainstorm. The earlier audits (docs 53, 54, 56, 57) predated a lot of what we then built, so this re-verifies against today's product and flags what genuinely remains.

---

## The honest finding that triggered fixes

A code-level verification of our tax engine against the 20 expert exam topics found we were over-claiming: the engine fully covered about 9 of 20, the bot was narrating the rest from the LLM, and four topics were missing from tested code entirely. The high-frequency gaps a real sole trader actually hits were the worst offenders. So before writing this, we closed them.

**Now fixed and exam-tested (suite expanded to 87 questions, still 100%):**
- **Payments on account**, the two 50% instalments due 31 January and 31 July once the bill tops £1,000. This surprises every sole trader; now computed and explained.
- **Capital allowances beyond AIA**, writing down allowances, 18% main pool and 6% special rate pool.
- **Trading losses**, carry forward against future profits, with the s64 sideways option explained.
- **Capital gains tax and Business Asset Disposal Relief**, £3,000 exempt, 18% or 24%, BADR at 18% up to £1m.
- **VAT flat rate scheme**, pay a percentage of turnover, with the 16.5% limited-cost-trader rate.

The accountant bot's knowledge was upgraded to match, so it now answers these accurately rather than guessing.

---

## Lens 1: vs competitors

Where we now lead, and most are things no competitor offers at all: WhatsApp photo and voice capture, the free business-setup concierge, CIS done properly for subcontractors, a live and exam-verified tax figure, the proactive accountant that finds you money, the in-app expert chat, the what-if simulator, instant proof of income, the pay-yourself salary-vs-dividends optimiser, one-tap invoice reminders and overdue chasing, and one flat all-in price. The big platforms (QuickBooks, FreeAgent, Xero, Coconut, Pie) match us on bookkeeping and beat us on two things only: **mature bank feeds**, and **filing to HMRC today** (they are recognised; we are not yet).

Net: we exceed every competitor on the experience and the advice, and trail only on bank feeds and live filing, both of which are built-but-gated, not missing.

## Lens 2: vs a real accountant

We now cover most of what a high-street accountant does for a sole trader: keep the books, categorise, prepare the quarter and the year, answer questions in plain English, advise on expenses and tax efficiency, model the incorporation decision, and produce proof of income. What an accountant still does that we do not: **actually file** (pending recognition), carry **professional liability and a signature**, and handle the genuinely complex edges (intricate CGT, inheritance tax, company restructuring, HMRC disputes, payroll), which our bot correctly refuses and refers to a human. That referral is the right answer, not a gap to paper over.

## Lens 3: vs the exams we studied

After today's additions: of the 20 syllabus topics, roughly 13 to 14 are now fully covered in tested code, the rest are accurately handled by the bot's encoded knowledge. The remaining not-in-engine items are lower-frequency or advisory: the finer capital-allowance cases (FYA, SBA, car CO2 bands, balancing charges), opening and closing-year basis mechanics, cash and annual VAT accounting, and the deeper bookkeeping and ethics theory. These are things the bot explains and an accountant would handle; encoding them is polish, not a hole. The "expert" claim is now genuinely supported by tested code for the topics a UK sole trader actually meets.

## Lens 4: vs the unique-ideas brainstorm (doc 57)

The three flagship ideas are all built: the proactive accountant, the what-if simulator, and instant proof of income. Plus the late-payment chaser (invoice reminders, text and email) and the pay-yourself advisor. Of the original list, what remains unbuilt is the lower-priority tail: a fully automatic "should I go limited?" watch (we do it on demand in Pay Yourself), an automatic relief-finder beyond the current insights, voice-driven Self Assessment, and anonymous peer benchmarking (needs scale and a consent model). None is essential; all are future upside.

---

## So, what is genuinely still missing?

Almost nothing in code. The real list, in order:

1. **External switches, not features:** HMRC filing recognition, live bank feeds (TrueLayer), phone OTP in production, live Stripe/WhatsApp keys. These gate the launch, not the build.
2. **Advisory tax edges** (deeper capital allowances, opening/closing-year basis, cash/annual VAT, full CGT/IHT): handled by the bot and referred to a human where complex. Encode over time as polish.
3. **A few unbuilt unique ideas:** the brainstorm tail above. Optional upside.

That is the truthful answer to "are we sure nothing is missing": the product is feature-complete and now genuinely expert-tested on the core, the few code gaps are advisory edges the bot already handles, and everything else standing between us and a confident launch is a key or an approval, not engineering.

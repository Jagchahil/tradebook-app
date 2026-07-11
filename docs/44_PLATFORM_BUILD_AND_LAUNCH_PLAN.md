# 44: Platform Build and Launch Plan

> How we get from the wedge we have to the complete tax platform that owns the whole HMRC relationship, without delaying launch. The answer is two tracks running at once: launch the wedge now, run the long external approvals in parallel, and wire each platform piece the day its account or recognition lands. Plus the honest position on patents and trademarks.

---

## The decision: launch lean, build the platform in parallel

Do not hold launch for the full platform. The bank feed and the filing are roughly 20% code and 80% approvals you do not yet control, and they cannot even be tested without live keys. Holding launch for them means months of delay and shipping the most sensitive code untested.

Instead:
- **Track A, launch now.** The wedge is built, validated and ahead of the field: WhatsApp capture, claim by text (mileage, home, phone, CIS), invoicing, the tax estimate and refund and tax saved trackers, the in depth tax guide, reminders. Get real users and revenue now.
- **Track B, the platform, in parallel.** Start the three long applications today (below). As each lands, we wire the matching feature, which is fast because the specs and scaffolding are ready.

This gets you to market now and to the full platform fastest.

---

## The three long applications to start now (the bottleneck is approval, not code)

### 1. HMRC software recognition (for filing, the SA account view, and VAT)
- Register on the **HMRC Developer Hub**, create an application, get sandbox credentials for the Making Tax Digital for Income Tax and VAT APIs.
- Build against the sandbox, pass HMRC's **test scenarios**, then apply for **production credentials and recognition** (the Software Choices listing).
- This is the single most important and slowest item. Start it the moment Lekhio Ltd exists, because some steps want the company. Weeks to months. Everything in "the HMRC connection" depends on it.

### 2. TrueLayer (or Plaid or Tink) for the bank feed
- Sign up, confirm the **agent or regulated umbrella terms** so you can operate under their FCA permission (the normal route for a startup, see doc 22).
- Get sandbox keys, build the connect flow, then go live.
- The database scaffolding for this is already laid (bank_connections table and the dedupe column are in schema.sql, dormant).

### 3. UKIPO trademark for the brand
- File **Lekhio** as a word mark. Specification below. About £205 for the first class online, £60 per extra class. You can file it yourself or via an attorney.

---

## Trademark filing spec (ready to file at ipo.gov.uk)

- **Mark:** Lekhio (word mark). Consider also a figurative mark for the logo later.
- **Owner:** Lekhio Ltd (file once incorporated), or yourself and assign to the company.
- **Classes and specification** (the goods and services to claim):
  - **Class 9** (software): "Downloadable and cloud software for bookkeeping, accounting, expense and mileage tracking, tax preparation and the digital submission of tax information; mobile applications for financial record keeping and tax management."
  - **Class 35** (business services): "Bookkeeping; accounting; business record keeping; preparation of business accounts and tax records; business administration services for the self employed."
  - **Class 36** (financial, optional): "Financial record keeping; tax preparation and tax filing services; financial information and advisory services relating to taxation." Note: claiming tax filing in class 36 is worth it given the roadmap.
- **Before filing:** run the free UKIPO availability search for "Lekhio" and similar. Our brand search found no clashes in this space, but confirm at filing.

## The honest position on patents

A UK patent is almost certainly **not available** here, and chasing one would waste money and time. UK law (Patents Act 1977, section 1(2)) excludes "methods of doing business" and programs for a computer "as such" from patentability. "Claim your tax with a text" is exactly that. Do not pursue a patent. Protect the brand with the trademark, and win with **speed, brand and the experience**, which is the real and defensible moat.

---

## MTD for Income Tax filing, technical build spec (execution ready)

Build this against the HMRC sandbox once recognition is underway. This is the flow, so it is ready to execute.

**Auth.** OAuth 2.0 against HMRC. The user grants Lekhio access to their tax data. Store the access and refresh tokens encrypted, server side only, like the bank tokens.

**Fraud prevention headers.** Every HMRC API call must carry the **Gov-Client and Gov-Vendor fraud prevention headers** (device, IP, screen, timestamps, vendor version). HMRC checks these. Get them right, there is a validator endpoint to test against.

**The endpoints, in order of the user's year:**
1. **Obligations.** Retrieve the user's quarterly obligations and deadlines (the 7 Aug, 7 Nov, 7 Feb, 7 May dates) so we show what is due and when.
2. **Submit a quarterly update.** Send the period's income and expenses, summarised from the user's confirmed transactions, after the user approves. Returns a receipt we store.
3. **Final declaration.** After the year end, submit the final declaration (the crystallisation), which replaces the old Self Assessment return. Again, only after the user approves.
4. **Self Assessment Accounts API.** Retrieve the user's balance, what is overdue, due, and pending, their payments, penalties and refunds. Surface this as the "your HMRC position" screen. This is the quiet superpower, build it alongside.

**The rules that never change.** We prepare, the user approves, nothing is submitted without an explicit approval tap. We never imply HMRC endorsement. The submission only goes through the recognised path. This is already how every screen is worded.

**The build, once sandbox keys exist:** `lib/hmrc.ts` (OAuth, fraud headers, the endpoint calls), an `/api/hmrc/callback` route for OAuth, an approval screen in the app, and a `hasHmrcConfig()` gate so it is dormant until configured, exactly like the email and WhatsApp libs.

---

## What is staged now, and the sequence

**Staged tonight (safe, dormant, validated):** the bank connection database scaffolding (the bank_connections table and the dedupe column in schema.sql). It does nothing until the connector lib is wired, and it is ready when TrueLayer lands.

**The build order, as approvals arrive:**
1. Wire **MTD filing** the moment sandbox recognition is in progress (doc 22 for bank, this doc for filing). Most important.
2. Wire the **bank feed** when TrueLayer agent terms are signed (doc 22 is the full build).
3. Add the **SA account view** on the same HMRC recognition.
4. Then VAT, the reliefs checker, the human accountant layer, and the rest of doc 43, in that ranked order.

---

## The one thing to do first

Incorporate Lekhio Ltd, then immediately start the **HMRC Developer Hub** registration and the **TrueLayer** signup. Those two applications are the long poles for the whole platform. The code is the fast part, and it is specced and ready. Launch the wedge while they process. That is how you own tax without losing months.

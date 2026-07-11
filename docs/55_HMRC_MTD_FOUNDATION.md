# 55: HMRC MTD Submission Foundation

> The existential gap from the competitive audit (doc 53) was that we prepare the quarter but cannot file it. This is the foundation that closes it, built responsibly. It is sandbox-first and dormant: it cannot touch the live HMRC service until we are recognised and live credentials are set. Built 29 June 2026.

---

## What is now built

`lib/hmrc.ts` is a complete, documented MTD for Income Tax client, written to HMRC's published API shapes and pointed at HMRC's sandbox by default.

It contains the OAuth 2.0 flow that lets a user grant Lekhio permission to file for them (`authorizeUrl`, `exchangeCodeForToken`, `refreshAccessToken`), the mandatory fraud-prevention headers every MTD call must carry (`fraudPreventionHeaders`), a reader for the user's quarterly and final obligations (`retrieveObligations`), and the two submission entry points: the quarterly periodic update (`submitQuarterlyUpdate`) and the year-end final declaration (`submitFinalDeclaration`).

The genuinely valuable, testable core is `buildPeriodicUpdate`. HMRC's rule is that software turns transactions into summary totals; this function does exactly that. It maps every Lekhio expense category to the correct MTD self-employment field (materials and tools to costOfGoods, CIS and subcontractors to paymentsToSubcontractors, fuel and mileage to carVanTravelExpenses, and so on), sums the income into turnover, and emits the documented payload. It supports both the full category breakdown and, for the many traders under the £90,000 turnover line, the single consolidated-expenses figure HMRC allows them to send instead.

It is tested. `test/hmrc/run-hmrc-test.mjs` checks the category mapping, the consolidated path, and the two safety properties below. All twelve checks pass.

---

## The safety properties, enforced in code

The human-approval gate is built before the automation it guards, as our rules require. `submitQuarterlyUpdate` and `submitFinalDeclaration` throw `ApprovalRequiredError` unless the caller passes `approved: true` for that exact submission. Approval is never a default and is never inferred by the system.

It is dormant until switched on. With no credentials set, a submission call returns `hmrc_not_configured` and sends nothing. With credentials, it targets the sandbox unless `HMRC_BASE_URL` is explicitly pointed at production. So the live service cannot be reached by accident.

We never imply endorsement. The module files through the recognised path; it does not claim HMRC backs Lekhio.

---

## What is still required to go live (in order)

1. **HMRC software recognition.** Apply on the Developer Hub for production access to the MTD ITSA APIs (Self Employment Business, Obligations, Individual Calculations). This is an external approval with lead time. Doc 48 has the checklist.
2. **Production credentials** in the environment: `HMRC_CLIENT_ID`, `HMRC_CLIENT_SECRET`, `HMRC_REDIRECT_URI`, and `HMRC_BASE_URL` set to production only once recognised.
3. **Capture the user's National Insurance number and business id**, and store HMRC tokens securely per user (a `hmrc_connections` table, mirroring `bank_connections`).
4. **Wire the calculation step**: trigger an Individual Calculation, show the user the figure, and only then offer final declaration behind the approval gate.
5. **End-to-end sandbox testing** with HMRC's test users, covering a full quarter and a final declaration, before any live submission.
6. **Fraud-prevention header validation** against HMRC's "Test Fraud Prevention Headers" API, which checks the Gov-Client headers are complete and correctly formed.

---

## Why this matters now

MTD for Income Tax is live. The first quarterly update for £50,000-plus sole traders is due 7 August 2026. Recognition has lead time, so the work to apply starts now. With this foundation in place, the remaining work is integration and approval, not invention: the hard part, turning a tradesperson's WhatsApp receipts into a correctly categorised HMRC submission, is built and tested. The moment recognition lands, Lekhio stops being the best place to keep the books and becomes the place that also files them.

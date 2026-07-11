# 72: HMRC Production Credentials Application, Answer Pack

> Written 2 July 2026. The full loop is stress-tested green in the sandbox (doc 66 §7c), so we can apply for production credentials. This is the ready-to-paste answer pack for the Developer Hub "request production access" questionnaire. HMRC staff review the answers; the information is kept private. You have 6 months to complete a started request. Draft answers below are written from what is actually built and proven. Items only you can provide are marked NEEDS YOU.

---

## 0. Before you click Continue, the three gating items

1. **A responsible individual** (name and email) who is accountable for compliance with HMRC's terms of use. This is you, Jag. NEEDS YOU: the exact name and the email you want on record.
2. **Your organisation URL.** Use `https://tradebook-app-five.vercel.app` for now, or `https://lekhio.app` once the domain is live.
3. **Evidence your organisation is officially registered.** HMRC accepts any one of: a Self Assessment Unique Taxpayer Reference (UTR), a VAT registration number, a PAYE reference, a Corporation Tax UTR, or a Companies House company registration number. NEEDS YOU: which one you will use. See the decision in section 1.

You cannot finish the application without item 3. Everything else I have drafted.

---

## 1. The one decision, how to identify the organisation

You can apply in one of two ways, and it changes nothing about the software:

- **As a sole trader, now.** Use your own Self Assessment UTR as the registration evidence. Fastest, free, nothing to set up. Fits the "start as a sole trader" option in the launch plan.
- **As Lekhio Ltd.** Incorporate first (Companies House, about 50 pounds), then use the company registration number. Cleaner for raising money later and for limiting liability, but adds a step and a day or two.

My recommendation: **apply now as a sole trader with your UTR to start the 10 working day clock**, and move the software to the company later if and when you incorporate. Getting recognition in flight is the prize; the legal wrapper can change underneath it. Take your own view, or a quick word with an accountant, on the sole trader versus limited question, since it has tax and liability angles beyond this application.

---

## 2. Drafted answers, by section

### About your organisation
- **Responsible individual:** NEEDS YOU (name and email).
- **Organisation URL:** https://tradebook-app-five.vercel.app (update to https://lekhio.app when live).
- **Official registration evidence:** NEEDS YOU (your Self Assessment UTR, or the company number if you incorporate).

### Marketing your software
- **Do you use HMRC logos in your software, marketing or website?** **No.** Lekhio never uses HMRC logos and never implies HMRC endorsement. The site and app state plainly that Lekhio is an independent UK company, is not HMRC, and is not endorsed by HMRC, and that nothing is submitted to HMRC without the user's approval.

### Service management practices
- We deploy through Vercel with build and validation gates, and monitor deployments. Incidents are triaged and fixed quickly, with a documented debugging and deploy playbook. Users reach support directly by WhatsApp and email, and a real person responds. We keep an audit trail of key actions and can trace and correct issues. We follow HMRC API status and change logs and update the software when APIs change (we have already tracked and adopted the current API versions).

### Handling personal data
- Lekhio complies with UK GDPR. Personal and financial data is encrypted in transit and at rest. Access is least privilege: the database service role key is server side only and never reaches client code, and row level security is enforced on every table. Users have self service data export and account erasure. We do not log message content to third party services beyond our database. HMRC OAuth tokens are stored server side only, per user, and never exposed to the client.

### About your software
- Lekhio is a Making Tax Digital for Income Tax product for UK self employed sole traders, focused on the trades. It captures income and expenses, keeps digital records, prepares quarterly cumulative updates and the year end position, and lets the user review and explicitly approve before anything is submitted to HMRC. APIs used: Self Employment Business (cumulative period summary), Obligations, Business Details, Individual Calculations (estimate and final declaration), Self Assessment BSAS (annual adjustments), and Individual Losses. Every submission runs behind an explicit user approval gate in code.

### Software security
- Transport is HTTPS only, enforced with HSTS. Baseline security headers are set site wide (nosniff, anti clickjacking via X-Frame-Options and a frame-ancestors content security policy, a strict referrer policy, and a locked down permissions policy). Secret invoice and pay links carry an unguessable UUID and send no referrer so the link cannot leak. Both inbound webhooks verify their signatures. Public endpoints are rate limited and have durable spend caps. Secrets live in the platform environment, never in the repository. Dependencies are kept current.

### Fraud prevention data
- Lekhio sends the full set of fraud prevention headers required for the WEB_APP_VIA_SERVER connection method on every MTD call. The headers were validated against HMRC's Test Fraud Prevention Headers API with a VALID_HEADERS result. Client side values (browser, screen, timezone, public port and so on) are collected in the user's browser and forwarded to the server.

### Customers authorising your software
- Users authorise Lekhio through HMRC's OAuth 2.0 grant. They sign in with HMRC and explicitly grant access to their Self Assessment data (read and write self assessment scopes). Tokens are stored securely server side and refreshed as needed, and a user can disconnect at any time. Lekhio never files without the user's explicit approval for that exact submission.

---

## 3. Evidence to have ready

If HMRC asks for the demonstration behind these answers, point to the sandbox stress test in doc 66 section 7c: the VALID_HEADERS result, the quarterly cumulative submission at HTTP 204, the year end calculation and final declaration, and the losses and BSAS calls, all behind the approval gate. Keep the terminal output from the `scripts/hmrc-sandbox-demo.mjs` run.

---

## 4. How we finish it

Once you give me the responsible individual name and email, confirm the organisation URL, and tell me your registration reference choice (UTR now, or company number), I can walk you through the form on the Developer Hub screen by screen, you fill the personal and registration fields and agree to the terms, and you submit. I will not enter your personal or registration details or agree to the terms on your behalf, those are yours to enter, but I will have every answer ready so it takes a few minutes.

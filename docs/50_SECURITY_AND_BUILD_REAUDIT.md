# 50: Security and Build Re-audit (June 2026)

> A fresh pass over the whole codebase, website and app, after all the recent feature work. Confirms the security posture is solid, lists the one small fix made, and states plainly what is left to build versus what is blocked on outside approvals. Builds on the earlier docs/19 security audit.

---

## Part 1: Security audit

### What was checked
Secrets handling and client exposure, webhook signature verification, API route validation and abuse vectors, row level security, cross site scripting, logging of sensitive data, and hardcoded secrets, across both `tradebook-web` and `tradebook-app`.

### Findings, all clear

**Secrets are server only.** No secret is exposed through a public env prefix. A scan for `NEXT_PUBLIC_*` or `EXPO_PUBLIC_*` combined with SERVICE, SECRET, ANTHROPIC, OPENAI, STRIPE or APP_SECRET returned nothing. The Supabase service role key is referenced only in `lib/supabase.ts` (server), and no client component imports any server lib, so nothing sensitive can end up in the browser or app bundle. The app uses only the Supabase URL and the anon key, which are public by design and gated by row level security.

**Every inbound webhook verifies its sender.** The WhatsApp webhook checks the `x-hub-signature-256` HMAC with a timing safe comparison and rejects anything unsigned. The Stripe webhook verifies the Stripe signature and rejects on failure. The cron route is guarded by a `CRON_SECRET` bearer header. The WhatsApp handler is also idempotent, claiming each message id before work so a retry never double processes.

**Public write and AI endpoints are validated and rate limited.** `draft-invoice` (which spends AI) is rate limited per IP and validates the input length. `onboard` is rate limited, validates and normalises the phone and email, and never logs the personal details. `pay/[id]` only creates a Stripe checkout to pay an existing invoice, which benefits the business, and refuses if already paid. Supabase queries use the parameterised query builder, so there is no SQL injection surface.

**No cross site scripting surface.** React escapes all rendered values. Every `dangerouslySetInnerHTML` in the site injects a static CSS or JSON-LD string built from constants, never from user input. User supplied content (invoice text, vendor names, search terms) is always rendered as escaped JSX.

**No sensitive logging.** Logs carry status codes and error messages only. No log writes a WhatsApp message body, a phone, an email, a token, or a secret. This matches the project rule never to log message content.

**Row level security.** Every user table is select and write scoped to `auth.uid()`. The crown jewel tables (bank_connections, processed_messages, wa_sessions, signups, waitlist, audit_log) have row level security on with no user policies, so only the service role reaches them. The app inserts manual entries with the user id, and the insert policy with check prevents inserting for anyone else.

### The one fix made this pass
The **waitlist** endpoint was the only public write without rate limiting, while its sibling `onboard` had it. Added the same per IP rate limit (12 in 10 minutes) for consistency. Parses clean.

### Hardening recommendations (not vulnerabilities, for scale)
1. **Rate limiting is in memory**, so it only limits within one warm serverless instance. It stops casual flooding and protects AI spend, but for hard guarantees under a distributed attack, move to a shared store such as Upstash Redis. Low priority until traffic is high.
2. **CORS is open on `draft-invoice`** so the app can call it cross origin. It is non sensitive and rate limited, but it could be tightened to known origins later.
3. **No CAPTCHA on the public signup forms.** Rate limiting covers casual abuse. Add a challenge only if spam appears.

**Verdict: the security posture is solid for launch.** Signature verification, idempotency, secret hygiene, RLS, input validation and safe rendering are all in place. The recommendations are scale hardening, not blockers.

---

## Part 2: Build completeness re-audit

### Built and shipped
The buildable surface is, in honest terms, complete. WhatsApp capture by photo, voice and text, categorisation, claim by text for mileage, home, phone and CIS, the invoice flow, money questions, reminders, the tax return walkthrough, the can I claim it checker and the pay less tax tips. The app dashboard with income, expenses, profit, tax saved, set aside, goals, streak, manual quick add, Wrapped, milestones and the review nudge. The Tax tab with the quarter view, figures, CIS refund tracker, prepare summary and the file to HMRC coming soon card. The CIS screen, the can I claim screen, the add screen, goals, wrapped, achievements, the accountant export pack, and the control and privacy card. On the web, the homepage with the free tools showcase, the tax calculator, the invoice and quote generator, the can I claim checker, the file your own return guide, the resources hub, the register your business guide, and twelve trade landing pages. Behind it, the schema with RLS and CIS and the dormant bank scaffolding, the welcome email, the reminders cron on templates, and the monthly newsletter, daily content and weekly tax change watch.

### Small buildable enhancements still open (optional, incremental)
These are nice to have, not gaps that block anything:
- A formal **SA302 / tax year overview** summary for lenders. The export pack is close, this would make it a recognised format.
- An interactive **are you claiming everything** reliefs checklist (marriage allowance, the Annual Investment Allowance on a van or big tools, pension), beyond the current tips.
- A **VAT threshold watch** in the app, you are this far from £90,000.
- **Quote** support in the app, the web generator already does quotes.

### Blocked on outside approvals or people, cannot build yet
These are the real remaining capabilities, and none is a coding problem:
- **MTD Income Tax and VAT filing**, and the **live HMRC balance** view. Need HMRC software recognition (doc 48).
- **Bank feeds.** Need a TrueLayer account (doc 48). The database scaffolding is already laid, dormant.
- **A real accountant on tap**, the **signed accountant certificate** for mortgages, and **HMRC enquiry representation.** Need credentialed humans, a hire or a partnership.
- **Limited company incorporation through us.** Need a Companies House API integration or a formation agent partner.
- **Guided in chat registration submission.** HMRC has no public registration API, so we can assist and pre fill, but the actual submit is the user on GOV.UK.
- **Payroll and RTI**, and **GoCardless** payment. A partner and credentials respectively.

### The one line
Nothing buildable was missed. The product is feature complete on everything that does not require an outside approval, credential or human. The remaining capabilities are all gated on the items in doc 48, which are applications to start, not code to write.

# 05: Compliance

## The Golden Rules (Non-Negotiable)

These rules are not guidelines. They are hard requirements. Every feature must be built around them.

---

## 1. Tax: Prepare → User Approves → Submit

### The Rule
Lekhio **PREPARES** tax information. The user **APPROVES** it. Lekhio **NEVER** files without explicit approval.

HMRC keeps the taxpayer legally responsible at all times. We are a tool, not an accountant, not a tax agent.

### What This Means in Practice
- Quarterly MTD updates are prepared and displayed to the user for review
- The user must take an active approval action (tap APPROVE, confirm in WhatsApp) before anything is sent to HMRC
- The approval must be logged with timestamp and user identifier
- Never use language like "we'll sort your tax", "we'll file for you", "leave it to us"
- Always use language like "prepared for your review", "ready for your approval", "here's what we're submitting: does this look right?"

### MTD ITSA Compliance
- Lekhio must be registered as MTD-compatible software with HMRC
- Submissions go via HMRC's MTD APIs only (direct, not via unauthorised intermediary)
- Quarterly updates are a summary of income and expenses: no tax calculations are legally binding
- End-of-year reconciliation requires accountant or user review
- Keep an immutable audit log of every MTD submission: timestamp, data submitted, HMRC response, user approval record

### What We Never Say
- "We'll do your tax"
- "Your tax is handled"
- "HMRC approved" or anything implying HMRC endorsement
- "Don't worry about your tax bill" (we prepare estimates. they are not guaranteed)

---

## 2. Irreversible Actions: Always Gate

Any action that cannot be undone requires explicit human approval immediately before execution.

### Gated Actions
| Action | Gate Required |
|---|---|
| MTD quarterly submission to HMRC | User approval via WhatsApp or app |
| Ad spend (any Meta or TikTok campaign) | Jag approval before any spend |
| Sending a WhatsApp message to a user on their behalf | Not permitted |
| Job application (Phase 3) | User approval |
| Any payment or financial transfer | Never executed by Lekhio |

### The Gate Pattern
1. Lekhio prepares the action and summarises it clearly
2. Presents to the user: "Here's what I'm about to do: [summary]. Confirm?"
3. User confirms explicitly (APPROVE / YES / tap button)
4. Action executes
5. Confirmation and receipt logged to Supabase with timestamp

No gate = no action. There are no exceptions.

---

## 3. UK GDPR

### Data We Hold
- Phone number (WhatsApp identifier)
- Name and trade type
- Financial transactions (amounts, vendors, categories, dates)
- Original receipt images and voice notes
- MTD submission records

### Rules
- Customer records are stored in the UK (Supabase project region eu-west-2, West Europe London). Application compute runs on Vercel in the US (region iad1), so some processing is a US transfer, covered by the UK extension to the EU to US Data Privacy Framework (Vercel and AWS are certified). Option to move the Vercel function region to London (lhr1) for all-UK residency is noted in doc 99.
- Encryption at rest (Supabase default AES-256) and in transit (TLS 1.2+)
- Least-privilege: only the user can see their own data
- Service role key never exposed to client
- Users can request deletion of all their data (right to erasure): this must be implemented in Phase 1
- Data retention: active user data kept indefinitely. Cancelled user data deleted after 90 days unless longer retention required for tax record purposes (HMRC requires 5 years).
- Privacy policy and terms must be in place before any public launch

### What We Do Not Store
- Card numbers or payment details (Stripe handles these, never touch them)
- Passwords (Supabase Auth handles OTP. no passwords stored)
- WhatsApp message metadata beyond what is needed for the product

---

## 4. WhatsApp / Meta Compliance

- Only send messages to users who have initiated contact with Lekhio (opted in via the Connect WhatsApp flow in the app)
- Marketing messages (outbound, unsolicited) are paid and subject to Meta's template approval process: always use pre-approved templates
- Never send messages that could be classified as spam under Meta's Commerce Policy
- Store the user's WhatsApp opt-in record (timestamp + method) in Supabase
- Provide clear opt-out: "Reply STOP to stop receiving messages from Lekhio"

---

## 5. Financial Promotion

Lekhio provides factual information about the user's finances. It does not:
- Give investment advice
- Advise on tax planning strategies ("you should claim X")
- Guarantee tax estimates (always label as estimates)
- Claim to be an accountant or tax agent

Any text visible to users that could be construed as financial advice must be reviewed before shipping. When in doubt: state facts, not recommendations.

---

## 6. Business Registrations Needed (Before Public Launch)

| Registration | Purpose | Timeline |
|---|---|---|
| HMRC MTD Software Provider | Required to submit MTD updates on behalf of users | Apply when product is built, takes 4 to 12 weeks |
| ICO Data Controller | UK GDPR requirement for any business processing personal data | Register at ico.org.uk, ~£40/year |
| UK Company (Lekhio Ltd or similar) | Legal entity for the business | Companies House, ~£12, instant |
| IPO Trademark (Lekhio) | Protect the brand name | File once name is confirmed and revenue starts |

---

## 7. Audit Log Requirements

Every significant event must be logged immutably:

```sql
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  event_type text not null,     -- mtd_submission, approval, deletion_request, etc.
  event_data jsonb,
  ip_address text,
  created_at timestamptz default now()
);
```

Events to log: MTD submissions (with HMRC response), user approvals, data deletion requests, subscription changes, any admin actions.

---

## 8. Data Breach and Incident Response

> Added 9 July 2026, to satisfy the HMRC production questionnaire and UK GDPR breach duties. This is the process Lekhio follows on any security incident affecting personal or customer data.

Breach contact: Jag (sole director, Lekhio Ltd), info@lekhio.app, plus a contact phone number held on file for HMRC and the ICO.

On becoming aware of a suspected or actual breach:

1. Contain and assess. Take immediate steps to stop or limit the breach (for example rotate a leaked key, disable an affected route, revoke a token). Record what happened, when it was discovered, what data and how many people are affected, and the likely risk to those people.
2. Notify HMRC within 72 hours. If the breach concerns the security of personal or customer data connected to the MTD software, log a ticket on the HMRC Developer Hub support page (developer.service.hmrc.gov.uk/devhub-support) within 72 hours, giving the breach contact name and telephone number.
3. Notify the ICO within 72 hours. If the breach is likely to result in a risk to people's rights and freedoms, report it to the ICO within 72 hours of becoming aware (ico.org.uk report a breach). If it is unlikely to result in a risk, record the decision and the reasons rather than reporting.
4. Notify affected individuals. If the breach is likely to result in a high risk to individuals, tell them without undue delay, in plain language, with what happened and what they can do.
5. Record and review. Log the incident in the audit trail (section 7), including the decision on whether to notify, and review what changed so it cannot recur.

Keep this process current. Review it at least annually and after any incident.

---

## 9. Information Security Self-Assessment (ICO checklist)

> Added 9 July 2026. A dated record that Lekhio has assessed its controls against the ICO information security checklist for small organisations, so the audit answer in the HMRC questionnaire is backed by an actual self-assessment.

Assessed 9 July 2026 against the ICO information security checklist. Controls in place:

- Access control. Row level security on every table scoped to the owning user (auth.uid() = owner), verified in the security audits (docs 88, 96, 97). Least privilege: the service role key is server side only and never reaches the client. Sole operator today; the Supabase organisation has one member (Jag, Owner) with multi factor authentication enabled.
- Encryption. In transit (HTTPS enforced with HSTS, verified A grade on securityheaders.com, 9 July 2026) and at rest (Supabase AES-256). HMRC and bank tokens are stored server side; app level AES-256-GCM token encryption (BANK_TOKEN_KEY) is set before any live token is written.
- Web and application security. Full security header set site wide (CSP with frame-ancestors none, object-src none, base-uri self, form-action self; X-Frame-Options DENY; nosniff; strict referrer and permissions policies). Both inbound webhooks verify their signatures. Public endpoints are rate limited with durable spend caps. No secrets in the repository.
- Data minimisation and retention. We collect only what the service needs (section 3). Cancelled user data is deleted or anonymised after the tax and accounting retention period. Self service export and erasure are provided.
- Testing and review. Repeated security audits (docs 78, 88, 94, 96, 97) plus live external header and TLS scans. Reviewed at least annually and after any material change.
- Breach response. Documented in section 8.

Open items tracked for launch: register with the ICO as a data controller (about 52 pounds a year) before real users; complete the WCAG AA accessibility check on lekhio.app; enable Vercel account MFA.

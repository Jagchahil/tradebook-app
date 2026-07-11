# LEKHIO: Claude Code Context

> "Text it. It's in your Lekhio."

You are building **Lekhio**, a WhatsApp-first back-office assistant for UK self-employed tradespeople. The entire product vision, rules, and plan live in `docs/`. Read them before writing any code. When a decision changes the plan, update the relevant doc first. The docs lead, the code follows.

---

## What Is Lekhio

A WhatsApp-first bookkeeping and tax-prep tool for UK sole traders in trade and construction. Users download the app to onboard and view their data. All day-to-day interaction happens through WhatsApp: photos of receipts, voice notes for expenses, questions about money, invoice capture. Everything is logged, categorised, and stored automatically. Quarterly MTD summaries are prepared and sent to the user for approval before any HMRC submission.

**The promise:** "Text it. It's in your Lekhio."

---

## The Three Pillars (build in this order)

1. **Back-Office (build first, this is the wedge):** WhatsApp receipt/invoice capture via photo and voice, automatic bookkeeping, MTD-ready quarterly tax prep, conversational finance Q&A. Targets all UK self-employed trades: electricians, plumbers, builders, plasterers, roofers, joiners, decorators, tilers, gas engineers, scaffolders, groundworkers, landscapers.
2. **Marketing Engine (Phase 2):** AI-generated ad creatives (video + carousel), one-click campaign launcher for Meta/TikTok. Do not build until Phase 1 is shipped.
3. **Connect (Phase 3):** Trade-specific job matching and profile network. Do not build until Phase 2 is shipped.

---

## Non-Negotiable Rules

### Tax
- We **PREPARE**. The user **APPROVES**. We never "do their tax."
- HMRC keeps the taxpayer legally responsible at all times.
- There is **always a human-approval step** before any MTD filing or submission.
- Submission goes via an MTD-recognised path only.
- Never imply HMRC endorsement. Never use language like "we'll file your tax."

### Irreversible Actions
- **Money, tax filing, job applications, sending messages on behalf of the user:** ALL require explicit human approval.
- Build the approval gate **before** the automation it guards.
- No exceptions.

### Voice-First Design
- Users are time-poor and on-site, not unintelligent.
- If a feature requires a form, redesign it as a conversation.
- Typing is a last resort. WhatsApp voice notes and photo capture are primary inputs.

### Data
- Financial and personal data. UK GDPR applies.
- Encryption at rest and in transit.
- Least-privilege access everywhere.
- Never log WhatsApp message content to external services beyond Supabase.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Backend + webhook | Next.js (App Router) on Vercel |
| Database + Auth | Supabase (Postgres + Supabase Auth + Storage) |
| AI | Anthropic API: claude-sonnet-4-6 for conversation, Claude Vision for receipt parsing |
| WhatsApp | Meta Cloud API (direct, no third-party wrappers) |
| Mobile (Phase 1) | React Native + Expo |
| Payments (Phase 1) | Stripe |

**Do not use** Twilio, 360dialog, or any WhatsApp middleware. Go direct with Meta Cloud API.

**One AI exception.** Voice note transcription uses OpenAI Whisper, because Anthropic has no speech to text. It is isolated in `lib/transcribe.ts`. Everything else stays on Claude. To swap the transcription provider, change only that file.

---

## Phase 0: What You Are Building Now

The single goal of Phase 0: **prove the core WhatsApp loop works end-to-end.**

Done = a user can send a WhatsApp photo of a receipt, Lekhio parses it with Claude Vision, stores it in Supabase, replies to the user on WhatsApp with a confirmation, and the transaction appears in a simple web dashboard.

See `docs/03_BUILD_PLAN.md` for the exact spec.

---

## File Structure (target)

```
/
├── CLAUDE.md                  ← you are here
├── docs/
│   ├── 01_VISION.md
│   ├── 02_PRODUCT.md
│   ├── 03_BUILD_PLAN.md
│   ├── 04_MARKETING.md
│   ├── 05_COMPLIANCE.md
│   └── 06_STACK.md
├── app/                       ← Next.js app (Phase 0 web dashboard + webhook)
│   ├── api/
│   │   └── whatsapp/
│   │       └── route.ts       ← WhatsApp webhook handler
│   └── dashboard/
│       └── page.tsx           ← Simple transaction view
├── lib/
│   ├── whatsapp.ts            ← Meta Cloud API client
│   ├── claude.ts              ← Anthropic API client + receipt parser
│   └── supabase.ts            ← Supabase client
└── supabase/
    └── schema.sql             ← Database schema
```

---

## Environment Variables Required

```
ANTHROPIC_API_KEY=
WHATSAPP_TOKEN=              # Meta Cloud API access token
WHATSAPP_PHONE_NUMBER_ID=    # From Meta developer console
WHATSAPP_VERIFY_TOKEN=       # Self-defined, for webhook verification
WHATSAPP_APP_SECRET=         # Meta app secret, used to verify the x-hub-signature-256 header
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=             # Whisper, voice note transcription only. Claude has no speech to text.
STRIPE_SECRET_KEY=          # Stripe, for subscription and invoice card payments
STRIPE_WEBHOOK_SECRET=      # Stripe, verifies the payment webhook signature
RESEND_API_KEY=            # Resend, to email invoices straight to customers. Optional, invoicing falls back to a shareable link without it.
EMAIL_FROM=                # e.g. Lekhio <invoices@lekhio.app>. The domain must be verified in Resend.
NEXT_PUBLIC_APP_URL=        # The public site URL, e.g. https://lekhio.app. Used in invoice links. Defaults to the Vercel URL.
```

---

## The Domain. Read This Before Writing Any URL

**Our domain is `lekhio.app`. It is the only one we own.**

**`lekhio.com` IS NOT OURS.** It belongs to Lacspace Corporation Pvt. Ltd. (Kathmandu and Nagpur), who sell a B2B/B2C ERP, also called Lekhio, in our adjacent market: invoicing, inventory, finance, with their own mobile apps. It was already taken when we went to buy it, which is why we are on `.app` (see `docs/93`).

Because the docs were written before that, a lot of them said "buy lekhio.com" and the code quietly followed. On 11 July 2026 we found that we had been:

- linking users to a rival's website for our **Privacy Policy and Terms**, both of which 404 there, which is an automatic App Store rejection,
- printing `lekhio.com` on the footer of **every invoice** our users send their customers,
- sending **every referral link** there,
- using `support@lekhio.com`, a mailbox we cannot read,
- **allowlisting their origin in our CORS policy.**

So: never write `lekhio.com` in code, copy, config, or a doc. If you need the site URL in code, use `NEXT_PUBLIC_APP_URL` (set to `https://lekhio.app` in production) or the `SITE` constant, never a hardcoded string.

## What Lekhio Is. Read `docs/104` Before Writing Any Copy Or Positioning.

**Lekhio is not software you buy. It is the first employee a business ever hires.** It prepares. The human approves. That is not a compliance chore, it is the product.

Doc 104 is the doctrine and it sits above every other doc. It holds the positioning, the category ("the business for businesses"), what we will never call ourselves (never "the AI operating system for business", never "we file your tax"), the Apple lessons and where we go further than them, the six marketing angles with the actual lines, and the front door: 17 to 18 million UK adults intend to start a business this year and nobody in our category is talking to them.

**The line: one less button at a time. Until only one is left. Approve.**

Two kinds of authorisation, and we need both. The user's is our moat. The FCA's is our gate. **The approval gate is NOT a regulatory shield.** Preparing an investment and having the user hit run is article 53 AND article 25. See doc 104 section 5 and doc 98.

## What Lekhio Is. Read `docs/104` Before Writing Any Copy Or Positioning.

**Lekhio is not software you buy. It is the first employee a business ever hires.** It prepares. The human approves. That is not a compliance chore, it is the product.

Doc 104 is the doctrine and it sits above every other doc. It holds the positioning, the category ("the business for businesses"), what we will never call ourselves (never "the AI operating system for business", never "we file your tax"), the Apple lessons and where we go further than them, the six marketing angles with the actual lines, and the front door: 17 to 18 million UK adults intend to start a business this year and nobody in our category is talking to them.

**The line: one less button at a time. Until only one is left. Approve.**

Two kinds of authorisation, and we need both. The user's is our moat. The FCA's is our gate. **The approval gate is NOT a regulatory shield.** Preparing an investment and having the user hit run is article 53 AND article 25. See doc 104 section 5 and doc 98.

## Design Restraint. Read `docs/103` Before Adding Anything To A Screen.

**A feature is not free because it is small.** Every button is a decision handed to the user, and every row is a thing he has to read and reject before he reaches what he came for. Ten helpful additions make an unhelpful product, and nobody is ever blamed for adding just one.

The bar is not "is this useful". Almost anything is useful to someone. The bar is: **does it earn a place on the screen a man opens when he wants to know what he owes?** He is up a ladder with one hand on the rail. He is not exploring.

Four tests. Fail one and it goes:

1. **The once test.** He checks his student loan plan once in his life. Anything he touches less than monthly goes behind a Tools row.
2. **The empty test.** A row that says "nothing to check" most of the time teaches him to stop looking, and then he misses the week it matters. Show it when it matters, hide it when it does not.
3. **The honesty test.** A button whose only function is an alert saying the feature does not exist yet is an advert for our roadmap, not a button.
4. **The alignment test.** Never reward him for the manual work the product exists to remove. A "logging streak" congratulates him for doing our job.

**The best button is no button.** Do the thing, and tell him plainly what you did. If he set a category, that IS the lesson: take it, say so, and put an undo in Settings. Never ask a question with only one sensible answer.

**The hard limit:** money, tax filing, and anything sent to another human being ALWAYS ask. Acting for him is only kindness when it is reversible and it is his.

**The standing question, whenever anything is added: what did we take out to make room for it?**

## Writing Rules

- No em dashes, no en dashes, no hyphens used as dashes
- Use a full stop or rewrite the sentence instead
- Applies to all copy: UI, WhatsApp messages, docs, comments

---

## Working Rules for Claude Code

1. TypeScript everywhere. No plain JS.
2. All Supabase queries go through `lib/supabase.ts`. Never inline.
3. All WhatsApp sends go through `lib/whatsapp.ts`. Never inline.
4. All Claude API calls go through `lib/claude.ts`. Never inline.
5. Error handling on every WhatsApp webhook response. Meta requires a 200 within 5 seconds or retries.
6. Never store WhatsApp message content in logs or console.
7. Validate the `x-hub-signature-256` header on every incoming webhook.
8. When in doubt, check `docs/05_COMPLIANCE.md` before implementing anything tax or money related.

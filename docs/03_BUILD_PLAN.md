# 03: Build Plan

## Principle

Build the smallest thing that proves the idea works, then expand. Every phase has a single clear "done" condition. Do not move to the next phase until the current one is proven.

---

## Phase 0. The Core Loop (Target: 2 to 3 weeks)

**Goal:** Prove the WhatsApp → Claude → Supabase → WhatsApp reply loop works end-to-end.

**Done when:** A real person sends a photo of a receipt to the Lekhio WhatsApp number, and within 10 seconds:
1. The receipt is parsed (amount, vendor, category, date extracted correctly)
2. A confirmation reply arrives on WhatsApp
3. The transaction appears in the web dashboard

### What to Build

#### A. Supabase Schema
```sql
-- Users table
create table users (
  id uuid primary key default gen_random_uuid(),
  phone_number text unique not null,  -- WhatsApp number, E.164 format
  name text,
  trade_type text,
  created_at timestamptz default now()
);

-- Transactions table
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  amount numeric(10,2) not null,
  vendor text,
  category text,           -- materials, fuel, tools, subcontractors, other
  transaction_date date not null,
  description text,
  source_type text,        -- photo, voice, text
  raw_input_url text,      -- Supabase Storage URL of original image/audio
  confidence_score numeric, -- Claude's confidence in parse
  confirmed boolean default true,
  created_at timestamptz default now()
);

-- Monthly summaries (materialised, updated on each transaction insert)
create table monthly_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  year int not null,
  month int not null,
  total_income numeric(10,2) default 0,
  total_expenses numeric(10,2) default 0,
  transaction_count int default 0,
  updated_at timestamptz default now(),
  unique(user_id, year, month)
);
```

#### B. WhatsApp Webhook (`/api/whatsapp/route.ts`)
- GET handler: responds to Meta webhook verification (echo `hub.challenge`)
- POST handler:
  1. Validate `x-hub-signature-256` header. reject if invalid
  2. Parse incoming message type: text / image / audio
  3. Look up user by `from` phone number. auto-create if new
  4. Route to correct handler based on message type
  5. Return 200 immediately (within 5 seconds. Meta requirement)
  6. Process async (use Vercel background or queue)

#### C. Claude Integration (`/lib/claude.ts`)
Receipt parsing prompt:
```
You are parsing a receipt or expense photo for a UK sole trader.
Extract the following and return ONLY valid JSON:
{
  "amount": number (in GBP, no currency symbol),
  "vendor": string (shop or supplier name),
  "category": "materials" | "fuel" | "tools" | "subcontractors" | "food" | "other",
  "date": "YYYY-MM-DD" (use today if not visible),
  "confidence": 0.0 to 1.0 (your confidence in this parse)
}
If you cannot determine the amount, return null for amount.
```

For text/voice: parse with a conversation extraction prompt, same output schema.

#### D. WhatsApp Reply (`/lib/whatsapp.ts`)
- `sendMessage(to, text)`: send text message via Meta Cloud API
- `downloadMedia(mediaId)`: download image/audio from Meta servers
- Format confirmation: `✓ £{amount}: {vendor}, {category}, {date}. {month} total: £{monthTotal}.`

#### E. Web Dashboard (`/app/dashboard/page.tsx`)
- No auth for Phase 0 (use a fixed phone number for testing)
- Shows all transactions in reverse chronological order
- Columns: date, vendor, category, amount
- Running monthly total at top
- Bare minimum styling: this is internal only

### Environment Setup
```bash
# Create Next.js project
npx create-next-app@latest tradebook --typescript --app --tailwind

# Install dependencies
npm install @supabase/supabase-js @anthropic-ai/sdk

# Deploy to Vercel
vercel --prod
```

### Meta Webhook Setup
1. Go to developers.facebook.com → Your App → WhatsApp → Configuration
2. Set webhook URL: `https://[your-vercel-url]/api/whatsapp`
3. Set verify token: match `WHATSAPP_VERIFY_TOKEN` env var
4. Subscribe to: `messages`

---

## Phase 1. Native App + Auth + Subscriptions (Target: 4 to 6 weeks after Phase 0)

**Done when:** A new user can download the app from TestFlight (iOS) or Play Store (Android), sign up, link WhatsApp, and use Lekhio for 30 days on a free trial, then convert to a paying £12.99/mo subscriber.

### What to Build
- React Native + Expo app (iOS + Android)
- Supabase Auth (phone OTP. no email, no password, no friction)
- The 5 screens from `02_PRODUCT.md`
- Stripe subscription (£12.99/mo, 30-day free trial)
- WhatsApp linking flow (deep link to pre-filled message)
- Push notifications for: quarterly due date reminders, weekly summary
- Basic subscription management (cancel, reactivate)

---

## Phase 2. Marketing Engine (Target: parallel with Phase 1 or after)

**Done when:** The system can generate 5 ad creatives per week (video via Higgsfield + static carousels) and publish them to Meta Ads Manager and TikTok with one approval step from Jag.

### What to Build
- Creative brief generator (Claude generates hooks, scripts, copy)
- Higgsfield API integration for video generation
- Carousel image generation
- Meta Ads API integration (create campaign, ad set, ad)
- TikTok Ads API integration
- Approval interface (Jag reviews → approves → publishes)
- Weekly performance pull (CPM, CTR, CPA) → Claude analysis → brief for next week

---

## Phase 3. Connect (Jobs Network)

**Do not start until Phase 1 has 1,000 paying users.**

A trade-specific job matching network. profile, work showcase, voice-first CV builder, job matching, assisted applications. Requires supply (employers) AND demand (workers). Cold-start problem only solvable with an existing user base.

---

## Accounts & Keys Needed (Phase 0)

| Service | Status | Action |
|---|---|---|
| GitHub (private repo) |. | Create repo: `tradebook-app` |
| Vercel |. | Create account, connect GitHub |
| Supabase |. | Create project: `tradebook-prod` |
| Anthropic API |. | Get key from console.anthropic.com |
| Meta Developer App |. | Create at developers.facebook.com |
| WhatsApp Business Account |. | Apply via Meta Business Manager, use spare phone number |
| WhatsApp Sandbox | ✓ use while waiting | 5 test numbers available immediately |

---

## Current Status

**Phase:** 0. not started
**Next action:** Claude Code to initialise project and build Phase 0 (see `06_STACK.md` for stack detail)

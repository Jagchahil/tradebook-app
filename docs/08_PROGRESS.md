# 08: Build Progress

> This document is the handoff for every new Claude session. Read it before touching any code.
> Always build with Claude's recommendation. When Claude suggests an approach, go with it unless there is a clear reason not to. This saves time and keeps the build coherent.

---

## Update 2026-06-25: Lekhio rebrand and feature build

**The product is now Lekhio**, owned by **Lekhio Ltd** (the parent company, named after the river through the founders' villages). The old name TradeBook is fully retired. The product is positioned for ANY UK self employed person, not just trades. Trades is the first ad campaign, not the brand.

Brand: river blue `#1B59A6` and saffron gold `#E0A33E` on warm paper `#FBFAF7`. Logo is the Lekhio wordmark with a river running beneath it. See `docs/07_BRAND.md`. Logo file at `tradebook-web/public/lekhio-logo.svg`.

Built and pushed since the rebrand:
- Website fully redesigned: premium, minimal, animated (flowing river, scroll reveals), with a universal "who it is for" section.
- App recoloured to the river palette, animated welcome, universal copy, plus a "Your business details" screen (`app/profile.tsx`) that fills the invoice From line.
- WhatsApp now does a lot more than capture:
  - Photo, voice, and typed capture of income and expenses.
  - "create invoice" runs a guided flow and produces a shareable invoice. If the customer contact is an email and Resend is configured, it emails the invoice directly.
  - "help" or "hi" returns a friendly menu of what Lekhio can do.
  - Money questions ("how much did I spend on fuel?") are answered from the user's own figures via Claude.
- Stripe pay-now on invoices, idempotent webhook, auto-books income.

New env vars (all optional, features degrade gracefully without them): `WHATSAPP_APP_SECRET`, `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_APP_URL`. Full list in `CLAUDE.md`.

New tables since the audit: `invoices`, `wa_sessions` (WhatsApp conversation state), plus `business_name` and `address` columns on `users`, and a `raw_whatsapp_message_id` column on `transactions`. All in `supabase/schema.sql`, all run on prod.

Repos and infra still carry the old "tradebook" names (folders `tradebook-app` / `tradebook-web`, GitHub `tradebook-mobile` / `tradebook-app`, Vercel `tradebook-app-five.vercel.app`). These are infrastructure names, not user facing, and can be renamed when convenient. Nothing breaks if left.

Outstanding, founder only: register `lekhio.app` and `lekhio.co.uk`, point the domain at Vercel and set `NEXT_PUBLIC_APP_URL`, trademark check on Lekhio, `support@lekhio.app` mailbox, and the live accounts in `docs/13_GO_LIVE_RUNBOOK.md`.

---

## Standing Rules (learned the hard way)

1. **Keep RLS on. Do not disable it. (Updated 2026-06-24 after the audit.)**
   The old rule here said to disable RLS so inserts would work. That was a security
   hole. Anyone with the public anon key could read or overwrite any user's data, and
   reads of real transactions were broken too. The fix is in `supabase/schema.sql`:
   RLS is on, each person can read only their own rows, and the server does its writes
   with the service role key, which bypasses RLS. So:
   - App reads (anon key): allowed only for the signed in owner, by policy.
   - Server writes (webhook, waitlist): use the service role key, which ignores RLS.
   - Never run `disable row level security` to make an insert work. Move the insert to
     the server with the service role key instead.
   See `docs/09_AUDIT.md` for the full reasoning.

2. **Never use supabase-js in Next.js API routes for inserts/updates.**
   The supabase-js client caches the schema and goes stale after any schema change, causing PGRST204 errors.
   Always use raw `fetch` against the Supabase REST API directly. See `tradebook-web/app/api/waitlist/route.ts` for the working pattern.

3. **Always wait for Vercel deployment to reach "Ready" before testing.**
   Deployments take 30 to 60 seconds. Testing before Ready means testing the old code.

---

## How We Build

All day-to-day code is written in Cowork (this chat). Files are saved to the workspace folder then copied to the actual repo and pushed. Never edit the repo files directly without also updating the workspace copies.

**Workspace folder (where Cowork writes files):**
- Landing page: `~/Documents/Claude/Projects/Tradesman/tradebook-web/`
- Mobile app: `~/Documents/Claude/Projects/Tradesman/tradebook-app/`
- Docs: `~/Documents/Claude/Projects/Tradesman/docs/`

**Actual repos (where git lives):**
- Landing page: `~/Projects/tradesman/tradebook/`
- Mobile app: `~/Projects/tradesman/tradebook-app/`

**Copy and push pattern for landing page:**
```bash
cp -r ~/Documents/Claude/Projects/Tradesman/tradebook-web/app/early-access ~/Projects/tradesman/tradebook/app/
cp ~/Documents/Claude/Projects/Tradesman/tradebook-web/app/api/waitlist/route.ts ~/Projects/tradesman/tradebook/app/api/waitlist/route.ts
cd ~/Projects/tradesman/tradebook && git add -A && git commit -m "..." && git push
```

**Copy and push pattern for mobile app:**
```bash
cp ~/Documents/Claude/Projects/Tradesman/tradebook-app/lib/supabase.ts ~/Projects/tradesman/tradebook-app/lib/supabase.ts
cp ~/Documents/Claude/Projects/Tradesman/tradebook-app/app/\(auth\)/*.tsx ~/Projects/tradesman/tradebook-app/app/\(auth\)/
cp ~/Documents/Claude/Projects/Tradesman/tradebook-app/app/\(tabs\)/*.tsx ~/Projects/tradesman/tradebook-app/app/\(tabs\)/
cd ~/Projects/tradesman/tradebook-app && git add -A && git commit -m "..." && git push
```

Metro hot-reloads on save. For cache issues: `npx expo start --clear`.

---

## Repos

| Repo | Local path | GitHub |
|---|---|---|
| Landing page | `~/Projects/tradesman/tradebook/` | Jagchahil/tradebook-app |
| Mobile app | `~/Projects/tradesman/tradebook-app/` | Jagchahil/tradebook-mobile |

---

## What Has Been Built

> Update 2026-06-24. A full front-end build and a deep audit landed today. The
> subsections below predate it in places. The current state is:
> - Landing page: full marketing homepage, plus `/privacy` and `/terms`. Live.
> - App: every screen polished, a subscribe screen added between phone and tabs,
>   the phone screen rebuilt (it was broken), and a set of logic bugs fixed.
> - Database: `supabase/schema.sql` defines all tables and the RLS policies.
> - WhatsApp webhook and its `lib/` clients are built and pushed.
> See `docs/09_AUDIT.md` for every fix and the items that still need your action.

### 1. Landing Page

**Status:** Live on Vercel. Auto-deploys on push to main.

**Stack:** Next.js App Router, Tailwind CSS, deployed via Vercel GitHub integration.

**Pages:**

`/` (homepage)
- Lekhio wordmark, headline, waitlist form (original)
- All copy cleaned per brand rules (no dashes)

`/early-access`
- Dedicated early access signup page
- UK phone input (+44 prefix) and optional email field
- Posts to `/api/waitlist`
- Success state: "You're on the list."
- Fully inline styles (Tailwind not available in this file)
- File: `tradebook-web/app/early-access/page.tsx`

**API routes:**

`/api/waitlist` (POST)
- Accepts `{ phone, email }`
- Uses raw fetch to Supabase REST API (not supabase-js, to avoid schema cache issues)
- Inserts phone into `waitlist` table
- Returns `{ ok: true }` on success
- File: `tradebook-web/app/api/waitlist/route.ts`
- Confirmed working: test entry saved to Supabase on 2026-06-24

---

### 2. Mobile App

**Status:** Built and in GitHub. Development build installed on Samsung via EAS. Runs on Chrome at `localhost:8082` via `npx expo start --web`.

**Stack:** React Native, Expo SDK 56, expo-router, TypeScript, Supabase JS client.

**Auth flow:**

`app/(auth)/_layout.tsx`
- Stack navigator wrapping auth screens
- `slide_from_right` animation
- `headerShown: false`

`app/(auth)/index.tsx` (Welcome screen)
- Lekhio wordmark, top-left
- FREE badge
- Headline: "Your back office. In your pocket."
- Subtext explaining WhatsApp receipt capture
- "Works through WhatsApp" pill (green dot + text)
- "Get started" button navigates to phone screen
- "Free. No card needed." note below button
- Brand colours throughout

`app/(auth)/phone.tsx` (Phone input screen)
- "What's your number?" heading
- UK flag + +44 prefix input (phone-pad keyboard, maxLength 14)
- Back button top-left
- Continue button: triggers `signInAnonymously()`, then calls `saveUserPhone()` to store phone in `users` table, then navigates to `/(tabs)/`
- Error state for numbers under 10 digits
- Loading spinner on Continue while async calls run
- KeyboardAvoidingView + TouchableWithoutFeedback (dismiss keyboard on tap)

`app/_layout.tsx` (Root layout)
- Reads auth session via Supabase listener
- Redirects unauthenticated users to `/(auth)`
- Redirects authenticated users away from auth screens

**Tab bar (`app/(tabs)/_layout.tsx`):**
- Four tabs: Dashboard, Transactions, Tax, Settings
- Indigo active tint (`#1B59A6`), grey inactive
- Emoji icons (no icon library dependency)

**Dashboard (`app/(tabs)/index.tsx`):**
- Lekhio wordmark header + FREE badge + current month/year (right-aligned)
- Android status bar padding fix
- Three summary cards: Income (green `#10B981`), Expenses (red `#EF4444`), Profit (indigo `#1B59A6`)
- Cards show £0.00 until real transaction data flows in
- Indigo WhatsApp prompt strip: "Send a receipt on WhatsApp to get started"
- Recent transactions section with empty state (receipt emoji + "No transactions yet")
- Web layout: max-width 680px, centred, card shadows

**Transactions (`app/(tabs)/transactions.tsx`):**
- Search bar (filters by merchant name, case-insensitive)
- SectionList grouped by date: "Today", "Yesterday", or formatted date string
- Each row: category emoji in coloured circle, merchant name, category label, coloured amount
- Empty state when no results match search
- Calls `getTransactions(userId)` from `lib/supabase.ts` on mount

**Tax (`app/(tabs)/tax.tsx`):**
- Current UK tax quarter calculated from today's date (e.g. "Q1 2026/27: Apr to Jun")
- Income card, Expenses card, Estimated profit row for the quarter
- Compliance note: "Lekhio prepares your summary. You approve before anything is sent to HMRC."
- "Prepare MTD Summary" button (shows Alert, no backend action yet)
- Tax year runs Apr to Mar

**Settings (`app/(tabs)/settings.tsx`):**
- Account section: displays phone number from auth session, plan ("Free"), upgrade CTA
- Preferences section: tax year display, currency (GBP)
- About section: version, privacy policy placeholder, terms placeholder
- Sign out button: calls `supabase.auth.signOut()` and redirects to welcome screen

**Key library files:**

`lib/supabase.ts`
- Supabase client using `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- Session persisted via `AsyncStorage`
- `getTransactions(userId)`: fetches transactions for a user, returns empty array on any error (safe for empty state)
- `signInAnonymously()`: creates anonymous Supabase auth session, throws on error
- `saveUserPhone(userId, phone)`: upserts `{ id, phone_number }` into `users` table. Non-fatal if it fails (user stays signed in).

`hooks/useCurrentUser.ts`
- Subscribes to `supabase.auth.onAuthStateChange`
- Returns `{ user, session, loading }`

---

### 3. Supabase Database

**Project:** tradebook-prod (`cqlzqzzkqashtwvimfbk`)

| Table | RLS | Columns | Notes |
|---|---|---|---|
| `users` | Disabled | `id` (uuid, PK), `phone_number` (text), `name` (text), `trade_type` (text), `created_at` | Phone saved on anonymous sign-in |
| `transactions` | Default | `id`, `user_id` (FK), `merchant_name`, `amount` (numeric), `category`, `transaction_type` (income/expense), `receipt_url`, `raw_whatsapp_message_id`, `created_at` | Empty until WhatsApp webhook wired |
| `monthly_summaries` | Default | `id`, `user_id` (FK), `year`, `month`, `total_income`, `total_expenses`, `created_at` | Empty until data flows |
| `waitlist` | Disabled | `id` (uuid), `phone` (text), `email` (text, nullable), `created_at` | Live. First entry confirmed 2026-06-24. |

---

## Brand Rules

From `docs/07_BRAND.md`:

- **Name:** Lekhio. Capital T, capital B, no space.
- **Colours:** Ink `#111111`, Indigo `#1B59A6`, Indigo tint `#E9F1FA`, Off-white `#FBFAF7`, Surface `#F2F0EA`
- **No em dashes, no en dashes, no hyphens as dashes** in any copy. Use a full stop or rewrite.
- **Voice:** Direct, short sentences. No jargon. Time-poor tradespeople on a job site.

---

## Services

| Service | Status | Notes |
|---|---|---|
| Supabase | Active | tradebook-prod. All 4 tables live. Schema and RLS in `supabase/schema.sql`. Run it to enable RLS. |
| Vercel | Active | Landing page auto-deploys from GitHub. |
| Anthropic API | Needs credits | $5 top-up switches on WhatsApp receipt parsing. Webhook is built and waiting. |
| Meta WhatsApp | Not started | Webhook is built. Need a Business account, a number, and to set the webhook URL plus app secret. |
| Stripe | Not started | £12.99/month subscription, 30-day free trial. Need account + test keys. |
| Twilio | Not started | Phone OTP auth. ~$15/month. Budget required. |
| Apple Developer | Not started | $99/year for App Store listing. |
| Google Play | Not started | $25 one-time for Play Store listing. |

---

## Current User Flow (as built)

```
Website
  → lands on homepage
  → clicks early access CTA
  → /early-access page
  → submits UK phone number
  → "You're on the list."
  → stored in Supabase waitlist table

Mobile app
  → opens
  → Welcome screen (brand, value prop)
  → Enter phone number
  → Anonymous Supabase sign-in
  → Phone saved to users table as +44XXXXXXXXXX
  → Dashboard (empty state, no transactions yet)
```

---

## What Is Not Built Yet

### Stripe subscription (next up)
- Plan: £12.99/month, 30-day free trial
- Needs: Stripe account, test secret key, product + price created in Stripe dashboard
- To build: checkout API route in `tradebook-web`, subscribe screen in app, success page
- The subscribe screen will sit between phone entry and the main tabs

### Phone OTP (blocked on budget)
- Anonymous sign-in is the current workaround. Users have a Supabase identity but it is not verified.
- When ready: add Twilio to Supabase Auth settings, update `phone.tsx` to use `supabase.auth.signInWithOtp()` and add an OTP entry screen.
- The phone screen already collects the number. The wiring is the only change.

### WhatsApp webhook (built 2026-06-24, awaiting go-live)
The full loop is written, pushed, and the security parts are tested. It is not yet
connected to Meta and the receipt parsing is dormant until Anthropic credits are added.

- `tradebook-web/app/api/whatsapp/route.ts`. GET verify handshake. POST validates the
  `x-hub-signature-256` signature, then handles the message. Always answers 200 for
  genuine Meta traffic. Idempotent on the WhatsApp message id.
- `tradebook-web/lib/whatsapp.ts`. Signature check, media download, send text.
- `tradebook-web/lib/claude.ts`. Receipt parsing with Claude Vision into merchant,
  amount, and category.
- `tradebook-web/lib/supabase.ts`. Server side REST access with the service role key.
  Finds the user by phone, idempotency check, inserts the transaction.
- Receipt photo flow: download image, parse with Claude, find user by phone, insert,
  reply with a confirmation. Other message types get a helpful reply.
- To go live: run `supabase/schema.sql`, set the WhatsApp and Anthropic env vars in
  Vercel, point the Meta webhook at `/api/whatsapp`, top up Anthropic credits.
- New env var added: `WHATSAPP_APP_SECRET` for the signature check.

### App Store / Play Store
- No listings. Distribution is currently via EAS development build on Samsung only.
- When ready: Apple Developer ($99/year), Google Play ($25 one-time).

---

## Next Actions (in order)

1. **Set up Stripe account and get test keys**
   - Create account at stripe.com
   - Go to Developers → API keys → copy test secret key (`sk_test_...`)
   - Create a product: "Lekhio" with price £12.99/month (recurring)
   - Copy the price ID (`price_...`)
   - Add to Vercel env vars: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `NEXT_PUBLIC_APP_URL`
   - Add to app `.env.local`: `EXPO_PUBLIC_API_URL=https://your-vercel-url.vercel.app`

2. **Build Stripe subscription flow**
   - `tradebook-web/app/api/stripe/checkout/route.ts`: creates Checkout session, returns URL
   - `tradebook-web/app/subscribe/success/page.tsx`: post-checkout success page
   - `tradebook-app/app/(auth)/subscribe.tsx`: "Start your free trial" screen, opens Stripe Checkout URL in browser
   - Update `phone.tsx` to navigate to `/subscribe` after sign-in

3. **Add $5 Anthropic API credits**
   - Unblocks the entire Phase 0 core loop

4. **Set up Meta WhatsApp Business account**
   - Free. Go to developers.facebook.com, create app, add WhatsApp product, register a phone number.
   - Wire webhook URL to `https://your-vercel-url.vercel.app/api/whatsapp`

5. **Wire WhatsApp webhook end-to-end**
   - Once Meta account and Anthropic credits are in place, complete `app/api/whatsapp/route.ts`:
     receipt photo → Claude Vision parse → Supabase insert → WhatsApp reply

6. **Phone OTP** (when Twilio budget available)
   - Add Twilio to Supabase Auth, update phone screen to use OTP flow

# 08: Build Progress

> This document is the handoff for every new Claude session. Read it before touching any code.
> Always build with Claude's recommendation. When Claude suggests an approach, go with it unless there is a clear reason not to. This saves time and keeps the build coherent.

---

## Standing Rules (learned the hard way)

1. **Disable RLS on every new table immediately after creation.**
   Run this right after `create table`:
   ```sql
   alter table <table_name> disable row level security;
   ```
   Supabase enables RLS by default. Without this, all inserts from the API will fail with a 42501 policy violation.

2. **Never use supabase-js in Next.js API routes for inserts/updates.**
   The supabase-js client caches the schema and goes stale after any schema change, causing PGRST204 errors.
   Always use raw `fetch` against the Supabase REST API directly. See `tradebook-web/app/api/waitlist/route.ts` for the pattern.

3. **Always wait for Vercel deployment to reach "Ready" before testing.**
   Deployments take 30 to 60 seconds. Testing before Ready means testing the old code.

---

## How We Build

All day-to-day code is written by Claude Code (the CLI tool running in terminal). Cowork (this chat) is used for planning, reviewing screenshots, and directing what to build next. Claude Code writes and commits the code. Cowork reviews the result and gives the next instruction.

The copy/push pattern: Claude Code writes files to the workspace folder at `~/Documents/Claude/Projects/Tradesman/tradebook-app/`. The actual repo lives at `~/Projects/tradesman/tradebook-app/`. After each Claude Code session, copy files across and push:

```bash
cp ~/Documents/Claude/Projects/Tradesman/tradebook-app/app/\(tabs\)/*.tsx ~/Projects/tradesman/tradebook-app/app/\(tabs\)/
cp ~/Documents/Claude/Projects/Tradesman/tradebook-app/lib/supabase.ts ~/Projects/tradesman/tradebook-app/lib/supabase.ts
cd ~/Projects/tradesman/tradebook-app && git add -A && git commit -m "..." && git push
```

The same pattern applies for the landing page. Files are written to `~/Documents/Claude/Projects/Tradesman/tradebook-web/` and must be copied to `~/Projects/tradesman/tradebook/`:

```bash
cp -r ~/Documents/Claude/Projects/Tradesman/tradebook-web/app/early-access ~/Projects/tradesman/tradebook/app/
cp -r ~/Documents/Claude/Projects/Tradesman/tradebook-web/app/api/waitlist ~/Projects/tradesman/tradebook/app/api/
cd ~/Projects/tradesman/tradebook && git add -A && git commit -m "..." && git push
```

Metro hot-reloads on save. For cache issues: `npx expo start --clear`.

---

## What Has Been Built

### Landing Page (live)
- Next.js app deployed to Vercel
- Repo: `~/Projects/tradesman/tradebook/`
- URL: live on Vercel (check Vercel dashboard for exact URL)
- Waitlist form on the page
- All dashes removed from copy per brand rules
- Stack: Next.js App Router, Tailwind, deployed via Vercel GitHub integration

#### Early access page (built, not yet copied to repo)
- Route: `/early-access`
- Phone number input (UK, +44 prefix) and optional email
- Posts to `/api/waitlist` which inserts into Supabase `waitlist` table
- Success state shown after submission
- Files in workspace at `~/Documents/Claude/Projects/Tradesman/tradebook-web/`:
  - `app/early-access/page.tsx`
  - `app/api/waitlist/route.ts`
- Copy commands above. Push to Vercel via GitHub.

### Mobile App (development build)
- Repo: `~/Projects/tradesman/tradebook-app/` and on GitHub at `github.com/Jagchahil/tradebook-mobile`
- Stack: React Native + Expo SDK 56, expo-router, TypeScript, Supabase
- Running: `npx expo start` for mobile (Samsung dev build via EAS), `npx expo start --web` for Chrome at `localhost:8082`
- EAS Build profile set up for Android APK (development build installed on Samsung)

#### Screens built

**Welcome (`app/(auth)/index.tsx`)**
- TradeBook wordmark + FREE badge
- "Your back office. In your pocket." headline
- Tagline explaining WhatsApp receipt capture
- "Works through WhatsApp" pill
- "Get started" button navigates to phone screen
- "Free. No card needed." subtext

**Phone (`app/(auth)/phone.tsx`)**
- "What's your number?" heading
- UK flag + +44 prefix input field
- Continue button triggers anonymous sign-in (Supabase) then navigates to tabs
- Error state for short/invalid numbers
- Keyboard-aware layout

**Auth layout (`app/(auth)/_layout.tsx`)**
- Stack navigator with slide-from-right animation

**Dashboard (`app/(tabs)/index.tsx`)**
- TradeBook wordmark header with FREE badge and month/year
- Three summary cards: Income (green), Expenses (red), Profit (indigo)
- Indigo WhatsApp prompt strip
- Recent transactions list (empty state with icon when no data)
- Android status bar padding fix
- Web: max-width 680px, centred, boxShadow for cards

**Transactions (`app/(tabs)/transactions.tsx`)**
- Search bar filtering by merchant name
- SectionList grouped by date (Today, Yesterday, date label)
- Category emoji icons in circles
- Coloured amounts

**Tax (`app/(tabs)/tax.tsx`)**
- Current UK tax quarter label (e.g. Q1 2026/27: Apr to Jun)
- Income and expenses cards for the quarter
- Estimated profit row
- Compliance note: "TradeBook prepares your summary. You approve before anything is sent to HMRC."
- "Prepare MTD Summary" button (shows Alert, no action yet)

**Settings (`app/(tabs)/settings.tsx`)**
- Account section: phone number, plan, upgrade CTA
- Preferences section: tax year, currency
- About section: version, privacy policy, terms
- Sign out button

**Tab bar (`app/(tabs)/_layout.tsx`)**
- Four tabs: Dashboard, Transactions, Tax, Settings
- Indigo active tint, grey inactive
- Emoji icons

#### Key files
- `lib/supabase.ts`: Supabase client, `getTransactions()`, `signInAnonymously()`. All Supabase errors treated as empty array.
- `hooks/useCurrentUser.ts`: auth state listener returning `{ user, session, loading }`
- `app/_layout.tsx`: root Stack, redirects unauthenticated to `/(auth)`

---

## Supabase Tables (all created in tradebook-prod)

| Table | Status | Notes |
|---|---|---|
| `users` | Created | phone_number, name, trade_type |
| `transactions` | Created | Full schema per docs/03_BUILD_PLAN.md |
| `monthly_summaries` | Created | Per-user year/month aggregates |
| `waitlist` | Created | phone, email, created_at |

---

## Brand Rules (from `docs/07_BRAND.md`)

- **Name:** TradeBook. T and B capitalised, rest lowercase.
- **Colours:** Ink `#111111`, Indigo `#4F46E5`, Indigo tint `#EEF2FF`, Off-white `#FAFAFA`, Surface `#F4F4F4`
- **No em dashes, no en dashes, no hyphens used as dashes.** Full stop or rewrite instead.
- Voice: direct, short sentences, no jargon

---

## What Is Not Built Yet

### Auth (blocked on budget)
- Phone OTP requires Twilio (~$15/month). Not set up yet.
- Current workaround: anonymous sign-in. Users are not identified.
- When Twilio budget is available: wire up phone OTP in `app/(auth)/phone.tsx`. The screen already collects the number.

### Transactions data
- The `transactions` table is created but no data flows into it yet.
- Blocked on WhatsApp webhook being wired up end-to-end.

### WhatsApp webhook (Phase 0 core loop)
- `app/api/whatsapp/route.ts` exists in the Next.js app but is not wired to Meta Cloud API yet.
- Blocked on: Anthropic API credits ($5 top-up needed) for Claude Vision receipt parsing.
- Meta WhatsApp Business account needs a phone number registered.
- Once Anthropic credits are added: wire the webhook, test end-to-end receipt → parse → Supabase → WhatsApp reply → dashboard.

### Landing page early access CTA
- Files built in workspace at `~/Documents/Claude/Projects/Tradesman/tradebook-web/`.
- Not yet copied to the landing page repo or deployed.
- Copy commands in the "How We Build" section above.

### App onboarding in repo
- Onboarding screens built in workspace, not yet copied to `~/Projects/tradesman/tradebook-app/`.
- Files: `app/(auth)/index.tsx`, `app/(auth)/phone.tsx`, `app/(auth)/_layout.tsx`

### App Store / Play Store
- No listings yet. Apple Developer $99/year, Play Store $25 one-time.
- Interim: early access page on website collects sign-ups.

### Stripe payments
- Not started. Phase 1 item.
- Plan: £29/month subscription, 30-day free trial.

---

## Current User Flow (as built)

```
Website (Vercel) → user lands → joins waitlist (original form)
Mobile app → opens → welcome screen → phone input → anonymous sign-in → Dashboard (empty state)
```

## Target User Flow (next milestone)

```
Website → "Get early access" → /early-access page → submits phone/email → on waitlist
App → Welcome screen → Enter phone → OTP verify → Dashboard
WhatsApp → photo of receipt → parsed → stored → appears in app
```

---

## Repos

| Repo | Path | Notes |
|---|---|---|
| Landing page | `~/Projects/tradesman/tradebook/` | Next.js, deployed Vercel |
| Mobile app | `~/Projects/tradesman/tradebook-app/` | Expo SDK 56, GitHub: Jagchahil/tradebook-mobile |

---

## Services and Credentials

| Service | Status | Notes |
|---|---|---|
| Supabase | Active | Project: tradebook-prod. All 4 tables created. |
| Vercel | Active | Landing page deployed |
| Anthropic API | Needs credits | Add $5 to unblock WhatsApp receipt parsing |
| Meta WhatsApp | Not started | Need Business account and phone number |
| Twilio | Not started | Needed for phone OTP auth. Budget required. |
| Apple Developer | Not started | $99/year for App Store |
| Google Play | Not started | $25 one-time for Play Store |
| Stripe | Not started | Phase 1 |

---

## Next Actions (in order)

1. **Copy mobile onboarding screens to repo and push**
   ```bash
   cp ~/Documents/Claude/Projects/Tradesman/tradebook-app/app/\(auth\)/*.tsx ~/Projects/tradesman/tradebook-app/app/\(auth\)/
   cd ~/Projects/tradesman/tradebook-app && git add -A && git commit -m "feat: onboarding welcome and phone screens" && git push
   ```
2. **Copy early access page to landing page repo and push**
   ```bash
   cp -r ~/Documents/Claude/Projects/Tradesman/tradebook-web/app/early-access ~/Projects/tradesman/tradebook/app/
   mkdir -p ~/Projects/tradesman/tradebook/app/api/waitlist
   cp ~/Documents/Claude/Projects/Tradesman/tradebook-web/app/api/waitlist/route.ts ~/Projects/tradesman/tradebook/app/api/waitlist/
   cd ~/Projects/tradesman/tradebook && git add -A && git commit -m "feat: early access waitlist page" && git push
   ```
3. **Add $5 Anthropic API credits** → unblocks WhatsApp receipt parsing and the Phase 0 core loop
4. **Wire WhatsApp webhook** → test end-to-end receipt flow
5. **Twilio for phone OTP** → replace anonymous auth with real identity
6. **App Store + Play Store accounts** → needed to publish

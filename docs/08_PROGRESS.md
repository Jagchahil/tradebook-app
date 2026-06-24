# 08: Build Progress

> This document is the handoff for every new Claude session. Read it before touching any code.
> Always build with Claude's recommendation. When Claude suggests an approach, go with it unless there is a clear reason not to. This saves time and keeps the build coherent.

---

## How We Build

All day-to-day code is written by Claude Code (the CLI tool running in terminal). Cowork (this chat) is used for planning, reviewing screenshots, and directing what to build next. Claude Code writes and commits the code. Cowork reviews the result and gives the next instruction.

The copy/push pattern: Claude Code writes files to the workspace folder at `~/Documents/Claude/Projects/Tradesman/tradebook-app/`. The actual repo lives at `~/Projects/tradesman/tradebook-app/`. After each Claude Code session, copy files across and push:

```bash
cp ~/Documents/Claude/Projects/Tradesman/tradebook-app/app/\(tabs\)/*.tsx ~/Projects/tradesman/tradebook-app/app/\(tabs\)/
cp ~/Documents/Claude/Projects/Tradesman/tradebook-app/lib/supabase.ts ~/Projects/tradesman/tradebook-app/lib/supabase.ts
cd ~/Projects/tradesman/tradebook-app && git add -A && git commit -m "..." && git push
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

### Mobile App (development build)
- Repo: `~/Projects/tradesman/tradebook-app/` and on GitHub at `github.com/Jagchahil/tradebook-mobile`
- Stack: React Native + Expo SDK 56, expo-router, TypeScript, Supabase
- Running: `npx expo start` for mobile (Samsung dev build via EAS), `npx expo start --web` for Chrome at `localhost:8082`
- EAS Build profile set up for Android APK (development build installed on Samsung)

#### Screens built

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

**Auth (`app/(auth)/index.tsx`)**
- Anonymous sign-in via `supabase.auth.signInAnonymously()`
- Temporary bypass while proper phone OTP auth is pending budget for Twilio
- Supabase: anonymous sign-ins enabled in dashboard

**Tab bar (`app/(tabs)/_layout.tsx`)**
- Four tabs: Dashboard, Transactions, Tax, Settings
- Indigo active tint, grey inactive
- Emoji icons

#### Key files
- `lib/supabase.ts`: Supabase client, `getTransactions()`, `signInAnonymously()`. All Supabase errors treated as empty array (transactions table does not exist yet).
- `hooks/useCurrentUser.ts`: auth state listener returning `{ user, session, loading }`
- `app/_layout.tsx`: root Stack, redirects unauthenticated to `/(auth)`

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
- Email magic link deep links rejected by Supabase free tier (custom URL schemes not allowed in Redirect URLs).
- Current workaround: anonymous sign-in. Users are not identified.
- When Twilio budget is available: wire up phone OTP in `app/(auth)/index.tsx`, remove anonymous sign-in.

### Transactions table in Supabase
- The `transactions` table from `docs/03_BUILD_PLAN.md` schema has not been created yet.
- `getTransactions()` silently returns empty array on any error.
- Table must be created before any real data flows through.

### WhatsApp webhook (Phase 0 core loop)
- `app/api/whatsapp/route.ts` exists in the Next.js app but is not wired to Meta Cloud API yet.
- Blocked on: Anthropic API credits ($5 top-up needed) for Claude Vision receipt parsing.
- Meta WhatsApp Business account needs a phone number registered.
- Once Anthropic credits are added: wire the webhook, test end-to-end receipt → parse → Supabase → WhatsApp reply → dashboard.

### App onboarding screens
- Welcome screen not built (currently drops straight into anonymous auth screen).
- Proper sign-up flow: welcome → phone number input → OTP verify → into app.
- Build these screens once auth budget is available.

### Landing page "Download" CTA
- The website has no download link yet (no App Store / Play Store listing).
- Interim plan: add a "Join waitlist" or "Request early access" page that collects email/phone.
- App Store listing requires paid Apple Developer account ($99/year). Not yet purchased.
- Play Store listing requires one-time $25 fee. Not yet purchased.

### Stripe payments
- Not started. Phase 1 item.
- Plan: £29/month subscription, 30-day free trial.
- Needs Stripe account and product created.

---

## Current User Flow (as built)

```
Website (Vercel) → user lands → joins waitlist
Mobile app → opens → anonymous sign-in → Dashboard (empty state)
```

## Target User Flow (next milestone)

```
Website → "Download the app" → App Store / Play Store
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
| Supabase | Active | Project: tradebook-prod. Anonymous sign-ins enabled. Transactions table not yet created. |
| Vercel | Active | Landing page deployed |
| Anthropic API | Needs credits | Add $5 to unblock WhatsApp receipt parsing |
| Meta WhatsApp | Not started | Need Business account and phone number |
| Twilio | Not started | Needed for phone OTP auth. Budget required. |
| Apple Developer | Not started | $99/year for App Store |
| Google Play | Not started | $25 one-time for Play Store |
| Stripe | Not started | Phase 1 |

---

## Next Actions (in order)

1. **Add $5 Anthropic API credits** → unblocks WhatsApp receipt parsing and the Phase 0 core loop
2. **Create transactions table in Supabase** → run schema from `docs/03_BUILD_PLAN.md`
3. **Wire WhatsApp webhook** → test end-to-end receipt flow
4. **Build onboarding screens** → welcome, phone input (anonymous for now, OTP when Twilio available)
5. **Add waitlist/download page to website** → something for the "Download app" CTA to point to
6. **Twilio for phone OTP** → replace anonymous auth with real identity
7. **App Store + Play Store accounts** → needed to publish

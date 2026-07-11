# 77: Pre Launch Game Plan. Bank Feeds, Pricing, Reviews (2 July 2026)

> The plan for the three competitive gaps that are ours to close before or at launch, agreed with Jag on 2 July. Nothing here is built yet; this doc is the plan to execute against. HMRC recognition is deliberately parked until the other founder tasks (domain, company, ICO, accounts) are sorted, per Jag. Doc 74 has the competitor matrix this responds to.

## The sequencing, one view

| Order | Item | Who | Gate |
|---|---|---|---|
| 1 | Founder setup: domain, company, ICO, Stripe live, AI credit | Jag | none |
| 2 | Bank feeds: provider account + sandbox build behind a flag | Claude | provider account (free) |
| 3 | Pricing decision locked (recommendation below) | Jag decides | none |
| 4 | Soft launch cohort recruited, review engine ready | Jag + Claude | app usable end to end |
| 5 | Bank feeds live | Claude | ICO registered, privacy policy updated |
| 6 | HMRC production application | Jag | after 1 to 5 |

## 1. Open Banking bank feeds (build before launch)

**Why it matters.** The retention pattern in this market: capture gets people in, feeds keep them. A tradesperson whose fuel and materials hit a business card should never have to re photograph what the bank already knows.

**Provider recommendation: GoCardless Bank Account Data** (the API formerly Nordigen). It has the most generous free tier for account information in the UK of the major providers, which fits the zero budget rule until revenue. Fallback if coverage or reliability disappoints in testing: TrueLayer, which has a free sandbox and pay as you go pricing. Both act as the regulated AISP, so Lekhio does not need its own FCA permissions; we integrate as their customer. Decision checkpoint: run both sandboxes against Starling, Monzo, Barclays, NatWest, Lloyds and HSBC personal and business accounts before committing.

**Architecture (reuses what exists, nothing new invented).**
- Connect flow: a "Connect your bank" card in app Settings and on the dashboard empty state, opening the provider's hosted consent journey. Read only AIS scope, 90 day reconsent per UK rules, with a WhatsApp nudge when reconsent is due (the reminder engine already exists).
- Sync: a daily cron job pulling new transactions per connection, built on the resumable fan out pattern shipped this week, so it scales to 20,000 users on day one.
- Storage: bank transactions land in the existing `transactions` table with `source_type` 'bank_feed' and `confirmed: false`. The approval gate stays: nothing counts toward tax until the user confirms, same as a WhatsApp capture.
- Dedupe: a captured receipt and its card transaction must not double count. Match on amount within a few pence and date within 3 days against unconfirmed WhatsApp captures; on match, link rather than duplicate, and let the user confirm once.
- Categorisation: the deterministic merchant map first (Screwfix is materials, BP is fuel; the map already exists in `lib/waintents.ts`), Haiku fallback for unknowns, within the existing AI budget caps.
- Tokens: provider tokens stored server side only, same posture as `hmrc_connections`. New table, RLS no policies, service role only.

**Hard gates before it goes live with real users:** ICO registration done, privacy policy updated to name the provider and the AIS basis, and the provider production approval. Build and test in sandbox behind a flag before any of that; ship dark.

**Effort estimate:** roughly one focused week to sandbox complete, a few days more to production polish. **Acceptance:** a connected Starling account shows yesterday's diesel purchase in Activity, categorised, unconfirmed, deduped against its receipt photo, within 24 hours of it happening.

## 2. Pricing against "free" (recommendation: no general free tier)

**The honest economics.** ANNA files MTD quarterly updates free permanently and bundles its Auto Accountant free in year one. FreeAgent is fully free with a NatWest, RBS, Ulster or Mettle business account. Both are loss leaders funded by banking economics (deposits, interchange, lending data). Lekhio has no banking float to cross subsidise with; our marginal cost per active user is real (AI, WhatsApp conversation fees, SMS OTP). Matching free with no funding source is burning to imitate a business model we do not have.

**Recommendation.**
- Keep: 30 day full free trial, no card. Keep the free web tools as the top of funnel. Keep founder pricing (£15.99/£159) for the first cohort.
- Do not launch a general free tier. Anchor on value: "everything in, one price" against their "free but fiddly, then upsells".
- Add a risk reverser instead of a free tier: a plain guarantee on the pricing page, for example "If Lekhio does not find you more in claims than it costs in your first year, we will refund the difference." Costs nothing unless we fail the customer, and it converts the same anxiety a free tier targets. Wording must go past the compliance rules before it ships (it is a refund promise, not a tax outcome promise).
- Hold one wedge in reserve, not at launch: a free CIS refund tracker tier (capture CIS payments free, pay to prepare quarters). It attacks the segment where we are strongest and ANNA is weakest, and it has a natural upgrade moment (the first quarterly deadline). Trigger to deploy it: trial to paid conversion under 35 per cent, or CAC persistently above one month of revenue.

**This is a founder decision.** The recommendation is the default; say the word and the wedge tier gets planned properly instead.

## 3. Reviews and trust (new is the story, proof is the fuel)

Agreed: being new is a sellable story. "Built for MTD from day one, not retrofitted" is true and none of the incumbents can say it. But the story needs proof attached, so the plan is a proof engine, not just review begging.

**Phase 1, soft launch cohort (weeks 1 to 3 after founder setup).** 15 to 25 friendly tradespeople recruited through the network and door to door (doc 68 playbook). Personal onboarding on WhatsApp. Goal is not revenue; it is daily capture habit, testimonial permission, and bug reports.

**Phase 2, the review engine (in app, build is small).** Ask at the two aha moments, never at random: right after the user confirms their first full week of entries, and right after the CIS screen first shows a refund building. Trustpilot first, because it needs no app store account and feeds the website immediately; app store reviews start the day the store listings go live (doc 76 is ready). One ask per user, ever; a nag is worse than no review.

**Phase 3, replace illustration with reality.** The homepage quotes are honest composites today (doc 65 flags this). As real quotes arrive with written permission, swap them one for one, with first name, trade and town. Then one written case study per major trade: an electrician, a plumber, a CIS subbie, each with a real number in the headline ("found £640 of claims in his first month"). These become the ad creative for Phase 2 marketing and the answer engine citations doc 71 wants.

**Explicitly deferred:** accountant referral portal (real lever, wrong quarter), paid review incentives (never; against platform rules and our honesty rule).

## What Claude builds next, once Jag says go

1. Bank feeds sandbox spike behind a flag (no user visible change, no spend).
2. The review ask moments in the app (tiny, ships with the next mobile batch).
3. The guarantee wording drafted for the pricing page, pending the pricing decision.

## Appendix: the guarantee wording (drafted 2 July, NOT shipped, pending the pricing decision)

Pricing page copy, ready to paste once Jag locks the pricing call:

**Headline:** The Lekhio guarantee.

**Body:** If the claims Lekhio finds you in your first year do not add up to more than your subscription cost you, tell us and we will refund the difference. No forms, no fuss. We can offer this because the average tradesperson misses hundreds of pounds of allowable expenses a year, and catching them is exactly what Lekhio is for.

**Footnote (required):** Based on the allowable expenses you capture and confirm in Lekhio during your first 12 months of subscription, valued at tax saved using your marginal rate. A refund of the difference in subscription paid, claimed within 60 days of your first anniversary. This is a promise about our fee, not about your tax: Lekhio prepares your figures, you approve them, and your tax position stays between you and HMRC.

Compliance notes: it is a refund promise on our own fee, never a promise of a tax outcome; "tax saved" is defined and bounded; no HMRC association implied; the footnote keeps the prepare and approve framing. Run past an adviser with the other launch legals when the company is formed.

## Execution status (updated 2 July, evening)

1. Bank feeds foundation: BUILT and dormant. `lib/bankfeed.ts` (GoCardless client, verified against their quickstart), `/api/bank/institutions`, `/api/bank/connect`, `/api/bank/callback`, daily sync riding the due cron with capture dedupe and idempotent inserts, `bank_connections` schema block appended to `supabase/schema.sql` (apply any time), 26 unit tests green, in CI. Switches on with BANK_SECRET_ID and BANK_SECRET_KEY in Vercel plus the SQL block. App side bank picker UI is the remaining piece, deliberately after the provider account exists so it can be tested against the real sandbox.
2. Review asks: BUILT and dormant. `lib/review.ts` in the app, wired to the two aha moments (habit week on the Activity tab, refund on the CIS screen). One ask per device ever. Switches on with EXPO_PUBLIC_REVIEW_URL once the Trustpilot page exists.
3. Guarantee wording: drafted above, awaiting the pricing decision.


## Provider change, 2 July evening: GoCardless out, TrueLayer in

GoCardless closed Bank Account Data to new signups (the portal shows "New signups are currently disabled" and the product is being wound down post Nordigen). The doc 77 fallback activated: the integration was ported to TrueLayer the same evening. What changed: TrueLayer's hosted auth dialog includes the bank picker (so the app screen needed no changes), per connection OAuth tokens with offline_access are stored in bank_connections (service role only, hmrc_connections posture), direction comes from transaction_type never the amount sign, idempotency uses TrueLayer's stable normalised transaction id, and the sync marks a connection expired when the refresh fails so the app can prompt a reconnect at the 90 day consent boundary. Env vars: BANK_CLIENT_ID, BANK_CLIENT_SECRET, BANK_SANDBOX=true for the sandbox and its Mock Bank. TrueLayer sandbox is free and unlimited; production data access is a commercial conversation at launch, which matches the ICO gate. The schema block in supabase/schema.sql was revised with a safe upgrade path from the GoCardless shape.

## Costs: everything with a price tag (launch and run)

Added 2 July evening. Every item that costs money to launch and operate Lekhio, so nothing is a surprise. Figures are approximate and in GBP; verify the ones marked "confirm" at signup. Nothing here is large: the model is deliberately near zero fixed cost until revenue, with small per use costs that stay a low single digit percentage of the £12.99 price.

### One off and annual founder setup (Jag)

| Item | Cost | Notes |
|---|---|---|
| Company formation (Ltd) | £50 one off | Companies House online. £0 if trading as a sole trader. |
| ICO data protection fee | £52/yr (£47 by Direct Debit) | Tier 1 (micro, under 10 staff or under £632k turnover). Legally required, we process personal and financial data. Gate for bank feeds going live. |
| Domain (lekhio.app) | ~£10 to £40/yr | Depends on registrar and TLD. |
| Apple Developer Program | $99/yr (~£79) | Required to publish the iOS app. |
| Google Play Developer | $25 one off | Required to publish the Android app. |
| Business bank account | £0 | Tide, Mettle, Starling all have free tiers. |

### Recurring platform and infrastructure (monthly)

| Service | Cost | Status / notes |
|---|---|---|
| Vercel | ~$20/mo (~£16) Pro | MUST move off Hobby before launch. Hobby is non commercial per Vercel terms, and a paid product on it is a terms breach. Pro also lifts the daily only cron limit and the function limits. Currently on Hobby. |
| Supabase | $25/mo (~£20) Pro | Strongly recommended before real users: daily backups, no auto pause after a week idle, higher connection and storage limits. Currently on Free. |
| Resend (invoice emails) | Free to 3,000/mo, then $20/mo (~£16) | Optional. Invoicing falls back to a shareable link without it. |
| Expo EAS (app builds, OTA) | £0 to start, Production $99/mo only if needed | Free tier covers low build volume. Defer the paid plan. |

### Per user and usage variable (scales with use, all small)

| Service | Rough cost | Notes |
|---|---|---|
| Anthropic (Claude) | ~20p to 60p per heavy user/mo (~2% of price) | See doc 10. Set a hard monthly spend cap plus a budget alert in the Anthropic console. The webhook idempotency already guards runaway loops. |
| OpenAI Whisper (voice notes) | pennies per user/mo (~$0.006/audio min) | Needs OPENAI_API_KEY. NOT currently set in Vercel, so voice notes will not work until it is added. |
| Twilio Verify (login OTP by SMS) | ~£0.07 to £0.10 per login | ~$0.05/verification plus one UK SMS segment. Scales with logins, not users. Keep the per number rate limit to cap abuse. |
| Meta WhatsApp Cloud API | ~£0.01 to £0.04 per message, small free allowance | 2025 per message pricing. Small per active user. Confirm current UK utility and service rates. |
| TrueLayer (bank feeds) | Sandbox free and unlimited. Production is a commercial deal | Per connection or volume pricing agreed at launch. Gated behind ICO registration anyway. Confirm at the commercial conversation. |
| Stripe (card fees) | 1.5% + 20p per UK card charge | ~50p on a £12.99 monthly sub, ~£3.19 on a £129 annual. Netted off revenue, not a separate bill. |

### Deferred, not a launch cost

| Item | Cost | Notes |
|---|---|---|
| Meta / TikTok ad spend | Variable | Phase 2 only, when the marketing engine turns on. Organic and door to door first, per the GTM plan. |

### The floor to switch it all on

Bare minimum recurring to run a compliant, commercial launch: **Vercel Pro (~£16/mo) + Supabase Pro (~£20/mo) = ~£36/mo**, plus the one off and annual founder items above (company £50, ICO £52/yr, Apple £79/yr, Google £25, domain ~£20/yr). Everything else is either usage based and tiny, deferred, or optional. Two paying customers cover the fixed monthly cost.

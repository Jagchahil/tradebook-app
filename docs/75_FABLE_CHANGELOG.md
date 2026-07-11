# 75: Fable Changelog (2 July 2026)

> What changed in the Fable audit pass (docs 73 and 74), why, and how each change was verified. Everything here was typechecked, unit tested, and production built before shipping. Baseline before any change: exam suite 87/87, HMRC suite 28/28. After: exam suite 104/104, HMRC suite 30/30, new WhatsApp intent suite 61/61, webhook vitest 6/6, `tsc --noEmit` clean on both repos, `next build` clean.

## WhatsApp (area M plus correctness)

**New file `lib/waintents.ts`.** All deterministic intent logic now lives in one pure module with unit tests (`test/waintents.test.mjs`, 61 checks). The route imports it; behaviour of every existing intent is regression tested.

New deterministic intents, all zero AI: balance and totals questions (spent, made, profit, tax so far, by period: today, this week, this month, this quarter, this tax year, all time, and by category, for example "on fuel"); the tax estimate answer uses the same `soleTraderTax` engine as the app and credits CIS already deducted; tax deadline questions with the next MTD quarterly date computed; thanks; bare yes and no; who are you and are you a bot; pricing; STOP and START (writes `reminder_prefs`, so opting out by text and by app agree); delete the last unconfirmed entry; change the last unconfirmed entry's amount. Confirmed entries are never touched from WhatsApp, so no approval question arises.

Parser fixes: CIS and phone share handlers now accept thousands separators (`£1,200` was read as £1); amounts accept the k suffix ("1.2k"); "got a refund of £25" books as money in; "yesterday" dates the entry to yesterday.

Cost and abuse: durable per phone daily message cap (300) through the existing `ai_usage` counter, silent over the cap, fails open for replies; the per phone AI budget now fails closed like the global one; media downloads capped at 8 MB before any memory or AI spend.

## AI cost (area L)

`lib/claude.ts` now runs two tiers: Haiku for receipt vision, entry parsing, invoice drafting, schedule parsing and the expense checker fallback; Sonnet only for the accountant. The accountant system prompt is served with `cache_control` so repeat questions pay a tenth for it. `transactionSummaryForUser` shrank from 150 to 60 rows and is only used by open ended questions; the common money questions are now deterministic and free. Projected steady state AI cost per active user fell roughly 70 to 80 per cent.

Correctness in the same file: the accountant prompt said WDA main pool 18 per cent while the engine says 14; the line is now derived from `FACTS` so it cannot drift again. A Scottish honesty line was added: the assistant now says its income tax bands are rUK and points Scottish users to gov.scot.

## Receipts and dates (areas A, O)

Receipt vision now extracts the printed receipt date; the webhook clamps it (no future dates, nothing older than two years) and stores it in `transaction_date`, so back dated receipts land in the right tax quarter. Typed and spoken entries date off "yesterday" when said. The app already reads `transaction_date` for tax periods, so app and WhatsApp now agree by construction.

## HMRC (areas D, B)

`createBroughtForwardLoss` and `createLossClaim` now require `approved === true` and throw `ApprovalRequiredError` otherwise, matching every other HMRC write. The sandbox harness passes `true` explicitly (running it is the operator's approval). Two new gate tests added; the suite is 30/30. Nothing live was touched; the production application was not submitted.

## Scale and structure (area A)

The weekly summary cron now calls one grouped RPC (`weekly_totals_all`) instead of one query per user, with an automatic fallback to the old path until the SQL is applied. Invoice numbering uses a HEAD count instead of pulling every invoice row.

## Database (SQL to apply, flagged)

`supabase/schema.sql` gained a clearly marked block dated 2 July 2026. Run it in the Supabase SQL editor. It contains: the `weekly_totals_all` RPC (service role only), and the `users_phone_binding` trigger that binds `users.phone_number` to the phone verified on the JWT (service role exempt), closing the deferred H1 finding. The code ships safely before the SQL is applied; apply it before scale.

## Website (areas E, F, I, N)

New `lib/tokens.ts`: the canonical palette, type, radius and shadow tokens, plus a shared `A11Y_CSS` string. Every page now injects `A11Y_CSS`: visible `:focus-visible` outlines on all interactive elements, and a blanket `prefers-reduced-motion` guard that disables all animation. FAQPage JSON-LD added to the tax calculator and CIS calculator (figures in step with the engine); the file your tax return guide already carried its schema. `robots.ts` was re verified: it does not block AI crawlers (an audit fan out claim that proved false). The remaining canonical URL and `metadataBase` work stays tied to the real domain per doc 65 section 6b.

## Mobile app (area G)

`cis.tsx`, `achievements.tsx` and `wrapped.tsx` no longer carry their own tax maths: all three call `soleTraderTax` from `lib/tax.ts`. The "tax saved" figure is now the engine's tax on income alone minus tax on actual profit, not a flat 26 or 42 per cent. `wrapped.tsx`'s local saffron hex now aliases the theme token. The referral copy was made honest: no promised reward month until the server side mechanic exists (building that is a founder pricing decision). Em dashes removed from the two places they had crept in. Verified: `tsc --noEmit` clean in the mobile repo; the audit claims about a missing accountant spinner and an unlinked diary screen were checked and found already handled (no change).

## Tests and CI (area P)

Exam bank expanded from 87 to 104 questions with hand computed expected values (PA taper with Class 4 interaction, band edges, additional rate, WDA both pools, losses, CGT with BADR, CIS unregistered with materials, mileage over 10,000, voluntary Class 2, trading allowance choice, POA threshold edge, MTD 2028). New `test/waintents.test.mjs` (61 checks). New GitHub Actions workflow `.github/workflows/ci.yml`: typecheck, all suites, and a real `next build` on every push.

## Docs

`docs/74_FABLE_AUDIT_FINDINGS.md` (the ranked audit), this changelog, and updates to docs 65, 66 and 71 so the handover stays true.

## Not done, deliberately, and why

Open Banking bank feeds (big build, sequenced after HMRC recognition, doc 22). Offline cache in the app (needs a stale data design). Referral reward mechanic (founder pricing decision). Canonicals and metadataBase (tied to the real domain). Live HMRC and the production application (standing rule, founder decision). Scottish tax bands (out of audience for now; the assistant now says so honestly).

## Scale batch for 20,000+ users (same day, second push)

Deploy of the first batch confirmed live in production (FAQPage JSON-LD, focus and reduced motion CSS, and the webhook's 403 handshake all verified on the served site). Then:

**Resumable cron fan out.** At 20,000 users the nudge and weekly sends cannot finish inside one serverless invocation. The cron now acknowledges immediately and works in `after()`, sends for up to 40 seconds, then triggers a continuation invocation of itself with a keyset cursor and a hop counter (cap 100). Each hop is an independent invocation with its own duration budget, the cursor is strictly increasing, and no invocation ever waits on another, so the pattern is loop proof and works on both the Hobby 60s and Pro 300s limits. `listNudgeTargetsPage` and `listAllNudgePrefs` support it.

**Table pruning.** `processed_messages` grows with every message (about 6 million rows a month at 20,000 active users), `wa_sessions` and `ai_usage` grow slowly. A batched pruner now rides along with the daily due job (idempotency horizon 7 days, sessions 1 day, counters 60 days). No new cron entry was added, deliberately: a bad cron config once silently blocked every deploy, and the Hobby plan caps cron counts. `?job=cleanup` also exists for manual runs.

**Health endpoint.** `/api/health` reports app up and database reachable, nothing else, safe to poll publicly. Wire it to an uptime monitor when convenient.

**AI cost observability.** Every Claude call now logs one line: feature name, model, input, output and cached token counts. No message content, no personal data. Spend per feature is now visible in the Vercel logs.

**Schema additions (same apply-me block):** index on `processed_messages(created_at)` for the pruner, partial index on `transactions(user_id, created_at desc) where confirmed = false` for the delete-last and edit-last intents.

Verified: tsc clean, eslint zero errors, all suites green, production build clean with `/api/health` present.

## Closing state (2 July 2026, 12:28)

The schema block was applied in the Supabase SQL editor ("Success. No rows returned"): weekly_totals_all RPC, users_phone_binding trigger, processed_messages created_at index, and the unconfirmed transactions partial index are all live in production. Both deploys confirmed live (/api/health 200 with db true). The live WhatsApp loop was proven end to end by a real message: "how much have I spent this month" answered deterministically and with correct period maths. Every box in the doc 73 section 7 checklist is ticked.

## Game plan execution batch (2 July, evening, third push)

Doc 77 items built, all dormant until their switches are flipped, all verified (tsc clean both repos, eslint zero errors, bank feed suite 26/26, all prior suites green, production build clean with the three new /api/bank routes):

**Bank feeds foundation.** `lib/bankfeed.ts` is a GoCardless Bank Account Data client verified against their live quickstart: stateless token mint, institutions list, requisition create and read, booked transactions. Routes: `/api/bank/institutions` and `/api/bank/connect` (authenticated; the consent reference is the HMAC signed user state, so the callback cannot be bound to the wrong account) and `/api/bank/callback` (marks the connection linked and shows a branded page). The daily due cron now also syncs every linked connection: 3 day overlap window, idempotent on the bank's own transaction id via a partial unique index on `transactions.external_id`, fuzzy deduped against recent WhatsApp captures (same direction, 5p, 3 days), deterministic categorisation aligned with the WhatsApp map (a test asserts the two stay aligned), and every row lands unconfirmed. Dormant without BANK_SECRET_ID and BANK_SECRET_KEY. New schema block (bank_connections plus the external_id index) appended to `supabase/schema.sql`; apply with the SQL editor whenever, required before switch on.

**Review asks in the app.** `lib/review.ts`, wired to the Activity tab (habit moment: 5 or more confirmed entries spanning a week) and the CIS screen (money moment: refund building). One ask per device, ever; marked before showing so a crash can never cause a repeat. Dormant without EXPO_PUBLIC_REVIEW_URL.

**Guarantee wording** drafted in doc 77's appendix with compliance notes, not shipped, pending the pricing decision.

## Bank feeds provider port (2 July, late evening, commit bbb4fae)

GoCardless closed Bank Account Data to new signups mid setup (their portal says so outright; the product is being wound down after the Nordigen acquisition). The doc 77 fallback activated: the whole integration was ported to TrueLayer the same evening and verified (tsc clean, eslint zero errors, bank feed suite 28/28, all other suites green, production build clean). Design notes: TrueLayer's hosted dialog includes the bank picker so the mobile screen shipped earlier needed zero changes; per connection OAuth tokens with offline_access are stored in bank_connections (service role only, hmrc_connections posture); transaction direction comes from transaction_type, never the amount sign, because providers differ on signing; idempotency keys off TrueLayer's stable normalised_provider_transaction_id since they document that transaction_id can change between requests; a failed refresh marks the connection expired so the app can prompt reconsent at the 90 day boundary. Env: BANK_CLIENT_ID, BANK_CLIENT_SECRET, BANK_SANDBOX. The schema block was revised in place with a safe upgrade path from the GoCardless shape.

## Bank feeds: END TO END IN SANDBOX, PROVEN (2 July, night)

Jag completed the full loop on a real phone: Settings, Connect your bank, TrueLayer consent, Mock Bank login, redirect, the Lekhio "Bank connected" page. Along the way three real world snags were diagnosed and fixed, each now part of the playbook: PostgREST returned PGRST204 because a bank_connections table already existed from the doc 22 spec era (create table if not exists silently no-ops on a legacy shape; fixed with add column if not exists plus a schema cache reload, and legacy NOT NULLs relaxed); the TrueLayer redirect URI had to be registered in their console (their auth page says "Invalid redirect_uri" in plain text; a diagnostic auth link with the public client id reproduces and verifies this from any browser); and redirect URI propagation can lag registration by minutes.

Follow up batch (commits 6476030 web, f7f8dac app): `lib/banksync.ts` now holds the sync shared by the daily cron and the connect callback, which runs the FIRST sync immediately so transactions appear moments after linking; `/api/bank/status` gives the app a three state probe (dormant, available, connected; never returns tokens); `/api/bank/disconnect` revokes and destroys our token copies while leaving imported entries untouched. The app's bank card now has three states: the honest coming soon teaser, connect, and connected with an ON pill and a disconnect confirm. It re-probes on tab focus so it flips the moment the user returns from consent. Verified: tsc both repos, eslint zero errors, bank suite 28/28, build clean with the new routes.

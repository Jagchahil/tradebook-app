# 100: Bank feed go live (11 July 2026)

> # 🛑 SUPERSEDED ON THE PLAN, 17 AUGUST 2026. THIS IS NOT A LIVE RUNBOOK.
>
> **Read `docs/120_THE_BANK_CONNECTION_PARKED_2026-08-17.md` first.** This document was written as a
> go live plan with two gates in front of it, and it stayed that way, unamended, for five weeks after
> both gates resolved. It was still being read as a live plan on 17 August 2026.
>
> **What actually happened to the two gates:**
>
> - **Gate 1, ICO registration: DONE.** 15 July 2026, reference **ZC198977**. Everything below about
>   the fee, the tier and the registration is complete. It unblocked nothing, because it was never
>   the final blocker, and doc 107 still says otherwise.
> - **Gate 2, TrueLayer production: REFUSED.** They declined production authorisation on **30 July
>   2026**, and the reason, recorded 17 August, is that **they are scaling and are not taking on
>   small businesses**. A commercial decision about account size, not a compliance one. Do not
>   reopen the application: nothing in our submission was wrong.
>
> **There has been no open banking provider since 30 July 2026, and the feature is PARKED until there
> is revenue to point at it.** Jag, 17 August: "it's the first thing we look into as soon as we have
> rev. for now we need to park this but not forget about it."
>
> **WHY THIS IS KEPT RATHER THAN DELETED.** Everything below about the ENGINEERING is still true and
> still correct: the client, the resumable sync, the read only scopes, the encryption at rest and the
> approval gate are all built and tested. The regulatory theory is still the theory. **This is the
> document to read on the day somebody unparks it.** What is dead is the plan and the timeline, and
> a reader who does not know that will act on a schedule that ended five weeks ago.
>
> ⚠️ **AND NOTHING BELOW MAY BE USED AS A LICENCE TO SELL THE FEATURE.** The public copy rules are
> in doc 120 section 6: a connection may be called PLANNED, never BUILT, never SWITCHING ON SOON, and
> never a SOON chip beside a competitor's tick. `test/sabotage-b1banktruth.mjs` holds them.

> The bank feed is BUILT and dormant. Nothing here is a code project: the blockers are two registrations and an env swap. Doing this while HMRC recognition and the D-U-N-S tick along is the right use of the wait. Writing rule holds: no em dashes, no en dashes, no hyphens used as dashes.

## Why this matters more than it looks

A receipt photo costs an AI vision call. **A bank transaction costs nothing.** `lib/banksync.ts` contains no AI call at all, and `lib/bankfeed.ts` categorises each line with a keyword map that mirrors the WhatsApp categoriser (tests keep the two aligned). So bank capture is free to run, needs no photographing, and removes the receipt cap problem entirely. Every transaction that arrives by bank feed instead of by photo is margin back in your pocket, and one less thing the user has to do.

It also closes a real competitive gap: every bank-bundled rival (Monzo/Sage, Starling/Ember, Mettle/FreeAgent, Tide) leads with automatic transactions.

## What is already built and correct

- `lib/bankfeed.ts`: TrueLayer Data API client. Hosted auth dialog (bank picker included), code exchange, token refresh, transactions fetch. Production grade transport: retry with exponential backoff and jitter, honours Retry-After, per attempt timeouts, so a 429 or a blip never becomes a permanent failure.
- `lib/banksync.ts`: the daily sync, as a RESUMABLE hop chain (keyset cursor, acks immediately, work in `after()`), the same pattern as the reminders cron. Overlaps the window by 3 days so late-booked lines are never missed; `external_id` is the idempotency key so re-reading a window is harmless.
- API routes: `/api/bank/connect`, `/api/bank/callback`, `/api/bank/disconnect`, `/api/bank/institutions`, `/api/bank/status`.
- **Read only scopes**: `info accounts balance transactions offline_access`. No payment permission is requested and none is possible.
- **Tokens encrypted at rest** with AES-256-GCM (`BANK_TOKEN_KEY`, already set in Vercel). Stored in `bank_connections`, a service role only table with RLS and no policies.
- **The approval gate is intact.** Bank lines arrive as UNCONFIRMED transactions and count toward nothing until the user confirms them, exactly like a WhatsApp capture.
- Provider history: the first build targeted GoCardless Bank Account Data, but GoCardless closed that product to new signups (verified 2 July 2026), so TrueLayer is the live path.

## Gate 1. Register with the ICO (do this first)

You are processing personal and financial data, so you must be registered with the Information Commissioner's Office as a data controller. This is required for the product generally, and it is the specific thing standing between you and live bank data.

1. Go to ico.org.uk, "Register with the ICO" (the data protection fee self assessment).
2. Register **Lekhio Ltd**, CRN **17329341**, registered office **52 Harrington Road, London, E11 4QW**.
3. Tier 1 (micro organisation) is almost certainly right: fewer than 10 staff and under 632k turnover. The fee is about **52 pounds a year** (about 40 if you pay by direct debit).
4. You pay and submit this yourself. Keep the registration number: you will be asked for it by TrueLayer, and it belongs in the privacy policy.

Do not describe Lekhio as "ICO registered" anywhere until this is actually done.

## Gate 2. TrueLayer production access

1. Sign up / sign in at console.truelayer.com as **Lekhio Ltd**.
2. Apply for **production** access to the **Data API** (account information only). You are integrating as TrueLayer's client; TrueLayer holds the FCA account information services permission, so Lekhio does not need its own FCA authorisation for a read only feed. Have ready: company name and CRN, the ICO registration number, the live URL (https://lekhio.app), your privacy policy URL, and a plain description of the use case ("read only bank transactions imported into a bookkeeping and Making Tax Digital product for UK sole traders; no payments").
3. Set the **redirect URI** in the TrueLayer console to exactly the callback the code uses: `https://lekhio.app/api/bank/callback`. A mismatch here is the single most common cause of a failed connect.
4. Collect the production **client id** and **client secret**.

## Gate 3. Privacy policy (done, ships with the next deploy)

The policy now has a "Connecting your bank" section that names TrueLayer, states it is FCA authorised for account information services, states the access is READ ONLY (no payments, no changes), that consent is given in the user's own bank screens, that tokens are encrypted, that lines arrive unconfirmed, and how to disconnect and withdraw consent. Lawful basis: consent plus performance of the contract. Add the ICO registration number to it once gate 1 completes.

## Gate 4. The env swap (this is the whole "deploy")

In Vercel, project tradebook1/tradebook-app, Settings, Environment Variables, Production:

- `BANK_CLIENT_ID` = the TrueLayer PRODUCTION client id (currently holds sandbox)
- `BANK_CLIENT_SECRET` = the TrueLayer PRODUCTION client secret (currently sandbox)
- `BANK_SANDBOX` = **false** (or delete the variable; anything other than the exact string `true` means production)
- `BANK_TOKEN_KEY` = already set, leave it. Tokens are encrypted from the first write, which is why this had to be in place before any real bank connected.

Redeploy. `hasBankFeedConfig()` is what wakes the feature up, and the daily sync is already kicked from the `due` cron's first hop, so nothing else needs scheduling.

## Gate 5. Verify with one real connection

1. In the app, connect YOUR own bank through the dialog.
2. Confirm transactions land in the app as **unconfirmed** and that the categories look sane (Screwfix and the like should match what the WhatsApp categoriser would have said).
3. Confirm the disconnect button actually revokes.
4. Check `bank_connections` holds an ENCRYPTED token (it must not be readable plaintext).

Known trap, already fixed: prod `bank_connections` was once missing an `updated_at` column, which silently rejected every PATCH and meant a card never connected. It is patched, but if a connect fails quietly, look there first.

## What this does NOT change

The approval gate. Bank data is a capture channel, not an authority to act. Nothing is filed, nothing is claimed, and nothing counts toward tax until the user confirms it. Read only scopes mean Lekhio cannot move money even if it wanted to, which is exactly the posture we want to be able to state plainly to a user and to HMRC.

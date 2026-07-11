# 58: Full Audit. UX, Functional, Security, and the Fixes Made

> Three specialist agents audited the product end to end on 30 June 2026: a UX walkthrough as real tradespeople of every ability, a functional and navigation pass, and a security and data-protection review. This records what they found and what was fixed in the same session.

---

## Headlines

The functional audit was clean: every route resolves, every button is wired, the app compiles with no errors. The UX audit found the app is well made but has ease-of-use gaps for the least confident users. The security audit found the cryptographic and database foundations are sound, but the authentication layer had real holes. The serious security issues were fixed immediately; the biggest ease-of-use fixes were made too. The one thing that still must happen before real users is switching on phone OTP login in production.

---

## Security: found and fixed

Fixed in code this session:

- **Billing portal could be opened for anyone by guessing their email (IDOR).** `/api/billing/portal` took the email from the request body. Now it requires the signed-in Supabase token and takes the email from the verified token, never from the body. Nobody can reach another person's billing.
- **The AI cost cap could fail open.** `/api/ask` treated a database hiccup as "allow", so the per-user daily cap could be bypassed. It now fails closed: no durable counter, no spend. The invoice-drafting endpoint gained a durable global daily ceiling too, so even a spoofed IP cannot run up the AI bill.
- **The invoice payment webhook booked income without checking the amount.** It now verifies Stripe actually collected the money and that the amount and currency match the invoice before booking anything.
- **The public invoice link exposed personal data.** A shared invoice link no longer reveals the customer's contact details or the trader's personal mobile number.
- **Account-takeover hardening.** A unique constraint now means one phone number can belong to only one account, so an attacker cannot claim a number that is already registered.

Confirmed safe: the service-role key is never shipped to the client; both webhooks verify their signature before doing anything; row level security is on for every table holding personal or financial data, with sensitive tables locked to the server only.

**The one critical item that is not a code fix:** the app currently signs in anonymously when OTP is off, and the phone number is self-typed. Until phone OTP login is switched on in production (it is already built, it needs an SMS provider), a number is not proven. **Anonymous auth must not ship to real users.** Switching on `EXPO_PUBLIC_OTP_ENABLED` with an SMS provider is the real fix; the unique-phone constraint above reduces the risk in the meantime.

---

## Ease of use: found and fixed

Fixed this session:

- **One trustworthy tax number.** The dashboard used a slightly different rough estimate from the year view, the CIS screen and the export, so the same user saw different figures. The dashboard now uses the one canonical engine, so every screen agrees.
- **No more "broken-looking" empty screens.** Proof of income showed a confident all-zero statement for a new user. It now shows a friendly "nothing logged yet, it fills in as you go" instead, and hides the share button until there is something to share.
- **CIS reachable on day one.** The CIS and refund tool only appeared once CIS was logged, so a new subcontractor could not find it. It is now always reachable, with copy that self-filters for non-construction users.
- **Consistent screen transitions.** The five newest screens (accountant, what-if, pay yourself, proof of income, year summary) are now registered in the navigator so they animate like every other screen.

---

## Ease of use: recommended next (not yet done)

These are real, but larger, and worth doing as a focused pass:

1. **Declutter the Tax tab into labelled sections** ("This quarter", "Plan ahead", "Help and filing"). It currently stacks many cards, so the planning tools sit below the fold.
2. **A persistent way to add an entry and to reach the accountant**, for example a centre "+" in the tab bar, so the two most-used actions are not buried in the home feed.
3. **A one-line plain-English gloss on first use of each acronym** (CIS, MTD, UTR, NI, VAT), the way Settings already explains Making Tax Digital. Helps the least confident and second-language users most.
4. **Standardise the back button** to one pattern across all screens.
5. **Broaden the expense categories and the placeholder business name** so non-construction freelancers see themselves.
6. **A headline "where you stand" block** at the very top of the dashboard: money in, set aside for tax, owed to you. The three numbers a tradesperson opens the app for, before the nudges.

---

## Functional: clean

Every navigation target, import and entry point resolves. One tidy-up worth noting: `(auth)/subscribe.tsx` is currently unreachable (the phone screen goes straight to the tabs), so either wire it as the paywall or remove it and fix the stale comment in `_layout.tsx`.

---

## What to action

1. Run the new SQL (the unique phone index) in Supabase.
2. Before any real users, switch on phone OTP in production (SMS provider + `EXPO_PUBLIC_OTP_ENABLED`).
3. The recommended ease-of-use pass above, when ready, to hit "so easy a tech-shy tradesperson loves it".

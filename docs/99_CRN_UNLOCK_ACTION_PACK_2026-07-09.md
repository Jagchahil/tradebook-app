# 99: CRN unlock action pack (9 July 2026)

> Lekhio Ltd is incorporated. CRN 17329341, incorporated 8 July 2026, status Active. This is the linchpin from docs 92 and 93: it unblocks Stripe, HMRC production, the D-U-N-S, both app stores, and Meta business verification. This pack has every value filled in so each application takes minutes. Jag does the filing, the payments, and the identity steps himself; the assistant preps and walks the clicks, and never moves money or submits on his behalf. Writing rule holds: no em dashes, no en dashes, no hyphens used as dashes.

## The company facts, for every form

Use these everywhere an application asks about the business.

- Legal name: LEKHIO LTD
- Company registration number (CRN): 17329341
- Incorporated: 8 July 2026
- Type: Private company limited by shares
- Registered office: 52 Harrington Road, London, E11 4QW (this is the home address, public on the register; a service address can replace it later for free)
- SIC codes: 62012, 62020, 63990, 69202
- Website: https://lekhio.app
- Business email: info@lekhio.app
- Director, sole shareholder and PSC: Jag (more than 75 percent control)

## Recommended running order

Two of these start multi day clocks, so fire them first even though Stripe is the priority build. Do the D-U-N-S and the HMRC application today (a few minutes each, then they run in the background), then settle into the Stripe steps at your own pace.

1. D-U-N-S request (about 5 business days, gates both app stores).
2. HMRC production recognition (about 10 working days).
3. Stripe live as Lekhio Ltd (the priority, do it properly, step by step).
4. Right after Stripe: close anonymous auth (the number one launch gate).

## Track 1. D-U-N-S number (do today)

Free for UK companies through Apple's own lookup tool. The same number is then reused for Google Play, so this one request covers both stores.

1. Go to https://developer.apple.com/enroll/duns-lookup/
2. Search for LEKHIO LTD. As a brand new company (incorporated 8 July) it will very likely not be listed yet, so choose the option to submit your details to Dun and Bradstreet for a free number.
3. Enter the company facts above exactly as they read on Companies House (legal name, registered office, CRN, website, your name and info@lekhio.app as the contact). Matching the register exactly avoids a rejection.
4. Submit. Allow up to 5 business days for D&B to issue the number (occasionally longer for UK companies, so the earlier it goes in the better).

When the number arrives, tell me and I will walk you into the Apple Developer organization enrolment (79 pounds a year) and the Google Play organization registration (25 dollars one off), both of which need this D-U-N-S.

## Track 2. HMRC production recognition (do today)

The full answer pack is doc 72, already drafted from what is actually built and proven in the sandbox. The only blanks were the three gating items, and the CRN now fills the last one.

- Responsible individual: Jag, info@lekhio.app (confirm the exact name you want on record).
- Organisation URL: https://lekhio.app
- Official registration evidence: Companies House CRN 17329341 (apply as Lekhio Ltd, not as a sole trader, per the 8 July decision).
- Connection method: WEB_APP_VIA_SERVER (re-confirm on the form, as doc 93 gate 9 notes).

Everything else (marketing, data handling, security, fraud prevention headers, OAuth, the API list) is drafted in doc 72 section 2 and reflects the live build. When you are on the Developer Hub "request production access" screen, I will read you each answer to paste; you enter the personal and registration fields and agree to the terms. Filing stays in the sandbox until HMRC grants recognition (about 10 working days), which is the honest "we prepare, you approve" launch posture.

## Track 3. Stripe live as Lekhio Ltd (the priority)

Open a fresh Stripe account for the company, separate from any personal or other business account, using info@lekhio.app. Business bank account is already open, so payouts can be set from the start.

1. Create the account at https://dashboard.stripe.com/register with info@lekhio.app. When it asks for business type, choose Company, then Private limited company. Enter the company facts above (legal name, CRN 17329341, registered office, industry: software or SaaS). Add the Lekhio Ltd business bank account for payouts. Complete Stripe's identity and business verification (this is Stripe's own check, separate from Companies House).
2. Branding, so Checkout looks like Lekhio: Settings, then Branding. Upload the Lekhio logo, set the brand colour (River blue #1B59A6, accent Saffron #E0A33E), and confirm the public business name reads Lekhio.
3. Get the live secret key: Developers, then API keys, reveal the live mode secret key (starts sk_live_). This becomes STRIPE_SECRET_KEY. Do not paste it anywhere except Vercel; do not send it to anyone.
4. Create the webhook: Developers, then Webhooks, Add endpoint. Endpoint URL is exactly:
   `https://lekhio.app/api/stripe/webhook`
   Select these four events and no others (they are the only ones the code handles):
   - checkout.session.completed
   - customer.subscription.created
   - customer.subscription.updated
   - customer.subscription.deleted
   Save, then reveal the endpoint's Signing secret (starts whsec_). This becomes STRIPE_WEBHOOK_SECRET.
5. Set both values in Vercel (project tradebook1/tradebook-app, Settings, Environment Variables, Production):
   - `STRIPE_SECRET_KEY` = the sk_live_ key
   - `STRIPE_WEBHOOK_SECRET` = the whsec_ secret
   Redeploy so they take effect. The billing code switches on automatically once these are present (per the billing memory and lib/stripe.ts).
6. Verify with a real card in live mode: start a subscription from the app or the /start page, complete Checkout, and confirm in Stripe that the subscription appears and the webhook shows a 200 delivery. In Supabase, confirm the subscriptions row was written. Then, if you want, refund yourself from the Stripe dashboard.

Note on pricing (billing memory): launch price is 12.99 a month and 129 a year with a 14 day trial and no card, set inline in lib/stripe.ts PRICE_PENCE, so nothing needs configuring in the Stripe dashboard for the prices themselves.

## Track 4. Close anonymous auth (immediately after Stripe)

This is the number one launch gate (doc 93 gate 1). Strict order or you 401 your own users:

1. Confirm OTP is the live login in the current app build (a real phone can request and enter an SMS code and land in the app). If the installed build predates OTP, do a fresh EAS build first.
2. Supabase, project tradebook-prod, Authentication, Sign In / Providers: disable Anonymous sign-ins.
3. Vercel: set `REJECT_ANON_USERS=true`. Redeploy.
4. EAS rebuild, reinstall, and confirm a real login works end to end before inviting anyone.

While you are in Vercel for Stripe, it is also the moment to set the dedicated token secrets (doc 93 gate 2: PACK_TOKEN_SECRET, LEAD_TOKEN_SECRET, and confirm HMRC_STATE_SECRET) and, before any live bank or live HMRC filing, BANK_TOKEN_KEY. Each is a fresh `openssl rand -hex 32` value pasted straight into Vercel. I will give you those commands when you are ready.

## What the assistant does next

Say the word and I will walk you through whichever track you want to start, one screen at a time. When the D-U-N-S number lands I will take you into the Apple and Google organization enrolments. When HMRC grants recognition I will help flip the live host. None of this needs a code change from me right now; it is your applications plus a few Vercel env vars.

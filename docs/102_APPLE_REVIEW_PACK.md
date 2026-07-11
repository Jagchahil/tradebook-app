# 102. App Store and Play Store Review Pack

**Date:** 11 July 2026
**Status:** ready. Blocked only on the D-U-N-S number and the Apple Developer enrolment.
**Read with:** `docs/93` (launch gates), and the App Store section of the memory note.

---

## 1. The rejection that would have happened, and the fix

**Lekhio signs in with a phone OTP. An Apple reviewer sits in Cupertino and cannot receive an SMS sent to a UK mobile.**

"We were unable to sign in" is the most common rejection for an app like ours, and it happens before the reviewer has seen a single screen. A demo account is not optional here, it is the whole review.

**The fix: a reserved UK number with a fixed OTP.**

`+44 7700 900xxx` is a range Ofcom reserves for drama and testing. It is never allocated to a real person, so it can never collide with a real user and no SMS is ever actually sent. We point it at a fixed six digit code in Supabase, and the reviewer signs in like anyone else.

### Set it up (Jag, about 10 minutes)

1. **Supabase, create the auth user.** Dashboard → Authentication → Users → Add user → phone `+447700900123`. Copy the uuid it gives you.
2. **Supabase, fix the OTP.** Dashboard → Authentication → Sign In / Providers → **Phone**. There is a test / fixed OTP setting for mapping a phone number to a static code (`SMS_TEST_OTP`). Add:
   ```
   +447700900123 = 123456
   ```
   *I could not render your dashboard to confirm the field's exact label, so check this one yourself. If the hosted plan does not expose it, tell me and I will fall back to plan B below.*
3. **Seed the data.** Open `supabase/demo_seed.sql`, replace the placeholder uuid on the `demo_id` line with the uuid from step 1, and run it in the SQL editor. It is idempotent and touches no other account.
4. **Sign in on a device** with `+447700900123` / `123456` and confirm you land on the books, not the paywall.

**Plan B, if the fixed OTP is not available:** we add a build time demo bypass gated on a secret code, shipped only in the reviewed binary. It is more code and more risk, so try plan A first.

### Why the seed matters as much as the login

- **The subscription row is not decoration.** `/api/billing/status` resolves phone to subscription. With no active row the reviewer hits `paywall.tsx`, which now correctly has no way to pay (that is the whole 3.1.3(f) design), so they would be locked out and reject us for exactly the thing we restructured the app to avoid. The seed grants an `active` subscription locally, with no Stripe ids, so it can never be billed.
- **An empty app reads as an unfinished app.** The seed gives them a real looking month of an electrician's books: mixed income and expenses, some confirmed and some awaiting review, so the approval gate is visibly doing something.

---

## 2. Paste this into App Store Connect, "Notes for Review"

> Lekhio is a bookkeeping and tax preparation tool for UK self employed tradespeople.
>
> **SIGN IN**
> Phone: +44 7700 900123
> Verification code: 123456
> This is a reserved UK test number, so no real SMS is sent. Enter the number, tap Log in, then enter the code above.
>
> **ABOUT IN APP PURCHASE**
> This app is a free companion to a paid web based service at https://lekhio.app, under guideline 3.1.3(f) (Free Stand-alone Apps). Customers subscribe on our website. The app contains no purchasing of any kind and no links or calls to action pointing to any purchase, inside or outside the app. Signing in here shows the customer the books they already have. The demo account above is provisioned with an active subscription so you can see the full product.
>
> **HOW THE PRODUCT IS USED**
> Day to day capture happens over WhatsApp: the customer photographs a receipt or sends a voice note, and we log and categorise it. The app is where they review their figures, invoices and tax position. You do not need WhatsApp to review the app. The demo account is already populated, and every screen is reachable from the tabs at the bottom.
>
> **TAX**
> Lekhio prepares figures for the customer to approve. It does not file anything with HMRC without explicit approval, and we never imply that HMRC endorses Lekhio. The customer remains legally responsible for their own tax.
>
> **ACCOUNT DELETION**
> Settings → Delete account removes the account and all data, as required by 5.1.1(v).

---

## 3. Pre flight, the rejections I can see coming

| # | Risk | Status |
|---|---|---|
| 1 | **3.1.1 in app purchase.** Any price or purchase link in the binary. | **FIXED.** Five violations removed across 4 screens on 11 Jul: `paywall.tsx`, `(auth)/subscribe.tsx`, `(auth)/index.tsx`, `(auth)/phone.tsx`, `(tabs)/settings.tsx`. `startSubscriptionCheckout` is dead with a do-not-wire-up warning. |
| 2 | **"We could not sign in."** No SMS to a reviewer. | **FIXED by this doc.** Fixed OTP + demo account. |
| 3 | **Locked out by our own paywall.** | **FIXED.** Demo account seeded with an active subscription. |
| 4 | **Broken privacy policy URL.** An automatic rejection. | **FIXED 11 Jul.** Was pointing at lekhio.com (a different company, 404). Now https://lekhio.app/privacy, live and verified. |
| 5 | **5.1.1(v) account deletion.** Must be in app. | **PRESENT.** Settings → Delete account. |
| 6 | **2.1 incomplete app.** Empty screens. | **FIXED.** Seed data. |
| 7 | **App name collision.** | **CLEAR.** No "Lekhio" app in either store. See `docs/101`. |
| 8 | **4.0 design / 2.3.1 hidden features.** | The autonomy dial and Rakha are visible and explained in app. No hidden or dormant features are reachable. |

### Still to do before submitting

- [ ] D-U-N-S number (waiting, about 5 days)
- [ ] Apple Developer Program enrolment, **£79/yr, registered to LEKHIO LTD, company number 17329341** (there is no "Lekhio Group", see `docs/92`)
- [ ] Google Play Developer, $25 one off, same legal entity. An organisation account is **exempt** from the 12 tester / 14 day closed testing rule, which is worth having.
- [ ] Create the demo auth user and run `supabase/demo_seed.sql`
- [ ] Screenshots (6.7" and 6.5" iPhone required)
- [ ] App privacy questionnaire: we collect phone number, financial records, receipt images. Linked to identity. Not used for tracking. Not sold.
- [ ] Set `EXPO_PUBLIC_PAYWALL_ENABLED` deliberately, and check the demo account still gets in with it on.

---

## 4. The thing not to undo

The app is a **login only companion**. That is not a style choice, it is what keeps the whole business model intact.

Under guideline **3.1.3(f)** a free app that companions a paid web tool needs no in app purchase, *"provided there is no purchasing inside the app, or calls to action for purchase outside of the app."* Both halves are strict, and the anti steering carve outs cover the **United States storefront only**, not the UK.

Lose that exemption and Apple takes 15 to 30 percent, which on our numbers (`lib/margin.ts`, revenue basis £10.75 per user per month) is a fall from about **82% margin to 71%, or to 56%** at the full rate. At 10,000 subscribers the 15% rate alone costs roughly **£145,000 a year**.

So: no price in the binary, no Subscribe button, no "sign up on our website" link, ever. Every affected file now carries a comment saying so, and `startSubscriptionCheckout` in `tradebook-app/lib/supabase.ts` is deliberately dead.

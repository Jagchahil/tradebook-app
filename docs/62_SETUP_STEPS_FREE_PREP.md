# 62: Setup Steps for the Free Prep (Click by Click)

> Exact steps for the things you can tick off now, for free, with a personal email and your spare phone. Do them in this order. Each one ends with where the value goes in Lekhio. Verified against the current Supabase, Twilio, Stripe, HMRC and Meta flows, June 2026.

---

## 1. Phone OTP login (the security gate), Twilio trial + Supabase

**Why first:** until this is on, sign-in is anonymous and unsafe. This makes login prove the phone with a real code.

### a. Twilio (free trial)
1. Go to twilio.com and sign up with your personal email. You get free trial credit.
2. In the Twilio Console, find your **Account SID** and **Auth Token** on the main dashboard. Keep them to hand.
3. In the trial you can only text numbers you have verified, so verify your spare phone: Console, Phone Numbers, Verified Caller IDs, add your spare number, enter the code Twilio texts you.
4. Create a Messaging Service: Console, Messaging, Services, Create Messaging Service. Once created, copy its **Messaging Service SID** (starts with `MG`). (If you prefer, Twilio Verify also works; create a Verify Service and copy its `VA` SID, then pick "Twilio Verify" in Supabase instead.)

### b. Supabase
5. Supabase Dashboard, your project, Authentication, Providers, **Phone**. Toggle it **Enable**.
6. Set SMS provider to **Twilio**. Paste in the **Account SID**, **Auth Token**, and **Messaging Service SID** from above. Save.

### c. Lekhio
7. In the app environment, set `EXPO_PUBLIC_OTP_ENABLED=true`, then rebuild the app (the Expo dev build on your phone).
8. Open the app, enter your spare phone number, and log in with the code that arrives. If the code comes and you get in, the gate is closed.

Note: the trial only texts your verified number, which is perfect for testing and a private soft launch. Texting the public later needs a small paid Twilio top-up.

---

## 2. Stripe (test, free), so it can take money

1. Go to stripe.com and sign up with your personal email.
2. Stay in **Test mode** (toggle, top right). Developers, API keys, copy the **test secret key** (`sk_test_...`).
3. In **Vercel**, your project, Settings, Environment Variables, add `STRIPE_SECRET_KEY` = the test key. Redeploy.
4. Add the webhook: in Stripe, Developers, Webhooks, Add endpoint, URL `https://tradebook-app-five.vercel.app/api/stripe/webhook`, events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Copy the signing secret (`whsec_...`) into Vercel as `STRIPE_WEBHOOK_SECRET`. Redeploy.
5. Test it: go through the sign-up and pick a plan, pay with card `4242 4242 4242 4242`, any future expiry, any CVC. Then check the `subscriptions` table in Supabase has a new row.
6. Going live later is just swapping the test keys for live keys; Stripe charges nothing until a real customer pays.

---

## 3. HMRC Developer Hub (free), start the long one now

**Why now:** production recognition takes up to 10 working days of HMRC review, so the sooner the better.

1. Go to developer.service.hmrc.gov.uk, Register for a developer account, with your personal email. Activate via the email link, then sign in.
2. Create an application for the **Sandbox**: this gives you a **client ID** and **client secret**. These go into Lekhio later as `HMRC_CLIENT_ID`, `HMRC_CLIENT_SECRET`, with `HMRC_REDIRECT_URI` set to a page on the Vercel URL.
3. Subscribe the application to the Making Tax Digital for Income Tax APIs (Self Employment Business, Obligations, Individual Calculations).
4. Create a **test user** (an individual) so you have test data to play with in the sandbox.
5. When you are ready, create a **Production** application in the same account. HMRC reviews it (up to 10 working days). Begin this as early as you can.

(Our submission code is already built and sandbox-ready, doc 55, so once you have the sandbox credentials we can test against it.)

---

## 4. Meta WhatsApp (free dev setup), the core loop

1. Go to developers.facebook.com, create a Meta Business account and a new App, type Business, with WhatsApp added.
2. In the app's WhatsApp section you get a **free test number** and a temporary token. For real use later, register a number (your spare phone works if it is not already on a personal WhatsApp).
3. Note the **Phone number ID** and the **access token**. The app's **App Secret** is in App Settings, Basic.
4. Set the webhook: callback URL `https://tradebook-app-five.vercel.app/api/whatsapp`, and a verify token you choose. Subscribe to the `messages` field.
5. In Vercel, set `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` (the one you chose), and `WHATSAPP_APP_SECRET`. Redeploy.
6. Send a message from your phone to the test number and watch it arrive. (To actually read receipts and reply, the AI keys in step 5 below must be set.)

---

## 5. The AI brain (small cost, when you are paid)

1. console.anthropic.com, add a few pounds of credit, create an API key. In Vercel set `ANTHROPIC_API_KEY`.
2. platform.openai.com, add a little credit (voice notes only, pennies), create a key. In Vercel set `OPENAI_API_KEY`.
3. Redeploy. The receipt reading, the accountant chat and voice notes now work. Until then they show a friendly "not switched on".

---

## Where each value lives, in one glance

- **App environment (Expo):** `EXPO_PUBLIC_OTP_ENABLED`.
- **Supabase dashboard:** the Twilio phone-provider settings (not an env var).
- **Vercel environment variables:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `HMRC_CLIENT_ID`, `HMRC_CLIENT_SECRET`, `HMRC_REDIRECT_URI`, `CRON_SECRET`.

Tick these off and you have a secure, working, privately testable Lekhio on a free URL, with HMRC recognition already in motion, for almost nothing. The paid business setup (domain, company, ICO, app stores) comes when the money does, and the product is ready for it.

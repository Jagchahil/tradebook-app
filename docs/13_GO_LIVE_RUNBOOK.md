# 13: Go Live Runbook

> The exact steps to take Lekhio from built to live. Work top to bottom. Each service is independent, so you can switch them on one at a time. All env vars go in the Vercel project for the landing page repo, under Settings, Environment Variables, unless it says otherwise. After adding env vars in Vercel you must redeploy for them to take effect.

---

## 0. Before you start

You will need:
- The landing page repo deployed on Vercel (done, tradebook-app-five.vercel.app).
- The Supabase project (done, tradebook-prod) with all the schema SQL run.
- A phone with WhatsApp for testing.

Keep this file open and tick each box as you go.

---

## 1. Switch on receipt reading (Anthropic)

1. Go to console.anthropic.com, sign in, and add a small amount of credit (five to ten dollars is plenty to start).
2. Create an API key.
3. In Vercel, add `ANTHROPIC_API_KEY` with that key.
4. Redeploy.

Test: nothing visible yet on its own. It powers the next step.

---

## 2. Switch on the WhatsApp loop (Meta)

This is the big one. It makes the whole product real.

1. Go to developers.facebook.com and create an app. Add the WhatsApp product to it. This is free.
2. In the WhatsApp setup, you get a test phone number and a temporary access token. Note the phone number id.
3. In Vercel, add:
   - `WHATSAPP_TOKEN` the access token
   - `WHATSAPP_PHONE_NUMBER_ID` the phone number id
   - `WHATSAPP_VERIFY_TOKEN` any string you choose, for example a long random word. You will paste the same string into Meta in the next step.
   - `WHATSAPP_APP_SECRET` found in the Meta app under Settings, Basic, App Secret
4. Redeploy.
5. In Meta, under WhatsApp, Configuration, set the webhook:
   - Callback URL: `https://tradebook-app-five.vercel.app/api/whatsapp`
   - Verify token: the same `WHATSAPP_VERIFY_TOKEN` string
   - Click Verify and Save. Meta calls the webhook and it should verify.
   - Subscribe to the `messages` field.
6. In Meta, add your own mobile number as a recipient for the test number.

Test: from your phone, message the test number a photo of any receipt. Within a few seconds you should get a reply like "Logged. Tesco for £12.40. Filed under materials." Open the app, the entry is there marked to review.

If nothing happens: check the Vercel function logs for the whatsapp route. The most common causes are a wrong verify token, a missing app secret, or the number not added as a test recipient.

### Using your own spare number (the live number)

Start on Meta's free test number above to prove the loop. Move to your spare number only when you are ready for real users.

Checklist for the spare number:
- [ ] The number must NOT be active on the normal WhatsApp or WhatsApp Business app. The Cloud API takes the number over. If it is on WhatsApp now, delete that WhatsApp account on the number first, or use a number that has never been on WhatsApp.
- [ ] The number must be able to receive an SMS or a phone call. Meta sends a one-time code to verify it.
- [ ] In the Meta app, under WhatsApp, add the phone number, receive the code, and verify.
- [ ] Set a display name for the number. Meta reviews it. Avoid implying you are HMRC.
- [ ] Update `WHATSAPP_PHONE_NUMBER_ID` in Vercel to the new number's id and redeploy.
- [ ] Send a test message to confirm the live number now drives the loop.
- [ ] For more than a handful of users you will also complete Meta business verification. Not needed for the first tests.

---

## 3. Switch on voice notes (OpenAI Whisper)

1. Go to platform.openai.com, add a little credit, create an API key.
2. In Vercel, add `OPENAI_API_KEY`.
3. Redeploy.

Test: send the test number a voice note saying "forty quid of diesel at the BP." You should get a confirmation and an entry to review. Photo and text already work without this, so this step is optional at launch.

---

## 4. Switch on card payments (Stripe)

This powers the Pay now button on invoices and, later, the subscription.

1. Go to dashboard.stripe.com, create an account, complete the business details it asks for.
2. Get your secret key from Developers, API keys. Use a test key first (`sk_test_...`).
3. In Vercel, add `STRIPE_SECRET_KEY`.
4. Set up the webhook: Developers, Webhooks, Add endpoint:
   - Endpoint URL: `https://tradebook-app-five.vercel.app/api/stripe/webhook`
   - Listen for the event `checkout.session.completed`
   - After creating it, reveal the signing secret (`whsec_...`) and add it in Vercel as `STRIPE_WEBHOOK_SECRET`.
5. Redeploy.

Test: in the app, create an invoice and open its public link. A Pay now button appears. Pay it with a Stripe test card (4242 4242 4242 4242, any future date, any CVC). The invoice flips to paid and the money appears as income in the app. When you are ready for real money, swap the test keys for live keys.

---

## 5. The legal must dos (do these around launch)

- Register as a sole trader with HMRC. Free. See doc 12.
- Pay the ICO data protection fee, £52. This is the one legal box you must tick because you process personal and financial data. See doc 14 for the data details you will be asked about.

---

## 6. Test script, end to end

Run this once everything above is on, to prove the whole loop:

1. On the app, sign in with your number. Confirm it lands on the dashboard.
2. WhatsApp a receipt photo to the test number. Confirm the reply and the to review entry.
3. WhatsApp a voice note with an expense. Confirm it logs.
4. Type an expense to the test number, for example "spent £30 on screws at Screwfix." Confirm it logs.
5. Type an income line, for example "got paid £400 by Dave." Confirm it logs as income.
6. In the app, open each entry, check the details, and confirm them.
7. Create an invoice with the AI draft, share the link, open it, and pay it with a test card. Confirm it becomes paid and shows as income.
8. Open the Tax tab. Confirm the quarter figures reflect only the confirmed entries.

If all eight pass, the product is live and working end to end.

---

## Quick reference: every env var

In Vercel, landing page project:

```
ANTHROPIC_API_KEY
WHATSAPP_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_VERIFY_TOKEN
WHATSAPP_APP_SECRET
OPENAI_API_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

In the app, .env.local:

```
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
EXPO_PUBLIC_WEB_URL          (optional, defaults to the live Vercel URL)
```

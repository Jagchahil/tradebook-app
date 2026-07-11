# 23: Go Live Checklist

> One ordered, tick as you go list to take Lekhio from built to live. Work top to bottom. Most of it is free. The only spend is a domain, a few dollars of Anthropic credit, the ICO fee, and Vercel Pro. The deeper detail for any step is in doc 13. Reminder system detail is in doc 18. Bank link is doc 22, a later phase.

---

## Day 0. Accounts and the domain (mostly free)

- [ ] Buy **lekhio.app** (and lekhio.co.uk) from any registrar. ~£10 to £15 a year.
- [ ] Point the domain at the Vercel project. In Vercel, add the domain and follow the DNS steps.
- [ ] Set `NEXT_PUBLIC_APP_URL` to `https://lekhio.app` in Vercel, and `EXPO_PUBLIC_WEB_URL` in the app `.env.local`. Swap the placeholder Vercel URLs in the app's two `SIGNUP_URL` constants to `https://lekhio.app`.
- [ ] Upgrade Vercel to **Pro** (needed for function time and cron frequency at scale, see doc 21).
- [ ] Create the accounts, no keys live yet: Meta developer, Anthropic, OpenAI, Stripe. All free to open.
- [ ] Set up **support@lekhio.app** (a forwarding alias is fine to start).
- [ ] Pay the **ICO data protection fee**, about £52. This is the legal must do. See doc 14.
- [ ] Register as a **sole trader** with HMRC. Free.

---

## Day 1. Database

- [ ] In the Supabase project SQL editor, run the whole of `supabase/schema.sql`. It is safe to re-run. This creates or confirms every table and index, including the newer ones: `signups`, `events`, `reminder_prefs`, `processed_messages`, and the scale indexes.
- [ ] Confirm `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in Vercel.

---

## Day 1. Switch on the receipt brain (Anthropic)

- [ ] Add a small credit at console.anthropic.com (5 to 10 dollars is plenty).
- [ ] Create an API key. Add `ANTHROPIC_API_KEY` in Vercel. Redeploy.

---

## Day 1. Switch on the WhatsApp loop (Meta)

- [ ] Create a Meta app, add the WhatsApp product. Note the test number and the phone number id.
- [ ] In Vercel add `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` (any long string), `WHATSAPP_APP_SECRET`. Redeploy.
- [ ] In Meta, set the webhook to `https://lekhio.app/api/whatsapp` with the same verify token. Verify and save. Subscribe to `messages`.
- [ ] Add your own mobile as a test recipient.
- [ ] When moving to your spare number for real, follow the spare number checklist in doc 13 (it must not be on the normal WhatsApp app, and must receive a verification code).

---

## Day 1. Switch on voice notes (OpenAI Whisper). Optional.

- [ ] Add a little credit at platform.openai.com, create a key, add `OPENAI_API_KEY` in Vercel. Redeploy.

---

## Day 2. Reminders and the diary

- [ ] Set `CRON_SECRET` in Vercel to a long random string.
- [ ] The two Hobby-safe Vercel crons (morning nudge, weekly) ship in `vercel.json` and run on Pro automatically.
- [ ] Set up a free external cron (cron-job.org) for the frequent jobs the platform cron cannot do:
  - `https://lekhio.app/api/cron/reminders?job=due&secret=YOUR_SECRET` every 15 minutes.
  - `https://lekhio.app/api/cron/reminders?job=nudge&secret=YOUR_SECRET` for the evening nudge.
- [ ] **Before relying on proactive reminders, register WhatsApp message templates** for the nudge, the weekly summary, and the reminder, and note the per message cost. Proactive messages outside the 24 hour window need an approved template. See doc 21.

---

## Day 2. Payments (Stripe). When ready to charge.

- [ ] Get the secret key (test first, `sk_test_...`). Add `STRIPE_SECRET_KEY` in Vercel.
- [ ] Add the webhook endpoint `https://lekhio.app/api/stripe/webhook`, listen for `checkout.session.completed`, reveal the signing secret, add `STRIPE_WEBHOOK_SECRET`. Redeploy.
- [ ] Optional invoice email: add `RESEND_API_KEY` and `EMAIL_FROM` once the domain is verified in Resend.

---

## Day 2. Trademark

- [ ] Run a Lekhio trademark check and file if clear.

---

## The end to end test, prove it works

Do this once everything above is on.

- [ ] On the app, sign in with your number, land on the dashboard.
- [ ] WhatsApp a receipt photo to the number. Get the confirmation, see the to-review entry in the app.
- [ ] Send a voice note with an expense. It logs.
- [ ] Type an expense, for example "spent £30 on screws at Screwfix". It logs.
- [ ] Type an income line, for example "got paid £400 by Dave". It logs as income.
- [ ] Text "remind me to price up Dave's job tomorrow at 8am". It lands in the Diary and you get a reminder at the time.
- [ ] In the app, confirm each entry. Open Tax, then Prepare my summary, check the figures, approve.
- [ ] Create an invoice, share the link, pay it with a Stripe test card (4242 4242 4242 4242). It flips to paid and shows as income, once only.
- [ ] Hit `/api/cron/reminders?job=due` with the secret and confirm it returns ok.

If all pass, the product is live and working end to end.

---

## Publish the app (when ready)

- [ ] Apple Developer (about 99 dollars a year) and Google Play (about 25 dollars, one off).
- [ ] Build production iOS and Android with EAS, submit to the stores.
- [ ] Once approved, swap the placeholder store badges on the website success screen and in the app for the real store links.
- [ ] Add the one tap "Message Lekhio" button in the app, pointing at `wa.me/<your number>`. See doc 20.

---

## After launch, in order

1. Get the first 10 to 20 real sole traders on it. Watch them. Fix what trips them up.
2. Replace the illustrative reviews with real ones.
3. Build the bank link (doc 22). The biggest "make life easy" feature.
4. Then Phase 2 marketing and Phase 3 Connect.

---

## Every environment variable, in one place

Vercel (web):
```
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
OPENAI_API_KEY
WHATSAPP_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_VERIFY_TOKEN
WHATSAPP_APP_SECRET
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
CRON_SECRET
RESEND_API_KEY        (optional)
EMAIL_FROM            (optional)
BANK_TOKEN_KEY        (only when the bank link is built)
```

App `.env.local`:
```
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
EXPO_PUBLIC_WEB_URL
```

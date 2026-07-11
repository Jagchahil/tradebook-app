# 61: Zero-Budget Launch Prep. What You Can Do Today for Free

> You have a spare phone number and a personal email, and money is coming but not here yet. Good news: you can get Lekhio to a fully working, testable, even soft-launchable state for almost nothing. This is the order to do it, what is free, and the few things that genuinely wait for money.

---

## The big realisation

You do not need much to start. The website and app already run on the free Vercel URL (tradebook-app-five.vercel.app), so you do not need a domain to operate. You can trade as a sole trader for free, so you do not need to incorporate yet. Almost every account below is free to create with a personal email, and the spare phone is exactly what you need to test phone login. The only thing that costs real money to actually run is a small amount of AI credit, and that can wait until you have a few quid.

---

## Free now, in priority order

### 1. Stripe (free, personal email) — so you can take money
Create a Stripe account with your personal email. It starts in test mode for free. Put the test secret key in Vercel, add the webhook, and run a full trial-to-paid purchase with the test card `4242 4242 4242 4242`. Stripe never charges you a fee to exist; it only takes a small cut of real payments, so you can even go fully live for free and pay nothing until a real customer pays you.

### 2. Phone OTP login via Twilio free trial (free, your spare phone) — the security gate
This is the most important one. Sign up for a Twilio free trial with your personal email; you get free credit. In the trial you can only send texts to a number you have verified, so verify your spare phone. Then in Supabase, Authentication, Providers, Phone, plug in the Twilio details. Set `EXPO_PUBLIC_OTP_ENABLED=true` in the app. Now log in on your spare phone with a real code. That closes the one critical security hole, for free, for testing. (Going live to the public later needs a small paid Twilio top-up so it can text anyone, but for testing and a private soft launch the trial is enough.)

### 3. HMRC Developer Hub (free, personal email) — start the long one now
Register as a developer on the HMRC Developer Hub with your personal email. Sandbox access is free. Begin the application for Making Tax Digital recognition. This has the longest lead time of anything, and it costs nothing to start, so starting today is the single highest-leverage free move you can make.

### 4. Meta WhatsApp, developer setup (free) — the core loop
Create a Meta Business account and a WhatsApp app for free. During development Meta gives you a free test number, and the first chunk of conversations each month is free. If your spare phone number is not already on a personal WhatsApp, you can later register it as the business number. Set the webhook to the Vercel URL and send yourself a test message. All free to set up and test.

### 5. TrueLayer sandbox (free, low priority) — bank feeds, later
Free to sign up for the sandbox if you want to start exploring bank feeds. Not a blocker, do it whenever.

---

## The one small cost to actually run the AI

The receipt reading, the accountant chat and the voice notes need a little credit:
- Anthropic (the AI brain): pay as you go, a few pounds covers a lot of testing.
- OpenAI (voice note transcription only): pennies.

Until you top these up, those features show a friendly "not switched on yet" and everything else works. So you can build, test login, test payments and set up HMRC and WhatsApp without spending anything; add five or ten pounds of AI credit when you can, and the brain switches on.

---

## What genuinely waits for money (and how little it is)

- **Domain and business email**: about £10 a year for the domain, a few pounds a month for email. Not needed to operate; the Vercel URL and your personal email work fine for now.
- **Incorporate Lekhio Ltd**: £50 at Companies House. Not needed yet; trade as a sole trader for free until the company is worth it.
- **ICO data protection fee**: about £40 a year. Needed before you take on real members of the public, not for testing with your own data. Pay it just before the public launch.
- **Apple Developer £79 a year and Google Play £20 once**: only needed to put the app on the stores. You can keep testing on your own phone with a free Expo build until then.

---

## So, what to actually do this week, for free

1. Stripe account, test a purchase.
2. Twilio trial, verify the spare phone, switch on OTP in Supabase, test login.
3. Register on the HMRC Developer Hub and start the recognition application.
4. Set up the Meta WhatsApp app and send yourself a test message.

That gets you a secure, working, privately testable product on a free URL, with the longest-lead approval already in motion, for £0. The moment you are paid, the small list above turns it into a public launch.

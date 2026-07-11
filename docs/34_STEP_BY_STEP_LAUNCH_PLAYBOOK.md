# 34: Step by Step Launch Playbook

> Every action, in order, with exactly what to do at each step. Tick the boxes. Where a step needs a value from our setup, it is written out for you. The slow accountant work runs in the background and never blocks the rest. UIs change, so button names may differ slightly, but the actions are right.

Legend: **[You]** you do it. **[Me]** I do it or have done it. **[You + accountant]** background track.

---

## Before you start, gather these

- [ ] A card for the small costs (about £185 plus Vercel Pro to be fully live).
- [ ] Your and your partner's full names, dates of birth, and home addresses (for incorporation).
- [ ] A phone for the WhatsApp number and for verification codes.
- [ ] 90 minutes for Phase A, then a second sitting for B and C.

---

## PHASE A. Foundations

### Step 1. Buy the domain  [You]
- [ ] Go to a registrar (Cloudflare Registrar is cheapest and clean, or Namecheap, GoDaddy).
- [ ] Buy **lekhio.app**. Also buy **lekhio.co.uk** to protect it.
- [ ] Turn on auto-renew so you never lose it.
- [ ] Do not buy their email or hosting add-ons, we handle those.

### Step 2. Email on the domain  [You]
- [ ] Easiest free route: add the domain to **Cloudflare**, then open **Email Routing**.
- [ ] Create forwarding addresses, each pointing to your normal inbox:
  - support@lekhio.app
  - hello@lekhio.app
  - privacy@lekhio.app
- [ ] Cloudflare adds the email DNS records for you, click to accept them.
- [ ] Test by emailing support@lekhio.app and checking it lands.
- [ ] If you want to send **from** these addresses later (nicer for customers), upgrade to Google Workspace at about £5 a user a month. Forwarding is fine to launch.

### Step 3. Incorporate Lekhio Ltd  [You], with a quick check to the accountant first
Decision first: if the accountant can move fast, let **them** incorporate it as part of the structure so there is no rework. If they are slow and you want to launch, incorporate it yourself now. Restructuring a young company into the holdco later is routine.

If doing it yourself:
- [ ] Go to **GOV.UK, "Set up a private limited company and register for Corporation Tax"**.
- [ ] Company name: **Lekhio Ltd**. Check it is available in the same flow.
- [ ] Registered office address: your home or a registered office service. This is public, so consider a registered office service (about £30 a year) to keep your home address private.
- [ ] Directors: you and your partner.
- [ ] People with significant control: you and your partner.
- [ ] Shares: simplest is **2 ordinary shares, one each, £1 each, 50/50**. Note for the accountant: we want this moved to **A and B alphabet shares under Lekhio Ltd**, so tell them at handover. Do not overthink the share class now if you are launching fast.
- [ ] SIC codes (what the company does), use:
  - **62012** Business and domestic software development
  - **62020** Information technology consultancy activities
  - **66190** Activities auxiliary to financial services
- [ ] Pay the **£100** fee. You get the company number and incorporation by email, usually within 24 hours.

### Step 4. Hand the accountant the structure brief  [You + accountant]  (background, non-blocking)
- [ ] Email a startup accountant. Attach **Accountant_Brief.md**.
- [ ] Ask for the plan and fee for: Lekhio Ltd holdco, alphabet shares, moving Ecom in with HMRC clearance, R&D relief, and payroll setup.
- [ ] This now runs in the background. Carry on with everything below.

### Step 5. ICO data protection fee  [You]
- [ ] Go to the **ICO website, "Pay the data protection fee"**.
- [ ] Answer the short questions. As a small business you are in the lowest tier.
- [ ] Pay **£52** (a little less by direct debit).
- [ ] Keep the registration reference. This makes the "registered with the ICO" line on the site true.

### Step 6. Business bank account  [You]
- [ ] Open a free account with **Tide, Starling, or Mettle** in the name **Lekhio Ltd** (you will need the company number from step 3).
- [ ] This is where Stripe pays out. Note the account details for Stripe later.

---

## PHASE B. Switch the product on

### Step 7. Point the domain at Vercel  [You], I confirm  [Me]
- [ ] In **Vercel**, open the Lekhio project, **Settings, Domains**, add **lekhio.app**.
- [ ] Vercel shows DNS records. Add them at your registrar or in Cloudflare.
- [ ] Wait for it to verify (minutes to an hour).
- [ ] In Vercel **Settings, Environment Variables**, set:
  - `NEXT_PUBLIC_APP_URL` = `https://lekhio.app`

### Step 8. Upgrade Vercel to Pro  [You]
- [ ] In Vercel, **Settings, Billing**, upgrade to **Pro** (about £16 a month). Needed for function time and cron.

### Step 9. Run the database  [You], I prepared it  [Me]
- [ ] In **Supabase**, open your project, **SQL Editor**.
- [ ] Paste the whole of `supabase/schema.sql` and run it. Safe to re-run.
- [ ] Confirm these are set in Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

### Step 10. Anthropic, the receipt brain  [You]
- [ ] At **console.anthropic.com**, add **5 to 10 dollars** credit.
- [ ] Create an API key.
- [ ] In Vercel set `ANTHROPIC_API_KEY`, then redeploy.

### Step 11. WhatsApp, the core loop  [You]
- [ ] At **developers.facebook.com**, create an app, add the **WhatsApp** product.
- [ ] Note the **test number** and the **phone number id**.
- [ ] In Vercel set these, then redeploy:
  - `WHATSAPP_TOKEN` (the access token)
  - `WHATSAPP_PHONE_NUMBER_ID`
  - `WHATSAPP_VERIFY_TOKEN` (any long random string you choose)
  - `WHATSAPP_APP_SECRET` (the app secret)
- [ ] In Meta, set the webhook to `https://lekhio.app/api/whatsapp`, enter the same verify token, save, and subscribe to **messages**.
- [ ] Add your own mobile as a test recipient.

### Step 12. OpenAI Whisper, voice notes (optional)  [You]
- [ ] At **platform.openai.com**, add a little credit, create a key.
- [ ] In Vercel set `OPENAI_API_KEY`, redeploy. Skip if you are launching without voice.

### Step 13. Stripe, payments  [You]
- [ ] At **stripe.com**, create the account in the **Lekhio Ltd** name, complete business details, connect the bank from step 6.
- [ ] Start in **test mode**. Set in Vercel: `STRIPE_SECRET_KEY` (the test `sk_test_...` first).
- [ ] Add a webhook endpoint `https://lekhio.app/api/stripe/webhook`, listen for `checkout.session.completed`, reveal the signing secret, set `STRIPE_WEBHOOK_SECRET`, redeploy.
- [ ] Optional invoice email: set `RESEND_API_KEY` and `EMAIL_FROM` once the domain is verified in Resend.

### Step 14. Reminders cron  [You]
- [ ] In Vercel set `CRON_SECRET` to a long random string.
- [ ] At **cron-job.org** (free), create two jobs hitting, with your secret:
  - `https://lekhio.app/api/cron/reminders?job=due&secret=YOUR_SECRET` every 15 minutes
  - `https://lekhio.app/api/cron/reminders?job=nudge&secret=YOUR_SECRET` once in the evening

---

## PHASE C. Prove it, the gate

### Step 15. End to end test  [You], I will help debug  [Me]
Run every line. Do not launch until all pass.
- [ ] Sign in on the app with your number, land on the dashboard.
- [ ] WhatsApp a receipt photo to the number, get the confirmation, see it appear in the app.
- [ ] Send a voice note expense, it logs (if Whisper is on).
- [ ] Type "spent £30 on screws at Screwfix", it logs as an expense.
- [ ] Type "got paid £400 by Dave", it logs as income.
- [ ] Text "remind me to price up Dave's job tomorrow at 8am", it lands in the diary and fires.
- [ ] Open Tax, Prepare my summary, check the figures, approve.
- [ ] Create an invoice, share the link, pay with Stripe test card **4242 4242 4242 4242**, it flips to paid once.
- [ ] Hit `https://lekhio.app/api/cron/reminders?job=due&secret=YOUR_SECRET`, it returns ok.
- [ ] Anything fails, send me the error and I fix it.

---

## PHASE D. Accounts and launch

### Step 16. Create the social accounts  [You]
- [ ] Follow **Account_Setup_Kit (doc 32)**: one handle across all five, bios, link, pinned posts.
- [ ] Connect all five to **Buffer**.
- [ ] Send me the final handle and the live trial link.

### Step 17. Go live  [You], then the engine runs  [Me]
- [ ] In Stripe, switch from test to **live** keys, update `STRIPE_SECRET_KEY` and the live webhook secret in Vercel.
- [ ] Move from the WhatsApp test number to your **real spare number** (follow the spare-number checklist in doc 13).
- [ ] Final smoke test on the live setup with a real card and your phone.
- [ ] **Launch.** Start handing out cards and selling in person. I begin the organic engine once you say we are bulletproof.

---

## Money checkpoints

You can stop at any phase. Spend happens at: domain (step 1, ~£12), incorporation (step 3, £100), ICO (step 5, £52), Anthropic credit (step 10, ~£5), Vercel Pro (step 8, ~£16/mo). The rest is pay as you go or free. Total to be fully live and legal, about **£185 plus Pro**.

---

## Who does what, summary

- **You:** every account, payment, key, and the go-live switch. These need a human and your logins, and I should not hold credentials.
- **Me:** the codebase is built and the env var names and URLs above are correct, I debug anything that fails the test, and I run the content engine the moment accounts exist and you give the word.
- **You and the accountant, background:** the holdco, the Ecom move, payroll, R&D. Never blocks launch.

Work down it. Ping me at any step that throws an error or a question and I will unblock it on the spot.

# 24: Master Action Checklist, everything that needs doing

> The single prioritised list of everything parked, from setting up the business to going live. The product is built. This is the human and money work that turns it on. Tick top to bottom. Costs confirmed June 2026 (after the February and April 2026 UK fee rises). Detail for the technical steps is in doc 23.

---

## The critical path, the first five things

If you only do five things, do these, in this order:
1. Decide the business structure (sole trader to move now, or incorporate Lekhio Ltd). See P0.
2. Buy **lekhio.app** and point it at Vercel.
3. Set up email on the domain (free forwarding is fine to start).
4. Pay the **ICO data protection fee**, £52. This is the one legal must do.
5. Add the **Anthropic** and **WhatsApp** keys and prove the receipt loop on your phone.

Everything else hangs off these.

---

## P0. Decide and lay the foundation

- [ ] **Business structure decision.** Two honest options:
  - **Sole trader.** Free, instant, register with HMRC. Best to launch fast and cheap. You can incorporate later.
  - **Limited company, Lekhio Ltd.** About £100 to incorporate at Companies House (the digital fee doubled to £100 in February 2026), plus a £50 confirmation statement each year. Gives limited liability, looks more solid to Stripe, banks, and bank-link partners, and matches the branding which already says "a Lekhio Ltd company".
  - Recommendation: if you can spare £100 and want it done properly, incorporate the Ltd now, since the brand and future partnerships assume it. If cash is tight this week, launch as a sole trader and incorporate the moment there is revenue. Either works.
- [ ] **Buy the domain.** lekhio.app and lekhio.co.uk. About £10 to £15 a year.
- [ ] **Choose email.** support@, privacy@, hello@lekhio.app. Cheapest is free email forwarding (Cloudflare Email Routing) into your normal inbox. Or Google Workspace at about £5 a user a month for proper sending and a shared inbox. Forwarding is fine to launch.

---

## P1. Identity, legal, and the money rails

- [ ] **ICO data protection fee, £52.** Required because you handle personal and financial data. Sole traders included. Slightly less by direct debit. This makes the "registered with the ICO" trust claim true. See doc 14.
- [ ] **Business bank account.** Free options for the self employed: Tide, Starling, Mettle. Needed for Stripe payouts. If you incorporate, open it in the company name.
- [ ] **HMRC.** If sole trader, register for Self Assessment. If a company, you will handle Corporation Tax and a director's Self Assessment. Free.
- [ ] **Point the domain at Vercel** and set `NEXT_PUBLIC_APP_URL` to https://lekhio.app. Swap the app's two placeholder URLs to lekhio.app.
- [ ] **Upgrade Vercel to Pro.** Needed for function time and cron frequency at scale. See doc 21.

---

## P1. Switch the product on (the go live runbook, doc 23)

- [ ] Run all of `supabase/schema.sql` in Supabase.
- [ ] Anthropic: add credit (5 to 10 dollars), create key, add `ANTHROPIC_API_KEY`.
- [ ] Meta WhatsApp: create the app, add the product, set the webhook to https://lekhio.app/api/whatsapp, add the four WhatsApp env vars.
- [ ] OpenAI Whisper (optional, for voice): add credit and the key.
- [ ] Set `CRON_SECRET` and point a free external cron (cron-job.org) at the reminder URLs.
- [ ] Run the end to end test script in doc 23. Receipt, voice, text, income, reminder, invoice, tax summary, Stripe test card.

---

## P2. Trust, compliance, and payments polish

- [ ] **Stripe.** Create the account, complete business details, connect the bank. Add `STRIPE_SECRET_KEY` and the webhook secret. Test with card 4242 4242 4242 4242, then go live.
- [ ] **Trademark Lekhio.** About £205 for the first class at the UKIPO online (the fee rose from £170 in April 2026), plus £60 per extra class. Not required to launch, but recommended early to protect the name.
- [ ] **Privacy policy and terms.** Already drafted as pages on the site. Read them once with your real company details in, and the ICO and email in place.
- [ ] **WhatsApp business setup for scale.** Set the display name, complete Meta business verification, and register message templates for the proactive reminders and the weekly summary, with the per message cost budgeted. See doc 21. Free form replies work inside the 24 hour window without this.

---

## P2. Publish the app (when the loop is proven)

- [ ] Apple Developer, about 99 dollars a year. Google Play, about 25 dollars one off.
- [ ] Build production iOS and Android with EAS (free Expo account), submit to the stores.
- [ ] Once approved, swap the placeholder store badges for the real links, and add the one tap "Message Lekhio" button (wa.me/your number). See doc 20.

---

## P2. Get your first users ready (free, do while you wait)

- [ ] Write the launch posts for trade Facebook groups, Reddit, LinkedIn.
- [ ] Write the outreach scripts to recruit the first 10 to 20 trades you know.
- [ ] Write the first WhatsApp reply a new user gets, warm and reassuring. The highest stakes trust moment.
- [ ] (I can draft all three now. Just say the word.)

---

## P3. After launch, in order

- [ ] First 10 to 20 real users. Watch them. Fix what trips them up.
- [ ] Replace the illustrative reviews with real ones.
- [ ] Build the bank link (doc 22). The biggest "make life easy" feature.
- [ ] Phase 2 marketing engine, then Phase 3 Connect.

---

## The money, totalled

Bare minimum to be live and legal: domain (~£12), ICO (£52), Anthropic credit (~£5), and Vercel Pro (~£16 a month). Around £85 plus Pro, with a free business bank and sole trader registration. Everything else, the company incorporation, the trademark, the app store fees, and the bank link, can follow as revenue allows.

---

## Sources

- ICO data protection fee: https://ico.org.uk/for-organisations/data-protection-fee/
- Companies House fees from February 2026: https://www.gov.uk/government/news/companies-house-fees-are-changing-from-1-february-2026
- UKIPO new fees from April 2026: https://www.gov.uk/government/publications/intellectual-property-office-new-fees-from-1-april-2026/new-fees-from-1-april-2026-for-designs-trade-marks-and-patents

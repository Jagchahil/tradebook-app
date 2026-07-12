# 17: Roadmap

> **PRICE CORRECTED 12 JUL 2026.** This doc carried £29 a month. The real launch price is **£12.99 a month / £129 a year**, 14-day trial, no card. `lib/stripe.ts` is the source of truth; `public/llms.txt` is tested against it.

> Where Lekhio is today and what it takes to launch. A snapshot in time, written 2026-06-25. The build is in strong shape. What remains is mostly founder setup, wiring the live keys, and publishing. Work top to bottom.

---

## What we have built

### Brand and identity
- Name Lekhio, parent company Lekhio Ltd, full palette and logo. See doc 07.
- Voice, positioning for all UK sole traders, and the trust strategy. See docs 02, 16.

### Website (live on Vercel)
A premium, animated, mobile-responsive marketing site:
- Hero with an animated WhatsApp chat demo.
- How it works, an animated onboarding demo, and an animated app demo.
- A count-up stats band, a who it is for section, and a features grid.
- An interactive HMRC and Making Tax Digital explainer with a year timeline.
- A competitor comparison table.
- A trust section with floating badges and a "we will / we will never" list, plus a slim trust bar across the top.
- Pricing, reviews, and an FAQ. (The £29 that used to be written here is WRONG. The launch price is £12.99 a month or £129 a year, 14-day trial, no card. See `docs/93` and lib/stripe.ts, which is the source of truth.)
- A single dropdown menu, and "Sign up now" calls to action throughout.

### Onboarding flow (live on the web, at /start)
A clean multi step signup: mobile and email, how you trade, your trade with a type your own option, optional address, VAT, then a no card free trial and a download the app screen. Fully working as an experience. It does not yet save the signup or take payment.

### Mobile app (runs on a dev build)
A login only companion, matching the website look:
- Welcome and login screens, with sign up on the web links.
- Dashboard with count up figures, a this month income and expenses view, and pull to refresh.
- Activity, Invoices, Tax with a quarter timeline, Settings with a privacy and security explainer, and a business profile editor.
- A shared brand theme and a small animation kit.

### Backend code (written, not yet switched on)
In the repo, ready for keys:
- WhatsApp webhook handler, with signature checking.
- Claude vision receipt parsing and conversation, and Whisper voice transcription.
- Supabase data layer, with row level security, invoices, transactions, and sessions.
- Stripe checkout and webhook, and a Resend email path for invoices.
- The database schema.

### Documentation
Vision, product, build plan, marketing, compliance, stack, brand, progress, audit, API costs, competitive audit, master plan, go live runbook, data inventory, market sizing, and trust.

---

## What needs to be done

### Phase A. Founder setup (no code, unblocks everything)
- [ ] Register lekhio.app and lekhio.co.uk, point the domain at Vercel, set the public URL env vars, and swap the in app and on site links from the Vercel address to lekhio.app.
- [ ] Run a Lekhio trademark check and file if clear.
- [ ] Pay the ICO data protection fee, so "registered with the ICO" is true. See doc 14.
- [ ] Set up support@lekhio.app with a real person behind it.
- [ ] Register as a sole trader with HMRC.
- [ ] Open the accounts and create the keys: Anthropic, Meta WhatsApp Cloud API, OpenAI Whisper, Stripe. See doc 13.
- [ ] Confirm the Supabase schema is fully run in the production project.

### Phase B. Switch on the core loop (the wedge)
- [ ] Add the keys to Vercel and redeploy.
- [ ] Verify the WhatsApp webhook with Meta and subscribe to messages.
- [ ] Test end to end: photo of a receipt, then a voice note, then a typed expense, then a typed income line, each logging and replying, and appearing in the app.
- [ ] Test the WhatsApp invoice flow, create and send an invoice.
- This proves Phase 0 and is the heart of the product.

### Phase C. Connect signup, login, and payment
- [ ] Persist the /start signup to Supabase, creating the account.
- [ ] Real phone login in the app, a one time code by SMS, so a person who signed up on the web logs into the same account.
- [ ] Stripe subscription at the end of the 30 day trial, with the webhook, and a trial ending reminder.
- [ ] Swap the placeholder app store badges on the success screen for real links once the app is published.

### Phase D. Publish the app
- [ ] Build production iOS and Android apps and submit to the App Store and Play Store.
- [ ] Write the store listings, and once approved, point the download links at the real store pages.
- Remember, payment stays on the web, the app is the free companion, so there is no app store commission.

### Phase E. The tax preparation feature (the promise)
- [ ] Build the quarterly summary preparation from confirmed records.
- [ ] Keep the human approval gate before anything is sent.
- [ ] Connect a recognised route for Making Tax Digital submission. This is the regulated part and the biggest unknown, likely through recognised software or a partner. Research and plan this early, even though it is needed later. See doc 05.

### Phase F. Launch and grow
- [ ] Get the first ten real sole traders using it, watch them, fix what trips them up.
- [ ] Replace the illustrative reviews with real customers.
- [ ] Build the WhatsApp referral loop, the cheapest acquisition channel.
- [ ] Then Phase 2, the marketing engine, and Phase 3, Connect. Not before Phase 1 is shipped.

---

## The honest critical path

Nothing ships until Phase A keys and the domain are in. The single most important proof is Phase B, the WhatsApp loop working on a real phone. Everything else, payment, login, publishing, can follow once the loop is real.

### Recommended next three steps
1. Register lekhio.app and point it at Vercel.
2. Add the Anthropic and WhatsApp keys and prove the receipt loop on your own phone.
3. Pay the ICO fee and stand up support@lekhio.app, so the trust claims are all true.

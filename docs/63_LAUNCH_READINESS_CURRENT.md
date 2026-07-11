# 63: Launch Readiness — Where We Are and the Order to Go Live

> NOTE (7 Jul 2026): doc 81 is now THE current master picture and launch checklist. Keep this as the 30 June readiness snapshot only. Doc 60, which this once superseded, has been deleted. Read doc 81 first.

> Snapshot taken 30 June 2026, after a full build + five-front deep audit + fixes. The honest one-line: the product is built, tested, and the WhatsApp loop is live end to end. What stands between here and paying customers is now almost entirely **external accounts and money**, not code.

---

## 1. Done and already live

These are working in production right now, verified today.

- **The WhatsApp loop, end to end.** Real business number (+44 7593 214044) under the Tradebook WhatsApp Business Account, a **permanent System User token** (no expiry), webhook verified and subscribed to `messages`. Texting the number logs to the database and replies. Proven with a real mileage entry.
- **Phone OTP login.** Twilio Verify + Supabase phone auth. Anonymous sign-in is now blocked in production builds (closes the takeover risk).
- **Database hardened.** The root-cause incident is fixed: Vercel `SUPABASE_SERVICE_ROLE_KEY` is the real service-role key (was the anon key). RLS policies applied to prod. Phone lookup is an indexed exact match.
- **Tax engine: 88/88 exam pass (100%).** Figures verified against GOV.UK today: dividend rates (additional stays 39.35%), Class 2 (£7,105 SPT, £3.65/wk), mileage 55p, all 2026/27 constants. The dashboard "set aside" delegates to the one canonical engine.
- **Data integrity fixed.** Every tax/profit figure now counts **confirmed-only** receipts, so screens agree and the accountant export rests on approved data. Invoice "mark paid" is atomic and idempotent (no double-booking). Figures refresh live after you approve a receipt.
- **Stripe subscription billing built and tested** (test mode): web checkout, 30-day trial, webhook stores the subscription, success/cancel pages.
- **Billing tied to the phone.** A phone-only payer is recognised: phone flows signup → checkout → webhook → `subscriptions.phone`. `/api/billing/status` resolves entitlement by phone; Settings shows the real plan status.
- **GDPR built.** Self-service **data export** and **account erasure** in Settings → Your data (scoped to the user, deletes server-only rows too).
- **Free prep done:** Stripe test account + test purchase, phone OTP, Meta WhatsApp dev → production number.

---

## 2. Built but waiting on a switch (no more coding)

- **Paywall enforcement.** Fully built, **dormant**. Flip `EXPO_PUBLIC_PAYWALL_ENABLED=true` (app env) at launch and rebuild. Fails open, so a glitch never locks out a payer.
- **AI features** (receipt photos via Claude Vision, voice notes via Whisper, accountant Q&A, free-text expense parsing). Built and gated; they show a friendly "not switched on" until the keys have credit. Mileage and CIS already work without AI.
- **HMRC MTD filing.** Submission code built and sandbox-ready; switches from "prepare, you file via HMRC" to "we submit" only after recognition.

---

## 3. The go-live runbook — in order, the day the money is in

Each step is independent unless noted. Costs are approximate.

1. **Vercel Pro** (~£16/mo). Unlocks the 15-minute reminder cron cadence and headroom. (On Hobby today the cron falls back to ~daily — fine for testing.)
2. **AI credit.** `ANTHROPIC_API_KEY` already in Vercel — add a few pounds of Anthropic credit. Add `OPENAI_API_KEY` + a little credit for voice notes. Redeploy. Photos, voice, and the accountant bot come alive.
3. **Stripe live.** Swap the test `STRIPE_SECRET_KEY` for the **live** key, add a **live** webhook endpoint → `STRIPE_WEBHOOK_SECRET`. Add the Lekhio logo + brand colour in Stripe → Settings → Branding. Run one real-card test, then you can charge.
4. **Meta Business Verification.** Needed to message beyond a handful of test recipients. Wants the company registered (step 6). Until verified, you can soft-launch to a small number.
5. **Domain + email** (~£10/yr + a few £/mo). Buy lekhio.app, set up email, point the apps at it. Optional to operate (the Vercel URL works) but needed to look the part.
6. **Incorporate Lekhio Ltd** (£50, Companies House) — or keep trading as a sole trader to start. Then the **ICO data protection fee** (~£40/yr) before real members of the public, and a **business bank account**.
7. **HMRC Developer Hub** — register, get sandbox creds, start the production **MTD recognition** application (longest lead time, up to ~10 working days — start it as early as possible).
8. **App stores** — Apple Developer (£79/yr) + Google Play (£20 once). Build with EAS, submit (review queues, so submit early).
9. **Flip the paywall on** (`EXPO_PUBLIC_PAYWALL_ENABLED=true`) and do a **soft launch** to a few friendly tradespeople before any marketing.

---

## 4. Small code follow-ups (nice to have, not blockers)

- **MTD quarter accuracy:** period filtering uses `created_at`; switch to `transaction_date` (and store the receipt's parsed date) so a back-dated entry lands in the right quarter. Matters once bank feeds land.
- **Rate limiter → Upstash** (free tier) for a true per-sender ceiling across instances at high volume. The durable AI cost cap is already the real ceiling.
- **Native IAP caveat:** Apple/Google may require in-app purchase rather than Stripe-in-app for the subscription. Check store rules before submitting; the web checkout is fine for now.
- **Webhook 5s budget:** at very high volume, defer the heavy AI work so Meta always gets a fast 200. The regex paths (mileage/CIS) are already fast; AI paths are off today.

---

**Bottom line:** engineering is essentially done and hardened. Launch is now a sequence of paid accounts and approvals, taken in the order above. The day funds arrive, steps 1–3 alone make it a real, charging product; steps 4–9 make it a fully public one.

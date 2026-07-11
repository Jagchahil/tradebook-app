# 19: Security Audit

> A sweep of the website and app for leaks, exposed secrets, and anything that calls out. Done 2026-06-25. Overall: clean. One open-endpoint cost risk was hardened. Recommendations for go-live are at the end.

---

## What was checked and the result

| Check | Result |
|---|---|
| Hardcoded secrets in source (keys, tokens, private keys) | None. Only doc comments and a node_modules hash matched the scan. |
| Service role key and all secrets stay server side | Confirmed. `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `WHATSAPP_TOKEN`, `WHATSAPP_APP_SECRET`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `CRON_SECRET`, `RESEND_API_KEY` appear only in API routes and server lib files. |
| Client bundles never import server libs | Confirmed. The two client components (`/start`, `/early-access`) import no server lib. The service key cannot reach the browser. |
| The app uses only public values | Confirmed. The mobile app references only `EXPO_PUBLIC_` variables (the anon key and URLs), which are safe to ship. |
| Third party trackers, analytics, external fonts or scripts | None. No Google Fonts, no analytics, no external script or link tags. Nothing pings out except the services the product needs. |
| Personal data in logs | None. Logs record status and counts, never message text, phone numbers, or emails, per the data rules. |
| Row level security on every table | Yes. All 10 tables have RLS enabled. User tables restrict to the owner; service only tables (signups, sessions) have RLS on with no policies. |
| Webhook authentication | The WhatsApp webhook verifies the `x-hub-signature-256` signature. The Stripe webhook verifies its signature. |
| Cron endpoint | Guarded by `CRON_SECRET`. With no secret set it is closed. Verified it returns 401 without the secret. |
| Committed `.env` files | None committed in the repos. |

---

## What was hardened

The open public endpoints (`/api/draft-invoice`, `/api/onboard`, `/api/waitlist`) had no rate limiting. `draft-invoice` calls Claude, so a flood could run up the AI bill. Added a best effort in-memory per IP rate limit (`lib/ratelimit.ts`) and applied it:
- `draft-invoice`: 20 requests per 5 minutes per IP, then 429.
- `onboard`: 12 per 10 minutes per IP, then 429.

`draft-invoice` already caps the description length, so the cost per call is bounded too.

---

## Known limits and go-live recommendations

These are not leaks. They are sensible next steps once real money and users are flowing.

1. **Rate limiting is per instance.** In memory limiting only covers a single warm serverless instance. For a hard guarantee, move to a shared store such as Upstash (free tier) and add app authentication so only signed in users can call `draft-invoice`.
2. **Rotate any key that was ever shared.** The mobile `.env` (public anon key only) sat in git history briefly. The anon key is safe to ship, but if a secret key is ever committed by accident, rotate it immediately. Never commit `.env.local`.
3. **Webhook fast acknowledgement.** The WhatsApp webhook does its work before replying 200. Meta wants a 200 within 5 seconds or it retries, which can double process. Transactions are already idempotent by message id. Consider acknowledging first and processing after, once volume grows.
4. **Public invoice links.** An invoice is viewable by anyone with its link, by design, and the id is an unguessable UUID. Fine for sharing. Do not put anything in an invoice you would not want a link holder to see.
5. **Set `CRON_SECRET`** in Vercel and the scheduler before switching reminders on, so the cron endpoint is never open.
6. **Dependencies.** Run `npm audit` on both repos before launch and keep an eye on advisories.

The build holds no secrets and leaks nothing. Keep secrets in Vercel environment variables and the app's `.env.local`, never in code.

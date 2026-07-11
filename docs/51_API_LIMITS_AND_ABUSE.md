# 51: API Limits and Abuse Protection

> Every endpoint, what it can cost us, and the exact limits that protect it. The goal is simple: no one can ever run up an insane bill, and bots cannot farm the funnel. Updated June 2026.

---

## The cost surfaces

Only two things cost us money per request: the AI (Claude for vision and text, OpenAI Whisper for voice) and outbound messages and emails. Everything else is database reads and writes, which are effectively free at our scale.

Two layers protect the AI spend:
1. **In-memory burst limit.** Fast, per serverless instance. Stops rapid floods.
2. **Database daily budget.** Durable, shared across every instance. The hard cap. This is the one that guarantees no insane bill, because it cannot be bypassed by spinning up more instances or by sustaining traffic over hours.

---

## Endpoint by endpoint

| Endpoint | Who can call it | Costs money? | Limits |
|---|---|---|---|
| `POST /api/whatsapp` | Only Meta (HMAC signature verified). An attacker cannot call it directly. | Yes, the big one. Claude vision, Claude text, Whisper. | Signature required. Idempotent per message id. **Burst: 30 messages per phone per 10 minutes**, silently dropped over that. **Hard daily AI budget: 120 paid AI calls per phone per day, and 4,000 globally per day** (a kill switch). Over either, we reply that we are busy and spend nothing. Every paid AI handler also requires a linked account. |
| `GET /api/whatsapp` | Meta (verify token) | No | Verify token check. |
| `POST /api/draft-invoice` | The app, and anyone (CORS open) | Yes, one Claude text call | **20 per IP per 5 minutes.** Input length validated. Returns only drafted text, no user data. |
| `POST /api/onboard` | The public signup form | Tiny, one welcome email | **12 per IP per 10 minutes.** Phone and email validated. **Honeypot field** and **minimum fill time** drop bots. **Turnstile** ready, inert until configured. Never returns user data. |
| `POST /api/waitlist` | The public waitlist form | No | **12 per IP per 10 minutes.** Validated. |
| `GET /api/pay/[id]` | The customer paying an invoice | No, creates a Stripe checkout | Only acts on an existing invoice, refuses if already paid. Paying an invoice benefits us, so there is no abuse upside. |
| `POST /api/stripe/webhook` | Only Stripe (signature verified) | No | Stripe signature required. |
| `GET /api/cron/reminders` | The scheduler | Yes, template sends | Bearer `CRON_SECRET` required. |

---

## The hard AI budget, in detail

Before any paid AI call, the webhook increments two durable daily counters in the `ai_usage` table and refuses to spend if either is over its cap:

- **Per phone:** `PHONE_DAILY_AI = 120` calls a day. A heavy genuine user logs maybe 30 to 50 receipts and questions a day, so 120 is generous headroom while capping any single account hard. At a worst case Claude vision cost, 120 calls is pennies, not pounds.
- **Global:** `GLOBAL_DAILY_AI = 4,000` calls a day across all users. This is the kill switch. If a coordinated attack or a bug ever drove usage up, the whole system stops spending on AI for the rest of the day, long before the bill is meaningful. At launch volume this is huge headroom, so real users are never affected.

The counter is atomic (a Postgres function with a unique key per day, scope and key), so it is race safe across concurrent requests. If the database call ever errors, we fail open and rely on the in-memory burst limit as the backstop, so a database hiccup never breaks the product. Tune the two numbers in `app/api/whatsapp/route.ts`.

To watch spend: `select day, scope, sum(count) from ai_usage group by 1, 2 order by 1 desc;`

---

## Bot and data mining protection

There is no user data to mine. Every user table is locked by row level security, the anon key cannot read anything that is not the signed in user's own, and no endpoint returns user data to an unauthenticated caller. The public pages and free tools are public by design and hold no personal data.

The real bot risk is junk signups. Three things stop them:
1. **Honeypot.** A hidden field on the signup form that people never see. If it is filled, the submission is a bot, and we silently save nothing.
2. **Minimum fill time.** A real person takes seconds across the five steps. A submission faster than 1.5 seconds is dropped.
3. **Rate limit.** 12 signups per IP per 10 minutes.

The account that actually matters, the one that links WhatsApp and can spend AI, requires **phone OTP verification** at creation in the app. So even a signup that slips through the web form cannot become a usable, AI spending account without passing OTP.

### Turnstile, ready to switch on at launch

Cloudflare Turnstile (a free, privacy friendly CAPTCHA) is wired into the onboard endpoint but inert until configured. To enable it:
1. Create a Turnstile widget at Cloudflare, get the site key and secret.
2. Add the widget to the `/start` form and send its token as `turnstileToken` in the signup body.
3. Set `TURNSTILE_SECRET` in the environment.
Set the secret only once the widget is live, or signups will be rejected for missing a token.

---

## Honest residual risks (and the next hardening step)

- The **in-memory burst limit is per instance**, so across many warm instances the effective short window cap is higher than 30. This only matters for very short bursts, and the **durable daily budget is the real cap underneath it**, so the bill is still bounded. For a perfectly smooth short window limit too, move the burst limiter to a shared store such as Upstash Redis.
- The hard daily budget makes the worst case a small, bounded amount per day, never an insane bill. If you want it even tighter, lower `PHONE_DAILY_AI` and `GLOBAL_DAILY_AI`.

Net: the spend is hard capped per account and globally, every webhook call is authenticated, public AI is rate limited, and signups are bot trapped with OTP at the point that matters.

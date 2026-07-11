# 21: Scale Audit. Will it hold at 1000 users and a year of use?

> We cannot fast forward a year, so instead we stress tested the heaviest server paths at 1000 user volume, found the one place it would fall over, and fixed it. Done 2026-06-25.

---

## Verdict

With the fixes below, the system holds comfortably at 1000 users and a year of use. The crash risk from our own code is low. The real risks at scale are operational and about money and limits, not the code falling over. Those are listed at the end so they can be planned for.

---

## What we simulated and found

### 1. The reminder cron fan out. This was the real flop, now fixed.
The nudge and weekly jobs text every user in one function run. The original code looped users one at a time and awaited each send.

Simulated at 1000 users with a realistic 150 to 400ms send each:

| Approach | Time for 1000 sends | Result |
|---|---|---|
| Sequential (old code) | ~350s | TIMEOUT. Past Vercel's 300s hard max. Would fail and only half send. |
| Concurrency 20 (new code) | ~14s | Fine |
| Concurrency 50 | ~7s | Fine |

Fix shipped: the cron now fans out with a fixed pool of 20 workers, and the function declares `maxDuration = 60`. Concurrency 20 also stays under Meta's default of about 80 messages a second.

### 2. Database volume over a year. Fine.
Rough load: 1000 users times about 8 entries a week times 52 is around 416,000 transaction rows, plus invoices and events. Postgres handles that easily when the per user reads are indexed. Added indexes for `transactions(user_id)`, `transactions(user_id, created_at)`, and `invoices(user_id)`. The events and reminder lookups were already indexed.

### 3. Per user reads in the app. Hardened.
The app loaded every transaction for a user. Capped it at the most recent 500, so a heavy multi year user never pulls thousands of rows into the phone.

### 4. The WhatsApp webhook. Fine.
Each inbound message runs in its own serverless instance and scales automatically. Transaction writes are idempotent by message id, so a Meta retry never double logs. One thing to watch: Meta wants a 200 within 5 seconds, and a slow AI read can approach that. If it bites at volume, acknowledge first and process after.

---

## The real ceilings to plan for (not code bugs)

1. **Vercel plan.** Hobby caps a function at 10 seconds and limits cron frequency. At 1000 users the nudge needs more than 10 seconds, so you move to Pro, which allows up to 300s and frequent crons. Budget for Pro before you scale.
2. **WhatsApp proactive messages cost money and need templates.** This is the big one. A reminder or nudge sent outside the 24 hour window after the user last messaged you is a business initiated message. Meta requires a pre approved message template for it and charges per conversation. Before switching reminders on at scale: register templates for the nudge, the weekly summary, and the reminder, and budget the per message cost. Free form replies only work inside the 24 hour window.
3. **Meta throughput.** The default is about 80 messages a second per number, so 1000 sends take at least ~12 seconds no matter what. The limit rises with your volume and quality rating over time.
4. **AI rate limits.** Anthropic and Whisper have per account limits. At 1000 users sending sporadically this is fine. Watch the dashboards and request higher limits before a big push.
5. **Beyond a few thousand users,** move the proactive sends to a real queue (for example QStash or BullMQ) for throttling, retries, and back pressure. Not needed for 1000.

---

## Bottom line

At 1000 users and a year of data the application will not crash from its own logic once the cron fan out fix is deployed, which it now is. The work that remains before a big scale up is operational: be on the Vercel Pro plan, set up and budget WhatsApp message templates for the proactive texts, and keep an eye on the AI and messaging rate limits. None of those are emergencies. They are the normal furniture of running a messaging product at scale.

# 18: Feature Ideas, the complete platform

> Ideas that turn Lekhio from a ledger into something that actively runs the back office. What is built, what is queued, and how the reminder engine is scheduled. Written 2026-06-25.

---

## Built now (code ready, switches on with the keys)

- **Quarterly tax summary and approval.** In the app, Tax then Prepare my summary. Shows confirmed income, expenses, profit, a category breakdown, and a rough set aside for tax guide. You approve the figures. Submission to HMRC stays stubbed until a recognised route is wired. This keeps the rule: we prepare, you approve, nothing is sent without you.
- **Diary and reminders.** Text Lekhio "remind me to price up Dave's job tomorrow at 8am". Claude reads the time, it lands in your diary, and you get a text when it is due. Jobs, quotes, reminders, and notes. Seen in the app under Diary.
- **Twice a day expense nudge.** A gentle "don't forget today's expenses" text, morning and evening. On by default, switch it off in the app.
- **Weekly money summary.** A short Sunday text: in, out, and what you kept.

---

## How the reminder engine is scheduled

The sender lives at `/api/cron/reminders`, guarded by `CRON_SECRET`. It takes a `job` of `due`, `nudge`, or `weekly`.

Three ways to run it on a schedule, cheapest first:
1. **A free external cron** such as cron-job.org. Point it at `https://lekhio.app/api/cron/reminders?job=due&secret=YOUR_SECRET` every 15 minutes, and the nudge and weekly URLs at their times. Free and works on any hosting plan.
2. **Supabase pg_cron.** Free, runs inside the database, calls the URL.
3. **Vercel Cron.** `vercel.json` ships with only the two Hobby-safe jobs that run at most once a day: the morning nudge (8am) and the weekly summary (Sunday). The Hobby plan rejects anything more frequent than daily, so the every 15 minutes due check and the evening nudge must come from the external cron in option 1. On a Pro plan you can add those to `vercel.json` too.

Set `CRON_SECRET` in Vercel, and the same secret in whichever scheduler you pick. The external cron calls, for example, `https://lekhio.app/api/cron/reminders?job=due&secret=YOUR_SECRET` every 15 minutes, and `?job=nudge` again in the evening.

---

## Queued ideas to complete the platform

Roughly in order of value to a busy sole trader.

1. **Mileage.** "Drove 24 miles to the job in Leeds" logs 24 at the HMRC rate (45p a mile) as an allowable expense. Trades drive a lot, this is real money back.
2. **Chase unpaid invoices.** "Invoice INV-0007 to Dave is 7 days overdue. Want me to nudge them?" One tap sends a polite reminder.
3. **Set aside for tax, running.** Already shown on the quarterly summary. Extend it to a live figure in the dashboard and a monthly text.
4. **VAT threshold watch.** Warn as rolling twelve month turnover nears £90,000, so registration never sneaks up.
5. **Quarter end MTD nudge.** "Your quarterly update is due in two weeks. You have 3 receipts to review." Ties the diary to the tax deadlines.
6. **Recurring expenses.** Rent, insurance, subscriptions logged automatically each month.
7. **Quote to invoice.** A quote that converts to an invoice in one tap when the customer says yes.
8. **What can I claim.** A plain English answer on allowable expenses, grounded and careful, never overclaiming.
9. **End of day summary.** "You logged 3 things today, net minus £64. Night." Builds the habit.
10. **Spend insights.** "Fuel is up 30% this month." Gentle, useful, not naggy.
11. **Business card capture.** Photograph a card, save the contact for invoicing.

Build these only after the core loop is live and a few real users are on it. Watch what they actually ask for, then build that next.

# 39: WhatsApp Message Templates

> Proactive WhatsApp messages (reminders, nudges, the weekly summary) can only be sent outside the 24 hour window as an approved template. The cron now sends these by name, so the templates below must be created and approved in Meta before reminders work. Register them in WhatsApp Manager, Message Templates, Create. Match the names exactly.

---

## Why this matters

A normal reply (free text) only delivers if the user has messaged you in the last 24 hours. Reminders go out when the user has not messaged recently, so they must be templates. Without these registered, the reminder cron will try to send and Meta will reject it. So this is a launch prerequisite for reminders.

The cron sends each template by its exact name. The variable order matters and is listed below.

---

## The templates to create

All use **Language: English (UK), code en_GB**. Category as noted.

### 1. lekhio_reminder
- **Name:** `lekhio_reminder`
- **Category:** Utility
- **Body:**
  `⏰ Reminder: {{1}}`
- **Variable {{1}}:** the reminder title. Sample value for approval: `price up Dave's job`
- Sent by the `due` cron job when a diary reminder falls due.

### 2. lekhio_nudge
- **Name:** `lekhio_nudge`
- **Category:** Utility (Meta may reclassify as Marketing, see note below)
- **Body:**
  `Quick one. Don't forget today's expenses. Snap a receipt, leave a voice note, or just tell me what you spent.`
- No variables.
- Sent by the `nudge` cron job to users who have daily nudges switched on.

### 3. lekhio_weekly
- **Name:** `lekhio_weekly`
- **Category:** Utility
- **Body:**
  `Your week with Lekhio. In {{1}}, out {{2}}, kept {{3}}. Open the app for the detail.`
- **Variables:** {{1}} income, {{2}} expenses, {{3}} profit. Sample values for approval: `£1,200`, `£350`, `£850`
- Sent by the `weekly` cron job to users with the weekly summary switched on.

### 4. lekhio_tax_deadline (for later, when the tax deadline countdown is wired)
- **Name:** `lekhio_tax_deadline`
- **Category:** Utility
- **Body:**
  `Heads up, your tax return is due {{1}}. Your figures are ready in Lekhio. Reply WALKTHROUGH and I will take you through filing it.`
- **Variable {{1}}:** for example `on 31 January` or `in 7 days`.
- Not yet sent by the cron. Draft it now so it is approved when we switch on the countdown.

---

## Notes

- **The nudge category.** A daily "don't forget" can be read by Meta as Marketing rather than Utility. If Meta classifies it as Marketing, users must have opted in to marketing messages, and there is a per message cost in that category. Two safe options: keep it Utility and accept Meta's decision, or make the nudge opt in only (we already gate it on the user's daily_nudges preference, which is good practice). Budget for the per message cost either way, see doc 21.
- **Costs. CORRECTED 11 Jul 2026, and this one mattered.** The old line budgeted **£1.92 per user per month** for proactive messages and called it "healthy against £29". At the real price of £12.99 that is **15% of revenue**, and it is not healthy, it is most of the margin. The live model (`lib/margin.ts`) allows **57.8p per user per month, which is 19 sends**, and that is what holds the 82% margin. Every proactive send goes through that budget and a kill switch. See the daily digest (`lib/digest.ts`): it is free inside Meta's 24 hour window, which is the only reason we can afford to send at all.
- **Within the 24 hour window**, free text still works and is free. The cron uses templates for reliability because it cannot easily know each user's last message time. This is the correct trade off for reminders that must arrive.
- **Names are load bearing.** The cron calls `lekhio_reminder`, `lekhio_nudge`, `lekhio_weekly`. If you name a template differently in Meta, change it in `app/api/cron/reminders/route.ts` to match, or the send fails.

---

## Where this is wired

- `lib/whatsapp.ts` has `sendTemplate(toPhone, templateName, languageCode, bodyParams)`.
- `app/api/cron/reminders/route.ts` calls it for the three jobs.
- Register the templates, then the reminder system works end to end the moment WhatsApp is connected.

# 39: WhatsApp Message Templates

> Proactive WhatsApp messages (reminders, nudges, trial messages, agent alerts) can only be sent outside the 24 hour window as an approved template. **The weekly summary is not one of them any more**, see section 3. The cron now sends these by name, so the templates below must be created and approved in Meta before reminders work. Register them in WhatsApp Manager, Message Templates, Create. Match the names exactly.

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

### 3. ~~lekhio_weekly~~ RETIRED 27 July 2026. **Do not create it.**

This document told you to register `lekhio_weekly` for months after the code stopped sending it, which is how a doc becomes worse than no doc.

Two things were wrong with the weekly push and only one of them was a bug.

- **The bug:** `lekhio_weekly` and `lekhio_weekly_v2` did not exist in Meta. Every Sunday send had been failing silently for weeks and nothing knew.
- **The design error, which is the more expensive one:** every business initiated WhatsApp message is paid for. At an 85% target margin, pushing a summary at every customer every week, for ever, is a permanent line of cost for something most of them could simply look at.

So the summary became a **pull**. It lives in the product, free, computed when he opens it. WhatsApp carries it only when he asks, which is a reply inside the free inbound window and needs no template at all.

`lib/watemplates.ts` lists this name under `RETIRED_TEMPLATES` and `test/watemplates.test.mjs` **fails the build** if it reappears anywhere in `app/` or `lib/`. Registering it in Meta would achieve nothing except confusion.

### 3a. lekhio_trial_ending
- **Name:** `lekhio_trial_ending`
- **Category:** Utility
- **Status:** approved in Meta, gated behind `TRIAL_TEMPLATES_APPROVED`
- **Body:**
  `Your Lekhio free trial ends on {{1}}. Add a card to carry on, or do nothing and it simply stops. Nothing gets deleted either way.`
- **Variable {{1}}:** the date it ends. Sample value for approval: `27 July`
- Sent by the `trial` cron on **day six of seven**, to a customer who has a bound number.

⚠️ **The template is the SHORT version on purpose.** A Meta template body is fixed text with numbered slots, so a whole weekly summary cannot go through one without approving every shape it can take. The full day six message, which leads with his own figures, goes by **email**, and `lib/routing.ts` decides which of the two a given man actually gets. The words for both live in `lib/trialnudge.ts`.

### 3b. lekhio_trial_ended
- **Name:** `lekhio_trial_ended`
- **Category:** Utility
- **Status:** approved in Meta, gated behind `TRIAL_TEMPLATES_APPROVED`
- **Body:**
  `Your Lekhio trial has ended and your books are safe. Nothing has been deleted. Add a card whenever you are ready and everything opens back up.`
- No variables.
- Sent by the `trial` cron the day after it ends.

### 3c. The agent alerts: `agent_threshold_alert`, `agent_deadline_alert`, `agent_opportunity`
- **Category:** Utility. All approved in Meta, all gated behind `AGENT_TEMPLATES_APPROVED`.
- Each takes **one variable**, `{{1}}`, which is the whole sentence Rakha wrote.
- See `lib/watemplates.ts` for the current parameter counts, which the build asserts against every call site.

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
- **Names are load bearing, and they no longer live in a route.** Since 27 July 2026 every template name the code can send is declared in **`lib/watemplates.ts`**, with its language, its parameter count and its Meta status. A template name **may not be written as a string literal anywhere else**: `test/watemplates.test.mjs` walks `app/` and `lib/` and fails the build if one escapes. If you name a template differently in Meta, change it there and nowhere else.
- **An unapproved template must be behind a gate.** That is the invariant `lib/watemplates.ts` asserts over the whole registry, and its absence is exactly why four bad names sat in the reminder cron failing silently every night. The gates today: `REMINDER_TEMPLATES_APPROVED`, `TRIAL_TEMPLATES_APPROVED`, `AGENT_TEMPLATES_APPROVED`.
- **🔴 A GATE MAY ONLY EVER STOP THE WHATSAPP HALF.** Corrected 30 July 2026. `TRIAL_TEMPLATES_APPROVED` was wrapped around the whole trial cron rather than around its template sends, so an unset flag meant a man heard nothing about his trial ending **by any route at all**, including email, which needs nobody's approval. Launch one is the web, where most customers have no bound number, so that one gate placement would have warned nobody on 10 August. Gate the channel, never the message.

---

## Where this is wired

- `lib/watemplates.ts` is the **only** place a template name may be written. Start here.
- `lib/whatsapp.ts` has `sendTemplate(toPhone, templateName, languageCode, bodyParams)`.
- `lib/routing.ts` decides which channel each kind of message goes down, per customer, at the moment of sending. A template that is not sendable simply drops out of the list; it is never substituted for something else.
- `app/api/cron/reminders/route.ts` sends the daily nudge and the due reminders.
- `app/api/cron/trial/route.ts` sends the trial ladder, **email first**, with the template only when he has a bound number and the gate is on.
- `lib/trialnudge.ts` holds the words for the trial messages and the reasoning for the day six timing. The template bodies above and that file must say the same thing.

⚠️ **Registering the templates no longer makes the difference it used to.** Since 30 July 2026 the trial ladder and the weekly notification both reach a web customer by **email**, which needs no approval from Meta. The templates are how we reach a man who prefers WhatsApp, not how we reach anybody at all.

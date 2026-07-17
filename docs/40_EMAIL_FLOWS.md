# 40: Email Marketing and Lifecycle Flows

> The full set of lifecycle emails for the 30 day free trial, ready to load into Resend, Klaviyo, or any tool. The day 0 welcome is already wired into the signup route and sends automatically once Resend is configured. The rest are drafted here for you to schedule. Brand voice, no dashes. Variables in {{ }}.

---

## The thinking

We are a trial product, so the whole game is: get them to the first WhatsApp action fast, show them the value piling up, then convert before the trial ends. Most churn happens because people never take the first action. So the early emails are all about one thing, snap your first receipt.

Trigger each on behaviour where you can (Klaviyo, Customer.io), or on a simple time schedule to start.

---

## 1. Welcome (Day 0, on signup), LIVE, sends automatically

Subject: Welcome to Lekhio. Here is how to start.

Already built and sending from the signup route (lib/email.ts, sendWelcomeEmail). Gets them to the three first actions: confirm number, snap a receipt, try a text command.

---

## 2. First action nudge (Day 2, if no entry logged yet)

Subject: Your shoebox is safe with us. Send one receipt.

Hi {{name}},

You signed up, nice one. The hard part is over. Now the easy part: text us one receipt.

Snap a photo of anything you have bought for work and send it on WhatsApp. It is logged, sorted, and ready for tax in seconds. No form, no app to open.

If you drove anywhere for work, just text "drove 24 miles" and we log the claim too.

That is the whole thing. Try one now and see.

Reply to this email if you are stuck. A real person answers.

---

## 3. Mid trial value (Day 10)

Subject: You have already saved {{tax_saved}} in tax

Hi {{name}},

In your first week and a bit with Lekhio, you have logged {{expense_total}} of costs. That is roughly {{tax_saved}} you will not be handing to the taxman, money most people leave on the table.

And it took you a few texts.

Keep going. Every receipt, every mile, every job logged now is less to think about in January, and more in your pocket.

---

## 4. Trial ending soon (Day 26)

Subject: Your free month ends in 4 days

Hi {{name}},

Your free month of Lekhio is nearly up. After it, it is one flat £12.99 a month. No tiers, no receipt limits, no surprises, and you can cancel in one tap any time.

Here is what you would keep: receipts, mileage, home working and phone claims by text, your invoices, your CIS tracked, your quarterly figures ready, and a real human on the other end.

You have logged {{entry_count}} entries and saved roughly {{tax_saved}} in tax already. That is the kind of year you want, sorted as you go.

Stay with us, your books carry on without a blink.

---

## 5. Trial ended, not converted (Day 31)

Subject: Your books are still here when you want them

Hi {{name}},

Your free month has ended. No hard feelings, and nothing is deleted. Your records are safe and you can export them any time.

If the timing was off, you can pick up exactly where you left off whenever you like. One text and you are back, £12.99 a month, cancel any time.

If something put you off, hit reply and tell me straight. I read every one.

---

## 6. Win back (Day 60 after cancel)

Subject: January is coming. Want your books done by then?

Hi {{name}},

Quick one. The 31 January deadline has a habit of sneaking up. If your receipts are piling up again, Lekhio is still the fastest way to get them sorted, by text, as you go.

Come back any time. Your first week is on us again to ease back in.

---

## 7. Tax deadline seasonal push (December and January, to active users)

Subject: Your tax return is basically done. Here is the last bit.

Hi {{name}},

The 31 January deadline is close, and because you have logged with Lekhio all year, the hard part is finished. Your income, expenses, mileage and CIS are all sat there ready.

Open the app, check your figures, and follow our free step by step guide to file in about 15 minutes: {{guide_link}}

Want a nudge nearer the day? We will text you on WhatsApp. Reply STOP any time.

You have got this.

---

## Notes

- **Day 0 welcome is live.** The rest need a tool that can schedule on a delay or trigger on behaviour. Resend can send them, but for true drip and behavioural triggers use Klaviyo or Customer.io.
- **Personalise where you can.** {{tax_saved}}, {{expense_total}}, {{entry_count}} make these far stronger. They come straight from the user's data.
- **Compliance.** Same rules as everywhere: never imply we file for them, never promise a specific refund, always "you stay in control". The drafts above already follow this.
- **Deliverability.** Verify the sending domain in Resend (SPF, DKIM, DMARC) before any volume, or these land in spam.

# 57: Brainstorm. What Is Still Missing, and Original Ideas No One Has Done

> A product-first brainstorm, written 30 June 2026, the day we built the in-app accountant. Two halves. First, an honest list of what is still missing against competitors and a real accountant, split into "needs an external switch" and "genuinely not built yet". Second, original ideas, the kind no UK tax app or accountant currently offers, ranked so we build the few that make the product feel like magic.

---

## Part A. What is still missing

### Already built, just waiting on an external switch
These are not product gaps. The code exists and is tested; they need a key or an approval, not engineering: filing to HMRC (recognition), live card billing (Stripe keys), the WhatsApp loop in production (Meta), bank feeds (TrueLayer), and phone login (an SMS provider). Listed here only so we do not confuse them with the real gaps below.

### Genuinely not built yet (honest)
- **Automatic mileage tracking by GPS.** QuickBooks has it. We capture mileage by voice and by hand, which is on-brand, but a "drive detected, was this for work?" prompt would close the one capture gap.
- **VAT returns (MTD for VAT).** We handle income tax. The ~10% of our users who cross £90,000 will want VAT submission too. Foundation only.
- **Proper reports.** A clean profit and loss and a simple balance sheet, exportable. We have the year-end export pack; the in-app reporting is light.
- **Recurring invoices and automatic payment reminders.** We create and send invoices; we do not yet chase them or repeat them.
- **Accountant or partner access.** Some sole traders still want a human to review. A read-only "share with my accountant" link would let us coexist with, not only replace, an accountant.
- **Payroll**, if a user takes on their first employee. Out of scope for now, but the moment they hire, they leave us for it.
- **App store presence.** Still a dev build, not listed on the App Store or Play Store.

### The honest accountant gap that software cannot fully close
A human accountant carries professional liability and judgement. Our bot is expert and tested, but it is guidance, not a signature. The right answer is not to pretend otherwise; it is to be the best preparation and explanation in the market, and to make handing off to a human (when truly needed) frictionless.

---

## Part B. Original ideas, ranked

Scored on impact for the user, how unique it is (has anyone done it for UK sole traders), and how feasible it is for us specifically, given we already have the AI, the tax engine, and the chat surface.

### Tier 1. Build these. They make Lekhio feel like nothing else.

**1. The proactive accountant.** Today the bot answers when asked. Flip it: it watches the numbers and speaks first. "You have logged £900 of fuel but no mileage, you may be leaving about £300 of tax relief unclaimed." "You are £2,100 from the VAT line, here is what crossing it means." No UK tax app proactively finds you money. This is the single most magical thing we can ship, and we already have every piece to do it.

**2. Instant proof of income.** Sole traders cannot get a mortgage or a loan easily because they cannot prove their income on demand. Generate a clean, branded income summary (an SA302-style statement) from their real figures, in one tap, whenever a lender or letting agent asks. Accountants charge and take days for this. We do it instantly. Genuinely unique and genuinely painful to live without.

**3. The "what if" tax simulator, in chat.** "What if I buy a £18,000 van?" The bot runs it against their actual profit and shows the new tax bill and the AIA saving, live. "What if I take on a £30k contract?" It shows the tax, the NIC, the VAT line, the set-aside. Conversational scenario planning from your own numbers. Nobody does this for trades.

**4. The polite late-payment chaser.** Trades are owed money constantly. With one approval, Lekhio chases an overdue invoice for them, politely, over WhatsApp or email, on a schedule, and stops the moment it is paid. It turns the back office into a debt collector that never forgets and never feels awkward.

**5. The quarterly tax MOT.** Before each MTD deadline, Lekhio runs an automatic health check over the books: missed claims, miscategorised entries, duplicate receipts, things that look off, and a one-line "you are ready" or "fix these three things first". An AI pre-audit that an accountant would charge hundreds for.

### Tier 2. Strong, build soon.

**6. The "should I go limited?" watch.** Lekhio monitors profit and tells the user the exact month incorporating starts saving them money, with the real numbers, then walks them through it using the register flow we already built.

**7. Pay-yourself guidance.** A simple, honest "after tax set-aside, you can safely take about £X out this month" so a sole trader stops dipping into money that belongs to HMRC. A personal CFO line, from real data.

**8. Relief and allowance finder.** A proactive sweep for things people miss: the trading allowance, marriage allowance, the right simplified-expense method, pre-trading costs, working-from-home. Surfaces money the user did not know to claim.

**9. Voice Self Assessment.** Turn the file-your-own guide into a spoken back-and-forth. Lekhio asks the questions, the user answers out loud, and it assembles the return-ready figures. Forms become a conversation, which is the whole brand.

### Tier 3. Interesting, watch for later.

**10. Anonymous peer benchmarking.** "Electricians like you typically claim £X in tools a year; you have claimed £Y." Sticky and motivating, but privacy-sensitive and only works at scale, so park it until we have the numbers and a clean consent model.

**11. Receipt rescue from chat history.** Let a user forward old receipts already sitting in their WhatsApp and backfill the year. A clever onboarding accelerator.

---

## Part C. The recommended next build, for a perfect product

If the goal is the product feeling perfect before we touch the back end again, build the proactive accountant (1), instant proof of income (2), and the in-chat what-if simulator (3). All three sit directly on top of what we shipped today: the expert bot, the tested tax engine, and the user's own figures. None needs an external approval. Together they take Lekhio from "a very good tax app that answers questions" to "a thing that actively makes me money and proves my income, that no competitor and no accountant offers." That is the difference between a product people use and a product people cannot leave.

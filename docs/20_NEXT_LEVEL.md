# 20: Next Level. Competitors, the bank link, big ideas, and the journey

> A competitor read, the flagship next feature (connect your bank), a list of ideas to take Lekhio to the next level, and an audit of the customer journey on the website and the app. Research June 2026.

---

## Where the competitors are

| Player | What they do well | What they lack |
|---|---|---|
| Coconut | Self employed focus, connects 30+ UK banks via Open Banking, tax estimates, HMRC recognised for MTD. | Yet another app to open. No conversational input. |
| ANNA | Automation first. Connect the bank, AI categorises every transaction continuously. Tax estimates, now VAT, payroll, pensions. A business account too. | You bank with ANNA or connect to it. Still an app, not a chat. |
| QuickBooks | Mileage tracking, expense and tax estimates, huge brand. | Built for accountants' logic, not a busy trade. Setup is a chore. |
| Xero | Powerful, big integration marketplace. | Overkill and pricey for a sole trader. |

The pattern is clear. The leaders all lean on **Open Banking to pull transactions in automatically**, real time **tax estimates**, **mileage**, and **MTD filing**. None of them work where the customer already is, which is **WhatsApp**. That is the wedge Lekhio owns, and it is defensible because the incumbents cannot bolt a chat-first product onto their app-first base without confusing their users.

To win we keep the WhatsApp wedge and quietly match the table stakes, starting with the bank link.

---

## The flagship next feature: connect your bank

Your instinct is right and it is the single biggest "make life easy" move. It turns Lekhio from "you tell us" into "we already saw it". Money in and money out flow in automatically, get categorised, and sit ready for the tax return.

### How it works
- Use an Open Banking aggregator: **TrueLayer**, **Plaid**, or **Tink**. One integration reaches 40+ UK banks (Barclays, HSBC, Lloyds, NatWest, Starling, Monzo, and the rest).
- The user taps "connect your bank", logs in to their bank, and consents. We receive a read only feed of transactions. We never see their bank login, and we cannot move money. It is read only account information.
- Each new transaction is auto categorised by Claude, the same brain that reads receipts. The user confirms anything unsure, on WhatsApp.
- Receipts photographed on WhatsApp get matched to the bank line automatically.

### The regulation, plainly
Reading someone's bank data is regulated (account information services). You do not need your own FCA authorisation to start, because **TrueLayer and the others let you operate as their agent under their permission**. That is the normal route for a startup. Confirm the agent terms with the provider before launch.

### The cost
Aggregators have a free or low cost developer tier and charge as you scale. This is a real, but modest, spend, and it is the feature most likely to convert and retain, so it earns its place.

### What it unlocks
- Money in and out, automatically, with no typing.
- A live **set aside for tax** figure that updates as money lands.
- "You have an unpaid invoice and the matching payment just came in, want me to mark it paid?"
- A near complete set of books with almost no effort, which is the whole promise.

Recommended as the first paid feature to build after the core WhatsApp loop is live and proven.

---

## Ideas to take it to the next level

Grouped by surface. Pick by impact, not by how clever they sound.

### On WhatsApp (the heart)
1. **Bank link, with consent flow started from a WhatsApp link.** As above.
2. **Mileage by text.** "Drove 24 miles to Leeds" logs the trip at the HMRC rate. Real money back for trades.
3. **Chase unpaid invoices.** "Dave's invoice is 7 days late. Want me to send a polite nudge?" One word back and it goes.
4. **Voice everything.** Already transcribing. Let a voice note create an invoice, a reminder, or a question, not just an expense.
5. **Photo of a quote or a business card.** Turn a photo into a quote, or save a customer's details for invoicing.
6. **"What can I claim?"** A careful, plain English answer on allowable expenses. Never overclaim.
7. **End of day and weekly summaries.** Already built the weekly. Add a short, optional end of day line.

### In the app
8. **One tap "Message Lekhio".** A button that opens the WhatsApp chat with our number. Removes all friction to the core action. Build this the day the number is live.
9. **Live tax set aside on the dashboard,** fed by the bank link.
10. **Cash flow view.** A simple in versus out over time chart, so they can see the shape of their money.
11. **Customer list.** People they invoice, with what is outstanding per customer.
12. **Export to an accountant.** A clean year end pack to hand over, for those who still use one.

### On the website
13. **An interactive "see your books" demo** that lets a visitor type a pretend expense and watch it get logged, before they sign up. Try before you trust.
14. **A free tax bill estimator tool.** Enter rough income and costs, see an estimate, then "Lekhio keeps this updated for you". A magnet for search traffic and a soft sell.
15. **Real reviews** the moment the first customers are happy. Replace the illustrative ones.
16. **A short founder video.** A face and a voice builds trust faster than any copy, especially in a scam wary market.

### Bigger bets (later)
17. **Marketing engine (Phase 2).** AI ad creatives and one tap campaign launch. Already in the plan.
18. **Lekhio Connect (Phase 3).** Trade to trade job matching. Already in the plan.
19. **Lekhio for accountants.** A view for bookkeepers to manage several clients, the channel Coconut and others use to grow.

---

## Customer journey audit

What a real person hits, and where the friction is.

### Website
The flow is land, trust bar, hero, how it works, demos, tax explainer, compare, trust, price, reviews, FAQ, then Sign up now into the five step `/start` and a success screen. It is clean and it sells.

Friction and fixes:
- **After signup the success screen offers app store links that are not live yet.** Pre launch, make the end state honestly say "we will text you on WhatsApp to get you started" and add the real store links at launch. (Small print already hints at this.)
- **No try before you buy.** The demos are watch only. Idea 13 above, a hands on demo, would lift conversion.
- **Founder trust.** A short video (idea 16) would help in a scam wary category.

### App
Login with the mobile number drops into the tabs. The empty states already point to WhatsApp.

Friction and fixes:
- **There is no one tap way to start the WhatsApp chat.** This is the biggest gap. Add a "Message Lekhio" button (idea 8) so the core action is one tap away. Build it when the number is live.
- **Login is a placeholder.** A new device cannot yet load the same account. Wire real phone one time code login at go-live so the app and the web account are the same person.

### WhatsApp
A first message gets a help menu, and entries, questions, invoices, and reminders all route. Good.

Friction and fixes:
- **The very first reply should reassure.** A new user's first ever reply from the number is the highest stakes trust moment. Make it warm and clear: who we are, that we never ask for bank details or passwords, and what to send first.

---

## The one line

Keep the WhatsApp wedge, add the bank link to make the books almost automatic, and remove the one tap friction in the app and the first message. That is the path from a good product to one people cannot live without.

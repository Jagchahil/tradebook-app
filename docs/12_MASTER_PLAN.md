# 12: Master Plan

> Written 24 June 2026. This is the path from where Lekhio is today to a live, legal, paying product. It is ordered exactly as asked: free things first, then things that cost money, then the legal side. Costs are current as of mid 2026 and sourced. Figures drift, so confirm anything before you spend on it.

---

## Where we are today

Built, validated, and live in GitHub:
- Landing page, live on Vercel, with the full marketing site, pricing, differentiators, and an honest MTD FAQ.
- Mobile app: welcome, phone, subscribe, dashboard, transactions, tax, settings, and a full receipt approval and edit flow. Runs on web and on the Samsung.
- Capture loop: photo receipts, voice notes, and typed text, all flowing into the same approve and book pipeline. Income and expenses both handled.
- Database secured with row level security, server side writes, and idempotency.
- Cost model and competitor audit done. See docs 10 and 11.

This is a complete Phase 0 product on the build side. What is left is switching on the live services and standing up the business.

---

## Gap analysis against the competitors

What the market expects, and where we stand.

| Feature | State | Plan |
|---|---|---|
| Receipt capture | Done, photo and voice and text | Live |
| Income capture | Done today, voice and text | Live. Add invoice photo later |
| Categorisation | Done | Live |
| Approve before it counts | Done, the approval flow | Live, and a real differentiator |
| Quarterly tax estimate | Done, confirmed only figures | Live |
| Human support in chat | Designed in | Protect it as you scale |
| Easy cancel and export | Done | Live |
| Mileage tracking | Gap | Free build, Phase 1. "Drove 30 miles to Leeds" at 45p a mile |
| VAT handling | Gap | Roadmap, only matters near the VAT threshold |
| CIS for subcontractors | Gap | Roadmap, important for construction trades |
| Real MTD submission to HMRC | Gap | Needs HMRC recognition, Phase 1 build, free |
| Invoicing | Done. AI drafted, hosted invoice page, share in a tap, paid becomes income | Live. Card payment via Stripe is the Phase 2 plug in |
| Bank feeds | Deliberately not built | Stays out. It is the thing rivals get hated for |

The big gap, income capture, is now closed. The remaining gaps are either free engineering we can do before spending a penny, or genuine roadmap features for after launch.

---

## Phase 1: Free. Do all of this first.

Nothing here costs money. It is engineering time and free account setup.

**Free product builds**
1. Mileage by voice. "Drove 40 miles to the job in Leeds" logs a mileage entry at the HMRC 45p per mile rate. Cheap, high value for trades.
2. Invoice photo capture. Point the receipt reader at an invoice you raised and log it as income.
3. Build the real MTD for Income Tax submission against HMRC's sandbox. The developer hub and APIs are free. This is the work that lets you legally say "MTD recognised" later.
4. Fair use and rate limits in the webhook, plus a spend cap in the Anthropic console, as set out in doc 10. Protects against runaway bills before any real traffic.
5. A short guided onboarding in the app so a first time user knows to text their first receipt.

**Free accounts and setup**
6. Register as a sole trader with HMRC. Free. This is the simplest legal structure to start trading. You can incorporate a limited company later. See the legal section.
7. Create the Meta WhatsApp Business account and connect the webhook. The account and a test number are free. This is what makes the whole loop go live.
8. Create the HMRC Developer Hub account and start the MTD ITSA sandbox. Free.
9. Keep Supabase and Vercel on their free tiers for now. They are enough for launch.
10. Write the simple records UK GDPR asks a controller to keep: what data you hold, why, and how long. Free, and needed before the ICO step.

At the end of Phase 1 you have a live WhatsApp loop you can test end to end, on free infrastructure, as a legally registered sole trader. The only thing stopping a real receipt flowing is a few pounds of AI credit, which is Phase 2.

---

## Phase 2: Things that cost money. In the order they give value.

Rough costs, current mid 2026. Sources at the end.

**Switch the product on**
1. Anthropic API credits. A small top up, around five to ten dollars, switches on receipt reading. At the volumes in doc 10 this lasts a long time.
2. OpenAI API key for voice transcription. Tiny per note, around two tenths of a penny. Only needed if you want voice live at launch. Text and photo work without it.

**The brand and the storefront**
3. A domain. A .co.uk is roughly £5 to £15 a year, a .com roughly £8 to £20, a .app roughly £12 to £20. Availability must be checked live, and watch renewal prices. See the naming warning in the legal section before you buy.
4. A business bank account. Free options are strong: Starling Business is genuinely free with no per transaction fees, Mettle is free and even bundles FreeAgent. A bank account is effectively required if you incorporate a limited company, and sensible even as a sole trader to keep business money separate.

**Payments**
5. Stripe. Free to open, no monthly fee. It takes about 1.5% plus 20p on a UK card, so roughly 39p on a £12.99 charge. You only need this when you are ready to take real subscriptions.

**The app stores, only when you ship the mobile app**
6. Apple Developer Program, about 99 US dollars a year, roughly £79.
7. Google Play, a one off 25 US dollars, roughly £20.

**Protection and brand**
8. Professional indemnity insurance. Not legally required, but strongly advisable for tax adjacent software and often demanded by bigger customers. Budget around £800 to £1,500 a year for £1m cover, more with cyber and public liability.
9. Trademark for the name. Around £170 now, rising to £205 from 1 April 2026, for one class, plus £50 to £60 for each extra class. Do the clearance search first. See the warning below.

**Indicative spend to go fully live and protected:** a few pounds of AI credit, a domain, Stripe fees on real revenue, and then the bigger optional items, insurance and trademark, when you are ready. You can be live and taking money for well under £100 of actual outlay, with insurance and trademark following when revenue justifies them.

---

## Phase 3: The legal side.

What is actually required, and what is only advisable. Confirm figures before relying on them.

**Mandatory**
1. A business structure. You must trade as something. Sole trader is free, register with HMRC by the 5 October after you start. A limited company costs £100 to incorporate from 1 February 2026 plus a £50 a year confirmation statement, and gives you limited liability, which matters for a product that touches people's tax. Start as a sole trader, incorporate when it is worth the admin.
2. ICO data protection fee. Mandatory because you process personal and financial data. £52 a year, or £47 by direct debit, at your size. Not paying risks fines from £400 to £4,000.
3. VAT. Only once your taxable turnover passes £90,000 in a rolling twelve months, which is roughly **577 subscribers at £12.99**. Not now. When you do register, decide whether £12.99 is the price you keep or the price the customer pays, because 20% VAT then applies.

**Required only if you go that far**
4. HMRC MTD recognition. Free to do, but a real build plus a production approval step that HMRC reviews in about ten working days. Mandatory only if you let users actually submit to HMRC or you claim to be MTD recognised. You can launch as a bookkeeping and prep tool without it, with the user filing separately, and add it as a headline feature once approved.

**Not required, but know the lines**
5. FCA authorisation is not needed for software that does not hold client money, does not give regulated financial advice, and does not file without the user's approval. Do not cross those lines. Never take a user's tax money into your own account to pass on, never give investment advice, never offer to finance a tax bill, and always keep the human approval step.
6. HMRC anti money laundering supervision is not needed for a pure software tool. It becomes needed only if you start acting as the customer's accountant or agent, preparing and signing off their figures for them. Keep Lekhio a tool the user controls.

**Advisable**
7. Insurance and trademark, as in Phase 2.

**The naming warning. Read this before spending on a domain or trademark.**
A search of Companies House shows Bloomberg Lekhio Europe Limited, an active company since 1998. Bloomberg Lekhio is a well known financial trading brand. That is a real conflict in financial services classes and the single biggest risk to the name Lekhio. Before you buy a premium domain or file a trademark, run a proper clearance search on the UK IPO register for Lekhio and Lekhio in the software and financial classes, and take a short paid legal opinion. If it is not clean, a distinctive variant now is far cheaper than a rebrand later.

---

## The order to actually do it in

1. Build the free Phase 1 items, especially the mileage and MTD sandbox work, and add the rate limits.
2. Register as a sole trader with HMRC. Free.
3. Pay the ICO data protection fee, £52. This is the one legal box you must tick early.
4. Set up the free Meta WhatsApp Business account and connect the webhook.
5. Add a few pounds of Anthropic credit and, if you want voice, an OpenAI key. Test a real receipt end to end.
6. Run the trademark clearance search on the name. Decide to keep Lekhio or pick a variant.
7. Buy the domain for the chosen name. Open a free business bank account.
8. Wire up Stripe and turn on real subscriptions.
9. Take out professional indemnity insurance and file the trademark once revenue is coming in.
10. Incorporate a limited company when the admin is worth the liability protection.
11. Complete HMRC MTD recognition to unlock real submission as a headline feature.
12. Ship to the app stores when you want a store presence.

---

## Sources

Companies House fees and the February 2026 changes, gov.uk. ICO data protection fee guidance, ico.org.uk. HMRC MTD for Income Tax software and developer hub, gov.uk and developer.service.hmrc.gov.uk. VAT threshold, gov.uk. Stripe pricing, stripe.com. FCA guidance on regulated activities and payment services, fca.org.uk. HMRC anti money laundering supervision manual, gov.uk. UK IPO trade mark fees and the April 2026 changes, gov.uk. Companies House company search for the name conflict. Apple Developer Program and Google Play developer fees. Full source list and the detailed findings are in the research that produced this plan.

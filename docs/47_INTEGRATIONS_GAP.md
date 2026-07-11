# 47: Integrations Gap and Strategy

> Where the big brands (Xero, QuickBooks, FreeAgent, Sage) pull ahead on integrations, what actually matters to a UK trades sole trader, and our opinionated plan: build the few that are the product, expose an API for the rest, ignore the noise. Researched June 2026.

---

## The frame

MTD for Income Tax is live now (over £50,000 from 6 April 2026, £30,000 from 2027, £20,000 from 2028). It forces every affected sole trader into HMRC recognised, API connected software. This is the biggest buyer creation event in UK sole trader software history, and it is both our reason to exist and our biggest exposure, because our MTD filing is still coming soon. Note: HMRC recognises software, it never approves or endorses it. Keep the copy clean.

---

## What the incumbents integrate (sole trader lens)

| Category | Xero | QuickBooks | FreeAgent | Sage | Lekhio today | Coming soon |
|---|---|---|---|---|---|---|
| Bank feeds, Open Banking | yes | yes | yes, free via NatWest | yes | no | TrueLayer |
| Card and online payments | Stripe, GoCardless, PayPal, Square | native + GoCardless, PayPal | Tyl, Stripe, PayPal, GoCardless | Stripe, PayPal, GoCardless | Stripe | add GoCardless |
| Payroll | yes | add on | built in | add on | no | partner later |
| CIS (construction) | native | native, strong | native | native | none | build |
| E commerce and POS | yes | yes | weak | weak | no | ignore |
| Receipt capture | Hubdoc, header only | built in | Smart Capture | AutoEntry | WhatsApp photo + Vision | keep extending |
| Job management, field service | best in class | strong | weak | Tradify only | none | API, partner |
| Mileage | yes | free | manual | manual | voice expense | voice mileage |
| HMRC MTD VAT | yes | yes | yes | yes | no | build |
| HMRC MTD ITSA | recognised | Sole Trader product | recognised + full SA filing | recognised + free Sole Trader app | no | build, critical |
| Zapier, Make, open API | yes | yes | yes | yes | no | expose an API |
| Accountant collaboration | yes | yes | strong | yes | none | add export, portal |

The two closest challengers, Coconut and untied, both deliberately skip the marketplace model and bundle everything natively: their own bank feed, their own HMRC filing, receipts and invoicing and mileage in house, with the accountant as the one external relationship. Neither runs on WhatsApp. That is the model closest to ours, and WhatsApp is our edge over both.

---

## What actually matters to a UK trades sole trader, ranked

Tier 1, non negotiable, lose the deal without it:
1. MTD ITSA filing, HMRC recognised. Now a legal requirement. Everyone has it. Our coming soon is a hole in the boat.
2. Bank feeds via Open Banking. Table stakes, a commodity. The moat is our Claude categorisation, not the feed.
3. Receipt capture. Our WhatsApp photo plus Vision loop is genuinely better UX than Hubdoc and competitive with Dext on line items.
4. CIS for construction. Native in all four incumbents, nothing in Lekhio. Our biggest trades specific gap.

Tier 2, strongly wanted, differentiates:
5. Getting invoices paid, Stripe and GoCardless pay links. We have Stripe, add GoCardless for repeat trade customers.
6. Full Self Assessment filing, the natural extension of MTD ITSA.
7. Quoting and invoicing on the go.
8. Mileage, mostly done badly by incumbents. Our voice first log is an edge.

Tier 3, situational: payroll, job management, accountant export, all matter only at the first hire or year end stage.

Noise for our audience, real features but the wrong buyer: e commerce and POS (Shopify, Etsy, eBay), multi currency, stock, project profitability, enterprise field service, and a consumer Zapier marketplace.

---

## Where we are most exposed

In order of the pain a tradesperson would actually feel choosing us over Xero today:
1. MTD ITSA and VAT filing. The defining 2026 feature and the legal reason they buy software. Until it ships, we are a capture tool, not a compliance tool.
2. CIS. Silently disqualifies us from a large chunk of the construction audience.
3. Bank feeds. Fine as a demo, fatal as a system of record once volumes climb.
4. Job management depth. Xero's certified Tradify and ServiceM8 ecosystem is the trades back office.
5. Accountant collaboration. Roughly half of sole traders use an accountant who expects a portal or clean export.

The reassuring part: on receipt capture UX and conversational categorisation we are ahead, and no competitor, including Coconut and untied, runs on WhatsApp.

---

## The plan: build, integrate, or ignore

BUILD it natively, because for our audience these are the product, not partnerships:
- MTD ITSA and VAT submission. Become HMRC recognised, or own the recognised path. Existential.
- Bank feeds via Open Banking. Already planned with TrueLayer. Feeds are a commodity, the moat is categorisation. Ship it.
- Receipt and voice capture. Already our wedge, keep extending to line items and multi receipt.
- CIS. The highest ROI trades specific build, table stakes everywhere, and it lives naturally next to the MTD engine. Keep the human approval gate before any submission.
- Voice first mileage, "log 30 miles to the Smith job". Cheap, beats every incumbent's manual log, on brand.
- GoCardless alongside Stripe for invoice payment.

INTEGRATE, partner or API, do not build:
- Job management and field service. Do not rebuild Tradify or ServiceM8. Expose an API and webhooks so they push jobs and invoices into Lekhio, and pursue a partner listing. They own operations, we own the books and the HMRC filing underneath.
- Accountant collaboration. A lightweight read only accountant view plus clean CSV and PDF export, the Coconut Accountant Portal model. Cheaper and more valued than a Zapier marketplace.
- Payroll at the first hire stage. Partner an RTI provider rather than build a payroll engine.

IGNORE for our audience, for now:
- E commerce and POS. Wrong buyer.
- A consumer Zapier or Make marketplace. The challengers skip it, so should we.
- Multi currency, inventory, project profitability, enterprise field service.

---

## Bottom line

Lekhio wins on capture UX and is the only WhatsApp native player, but it is naked on the three things 2026 makes mandatory: MTD filing, bank feeds, and CIS. Close those three by building, expose an API for the job management tools to feed us, give accountants a simple export and portal, and ignore the e commerce and Zapier noise entirely. The challenger model proves a lean, bundled, no marketplace stack works for this audience. WhatsApp is our edge on top of it.

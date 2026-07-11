# 46: Competitor Battlecard and Positioning

> A full audit of the UK market as of June 2026, what every rival does, what they charge, what they do badly, and what their customers complain about. Then how Lekhio beats each one, and the category we own. Researched and sourced June 2026. This doc leads the homepage copy in `tradebook-web/app/page.tsx`.

---

## The headline

The "text a receipt, it is bookkept, MTD ready" WhatsApp wedge is no longer empty, but no credible, HMRC recognised player does the whole thing. The two products that are genuinely WhatsApp native (TaskDrop, Snapfile) are tiny, pre launch, have no bank feeds or full ledger, and no verified recognition. The incumbents (QuickBooks, Xero, Sage) are mid disruption, weak on receipt OCR, plagued by broken bank feeds and support complaints, and treat WhatsApp only as a way to send a finished invoice.

**The clean, defensible category: the only complete tax assistant that lives entirely in WhatsApp.** Capture by photo and voice, claim by text, prepare the quarterly update, and (coming) file straight to HMRC with an explicit you approve gate, with CIS done properly for trades.

---

## The closest competitors (WhatsApp first, UK sole trader / trades)

**TaskDrop** (taskdrop.co.uk). The nearest direct rival. Entirely inside WhatsApp: quotes, invoices, job reports by menu, voice note or photo, branded PDF, CIS, VAT, auto payment chasing. Free forever with a 30 invoice per month fair use cap, 1% on card payments, and MTD ITSA submission at £80 per quarter (sandbox tested, production applied for, not yet on the HMRC list). No native app, no bank feeds, no full ledger or P&L. No genuine reviews (solo operation). **We beat it by:** being a full back office not just invoicing, claim by text reliefs, the tax saved and refund trackers, a real app and dashboard, and the complete platform roadmap.

**Accounted / Penny** (runs on a Railway URL; accounted.co.uk is parked for sale). Pre launch. The most feature complete of the four on paper: Penny AI bookkeeper, Open Banking, OCR, real time tax, CIS, IR35, direct HMRC submission claimed. £14 / £24 / £34 / £44 a month, 14 day trial. Caveat: its own FAQ lists Telegram, SMS and Web Chat, not WhatsApp, so WhatsApp may be aspiration. **We beat it by:** actually living in WhatsApp, being trade first, and shipping with real reviews and a real company behind it.

**Snapfile** (snapfile.uk). Pre launch waitlist. Snap a receipt in WhatsApp, extract VAT, plain English logging, quarterly PDF. Free (5 scans, 10 messages a month), Lite £7.99, Pro £13.99 coming soon. Admits it does not submit to HMRC yet. No invoicing, no CIS, no bank feeds. **We beat it by:** doing everything it does plus invoicing, CIS, claim by text and the filing path.

**Snyp** (snyp.ai). Not a tax product. Receipt ingestion (WhatsApp, email, upload) that feeds Xero or QuickBooks. ~£19 a month. US flavoured testimonials. **We beat it by:** being the whole product, not a feeder that assumes you already pay for Xero.

---

## The wider competitors (UK self employed tax / bookkeeping)

| Product | Entry price | What it does well | What it does badly | MTD ITSA | WhatsApp |
|---|---|---|---|---|---|
| QuickBooks Sole Trader | ~£10/mo (£1 promo) | Big brand, full books, MTD | Forced migration lost data, OCR only matches a photo, CIS contradictory | Recognised | No |
| Xero | £16/mo (20 invoice cap) | Polished, full featured | Repeated price hikes, no inbound phone support, cheap tier caps | Recognised | No |
| FreeAgent | £19/mo, free via NatWest | Best liked (Trustpilot 4.6), direct SA filing | Bank feeds disconnect, receipt OCR metered (£5/mo) | Recognised | No |
| untied | £64.99/yr | Recognised and in HMRC beta, broad SA | No WhatsApp, no free tier, entries hard to edit once auto assigned | Recognised (verified) | No |
| Coconut | £16.99/mo | Open Banking, SA prep, ex HMRC support | Bank feeds break, forced bank switch, no WhatsApp | Claimed, unverified | No |
| ANNA Money | £0 PAYG + 0.95% | Business account plus tax | Account freezes / funds held is the dominant complaint, ITSA is LTD only | VAT yes, ITSA claimed | No |
| Sage | £7/mo sole trader | Brand, CIS on paid | Worst reputation, hard to cancel, renewal price shocks, no mileage | Recognised | No |
| Pandle | Free, £5/mo Pro | Free incl. MTD, human chat | Poor mobile apps (iOS ~1.7), feeds unreliable, no CIS | Recognised | No |
| TaxScouts / Taxfix | SA £99 to £169 | Real accountant files for you, 4.8 Trustpilot | Accountant response slow and inconsistent, MTD only in development | In development only | No |

---

## The top ten complaints across the category (what we build against)

1. Forced migrations and forced upgrades that lose data and trust.
2. Receipt OCR is weak, often only matches a photo instead of logging it.
3. Bank feeds silently break and need relinking, the single most repeated technical gripe.
4. Receipt capture is metered or paywalled, the core daily action costs extra.
5. Price hikes and promo cliffs, the cheap price is not the real price.
6. No phone or slow support, tickets open for weeks, accountants disappear.
7. Account freezes and funds held (ANNA), a trust killer for anything touching money.
8. Low tier caps that force expensive jumps (Xero 20 invoices, Sage missing CIS).
9. Hard to cancel (Sage requires a phone call).
10. Editing lock in, once the AI auto tags something it is a faff to correct.

The homepage "reviews that built Lekhio" section now answers seven of these directly: support bots, price hikes and caps, broken bank feeds, OCR that will not log, frozen funds, jargon, auto tag lock in, and hard to cancel.

---

## Table stakes vs where we are rare

**Table stakes (almost everyone):** MTD quarterly capability, branded invoices, some receipt OCR, bank feeds (incumbents), auto categorise, a tax estimate, SA prep, an app plus web.

**Rare and ours:** native WhatsApp capture by photo and voice, claim by text reliefs (mileage, home, phone, CIS) which essentially nobody does, the tax saved and refund trackers, trade first CIS done properly, and a clearly stated we prepare you approve gate. The white space the research confirms: a WhatsApp native product that also has a real ledger and a recognised filing path, with reliable OCR and an easy correction loop.

---

## What this changed on the site

- Hero now claims the category: "The only complete tax assistant that lives in WhatsApp."
- Hero WhatsApp demo now shows the claim by text moat (a mileage claim) that no rival has.
- A CIS feature card added, because CIS is gated, contradictory or absent everywhere else.
- The comparison table expanded to thirteen rows covering full parity plus our differentiators, with an honest Soon marker on file to HMRC and bank connect.
- The complaints to fixes wall extended to the new high impact gripes: broken bank feeds, OCR that will not log, frozen funds, and auto tag lock in.
- Pricing reframed: rivals look cheaper then charge extra for receipts, CIS, filing and support, Lekhio is one price with all of it in.

---

## The open strategic calls for Jag

1. **Price.** At £12.99 a month Lekhio sits at the top of the market (QuickBooks £10, Accounted £14, Coconut £17, FreeAgent £19, untied ~£11). The site now justifies the premium as all in with no add ons, which is true. Decide whether to hold £29, or undercut with a lower or a free capture tier. This is a revenue decision, so it is yours to make.
2. **HMRC recognition is the real race.** TaskDrop, untied and others are already through or in beta. Start the HMRC Developer Hub application the day Lekhio Ltd exists. It is the one thing rivals are beating us to and the gate for file to HMRC and the live balance view.

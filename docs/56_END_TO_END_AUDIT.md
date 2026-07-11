# 56: End-to-End Audit. The Complete Build vs Every Competitor and a Real Accountant

> Updated 29 June 2026. The earlier competitive audit (doc 53) was taken before we built subscription billing, the tested tax engine, the HMRC submission foundation and real phone login. This audit reflects the complete build as it stands today, walks the whole customer journey end to end, and is honest about the one thing still missing.

---

## Direct answer

Yes. This is the full end-to-end audit of everything built, against every serious competitor and against a real accountant, stage by stage through the customer's journey. The build was re-verified while writing it: the 71-question professional exam suite passes 100%, the HMRC foundation tests pass 12 of 12, pricing is consistent at £12.99 across web and app, and the new modules compile.

What changed since doc 53: billing is now real, the tax engine is canonical and tested, the HMRC submission path is built (sandbox, dormant), and login is real phone OTP. That moves us from "best place to keep the books" much closer to "the complete replacement", with one external approval still in the way.

---

## The journey, end to end

A tradesperson's life with their money runs in nine stages. Here is how Lekhio handles each, against the field.

**1. Starting the business.** Lekhio has a free register-your-business concierge: sole trader, trading name or limited company, with UTR, SIC codes, bank, insurance, certs and pension, and "claim it on Lekhio" nudges. No competitor does this. An accountant will do it but charges for the time. **We lead, alone.**

**2. Signing up and getting in.** Web onboarding with a 5-step wizard, then a verified phone one-time-code login on the app (built, switches on with an SMS provider). Competitors use email or phone login of the standard kind. **Parity, with a cleaner front door.**

**3. Capturing a cost.** A photo or a voice note on WhatsApp, parsed by AI, categorised, stored, confirmed in a reply. This is the best capture experience in the category for a tradesperson, and only one competitor (Accounted) does WhatsApp at all. QuickBooks, FreeAgent, Xero and Coconut need their app and some discipline. An accountant needs you to keep a carrier bag of receipts. **We lead.**

**4. Keeping the books.** Income and expenses summed as you go, CIS tracked properly (gross and deduction split, refund surfaced), mileage at the correct 2026/27 rates, home-office and phone apportionment. The big platforms match the bookkeeping and exceed us on bank-feed automation; none matches our CIS-for-trades depth or the conversational input. **Parity on totals, we lead on trade fit, we lag on bank feeds.**

**5. Knowing the tax as you go.** A live tax figure (income tax plus Class 4 NIC), set-aside-for-tax, and a tax engine now built from the rules in ACCA, ICAEW, CIOT and AAT and checked against a 71-question exam suite at 100%. Pie.tax shows a live figure too; most others show it only at year end; an accountant tells you in January. **We lead on "no January shock", and our numbers are now provably accurate.**

**6. Invoicing and getting paid.** Create and send invoices from WhatsApp or the app, with a public pay link via Stripe. Parity with the dedicated invoicing of the big tools, ahead of a plain accountant. **Parity.**

**7. The quarterly MTD update.** We prepare the quarter and the figures are now built into HMRC's exact submission shape, behind a human-approval gate. But the actual filing is dormant until HMRC recognises Lekhio. QuickBooks, FreeAgent, Xero and Coconut are already on HMRC's recognised list and file today. **We lag. This is the gap that matters.**

**8. The year-end final declaration.** Same story: the path is built and gated; recognition is pending. Competitors file. An accountant files. **We lag, pending recognition.**

**9. Paying for it, and leaving.** One flat £12.99 (or £129 a year, founder £15.99), 30-day trial, real Stripe subscription, self-serve cancel through the billing portal. Cheaper and simpler than the stack, and far cheaper than an accountant. **We lead on price and clarity.**

So end to end we lead at seven of the nine stages, are at parity on one, and lag at the filing stage, which unfortunately is the stage MTD just made compulsory.

---

## Feature matrix

| Capability | Lekhio | QuickBooks | FreeAgent | Xero | Coconut | Pie.tax | Accountant |
|---|---|---|---|---|---|---|---|
| WhatsApp photo + voice capture | Yes | No | No | No | No | No | No |
| Business setup concierge | Yes | No | No | No | No | No | Manual, paid |
| CIS done for trades | Yes | Partial | Partial | Partial | Partial | Partial | Yes |
| Live tax figure + set-aside | Yes | Partial | Partial | Partial | Yes | Yes | No |
| Tax engine tested vs exams | Yes (100%) | n/a | n/a | n/a | n/a | n/a | The human is qualified |
| Invoicing + pay link | Yes | Yes | Yes | Yes | Yes | Partial | No |
| Bank feed (Open Banking) | Not yet | Yes | Yes | Yes | Yes | Partial | Via software |
| Files MTD quarterly to HMRC | Built, not yet recognised | Yes | Yes | Yes | Yes | Yes | Yes |
| One flat low price | £12.99 all-in | £10 (limited) | £19 / free with NatWest | £16 to £59 | ~£7 to £14 | Free to paid | £30 to £150/mo |
| Real human judgement | No | No | No | No | No | No | Yes |

---

## Where we genuinely lead, and why people choose us

We own the start of the journey, the moment of capture, and the run of the year. Nobody sets up your business for free and then makes the books a thirty-second WhatsApp habit. Our CIS handling is built for subcontractors, not bolted on. Our tax figure is live and now provably accurate, so there is no January shock. And it is one flat price that replaces a stack of tools and undercuts an accountant many times over. For a UK tradesperson specifically, that combination does not exist anywhere else.

The honest counterweight: the big four can already file, they have mature bank feeds, and an accountant brings human judgement and accountability that software does not. For a complex or higher-earning trade, that still matters.

---

## What is still missing, and it is all external now

The audit's most important finding is also the most encouraging: every remaining gap is an external switch, not unbuilt code.

Filing to HMRC needs **software recognition**; the submission code is built and tested, waiting on the application. Bank feeds need a **TrueLayer account**; the database scaffolding is there. Real login needs an **SMS provider** enabled; the flow is built. Charging needs **live Stripe keys**; the billing is built. The core loop needs **Meta WhatsApp production access**; the webhook is built and hardened.

In other words, the engineering of a complete, expert, MTD-ready product for UK trades is done. What stands between Lekhio and being chosen over any competitor or accountant is a short list of approvals and keys, with HMRC recognition the one to start today because it has the longest lead time and it is the only stage where the whole market can currently do something we cannot.

---

## The one priority

Apply for HMRC MTD for Income Tax software recognition now. It is the single move that turns seven-of-nine leadership into end-to-end leadership, in the exact quarter the entire market is forced to choose a tool that can file.

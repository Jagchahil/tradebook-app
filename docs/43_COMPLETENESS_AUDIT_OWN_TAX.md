# 43: Completeness Audit, owning the whole of UK tax

> The goal: a UK sole trader never needs anyone or anything else for tax. Not an accountant, not HMRC's own site, not a second app. This maps their entire tax life, what we already do, and every gap, ranked, with the ones HMRC literally gives us the tools to build flagged. Researched June 2026.

---

## The principle

Today we are a brilliant bookkeeper that prepares figures. To own tax, we become the single place that covers the whole journey: capture, claim, the live HMRC position, the actual filing, the payment, the refund, and a real human for the hard 10%. The moment any of those forces a user to log into HMRC or call an accountant, we have lost a piece of the relationship. This is the list of those pieces.

---

## The sole trader's full tax life, and where we stand

| Stage | What it is | Lekhio today |
|---|---|---|
| Register | Tell HMRC you are self employed, get a UTR | We guide. Could assist the registration itself. |
| Capture | Income, expenses, receipts, mileage | Done, and ahead, by text |
| Claim reliefs | Mileage, home, phone, CIS, capital allowances | Strong, some gaps (capital allowances, reliefs checker) |
| Bookkeeping | Categorise, keep digital records | Done |
| Estimate | What you owe, what to set aside | Done, band aware |
| The HMRC position | Your real balance, payments, penalties, refunds | **Missing. HMRC gives an API for this.** |
| File | MTD quarterly updates, final declaration, Self Assessment | **Prepare only. Must submit. HMRC gives the API.** |
| VAT | Register and file VAT once over £90k | **Missing. HMRC gives the API.** |
| Pay | Pay the bill, payments on account, Time to Pay | **Missing. Can link or integrate.** |
| Refunds | CIS and overpayment refunds | We track CIS. Could surface and claim. |
| The hard 10% | Complex cases, an actual accountant | **Missing. The thing that sends people elsewhere.** |
| Grow | Going Ltd, hiring, becoming a CIS contractor | We have the knowledge, not the tools |

---

## The three territories we are missing

### 1. The HMRC connection (file, view, pay), HMRC gives us the APIs

This is the big one, and the research is clear: **HMRC publishes the exact APIs to do all of this.** Get recognised once, build these, and the user never logs into HMRC again.

- **MTD for Income Tax filing.** Submit the four quarterly updates and the final declaration straight from Lekhio, with the user's approval. This is the thing that removes the accountant for routine returns. Deadlines are 7 Aug, 7 Nov, 7 Feb, 7 May, final declaration 31 Jan. Competitors (FreeAgent, untied, Coconut) are racing to ship this for the Aug 2026 deadline. We must too.
- **The Self Assessment Accounts API.** This is a quiet superpower. It returns the user's real HMRC balance, what is overdue, what is due now, what is pending, their payment history, penalties, and refunds. We can show their entire HMRC position inside Lekhio. Almost no competitor surfaces this. It makes us the single screen for their whole tax life.
- **Direct Self Assessment filing** for the under £50k crowd not yet on MTD, so everyone can file with us, not just the higher earners.
- **VAT (MTD for VAT).** For traders who cross the £90,000 threshold, register and file VAT returns. HMRC gives the submit and retrieve endpoints. This keeps the growing trader, who would otherwise leave for a fuller package.
- **Pay your bill.** Link to or integrate HMRC payment, surface payments on account, and flag Time to Pay for those who are struggling. Paying should happen with us, not on a separate site.

**The catch:** all of this needs **HMRC software recognition** (the Software Choices listing) and the developer hub onboarding. It is a process, not a blocker, and it is exactly how untied, FreeAgent and Coconut got there. This is the single most important roadmap item.

### 2. The human layer, the thing that stops anyone going elsewhere

A tool, however good, hits a wall on the complex 10%: a tricky year, a property sale, an HMRC enquiry, a "should I go Ltd" moment. When it does, people leave for an accountant. **TaxScouts built a £169 a year business purely on this:** connect you to an accountant who files for you. We should own that moment instead of losing it.

- **Ask a real accountant, inside Lekhio.** A premium layer where, for the hard stuff, a qualified accountant reviews or advises within the app. Most months they need the software. Occasionally they need a human, and we give them ours. This is the masterstroke for "nobody goes elsewhere." Build it as a paid add on or a higher tier.
- **Tax investigation cover.** Peace of mind that if HMRC opens an enquiry, we have their back. Accountants sell this as fee protection. A strong trust and retention play.

**The catch:** giving tax advice carries liability and needs qualified people. Employ or partner with accountants, and keep the line clear between the software (information) and the human (regulated advice).

### 3. Completeness of income and reliefs, own all of their tax, not just self employment

Many trades have more than self employment income, and a complete product handles the whole return.

- **Property and landlord income.** MTD covers landlords too, and many trades own a rental. A big adjacent market that is the same product.
- **Employment alongside self employment.** Lots of trades do both. Pull the PAYE and tax code picture in for the full position.
- **Dividends, savings interest, Capital Gains.** Selling a van, tools, or a property. Part of a complete return.
- **The "are you claiming everything?" checker.** Surface reliefs people miss: the Annual Investment Allowance on big tools, pension contribution relief, the trading allowance, marriage allowance, prior year claims. Finding people money is the stickiest feature there is.
- **Pension nudges.** A self employed pension contribution cuts the tax bill. A timely, honest nudge (not advice) when someone is heading into higher rate.

---

## The growth and lifecycle pieces (keep them as they scale)

- **Register as self employed** with HMRC, assisted, so onboarding is end to end.
- **"Should you go Ltd?"** We already have the full structure and tax expertise (docs 25 to 28). Turn it into an in app tool, and when they incorporate, handle the company side too (corporation tax, the holdco). They grow, and they stay with us.
- **CIS contractor side.** For trades who employ subbies: verify subcontractors, file the monthly CIS return, issue statements. We do the subcontractor side already, this is the other half.
- **Light payroll** for the first hire.

## Adjacent, partner rather than build

- Business banking (we connect via Open Banking, we do not need to be a bank).
- Insurance (public liability, income protection) as a referral.

---

## The ranked roadmap to own tax

In the order that wins the most of the relationship per unit of effort:

1. **Get HMRC recognised, then ship MTD for Income Tax filing.** The core. Removes the accountant for the routine. Time critical for the 2026 to 2027 rollout.
2. **The Self Assessment Accounts view** (balance, due, paid, refunds, penalties) via the HMRC API. Makes Lekhio the single screen for their HMRC life. High impact, and it rides on the same recognition.
3. **The "ask a real accountant" human layer.** Captures the 10% that would otherwise leave. The true "nobody goes elsewhere" piece.
4. **Direct Self Assessment filing** for under £50k, so everyone files with us.
5. **The reliefs checker** (capital allowances, pension, marriage, trading allowance). Finds people money, huge stickiness.
6. **VAT (MTD for VAT)** for the £90k plus traders, so growth does not push them out.
7. **Pay your bill and Time to Pay** in app.
8. **Property income**, then the other income types, for the complete return.
9. **"Should you go Ltd"** tool and the company side, plus the CIS contractor side, to keep them as they scale.

Items 1, 2, 4, 6, 7 are HMRC API work and need recognition. Item 3 needs qualified people. Everything else we can build.

---

## The one line strategy

**The only place a UK sole trader ever needs for tax: from the first receipt to the filed return to the refund in their pocket, with a real human for the hard bits, all in a text.** Nothing on this list is out of reach. The filing and the HMRC view are handed to us by HMRC's own APIs. The human layer is a hire or a partnership. Build these and there is genuinely nowhere else to go.

# 49: Becoming the Expert. The Accountant Services and Retention Roadmap

> What a chartered accountant actually knows and does, mapped against Lekhio, so we own the whole relationship for a UK sole trader. Plus the retention model that keeps people coming back. Researched June 2026, sourced in the research notes.

---

## The body of knowledge we must encode (from the ACCA syllabus)

A certified accountant trains across 13 exams. Only a slice matters to a trades sole trader. We encode that slice and ignore the rest.

Encode deeply as software: **Financial Accounting** (the bookkeeping engine) and **Taxation, UK** (income tax, NICs, self assessment, VAT, allowable expenses, capital allowances). This is our whole surface and it is already most of what we do.

Surface as guidance: parts of **Management Accounting** and **Financial Management** (cash flow, margins, set aside), and parts of **Business Law** (sole trader vs limited, contracts, late payment).

Reserve for a human: **Advanced Taxation** grade decisions (real incorporation calls, dividends vs salary, capital gains on premises or plant, pensions strategy, R and D).

Ignore entirely, this is a different profession: **Audit** (sole traders are not audited) and the strategic and corporate exams (group reporting, treasury, advanced performance). None of it touches our user.

The line: encode FA and TX, own the filing, staff the advanced tax and representation work with humans, ignore audit and corporate finance.

---

## The full accountant service list, and where we stand

| Service | Lekhio today | Build, human, or partner | Priority |
|---|---|---|---|
| Sole trader registration | Guide (web) | Build, guided assisted flow | High |
| Limited company registration | Guide (web) | Partner a formation agent, build the Companies House API later | Medium |
| VAT registration | Guide | Build, guided | Medium |
| PAYE registration | Guide | Build, guided | Low to medium |
| CIS registration | Guide | Build, guided | High, trades |
| Bookkeeping and records | Done, core strength | Build | Highest |
| Year end accounts | Data is there | Build, cash basis | High |
| Self Assessment prep and filing | Prep, estimate, guide. Filing coming soon | Build, filing needs HMRC recognition | Highest |
| VAT returns | No | Build, needs MTD VAT recognition | Medium |
| Corporation tax | No | Build later | Low |
| Payroll and RTI | No | Partner | Low to medium |
| CIS returns and verification | Refund tracker, claim by text | Build | High, trades |
| Routine tax planning | Claim by text, can I claim it | Build | High |
| Advanced tax planning | No | Human on tap | Medium |
| Management accounts, cash flow | Estimate, goals, Wrapped | Build | Medium |
| Dealing with HMRC, enquiries | No | Human, plus Time to Pay nudges | Medium |
| SA302 and lender references | Export pack exists | Build the SA302, human signs the certificate | High felt need |
| Fee protection insurance | No | Partner, an upsell | Low |
| Deadlines and compliance | Newsletter, reminders, streaks | Build the calendar engine | High, sticky |

## The real gaps to close, in order

1. **Filing.** Self assessment and VAT submission. The line between a tool and an accountant. Gated on HMRC recognition (doc 48). The single most important item.
2. **Guided registrations.** Sole trader and CIS first, then VAT and PAYE. Today the register your business guide is live and points to GOV.UK. Next, collect details over WhatsApp and walk them through. Limited company via a formation agent partner, incorporation is now £100 online.
3. **SA302 and a lender reference.** Self employed people get blocked on mortgages. We can generate the SA302 style summary, a credentialed human signs the certificate a lender accepts.
4. **A real accountant on tap.** For the advanced tax and the HMRC enquiry, an in app escalation to a partner ACCA or ACA practice, triggered when the AI is past its confidence line. This is the masterstroke for nobody goes elsewhere.
5. **The deadline and compliance engine.** The full calendar with proactive nudges. Cheap, and it is what makes someone feel they have an accountant.

## On registering businesses through us

Sole trader registration is free and there is no public HMRC API to do it for a third party, so we build a guided assisted flow, collect the details and track the UTR. Limited company incorporation has a real Companies House API Filing service, the model is partner a formation agent first to test demand, build the direct integration if volume justifies it. VAT, PAYE and CIS are guided flows. Build the register your business guide now, which is done, then layer the guided in chat flows behind the coming soon flag.

---

## The retention model. Keeping people coming back

The hook is the WhatsApp habit, send a thing, get value back, every day. On top of that the app gives return reasons:

Already built: goals and progress, the logging streak, the set aside figure, the tax saved figure, the CIS refund tracker, Wrapped, and now the **milestones collection**, a set of badges that unlock as they log, so there is always a next one to chase.

The next retention levers, ranked:
1. **Proactive WhatsApp value**, the weekly summary and the set aside nudge, already templated. This is our superpower, no competitor lives in the channel.
2. **The deadline engine**, a gentle nudge well before each tax date so they never get a penalty. Trust and return in one.
3. **The refund and money found moments**, every time we find them a claim or surface a CIS refund, that is a reason to come back. Celebrate it.
4. **The accountant on tap**, once live, the safety net that means they never need to leave.

The principle from the founders who get this right, give people a reason to open it daily and a reason never to leave. We have the daily reason, the habit and the money. The never leave reason is filing plus a human for the hard bits. Build those and there is genuinely nowhere else to go.

---

## Staying on top, the newsletter and the watch

We already run a monthly tax newsletter and daily content. Added a **weekly tax change watch** so we catch any HMRC or Budget change that affects sole traders the week it happens, and feed it into the newsletter and the app. Being first to tell a tradesperson about a change that saves or costs them money is exactly the expert position we want.

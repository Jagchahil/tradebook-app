# 67: Future-Proofing Lekhio, SaaS Tool versus GaaS Service

> A strategic deep dive, written 1 July 2026, prompted by the founder's question: we are a SaaS startup, should we future-proof as a GaaS "tool versus service". This is analysis and opinion, not legal or financial advice. Where it touches tax agent regulation and money laundering supervision, treat it as a map of the terrain and take professional advice before acting. It grounds the macro shift in current 2026 sources and then applies it to Lekhio's specific, regulated position.

---

## 0. Reading the question first

"GaaS" is used loosely in the market right now. It can mean GenAI as a Service, Agent as a Service, or, most usefully for us, the broader thesis that people are calling **Service as Software**: software stops being a tool a human operates and becomes the thing that does the work. The useful framing in your phrase is the last three words, **tool versus service**. That is the real axis, so this doc is built around it. If by GaaS you meant something narrower, say so on continue and I will re-cut it.

The one line answer: **Lekhio is already sitting on the exact primitive the service model needs (the approval gate), and the tax rules that constrain us are the same rules that make the gate a moat. So the right move is not to pick tool or service, it is to build so we can slide along that axis on our own timetable, and to instrument the business now so we can price on outcomes later without a rewrite.**

---

## 1. The macro shift, in plain terms

The SaaS era sold seats. You paid per user per month for a tool your staff operated. The emerging era sells outcomes. When software acts on its own to do the work a person used to do, charging per human seat becomes self defeating, because the whole point is that there are fewer humans in the loop. The market language for this in 2026 is "Service as Software", and the pricing language is moving from pay per use, to pay per task, to pay per result. The slogan doing the rounds is that intelligence is becoming cheap while outcomes stay premium.

This is not abstract for our category. Bookkeeping is repeatedly named as the single function most exposed to AI, and the parts we automate, receipt coding, categorisation, reconciliation, quarterly summarisation, are exactly the parts commentators expect to see far less human involvement in by the end of 2026. Two shapes of company are forming in accounting. One sells AI tools to firms and businesses as B2B software. The other operates as a full stack automated practice, doing the books itself and charging for the result. That second shape is the GaaS end of your axis.

Sources for this section are listed at the end.

---

## 2. Where Lekhio sits today, honestly

**Founder's positioning (1 July 2026), adopted as canonical:** Lekhio is not a tool or a service, it is both. We provide the tools that deliver a service, and we do the whole thing in house. In strategy terms this is a **vertically integrated Service as Software** business: we own the capture, the intelligence, the preparation, and the filing rail end to end, rather than reselling someone else's engine or handing users a toolbox and walking away. That in house ownership is itself a moat, it is why we can guarantee the outcome and keep the quality bar, and it is what lets us move the tool to service dial ourselves rather than being gated by a vendor.

Lekhio is a **SaaS tool with a service-grade user experience**. The tradesperson texts a receipt, and the software captures, categorises, stores, and prepares. That already feels like a service to the user, because the work disappears. But commercially and legally we are still a tool: we price a subscription, the human is the operator of record, and our founding rule is "we prepare, you approve". The MTD filing path we built and proved this week is the software route, where the taxpayer authorises the software and the taxpayer remains the filer.

That is a strong place to start from, not a weak one. The reason is in the next section.

---

## 3. The regulatory ceiling, which is also the moat

In regulated tax, "service" is not a marketing word, it has a legal meaning, and there are two very different ways to "do someone's tax". Understanding the gap between them is the core of our future-proofing.

**Route A, the MTD software route.** The taxpayer grants the software permission through the HMRC digital handshake, the software submits on the taxpayer's instruction, and the taxpayer stays legally responsible at all times. This is what we built. The human approval step is not a nicety, it is what keeps the taxpayer as the responsible party. This is the "tool" route, and it scales cleanly.

**Route B, the registered tax agent route.** Here Lekhio would act on the client's behalf as their agent. That requires registering as a professional tax agent, holding an Agent Services Account, obtaining client authorisation as their agent, being measured against the HMRC Standard for Agents, and, critically, being under anti money laundering supervision, because a business that calculates tax liability for others is an Accountancy Service Provider under the Money Laundering Regulations. This is the "service" route in the full legal sense, and it moves responsibility and duty of care toward us.

Now layer on the liability thinking that is hardening across 2026. The direction of travel is a "reasonable oversight" standard, where the organisation that deploys an agent carries the liability unless it can show robust monitoring, auditing, and controls. Model providers disclaim their outputs. In professional services the standard of care does not fall just because a machine did the work. There is a widely noted accountability gap, where the supplier controls how the agent behaves but contracts push the compliance consequences onto the customer.

Put those two together and the strategic picture is sharp. **The more we move toward pure service and full automation, the more liability and regulatory weight we take on. Our approval gate is the mechanism that lets us deliver service-level convenience while keeping the taxpayer as the legally responsible party.** Rivals who over-automate to chase the outcome pitch, and quietly drop the human sign off, are taking on a liability they may not be able to carry and a supervision regime they may not have. We can out-automate them on everything except the final irreversible click, and that discipline is a durable advantage, not a drag.

This is why the honest constraint in CLAUDE.md, never say "we file your tax", never imply endorsement, always keep the human approval before any irreversible action, is not just compliance hygiene. It is the exact shape of a defensible Service as Software business in a regulated field.

---

## 4. Future-proofing the architecture, so we can slide along the axis

The goal is to be able to move from tool toward service, feature by feature, without a re-platform, and without ever removing the accountability gate. Six design commitments do that. Most of them we have already started, which is the good news.

**1. Keep the model and provider layer abstract.** We already isolate the AI behind `lib/claude.ts` and transcription behind `lib/transcribe.ts`. Extend that thinking into a single orchestration layer that decides which model or agent handles a step. When "intelligence is cheap", the winners are those who can swap and route intelligence freely. Do not let model specific calls leak across the codebase.

**2. Make the approval gate a first class, reusable primitive.** Today the gate exists in specific places, the HMRC submit, money actions, sending messages. Promote it to a shared concept: every action carries a risk class, and anything irreversible routes through the same approve or reject path, with the same audit record. This is the single most important architectural investment, because it is simultaneously our compliance shield, our liability shield, and the switch that lets us raise automation safely.

**3. Add an autonomy dial per action type.** The same task can be "propose and wait for approval" or "do it and log it", depending on confidence and user trust. Model each action with a configurable autonomy level. Early on, almost everything proposes and waits. As accuracy proves out on low risk actions, for example categorising a clearly recognised wholesaler receipt, the dial can move to auto with notify, while high risk actions like filing stay locked behind explicit approval forever. This lets us deliver more "service" over time without a rebuild and without crossing the legal line.

**4. Keep an immutable decision log.** For every automated action, record the input, the model or rule that decided, the confidence, and the human decision if any. This is what "reasonable oversight" looks like in practice, it is what would defend us if an entry were ever challenged, and it is a precondition for ever offering a higher autonomy tier. We partly have this via message and transaction records. Make it deliberate and complete.

**5. Instrument outcomes as first class events now.** This is the cheapest high leverage move in the whole doc. Today we think in subscriptions. Start also emitting and storing outcome events: receipt captured, quarter prepared, quarter filed, refund identified, CIS reclaim tracked, deadline met. You do not have to price on them yet. But once the data exists, switching to or adding outcome based pricing becomes a product decision, not a data migration. Without it, you are blind to the exact metric the next era rewards.

**6. Design the data model for a future agent tier.** Even if we never register as a tax agent, build the client, authorisation, and audit tables as if a future "Lekhio handles it" tier could exist, so that adding it later is configuration and compliance work, not schema surgery.

None of this requires building the service business now. It requires not painting ourselves into the tool corner.

---

## 5. Future-proofing the business model

Think of pricing as a path, not a switch. We do not jump from subscription to outcomes overnight, and for time poor tradespeople the headline price must stay dead simple. The sequence that keeps optionality open:

**Now, simple subscription, instrumented underneath.** Keep the £12.99 and £129 pricing the user sees. Behind it, count outcomes (section 4.5) so we learn what a "unit of work done" is worth to a plumber versus a scaffolder.

**Next, outcome flavoured tiers, still simple to the user.** Introduce value framed additions that map to results, not seats, for example a done for you quarter, a refund finder that surfaces reliefs and CIS reclaims, or a "books handled" plan. These are outcomes the trades actually feel, and they justify price without a spreadsheet of usage.

**Later, and only if we choose it, a true agent service.** For users who want fully hands off, a premium tier where Lekhio, as a registered agent under proper supervision, carries more of the load. This is the full GaaS end. It is a business and regulatory decision with real cost and real liability, so it is a deliberate later step, not a default. The point of everything above is that we can take that step from a standing start if the market pulls us there, rather than being unable to.

A note of realism on pricing outcomes in tax. We cannot honestly price on "tax saved" in a way that implies we reduce someone's liability beyond what the law allows, and we must never charge in a way that reads as a contingent tax service we are not licensed to be. Outcome pricing here means pricing the work done and the time given back, the quarter prepared, the deadline met, the refund surfaced and then approved by the user, not a cut of their tax bill.

---

## 6. Positioning and the risks to hold in view

**Accountants are a channel, not only a threat.** The full stack automated firm is one future, but the more capital efficient one for us may be to power accountants and bookkeepers rather than replace them, a white label or agent facing tier where the professional keeps the client relationship and the supervision, and Lekhio does the capture and preparation underneath. That also neatly parks the AML and agent burden with a party already carrying it. Worth prototyping as a partnership motion before we ever consider becoming the regulated agent ourselves.

**The accountability gap is the thing to never be careless about.** As we raise autonomy, the deployer liability standard means we own the behaviour of anything we let run without a human. The approval gate on irreversible actions is precisely how we avoid absorbing liability we cannot price. Keep it. Resist any growth hack that quietly removes it.

**Honesty in language is a competitive asset, not a constraint.** The market will fill with "your AI accountant files your taxes" claims. Some will be over their skis legally. Our insistence on "we prepare, you approve, HMRC holds you responsible" is more credible to a tradesperson who is nervous about tax, and more defensible to a regulator. Lead with it.

**Do not out-run trust or accuracy.** The autonomy dial should be driven by measured accuracy on real data, not by roadmap ambition. A wrong auto-filed number is a far worse event than a slightly slower approve step. Move the dial with evidence.

**Watch the incumbents' motion.** The same sources note that big incumbents are adding AI as SaaS features without disrupting their own fee structures. That inertia is our opening at the low end with the trades, but it also means when the outcome model is proven, they will move. Our moat has to be the WhatsApp native capture, the trade specific correctness, and the disciplined compliance posture, not merely "we have AI".

---

## 7. No regret moves to start now

These are cheap, aligned with the current roadmap, and open the service door without committing to walk through it. In rough priority:

1. Emit and store **outcome events** (receipt captured, quarter prepared, quarter filed, refund surfaced). Pure instrumentation, no user facing change.
2. Promote the **approval gate to a shared primitive** with a **risk class per action** and a complete **immutable decision log**. This is the keystone.
3. Add a **per action autonomy setting** in the data model, defaulted to propose and approve, even before any action uses "auto".
4. Keep the **model and provider layer clean and swappable**, extending the isolation we already have.
5. Keep pricing simple to the user, but start an internal view of **value per outcome by trade**, so an outcome flavoured tier is a later product decision.
6. Prototype the **accountant partnership** angle on paper, as the lower liability route to the service end.
7. Park, do not start, the **registered agent tier**. Write down the trigger conditions that would make it worth the AML and Agent Services Account burden, and revisit when they are met.

---

## 8. The bottom line

Lekhio does not have to choose between being a tool and being a service. Because we operate in regulated tax, the pure service end carries liability and supervision weight, and the human approval gate is what lets us capture service level value while keeping the taxpayer legally responsible. That gate, plus outcome instrumentation, a clean model layer, an autonomy dial, and an audit trail, is a design that can move from tool toward service at our own pace and stop wherever the risk and reward balance is best. Build for the slide, price simply now but measure outcomes, keep the honesty that regulators and nervous tradespeople both reward, and treat the registered agent step as a deliberate option we hold, not a race we have to run.

---

## Sources

- Foundation Capital, Where AI is headed in 2026, https://foundationcapital.com/ideas/where-ai-is-headed-in-2026
- Kategos, Service as Software, the AI inversion, https://kategos.ai/service-as-software-the-4-6-trillion-ai-inversion-2026/
- Monetizely, The 2026 Guide to SaaS, AI, and Agentic Pricing Models, https://www.getmonetizely.com/blogs/the-2026-guide-to-saas-ai-and-agentic-pricing-models
- Accounting Today, A big year for AI in accounting, https://www.accountingtoday.com/news/a-big-year-for-ai-in-accounting
- Forbes, How AI Will Change The Accounting Software Industry In 2026, https://www.forbes.com/sites/christerholloman/2025/12/09/how-ai-will-change-the-accounting-software-industry-in-2026/
- GOV.UK, Find out how to register as a professional tax agent with HMRC, https://www.gov.uk/guidance/find-out-how-to-register-as-a-professional-tax-agent-with-hmrc
- GOV.UK, Create an agent services account, https://www.gov.uk/guidance/get-an-hmrc-agent-services-account
- GOV.UK, Economic Crime Supervision Handbook, Accountancy service providers, https://www.gov.uk/hmrc-internal-manuals/economic-crime-supervision-handbook/ecsh43531
- Clifford Chance, Agentic AI and the liability gap your contracts may not cover, https://www.cliffordchance.com/insights/resources/blogs/talking-tech/en/articles/2026/02/agentic-ai-and-the-liability-gap-your-contracts-may-not-cover.html
- Forbes Tech Council, When AI Agents Act, Who Is Liable, https://www.forbes.com/councils/forbestechcouncil/2026/06/04/when-ai-agents-act-who-is-liable/

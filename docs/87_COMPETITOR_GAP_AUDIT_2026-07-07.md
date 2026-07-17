# 87: Competitor gap audit and borrow list (7 July 2026)

> A full sweep of UK mainstream, bank-bundled, niche/AI, and international products, plus the human accountant, against what Lekhio has today. Three research passes fed this. Writing rule holds: no em dashes, no en dashes, no hyphens as dashes. Read doc 81 first for current state; doc 86 s6f for the prior competitor read this builds on.

## The frame

MTD for Income Tax became mandatory on 6 April 2026 for sole traders and landlords over 50k qualifying income (30k from Apr 2027, 20k from Apr 2028). Every mainstream and bank player is HMRC recognised and filing live today. Lekhio prepares but cannot yet submit (sandbox foundation only). That one fact frames the whole audit: our differentiation is real, but three table stakes for the mandated market are missing.

## What the market looks like now

- **Mainstream software files live:** QuickBooks Sole Trader (10/mo), Xero Simple (7/mo), FreeAgent (19/mo but FREE via NatWest/Mettle), Sage for Sole Traders (10 to 15/mo, plus a free non-VAT app). All do live MTD ITSA quarterly updates plus Final Declaration, live bank feeds, receipt-to-bank matching, and accountant access.
- **Banks give tax away free:** Monzo (Sage embedded), Starling (Ember, acquired 2024), Mettle plus FreeAgent, Tide, all file MTD free to account holders and auto categorise the bank feed. Tide and Starling auto ring fence a tax pot. This is the price and distribution squeeze.
- **Niche and AI:** ANNA Money is the aggressive leader, free MTD Self Assessment for 2026/27 plus a 150 competitor refund, an "Auto Accountant" that auto categorises, matches receipts, keeps a live estimate and a Smart Tax Pot, plus VAT, Corporation Tax, payroll and company formation. Coconut, Untied, GoSimpleTax, TaxCalc all file live. Crunch, Ember and TaxScouts (now Taxfix) sell human accountant sign off. Bokio EXITS the UK 30 June 2026 (a switcher pool to capture).
- **The one direct trade rival: TaxNav.** CIS and construction specialist MTD ITSA, and it pulls your CIS deductions directly from HMRC. But it is web only, no AI, no photo, no voice, no WhatsApp. Our closest positioning rival and very beatable on experience.
- **Crucial validation:** even ANNA, whose marketing screams "done for you," keeps "you review and approve, we file." Nobody has removed the human sign off. Our approval gate is the market norm, not a limitation. Bench (US) collapsed on a human heavy managed model, which validates our AI first low marginal cost approach.

## The gap matrix (Lekhio vs the field)

| Capability | Field | Lekhio | Verdict |
|---|---|---|---|
| WhatsApp + voice + photo capture | Nobody | Yes | OUR MOAT |
| Proactive agent (thresholds, deadlines, savings) | Nobody at this depth | Yes (Rakha) | OUR MOAT |
| Trade + CIS focus | Only TaxNav | Yes | OUR MOAT |
| Tax optimiser / find reliefs | Some ("suggestions") | Yes | Ahead |
| Approval gate before filing | All (even ANNA) | Yes | Parity, and a selling point |
| Live HMRC MTD ITSA filing | All | Sandbox only | KILLER GAP |
| Live open banking feed + auto reconcile | All | Built, dormant (ICO gated) | KILLER GAP |
| Live MTD VAT filing | Most | None | Gap (VAT slice) |
| Receipt to bank matching | Most | No (needs feed) | Gap |
| Accountant / agent access | All mainstream | No | KILLER GAP (retention) |
| Free or bank bundled price | Banks, ANNA, Pandle | 19.99/mo | Pressure |
| Auto tax set aside pot | Tide, Starling, ANNA, Found | Maths only, no pot | Gap |
| CIS deduction pull from HMRC | TaxNav | Tracks, not pulled | Gap (trade) |
| Income reference / SA302 PDF | Nobody in software | No | OPEN GOAL |
| Human review add on tier | Crunch, Ember, TaxScouts | No | Opportunity |

## Missing features, ranked

**Tier 1, table stakes (mostly external gated, not code, matches doc 81 critical path):**
1. **Live HMRC MTD ITSA filing.** Existential. Everyone files; we prepare. Nothing else matters as much. Gated on HMRC recognition (Ltd + application, doc 72).
2. **Activate the live bank feed + auto categorisation.** Built and dormant, gated on ICO registration. Without it users hand feed every transaction, the exact drudgery rivals killed. This also unlocks receipt to bank matching and the Keeper style prompts below.
3. **Accountant view (read only).** Most trades have an accountant; if they cannot see the books, the tool gets dropped. Role based view only access (see Lili), fits our approval gate ethos.

**Tier 2, high value and buildable now (little or no external dependency, on brand):**
4. **CIS deduction auto pull from HMRC** (match TaxNav) and surface it in WhatsApp: "HMRC shows 640 deducted this quarter, refund on track." Deepens the trade wedge.
5. **Income reference / SA302 style PDF** generated on request from confirmed figures. Trades constantly need these for mortgages and finance, and no software rival offers it. Open goal, reuses the quarter pack renderer.
6. **Auto set aside reminder / ring fence.** We cannot hold money (not an EMI), but on each confirmed income we can nudge "set 180 aside" and reinforce the promise. A light version of ANNA's Smart Tax Pot.
7. **Anomaly / error catcher.** Duplicate receipts, outliers, VAT on a VAT exempt supplier, uncategorised over X. The "an accountant would have spotted that" layer, delivered as a Rakha nudge. Pure deterministic, zero AI credit.
8. **MTD VAT return path.** For the slice crossing 90k. Design the shared VAT + ITSA ledger now (see Xero) so it is additive.

**Tier 3, monetise and defend:**
9. **Human review add on tier.** A paid "get a real accountant to check it" option behind the approval gate (TaxScouts 169/return, Ember, Crunch). Monetises trust without diluting the WhatsApp product.
10. **Competitor switch offer.** Match ANNA's software refund as a Bokio exit acquisition play (Bokio leaves the UK 30 June 2026).

## Borrow list (from abroad, ranked by fit)

The two that map perfectly onto our WhatsApp + proactive agent DNA and no UK rival does:
1. **Keeper's proactive ambiguous charge text.** When a transaction is unclear, the agent asks "Was this 47 at Screwfix for a job or personal?", one tap reply, rescues the deduction. Needs the bank feed live first. Highest fit.
2. **Tyms / Vyapar log a sale by text that instantly spawns and sends the invoice.** "Just did 600 boiler service for Dave" drafts the invoice, approve, one tap sends to the customer over WhatsApp. Directly monetisable, on site friendly.

Then:
3. **Live tax bill after every entry (Found, Lili).** Each logged item replies with the new running estimate plus set aside. We have the maths; surface it as a constant number.
4. **One tap WhatsApp invoice send + auto chase (Vyapar, Refrens, Khatabook).** Send to the customer over WhatsApp and auto nudge non payers. Solves the trades' real pain, getting paid.
5. **Early payment countdown discount (Refrens).** Optional "pay within 48h, 2 percent off" timer on the invoice. Speeds cash flow, genuinely novel.
6. **Confidence threshold autopilot (Puzzle, Digits).** Auto book high confidence items silently, only ping on the genuinely ambiguous ones. Maps straight onto our autonomy dial, extend it.
7. **Trade specific deduction library the agent hunts (FlyFin, 200+ categories).** A curated write off set per trade (sparky vs plasterer vs scaffolder) the agent actively checks. "We find what your accountant misses."
8. **Personality tone toggle + in chat charts + conversational memory (Cleo, doubled subs on personality alone).** A cheeky vs plain toggle, a rendered mini chart when asked "how did I do this month", and memory of goals and suppliers. Keep tone plain for anything tax serious.
9. **On demand human escalation as a chat upsell (Taxfyle, Keeper).** "Talk to a real accountant" button inside WhatsApp for hard cases. Same as Tier 3 item 9.
10. **Role based view only accountant access (Lili).** Same as Tier 1 item 3.

## Threats to watch

- **Basis and Accrual (US).** Agentic accountant unicorns (Basis 100M Series B, 1.15B valuation, Feb 2026; Accrual 75M). Generate filing ready returns with human in the loop, embedded in top US firms. If they add UK MTD and a consumer front end they contest our core. Our defensible edge vs them is the WhatsApp + voice + trades channel and the approval gate UX, not the ledger AI. Lean into the channel and the vertical.
- **Cleo.** Chat first, 300M ARR, UK linked, now agentic with real time voice and personality driven retention. Consumer budgeting today, but a "for the self employed" mode would compete on engagement, the closest thing to our feel.
- **Tyms "Adam" (Nigeria/US).** Already markets WhatsApp native AI bookkeeping, the exact thesis, could expand to the UK cheaply. Watch it.

## The honest strategic read

Our WhatsApp first, voice first capture and the proactive agent are genuinely differentiated and no competitor here does conversational capture. But the table stakes for the mandated 2026 market are live filing, a live bank feed, and accountant access, and we are short on all three while priced above the free bank field. The play: close Tier 1 (external gated, already on the doc 81 critical path), ship the Tier 2 buildable wins that deepen the trade wedge (CIS pull, income reference PDF, anomaly catcher, set aside nudge), borrow the two WhatsApp native mechanics nobody else here has (Keeper ambiguous charge, Tyms instant invoice), and position the approval gate and the human review tier as trust features, not limitations. Differentiation is real; the job is to earn the right to use it by clearing the table stakes.

## Exhaustion sweep (second pass), what the first pass missed

The important correction: **we are no longer the only conversational WhatsApp bookkeeper for UK trades.**

- **Accounted ("Penny"), the primary direct rival now.** UK, from 14/mo. An AI bookkeeper that lives entirely in WhatsApp: photograph a receipt and she scans and categorises it, mileage over WhatsApp at HMRC rates, a live Income Tax plus NI estimate, bank feed import and reconciliation, proactive tax threshold alerts, cash flow forecasting net of tax, and MTD Self Assessment filing. Explicitly targets sole traders, **construction workers needing CIS, and landlords.** This is our positioning almost verbatim, in market, and cheaper. The "nobody does conversational" moat is now only partly true.
- **Receiptor AI.** Global, WhatsApp/iMessage/SMS receipt intake that codes to Xero/QuickBooks and matches the bank line. Borrow: its **"Memories"** feature (silently learns each user's categorisation corrections so receipts self code over time). A retention mechanic for Rakha.
- **Landlord Studio.** Became HMRC recognised for MTD on 30 Mar 2026. Purpose built for property, bank feeds, Smart Scan OCR, per property P&L, live filing. A live MTD threat for our landlord half.
- **Record OS.** UK, launched Jun 2026 by ex Wise people. AI plus a senior ex HMRC/ex BDO accountant reviews every return, you approve, they file, from 125/return. Validates our approval gate; watch its free bridging tool.
- **QuickBooks Sole Trader Plus.** Intuit repackaged QB Self Employed for the 50k mandate with "digital assistants" and learning auto categorisation. Enormous distribution, not conversational.
- **Powered Now.** Trades job management app that now handles MTD and the **CIS domestic reverse charge in app.** Not voice/WhatsApp, but the reverse charge handling is worth matching.
- **Dext** now ingests receipts **via WhatsApp** too (99.9 percent claimed). The receipt input channel is being commoditised, so our edge cannot be "you can send a receipt on WhatsApp," it has to be the agent and the trade depth around it.

**Sharpened positioning:** differentiation shifts from "we are conversational" (Accounted now is too) to a stack that is hard to copy together: deepest **trades and CIS** specialism (CIS reverse charge, CIS deduction pull, refund tracking), the **Rakha proactive agent with the governed autonomy dial**, **voice note first** capture done better than Penny, the **tax optimiser so we file the most efficient numbers**, and the honesty of the approval gate. Velocity matters: four rivals shipped or gained MTD recognition in the last four months around the April 2026 mandate.

## Decisions (7 July, Jag)

1. **The three killers (live filing, live bank feed, accountant access) are LAUNCH PREP,** not now. They are external gated (HMRC recognition, ICO). Tracked in doc 81 section 12.
2. **Free is not automatically good.** We do not race the banks to zero. The hook, when we do make filing free or cheap, is not "filing" but **"filing with the most tax efficient numbers, not just for the sake of filing."** Everyone else files whatever is in the box. We file the version that legally lowers your bill, because the tax optimiser has already worked it. That is the differentiator to lead with, and it turns a commodity (filing) into a reason to switch.
3. **Build everything buildable now.** Every Tier 2 win and every borrow that has no external dependency gets built, added to the free tools where it fits, showcased on the website, and wired cleanly into the app. Goal stated plainly: be the best in the market and own it.
4. **The real moat is Rakha plus the depth of the knowledge base (the Khoji / Obsidian vault), not the capture channel.** Receipt scanning over WhatsApp is now table stakes (Accounted, Receiptor and even Dext do it). What no one else has is a proactive agent (Rakha) backed by a deep, growing store of UK tax rules, reliefs and case law (Khoji feeding an Obsidian knowledge base). That is where the money is: Rakha should visibly know more, warn earlier, and find more than any rival, because it reads from a knowledge base that keeps getting deeper. CIS depth is part of this (reverse charge, deduction handling, refund tracking). Everything we build should make Rakha smarter or the knowledge deeper, not just add another capture surface. When AI credit lands, wiring Khoji's distilled knowledge into Rakha's reasoning is the flagship move.
6. **Launch price: £12.99/month or £129/year** (14-day trial, no card), decided 7 Jul. Rationale: the direct WhatsApp rival Accounted is £14 AND already files to HMRC, which we do not yet, so we launch CHEAPER (undercut by £1) and win on the deeper agent. Costs do not constrain it (Anthropic ~20 to 60p/user, capped by the kill switch; ~78 percent gross margin even at 12.99). Set in code in lib/stripe.ts PRICE_PENCE (inline price_data, no Stripe dashboard price object). PLAN: raise to £12.99/£129 once live HMRC filing ships; existing subscribers keep 12.99 for life automatically because Stripe locks the amount at signup. Founder tier retired (founder == standard). Full rollout across site, app, WhatsApp, JSON-LD done same day.

5. **Target everyone.** Broaden from trades only to ALL UK self employed and landlords: freelancers, creatives, drivers, carers, consultants, side hustlers, the lot. Trades and CIS stay a visible depth strength (it is a real edge and under served), but the product, the free tools and the marketing speak to every sole trader. The wedge is still "the agent that watches your tax for you," which applies to everyone, not just trades.

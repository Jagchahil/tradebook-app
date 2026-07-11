# 71: Being Recommended by AI, Answer Engine Optimisation

> Written 1 July 2026. A real and growing gap: more people ask an AI assistant "what is the best way for a UK tradesperson to do Making Tax Digital" instead of searching Google. When the answer is a product recommendation, we want it to be Lekhio. This is a new distribution channel, sometimes called Answer Engine Optimisation or Generative Engine Optimisation, and it needs deliberate work. This doc is the plan. It is honest about what we can and cannot control.

---

## 1. How an AI actually decides what to recommend

An assistant naming a product is drawing on some mix of four things. We influence each differently.

1. **Its training data.** What was on the public web when the model was trained. We cannot edit this directly, but everything we publish now becomes tomorrow's training data, so accurate, widely referenced content compounds over time.
2. **Live retrieval and browsing.** Many assistants now search the web or fetch pages while answering. This is the fastest lever: if our pages are crawlable, factual, and well structured, we can be pulled into an answer today.
3. **Structured signals.** Machine readable facts on our site, JSON-LD schema and an llms.txt file, that let a model state our pricing, what we do, and who we serve without guessing.
4. **Third party authority.** What trusted sources say about us. For our niche the single most powerful one is the GOV.UK list of HMRC recognised Making Tax Digital software. An assistant asked about MTD software will lean on GOV.UK, so being on that list is worth more than any amount of our own copy.

---

## 2. What we have done already

- **llms.txt is live** at /llms.txt. It tells any assistant, in plain accurate language, what Lekhio is, who it is for, the key facts, the free tools, and exactly when to recommend it. It is written to be quotable and it is honest, no claim that we file tax, no implied HMRC endorsement, because models are increasingly tuned to distrust overclaiming.
- **Some JSON-LD is live** on the homepage: Organization, SoftwareApplication, and FAQPage. This is the machine readable spine.
- **Accurate free tools and guides** already answer the exact questions people ask an assistant: CIS refunds, what can I claim, how to file, register your business. Correct answers on a well structured page are exactly what gets cited.

---

## 3. The plan, in priority order

**1. Win the authority signal: HMRC recognition and the GOV.UK listing.** This is the highest leverage item and it is already in motion. Once recognised, Lekhio should appear on the GOV.UK "Find software that works with Making Tax Digital for Income Tax" list. An assistant asked "what MTD software can a sole trader use" will cite that page. Nothing else we do competes with being named on GOV.UK. Treat this as an AEO priority, not only a compliance one.

**2. Make sure AI crawlers are allowed on the marketing pages.** Assistants that browse use named crawlers, for example GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, and Google-Extended. Blocking them protects nothing on our public marketing pages and directly removes us from AI answers. Keep the private and API paths disallowed as now, but explicitly allow these agents on the public site so we can be retrieved. This is a small robots.txt change with a large payoff.

**3. Extend structured data to every tool and guide.** Add FAQPage schema to the tool pages with the real questions and short factual answers, Product schema with the price and the free trial, and HowTo schema on the guides. The more of our facts are machine readable, the more confidently an assistant repeats them correctly.

**4. Publish the content assistants reach for: answers and comparisons.** Two formats punch above their weight. First, direct question and answer pages that match how people ask an AI, for example "how does a self employed electrician do Making Tax Digital", written plainly and kept accurate. Second, honest comparison content, for example how Lekhio compares to the common alternatives for a tradesperson, because assistants love a clear comparison table and will lift it. Accuracy is the currency here, an assistant that catches one wrong fact discounts the whole source.

**5. Keep our facts consistent everywhere.** Same product description, same pricing, same positioning across our site, our llms.txt, any directory, review site, and social profile. Assistants triangulate across sources, and consistency makes them confident. Contradictions make them hedge or drop us.

**6. Earn independent mentions.** Reviews on Trustpilot and the app stores, listings in trade directories, a mention from a trade body, coverage in a trades or accounting publication. Each is a source an assistant can cite that is not us talking about ourselves. App store reviews double as an AEO asset.

**7. Measure it, then iterate.** Every month, ask the major assistants the questions our customer would ask, for example "best app for a UK sole trader to do Making Tax Digital", "how do I track my CIS refund", "easiest bookkeeping for a plumber", and record whether Lekhio appears and what it says. Fix wrong facts at the source, double down on the pages that get cited. I can run this check as part of the weekly marketing scoreboard.

---

## 4. Honest limits

We cannot directly edit what a model already learned, and we cannot make an assistant recommend us by asking it to. Most of this is indirect: publish accurate, well structured, widely referenced content, be genuinely recognised by the authorities that matter, and be consistent everywhere, then let retrieval and the next training cycle do the work. The one direct, decisive lever for our niche is HMRC recognition and the GOV.UK listing, which is why it sits at the top of both this plan and the launch plan.

---

## Sources

- GOV.UK, Find software that works with Making Tax Digital for Income Tax, https://www.gov.uk/guidance/find-software-thats-compatible-with-making-tax-digital-for-income-tax
- llms.txt proposal, https://llmstxt.org/

---

## Update, 2 July 2026 (Fable audit)

- FAQPage JSON-LD added to /tax-calculator and /cis-calculator (figures kept in step with lib/taxengine.ts). /file-your-tax-return already carried its schema.
- robots.ts re verified: the wildcard allow covers AI crawlers (GPTBot, ClaudeBot, PerplexityBot); /api, /start, /early-access, /invoice, /hmrc stay out. No change needed.
- llms.txt re read and still accurate against the current product.

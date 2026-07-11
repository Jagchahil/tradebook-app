# 10: Anthropic API Cost Model and Limits

> Honest numbers as of June 2026. Anthropic bills in US dollars. GBP figures use roughly £1 = $1.27 and are approximate. Token counts for images are estimates, since the real number depends on the photo size. Treat these as close, not exact.

---

## The short answer

At realistic usage, the Anthropic cost is tiny next to the £12.99 price. A heavy user who sends 100 receipts in a month costs you somewhere between **20p and 60p** in API spend. The API is not where your money goes. The real reasons to set limits are abuse and runaway bills from a bug, not normal customers.

---

## Current prices (per million tokens)

| Model | Input | Output | Good for |
|---|---|---|---|
| Claude Haiku 4.5 | $1 | $5 | Fast, cheap receipt reading |
| Claude Sonnet 4.6 | $3 | $15 | Best accuracy, conversational answers |
| Claude Opus | $5 | $25 | Not needed here |

Output always costs five times input. Batch processing is half price but is not suitable for a live webhook. Prompt caching can cut repeated input by up to 90 percent, which is a minor saving here because our prompt is small.

---

## What one receipt costs

A receipt photo from a phone, after Anthropic resizes it, is about 1,600 input tokens. Add about 200 tokens for the instruction prompt and about 150 tokens for the JSON reply.

So per receipt: roughly 1,800 input tokens and 150 output tokens.

| Model | Cost per receipt | In pence |
|---|---|---|
| Sonnet 4.6 | $0.0077 | about 0.6p |
| Haiku 4.5 | $0.0026 | about 0.2p |

A text question with no image, for example "how much did I spend on fuel," costs about the same: roughly $0.0075 on Sonnet, $0.0025 on Haiku, depending on how much transaction history we send as context.

---

## 100 messages

| Scenario | Sonnet 4.6 | Haiku 4.5 |
|---|---|---|
| 100 receipts | $0.77 (about 60p) | $0.26 (about 20p) |
| 300 receipts in a month | $2.30 (about £1.80) | $0.77 (about 60p) |
| 1,000 receipts in a month (extreme) | $7.65 (about £6) | $2.55 (about £2) |

Even at a thousand receipts a month, which no normal sole trader will hit, the AI spend is a real slice of the £12.99 you charge, which is exactly why the caps in lib/margin.ts are DERIVED from the margin floor rather than guessed. At realistic volume (20 to 60p of API) you are at 2 to 5 percent of revenue. The live model holds an 82% margin. **Recalculated 11 Jul 2026: the old figures on this line were worked out against a £29 price that no longer exists.**

---

## So should we have a limit

Not for cost at normal usage. You do want guardrails, for two different reasons.

**To stop a runaway bill from a bug or a loop.** This is the one that can actually hurt. Set a hard monthly spend cap and a budget alert in the Anthropic console at the organisation level. If a bug ever puts the webhook in a retry loop, the cap stops it before it empties your card. The idempotency we already built (one transaction per WhatsApp message id) also protects against this.

**To stop abuse from a single account.** Someone could script a flood of images through one number. Sensible guards:
- A generous monthly fair use cap per user, for example 1,000 receipts a month. Past that, reply with a friendly note rather than keep paying. A real tradesperson will never see this.
- One image per message, and reject very large files before they reach Claude.
- A simple rate limit per sender, for example a handful of messages a minute, to stop floods.

None of these limits should be tight enough that a busy genuine user notices. They exist for the edge cases.

---

## A money-saving option worth knowing

The webhook currently uses Sonnet 4.6 for receipt reading. You could switch receipt reading to Haiku 4.5 and cut that cost by roughly two thirds.

The catch is accuracy. Reading a faded thermal receipt is exactly where a cheaper model can slip, and accurate receipt reading is one of our main selling points. Rival apps get hammered in reviews for bad receipt scanning, so this is not the place to be cheap for the sake of it.

The smart middle path uses the `confidence_score` field that already exists on the transactions table. Read every receipt with Haiku first. If Haiku is not confident, read it again with Sonnet. Most receipts are clear and get the cheap path. The hard ones get the accurate path. You pay for accuracy only when you need it.

Recommendation: keep Sonnet for now while volume is low and accuracy matters most for trust. Revisit the Haiku plus escalation approach once there is real receipt volume to measure against.

---

## Sources

- [Pricing, Claude API Docs](https://platform.claude.com/docs/en/about-claude/pricing)
- [Anthropic API Pricing 2026, CloudZero](https://www.cloudzero.com/blog/claude-api-pricing/)
- [Claude API Pricing 2026, MetaCTO](https://www.metacto.com/blogs/anthropic-api-pricing-a-full-breakdown-of-costs-and-integration)

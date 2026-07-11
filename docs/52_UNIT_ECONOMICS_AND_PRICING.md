# 52: Unit Economics and Pricing

> What it actually costs to run Lekhio per user and per month, the margin at the chosen price, a rough acquisition cost, and the decision. Built on current 2026 pricing. Figures are estimates to size the business, not accounts. USD converted at about £1 = $1.27.

---

## The decision

**Price: £12.99 a month, flat, one tier.** Annual £129 (two months free). Founder offer: first month free, then 20% off for life, which is £15.99 a month or £159 a year. The model below shows this gives roughly a **90% gross margin**, breaks even at about **9 paying users**, and leaves a very healthy LTV to CAC even if we pay for ads. Margin is not the constraint at any sensible price, so we pick £12.99 for being affordable (under the £20 line that matters to trades), premium enough to signal quality, and competitive against every credible rival.

---

## Variable cost per active user, per month

The only things that cost money per user are the AI, voice transcription, the WhatsApp messages we send, and the card fee.

**AI (Anthropic, claude-sonnet-4-6 at $3 per million input, $15 per million output).**
- A receipt photo (vision): about 1,350 input plus 120 output tokens, roughly $0.006 each.
- A text or voice parse, a question, an invoice draft: roughly $0.003 to $0.006 each.
- A typical active sole trader: about 40 logs, 15 questions or invoices, 10 voice notes a month.
- AI total: about **$0.33, roughly £0.26 a month**. A heavy user, near the daily cap, maybe £0.60 to £0.80.

**Voice transcription (OpenAI Whisper at $0.006 a minute).** A 20 second note is about $0.002. Folded into the figure above.

**WhatsApp (Meta).** Service replies, and utility templates sent inside the 24 hour window after the user messages, are **free**. Out of window utility templates (a proactive reminder when the user has not messaged in a day) cost about £0.02 to £0.03 each. Twice daily nudges could in theory be 60 a month, but for an active user who messages daily, most land inside the free window. Conservatively assume **£0.50 to £1.00 a month**. This is the single biggest variable cost and the one lever to watch, see below.

**The card fee (Stripe, about 1.5% plus 20p).** On £12.99 that is about **£0.50**. On the £15.99 founder price, about £0.44.

**Blended variable cost, conservative: about £1.50 a month per active user** (AI plus voice plus WhatsApp), plus the card fee.

---

## Gross margin per user

| Plan | Revenue per month | Less card fee | Less variable cost | Contribution | Margin |
|---|---|---|---|---|---|
| Standard £12.99 | £12.99 | £0.50 | £1.50 | **£17.99** | **90%** |
| Founder £15.99 | £15.99 | £0.44 | £1.50 | **£14.05** | **88%** |
| Annual £129 | £16.58 per mo | £0.27 per mo | £1.50 | **£14.81** | **89%** |

Even on the founder price the margin is about 88%. Pricing higher than £12.99 would not meaningfully change the margin, because the variable cost is tiny. The number is a positioning choice, not a survival one.

---

## Fixed monthly operating costs, launch stage

| Item | Monthly |
|---|---|
| Claude Max plan (the build and ops assistant) | £120 |
| Supabase | £0 on free tier, then about £20 |
| Vercel | £0 on free tier, then about £16 |
| Resend email | £0 on free tier |
| Domain | about £1 |
| ICO data protection fee | about £4 |
| Apple Developer and Google Play | about £7 |
| **Total** | **about £130 to £170** |

Dominated by the Claude Max plan. At a contribution of about £18 a user, **break even is about 9 paying users**. Everything after that is roughly 90% profit.

---

## Acquisition cost, rough

Mostly organic and in person, so the real blended cost will be low. For planning, if we run some paid ads:
- UK small business software trial to paid acquisition typically lands around **£30 to £80 per paying customer** on Meta or Google.
- Lifetime value: at £12.99 and a 90% margin, with a sole trader staying perhaps 24 months, **LTV is about £430** (founder cohort about £337).
- So even at an £80 paid CAC, **LTV to CAC is over 5 to 1**, well above the 3 to 1 healthy mark, with a payback of under 5 months. With organic and in person, CAC is a fraction of that and the ratio is enormous.

---

## The one cost lever to watch

The proactive WhatsApp nudges are the only thing that could creep. To keep them near free:
1. Prefer sending the daily nudge inside the user's open 24 hour service window, which is free.
2. Keep the default to one useful nudge plus the weekly summary, not a barrage.
3. The hard AI budget already caps the Anthropic and Whisper spend per account and globally (doc 51), so the AI side cannot run away.

---

## Verdict

£12.99 is affordable, premium, competitive, and about a 90% gross margin with a tiny break even. There is no margin reason to charge more, and a strong adoption reason not to. Lock it. The next refinement, once billing is live and there is real usage data, is to measure the true variable cost per active user and confirm the WhatsApp window assumption.

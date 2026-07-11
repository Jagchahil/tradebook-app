# 91: Marketing operating model and connector stack (7 July 2026)

> How Lekhio's marketing engine runs, with Claude as the always-ready operator and Jag as the approve-and-spend authority. Pairs with doc 90 (the year one growth plan) and doc 89 (Jersey). The goal is simple: get to about 6,500 paying subscribers so the business can pay Jag £250k and the Jersey move is real. Writing rule holds: no em dashes, no en dashes, no hyphens used as dashes.

## The deal, in one line

Claude creates, analyses, recommends, queues, and audits the whole marketing operation. Jag approves anything that spends money or posts in public. That split gets Lekhio an agency, an analyst, and a media buyer for close to zero cash, which is exactly what the bootstrap year needs.

## Who does what

Claude runs, on demand and on a schedule:

- Content creation: scripts, hooks, captions, blog and SEO articles, ad copy, email sequences, landing pages, the merchant one pager, and the calendar.
- Creative production: image ads, short video ads, faceless demos and explainers, voiceovers, carousels and thumbnails (via Higgsfield and design tools).
- Competitor intelligence: teardowns of what rivals run and what is working, from the Meta Ad Library and SEO tools.
- Analytics and audits: pull performance across channels, say what is working, and recommend where to move effort and budget.
- Campaign build: set up Meta, TikTok, and Google campaigns, targeting, and creative, ready to launch.
- Optimisation: read results and recommend the changes that lower cost per customer.

Jag holds the button on:

- Publishing any public post or ad.
- Launching any campaign, and any spend or budget increase.
- Connecting the accounts (the one time authorization) and holding the payment method.

This is not a limitation to work around. It is the safety line that protects the budget and the brand. Claude will never fire spend or publish on its own.

## How approvals work in practice (fast, not fiddly)

To keep velocity without losing the safety gate, approvals are batched and lightweight:

- Content: Claude queues a week of posts, Jag approves the batch in one go, the scheduler releases them on time.
- Paid: Claude presents a set of campaigns with budgets and creative, Jag approves the set and the daily or total spend cap, then Claude operates inside that cap. Any change that raises the cap comes back for a fresh yes.
- Blanket "just spend what you like" is not something Claude will take. A standing budget cap that Jag sets, with Claude operating under it and reporting against it, gives the same speed safely.

## The connector stack, by function

Everything below needs a one time authorization by Jag in an interactive session (from the connector settings or an interactive command). It cannot be connected from a planning session. Until connected, Claude still does all the creation and planning, it just cannot post or pull live numbers.

| Function | Connector(s) | What Claude does with it | Needs approval to |
|---|---|---|---|
| Creative production | Higgsfield (connected), design and image tools | Generate video and image ads, demos, voiceovers | Uses your credits (already agreed) |
| Scheduling and posting | Zapier into Buffer or Later, plus native Meta and TikTok | Queue and schedule posts across channels | Publish each batch |
| Cross channel analytics and ads | Supermetrics | Pull performance, and create or update campaigns across Meta, Google, TikTok | Launch or change spend |
| Product analytics | Amplitude | See which signups activate and retain, feed it back into targeting | Read only |
| SEO and competitor | Ahrefs, Similarweb | Keyword gaps, content plan, competitor traffic and ads | Read only |
| Competitor ad teardown | Meta Ad Library (via browser) | See exactly what rivals run and how long, copy what works | Read only |
| Paid platforms (native) | Meta Ads, TikTok Ads, Google Ads | Build campaigns, targeting, creative, read results | Launch or change spend |

## Phased switch on

### Phase 0, now (planning): nothing connected

Claude produces content, creatives, competitor teardowns, and the plans. No accounts wired, nothing posts. This is where we are today.

### Phase 1, launch week: organic engine live

Connect a scheduler and the analytics and SEO tools. Claude starts producing and queuing the daily organic content (WhatsApp referral push, founder video scripts, free tool and trade page SEO, trade community posts). Turn on a weekly performance audit as a scheduled task. Jag approves post batches.

### Phase 2, months 4 to 6: paid switched on

Connect Meta, Google, and TikTok (directly or through Supermetrics). Claude builds the campaigns and creative; Jag approves the launch and sets a spend cap. Claude reports cost per customer daily and reallocates within the cap, bringing any cap increase back for approval. Commission reps recruited in parallel.

### Phase 3, months 7 to 12: scale what works

Claude scales the winning channels within the agreed cap, refreshes creative continuously, runs the billboard and ad van brand test, and keeps the rep team fed with material. Automated weekly audits drive the reallocation.

## Cadence (what runs automatically once live)

- Daily: a fresh content batch drafted and queued for approval.
- Weekly: a performance audit across every channel, in plain English, with the three changes to make.
- Monthly: a deeper review against the subscriber milestone and the spend to acquire, with the plan adjusted.

These run as scheduled tasks, so the engine feels always on even though Claude works in sessions.

## What "blowing up" looks like, measured

Tie every week back to the one number that matters, paying subscribers, on the way to 6,500.

- Reach and engagement: views, follows, saves, shares (leading signs).
- Traffic: site visits and free tool usage from SEO and social.
- Conversion: trials started, trial to paid, paying subscribers added.
- Efficiency: blended cost per customer and by channel, against a payback under 6 months.
- Retention: monthly churn (target moving from 5% toward 3%), because a leaky bucket caps everything.
- The headline: monthly recurring revenue climbing toward £78k, the level that funds the £250k draw.

## Honest caveats

- Growth is earned, not guaranteed. Claude can produce volume and iterate fast on what works, which stacks the odds, but no single post or ad is promised to pop.
- Connectors need that one time authorization by Jag, done interactively, before anything posts or pulls live data.
- Claude works in sessions and scheduled tasks, not as a 24/7 autonomous presence, and never spends or publishes without a yes.
- Effectiveness depends as much on the product keeping people (retention) as on acquisition. Fix churn before scaling spend.
- Ad platform and advertising rules apply. Real testimonials must be real people. AI creative is for demos, explainers, and brand content, not for faking customers.

## Related

- doc 90: year one growth plan and the channel by channel numbers.
- doc 89: Jersey relocation and the £250k milestone this all serves.

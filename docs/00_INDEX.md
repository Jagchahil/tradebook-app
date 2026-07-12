# 00. The index

> A hundred documents and no map. This is the map. Written 12 July 2026.
>
> **Read the four in "Start here" and you have the whole product.** Everything else is either the
> working out, a log of a day's build, or a plan for a thing not yet done.

---

## Start here, in this order

| Doc | What it is |
|---|---|
| **[104. The Doctrine](104_THE_LEKHIO_DOCTRINE_2026-07-11.md)** | **Sits above every other doc.** What Lekhio is ("not software you buy: the first employee a business ever hires"), what we refuse to call ourselves, and the line: *one less button at a time, until only one is left. Approve.* If another doc contradicts this one, this one wins. |
| **[103. Design restraint](103_DESIGN_RESTRAINT.md)** | The tactical child of 104. The four tests every button must pass. "A feature is not free because it is small." |
| **[81. Master handover](81_FABLE5_MASTER_HANDOVER.md)** | The single source of truth for the BUILD: what exists, env vars, how to run and push, the debugging playbook, what is parked. |
| **[CLAUDE.md](../CLAUDE.md)** | The working rules. The domain warning. The non-negotiables (we prepare, the human approves). |

---

## The truths that override older docs

Several docs were written before these were settled. Where they conflict, **these win**:

- **The domain is `lekhio.app`.** `lekhio.com` belongs to Lacspace Corporation (Kathmandu/Nagpur), an unrelated ERP company with the same name. Never write it. See [101](101_TRADEMARK_APPLICATION_PACK.md), [93](93_LAUNCH_GATES_RUNBOOK_2026-07-07.md).
- **The price is £12.99/month or £129/year**, 14-day trial, no card. `lib/stripe.ts` is the source of truth and `public/llms.txt` is tested against it. Any doc saying £29 or £19.99 is stale.
- **The entity is Lekhio Ltd.** "Satluj Ventures" was dropped. Docs 25/27/28/33 were damaged by a find-and-replace on 11 July and carry correction banners; read them with care.
- **The moat is NOT "nobody does conversational".** A direct rival (Accounted/"Penny", £14, live, files for real) exists. The edge is Rakha plus the depth of the knowledge base. See [87](87_COMPETITOR_GAP_AUDIT_2026-07-07.md).
- **The audience is ALL UK self-employed**, not only trades. Trades remain a visible depth strength, not the whole market.
- **Mileage is 55p** for the first 10,000 business miles in 2026/27. HMRC raised it from 45p, effective 6 April 2026. Any doc or comment saying 45p for 2026/27 is wrong.

---

## By purpose

### The product and the plan
[01 Vision](01_VISION.md) · [02 Product](02_PRODUCT.md) · [03 Build plan](03_BUILD_PLAN.md) · [06 Stack](06_STACK.md) · [12 Master plan](12_MASTER_PLAN.md) · [17 Roadmap](17_ROADMAP.md) *(price banner)* · [18 Feature ideas](18_FEATURE_IDEAS.md) · [82 Feature expansion](82_FEATURE_EXPANSION_PLAN.md) · [84 Agent v1 build plan](84_PHASE_C_AGENT_V1_BUILDPLAN.md) · [95 Brain, memory, agent design](95_BRAIN_MEMORY_AND_AGENT_DESIGN_2026-07-08.md)

### Tax, compliance, HMRC
[05 Compliance](05_COMPLIANCE.md) · [14 Data inventory (ROPA)](14_DATA_INVENTORY.md) · [26 Tax efficiency playbook](26_TAX_EFFICIENCY_PLAYBOOK.md) · [35](35_FILE_YOUR_OWN_RETURN_CONTENT.md)/[36 File your own return](36_FILE_YOUR_OWN_RETURN_BUILDSPEC.md) · [43 Completeness audit](43_COMPLETENESS_AUDIT_OWN_TAX.md) · [48 HMRC + TrueLayer checklist](48_HMRC_AND_BANK_APPLICATION_CHECKLIST.md) · [54 Expertise and exam results](54_EXPERTISE_AND_EXAM_RESULTS.md) · [55 MTD foundation](55_HMRC_MTD_FOUNDATION.md) · [66 Recognition checklist](66_HMRC_RECOGNITION_CHECKLIST.md) · [72 Production credentials answer pack](72_HMRC_PRODUCTION_APPLICATION_ANSWERS.md)

### Money, structure, the company
[25 Company structure](25_COMPANY_STRUCTURE.md) ⚠️ · [27 Two founders](27_TWO_FOUNDER_STRUCTURE.md) ⚠️ · [28 Three businesses](28_GROUP_STRUCTURE_THREE_BUSINESSES.md) ⚠️ · [52 Unit economics and pricing](52_UNIT_ECONOMICS_AND_PRICING.md) · [89 Jersey memo](89_JERSEY_RELOCATION_MEMO_2026-07-07.md) · [92 Incorporation pack](92_INCORPORATION_PACK_2026-07-07.md) · [98 The group: bank, law, global](98_GROUP_VISION_BANK_LAW_GLOBAL_2026-07-08.md) · [99 CRN unlock](99_CRN_UNLOCK_ACTION_PACK_2026-07-09.md)
*(⚠️ = damaged by the 11 Jul find-and-replace; correction banner at the top.)*

### Market, competitors, positioning
[04 Marketing](04_MARKETING.md) *(price banner; positioning superseded by 104 §9)* · [07 Brand](07_BRAND.md) · [11 Competitive audit](11_COMPETITIVE_AUDIT.md) · [15 Market sizing](15_MARKET_SIZING.md) · [37 Competitor review audit](37_COMPETITOR_REVIEW_AUDIT.md) · [46 Battlecard](46_COMPETITOR_BATTLECARD.md) · [53](53_COMPETITIVE_AND_ACCOUNTANT_AUDIT.md) · [56 End-to-end vs everyone](56_END_TO_END_AUDIT.md) · **[87 Competitor gap audit](87_COMPETITOR_GAP_AUDIT_2026-07-07.md) ← the current one** · [67 SaaS vs GaaS](67_SAAS_VS_GAAS_STRATEGY.md)

### Growth, marketing, being found
[31 Social operating system](31_SOCIAL_OPERATING_SYSTEM.md) · [32 Account setup kit](32_ACCOUNT_SETUP_KIT.md) · [39 WhatsApp templates](39_WHATSAPP_TEMPLATES.md) · [40 Email flows](40_EMAIL_FLOWS.md) · [42 Tax newsletter](42_TAX_NEWSLETTER.md) · [68 GTM strategy](68_GTM_AND_MARKETING_STRATEGY.md) · [69 Retention](69_RETENTION_PLAYBOOK.md) · [70 Outbound](70_OUTBOUND_AND_LEADGEN.md) · **[71 Being recommended by AI (AEO)](71_AI_DISCOVERABILITY_AEO.md)** · [90 Year one growth plan](90_YEAR_ONE_GROWTH_PLAN_2026-07-07.md) · [91 Marketing operating model](91_MARKETING_OPERATING_MODEL_2026-07-07.md)

> **On 71 and AI search:** `tradebook-web/public/llms.txt` now exists and is served at
> `https://lekhio.app/llms.txt`. It is the machine-readable statement of what Lekhio is, what it
> does NOT do, and the UK tax facts it works with. It is **tested** (`test/llmstxt.test.mjs`)
> against the actual tax engine and the actual Stripe price, because a model that fact-checks a
> false claim of ours recommends AGAINST us, to everyone, forever.

### Launch and operations
[13 Go live runbook](13_GO_LIVE_RUNBOOK.md) · [23 Checklist](23_GO_LIVE_CHECKLIST.md) · [24 Master action checklist](24_MASTER_ACTION_CHECKLIST.md) · [33 Pre-launch sequence](33_PRELAUNCH_SEQUENCE.md) ⚠️ · [34 Launch playbook](34_STEP_BY_STEP_LAUNCH_PLAYBOOK.md) · [61](61_ZERO_BUDGET_LAUNCH_PREP.md)/[62 Free prep](62_SETUP_STEPS_FREE_PREP.md) · [63 Launch readiness](63_LAUNCH_READINESS_CURRENT.md) · [77 Pre-launch game plan](77_PRE_LAUNCH_GAME_PLAN.md) · **[93 Launch gates runbook](93_LAUNCH_GATES_RUNBOOK_2026-07-07.md) ← the current one** · [90 Deployment and ops](90_DEPLOYMENT_AND_OPS.md) · [100 Bank feed go-live](100_BANK_FEED_GOLIVE_2026-07-11.md) · [102 App/Play review pack](102_APPLE_REVIEW_PACK.md)

### Security, scale, audits
Most of these are point-in-time. **The findings are applied; the docs are the record.**
[09](09_AUDIT.md) · [19 Security audit](19_SECURITY_AUDIT.md) · [21 Scale audit](21_SCALE_AUDIT.md) · [50 Re-audit](50_SECURITY_AND_BUILD_REAUDIT.md) · [51 API limits and abuse](51_API_LIMITS_AND_ABUSE.md) · [58](58_AUDIT_UX_SECURITY_AND_FIXES.md) · [59](59_COMPLETENESS_CROSSCHECK.md) · [64](64_FULL_AUDIT_2026-06-30.md) · [74 Fable findings](74_FABLE_AUDIT_FINDINGS.md) · [78 20k readiness](78_SCALE_SECURITY_AUDIT_2026-07-02.md) · [79](79_FULL_AUDIT_2026-07-02.md) · [94 Scale, security, cost](94_SCALE_SECURITY_COST_AUDIT_2026-07-07.md) · [96 Hard test](96_HARDTEST_AUDIT_2026-07-08.md) · **[88 Pre-launch audit](88_PRELAUNCH_AUDIT_2026-07-07.md) ← the most recent full one**

### Session logs (the record of a day's build)
[08 Progress](08_PROGRESS.md) · [41 Overnight report](41_OVERNIGHT_REPORT.md) · [75 Fable changelog](75_FABLE_CHANGELOG.md) · [83 (5 Jul)](83_SESSION_5JUL_EXPANSION_LOG.md) · [85 (6 Jul eve)](85_SESSION_6JUL_COMPLETE_SYSTEM_LOG.md) · [86 (6 Jul hardening)](86_SESSION_6JUL_HARDENING_AND_QUARTERPACK.md) · [97 (8 Jul)](97_SESSION_8JUL_PHASE15_REDESIGN_SECURITY.md)

### Other
[10 API costs](10_API_COSTS.md) *(superseded by `lib/margin.ts`, which is the live model)* · [16 Trust](16_TRUST.md) · [20 Next level](20_NEXT_LEVEL.md) · [22 Open banking spec](22_OPEN_BANKING_SPEC.md) · [30 Projections](30_PROJECTIONS_LAUNCH_TO_DEC.md) · [38 Master audit and roadmap](38_MASTER_AUDIT_AND_ROADMAP.md) · [44 Platform build and launch](44_PLATFORM_BUILD_AND_LAUNCH_PLAN.md) · [47 Integrations gap](47_INTEGRATIONS_GAP.md) · [49 Expert accountant roadmap](49_EXPERT_ACCOUNTANT_ROADMAP.md) · [57 Brainstorm](57_BRAINSTORM_GAPS_AND_ORIGINAL_IDEAS.md) · [73 Audit prompt](73_FABLE5_MASTER_AUDIT_PROMPT.md) · [76 Store listing](76_APP_STORE_LISTING.md)

---

## Known problems with the docs themselves

1. **Two docs are numbered 90.** `90_DEPLOYMENT_AND_OPS.md` and `90_YEAR_ONE_GROWTH_PLAN_2026-07-07.md`. Renumber one when convenient; they are unrelated.
2. **There is no doc 29, 45, 60, 65 or 80.** Not an error, just gaps.
3. **Docs 25, 27, 28 and 33 carry damage** from a find-and-replace on 11 July that swapped "Satluj Ventures" for "Lekhio Ltd" without reading the context, producing sentences like *"Lekhio Ltd is a holding company that owns the shares of Lekhio Ltd."* Each has a banner at the top. The original text was not in git, so nothing could be restored; the sentences were NOT invented back, because guessing at a company structure is worse than admitting it is damaged.
4. **The audit docs are a point-in-time record, not instructions.** Their findings have been applied. Read the newest (88, 94, 96) and treat the older ones as history.

## The rule that keeps this honest

**The code is the truth. The docs describe it.** Where they disagree, believe:

- `lib/taxengine.ts` and `lib/nistudentloan.ts` — for any tax figure.
- `lib/margin.ts` — for unit economics.
- `lib/stripe.ts` — for the price.
- `lib/categories.ts` — for what a cost can be.
- `public/llms.txt` — for what we tell the world, and it is tested against the three above.

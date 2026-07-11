# 25: Company Structure, a deep think on tax and how to run this

> ## ⚠️ ENTITY NAMES IN THIS DOC ARE UNRELIABLE. CORRECTED 11 JULY 2026.
>
> **Two things happened to this doc and you need both before you read a word of it.**
>
> **1. Jag dropped the Satluj name on 11 July 2026.** There is no Satluj Ventures and there will not be one. **The only real entity is LEKHIO LTD, company number 17329341**, incorporated 8 July 2026, with Jag holding the shares personally. Doc 92 is explicit and it is what was actually filed: one shareholder, one class of ordinary shares, **no holding company**. A holding company may exist later and would be called **Lekhio Group**. It does not exist today.
>
> **2. A find and replace on 11 July damaged the entity names below.** A sweep replaced "Satluj Ventures" with "Lekhio Ltd" without reading the context, so in places where this doc meant the HOLDING company it now says "Lekhio Ltd", which is the TRADING company. Some sentences are therefore self referential nonsense ("Lekhio Ltd is a holding company that owns the shares of Lekhio Ltd"). The docs were not in git, so there was nothing to restore from.
>
> **Read every "Lekhio Ltd" below with suspicion.** Where it is clearly the parent, it means "a holding company, not yet named and not yet formed". Where it is clearly the trading company, it means LEKHIO LTD 17329341.
>
> **Nothing in this doc is filed, registered, or committed.** It is thinking. The only company that exists is Lekhio Ltd. Before acting on any structure here, get it from the accountant, not from this file.



> Sole trader vs limited company, and whether to use a holding company over an operating company. Written June 2026 with current rates. This is general information to help you decide, not tax advice. Before you incorporate anything, spend a couple of hundred pounds on a startup accountant, especially if you might raise investment. The structure decision has long tax consequences and the wrong setup can quietly cost you reliefs you cannot get back.

---

## First, the words

"LLC" is American. In the UK the equivalents are a **limited company (Ltd)** or a **limited liability partnership (LLP)**. For a software startup with a founder or two, the answer is almost always a **Ltd**. "Going public" in the proper sense means floating on a stock market, which is years away and not what we mean here. So the real question is: sole trader, one Ltd, or a holding company with an operating company underneath.

---

## The current numbers (2026/27)

- **Corporation tax:** 19% on profits up to £50,000, 25% over £250,000, marginal relief in between.
- **Dividend tax** went up in April 2026: 10.75% basic, 35.75% higher, 39.35% additional. Dividend allowance is only £500.
- **Business Asset Disposal Relief** (the reduced capital gains rate when you sell the business) rose to **18%** from 6 April 2026, on gains up to £1m lifetime.
- **SEIS** (for investors who back you): 50% income tax relief on up to £200,000, if the company has under £350,000 gross assets, fewer than 25 staff, and has traded under 3 years.
- **EIS:** 30% relief, and from April 2026 a company can raise up to £10m a year under it.

---

## Sole trader vs one Ltd

### Sole trader
- Free, instant, simplest. You and the business are the same legal person.
- You pay income tax and National Insurance on the profit.
- Downside: unlimited personal liability, and it looks less solid to Stripe, banks, and bank-link partners.

### One limited company
- Limited liability. The company is separate, so your house is not on the line if it goes wrong.
- Pays corporation tax on profit. You take money out as a small salary plus dividends.
- The pure tax saving over sole trader used to be large. It has shrunk because dividend tax went up and the dividend allowance fell to £500. At low profits the difference is now small. The real reasons to incorporate today are **limited liability, credibility, and being ready for investment or a sale**, more than a big tax win.

Rough rule: below a few tens of thousands of profit, sole trader is simpler and similar on tax. As profit grows, and especially if you want outside money or an exit, the company wins.

---

## The holding company question (a parent over Lekhio Ltd)

The idea: **a holding company** (unnamed and unformed; it would be called **Lekhio Group** if it ever happens) owns the shares of **Lekhio Ltd**, the trading company. Later, the marketing engine and Connect could be their own subsidiaries under the same parent.

### Why a holdco is genuinely attractive here
- **Ring-fences risk and IP.** The valuable brand and IP can sit in the parent, away from the trading risk.
- **Houses several ventures cleanly.** You already plan three products. Each can be its own subsidiary under Lekhio Ltd, with shared ownership and clean separation.
- **Tax-free movement of profit upward.** Dividends paid from a UK subsidiary to a UK parent are generally exempt from tax. So profit can pool in the holdco without a tax hit on the way up.
- **The big one, the exit.** Under the Substantial Shareholding Exemption, a company that sells shares in a trading subsidiary it has held for at least 12 months can often pay **no corporation tax on the gain**. If you ever sell Lekhio, doing it from a holdco can be dramatically more tax efficient than selling as an individual. Confirm the conditions with an accountant.
- **Raising or selling one product** without disturbing the others.

### The costs of a holdco
- Two companies means two sets of accounts, two confirmation statements, more admin and more accountant cost.
- More complexity than you need on day one.

---

## The catch that matters most: investment

If you might raise **SEIS or EIS** money (very likely for a UK startup, the reliefs are why angels say yes), the structure has to be right **before** you raise, and a holding company can complicate eligibility. Two things to know:
- A founder usually **cannot** claim SEIS or EIS relief on their own money, because you will hold more than 30% of the shares. SEIS and EIS are incentives for outside investors, not for you.
- Getting the entity and the group structure wrong can disqualify the company from SEIS or EIS. This is the single biggest reason to take advice before incorporating if raising is on the table.

---

## R&D and other reliefs

- Lekhio builds genuinely novel software with AI. It may qualify for **R&D tax relief**, which reduces corporation tax or gives a credit. Worth exploring with an accountant once you are a company and spending on development.
- **VAT** only matters once turnover passes £90,000, then you register. At £12.99 a month that is a long way off.

---

## The honest recommendation

Two sensible paths. Both are defensible. Pick based on how soon you will raise money and how committed you are to the multi venture vision.

**Path A, lean and reversible.** Incorporate **one company now**, either Lekhio Ltd or Lekhio Ltd trading as Lekhio. Launch, get revenue, keep it simple and cheap. Insert a holding company **later**, when there is a concrete reason such as raising investment, a second product with real value, or an exit conversation. While the company is worth little, putting a holdco on top later is cheap and clean, so there is no rush. This is the usual startup path.

**Path B, structured from day one.** Incorporate **Lekhio Ltd as the holding company** and **Lekhio Ltd as a wholly owned subsidiary** now. More admin and cost, but it matches the multi venture vision, keeps IP separate, and sets up the tax efficient exit from the start. Reasonable if you are confident about the long game and can fund the extra admin.

My lean, for where you are this week: **Path A.** Get one Ltd, launch, prove it. Do the holdco the moment raising or a second revenue product is real, with an accountant steering it so SEIS and EIS are not broken. The exception is if you already know you will raise soon, in which case set the structure up correctly from the start, with advice, before any investor money goes in.

Either way, the non negotiable: **a one off session with a startup accountant before you incorporate.** It is a small cost against a decision that affects your tax for years and your access to investor reliefs. I can prepare the exact questions to take to them.

---

## Sources

- Corporation tax and dividend rates 2026/27: https://taxscape.deloitte.com/taxtables/deloitte-uk-tax-rates-2026-27.pdf
- SEIS and EIS 2026, GOV.UK: https://www.gov.uk/government/statistics/enterprise-investment-scheme-and-seed-enterprise-investment-scheme-may-2026/enterprise-investment-scheme-and-seed-enterprise-investment-scheme-2026
- Business Asset Disposal Relief rate change: https://www.gov.uk/government/publications/changes-to-tax-rates-for-property-savings-dividend-income/changes-to-tax-rates-for-property-savings-dividend-income

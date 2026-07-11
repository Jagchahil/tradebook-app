# 27: The Structure for Two Founders

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



> You and your business partner. How to actually set the companies and shares up, who owns what, and how each of you pulls money out tax efficiently and independently. 2026/27 rules. I am laying out the standard founder structure an accountant and a startup solicitor would build. I am not filing or drafting it. Confirm the specifics with them before you sign anything, especially the share split and any fundraising.

---

## The short version

Launch with **one company, Lekhio Ltd, owned by the two of you**, with a proper shareholders' agreement and founder vesting in place from day one. Add the holding company structure later, with advice, when there is real value or a raise on the table. Two founders unlock two extra tricks worth knowing now: **separate share classes** for independent dividends, and **personal holding companies** for independent control of your own tax. Both are explained below.

---

## Step 1. The trading company and who owns it

Incorporate **Lekhio Ltd** as the operating company. The two of you are the directors and the shareholders.

### The split
Decide the ownership split honestly and early. 50/50, 60/40, whatever reflects the real contribution. A 50/50 split is common and fine, but it has one danger: **deadlock**. If you two disagree and own exactly half each, nothing can be forced through. That is why the shareholders' agreement below matters more at 50/50 than at any other split.

### Use separate share classes, not plain 50/50 ordinary shares
Here is the first real tax trick for two founders. If you both hold the same ordinary shares, **dividends must be paid in proportion**, so you each must take the same amount at the same time. That is rigid.

Instead, set up **alphabet shares**: you hold the A shares, your partner holds the B shares. The company can then declare **different dividends to each class**. Why that helps:
- One of you has other income, or a spouse's situation, that means you want to draw less this year and stay in the basic rate band, while the other draws more. Alphabet shares let each of you optimise your own tax independently.
- It is flexible year to year with no restructuring.

Ask the accountant to set up A and B ordinary shares with equal rights except the ability to vote separate dividends. Standard, cheap, done at incorporation.

---

## Step 2. The agreement that protects you both

This is the part founders skip and regret. Before you build value, put in place:

**A shareholders' agreement.** Covers what happens if one of you wants to leave or sell, how big decisions are made, how deadlock is broken at 50/50, and what one founder can and cannot do without the other. This is your prenup. Cheap now, priceless later.

**Founder share vesting.** Right now your shares are worth little, so it is painless to agree that each founder's shares **vest over time**, often four years. If one of you walks away after six months, vesting means they do not keep half the company for nothing. It protects the one who stays. Both of you should want this.

A startup solicitor drafts both together, often as a fixed fee package. Do it at incorporation while it is friendly and free of tension.

---

## Step 3. The holding company, and the two ways to do it

The holdco is what makes the structure tax efficient at scale and at exit. With two founders there are two shapes. This is the key decision.

### Shape A. One shared group holdco
```
        You 50%        Partner 50%
              \         /
          Lekhio Ltd   (holding company)
                   |
              Lekhio Ltd         (the trade)
              |    |    |
        Marketing  Connect  (future products, each its own subsidiary)
```
Lekhio Ltd sits on top, owned by the two of you. Lekhio and future products are subsidiaries. Profit can move up to the holdco between group companies **tax free**. On a future sale, the **Substantial Shareholding Exemption** can let the holdco sell a subsidiary with **no corporation tax** on the gain. This is the clean multi product, exit ready shape, and it matches your Lekhio Ltd branding.

### Shape B. Each founder has a personal holding company
```
   You              Partner
    |                  |
 Your Holdco Ltd   Partner Holdco Ltd
        \            /
       Lekhio Ltd (or straight into Lekhio Ltd)
                |
           Lekhio Ltd
```
This is the most tax flexible of all for two partners, and the reason is **independence**. Dividends flow from the trade up into **each of your own personal holdcos tax free**. From there, each of you decides separately:
- Take it out personally now and pay dividend tax, or
- Leave it in your own holdco untaxed to reinvest, save, fund your pension, or buy other assets.

One of you can pull cash for a house deposit while the other leaves everything invested and pays no personal tax at all this year. With a single shared structure you are more tied together. With personal holdcos, **your tax is your business and theirs is theirs**. This is exactly why serious founder pairs use it.

### The trade off, be aware
Holding shares through a personal company changes your access to **Business Asset Disposal Relief**, the 18% personal capital gains rate on a sale, up to £1m lifetime. BADR is a personal relief on shares you hold personally. If your shares sit inside a holdco, the exit route is the holdco's Substantial Shareholding Exemption instead, which can be zero corporation tax but leaves the proceeds **inside a company**, not in your pocket. Personal ownership gives you the £1m at 18% directly. Holdco ownership defers and can be larger, but the cash is then in a company you have to extract from.

There is no single right answer. It depends on whether you want money out at exit (favours personal ownership and BADR) or to roll a large gain on into the next venture tax free (favours personal holdcos). **This is the exact thing to put to the accountant.** Get it right before a sale, not after.

---

## Step 4. If you are going to raise investment

If outside money is likely, decide it **before** you build the structure, because SEIS and EIS investors need the company set up correctly and a holdco can complicate eligibility.

- Investors put money into the company for SEIS or EIS relief. You two, as founders holding well over 30% between you, **cannot claim SEIS or EIS on your own money**. These schemes are the carrot for outside angels, not for you.
- Personal holdcos owning the founder shares is generally fine, but the trading company must meet the SEIS and EIS conditions at the time of the raise. Get an accountant who does SEIS to confirm the shape first. A botched structure can disqualify the relief and kill a round.

---

## How each of you gets paid, two founder version

Because there are two of you, the company **can claim the Employment Allowance**, which removes employer NI on your salaries. So:

- Each founder takes a **£12,570 salary**, fully covered by the personal allowance, with employer NI absorbed by the Employment Allowance.
- Each takes **dividends** on their own share class up to their chosen level, optimising their own tax band independently.
- The company makes an **employer pension contribution** for each of you, untaxed, cutting corporation tax. The single biggest efficiency lever, and you each get your own.

See doc 26 for the full mechanics. The two founder difference is the £12,570 salary each (not the lower sole director figure) and the alphabet shares letting you draw dividends independently.

---

## The recommendation, in order

1. **Now:** incorporate **Lekhio Ltd**, two founders, **alphabet shares** (A and B), with a **shareholders' agreement** and **founder vesting**. Launch lean. Cheap, clean, protective.
2. **Salary and dividends:** £12,570 each, dividends per class to taste, employer pension each. Claim the Employment Allowance.
3. **When value builds or you raise:** insert the holdco with advice. Choose Shape A (shared Lekhio Ltd group) for simplicity and the multi product vision, or Shape B (personal holdcos) for maximum independent tax control. Doing it while the company is worth little is cheap and needs HMRC clearance, which an accountant handles.
4. **Before any raise:** get an SEIS and EIS literate accountant to confirm the structure first.

---

## Two things that change the exact answer

Tell me these and I will lock the precise version for you:
1. **Is the split 50/50, or something else?** It changes the deadlock and agreement design.
2. **Do you intend to raise outside investment, or bootstrap?** It changes whether you build the holdco early and how.

---

## Your locked setup: 50/50, bootstrapped

You told me 50/50 and self funded for now. That makes the plan simpler and removes the SEIS and EIS constraints, so here is the exact version.

**Incorporate one company, Lekhio Ltd, now.**
- Two equal founders, but issued as **alphabet shares**: 50 A shares to you, 50 B shares to your partner. Equal rights, equal value, but you can vote dividends to each class independently. Same 50/50 ownership, more tax flexibility.
- Hold the shares **personally** for now, not through holdcos. Bootstrapped and pre value, personal ownership is simplest and keeps your **Business Asset Disposal Relief** (18% on up to £1m each at exit) straightforward. You can insert a holdco later if and when there is real value, cheaply and with clearance. No need to carry the extra company admin yet.

**Because you are 50/50, the shareholders' agreement is not optional.** Equal ownership means either of you can block the other, so the agreement must include a clear **deadlock mechanism**. The usual tools, pick with the solicitor:
- An agreed escalation, the two of you sit down within a set time, then a neutral mediator.
- A pre agreed buy out clause as the last resort, so a permanent split does not freeze or kill the company.
- Reserved matters, a list of big decisions (taking on debt, selling the company, issuing shares) that need both of you to agree.

**Founder vesting** over four years for both of you, so an early departure does not leave one of you carrying the company while the other keeps half. At 50/50 this protects you both equally.

**Pay yourselves** as in doc 26, two founder version: claim the **Employment Allowance** (you qualify with two on payroll), take **£12,570 salary each** with employer NI absorbed, **dividends per your own share class** to suit each of your tax positions, and an **employer pension contribution each** to cut corporation tax. That is the efficient core, live from day one.

**The holdco waits.** Bootstrapped, you do not need Lekhio Ltd on top yet. Revisit it when there is a second revenue product, a real valuation, or an exit conversation. Inserting it then is cheap because the value transferred is still modest, and an accountant runs the HMRC clearance. Keep the Lekhio Ltd name in your pocket for that day.

**Total to set this up:** about £100 to incorporate Lekhio Ltd, plus a startup solicitor's fixed fee for the shareholders' agreement and vesting (shop around, it is money well spent at 50/50), plus your accountant to set the alphabet shares and payroll. Modest, and all of it allowable against the company.

---

## The caveat

This is the standard, legal founder structure. I am not a solicitor or a chartered accountant. The share class setup, the shareholders' agreement, the vesting, the holdco insertion, and the SEIS position all need a startup accountant and a startup solicitor to draft and confirm for your exact situation. The cost is small and these are decisions that are expensive to unwind later. Use this doc to walk in knowing exactly what to ask for.

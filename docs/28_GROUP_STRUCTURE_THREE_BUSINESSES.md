# 28: Structuring Three Businesses with Different Ownership

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



> The real situation. An ecom business owned 50/50 with your partner, Sovereign Standard online coaching owned 100% by you, and Lekhio owned 50/50 with your partner. The question is how to put a holding company structure over all of it. 2026/27 rules. I am laying out what a startup accountant would recommend. The existing businesses already have value, so this is a reorganisation, not a greenfield setup, and that part genuinely needs an accountant to execute. Confirm before you move anything.

---

## The headline, read this first

You have **two different ownership patterns**, so you cannot use one shared holding company for everything.

- Ecom: you 50%, partner 50%.
- Lekhio: you 50%, partner 50%.
- Sovereign Standard: **you 100%**.

If you drop all three under a single holdco that you and your partner own 50/50, you would be **giving your partner half of Sovereign Standard**, which is entirely yours today. That is the trap to avoid. The structure has to keep the jointly owned businesses together and Sovereign Standard separate and yours.

---

## The structure that fits

Use **personal holding companies**, one each, plus keep the two shared businesses grouped. It looks like this.

```
   YOU                                   PARTNER
    |                                        |
 Your Holdco Ltd                       Partner Holdco Ltd
 (Lekhio Ltd?)                          |
    |    \            \                      /
    |     \            50%  Ecom Ltd  50%   /
    |      \            \                  /
    |       \            50% Lekhio Ltd 50%
    |
    |  100%
 Sovereign Standard Ltd
```

What this gives you:
- **Sovereign Standard stays 100% yours**, sitting under your holdco alone. Your partner has no claim to it. Correct and clean.
- **Ecom and Lekhio are jointly owned**, with each personal holdco holding 50%.
- **Every business pays its profits up to the holdcos as tax free dividends**, because dividends between UK companies are generally exempt. Your holdco pools your share of all three. Your partner's holdco pools their share of the two shared ones.
- **Each of you controls your own tax independently.** Your holdco can hold the pooled profit untaxed and reinvest it, or you draw it personally and pay dividend tax when you choose. Your partner does the same separately. With three businesses and different stakes, this independence is not a nice to have, it is the only sane way to run it.
- **Asset protection.** A problem in one trade does not reach across into the others or into your personal holdco's assets.

---

## The bonus worth real money: group relief between Ecom and Lekhio

Here is a live tax saving, if it applies to you. Lekhio will probably **lose money early**, because you are spending on building it. The ecom business is presumably **profitable**. If the two are in the same **75% group**, the losses in one can be set against the profits in the other, which **cuts the tax bill on the profitable one now**. That is cash in hand, not a someday benefit.

The catch is the 75% test. If your two personal holdcos each own 50% of Ecom and 50% of Lekhio directly, **neither holdco owns 75% of either**, so that simple version does **not** give you group relief between them.

To unlock it, you put the two shared businesses under a **single shared holding company** that owns 100% of each, and you and your partner own that shared holdco 50/50:

```
   YOU 50%            PARTNER 50%
        \              /
      Shared Group Holdco Ltd
        /            \
   Ecom Ltd 100%   Lekhio Ltd 100%   <- now a 75% group, loss relief works
```

Now Ecom and Lekhio are both 100% owned by the shared holdco, they form a group, and **Lekhio's early losses can shelter Ecom's profits**. Sovereign Standard stays out of this, under you alone.

So there is a genuine fork:

- **Simplicity and independence:** two personal holdcos each holding 50% of the shared trades. Clean, but no group loss relief between Ecom and Lekhio.
- **Tax optimisation now:** a shared group holdco over Ecom and Lekhio so losses offset profits, with your personal holdco and Sovereign sitting separately. More companies, more admin, but a real tax saving while Lekhio runs at a loss.

If the ecom business makes decent profit and Lekhio will burn cash for a year or two, the group relief route can save more than the extra admin costs. That is the thing to price up with the accountant.

---

## The combined shape most accountants would land on

A common, clean answer that does both:

```
 YOU                                      PARTNER
  |                                          |
 Your Personal Holdco (Lekhio Ltd)   Partner Personal Holdco
  |        \                                /
  |         50%                          50%
  |          \                            /
  |        Shared Group Holdco Ltd  (owns the two joint trades)
  |            /                \
  |        Ecom Ltd          Lekhio Ltd
  |
  | 100%
 Sovereign Standard Ltd
```

- Your personal holdco owns 100% of Sovereign Standard and your 50% of the shared group holdco.
- The shared group holdco owns Ecom and Lekhio outright, so they get group relief and a clean joint exit.
- Both of you keep independent personal tax control at the top.

It is more boxes, but each box earns its place: Sovereign stays yours, the joint trades are grouped for relief and exit, and your tax is yours.

---

## The big practical warning: this is a reorganisation, not a fresh setup

Lekhio is new and worth little, so putting a holdco over it is cheap. **Ecom and Sovereign Standard already exist and already have value.** Moving existing companies under a holding company is a **share for share exchange**, and it has real tax edges:

- Done correctly with **HMRC advance clearance**, it can be tax neutral, no capital gains charge on the reshuffle.
- Done carelessly, it can trigger a **capital gains** charge and **stamp duty**. You do not want that.
- The value you transfer matters. The cheaper time to do it is **sooner, while values are lower**.

This is precisely the kind of move you do **with** an accountant and the clearance in place, not on your own. The good news is it is routine work for a startup or owner managed business accountant, often a fixed fee plus the clearance.

Also check, with them:
- **Business Asset Disposal Relief** position on each business if a sale is ever likely, since holding through a company changes your personal 18% relief, as covered in doc 27.
- **VAT and trading**, each company keeps its own trade, its own VAT position, no change there.
- Whether Sovereign Standard even needs to sit under a holdco at all. If it is purely yours and you are happy to hold it directly, you can leave it as a standalone company you own personally, and only group the two joint businesses. Fewer boxes. Valid choice.

---

## What "Lekhio Ltd" should be

You have been using **Lekhio Ltd** as the holding name. With Sovereign Standard being 100% yours, the natural fit is for **Lekhio Ltd to be your personal holding company**, the one that holds Sovereign and your stake in the joint businesses. The shared joint businesses then need a **separate, neutrally named holdco** that you and your partner own together, so the shared structure does not sit inside a company named after one of you. Decide this with your partner. It matters for clean ownership and for how it looks if you ever sell.

---

## The recommendation, in order

1. **Do not** put Sovereign Standard under any company your partner co owns. Keep it yours.
2. **Lekhio now:** incorporate it as in doc 27, 50/50 alphabet shares, agreement and vesting. Cheap and greenfield.
3. **Decide the group question:** if the ecom business is profitable and Lekhio will run at a loss, seriously consider a **shared group holdco over Ecom and Lekhio** to use loss relief. If you would rather keep it simple, two personal holdcos each holding 50% of the trades, accepting no group relief.
4. **Sequence the reorganisation with an accountant** and HMRC clearance, sooner rather than later while values are low, so the reshuffle is tax neutral.
5. **Name it right:** Lekhio Ltd as your personal holdco, a separate neutral holdco for the joint businesses.

---

## Two things that decide the exact build

1. **Is the ecom business currently profitable, and will Lekhio run at a loss for a while?** If yes to both, the group relief route is likely worth it.
2. **Does Lekhio Ltd already exist as a registered company, or is it still just a name?** It changes whether we are forming or repurposing it.

---

## What if you just 50/50 everything, including Sovereign Standard?

You asked the obvious simplifying question. If all three businesses were owned 50/50, then **one shared holding company, Lekhio Ltd, could cleanly sit over all three**. It is the simplest possible structure, and on the tax side it is genuinely tidy:

```
   YOU 50%              PARTNER 50%
        \                /
       Lekhio Ltd (one holdco for everything)
        /      |        \
   Ecom Ltd  Lekhio Ltd  Sovereign Standard Ltd
```

- One group, so **loss relief works across all three**. Lekhio's early losses can shelter both Ecom's and Sovereign's profits. Maximum relief.
- Tax free dividends up to the single holdco.
- One clean group for an exit, one set of group admin instead of several holdcos.
- Total alignment, you and your partner own everything equally, simplest to run and to understand.

So as a structure, it is the cleanest of the lot. **The catch is not tax, it is ownership.**

### The real cost: you would be giving away half of Sovereign Standard

Sovereign Standard is **100% yours today**. The two shared businesses are already equal, so "50/50 everything" does not change those. The only thing it actually changes is **Sovereign**, and the change is one direction: **you hand your partner half of a business that is entirely yours.**

Be clear eyed about what that means:
- It is a **genuine transfer of wealth**. If Sovereign is worth, say, £80k, you are giving your partner £40k of value. Unless they are putting something equal and asymmetric in the other way, this is a one way gift, not a swap. There is nothing on your partner's side balancing it, because their solo contribution is not in the picture.
- **You lose sole control of Sovereign.** Dividends, decisions, and any future sale of it all become joint. The business you built alone becomes a thing you need agreement on.
- **There can be a tax charge on the transfer itself.** Giving shares to a business partner is treated as a disposal at market value, which can trigger **capital gains tax for you now**. There is a relief, **gift holdover relief**, that can defer the gain on trading company shares if you both elect, so it may be done with no immediate tax. But the gift of value is still real even when the tax is deferred.

### My honest steer

Do not 50/50 Sovereign Standard for the sake of a tidy diagram. The structure convenience is small. The thing you would give up, half ownership and full control of a business that is 100% yours, is large and hard to reverse. Only do it if you genuinely want your partner to be a true equal owner of Sovereign as a deliberate partnership decision, not as a side effect of wanting one neat holdco.

You can get **almost all** of the simplicity without giving anything away:
- Put a **single shared holdco over the two businesses you already share** (Ecom and Lekhio). That gives you the clean group, the loss relief between the two of them, and the joint exit.
- Keep **Sovereign Standard separate, 100% yours**, either held directly or under your own personal holdco.

That is two structures instead of one, but it costs little and keeps Sovereign yours. The only thing the all in 50/50 adds on top is letting Lekhio's losses also shelter Sovereign's profit, which is a modest saving and nowhere near worth gifting half the business.

### Since Lekhio Ltd is still just a name

Good, that keeps it flexible. The clean naming then is:
- **Lekhio Ltd**, formed fresh as the **shared holdco over Ecom and Lekhio**, owned 50/50, if you and your partner both want the joint group named that. Or keep Satluj as **your** personal holdco and give the joint group a neutral name. Either works since nothing is registered yet. Decide it together.

---

## The final setup, and how efficient it actually is

This is the one to build. Clean, and you give up nothing.

```
   YOU 50% (A shares)        PARTNER 50% (B shares)
            \                   /
            Lekhio Ltd            SEPARATELY:
             /            \                  YOU 100%
        Ecom Ltd       Lekhio Ltd              |
                                        Sovereign Standard Ltd
```

- **Lekhio Ltd** is a fresh shared holding company, owned by you and your partner 50/50, issued as **alphabet shares** (A to you, B to them) so you can each draw different dividends from the pooled group profit and optimise your own tax.
- It owns **100%** of Ecom and Lekhio, so the two are a proper group.
- **Sovereign Standard stays 100% yours**, completely outside, run on its own as in doc 26. Untouched, uncomplicated, yours.
- Own Satluj **personally**, not through personal holdcos, for now. Bootstrapped and 50/50, that keeps your **18% Business Asset Disposal Relief** on a future sale simple and direct. You can always add personal holdcos later.

### How efficient is it? Lever by lever.

**1. Group loss relief, the big live saving.** Because Satluj owns 100% of both, Lekhio's early losses can be surrendered against Ecom's profit in the same year. Worked example with illustrative numbers:

- Ecom profit: £60,000. Lekhio loss while you build it: £40,000.
- **Without the group:** Ecom pays 19% on £60,000 = **£11,400**. Lekhio's loss just sits and carries forward, no help now.
- **With the group:** surrender £40,000 of Lekhio's loss against Ecom, so Ecom is taxed on £20,000 = **£3,800**.
- **Saved this year: £7,600.** Real cash, simply because the two sit under one holdco. That repeats every year Lekhio runs at a loss.

**2. Tax free movement of profit.** Dividends from Ecom and Lekhio flow up to Satluj with **no tax**. Profit can pool at the top and fund whichever business needs it, without leaking tax on the way.

**3. Tax free exit, potentially.** If you ever sell Ecom or Lekhio, the **Substantial Shareholding Exemption** can let Satluj sell that subsidiary with **no corporation tax on the gain**, since it has held more than 10% for over a year. For a real exit this is the single biggest number in the whole structure.

**4. Independent, efficient extraction.** Each of you takes a **£12,570 salary** (employer NI wiped by the Employment Allowance, which the group qualifies for), **dividends on your own share class** at 10.75% in the basic band, and an **employer pension contribution** each, untaxed, cutting corporation tax. Full mechanics in doc 26.

**5. Sovereign runs in parallel, fully yours.** It has its own salary, dividend, and pension levers, and you control it alone. Nothing about the group touches it.

### The honest limits, so the efficiency is not oversold

- **You do not get extra personal allowances by having more companies.** Your £12,570 personal allowance, your £500 dividend allowance, and your basic rate band are **once per person**, across all your income from Satluj and Sovereign combined. More companies give you control over timing and pooling, not multiplied tax free bands.
- **Associated companies share the 19% band.** The £50,000 small profits limit is **divided across companies under common control**. With several associated companies the slice taxed at the full 19% before marginal relief shrinks. Your accountant works out exactly how Ecom, Lekhio, and Sovereign count here. It slightly trims, not removes, the benefit.
- **The one thing this setup gives up versus 50/50 everything** is that Lekhio's losses cannot shelter Sovereign's profit, because Sovereign sits outside the group. That is a small price, and it is exactly the price of keeping Sovereign yours, which is the right trade.

### The verdict

For a bootstrapped pair with one shared pair of businesses and one solo business, **this is about as efficient as it gets without giving anything away**. You capture the loss relief, the tax free pooling, the clean exit, and full independent extraction, while Sovereign stays entirely yours. The only structure that is marginally more efficient on paper is the full 50/50, and it buys that tiny extra by making you hand over half of Sovereign, which is not worth it. This setup is the sweet spot.

### One reminder on sequencing

Lekhio is new, so it goes straight under Satluj for nothing. **Ecom already exists and has value**, so moving it under Satluj is a share for share reorganisation that needs **HMRC clearance** to be tax neutral. Routine for an accountant, do it sooner while the value is lower. Sovereign needs none of this, it just stays where it is.

---

## The caveat

This is the standard structure for owners with mixed stakes across several companies, and the levers are all legal and routine. I am not a chartered accountant or a solicitor. Reorganising existing, valuable businesses under holding companies must be done by a qualified accountant with HMRC clearance, and the share arrangements need a solicitor. The cost is modest against the tax at stake. Use this to walk in knowing exactly the structure you want and why.

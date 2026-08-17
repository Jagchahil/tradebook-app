# 120: The bank connection. Why there is no provider, and why it is PARKED. 17 August 2026.

> ## 🅿️ PARKED IS NOT ABANDONED, AND THE SITE MUST NOT SAY IT IS.
>
> **Jag, 17 August 2026: "it's the first thing we look into as soon as we have rev. for now we need
> to park this but not forget about it."**
>
> PARKED means nobody spends a session on this, nobody pays anybody, nobody reopens the TrueLayer
> application, and nobody builds against a bank's own developer API. It does NOT mean the feed is
> dead. The product ships **three routes and two of them are live**: send it as you go, import a
> statement CSV, and later connect an account. **A connection is PLANNED.**
>
> **The one line reason it is parked rather than dropped: the cost is the LICENCE, not the software.**
> `lib/bankfeed.ts` and `lib/banksync.ts` are already written and already tested. Every route to the
> key costs money, so this is a post revenue feature, and pre revenue is the wrong time to buy one.

**This document supersedes `docs/100_BANK_FEED_GOLIVE_2026-07-11.md` as the state of play.** Doc 100
is kept, with a banner, because its engineering description and its regulatory theory are still
correct and still the thing to read on the day this is unparked. What is dead in it is the plan.

**The provider research is `~/Projects/tradesman/PROVIDER-SEARCH-J11.md` and it is not repeated here.**
It carries the shortlist, the Enable Banking go or no go question, the RAISP route and the market
pricing. Read it before doing anything, and do not redo the search.

---

## 1. THE FACT, AND THE REASON NO DOCUMENT IN THIS ESTATE HAD EVER RECORDED

**TrueLayer declined production authorisation on 30 July 2026 because THEY ARE SCALING AND ARE NOT
TAKING ON SMALL BUSINESSES.** Recorded 17 August 2026, from Jag.

Six files recorded the decline (`FABLE_BRIEF.md`, `docs/71`, the Play Store rationale,
`SPEC-invoicing-2026-08-07.md`, `HANDOVER-2026-08-07.md`, `docs/118`) and not one of them recorded a
reason. All of them said only "declined" or "turned us down". The reason is the single most useful
fact about this whole problem, and it was sitting in a person's head for six weeks.

The rest of the picture, so nobody has to reassemble it:

- **ICO registration is DONE.** 15 July 2026, Lekhio Ltd, reference **ZC198977**. It was never the
  final blocker, and doc 100 and doc 107 both still read as though it were.
- **GoCardless Bank Account Data closed to new signups on 2 July 2026.** Verified by us at the time.
  One public comparison table still lists it as free and self serve. That table is stale.
- **Finexer quoted £650 a month before a single connection**, on 30 July 2026.
- So there has been **no open banking provider since 30 July 2026**, and no date on which there
  might be one.

---

## 2. WHAT THE REASON RULES OUT, AND WHAT IT RULES IN

**It was a COMMERCIAL decision about account size, not a compliance one.** That is not a consolation,
it is a piece of routing information, and it saves a session.

**RULED OUT.** There is nothing wrong with our licensing theory, our ICO position, our use case
wording or our CRN. Nobody should reopen the TrueLayer application, nobody should "fix" the
submission, and nobody should conclude from the refusal that Lekhio's model is defective. The
regulatory theory in `docs/100` section on permissions still holds: an aggregator holds the FCA
account information permission and Lekhio operates as its agent, so **Lekhio does not need its own
FCA authorisation for a read only feed** on that model.

**RULED IN.** Providers whose model does not gate on account size, which is exactly what a free or
self serve tier IS. Anything sales led is the same door TrueLayer just closed, wearing a price tag.

---

## 3. WHY IT CANNOT SIMPLY BE BUILT, AND WHY THE OBVIOUS WORKAROUND IS ALSO CLOSED

Jag asked the sharp version of this: we are only shadowing the customer's own banking app, so why can
we not build it for nothing? The answer is worth writing down once, because it is the question every
future session will ask.

**The barrier is not regulatory difficulty and it is not the cost of code. It is access control at
the bank, and it is cryptographic rather than contractual.** To call a UK bank's open banking API you
must be on the **Open Banking Directory**, and to be on the Directory you must be an FCA registered
third party provider. The Directory issues the transport and signing certificates and **the bank
checks that certificate on every single call**. No registration, no certificate. No certificate, and
the bank refuses at the TLS handshake. There is no configuration, no key, no endpoint and no amount
of code that routes around it.

**Our software is not the missing piece and has not been for months.** `lib/bankfeed.ts` holds the
client, the token refresh, the retry policy and the mapper. `lib/banksync.ts` holds the resumable
daily sync. The routes, the encryption and the approval gate all exist and are tested. What is
missing is the key to the door, and only the FCA issues that key, either to us directly through a
RAISP registration or to an aggregator who then lends it to us as their agent.

**And the tempting loophole is shut in writing.** Monzo and Starling both publish developer APIs, so
it looks as though a customer on Monzo could authorise us directly. **Monzo's own documentation
forbids it in terms: the Developer API is not suitable for building public applications, and you may
only connect to your own account or a small set of users you explicitly allow.** That is a personal
tinkering API, not a route to a product. Do not build against it, and do not let a future session
believe it has found something everybody else missed.

---

## 4. THE TRIGGER, AND WHY IT IS A NUMBER RATHER THAN A FEELING

"When we have revenue" is exactly the kind of prose claim this corpus keeps being burned by. It has
no owner, no threshold and nothing that can ever go red.

**So the trigger is a subscriber count that Jag sets, and the product already counts its own paying
base.** `countActiveSubscribers()` in `lib/supabase.ts` is called by `aiCapsFor` on every AI decision,
so the figure is live and free to read. A trigger expressed as a subscriber count is one the SYSTEM
can notice, rather than a note a human has to remember.

**🔴 JAG TO SET THE FIGURE. It is not set at the time of writing, and this document should not invent
one.** When it is set, write it here and give it somewhere to be checked.

---

## 5. THE ONE FREE THING THAT MAY BE DONE WHILE PARKED, AND ONLY THIS

**Check the FCA Financial Services Register for Enable Banking.** Ten minutes, no money, no
commitment, no session. Three comparison pages call them the self serve free tier option after the
GoCardless closure, their own site says they are registered with the Finnish FIN-FSA, and **an EEA
registration is not automatically a UK one**, because passporting into the UK ended with Brexit.

If they hold a UK permission and their free "Restricted Production" tier really is self serve, the
integration can be proved end to end against code we already own, for nothing. If they do not, the
shortlist collapses and the answer is the RAISP route in `PROVIDER-SEARCH-J11.md` section 3.

**Record the answer in `PROVIDER-SEARCH-J11.md` either way**, because the next person will ask the
same question and the value of a checked negative is the same as a checked positive.

---

## 6. WHAT THIS DOES NOT CHANGE: THE COPY DECISION STANDS

**Parking the feature does not license the site to sell it.** Jag decided the frame on 17 August and
it is better than the three options he was offered:

> "it's more about freedom and control. an employee, which Lekhio is, does not take away freedom,
> instead it should work with the owner as an employee. if they want to connect their bank to let
> transactions reach Lekhio auto they can, if they want to only upload receipts they want in their
> tax return again up to them, and if they want to use the bank statement which we already have they
> can use that."

**THREE ROUTES, THE OWNER'S CHOICE. Two of the three ship today. A connection is PLANNED.**

The rules that follow from that, and they are enforced by test rather than remembered:

1. The site **may** say a bank connection is planned.
2. It **may not** say **BUILT** and it **may not** say **SWITCHING ON SOON**, because there is no
   provider and no date.
3. It **may not** put a **SOON** chip next to a competitor's tick on `/compare`, because that
   asserts an imminence nothing supports. `'planned'` is a separate mark from `'soon'` in
   `lib/features.ts` and renders as a plain grey label, never a chip. HMRC filing keeps `'soon'`,
   because production recognition genuinely is in flight.
4. **The three routes get equal billing wherever the capture story is told**, on `/product`, on
   `/compare`, on `/` and in `/llms.txt`. **Statement import stops reading as the fallback it is
   called in `docs/118` and reads as one of three first class doors, because that is what it is.**
5. **No page may name an open banking provider until one is engaged**, `/privacy` above all.

---

## 7. WHAT WAS LIVE AND FALSE, AND WHAT WAS DONE ABOUT IT

The in app product was honest throughout and its `BANK_FEED_OFFERED` architecture is exemplary: three
independent flag reads, a build failing sweep in `test/frontdoor.test.mjs` over every signed in page
plus both message channels, and both branches of six empty states pinned by test. **A paying customer
inside the product was promised nothing.** None of it was touched.

**The PUBLIC site was the problem, and it had been for six weeks.** `NEXT_PUBLIC_BANK_FEED_LIVE`
gates the public site, and when it was off the site did not go quiet. It advertised.

| Where | What it said | Now |
|---|---|---|
| `/product` | a card headed "Connect your bank" badged **BUILT · SWITCHING ON SOON** | one of three route cards, badged **PLANNED**, out of the "soon" grid |
| `/compare` | a **SOON** chip in our column against a competitor's tick | a plain grey **Planned** label, and a new row for statement import |
| `/llms.txt` | "waiting on ICO registration and the provider's production access", **behind no flag at all** | the three routes, the true ICO position with ZC198977, and the decline said plainly |
| `/privacy` | **TrueLayer named as an FCA regulated provider that we use** | no provider named, and a commitment to name one before anybody can connect |
| `/app/setup` | "The bank feed is on its way" | the statement route first, and a connection named as planned with no date |

**🔴 AND `test/llmstxt.test.mjs:108` PINNED THE FALSE SENTENCE IN PLACE.** It asserted
`/bank feed is built but not yet switched on/`, so a guard written to stop us overclaiming was the
thing keeping the overclaim alive, and it would have failed anybody who tried to tell the truth.

**That is the lesson worth carrying out of this session, and it is not about banks.** An assertion
tied to a SENTENCE outlives the fact the sentence was about, and then defends it. The replacements
pin the SHAPE: the copy may word the absence however it likes, as long as it declares the connection
unavailable, never claims it is nearly on, and never blames a regulator who cleared us five weeks
earlier. `test/sabotage-b1banktruth.mjs` holds all of it, 23 sabotages, 5 controls.

---

## 8. THE POSITIONING, BECAUSE IT IS TRUER THAN ANY APOLOGY

Jag, 17 August 2026:

> "Our whole business is to empower small business. Lekhio supports small businesses and empowers
> them in the same way bigger businesses are. For us small business are not just a number. Every
> business is a client, we treat them all equally and provide opportunities."

**An open banking provider refused us for being small, and Lekhio exists to serve exactly the
businesses that provider will not serve.**

That is a better account of why the three routes exist than any apology for a missing feed, and it is
the plainest statement of what the three routes ARE: not a fallback and a goal, but a man choosing
how his own books arrive. `docs/104` section 12 already argues the control doctrine from the other
end and reached the same place. It belongs in doc 104 whether or not it ever belongs in the copy.

---

## 9. WHERE THE RECORD NOW STANDS

- **`docs/100`** carries a superseded banner and is kept. Its engineering description and its
  regulatory theory are still right and are what to read on the day this is unparked. Its go live
  plan is dead: gate 1 (ICO) is done, gate 2 (TrueLayer production) was refused.
- **`docs/104`** blamed "the July pricing verdict" for the missing provider in two places. Corrected
  in place, with the date, because a pricing verdict and a refusal are different facts and only one
  of them happened.
- **`docs/107`** said the ICO fee "unblocks the bank feed" and listed the registration as gating it.
  Corrected in place, with the date. ICO is done and it unblocked nothing.
- **`docs/118`** calls the statement import "the fallback". It is one of three routes and the site no
  longer calls it a fallback. Left as written, because it is a dated snapshot of 10 August rather
  than a live instruction, but do not carry the word forward.
- **`~/Projects/tradesman/PROVIDER-SEARCH-J11.md`** is the research and the shortlist. This document
  is the decision.

## 10. WHAT A FUTURE SESSION MAY AND MAY NOT DO

**MAY:** check the FCA register for Enable Banking and write the answer down. Read this document and
doc 100 on the day Jag says unpark.

**MAY NOT, without Jag saying so:** pay anybody, reopen the TrueLayer application, build against a
bank's own developer API, start a RAISP application, or soften the copy rules in section 6 on the
grounds that a provider is "probably close". There is no provider. There is no date. The two routes
that work are not a stopgap, they are how Lekhio works.

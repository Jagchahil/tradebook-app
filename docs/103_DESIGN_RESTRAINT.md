# 103. Design restraint. How much goes on a screen.

> **This doc is the tactical child of one line, and the line lives in doc 104: "One less button at a time. Until only one is left. Approve."** 104 is the principle and the reason. 103 is how it is applied to a screen. Read 104 first.

**Date:** 11 July 2026
**Status:** the rule. Applies to the app, the site, and every WhatsApp reply.
**Read with:** `07_BRAND.md` (colour, type, motion, voice). This is the part 07 was missing.

---

## Why this exists

Doc 07 tells you what Lekhio looks like: the blue, the paper, the river, the calm motion, the plain voice. It says nothing at all about **how much** goes on a screen. So the most important design decision in the product, what to leave out, has been made on instinct, differently, every time.

It shows. Before this pass:

- **39 screens**, two of which nothing linked to.
- **The Money tab had 14 destinations.** It was not a screen about money. It was a directory of calculators.
- The home screen had a badge system for a game nobody is playing.

None of that was stupid. Every one of those things was added by someone trying to be helpful. That is exactly how it happens.

---

## The user

He is up a ladder. One hand is on the rail. It is ten past four, it is going dark, and he wants to know if he can afford the van.

He is not exploring. He is not discovering features. **He has one question and he wants the answer.**

Every screen in this app is competing with the thing he would rather be doing, which is anything else.

---

## The rule

> **A feature is not free because it is small.**

Every button is a decision you have handed to the user. Every row is a thing he has to read and reject before he gets to the thing he came for. Ten helpful additions make an unhelpful product, and nobody is ever blamed for adding just one.

So the bar is not "is this useful?" Almost anything is useful to someone. The bar is:

> **Does this earn its place on the screen a man opens when he wants to know what he owes?**

If it is useful but not urgent, it goes one tap away. That is not a demotion. That is what "away" is for.

---

## The four tests

Apply these to anything on a screen. If it fails one, it goes.

**1. The once test.** How often does he use it? He checks his student loan plan **once in his life**. He works out how to pay himself **once a year**. Those are real features and they were sitting permanently on his most important screen. Anything he touches less than monthly belongs behind a Tools row.

**2. The empty test.** What does this say when there is nothing to say? A row that reads "nothing to check" most of the time teaches him to stop looking at it, and then he misses the one week it matters. **Things to check now only appears when there is something to check.** If a thing has no useful empty state, it should not be permanently present.

**3. The honesty test.** Does this button do something? *"File straight to HMRC, SOON"* opened an alert saying the feature does not exist. That is not a button, it is an advert for our own roadmap, and it was taking up a row on the tax screen. **It comes back the day it works.**

**4. The alignment test.** Does this reward him for the thing we are trying to remove? The streak card said *"7 day logging streak! Two more days to unlock Tidy Books."* Connect a bank feed and a logging streak measures nothing, because we have taken over the logging. **We were congratulating him for doing the work we exist to do for him.** And "Tidy Books" was an achievement we invented, that unlocks nothing, from a system that does not exist.

---

## The best button is no button

The strongest version of this rule is not "make the button smaller". It is **do the thing and tell him**.

Three examples that are already live:

**Learning.** When he sets a category on a shop nobody has heard of, we could ask "shall I remember this?" We do not, because nobody has ever meant *"file this as materials, but forget it immediately"*. The category he just chose IS the lesson. We take it, say so plainly, and put an undo in Settings.

**Duplicates.** When the bank line and the receipt for the same purchase both arrive, we could ask "are these the same?" For a confident match we do not. We merge, keep the bank's figures and the receipt's evidence, and tell him what we did.

**Confirmation.** "YES" over WhatsApp now files the day's books. A man on a ladder is not opening an app to tick boxes.

The question is never *"where should this button go?"* It is **"why is he being asked at all?"**

There is a hard limit on this, and it is the approval gate. **Money, tax filing, and anything sent to another human being ALWAYS ask.** Doing something for him is only kindness when it is reversible and it is his. See `CLAUDE.md`.

---

## What was cut on 11 July, as worked examples

| Cut | Test it failed |
|---|---|
| Money tab: 14 destinations to 6 | **once**, nine calculators he uses once a year were parked on his daily screen |
| "File straight to HMRC, SOON" | **honesty**, a button whose only function was an alert saying it does not work |
| The streak card | **alignment**, rewarded him for manual work the product exists to abolish |
| Wrapped, permanent to seasonal | **honesty**, it claimed to be "ready" in August, which is neither true nor interesting |
| `achievements.tsx`, `year-summary.tsx` | dead. **Zero** links pointed at them. 340 lines shipping in the binary |
| "Shall I remember this shop?" | **no button**, the category he chose was already the answer |

---

## What is still to cut, and the one thing blocking it

**The per-card Confirm buttons on the feed.** Once the daily digest is proven on a real phone, "YES" over WhatsApp files the day's books and the feed stops needing to be a queue of things to tick. That is the biggest single source of clutter left.

It is not cut yet **on purpose**. It is the one change that could leave a man unable to confirm anything if the digest is not working, and "I could not approve my own books" is a worse outcome than a busy screen. **Prove the digest, then cut.**

---

## The standing question

Whenever anything is added, in a review, in a doc, in a pull request:

> **What did we take out to make room for it?**

If the answer is nothing, the screen just got worse, and everybody involved felt helpful while it happened.

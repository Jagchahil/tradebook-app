This is item 6, the web app: Lekhio without the app stores. It's the last of the six-item build
order and the only one still open.

Start by opening the Lekhio Command artifact. It's the single living source of truth for where
everything stands — the build board, what's shipped, what's gated and why, and the reasoning behind
the decisions you'll otherwise be tempted to relitigate. Read the 27 July evening callout first,
then the six cards flipped to Built that day. After that, CLAUDE.md in the repo root. The repo is at
~/Projects/tradesman/tradebook.

THE TASK

Build the logged-in customer web app. Today Lekhio has a marketing site and a /team console for me,
but no logged-in surface for a customer at all. Everything a customer does happens over WhatsApp.

That's a real gap, and it's also a decision I want preserved: the web app must not become the
product. WhatsApp stays the front door. The web app is where a customer goes when they want to SEE
rather than TELL — the full picture, and the things that don't fit in a message. It also means
Lekhio never needs an App Store or Play Store listing, which is what the item's name is about.

THREE THINGS ARE ALREADY BUILT AND WAITING FOR EXACTLY THIS

The most important thing to know before you start. Three pieces are engine complete, tested and
deployed, but have no customer-facing surface, because as of today there's nowhere to put one.
Mounting them is the fastest way to make the web app worth having on day one.

1. The announcements banner. The gate, the API, the banner component and the /team/announcements
   desk are all live, and the desk renders real selection output. What's missing is the customer
   side mount. Commit 7e110403.

2. The weekly summary. /api/weekly returns the customer's week, rendered from one shared function
   that also feeds the WhatsApp reply, so the two surfaces can't drift. Nothing displays it.
   Commit 0eb4b41e.

3. The use of home election. lib/elections.ts, the allowance_elections table and /api/elections are
   live. Today a customer can only claim it by texting "claim use of home, 30 hours a month". There
   is no picker. Commit d186be2c.

Read those three modules before designing anything. The data shapes they already return should drive
the screens, not the other way round.

WHAT I CARE ABOUT, IN ORDER

1. It must work on a cheap Android phone on a bad connection, because that's what my customers have.
   Server render wherever you can. No heavy client bundles. Check it under 3G throttling.
2. A tradesman must understand every screen without being taught. If a screen needs a tooltip to
   explain itself, the screen is wrong.
3. It must never contradict WhatsApp. Same numbers, same wording, same rounding. Where a figure
   appears in both places it comes from one shared function, the way the weekly summary already
   does. If you find yourself writing a second formatter, stop and reuse the first.
4. Auth has to be as low friction as the rest of Lekhio. A password is a real barrier for this
   audience. Look at what the existing session and auth code supports before deciding anything. A
   magic link sent over WhatsApp, to a number we've already verified, is worth taking seriously.

THE BAR FOR DONE

- node test/run-all.mjs green. It currently sits at 103 suites, 6,210 assertions. It should go up.
- npx tsc --noEmit clean.
- Every new route tested for auth and tenancy, not just the happy path. A customer must never be
  able to read another customer's figures by changing an id in a URL. Write the test that tries it.
- Verified on the deployed site, not only locally. The domain is lekhio.app, never lekhio.com.

HOW I WANT YOU TO WORK

- Commit and push after each self-contained chunk. main auto-deploys to Vercel. Don't build the
  whole thing and push once at the end.
- Tell me what you found, not just what you did. If something is broken or wrong, say so plainly and
  early, including when it's something I built or asked for.
- Never call something done while it still has a loose end. Say which part is finished and which
  isn't.
- Don't guess at external state. If you need a template status, a live environment variable, or what
  a page actually renders, go and look. Anything you infer rather than observe, label as inferred.
- House style: British English, plain language, no em dashes anywhere, no marketing voice inside the
  product. Comments explain why, not what. Read a few existing files to calibrate before writing.
- Update the Lekhio Command artifact as you go, to the same standard it's held to now: flip a card
  only when it's genuinely done, keep the reasoning on the card, and sync the progress header.

TWO THINGS THAT ARE NOT YOURS TO DECIDE

- Don't change the copy about HMRC. test/mtdclaims.test.mjs guards it and will fail the build. We
  may never say HMRC approved, accredited, certified or endorsed, and we may never imply we file on
  the customer's behalf. We prepare, the customer approves.
- Don't drop any *_TEMPLATES_APPROVED gate. Those gates hold back real paid WhatsApp messages to
  real customers. Some sit in front of templates Meta has already approved, and that's deliberate —
  flipping one is my call, not a tidy-up.

WHERE TO START

Don't start by writing pages. Start with the Lekhio Command artifact, then CLAUDE.md, then the three
modules above and the existing auth and session code. Then come back to me with the shape you
propose: which screens, in what order, how auth works, and what you'd build first. I'd rather spend
one message agreeing the shape than have you build the wrong three screens well.

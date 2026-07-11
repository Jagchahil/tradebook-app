# 36: File Your Own Tax Return, build spec across the three surfaces

> How we build the feature into the website, the app, and WhatsApp. Content comes from doc 35. This is the implementation plan. Build order is website first (it is also the lead magnet), then app, then the WhatsApp walkthrough.

---

## Shared design rules

- One source of truth: all copy comes from doc 35, so a tax-year update happens in one place.
- Trust framing throughout: free, plain English, we guide and you stay in control, not affiliated with HMRC, link out to the official service for the actual submission.
- Every surface ends on the same soft bridge to Lekhio: the form takes 15 minutes when your records are already done, which is what Lekhio does all year.
- The two routes: a single question, "do you turn over more than £50,000?", branches the reader to the normal annual return or the new MTD quarterly path.

---

## Surface 1. The website page (build first)

### Route and placement
- New page at **/file-your-tax-return** in tradebook-web.
- Add it to the top nav dropdown and footer as **Free guide, File your own tax return**. It is a lead magnet, so it should be easy to find and shareable.

### Page structure (top to bottom)
1. **Hero.** Headline "File your own tax return. Stop paying for a 15-minute job." Subhead from doc 35. One primary button, "Start the free walkthrough", and a secondary "Get reminders on WhatsApp".
2. **The £50k branch.** A simple two-button toggle, "Under £50k turnover" and "£50k or more". CSS radio toggle, no JS framework needed, same pattern as the MTD explainer already on the homepage. Shows the right path below.
3. **The step by step.** The seven universal steps from doc 35 as an animated vertical stepper. Each step is an expandable panel (details and summary) so the page is scannable, with a progress line that fills as you scroll. Reuse the homepage timeline styling for consistency.
4. **Pick your trade.** A grid of the 12 trade chips. Selecting one reveals that trade's expense list from doc 35 Part 3, layered on top of the universal expenses. CSS only, each chip a radio that shows its panel.
5. **Deadlines strip.** The key dates as a clean horizontal band, 5 Oct, 31 Oct, 31 Jan, with the £100 penalty warning.
6. **The MTD heads-up.** A short, calm explainer that the once-a-year return is being replaced for higher earners from April 2026, with the thresholds. Positions Lekhio as the way to stay ready.
7. **Soft CTA.** "Keep your records with Lekhio and the 15 minutes really is 15 minutes. First month free." Button to /start.
8. **Caveats footer.** The compliance lines from doc 35 Part 4.

### Build notes
- Server component, CSS-driven interactivity only (radio toggles, details and summary, keyframe progress), matching the existing site so it stays fast and needs no client JS.
- SEO matters here, this page should rank. Title and meta around "how to file your own tax return sole trader", "self assessment for tradespeople", per-trade variants. Add an FAQ block with schema for the common questions.
- This page can be public and indexed even before the app and WhatsApp parts ship, so it starts pulling traffic early. It is the lead magnet.

---

## Surface 2. The app section

### Route and entry
- New screen **app/file-return.tsx**, reached from a card on the dashboard, "File your tax return, step by step", and from Settings.

### Flow
1. **Trade selector.** The 12 trades as tappable cards. Tap yours to personalise the walkthrough. Store the choice so it is remembered.
2. **Animated walkthrough.** The seven steps as full-width animated cards, one per screen, swipe or tap to advance, with a progress bar. Use the existing RN Motion kit (FadeIn, PressableScale, GrowBar) so it matches the app vibe, no new dependencies.
3. **Per-step animation.** Each step has a simple illustrative animation, for example a receipt flowing into a box, a form filling, the calculator totting up, the green submitted tick. Keep them light, Animated and SVG, not heavy video.
4. **Your trade's expenses.** A step that shows the personalised expense checklist for the chosen trade, ticking off what they can claim.
5. **End card.** "Set a reminder so you never miss the deadline" which sets up the WhatsApp reminder (surface 3), and a link to the full HMRC service.

### Build notes
- Reuse theme.ts and Motion.tsx. Register the screen in app/_layout.tsx.
- Content pulled from a shared constants file mirroring doc 35, so app and site never drift.

---

## Surface 3. WhatsApp reminder and walkthrough

This is the highest-trust surface, it lands in their pocket at the right moment.

### Reminders
- A user can opt in to **tax deadline reminders**. Schedule nudges ahead of the key dates, 5 Oct registration, 31 Oct, and a countdown into January (for example 31 Jan minus 30, 14, 7, and 1 days).
- These are proactive messages, so they need **approved WhatsApp message templates** (see doc 21). Budget the per-message cost.
- Reuse the existing reminders cron and the events and reminder_prefs tables. Add a reminder kind, "tax_deadline", seeded from the user's tax year.

### The guided walkthrough
- Trigger: the reminder offers "Reply WALKTHROUGH and I will take you through it step by step", or the user texts something like "how do I do my tax return".
- The bot then sends the seven steps **one message at a time**, each with a short instruction and an image (a screenshot or simple diagram of that step), waiting for the user to reply "next" before sending the following step. Conversational, not a wall of text, which fits the voice-first, on-site user.
- It personalises by trade: if we know their trade (from the app or by asking once), the expenses step lists their trade's claimable costs.
- It never submits anything. It guides them to the official HMRC service for the actual submission, in line with our compliance rule that the person files and approves.

### Build notes
- Add a flow handler, for example handleTaxGuide, routed in app/api/whatsapp/route.ts alongside the existing schedule and help handlers, gated so it does not collide with receipt or expense parsing.
- Step content and images come from the shared constants and an images folder. Images are static assets, captioned, no dashes.
- All sends go through lib/whatsapp.ts, all wording from the shared content, never inline.

---

## What I need to build it

- A green light to start with **the website page**, which I can build into tradebook-web now since the content is ready. It ships independently and starts ranking.
- For the **WhatsApp walkthrough**, the step images. I can generate clean diagram-style images for each step, or we screenshot the real HMRC flow once you are filing, your call. Diagrams are safer to publish.
- The app section and the WhatsApp flow follow, reusing the same content so nothing drifts.

### Suggested build order
1. Website page at /file-your-tax-return (lead magnet, public, ranks).
2. Shared content constants file (so all three surfaces match).
3. App file-return screen with animations.
4. WhatsApp reminders, then the step-by-step walkthrough with images.

Say go and I will start on the website page.

// Launch feature flags.
//
// WHY THIS EXISTS. lekhio.app is LIVE, public, indexed, and takes real card
// payments. So the copy is a sales promise, not a mockup: we must not advertise a
// capability before it exists. On top of that, HMRC is reviewing our production
// recognition right now, and on that application we answered that we do NOT
// advertise as "HMRC recognised" (their terms only allow the phrase once granted).
// A reviewer who visits the site and sees it claimed would find a direct
// contradiction of our own application.
//
// But we also do not want a frantic copy rewrite on the day approval lands. So the
// LAUNCH COPY IS WRITTEN NOW and gated here. The day HMRC says yes, or the app
// hits the stores, flip the env var and redeploy: the whole site becomes the launch
// site in about ninety seconds, with nothing forgotten.
//
// Set in Vercel (Production). Anything other than the exact string "true" is off,
// so a typo can never accidentally publish a claim that is not yet true.
//
//   NEXT_PUBLIC_HMRC_FILING_LIVE = true    (the day production recognition is granted)
//   NEXT_PUBLIC_APP_STORE_LIVE   = true    (the day the app is live in BOTH stores)
//   NEXT_PUBLIC_BANK_FEED_LIVE   = true    (the day TrueLayer production is switched on)
//
// NEXT_PUBLIC_ so client components (the /start wizard) can read them too.

function on(v: string | undefined): boolean {
  return v === 'true';
}

// Direct filing to HMRC from Lekhio. FALSE until production recognition is granted.
// While false: the site says recognition is in progress and never uses the phrase
// "HMRC recognised" as a present fact.
export function hmrcFilingLive(): boolean {
  return on(process.env.NEXT_PUBLIC_HMRC_FILING_LIVE);
}

// The mobile app is downloadable. FALSE until it is actually in the stores.
// While false: the store badges read "soon" and are not links to anywhere.
export function appStoreLive(): boolean {
  return on(process.env.NEXT_PUBLIC_APP_STORE_LIVE);
}

// Bank feeds (TrueLayer). FALSE until ICO registration and TrueLayer production
// are both done (docs/100). While false: shown as "built, switching on soon".
export function bankFeedLive(): boolean {
  return on(process.env.NEXT_PUBLIC_BANK_FEED_LIVE);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 PROACTIVE ALERTS. THE THING THAT REACHES HIM WHEN HE IS NOT LOOKING AT THE APP.
//
// FALSE until at least one channel can actually deliver one, and on 2 August 2026 not one could.
// The reminder cron bails because T_NUDGE is unapproved and gated on REMINDER_TEMPLATES_APPROVED;
// Rakha's own alerts route whatsapp_template and push, gated on AGENT_TEMPLATES_APPROVED and on a
// mobile app that is not in the stores; and the only email that exists, sendWeeklyReadyEmail,
// carries no figures and no dates by design.
//
// ⚠️ WHY THIS MATTERS MORE THAN THE OTHER FLAGS ON THIS PAGE. /resources was printing "Lekhio
// reminds you well before each, so you never do" directly above a table of NINE penalty dates,
// and /product and /file-your-tax-return both promised "on your dashboard and by email". A man
// reads that and stops keeping his own calendar. The failure mode is an automatic £100 penalty
// and it is HIS money, not ours. That is a worse class of lie than advertising a feature early.
//
// ⚠️ IT IS ITS OWN NEXT_PUBLIC FLAG RATHER THAN A READ OF THE TEMPLATE GATES, on purpose. The
// template gates are server only, so a client component importing this file would silently get
// false while the server got true, and the same sentence would render two ways. One flag, one
// meaning, readable everywhere. Set it in the same breath as the template gates.
//
//   NEXT_PUBLIC_REMINDERS_LIVE = true   (the day a deadline alert can actually be delivered)
// ═══════════════════════════════════════════════════════════════════════════════════════════
export function remindersLive(): boolean {
  return on(process.env.NEXT_PUBLIC_REMINDERS_LIVE);
}

// The line under the key dates table on /resources. The "after" wording is the promise we intend
// to keep; the "before" wording says the true and still useful thing, which is that the work for
// each date is already done when the date arrives.
export function keyDatesPromise(): string {
  return remindersLive()
    ? 'Miss one and HMRC charges a penalty. Lekhio reminds you well before each, so you never do.'
    : 'Miss one and HMRC charges a penalty. Your figures for every one of these are kept ready inside your Lekhio, so when the date comes the work is already done.';
}

// How Rakha reaches him. The dashboard half was always true. The email half never was.
export function alertChannels(): string {
  return remindersLive()
    ? 'on your dashboard and by email'
    : 'on your dashboard, the next time you open it';
}

// The FAQ answer to "What if I miss the deadline?".
export function missedDeadlineAnswer(): string {
  const base = 'You get an automatic £100 penalty the day after, even if you owe no tax. After 3 months daily penalties start, and interest is charged on tax paid late.';
  return remindersLive()
    ? `${base} That is exactly why we remind you well before it, on your dashboard and by email.`
    : `${base} That is exactly why your Lekhio keeps the date and the figure in front of you all year, so the deadline is never news.`;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ THE CLAUSE ON AN EMAIL CAPTURE THAT PROMISES DEADLINE NUDGES. EMPTY UNTIL ONE CAN BE SENT.
//
// Three lead captures offered "MTD deadline reminders", "your tax reminders" and "the odd
// genuinely useful nudge about deadlines" IN EXCHANGE FOR AN EMAIL ADDRESS, and the confirm email
// repeated it in its own subject line. None of it was sent: lib/nurture.ts ships dark behind
// NURTURE_ENABLED, and even switched on it is TWO emails, neither of them keyed to a deadline.
//
// 🔴 THAT IS A WORSE PLACE FOR THIS LIE THAN A FEATURE PAGE. It is the inducement. He hands over
// his address because of the sentence, so the sentence is the consideration for the exchange.
//
// ⚠️ WHAT IS ACTUALLY DELIVERED STAYS PROMISED, because it is real: app/api/lead confirms the
// address and sendLeadResultEmail fires on confirm with the result he asked for.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export function nudgeClause(): string {
  return remindersLive() ? ' Then the odd genuinely useful nudge about deadlines and money you could claim back.' : '';
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE NINTH, TENTH, ELEVENTH AND TWELFTH REMINDER PROMISES, ALL IN ONE COMPONENT, AND ONE OF
// THEM IS THE CONSENT RECORD ITSELF.
//
// Found on 4 August by asking a much better question than "which pages promise a reminder": which
// files does the sweep that asks that question never open. The answer was components/, and
// components/LeadCapture.tsx renders on ELEVEN public tool pages, twelve after /how-mtd-works
// joined the family the same morning.
//
// Four separate promises lived inside it, hard typed:
//
//   the heading      "Want your result emailed, plus your MTD reminders?"
//   the sub          "...the odd genuinely useful nudge about your tax deadlines..."
//   the done state   "We will send your result and keep you right on the deadlines that matter."
//   THE TICK BOX     "...plus occasional tax deadline reminders and money saving tips..."
//
// ⚠️ THE 3 AUGUST FIX WENT INTO THE PAGES AND NOT INTO THE COMPONENT UNDER THEM. Four call sites
// pass a sub built with nudgeClause() above, which is right and which is why they looked fixed.
// The other seven ship the defaults, and the tick box and the done state ship on all twelve
// whatever the page passes, because they are module constants nobody can override.
//
// 🔴 AND THE TICK BOX IS THE WORST OF THE FOUR, BY SOME DISTANCE. Its exact words are POSTed to
// /api/lead as consent_text and stored, on purpose, as the provable record of what the customer
// agreed to. So the one artefact whose entire job is to be an accurate record of a promise was
// recording a promise no channel in this product can keep. remindersLive() is false and the cron
// refuses to send.
//
// Both wordings sit side by side here, the same discipline as everything else in this file, so
// the day the flag flips all twelve pages upgrade themselves and nobody has to remember.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
export function leadHeading(): string {
  return remindersLive()
    ? 'Want your result emailed, plus your deadline reminders?'
    : 'Want your result emailed?';
}

export function leadSub(): string {
  return remindersLive()
    ? 'Pop your email in and we will send this result, then the odd genuinely useful nudge about your tax deadlines and money you could claim back. No spam. Unsubscribe any time.'
    : 'Pop your email in and we will send this result over. No spam, and you can unsubscribe any time.';
}

// 🔴 THE WORDS HE ACTUALLY AGREES TO, WHICH ARE STORED AND WHICH HAVE TO BE TRUE ON THE DAY HE
// AGREES TO THEM. Not "what we might do later", and not softened: if it says reminders, reminders
// have to be a thing this product does when he ticks it.
export function leadConsentText(): string {
  return remindersLive()
    ? 'Yes, email me my result plus occasional tax deadline reminders and money saving tips from Lekhio. I can unsubscribe at any time.'
    : 'Yes, email me my result plus occasional money saving tips from Lekhio. I can unsubscribe at any time.';
}

// ⚠️ THE THANK YOU IS A PROMISE TOO. "We will keep you right on the deadlines that matter" is made
// AFTER he has handed the address over, which is the point at which a promise costs him something.
export function leadDoneLine(): string {
  return remindersLive()
    ? 'We will send your result and keep you right on the deadlines that matter. Check your inbox.'
    : 'We will send your result over. Check your inbox.';
}

// 🔴 THE ROW IN THE "REPLACES A WHOLE SHELF OF SUBSCRIPTIONS" TABLE. THE EIGHTH ONE.
//
// The table lists what a man pays for today and prints "All of it, in Lekhio, for £12.99 a month"
// underneath, so every label in it is a claim about what Lekhio does. One row read "Diary and
// reminders". The jobs diary is real and shipped. The reminders are not, and the whole point of
// remindersLive() is that we do not sell one until it can be delivered.
//
// ⚠️ IT SURVIVED THE FIRST SWEEP BECAUSE IT IS NOT A SENTENCE. The 2 August pass searched every
// public page for the reminder CLAIM as prose (/we|lekhio\s+will\s+remind/ and friends) and found
// seven. A table cell of three words matches none of that, and the promise it makes is made by the
// heading above it rather than by its own grammar. Sweeps look for the shape of a lie, and a lie
// can change shape.
export function diaryRowLabel(): string {
  return remindersLive() ? 'Diary and reminders' : 'Jobs diary';
}

// The store links, only ever rendered when appStoreLive() is true.
export const APP_STORE_URL = process.env.NEXT_PUBLIC_APP_STORE_URL ?? '';
export const PLAY_STORE_URL = process.env.NEXT_PUBLIC_PLAY_STORE_URL ?? '';

// ⚠️ THE NUMBER A CUSTOMER MESSAGES TO CONNECT HIS PHONE. Digits only, international, no plus and
// no spaces, for example 447700900123.
//
// NOT NEXT_PUBLIC, unlike everything above it, and that is deliberate rather than an oversight. The
// only thing that reads this is /app/connect, which is server rendered, so the value never needs to
// reach a bundle. It is not a secret, it is printed on the page, but a value with no reason to be
// in the JavaScript a customer downloads should not be in it.
//
// 🔴 WHATSAPP_PHONE_NUMBER_ID IS NOT THIS. That is Meta's internal id for the sending number and it
// is not dialable, not messageable, and produces a wa.me link that opens WhatsApp on a blank screen
// with no error anywhere. They are easy to confuse because we already have one of them in the
// environment and it looks like a long number.
//
// Empty means the feature draws nothing at all. lib/walink.ts's waMeLink returns null rather than a
// half built link, and /app/connect explains rather than showing a dead button.
export const WHATSAPP_NUMBER = (process.env.WHATSAPP_NUMBER ?? '').replace(/[^0-9]/g, '');

// --- copy that changes with the flags ---------------------------------------
// Kept here, next to the flags, so the "before" and "after" wording live side by
// side and cannot drift apart.

// The FAQ answer to "Does Lekhio file my tax for me?".
export function filingFaqAnswer(): string {
  return hmrcFilingLive()
    ? 'Lekhio prepares your figures and gets them ready, then files them straight to HMRC through an HMRC recognised route once you approve. You always review and approve first, and you stay responsible for your tax.'
    : 'Lekhio prepares your figures and gets them ready. You always review and approve before anything is sent, and you stay responsible for your tax. Filing straight from Lekhio is coming: our HMRC recognition is in progress. Until it lands, Lekhio does all the preparation so filing takes minutes.';
}

// The badge on the "File straight to HMRC" card.
export function filingBadge(): { text: string; live: boolean } {
  return hmrcFilingLive()
    ? { text: 'LIVE', live: true }
    : { text: 'HMRC RECOGNITION IN PROGRESS', live: false };
}

// The badge on the "Connect your bank" card.
export function bankBadge(): { text: string; live: boolean } {
  return bankFeedLive()
    ? { text: 'LIVE', live: true }
    : { text: 'BUILT · SWITCHING ON SOON', live: false };
}

// How the comparison table should mark a capability: true (have it), 'soon', or false.
export type CompareMark = boolean | 'soon';
export function filingMark(): CompareMark {
  return hmrcFilingLive() ? true : 'soon';
}
export function bankMark(): CompareMark {
  return bankFeedLive() ? true : 'soon';
}

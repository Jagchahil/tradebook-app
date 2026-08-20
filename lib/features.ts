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
//   NEXT_PUBLIC_BANK_FEED_LIVE   = true    (the day a bank connection is genuinely live)
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

// ═══════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE BANK CONNECTION IS PLANNED. IT IS NOT BUILT AND IT IS NOT SOON. 17 AUGUST 2026.
//
// This flag used to read "FALSE until ICO registration and TrueLayer production are both done
// (docs/100)", and the copy behind it said BUILT and SWITCHING ON SOON. By 17 August every part of
// that sentence was false, and had been for six weeks:
//
//   * ICO registration COMPLETED on 15 July 2026, reference ZC198977. It was never the blocker.
//   * TrueLayer DECLINED production authorisation on 30 July 2026. The reason is the useful part
//     and no document in this estate had ever recorded it: THEY ARE SCALING AND ARE NOT TAKING ON
//     SMALL BUSINESSES. That is a commercial decision about account size, not a compliance one, so
//     there is nothing in our licensing theory, our ICO position or our use case wording to fix.
//   * GoCardless Bank Account Data closed to new signups on 2 July 2026. Finexer wanted £650 a
//     month before a single connection (lib/trialnudge.ts).
//
// No provider means no date, and SOON is a date. docs/120 records the decline, the reason, and the
// decision that came out of it. docs/100 is the old go live runbook and carries a superseded banner.
//
// 🅿️ AND IT IS PARKED, WHICH IS NOT THE SAME AS ABANDONED. Jag, 17 August: "it's the first thing we
// look into as soon as we have rev. for now we need to park this but not forget about it." The cost
// is the LICENCE, not the software: lib/bankfeed.ts and lib/banksync.ts are written and tested, and
// a UK bank checks an Open Banking Directory certificate on every call, which only an FCA
// registration gets you. So it is a POST REVENUE feature and the trigger is a subscriber number Jag
// sets, not a feeling. Nobody pays anybody, reopens the application or builds against a bank's own
// developer API until he says so. docs/120 section 10 is the list of what a session may and may not
// do; PROVIDER-SEARCH-J11.md is the research and must not be redone.
//
// 🔴 AND THE HONEST FRAME IS BETTER THAN THE APOLOGY, WHICH IS WHY THE COPY IS NOT AN EXCUSE.
// Jag, 17 August: an employee does not take the owner's freedom away, it works with him. So money
// reaches Lekhio by whichever of three routes the owner picks. Send it as you go, import a
// statement, or one day connect an account. Two of the three work from the day he signs up. The
// third is PLANNED, said plainly, with no button and no date, and it is one of three rather than
// the missing centrepiece the other two stand in for.
//
// ⚠️ DO NOT CONFUSE THIS WITH BANK_FEED_OFFERED. That one gates the product and it is right:
// three independent reads, a sweep in test/frontdoor.test.mjs, both branches of six empty states
// pinned. This one gates the PUBLIC site, and until today an off switch here made the site
// advertise rather than go quiet.
// ═══════════════════════════════════════════════════════════════════════════════════════
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

// The lead line over the two helper cards on /product. "One of these speaks first" is only true
// when a proactive channel can actually deliver an alert. Until then Rakha speaks on the
// dashboard, the next time he opens it, so the honest contrast today is software you have to
// learn against an employee that already knows the job. Both wordings side by side, the same
// discipline as everything else in this file, so the page upgrades itself the day the flag flips.
export function helpersLead(): string {
  return remindersLive()
    ? 'Software waits to be opened. One of these speaks first.'
    : 'Software waits for you to learn it. These two already know the job.';
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
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 ONE CAPTURE, TWO DIFFERENT PROMISES, AND UNTIL TODAY IT ONLY KNEW HOW TO MAKE ONE.
// RUN 0 of the customer week, 11 August 2026.
//
// LeadCapture renders on twelve public pages. Eleven of them are tools that have just worked
// something out for him, so "Email me my result" is the plain truth: there IS a result, he can see
// it above the box, and the email carries it.
//
// The twelfth is /free-mtd-filing, where free MTD prep is not built yet and the page says so
// honestly. There is no result. He is joining a list. And the button still said "Email me my
// result", the tick box still said "email me my result", the thank you still said "We will send
// your result over", and the confirm email still opened "You asked us to send you your result".
//
// Four promises of a thing that does not exist, on the one page whose entire job is to be straight
// with him about what does not exist yet. Nobody wrote any of them for that page. They arrived
// with the component, which is how this kind of lie always arrives.
//
// ⚠️ THE PAGE ALREADY OVERRODE ITS HEADING AND SUB, WHICH IS WHY THIS WAS INVISIBLE. The two lines
// somebody thinks to change were changed and read correctly ("Be first when free MTD prep opens").
// The four that live inside the component were not, because nobody opens a shared component to
// check what it promises on a page they are not looking at.
//
// So the promise is now a property of the SOURCE, decided in one place, and every sentence that
// says "result" reads it. A thirteenth page joins as one line here, or it inherits the honest
// default. test/leadpromise.test.mjs holds the waitlist source to never saying the word.
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** What we are actually promising this person in return for the address. */
export type LeadPromise =
  // A tool has already worked something out for him and the email carries it.
  | 'result'
  // Nothing has been worked out. He is asking to be told when something opens.
  | 'waitlist';

// The sources that are a list rather than a tool. Named, not inferred, because guessing from the
// page name is how the next honest page quietly starts promising a result again.
const WAITLIST_SOURCES = new Set(['free-mtd-filing']);

export function leadPromise(source: string): LeadPromise {
  return WAITLIST_SOURCES.has(source) ? 'waitlist' : 'result';
}

// The word on the button he presses. It is the last thing he reads before handing over an address.
export function leadButton(promise: LeadPromise = 'result'): string {
  return promise === 'waitlist' ? 'Tell me when it opens' : 'Email me my result';
}

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
export function leadConsentText(promise: LeadPromise = 'result'): string {
  // ⚠️ THE WAITLIST WORDING PROMISES NOTHING WE CANNOT DO. It is stored as the proof of what he
  // agreed to, so it has to be true on the day he ticks it. It said "free filing" until 20 August
  // 2026 (B89), and filing is HMRC's to open, not ours. Preparation is ours, so that is the offer.
  if (promise === 'waitlist') {
    return 'Yes, tell me when free MTD prep opens, plus occasional money saving tips from Lekhio. I can unsubscribe at any time.';
  }
  return remindersLive()
    ? 'Yes, email me my result plus occasional tax deadline reminders and money saving tips from Lekhio. I can unsubscribe at any time.'
    : 'Yes, email me my result plus occasional money saving tips from Lekhio. I can unsubscribe at any time.';
}

// ⚠️ THE THANK YOU IS A PROMISE TOO. "We will keep you right on the deadlines that matter" is made
// AFTER he has handed the address over, which is the point at which a promise costs him something.
export function leadDoneLine(promise: LeadPromise = 'result'): string {
  if (promise === 'waitlist') {
    return 'We will email you the moment free MTD prep opens. Check your inbox to confirm your address.';
  }
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
    // 🔴 "is coming" WAS A DELIVERY DATE IN A SOFT COAT (B89, 20 August 2026). Production access
    // has been asked for and not granted, and HMRC closed the market window for new 2026-27
    // quarterly update products on 10 August. Naming the absence is the only honest shape.
    : 'Lekhio prepares your figures and gets them ready. You always review and approve before anything is sent, and you stay responsible for your tax. Sending straight from Lekhio to HMRC is not switched on: that needs HMRC production access, which we have asked for and have not been granted. Until it is, Lekhio does all the preparation and you send the update yourself, which takes minutes.';
}

// The badge on the "File straight to HMRC" card.
export function filingBadge(): { text: string; live: boolean } {
  return hmrcFilingLive()
    ? { text: 'LIVE', live: true }
    : { text: 'HMRC RECOGNITION IN PROGRESS', live: false };
}

// The credibility chip on /compare and /how-mtd-works. One wording for both pages, so they
// cannot drift apart, and it flips with the filing flag like everything else in this file.
export function filingChip(): string {
  return hmrcFilingLive()
    ? 'Files straight to HMRC, live'
    : 'HMRC recognition in progress';
}

// The badge on the "Connect your bank" route card on /product.
//
// ⚠️ IT MAY NOT SAY BUILT AND IT MAY NOT SAY SOON. It said "BUILT · SWITCHING ON SOON" until 17
// August 2026, on a live indexed page that takes card payments, for a capability whose provider had
// refused us six weeks earlier. BUILT was arguable, the integration code is written. SOON was not:
// soon is a claim about a date, and there is no provider to give us one. PLANNED is the whole of
// what is true, and it is enough, because the two routes beside it work today.
export function bankBadge(): { text: string; live: boolean } {
  return bankFeedLive()
    ? { text: 'LIVE', live: true }
    : { text: 'PLANNED', live: false };
}

// The body of the "Connect your bank" route card. Both wordings side by side, the same discipline
// as everything else in this file, so the day a provider is engaged the page upgrades itself.
//
// ⚠️ THE OFF WORDING NAMES THE ABSENCE RATHER THAN HINTING AT IT. "Coming soon" invites him to
// wait. Saying we have no provider and will not put a date on it tells him to pick one of the two
// routes that work, which is the only useful thing we can say to him today.
export function bankRouteLine(): string {
  return bankFeedLive()
    ? 'Connect an account read only and money in and out logs itself. Lekhio can see it and can never move it.'
    : 'Money in and out logging itself, read only. We have no open banking provider engaged, so we will not put a date on it. The two routes beside this one are not a stopgap, they are how Lekhio works.';
}

// How the comparison table should mark a capability: true (have it), 'soon', 'planned', or false.
//
// 🔴 'soon' AND 'planned' ARE NOT THE SAME MARK, AND THE DIFFERENCE IS THE WHOLE FIX.
//
// 'soon' asserts a date. In a table where the competitor column shows a tick, a SOON chip tells a
// reader the gap closes shortly, and we may only say that about something genuinely in flight. HMRC
// production recognition IS in flight, so filing is 'soon' and stays 'soon'.
//
// A bank connection is not in flight. Its provider declined on 30 July 2026 and no other has been
// engaged, so it is 'planned', and app/compare renders that as a plain grey label in the same style
// as "Costs extra", never as a chip, so it cannot read as a near tick.
export type CompareMark = boolean | 'soon' | 'planned';
export function filingMark(): CompareMark {
  return hmrcFilingLive() ? true : 'soon';
}
export function bankMark(): CompareMark {
  return bankFeedLive() ? true : 'planned';
}

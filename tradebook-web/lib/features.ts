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

// The store links, only ever rendered when appStoreLive() is true.
export const APP_STORE_URL = process.env.NEXT_PUBLIC_APP_STORE_URL ?? '';
export const PLAY_STORE_URL = process.env.NEXT_PUBLIC_PLAY_STORE_URL ?? '';

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

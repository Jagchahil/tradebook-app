// lib/region.ts. WHERE LEKHIO WORKS, WRITTEN ONCE, AND EVERY WORD OF THE GATE DERIVED FROM IT.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 B33. JAG'S INSTRUCTION, 18 AUGUST 2026: "there is no point doing Scotland yet, we are
// focusing on it too much and it is quite irrelevant for us."
//
// This is the only file that knows the answer. The signup asks a man to confirm he is inside the
// region before it asks him anything else, and a man who cannot confirm it is not put through a
// fifteen minute interview that would end in a number worked out at somebody else's rates.
//
// 🔴 IT IS ONE CONSTANT AND THE COPY IS DERIVED, WHICH IS THE WHOLE POINT OF THE FILE.
//
// The region name appears in the tick, in the heading, in the body, in the way back and in the
// tag stored beside the address. Written out five times it is five things to remember on the day
// the answer changes, and this repo has been bitten by exactly that shape more than once: a
// figure typed twice is two figures, and a promise typed twice is two promises. Change REGION and
// the whole gate changes with it, including the tag on new waitlist rows.
//
// ⚠️ AND THE CHOICE OF REGION IS NOT COSMETIC. "The UK" would keep every Scottish signup and
// retire NOTHING, because Scotland is inside the United Kingdom and Scottish income tax rates are
// the thing we are deferring. Only a region that names England, Wales or Northern Ireland
// actually defers it. The item argues this at length and Jag signs the words.
//
// ⚠️ WHAT THIS DOES NOT DO. Nothing shipped is ripped out. lib/scotland.ts, SCOTLAND_LINE,
// test/scotland.test.mjs and B30's alert caveat all stay exactly as they are, because they
// protect the customers we ALREADY have, `+callum` above all. This gate is about who comes next.
//
// ⚠️ AND IT NEVER DETECTS. lib/scotland.ts's rule is that we do not know where a man lives and
// must not claim to. This file does not break that rule, it is the other side of it: we do not
// detect, WE ASK, once, in his own words, and he answers.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// 🔴 THE ONE WORD. Change this and the gate changes.
export const REGION = 'England, Wales or Northern Ireland';

// The same list read as a set of rates rather than as a choice, so "England, Wales or Northern
// Ireland rates" reads as "England, Wales and Northern Ireland rates". Derived, never a second
// constant: a region with no " or " in it, such as "the UK", passes straight through unchanged.
export const REGION_AND = REGION.replace(' or ', ' and ');

// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE TAG STORED BESIDE A WAITLIST ADDRESS, so the list is segmentable and a future region can be
// mailed without mailing everybody. Derived from REGION, which means old rows keep the tag of the
// gate that actually turned them away rather than being rewritten by a later change of mind. That
// is correct: a man turned away by this gate was turned away by THIS region.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const REGION_TAG = REGION.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// --- the tick -------------------------------------------------------------------------------
// One line, in the first person, because he is the one saying it. Where he LIVES rather than
// where he works: income tax rates follow residence, which is the whole reason for asking.
export function regionConfirmLabel(): string {
  return `I live in ${REGION}.`;
}

// The reason, in one clause, said beside the tick rather than left for him to guess. A tick with
// no reason attached is a tick people learn to click without reading.
export function regionConfirmWhy(): string {
  return `Lekhio works your tax out at ${REGION_AND} rates.`;
}

// --- the blocked screen ---------------------------------------------------------------------
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 IT PROMISES NOTHING. NO TIMELINE, NO NAMED COUNTRY, NO CLAIM ABOUT WHAT WILL BE SUPPORTED.
//
// The obvious wording is "more regions are coming soon, leave your email and we will tell you
// when". Every part of that is a promise: "soon" is a date, "coming" is a commitment, and naming
// the country he is probably in tells him we are working on his. We do not know any of it. This
// product's own doctrine is that a sentence which is the inducement for handing over an address
// is the consideration for the exchange, so it has to be true on the day he reads it.
//
// What IS true: Lekhio works tax out at these rates and no others; putting him through the setup
// would end in a wrong number; and if that ever changes we can write to him. "If", not "when".
//
// ⚠️ AND IT DOES NOT NAME SCOTLAND, OR ANYWHERE ELSE. We did not ask where he is and we do not
// know. Naming a country would be a guess printed back at him as though it were a fact.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export function regionBlockedHeading(): string {
  return 'Lekhio is not set up for where you are.';
}

export function regionBlockedBody(): string {
  return `Lekhio works your tax out at ${REGION_AND} rates, and it does not do any others. Putting you through the setup would only end in a number that is wrong for you.`;
}

// The ask. One address, one use, said before he types it.
export function regionWaitlistAsk(): string {
  return 'Leave your email and we will write to you if that changes. It will not be used for anything else.';
}

export function regionWaitlistButton(): string {
  return 'Add me to the list';
}

// ⚠️ THE THANK YOU IS A PROMISE TOO, and this one is kept by doing nothing at all, which is the
// cheapest promise in the world to keep. No confirmation email is sent on this path deliberately:
// the waitlist welcome tells a man he will be "one of the first we let in" and that his "first 7
// days are free", and neither may be said to somebody we have just turned away.
export function regionWaitlistDone(): string {
  return 'We have got your address. You will not hear from us unless that changes.';
}

// ⚠️ THE WAY OUT, AND IT IS THE ONLY REASON THE TICK IS NOT A DEAD END. A required tick with no
// way to say "I cannot tick that" is a disabled button and no explanation, which fails doc 103's
// honesty test: a screen that stops a man without telling him why is worse than the screen it
// replaced. One plain link, in his own words, and it is the whole of the second control.
export function regionElsewhereLink(): string {
  return `I do not live in ${REGION}`;
}

// ⚠️ THE WAY BACK, AND IT IS NOT OPTIONAL. Pressing Continue without the tick is what brings a man
// here, so the man who simply had not read the box yet arrives here too. Without this line he is
// told he is in the wrong country and given no way to say otherwise, which is a worse screen than
// the one we are replacing. It costs one sentence.
export function regionBackLine(): string {
  return `If you do live in ${REGION}, go back and tick the box.`;
}

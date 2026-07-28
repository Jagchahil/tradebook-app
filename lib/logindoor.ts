// lib/logindoor.ts. ONE LOGIN, TWO CHANNELS. What a man types to get in.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHY THERE IS ONE FIELD AND NOT TWO.
//
// The app signs in by phone. The web could have signed in by email. Jag's objection to that was
// not technical and it was right: "why is it two different forms of login? It can look a little
// bit dodgy as well." A man whose books and tax we hold notices when the front door changes shape
// between two screens with the same name over them.
//
// So there is ONE screen, on the web and in the app, with ONE field: his email or his mobile. He
// types whichever he has to hand, we send a 6 digit code to it, he types the code. It is not two
// forms of login. It is one form of login with two ways for the code to arrive, and this file is
// the part that works out which he gave us.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ A CODE, NOT A MAGIC LINK, AND THAT IS A DELIBERATE REFUSAL.
//
// A link is one tap, so it looks kinder. Two things kill it. It opens wherever his email is read,
// which is often not the device he started on, so a man who asks on his laptop gets signed in on
// his phone. And corporate and consumer mail providers FETCH every link in an email to check it is
// safe, which burns a single use token before he has seen the message. A code crosses devices, and
// a scanner reading it consumes nothing.
//
// ⚠️ EMAIL IS THE DEFAULT DOOR AND SMS IS THE FALLBACK, WHICH IS A COST DECISION.
//
// Every SMS is roughly 7p to 10p through Twilio (doc 77). Email through Resend, whose domain is
// already verified because it sends the invoices, is effectively free. Neither is more "real" than
// the other: both prove he holds something we already have on file. But only one of them is worth
// attacking for money, which is why every control in lib/supabase.ts is aimed at the SMS door.
//
// PURE. No I/O, no clock. The lookups and the sends live in lib/supabase.ts per CLAUDE.md rule 2,
// and test/logindoor.test.mjs attacks this file directly.

import crypto from 'node:crypto';

export type Channel = 'sms' | 'email';

export interface Identifier {
  channel: Channel;
  // The normalised value. E.164 for a mobile, lowercased and trimmed for an address. This is the
  // ONLY form that is ever looked up, sent to, or hashed, so two spellings of the same contact can
  // never become two accounts.
  value: string;
}

// ⚠️ UK MOBILES ONLY, AND THE SHAPE IS THE FIRST ABUSE CONTROL.
//
// A UK mobile is +447 followed by nine digits. Nothing else. An earlier draft of this accepted
// "+44 then nine or ten digits, any prefix", which quietly let landlines, service numbers and
// plain junk through to a paid SMS gateway. Every number that reaches Twilio costs money whether
// or not it was ever going to receive anything, so the cheapest possible place to refuse one is
// before it leaves us.
//
// Twilio's geo permissions are also locked to the United Kingdom alone (verified in the console on
// 27 July 2026), so this is the second of two locks and neither is load bearing on its own.
const UK_MOBILE = /^\+447\d{9}$/;

// Deliberately conservative. It is not trying to be RFC 5322, it is trying to refuse anything that
// is obviously not an address before we hand it to a mail provider and put our sending reputation
// behind it. One @, something either side, a dot in the domain, no whitespace, no angle brackets.
const EMAIL = /^[^\s@<>]+@[^\s@<>.]+(\.[^\s@<>.]+)+$/;

// UK input to E.164. MUST stay byte identical to normalizeUkPhone in lib/supabase.ts and toUkE164
// in the phone app. Three functions, one number: this one signs him in, that one matches his
// WhatsApp messages to an account, the third stores it. If they ever disagree, a man's receipts
// land on one account and his session on another, and both look like they are working.
export function toUkE164(input: string): string {
  let d = (input || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('44')) d = d.slice(2);
  d = d.replace(/^0+/, '');
  if (!d) return '';
  return `+44${d}`;
}

export function isUkMobile(value: string): boolean {
  return UK_MOBILE.test(value);
}

export function normaliseEmail(input: string): string {
  return (input || '').trim().toLowerCase();
}

export function isEmail(value: string): boolean {
  return value.length <= 254 && EMAIL.test(value);
}

// THE ONE FIELD, READ. Returns what he gave us, normalised, or null when it is neither.
//
// The decision is made on the presence of an "@" and nothing cleverer. A man who types his address
// with a space in it, or his number with an @ in it, gets told plainly rather than having us guess
// and send a code somewhere he did not name.
export function readIdentifier(raw: string): Identifier | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;

  if (trimmed.includes('@')) {
    const email = normaliseEmail(trimmed);
    return isEmail(email) ? { channel: 'email', value: email } : null;
  }

  // Anything without an @ is treated as a phone number, including gibberish, which then fails the
  // shape check below and is refused before it costs anything.
  const phone = toUkE164(trimmed);
  return isUkMobile(phone) ? { channel: 'sms', value: phone } : null;
}

// ⚠️ THE DESTINATION IS HASHED BEFORE IT IS EVER WRITTEN DOWN.
//
// public.auth_sends records one row per code we were asked to send, so we can see what the login
// door costs and spot one target being hammered. A RAW list of every number and address that ever
// asked to sign in is a list of who our customers are and when they were at their desk, and we do
// not need it to answer either question. A keyed hash answers both and is useless to anyone who
// reads the table.
//
// Keyed with WEB_SESSION_SECRET under its own domain prefix, so this can never collide with a
// session signature, and so rotating that secret makes historic rows unlinkable. That is a feature:
// the log stops being a lookup table the moment it stops being useful.
export function targetHash(value: string, secret: string): string {
  if (!secret) return '';
  return crypto.createHmac('sha256', secret).update(`authlog:${value}`).digest('hex').slice(0, 32);
}

// ── The caps ────────────────────────────────────────────────────────────────────────────────────
//
// ⚠️ THESE NUMBERS ARE THE DIFFERENCE BETWEEN A BAD DAY AND A BAD MONTH.
//
// The attack is SMS pumping, also called toll fraud: someone controls number ranges that earn
// revenue share on delivered messages, points a script at a public "text me a code" button, and
// farms it. Real companies have lost six figures over a weekend.
//
// The controls, in the order they actually matter:
//
//   1. We never send to a contact that is not already ours. That is not a limit, it is a different
//      shape of problem: it collapses the attack surface from every number on earth to our own
//      customer list. It lives in lib/supabase.ts because it is a lookup.
//   2. The daily cap below, enforced by the ATOMIC rate_hit() and read FAIL CLOSED. See the note
//      on that word in the route.
//   3. Per target and per source limits, so a customer's phone cannot be made to buzz all evening.
//
// SMS_DAILY_CAP is set so that the worst possible day is about fifteen pounds and then silence.
// Deliberately low for launch. Raise it when there are enough real customers that it could bite,
// and not before, because a cap you never see fire is a cap you never learn the shape of.
export const SMS_DAILY_CAP = 150;
export const SMS_DAILY_WINDOW_SECONDS = 24 * 60 * 60;

// Email is not free of consequence, it is free of MONEY. The thing being protected here is our
// sending reputation, not the bank balance, so the cap is far looser and its job is only to stop a
// runaway loop putting us on a blocklist.
export const EMAIL_DAILY_CAP = 2000;

// Per contact. Three codes in a quarter of an hour covers a man whose first text was slow and a man
// who deleted it by accident. It does not cover a script.
export const PER_TARGET_SENDS = 3;
export const PER_TARGET_WINDOW_SECONDS = 15 * 60;

// Per source. Wider, because a building site or an office shares one address.
export const PER_SOURCE_SENDS = 10;
export const PER_SOURCE_WINDOW_SECONDS = 60 * 60;

// Guessing a six digit code is a one in a million shot per attempt, which is only safe while the
// attempts are capped. Ten per contact per quarter hour, and a wider net per source so one machine
// cannot work through many contacts at once.
export const PER_TARGET_VERIFIES = 10;
export const PER_SOURCE_VERIFIES = 30;

export function dailyCapFor(channel: Channel): number {
  return channel === 'sms' ? SMS_DAILY_CAP : EMAIL_DAILY_CAP;
}

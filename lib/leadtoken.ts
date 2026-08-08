// Signed tokens for the confirm and unsubscribe links in marketing emails. No
// token is stored: it is an HMAC of the purpose and the email, so a link cannot
// be forged and each link only works for its own purpose and address. Secret
// comes from the environment, or the server only service role key, never a
// literal default.
import crypto from 'crypto';

const SECRET = process.env.LEAD_TOKEN_SECRET || '';

// NO FALLBACK TO THE SERVICE ROLE KEY.
//
// This used to end in `|| process.env.SUPABASE_SERVICE_ROLE_KEY`, which "worked" and was
// quietly the worst line in the file. That key reads every row in the database. Signing
// is not encryption: every token we hand out is a sample of output from that key. And
// rotating it, the one thing you must be able to do FAST if it ever leaks, would silently
// break every live link at the same moment.
//
// A secret that guards one thing guards one thing. No secret, no tokens.

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE CONFIRM LINK EXPIRES. THE UNSUBSCRIBE LINK NEVER DOES, AND THAT ASYMMETRY IS DELIBERATE.
//
// Both used to be the same shape: an HMAC of the purpose and the address, good for ever. For the
// unsubscribe link that is correct and it must stay that way. A man who finds a Lekhio email in
// his archive in three years and wants out is entitled to get out, and an expired opt out link is
// how a company earns a PECR complaint it deserves.
//
// For the confirm link it was wrong. It was a permanent capability sitting in an inbox: forwarded,
// archived, or read by whatever else has access to that mailbox, and it worked for ever. A week is
// long enough for a man to get round to it on a Sunday night and short enough that a link he has
// forgotten about stops being a live door.
//
// ⚠️ IT IS NOT, ON ITS OWN, THE FIX FOR A MAIL SCANNER. A corporate gateway pre-fetches links the
// moment the message is delivered, which is well inside any expiry worth having. That half is
// fixed in app/api/lead/confirm/route.ts, where a GET now confirms nothing at all.
//
// ⚠️ THE OLD, EXPIRY FREE CONFIRM TOKENS ARE REFUSED. There are none in flight: email is dormant
// until RESEND_API_KEY is set and nothing has been sent. Accepting the old shape would have meant
// keeping a permanent door open for ever to avoid an inconvenience nobody is having.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const LEAD_CONFIRM_TTL_SECONDS = 7 * 24 * 60 * 60;

const normalise = (email: string): string => String(email ?? '').trim().toLowerCase();

function sign(body: string): string {
  return crypto.createHmac('sha256', SECRET).update(body).digest('hex').slice(0, 32);
}

function sameSignature(expected: string, given: string): boolean {
  if (!expected || !given || expected.length !== given.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given));
  } catch {
    return false;
  }
}

// A confirm token is `<unix expiry seconds>.<signature>`, and the expiry is INSIDE the signed body,
// so moving it forward invalidates the token rather than extending it. An unsub token is the bare
// signature it has always been.
export function leadToken(purpose: 'confirm' | 'unsub', email: string, now: number = Date.now()): string {
  if (!SECRET) return '';
  if (purpose === 'unsub') return sign(`unsub:${normalise(email)}`);
  const exp = Math.floor(now / 1000) + LEAD_CONFIRM_TTL_SECONDS;
  return `${exp}.${sign(`confirm:${normalise(email)}:${exp}`)}`;
}

export function verifyLeadToken(purpose: 'confirm' | 'unsub', email: string, token: string, now: number = Date.now()): boolean {
  if (!SECRET || !token) return false;
  if (purpose === 'unsub') return sameSignature(sign(`unsub:${normalise(email)}`), token);

  const dot = token.indexOf('.');
  if (dot <= 0) return false; // no expiry in it: the old shape, or a forgery. Either way, no.
  const stamp = token.slice(0, dot);
  if (!/^\d{1,12}$/.test(stamp)) return false;
  // The signature is checked FIRST, so the expiry it carries is one we issued and not one a caller
  // typed. Only then does the clock get a say.
  if (!sameSignature(sign(`confirm:${normalise(email)}:${stamp}`), token.slice(dot + 1))) return false;
  return now <= Number(stamp) * 1000;
}

// The public site base, for building absolute links in emails.
export function siteBase(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://lekhio.app';
}

export function confirmUrl(email: string): string {
  return `${siteBase()}/api/lead/confirm?e=${encodeURIComponent(email)}&t=${leadToken('confirm', email)}`;
}

export function unsubscribeUrl(email: string): string {
  return `${siteBase()}/api/unsubscribe?e=${encodeURIComponent(email)}&t=${leadToken('unsub', email)}`;
}

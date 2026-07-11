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

export function leadToken(purpose: 'confirm' | 'unsub', email: string): string {
  if (!SECRET) return '';
  return crypto
    .createHmac('sha256', SECRET)
    .update(`${purpose}:${email.trim().toLowerCase()}`)
    .digest('hex')
    .slice(0, 32);
}

export function verifyLeadToken(purpose: 'confirm' | 'unsub', email: string, token: string): boolean {
  const expected = leadToken(purpose, email);
  if (!expected || !token || expected.length !== token.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  } catch {
    return false;
  }
}

// The public site base, for building absolute links in emails.
export function siteBase(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://tradebook-app-five.vercel.app';
}

export function confirmUrl(email: string): string {
  return `${siteBase()}/api/lead/confirm?e=${encodeURIComponent(email)}&t=${leadToken('confirm', email)}`;
}

export function unsubscribeUrl(email: string): string {
  return `${siteBase()}/api/unsubscribe?e=${encodeURIComponent(email)}&t=${leadToken('unsub', email)}`;
}

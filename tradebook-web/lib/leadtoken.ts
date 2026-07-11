// Signed tokens for the confirm and unsubscribe links in marketing emails. No
// token is stored: it is an HMAC of the purpose and the email, so a link cannot
// be forged and each link only works for its own purpose and address. Secret
// comes from the environment, or the server only service role key, never a
// literal default.
import crypto from 'crypto';

const SECRET = process.env.LEAD_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

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

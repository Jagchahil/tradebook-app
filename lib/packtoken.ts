// Short lived, signed capability tokens for the quarter end pack.
//
// The pack route normally authenticates with the caller's own Supabase Bearer
// token. But the mobile app wants to hand the branded document to the phone's
// browser so the tradesperson can Save as PDF, and a plain browser open cannot
// carry an Authorization header. So the app first asks the route (authed) for a
// signed link, then opens that URL. The token is an HMAC of the account id, the
// tax year, the quarter and an expiry, so it cannot be forged and it stops
// working after a short window. Nothing is stored: verification recomputes the
// signature. This mirrors lib/leadtoken.ts, with an added expiry.

import crypto from 'crypto';

const SECRET = process.env.PACK_TOKEN_SECRET || '';

// NO FALLBACK TO THE SERVICE ROLE KEY.
//
// This used to end in `|| process.env.SUPABASE_SERVICE_ROLE_KEY`, which "worked" and was
// quietly the worst line in the file. That key reads every row in the database. Signing
// is not encryption: every token we hand out is a sample of output from that key. And
// rotating it, the one thing you must be able to do FAST if it ever leaks, would silently
// break every live link at the same moment.
//
// A secret that guards one thing guards one thing. No secret, no tokens.

// Twenty minutes is long enough to open the link and print, short enough that a
// leaked URL is stale almost immediately.
export const PACK_TOKEN_TTL_SECONDS = 20 * 60;

export interface PackClaim {
  userId: string;
  year: number;
  quarter: 1 | 2 | 3 | 4;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('hex').slice(0, 32);
}

// Build a token for a claim, expiring PACK_TOKEN_TTL_SECONDS from now. Returns
// an empty string when no secret is configured, so callers fail closed.
export function packToken(claim: PackClaim, now: Date = new Date()): string {
  if (!SECRET) return '';
  const exp = Math.floor(now.getTime() / 1000) + PACK_TOKEN_TTL_SECONDS;
  const body = { u: claim.userId, y: claim.year, q: claim.quarter, exp };
  const payload = b64url(Buffer.from(JSON.stringify(body), 'utf8'));
  return `${payload}.${sign(payload)}`;
}

// Verify a token and return its claim, or null if it is missing, malformed,
// tampered, or expired. Never throws.
export function verifyPackToken(token: string | null, now: Date = new Date()): PackClaim | null {
  if (!SECRET || !token) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  if (sig.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  let body: { u?: unknown; y?: unknown; q?: unknown; exp?: unknown };
  try {
    body = JSON.parse(fromB64url(payload).toString('utf8'));
  } catch {
    return null;
  }
  const exp = Number(body.exp);
  if (!Number.isFinite(exp) || exp < Math.floor(now.getTime() / 1000)) return null; // expired
  const userId = typeof body.u === 'string' ? body.u : '';
  const year = Number(body.y);
  const quarter = Number(body.q);
  if (!userId || !Number.isInteger(year) || (quarter !== 1 && quarter !== 2 && quarter !== 3 && quarter !== 4)) {
    return null;
  }
  return { userId, year, quarter: quarter as 1 | 2 | 3 | 4 };
}

export function siteBase(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://tradebook-app-five.vercel.app';
}

// The full capability URL the app opens in the browser.
export function packUrl(claim: PackClaim, now: Date = new Date()): string {
  return `${siteBase()}/api/quarter-pack?t=${encodeURIComponent(packToken(claim, now))}`;
}

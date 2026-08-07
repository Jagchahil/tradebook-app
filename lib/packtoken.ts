// Short lived, signed capability tokens for the quarter end pack and the proof
// of income.
//
// The document routes normally authenticate with the caller's own Supabase
// Bearer token. But the mobile app wants to hand the branded document to the
// phone's browser so the tradesperson can Save as PDF, and a plain browser open
// cannot carry an Authorization header. So the app first asks the route
// (authed) for a signed link, then opens that URL. The token is an HMAC of the
// account id, the tax year, the quarter, the audience (which document it opens,
// see PACK_AUDIENCES below) and an expiry, so it cannot be forged, cannot open
// any document but its own, and stops working after a short window. Nothing is
// stored: verification recomputes the signature. This mirrors lib/leadtoken.ts,
// with an added expiry.

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

// WHICH DOOR THE TOKEN OPENS. TWO DOCUMENTS SHARE THIS MODULE, AND THAT WAS THE HOLE.
//
// The quarter end pack and the proof of income both mint and verify here, and until
// 6 August 2026 the signed body said nothing about which document it was for. So a
// token minted so a lender could see the income proof also opened the quarter end
// pack, a different document about the same man, with his whole quarter's spending
// on it. He handed over a link to one page and had silently handed over two.
//
// lib/bookshare.ts already solves this for share links: the purpose is part of the
// signed message, so a token minted for one purpose can never be replayed against
// another. Same idea here, carried as `aud` inside the signed JSON body. Each route
// states its own audience when it mints and demands that same audience when it
// verifies, and the token only opens the one door it names.
//
// A token WITHOUT an audience, the old format, FAILS verification on purpose. Fail
// open here would keep the interchange alive for as long as anyone still held an
// old link. The TTL is twenty minutes, so at deploy the worst case is a just minted
// link dying twenty minutes early, and the man taps the button again. That is a
// price worth paying to close the hole at the same moment the code ships.
export const PACK_AUDIENCES = ['quarter-pack', 'income-proof'] as const;
export type PackAudience = (typeof PACK_AUDIENCES)[number];

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

// Build a token for a claim and ONE audience, expiring PACK_TOKEN_TTL_SECONDS
// from now. The audience is a required parameter, not a field with a default,
// so there is no way to mint a token that does not say which door it opens.
// Returns an empty string when no secret is configured, or when the audience is
// not one we know, so callers fail closed either way.
export function packToken(claim: PackClaim, audience: PackAudience, now: Date = new Date()): string {
  if (!SECRET) return '';
  // TypeScript pins the audience to the union, but tests and any plain JS caller
  // can hand in anything, and an unrecognised audience must not become a token.
  if (!PACK_AUDIENCES.includes(audience)) return '';
  const exp = Math.floor(now.getTime() / 1000) + PACK_TOKEN_TTL_SECONDS;
  const body = { u: claim.userId, y: claim.year, q: claim.quarter, aud: audience, exp };
  const payload = b64url(Buffer.from(JSON.stringify(body), 'utf8'));
  return `${payload}.${sign(payload)}`;
}

// Verify a token FOR ONE AUDIENCE and return its claim, or null if it is
// missing, malformed, tampered, expired, or minted for a different document.
// Never throws. The caller states which document it is, and only a token whose
// signed body names that same document verifies.
export function verifyPackToken(token: string | null, audience: PackAudience, now: Date = new Date()): PackClaim | null {
  if (!SECRET || !token) return null;
  if (!PACK_AUDIENCES.includes(audience)) return null;
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
  let body: { u?: unknown; y?: unknown; q?: unknown; aud?: unknown; exp?: unknown };
  try {
    body = JSON.parse(fromB64url(payload).toString('utf8'));
  } catch {
    return null;
  }
  // The signature has already passed, so the body is one WE wrote. Now it must
  // name this caller's document. A missing aud is the pre audience format, and
  // it fails here, closed: see the header for why the twenty minute breakage
  // window at deploy is the right price.
  if (typeof body.aud !== 'string' || body.aud !== audience) return null;
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
  return process.env.NEXT_PUBLIC_APP_URL || 'https://lekhio.app';
}

// The full capability URL the app opens in the browser. This helper builds the
// quarter pack route's own URL, so it pins the quarter pack audience itself: the
// path and the door it opens are one fact, stated in one place.
export function packUrl(claim: PackClaim, now: Date = new Date()): string {
  return `${siteBase()}/api/quarter-pack?t=${encodeURIComponent(packToken(claim, 'quarter-pack', now))}`;
}

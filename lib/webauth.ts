// lib/webauth.ts. THE ONE GATE. Who is asking, on either surface.
//
// ⚠️ THERE IS EXACTLY ONE PLACE IN THIS CODEBASE THAT ANSWERS "WHOSE BOOKS ARE THESE", AND THIS IS
// THE SECOND HALF OF IT.
//
// The phone app sends a Supabase Bearer token. The web app sends an HttpOnly cookie. Those are two
// credentials, and the temptation is to write two auth checks, one per surface. That is how a
// codebase ends up with a strict door and a lenient one, and it is always the lenient one that
// gets found. So both credentials come through this file and out the other side as the same thing:
// a user id, or null.
//
// It is the same lesson /api/ledger's header tells about money: two readers over the same figure
// will drift, and the one that drifts is the one he believes. Two readers over the same IDENTITY
// do not drift into a wrong number, they drift into the wrong man's tax return.
//
// FAILS CLOSED, EVERY PATH. A missing credential, a forged one, an expired one, a revoked one, a
// database that will not answer: all of them are null, and null means the sign in page.

import { verifyAccessToken, readWebSession, touchWebSession, revokeWebSession } from './supabase';
import {
  SESSION_COOKIE, SESSION_TTL_SECONDS, verifySessionCookie, needsTouch, pastMaxLife,
} from './websession';

export interface WebUser {
  id: string;
  // Which door he came through. Not used for permissions, and it must never become a permission:
  // it is here so a route that genuinely needs to know (setting a cookie, say) can tell, and so a
  // support question about a broken sign in has an answer.
  via: 'cookie' | 'bearer';
  // The session row id, when he came through the cookie. Needed to sign him out.
  sessionId: string | null;
}

// Pull one cookie out of a raw Cookie header. Hand rolled and deliberately small: this runs on
// every request from every page, and a parser that tries to be clever about quoting is a parser
// that can be surprised.
export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const value = part.slice(eq + 1).trim();
    return value || null;
  }
  return null;
}

// THE COOKIE PATH. Signature first, then the row.
//
// The signature check is free and needs no database, so a forged or tampered cookie is thrown away
// before it can cost us a query. Only a cookie we actually signed is worth asking about.
export async function userFromSessionCookie(value: string | null): Promise<WebUser | null> {
  const claim = verifySessionCookie(value);
  if (!claim) return null;

  const row = await readWebSession(claim.sessionId);
  if (!row) return null;

  // The absolute ceiling, checked against the row rather than the cookie, so an old cookie holding
  // a later expiry cannot outlive the rule. A year in, he proves his number again.
  if (pastMaxLife(row.createdAt)) {
    await revokeWebSession(row.id).catch(() => {});
    return null;
  }

  // Slide it forward, at most once a day. Deliberately not awaited: a man reading his ledger must
  // not wait on a housekeeping write, and if it fails the session still works until it expires.
  if (needsTouch(row.lastSeenAt)) {
    void touchWebSession(row.id, new Date(Date.now() + SESSION_TTL_SECONDS * 1000));
  }

  return { id: row.userId, via: 'cookie', sessionId: row.id };
}

// THE ONE FUNCTION EVERY ROUTE AND EVERY PAGE CALLS.
//
// Bearer first, because the phone app sends one on every request and it is the cheaper check.
// Cookie second. Never both, never a fallback that widens: if the Bearer is present and bad, the
// answer is no, rather than quietly trying the other door.
export async function sessionUser(req: Request): Promise<WebUser | null> {
  const auth = req.headers.get('authorization') || '';
  if (auth.startsWith('Bearer ')) {
    const token = auth.slice(7);
    const user = token ? await verifyAccessToken(token) : null;
    return user ? { id: user.id, via: 'bearer', sessionId: null } : null;
  }
  return userFromSessionCookie(readCookie(req.headers.get('cookie'), SESSION_COOKIE));
}

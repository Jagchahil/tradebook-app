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

import {
  verifyAccessToken, readWebSession, touchWebSession, revokeWebSession, readAuthUserIdentity,
  type AuthIdentity,
} from './supabase';
import {
  SESSION_COOKIE, verifySessionCookie, needsTouch, pastMaxLife, originAllowed, slideExpiry,
} from './websession';

export interface WebUser {
  id: string;
  // Which door he came through. Not used for permissions, and it must never become a permission:
  // it is here so a route that genuinely needs to know (setting a cookie, say) can tell, and so a
  // support question about a broken sign in has an answer.
  via: 'cookie' | 'bearer';
  // The session row id, when he came through the cookie. Needed to sign him out.
  sessionId: string | null;
  // His email, but ONLY when the door handed it over for free. The Bearer path gets it from GoTrue
  // with the identity; the cookie path resolves a row holding a user id and nothing else.
  //
  // ⚠️ NEVER BRANCH ON THIS BEING NULL TO MEAN "HE HAS NO EMAIL". Null means "this door did not
  // carry it", which is a different fact entirely, and confusing the two is how a GDPR delete
  // quietly skips every row keyed by his address. Ask identityForUser() instead.
  email: string | null;
  // Same rule as email. Free on the Bearer path, null on the cookie path until somebody asks.
  phone: string | null;
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
  //
  // ⚠️ ONLY A REMEMBERED SESSION SLIDES. slideExpiry returns null for a session opened with the
  // "Remember my browser" box unticked, and null means the expiry on the row is never moved: an
  // unticked session runs out its few hours however hard it is used, which is the whole promise
  // the unticked box makes on a machine that is not his.
  const slid = slideExpiry(row.remembered);
  if (slid && needsTouch(row.lastSeenAt)) {
    void touchWebSession(row.id, slid);
  }

  return { id: row.userId, via: 'cookie', sessionId: row.id, email: null, phone: null };
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
    return user ? { id: user.id, via: 'bearer', sessionId: null, email: user.email, phone: user.phone } : null;
  }

  // 🔴 THE ORIGIN CHECK LIVES HERE, AND NOWHERE ELSE, AND THAT IS THE POINT OF PUTTING IT HERE.
  //
  // Every one of these routes used to verify a Bearer token and nothing else, which made them
  // immune to cross site request forgery BY ACCIDENT: no browser attaches an Authorization header
  // to a request another site caused. Teaching them to accept a cookie throws that immunity away,
  // because a cookie IS attached by the browser, on the browser's own judgement.
  //
  // SameSite=Lax already refuses to send this cookie on a cross site form post. But websession.ts
  // says the thing worth repeating: SameSite is a promise made by the browser, and this is a check
  // made by our server. Only one of the two is ours.
  //
  // ⚠️ AND IT IS HERE RATHER THAN IN THIRTY SIX ROUTES ON PURPOSE. A rule that every route author
  // must remember is a rule that holds until the day somebody is in a hurry, and the route written
  // in a hurry is the one that gets found. There is nothing to remember, because there is nowhere
  // to forget it: a route cannot accept the cookie without coming through this function.
  //
  // GET and HEAD are exempt because they change nothing, and because Lax does not attach the cookie
  // to a cross site subresource fetch at all, only to a top level navigation.
  const method = (req.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    if (!originAllowed(req.headers.get('origin'), req.headers.get('host'))) return null;
  }

  return userFromSessionCookie(readCookie(req.headers.get('cookie'), SESSION_COOKIE));
}

// HIS EMAIL AND PHONE, WHICHEVER DOOR HE CAME THROUGH. Free on the Bearer path, one lookup on the cookie path.
//
// Only three routes need this: exporting his data, deleting his account, and resolving his Stripe
// customer. Everything else works off the user id, which is why this is a separate call and not a
// field every request pays for. See readAuthUserEmail in lib/supabase.ts.
//
// ⚠️ A ROUTE THAT NEEDS THE EMAIL TO BE CORRECT MUST CHECK FOR NULL AND REFUSE. Deleting an account
// while silently skipping every row keyed by his address is worse than refusing to delete it, because
// he is told it is done.
export async function identityForUser(user: WebUser): Promise<AuthIdentity> {
  if (user.email || user.phone) return { email: user.email, phone: user.phone };
  return readAuthUserIdentity(user.id);
}

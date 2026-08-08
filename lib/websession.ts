// lib/websession.ts. THE WEB SESSION COOKIE. How a man stays signed in on lekhio.app.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS AT ALL, WHEN THE APP ALREADY HAS AUTH.
//
// The phone app holds a Supabase session in the device keystore and sends it as a Bearer header.
// A browser cannot safely do that. A token in localStorage is readable by any script that ever
// gets onto the page, and it has to be read by JavaScript before the first useful byte can be
// fetched, which is exactly the wrong shape for a man on a five year old Android on 3G at the
// side of a road.
//
// So the web holds an HttpOnly cookie instead. The server reads it before it renders anything,
// the page arrives with his figures already in it, and no script on the page can ever read the
// credential. Identity is still proved by Supabase and Twilio: we do the code exchange server
// side and throw the Supabase token away.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ WHY THE COOKIE IS LONG LIVED, AND WHY THAT IS A COST DECISION AS MUCH AS A KINDNESS.
//
// Every sign in sends a Twilio SMS, and doc 77 prices that at roughly 7p to 10p. A session that
// expired weekly would mean charging ourselves 10p a week, per customer, forever, to show a man
// a page he has already paid for. It would also mean asking a working tradesman to go and find a
// text message before he can see what he owes, which is the friction this whole product exists to
// remove.
//
// So the session lasts ninety days and slides forward as he uses it. A man who opens Lekhio once
// a month never signs in twice. The absolute cap is a year, after which he proves his number
// again, because a credential that renews itself for ever is not a session, it is a password
// nobody chose.
//
// Ninety days is for HIS browser. From 31 July the sign in page asks, with an unticked
// "Remember my browser" box, and an unticked sign in gets a browser session cookie and a twelve
// hour row that never slides. The row records which kind it is. See
// SESSION_TTL_UNREMEMBERED_SECONDS and slideExpiry below for the two halves of that argument.
//
// ⚠️ AND WHY THERE IS A ROW IN A TABLE BEHIND IT.
//
// A signed cookie on its own cannot be taken back. For ninety days, a copied cookie is a copy of
// his books, and the only cure would be rotating the secret and signing out every customer we
// have. So the cookie carries a session id and the truth lives in public.web_sessions, where a
// row can be revoked: by him, by us, or by a future "sign out everywhere". The signature is still
// worth having on top, because it lets us throw away a forged or tampered cookie without touching
// the database at all.
//
// PURE. No I/O, no database, no clock of its own beyond Date.now defaults a caller can override.
// The reads and writes live in lib/supabase.ts, per CLAUDE.md rule 2. This file only decides what
// a valid cookie looks like, so test/websession.test.mjs can attack it directly.

import crypto from 'node:crypto';

// NO FALLBACK, AND ESPECIALLY NOT TO THE SERVICE ROLE KEY.
//
// lib/packtoken.ts used to end in a fallback to SUPABASE_SERVICE_ROLE_KEY and its header explains
// why that was the worst line in the file: that key reads every row in the database, signing is
// not encryption, and every cookie we hand out would be a sample of output from it. A secret that
// guards one thing guards one thing. No secret, no sessions, and the sign in page says so rather
// than pretending.
const SECRET = process.env.WEB_SESSION_SECRET || '';

export function webSessionsConfigured(): boolean {
  return SECRET.length >= 32;
}

// The cookie name. Short, because it goes up on every single request from a phone on a bad
// connection, and prefixed so it is obvious in a browser inspector whose it is.
export const SESSION_COOKIE = 'lek_s';

// Ninety days, refreshed as he uses it. See the header: the alternative is a Twilio charge and a
// hunt for a text message every time he wants to look at his own money.
export const SESSION_TTL_SECONDS = 90 * 24 * 60 * 60;

// ⚠️ AND THE SESSION HE GETS WHEN HE DOES NOT TICK "REMEMBER MY BROWSER". Twelve hours, not days.
//
// The ninety day argument above assumes the browser is his. On a merchant's counter PC or a
// mate's laptop it is not, and the tick box on /in (unticked by default) is how he says so. Then
// the cookie is issued with no Max-Age at all, so the browser drops it when it closes, and this
// short expiry is written on the row as well, because "dies on close" is a browser promise we do
// not control: Chrome's "continue where you left off" resurrects session cookies across restarts,
// and a copied cookie never closes anything. Twelve hours outlasts any working day at a borrowed
// screen and is gone before the machine's next shift, and lib/webauth.ts never slides it (see
// slideExpiry), so an unticked session cannot creep towards the ninety days he declined.
export const SESSION_TTL_UNREMEMBERED_SECONDS = 12 * 60 * 60;

// The hard ceiling on one session's whole life, however much it slides. A year.
export const SESSION_MAX_LIFE_SECONDS = 365 * 24 * 60 * 60;

// Do not write to the database on every page view just to move a timestamp. A session is only
// touched when a day has passed since we last touched it, which turns a per render write into
// roughly one write per customer per day.
export const SESSION_TOUCH_AFTER_SECONDS = 24 * 60 * 60;

export interface SessionClaim {
  // The id of the row in public.web_sessions. NOT the user id: the user is read from the row, so
  // a cookie cannot assert whose books it wants. See verifySessionCookie.
  sessionId: string;
  exp: number;
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

// A session id we generate ourselves, so the value in the cookie is never something a client
// chose. 128 bits of randomness, url safe.
export function newSessionId(): string {
  return b64url(crypto.randomBytes(16));
}

// Shape check on a session id, used before it ever reaches a query. Fixed alphabet, fixed length,
// so nothing that is not one of ours gets as far as the database.
export function isSessionId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{22}$/.test(value);
}

// Build the cookie value for a session id. Returns an empty string with no secret, so every
// caller fails closed rather than issuing an unsigned credential. The ttl is a parameter because
// the two kinds of session (remembered and not) carry different expiries, and the cookie's own
// exp must agree with the row it points at or one of the two is lying.
export function sessionCookieValue(
  sessionId: string,
  now: Date = new Date(),
  ttlSeconds: number = SESSION_TTL_SECONDS,
): string {
  if (!webSessionsConfigured() || !isSessionId(sessionId)) return '';
  const exp = Math.floor(now.getTime() / 1000) + ttlSeconds;
  const payload = b64url(Buffer.from(JSON.stringify({ s: sessionId, exp }), 'utf8'));
  return payload + '.' + sign(payload);
}

// ⚠️ THIS RETURNS A SESSION ID, NEVER A USER ID, AND THAT IS THE WHOLE SECURITY MODEL.
//
// The cookie says which session this is. It does not say whose books they are. The user comes
// from the row, read server side with the service role key, so there is no value in the cookie a
// customer could edit to reach another customer's figures even if he broke the signature. That is
// the same reason /api/ledger reads the user from verifyAccessToken and never from a query
// parameter: a tenancy boundary that depends on the client behaving is not a boundary.
//
// Never throws. A missing, malformed, tampered or expired cookie is null, which reads as signed
// out, because a man with a bad cookie must see the sign in page and not a stack trace.
export function verifySessionCookie(
  value: string | null | undefined,
  now: Date = new Date(),
): SessionClaim | null {
  if (!webSessionsConfigured() || !value) return null;
  const dot = value.indexOf('.');
  if (dot <= 0) return null;
  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = sign(payload);
  if (sig.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  let body: { s?: unknown; exp?: unknown };
  try {
    body = JSON.parse(fromB64url(payload).toString('utf8'));
  } catch {
    return null;
  }
  const exp = Number(body.exp);
  if (!Number.isFinite(exp) || exp < Math.floor(now.getTime() / 1000)) return null;
  if (!isSessionId(body.s)) return null;
  return { sessionId: body.s, exp };
}

// The attributes the cookie is set with, in one place so no call site can quietly drop one.
//
// httpOnly:  no script on the page can read a credential to a man's books.
// secure:    it never travels over plain http. Off in local development only, or nothing works.
// sameSite:  lax, so following a link into Lekhio from WhatsApp keeps him signed in, while a form
//            posted from another site cannot carry his session. Every state changing route also
//            checks the origin, because SameSite is a browser promise and not a server check.
// path:      the whole site, since the API routes need it too.
export interface CookieAttributes {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  // Absent on purpose for an unremembered session: a cookie with no Max-Age is a browser session
  // cookie and dies when the browser closes. See browserSessionCookieAttributes.
  maxAge?: number;
}

export function sessionCookieAttributes(maxAgeSeconds: number = SESSION_TTL_SECONDS): CookieAttributes {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.max(0, Math.floor(maxAgeSeconds)),
  };
}

// The unremembered shape: identical protections, NO Max-Age. Omitting the attribute is the whole
// point and not an oversight: with it the cookie persists to its expiry however many times the
// browser closes, without it the browser forgets the cookie on close. A maxAge of zero would not
// do, that is how a cookie is DELETED, and every caller clearing one does exactly that via
// sessionCookieAttributes(0).
export function browserSessionCookieAttributes(): CookieAttributes {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  };
}

// ⚠️ WHAT A TOUCH MAY SLIDE THE EXPIRY TO, AND FOR AN UNREMEMBERED SESSION THE ANSWER IS NOTHING.
//
// The ninety day window slides because he ticked the box that said this browser is his. A session
// he asked us NOT to remember must never inch its way to ninety days through use, or the tick box
// is a decoration: heavy use is exactly the situation on a shared machine. Null means "do not
// touch this row's expiry at all", and lib/webauth.ts obeys it. The decision lives here, pure,
// so test/websession.test.mjs can hold it down directly rather than trusting a caller's if.
export function slideExpiry(remembered: boolean, now: Date = new Date()): Date | null {
  if (!remembered) return null;
  return new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
}

// Whether a session that was last touched at this time is due another touch. Keeps the sliding
// window from turning every page view into a database write.
export function needsTouch(lastSeenIso: string | null, now: Date = new Date()): boolean {
  if (!lastSeenIso) return true;
  const t = Date.parse(lastSeenIso);
  if (!Number.isFinite(t)) return true;
  return (now.getTime() - t) / 1000 >= SESSION_TOUCH_AFTER_SECONDS;
}

// Whether a session has run past its absolute ceiling, whatever its sliding expiry says. Checked
// server side against the row, so an old cookie cannot outlive the rule by holding a later exp.
export function pastMaxLife(createdIso: string | null, now: Date = new Date()): boolean {
  if (!createdIso) return true;
  const t = Date.parse(createdIso);
  if (!Number.isFinite(t)) return true;
  return (now.getTime() - t) / 1000 > SESSION_MAX_LIFE_SECONDS;
}

// ⚠️ THE ORIGIN CHECK. Belt and braces on top of SameSite.
//
// Every route that changes something (signing in, signing out, dismissing a card, electing an
// allowance) checks that the request came from us. SameSite=Lax already stops a cross site form
// post carrying the cookie, but that is a promise made by the browser, and this is a check made
// by our server. Only one of the two is ours.
//
// A missing Origin header is allowed, because an ordinary same site form post does not always
// carry one. A present but foreign origin is always refused.
export function originAllowed(origin: string | null, host: string | null): boolean {
  if (!origin) return true;
  let o: URL;
  try {
    o = new URL(origin);
  } catch {
    return false;
  }
  if (host && o.host === host) return true;
  // Our own site, and ONLY our own site. The lookalike .com is an unrelated ERP company's and is
  // never trusted here. It is not written out even in a comment, because test/domain.test.mjs
  // greps for that string and the guard is worth more than the sentence. See CLAUDE.md.
  const site = process.env.NEXT_PUBLIC_APP_URL || 'https://lekhio.app';
  try {
    if (o.host === new URL(site).host) return true;
  } catch {
    // A misconfigured NEXT_PUBLIC_APP_URL must not open the door, so fall through to the refusal.
  }
  if (o.host === 'lekhio.app' || o.host === 'www.lekhio.app') return true;
  if (process.env.NODE_ENV !== 'production' && /^localhost(:\d+)?$/.test(o.host)) return true;
  return false;
}

// ── The pending sign in ──────────────────────────────────────────────────────────────────────────
//
// ⚠️ THE NUMBER HE TYPED DOES NOT GO IN THE URL, AND THAT IS NOT FUSSINESS.
//
// The obvious way to carry a phone number from the "send me a code" step to the "here is my code"
// step is a query string, and it would work. It would also write a customer's mobile number into
// his browser history, into any Referer header the page leaks, and into every analytics or error
// report that ever records a URL. A phone number IS the account key in this product.
//
// So it rides in a short lived signed cookie instead, and the code is verified against the number
// we actually texted rather than a number the form claims. Fifteen minutes, because that is longer
// than it takes to read a text and shorter than a coffee break.
export const PENDING_COOKIE = 'lek_p';
export const PENDING_TTL_SECONDS = 15 * 60;

export interface PendingContact {
  channel: 'sms' | 'email';
  value: string;
}

export function pendingCookieValue(contact: PendingContact, now: Date = new Date()): string {
  if (!webSessionsConfigured() || !contact?.value) return '';
  const exp = Math.floor(now.getTime() / 1000) + PENDING_TTL_SECONDS;
  const payload = b64url(Buffer.from(JSON.stringify({ c: contact.channel, v: contact.value, exp }), 'utf8'));
  return payload + '.' + sign(payload);
}

// The contact we actually sent to, or null. Null means the step timed out or the cookie was
// tampered with, and either way he starts again rather than us verifying a code against anything he
// can type.
export function verifyPendingCookie(value: string | null | undefined, now: Date = new Date()): PendingContact | null {
  if (!webSessionsConfigured() || !value) return null;
  const dot = value.indexOf('.');
  if (dot <= 0) return null;
  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = sign(payload);
  if (sig.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  let body: { c?: unknown; v?: unknown; exp?: unknown };
  try {
    body = JSON.parse(fromB64url(payload).toString('utf8'));
  } catch {
    return null;
  }
  const exp = Number(body.exp);
  if (!Number.isFinite(exp) || exp < Math.floor(now.getTime() / 1000)) return null;
  const channel = body.c === 'email' ? 'email' : body.c === 'sms' ? 'sms' : null;
  const v = typeof body.v === 'string' ? body.v : '';
  if (!channel || !v || v.length > 254) return null;
  // Shape checked again on the way out, so a cookie signed under an older, looser rule cannot carry
  // something this build would never have accepted on the way in.
  if (channel === 'sms' && !/^\+447\d{9}$/.test(v)) return null;
  if (channel === 'email' && !v.includes('@')) return null;
  return { channel, value: v };
}

// toUkE164 DELIBERATELY DOES NOT LIVE HERE ANY MORE. It is in lib/logindoor.ts, which is the one
// place that reads what a man typed. Two copies of the number normaliser is the exact failure this
// codebase keeps writing warnings about: the copy that drifts decides which account his WhatsApp
// receipts land on.

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHERE TO SEND HIM AFTER HE SIGNS IN, AND WHY THIS IS AN ALLOWLIST RATHER THAN A CLEANER.
//
// /in used to send everybody to /app, so a customer who clicked "Manage subscription" in the
// footer signed in and landed on the dashboard, having forgotten what he came for. Carrying a
// destination through the sign in fixes that, and it is also the single most abused parameter
// on the web: an unvalidated one turns our own login into a redirector that sends a man to
// somebody else's page with our name in the address bar he just typed his code into.
//
// ⚠️ SO IT IS AN ALLOWLIST OF ONE PLACE, NOT A SANITISER. A sanitiser is a list of the attacks
// somebody thought of. `/app` and paths beneath it are the only destinations a signed in
// customer has, so anything else is not a near miss to be repaired, it is a request we did not
// make and it goes to the default.
//
// The rejected shapes, and each is a real bypass rather than a hypothetical:
//   //evil.com        protocol relative, the browser treats it as another host
//   /app\@evil.com    a backslash, which several browsers normalise to a slash
//   https://evil.com  an absolute URL, caught by the scheme colon
//   /app/../../x      traversal, caught because it never matches the prefix after the checks
//   whitespace, control characters and anything over the length a real route needs
//
// ⚠️ NO QUERY STRING AND NO FRAGMENT, deliberately. Nothing we need to reach carries one, and
// every character allowed through here is a character somebody gets to put in front of a man
// who is mid sign in. Widen it when something real needs it, with a reason written here.
//
// ⚠️ IT RETURNS THE DEFAULT RATHER THAN NULL. A caller cannot forget to handle a refusal, so
// the failure mode of every mistake in every caller is "he lands on his dashboard", which is
// exactly where he used to land anyway.
//
// ⚠️ AND IT NEVER THROWS, HOWEVER IT IS ABUSED. It sits on the sign in path, so an exception
// here is not a refused destination, it is a locked door for every customer at once. That is
// the 7 August failure, where a daily cap failed closed and shut the door. Every line below
// either returns the default or returns a path that has been allowlisted.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 7 AUGUST 2026. WHY THIS NOW VALIDATES THE RESOLVED PATH AND NOT THE STRING IT WAS HANDED.
//
// The checks above were all made against the RAW string, and the raw string is not the thing
// that decides where a man lands. Every caller hands the value to a URL parser afterwards:
// app/api/auth/verify/route.ts builds `new URL(next, req.url)`, and app/in/page.tsx puts it in
// a Location header where the browser's own parser does the same job. Those parsers collapse
// dot segments, and they treat a PERCENT ENCODED dot as a dot while doing it.
//
// So `/app/%2e%2e/team` held no `..` for `v.includes('..')` to find, started with `/app/`, and
// carried none of the screened characters. It came back unchanged, and the parser then turned
// it into `/team`. The upper case `%2E%2E` did the same.
//
// ⚠️ SAY THE SIZE OF IT HONESTLY. That is a SAME ORIGIN escape from the allowlist, not an open
// redirect. The `//` and scheme guards held, so it could never be pointed at another website.
// It landed a signed in customer on an internal path instead of his dashboard, and every such
// path has its own authorisation in front of it, so this was defence in depth failing and not
// books being read. It was also not new. It was found on the day 36 more pages began feeding
// this function, and a guard one encoding away from useless is not a guard.
//
// ⚠️ THE FIX IS NOT ANOTHER FORBIDDEN STRING. Adding `%2e` to the screen would have left
// `%252e`, `%c0%ae`, a unicode dot lookalike and whatever gets written next, because a list of
// encodings is a list of the attacks somebody thought of, which is the exact thing the
// paragraph above says this function must not be. A URL parser is going to read this value
// downstream whatever we do, so this function now reads it FIRST, with the same parser, and
// judges what comes out:
//
//   1. the raw screen stays, and it runs first, because the parser SILENTLY REPAIRS several of
//      these. It strips tab and newline, it folds a backslash to a slash. A value that only
//      becomes acceptable after repair is a value we never wanted to accept.
//   2. the value is resolved, and the RESOLVED PATHNAME is what is measured against `/app`. An
//      encoding that collapses on resolution has already collapsed by the time we look at it.
//   3. the resolved pathname must be made of ordinary path segments: letters, digits, the
//      underscore and the hyphen our route names use. That is an allowlist of characters rather
//      than a blocklist of encodings, and it refuses a percent sign outright, which is double
//      encoding, overlong UTF8, `%00` and the rest of that family gone in one line.
//   4. what is RETURNED is the resolved pathname, so the value a caller redirects with is the
//      exact value that was validated, with nothing left in it for a second parser to change.
//
// The 37 pages under app/app send plain paths such as `/app/tax/vat` and `/app/you/settings`,
// and every one resolves to itself and comes back byte identical. test/signinnext.test.mjs
// walks app/app on disk and holds that down for whatever ships next, and
// test/nextallowlist.test.mjs carries the table of attacks with their required answers.
//
// ⚠️ WHAT THIS DOES NOT COVER, SAID PLAINLY. It decides one thing: that a destination is a path
// under /app. It is not authorisation and it never was. Whether this particular customer may
// see the page he asked for is decided by the page, from his session, and stays there.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const AFTER_SIGN_IN = '/app';

// The base the value is resolved against, and it is DELIBERATELY A FIXED CONSTANT rather than
// NEXT_PUBLIC_APP_URL or the request. Only the pathname is ever read off the result, so the host
// makes no difference to the answer, and a guard whose verdict moves with an environment variable
// is a guard that can be misconfigured open. Nothing built from it is ever sent anywhere: it
// exists so that this function parses the value with the same parser its callers will.
const NEXT_BASE = new URL('https://lekhio.app/');

// A resolved path made only of ordinary segments. No empty segment, so `//` cannot survive. No
// dot, so a literal `..` cannot survive. No percent sign, so nothing still encoded can. Widen it
// when a real route needs a character it has not got, and name that route here when you do.
const NEXT_SEGMENTS = /^(?:\/[A-Za-z0-9_-]+)+$/;

export function safeNext(raw: unknown): string {
  if (typeof raw !== 'string') return AFTER_SIGN_IN;
  const v = raw.trim();
  if (v.length === 0 || v.length > 120) return AFTER_SIGN_IN;

  // ── 1. THE RAW SCREEN, RUN BEFORE ANYTHING IS RESOLVED.
  //
  // The prefix check is also what makes the fixed base above sound. It forces the value to be an
  // absolute path, so the base's own path can never contribute to the result and one string
  // cannot mean two destinations at two call sites.
  if (v !== AFTER_SIGN_IN && !v.startsWith(`${AFTER_SIGN_IN}/`)) return AFTER_SIGN_IN;
  if (/[\\:?#\s\u0000-\u001f]/.test(v)) return AFTER_SIGN_IN;
  if (v.includes('//') || v.includes('..')) return AFTER_SIGN_IN;

  // ── 2. RESOLVE IT, THEN JUDGE WHAT CAME OUT RATHER THAN WHAT WENT IN.
  let u: URL;
  try {
    u = new URL(v, NEXT_BASE);
  } catch {
    // Unreachable for a value that has passed the screen above, and caught regardless. A throw
    // on the sign in path costs every customer the door, not merely this one his destination.
    return AFTER_SIGN_IN;
  }
  // Invariants rather than expected refusals: the screen above should already have made a
  // foreign origin, a query and a fragment impossible. They are checked on the RESOLVED value
  // because that is the value that gets used, and an invariant nobody checks is an assumption.
  if (u.origin !== NEXT_BASE.origin) return AFTER_SIGN_IN;
  if (u.search !== '' || u.hash !== '') return AFTER_SIGN_IN;

  const p = u.pathname;
  if (p !== AFTER_SIGN_IN && !p.startsWith(`${AFTER_SIGN_IN}/`)) return AFTER_SIGN_IN;
  if (!NEXT_SEGMENTS.test(p)) return AFTER_SIGN_IN;
  // ⚠️ AND THE PARSER MUST NOT HAVE CHANGED ANYTHING. `/app/%2e/team` resolves to `/app/team`,
  // which is inside the allowlist and would have been let through as its repaired form. That is
  // sanitising, and the paragraph at the top of this block says this function does not sanitise.
  // Requiring the resolved path to equal what was handed in reduces the whole guard to one
  // sentence a reader can hold: WHAT COMES BACK IS EITHER THE DASHBOARD OR THE EXACT VALUE THAT
  // WAS SENT, already in the form the browser will use, with nothing left to normalise.
  if (p !== v) return AFTER_SIGN_IN;
  return p;
}

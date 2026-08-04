import { NextRequest, NextResponse } from 'next/server';
import { rateLimitedShared, clientIp } from '../../../../lib/ratelimit';
import {
  targetHash, PER_TARGET_VERIFIES, PER_TARGET_WINDOW_SECONDS, PER_SOURCE_VERIFIES,
  PER_SOURCE_WINDOW_SECONDS,
} from '../../../../lib/logindoor';
import {
  verifyAccessToken, createWebSession, ensureUserRow, reconcileSignupToUser,
} from '../../../../lib/supabase';
import {
  PENDING_COOKIE, SESSION_COOKIE, SESSION_TTL_SECONDS, SESSION_TTL_UNREMEMBERED_SECONDS,
  browserSessionCookieAttributes, newSessionId, originAllowed, sessionCookieAttributes,
  sessionCookieValue, verifyPendingCookie, webSessionsConfigured,
  safeNext, AFTER_SIGN_IN,
} from '../../../../lib/websession';

export const runtime = 'nodejs';

// HE TYPED THE CODE. The second half of signing in, and the moment the account becomes real.
//
// ⚠️ THREE THINGS HAPPEN HERE AND THE ORDER MATTERS.
//
//   1. The code is proved against the number WE texted, read from the signed pending cookie, never
//      from the form. A verify that trusted a posted number would let a man send a code to his own
//      phone and then exchange it for somebody else's account.
//   2. The users row is created if it does not exist. Until today public.users was only ever
//      written by the phone app, client side, so a man who signed up on the website had nothing to
//      sign in to. This is where that gap closes.
//   3. The signup answers are reconciled onto the account, so the six questions he answered at
//      /start are never asked again. Best effort: a failed reconcile must not stop him getting in.
//
// Only then is a session opened. If the session write fails he is told, rather than being handed a
// cookie that means nothing and a page that will bounce him straight back here.

// ⚠️ THE DESTINATION SURVIVES A WRONG CODE. He is one digit from where he was going, so losing it
// here would be the second time we sent him back to the beginning.
function back(req: NextRequest, reason: string, next: string = AFTER_SIGN_IN) {
  const q = next === AFTER_SIGN_IN ? '' : `&next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(new URL(`/in?step=code&e=${reason}${q}`, req.url), 303);
}

export async function POST(req: NextRequest) {
  if (!originAllowed(req.headers.get('origin'), req.headers.get('host'))) {
    return NextResponse.redirect(new URL('/in?e=origin', req.url), 303);
  }
  if (!webSessionsConfigured()) return NextResponse.redirect(new URL('/in?e=unavailable', req.url), 303);

  const form = await req.formData().catch(() => null);
  if (!form) return back(req, 'bad');

  // The contact we actually sent to, and the channel we sent on. Read from the signed cookie, never
  // from the form: a verify that trusted a posted contact would let a man send a code to something
  // he controls and then exchange it for somebody else's account.
  const pending = verifyPendingCookie(req.cookies.get(PENDING_COOKIE)?.value ?? null);
  if (!pending) return NextResponse.redirect(new URL('/in?e=expired', req.url), 303);

  // Where he was heading. safeNext() allowlists /app and below, so this cannot be turned into an
  // open redirect off our own sign in page. See lib/websession.ts.
  const next = safeNext(form.get('next'));

  const code = String(form.get('code') ?? '').replace(/\D/g, '');
  if (code.length < 4 || code.length > 8) return back(req, 'code', next);

  // Guessing a six digit code is a five in a million shot per attempt, which is only safe while the
  // attempts are capped. Ten per number per fifteen minutes, and a wider net per source so one
  // machine cannot work through many numbers at once.
  const hash = targetHash(pending.value, process.env.WEB_SESSION_SECRET || '');
  if (await rateLimitedShared(`otpv:t:${hash}`, PER_TARGET_VERIFIES, PER_TARGET_WINDOW_SECONDS * 1000)) {
    return back(req, 'toomany', next);
  }
  if (await rateLimitedShared(`otpv:ip:${clientIp(req)}`, PER_SOURCE_VERIFIES, PER_SOURCE_WINDOW_SECONDS * 1000)) {
    return back(req, 'toomany', next);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !anon) return NextResponse.redirect(new URL('/in?e=unavailable', req.url), 303);

  let accessToken = '';
  try {
    const res = await fetch(`${url}/auth/v1/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anon },
      // GoTrue wants a different type and a different field per channel. One login, two doors.
      body: JSON.stringify(
        pending.channel === 'sms'
          ? { type: 'sms', phone: pending.value, token: code }
          : { type: 'email', email: pending.value, token: code },
      ),
    });
    if (!res.ok) return back(req, 'code', next);
    const json = (await res.json()) as { access_token?: string };
    accessToken = json.access_token || '';
  } catch {
    return back(req, 'send', next);
  }
  if (!accessToken) return back(req, 'code', next);

  // ⚠️ THE IDENTITY COMES FROM SUPABASE, NEVER FROM US. We hand the token straight back to GoTrue
  // and let it say who this is, exactly as every authed route already does. Then we throw the token
  // away: it never reaches the browser, so there is nothing on the page for a script to steal.
  const user = await verifyAccessToken(accessToken);
  if (!user) return back(req, 'code', next);

  // The phone is the account key, always. On the email door the verified user already has one, and
  // user.phone is what GoTrue holds for him; on the phone door it is the number we just proved.
  // Never the form, never the cookie's value when that value is an address.
  await ensureUserRow(user.id, pending.channel === 'sms' ? pending.value : (user.phone || ''));

  // The six questions he answered at /start, carried onto the account. Idempotent and guarded by
  // reconciled_at, so signing in again does not re-apply anything. Best effort on purpose: a man
  // must never be locked out of his own books because a profile field would not save.
  await reconcileSignupToUser(user.id).catch(() => null);

  // ⚠️ THE "REMEMBER MY BROWSER" BOX, AND THE ABSENT VALUE IS THE SAFE ONE. An unticked checkbox
  // simply does not post its field, so anything other than the tick reads as not remembered,
  // including a crafted post that omits it. Unremembered means three things that must agree: a
  // short expiry on the row, the same short expiry inside the signed cookie, and cookie
  // attributes with no Max-Age so the browser drops it on close. The row records the choice,
  // because the row is what lib/webauth.ts consults when deciding whether a session may slide.
  const remembered = form.get('remember') === 'on';
  const ttlSeconds = remembered ? SESSION_TTL_SECONDS : SESSION_TTL_UNREMEMBERED_SECONDS;

  const sessionId = newSessionId();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  const opened = await createWebSession(user.id, sessionId, expiresAt, remembered);
  if (!opened) return back(req, 'session', next);

  const cookie = sessionCookieValue(sessionId, new Date(), ttlSeconds);
  if (!cookie) return back(req, 'unavailable', next);

  const res = NextResponse.redirect(new URL(next, req.url), 303);
  res.cookies.set(
    SESSION_COOKIE,
    cookie,
    remembered ? sessionCookieAttributes() : browserSessionCookieAttributes(),
  );
  // The pending contact is spent. Clear it rather than leaving a signed contact in his browser.
  res.cookies.set(PENDING_COOKIE, '', sessionCookieAttributes(0));
  return res;
}

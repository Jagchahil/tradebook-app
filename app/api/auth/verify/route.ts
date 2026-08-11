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
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 7 AUGUST 2026. THE LINE THAT DIVIDES THIS FILE, AND EVERY BRANCH BELOW IT USED TO LIE.
//
// GoTrue's /auth/v1/verify is where the code is handed in. A NON ok response means it was refused
// and the code is untouched, so 'code' is the honest answer and "try again" is honest advice.
//
// EVERYTHING AFTER THAT POINT IS HOLDING A SPENT CODE. A one time code that has been accepted is
// gone: the users row failing to write, the session row failing to write, the cookie failing to
// sign, our own token check failing, none of them un-spend it. Every one of those branches used to
// put him back on the code step in front of the box he had just typed into, under a sentence
// ending "Try again in a minute". The only action offered was the one action that could never work
// again, and after two goes he reads "That code did not work" and concludes he is locked out.
//
// So every failure past the exchange returns 'session', whose sentence on app/in/page.tsx tells him
// plainly that the code may be used up and to ask for a fresh one, and the code step now carries a
// "Send the code again" button so that asking costs him one press and no retyping.
//
// ⚠️ NEVER INVITE AN ACTION THAT CANNOT WORK. That is the whole rule, and the reason 'code' and
// 'unavailable' must not appear below the exchange even though both are perfectly good sentences
// somewhere else in this door.
// ═══════════════════════════════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 TWO TYPES ON THE EMAIL DOOR, AND BOTH OF THEM ARE HIS OWN CODE.
  //
  // Since 11 August /api/auth/start mints the email code through admin generate_link and posts it
  // through Resend, so that a Supabase mailer outage cannot lock a customer out again. GoTrue files
  // a code minted that way under 'magiclink'. A code minted the old way, by /auth/v1/otp, is filed
  // under 'email'. Both are live at once: the old road is still the fallback, and a code sent five
  // minutes before a deploy must still work five minutes after it.
  //
  // ⚠️ SO A REFUSAL IS ONLY A REFUSAL ONCE BOTH TYPES HAVE SAID NO. Pinning one type would have
  // turned every fallback send into "that code is wrong" for a man holding a code that was right,
  // which is the same lie this run was spent removing from the other half of the door.
  //
  // This costs one extra request, only on a code that has already failed once, only on email.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const attempts: Array<Record<string, string>> = pending.channel === 'sms'
    ? [{ type: 'sms', phone: pending.value, token: code }]
    : [
      { type: 'email', email: pending.value, token: code },
      { type: 'magiclink', email: pending.value, token: code },
    ];

  let accessToken = '';
  try {
    let res: Response | null = null;
    for (const body of attempts) {
      res = await fetch(`${url}/auth/v1/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: anon },
        body: JSON.stringify(body),
      });
      if (res.ok) break;
    }
    // ⚠️ THE ONE HONEST 'code' IN THE FILE, AND THE LAST LINE ON WHICH THE CODE IS STILL HIS.
    // GoTrue refused it, so it was never handed in, so typing another one really is the fix.
    if (!res || !res.ok) return back(req, 'code', next);
    const json = (await res.json()) as { access_token?: string };
    accessToken = json.access_token || '';
  } catch {
    // A throw covers the fetch failing before GoTrue saw the code AND the body failing to read
    // after a 200, which is a code already handed in. We cannot tell which, and 'send' was in any
    // case the wrong word here: nothing was being sent. The one action that works whichever
    // happened is asking for a fresh code, so that is what he is told.
    return back(req, 'session', next);
  }
  // A 200 with no token in it. The code was accepted to get that 200, so it is spent.
  if (!accessToken) return back(req, 'session', next);

  // ⚠️ THE IDENTITY COMES FROM SUPABASE, NEVER FROM US. We hand the token straight back to GoTrue
  // and let it say who this is, exactly as every authed route already does. Then we throw the token
  // away: it never reaches the browser, so there is nothing on the page for a script to steal.
  const user = await verifyAccessToken(accessToken);
  // 🔴 'session', NOT 'code'. GoTrue took the code and gave us a token, so the code is gone. A
  // failure here is OUR second call not answering, and "That code did not work. Check the email and
  // try again." sends him back to the one code that is guaranteed to be refused from now on.
  if (!user) return back(req, 'session', next);

  // The phone is the account key, always. On the email door the verified user already has one, and
  // user.phone is what GoTrue holds for him; on the phone door it is the number we just proved.
  // Never the form, never the cookie's value when that value is an address.
  //
  // 🔴 THE RESULT IS CHECKED, AND IT USED NOT TO BE, WHILE THE SIGNUP DOOR ALWAYS CHECKED IT.
  // ensureUserRow returns false on a write that did not land. /api/signup/verify treats that as a
  // 502 and refuses to open a session. This door carried on and minted one anyway, so a man was
  // handed a cookie pointing at a user id with no public.users row behind it and dropped on /app,
  // where every read is empty and nothing says why. Same function, same failure, and the door that
  // ignored it is the one he uses every day.
  const rowOk = await ensureUserRow(
    user.id, pending.channel === 'sms' ? pending.value : (user.phone || ''),
  );
  if (!rowOk) return back(req, 'session', next);

  // The six questions he answered at /start, carried onto the account. Idempotent and guarded by
  // reconciled_at, so signing in again does not re-apply anything. Best effort on purpose: a man
  // must never be locked out of his own books because a profile field would not save.
  //
  // ⚠️ THE ADDRESS MUST BE PASSED OR THIS IS A GUARANTEED NO OP FOR EVERY WEB CUSTOMER.
  // reconcileSignupToUser matches on the account's phone, and falls back to the verified address
  // only when it is given one. A web minted account has an EMPTY phone_number by design, so with no
  // second argument the match string is empty and the function returns before reading anything.
  // /api/signup/verify passes it. This door did not, which is exactly the case it matters in: a man
  // whose /start answers landed after his signup verify ran has an unreconciled row, and signing in
  // is the natural place to pick it up.
  await reconcileSignupToUser(user.id, user.email || null).catch(() => null);

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
  // 🔴 'session', NOT 'unavailable'. "Signing in is not available right now. Try again shortly." is
  // the right sentence at the top of this file, where the code has not been spent yet. Here it is
  // an invitation to retype a dead code, and it also strands a session row nobody can now use.
  if (!cookie) return back(req, 'session', next);

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

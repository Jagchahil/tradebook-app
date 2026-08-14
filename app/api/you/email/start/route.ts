import { NextRequest, NextResponse } from 'next/server';
import { rateLimitedShared, spendCapReached, clientIp } from '../../../../../lib/ratelimit';
import { sessionUser, identityForUser } from '../../../../../lib/webauth';
import { provedEmailOwner, createSignupCode, logAuthSend } from '../../../../../lib/supabase';
import { targetHash } from '../../../../../lib/logindoor';
import {
  pendingCookieValue, sessionCookieAttributes, webSessionsConfigured, PENDING_TTL_SECONDS,
} from '../../../../../lib/websession';
import { looksLikeEmail, sendSignupCodeEmail } from '../../../../../lib/email';
import { normaliseEmail } from '../../../../../lib/trialidentity';
import { newCode, hashCode, expiresAt, signupCodesConfigured } from '../../../../../lib/signupcode';
import { EMAIL_BIND_COOKIE } from '../../../../app/you/identity';

export const runtime = 'nodejs';

// ADD YOUR EMAIL, STEP ONE. A signed in man with no proved address asks for a code.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE 29 JULY TAKEOVER FIX IS THE LAW HERE. An email may only resolve to an account through a
// link made AFTER the address was proved, and an address that already belongs to another account
// is REFUSED, never moved, with a sentence that cannot say whose it is. See the section header
// over provedEmailOwner in lib/supabase.ts, and app/app/you/identity.ts for the sentence.
//
// ⚠️ WHAT THIS ROUTE IS AND IS NOT. It is not a sign in door and it is not a signup door: no
// account is created, no session is minted, and nothing here runs for a stranger. The ONLY caller
// is an authenticated session, which changes the abuse shape entirely: /api/auth/start defends a
// public button against every number on earth, while this defends a private one against a signed
// in account being scripted. So the send is refused before anything else when there is no session,
// and every limiter below is keyed on the ACCOUNT as well as the address.
//
// THE MACHINERY IS THE SIGNUP'S, ON PURPOSE. The code comes from lib/signupcode.ts (CSPRNG, six
// digits, stored only as an HMAC bound to the address, five guesses, ten minutes, single use) and
// the email goes through sendSignupCodeEmail in lib/email.ts, the one Resend sender the signup
// already trusts. A second code shape or a second sender would be a second thing to get wrong.
//
// ⚠️ THE ADDRESS RIDES A SIGNED COOKIE TO THE CODE STEP, NEVER THE URL. Same rule and same signer
// as the sign in flow's pending cookie, under its own name so the two flows cannot read each
// other. An address in a query string is an address in his history and in every Referer the page
// leaks.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// Per address and per account. A man needs one code and occasionally a second; these cover the
// second and refuse the fortieth. The daily ceiling guards our sending reputation and FAILS
// CLOSED, same posture as every spend cap: "we could not count" is "we cannot safely send".
const PER_TARGET_SENDS = 4;
const PER_ACCOUNT_SENDS = 6;
const SEND_WINDOW_SECONDS = 15 * 60;
const DAILY_CAP = 200;
const DAILY_WINDOW_SECONDS = 24 * 60 * 60;

function back(req: NextRequest, code: string) {
  return NextResponse.redirect(new URL(`/app/you/settings?e=${code}`, req.url), 303);
}

export async function POST(req: NextRequest) {
  // The one gate. sessionUser checks the origin on a POST itself, so a cross site form cannot
  // reach past this line even with the cookie attached.
  const user = await sessionUser(req);
  if (!user) return NextResponse.redirect(new URL('/in?next=/app/you/settings', req.url), 303);

  // No signing secret means no pending cookie and no code hash worth storing, so nothing sent
  // could ever be typed back. Say so rather than emailing a dead end.
  if (!webSessionsConfigured() || !signupCodesConfigured()) return back(req, 'unavailable');

  const form = await req.formData().catch(() => null);
  if (!form) return back(req, 'contact');

  const email = String(form.get('email') ?? '').trim().toLowerCase();
  if (!email || email.length > 254 || !looksLikeEmail(email)) return back(req, 'contact');

  // ⚠️ ALREADY HAS ONE MEANS NO. This flow adds a first address; it is not an email change. The
  // identity is read fresh rather than trusted from the page, because the page's knowledge is a
  // render old. identityForUser resolves through GoTrue on the cookie path.
  const identity = await identityForUser(user);
  if (identity.email) return back(req, 'have');

  // Rate limited on the NORMALISED address, exactly as the signup door is, so plus tags and gmail
  // dots cannot buy fresh buckets against one inbox. The account key stops one signed in session
  // spraying codes at many addresses.
  const secret = process.env.WEB_SESSION_SECRET || '';
  const emailNorm = normaliseEmail(email) || email;
  const hash = targetHash(emailNorm, secret);

  if (await rateLimitedShared(`bem:u:${user.id}`, PER_ACCOUNT_SENDS, SEND_WINDOW_SECONDS * 1000)) {
    await logAuthSend('email', hash, 'refused_rate');
    return back(req, 'toomany');
  }
  if (await rateLimitedShared(`bem:t:${hash}`, PER_TARGET_SENDS, SEND_WINDOW_SECONDS * 1000)) {
    await logAuthSend('email', hash, 'refused_rate');
    return back(req, 'toomany');
  }
  if (await rateLimitedShared(`bem:ip:${clientIp(req)}`, PER_ACCOUNT_SENDS, SEND_WINDOW_SECONDS * 1000)) {
    await logAuthSend('email', hash, 'refused_rate');
    return back(req, 'toomany');
  }

  // 🔴 WHOSE IS THIS ADDRESS. Asked BEFORE anything is sent, because emailing a code to an
  // address that can never be bound wastes the man's ten minutes and teaches him the flow lies.
  // 'another' is the refusal the takeover fix demands. Null is "we could not read", which is not
  // "nobody's": the one check that keeps another man's address off this account fails closed.
  const owner = await provedEmailOwner(user.id, email);
  if (owner === null) return back(req, 'unavailable');
  if (owner === 'another') {
    await logAuthSend('email', hash, 'refused_unknown');
    return back(req, 'taken');
  }

  // The ceiling, atomic and shared, and honest when it fires: a real customer deserves better
  // than a code that silently never arrives.
  //
  // ⚠️ FAILS OPEN, because this door is already behind a session and bounded to one account. A
  // failing rate_hit RPC means we could not count, not that a limit was reached, and telling a
  // signed in customer he has spent a ceiling he never touched is a lie that also blocks the one
  // action that gives him a working email door. See spendCapReached for the split by door.
  if (await spendCapReached('bem:daily', DAILY_CAP, DAILY_WINDOW_SECONDS, false)) {
    await logAuthSend('email', hash, 'refused_capped');
    return back(req, 'capped');
  }

  // The row goes down BEFORE the email goes out, the signup route's own reasoning: the other
  // order sends a man a code we have no record of, and six correct digits get called wrong.
  const code = newCode();
  const stored = await createSignupCode(email, emailNorm, hashCode(emailNorm, code), expiresAt());
  if (!stored) {
    await logAuthSend('email', hash, 'failed');
    return back(req, 'send');
  }

  const sent = await sendSignupCodeEmail(email, code);
  // Never the address, and NEVER the code. The audit row carries a keyed hash and an outcome.
  await logAuthSend('email', hash, sent ? 'sent' : 'failed');
  if (!sent) return back(req, 'send');

  // Onward to the code step, with the address in a signed cookie and nowhere else.
  const res = NextResponse.redirect(new URL('/app/you/settings?bind=code', req.url), 303);
  res.cookies.set(
    EMAIL_BIND_COOKIE,
    pendingCookieValue({ channel: 'email', value: email }),
    sessionCookieAttributes(PENDING_TTL_SECONDS),
  );
  return res;
}

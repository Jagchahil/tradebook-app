import { NextRequest, NextResponse } from 'next/server';
import { rateLimitedShared, clientIp } from '../../../../lib/ratelimit';
import { targetHash } from '../../../../lib/logindoor';
import {
  verifyAccessToken, createWebSession, ensureUserRow, reconcileSignupToUser,
  latestSignupIdentity, grantTrialWithIdentity,
} from '../../../../lib/supabase';
import {
  SESSION_COOKIE, SESSION_TTL_SECONDS, newSessionId, originAllowed,
  sessionCookieAttributes, sessionCookieValue, webSessionsConfigured,
} from '../../../../lib/websession';
import { looksLikeEmail } from '../../../../lib/email';
import { normaliseEmail, refusalNote } from '../../../../lib/trialidentity';

export const runtime = 'nodejs';

// HE TYPED THE CODE, AND THIS IS WHERE THE ACCOUNT BECOMES REAL.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE PHONE HE TYPED IS NOT WRITTEN TO users.phone_number, AND THAT IS THE WHOLE SECURITY
// PROPERTY OF THE EMAIL FIRST DECISION.
//
// The old rule was "an account must never be keyed to a phone nobody has proved", and it was right.
// It is preserved here, not relaxed: the column stays empty until the number is proved, because
// users.phone_number is not a label, it is a send target and a match key. The daily digest cron,
// the agent cron and the nudge fan out all SEND to it, and inbound WhatsApp resolves a message to
// an account BY it. Write one mistyped digit there and a stranger receives this man's weekly
// figures, and can feed his books.
//
// So the typed number stays on the signups row, which is exactly what it is: something somebody
// typed. Twilio therefore blocks WhatsApp capture and nothing else, which is what makes launch one
// possible without it.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ NO PENDING COOKIE HERE, UNLIKE /api/auth/verify, AND THE DIFFERENCE IS DELIBERATE.
//
// That route reads the contact from a signed cookie because its identifier is a PHONE NUMBER, and
// a phone number must never be written into a URL, a history entry or a Referer header. It also
// had to stop a man exchanging a code sent to his own device for somebody else's account.
//
// Neither applies here. GoTrue validates the address and the token AS A PAIR, so a posted address
// that we never sent to simply fails, and every fact used after this point comes from the verified
// identity GoTrue hands back rather than from the form. Adding a second cookie mechanism beside
// the sign in one would be new surface in the most sensitive corner of the codebase, bought for
// nothing.
//
// FOUR THINGS HAPPEN, IN THIS ORDER, AND THE ORDER MATTERS:
//
//   1. The code is proved. Nothing below runs otherwise.
//   2. The users row is created, WITHOUT a phone.
//   3. His /start answers are reconciled onto it, joined by the address he just proved.
//   4. The trial is granted against the ACCOUNT, carrying every identifier we hold.
//
// Three and four are best effort. A man must never be left without an account because a profile
// field would not save, and he must never be left without his books because a billing row would
// not write. Only the session is allowed to fail him, because a cookie that means nothing is worse
// than an honest error.

const PER_TARGET_VERIFIES = 10;
const PER_TARGET_WINDOW_SECONDS = 15 * 60;
const PER_SOURCE_VERIFIES = 40;
const PER_SOURCE_WINDOW_SECONDS = 15 * 60;

export async function POST(req: NextRequest) {
  if (!originAllowed(req.headers.get('origin'), req.headers.get('host'))) {
    return NextResponse.json({ error: 'origin' }, { status: 403 });
  }
  if (!webSessionsConfigured()) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  let body: { email?: unknown; code?: unknown } = {};
  try {
    body = (await req.json()) as { email?: unknown; code?: unknown };
  } catch {
    return NextResponse.json({ error: 'bad' }, { status: 400 });
  }

  const email = String(body.email ?? '').trim().toLowerCase();
  const code = String(body.code ?? '').replace(/\D/g, '');
  if (!looksLikeEmail(email) || email.length > 254) return NextResponse.json({ error: 'email' }, { status: 400 });
  if (code.length < 4 || code.length > 8) return NextResponse.json({ error: 'code' }, { status: 400 });

  // A six digit code is a one in a million guess per attempt, which is only safe while the attempts
  // are capped. Capped on the normalised address so tags cannot buy fresh buckets.
  const hash = targetHash(normaliseEmail(email) || email, process.env.WEB_SESSION_SECRET || '');
  if (await rateLimitedShared(`supv:t:${hash}`, PER_TARGET_VERIFIES, PER_TARGET_WINDOW_SECONDS * 1000)) {
    return NextResponse.json({ error: 'toomany' }, { status: 429 });
  }
  if (await rateLimitedShared(`supv:ip:${clientIp(req)}`, PER_SOURCE_VERIFIES, PER_SOURCE_WINDOW_SECONDS * 1000)) {
    return NextResponse.json({ error: 'toomany' }, { status: 429 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !anon) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  let accessToken = '';
  try {
    const res = await fetch(`${url}/auth/v1/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anon },
      body: JSON.stringify({ type: 'email', email, token: code }),
    });
    if (!res.ok) return NextResponse.json({ error: 'code' }, { status: 400 });
    const json = (await res.json()) as { access_token?: string };
    accessToken = json.access_token || '';
  } catch {
    return NextResponse.json({ error: 'send' }, { status: 502 });
  }
  if (!accessToken) return NextResponse.json({ error: 'code' }, { status: 400 });

  // ⚠️ THE IDENTITY COMES FROM SUPABASE, NEVER FROM US. We hand the token straight back to GoTrue
  // and let it say who this is, exactly as every authed route already does, then throw the token
  // away. It never reaches the browser, so there is nothing on the page for a script to steal.
  const user = await verifyAccessToken(accessToken);
  if (!user) return NextResponse.json({ error: 'code' }, { status: 400 });

  // The address as GoTrue holds it, not as the form spelled it.
  const verifiedEmail = (user.email || email).trim().toLowerCase();

  // 🔴 EMPTY PHONE. See the header. user.phone is whatever GoTrue has, which for an email signup is
  // nothing, and passing it through rather than the typed number is what keeps that true.
  const rowOk = await ensureUserRow(user.id, user.phone || '');
  if (!rowOk) return NextResponse.json({ error: 'account' }, { status: 502 });

  // His /start answers, carried onto the account so nothing is asked twice. Best effort on purpose.
  await reconcileSignupToUser(user.id, verifiedEmail).catch(() => null);

  // The trial. The identity is read off his own signup row rather than the request body, so a
  // crafted post cannot hand us a clean name and number to get past the duplicate check.
  let trialNote: string | null = null;
  try {
    const ident = await latestSignupIdentity(verifiedEmail);
    const grant = await grantTrialWithIdentity({
      userId: user.id,
      email: verifiedEmail,
      signupPhone: ident?.phone ?? null,
      personName: ident?.personName ?? null,
      businessName: ident?.businessName ?? null,
    });
    // He is IN either way. A refused trial is not a refused account: he still has his books, and
    // the only difference is that he is asked for a card sooner. Telling him plainly beats letting
    // him discover it when something stops working.
    if (!grant.granted && grant.refusedOn && grant.refusedOn !== 'account') {
      trialNote = refusalNote(grant.refusedOn);
    }
  } catch {
    // A billing row that would not write must never cost a man his account.
  }

  const sessionId = newSessionId();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const opened = await createWebSession(user.id, sessionId, expiresAt);
  if (!opened) return NextResponse.json({ error: 'session' }, { status: 502 });

  const cookie = sessionCookieValue(sessionId);
  if (!cookie) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  const res = NextResponse.json({ ok: true, redirect: '/app', trialNote });
  res.cookies.set(SESSION_COOKIE, cookie, sessionCookieAttributes());
  return res;
}

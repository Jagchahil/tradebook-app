import { NextRequest, NextResponse } from 'next/server';
import { rateLimitedShared, clientIp } from '../../../../lib/ratelimit';
import { targetHash } from '../../../../lib/logindoor';
import {
  createWebSession, ensureUserRow, reconcileSignupToUser, latestSignupIdentity,
  grantTrialWithIdentity, readLatestSignupCode, bumpSignupCodeAttempt, consumeSignupCode,
  findAuthUserIdForEmail, createConfirmedAuthUser, setSignupUserId, ensureSignupBridge,
} from '../../../../lib/supabase';
import {
  SESSION_COOKIE, SESSION_TTL_SECONDS, newSessionId, originAllowed,
  sessionCookieAttributes, sessionCookieValue, webSessionsConfigured,
} from '../../../../lib/websession';
import { looksLikeEmail } from '../../../../lib/email';
import { normaliseEmail, refusalNote } from '../../../../lib/trialidentity';
import {
  verifyStoredCode, codeMessage, isCodeShape, signupCodesConfigured,
} from '../../../../lib/signupcode';
import { sendWelcomeEmail } from '../../../../lib/email';

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
// a phone number must never be written into a URL, a history entry or a Referer header.
//
// Here the identifier is an email and the code is bound to it CRYPTOGRAPHICALLY: the stored value
// is an HMAC over the address and the code together, so a code issued to one address can never
// validate against another. Posting somebody else's address with a code you were sent does not
// work, because the hash will not match. The cookie would be adding a second mechanism to enforce
// something the hash already enforces, and new surface in this corner is not bought cheaply.
//
// FIVE THINGS HAPPEN, IN THIS ORDER, AND EVERY ONE OF THE ORDERINGS IS LOAD BEARING:
//
//   1. The attempt is COUNTED, before anything is compared. An abandoned request is not a free guess.
//   2. The code is checked. Spent, burnt and expired are all decided before the digits are compared,
//      so no dead row can be revived by a lucky one.
//   3. The code is SPENT, conditionally, in the database. Two requests carrying one valid code
//      cannot both proceed.
//   4. Only now does the account exist: the auth user, then the users row WITHOUT a phone.
//   5. His answers, his trial and his session.
//
// The reconcile and the trial are best effort. A man must never be left without an account because
// a profile field would not save, nor without his books because a billing row would not write. Only
// the session is allowed to fail him, because a cookie that means nothing is worse than an honest
// error.

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

  if (!signupCodesConfigured()) return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  if (!isCodeShape(code)) return NextResponse.json({ error: 'code' }, { status: 400 });

  const verifiedEmail = email;
  const emailNorm = normaliseEmail(email) || email;

  const row = await readLatestSignupCode(emailNorm);

  // ⚠️ THE ATTEMPT IS COUNTED BEFORE THE COMPARISON, AND THAT ORDER IS THE GUARD.
  //
  // Counting afterwards looks tidier and is the hole: a request abandoned, timed out, or dropped
  // between comparing and writing is a FREE GUESS, and free guesses are the whole attack. Counting
  // first means the worst case is an honest man burning one of five on a bad connection, which
  // costs him a tap on "Send it again".
  if (row) await bumpSignupCodeAttempt(row.id);

  const verdict = verifyStoredCode(row, emailNorm, code);
  if (verdict !== 'ok') {
    // The reason is specific on purpose. "Try again" is useless advice for a code that can no
    // longer work however carefully he types it, and an expired code is not his mistake.
    return NextResponse.json({ error: 'code', message: codeMessage(verdict) }, { status: 400 });
  }

  // 🔴 SPENDING IT IS THE DATABASE'S DECISION, NOT OURS.
  //
  // Two requests carrying the same valid code both pass the check above, because both read the row
  // before either wrote to it. Only one of them gets a row back from consumeSignupCode, which
  // filters on consumed_at being null. The loser is refused here rather than being handed a second
  // session on one proof.
  const spent = await consumeSignupCode(row!.id);
  if (!spent) return NextResponse.json({ error: 'code', message: codeMessage('spent') }, { status: 400 });

  // 🔴 THE AUTH USER IS CREATED ONLY NOW, ON THE FAR SIDE OF THE PROOF.
  //
  // An address that already has an account resolves to it and he simply ends up in his own books,
  // which is the right outcome for a man who forgot he had signed up and gives nothing away to
  // anybody who did not just read his inbox.
  const existingId = await findAuthUserIdForEmail(verifiedEmail);
  const userId = existingId ?? (await createConfirmedAuthUser(verifiedEmail));
  if (!userId) return NextResponse.json({ error: 'account' }, { status: 502 });

  // 🔴 EMPTY PHONE. See the header. Nothing here has proved a number, so nothing here writes one.
  const rowOk = await ensureUserRow(userId, '');
  if (!rowOk) return NextResponse.json({ error: 'account' }, { status: 502 });

  // The bridge from this address to this account, so the sign in door can find him tomorrow without
  // going through a phone number he has deliberately never proved.
  await setSignupUserId(verifiedEmail, userId);

  // 🔴 AND THE BRIDGE IS CONFIRMED, NOT ASSUMED. THIS IS NOT BELT AND BRACES.
  //
  // setSignupUserId patches a row. When /api/onboard did not save one, and it does not save one
  // whenever the database wobbled or its bot trap fired, there is nothing to patch and the patch
  // succeeds silently. The email sign in door then cannot find him for ever, because
  // findContactAccount resolves an address only through signups.user_id. He keeps the session he
  // is holding, so nothing looks wrong tonight, and he is locked out tomorrow morning with the
  // same neutral screen a stranger gets. Found on a real signup, 6 August 2026.
  //
  // ensureSignupBridge lays the row down only when NOBODY holds this address. It refuses when
  // another account holds it and when the check cannot be read, so it can never move a link.
  await ensureSignupBridge(userId, verifiedEmail);

  // His /start answers, carried onto the account so nothing is asked twice. Best effort on purpose.
  await reconcileSignupToUser(userId, verifiedEmail).catch(() => null);

  // The trial. The identity is read off his own signup row rather than the request body, so a
  // crafted post cannot hand us a clean name and number to get past the duplicate check.
  let trialNote: string | null = null;
  const ident = await latestSignupIdentity(verifiedEmail);
  try {
    const grant = await grantTrialWithIdentity({
      userId,
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

  // Welcome him, now that there is something to welcome him to. Only on a NEW account: a man
  // signing back in after forgetting does not need telling he has joined.
  if (!existingId) void sendWelcomeEmail(verifiedEmail, ident?.personName ?? null).catch(() => {});

  const sessionId = newSessionId();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  // Remembered, deliberately. The signup door has no "Remember my browser" box: he is minutes
  // from a ten step setup on this very browser, and a session that dies mid setup costs him a
  // second emailed code for no protection he asked for. A man signing up at a shared machine can
  // sign out when he is done, and his NEXT sign in, at /in, is where the box lives.
  const opened = await createWebSession(userId, sessionId, expiresAt, true);
  if (!opened) return NextResponse.json({ error: 'session' }, { status: 502 });

  const cookie = sessionCookieValue(sessionId);
  if (!cookie) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  // 🔴 STRAIGHT INTO SETUP, NOT ONTO AN EMPTY DASHBOARD.
  //
  // This used to send him to /app, which on his first day is a screen with nothing on it: no
  // confirmed money, no bank, no figures. He proved his email and was shown a blank. Setting up is
  // the thing that puts numbers on that screen, so it is what happens next, and /app carries a line
  // back to it until it is finished so he is never trapped in a wizard.
  const res = NextResponse.json({ ok: true, redirect: '/app/setup', trialNote });
  res.cookies.set(SESSION_COOKIE, cookie, sessionCookieAttributes());
  return res;
}

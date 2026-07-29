import { NextRequest, NextResponse } from 'next/server';
import { rateLimitedShared, spendCapReached, clientIp } from '../../../../lib/ratelimit';
import { logAuthSend, createSignupCode } from '../../../../lib/supabase';
import { targetHash } from '../../../../lib/logindoor';
import { originAllowed, webSessionsConfigured } from '../../../../lib/websession';
import { looksLikeEmail, sendSignupCodeEmail } from '../../../../lib/email';
import { normaliseEmail } from '../../../../lib/trialidentity';
import { newCode, hashCode, expiresAt, signupCodesConfigured } from '../../../../lib/signupcode';

export const runtime = 'nodejs';

// SEND HIM A CODE SO HE CAN CREATE AN ACCOUNT. The first half of signing up on the web.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ THIS IS A DOOR THAT CREATES ACCOUNTS, WHICH /api/auth/start DELIBERATELY IS NOT.
//
// That route's own header says it plainly: it never sends to a contact that is not already ours,
// because that turns the attack surface from every address on earth into the finite list of people
// who already have an account. Signing UP cannot work that way. Nobody who signs up is already
// ours, so control one is simply not available here, and pretending otherwise would be a comment
// that lies.
//
// What replaces it:
//
//   1. EMAIL, NOT SMS, SO THE UNIT COST IS ROUGHLY NOTHING. /api/auth/start exists in the shadow
//      of a 7p to 10p Twilio message and an attack with a name. An email through Resend has no
//      revenue share for anyone to farm, which is why account creation moved to this channel and
//      not merely why it was convenient.
//   2. A HARD DAILY CAP THAT FAILS CLOSED, because "roughly nothing" is not nothing, and because
//      Supabase caps auth email at 300 an hour project wide. Burning that ceiling would stop
//      EXISTING customers signing in, which is a far worse outcome than a slow signup.
//   3. Per address and per source limits, so one machine cannot work through a list and one man
//      cannot be made to receive forty codes.
//
// ⚠️ AND THE ANSWER NEVER CHANGES SHAPE. A new address, an address that already has an account,
// and a send that failed at the provider all return exactly the same thing. A signup form that
// tells you which addresses are already customers is a customer list with a search box on it.
//
// 🔴 WE GENERATE AND SEND THE CODE OURSELVES, THROUGH RESEND.
//
// The first version leaned on GoTrue's own email. It does not work for signup: for a brand new
// address GoTrue uses the "Confirm sign up" template, which is a LINK flow, and editing that
// template did not take effect in production over nine minutes and four sends.
//
// The obvious unblock was to turn "Confirm email" off, which makes GoTrue send the OTP template.
// That was considered and REFUSED: it sets mailer_autoconfirm for the whole project, applies to
// every flow including email change, and marks every user's address as confirmed whether or not a
// human ever opened that inbox. That is a false fact planted in the auth store for anything
// downstream to trust, traded for one template.
//
// So the code is ours: generated from the CSPRNG, stored only as an HMAC bound to the address, and
// checked by us. NOTHING IS CREATED HERE. No auth user, no users row, no trial, no session. The
// entire footprint of a signup attempt until the code comes back is one row and one email.

// Per address. Low, because a man needs one code and occasionally a second.
const PER_TARGET_SENDS = 4;
const PER_TARGET_WINDOW_SECONDS = 15 * 60;
// Per source. Higher, since a building site or an office can share one address.
const PER_SOURCE_SENDS = 12;
const PER_SOURCE_WINDOW_SECONDS = 60 * 60;
// Project wide, per day. Well under the 300 an hour Supabase allows, so signups can never starve
// sign in.
const DAILY_CAP = 400;
const DAILY_WINDOW_SECONDS = 24 * 60 * 60;

// The neutral answer. Identical for a real send, a refused one, and a provider outage.
function onward() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  if (!originAllowed(req.headers.get('origin'), req.headers.get('host'))) {
    return NextResponse.json({ error: 'origin' }, { status: 403 });
  }
  // No signing secret means no session can be opened at the other end, so sending a code would
  // walk a man into a dead end. Say so rather than emailing him something that cannot work.
  if (!webSessionsConfigured()) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  let body: { email?: unknown } = {};
  try {
    body = (await req.json()) as { email?: unknown };
  } catch {
    return NextResponse.json({ error: 'bad' }, { status: 400 });
  }

  const email = String(body.email ?? '').trim().toLowerCase();
  if (!email || email.length > 254 || !looksLikeEmail(email)) {
    return NextResponse.json({ error: 'email' }, { status: 400 });
  }

  // Rate limited on the NORMALISED address, so plus tags and gmail dots cannot be used to spin up
  // fresh buckets against the same inbox. See lib/trialidentity.ts.
  const secret = process.env.WEB_SESSION_SECRET || '';
  const hash = targetHash(normaliseEmail(email) || email, secret);

  if (await rateLimitedShared(`sup:t:${hash}`, PER_TARGET_SENDS, PER_TARGET_WINDOW_SECONDS * 1000)) {
    await logAuthSend('email', hash, 'refused_rate');
    return NextResponse.json({ error: 'toomany' }, { status: 429 });
  }
  if (await rateLimitedShared(`sup:ip:${clientIp(req)}`, PER_SOURCE_SENDS, PER_SOURCE_WINDOW_SECONDS * 1000)) {
    await logAuthSend('email', hash, 'refused_rate');
    return NextResponse.json({ error: 'toomany' }, { status: 429 });
  }
  // FAILS CLOSED, and being honest when it fires costs nothing: whoever spent the cap already
  // knows, and a real customer deserves better than a code that silently never arrives.
  if (await spendCapReached('sup:daily:email', DAILY_CAP, DAILY_WINDOW_SECONDS)) {
    await logAuthSend('email', hash, 'refused_capped');
    return NextResponse.json({ error: 'capped' }, { status: 429 });
  }

  // No signing secret means no hash we could trust, so there is nothing safe to issue.
  if (!signupCodesConfigured()) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  const emailNorm = normaliseEmail(email) || email;
  const code = newCode();

  // The row goes down BEFORE the email goes out. The other order sends a man a code we have no
  // record of, and he types six correct digits into a screen that tells him they are wrong.
  const stored = await createSignupCode(email, emailNorm, hashCode(emailNorm, code), expiresAt());
  if (!stored) {
    await logAuthSend('email', hash, 'failed');
    // Honest, because the alternative is a man staring at an inbox for a code that was never
    // written down and is never coming.
    return NextResponse.json({ error: 'send' }, { status: 503 });
  }

  const ok = await sendSignupCodeEmail(email, code);

  // Never the address, and NEVER THE CODE. Not in a log, not in an error, not once.
  await logAuthSend('email', hash, ok ? 'sent' : 'failed');
  return onward();
}

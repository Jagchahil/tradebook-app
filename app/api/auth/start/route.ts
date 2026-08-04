import { NextRequest, NextResponse } from 'next/server';
import { rateLimitedShared, spendCapReached, clientIp } from '../../../../lib/ratelimit';
import { findContactAccount, attachEmailToAuthUser, logAuthSend } from '../../../../lib/supabase';
import {
  readIdentifier, targetHash, dailyCapFor, SMS_DAILY_WINDOW_SECONDS,
  PER_TARGET_SENDS, PER_TARGET_WINDOW_SECONDS, PER_SOURCE_SENDS, PER_SOURCE_WINDOW_SECONDS,
} from '../../../../lib/logindoor';
import {
  PENDING_COOKIE, PENDING_TTL_SECONDS, pendingCookieValue, sessionCookieAttributes,
  originAllowed, webSessionsConfigured, safeNext, AFTER_SIGN_IN,
} from '../../../../lib/websession';

export const runtime = 'nodejs';

// SEND HIM A CODE. The first half of signing in, on the web and later in the app.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ THIS IS THE ONLY ENDPOINT IN THE CODEBASE WHERE AN ABUSE LOOP HAS A POUND FIGURE ON IT.
//
// Not compute, not a database read: a Twilio SMS at roughly 7p to 10p (doc 77). The attack has a
// name, SMS pumping, and it is not theoretical: fraudsters control number ranges that earn revenue
// share on delivered messages, point a script at a public "text me a code" button, and farm it.
// Companies have lost six figures over a weekend.
//
// Today the whole exposure is £10.51, because the Twilio account is still on trial and that is the
// entire balance. The moment a card is attached, the ceiling becomes whatever the card allows. THAT
// is why every control below exists before the upgrade rather than after it.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// The controls, in the order they actually matter, not the order they appear:
//
//   1. WE NEVER SEND TO A CONTACT THAT IS NOT ALREADY OURS. This is the one that changes the shape
//      of the problem rather than the size of it: the attack surface stops being every number on
//      earth and becomes the small finite list of people who already have an account.
//   2. A HARD DAILY CAP THAT FAILS CLOSED. spendCapReached, not rateLimitedShared. A worst possible
//      day costs about fifteen pounds and then goes quiet.
//   3. UK mobile shape only, refused in lib/logindoor.ts before anything is spent.
//   4. Per contact and per source limits, so a customer's phone cannot be made to buzz all evening.
//
// ⚠️ AND THE SCREEN NEVER CHANGES. A stranger's number and a customer's number produce the exact
// same next page. A login form that tells you which numbers are customers is a customer list with a
// search box on it.
//
// NO JAVASCRIPT ON THE PAGE THAT POSTS HERE. A plain form, a redirect back, and the whole sign in
// works with scripting off on a five year old Android. See app/in/page.tsx.

// ⚠️ THE DESTINATION SURVIVES AN ERROR TOO. A man who mistypes his address and then loses where he
// was going has been sent back to the start twice, once by us.
function back(req: NextRequest, reason: string, next: string) {
  const q = next === AFTER_SIGN_IN ? '' : `&next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(new URL(`/in?e=${reason}${q}`, req.url), 303);
}

// The neutral outcome. Identical for a contact we know, a contact we do not, and a send that
// failed at the provider. He is asked for the code either way.
function onward(req: NextRequest, channel: 'sms' | 'email', value: string, next: string) {
  const q = next === AFTER_SIGN_IN ? '' : `&next=${encodeURIComponent(next)}`;
  const res = NextResponse.redirect(new URL(`/in?step=code${q}`, req.url), 303);
  res.cookies.set(
    PENDING_COOKIE,
    pendingCookieValue({ channel, value }),
    sessionCookieAttributes(PENDING_TTL_SECONDS),
  );
  return res;
}

export async function POST(req: NextRequest) {
  // SameSite=Lax already refuses a cross site post, but that is the browser's promise. This is ours.
  if (!originAllowed(req.headers.get('origin'), req.headers.get('host'))) return back(req, 'origin', AFTER_SIGN_IN);
  if (!webSessionsConfigured()) return back(req, 'unavailable', AFTER_SIGN_IN);

  const form = await req.formData().catch(() => null);
  if (!form) return back(req, 'bad', AFTER_SIGN_IN);

  // Where he was heading before we asked him to prove who he is. safeNext() allowlists /app and
  // below and returns the dashboard for everything else, so a hand typed parameter cannot turn our
  // own login into a redirector. See lib/websession.ts.
  const next = safeNext(form.get('next'));

  // One field, his email or his mobile. lib/logindoor.ts decides which, and refuses anything that
  // is neither before it can cost us a penny.
  const id = readIdentifier(String(form.get('contact') ?? ''));
  if (!id) return back(req, 'contact', next);

  const secret = process.env.WEB_SESSION_SECRET || '';
  const hash = targetHash(id.value, secret);

  // Per contact first, because that is the thing being billed and the thing being pestered. A man
  // whose number is being hammered by someone else must not get three texts a minute.
  if (await rateLimitedShared(`otp:t:${hash}`, PER_TARGET_SENDS, PER_TARGET_WINDOW_SECONDS * 1000)) {
    await logAuthSend(id.channel, hash, 'refused_rate');
    return back(req, 'toomany', next);
  }
  if (await rateLimitedShared(`otp:ip:${clientIp(req)}`, PER_SOURCE_SENDS, PER_SOURCE_WINDOW_SECONDS * 1000)) {
    await logAuthSend(id.channel, hash, 'refused_rate');
    return back(req, 'toomany', next);
  }

  // CONTROL 1. Is this contact even ours.
  //
  // A throw means we could not read, which is neither yes nor no. Refusing everyone during a
  // database wobble is wrong and so is sending on a guess, so he is told to try again shortly.
  let account;
  try {
    account = await findContactAccount(id.channel, id.value);
  } catch {
    return back(req, 'unavailable', next);
  }

  if (!account) {
    // Not ours. Nothing is sent, and the screen is identical to a successful send.
    await logAuthSend(id.channel, hash, 'refused_unknown');
    return onward(req, id.channel, id.value, next);
  }

  // 🔴 THE EMAIL DOOR ONLY OPENS ON AN ACCOUNT THAT ALREADY EXISTS, AND THIS IS A SECURITY RULE
  // RATHER THAN AN IMPLEMENTATION DETAIL.
  //
  // A signups row is a form somebody filled in. Nobody has proved the number on it. If the email
  // door could CREATE the account from that row, then a man who typed a stranger's mobile and his
  // own address at signup could prove the address, be handed an account keyed to the stranger's
  // number, and start receiving that stranger's WhatsApp receipts. The phone is the account key,
  // so the phone gets proved first, at least once. After that the email door is open for ever.
  if (id.channel === 'email' && !account.userId) {
    await logAuthSend(id.channel, hash, 'refused_unknown');
    return onward(req, id.channel, id.value, next);
  }

  // CONTROL 2. The daily cap, and this one FAILS CLOSED. See spendCapReached.
  //
  // Being honest when it fires costs nothing: an attacker who has spent the cap already knows, and
  // a real customer deserves better than a code that silently never arrives.
  if (await spendCapReached(`otp:daily:${id.channel}`, dailyCapFor(id.channel), SMS_DAILY_WINDOW_SECONDS)) {
    await logAuthSend(id.channel, hash, 'refused_capped');
    return back(req, 'capped', next);
  }

  // Bind the address to the account we already hold, so GoTrue resolves the email code to the SAME
  // auth user his phone resolves to. Without this he gets a second account, his receipts land on
  // one and his session shows the other, and both look like they are working.
  if (id.channel === 'email' && account.userId) {
    await attachEmailToAuthUser(account.userId, id.value);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !anon) return back(req, 'unavailable', next);

  // create_user only where there is genuinely no auth user yet, which after the rule above can only
  // be the phone door for someone who finished the web signup. Those people are exactly who the web
  // app exists for. The users row itself is written in /api/auth/verify, on a proved code, never here.
  const body = id.channel === 'sms'
    ? { phone: id.value, create_user: !account.userId }
    : { email: id.value, create_user: false };

  let ok = false;
  try {
    const res = await fetch(`${url}/auth/v1/otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anon },
      body: JSON.stringify(body),
    });
    ok = res.ok;
  } catch {
    ok = false;
  }

  // Never log the number or the address. Both are personal data and the number is the account key.
  await logAuthSend(id.channel, hash, ok ? 'sent' : 'failed');

  // Even a failed send goes onward, so a provider outage looks the same as a stranger's number and
  // neither leaks. He types a code that does not work and is told plainly to try again.
  return onward(req, id.channel, id.value, next);
}

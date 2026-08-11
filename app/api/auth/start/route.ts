import { NextRequest, NextResponse } from 'next/server';
import { rateLimitedShared, spendCapReached, clientIp } from '../../../../lib/ratelimit';
import { findContactAccount, attachEmailToAuthUser, logAuthSend, mintSignInCode } from '../../../../lib/supabase';
import { sendSignInCodeEmail, hasEmailConfig } from '../../../../lib/email';
import {
  readIdentifier, targetHash, dailyCapFor, SMS_DAILY_WINDOW_SECONDS,
  PER_TARGET_SENDS, PER_TARGET_WINDOW_SECONDS, PER_SOURCE_SENDS, PER_SOURCE_WINDOW_SECONDS,
} from '../../../../lib/logindoor';
import {
  PENDING_COOKIE, PENDING_TTL_SECONDS, pendingCookieValue, sessionCookieAttributes,
  originAllowed, webSessionsConfigured, safeNext, AFTER_SIGN_IN, verifyPendingCookie,
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

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE MINUTE BETWEEN ONE CODE AND THE NEXT, KEPT BY THE BROWSER RATHER THAN BY US.
//
// GoTrue will not mint a second code for the same user inside sixty seconds. That is its rule, not
// ours, and it is not negotiable from here. So a "Send the code again" button that simply posted
// would, inside that minute, get a 429, fall through the neutral path below, and tell him another
// code was on its way when none was. A button that lies is worse than no button.
//
// This cookie is the countdown, and it has no contents worth signing: its mere PRESENCE means we
// sent something less than a minute ago, and the browser deletes it on the sixtieth second without
// being asked. That is the only clock a page shipping zero JavaScript can keep.
//
// ⚠️ IT IS A KINDNESS, NOT A CONTROL. Anyone can delete his own cookie, and then the request lands
// on the per contact and per source limits below exactly as it does today. Nothing here is load
// bearing for abuse, and it is deliberately checked BEFORE those limits so that a press inside the
// minute costs him nothing: the whole complaint was that asking again spent one of his three.
const RESEND_COOKIE = 'lek_w';
const RESEND_WAIT_SECONDS = 60;

// ⚠️ THE DESTINATION SURVIVES AN ERROR TOO. A man who mistypes his address and then loses where he
// was going has been sent back to the start twice, once by us.
function back(req: NextRequest, reason: string, next: string) {
  const q = next === AFTER_SIGN_IN ? '' : `&next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(new URL(`/in?e=${reason}${q}`, req.url), 303);
}

// 🔴 AND THE TWO REFUSALS THAT MUST LEAVE HIM STANDING WHERE HE IS.
//
// back() drops him on the address form, which is right for every failure that means the door
// itself is not working: starting again begins there. It is wrong for a refusal to send ANOTHER
// code, because he already has one in his inbox and the code step is where he uses it. Bouncing
// him to an empty address field for asking twice would be the same fault the resend was added to
// end, reached from the other side.
function backToCode(req: NextRequest, reason: string, next: string) {
  const q = next === AFTER_SIGN_IN ? '' : `&next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(new URL(`/in?step=code&e=${reason}${q}`, req.url), 303);
}

// The neutral outcome. Identical for a contact we know, a contact we do not, and a send that
// failed at the provider. He is asked for the code either way.
//
// ⚠️ resent ONLY CHANGES WHAT HE IS TOLD, NEVER WHO GETS TOLD IT. A stranger's address and a
// customer's address both reach this function on a resend and both come back with the same
// sentence, so the neutrality rule at the top of this file survives the new button intact.
function onward(req: NextRequest, channel: 'sms' | 'email', value: string, next: string, resent = false) {
  const q = next === AFTER_SIGN_IN ? '' : `&next=${encodeURIComponent(next)}`;
  const said = resent ? '&sent=1' : '';
  const res = NextResponse.redirect(new URL(`/in?step=code${said}${q}`, req.url), 303);
  res.cookies.set(
    PENDING_COOKIE,
    pendingCookieValue({ channel, value }),
    sessionCookieAttributes(PENDING_TTL_SECONDS),
  );
  // The minute starts now, on the first send as much as on a resend. Same attributes as every
  // other cookie this door sets, so it is httpOnly and same site and cannot be read by a script.
  res.cookies.set(RESEND_COOKIE, '1', sessionCookieAttributes(RESEND_WAIT_SECONDS));
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

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // WHO WE ARE SENDING TO, AND WHETHER HE HAS ALREADY ASKED ONCE.
  //
  // One field, his email or his mobile. lib/logindoor.ts decides which, and refuses anything that
  // is neither before it can cost us a penny.
  //
  // 🔴 AND WITH NO FIELD AT ALL, THIS IS THE RESEND. The code step has nowhere to type an address,
  // by design: the contact rides in the signed pending cookie precisely so it never appears in a
  // URL or in browser history. So a post with no contact means "the one you already sent to", read
  // back out of that cookie, verified, and shape checked on the way out by lib/websession.ts.
  //
  // ⚠️ NOTHING NEW CAN BE INTRODUCED THIS WAY. The cookie is signed with WEB_SESSION_SECRET and we
  // minted it ourselves after this same route had already accepted the address. A resend can only
  // ever repeat a send this door has already made.
  //
  // ⚠️ A RESEND WITH NO COOKIE IS 'expired', NOT 'contact'. Fifteen minutes is longer than it takes
  // to read an email and it does run out. Telling a man who pressed a button "that does not look
  // like an email address" when he typed nothing is a sentence about a field he cannot see.
  const typed = String(form.get('contact') ?? '').trim();
  let id: { channel: 'sms' | 'email'; value: string } | null = null;
  let resend = false;
  if (typed) {
    id = readIdentifier(typed);
    if (!id) return back(req, 'contact', next);
  } else {
    const pending = verifyPendingCookie(req.cookies.get(PENDING_COOKIE)?.value ?? null);
    if (!pending) return back(req, 'expired', next);
    id = { channel: pending.channel, value: pending.value };
    resend = true;
  }

  // The two SEND LIMIT refusals, aimed at wherever he actually is. See backToCode above.
  //
  // ⚠️ DELIBERATELY NOT USED BY THE 'unavailable' AND 'capped' RETURNS BELOW. Those four mean the
  // door itself is not working, and the address form is where starting again begins, so they keep
  // back() and the assertions that pin them stay exactly as they were.
  const refuse = (reason: string) => (resend ? backToCode(req, reason, next) : back(req, reason, next));

  // 🔴 THE HONEST MINUTE, AND IT COSTS HIM NOTHING. Checked before the limits below on purpose: a
  // press inside GoTrue's own sixty second interval must not spend one of his three sends, because
  // spending them on presses that could never have sent anything is exactly how a man ran out.
  if (resend && req.cookies.get(RESEND_COOKIE)) return backToCode(req, 'wait', next);

  const secret = process.env.WEB_SESSION_SECRET || '';
  const hash = targetHash(id.value, secret);

  // Per contact first, because that is the thing being billed and the thing being pestered. A man
  // whose number is being hammered by someone else must not get three texts a minute.
  //
  // 🔴 'toosoon', NOT 'toomany', AND THAT IS A FIX RATHER THAN A RENAME.
  //
  // These two limits count SENDS. The ones in /api/auth/verify count TRIES. Both used to end on the
  // same sentence, "Too many tries. Give it a few minutes and try again.", so a man who had typed
  // nothing at all, and had only asked for the code that never arrived, was told he had tried too
  // often. He reads that as an accusation and as a lockout and he stops. Same limit, same wait,
  // different sentence, and the sentence now names the thing he actually did.
  if (await rateLimitedShared(`otp:t:${hash}`, PER_TARGET_SENDS, PER_TARGET_WINDOW_SECONDS * 1000)) {
    await logAuthSend(id.channel, hash, 'refused_rate');
    return refuse('toosoon');
  }
  if (await rateLimitedShared(`otp:ip:${clientIp(req)}`, PER_SOURCE_SENDS, PER_SOURCE_WINDOW_SECONDS * 1000)) {
    await logAuthSend(id.channel, hash, 'refused_rate');
    return refuse('toosoon');
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
    return onward(req, id.channel, id.value, next, resend);
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
    return onward(req, id.channel, id.value, next, resend);
  }

  // CONTROL 2. The daily cap. IT FAILS CLOSED ON THE TEXT DOOR AND OPEN ON THE EMAIL DOOR.
  //
  // Being honest when it fires costs nothing: an attacker who has spent the cap already knows, and
  // a real customer deserves better than a code that silently never arrives.
  //
  // 🔴 THE SPLIT IS NOT A SOFTENING, IT IS THE ORIGINAL REASONING FINALLY APPLIED. spendCapReached
  // was written to protect MONEY, and its own comment promised that "the email door, which costs
  // nothing, keeps working". Since 2 August the email door is the ONLY web door, so a failing
  // rate_hit RPC did not slow sign in down, it shut it, and told every customer we had hit a limit
  // when the truth was that we could not count. Control 1 above has already proved this address
  // belongs to an existing customer, so an email flood here is bounded by our own customer list.
  // The text door keeps the closed posture, because that one spends money on any number typed.
  if (await spendCapReached(
    `otp:daily:${id.channel}`,
    dailyCapFor(id.channel),
    SMS_DAILY_WINDOW_SECONDS,
    id.channel === 'sms',
  )) {
    await logAuthSend(id.channel, hash, 'refused_capped');
    return back(req, 'capped', next);
  }

  // Bind the address to the account we already hold, so GoTrue resolves the email code to the SAME
  // auth user his phone resolves to. Without this he gets a second account, his receipts land on
  // one and his session shows the other, and both look like they are working.
  //
  // 🔴 THE RESULT IS CHECKED, AND IT USED NOT TO BE. THAT WAS TWO DIFFERENT DISASTERS.
  //
  // This PUT is the only thing that makes GoTrue's answer to "who owns this address" agree with
  // ours. The OTP below is then requested BY ADDRESS, so GoTrue, not us, picks the account. With
  // the result thrown away, the request went out anyway:
  //
  //   404, no such auth user   GoTrue has never seen the address, create_user:false matches
  //                            nothing, and NOTHING IS SENT. He is told a code is on its way, on
  //                            every attempt, for ever. The same wall as the 6 August signup
  //                            lockout, reached through a different door.
  //   422 or 409, taken        the address belongs to a DIFFERENT auth user, so the code goes out
  //                            on that account, lands in the same inbox he is sitting in front of,
  //                            works, and SIGNS HIM INTO SOMEBODY ELSE'S BOOKS. Nothing downstream
  //                            compares GoTrue's answer with account.userId, and the audit row for
  //                            it reads a clean 'sent'.
  //
  // ⚠️ THE NEUTRALITY RULE AT THE TOP OF THIS FILE DOES NOT COVER THIS LINE. A stranger and an
  // unbridged signup were both turned away above and both got the neutral screen. By here the
  // address is already known to be ours. A false is not a fact about a stranger, it is a fact about
  // our own infrastructure, so saying so leaks nothing and costs him only a minute.
  if (id.channel === 'email' && account.userId) {
    const attached = await attachEmailToAuthUser(account.userId, id.value);
    if (!attached) return back(req, 'unavailable', next);
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

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE EMAIL CODE GOES THROUGH OUR OWN MAILER FIRST. 11 August 2026, and it was a P0.
  //
  // Four codes asked for over sixty five minutes, none delivered, this screen saying "We have sent
  // you a code" every time. Signup codes, welcome mail and waitlist confirms all landed on the same
  // addresses within seconds, because those go through Resend. This one went through GoTrue's own
  // mailer: a different sender, a different domain, a template in a dashboard no test can read, and
  // on Supabase's built in SMTP a rate limit documented as being for development.
  //
  // So: GoTrue still MINTS the code and still VERIFIES it. It no longer posts it. mintSignInCode
  // asks the admin API for the token without asking it to send anything, and sendSignInCodeEmail
  // puts it on the one road every other email in this product already proves works.
  //
  // ⚠️ THE OLD ROAD IS STILL HERE AND STILL RUNS. If minting fails, or Resend is not configured, or
  // the send comes back false, we fall through to /auth/v1/otp exactly as before. A change to the
  // sign in door on a live product must not be able to lock anybody out, so the worst case of this
  // whole block is the door we had yesterday.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  let ok = false;

  if (id.channel === 'email' && hasEmailConfig()) {
    const minted = await mintSignInCode(id.value);
    if (minted) ok = await sendSignInCodeEmail(id.value, minted);
  }

  if (!ok) {
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
  }

  // Never log the number or the address. Both are personal data and the number is the account key.
  await logAuthSend(id.channel, hash, ok ? 'sent' : 'failed');

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 AND WHEN NOTHING WENT, THE SCREEN SAYS SO. THIS LINE USED TO SAY THE OPPOSITE.
  //
  // The old comment here read: "Even a failed send goes onward, so a provider outage looks the same
  // as a stranger's number and neither leaks. He types a code that does not work and is told plainly
  // to try again." Every clause of that is true and the conclusion was still wrong, because the man
  // it describes types a code he never received. There is no code to type. He tries three times,
  // burns his per contact limit, and leaves believing his account is gone.
  //
  // ⚠️ THE NEUTRALITY RULE AT THE TOP OF THIS FILE STILL HOLDS, AND THIS DOES NOT BREAK IT. A
  // stranger's address is turned away above, at the findContactAccount check, and never reaches a
  // send at all. So a stranger can no more see this screen than he can see the 'unavailable' the
  // attach check twelve lines up has been returning since it was written. Both say the same thing
  // and both say it only to people who are already ours: our infrastructure is not working. That is
  // a fact about us, not about him, and telling him costs a minute and saves an account.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  if (!ok) return resend ? backToCode(req, 'send', next) : back(req, 'send', next);

  return onward(req, id.channel, id.value, next, resend);
}

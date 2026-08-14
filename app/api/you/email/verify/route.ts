import { NextRequest, NextResponse } from 'next/server';
import { rateLimitedShared, clientIp } from '../../../../../lib/ratelimit';
import { sessionUser, identityForUser } from '../../../../../lib/webauth';
import {
  provedEmailOwner, bindProvedEmailToUser, readLatestSignupCode, bumpSignupCodeAttempt,
  consumeSignupCode,
} from '../../../../../lib/supabase';
import { targetHash } from '../../../../../lib/logindoor';
import {
  verifyPendingCookie, sessionCookieAttributes, webSessionsConfigured,
} from '../../../../../lib/websession';
import { normaliseEmail } from '../../../../../lib/trialidentity';
import { verifyStoredCode, isCodeShape, signupCodesConfigured } from '../../../../../lib/signupcode';
import { EMAIL_BIND_COOKIE } from '../../../../app/you/identity';

export const runtime = 'nodejs';

// ADD YOUR EMAIL, STEP TWO. He typed the code, and only now does the address join his account.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ THE ADDRESS COMES FROM THE SIGNED COOKIE, NEVER FROM THE FORM. A verify that trusted a
// posted address would let a code sent to one inbox be exchanged for a bind on another. The
// cookie is the one /api/you/email/start set, signed with the same secret as every session, and
// the code hash is ADDITIONALLY bound to the address (HMAC over address and code together), so
// even a forged cookie meets a hash that will not match.
//
// THE ORDER BELOW IS LOAD BEARING, the same five step shape as /api/signup/verify:
//
//   1. The attempt is COUNTED before anything is compared. An abandoned request is not a free
//      guess.
//   2. The code is checked. Spent, burnt and expired are decided before the digits are compared.
//   3. The code is SPENT, conditionally, in the database. Two requests with one code cannot both
//      bind.
//   4. WHOSE IS THE ADDRESS is asked again, at the write, not only at the send. The send check
//      closes the honest path; this one closes the race where the address was proved into
//      another account during his ten minutes. 'another' refuses. Unreadable refuses.
//   5. The bind, to the SESSION'S user and nobody else. GoTrue itself refuses an address another
//      auth user holds, which is the belt on top of these braces.
//
// 🔴 AND NOTHING HERE CREATES AN ACCOUNT. No auth user, no users row, no trial, no session. The
// signup route mints things because its caller has nothing; this caller already has everything
// except an address.
// ═══════════════════════════════════════════════════════════════════════════════════════════

const PER_TARGET_VERIFIES = 10;
const PER_ACCOUNT_VERIFIES = 10;
const VERIFY_WINDOW_SECONDS = 15 * 60;

function back(req: NextRequest, code: string) {
  return NextResponse.redirect(new URL(`/app/you/settings?bind=code&e=${code}`, req.url), 303);
}

export async function POST(req: NextRequest) {
  const user = await sessionUser(req);
  if (!user) return NextResponse.redirect(new URL('/in?next=/app/you/settings', req.url), 303);

  if (!webSessionsConfigured() || !signupCodesConfigured()) return back(req, 'unavailable');

  // The contact we actually emailed. A missing or expired cookie means he starts again, which
  // costs him one form, and means a code is only ever compared against the address WE sent it to.
  const pending = verifyPendingCookie(req.cookies.get(EMAIL_BIND_COOKIE)?.value ?? null);
  if (!pending || pending.channel !== 'email') {
    return NextResponse.redirect(new URL('/app/you/settings?e=expired', req.url), 303);
  }

  const form = await req.formData().catch(() => null);
  if (!form) return back(req, 'code');
  const code = String(form.get('code') ?? '').replace(/\D/g, '');
  if (!isCodeShape(code)) return back(req, 'code');

  // Guessing is only safe while attempts are capped. Keyed on the normalised address AND on the
  // account, so neither a hammered inbox nor a scripted session gets a long run.
  const emailNorm = normaliseEmail(pending.value) || pending.value;
  const hash = targetHash(emailNorm, process.env.WEB_SESSION_SECRET || '');
  if (await rateLimitedShared(`bemv:u:${user.id}`, PER_ACCOUNT_VERIFIES, VERIFY_WINDOW_SECONDS * 1000)) {
    return back(req, 'toomany');
  }
  if (await rateLimitedShared(`bemv:t:${hash}`, PER_TARGET_VERIFIES, VERIFY_WINDOW_SECONDS * 1000)) {
    return back(req, 'toomany');
  }
  if (await rateLimitedShared(`bemv:ip:${clientIp(req)}`, PER_ACCOUNT_VERIFIES, VERIFY_WINDOW_SECONDS * 1000)) {
    return back(req, 'toomany');
  }

  // Still a first address, checked at the write rather than remembered from the send. This flow
  // never changes an address that exists.
  const identity = await identityForUser(user);
  if (identity.email) return back(req, 'have');

  const row = await readLatestSignupCode(emailNorm);

  // Counted BEFORE the comparison. The other order makes an abandoned request a free guess, and
  // free guesses are the whole attack on a six digit code.
  if (row) await bumpSignupCodeAttempt(row.id);

  const verdict = verifyStoredCode(row, emailNorm, code);
  if (verdict !== 'ok') {
    // Specific on purpose: "try again" is useless advice for a code that can never work however
    // carefully it is typed. The sentences live in app/app/you/identity.ts.
    const map: Record<string, string> = { expired: 'codeexpired', spent: 'spent', burnt: 'burnt', none: 'none' };
    return back(req, map[verdict] ?? 'code');
  }

  // 🔴 SPENDING IT IS THE DATABASE'S DECISION. Two requests racing one valid code both pass the
  // check above; only one gets the row back from the conditional PATCH. Single use, enforced
  // where enforcement is real.
  const spent = await consumeSignupCode(row!.id);
  if (!spent) return back(req, 'spent');

  // 🔴 WHOSE IS THE ADDRESS, ASKED AT THE WRITE. 'another' is refused with the fixed sentence
  // that cannot say whose. Never moved: the link write in lib/supabase.ts touches only rows whose
  // user_id is null, so this refusal is defence in depth, not the only wall.
  const owner = await provedEmailOwner(user.id, pending.value);
  if (owner === null) return back(req, 'unavailable');
  if (owner === 'another') return back(req, 'taken');

  // The bind, to the session's account and no other. 'taken' here is GoTrue refusing an address
  // some auth user holds, the store's own second opinion on the same rule.
  const outcome = await bindProvedEmailToUser(user.id, pending.value);
  if (outcome === 'taken') return back(req, 'taken');
  if (outcome === 'failed') return back(req, 'unavailable');

  // Done. The pending address is spent with the code, so it is cleared rather than left signed
  // in his browser.
  const res = NextResponse.redirect(new URL('/app/you/settings?bind=done', req.url), 303);
  res.cookies.set(EMAIL_BIND_COOKIE, '', sessionCookieAttributes(0));
  return res;
}

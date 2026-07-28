import { NextRequest, NextResponse } from 'next/server';
import { revokeWebSession } from '../../../../lib/supabase';
import { readCookie } from '../../../../lib/webauth';
import {
  SESSION_COOKIE, PENDING_COOKIE, originAllowed, sessionCookieAttributes, verifySessionCookie,
} from '../../../../lib/websession';

export const runtime = 'nodejs';

// SIGNING OUT, AND MEANING IT.
//
// 🔴 THIS ROUTE IS /api/auth/signout AND NOT /api/auth/out, AND THAT IS NOT A STYLE CHOICE.
//
// It was written as /api/auth/out and shipped in commit 1e7160db with the file MISSING from the
// repository. .gitignore carries `out/` for the Next.js static export folder, which silently
// matched app/api/auth/out/, so `git add -A` never picked the file up. It existed on disk, the
// whole suite passed locally, and production got a sign out button posting to a route that was
// not there. Only CI caught it, because CI checks out from git rather than from the machine that
// wrote the file.
//
// test/hardening.test.mjs now fails the build if any folder under app/ or lib/ is named after a
// .gitignore directory rule, so the next `out`, `build`, `dist` or `coverage` route cannot vanish
// the same way.
//
// Clearing the cookie on his machine is the easy half and on its own it is theatre: the cookie he
// just deleted is still a valid credential for the next ninety days if anyone else has a copy. So
// the row is revoked server side first, and the cookie is cleared whatever the revoke says, because
// a man who pressed sign out must end up signed out on this device even if the database is having
// a moment.
export async function POST(req: NextRequest) {
  if (!originAllowed(req.headers.get('origin'), req.headers.get('host'))) {
    return NextResponse.redirect(new URL('/in', req.url), 303);
  }

  const claim = verifySessionCookie(readCookie(req.headers.get('cookie'), SESSION_COOKIE));
  if (claim) await revokeWebSession(claim.sessionId).catch(() => false);

  const res = NextResponse.redirect(new URL('/in?out=1', req.url), 303);
  res.cookies.set(SESSION_COOKIE, '', sessionCookieAttributes(0));
  res.cookies.set(PENDING_COOKIE, '', sessionCookieAttributes(0));
  return res;
}

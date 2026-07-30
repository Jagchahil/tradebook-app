import { NextRequest, NextResponse } from 'next/server';
import { sessionUser } from '../../../../lib/webauth';
import { createWaLink } from '../../../../lib/supabase';
import {
  newLinkCode, hashLinkCode, linkExpiresAt, waLinkCookieValue, waLinksConfigured, WALINK_COOKIE,
  LINK_TTL_SECONDS,
} from '../../../../lib/walink';
import { sessionCookieAttributes } from '../../../../lib/websession';
import { gateForUser, refuseUnentitled } from '../../../../lib/gateserver';

export const runtime = 'nodejs';

// HE PRESSED "SHOW ME MY CODE". This mints one, records its digest, and hands the code back.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 A POST, NOT A PAGE LOAD, AND THAT IS THE WHOLE REASON THIS ROUTE EXISTS.
//
// The connect page could have minted a code as it rendered and saved a click. Then a refresh, a
// back button or a link preview would each write a credential to the database, and nothing in the
// product would look any different while that happened.
//
// So minting is a thing he does, once, on purpose. Everything after it is a read.
//
// ⚠️ THE CODE GOES BACK IN A COOKIE AND NEVER IN THE REDIRECT. lib/walink.ts's header has the long
// version: it is a credential, and a credential in a URL is a credential in his history, in any
// Referer we leak and in every error report that ever records a URL. Same rule that keeps his phone
// number out of the sign in URL.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// The origin check and the session both come from sessionUser(), which is where this codebase keeps
// them so that thirty six routes cannot each forget in their own way.
export async function POST(req: NextRequest) {
  const user = await sessionUser(req);
  if (!user) return NextResponse.redirect(new URL('/in', req.url), 303);

  // 🔴 THE WORK STOPS WHEN HE STOPS PAYING. lib/gate.ts row: this route is 'entitled'.
  //
  // His records stay readable everywhere; what a lapsed subscription buys is that we do nothing NEW
  // for him. gateForUser never returns readonly because something broke, so this can only fire on a
  // real answer about a real subscription.
  if ((await gateForUser(user.id)) === 'readonly') return refuseUnentitled(req, '/app/connect');

  // ⚠️ A FORM CALLER NEVER SEES JSON. Same rule as /api/bank/connect: a man in the middle of setting
  // up his phone must not be shown an error object. Every failure below is a redirect back to the
  // page, which says plainly what happened and offers the button again.
  const back = (why?: string) => NextResponse.redirect(
    new URL(why ? `/app/connect?problem=${why}` : '/app/connect', req.url), 303,
  );

  // No secret, no codes. The same fail closed rule as signing in: we do not issue an unsigned or
  // unhashable credential to a man's books, and the page says so rather than drawing a dead square.
  if (!waLinksConfigured()) return back('unavailable');

  const code = newLinkCode();
  const hash = hashLinkCode(code);
  if (!hash) return back('unavailable');

  // 🔴 THE ROW GOES DOWN BEFORE THE COOKIE GOES OUT, AND THE ORDER IS LOAD BEARING.
  //
  // The other way round hands him a code that will never match anything, and he finds out by
  // sending it and being told we cannot find it. A failed write here means he never sees a code at
  // all, which is a state the page can explain.
  const stored = await createWaLink(user.id, hash, linkExpiresAt());
  if (!stored) return back('unavailable');

  const res = back();
  res.cookies.set(WALINK_COOKIE, waLinkCookieValue(code), {
    ...sessionCookieAttributes(LINK_TTL_SECONDS),
    // Narrower than the session cookie on purpose. Nothing outside the connect page has any reason
    // to receive this, so nothing outside the connect page is sent it.
    path: '/app/connect',
  });
  return res;
}

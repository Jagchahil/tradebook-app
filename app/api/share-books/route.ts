import { NextRequest, NextResponse } from 'next/server';
import { sessionUser } from '../../../lib/webauth';
import { createBookShare, revokeBookShare } from '../../../lib/supabase';
import { shareToken, clampGrantDays, expiryFor, normaliseScope } from '../../../lib/bookshare';
import { rateLimitedShared } from '../../../lib/ratelimit';
import { invoiceRef } from '../../app/invoiceref';

// SHARE MY BOOKS, FROM THE WEB FORM. The form door beside /api/share's JSON door.
//
//   POST action=create { name?, email?, days, from, exclude[] }  ->  a share, shown once
//   POST action=revoke { id }                                    ->  the link is dead
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ ANOTHER CALLER OF THE /api/share MACHINERY, NEVER ANOTHER COPY. /app/share-books ships no
// client script, so its buttons are plain form posts, and /api/share reads JSON. This route
// exists to translate a form into the SAME lib calls: normaliseScope decides what a scope
// means, createBookShare writes it, revokeBookShare kills it, shareToken signs the link. If a
// rule about sharing ever changes, it changes in lib and both doors follow.
//
// ⚠️ THE SCOPE IS MANDATORY AND FAILS CLOSED, /api/share's own words: a share with no readable
// date range shares NOTHING, never everything. The form offers only dates the page computed,
// but this route re-checks because attributes on a form are a courtesy, not a guard.
//
// ⚠️ HE APPROVES, WE SEND NOTHING. Creating a grant here mints a link and shows it to HIM once.
// No email leaves this route, whatever address he stored for the recipient: handing a man's
// books to a third party is exactly the irreversible act the approval gate exists for, and the
// approval is him pressing send in his own apps.
//
// ⚠️ THE REDIRECT CARRIES A SEALED REFERENCE TO THE NEW GRANT, NEVER ITS ID, so the books link
// can be shown once on the next page without a row id ever riding in an app URL. The reference
// is the short lived 'share' kind from app/app/invoiceref.ts: fifteen minutes, then the link
// can never be re-summoned from his browser history.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(new URL(`/app/share-books?${q}`, req.url), 303);

  const user = await sessionUser(req);
  if (!user) return NextResponse.redirect(new URL('/in?next=/app/share-books', req.url), 303);

  const f = await req.formData().catch(() => null);
  if (!f) return back('problem=bad');

  const action = String(f.get('action') ?? '');

  // Revoking is a withdrawal of consent and is never rate limited or gated: the one thing worse
  // than minting too many links is being unable to kill one.
  if (action === 'revoke') {
    const id = String(f.get('id') ?? '');
    // Scoped by user_id INSIDE revokeBookShare, so this can only ever kill his own grant even
    // if the hidden field is tampered into someone else's id.
    const ok = id ? await revokeBookShare(user.id, id) : false;
    return back(ok ? 'done=revoked' : 'problem=notfound');
  }

  if (action !== 'create') return back('problem=bad');

  // The same per account budget as /api/share, ON THE SAME KEY, deliberately: two doors into one
  // cupboard share one lock, so a caller cannot double his allowance by alternating them.
  if (await rateLimitedShared(`share:${user.id}`, 10, 60 * 60 * 1000)) {
    return back('problem=slow');
  }

  const scope = normaliseScope({
    from_date: String(f.get('from') ?? ''),
    exclude_categories: f.getAll('exclude').map(String),
  });
  if (!scope.fromDate) return back('problem=bad');

  const days = clampGrantDays(Number(f.get('days')));
  const share = await createBookShare(
    user.id,
    String(f.get('name') ?? '').trim().slice(0, 120) || null,
    String(f.get('email') ?? '').trim().slice(0, 200) || null,
    expiryFor(days),
    scope.fromDate,
    scope.excludeCategories.slice(0, 60),
  );
  if (!share) return back('problem=unavailable');

  // shareToken throws when SHARE_TOKEN_SECRET is unset. The page draws no form in that state,
  // so reaching here without the secret is a hand rolled post, and it gets a plain refusal
  // rather than a stack trace. The grant row it created is inert: no token, no link, no view.
  try {
    shareToken(share.id);
  } catch {
    return back('problem=off');
  }

  const ref = invoiceRef(user.id, share.id, 'share');
  return ref ? back(`made=${encodeURIComponent(ref)}`) : back('done=made');
}

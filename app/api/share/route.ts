import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAccessToken,
  createBookShare,
  listBookShares,
  revokeBookShare,
  getConfirmedTransactionsForUser,
} from '../../../lib/supabase';
import { shareToken, clampGrantDays, expiryFor, categoriesIn, normaliseScope } from '../../../lib/bookshare';
import { rateLimited } from '../../../lib/ratelimit';
import { siteBase } from '../../../lib/packtoken';

// Share my books, from the owner's side.
//
//   GET                                                       -> { shares, categories }
//   POST { name, email, days, from_date, exclude_categories }  -> { share, url }
//   POST { revoke: <id> }                                      -> { ok: true }
//
// Everything here is authenticated as the OWNER. The recipient never touches these
// routes; they only ever open the public view. Every query is scoped by the
// authenticated user's own id, so a caller cannot read or revoke anyone else's
// share even if they learn its id.
//
// `categories` on the GET is the user's OWN list of real categories, so the app can
// show them what they actually have to untick, rather than a guessed list.
//
// The link is returned ONCE, at creation, and never listed back: a link to
// someone's books should not sit on a screen where whoever picks the phone up can
// read it.

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const [shares, rows] = await Promise.all([
    listBookShares(user.id),
    getConfirmedTransactionsForUser(user.id),
  ]);

  return NextResponse.json({ shares, categories: categoriesIn(rows) });
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Minting a link hands out a view of someone's books, so it is rate limited
  // hard, per account rather than per IP.
  if (rateLimited(`share:${user.id}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'too_many_requests' }, { status: 429 });
  }

  let body: {
    name?: string;
    email?: string;
    days?: number;
    from_date?: string;
    exclude_categories?: string[];
    revoke?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  if (body.revoke) {
    const ok = await revokeBookShare(user.id, String(body.revoke));
    if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  // THE SCOPE IS MANDATORY.
  //
  // normaliseScope refuses anything it cannot read, and a share with no date range
  // renders an empty page rather than someone's whole financial history. So a
  // malformed request can never become an accidental full disclosure: it just
  // fails here, loudly, with a 400.
  const scope = normaliseScope(body);
  if (!scope.fromDate) {
    return NextResponse.json({ error: 'from_date_required' }, { status: 400 });
  }

  const days = clampGrantDays(body.days);
  const share = await createBookShare(
    user.id,
    (body.name ?? '').trim().slice(0, 120) || null,
    (body.email ?? '').trim().slice(0, 200) || null,
    expiryFor(days),
    scope.fromDate,
    scope.excludeCategories.slice(0, 60),
  );
  if (!share) return NextResponse.json({ error: 'could_not_create' }, { status: 500 });

  return NextResponse.json({
    share,
    url: `${siteBase()}/share/${shareToken(share.id)}`,
    days,
  });
}

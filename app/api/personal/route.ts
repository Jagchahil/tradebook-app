import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAccessToken,
  getAllConfirmedForReview,
  setTransactionPersonal,
  setManyPersonal,
} from '../../../lib/supabase';
import { findPersonal, impactOf } from '../../../lib/personal';
import { rateLimited } from '../../../lib/ratelimit';

// Money in the books that is not business money.
//
//   GET                        -> { items, impact }   what we think is not business
//   POST { id, personal }      -> { ok }              the user's answer on one row
//   POST { ids: [...] }        -> { ok, marked }      "yes, all of those"
//
// WE ONLY SUGGEST. The user decides, every time. Nothing here reclassifies anyone's
// money on its own, because the approval gate is the product.
//
// Deterministic and free: findPersonal is a rules pass over rows we already hold,
// with no AI call, so this costs nothing to run and cannot be rate limited by the
// AI budget. See lib/personal.ts.

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const rows = await getAllConfirmedForReview(user.id);
  const items = findPersonal(rows);

  return NextResponse.json({
    items,
    // What it would do to the figures. This is the number that makes someone care,
    // so we show it honestly rather than burying it.
    impact: impactOf(items),
  });
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (rateLimited(`personal:${user.id}`, 120, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'too_many_requests' }, { status: 429 });
  }

  let body: { id?: string; personal?: boolean; ids?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  // "Yes, all of those are personal."
  if (Array.isArray(body.ids)) {
    const ids = body.ids.filter((i) => typeof i === 'string').slice(0, 200);
    const marked = await setManyPersonal(user.id, ids);
    return NextResponse.json({ ok: true, marked });
  }

  // One row, either way. Reversible: a user who taps it by mistake taps it back.
  if (typeof body.id === 'string') {
    const ok = await setTransactionPersonal(user.id, body.id, body.personal !== false);
    if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'bad_request' }, { status: 400 });
}

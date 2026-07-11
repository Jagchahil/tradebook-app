import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAccessToken,
  getAllConfirmedForReview,
  setTransactionPersonal,
  setManyPersonal,
  getTransactionVendor,
  learnVendor,
} from '../../../lib/supabase';
import { findPersonal, impactOf } from '../../../lib/personal';
import { learn } from '../../../lib/memory';
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
    // Learn every one of them, so none of these vendors is ever counted as income
    // again. Fire and forget: a lesson must never delay the user's answer.
    void Promise.all(ids.map((id) => teach(user.id, id, true)));
    return NextResponse.json({ ok: true, marked });
  }

  // One row, either way. Reversible: a user who taps it by mistake taps it back.
  if (typeof body.id === 'string') {
    const personal = body.personal !== false;
    const ok = await setTransactionPersonal(user.id, body.id, personal);
    if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    // TEACH THE BRAIN. This is the whole idea: they should only ever have to tell
    // us once. Next time this vendor arrives from the bank it lands already out of
    // the tax figures, with no AI call and no second question.
    void teach(user.id, body.id, personal);

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'bad_request' }, { status: 400 });
}

// Turn one answer into a lasting lesson.
//
// NEVER SHARED WITH THE CROWD. "Not business" is a fact about a PERSON, not about a
// merchant: one man's transfer to MR J SMITH is his brother, another's is a customer
// paying him for a rewire. Pooling that would put a stranger's private life into
// everyone else's books. learn() enforces this (shareable is false for anything
// personal), and we pass false explicitly here as well.
//
// Never throws. A failed lesson must not break the answer the user just gave.
async function teach(userId: string, transactionId: string, personal: boolean): Promise<void> {
  try {
    const vendor = await getTransactionVendor(userId, transactionId);
    const lesson = learn({ vendor, isPersonal: personal });
    if (!lesson) return;
    await learnVendor(userId, lesson.vendorKey, lesson.category, lesson.isPersonal, false);
  } catch {
    /* learning is a bonus, never a dependency */
  }
}

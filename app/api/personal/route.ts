import { NextRequest, NextResponse } from 'next/server';
import {
  getAllConfirmedForReview,
  setTransactionPersonal,
  setManyPersonal,
  getTransactionVendor,
  learnVendor,
} from '../../../lib/supabase';
import { sessionUser } from '../../../lib/webauth';
import { findPersonal, impactOf } from '../../../lib/personal';
import { learn } from '../../../lib/memory';
import { rateLimitedShared } from '../../../lib/ratelimit';

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
  const user = await sessionUser(req);
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

// ⚠️ IT ANSWERS A FORM AS WELL AS A FETCH, because /app/money posts one.
//
// The phone app sends JSON and reads JSON back. The web app ships no client JavaScript, so a
// correction on the money log is an ordinary <form method="post"> and it needs a redirect back to
// the page rather than a JSON body the browser would render as a screen of text. Same gate, same
// validation, same write, same lesson taught to the brain: only the reply differs, decided by the
// content type the caller sent. That is the shape /api/billing/checkout already uses.
//
// The redirect is a 303, so the back button cannot re-post the correction and flip it again.
export async function POST(req: NextRequest) {
  const isForm = (req.headers.get('content-type') || '').includes('application/x-www-form-urlencoded');
  const backTo = (done: string, month: string) => {
    // ⚠️ BACK TO THE MONTH HE WAS LOOKING AT. Returning him to the current month after he corrects
    // a line in March loses his place, and finding one payment is the whole job of that page.
    const m = /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? `&m=${month}` : '';
    return NextResponse.redirect(new URL(`/app/money?done=${done}${m}`, req.url), 303);
  };

  const user = await sessionUser(req);
  // A form caller with no session is a man whose session expired while the page sat open. Send him
  // to the door, not to a JSON error he cannot read.
  if (!user) {
    return isForm
      ? NextResponse.redirect(new URL('/in?next=/app/money', req.url), 303)
      : NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { id?: string; personal?: boolean; ids?: string[] } = {};
  let month = '';
  if (isForm) {
    const f = await req.formData().catch(() => null);
    if (!f) return backTo('failed', '');
    month = String(f.get('m') ?? '');
    body = {
      id: String(f.get('id') ?? ''),
      // ⚠️ A FORM POSTS STRINGS, AND 'false' IS A TRUTHY ONE. Reading this as a boolean the lazy
      // way would make "put it back" mark the line personal all over again, which is a button that
      // does the opposite of its own label on a man's tax figures.
      personal: String(f.get('personal') ?? 'true') !== 'false',
    };
  } else {
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }
  }

  if (await rateLimitedShared(`personal:${user.id}`, 120, 60 * 60 * 1000)) {
    return isForm ? backTo('failed', month) : NextResponse.json({ error: 'too_many_requests' }, { status: 429 });
  }

  // "Yes, all of those are personal." JSON only: the web offers one row at a time.
  if (Array.isArray(body.ids)) {
    const ids = body.ids.filter((i) => typeof i === 'string').slice(0, 200);
    const marked = await setManyPersonal(user.id, ids);
    // Learn every one of them, so none of these vendors is ever counted as income
    // again. Fire and forget: a lesson must never delay the user's answer.
    void Promise.all(ids.map((id) => teach(user.id, id, true)));
    return NextResponse.json({ ok: true, marked });
  }

  // One row, either way. Reversible: a user who taps it by mistake taps it back.
  if (typeof body.id === 'string' && body.id) {
    const personal = body.personal !== false;
    const ok = await setTransactionPersonal(user.id, body.id, personal);
    // A FAILED WRITE MUST NOT LOOK LIKE A SUCCESSFUL ONE. The page reloads with the line exactly as
    // it was, and says so, rather than letting him believe he corrected something he did not.
    if (!ok) return isForm ? backTo('failed', month) : NextResponse.json({ error: 'not_found' }, { status: 404 });

    // TEACH THE BRAIN. This is the whole idea: they should only ever have to tell
    // us once. Next time this vendor arrives from the bank it lands already out of
    // the tax figures, with no AI call and no second question.
    void teach(user.id, body.id, personal);

    return isForm
      ? backTo(personal ? 'personal' : 'business', month)
      : NextResponse.json({ ok: true });
  }

  if (isForm) return backTo('failed', month);

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

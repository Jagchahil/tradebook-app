import { NextRequest, NextResponse } from 'next/server';
import { sessionUser } from '../../../lib/webauth';
import { userBurst } from '../../../lib/ratelimit';
import { gateForUser, refuseUnentitled } from '../../../lib/gateserver';
import { addGoal, setGoalStatus, deleteGoal } from '../../../lib/supabase';
import { isGoalKind, parseAmountPence } from '../../../lib/goals';

export const runtime = 'nodejs';

// THE GOALS' WRITES. One POST, three actions, all plain form posts from /app/goals.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ THE AMOUNT IS HIS FIGURE OR IT IS NOTHING. An empty amount field is a goal without a
// price, stored as null and shown as nothing. A filled one must parse as money or the form is
// refused: quietly saving a broken number as null would turn "£24,00o" into a goal that lost
// its figure without telling him. Nothing here ever estimates, rounds up, or fills in.
//
// ⚠️ SAME ROW RULES AS /api/diary. The id travels in the form body, never a URL; the session
// names the owner; every accessor filters on both. And the gate falls the same way: adding a
// goal is the work (the tax planning that reasons about it exists because the row does), while
// marking his own goal done or removing it is his record and is never gated, the elections
// DELETE shape.
// ═══════════════════════════════════════════════════════════════════════════════════════════

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(new URL(`/app/goals?${q}`, req.url), 303);

  const user = await sessionUser(req);
  if (!user) return NextResponse.redirect(new URL('/in?next=/app/goals', req.url), 303);

  if (await userBurst('goals', user.id)) return back('problem=slow');

  const f = await req.formData().catch(() => null);
  if (!f) return back('problem=bad');
  const action = String(f.get('action') ?? '');

  // 🔴 THE WORK STOPS WHEN HE STOPS PAYING, AND ONLY THE WORK. The gate sits at the top of the
  // handler, on the action rather than inside its branch, so the check is visibly not nested
  // under any earlier early return. Only 'add' is the work; done and remove further down are him
  // keeping his own record straight and are never gated, the elections DELETE shape.
  if (action === 'add' && (await gateForUser(user.id)) === 'readonly') {
    return refuseUnentitled(req, '/app/goals');
  }

  if (action === 'add') {
    const kind = String(f.get('kind') ?? '');
    const label = String(f.get('label') ?? '').trim().slice(0, 120);
    if (!isGoalKind(kind) || !label) return back('problem=bad');

    // Optional, but never mangled: empty means he did not say, anything else must be money.
    const amountRaw = String(f.get('amount') ?? '').trim();
    const amountPence = amountRaw ? parseAmountPence(amountRaw) : null;
    if (amountRaw && amountPence === null) return back('problem=bad');

    // Optional too. A date the calendar refuses is refused here, not repaired.
    const dateRaw = String(f.get('target') ?? '').trim();
    let targetDate: string | null = null;
    if (dateRaw) {
      if (!DAY.test(dateRaw) || !Number.isFinite(Date.parse(dateRaw))) return back('problem=bad');
      targetDate = dateRaw;
    }

    const done = await addGoal(user.id, { kind, label, amountPence, targetDate });
    return done ? back('done=added') : back('problem=unavailable');
  }

  const id = String(f.get('id') ?? '');
  if (!UUID.test(id)) return back('problem=bad');

  if (action === 'done') {
    // Not gated: reaching a goal is his news, and recording it is his record.
    const done = await setGoalStatus(user.id, id, 'done');
    return done ? back('done=done') : back('problem=missing');
  }

  if (action === 'remove') {
    // A real delete of his own row, never gated.
    const done = await deleteGoal(user.id, id);
    return done ? back('done=removed') : back('problem=missing');
  }

  return back('problem=bad');
}

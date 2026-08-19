import { NextRequest, NextResponse } from 'next/server';
import { userBurst } from '../../../lib/ratelimit';
import { readOptimiserOrNull, getAutonomyLevel } from '../../../lib/supabase';
import { sessionUser } from '../../../lib/webauth';
import { findOptimisations, applyDial, totalEstimatedSaving, taxPosition } from '../../../lib/taxoptimiser';

// Ways to save. The app calls this with the user's own token and gets back every
// legitimate tax-lowering lever on their real numbers, each already run through
// the autonomy dial (so the money levers come back approval-gated, never auto).
// Deterministic maths on the canonical engine; no AI, no spend.
//   GET -> { level, totalSaving, optimisations: [...] }

export async function GET(req: NextRequest) {
  const user = await sessionUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (await userBurst('optimise', user.id)) {
    return NextResponse.json({ error: 'slow down' }, { status: 429 });
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 B50, D3. RECORDS UNREADABLE EXEMPT: this route is JSON to the phone app and has no customer
  // sentence on it, so it answers with an explicit ERROR rather than with a body of zeros. Here the
  // zeros are worse than on the ledger: findOptimisations over an empty year returns a list of
  // things he could save that is computed from a database that did not answer, and totalEstimatedSaving
  // then puts a pound figure on it. 503 is the shape app/api/elections/route.ts already uses.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const [input, level] = await Promise.all([readOptimiserOrNull(user.id), getAutonomyLevel(user.id)]);
  if (!input) return NextResponse.json({ error: 'unreadable' }, { status: 503 });
  const optimisations = applyDial(findOptimisations(input), level);
  return NextResponse.json({
    level,
    totalSaving: totalEstimatedSaving(optimisations),
    optimisations,
    // HIS WHOLE TAX, across every income stream we know about, not just his trade. The app can show
    // this as "your tax, all in". When the only income is a trade it equals the sole-trader figure.
    taxPosition: taxPosition(input),
  });
}

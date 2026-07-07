import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, getOptimiserInput, getAutonomyLevel } from '../../../lib/supabase';
import { findOptimisations, applyDial, totalEstimatedSaving } from '../../../lib/taxoptimiser';

// Ways to save. The app calls this with the user's own token and gets back every
// legitimate tax-lowering lever on their real numbers, each already run through
// the autonomy dial (so the money levers come back approval-gated, never auto).
// Deterministic maths on the canonical engine; no AI, no spend.
//   GET -> { level, totalSaving, optimisations: [...] }

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const [input, level] = await Promise.all([getOptimiserInput(user.id), getAutonomyLevel(user.id)]);
  const optimisations = applyDial(findOptimisations(input), level);
  return NextResponse.json({
    level,
    totalSaving: totalEstimatedSaving(optimisations),
    optimisations,
  });
}

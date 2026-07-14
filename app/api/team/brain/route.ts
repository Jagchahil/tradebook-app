import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, readTeamMember, readBrain } from '../../../../lib/supabase';
import { isTeam } from '../../../../lib/team';
import { vitals, coverage, knowledge, growth } from '../../../../lib/brain';

export const runtime = 'nodejs';

// KHOJI, FOR THE TEAM.
//
// The screen shows three things and only one of them is comfortable:
//
//   what it checked last night, and whether that was recent enough to mean anything
//   what it has NEVER checked, by name
//   what it has learned, and how much is sitting unreviewed
//
// ⚠️ NO USER DATA PASSES THROUGH HERE, AND THAT IS NOT AN ACCIDENT OF THE QUERY.
//
// Khoji only ever touches PUBLIC knowledge: tax law, GOV.UK pages, our own published constants.
// Never a transaction, never a name, never a receipt. That is the rule the whole knowledge system
// was built under, and this route is the first thing that could have quietly broken it by joining
// something convenient. It does not join anything.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const member = await readTeamMember(user.email);
  if (!isTeam(member)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const brain = await readBrain(30);

  // WE COULD NOT READ THE BRAIN. That is not "the brain is empty", and on this page above all others
  // the difference is the whole product. A blank Khoji screen that means "database timed out" and a
  // blank Khoji screen that means "nothing has checked our tax engine" must not look the same.
  if (brain === null) {
    return NextResponse.json({ error: 'unreadable' }, { status: 503 });
  }

  const v = vitals(brain.runs);

  return NextResponse.json({
    vitals: v,
    coverage: coverage(v),
    knowledge: knowledge(brain.items),
    growth: growth(brain.items, 30),
    // The last fortnight of nights, oldest first, so the page can draw the heartbeat itself rather
    // than take our word for it.
    runs: brain.runs.slice(0, 14).reverse().map((r) => ({
      ran_at: r.ran_at, agreed: r.agreed, drifted: r.drifted, blind: r.blind, ok: r.ok,
    })),
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, readTeamMember, readBrain, readLawFreshness } from '../../../../lib/supabase';
import { isTeam } from '../../../../lib/team';
import { vitals, coverage, knowledge, growth } from '../../../../lib/brain';
import { body } from '../../../../lib/organs';
import { buildBrainMap } from '../../../../lib/brainmap';

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

    // 🔴 THE THREE ORGANS. An organ we cannot measure is never drawn green.
    //
    // Rakha used to be drawn DARK here, because it left no trace: it could have been dead since
    // Tuesday and nothing would have said so. It now writes rakha_runs on EVERY run, pass or fail,
    // and `considered` is the load-bearing field: a run that looked at nobody is not a run.
    //
    // ⚠️ brain.rakha IS null WHEN WE COULD NOT READ IT, AND [] WHEN IT HAS NEVER RUN. Those are
    // different facts and organs.ts draws them differently: the first is dark, the second is red.
    // Collapsing them is the exact lie this console exists to prevent.
    //
    // (Puchio's count comes from what the brain already reads. When qa_cache is not readable we pass
    // zero, and organs.ts treats "nobody has asked" as a QUIET WEEK, not a fault: a console that
    // shouts about silence is a console you learn to ignore.)
    body: body(
      brain.runs,
      brain.items,
      { answered: brain.answered, lastAnswerAt: brain.lastAnswerAt },
      brain.subscribers,
      brain.rakha,
    ),

    knowledge: knowledge(brain.items),
    growth: growth(brain.items, 30),
    // THE QUEUE. Until today this was a number on a screen with no button beside it: "39 waiting for
    // a human", and no way for a human to do anything. An approval gate with no approve button is a
    // bottleneck we built and then forgot to open.
    pending: brain.pending,
    // The last fortnight of nights, oldest first, so the page can draw the heartbeat itself rather
    // than take our word for it.
    runs: brain.runs.slice(0, 14).reverse().map((r) => ({
      ran_at: r.ran_at, agreed: r.agreed, drifted: r.drifted, blind: r.blind, ok: r.ok,
    })),

    // 🔴 THE CONSTELLATION. The shape of what Khoji watches: the tax brain (live) and the twelve
    // legal fields (dim until lawwatch reports). The law nodes are DELIBERATELY unmeasured until the
    // mini has run lawwatch and written its rows: we do not glow over a thing we have not checked.
    brainMap: buildBrainMap({
      tax: brain.runs[0]
        ? {
            checked: brain.runs[0].checked,
            agreed: brain.runs[0].agreed,
            drifted: brain.runs[0].drifted,
            blind: brain.runs[0].blind,
            ranHoursAgo: brain.runs[0].ran_at
              ? (Date.now() - new Date(brain.runs[0].ran_at).getTime()) / 3_600_000
              : null,
          }
        : undefined,
      // 🔴 THE LAW FIELDS, LIT BY WHAT LAWWATCH ACTUALLY REPORTED. null (could not read) and absent
      // (a field lawwatch has not covered) both leave the field out, so buildBrainMap draws it dim
      // rather than green. This is the wiring that was missing: lawwatch persists to khoji_law, and
      // this reads it. Before, the law nodes were dim for ever because nothing fed them.
      law: (await readLawFreshness().catch(() => null)) ?? undefined,
    }),
  });
}

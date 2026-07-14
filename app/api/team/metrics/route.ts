import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAccessToken,
  readTeamMember,
  readTeamCustomers,
  readSnapshots,
} from '../../../../lib/supabase';
import { isTeam } from '../../../../lib/team';
import { daily, signupDates, funnel, byChannel, historyNote } from '../../../../lib/metrics';

export const runtime = 'nodejs';

// The numbers the business is run on.
//
// FOUR QUESTIONS, AND NOT ONE MORE. This is the screen a man opens at seven in the morning while
// the kettle boils, and doc 103 applies to us as hard as it applies to him: every extra chart is a
// thing he has to read and dismiss before he reaches the one he came for.
//
//   Is it growing?          signups over time. REAL history: a created_at is written once.
//   Is the trial working?   trial to paid. THE number. At £12.99 with a fortnight free, 20% is a
//                           company and 5% is not, and nothing else you build fixes that.
//   Who is leaving?         cancelled, and who has asked to.
//   Which channel PAYS?     not who came. Who came AND STAYED. Cost per acquisition is vanity.
//
// AND EVERY RATE CARRIES ITS CONFIDENCE. With two customers, "100% conversion" is a coin landing
// heads. lib/metrics.ts refuses to return a percentage below the threshold, so this route cannot
// accidentally hand the page a confident lie.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const member = await readTeamMember(user.email);
  if (!isTeam(member)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const [customers, snaps] = await Promise.all([
    readTeamCustomers(),
    readSnapshots(90),
  ]);

  // WE COULD NOT READ. Not "you have no customers". A metrics page that draws a confident zero
  // because the database did not answer is the single most dangerous screen we could build.
  if (customers === null) {
    return NextResponse.json({ error: 'unreadable' }, { status: 503 });
  }

  // ⚠️ ONE LIST OF PEOPLE. EVERY FIGURE ON THE PAGE IS DERIVED FROM IT.
  //
  // The signups chart used to have its own query, and that query counted our App Review demo
  // account, so the page said "1 customer" in one box and "2 signups" in the next. Both were drawn
  // from the same database, three inches apart, and they disagreed.
  //
  // Two reads over the same people WILL drift, and the one that drifts is the one you believe. So
  // there is one read now, and lib/metrics.ts owns the single decision about who counts.
  const rows = customers.map((c) => ({
    status: c.status,
    stripeId: null,
    internal: c.internal,
    source: c.source,
  }));

  return NextResponse.json({
    signups: daily(signupDates(customers), 30),
    funnel: funnel(rows),
    channels: byChannel(rows),
    // `snaps === null` means the table is not there yet (the migration has not been run) or we could
    // not read it. Either way it is NOT "the history is empty", and the page must not draw a flat
    // line through zero and call it a revenue chart.
    history: snaps ?? [],
    historyNote: snaps === null
      ? 'The history table is not there yet. Apply supabase/APPLY_2026-07-14_metrics_daily.sql.'
      : historyNote(snaps),
  });
}

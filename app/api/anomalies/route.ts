import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, getConfirmedTransactionsForRange, getAllConfirmedForReview } from '../../../lib/supabase';
import { findAnomalies, summariseAnomalies, type Anomaly } from '../../../lib/anomaly';
import { findPersonal } from '../../../lib/personal';

// Things to check. The "an accountant would have caught that" pass over the
// user's own confirmed entries this tax year. Deterministic, no AI, no spend.
// It never changes anything; it returns questions for the user to answer.
//   GET -> { count, summary, anomalies: [...] }
//
// TWO passes are merged here:
//
//   1. findAnomalies  the usual suspects: duplicates, uncategorised, odd amounts.
//   2. findPersonal   money in the books that is NOT BUSINESS MONEY.
//
// The second goes FIRST in the list, because it is the only one that changes the
// tax bill. Real books contained a child tax credit, a refund and a personal
// transfer, all confirmed, all counted as trading income, all inflating the profit
// we were about to compute tax on. See lib/personal.ts.
//
// The two libraries are merged HERE rather than one importing the other, so both
// stay import free and directly testable by the node runner.

// The UK tax year containing d starts on 6 April.
function taxYearStartISO(d: Date): string {
  const y = d.getUTCMonth() > 3 || (d.getUTCMonth() === 3 && d.getUTCDate() >= 6) ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${y}-04-06`;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const now = new Date();
  const todayISO = now.toISOString().slice(0, 10);

  const [rows, allRows] = await Promise.all([
    // Business money only. getConfirmedTransactionsForRange now excludes anything
    // already marked personal, so a benefit cannot masquerade as a suspicious
    // income spike in the ordinary rules.
    getConfirmedTransactionsForRange(user.id, taxYearStartISO(now), todayISO),
    // Everything confirmed and not yet marked, so we can spot what should not be
    // in the books at all.
    getAllConfirmedForReview(user.id),
  ]);

  const anomalies = findAnomalies(rows, todayISO);

  const personal: Anomaly[] = findPersonal(allRows).map((p) => ({
    key: 'not_business',
    // HIGH, always. This is not a tidiness question. It is the difference between
    // a right tax bill and a wrong one.
    severity: 'high' as const,
    title:
      p.amount > 0
        ? `${p.vendor ?? 'This'} is counted as money you earned`
        : `${p.vendor ?? 'This'} is counted as a business cost`,
    detail: p.why,
    when: p.transaction_date ?? todayISO,
    amount: Math.abs(p.amount),
    ids: p.id ? [p.id] : [],
    action: 'mark_personal' as const,
  }));

  const all = [...personal, ...anomalies];

  return NextResponse.json({
    count: all.length,
    summary: summariseAnomalies(all),
    anomalies: all,
  });
}

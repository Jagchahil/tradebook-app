import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, getConfirmedTransactionsForRange } from '../../../lib/supabase';
import { findAnomalies, summariseAnomalies } from '../../../lib/anomaly';

// Things to check. The "an accountant would have caught that" pass over the
// user's own confirmed entries this tax year. Deterministic, no AI, no spend.
// It never changes anything; it returns questions for the user to answer.
//   GET -> { count, summary, anomalies: [...] }

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
  const rows = await getConfirmedTransactionsForRange(user.id, taxYearStartISO(now), todayISO);
  const anomalies = findAnomalies(rows, todayISO);
  return NextResponse.json({
    count: anomalies.length,
    summary: summariseAnomalies(anomalies),
    anomalies,
  });
}

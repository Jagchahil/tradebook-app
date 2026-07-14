import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { readTeamCustomers, writeSnapshot, cronStarted, cronFinished } from '../../../../lib/supabase';
import { overview } from '../../../../lib/team';

export const runtime = 'nodejs';

// WRITE DOWN WHAT IS TRUE TODAY, BECAUSE TOMORROW IT WILL BE UNRECOVERABLE.
//
// A subscription row holds its CURRENT status. It does not hold a history. So a man who subscribed
// in June and cancelled in July is, in that table, indistinguishable from a man who never subscribed
// at all, and any "MRR over time" chart drawn from it is a RECONSTRUCTION.
//
// A reconstruction with a trend line on it, on the screen a founder uses to decide whether to keep
// going, is not a chart. It is a lie he will raise money against.
//
// So this job exists to make the past knowable, one day at a time, starting today. It is the least
// glamorous route in the codebase and in a year it will be the most valuable.
//
// IT USES THE SAME overview() THE DASHBOARD USES. Not a second copy of the arithmetic. The morning
// the dashboard said "MRR £13" on a day nobody had paid us, it was because a number had been derived
// somewhere other than where it was displayed. One function, one truth.
function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get('authorization') || '';
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  await cronStarted('metrics');

  const customers = await readTeamCustomers();
  if (customers === null) {
    // WE COULD NOT READ. That is not "we had zero customers today", and writing a zero would be
    // worse than writing nothing: a false zero in a revenue history is a cliff on a chart that
    // never happened, and it would sit there forever looking like the day the business died.
    await cronFinished('metrics', false, 0, 'could not read customers');
    return NextResponse.json({ ok: false, error: 'unreadable' }, { status: 503 });
  }

  const o = overview(customers);
  const day = new Date().toISOString().slice(0, 10);

  const wrote = await writeSnapshot({
    day,
    customers: o.customers,
    paying: o.active + o.pastDue,
    trialing: o.trialing,
    mrr_pence: o.mrrPence,
  });

  if (!wrote) {
    await cronFinished('metrics', false, 0, 'could not write the snapshot');
    return NextResponse.json({ ok: false, error: 'write failed' }, { status: 503 });
  }

  await cronFinished('metrics', true, 1);
  return NextResponse.json({ ok: true, day, customers: o.customers, mrrPence: o.mrrPence });
}

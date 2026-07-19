import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '../../../../lib/supabase';
import { rateLimitedShared } from '../../../../lib/ratelimit';
import { getCompanyOwners, companiesHouseEnabled } from '../../../../lib/companieshouse';

export const runtime = 'nodejs';

// A company's OWNERS, from the Companies House public register (doc: multi-owner accounts, 19 Jul).
// The app calls this with a company number to show a director who else owns the company, and it is the
// foundation of the accounts model: one paid company account, and a personal return for each owner.
//
// Token-gated: the DATA is public, but the gate stops anyone burning our Companies House rate limit,
// and it is read-only. Returns owners (persons with significant control, or active directors when a
// company reports none). Empty on any failure, so a caller never breaks on a slow register.

export async function GET(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const verified = await verifyAccessToken(token);
  if (!verified) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!companiesHouseEnabled()) return NextResponse.json({ ok: true, owners: [], enabled: false });

  if (await rateLimitedShared(`chowners:${verified.id}`, 10, 60 * 1000)) {
    return NextResponse.json({ ok: true, owners: [], throttled: true });
  }

  const number = (req.nextUrl.searchParams.get('number') || '').trim();
  if (!number) return NextResponse.json({ error: 'number required' }, { status: 400 });

  const owners = await getCompanyOwners(number);
  return NextResponse.json({
    ok: true,
    count: owners.length,
    owners: owners.map((o) => ({ name: o.name, role: o.role, controlBand: o.controlBand })),
  });
}

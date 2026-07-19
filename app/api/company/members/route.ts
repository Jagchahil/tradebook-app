import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '../../../../lib/supabase';
import { rateLimitedShared } from '../../../../lib/ratelimit';
import { getCompanyOwners, companiesHouseEnabled } from '../../../../lib/companieshouse';
import { listCompanyMembers, seedCompanyMembers } from '../../../../lib/companymembers';

export const runtime = 'nodejs';

// COMPANY MEMBERS (doc: multi-owner accounts, 19 Jul). The owners of a limited company under one paid
// account. GET returns the recorded owners; POST reads the Companies House register for a company
// number and records its owners against this account. Token-gated, scoped to the caller's own account.
// This ONLY records who the owners are. It grants no paid seat and changes no billing; inviting an
// owner to their own login is a separate, deliberate step.

export async function GET(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const verified = await verifyAccessToken(token);
  if (!verified) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const members = await listCompanyMembers(verified.id);
  if (members === null) return NextResponse.json({ error: 'unreadable' }, { status: 503 });
  return NextResponse.json({ ok: true, members });
}

interface Body { number?: string }

export async function POST(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const verified = await verifyAccessToken(token);
  if (!verified) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (await rateLimitedShared(`members:${verified.id}`, 6, 60 * 1000)) {
    return NextResponse.json({ ok: true, throttled: true });
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const number = (body.number || '').trim();
  if (!number) return NextResponse.json({ error: 'number required' }, { status: 400 });

  if (!companiesHouseEnabled()) {
    const members = await listCompanyMembers(verified.id);
    return NextResponse.json({ ok: true, enabled: false, members: members ?? [] });
  }

  const owners = await getCompanyOwners(number);
  if (owners.length > 0) {
    await seedCompanyMembers(
      verified.id,
      number,
      owners.map((o) => ({ name: o.name, role: o.role, controlBand: o.controlBand })),
    );
  }
  const members = await listCompanyMembers(verified.id);
  if (members === null) return NextResponse.json({ error: 'unreadable' }, { status: 503 });
  return NextResponse.json({ ok: true, seeded: owners.length, members });
}

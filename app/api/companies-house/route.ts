import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '../../../lib/supabase';
import { searchCompanies, getCompany, companiesHouseEnabled } from '../../../lib/companieshouse';

// Companies House auto-fill for onboarding. The API key stays on the server; the app never sees it.
//   GET /api/companies-house?q=acme plumbing   -> { matches: [...] }
//   GET /api/companies-house?number=12345678    -> { company: {...} }
//
// Gated behind a signed-in token, so our key cannot be pumped anonymously. It is only ever a READ of
// the public register, and it fails soft: an empty list or a null company, never a 500 that stalls
// a man halfway through signing up.

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!companiesHouseEnabled()) {
    // Not configured on this deployment: tell the client plainly so it can just show the manual fields.
    return NextResponse.json({ enabled: false, matches: [], company: null });
  }

  const { searchParams } = new URL(req.url);
  const number = searchParams.get('number');
  if (number) {
    const company = await getCompany(number);
    return NextResponse.json({ enabled: true, company });
  }

  const q = searchParams.get('q') ?? '';
  const matches = await searchCompanies(q);
  return NextResponse.json({ enabled: true, matches });
}

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
  // A no-auth health probe. Returns ONLY whether a key is configured on this deployment (a boolean,
  // never the key, never any register data), so we can confirm the env var actually baked into the
  // running build after a deploy. `curl https://lekhio.app/api/companies-house?diag=1`.
  const diag = new URL(req.url).searchParams.get('diag');
  if (diag === '1') {
    return NextResponse.json({ enabled: companiesHouseEnabled() });
  }

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

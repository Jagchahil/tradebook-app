import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '../../../lib/supabase';
import { searchCompanies, getCompany, companiesHouseEnabled } from '../../../lib/companieshouse';
import { rateLimitedShared } from '../../../lib/ratelimit';

// Companies House auto-fill for onboarding. The API key stays on the server; the app never sees it.
//   GET /api/companies-house?q=acme plumbing   -> { matches: [...] }
//   GET /api/companies-house?number=12345678    -> { company: {...} }
//
// Gated behind a signed-in token, so our key cannot be pumped anonymously. It is only ever a READ of
// the public register, and it fails soft: an empty list or a null company, never a 500 that stalls
// a man halfway through signing up.
//
// AND RATE LIMITED PER ACCOUNT, which is the part that was missing.
//
// Being signed in was never enough on its own here. Companies House caps us at 600 requests per
// five minutes on ONE key shared by every user we have. Signing up is only throttled per IP, so a
// script could make a handful of accounts and loop this endpoint until that shared quota was gone,
// and the symptom would not be an error on the attacker's screen: it would be company lookup
// quietly failing for every real plumber halfway through signing up, with nothing in our logs
// saying why. A per-account ceiling makes one account's abuse cost that account and nobody else.
//
// The number is deliberately generous. A man typing his company name fires a few of these as he
// types and then he is done; nobody legitimately needs sixty lookups a minute.
const LOOKUPS_PER_MINUTE = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (await rateLimitedShared(`ch:${user.id}`, LOOKUPS_PER_MINUTE, 60 * 1000)) {
    // Fails soft, like the rest of this route: the client shows the manual fields rather than
    // an error, so a man who somehow trips this can still finish signing up by typing it himself.
    return NextResponse.json(
      { enabled: true, matches: [], company: null, rate_limited: true },
      { status: 429 },
    );
  }

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

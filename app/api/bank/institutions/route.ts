import { NextRequest, NextResponse } from 'next/server';
import { hasBankFeedConfig, getAccessToken, listInstitutions } from '../../../../lib/bankfeed';
import { verifyAccessToken } from '../../../../lib/supabase';

// The UK bank list for the app's bank picker. Authenticated, because there is
// no reason to serve it to anyone else, and dormant until the bank feed keys
// exist. Returns id, name and logo only.
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!hasBankFeedConfig()) {
    return NextResponse.json({ error: 'not_enabled', message: 'Bank feeds are not switched on yet.' }, { status: 503 });
  }
  const access = await getAccessToken();
  if (!access) return NextResponse.json({ error: 'provider_unavailable' }, { status: 502 });
  const institutions = await listInstitutions(access);
  if (!institutions) return NextResponse.json({ error: 'provider_unavailable' }, { status: 502 });
  return NextResponse.json({ institutions });
}

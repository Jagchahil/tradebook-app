import { NextRequest, NextResponse } from 'next/server';
import { hasBankFeedConfig } from '../../../../lib/bankfeed';
import { verifyAccessToken, listBankConnectionsForUser } from '../../../../lib/supabase';

// The app's single probe for the bank card. Three states:
//   503                  feature not switched on (card shows the coming soon teaser)
//   200 connected:false  available to connect
//   200 connected:true   connected (card shows the connected state + disconnect)
// Never returns tokens or account ids.
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!hasBankFeedConfig()) {
    return NextResponse.json({ error: 'not_enabled' }, { status: 503 });
  }

  const connections = await listBankConnectionsForUser(user.id);
  const linked = connections.filter((c) => c.status === 'linked');
  const expired = connections.some((c) => c.status === 'expired');
  return NextResponse.json({
    connected: linked.length > 0,
    expired: linked.length === 0 && expired,
    last_synced_date: linked[0]?.last_synced_date ?? null,
  });
}

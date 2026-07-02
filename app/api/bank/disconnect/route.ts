import { NextRequest, NextResponse } from 'next/server';
import { hasBankFeedConfig } from '../../../../lib/bankfeed';
import { verifyAccessToken, revokeBankConnections } from '../../../../lib/supabase';

// Disconnect the user's bank feed. Destroys our copy of the tokens so no
// further reads are possible from Lekhio's side; the consent at the bank runs
// out on its own 90 day clock and can also be revoked by the user at the bank.
// Imported transactions are untouched: they are the user's records, and each
// one still needs their confirmation before it counts toward anything.
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!hasBankFeedConfig()) {
    return NextResponse.json({ error: 'not_enabled' }, { status: 503 });
  }

  const ok = await revokeBankConnections(user.id);
  if (!ok) return NextResponse.json({ error: 'storage_failed' }, { status: 500 });
  return NextResponse.json({ disconnected: true });
}

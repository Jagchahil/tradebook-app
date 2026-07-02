import { NextRequest, NextResponse } from 'next/server';
import { hasBankFeedConfig } from '../../../../lib/bankfeed';
import { verifyAccessToken } from '../../../../lib/supabase';

// TrueLayer hosts the bank picker inside its own auth dialog, so the app does
// not need a real institutions list. This endpoint exists for two jobs: the
// Settings screen probes it to decide whether to show the "Connect your bank"
// row (503 while dormant), and the picker screen renders the single entry it
// returns, which starts the hosted journey. Authenticated, dormant without the
// TrueLayer keys.
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!hasBankFeedConfig()) {
    return NextResponse.json({ error: 'not_enabled', message: 'Bank feeds are not switched on yet.' }, { status: 503 });
  }

  return NextResponse.json({
    institutions: [
      {
        id: 'truelayer',
        name: process.env.BANK_SANDBOX === 'true' ? 'Choose your bank (test mode)' : 'Choose your bank',
        logo: null,
      },
    ],
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { bankFeedOffered, hasBankFeedConfig } from '../../../../lib/bankfeed';
import { sessionUser } from '../../../../lib/webauth';

// TrueLayer hosts the bank picker inside its own auth dialog, so the app does
// not need a real institutions list. This endpoint exists for two jobs: the
// Settings screen probes it to decide whether to show the "Connect your bank"
// row (503 while dormant), and the picker screen renders the single entry it
// returns, which starts the hosted journey. Authenticated, dormant without the
// TrueLayer keys.
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await sessionUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // The OFFER switch counts here as well as the config: this endpoint is what puts a Choose your
  // bank entry on a screen, and while bankFeedOffered() is off no surface may render one. The
  // status endpoint is untouched, so an existing connection still shows and still disconnects.
  if (!bankFeedOffered() || !hasBankFeedConfig()) {
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

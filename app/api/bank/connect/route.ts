import { NextRequest, NextResponse } from 'next/server';
import { hasBankFeedConfig, buildAuthLink, historyFromISO, type BankHistory } from '../../../../lib/bankfeed';
import { verifyAccessToken, createBankConnection } from '../../../../lib/supabase';
import { signState } from '../../../../lib/hmrc';

// Start a bank connection. The app posts with the user's Supabase token; we
// hand back TrueLayer's hosted auth link (their dialog includes the bank
// picker). The OAuth state is an HMAC signed value carrying the verified user
// id (same signer as the HMRC flow), so the callback can bind the connection
// to the right account without trusting anything client supplied.
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!hasBankFeedConfig()) {
    return NextResponse.json({ error: 'not_enabled', message: 'Bank feeds are not switched on yet.' }, { status: 503 });
  }

  // How much history to import, chosen by the user. Default the minimum: this
  // tax year only. We never pull a person's whole banking history by default.
  let history: BankHistory = 'this_year';
  try {
    const body = (await req.json()) as { history?: unknown };
    if (body?.history === 'this_year' || body?.history === 'two_years' || body?.history === 'all') {
      history = body.history;
    }
  } catch {
    // no body, keep the default
  }

  const state = signState(user.id);
  if (!state) return NextResponse.json({ error: 'server_config' }, { status: 500 });

  const link = buildAuthLink(state);
  if (!link) return NextResponse.json({ error: 'provider_unavailable' }, { status: 502 });

  const stored = await createBankConnection(user.id, state, historyFromISO(history));
  if (!stored) return NextResponse.json({ error: 'storage_failed' }, { status: 500 });

  return NextResponse.json({ link });
}

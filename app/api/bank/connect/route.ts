import { NextRequest, NextResponse } from 'next/server';
import { hasBankFeedConfig, buildAuthLink, historyFromISO, type BankHistory } from '../../../../lib/bankfeed';
import { createBankConnection } from '../../../../lib/supabase';
import { sessionUser } from '../../../../lib/webauth';
import { signState } from '../../../../lib/hmrc';

// Start a bank connection. The app posts with the user's Supabase token; we
// hand back TrueLayer's hosted auth link (their dialog includes the bank
// picker). The OAuth state is an HMAC signed value carrying the verified user
// id (same signer as the HMRC flow), so the callback can bind the connection
// to the right account without trusting anything client supplied.
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const user = await sessionUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!hasBankFeedConfig()) {
    return NextResponse.json({ error: 'not_enabled', message: 'Bank feeds are not switched on yet.' }, { status: 503 });
  }

  // How much history to import, chosen by the user. Default the minimum: this
  // tax year only. We never pull a person's whole banking history by default.
  // 🔴 AND WHAT THE ACCOUNT IS FOR. Asked here because it is the only moment he is thinking about
  // this specific account, and because the answer changes what every row from it means.
  //
  // Defaults to 'mixed', which is the honest answer for a sole trader who has no legal separation
  // and often runs everything through one current account, and which asks about everything. A
  // client that says nothing gets the cautious answer, never the permissive one.
  let history: BankHistory = 'this_year';
  let accountUse: 'business' | 'personal' | 'mixed' = 'mixed';
  try {
    const body = (await req.json()) as { history?: unknown; accountUse?: unknown };
    if (body?.history === 'this_year' || body?.history === 'two_years' || body?.history === 'all') {
      history = body.history;
    }
    if (body?.accountUse === 'business' || body?.accountUse === 'personal' || body?.accountUse === 'mixed') {
      accountUse = body.accountUse;
    }
  } catch {
    // no body, keep the defaults
  }

  const state = signState(user.id);
  if (!state) return NextResponse.json({ error: 'server_config' }, { status: 500 });

  const link = buildAuthLink(state);
  if (!link) return NextResponse.json({ error: 'provider_unavailable' }, { status: 502 });

  const stored = await createBankConnection(user.id, state, historyFromISO(history), accountUse);
  if (!stored) return NextResponse.json({ error: 'storage_failed' }, { status: 500 });

  return NextResponse.json({ link });
}

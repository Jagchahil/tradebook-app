import { NextRequest, NextResponse } from 'next/server';
import { hasBankFeedConfig, buildAuthLink, historyFromISO, type BankHistory } from '../../../../lib/bankfeed';
import { createBankConnection } from '../../../../lib/supabase';
import { sessionUser } from '../../../../lib/webauth';
import { signState } from '../../../../lib/hmrc';
import { gateForUser, refuseUnentitled } from '../../../../lib/gateserver';

// Start a bank connection. The app posts with the user's Supabase token; we
// hand back TrueLayer's hosted auth link (their dialog includes the bank
// picker). The OAuth state is an HMAC signed value carrying the verified user
// id (same signer as the HMRC flow), so the callback can bind the connection
// to the right account without trusting anything client supplied.
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const user = await sessionUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // 🔴 THE WORK STOPS WHEN HE STOPS PAYING. lib/gate.ts row: this route is 'entitled'.
  //
  // His records stay readable everywhere; what a lapsed subscription buys is that we do nothing NEW
  // for him. gateForUser never returns readonly because something broke, so this can only fire on a
  // real answer about a real subscription.
  if ((await gateForUser(user.id)) === 'readonly') return refuseUnentitled(req, '/app/setup?step=bank');

  if (!hasBankFeedConfig()) {
    return NextResponse.json({ error: 'not_enabled', message: 'Bank feeds are not switched on yet.' }, { status: 503 });
  }

  // ⚠️ AND A FORM CALLER NEVER SEES JSON. /app/setup only draws the button when the feature is on, so
  // reaching the failures below means something changed under him mid setup, and a man in the middle
  // of setting up his books must not be shown an error object. He goes back to the step, which says
  // plainly that the bank is not available and offers Skip.
  const isForm = (req.headers.get('content-type') || '').includes('application/x-www-form-urlencoded');
  const bankProblem = (why: string) => NextResponse.redirect(
    new URL(`/app/setup?step=bank&bank=${why}`, req.url), 303,
  );

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
  // TWO ENCODINGS, ONE CONNECTION. /app/setup ships no client script, so its bank step posts a plain
  // form and is answered with a 303 straight at the bank. The phone app posts JSON and follows the
  // link itself. Everything that decides what this connection MEANS is below, shared by both.
  const body: { history?: unknown; accountUse?: unknown } = isForm
    ? await req.formData()
      .then((f) => ({ history: String(f.get('history') ?? ''), accountUse: String(f.get('accountUse') ?? '') }))
      .catch(() => ({}))
    : await req.json().catch(() => ({}));
  if (body?.history === 'this_year' || body?.history === 'two_years' || body?.history === 'all') {
    history = body.history;
  }
  if (body?.accountUse === 'business' || body?.accountUse === 'personal' || body?.accountUse === 'mixed') {
    accountUse = body.accountUse;
  }

  const state = signState(user.id);
  if (!state) {
    return isForm ? bankProblem('unavailable') : NextResponse.json({ error: 'server_config' }, { status: 500 });
  }

  const link = buildAuthLink(state);
  if (!link) {
    return isForm ? bankProblem('unavailable') : NextResponse.json({ error: 'provider_unavailable' }, { status: 502 });
  }

  const stored = await createBankConnection(user.id, state, historyFromISO(history), accountUse);
  if (!stored) {
    // Refused ON PURPOSE rather than sending him to his bank anyway. The callback finds the
    // connection by the state we stored; with no row it cannot bind the account, so he would approve
    // at his bank, come back, and be told the link had expired. Better to say so before he leaves.
    return isForm ? bankProblem('unavailable') : NextResponse.json({ error: 'storage_failed' }, { status: 500 });
  }

  // 🔴 THE FORM CALLER IS SENT TO HIS BANK, AND HE MUST BE ABLE TO COME BACK.
  //
  // This is the one step in setup that hands a man to somebody else's website for multi factor
  // authentication and hopes he returns. It is never the thing standing between him and his account:
  // the step above this offers Skip, and /api/bank/callback brings a web customer back to the step he
  // left rather than bouncing at an app he has not installed.
  //
  // 303 so that arriving back on this URL with the back button does not open a second connection.
  if (isForm) return NextResponse.redirect(link, 303);

  return NextResponse.json({ link });
}

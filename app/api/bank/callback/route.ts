import { NextRequest, NextResponse } from 'next/server';
import { hasBankFeedConfig, exchangeCode, listAccounts } from '../../../../lib/bankfeed';
import { getBankConnectionByReference, updateBankConnection } from '../../../../lib/supabase';
import { verifyState } from '../../../../lib/hmrc';

// TrueLayer sends the user here after bank authentication with ?code=&state=.
// The state is the HMAC signed value we minted at connect time, so it cannot be
// forged and it expires. We exchange the code for tokens server side, store
// them against the connection (service role only table), and the daily sync
// does the rest. The response is a small branded page pointing back to the app.
export const runtime = 'nodejs';

function page(title: string, body: string): NextResponse {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title} | Lekhio</title></head><body style="margin:0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#FBFAF7;color:#111111;display:flex;min-height:100vh;align-items:center;justify-content:center"><div style="max-width:420px;padding:32px;text-align:center"><div style="font-size:22px;font-weight:700;letter-spacing:-1px;margin-bottom:18px">Lekhio</div><h1 style="font-size:24px;margin:0 0 10px">${title}</h1><p style="font-size:15.5px;color:#5B6470;line-height:1.6;margin:0">${body}</p></div></body></html>`;
  return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function GET(req: NextRequest) {
  if (!hasBankFeedConfig()) {
    return page('Not switched on yet', 'Bank connections are not live yet. Nothing has been shared.');
  }

  const params = req.nextUrl.searchParams;
  const state = params.get('state') ?? '';
  const code = params.get('code') ?? '';
  const providerError = params.get('error');

  const userId = state ? verifyState(state) : null;
  if (!userId) {
    return page('That link has expired', 'Start the bank connection again from the Lekhio app and it will work first time.');
  }

  const connection = await getBankConnectionByReference(state);
  if (!connection || connection.user_id !== userId) {
    return page('We could not find that connection', 'Start the bank connection again from the Lekhio app.');
  }

  if (providerError || !code) {
    await updateBankConnection(connection.id, { status: 'failed' });
    return page(
      'That did not finish',
      'Your bank did not complete the connection. Nothing has been shared. You can try again from the Lekhio app whenever you like.',
    );
  }

  const tokens = await exchangeCode(code);
  if (!tokens) {
    await updateBankConnection(connection.id, { status: 'failed' });
    return page('That did not finish', 'We could not complete the connection. Nothing has been shared. Try again from the app.');
  }

  const accounts = await listAccounts(tokens.access_token);
  if (!accounts || accounts.length === 0) {
    await updateBankConnection(connection.id, { status: 'failed' });
    return page('No accounts found', 'The bank did not share any accounts. Try again and make sure at least one account is selected.');
  }

  await updateBankConnection(connection.id, {
    status: 'linked',
    account_ids: accounts,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expires_at: tokens.expires_at,
  });
  return page(
    'Bank connected',
    'From tomorrow your transactions will appear in Lekhio each day, ready for you to check and confirm. Nothing counts toward your tax until you approve it. You can close this and go back to the app.',
  );
}

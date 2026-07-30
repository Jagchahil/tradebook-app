import { NextRequest, NextResponse, after } from 'next/server';
import { hasBankFeedConfig, exchangeCode, listAccounts } from '../../../../lib/bankfeed';
import { getBankConnectionByReference, updateBankConnection } from '../../../../lib/supabase';
import { syncWithAccessToken } from '../../../../lib/banksync';
import { verifyState } from '../../../../lib/hmrc';
import { userFromSessionCookie, readCookie } from '../../../../lib/webauth';
import { SESSION_COOKIE } from '../../../../lib/websession';

// TrueLayer sends the user here after bank authentication with ?code=&state=.
// The state is the HMAC signed value we minted at connect time, so it cannot be
// forged and it expires. We exchange the code for tokens server side, store
// them against the connection (service role only table), and run the FIRST
// sync right here, so the user sees their transactions moments after
// connecting instead of waiting for the daily cron. The response is a small
// branded page pointing back to the app.
export const runtime = 'nodejs';
export const maxDuration = 60;

// The app's own URL scheme (app.json: "scheme": "tradebook"). Opening it hands the user back to
// the app they started in, on the screen that now has something to show them.
const APP_SCHEME_URL = 'tradebook://transactions';

// Where a WEB customer goes back to. The step he left, so a man who connected his bank in the middle
// of setting up carries on where he was rather than at the front of his own dashboard.
const WEB_RETURN_URL = '/app/setup?step=bank';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHICH SURFACE DID HE START ON, AND WHY WE CAN TELL WITHOUT STORING IT.
//
// Until 29 July every man who reached this page had started in the phone app, so the success page
// bounces at `tradebook://transactions`. A web customer has no app installed. That scheme resolves to
// nothing for him, so the last thing he sees at the end of the one capture route that works on day
// one is a dead button, which is the same dead end the whole 28 July walk was about.
//
// ⚠️ THE SIGNAL IS HIS SESSION COOKIE, AND IT COSTS NO COLUMN AND NO MIGRATION.
//
// This is a top level navigation back to lekhio.app, so SameSite=Lax attaches the web session cookie
// if he has one. The phone app's browser has none. So: cookie that resolves to a real session, and
// the same man the signed state names, means he is on the web.
//
// 🔴 THE IDS MUST MATCH, AND THAT COMPARISON IS THE WHOLE GUARD. On a shared or family device the
// cookie can belong to somebody else entirely. It is used for one thing only, deciding which button
// to draw, and it decides nothing about whose connection this is: that has come from the HMAC signed
// state since the day this route was written, and still does. A mismatch simply means we do not know,
// and not knowing falls back to the behaviour that was here before.
// ═══════════════════════════════════════════════════════════════════════════════════════════
async function startedOnWeb(req: NextRequest, userId: string): Promise<boolean> {
  try {
    const session = await userFromSessionCookie(readCookie(req.headers.get('cookie'), SESSION_COOKIE));
    return Boolean(session && session.id === userId);
  } catch {
    // Not knowing is not an error worth failing his connection over. He gets the old page.
    return false;
  }
}

// THE DEAD END THIS FIXES.
//
// A man taps "connect your bank" in the app, disappears into his bank, approves, and arrives
// here: a page on a website, with no way back. He has to remember on his own that Lekhio is an
// app, find it, and open it. On the very first run of this flow that was the one bit that felt
// broken, and it is the last thing he sees, so it is the bit he remembers.
//
// So the success page now (a) tries to bounce him straight back after a beat, and (b) always
// shows a button in case the bounce is blocked, which it will be on some browsers because a
// custom scheme opened without a user gesture is exactly what browsers guard against.
//
// The delay is deliberate. The redirect fires AFTER the message has been on screen long enough
// to read, because "your transactions are arriving" is the reassurance he needs before we move
// him. Instant redirects that flash a page are worse than no redirect at all.
type Surface = 'none' | 'app' | 'web';

function page(title: string, body: string, back: Surface = 'none'): NextResponse {
  // ⚠️ THE WEB BUTTON IS A PLAIN PATH AND CARRIES NO SCRIPT. A custom scheme has to be opened by
  // JavaScript because a browser will not follow one without a gesture; an ordinary link needs none,
  // and the rest of the web app ships no script for the same reason he is on a bad signal.
  const href = back === 'web' ? WEB_RETURN_URL : APP_SCHEME_URL;
  const label = back === 'web' ? 'Back to setting up' : 'Back to Lekhio';
  const backButton = back === 'none'
    ? ''
    : `<a href="${href}" style="display:inline-block;margin-top:24px;background:#1B59A6;color:#ffffff;text-decoration:none;font-size:15.5px;font-weight:600;padding:13px 26px;border-radius:12px">${label}</a>`;
  // Only on the success page, and only after the text has been readable for a moment. The web return
  // is a real navigation, so it needs no timer and gets none: a redirect a browser can simply follow
  // beats a script that fires it.
  const bounce = back === 'app'
    ? `<script>setTimeout(function(){try{window.location.href=${JSON.stringify(APP_SCHEME_URL)}}catch(e){}},2500)</script>`
    : '';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title} | Lekhio</title></head><body style="margin:0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#FBFAF7;color:#111111;display:flex;min-height:100vh;align-items:center;justify-content:center"><div style="max-width:420px;padding:32px;text-align:center"><div style="font-size:22px;font-weight:700;letter-spacing:-1px;margin-bottom:18px">Lekhio</div><h1 style="font-size:24px;margin:0 0 10px">${title}</h1><p style="font-size:15.5px;color:#5B6470;line-height:1.6;margin:0">${body}</p>${backButton}</div>${bounce}</body></html>`;
  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // The callback URL carries the one time auth code and signed state in the
      // query string. no-referrer stops that URL leaking through the Referer
      // header if the page ever links out.
      'Referrer-Policy': 'no-referrer',
    },
  });
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

  // Resolved once, here, because every page below this line needs it and asking twice would mean two
  // answers to "where did he come from". Never used to decide WHOSE connection this is.
  const surface: Surface = (await startedOnWeb(req, userId)) ? 'web' : 'app';

  const connection = await getBankConnectionByReference(state);
  if (!connection || connection.user_id !== userId) {
    return page('We could not find that connection', 'Start the bank connection again from Lekhio and it will work first time.', surface);
  }

  // Reload guard. Auth codes are single use, so if this connection is already
  // linked (the user refreshed the success page, or a browser retried), do not
  // exchange again; just show the success page.
  if (connection.status === 'linked') {
    return page(
      'Bank connected',
      'Your transactions arrive in Lekhio each day, marked "to review". Nothing counts toward your tax until you approve it.',
      surface,
    );
  }

  if (providerError || !code) {
    await updateBankConnection(connection.id, { status: 'failed' });
    return page(
      'That did not finish',
      'Your bank did not complete the connection. Nothing has been shared, and you can try again whenever you like.',
      // ⚠️ A FAILED CONNECTION STILL GETS THE WAY BACK. He is in the middle of setting up, and a dead
      // end here would cost him every step after this one over a bank that timed out.
      surface,
    );
  }

  const tokens = await exchangeCode(code);
  if (!tokens) {
    await updateBankConnection(connection.id, { status: 'failed' });
    return page('That did not finish', 'We could not complete the connection. Nothing has been shared, and you can try again whenever you like.', surface);
  }

  const accounts = await listAccounts(tokens.access_token);
  if (!accounts || accounts.ids.length === 0) {
    await updateBankConnection(connection.id, { status: 'failed' });
    return page('No accounts found', 'The bank did not share any accounts. Try again and make sure at least one account is selected.', surface);
  }

  await updateBankConnection(connection.id, {
    status: 'linked',
    account_ids: accounts.ids,
    bank_name: accounts.bankName,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expires_at: tokens.expires_at,
  });

  // First sync runs in the BACKGROUND, after this page has been sent. Mock and
  // real banks alike can return hundreds of lines, and making the redirect wait
  // on the import is what makes a page feel stuck. The page renders instantly;
  // the transactions land seconds later; the daily sync is the safety net.
  after(async () => {
    try {
      const r = await syncWithAccessToken(
        { id: connection.id, user_id: connection.user_id, account_ids: accounts.ids, last_synced_date: null, history_from: connection.history_from },
        tokens.access_token,
      );
      console.log(`[bank] first sync inserted=${r.inserted}`);
    } catch (err) {
      console.error('[bank] first sync failed:', err instanceof Error ? err.message : 'unknown');
    }
  });

  // ⚠️ AND THE LAST SENTENCE MATCHES WHAT ACTUALLY HAPPENS NEXT, WHICH IS NOT THE SAME ON BOTH
  // SURFACES. "Taking you back to the app" is a promise kept by a timer and a custom scheme, and for
  // a web customer with no app installed it is a sentence about something that will not happen.
  return page(
    'Bank connected',
    'Your recent transactions are arriving in Lekhio right now, marked "to review", with new ones each day. '
    + 'Nothing counts toward your tax until you approve it. '
    + (surface === 'web' ? 'Carry on where you left off.' : 'Taking you back to the app.'),
    surface,
  );
}

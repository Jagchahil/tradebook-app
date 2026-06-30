import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForToken, verifyState } from '../../../../lib/hmrc';
import { saveHmrcConnection } from '../../../../lib/supabase';

// HMRC redirects the user's browser back here after they grant (or deny) access.
// We verify the signed state to learn which user this is, swap the code for
// tokens, store them server-side, and land on a friendly confirmation page.
// This is a browser redirect, so there is no app auth header; the signed state
// is the only thing we trust.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');

  const done = (status: 'ok' | 'error') =>
    NextResponse.redirect(new URL(`/hmrc/connected?status=${status}`, req.url));

  if (error || !code || !state) return done('error');

  const userId = verifyState(state);
  if (!userId) return done('error');

  const tokens = await exchangeCodeForToken(code);
  if (!tokens) return done('error');

  const expiresAt = new Date(Date.now() + (Number(tokens.expires_in) || 0) * 1000).toISOString();
  const saved = await saveHmrcConnection(userId, {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: expiresAt,
  });
  return done(saved ? 'ok' : 'error');
}

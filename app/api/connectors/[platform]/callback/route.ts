import { NextRequest, NextResponse } from 'next/server';
import { upsertConnectorToken } from '../../../../../lib/supabase';
import { CONNECTORS_ENABLED, isConnector, verifyState, exchangeCode } from '../../../../../lib/connectors';

export const runtime = 'nodejs';

// CALLBACK from the platform's OAuth. No session on this hop: the platform redirects the browser
// straight here, so we trust the signed state instead. verifyState proves the round trip is ours and
// tells us which platform and which owner started it. We swap the code for tokens, store them
// encrypted, and bounce the browser back to the console with a plain result flag.
//
// Dark by default: with CONNECTORS_ENABLED off, exchangeCode refuses, so even a real code stores
// nothing. Connecting an account is not the same as posting from it. Posting still needs its own gate.
export async function GET(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const base = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const back = (q: string) => NextResponse.redirect(`${base}/team/system?${q}`);

  if (!isConnector(platform)) return back('connect_error=unknown_platform');
  if (!CONNECTORS_ENABLED()) return back('connect_error=disabled');

  const sp = req.nextUrl.searchParams;
  const platformError = sp.get('error');
  if (platformError) return back(`connect_error=${encodeURIComponent(platformError.slice(0, 40))}`);

  const code = sp.get('code') || '';
  const state = sp.get('state') || '';
  const payload = verifyState(state);
  if (!code || !payload) return back('connect_error=bad_state');

  const parts = payload.split(':');
  const statePlatform = parts[0];
  const email = parts[1];
  const codeVerifier = parts[3] || undefined; // present only for X (PKCE)
  if (statePlatform !== platform) return back('connect_error=platform_mismatch');

  const tok = await exchangeCode(platform, code, codeVerifier ? { codeVerifier } : undefined);
  if (!tok.ok || !tok.access_token) return back(`connect_error=${encodeURIComponent(tok.error || 'exchange_failed')}`);

  const expiresAt = tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000).toISOString() : null;
  const saved = await upsertConnectorToken({
    platform,
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expires_at: expiresAt,
    scope: null,
    connected_by: email || null,
  });
  return back(saved ? `connected=${platform}` : 'connect_error=store_failed');
}

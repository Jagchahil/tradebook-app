// THE AD AND POST CONNECTORS, the single wrapper for Meta, TikTok and Google. Every OAuth handshake,
// every webhook check, and every token exchange for the three platforms goes through this one file,
// the same posture as lib/claude.ts, lib/whatsapp.ts and lib/higgsfield.ts.
//
// It ships DARK. CONNECTORS_ENABLED is off by default, so exchangeCode refuses and the start route
// will not redirect. Nothing here posts a thing or spends a penny: it is the plumbing that lets Jag
// connect the accounts by OAuth, and the live posting and ad spend still sit behind their own gates
// that do not exist yet. Two authorisations, and this only carries the platform's, never Jag's.
//
// The pure parts (the authorize URL, the config check, the state signing, the Meta signature) are
// tested without a network. Only exchangeCode reaches out, and it is guarded and isolated.

import crypto from 'node:crypto';

export type Connector = 'meta' | 'tiktok' | 'google';
export const CONNECTORS: Connector[] = ['meta', 'tiktok', 'google'];

export function isConnector(v: string): v is Connector {
  return (CONNECTORS as string[]).includes(v);
}

// The master switch for the whole connector layer. Off until Jag flips it on Vercel.
export function CONNECTORS_ENABLED(): boolean {
  return (process.env.CONNECTORS_ENABLED || '').trim().toLowerCase() === 'true';
}

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

function cfg(platform: Connector): OAuthConfig {
  const e = process.env;
  if (platform === 'meta') {
    return { clientId: e.META_APP_ID || '', clientSecret: e.META_APP_SECRET || '', redirectUri: e.META_REDIRECT_URI || '' };
  }
  if (platform === 'tiktok') {
    return { clientId: e.TIKTOK_CLIENT_KEY || '', clientSecret: e.TIKTOK_CLIENT_SECRET || '', redirectUri: e.TIKTOK_REDIRECT_URI || '' };
  }
  return { clientId: e.GOOGLE_CLIENT_ID || '', clientSecret: e.GOOGLE_CLIENT_SECRET || '', redirectUri: e.GOOGLE_REDIRECT_URI || '' };
}

// True when a platform has its id, secret and redirect all set. The start route needs this before it
// can send anyone anywhere.
export function connectorConfigured(platform: Connector): boolean {
  const c = cfg(platform);
  return Boolean(c.clientId && c.clientSecret && c.redirectUri);
}

// The scopes we ask for. Meta wants ads plus Instagram content publishing. TikTok wants to publish
// video. Google wants Ads and a YouTube upload. Kept in one place so a review note can cite them.
const SCOPES: Record<Connector, string> = {
  meta: 'ads_management,ads_read,business_management,instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement',
  tiktok: 'video.publish,video.upload',
  google: 'https://www.googleapis.com/auth/adwords https://www.googleapis.com/auth/youtube.upload',
};

const AUTH_BASE: Record<Connector, string> = {
  meta: 'https://www.facebook.com/v21.0/dialog/oauth',
  tiktok: 'https://www.tiktok.com/v2/auth/authorize/',
  google: 'https://accounts.google.com/o/oauth2/v2/auth',
};

const TOKEN_URL: Record<Connector, string> = {
  meta: 'https://graph.facebook.com/v21.0/oauth/access_token',
  tiktok: 'https://open.tiktokapis.com/v2/oauth/token/',
  google: 'https://oauth2.googleapis.com/token',
};

// Build the authorize URL the user is sent to. Pure. `state` must be a signed token from signState,
// so the callback can prove the round trip is ours and not a forged one.
export function authorizeUrl(platform: Connector, state: string): string {
  const c = cfg(platform);
  const p = new URLSearchParams();
  // TikTok names the id client_key, the other two client_id.
  if (platform === 'tiktok') p.set('client_key', c.clientId);
  else p.set('client_id', c.clientId);
  p.set('redirect_uri', c.redirectUri);
  p.set('response_type', 'code');
  p.set('scope', SCOPES[platform]);
  p.set('state', state);
  if (platform === 'google') {
    // Offline plus consent so Google returns a refresh token we can keep.
    p.set('access_type', 'offline');
    p.set('prompt', 'consent');
  }
  return `${AUTH_BASE[platform]}?${p.toString()}`;
}

// --- OAuth state, signed so the callback cannot be forged --------------------------------------

function stateSecret(override?: string): string {
  return (override || process.env.CONNECTOR_STATE_SECRET || process.env.AGENT_SECRET || '').trim();
}

// Sign an opaque payload into a state token: base64url(payload).base64url(hmac). Pure given a secret.
export function signState(payload: string, secret?: string): string {
  const s = stateSecret(secret);
  const body = Buffer.from(payload, 'utf8').toString('base64url');
  const mac = crypto.createHmac('sha256', s).update(body).digest('base64url');
  return `${body}.${mac}`;
}

// Verify a state token and return its payload, or null if the signature does not check out. A missing
// secret returns null, failing closed: without a secret we cannot trust any callback.
export function verifyState(token: string | null | undefined, secret?: string): string | null {
  const s = stateSecret(secret);
  if (!s || !token) return null;
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', s).update(body).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return Buffer.from(body, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

// --- webhooks ----------------------------------------------------------------------------------

// The Meta webhook handshake. Meta sends a GET with these params on setup. Echo the challenge only if
// the verify token matches ours.
export function verifyMetaWebhook(mode: string | null, token: string | null, challenge: string | null): string | null {
  const vt = (process.env.META_VERIFY_TOKEN || '').trim();
  if (mode === 'subscribe' && token && vt && token === vt) return challenge;
  return null;
}

// Validate a Meta x-hub-signature-256 header against the raw body, the same scheme as the WhatsApp
// webhook. The marketing app can share the WhatsApp app secret, so we fall back to it. Fails closed
// with no secret.
export function verifyMetaSignature(rawBody: string, header: string | null, secret?: string): boolean {
  const s = (secret || process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET || '').trim();
  if (!s || !header || !header.startsWith('sha256=')) return false;
  const expected = header.slice('sha256='.length);
  const computed = crypto.createHmac('sha256', s).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(computed, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// A shared secret check for the TikTok webhook, sent in a header we configure on their side. TikTok
// does not sign the body the way Meta does, so a shared secret is the pragmatic gate for the scaffold.
export function verifyTikTokWebhook(header: string | null, secret?: string): boolean {
  const s = (secret || process.env.TIKTOK_WEBHOOK_SECRET || '').trim();
  if (!s || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(s);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// --- token exchange, the only networked part ---------------------------------------------------

export interface TokenResult {
  ok: boolean;
  access_token: string | null;
  refresh_token: string | null;
  expires_in: number | null;
  error: string | null;
}

function fail(error: string): TokenResult {
  return { ok: false, access_token: null, refresh_token: null, expires_in: null, error };
}

// Swap an authorization code for tokens. Guarded by the master switch and the per platform config, so
// it cannot run while dark or half set up. Isolated so the rest of the module tests with no network.
export async function exchangeCode(platform: Connector, code: string): Promise<TokenResult> {
  if (!CONNECTORS_ENABLED()) return fail('disabled');
  if (!connectorConfigured(platform)) return fail('not_configured');
  const c = cfg(platform);
  try {
    let res: Response;
    if (platform === 'meta') {
      const u = new URL(TOKEN_URL.meta);
      u.searchParams.set('client_id', c.clientId);
      u.searchParams.set('client_secret', c.clientSecret);
      u.searchParams.set('redirect_uri', c.redirectUri);
      u.searchParams.set('code', code);
      res = await fetch(u.toString());
    } else if (platform === 'tiktok') {
      res = await fetch(TOKEN_URL.tiktok, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_key: c.clientId, client_secret: c.clientSecret, code,
          grant_type: 'authorization_code', redirect_uri: c.redirectUri,
        }).toString(),
      });
    } else {
      res = await fetch(TOKEN_URL.google, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: c.clientId, client_secret: c.clientSecret, code,
          grant_type: 'authorization_code', redirect_uri: c.redirectUri,
        }).toString(),
      });
    }
    if (!res.ok) return fail(`http_${res.status}`);
    const j = (await res.json()) as Record<string, unknown>;
    const data = (j.data as Record<string, unknown> | undefined) || undefined;
    const access = (j.access_token ?? data?.access_token ?? null) as string | null;
    const refresh = (j.refresh_token ?? data?.refresh_token ?? null) as string | null;
    const expires = Number(j.expires_in ?? data?.expires_in ?? 0) || null;
    if (!access) return fail('no_token');
    return { ok: true, access_token: access, refresh_token: refresh, expires_in: expires, error: null };
  } catch {
    return fail('network');
  }
}

import { NextRequest, NextResponse } from 'next/server';

// CORS for the app's cross-origin API calls.
//
// Native apps ignore CORS, but the Expo web build (and any future web app) calls
// these routes from a browser. Without CORS headers the browser blocks the
// response, so features that work fine on a phone look broken on the web (the
// bank card shows "coming soon", the AI chat fails to reach, etc). This adds the
// headers to every /api response and answers preflight OPTIONS.
//
// We do NOT open to the whole internet. Production is limited to our own web
// origin; in development any localhost port is allowed so `expo start --web`
// works. Because the API authenticates with a Bearer token (never cookies),
// reflecting the origin here does not expose a logged-in session to other sites.

// lekhio.app. NOT lekhio.com, which we do not own: it belongs to an unrelated ERP
// company (Lacspace Corporation). It was in this allowlist, which meant we were
// telling browsers to trust a third party's origin against our API. No session
// could actually be stolen, because these routes authenticate with a Bearer token
// and never a cookie, but an origin we do not control has no business here.
const PROD_ALLOWED = [
  process.env.NEXT_PUBLIC_APP_URL || 'https://lekhio.app',
  'https://lekhio.app',
  'https://www.lekhio.app',
];

function corsHeaders(origin: string | null): Record<string, string> {
  const isLocalhost = !!origin && /^http:\/\/localhost:\d+$/.test(origin);
  const allow = origin && (PROD_ALLOWED.includes(origin) || isLocalhost) ? origin : PROD_ALLOWED[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function middleware(req: NextRequest) {
  const cors = corsHeaders(req.headers.get('origin'));

  // Answer the browser's preflight before it ever reaches a route.
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: cors });
  }

  const res = NextResponse.next();
  for (const [key, value] of Object.entries(cors)) res.headers.set(key, value);
  return res;
}

// Only the API. Pages and static assets are untouched.
export const config = { matcher: '/api/:path*' };

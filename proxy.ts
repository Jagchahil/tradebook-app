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
  // 🔴 GATED ON THE ENVIRONMENT SINCE 17 AUGUST 2026, RUN 7. The comment above has said "in
  // development any localhost port is allowed" since the day this was written, and there was no
  // check, so production reflected http://localhost:<any port> into Access-Control-Allow-Origin
  // too. Nothing authenticated leaked, because Access-Control-Allow-Credentials is set nowhere in
  // either repo and these routes carry a Bearer token rather than a cookie. But a comment that
  // describes a control the code does not have is worse than no comment, because the next reader
  // stops looking. test/run7fixes.test.mjs holds the shape.
  const isLocalhost = process.env.NODE_ENV !== 'production'
    && !!origin && /^http:\/\/localhost:\d+$/.test(origin);
  const allow = origin && (PROD_ALLOWED.includes(origin) || isLocalhost) ? origin : PROD_ALLOWED[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 B53. THE SIGNED IN AREA SET NO CACHE HEADER AT ALL. 19 August 2026.
//
// Derived at head `e1ad685d`: ZERO occurrences of no-store, Cache-Control or revalidate anywhere
// under app/app/, against 40 of 40 pages carrying `dynamic = 'force-dynamic'`. And this file's own
// matcher was `/api/:path*` ONLY, with its own comment saying pages and static assets are
// untouched. So nothing in the product set a header on a signed in PAGE.
//
// 🔴 AND THE ITEM'S PREMISE IS WRONG ON THE WIRE, WHICH WAS FOUND BY PROBING PRODUCTION RATHER
// THAN BY READING THE REPO. THIS IS BELT AND BRACES, NOT A HOLE BEING CLOSED, AND SAYING SO IS THE
// WHOLE POINT.
//
// The item concluded that because the repo sets no header, "nothing tells an intermediary not to
// store the answer". The first half is true and the second does not follow. `force-dynamic` makes
// NEXT ITSELF emit the header. Probed on production on head `e1ad685d`, signed out:
//
//   /in                        force-dynamic     private, no-cache, no-store, max-age=0, must-revalidate
//   /tax-calculator            NOT force-dynamic public, max-age=0, must-revalidate
//   /cis-calculator            NOT force-dynamic public, max-age=0, must-revalidate
//   /landlord-tax-calculator   NOT force-dynamic public, max-age=0, must-revalidate
//   /ni-checker                NOT force-dynamic public, max-age=0, must-revalidate
//   /how-mtd-works /start /pricing  NOT force-dynamic  public, max-age=0, must-revalidate
//
// All 40 of 40 pages under app/app/ carry force-dynamic, exactly as /in does, so the signed in area
// is ALREADY served `private, no-cache, no-store, max-age=0, must-revalidate` today. NOTHING WAS
// LEAKING. ⚪ The signed in pages themselves were NOT read, because reading one needs a sign in code
// and that is Jag's; what is derived is that they carry the identical directive to a page that WAS
// read. That is an inference from a probe, and it is named as one rather than promoted to a walk.
//
// ⚠️ SO WHY SHIP IT. Because Next's header is a FRAMEWORK DEFAULT that follows from a rendering
// mode, and one `export const dynamic` removed from one page silently takes it away with no test
// anywhere noticing. This makes it an explicit product decision with a guard on it, in both
// directions. It is not a fix, it is a lock on something that is currently true by accident.
//
// 🔴 AND `no-cache` IS IN THE STRING BECAUSE PRODUCTION ALREADY SENDS IT. The dispatch sized this
// as `private, no-store, max-age=0, must-revalidate`, and shipping exactly that would have DROPPED
// a directive the live site emits today, which is a downgrade wearing a fix. Every directive here
// is the dispatch's four plus the one the wire already carries.
//
// 🔴 AND THE PUBLIC HALF OF THE SITE MUST STAY CACHEABLE, WHICH IS WHAT MAKES THIS MORE THAN ONE
// LINE. The marketing pages and the free calculators are the front door Jag is about to buy
// traffic for. They carry nobody's figures and they are the pages a stranger meets first, so
// making them no-store would be a self inflicted speed problem in the week it matters most.
// The matcher names `/app/:path*` and nothing else, and test/cacheheader.test.mjs asserts the
// shape IN BOTH DIRECTIONS.
// ═════════════════════════════════════════════════════════════════════════════════════════════
const SIGNED_IN_CACHE = 'private, no-cache, no-store, max-age=0, must-revalidate';

// 🔴 J9. RENAMED `middleware` TO `proxy` FOR NEXT 16, DONE HERE RATHER THAN SEPARATELY BECAUSE
// J9's own standing note says do them together rather than touching this file twice.
//
// DERIVED, NOT ASSUMED, BEFORE THE RENAME: next 16.2.11 in this repo carries both
// MIDDLEWARE_FILENAME 'middleware' and PROXY_FILENAME 'proxy' in dist/lib/constants.js, warns
// warnOnce("The middleware file convention is deprecated") at dist/build/index.js when only the old
// one is present, and THROWS E900 if BOTH files exist. The loader accepts a default export or a
// named export matching the filename. So this is a rename of the file and of the exported function,
// and nothing else. If it had been more than that, J9 stays open rather than half done.
export function proxy(req: NextRequest) {
  const isApi = req.nextUrl.pathname.startsWith('/api/');

  // ⚠️ CORS STAYS ON /api AND ONLY /api. The matcher grew a second entry for the cache header, and
  // reflecting an origin onto a signed in HTML page is not what that widening was for.
  if (isApi) {
    const cors = corsHeaders(req.headers.get('origin'));
    // Answer the browser's preflight before it ever reaches a route.
    if (req.method === 'OPTIONS') {
      return new NextResponse(null, { status: 204, headers: cors });
    }
    const res = NextResponse.next();
    for (const [key, value] of Object.entries(cors)) res.headers.set(key, value);
    return res;
  }

  // Everything else the matcher names is the signed in area.
  const res = NextResponse.next();
  res.headers.set('Cache-Control', SIGNED_IN_CACHE);
  return res;
}

// The API, and the signed in area. The marketing pages, the free calculators and every static
// asset are DELIBERATELY absent: they are public, they carry nobody's figures, and they should be
// cached hard.
export const config = { matcher: ['/api/:path*', '/app/:path*'] };

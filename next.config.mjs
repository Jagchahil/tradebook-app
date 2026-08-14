// Global security headers for every response, plus tighter rules for the
// capability URLs (invoice and pay links).
//
// This is the single Next.js config for the site. If a next.config.ts also
// exists in the deploy repo, DELETE it: Next.js loads only one config file and
// two is a silent footgun. Everything the old next.config.ts did is folded in
// here, with a fuller Content Security Policy on top.
//
// Content Security Policy notes:
// - The marketing pages use inline <style> (dangerouslySetInnerHTML) and inline
//   <script type="application/ld+json"> for SEO. Both fall under style-src and
//   script-src, so 'unsafe-inline' is required for the pages to render. A nonce
//   based policy would be stricter but forces every page to render dynamically,
//   which throws away the static generation the marketing and SEO pages rely on.
//   For a site that renders no user supplied HTML unescaped (React escapes by
//   default, and the only inline blocks are our own static styles and schema),
//   this is the right trade off.
// - challenges.cloudflare.com is allow listed for script and frame so the
//   Cloudflare Turnstile bot check can load. Server side only today, but pre
//   allow listing it means switching on the client widget will not break.
// - The lock down directives (frame-ancestors none, object-src none, base-uri
//   self) close clickjacking, plugin and base tag vectors.
//
// 🔴 form-action IS NOT 'self' ALONE, AND THE REASON IS A BUG THAT SHIPPED ON 30 JULY.
//
// It WAS 'self', and that silently broke both bank connect and paying us on the web, on the day the
// setup wizard started using plain form posts. Chrome enforces form-action across the REDIRECT CHAIN
// of a form submission, not merely the form's own action. So a form that posts to our own
// /api/bank/connect and is answered with a 303 to TrueLayer is refused at the redirect, the
// navigation is dropped, and the page simply sits there. No error, no console message the user would
// ever see, nothing in the network tab that reads like a failure. The button just does nothing.
//
// ⚠️ IT DID NOT BITE BEFORE BECAUSE NOTHING USED A FORM. The phone app posts JSON and follows the
// link itself, and /start posts JSON and sets window.location, which is a SCRIPT navigation and is
// not covered by form-action at all. The web app ships no client script on purpose, so it is the
// only surface that submits a real form, and it was the only one this could reach.
//
// So the two origins we deliberately hand a customer to are named, and nothing else is. This is the
// standard shape for a site using hosted checkout and hosted bank auth: the protection form-action
// buys is against an injected form exfiltrating to an attacker's server, and two named payment
// origins do not weaken that.
//
// ⚠️ AND IT IS CHECKED AT EVERY HOP, WHICH IS WHY THESE ARE DOMAINS RATHER THAN HOSTS. See the
// directive itself below. Anything added here must be a destination we redirect a form to, and
// test/csp.test.mjs fails the build if a route 303s a form somewhere this list does not cover. Do
// not widen it by hand without a route to point at.
//
// Test in a Vercel preview after any change here. If a page ever fails to load
// a resource, the browser console names the blocked URL and the directive.

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  // 'self' for every ordinary form, then the two hosted journeys we deliberately send a customer out
  // to. ⚠️ WHOLE DOMAINS, NOT SINGLE HOSTS, AND THAT IS THE SECOND VERSION OF THIS LINE.
  //
  // The first named auth.truelayer.com exactly, which is the host lib/bankfeed.ts builds, and it was
  // STILL broken: auth.truelayer.com answers with another redirect, on to login.truelayer.com, and
  // form-action is checked at every hop. So we allowed hop one and it died silently at hop two, with
  // the same symptom as before and no way to tell the two apart from the outside.
  //
  // Naming hosts means guessing a third party's internal redirect chain and being re-broken, without
  // a deploy on our side, the day they add a hop. Naming their DOMAIN does not: it is still just
  // TrueLayer and still just Stripe, and it cannot be widened by anybody but them.
  "form-action 'self' https://*.truelayer.com https://*.truelayer-sandbox.com https://*.stripe.com",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "connect-src 'self' https://*.supabase.co https://challenges.cloudflare.com",
  "frame-src 'self' https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  'upgrade-insecure-requests',
].join('; ');

// Applied to every path.
const baseSecurityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), browsing-topics=()',
  },
  { key: 'Content-Security-Policy', value: csp },
];

// Invoice and pay links carry a secret, unguessable UUID in the path. They are
// capability URLs: anyone with the link can view the invoice, by design. So we
// send no referrer at all on these paths (the link never leaks through Referer)
// and tell crawlers not to index them. These come AFTER the base rules for the
// same paths, so the no-referrer value overrides the base referrer policy.
const capabilityUrlHeaders = [
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ⚠️ THE DOOR IS /start, AND /signup IS WHAT EVERY STRANGER TYPES. Run 4, 14 August 2026: a cold
  // walk went to lekhio.app/signup first and got the branded 404. The 404 is handled well and that
  // is not the point: a man who guesses the commonest URL in software should land on the form, not
  // on a page telling him it is not his fault. 308 so it is cached and never re-asked.
  async redirects() {
    return [
      { source: '/signup', destination: '/start', permanent: true },
      { source: '/sign-up', destination: '/start', permanent: true },
      { source: '/register', destination: '/start', permanent: true },
    ];
  },
  async headers() {
    return [
      { source: '/:path*', headers: baseSecurityHeaders },
      { source: '/invoice/:path*', headers: capabilityUrlHeaders },
      { source: '/api/pay/:path*', headers: capabilityUrlHeaders },
      // The shared books link is a capability URL exactly like an invoice link: anyone with it
      // can read the figures, so the token must never ride out in a Referer header and the page
      // must never be indexed. Found missing on the 6 August launch walk.
      { source: '/share/:path*', headers: capabilityUrlHeaders },
    ];
  },
};

export default nextConfig;

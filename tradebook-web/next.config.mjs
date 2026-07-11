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
//   self, form-action self) close clickjacking, plugin, base tag and form
//   hijack vectors.
//
// Test in a Vercel preview after any change here. If a page ever fails to load
// a resource, the browser console names the blocked URL and the directive.

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
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
  async headers() {
    return [
      { source: '/:path*', headers: baseSecurityHeaders },
      { source: '/invoice/:path*', headers: capabilityUrlHeaders },
      { source: '/api/pay/:path*', headers: capabilityUrlHeaders },
    ];
  },
};

export default nextConfig;

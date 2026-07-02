// Global security headers for every response.
//
// Set here rather than per route so the whole site, including the public
// invoice and pay pages and the OAuth callback pages, is covered.
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
//   Cloudflare Turnstile bot check can load. It is server side only today, but
//   pre allow listing it means switching on the client widget will not break.
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

const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=()',
  },
  { key: 'Content-Security-Policy', value: csp },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

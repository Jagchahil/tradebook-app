import type { NextConfig } from "next";

// Baseline security headers. These apply to every response the site serves.
// Rationale, in plain terms:
//   Strict-Transport-Security  force HTTPS, stop downgrade attacks.
//   X-Content-Type-Options     stop MIME sniffing.
//   X-Frame-Options + CSP frame-ancestors  stop clickjacking (no embedding us).
//   Referrer-Policy            do not leak our URLs to third parties in Referer.
//   Permissions-Policy         switch off powerful browser features we do not use.
const baseSecurityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
];

// Invoice and pay links carry a secret, unguessable UUID in the path. They are
// capability URLs: anyone with the link can view the invoice, by design. To make
// sure that secret link never leaks to a third party through the Referer header,
// we send no referrer at all on these paths, and we tell crawlers not to index
// them (robots.txt already disallows them, this is belt and braces).
const capabilityUrlHeaders = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: baseSecurityHeaders },
      { source: "/invoice/:path*", headers: capabilityUrlHeaders },
      { source: "/api/pay/:path*", headers: capabilityUrlHeaders },
    ];
  },
};

export default nextConfig;

import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 metadataBase, SET ONCE, SO EVERY PAGE CAN DECLARE ITS CANONICAL URL.
//
// On 30 July a sweep of the live site found twenty four of twenty five pages with no canonical
// link at all. Only /file-your-tax-return had one, and it had to declare its own metadataBase to
// do it, because there was nothing here to inherit.
//
// Without a canonical, lekhio.app/pricing, www.lekhio.app/pricing and every ?utm= and ?fbclid=
// variant are four different pages to a search engine, splitting the ranking of each between
// them. The whole free tools strategy is pages earning their way up search results, so this is
// not housekeeping, it is the strategy quietly leaking.
//
// Set here rather than page by page: one base, and each page names its own path.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://lekhio.app'),
};

// Root layout for the live marketing site (the root app/ tree). Previously there
// was no root layout here, so Next.js generated a bare default whose <html> tag
// carried no lang attribute, a WCAG 2.1 Level A gap (3.1.1 Language of Page).
// This sets it explicitly. Pages self-style with inline CSS and export their own
// metadata (title, description, open graph), and the favicon and social image
// come from the file conventions in this folder (icon.png, apple-icon.png,
// opengraph-image.png), so nothing else belongs in this shell.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 B66. THE SWITCH WAS ON AND THE APP SENT IT NOTHING. 19 August 2026.
//
// Vercel Web Analytics was enabled on the project at about 22:35, on the INCLUDED tier. Derived
// off disk immediately afterwards: package.json had exactly six dependencies and @vercel/analytics
// was not one of them, there were ZERO hits for <Analytics anywhere in app/, lib/ or components/,
// and this file returned a bare shell.
//
// So the dashboard would have sat at zero for ever and read as "no traffic" rather than as "not
// wired", which is this corpus's own silence is not honesty lesson wearing a business face. A
// founder reading zero visitors after a marketing push would conclude the campaign failed.
//
// ⚠️ IT GOES IN THE ROOT LAYOUT AND NOWHERE ELSE. This shell wraps every tree, marketing and
// signed in alike, so one mount measures the whole product and a second one anywhere else would
// double count. test/b66analytics.test.mjs DERIVES which layout is the root (the only one that
// renders <html>) rather than trusting this path, so a later tidy cannot silently un measure it.
//
// ⚠️ AND @vercel/speed-insights IS DELIBERATELY NOT HERE. It is not a toggle, it is a purchase at
// $10 per project per month plus $0.65 per 10,000 data points, and the orchestrator ruled on
// 19 August that it waits for traffic. A component for a product that is not enabled is dead code,
// and the suite asserts its absence so nobody adds it on the way past.
//
// ⚠️ COOKIELESS, AND THAT IS THE RIGHT ANSWER BY DESIGN RATHER THAN BY ACCIDENT. Vercel Web
// Analytics stores no personal data and sets no cookie, which is the correct choice for a product
// holding tax records, and it is a better answer than the Google Analytics somebody will otherwise
// reach for.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}

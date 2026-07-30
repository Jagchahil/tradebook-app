import type { ReactNode } from 'react';
import type { Metadata } from 'next';

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
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { ReactNode } from 'react';

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

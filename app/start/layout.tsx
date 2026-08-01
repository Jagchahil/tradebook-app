import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// The start page itself is a client component, so it cannot export metadata.
// This server layout supplies the title, description and social tags for /start.
export const metadata: Metadata = {
  title: 'Get started with Lekhio. 7 days free, no card.',
  // ⚠️ SIX STEPS, AND THEY ARE THE SIX IN app/start/page.tsx (TOTAL = 6). This used to promise
  // "connect your bank", which is not one of them and is not a thing we can offer today.
  description:
    'Set Lekhio up properly in a few minutes. Your account, how you trade, what you do, anything alongside the work, your business address and your VAT position. Six questions, then your books and tax look after themselves. 7 days free, no card needed.',
  openGraph: {
    title: 'Get started with Lekhio',
    description: 'Your books and tax, handled. 7 days free, no card needed.',
    type: 'website',
  },
};

export default function StartLayout({ children }: { children: ReactNode }) {
  return children;
}

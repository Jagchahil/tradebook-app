import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// The start page itself is a client component, so it cannot export metadata.
// This server layout supplies the title, description and social tags for /start.
export const metadata: Metadata = {
  title: 'Get started with Lekhio. 7 days free, no card.',
  description:
    'Set up Lekhio in two minutes. Tell us your trade, connect your bank, and your books and tax look after themselves. 7 days free, no card needed.',
  openGraph: {
    title: 'Get started with Lekhio',
    description: 'Your books and tax, handled. 7 days free, no card needed.',
    type: 'website',
  },
};

export default function StartLayout({ children }: { children: ReactNode }) {
  return children;
}

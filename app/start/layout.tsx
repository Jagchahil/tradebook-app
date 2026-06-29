import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// The start page itself is a client component, so it cannot export metadata.
// This server layout supplies the title, description and social tags for /start.
export const metadata: Metadata = {
  title: 'Get started with Lekhio. 30 days free, no card.',
  description:
    'Set up Lekhio in two minutes. Tell us your number and your trade, and do your books and tax by WhatsApp. 30 days free, no card needed.',
  openGraph: {
    title: 'Get started with Lekhio',
    description: 'Your books and tax, by WhatsApp. 30 days free, no card needed.',
    type: 'website',
  },
};

export default function StartLayout({ children }: { children: ReactNode }) {
  return children;
}

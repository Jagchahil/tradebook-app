import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// The logged in customer web app. Never indexed: everything under here is one man's money.
export const metadata: Metadata = {
  title: 'Your Lekhio',
  robots: { index: false, follow: false },
};

export default function AppLayout({ children }: { children: ReactNode }) {
  return children;
}

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// The team console pages are client components, so they cannot export metadata of their own, and
// /team therefore shipped with an EMPTY document title: the browser tab showed the bare URL while
// every other page on the estate has a crafted one. Found by RUN 0 of the customer week.
//
// This layout supplies it for /team and every route beneath it. A child that wants a different
// title still exports its own; none does today, so the whole console stops being nameless at once.
//
// ⚠️ noindex IS BELT AND BRACES, NOT THE GATE. app/robots.ts already disallows /team and the real
// gate is a row in team_members re-checked on the server. This only means that if a crawler ever
// ignores robots.txt, the internal console still does not turn up in a search result.
export const metadata: Metadata = {
  title: 'Team sign in. Lekhio.',
  robots: { index: false, follow: false },
};

export default function TeamLayout({ children }: { children: ReactNode }) {
  return children;
}

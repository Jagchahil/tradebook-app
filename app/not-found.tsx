import type { Metadata } from 'next';
import Link from 'next/link';
import { INK, MUTED, PAPER, RIVER, ON_RIVER, FONT, MARKETING_CSS, SharedHead } from './_shared/site';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE 404. Added 11 August 2026, after RUN 0 of the customer week walked a dead URL.
//
// What was there: "404 | This page could not be found." White page, default font, no logo, no
// nav, no footer, no link home. Next.js ships that page so an app is never blank, not so it can
// be published. On a site where every other page is hand made, a man who mistypes a URL or
// follows a stale link from a forum post landed on bare scaffolding with no way back to us.
//
// ⚠️ SMALL, AND DELIBERATELY SO. Doc 103: what did we take out to make room for it. A 404 is not
// a marketing opportunity. He came here by accident and the only thing he wants is out, so he
// gets the mark so he knows he is still with us, one sentence that does not blame him, and one
// button. No nav, no footer, no free tool rail, no sticky bar. Everything we could have added
// here would have been us talking while he is trying to leave.
//
// ⚠️ NO SiteNav OR SiteFooter, WHICH IS THE ONE THING THAT LOOKS LIKE AN OVERSIGHT. A full site
// chrome would give him twenty choices at the moment he wants one. The mark is a link home too,
// so there are two ways out of a page with one button on it.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export const metadata: Metadata = {
  title: 'That page is not here. Lekhio.',
  // A dead URL is not something we want indexed, and it is not something we want followed.
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main
      className="mkt"
      style={{
        backgroundColor: PAPER,
        color: INK,
        fontFamily: FONT,
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '40px 24px',
        textAlign: 'center',
      }}
    >
      <SharedHead />
      <style dangerouslySetInnerHTML={{ __html: MARKETING_CSS }} />

      <div style={{ maxWidth: 460 }}>
        <Link
          href="/"
          aria-label="Lekhio, back to the home page"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 9, textDecoration: 'none', marginBottom: 28 }}
        >
          {/* The same mark and the same reasoning as SiteNav: alt is empty because the Link
              already carries the label, and next/image buys nothing on a 1KB SVG. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/lekhio-mark.svg" alt="" width={34} height={34} className="logo-chip" />
          <span className="logo-word">Lekhio</span>
        </Link>

        <h1 style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.8px', margin: '0 0 12px', lineHeight: 1.2 }}>
          That page is not here.
        </h1>

        {/* One line, and it takes the blame. He typed it wrong or we moved it, and only one of
            those is worth saying out loud to a man who is already lost. */}
        <p style={{ fontSize: 16, lineHeight: 1.65, color: MUTED, margin: '0 0 28px' }}>
          Either it moved or the link was wrong. Nothing you did. Everything else is where you left it.
        </p>

        <Link
          href="/"
          style={{
            display: 'inline-block',
            background: RIVER,
            color: ON_RIVER,
            fontSize: 16,
            fontWeight: 700,
            padding: '14px 30px',
            borderRadius: 12,
            textDecoration: 'none',
          }}
        >
          Take me home
        </Link>
      </div>
    </main>
  );
}

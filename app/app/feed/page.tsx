import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../lib/webauth';
import { SESSION_COOKIE } from '../../../lib/websession';
import { readActivityFeed } from '../../../lib/supabase';
import { chatRef } from '../chatref';
import { entryRef } from '../entryref';
import { A11Y_CSS, APP_CSS, FONT, TYPE } from '../../../lib/tokens';
import { INK, MUTED, PAPER } from '../../../lib/apptheme';
import { AppNav } from '../AppNav';
import { FeedDays, FEED_CSS } from '../Feed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// THE FEED. Everything that has happened to his money, newest first, grouped by day.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ WHY THIS SCREEN STILL EXISTS NOW HOME CARRIES THE FEED TOO. Since 5 August 2026 the same
// record flows under the Overview's figures on Home, Instagram shaped, and the rendering lives
// once in app/app/Feed.tsx. This page keeps the record as a whole surface of its own: the man
// who wants only "what has my employee been doing", with no figures above it, opens it from the
// heading on Home. It is a record, not an entertainment scroll: nothing here asks for a press,
// and the only buttons are the rows themselves, each opening the thing it describes.
//
// ⚠️ THE SENTENCES ARE WORDED IN lib/supabase.ts, NOT HERE. readActivityFeed returns the
// finished words, so the WhatsApp reply, the pile and this feed can never describe the same
// event three different ways. app/app/Feed.tsx only groups by day and draws.
//
// ⚠️ NO ID IN ANY URL. Every linked row carries a sealed reference (entryref for a
// transaction, chatref for a chat or a nudge), minted for the session's user. The minters are
// HANDED to readActivityFeed rather than imported by it, the lib/moneylog.ts pattern, because
// the reference modules are shapes of the web surface and lib/ is staged flat by two suites.
// A row whose reference could not be minted renders as plain text, the same fail closed rule
// the thread list keeps.
//
// ⚠️ SERVER RENDERED, NO CLIENT SCRIPT, like every screen under app/app.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export default async function FeedPage() {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  if (!user) redirect('/in');

  // The minters close over the SESSION user, so every reference is minted for the man reading,
  // and both fail closed to '' when unconfigured.
  const items = await readActivityFeed(user.id, 60, {
    chat: (kind, id) => chatRef(user.id, kind, id),
    entry: (id, month) => entryRef(user.id, id, month),
  });
  const now = new Date();

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/feed" />

      <h1 style={S.h1}>Feed</h1>
      <p style={S.sub}>Everything that has happened to your money, newest first.</p>

      <FeedDays items={items} now={now} />

      <p style={S.foot}>
        Nothing counts until you say so, and nothing is ever sent to HMRC unless you have
        approved it first.
      </p>
    </main>
  );
}

const CSS = [
  A11Y_CSS,
  APP_CSS,
  FEED_CSS,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  h1: { fontSize: TYPE.stat, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' },
  sub: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '0 0 6px' },

  foot: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, textAlign: 'center', margin: '18px 4px 0' },
};

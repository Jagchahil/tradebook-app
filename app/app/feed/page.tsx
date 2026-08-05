import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../lib/webauth';
import { SESSION_COOKIE } from '../../../lib/websession';
import { readActivityFeed } from '../../../lib/supabase';
import { chatRef } from '../chatref';
import { entryRef } from '../entryref';
import { A11Y_CSS, APP_CSS, FONT, MOTION, RADIUS, SPACE, TYPE } from '../../../lib/tokens';
import { INK, LINE, MUTED, PANEL, PAPER, RIVER, edge } from '../../../lib/apptheme';
import { AppNav } from '../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// THE FEED. Everything that has happened to his money, newest first, grouped by day.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ WHY THIS SCREEN EXISTS BESIDE THE OVERVIEW. The Overview answers "what do I owe" and
// stays exactly as doc 103 ordered it. This screen answers a different glance: "what has my
// employee been doing". A receipt read, an entry filed, a question answered, a Rakha nudge,
// each one a sentence with the time beside it, the shape his thumb already knows from every
// feed he owns. It is a record, not an entertainment scroll: nothing here asks for a press,
// and the only buttons are the rows themselves, each opening the thing it describes.
//
// ⚠️ THE SENTENCES ARE WORDED IN lib/supabase.ts, NOT HERE. readActivityFeed returns the
// finished words, so the WhatsApp reply, the pile and this feed can never describe the same
// event three different ways. This page only groups by day and draws.
//
// ⚠️ NO ID IN ANY URL. Every linked row carries a sealed reference (entryref for a
// transaction, chatref for a chat or a nudge), minted for the session's user. The minters are
// HANDED to readActivityFeed rather than imported by it, the lib/moneylog.ts pattern, because
// the reference modules are shapes of the web surface and lib/ is staged flat by two suites.
// A row whose reference could not be minted renders as plain text, the same fail closed rule
// the thread list keeps.
//
// ⚠️ THE EMPTY STATE IS ONE QUIET LINE, per doc 103's empty test. A new account sees what
// will appear here and how to make the first thing happen, not a scaffold of empty day
// headings teaching him the screen has nothing to say.
//
// ⚠️ SERVER RENDERED, NO CLIENT SCRIPT, like every screen under app/app.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// A day in the man's own clock. London, because his customers and his tax year are.
function dayOf(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { timeZone: 'Europe/London' });
}

// Today, Yesterday, then the date in plain words.
function dayHeading(iso: string, now: Date): string {
  const day = dayOf(iso);
  if (day === dayOf(now.toISOString())) return 'Today';
  if (day === dayOf(new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())) return 'Yesterday';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', {
    timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long',
  });
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
}

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

  // Group into days, keeping the newest first order the reader returned. The heading is
  // computed once per group, from the group's first item.
  const days: Array<{ heading: string; items: NonNullable<typeof items> }> = [];
  for (const item of items ?? []) {
    const day = dayOf(item.when);
    if (!day) continue;
    const heading = dayHeading(item.when, now);
    const last = days[days.length - 1];
    if (last && last.heading === heading) last.items.push(item);
    else days.push({ heading, items: [item] });
  }

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/feed" />

      <h1 style={S.h1}>Feed</h1>
      <p style={S.sub}>Everything that has happened to your money, newest first.</p>

      {items === null ? (
        <section className="lek-card">
          <p style={S.empty}>We could not read your feed just now.</p>
          <p style={S.quiet}>Nothing is lost and nothing has changed. Load the page again in a minute.</p>
        </section>
      ) : items.length === 0 ? (
        // One quiet line, not a scaffold. It says what will appear, and it does not instruct a
        // WhatsApp send: test/frontdoor.test.mjs forbids that on any screen a man might open
        // before a number is bound, and the first receipt can arrive by upload just as well.
        <p style={S.quiet}>
          Nothing yet. The first receipt you send appears here the moment it is read.
        </p>
      ) : (
        days.map((day) => (
          <section key={day.heading} aria-label={day.heading}>
            <h2 className="lek-day">{day.heading}</h2>
            {day.items.map((item, i) => {
              const body = (
                <>
                  <span className="lek-feed-top">
                    <span className="lek-feed-title">{item.title}</span>
                    <span className="lek-feed-when">{timeLabel(item.when)}</span>
                  </span>
                  {item.detail ? <span className="lek-feed-detail">{item.detail}</span> : null}
                </>
              );
              // A row whose reference could not be minted is readable, not clickable.
              return item.ref ? (
                <a key={`${day.heading}-${i}`} href={item.ref} className="lek-feed-row">{body}</a>
              ) : (
                <div key={`${day.heading}-${i}`} className="lek-feed-row">{body}</div>
              );
            })}
          </section>
        ))
      )}

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
  // The day heading: the uppercase eyebrow the tiles already use, so the feed reads as one
  // quiet column rather than a stack of cards shouting dates.
  `.lek-day{font-size:${TYPE.label}px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;color:${MUTED};margin:${SPACE.lg}px ${SPACE.hair}px ${SPACE.xs}px}`,
  `.lek-feed-row{display:flex;flex-direction:column;gap:2px;background:${PANEL};border:1px solid ${LINE};border-radius:${RADIUS.md}px;padding:${SPACE.sm}px ${SPACE.md}px;margin-bottom:${SPACE.xs}px;text-decoration:none;color:${INK};animation:lek-in ${MOTION.enter} ${MOTION.ease} both}`,
  `a.lek-feed-row:hover{border-color:${RIVER};border-color:${edge(RIVER, 40)}}`,
  `.lek-feed-top{display:flex;justify-content:space-between;align-items:baseline;gap:${SPACE.xs}px}`,
  `.lek-feed-title{font-size:${TYPE.body}px;font-weight:700;line-height:1.45}`,
  `.lek-feed-when{font-size:${TYPE.label}px;color:${MUTED};font-variant-numeric:tabular-nums;flex:0 0 auto}`,
  `.lek-feed-detail{font-size:${TYPE.note}px;color:${MUTED};line-height:1.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  h1: { fontSize: TYPE.stat, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' },
  sub: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '0 0 6px' },

  empty: { fontSize: TYPE.strong, fontWeight: 800, letterSpacing: '-0.01em', margin: 0 },
  quiet: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '8px 0 0', maxWidth: '62ch' },

  foot: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, textAlign: 'center', margin: '18px 4px 0' },
};

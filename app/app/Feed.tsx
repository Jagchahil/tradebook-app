import type { FeedItem } from '../../lib/supabase';
import { css, MOTION, RADIUS, SPACE, TYPE } from '../../lib/tokens';
import { INK, LINE, MUTED, PANEL, RIVER, edge } from '../../lib/apptheme';

// THE FEED, DRAWN. One renderer, worn by two screens: /app/feed, where the record is the whole
// page, and Home, where the same record flows under the figures so the first screen reads the way
// every feed he owns does, your numbers first, then everything that has happened.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ EXTRACTED FROM app/app/feed/page.tsx ON 5 AUGUST 2026, NOT REWRITTEN. The sentences are
// worded in lib/supabase.ts, the references are minted by the PAGES and handed in already sealed
// inside each item, and this component only groups by day and draws. It exists because the
// alternative was Home carrying a second copy of the feed markup, and test/sharedcss.test.mjs is
// the record of what a second copy does: one gets fixed, the other one ships.
//
// ⚠️ A ROW WHOSE REFERENCE COULD NOT BE MINTED RENDERS AS PLAIN TEXT, the same fail closed rule
// the thread list keeps. A failed READ is said plainly, and an empty feed is one quiet line, per
// doc 103's empty test, never a scaffold of day headings around nothing.
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

export function FeedDays({ items, now }: { items: FeedItem[] | null; now: Date }) {
  if (items === null) {
    return (
      <section className="lek-card">
        <p className="lek-feed-lost">We could not read your feed just now.</p>
        <p className="lek-feed-quiet">
          Nothing is lost and nothing has changed. Load the page again in a minute.
        </p>
      </section>
    );
  }

  if (items.length === 0) {
    // One quiet line, not a scaffold. It says what will appear, and it does not instruct a
    // WhatsApp action: test/frontdoor.test.mjs forbids that on any screen a man might open
    // before a number is bound, and the first receipt can arrive by upload just as well.
    return (
      <p className="lek-feed-quiet">
        Nothing yet. The first receipt you send appears here the moment it is read.
      </p>
    );
  }

  // Group into days, keeping the newest first order the reader returned. The heading is
  // computed once per group, from the group's first item.
  const days: Array<{ heading: string; items: FeedItem[] }> = [];
  for (const item of items) {
    const day = dayOf(item.when);
    if (!day) continue;
    const heading = dayHeading(item.when, now);
    const last = days[days.length - 1];
    if (last && last.heading === heading) last.items.push(item);
    else days.push({ heading, items: [item] });
  }

  return (
    <>
      {days.map((day) => (
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
      ))}
    </>
  );
}

// The feed's own sheet, carried by whichever page draws it, beside that page's A11Y and APP css.
export const FEED_CSS = css`
/* The day heading: the uppercase eyebrow the tiles already use, so the feed reads as one quiet
   column rather than a stack of cards shouting dates. */
.lek-day{font-size:${TYPE.label}px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;color:${MUTED};margin:${SPACE.lg}px ${SPACE.hair}px ${SPACE.xs}px}
.lek-feed-row{display:flex;flex-direction:column;gap:2px;background:${PANEL};border:1px solid ${LINE};border-radius:${RADIUS.md}px;padding:${SPACE.sm}px ${SPACE.md}px;margin-bottom:${SPACE.xs}px;text-decoration:none;color:${INK};animation:lek-in ${MOTION.enter} ${MOTION.ease} both}
a.lek-feed-row:hover{border-color:${RIVER};border-color:${edge(RIVER, 40)}}
.lek-feed-top{display:flex;justify-content:space-between;align-items:baseline;gap:${SPACE.xs}px}
.lek-feed-title{font-size:${TYPE.body}px;font-weight:700;line-height:1.45}
.lek-feed-when{font-size:${TYPE.label}px;color:${MUTED};font-variant-numeric:tabular-nums;flex:0 0 auto}
.lek-feed-detail{font-size:${TYPE.note}px;color:${MUTED};line-height:1.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lek-feed-lost{font-size:${TYPE.strong}px;font-weight:800;letter-spacing:-0.01em;margin:0}
.lek-feed-quiet{font-size:${TYPE.note}px;line-height:1.55;color:${MUTED};margin:${SPACE.xs}px 0 0;max-width:62ch}
`;

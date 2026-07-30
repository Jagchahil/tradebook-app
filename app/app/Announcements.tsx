import { GREEN, GREEN_TINT, INK, LINE, MOTION, MUTED, RADIUS, RIVER, RIVER_TINT } from '../../lib/tokens';
import type { Announcement } from '../../lib/announcements';
import { appliedLineFor, tagFor } from '../../lib/announcements';

// WHAT CHANGED, ON THE SERVER. Khoji's findings and Lekhio's own notes, rendered as plain HTML.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THIS REPLACES A CLIENT COMPONENT AND A CAROUSEL, AND BOTH HAD TO GO.
//
// app/_shared/AnnouncementsBanner.tsx is marked 'use client', so the one screen the whole web app
// is built around was shipping React to the browser to draw two lines of text. It also carried its
// own copy of the palette, which had already drifted: its river tint and its green tint are both a
// shade off the ones in lib/tokens.ts, which is two of the forty unnamed colours the ratchet counts.
//
// The carousel went for a plainer reason. It was a swipeable rail with dots because there could be
// four cards, and there could be four cards because "worth knowing" was allowed through: on the
// live site that meant VAT group rules for a barber, the Capital Goods Scheme, and an archived page
// about wine duty. lib/announcements.ts now refuses that kind, so what is left is rare, short, and
// worth reading, and a rare thing does not need a rail.
//
// The client banner still exists and is still what the phone app mounts. This is the web's copy of
// the SURFACE, and it decides nothing: the module hands over what may be shown and this renders it.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ DISMISSING IS A FORM POST. It changes something, so it is not a link, and it needs no script:
// /api/announcements answers a form caller with a 303 back to this page, the same shape /api/billing
// uses. A GET that clears a man's notice is a notice any other site can clear for him with an image
// tag.

// Where a claim came from, in words he recognises. A bare hostname is not a citation to a man who
// has never heard of a statutory instrument.
function sourceLabel(url: string): string {
  try {
    const h = new URL(url).host.replace(/^www\./, '');
    if (h.includes('legislation')) return 'legislation.gov.uk';
    if (h.includes('caselaw') || h.includes('nationalarchives')) return 'the courts';
    if (h.includes('gov.uk')) return 'GOV.UK';
    return h;
  } catch {
    return 'the source';
  }
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// "From 6 April 2027". Only ever printed when we were actually told a date, because a date we
// guessed at is worse than no date on a screen about his tax.
function fromDate(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  return `From ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function Announcements({ items }: { items: Announcement[] }) {
  // ⚠️ NOTHING TO SAY MEANS NOTHING ON THE SCREEN. Doc 103's empty test: a row that reads "no
  // changes to report" most weeks teaches him to stop looking, and then he misses the week it
  // mattered. There is no empty state here on purpose, and there must not be one.
  if (!items.length) return null;

  return (
    <section aria-label="What has changed" style={S.wrap}>
      <style>{CSS}</style>
      {items.map((a) => (
        <article key={a.key} className="lek-ann">
          <div style={S.head}>
            <span style={a.kind === 'law_changed' ? S.tagLaw : S.tagProduct}>{tagFor(a)}</span>
            <form action="/api/announcements" method="post">
              <input type="hidden" name="key" value={a.key} />
              <input type="hidden" name="action" value="dismiss" />
              <button type="submit" className="lek-ann-x" aria-label={`Clear: ${a.title}`}>Clear</button>
            </form>
          </div>

          <h3 style={S.title}>{a.title}</h3>
          {a.body ? <p style={S.body}>{a.body}</p> : null}

          {/* The one sentence that is the whole point of the feature, and it only ever appears for
              an item we can prove moved a figure. lib/announcements.ts refuses to produce it
              otherwise, so there is no way to print it over an assumption. */}
          {appliedLineFor(a) ? <p style={S.applied}>{appliedLineFor(a)}</p> : null}

          <div style={S.foot}>
            {a.effectiveDate ? <span style={S.when}>{fromDate(a.effectiveDate)}</span> : null}
            {/* ZERO UNCITED ASSERTIONS. Every claim keeps the page it came from, and he can go and
                read it himself. */}
            {a.sourceUrl ? (
              <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer" style={S.source}>
                Read it on {sourceLabel(a.sourceUrl)}
              </a>
            ) : null}
          </div>
        </article>
      ))}
    </section>
  );
}

const CSS = `
.lek-ann{background:#fff;border:1px solid ${LINE};border-radius:${RADIUS.lg}px;padding:16px 18px;margin-bottom:12px;animation:lek-ann-in ${MOTION.enter} ${MOTION.ease} both}
@keyframes lek-ann-in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
.lek-ann-x{border:none;background:transparent;color:${MUTED};cursor:pointer;font-size:12.5px;font-weight:700;padding:5px 8px;border-radius:${RADIUS.sm}px;font-family:inherit;transition:background-color ${MOTION.quick} ${MOTION.ease},color ${MOTION.quick} ${MOTION.ease}}
.lek-ann-x:hover{background:${LINE};color:${INK}}
`;

const S: Record<string, React.CSSProperties> = {
  wrap: { width: '100%' },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 9 },
  tagLaw: {
    fontSize: 10.5, fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase',
    color: RIVER, background: RIVER_TINT, padding: '4px 9px', borderRadius: RADIUS.pill,
  },
  tagProduct: {
    fontSize: 10.5, fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase',
    color: GREEN, background: GREEN_TINT, padding: '4px 9px', borderRadius: RADIUS.pill,
  },
  title: { fontSize: 15.5, fontWeight: 800, letterSpacing: '-0.25px', lineHeight: 1.35, margin: 0, color: INK },
  body: { fontSize: 14, lineHeight: 1.5, color: MUTED, margin: '7px 0 0' },
  applied: { fontSize: 13.5, lineHeight: 1.5, fontWeight: 700, color: GREEN, margin: '9px 0 0' },
  foot: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 11 },
  when: { fontSize: 12, fontWeight: 700, color: MUTED },
  source: { fontSize: 12, fontWeight: 700, color: RIVER, textDecoration: 'none' },
};

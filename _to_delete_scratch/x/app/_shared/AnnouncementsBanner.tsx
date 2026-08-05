'use client';

// THE ANNOUNCEMENTS BANNER. The screen where Khoji stops being invisible.
//
// Khoji reads the law every night and a human approves what matters, and until today that whole
// machine ran where no customer could see it. This is the two lines that tell him it happened, and
// the whole design brief is doc 103: he is up a ladder with one hand on the rail. He is not
// exploring. So it is small, it is quiet when there is nothing to say, and every card can be gone
// in one tap and stay gone.
//
// ⚠️ THIS COMPONENT DECIDES NOTHING. It renders what /api/announcements hands it, and that route
// renders what lib/announcements.ts hands IT. There is exactly one place in this codebase that
// decides what a customer may be told about tax law, and it is not a React file. Do not add a
// filter here, even a helpful looking one: a second opinion about what is safe is how the approve
// button on the Brain desk quietly stops meaning anything.
//
// SWIPEABLE, with no gesture library and no dependency. A scroll-snap row is a real swipe on a
// phone, a trackpad flick on a laptop, and arrow keys on a keyboard, for about nine lines of CSS.

import { useCallback, useEffect, useRef, useState } from 'react';

const ON_GREEN_TINT = 'var(--on-green-tint)';

const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const RIVER = '#1B59A6';
const RIVER_TINT = '#EDF3FA';
const INK = '#111111';
const MUTED = '#5B6470';
const LINE = '#E7E3D9';
const GREEN_TINT = '#EAF5EF';

export interface BannerItem {
  key: string;
  source: 'khoji' | 'lekhio';
  // The words on the tag, decided in lib/announcements.ts. NOT derived here from the source: this
  // component used to render "The law changed" for anything Khoji found, which put that headline
  // over an HMRC webinar announcement on the live site. What we are willing to CALL a finding is
  // the same kind of decision as whether we may show it at all, and it lives in the same place.
  tag: string;
  kind: 'law_changed' | 'worth_knowing' | 'product';
  title: string;
  body: string;
  sourceUrl: string | null;
  effectiveDate: string | null;
  appliedLine: string | null;
  at: string;
}

// Where a claim came from, in words he recognises. A bare hostname is not a citation to a man who
// has never heard of a statutory instrument.
function sourceLabel(url: string | null): string {
  if (!url) return '';
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

// "from 6 April 2027". Only ever printed when we were actually told a date, because a date we
// guessed at is worse than no date on a screen about his tax.
function fromDate(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  return `From ${d.getUTCDate()} ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// ── The presentational banner ────────────────────────────────────────────────────────────────────
//
// Takes items and a dismiss handler. No fetching, so it can be rendered from a preview on /team with
// real rows and be provably the same component a customer gets.
export function AnnouncementsBanner({
  items,
  onDismiss,
  compact = false,
}: {
  items: BannerItem[];
  onDismiss?: (key: string) => void;
  compact?: boolean;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);

  const onScroll = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    const w = el.clientWidth || 1;
    setActive(Math.max(0, Math.min(items.length - 1, Math.round(el.scrollLeft / w))));
  }, [items.length]);

  // A dismissal can shorten the rail out from under the current position. This used to be an
  // effect that noticed afterwards and set state to correct itself, which renders the out of range
  // value once before fixing it. Clamping as we read it means the out of range value never reaches
  // the screen at all, and there is no second render to pay for.
  const shown = Math.max(0, Math.min(active, items.length - 1));

  // ⚠️ NOTHING TO SAY MEANS NOTHING ON THE SCREEN. Doc 103's empty test: a row that reads "no
  // changes to report" most weeks teaches him to stop looking, and then he misses the week it
  // mattered. There is no empty state here on purpose, and there must not be one.
  if (!items.length) return null;

  return (
    <section aria-label="What has changed" style={{ ...S.wrap, marginBottom: compact ? 14 : 22 }}>
      <style>{CSS}</style>

      <div
        ref={railRef}
        onScroll={onScroll}
        className="lek-ann-rail"
        // A horizontally scrolling region needs to be reachable and announced, or it is a swipe that
        // only exists for people who can swipe.
        tabIndex={0}
        role="group"
        aria-roledescription="carousel"
        aria-label={`${items.length} update${items.length === 1 ? '' : 's'}`}
      >
        {items.map((a, i) => (
          <article key={a.key} className="lek-ann-card" aria-label={`Update ${i + 1} of ${items.length}`}>
            <div style={S.head}>
              {/* The colour follows the strength of the claim: the river blue for a change that
                  really moved his figures, quieter for everything else, green for a product note. */}
              <span style={a.kind === 'law_changed' ? S.tagKhoji : a.kind === 'product' ? S.tagLekhio : S.tagQuiet}>
                {a.tag}
              </span>
              {onDismiss && (
                <button
                  type="button"
                  onClick={() => onDismiss(a.key)}
                  style={S.close}
                  className="lek-ann-close"
                  aria-label={`Dismiss: ${a.title}`}
                >
                  ✕
                </button>
              )}
            </div>

            <h3 style={S.title}>{a.title}</h3>
            {a.body && <p style={S.body}>{a.body}</p>}

            {/* The one sentence that is the whole point of the feature, and it only ever appears for
                an item we can prove moved a figure. lib/announcements.ts refuses to produce it
                otherwise, so there is no way to print it over an assumption. */}
            {a.appliedLine && <p style={S.applied}>{a.appliedLine}</p>}

            <div style={S.foot}>
              {a.effectiveDate && <span style={S.when}>{fromDate(a.effectiveDate)}</span>}
              {/* ZERO UNCITED ASSERTIONS. Every claim keeps the page it came from, and he can go and
                  read it himself. That is the difference between us telling him something and us
                  showing him. */}
              {a.sourceUrl && (
                <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer" style={S.source}>
                  Read it on {sourceLabel(a.sourceUrl)}
                </a>
              )}
            </div>
          </article>
        ))}
      </div>

      {items.length > 1 && (
        <div style={S.dots} role="tablist" aria-label="Updates">
          {items.map((a, i) => (
            <button
              key={a.key}
              type="button"
              role="tab"
              aria-selected={i === shown}
              aria-label={`Update ${i + 1}`}
              onClick={() => {
                const el = railRef.current;
                if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
              }}
              style={{ ...S.dot, ...(i === shown ? S.dotOn : null) }}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ── The live banner ──────────────────────────────────────────────────────────────────────────────
//
// Fetches for the signed in customer and handles the dismissal round trip. This is what the web app
// mounts. It is deliberately a thin wrapper: everything worth testing is either in the pure module
// or in the presentational component above.
export function LiveAnnouncementsBanner({ token, compact }: { token: string | null; compact?: boolean }) {
  const [items, setItems] = useState<BannerItem[]>([]);

  useEffect(() => {
    if (!token) return;
    let live = true;
    (async () => {
      try {
        const res = await fetch('/api/announcements', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;   // 503 means we could not read it. The banner shows nothing either way.
        const json = (await res.json()) as { items?: BannerItem[] };
        if (live && Array.isArray(json.items)) setItems(json.items);
      } catch { /* a banner is never worth an error on his screen */ }
    })();
    return () => { live = false; };
  }, [token]);

  const dismiss = useCallback(async (key: string) => {
    // Optimistic, because a card that lingers after a tap feels broken. But NOT permanent until the
    // write lands: on a failure it comes back, rather than fading out over a write that never
    // happened and reappearing tomorrow with no explanation.
    const before = items;
    setItems((cur) => cur.filter((a) => a.key !== key));
    try {
      const res = await fetch('/api/announcements', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, action: 'dismiss' }),
      });
      if (!res.ok) setItems(before);
    } catch {
      setItems(before);
    }
  }, [items, token]);

  return <AnnouncementsBanner items={items} onDismiss={dismiss} compact={compact} />;
}

const CSS = `
.lek-ann-rail {
  display: flex; gap: 12px; overflow-x: auto; scroll-snap-type: x mandatory;
  scrollbar-width: none; -ms-overflow-style: none; outline: none;
}
.lek-ann-rail::-webkit-scrollbar { display: none; }
.lek-ann-rail:focus-visible { box-shadow: 0 0 0 3px rgba(27,89,166,0.35); border-radius: 16px; }
.lek-ann-card {
  scroll-snap-align: start; flex: 0 0 100%; box-sizing: border-box;
  background: #fff; border: 1px solid ${LINE}; border-radius: 16px; padding: 16px 18px;
}
.lek-ann-close { transition: background .15s ease, color .15s ease; }
.lek-ann-close:hover { background: ${LINE}; color: ${INK}; }
@media (prefers-reduced-motion: reduce) {
  .lek-ann-rail { scroll-behavior: auto; }
}
`;

const S: Record<string, React.CSSProperties> = {
  wrap: { fontFamily: FONT, color: INK, width: '100%' },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 9 },
  tagKhoji: {
    fontSize: 10.5, fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase',
    color: RIVER, background: RIVER_TINT, padding: '4px 9px', borderRadius: 999,
  },
  tagQuiet: {
    fontSize: 10.5, fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase',
    color: MUTED, background: '#F2F0EA', padding: '4px 9px', borderRadius: 999,
  },
  tagLekhio: {
    fontSize: 10.5, fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase',
    color: ON_GREEN_TINT, background: GREEN_TINT, padding: '4px 9px', borderRadius: 999,
  },
  close: {
    border: 'none', background: 'transparent', color: MUTED, cursor: 'pointer',
    fontSize: 13, lineHeight: 1, padding: 6, borderRadius: 8, fontFamily: FONT,
  },
  title: { fontSize: 15.5, fontWeight: 750, letterSpacing: '-0.25px', lineHeight: 1.35, margin: 0, color: INK },
  body: { fontSize: 14, lineHeight: 1.5, color: MUTED, margin: '7px 0 0' },
  applied: { fontSize: 13.5, lineHeight: 1.5, fontWeight: 650, color: ON_GREEN_TINT, margin: '9px 0 0' },
  foot: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 11 },
  when: { fontSize: 12, fontWeight: 700, color: MUTED },
  source: { fontSize: 12, fontWeight: 700, color: RIVER, textDecoration: 'none' },
  dots: { display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10 },
  dot: { width: 6, height: 6, padding: 0, borderRadius: 999, border: 'none', background: LINE, cursor: 'pointer' },
  dotOn: { background: RIVER, width: 18 },
};

'use client';

// WHAT KHOJI HAS LEARNED, in plain words. The constellation below shows the SHAPE of the brain; this
// shows the CONTENT — the actual things it distilled from GOV.UK, legislation and the courts, newest
// first, each resting on the source it was read from. This is the "so it is actually working, it is
// actually watching the law for my customers" view, and it stays honest: only what a human KEPT is
// shown as a learning, never the noise that was dismissed, and the header counts the gap out loud.

import { useEffect, useState } from 'react';
import { browserSupabase } from '../../lib/supabasebrowser';
import { C, T, S as U } from './ui';

interface Learning { title: string | null; sourceUrl: string | null; status: string; at: string }
interface Coverage { checkedPct?: number; watched?: number; total?: number }
interface Payload {
  recentLearnings?: Learning[];
  coverage?: Coverage;
  knowledge?: { kept?: number; pending?: number; total?: number } & Record<string, unknown>;
  pending?: number;
}

function ago(iso?: string): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function host(url?: string | null): string {
  if (!url) return 'source';
  try {
    const h = new URL(url).host.replace(/^www\./, '');
    if (h.includes('legislation')) return 'legislation.gov.uk';
    if (h.includes('caselaw') || h.includes('nationalarchives')) return 'the courts';
    if (h.includes('gov.uk')) return 'GOV.UK';
    return h;
  } catch { return 'source'; }
}

const BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  verbatim: { label: 'Anchor', bg: '#EAF4EE', fg: '#0F7B4F' },
  reviewed: { label: 'Kept', bg: '#EEF2FB', fg: '#3B5BA6' },
};

export default function Learnings() {
  const [data, setData] = useState<Payload | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: s } = await browserSupabase.auth.getSession();
      const tok = s.session?.access_token;
      if (!tok) return;
      const res = await fetch('/api/team/brain', { headers: { Authorization: `Bearer ${tok}` } });
      if (res.ok && alive) setData((await res.json()) as Payload);
      if (alive) setLoaded(true);
    })();
    return () => { alive = false; };
  }, []);

  const items = data?.recentLearnings ?? [];
  const kept = items.length;

  return (
    <section style={U.section}>
      <div style={U.sectionHead}>
        <h2 style={T.h2}>What Khoji has learned</h2>
        <span style={U.sectionNote}>from the law itself, every night</span>
      </div>

      <div style={hero}>
        <p style={{ ...T.small, color: '#5c4a1f', margin: 0, lineHeight: 1.55 }}>
          Every night Khoji reads GOV.UK, the tax and employment tribunals, and the statutes on
          legislation.gov.uk — then distils what changed. Below is what it kept, most recent first. Each one
          rests on the source it was read from, so nothing here is our opinion; it is the law, quoted.
        </p>
      </div>

      {items.length === 0 ? (
        <div style={U.honest}>
          {!loaded ? 'Reading the brain…' : 'Nothing kept yet — the queue is either empty or waiting on review.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          {items.map((it, i) => {
            const b = BADGE[(it.status || '').toLowerCase()] ?? { label: it.status, bg: '#F2F1EC', fg: C.muted };
            return (
              <div key={i} style={card}>
                <span style={{ ...badge, background: b.bg, color: b.fg }}>{b.label}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 650, color: C.ink, lineHeight: 1.4 }}>
                    {it.title || 'A change on the source page'}
                  </div>
                  <div style={{ ...T.tiny, color: C.faint, marginTop: 3 }}>
                    {it.sourceUrl
                      ? <a href={it.sourceUrl} target="_blank" rel="noreferrer" style={{ color: C.river, textDecoration: 'none' }}>read on {host(it.sourceUrl)} ↗</a>
                      : host(it.sourceUrl)}
                    <span> · {ago(it.at)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p style={{ ...T.tiny, color: C.faint, marginTop: 10 }}>
        Showing the {kept} most recent kept learnings. Everything kept is available to ground a customer
        answer — so when Khoji learns of a relief, the app can put it to work.
      </p>
    </section>
  );
}

const hero: React.CSSProperties = {
  background: '#fff8ec', border: '1px solid #f0dcae', borderRadius: 14, padding: 16, marginBottom: 4,
};
const card: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 12,
  background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: '13px 15px',
  boxShadow: '0 1px 2px rgba(17,17,17,.03)',
};
const badge: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase',
  borderRadius: 999, padding: '3px 9px', flex: '0 0 auto', marginTop: 1,
};

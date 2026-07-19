'use client';

// KHOJI'S MEMORY — the console view of the pocket (khoji_history). The seven watchers show what is
// right TODAY; this shows what a number USED to be, and when it changed. It reads /api/team/pocket
// (team-gated, read-only) and lays the history out as a table: the constants that have actually moved
// first, then a quiet count of everything else Khoji is holding and watching for the next change.
//
// Playful, professional, animated, tabular — the standing console rule. No customer data ever: these
// are public tax constants.

import { useEffect, useState } from 'react';
import { browserSupabase } from '../../lib/supabasebrowser';
import { C, T } from './ui';
import type { FactTimeline } from '../../lib/pocket';

interface Payload {
  timelines: FactTimeline[];
  totalConstants: number;
  changedConstants: number;
}

function whenLabel(c: FactTimeline['changes'][number]): string {
  const iso = c.effectiveFrom ?? c.noticedAt.slice(0, 10);
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00Z' : ''));
  if (Number.isNaN(d.getTime())) return iso;
  const s = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return c.effectiveFrom ? s : `noticed ${s}`;
}

export default function Memory() {
  const [data, setData] = useState<Payload | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'empty' | 'error'>('loading');

  useEffect(() => {
    (async () => {
      try {
        const { data: s } = await browserSupabase.auth.getSession();
        const tok = s.session?.access_token;
        if (!tok) { setState('error'); return; }
        const res = await fetch('/api/team/pocket', { headers: { Authorization: `Bearer ${tok}` } });
        if (!res.ok) { setState('error'); return; }
        const j = (await res.json()) as Payload;
        setData(j);
        setState((j.timelines?.length ?? 0) === 0 ? 'empty' : 'ok');
      } catch { setState('error'); }
    })();
  }, []);

  const moved = (data?.timelines ?? []).filter((t) => t.hasHistory);
  const remembered = (data?.totalConstants ?? 0) - (data?.changedConstants ?? 0);

  return (
    <section style={S.wrap}>
      <style>{`@keyframes lkRise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}@keyframes lkBeat{0%,100%{opacity:1}50%{opacity:.4}}`}</style>

      <div style={S.head}>
        <div>
          <div style={T.label}>Khoji · memory</div>
          <h2 style={{ ...T.h2, marginTop: 4 }}>The pocket</h2>
        </div>
        {state === 'ok' && data ? (
          <span style={S.count}>
            <b style={{ color: C.ink }}>{data.changedConstants}</b> changed ·{' '}
            <b style={{ color: C.ink }}>{remembered}</b> held
          </span>
        ) : null}
      </div>

      <p style={{ ...T.small, marginTop: 6, maxWidth: 620 }}>
        What every tax number used to be, and the day it changed. This is the memory Rakha reaches for
        to fix a past year, and the one Puchio reads to answer &ldquo;what was it before?&rdquo;
      </p>

      {state === 'loading' ? (
        <div style={S.note}>Opening the pocket&hellip;</div>
      ) : state === 'error' ? (
        <div style={S.note}>Couldn&apos;t read the memory just now. It&apos;s written by the mini overnight.</div>
      ) : state === 'empty' ? (
        <div style={S.note}>Nothing recorded yet. Khoji writes its first snapshot on the next run.</div>
      ) : (
        <>
          {moved.length > 0 ? (
            <div style={S.tableWrap}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, textAlign: 'left' }}>Number</th>
                    <th style={S.th}>Was</th>
                    <th style={S.th}>Became</th>
                    <th style={{ ...S.th, textAlign: 'right' }}>When</th>
                  </tr>
                </thead>
                <tbody>
                  {moved.flatMap((t, ti) =>
                    t.changes
                      .filter((c) => !c.baseline)
                      .map((c, ci) => (
                        <tr key={`${t.factKey}-${ci}`} style={{ ...S.tr, animationDelay: `${(ti + ci) * 40}ms` }}>
                          <td style={{ ...S.td, ...S.name }}>
                            {ci === 0 ? t.label : <span style={{ color: C.faint }}>↳</span>}
                          </td>
                          <td style={{ ...S.td, textAlign: 'center' }}>
                            <span style={S.old}>{c.from ?? '—'}</span>
                          </td>
                          <td style={{ ...S.td, textAlign: 'center' }}>
                            <span style={S.newv}>{c.to}</span>
                          </td>
                          <td style={{ ...S.td, textAlign: 'right', color: C.muted, whiteSpace: 'nowrap' }}>
                            {whenLabel(c)}
                            {c.taxYear ? <span style={S.year}>{c.taxYear}</span> : null}
                          </td>
                        </tr>
                      )),
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={S.note}>No changes recorded yet — every number has held since Khoji started watching.</div>
          )}

          <div style={S.remember}>
            <span style={S.dot} />
            Holding <b>{data?.totalConstants ?? 0}</b> constants in memory, watching each one for the next change.
          </div>
        </>
      )}
    </section>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: { marginTop: 30, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 18, padding: '20px 20px 16px' },
  head: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  count: { fontSize: 12.5, color: C.muted, fontWeight: 600 },
  note: { marginTop: 16, fontSize: 13, color: C.muted, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, padding: '12px 14px' },
  tableWrap: { marginTop: 16, overflowX: 'auto', border: `1px solid ${C.line}`, borderRadius: 14 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'center', fontSize: 10, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: C.muted, padding: '10px 12px', borderBottom: `1px solid ${C.line}`, background: C.paper },
  tr: { animation: 'lkRise .4s ease both' },
  td: { padding: '11px 12px', borderBottom: `1px solid ${C.lineSoft}`, verticalAlign: 'middle' },
  name: { fontWeight: 700, color: C.ink },
  old: { color: C.muted, textDecoration: 'line-through', fontVariantNumeric: 'tabular-nums' },
  newv: { color: C.green, fontWeight: 750, fontVariantNumeric: 'tabular-nums' },
  year: { display: 'inline-block', marginLeft: 8, fontSize: 10, fontWeight: 700, color: C.river, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 999, padding: '1px 7px' },
  remember: { marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: C.muted },
  dot: { width: 7, height: 7, borderRadius: 5, background: C.river, display: 'inline-block', animation: 'lkBeat 1.8s ease-in-out infinite' },
};

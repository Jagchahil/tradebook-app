'use client';

import { useEffect, useState } from 'react';
import { browserSupabase } from '../../lib/supabasebrowser';
import { sourceLabel } from '../../lib/team';
import type { Point, Funnel, Channel, Snapshot } from '../../lib/metrics';

// THE NUMBERS. Four questions and not one more.
//
// ⚠️ THE TWO RULES THIS COMPONENT EXISTS TO ENFORCE, AND BOTH OF THEM ARE ABOUT NOT LYING.
//
// 1. A RATE WITH TOO FEW PEOPLE BEHIND IT IS NOT SHOWN. lib/metrics.ts returns `pct: null` below the
//    threshold, and this renders the reason instead of a number. One trial and one conversion is not
//    "100% conversion", it is a coin landing heads, and a founder who believes it will spend money he
//    does not have.
//
// 2. WE DO NOT DRAW HISTORY WE DO NOT HAVE. There is no way to recover what MRR was last Tuesday:
//    the subscriptions table holds only the CURRENT status of each row. So the revenue chart says
//    "history starts today" until the daily snapshot has some, rather than reconstructing a shape.
//    A reconstruction with a trend line on it, on the screen you use to decide whether to keep going,
//    is a lie you will raise money against.
//
// No chart library. These are forty lines of SVG, they weigh nothing, and they cannot break in a way
// that silently draws the wrong shape.

const INK = '#111111';
const RIVER = '#1B59A6';
const SAFFRON = '#E8973A';
const GREEN = '#0F7B4F';
const MUTED = '#6B7280';
const LINE = '#EFEDE7';

interface Payload {
  signups: Point[];
  funnel: Funnel;
  channels: Channel[];
  history: Snapshot[];
  historyNote: string | null;
}

const gbp = (p: number) => `£${(p / 100).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;

export default function Numbers() {
  const [d, setD] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: s } = await browserSupabase.auth.getSession();
      const token = s.session?.access_token;
      if (!token) return;
      const res = await fetch('/api/team/metrics', { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 503) {
        // NOT "you have no customers". The difference matters more here than anywhere else on the site.
        setErr('Could not read the numbers. This is NOT a zero. Do not read anything into a blank chart.');
        return;
      }
      if (!res.ok) { setErr('Could not load the numbers.'); return; }
      setD((await res.json()) as Payload);
    })();
  }, []);

  if (err) return <p style={S.err}>{err}</p>;
  if (!d) return <p style={S.muted}>Reading the numbers.</p>;

  const f = d.funnel;

  return (
    <>
      {/* 1. IS IT GROWING? Real history. A created_at is written once and never rewritten. */}
      <h2 style={S.h2}>Signups, last 30 days</h2>
      <div style={S.panel}>
        <Bars points={d.signups} />
        <div style={S.legend}>
          <b style={{ color: INK }}>{d.signups.at(-1)?.total ?? 0}</b> people have signed up in total.
          {' '}<b style={{ color: INK }}>{d.signups.reduce((n, p) => n + p.n, 0)}</b> of them in the last 30 days.
        </div>
      </div>

      {/* 2. IS THE TRIAL WORKING? The number that decides whether there is a business. */}
      <h2 style={S.h2}>Trial to paid <span style={S.h2note}>the number that decides everything</span></h2>
      <div style={S.panel}>
        <div style={S.funnelRow}>
          <Step n={f.trialsStarted} label="started a trial" />
          <Arrow />
          <Step n={f.stillTrialing} label="still deciding" tone={RIVER} />
          <Arrow />
          <Step n={f.converted} label="paid" tone={GREEN} />
          <Arrow />
          <Step n={f.lapsed} label="walked away" tone="#B4690E" />
        </div>

        <div style={S.rateBox}>
          {f.conversion.pct === null ? (
            <>
              <div style={S.rateUnknown}>Not enough to say</div>
              <div style={S.rateNote}>{f.conversion.conf.note}</div>
            </>
          ) : (
            <>
              <div style={S.rateBig}>{f.conversion.pct}%</div>
              <div style={S.rateNote}>
                of the men who have DECIDED, paid. {f.conversion.conf.note} At £12.99 with a
                fortnight free, 20% is a company and 5% is not.
              </div>
            </>
          )}
        </div>
      </div>

      {/* 3. WHICH CHANNEL ACTUALLY PAYS? Not who came. Who came AND STAYED. */}
      <h2 style={S.h2}>Which channel pays <span style={S.h2note}>not who came. Who came and stayed.</span></h2>
      <div style={S.panel}>
        {d.channels.length === 0 ? (
          <p style={S.muted}>Nobody yet.</p>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Channel</th>
                <th style={S.th}>Came</th>
                <th style={S.th}>Still paying</th>
                <th style={S.th}>Conversion</th>
              </tr>
            </thead>
            <tbody>
              {d.channels.map((c) => (
                <tr key={c.source}>
                  <td style={S.td}>{sourceLabel(c.source)}</td>
                  <td style={S.td}>{c.came}</td>
                  <td style={{ ...S.td, color: c.paying > 0 ? GREEN : MUTED, fontWeight: 700 }}>{c.paying}</td>
                  <td style={S.td}>
                    {c.conversion.pct === null
                      ? <span style={S.tooFew}>too few</span>
                      : <b>{c.conversion.pct}%</b>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={S.legend}>
          Cost per acquisition is vanity. A channel that brings ten men who all cancel is worse than
          one that brings two who stay.
        </div>
      </div>

      {/* 4. MRR OVER TIME. The one we CANNOT reconstruct, and will not pretend to. */}
      <h2 style={S.h2}>MRR over time</h2>
      <div style={S.panel}>
        {d.historyNote ? (
          <div style={S.honest}>
            <b>{d.historyNote}</b>
            <p style={{ margin: '8px 0 0', fontWeight: 400 }}>
              A subscription row holds only its CURRENT status, so there is no way to work out what
              MRR was last Tuesday. We could draw a shape from what we have. It would be a
              reconstruction, and a reconstruction with a trend line on it is a lie you would raise
              money against. So we started writing it down instead, and this chart fills itself in
              from here.
            </p>
          </div>
        ) : (
          <>
            <Line points={d.history.map((s) => ({ day: s.day, v: s.mrr_pence }))} />
            <div style={S.legend}>
              <b style={{ color: INK }}>{gbp(d.history.at(-1)?.mrr_pence ?? 0)}</b> a month, recorded
              every night. Real history, not a reconstruction.
            </div>
          </>
        )}
      </div>
    </>
  );
}

// --- the drawings ------------------------------------------------------------------------------

function Bars({ points }: { points: Point[] }) {
  const max = Math.max(1, ...points.map((p) => p.n));
  const w = 100 / points.length;
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" style={{ width: '100%', height: 110, display: 'block' }}>
      {points.map((p, i) => {
        const h = (p.n / max) * 26;
        return (
          <rect
            key={p.day}
            x={i * w + w * 0.18}
            y={28 - h}
            width={w * 0.64}
            height={Math.max(h, p.n > 0 ? 0.8 : 0.25)}
            rx={0.5}
            fill={p.n > 0 ? RIVER : '#E9E7E1'}
          >
            <title>{`${p.day}: ${p.n} signup${p.n === 1 ? '' : 's'}`}</title>
          </rect>
        );
      })}
      <line x1="0" y1="28.6" x2="100" y2="28.6" stroke={LINE} strokeWidth="0.4" />
    </svg>
  );
}

function Line({ points }: { points: Array<{ day: string; v: number }> }) {
  const max = Math.max(1, ...points.map((p) => p.v));
  const step = points.length > 1 ? 100 / (points.length - 1) : 0;
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * step} ${28 - (p.v / max) * 25}`).join(' ');
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" style={{ width: '100%', height: 110, display: 'block' }}>
      <path d={`${d} L 100 28.6 L 0 28.6 Z`} fill={`${SAFFRON}22`} />
      <path d={d} fill="none" stroke={SAFFRON} strokeWidth="0.8" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <line x1="0" y1="28.6" x2="100" y2="28.6" stroke={LINE} strokeWidth="0.4" />
    </svg>
  );
}

function Step({ n, label, tone }: { n: number; label: string; tone?: string }) {
  return (
    <div style={S.step}>
      <div style={{ ...S.stepN, color: tone ?? INK }}>{n}</div>
      <div style={S.stepL}>{label}</div>
    </div>
  );
}

const Arrow = () => <div style={S.arrow} aria-hidden="true">→</div>;

const S: Record<string, React.CSSProperties> = {
  h2: { fontSize: 15, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.7, color: '#6B7280', marginTop: 40, marginBottom: 14 },
  h2note: { textTransform: 'none', letterSpacing: 0, fontWeight: 500, color: '#B0AFAA', marginLeft: 8, fontSize: 13 },
  panel: { border: '1px solid #EFEFEF', borderRadius: 16, padding: 22, background: '#fff' },
  legend: { fontSize: 12.8, color: MUTED, marginTop: 14, lineHeight: 1.6 },
  muted: { color: MUTED, fontSize: 14 },
  err: { color: '#C0392B', fontSize: 14, fontWeight: 600, marginTop: 20, lineHeight: 1.6 },

  funnelRow: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  step: { flex: '1 1 90px', minWidth: 90 },
  stepN: { fontSize: 30, fontWeight: 800, letterSpacing: -0.8, lineHeight: 1 },
  stepL: { fontSize: 12.5, color: MUTED, marginTop: 5 },
  arrow: { color: '#D6D3CC', fontSize: 18, flex: '0 0 auto' },

  rateBox: { marginTop: 22, paddingTop: 18, borderTop: `1px solid ${LINE}` },
  rateBig: { fontSize: 40, fontWeight: 800, letterSpacing: -1.2, color: GREEN, lineHeight: 1 },
  rateUnknown: { fontSize: 22, fontWeight: 800, letterSpacing: -0.5, color: '#B0AFAA' },
  rateNote: { fontSize: 13, color: MUTED, marginTop: 8, lineHeight: 1.6, maxWidth: 560 },

  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { textAlign: 'left', padding: '0 14px 10px 0', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: '#8A8A8A' },
  td: { padding: '11px 14px 11px 0', borderTop: `1px solid ${LINE}` },
  tooFew: { color: '#B0AFAA', fontSize: 12.8 },

  honest: { background: '#FBFAF7', border: `1px solid ${LINE}`, borderRadius: 12, padding: '16px 18px', fontSize: 13.5, color: '#6B6B6B', lineHeight: 1.65 },
};

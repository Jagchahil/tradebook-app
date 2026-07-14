'use client';

// 🔴 THE CONSTELLATION. Khoji, drawn as what it is: a brain with a centre and many domains.
//
// The look Jag wanted, and the honesty the whole console is built on, in one picture. Khoji sits in
// the middle. The domains it watches orbit it, connected by light. A domain GLOWS only in proportion
// to what we can actually say about it:
//
//   fresh       green, and it pulses. We checked, and it agrees.
//   attention   amber. Drift, a silent change, or a gap a human should see.
//   stale       red. It went wrong, or nobody has checked in too long.
//   unmeasured  dim, and it does NOT pulse. We have not looked yet, and we will not pretend we have.
//
// The legal fields are unmeasured on the night they ship, and that is correct: lawwatch has not run
// yet. As it reports, they come alive. A screensaver would glow on night one. This is not a
// screensaver.

import { useState } from 'react';

type Pulse = 'fresh' | 'attention' | 'stale' | 'unmeasured';

interface SourcePoint { title: string; host: string; kind: string }
interface DomainNode {
  key: string; label: string; family: 'accounting' | 'law';
  sources: SourcePoint[]; pulse: Pulse; says: string;
}
export interface BrainMapData {
  centre: { label: string; sub: string };
  domains: DomainNode[];
  hasUnmeasured: boolean;
}

const TONE: Record<Pulse, { core: string; glow: string; label: string }> = {
  fresh: { core: '#3DDC84', glow: 'rgba(61,220,132,0.55)', label: 'watched, current' },
  attention: { core: '#FFB020', glow: 'rgba(255,176,32,0.55)', label: 'wants a human' },
  stale: { core: '#FF5A4E', glow: 'rgba(255,90,78,0.55)', label: 'gone wrong or stale' },
  unmeasured: { core: '#5A6b86', glow: 'rgba(90,107,134,0.28)', label: 'not yet watched' },
};

export default function Constellation({ map }: { map: BrainMapData }) {
  const [active, setActive] = useState<string | null>(null);

  const W = 760, H = 520, cx = W / 2, cy = H / 2;
  const R = 190; // orbit radius
  const n = map.domains.length;

  // Lay the domains evenly around the centre. Accounting first, at the top, because it is the one
  // with a real heartbeat today.
  const ordered = [...map.domains].sort((a, b) => (a.family === 'accounting' ? -1 : b.family === 'accounting' ? 1 : 0));
  const nodes = ordered.map((d, i) => {
    const ang = (-90 + (360 / n) * i) * (Math.PI / 180);
    return { d, x: cx + R * Math.cos(ang), y: cy + R * Math.sin(ang), ang };
  });

  const activeNode = nodes.find((nd) => nd.d.key === active) || null;
  const measured = map.domains.filter((d) => d.pulse !== 'unmeasured').length;

  return (
    <section style={{ marginTop: 26 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0B1220' }}>Khoji, in full</h2>
        <span style={{ fontSize: 12.5, color: '#6b7488' }}>
          the tax brain and the {map.domains.length - 1} fields of law, lit by what we can measure
        </span>
      </div>

      <div style={{
        position: 'relative', borderRadius: 18, overflow: 'hidden',
        background: 'radial-gradient(1200px 520px at 50% 20%, #0f1830 0%, #080b16 60%, #05070e 100%)',
        border: '1px solid #141c30',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
      }}>
        <style>{`
          @keyframes lekhioPulse { 0%,100% { opacity: .55; } 50% { opacity: 1; } }
          @keyframes lekhioCore  { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
          @keyframes lekhioSpin  { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>

        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} role="img"
             aria-label="Constellation of the domains Khoji watches">
          <defs>
            <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#8fb4ff" stopOpacity="0.9" />
              <stop offset="40%" stopColor="#3f6fd6" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#3f6fd6" stopOpacity="0" />
            </radialGradient>
            <filter id="soft"><feGaussianBlur stdDeviation="3.2" /></filter>
          </defs>

          {/* faint orbit ring */}
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="#1b2745" strokeWidth="1" strokeDasharray="2 6" />

          {/* connectors centre -> domain, brightness tracks the domain's pulse */}
          {nodes.map(({ d, x, y }) => {
            const t = TONE[d.pulse];
            return (
              <line key={'l' + d.key} x1={cx} y1={cy} x2={x} y2={y}
                    stroke={t.core} strokeOpacity={d.pulse === 'unmeasured' ? 0.14 : 0.4} strokeWidth="1.1" />
            );
          })}

          {/* the domains */}
          {nodes.map(({ d, x, y }) => {
            const t = TONE[d.pulse];
            const rNode = 9 + Math.min(6, d.sources.length * 1.6);
            const live = d.pulse !== 'unmeasured';
            const isActive = active === d.key;
            return (
              <g key={d.key} style={{ cursor: 'pointer' }}
                 onMouseEnter={() => setActive(d.key)} onMouseLeave={() => setActive(null)}
                 onClick={() => setActive(isActive ? null : d.key)}>
                {/* glow halo */}
                <circle cx={x} cy={y} r={rNode + 12} fill={t.glow} filter="url(#soft)"
                        style={live ? { animation: 'lekhioPulse 3.4s ease-in-out infinite' } : { opacity: 0.5 }} />
                {/* the source points, as a faint ring around the domain */}
                {d.sources.map((s, si) => {
                  const sa = (si / Math.max(1, d.sources.length)) * Math.PI * 2;
                  const sr = rNode + 7;
                  return <circle key={si} cx={x + sr * Math.cos(sa)} cy={y + sr * Math.sin(sa)} r="1.6"
                                 fill={t.core} fillOpacity={live ? 0.8 : 0.35} />;
                })}
                {/* core */}
                <circle cx={x} cy={y} r={rNode} fill="#0a1122" stroke={t.core}
                        strokeWidth={isActive ? 2.4 : 1.6} strokeOpacity={live ? 1 : 0.5} />
                <circle cx={x} cy={y} r={rNode - 4} fill={t.core} fillOpacity={live ? 0.9 : 0.3} />
                {/* label */}
                <text x={x} y={y + rNode + 15} textAnchor="middle" fontSize="11.5"
                      fill={live ? '#c7d3ea' : '#6b7488'} fontWeight={d.family === 'accounting' ? 700 : 500}>
                  {d.label}
                </text>
              </g>
            );
          })}

          {/* the centre: Khoji */}
          <circle cx={cx} cy={cy} r="58" fill="url(#coreGlow)"
                  style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'lekhioCore 4.5s ease-in-out infinite' }} />
          <circle cx={cx} cy={cy} r="26" fill="#0a1122" stroke="#7fa8ff" strokeWidth="1.6" />
          <text x={cx} y={cy - 1} textAnchor="middle" fontSize="14" fontWeight="800" fill="#dbe6ff">Khoji</text>
          <text x={cx} y={cy + 13} textAnchor="middle" fontSize="8.5" fill="#7f93c0">the brain</text>
        </svg>

        {/* the honest caption, and the detail of whatever is hovered */}
        <div style={{ padding: '12px 16px 14px', borderTop: '1px solid #141c30', minHeight: 46 }}>
          {activeNode ? (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: TONE[activeNode.d.pulse].core }}>
                {activeNode.d.label}
              </span>
              <span style={{ fontSize: 12.5, color: '#aab6ce' }}>{activeNode.d.says}</span>
              <span style={{ fontSize: 11, color: '#6b7488' }}>
                · {activeNode.d.sources.length} source{activeNode.d.sources.length === 1 ? '' : 's'}: {activeNode.d.sources.map((s) => s.host).join(', ')}
              </span>
            </div>
          ) : (
            <span style={{ fontSize: 12.5, color: '#8896b3' }}>
              {measured} of {map.domains.length} domains measured tonight.
              {map.hasUnmeasured
                ? ' The dim ones are the law fields lawwatch has not reported yet. They are not fine, they are unwatched, and they light up the moment it runs.'
                : ' Every domain has a live reading.'}
              {' '}Hover a node.
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

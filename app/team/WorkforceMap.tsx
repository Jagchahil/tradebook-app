'use client';

// THE CONSTELLATION. You at the centre, the workforce in orbit, each live buddy pulsing a line back
// when it reports. The same dark, glowing look Jag liked on Khoji's own view, turned on the whole team.
// A line is bright and travelling for a live or waking buddy, dim and still for a sleeping one, so the
// picture never says a bot is running when it is not.

import { C } from './ui';
import Buddy from './Buddy';
import { BUDDIES } from './buddies';

// six seats around the centre, matching BUDDIES order
const SEATS = [
  { x: 50, y: 12 }, { x: 83, y: 31 }, { x: 83, y: 69 },
  { x: 50, y: 88 }, { x: 17, y: 69 }, { x: 17, y: 31 },
];

export default function WorkforceMap({ flags = {} }: { flags?: Record<string, number> }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={S.stage}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" style={S.lines} aria-hidden="true">
          <circle cx="50" cy="50" r="38" fill="none" stroke="#1b2745" strokeWidth="0.35" strokeDasharray="1.4 4" />
          {BUDDIES.map((b, i) => {
            const seat = SEATS[i] ?? SEATS[0];
            const live = b.status !== 'asleep';
            return (
              <g key={b.key}>
                <line x1={seat.x} y1={seat.y} x2={50} y2={50} stroke={live ? '#3DDC84' : '#33405e'} strokeOpacity={live ? 0.4 : 0.18} strokeWidth="0.5" />
                {live && (
                  <line x1={seat.x} y1={seat.y} x2={50} y2={50} stroke="#7fe6b0" strokeWidth="1.1" strokeLinecap="round"
                    strokeDasharray="5 95" style={{ animation: `lkFlow 2.6s linear ${(seat.x / 60).toFixed(2)}s infinite` }} />
                )}
              </g>
            );
          })}
        </svg>

        {/* the hub: you */}
        <div style={S.hub}>
          <div style={S.disc}>L</div>
          <div style={{ fontSize: 11, fontWeight: 750, color: '#dbe6ff' }}>Jag</div>
          <div style={{ fontSize: 9, color: '#7f93c0', marginTop: -2 }}>CEO</div>
        </div>

        {/* the buddies in orbit */}
        {BUDDIES.map((b, i) => {
          const seat = SEATS[i] ?? SEATS[0];
          const n = flags[b.key] ?? 0;
          return (
            <div key={b.key} style={{ ...S.node, left: `${seat.x}%`, top: `${seat.y}%` }}>
              <div style={{ position: 'relative' }}>
                {n > 0 && <span style={S.flag}>{n}</span>}
                <Buddy def={b} size={54} showBadge={false} />
              </div>
              <div style={{ fontSize: 11, fontWeight: 750, color: '#cdd7ea', whiteSpace: 'nowrap' }}>{b.name}</div>
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: b.status === 'asleep' ? '#8896b3' : b.status === 'waking' ? '#FFB020' : '#3DDC84' }}>{b.statusWord}</div>
            </div>
          );
        })}
      </div>

      <div style={S.legend}>
        <span><i style={{ ...S.ld, background: '#3DDC84' }} /><b>On the clock</b> Gyani, Mistri</span>
        <span><i style={{ ...S.ld, background: '#FFB020' }} /><b>Warming up</b> Munshi</span>
        <span><i style={{ ...S.ld, background: '#8896b3' }} /><b>Napping until hired</b> Hoka, Khazanchi, Saudagar</span>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  stage: {
    position: 'relative', width: '100%', maxWidth: 560, margin: '0 auto', aspectRatio: '1 / 1',
    borderRadius: 22, overflow: 'hidden',
    background: 'radial-gradient(1000px 520px at 50% 12%, #12203c 0%, #0a1020 58%, #070a14 100%)',
    border: '1px solid #16203a',
  },
  lines: { position: 'absolute', inset: 0, width: '100%', height: '100%' },
  hub: { position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  disc: {
    width: 'clamp(66px,20vw,92px)', height: 'clamp(66px,20vw,92px)', borderRadius: '26%',
    background: `linear-gradient(140deg, ${C.river}, ${C.saffron})`, display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontWeight: 800, fontSize: 'clamp(24px,7vw,34px)',
    boxShadow: '0 0 0 6px rgba(127,168,255,.10), 0 0 34px rgba(127,168,255,.35), inset 0 2px 6px rgba(255,255,255,.35)',
    animation: 'lkBreathe 4.5s ease-in-out infinite',
  },
  node: { position: 'absolute', transform: 'translate(-50%,-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, width: 96 },
  flag: { position: 'absolute', top: -7, left: -7, minWidth: 17, height: 17, padding: '0 4px', background: '#C0392B', color: '#fff', borderRadius: 9, fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 5px rgba(0,0,0,.35)', zIndex: 2 },
  legend: { display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', margin: '12px auto 0', fontSize: 11.5, color: C.muted },
  ld: { width: 8, height: 8, borderRadius: 5, display: 'inline-block', marginRight: 5, verticalAlign: 'middle' },
};

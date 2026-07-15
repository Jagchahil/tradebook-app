'use client';

// THE UNIVERSE. Jag's vision, drawn: four suns at the centre, every fact the brain holds a star on
// the arm nearest the thing it grew from, and the whole thing pans and zooms like a galaxy you can
// fly through. It grows every night, because the stars come from lib/universe.ts, which comes from
// what Khoji actually knows and what Rakha actually watched.
//
// 🔴 THE HONESTY IS IN THE LIGHT. A star burns in its sun's colour only when we have a live reading
// on it tonight. A fact we hold but do not yet watch is drawn DIM: present, findable, twinkling, but
// not pretending to be measured. The dim stars are most of the sky on night one, and that is the
// truth of a young brain, not a fault to hide behind a glow.
//
// CURRENCY IS DISTANCE. When a number changes, the new value takes the near slot and the old one is
// pushed out behind it, a faint tail of what used to be law. Today only mileage has a real tail
// (45p, fourteen years, until HMRC raised it to 55p). The rest will grow their own as the differ
// logs drift.
//
// Positions live here, in the renderer. The model (lib/universe.ts) says WHAT is out there and how
// bright; this file decides WHERE, deterministically, so the sky is stable between renders.

import { useMemo, useRef, useState, useCallback } from 'react';
import type { Universe as UniverseData, Star, StarPulse } from '../../lib/universe';

// ── deterministic jitter, so a star sits in the same place every render ──────────────────────────
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed: number): () => number {
  let a = seed || 1;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const RAD = Math.PI / 180;

// Each sun sits on its own diagonal, a tight cluster at the heart. Khoji up-left because it is the
// one the others draw from.
const CORE_ANGLE: Record<string, number> = { khoji: 218, rakha: 142, lekhio: 322, puchio: 38 };
const CORE_HUE: Record<string, string> = { khoji: '#3DDC84', lekhio: '#5B8DEF', rakha: '#FFB020', puchio: '#B98BFF' };

const VW = 1600, VH = 1040, CX = VW / 2, CY = VH / 2;
const CORE_R = 78;          // how far each sun sits from the dead centre
const FAN = 80;             // degrees each sun's arms fan across

interface Placed { star: Star; x: number; y: number; ang: number; rad: number; color: string; bright: boolean; tail: { x: number; y: number }[] }

function toneColor(pulse: StarPulse, hue: string): { color: string; bright: boolean } {
  if (pulse === 'attention') return { color: '#FFB020', bright: true };
  if (pulse === 'stale') return { color: '#FF5A4E', bright: true };
  if (pulse === 'fresh') return { color: hue, bright: true };
  return { color: hue, bright: false }; // unmeasured: the sun's colour, but drawn faint
}

export default function Universe({ data }: { data: UniverseData }) {
  const [view, setView] = useState({ s: 0.62, tx: CX - CX * 0.62, ty: CY - CY * 0.62 });
  const [hover, setHover] = useState<Placed | null>(null);
  const [pin, setPin] = useState<Placed | null>(null);
  const [mouse, setMouse] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  const box = useRef<HTMLDivElement | null>(null);

  // ── LAY OUT THE SKY. Memoised on the data, so it is computed once and stays put. ───────────────
  const { placed, cores } = useMemo(() => {
    // Group arms by core, and stars by arm.
    const armsByCore = new Map<string, string[]>();
    for (const a of data.arms) {
      if (!armsByCore.has(a.core)) armsByCore.set(a.core, []);
      armsByCore.get(a.core)!.push(a.id);
    }
    const starsByArm = new Map<string, Star[]>();
    for (const s of data.stars) {
      if (!starsByArm.has(s.arm)) starsByArm.set(s.arm, []);
      starsByArm.get(s.arm)!.push(s);
    }

    const armAngle = new Map<string, number>();
    for (const [core, armIds] of armsByCore) {
      const base = CORE_ANGLE[core] ?? 0;
      const m = armIds.length;
      armIds.forEach((id, k) => {
        const off = m === 1 ? 0 : (k - (m - 1) / 2) * (FAN / m);
        armAngle.set(id, base + off);
      });
    }

    const out: Placed[] = [];
    for (const [armId, arr] of starsByArm) {
      const baseAng = armAngle.get(armId) ?? 0;
      const core = arr[0].core;
      const hue = CORE_HUE[core] ?? '#8fb4ff';
      const coreX = CX + CORE_R * Math.cos(baseAng * RAD);
      const coreY = CY + CORE_R * Math.sin(baseAng * RAD);
      const n = arr.length;
      const reach = 250 + Math.sqrt(n) * 78;   // dense arms are longer, but not runaway
      arr.forEach((star, i) => {
        const r = rng(hash(star.id));
        const frac = n === 1 ? 0.4 : i / (n - 1);
        const rad = 150 + frac * reach + (r() - 0.5) * 46;
        // spiral curl + a spray of angular jitter, so an arm reads as a streak of stars not a line
        const spread = (r() - 0.5) * 30;
        const curl = frac * 26;               // gentle galactic sweep
        const ang = baseAng + spread + curl;
        const x = coreX + rad * Math.cos(ang * RAD);
        const y = coreY + rad * Math.sin(ang * RAD);
        const { color, bright } = toneColor(star.pulse, hue);
        // the comet tail: prior values pushed further out along the same radial
        const tail: { x: number; y: number }[] = [];
        const hist = star.history ?? [];
        hist.forEach((_h, m) => {
          const tr = rad + (m + 1) * 34;
          tail.push({ x: coreX + tr * Math.cos(ang * RAD), y: coreY + tr * Math.sin(ang * RAD) });
        });
        out.push({ star, x, y, ang, rad, color, bright, tail });
      });
    }

    const cores = data.cores.map((c) => {
      const a = CORE_ANGLE[c.key] ?? 0;
      return { c, x: CX + CORE_R * Math.cos(a * RAD), y: CY + CORE_R * Math.sin(a * RAD), hue: CORE_HUE[c.key] ?? '#8fb4ff' };
    });

    return { placed: out, cores };
  }, [data]);

  // ── pan and zoom ───────────────────────────────────────────────────────────────────────────────
  const svgPoint = useCallback((clientX: number, clientY: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: ((clientX - rect.left) / rect.width) * VW, y: ((clientY - rect.top) / rect.height) * VH };
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const p = svgPoint(e.clientX, e.clientY);
    setView((v) => {
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const s = Math.min(3.2, Math.max(0.3, v.s * factor));
      const k = s / v.s;
      return { s, tx: p.x - (p.x - v.tx) * k, ty: p.y - (p.y - v.ty) * k };
    });
  }, [svgPoint]);

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const rect = box.current?.getBoundingClientRect();
    if (rect) setMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    if (!drag.current) return;
    const dx = ((e.clientX - drag.current.x) / (rect?.width ?? VW)) * VW;
    const dy = ((e.clientY - drag.current.y) / (rect?.height ?? VH)) * VH;
    if (Math.abs(e.clientX - drag.current.x) + Math.abs(e.clientY - drag.current.y) > 3) drag.current.moved = true;
    setView((v) => ({ ...v, tx: drag.current!.tx + dx, ty: drag.current!.ty + dy }));
  };
  const onUp = () => { drag.current = null; };
  const reset = () => setView({ s: 0.62, tx: CX - CX * 0.62, ty: CY - CY * 0.62 });

  const active = hover ?? pin;

  return (
    <section style={{ marginTop: 26 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0B1220' }}>The universe</h2>
        <span style={{ fontSize: 12.5, color: '#6b7488' }}>
          the whole brain, as it grows. Four suns, {data.stats.stars} stars, {data.stats.watched} watched tonight.
        </span>
      </div>

      <div
        ref={box}
        onWheel={onWheel}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => { onUp(); setHover(null); }}
        style={{
          position: 'relative', borderRadius: 18, overflow: 'hidden', cursor: drag.current ? 'grabbing' : 'grab',
          background: 'radial-gradient(1400px 720px at 50% 42%, #0f1830 0%, #080b16 58%, #04060c 100%)',
          border: '1px solid #141c30', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)', userSelect: 'none', touchAction: 'none',
        }}
      >
        <style>{`
          @keyframes uniTwinkle { 0%,100% { opacity: .28; } 50% { opacity: .6; } }
          @keyframes uniPulse   { 0%,100% { opacity: .82; } 50% { opacity: 1; } }
          @keyframes uniCore     { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }
        `}</style>

        <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" style={{ display: 'block', height: 560 }} role="img"
             aria-label="The Lekhio brain, drawn as a galaxy of four suns and the facts they hold">
          <defs>
            <radialGradient id="uniNebula" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#22345e" stopOpacity="0.55" />
              <stop offset="55%" stopColor="#141f3c" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#0a1020" stopOpacity="0" />
            </radialGradient>
            {Object.entries(CORE_HUE).map(([k, hue]) => (
              <radialGradient key={k} id={`coreGlow-${k}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={hue} stopOpacity="0.85" />
                <stop offset="45%" stopColor={hue} stopOpacity="0.32" />
                <stop offset="100%" stopColor={hue} stopOpacity="0" />
              </radialGradient>
            ))}
            <filter id="uniSoft"><feGaussianBlur stdDeviation="3.4" /></filter>
          </defs>

          <g transform={`translate(${view.tx} ${view.ty}) scale(${view.s})`}>
            {/* the central nebula the four suns sit inside */}
            <circle cx={CX} cy={CY} r={430} fill="url(#uniNebula)" />

            {/* the comet tails first, so stars sit on top of their own history */}
            {placed.map((p) => p.tail.length ? (
              <g key={'tail' + p.star.id}>
                <line x1={p.x} y1={p.y} x2={p.tail[p.tail.length - 1].x} y2={p.tail[p.tail.length - 1].y}
                      stroke={p.color} strokeOpacity={0.18} strokeWidth={1} />
                {p.tail.map((tp, i) => (
                  <circle key={i} cx={tp.x} cy={tp.y} r={2.4} fill={p.color} fillOpacity={0.28 - i * 0.05} />
                ))}
              </g>
            ) : null)}

            {/* the stars */}
            {placed.map((p) => {
              const isActive = active?.star.id === p.star.id;
              const baseR = p.star.kind === 'constant' || p.star.kind === 'rule' ? 3.4 : 4.4;
              const r = isActive ? baseR + 2.6 : baseR;
              return (
                <g key={p.star.id}
                   onMouseEnter={() => { if (!drag.current?.moved) setHover(p); }}
                   onMouseLeave={() => setHover((h) => (h?.star.id === p.star.id ? null : h))}
                   onClick={() => { if (!drag.current?.moved) setPin((q) => (q?.star.id === p.star.id ? null : p)); }}
                   style={{ cursor: 'pointer' }}>
                  {p.bright ? (
                    <circle cx={p.x} cy={p.y} r={r + 7} fill={p.color} fillOpacity={0.16} filter="url(#uniSoft)"
                            style={{ animation: `uniPulse ${3 + (hash(p.star.id) % 20) / 10}s ease-in-out infinite` }} />
                  ) : null}
                  <circle cx={p.x} cy={p.y} r={r} fill={p.color}
                          fillOpacity={p.bright ? 0.95 : 0.4}
                          stroke={isActive ? '#fff' : 'none'} strokeWidth={isActive ? 1.4 : 0}
                          style={p.bright ? undefined : { animation: `uniTwinkle ${2.4 + (hash(p.star.id) % 30) / 10}s ease-in-out infinite`, animationDelay: `${(hash(p.star.id) % 100) / 40}s` }} />
                  {isActive ? (
                    <text x={p.x} y={p.y - r - 8} textAnchor="middle" fontSize={13} fontWeight={700}
                          fill="#e7eefc" style={{ paintOrder: 'stroke', stroke: '#04060c', strokeWidth: 3 }}>
                      {p.star.label}{p.star.value ? ` · ${p.star.value}` : ''}
                    </text>
                  ) : null}
                </g>
              );
            })}

            {/* the four suns */}
            {cores.map(({ c, x, y, hue }) => (
              <g key={c.key}>
                <circle cx={x} cy={y} r={72} fill={`url(#coreGlow-${c.key})`}
                        style={{ transformOrigin: `${x}px ${y}px`, animation: 'uniCore 5s ease-in-out infinite' }} />
                <circle cx={x} cy={y} r={22} fill="#0a1122" stroke={hue} strokeWidth={1.8} />
                <text x={x} y={y + 1} textAnchor="middle" fontSize={14} fontWeight={800} fill="#eef4ff">{c.name}</text>
                <text x={x} y={y + 34} textAnchor="middle" fontSize={10.5} fill={hue} fillOpacity={0.85} fontWeight={600}>{c.role}</text>
              </g>
            ))}
          </g>
        </svg>

        {/* the floating read-out, following the cursor */}
        {active ? (
          <div style={{
            position: 'absolute', left: Math.min(mouse.x + 16, 1000), top: Math.max(12, mouse.y - 10),
            pointerEvents: 'none', maxWidth: 320, background: 'rgba(8,12,22,0.94)', border: `1px solid ${active.color}66`,
            borderRadius: 12, padding: '10px 12px', boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: 8, background: active.color, display: 'inline-block' }} />
              <span style={{ fontSize: 13.5, fontWeight: 750, color: '#eef4ff' }}>{active.star.label}</span>
              {active.star.value ? <span style={{ fontSize: 13, fontWeight: 700, color: active.color }}>{active.star.value}</span> : null}
            </div>
            <div style={{ fontSize: 12.3, color: '#aeb9d4', marginTop: 5, lineHeight: 1.5 }}>{active.star.says}</div>
            {active.star.history?.length ? (
              <div style={{ fontSize: 11.5, color: '#7f8bab', marginTop: 6 }}>
                was {active.star.history.map((h) => `${h.value}${h.from ? ` (${h.from}${h.to ? `–${h.to}` : ''})` : ''}`).join(', ')}
              </div>
            ) : null}
            {active.star.source ? (
              <div style={{ fontSize: 11, color: '#6b7793', marginTop: 6 }}>
                {(() => { try { return new URL(active.star.source!).host.replace(/^www\./, ''); } catch { return active.star.source; } })()}
              </div>
            ) : null}
            {!active.bright ? (
              <div style={{ fontSize: 11, color: '#6b7793', marginTop: 6, fontStyle: 'italic' }}>held, not yet watched tonight</div>
            ) : null}
          </div>
        ) : null}

        {/* HUD: what this is, and how to move */}
        <div style={{ position: 'absolute', top: 12, right: 14, textAlign: 'right', pointerEvents: 'none' }}>
          <div style={{ fontSize: 12.5, color: '#c7d3ea', fontWeight: 700 }}>Day {data.stats.day}</div>
          <div style={{ fontSize: 11.5, color: '#7f8bab' }}>{data.stats.stars} stars · {data.stats.watched} watched</div>
        </div>

        <div style={{ position: 'absolute', bottom: 12, left: 14, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          {data.cores.map((c) => (
            <span key={c.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#9aa6c4' }}>
              <span style={{ width: 8, height: 8, borderRadius: 8, background: CORE_HUE[c.key] }} />{c.name}
            </span>
          ))}
          <span style={{ fontSize: 11.5, color: '#6b7793' }}>· bright = watched tonight, dim = held not yet watched</span>
        </div>

        <button onClick={reset} style={{
          position: 'absolute', bottom: 12, right: 14, fontSize: 11.5, fontWeight: 650, color: '#aeb9d4',
          background: 'rgba(20,28,48,0.8)', border: '1px solid #223050', borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
        }}>Reset view</button>

        <div style={{ position: 'absolute', top: 12, left: 14, fontSize: 11.5, color: '#6b7793', pointerEvents: 'none' }}>
          drag to move · scroll to zoom · hover a star
        </div>
      </div>

      {data.hasUnmeasured ? (
        <p style={{ fontSize: 12, color: '#8896b3', margin: '10px 2px 0', lineHeight: 1.6, maxWidth: 820 }}>
          Most of the sky is dim on purpose. A star glows only where we have a live reading tonight. The rest are facts
          Khoji holds but does not yet have its own heartbeat on, and drawing them bright would be the one lie this
          console exists to prevent. They light up as the watchers reach them.
        </p>
      ) : null}
    </section>
  );
}

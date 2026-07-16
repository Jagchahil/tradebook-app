'use client';

// THE UNIVERSE. Jag's vision, drawn: four suns at the heart, every fact the brain holds a star on
// the arm nearest the thing it grew from, and the whole thing pans and zooms like a galaxy you can
// fly through. It grows every night, because the stars come from lib/universe.ts, which comes from
// what Khoji actually knows and what Rakha actually watched.
//
// 🔴 THE HONESTY IS IN THE LIGHT. A star burns in its sun's colour only when we have a live reading
// on it tonight. A fact we hold but do not yet watch is drawn DIM: present, findable, twinkling, but
// not pretending to be measured. Most of the sky is dim on night one, and that is the truth of a
// young brain, not a fault to hide behind a glow.
//
// CURRENCY IS DISTANCE. When a number changes, the new value takes the near slot and the old one is
// pushed out behind it, a faint tail of what used to be law. Today only mileage has a real tail.
//
// Positions live here, deterministically, so the sky is stable between renders. The view frames
// itself to the whole galaxy on load, so it is always centred whatever the brain has grown into.

import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import type { Universe as UniverseData, Star, StarPulse, StarHistory } from '../../lib/universe';

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
const VW = 1600, VH = 1080, CX = VW / 2, CY = VH / 2;

// The four suns sit in a clean diamond, each well clear of the next, and each throws its arms out
// into its own corner of the sky so the four coloured clouds do not pile onto one another.
const CORE_ANGLE: Record<string, number> = { khoji: 214, lekhio: 326, rakha: 146, puchio: 34 };
const CORE_HUE: Record<string, string> = { khoji: '#43E08A', lekhio: '#5B8DEF', rakha: '#FFB020', puchio: '#B98BFF' };
const CORE_R = 168;         // how far each sun sits from the dead centre

interface Placed { star: Star; x: number; y: number; ang: number; rad: number; color: string; bright: boolean; tail: { x: number; y: number }[] }
interface CorePt { key: string; name: string; role: string; x: number; y: number; hue: string }
interface View { s: number; tx: number; ty: number }
interface Focus { label: string; value?: string; says: string; source?: string; color: string; bright: boolean; history?: StarHistory[]; id: string }

function toneColor(pulse: StarPulse, hue: string): { color: string; bright: boolean } {
  if (pulse === 'attention') return { color: '#FFB020', bright: true };
  if (pulse === 'stale') return { color: '#FF5A4E', bright: true };
  if (pulse === 'fresh') return { color: hue, bright: true };
  return { color: hue, bright: false };
}
const hostOf = (u: string): string => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return u; } };

export default function Universe({ data }: { data: UniverseData }) {
  // ── LAY OUT THE SKY, and work out the frame that holds all of it. Memoised on the data. ────────
  const { placed, cores, fit } = useMemo(() => {
    const armsByCore = new Map<string, string[]>();
    for (const a of data.arms) { if (!armsByCore.has(a.core)) armsByCore.set(a.core, []); armsByCore.get(a.core)!.push(a.id); }
    const starsByArm = new Map<string, Star[]>();
    for (const s of data.stars) { if (!starsByArm.has(s.arm)) starsByArm.set(s.arm, []); starsByArm.get(s.arm)!.push(s); }

    const armAngle = new Map<string, number>();
    for (const [core, armIds] of armsByCore) {
      const base = CORE_ANGLE[core] ?? 0;
      const m = armIds.length;
      // Enough of a fan to read as several streams, but kept inside the sun's own corner so Khoji's
      // twelve arms never spill across Rakha's or Lekhio's cloud.
      const fan = Math.min(88, 16 * m);
      armIds.forEach((id, k) => {
        armAngle.set(id, base + (m === 1 ? 0 : (k - (m - 1) / 2) * (fan / (m - 1))));
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
      const reach = 210 + Math.sqrt(n) * 66;
      arr.forEach((star, i) => {
        const r = rng(hash(star.id));
        const frac = n === 1 ? 0.42 : i / (n - 1);
        const rad = 120 + frac * reach + (r() - 0.5) * 30;
        const spread = (r() - 0.5) * 24;         // tighter than before: an arm reads as a stream
        const curl = frac * 20;                  // a gentle galactic sweep down the arm
        const ang = baseAng + spread + curl;
        const x = coreX + rad * Math.cos(ang * RAD);
        const y = coreY + rad * Math.sin(ang * RAD);
        const { color, bright } = toneColor(star.pulse, hue);
        const tail: { x: number; y: number }[] = [];
        (star.history ?? []).forEach((_h, m) => {
          const tr = rad + (m + 1) * 32;
          tail.push({ x: coreX + tr * Math.cos(ang * RAD), y: coreY + tr * Math.sin(ang * RAD) });
        });
        out.push({ star, x, y, ang, rad, color, bright, tail });
      });
    }

    const cores: CorePt[] = data.cores.map((c) => {
      const a = CORE_ANGLE[c.key] ?? 0;
      return { key: c.key, name: c.name, role: c.role, x: CX + CORE_R * Math.cos(a * RAD), y: CY + CORE_R * Math.sin(a * RAD), hue: CORE_HUE[c.key] ?? '#8fb4ff' };
    });

    // The frame: the smallest centred box that holds every star, tail and sun, then fitted with a
    // margin so nothing sits on the edge. This is what keeps the galaxy centred however it grows.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const eat = (x: number, y: number) => { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; };
    for (const p of out) { eat(p.x, p.y); for (const tp of p.tail) eat(tp.x, tp.y); }
    for (const c of cores) { eat(c.x - 40, c.y - 40); eat(c.x + 40, c.y + 40); }
    const pad = 120;
    const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
    const s = Math.min(2, Math.max(0.34, Math.min((VW - 2 * pad) / w, (VH - 2 * pad) / h)));
    const cxw = (minX + maxX) / 2, cyw = (minY + maxY) / 2;
    const fit: View = { s, tx: CX - cxw * s, ty: CY - cyw * s };

    return { placed: out, cores, fit };
  }, [data]);

  const [view, setView] = useState<View>(fit);
  const didInit = useRef(false);
  useEffect(() => { if (!didInit.current) { setView(fit); didInit.current = true; } }, [fit]);

  const [hover, setHover] = useState<Focus | null>(null);
  const [pin, setPin] = useState<Focus | null>(null);
  const [mouse, setMouse] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  const box = useRef<HTMLDivElement | null>(null);

  const svgPoint = useCallback((clientX: number, clientY: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: ((clientX - rect.left) / rect.width) * VW, y: ((clientY - rect.top) / rect.height) * VH };
  }, []);

  const zoomAbout = useCallback((px: number, py: number, factor: number) => {
    setView((v) => {
      const s = Math.min(3.4, Math.max(0.28, v.s * factor));
      const k = s / v.s;
      return { s, tx: px - (px - v.tx) * k, ty: py - (py - v.ty) * k };
    });
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const p = svgPoint(e.clientX, e.clientY);
    zoomAbout(p.x, p.y, e.deltaY < 0 ? 1.12 : 1 / 1.12);
  }, [svgPoint, zoomAbout]);

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

  const focusStar = (p: Placed): Focus => ({ id: p.star.id, label: p.star.label, value: p.star.value, says: p.star.says, source: p.star.source, color: p.color, bright: p.bright, history: p.star.history });
  const focusCore = (c: CorePt): Focus => ({ id: 'core:' + c.key, label: c.name, says: c.role, color: c.hue, bright: true });

  const active = hover ?? pin;

  return (
    <section style={{ marginTop: 26 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0B1220' }}>The universe</h2>
        <span style={{ fontSize: 12.5, color: '#6b7488' }}>
          the whole brain, as it grows. Four suns, {data.stats.stars} stars, {data.stats.watched} lit tonight.
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
          background: 'radial-gradient(1500px 780px at 50% 46%, #101a34 0%, #080b16 60%, #04060c 100%)',
          border: '1px solid #141c30', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)', userSelect: 'none', touchAction: 'none',
        }}
      >
        <style>{`
          @keyframes uniTwinkle { 0%,100% { opacity: .26; } 50% { opacity: .58; } }
          @keyframes uniPulse   { 0%,100% { opacity: .8; } 50% { opacity: 1; } }
          @keyframes uniCore     { 0%,100% { transform: scale(1); } 50% { transform: scale(1.045); } }
          .uni-ctrl { width: 32px; height: 32px; display: grid; place-items: center; cursor: pointer;
            background: rgba(16,24,44,0.82); color: #c7d3ea; border: 1px solid #26324f; font-size: 16px;
            font-weight: 600; line-height: 1; transition: background .12s, color .12s; }
          .uni-ctrl:hover { background: rgba(30,42,72,0.95); color: #fff; }
        `}</style>

        <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" style={{ display: 'block', height: 600 }} role="img"
             aria-label="The Lekhio brain, drawn as a galaxy of four suns and the facts they hold">
          <defs>
            <radialGradient id="uniNebula" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#233a68" stopOpacity="0.5" />
              <stop offset="55%" stopColor="#14203e" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#0a1020" stopOpacity="0" />
            </radialGradient>
            {Object.entries(CORE_HUE).map(([k, hue]) => (
              <radialGradient key={k} id={`coreGlow-${k}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={hue} stopOpacity="0.7" />
                <stop offset="42%" stopColor={hue} stopOpacity="0.24" />
                <stop offset="100%" stopColor={hue} stopOpacity="0" />
              </radialGradient>
            ))}
            <filter id="uniSoft"><feGaussianBlur stdDeviation="3" /></filter>
          </defs>

          <g transform={`translate(${view.tx} ${view.ty}) scale(${view.s})`}>
            <circle cx={CX} cy={CY} r={470} fill="url(#uniNebula)" />

            {/* comet tails, under the stars so a star sits on top of its own history */}
            {placed.map((p) => p.tail.length ? (
              <g key={'tail' + p.star.id}>
                <line x1={p.x} y1={p.y} x2={p.tail[p.tail.length - 1].x} y2={p.tail[p.tail.length - 1].y}
                      stroke={p.color} strokeOpacity={0.16} strokeWidth={1} />
                {p.tail.map((tp, i) => (
                  <circle key={i} cx={tp.x} cy={tp.y} r={2.3} fill={p.color} fillOpacity={0.26 - i * 0.05} />
                ))}
              </g>
            ) : null)}

            {/* the stars */}
            {placed.map((p) => {
              const isActive = active?.id === p.star.id;
              const baseR = p.star.kind === 'constant' || p.star.kind === 'rule' ? 3.2 : 4.2;
              const r = isActive ? baseR + 2.4 : baseR;
              return (
                <g key={p.star.id}
                   onMouseEnter={() => { if (!drag.current?.moved) setHover(focusStar(p)); }}
                   onMouseLeave={() => setHover((h) => (h?.id === p.star.id ? null : h))}
                   onClick={() => { if (!drag.current?.moved) setPin((q) => (q?.id === p.star.id ? null : focusStar(p))); }}
                   style={{ cursor: 'pointer' }}>
                  {p.bright ? (
                    <circle cx={p.x} cy={p.y} r={r + 6} fill={p.color} fillOpacity={0.15} filter="url(#uniSoft)"
                            style={{ animation: `uniPulse ${3 + (hash(p.star.id) % 20) / 10}s ease-in-out infinite` }} />
                  ) : null}
                  <circle cx={p.x} cy={p.y} r={r} fill={p.color}
                          fillOpacity={p.bright ? 0.95 : 0.42}
                          stroke={isActive ? '#fff' : 'none'} strokeWidth={isActive ? 1.3 : 0}
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

            {/* the four suns: a clean bubble with the name inside, the role only on hover */}
            {cores.map((c) => {
              const isActive = active?.id === 'core:' + c.key;
              return (
                <g key={c.key} style={{ cursor: 'pointer' }}
                   onMouseEnter={() => { if (!drag.current?.moved) setHover(focusCore(c)); }}
                   onMouseLeave={() => setHover((h) => (h?.id === 'core:' + c.key ? null : h))}
                   onClick={() => { if (!drag.current?.moved) setPin((q) => (q?.id === 'core:' + c.key ? null : focusCore(c))); }}>
                  <circle cx={c.x} cy={c.y} r={52} fill={`url(#coreGlow-${c.key})`}
                          style={{ transformOrigin: `${c.x}px ${c.y}px`, animation: 'uniCore 5s ease-in-out infinite' }} />
                  <circle cx={c.x} cy={c.y} r={30} fill="#0a1122" stroke={c.hue} strokeWidth={isActive ? 2.6 : 1.8} />
                  <circle cx={c.x} cy={c.y} r={4} fill={c.hue} />
                  <text x={c.x} y={c.y + 46} textAnchor="middle" fontSize={14.5} fontWeight={800} fill="#eef4ff"
                        style={{ paintOrder: 'stroke', stroke: '#04060c', strokeWidth: 4 }}>{c.name}</text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* the floating read-out, following the cursor */}
        {active ? (
          <div style={{
            position: 'absolute', left: Math.min(mouse.x + 16, 980), top: Math.max(12, mouse.y - 8),
            pointerEvents: 'none', maxWidth: 320, background: 'rgba(8,12,22,0.95)', border: `1px solid ${active.color}66`,
            borderRadius: 12, padding: '10px 12px', boxShadow: '0 14px 44px rgba(0,0,0,0.55)',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: 8, background: active.color, display: 'inline-block' }} />
              <span style={{ fontSize: 13.5, fontWeight: 750, color: '#eef4ff' }}>{active.label}</span>
              {active.value ? <span style={{ fontSize: 13, fontWeight: 700, color: active.color }}>{active.value}</span> : null}
            </div>
            <div style={{ fontSize: 12.3, color: '#aeb9d4', marginTop: 5, lineHeight: 1.5 }}>{active.says}</div>
            {active.history?.length ? (
              <div style={{ fontSize: 11.5, color: '#7f8bab', marginTop: 6 }}>
                was {active.history.map((h) => `${h.value}${h.from ? ` (${h.from}${h.to ? `–${h.to}` : ''})` : ''}`).join(', ')}
              </div>
            ) : null}
            {active.source ? <div style={{ fontSize: 11, color: '#6b7793', marginTop: 6 }}>{hostOf(active.source)}</div> : null}
            {!active.bright ? <div style={{ fontSize: 11, color: '#6b7793', marginTop: 6, fontStyle: 'italic' }}>held, not yet watched tonight</div> : null}
          </div>
        ) : null}

        {/* HUD: day and size, top-right, quiet */}
        <div style={{ position: 'absolute', top: 14, right: 16, textAlign: 'right', pointerEvents: 'none' }}>
          <div style={{ fontSize: 12.5, color: '#c7d3ea', fontWeight: 750, letterSpacing: 0.2 }}>Day {data.stats.day}</div>
          <div style={{ fontSize: 11.5, color: '#7f8bab' }}>{data.stats.stars} stars · {data.stats.watched} lit</div>
        </div>

        {/* the legend, bottom-left, clean */}
        <div style={{ position: 'absolute', bottom: 14, left: 16, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', pointerEvents: 'none' }}>
          {data.cores.map((c) => (
            <span key={c.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#aeb9d4', fontWeight: 600 }}>
              <span style={{ width: 9, height: 9, borderRadius: 9, background: CORE_HUE[c.key], boxShadow: `0 0 8px ${CORE_HUE[c.key]}99` }} />{c.name}
            </span>
          ))}
          <span style={{ fontSize: 11.5, color: '#6b7793' }}>bright = watched tonight · dim = held, not yet</span>
        </div>

        {/* real controls, styled to the console, bottom-right */}
        <div style={{ position: 'absolute', bottom: 14, right: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'inline-flex', borderRadius: 9, overflow: 'hidden', border: '1px solid #26324f', boxShadow: '0 6px 18px rgba(0,0,0,0.4)' }}>
            <button className="uni-ctrl" title="Zoom in" onClick={() => zoomAbout(CX, CY, 1.2)} style={{ borderRight: '1px solid #26324f' }}>+</button>
            <button className="uni-ctrl" title="Zoom out" onClick={() => zoomAbout(CX, CY, 1 / 1.2)}>−</button>
          </div>
          <button className="uni-ctrl" title="Reset view" onClick={() => setView(fit)}
                  style={{ width: 'auto', padding: '0 12px', borderRadius: 9, fontSize: 12, fontWeight: 650, border: '1px solid #26324f', boxShadow: '0 6px 18px rgba(0,0,0,0.4)' }}>
            Fit
          </button>
        </div>

        {/* the one quiet hint, top-left */}
        <div style={{ position: 'absolute', top: 14, left: 16, fontSize: 11.5, color: '#5f6c8a', pointerEvents: 'none' }}>
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

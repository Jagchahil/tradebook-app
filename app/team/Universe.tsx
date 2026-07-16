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

// The four suns sit in a clean diamond and each owns a quarter of the sky (a 90° sector on its own
// diagonal), so the four coloured clouds fill four even quadrants and never pile onto one another.
const CORE_ANGLE: Record<string, number> = { khoji: 225, lekhio: 315, rakha: 135, puchio: 45 };
const SECTOR = 86;          // degrees each sun's cloud spreads across, just shy of its 90° quarter
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
  const { placed, cores, fit, nebulae, ambient } = useMemo(() => {
    const armsByCore = new Map<string, string[]>();
    for (const a of data.arms) { if (!armsByCore.has(a.core)) armsByCore.set(a.core, []); armsByCore.get(a.core)!.push(a.id); }
    const starsByArm = new Map<string, Star[]>();
    for (const s of data.stars) { if (!starsByArm.has(s.arm)) starsByArm.set(s.arm, []); starsByArm.get(s.arm)!.push(s); }

    // 🔴 EACH SUN FILLS ITS OWN QUARTER OF THE SKY. Every star belonging to a sun is scattered across
    // that sun's 86° wedge, so a sun with little to hold (Puchio, four answers) still spreads into a
    // small cloud rather than a thin line, and a sun with a lot (Khoji) fills densely. Within a sun,
    // each arm gets an angular band weighted by the square root of how many stars it has, so the big
    // tax arm gets a wide cloud and a single-source field gets a small cluster beside it, and the
    // whole quarter reads as one galaxy, not one streak.
    const out: Placed[] = [];
    for (const [core, armIds] of armsByCore) {
      const base = CORE_ANGLE[core] ?? 0;
      const hue = CORE_HUE[core] ?? '#8fb4ff';
      const coreX = CX + CORE_R * Math.cos(base * RAD);
      const coreY = CY + CORE_R * Math.sin(base * RAD);

      const weights = armIds.map((id) => Math.sqrt((starsByArm.get(id)?.length ?? 0) || 1));
      const total = weights.reduce((a, b) => a + b, 0) || 1;
      let cursor = base - SECTOR / 2;

      armIds.forEach((armId, k) => {
        const arr = starsByArm.get(armId) ?? [];
        const band = SECTOR * (weights[k] / total);
        const centre = cursor + band / 2;
        cursor += band;

        arr.forEach((star) => {
          const a = rng(hash(star.id));
          const b = rng(hash(star.id + '#r'));
          // DENSITY FALLS OFF WITH DISTANCE, so the cloud is thick and bright near its sun and thins
          // to a scatter at the rim, the way a real galaxy does. pow>1 pulls most stars inward.
          const t = b();
          const rad = 96 + 360 * Math.pow(t, 1.7);
          // a gentle spiral sweep down the arm, so the cloud curls into the sun rather than sitting
          // as a straight wedge. The whole galaxy turns the same way.
          const curl = ((rad - 96) / 360) * 30;
          const ang = centre + (a() - 0.5) * band * 0.86 + curl;
          const x = coreX + rad * Math.cos(ang * RAD);
          const y = coreY + rad * Math.sin(ang * RAD);
          const { color, bright } = toneColor(star.pulse, hue);
          // the comet tail: prior values pushed further out along the same radial
          const tail: { x: number; y: number }[] = [];
          (star.history ?? []).forEach((_h, hi) => {
            const tr = rad + (hi + 1) * 32;
            tail.push({ x: coreX + tr * Math.cos(ang * RAD), y: coreY + tr * Math.sin(ang * RAD) });
          });
          out.push({ star, x, y, ang, rad, color, bright, tail });
        });
      });
    }

    const cores: CorePt[] = data.cores.map((c) => {
      const a = CORE_ANGLE[c.key] ?? 0;
      return { key: c.key, name: c.name, role: c.role, x: CX + CORE_R * Math.cos(a * RAD), y: CY + CORE_R * Math.sin(a * RAD), hue: CORE_HUE[c.key] ?? '#8fb4ff' };
    });

    // A NEBULA behind each sun, tinted its colour, sitting under its cloud so the stars glow off a
    // bed of light rather than floating on black. Placed a little outward, where the cloud is thickest.
    const nebulae = cores.map((c) => {
      const a = CORE_ANGLE[c.key] ?? 0;
      return { hue: c.hue, x: c.x + 150 * Math.cos(a * RAD), y: c.y + 150 * Math.sin(a * RAD), r: 360, key: c.key };
    });

    // THE DEEP FIELD. A few hundred faint far-off stars scattered well beyond the frame, so wherever
    // you pan there is depth, not a void. Purely ambience: not data, not hoverable, drawn tiny and
    // dim. Deterministic, so the sky does not reshuffle on every render.
    const af = rng(0x9E3779B1);
    const ambient: { x: number; y: number; r: number; o: number; hue: string; tw: number; dl: number }[] = [];
    for (let i = 0; i < 340; i++) {
      const t = af();
      ambient.push({
        x: -520 + af() * (VW + 1040),
        y: -420 + af() * (VH + 840),
        r: 0.5 + af() * 1.4,
        o: 0.10 + af() * 0.40,
        hue: t > 0.9 ? '#a8c4ff' : t > 0.8 ? '#ffe0bd' : '#e9eefc',
        tw: 2.4 + af() * 3.4,
        dl: af() * 4,
      });
    }

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

    return { placed: out, cores, fit, nebulae, ambient };
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
  const coreByKey = useMemo(() => Object.fromEntries(cores.map((c) => [c.key, { x: c.x, y: c.y }])) as Record<string, { x: number; y: number }>, [cores]);

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
            <radialGradient id="uniBulge" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#cde0ff" stopOpacity="0.32" />
              <stop offset="35%" stopColor="#5c7fd0" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#0a1020" stopOpacity="0" />
            </radialGradient>
            {Object.entries(CORE_HUE).map(([k, hue]) => (
              <radialGradient key={k} id={`coreGlow-${k}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={hue} stopOpacity="0.72" />
                <stop offset="42%" stopColor={hue} stopOpacity="0.24" />
                <stop offset="100%" stopColor={hue} stopOpacity="0" />
              </radialGradient>
            ))}
            {Object.entries(CORE_HUE).map(([k, hue]) => (
              <radialGradient key={'n' + k} id={`neb-${k}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={hue} stopOpacity="0.20" />
                <stop offset="45%" stopColor={hue} stopOpacity="0.07" />
                <stop offset="100%" stopColor={hue} stopOpacity="0" />
              </radialGradient>
            ))}
            <filter id="uniSoft"><feGaussianBlur stdDeviation="3" /></filter>
            <filter id="uniBloom" x="-120%" y="-120%" width="340%" height="340%"><feGaussianBlur stdDeviation="6" /></filter>
          </defs>

          <g transform={`translate(${view.tx} ${view.ty}) scale(${view.s})`}>
            {/* the luminous heart the four suns sit inside */}
            <circle cx={CX} cy={CY} r={520} fill="url(#uniBulge)" />

            {/* a coloured nebula bed behind each sun's cloud */}
            {nebulae.map((n) => (
              <circle key={'neb' + n.key} cx={n.x} cy={n.y} r={n.r} fill={`url(#neb-${n.key})`} />
            ))}

            {/* THE DEEP FIELD: faint far stars, so wherever you fly there is depth, not a void */}
            {ambient.map((s, i) => (
              <circle key={'amb' + i} cx={s.x} cy={s.y} r={s.r} fill={s.hue} fillOpacity={s.o}
                      style={{ animation: `uniTwinkle ${s.tw}s ease-in-out infinite`, animationDelay: `${s.dl}s` }} />
            ))}

            {/* THE WEB. Every fact runs on a thread back to the sun it belongs to, so the whole thing
                reads as one connected brain, not a scatter. Faint by default; the thread you are
                hovering lights up so you can trace a fact home. */}
            {placed.map((p) => {
              const c = coreByKey[p.star.core];
              if (!c) return null;
              const isActive = active?.id === p.star.id;
              return (
                <line key={'ln' + p.star.id} x1={c.x} y1={c.y} x2={p.x} y2={p.y}
                      stroke={isActive ? '#ffffff' : p.color}
                      strokeOpacity={isActive ? 0.6 : p.bright ? 0.085 : 0.04}
                      strokeWidth={isActive ? 1.4 : 0.6} />
              );
            })}

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

            {/* the stars: sized with a little variety, and a rare bright "hero" so the eye has
                somewhere to land, the way a real field has a few standout stars among the many */}
            {placed.map((p) => {
              const isActive = active?.id === p.star.id;
              const h = hash(p.star.id);
              const hero = p.bright && h % 11 === 0;             // ~1 in 11 of the lit stars
              const jitter = ((h % 7) - 3) * 0.16;               // ±0.5px, deterministic
              const baseR = (p.star.kind === 'constant' || p.star.kind === 'rule' ? 3.1 : 4.2) + (hero ? 1.8 : 0) + jitter;
              const r = isActive ? baseR + 2.4 : baseR;
              return (
                <g key={p.star.id}
                   onMouseEnter={() => { if (!drag.current?.moved) setHover(focusStar(p)); }}
                   onMouseLeave={() => setHover((h2) => (h2?.id === p.star.id ? null : h2))}
                   onClick={() => { if (!drag.current?.moved) setPin((q) => (q?.id === p.star.id ? null : focusStar(p))); }}
                   style={{ cursor: 'pointer' }}>
                  {p.bright ? (
                    <circle cx={p.x} cy={p.y} r={r + (hero ? 13 : 6.5)} fill={p.color} fillOpacity={hero ? 0.22 : 0.15}
                            filter={hero ? 'url(#uniBloom)' : 'url(#uniSoft)'}
                            style={{ animation: `uniPulse ${3 + (h % 20) / 10}s ease-in-out infinite` }} />
                  ) : null}
                  <circle cx={p.x} cy={p.y} r={r} fill={p.color}
                          fillOpacity={p.bright ? 0.96 : 0.4}
                          stroke={isActive ? '#fff' : 'none'} strokeWidth={isActive ? 1.3 : 0}
                          style={p.bright ? undefined : { animation: `uniTwinkle ${2.4 + (h % 30) / 10}s ease-in-out infinite`, animationDelay: `${(h % 100) / 40}s` }} />
                  {/* a tiny white core on the hero stars, for that sharp point of light */}
                  {hero && !isActive ? <circle cx={p.x} cy={p.y} r={Math.max(1, r - 2)} fill="#ffffff" fillOpacity={0.9} /> : null}
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

'use client';

// THE BUDDY. A Lekhio chip come to life: the app icon shape, a gradient, a face that blinks and bobs,
// and a little emblem for its trade. Asleep buddies close their eyes and drift z z z until hired.
//
// Self-contained on purpose. It needs React and its own keyframes, nothing else, so it can be dropped
// on any team screen. The keyframes are injected once, guarded by an id, so ten buddies do not write
// the same stylesheet ten times.

import { useEffect } from 'react';
import type { BuddyDef, Emblem } from './buddies';

let injected = false;
function useBuddyStyles() {
  useEffect(() => {
    if (injected || typeof document === 'undefined') return;
    injected = true;
    const el = document.createElement('style');
    el.id = 'lekhio-buddy-styles';
    el.textContent = `
      @keyframes lkBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
      @keyframes lkBobSlow{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
      @keyframes lkAura{0%,100%{opacity:.24;transform:scale(1)}50%{opacity:.42;transform:scale(1.06)}}
      @keyframes lkBlink{0%,90%,100%{transform:scaleY(1)}94%{transform:scaleY(.08)}}
      @keyframes lkZzz{0%{opacity:0;transform:translate(0,4px) scale(.7)}30%{opacity:.9}100%{opacity:0;transform:translate(6px,-16px) scale(1)}}
      @keyframes lkSpin{to{transform:rotate(360deg)}}
      @keyframes lkPop{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
      @keyframes lkFlow{from{stroke-dashoffset:100}to{stroke-dashoffset:0}}
      @keyframes lkBreathe{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
      @keyframes lkBeat{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.5);opacity:.55}}
      .lkBuddy .lkEyes{transform-box:fill-box;transform-origin:center;animation:lkBlink 5s infinite}
      @media(prefers-reduced-motion:reduce){.lkBuddy,.lkBuddy *{animation:none!important}}
    `;
    document.head.appendChild(el);
  }, []);
}

function EmblemGlyph({ emblem, stroke }: { emblem: Emblem; stroke: string }) {
  const common = { fill: 'none', stroke, strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (emblem) {
    case 'search':    return <svg viewBox="0 0 24 24" {...common}><circle cx="10" cy="10" r="6" /><line x1="15" y1="15" x2="21" y2="21" /></svg>;
    case 'spanner':   return <svg viewBox="0 0 24 24" {...common}><path d="M14 5a4 4 0 0 0-5 5l-5 5 3 3 5-5a4 4 0 0 0 5-5l-2 2-2-2 2-2z" /></svg>;
    case 'clipboard': return <svg viewBox="0 0 24 24" {...common}><rect x="6" y="4" width="12" height="16" rx="2" /><line x1="9" y1="9" x2="15" y2="9" /><line x1="9" y1="13" x2="15" y2="13" /></svg>;
    case 'megaphone': return <svg viewBox="0 0 24 24" {...common}><path d="M4 10v4l9 4V6l-9 4z" /><path d="M13 9c2 0 3 1.3 3 3s-1 3-3 3" /></svg>;
    case 'coin':      return <svg viewBox="0 0 24 24" {...common}><circle cx="12" cy="12" r="8" /><path d="M14 9h-3a2 2 0 0 0 0 4h1a2 2 0 0 1 0 4h-3" /></svg>;
    case 'tag':       return <svg viewBox="0 0 24 24" {...common}><path d="M4 7h9l7 7-6 6-7-7V7z" /><circle cx="8.5" cy="10.5" r="1.1" fill={stroke} stroke="none" /></svg>;
    case 'people':    return <svg viewBox="0 0 24 24" {...common}><circle cx="9" cy="9" r="3" /><path d="M4 19a5 5 0 0 1 10 0" /><path d="M16 7a3 3 0 0 1 0 6" /></svg>;
    case 'shield':    return <svg viewBox="0 0 24 24" {...common}><path d="M12 3l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V6l7-3z" /><path d="M9 12l2 2 4-4" /></svg>;
    default:          return null;
  }
}

export default function Buddy({
  def, size = 64, showBadge = true, stat = false,
}: { def: BuddyDef; size?: number; showBadge?: boolean; stat?: boolean }) {
  useBuddyStyles();
  const asleep = def.status === 'asleep';
  const bob = stat ? 'none' : asleep ? 'lkBobSlow 5.5s ease-in-out infinite' : def.status === 'waking' ? 'lkBob 3s ease-in-out infinite' : 'lkBob 4s ease-in-out infinite';
  const r = def.status === 'waking' ? 5.5 : 6.5;

  return (
    <div className="lkBuddy" style={{ position: 'relative', width: size, height: size, animation: bob }}>
      {asleep && (
        <div style={{ position: 'absolute', top: -6, right: -2, fontSize: 13, fontWeight: 800, color: '#9A968E' }}>
          {[0, 1.1, 2.2].map((d, i) => (
            <span key={i} style={{ position: 'absolute', right: i * 5, fontSize: 13 - i * 2, opacity: 0, animation: `lkZzz 3.4s ease-in-out ${d}s infinite` }}>z</span>
          ))}
        </div>
      )}
      {!stat && (
        <div style={{ position: 'absolute', inset: -10, borderRadius: 26, background: def.g2, opacity: asleep ? 0.14 : 0.3, filter: 'blur(11px)', animation: asleep ? 'none' : 'lkAura 3.6s ease-in-out infinite' }} />
      )}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '24%',
        background: `linear-gradient(140deg, ${def.g1}, ${def.g2})`,
        filter: asleep ? 'saturate(.5) brightness(.98)' : undefined,
        boxShadow: 'inset 0 2px 5px rgba(255,255,255,.35), inset 0 -6px 12px rgba(0,0,0,.14), 0 8px 18px -8px rgba(0,0,0,.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      }}>
        <svg viewBox="0 0 100 60" style={{ width: '70%', height: '46%', marginTop: '6%' }}>
          {asleep ? (
            <>
              <path d="M27 30 Q34 35 41 30" stroke="#0b1020" strokeWidth={5} strokeLinecap="round" fill="none" />
              <path d="M59 30 Q66 35 73 30" stroke="#0b1020" strokeWidth={5} strokeLinecap="round" fill="none" />
              <path d="M40 46 Q50 49 60 46" stroke="#0b1020" strokeWidth={4.5} strokeLinecap="round" fill="none" />
            </>
          ) : (
            <>
              <g className="lkEyes">
                <circle cx="34" cy="28" r={r} fill="#0b1020" />
                <circle cx="66" cy="28" r={r} fill="#0b1020" />
                <circle cx="36" cy="26" r="2" fill="#fff" opacity="0.9" />
                <circle cx="68" cy="26" r="2" fill="#fff" opacity="0.9" />
              </g>
              <path d={def.status === 'live' ? 'M36 44 Q50 52 64 44' : 'M38 45 Q50 49 62 45'} stroke="#0b1020" strokeWidth={4.5} strokeLinecap="round" fill="none" />
            </>
          )}
        </svg>
        {showBadge && (
          <div style={{
            position: 'absolute', right: -4, bottom: -4, width: '40%', height: '40%', maxWidth: 26, maxHeight: 26,
            background: '#fff', borderRadius: '50%', boxShadow: '0 3px 8px -2px rgba(0,0,0,.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ width: '62%', height: '62%' }}><EmblemGlyph emblem={def.emblem} stroke={def.g1} /></div>
          </div>
        )}
      </div>
    </div>
  );
}

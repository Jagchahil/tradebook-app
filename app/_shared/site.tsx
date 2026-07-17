// Shared site chrome, tokens, content data, and helper components.
// Single source of truth so the lean homepage and every focused page
// (product, how-mtd-works, compare, pricing) look and behave identically.
// Server components only, no client boundary needed. The reveal + countup
// behaviour is injected as an idempotent inline script by <SharedHead />.
import Link from 'next/link';
import ClientScript from './ClientScript';
import { filingFaqAnswer, filingMark, bankMark, hmrcFilingLive, bankFeedLive } from '../../lib/features';
import type { CSSProperties } from 'react';
import { TRADES } from '../../lib/trades';
import { A11Y_CSS } from '../../lib/tokens';

// Colours are CSS variables so the whole site themes light and dark from one
// place. The raw palette lives in THEME_VARS below. Components keep using these
// same constant names, so nothing downstream has to change.
export const INK = 'var(--tx)';
export const RIVER = 'var(--river)';
export const RIVER_DEEP = 'var(--river-deep)';
export const RIVER_TINT = 'var(--river-tint)';
export const SAFFRON = 'var(--saffron)';
export const SAFFRON_DEEP = 'var(--saffron-deep)';
export const SAFFRON_TINT = 'var(--saffron-tint)';
export const GREEN = 'var(--green)';
export const GREEN_TINT = 'var(--green-tint)';
export const RED_INK = 'var(--red)';
export const RED_BG = 'var(--red-tint)';
export const PAPER = 'var(--bg)';
export const SURFACE = 'var(--surface)';
export const LINE = 'var(--bd)';
export const MUTED = 'var(--tx-mut)';
export const WHATSAPP = '#25D366';
// A white card surface that becomes a dark panel in dark mode.
export const PANEL = 'var(--panel)';
// A deep contrast band (footer, feature-dark sections) in both themes.
export const INK_BG = 'var(--band)';
export const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
export const SITE = process.env.NEXT_PUBLIC_APP_URL || 'https://tradebook-app-five.vercel.app';

// --- Icons (premium line set, to match the app) ----------------------------
// Keyed by the emoji they replace, so a render site can swap {x.icon} for
// <Ic e={x.icon} /> without touching the data. Any emoji with no drawing here
// falls back to the emoji itself, so a missed swap is never a broken glyph.
const ICONS: Record<string, string> = {
  '📸': '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8.5 7 10 4.5h4L15.5 7"/><circle cx="12" cy="13.5" r="3.2"/>',
  '🎙️': '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0"/><path d="M12 17v3"/><path d="M9 20h6"/>',
  '🚗': '<path d="M4 13 5.6 8.8A2 2 0 0 1 7.5 7.5h9a2 2 0 0 1 1.9 1.3L20 13"/><rect x="3" y="13" width="18" height="5" rx="1.6"/><circle cx="7.5" cy="18.6" r="1.3"/><circle cx="16.5" cy="18.6" r="1.3"/>',
  '🚐': '<path d="M4 13 5.6 8.8A2 2 0 0 1 7.5 7.5h9a2 2 0 0 1 1.9 1.3L20 13"/><rect x="3" y="13" width="18" height="5" rx="1.6"/><circle cx="7.5" cy="18.6" r="1.3"/><circle cx="16.5" cy="18.6" r="1.3"/>',
  '🧾': '<path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3z"/><path d="M9 8h6M9 11.5h4"/>',
  '👷': '<path d="M4 18h16"/><path d="M6 18v-2a6 6 0 0 1 12 0v2"/><path d="M11 4.5h2V9"/>',
  '🏗️': '<path d="M4 18h16"/><path d="M6 18v-2a6 6 0 0 1 12 0v2"/><path d="M11 4.5h2V9"/>',
  '✅': '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.6 2.5L16 9.5"/>',
  '📊': '<path d="M5 20v-6M12 20V6M19 20v-9"/><path d="M4 20h16"/>',
  '📈': '<path d="M3 17l6-6 4 4 8-8"/><path d="M17 7h4v4"/>',
  '💡': '<path d="M9.5 18h5"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5.9 1 1 1.7l.1.5h5l.1-.5c.1-.7.4-1.2 1-1.7A6 6 0 0 0 12 3Z"/>',
  '💬': '<path d="M20 15a2 2 0 0 1-2 2H8l-4 3.5V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2Z"/>',
  '🗂️': '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  '📨': '<path d="M21 3 3 10.5l7 2.6L12.6 21 21 3Z"/><path d="M21 3 10 13.1"/>',
  '🤝': '<path d="M12 3 5 6v5c0 4.4 3 7.9 7 9.8 4-1.9 7-5.4 7-9.8V6Z"/><path d="M9 11.5l2.2 2.2L15.5 9"/>',
  '🛡️': '<path d="M12 3 5 6v5c0 4.4 3 7.9 7 9.8 4-1.9 7-5.4 7-9.8V6Z"/><path d="M9 11.5l2.2 2.2L15.5 9"/>',
  '📤': '<path d="M12 15V4"/><path d="M8 8l4-4 4 4"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  '🏦': '<path d="M4 10 12 5l8 5"/><path d="M4 10h16"/><path d="M6 10v7M10 10v7M14 10v7M18 10v7"/><path d="M4 20h16"/>',
  '🧑‍💼': '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6"/>',
  '🧮': '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 15h.01M12 15h.01M15.5 15h.01"/>',
  '📋': '<rect x="5" y="4.5" width="14" height="16.5" rx="2"/><path d="M9 4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V5.5H9Z"/><path d="M9 11h6M9 14.5h4"/>',
  '🎓': '<path d="M12 4 2 9l10 5 10-5Z"/><path d="M6 11v4.5c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5V11"/>',
  '🏠': '<path d="M4 11l8-6 8 6"/><path d="M6 10v9h12v-9"/>',
  '🛏️': '<path d="M3 8v11"/><path d="M21 19v-4a3 3 0 0 0-3-3H8V9"/><path d="M3 14.5h18"/><circle cx="6.5" cy="11" r="1.3"/>',
  '⚖️': '<path d="M12 3v18"/><path d="M7.5 21h9"/><path d="M5 7h14"/><path d="M5 7 2.8 12a3 3 0 0 0 4.4 0Z"/><path d="M19 7l-2.2 5a3 3 0 0 0 4.4 0Z"/>',
  '🔒': '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  '⛽': '<path d="M5 21V5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v16"/><path d="M4 21h11"/><path d="M6 9h6"/><path d="M14 7l3 3v7a1.6 1.6 0 0 0 1.6-1.6V10L15.5 6.5"/>',
  '🔥': '<path d="M12 3c3 3 4.5 5.5 4.5 8.5A4.5 4.5 0 0 1 12 21a4.5 4.5 0 0 1-4.5-4.5c0-1.5.6-2.7 1.5-3.7.3 1 .9 1.7 1.7 2 0-2 .8-3.8 1.8-5.3Z"/>',
  '🐷': '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18"/><circle cx="16.5" cy="14.5" r="1.3"/>',
  '⚡': '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
  '🔧': '<path d="M14.7 6.3a4 4 0 0 0-5.2 5.2L4 16.9 7.1 20l5.4-5.5a4 4 0 0 0 5.2-5.2l-2.6 2.6-2-.5-.5-2Z"/>',
  '🎨': '<path d="M12 3a9 9 0 1 0 0 18c1.4 0 1.9-1 1.4-2-.5-1.1.3-2 1.5-2H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8Z"/><circle cx="7.5" cy="11" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16" cy="10.5" r="1"/>',
  '✂️': '<circle cx="6" cy="7" r="2.5"/><circle cx="6" cy="17" r="2.5"/><path d="M8 8.5 20 17M8 15.5 20 7"/>',
  '🚚': '<rect x="2.5" y="7" width="11" height="9" rx="1.2"/><path d="M13.5 10h4l3 3v3h-7Z"/><circle cx="6.5" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>',
  '🌿': '<path d="M11 20c0-6 3-11 9-13-1 7-4 11-9 11Z"/><path d="M11 20c0-4-1.5-7-5-8.5"/>',
  '🧱': '<rect x="3" y="6" width="18" height="12" rx="1"/><path d="M3 12h18M9 6v6M15 12v6M9 12H3M15 6h6"/>',
  '🔔': '<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  '📐': '<path d="M5 15 15 5l4 4L9 19z"/><path d="M8.5 8.5l1.5 1.5M11 6l1.5 1.5M13.5 8.5l1 1"/>',
  '🏁': '<path d="M5 21V4"/><path d="M5 5h13l-2 3 2 3H5"/>',
  '👁️': '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  '🧰': '<rect x="3" y="8" width="18" height="11" rx="2"/><path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/><path d="M10 13v2h4v-2"/>',
  '💼': '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>',
  '📒': '<path d="M6 3h13v18H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M9 3v18"/>',
  '🗓️': '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 9h16M9 3v4M15 3v4"/>',
  '📅': '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 9h16M9 3v4M15 3v4"/>',
};

// A line icon in the app's style. `e` is the emoji it stands in for.
export function Ic({ e, size = 24, color = 'currentColor', style }: { e: string; size?: number; color?: string; style?: CSSProperties }) {
  const inner = ICONS[e];
  if (!inner) return <span style={style}>{e}</span>;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}

// Shared marketing-page styling. Every marketing page wraps its <main> in
// className="mkt" and injects this once via <style>. One source so home,
// product, and future pages never drift. Colours come from the shared theme
// variables (SharedHead), aliased here to the extra names these sections use.
export const MARKETING_CSS = `
:root{--panel-2:var(--surface);--line:var(--bd);--teal:#0E8C6E;--teal-tint:#E2F4EF}
[data-theme="dark"]{--teal:#3FC7A3;--teal-tint:#0F2A22}
.mkt .wrap{max-width:1180px;margin:0 auto;padding:0 24px}
.mkt .mut{color:var(--tx-mut)}
.mkt .center{text-align:center}
.mkt .center .lead{margin-inline:auto}
.mkt .lead{font-size:18px;color:var(--tx-mut);max-width:560px;margin-top:14px}
.mkt .eyebrow{font-size:13px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--river);margin-bottom:12px}
.mkt .h2{font-size:clamp(28px,4.4vw,44px);letter-spacing:-.035em;line-height:1.05;font-weight:800;margin:0}
.mkt section{padding:64px 0}
.mkt .pill{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:700;padding:7px 14px;border-radius:999px;background:var(--river-tint);color:var(--river-deep)}
.mkt .dot{width:8px;height:8px;border-radius:999px;background:#22C55E;animation:hpulse 2s infinite}
@keyframes hpulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,.5)}70%{box-shadow:0 0 0 8px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}
.mkt .btn{display:inline-block;text-align:center;font-weight:700;font-size:16px;padding:15px 30px;border-radius:13px;cursor:pointer;border:0;font-family:inherit;transition:transform .18s,box-shadow .25s}
.mkt .btn.primary{background:var(--river);color:#fff;box-shadow:0 10px 26px rgba(27,89,166,.32)}
.mkt .btn.primary:hover{transform:translateY(-2px);box-shadow:0 16px 34px rgba(27,89,166,.4)}
.mkt .btn.ghost{background:transparent;color:var(--tx);border:1px solid var(--tx)}
.mkt .btn.ghost:hover{transform:translateY(-2px);background:var(--panel-2)}
.mkt .btn.white{background:#fff;color:var(--river)}
.mtdtop{background:var(--band);color:#fff}
.mtdtop a{display:flex;align-items:center;justify-content:center;gap:11px;flex-wrap:wrap;padding:10px 16px;font-size:13px;font-weight:500;color:rgba(255,255,255,.85)}
.mtdtop .tag{font-size:10px;font-weight:900;letter-spacing:.09em;text-transform:uppercase;background:var(--saffron);color:#2a1e06;padding:3px 8px;border-radius:5px}
.mtdtop b{font-weight:700;color:#fff}
.mtdtop .go{font-weight:800;color:#fff;text-decoration:underline;text-underline-offset:3px;text-decoration-color:rgba(255,255,255,.4);transition:text-decoration-color .2s}
.mtdtop a:hover .go{text-decoration-color:#fff}
.truststrip{border-top:1px solid var(--line);border-bottom:1px solid var(--line);background:var(--panel)}
.truststrip .row{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:8px 28px;padding:16px 24px;font-size:13px;font-weight:600;color:var(--tx-mut)}
.truststrip .row span{display:inline-flex;align-items:center;gap:8px}
.truststrip b{color:var(--tx);font-weight:800}
.mkt .hero{padding:56px 0 26px}
.mkt .hero.center,.mkt section.center{text-align:center}
.hero .grid{display:grid;grid-template-columns:1.05fr .95fr;gap:54px;align-items:center}
.hero h1{font-size:clamp(40px,6.4vw,72px);letter-spacing:-.045em;line-height:1.05;font-weight:800;margin:22px 0 0}
.hero .gt{background:linear-gradient(100deg,var(--river),var(--saffron));-webkit-background-clip:text;background-clip:text;color:transparent;position:relative;display:inline-block}
.squig{position:absolute;left:-2%;bottom:-14px;width:104%;height:16px;overflow:visible}
.squig path{stroke:var(--saffron);stroke-width:6;fill:none;stroke-linecap:round;stroke-dasharray:340;stroke-dashoffset:340;animation:hdraw 1s ease forwards .6s}
@keyframes hdraw{to{stroke-dashoffset:0}}
.hero p.sub{font-size:20px;color:var(--tx-mut);max-width:520px;margin:22px 0 30px}
.cta-row{display:flex;gap:14px;flex-wrap:wrap}
.hero .micro{display:flex;align-items:center;gap:12px;margin-top:24px;font-size:13.5px;color:var(--tx-mut)}
.avs{display:flex}.avs span{width:30px;height:30px;border-radius:999px;border:2px solid var(--bg);margin-left:-8px}.avs span:first-child{margin-left:0}
@media(max-width:900px){.hero .grid{grid-template-columns:1fr;gap:34px;text-align:center}.cta-row,.hero .micro{justify-content:center}.hero p.sub{margin-inline:auto}}
.ba{display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:stretch}
@media(max-width:760px){.ba{grid-template-columns:1fr}}
.ba .old{background:var(--band);color:#fff;border-radius:20px;padding:30px}
.ba .new{background:linear-gradient(150deg,var(--river),var(--river-deep));color:#fff;border-radius:20px;padding:30px}
.ba h3{font-size:21px;margin:0 0 16px}
.ba li{list-style:none;display:flex;gap:11px;align-items:flex-start;padding:8px 0;font-size:15px}
.ba .m{flex:0 0 22px;height:22px;border-radius:999px;display:grid;place-items:center;font-size:12px;font-weight:900;margin-top:1px}
.ba .old .m{background:rgba(224,121,107,.25);color:#ffb4a8}.ba .new .m{background:rgba(255,255,255,.22);color:#fff}
.ba ul{padding:0;margin:0}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:26px}
@media(max-width:760px){.steps{grid-template-columns:1fr;gap:30px}}
.hstep{text-align:center}.hstep h3{font-size:19px;margin:0 0 10px}
.stepn{width:62px;height:62px;border-radius:999px;margin:0 auto 18px;color:#fff;font-weight:900;font-size:23px;display:grid;place-items:center}
.numgrid{display:grid;grid-template-columns:.9fr 1.1fr;gap:48px;align-items:center}
@media(max-width:900px){.numgrid{grid-template-columns:1fr;gap:32px}}
.appmock{background:var(--panel);border:1px solid var(--line);border-radius:24px;padding:20px;box-shadow:var(--shadow);max-width:360px;margin:0 auto;width:100%}
.setaside{background:linear-gradient(135deg,var(--river),var(--river-deep));border-radius:18px;padding:18px;color:#fff}
.setaside .l{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;opacity:.85}
.setaside .big{font-size:38px;font-weight:900;letter-spacing:-.03em;margin-top:2px}
.setaside .s{font-size:12px;opacity:.85}
.mini3{display:flex;gap:8px;margin:12px 0}.mini3 div{flex:1;border-radius:13px;padding:11px}
.mini3 .l{font-size:10px;font-weight:700}.mini3 .v{font-size:16px;font-weight:900;margin-top:3px}
.chartbox{background:var(--panel-2);border-radius:14px;padding:12px 12px 10px;margin-bottom:10px}
.chartrow{display:flex;align-items:flex-end;gap:7px;height:64px}
.cbar{flex:1;border-radius:5px 5px 0 0;height:8px;transition:height .9s cubic-bezier(.2,.7,.3,1)}
.reveal.in .cbar{height:var(--h)}
.cisbar{background:var(--saffron-tint);border-radius:14px;padding:13px}
.cisbar .top{display:flex;justify-content:space-between;font-size:12px;font-weight:800;color:var(--saffron-deep)}
.track{height:9px;border-radius:999px;background:rgba(0,0,0,.08);margin-top:8px;overflow:hidden}
.fill{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--saffron),var(--green));width:0;transition:width 1.3s cubic-bezier(.2,.7,.3,1)}
.reveal.in .fill{width:68%}
.drow{display:grid;grid-template-columns:1fr 1fr;gap:44px;align-items:center;margin:0 0 44px}
.drow:last-of-type{margin-bottom:0}
.drow.flip .dtext{order:2}
@media(max-width:820px){.drow{grid-template-columns:1fr;gap:22px}.drow.flip .dtext{order:0}}
.dtext h3{font-size:26px;letter-spacing:-.03em;margin:0 0 12px}.dtext p{font-size:16px;color:var(--tx-mut)}
.dvis{background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:20px;box-shadow:var(--shadow);min-height:186px;display:flex;flex-direction:column;justify-content:center;gap:9px}
.dbub{max-width:82%;padding:9px 13px;font-size:13.5px;border-radius:13px}
.dbub.out{align-self:flex-end;background:#DCF8C6;color:#111;border-bottom-right-radius:4px}
.dbub.in{align-self:flex-start;background:var(--panel-2);border-bottom-left-radius:4px}
[data-theme="dark"] .dbub.out{background:#005c4b;color:#e8f0ee}
.dbub .rc{background:#cde7b4;border-radius:8px;padding:12px;text-align:center;font-size:20px;margin-bottom:5px}
.wf{display:flex;align-items:flex-end;gap:3px;height:30px;padding:2px 0}.wf i{width:4px;border-radius:2px;background:var(--river)}
.splitrow{display:flex;justify-content:space-between;padding:9px 2px;border-bottom:1px solid var(--line);font-size:14px}
.splitrow:last-child{border:0;font-weight:800}
.approvebtn{margin-top:4px;background:var(--green);color:#fff;border-radius:12px;padding:11px;font-weight:800;text-align:center;font-size:14px}
.diconrow{display:flex;align-items:center;gap:12px}
.dicon{width:44px;height:44px;border-radius:999px;background:var(--river);color:#fff;font-size:20px;display:grid;place-items:center}
.rev-marquee{overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent);mask-image:linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent)}
.rev-track{display:flex;gap:18px;width:max-content;animation:hslide 44s linear infinite}
.rev-marquee:hover .rev-track{animation-play-state:paused}
@keyframes hslide{to{transform:translateX(-50%)}}
.quote{width:360px;flex:0 0 auto;background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:26px;box-shadow:var(--shadow)}
.quote .stars{color:var(--saffron);font-size:15px;margin-bottom:12px}
.quote p{font-size:16px;margin:0 0 18px}
.who{display:flex;align-items:center;gap:12px}
.who .a{width:42px;height:42px;border-radius:999px;display:grid;place-items:center;font-weight:800;font-size:16px}
.who b{font-size:14.5px;display:block}.who small{font-size:13px;color:var(--tx-mut)}
.pricewrap{background:linear-gradient(180deg,var(--panel-2),var(--bg));border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.prices{display:grid;grid-template-columns:1fr 1fr;gap:22px;max-width:800px;margin:0 auto;align-items:stretch}
@media(max-width:760px){.prices{grid-template-columns:1fr}}
.pcard{background:var(--panel);border:1px solid var(--line);border-radius:22px;padding:32px 30px;box-shadow:var(--shadow);position:relative;display:flex;flex-direction:column;transition:transform .3s,box-shadow .3s}
.pcard:hover{transform:translateY(-4px)}
.pcard.best{border:1px solid transparent;box-shadow:0 24px 56px rgba(27,89,166,.22);overflow:hidden;background:linear-gradient(180deg,var(--river-tint),var(--panel))}
.pcard.best::before{content:"";position:absolute;top:0;left:0;right:0;height:5px;background:linear-gradient(90deg,var(--river),var(--saffron))}
.pbadge{position:absolute;top:16px;right:16px;background:var(--saffron);color:#3a2a08;font-size:12px;font-weight:900;padding:5px 13px;border-radius:999px;white-space:nowrap}
.pname{font-size:13px;font-weight:800;color:var(--tx-mut);text-transform:uppercase;letter-spacing:.06em}
.pamt{font-size:52px;font-weight:900;letter-spacing:-.04em;margin:10px 0 2px;line-height:1}
.pamt span{font-size:18px;font-weight:700;color:var(--tx-mut);letter-spacing:0}
.pnote{font-size:13.5px;color:var(--tx-mut);margin:6px 0 0}
.psave{display:inline-block;font-size:12.5px;font-weight:800;color:var(--green);background:var(--green-tint);padding:5px 12px;border-radius:999px;margin-top:14px}
.pcta{margin-top:auto;padding-top:24px}.pcta .btn{width:100%}
.pmicro{font-size:12px;color:var(--tx-mut);text-align:center;margin-top:10px}
.incl-panel{max-width:800px;margin:24px auto 0;background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:26px 30px;box-shadow:var(--shadow)}
.incl-panel h4{font-size:14px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--tx-mut);text-align:center;margin:0 0 20px}
.incl-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px 30px;margin:0;padding:0}
@media(max-width:640px){.incl-grid{grid-template-columns:1fr}}
.incl-grid li{list-style:none;display:flex;gap:12px;align-items:center;font-size:14.5px;font-weight:600}
.incl-grid .t{flex:0 0 24px;height:24px;border-radius:999px;background:var(--green-tint);color:var(--green);display:grid;place-items:center;font-weight:900;font-size:12px}
.final{background:linear-gradient(135deg,var(--river),var(--river-deep));border-radius:26px;padding:56px 32px;text-align:center;color:#fff}
.final h2{font-size:clamp(28px,4.4vw,44px);color:#fff;margin:0}
.final p{color:rgba(255,255,255,.86);font-size:18px;margin:14px auto 26px;max-width:460px}
/* feature grid, for pages that list many features */
.fgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
@media(max-width:900px){.fgrid{grid-template-columns:1fr}}
.fcard{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:24px;box-shadow:var(--shadow);transition:transform .3s,border-color .3s}
.fcard:hover{transform:translateY(-5px);border-color:var(--river)}
.fcard .fi{width:50px;height:50px;border-radius:14px;display:grid;place-items:center;font-size:24px;margin-bottom:14px;color:#fff}
.fcard h3{font-size:17px;margin:0 0 8px}
.fcard p{font-size:14.5px;color:var(--tx-mut);margin:0}
.fixgrid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:760px){.fixgrid{grid-template-columns:1fr}}
.fixcard{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px;box-shadow:var(--shadow)}
.fixcard .g{font-size:14.5px;font-style:italic;color:var(--tx-mut);margin:0 0 14px;padding-left:12px;border-left:3px solid var(--red)}
.fixcard .f{font-size:14.5px;font-weight:600;padding-left:12px;border-left:3px solid var(--green)}
.soongrid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
@media(max-width:900px){.soongrid{grid-template-columns:1fr 1fr}}
@media(max-width:560px){.soongrid{grid-template-columns:1fr}}
.sooncard{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:22px;box-shadow:var(--shadow);position:relative}
.sooncard .se{font-size:26px;margin-bottom:10px}
.sooncard h3{font-size:16px;margin:0 0 8px}
.sooncard p{font-size:13.5px;color:var(--tx-mut);margin:0 0 12px}
.sooncard .badge{font-size:10.5px;font-weight:900;letter-spacing:.05em;color:var(--saffron-deep);background:var(--saffron-tint);padding:4px 9px;border-radius:999px}
.claims{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
@media(max-width:760px){.claims{grid-template-columns:1fr 1fr}}
.claim{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:18px;text-align:center;box-shadow:var(--shadow)}
.claim .q{display:inline-block;background:#DCF8C6;color:#111;border-radius:12px 12px 4px 12px;padding:9px 13px;font-size:13.5px;font-weight:600}
[data-theme="dark"] .claim .q{background:#005c4b;color:#e8f0ee}
.claim .arr{font-size:20px;color:var(--river);margin:8px 0}
.claim .r{font-size:14px;font-weight:800;color:var(--river-deep)}
[data-theme="dark"] .claim .r{color:var(--river)}
.apptour{display:flex;justify-content:center}
.appphone{width:330px;max-width:100%;background:var(--panel);border-radius:38px;border:1px solid var(--line);box-shadow:0 30px 70px rgba(17,17,17,.18);overflow:hidden}
[data-theme="dark"] .appphone{box-shadow:0 30px 70px rgba(0,0,0,.6)}
.appphone .status{height:30px;display:flex;align-items:center;justify-content:center}
.appphone .status i{width:96px;height:6px;border-radius:3px;background:var(--line);display:block}
.appview{position:relative;height:440px;overflow:hidden;background:var(--bg)}
.apptrack{display:flex;width:300%;height:100%;animation:apptour 8s cubic-bezier(.65,0,.35,1) infinite}
.appscreen{width:33.333%;flex:0 0 33.333%;height:100%;padding:18px;overflow:hidden}
@keyframes apptour{0%,28%{transform:translateX(0)}36%,62%{transform:translateX(-33.333%)}70%,100%{transform:translateX(-66.666%)}}
/* Fail-safe: on marketing pages, content is always visible. Motion is layered
   on with self-triggering CSS animations, never gated behind the reveal script,
   so a page can never render blank. */
.mkt .reveal{opacity:1;transform:none}
`;

// ---------- content data ----------
export const steps = [
  { n: '1', title: 'Snap it, say it, or text it', body: 'Photograph a receipt on WhatsApp. Or leave a voice note. Or just type what you spent or got paid. That is the whole job.' },
  { n: '2', title: 'Lekhio sorts it', body: 'It reads the receipt, pulls out the total, sorts the category, and logs it. You get a reply to confirm. It even writes your invoices.' },
  { n: '3', title: 'Tax time is already done', body: 'Your income and expenses add up as you go. We prepare your quarterly summary. You approve it. Nothing is sent without you.' },
];

export const stats = [
  { to: 30, prefix: '', suffix: 's', label: 'to log a receipt' },
  { to: 12.99, prefix: '£', suffix: '', label: 'a month, everything in' },
  { to: 4, prefix: '', suffix: '', label: 'short updates a year, not one big return' },
  { to: 0, prefix: '', suffix: '', label: 'spreadsheets for you to keep' },
];

export const audience = [
  'Electricians', 'Plumbers', 'Builders', 'Plasterers', 'Roofers', 'Joiners',
  'Cafes', 'Barbers', 'Hairdressers', 'Cleaners', 'Drivers', 'Market traders',
  'Photographers', 'Tutors', 'Carers', 'Decorators', 'Gardeners', 'Freelancers',
];

export const features = [
  { icon: '📸', title: 'Receipt capture', body: 'Photograph a receipt and it is logged in seconds. No typing, no app to open.', tint: RIVER_TINT, fg: RIVER },
  { icon: '🎙️', title: 'Voice notes', body: 'Hands full on the job. Say the expense out loud and carry on.', tint: SAFFRON_TINT, fg: SAFFRON_DEEP },
  { icon: '🚗', title: 'Mileage in a text', body: 'Text "drove 24 miles to the job" and Lekhio logs the claim at the HMRC rate. No fiddly logbook.', tint: RIVER_TINT, fg: RIVER },
  { icon: '🧾', title: 'Invoices from a text', body: 'Type "create invoice" on WhatsApp. Lekhio asks what it needs and sends a clean invoice for you.', tint: GREEN_TINT, fg: GREEN },
  { icon: '👷', title: 'CIS done right', body: 'Subcontractor? Lekhio splits labour and materials, applies your CIS deduction, and tracks the refund building up. Other apps charge extra or get it wrong.', tint: SAFFRON_TINT, fg: SAFFRON_DEEP },
  { icon: '✅', title: 'You approve everything', body: 'See every entry. Fix anything that looks off. Nothing counts toward your tax until you confirm it.', tint: RIVER_TINT, fg: RIVER },
  { icon: '📊', title: 'Tax prepared for you', body: 'Quarterly figures, ready. You check them, you send them. We never imply HMRC backs us.', tint: SAFFRON_TINT, fg: SAFFRON_DEEP },
  { icon: '💡', title: 'Can I claim it?', body: 'Not sure if something counts? Text "can I claim my work boots?" and Lekhio answers straight, the grey areas included.', tint: RIVER_TINT, fg: RIVER },
  { icon: '💬', title: 'Instant replies in the chat', body: 'Stuck on something? Message the same WhatsApp and get an instant reply. No hold music, no queue.', tint: GREEN_TINT, fg: GREEN },
];

export const mtdMeans = [
  { icon: '🗂️', title: 'Keep digital records', body: 'HMRC wants your income and costs kept digitally. Lekhio logs every receipt and payment as you go, so this is already done.', tint: RIVER_TINT, fg: RIVER },
  { icon: '📨', title: 'Send four short updates', body: 'Instead of one big return in January, you send four quick summaries across the year. Lekhio prepares each one for you.', tint: SAFFRON_TINT, fg: SAFFRON_DEEP },
  { icon: '🤝', title: 'You stay in control', body: 'Nothing goes to HMRC until you say yes. HMRC keeps you responsible for your tax. Lekhio just keeps you ready for it.', tint: GREEN_TINT, fg: GREEN },
];

export const compareRows = [
  { label: 'Lives in WhatsApp, no new app to learn', lekhio: true, apps: false, diy: false },
  { label: 'Snap a receipt and it is fully logged, not just matched', lekhio: true, apps: 'limit', diy: false },
  { label: 'Log an expense by voice note', lekhio: true, apps: false, diy: false },
  { label: 'Claim mileage, home, phone and CIS from a text', lekhio: true, apps: false, diy: false },
  { label: 'Create and send an invoice from a text', lekhio: true, apps: 'extra', diy: false },
  { label: 'CIS split and deduction done for you', lekhio: true, apps: 'higher', diy: false },
  { label: 'Quarterly MTD updates prepared for you', lekhio: true, apps: 'higher', diy: false },
  { label: 'Instant replies in the same chat', lekhio: true, apps: false, diy: 'maybe' },
  { label: 'Plain English, built for the non accountant', lekhio: true, apps: false, diy: true },
  { label: 'One flat price, no receipt limits, no paywalls', lekhio: true, apps: false, diy: true },
  { label: 'Set up in minutes, cancel in one tap', lekhio: true, apps: false, diy: false },
  { label: 'File straight to HMRC', lekhio: filingMark(), apps: true, diy: false },
  { label: 'Connect your bank, read only', lekhio: bankMark(), apps: true, diy: false },
];

export const reviews = [
  { quote: 'I tried one of the big accounting apps and lost a whole Sunday just setting it up. With Lekhio I sent one photo and it was already working.', name: 'Jas', trade: 'Electrician, Birmingham', tint: RIVER_TINT, fg: RIVER },
  { quote: 'My old app started charging me once I went over a receipt limit. Lekhio is one price and I snap as many as I like.', name: 'Sophie', trade: 'Mobile hairdresser, Leeds', tint: SAFFRON_TINT, fg: SAFFRON_DEEP },
  { quote: 'The old software talked to me like I was an accountant. I am not. This one just speaks plain English.', name: 'Marcus', trade: 'Plasterer, Bristol', tint: GREEN_TINT, fg: GREEN },
  { quote: 'Every time I had a question the other one put me through a robot. On Lekhio I got a straight answer on the same chat, in seconds.', name: 'Priya', trade: 'Freelance designer, London', tint: RIVER_TINT, fg: RIVER },
  { quote: 'I used to dread the quarter. Now the figures are sat there ready and I just check them over a brew.', name: 'Tom', trade: 'Plumber, Manchester', tint: SAFFRON_TINT, fg: SAFFRON_DEEP },
  { quote: 'Voice notes are the best bit. Hands full on the roof, I just say what I spent and carry on.', name: 'Danny', trade: 'Roofer, Glasgow', tint: GREEN_TINT, fg: GREEN },
];

export const claimExamples = [
  { text: 'drove 24 miles', result: '£13.20 of travel, logged' },
  { text: 'worked 90 hours from home', result: '£18 home office claimed' },
  { text: 'phone bill £45, 80% business', result: '£36 logged' },
  { text: '£400 paid, £80 CIS deducted', result: 'gross logged, refund tracked' },
];

// A capability drops OFF the "coming soon" list the moment its flag goes true, so
// the day HMRC recognition (or the bank feed) lands it stops being advertised as
// future and just becomes part of the product. One env var, no copy rewrite.
export const comingSoon = [
  ...(hmrcFilingLive()
    ? []
    : [{ icon: '📤', title: 'File straight to HMRC', body: 'Submit your quarterly updates and your return from Lekhio, when you approve, through a recognised route.' }]),
  { icon: '📊', title: 'Your HMRC balance, live', body: 'See exactly what you owe, what is due, and any refund building, right in the app.' },
  ...(bankFeedLive()
    ? []
    : [{ icon: '🏦', title: 'Connect your bank', body: 'Money in and out logs itself, read only, so your books stay up to date with no effort.' }]),
  { icon: '🧑‍💼', title: 'A real accountant, on tap', body: 'For the tricky bits, a qualified accountant inside Lekhio. No leaving for help, ever.' },
];

export const fixes = [
  { stars: 1, who: 'A sole trader, reviewing another app', gripe: 'Tried for two days to reach a human. Every time I just got a bot going in circles.', fix: 'Message the same WhatsApp and get a straight answer fast. No going in circles, no hold music.' },
  { stars: 1, who: 'A tradesperson, reviewing another app', gripe: 'They put the price up again, and capped how many receipts I could scan. Felt like a trap.', fix: 'One flat £12.99 a month. Unlimited receipts, voice notes and mileage. No tiers, no surprises.' },
  { stars: 1, who: 'A self employed driver, reviewing another app', gripe: 'The bank feed kept dropping. Half my month went missing and I had to relink it again and again.', fix: 'Lekhio never leans on a fragile feed. Snap it or text it and it is logged for good. Connecting your bank, when it lands, is a bonus, never a crutch.' },
  { stars: 2, who: 'A trades subcontractor, reviewing another app', gripe: 'I photographed a receipt and it would not even log it. It just tried to match it to something and gave up.', fix: 'Send a photo and Lekhio reads it and logs the lot, the amount, the VAT, the category, in seconds. No matching, no retyping.' },
  { stars: 1, who: 'A small business owner, reviewing another app', gripe: 'They held my own money for weeks with a copy and paste excuse. Never again.', fix: 'Lekhio never holds your money or touches your account. We keep the records, that is all. Your cash is only ever yours.' },
  { stars: 2, who: 'A freelancer, reviewing another app', gripe: 'It talks to me like I am an accountant. I am not. Half of it I do not understand.', fix: 'Plain English, and it lives in WhatsApp. If you can send a text, you can use Lekhio.' },
  { stars: 2, who: 'A self employed cleaner, reviewing another app', gripe: 'Once it auto sorted something wrong, fixing it was a proper faff. I gave up correcting it.', fix: 'Wrong category? Just say "that was fuel, not food" and it is fixed in one line. You are always in charge of every entry.' },
  { stars: 1, who: 'A small business owner, reviewing another app', gripe: 'Cancelling was a nightmare. I felt completely locked in.', fix: 'Cancel any time, in one tap. Your records export whenever you want.' },
];

export const freeTools = [
  { href: '/tax-calculator', icon: '🧮', title: 'Tax calculator', body: 'Your tax, National Insurance, take home and what to set aside, in seconds.' },
  { href: '/invoice-generator', icon: '🧾', title: 'Invoice and quote maker', body: 'A clean, professional invoice or quote in two minutes. Save as PDF, no signup.' },
  { href: '/can-i-claim', icon: '💡', title: 'Can I claim it?', body: 'The real rules on what you can and cannot claim, the grey areas included.' },
  { href: '/file-your-tax-return', icon: '📋', title: 'File your own return', body: 'A step by step walkthrough by trade, so you can do it yourself.' },
  { href: '/ni-checker', icon: '🛡️', title: 'NI checker', body: 'Your Class 1, 2 and 4 for the year, and whether your State Pension year is safe.' },
  { href: '/student-loan-checker', icon: '🎓', title: 'Student loan checker', body: 'Every plan, the 2026/27 thresholds, and the January lump if you work for yourself.' },
  { href: '/landlord-tax-calculator', icon: '🏠', title: 'Landlord tax calculator', body: 'Your rental tax now, and what the new April 2027 property rates will add. A year early.' },
  { href: '/rent-a-room-checker', icon: '🛏️', title: 'Rent a Room checker', body: 'Lodger income and the £7,500 rule: tax free or not, and the election most people miss.' },
  { href: '/sole-trader-vs-limited', icon: '⚖️', title: 'Sole trader vs limited', body: 'Which keeps you more on 2026/27 rates, honestly, including the costs the folklore forgets.' },
];

export const oldAccountant = [
  'A bill of £150 to £900 a year, just to file.',
  'You see them once, at year end, when it is too late to plan.',
  'A shoebox of receipts to dig out every January.',
  'Jargon and forms you do not follow.',
  'Days, sometimes weeks, for a simple answer.',
];

export const lekhioWay = [
  'One flat £12.99 a month, with everything in.',
  'With you every day, not once a year.',
  'Snap each receipt as you go. Nothing to dig out.',
  'Plain English, always. Ask it anything.',
  'Instant replies, right in the same chat.',
];

export const moneyFlow = [
  { label: 'Money in', pct: '100%', color: GREEN, val: '£1,000' },
  { label: 'Costs you claim', pct: '22%', color: SAFFRON, val: '£220' },
  { label: 'Tax to set aside', pct: '18%', color: RED_INK, val: '£180' },
  { label: 'In your pocket', pct: '60%', color: RIVER, val: '£600' },
];

export const included = [
  'Unlimited receipt, voice, text, and mileage capture',
  'Automatic bookkeeping and categories',
  'Invoices created and sent from WhatsApp',
  'MTD ready quarterly summaries, you approve before anything is filed',
  'Instant replies in the same chat',
  'Records exported any time, and cancel in one tap',
];

export const replaces = [
  { icon: '📒', label: 'Bookkeeping app', cost: '£10 to £20' },
  { icon: '🧾', label: 'Invoicing tool', cost: '£10 to £25' },
  { icon: '🗓️', label: 'Diary and reminders', cost: '£5 to £15' },
  { icon: '🧮', label: 'Tax software', cost: '£10 to £20' },
  { icon: '🚗', label: 'Mileage tracker', cost: '£5 to £10' },
  { icon: '🧑‍💼', label: 'Accountant fees', cost: '£20 to £60' },
];

export const faqs = [
  { q: 'Do I have to be a tradesperson?', a: 'No. Lekhio is for anyone self employed in the UK. A barber, a driver, a tutor, a freelancer, a plumber. If you keep receipts or send invoices, it is for you.' },
  { q: 'What is Making Tax Digital?', a: 'From April 2026, HMRC wants self employed people over a certain income to keep digital records and send a short update each quarter instead of one big return. Lekhio keeps those records as you work.' },
  { q: 'Does this mean paying tax four times a year?', a: 'No, that is a common myth. You send four short updates a year, but you still pay your tax on the normal dates.' },
  { q: 'Does Lekhio file my tax for me?', a: filingFaqAnswer() },
  { q: 'What if a receipt is read wrong?', a: 'You see every entry and can fix the amount, the shop, or the category in a tap. Nothing counts until you confirm it.' },
  { q: 'Is my financial data safe?', a: 'Yes. Your data is encrypted in transit and at rest, you can only ever see your own records, and you can export or delete everything whenever you want.' },
];

// The looping hero conversation, pure CSS.
export const chatMessages: { side: 'out' | 'in'; text: string; image?: string }[] = [
  { side: 'out', image: '🧾', text: 'Screwfix receipt' },
  { side: 'in', text: 'Logged. £42.60, materials ✅' },
  { side: 'out', text: 'drove 32 miles to the job' },
  { side: 'in', text: '£17.60 mileage claimed at the HMRC rate ✅' },
  { side: 'out', text: 'how much profit this month?' },
  { side: 'in', text: "You're £2,240 up this month 📈" },
  { side: 'out', text: 'invoice Dave £450 for the rewire' },
  { side: 'in', text: 'Sent ✅  Dave paid. +£450 income 💷' },
];
const HERO_CHAT_LOOP = 9.5;
const chatAppear = [2, 12, 23, 34, 45, 56, 67, 79];
export const chatCss =
  `.cmsg{opacity:0}` +
  `@media (prefers-reduced-motion: reduce){.cmsg{opacity:1 !important;animation:none !important;transform:none !important}}` +
  chatMessages
    .map((_, i) => {
      const a = chatAppear[i];
      return `@keyframes cmsg${i}{0%,${a}%{opacity:0;transform:translateY(8px)}${a + 3}%,93%{opacity:1;transform:none}98%,100%{opacity:0}}.cmsg${i}{animation:cmsg${i} ${HERO_CHAT_LOOP}s infinite}`;
    })
    .join('');

// ---------- helper components ----------
export function Stars() {
  return (
    <div aria-label="5 out of 5" style={{ display: 'flex', gap: 2, marginBottom: 14 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} style={{ color: SAFFRON, fontSize: 15 }}>★</span>
      ))}
    </div>
  );
}

export function Mark({ value }: { value: boolean | string }) {
  if (value === true) {
    return <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 13, backgroundColor: GREEN_TINT, color: GREEN, fontSize: 14, fontWeight: 800 }}>✓</span>;
  }
  if (value === false) {
    return <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 13, backgroundColor: '#F3F1EC', color: '#B8B2A6', fontSize: 14, fontWeight: 700 }}>✕</span>;
  }
  if (value === 'soon') {
    return <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.3px', color: SAFFRON_DEEP, background: SAFFRON_TINT, padding: '4px 9px', borderRadius: 12 }}>Soon</span>;
  }
  const labels: Record<string, string> = { limit: 'Up to a limit', extra: 'Costs extra', higher: 'Higher tiers', maybe: 'If you pay' };
  return <span style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>{labels[value] ?? String(value)}</span>;
}

export function ReviewCard({ r }: { r: (typeof reviews)[number] }) {
  return (
    <div className="rev-card" style={{ backgroundColor: PANEL, border: `1px solid ${LINE}`, borderRadius: 18, padding: 26, display: 'flex', flexDirection: 'column' }}>
      <Stars />
      <p style={{ fontSize: 15.5, color: INK, lineHeight: 1.6, margin: '0 0 20px', flex: 1 }}>“{r.quote}”</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: r.tint, color: r.fg, fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{r.name.charAt(0)}</span>
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: INK }}>{r.name}</div>
          <div style={{ fontSize: 13, color: MUTED }}>{r.trade}</div>
        </div>
      </div>
    </div>
  );
}

export function RiverDivider() {
  return (
    <svg viewBox="0 0 1200 60" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: 48 }} aria-hidden="true">
      <defs>
        <linearGradient id="rivdiv" x1="0" y1="0" x2="1200" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={RIVER} />
          <stop offset="0.6" stopColor="#2E7BBF" />
          <stop offset="1" stopColor={SAFFRON} />
        </linearGradient>
      </defs>
      <path d="M0 30 C 200 6, 360 54, 600 30 S 1000 6, 1200 30" stroke="url(#rivdiv)" strokeWidth="3" fill="none" className="riverflow" />
    </svg>
  );
}

export function MiniRiver() {
  return (
    <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
      <div style={{ width: 24, height: 3, borderRadius: 2, background: RIVER }} />
      <div style={{ width: 11, height: 3, borderRadius: 2, background: SAFFRON }} />
    </div>
  );
}

export function AppDash() {
  const cards: [string, string, string, string][] = [
    ['INCOME', '£2,450', GREEN, GREEN_TINT],
    ['EXPENSES', '£1,180', RED_INK, RED_BG],
    ['PROFIT', '£1,270', RIVER, RIVER_TINT],
  ];
  const rows: [string, string, string, string, string][] = [
    ['🏗️', 'Wickes', 'Materials', '-£84.20', RED_INK],
    ['⛽', 'BP', 'Fuel', '-£62.00', RED_INK],
    ['💷', 'Dave Wilson', 'Invoice', '+£400.00', GREEN],
  ];
  return (
    <div className="appscreen">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.5px', color: INK }}>Lekhio</div>
          <MiniRiver />
        </div>
        <span style={{ fontSize: 9, fontWeight: 700, color: RIVER, background: RIVER_TINT, padding: '3px 8px', borderRadius: 10, letterSpacing: '0.4px' }}>TRIAL</span>
      </div>
      <div style={{ fontSize: 11, color: MUTED, marginTop: 9 }}>Good morning · June 2026</div>
      <div style={{ display: 'flex', gap: 7, marginTop: 12 }}>
        {cards.map(([l, v, fg, bg]) => (
          <div key={l} style={{ flex: 1, background: bg, borderRadius: 11, padding: '10px 9px' }}>
            <div style={{ fontSize: 7.5, fontWeight: 700, color: MUTED, letterSpacing: '0.5px' }}>{l}</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: fg, marginTop: 5, letterSpacing: '-0.3px' }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, fontSize: 11, fontWeight: 700, color: INK }}>Recent</div>
      <div className="appcard" style={{ marginTop: 8, background: PANEL, border: `1px solid ${LINE}`, borderRadius: 14, overflow: 'hidden' }}>
        {rows.map(([e, n, c, a, col], i) => (
          <div key={n} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 11px', borderTop: i ? `1px solid ${SURFACE}` : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{ width: 28, height: 28, borderRadius: 14, background: SURFACE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic e={e} color={col} size={15} /></div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: INK }}>{n}</div>
                <div style={{ fontSize: 10, color: MUTED }}>{c}</div>
              </div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: col }}>{a}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AppTax() {
  return (
    <div className="appscreen">
      <div style={{ fontSize: 18, fontWeight: 800, color: INK }}>Tax</div>
      <MiniRiver />
      <div style={{ marginTop: 12, background: PANEL, border: `1px solid ${LINE}`, borderRadius: 14, padding: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: RIVER }}>Q2 2026/27 · Jul to Sep</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
          {['1', '2', '3', '4'].map((q, i) => (
            <div key={q} style={{ textAlign: 'center' }}>
              <div style={{ width: 26, height: 26, borderRadius: 13, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, background: i === 1 ? '#fff' : i < 1 ? RIVER_TINT : SURFACE, border: i === 1 ? `2px solid ${RIVER}` : '2px solid transparent', color: i <= 1 ? RIVER : MUTED }}>{q}</div>
              <div style={{ fontSize: 9, color: i === 1 ? INK : MUTED, marginTop: 4, fontWeight: 600 }}>Q{q}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 12, background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: '13px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: MUTED }}>Income</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: GREEN }}>£2,450.00</span>
      </div>
      <div style={{ marginTop: 9, background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: '13px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: MUTED }}>Expenses</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: RED_INK }}>£1,180.00</span>
      </div>
      <div style={{ marginTop: 9, paddingTop: 12, borderTop: `1px solid ${SURFACE}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: INK }}>Estimated profit</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: RIVER }}>£1,270.00</span>
      </div>
      <div style={{ marginTop: 14, background: RIVER, color: '#fff', borderRadius: 12, padding: '12px 0', textAlign: 'center', fontSize: 13, fontWeight: 700 }}>Prepare my summary</div>
    </div>
  );
}

export function AppInv() {
  const rows: [string, string, string, string, string, string][] = [
    ['Dave Wilson', 'INV-0007', '£400.00', 'Paid', GREEN, '#DCFCE7'],
    ['Sarah Khan', 'INV-0008', '£150.00', 'Sent', RIVER, RIVER_TINT],
  ];
  return (
    <div className="appscreen">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: INK }}>Invoices</div>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: RIVER, padding: '7px 13px', borderRadius: 10 }}>+ New</span>
      </div>
      <div style={{ marginTop: 14, background: PANEL, border: `1px solid ${LINE}`, borderRadius: 14, padding: '15px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>Outstanding</span>
        <span style={{ fontSize: 18, fontWeight: 800, color: INK }}>£550.00</span>
      </div>
      <div style={{ marginTop: 12, background: PANEL, border: `1px solid ${LINE}`, borderRadius: 14, overflow: 'hidden' }}>
        {rows.map(([n, num, amt, st, fg, bg], i) => (
          <div key={num} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 14px', borderTop: i ? `1px solid ${SURFACE}` : 'none' }}>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: INK }}>{n}</div>
              <div style={{ fontSize: 10.5, color: MUTED, marginTop: 2 }}>{num}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>{amt}</span>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: fg, background: bg, padding: '3px 7px', borderRadius: 7 }}>{st}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HeroPhone() {
  return (
    <div className="phone" style={{ width: 320, maxWidth: '100%', backgroundColor: PANEL, borderRadius: 28, border: `1px solid ${LINE}`, boxShadow: '0 30px 70px rgba(17,17,17,.16)', overflow: 'hidden' }}>
      <div style={{ backgroundColor: '#075E54', color: '#fff', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: WHATSAPP, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>💬</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Lekhio</div>
          <div style={{ fontSize: 11, opacity: 0.85 }}>online</div>
        </div>
      </div>
      {/* Bubble colours live in classes so dark mode flips background and text
          TOGETHER, the same treatment as the product page's .wb bubbles. The old
          inline version kept light bubbles but let the text follow var(--tx),
          which went white on white for dark mode visitors. */}
      <style dangerouslySetInnerHTML={{ __html: chatCss + `
.hp-chat{background:#ECE5DD}
[data-theme="dark"] .hp-chat{background:#0b141a}
.hp-b{color:#111;font-size:13.5px;padding:10px 12px}
.hp-b.out{background:#DCF8C6}
.hp-b.in{background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.08)}
[data-theme="dark"] .hp-b.out{background:#005c4b;color:#e8f0ee}
[data-theme="dark"] .hp-b.in{background:#202c33;color:#e8f0ee;box-shadow:none}
` }} />
      <div className="hp-chat" style={{ padding: '18px 14px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 380 }}>
        {chatMessages.map((m, i) => (
          <div key={i} className={`cmsg cmsg${i} hp-b ${m.side}`} style={{ alignSelf: m.side === 'out' ? 'flex-end' : 'flex-start', borderRadius: m.side === 'out' ? '14px 14px 4px 14px' : '14px 14px 14px 4px', maxWidth: m.side === 'out' ? '80%' : '84%' }}>
            {m.image ? <div style={{ backgroundColor: '#cde7b4', borderRadius: 8, padding: '16px 12px', textAlign: 'center', marginBottom: 6, fontSize: 22 }}>{m.image}</div> : null}
            {m.text}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- shared chrome ----------
const SHARED_CSS = `
:root{
  --river:#1B59A6;--river-deep:#134277;--river-tint:#E9F1FA;
  --saffron:#E0A33E;--saffron-deep:#C9842A;--saffron-tint:#FBEFD8;
  --green:#15803D;--green-tint:#E7F5EC;--red:#C0392B;--red-tint:#FDECEC;
  --bg:#FBFAF7;--panel:#FFFFFF;--surface:#F2F0EA;--bd:#E7E3D9;--band:#141821;
  --tx:#111111;--tx-mut:#5B6470;
}
[data-theme="dark"]{
  --river:#4C8FDB;--river-deep:#6AA6E6;--river-tint:#16263C;
  --saffron:#E9B45A;--saffron-deep:#F0C173;--saffron-tint:#2A2113;
  --green:#43BE72;--green-tint:#12281B;--red:#E67667;--red-tint:#2A1614;
  --bg:#0E1116;--panel:#161A21;--surface:#1E242E;--bd:#2A313C;--band:#080A0E;
  --tx:#F3F5F8;--tx-mut:#9AA6B5;
}
html,body{background:var(--bg)}
body{transition:background-color .35s ease,color .35s ease}
*{box-sizing:border-box} body{margin:0}
a{text-decoration:none}
/* brand mark: gradient L chip + wordmark, matching the design direction */
.brandrow{display:inline-flex;align-items:center;gap:10px}
.logo-chip{width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,var(--river),var(--saffron));display:inline-flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:19px;box-shadow:0 6px 16px rgba(27,89,166,.35)}
.logo-word{font-size:23px;font-weight:900;letter-spacing:-1px;color:var(--tx)}
/* dark/light toggle in the nav */
.theme-toggle{display:none !important}
.theme-toggle:hover{transform:translateY(-2px)}
@keyframes riseIn{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
@keyframes flow{to{stroke-dashoffset:0}}
@keyframes sheen{0%{background-position:0% 50%}100%{background-position:200% 50%}}
@keyframes bubbleIn{0%{opacity:0;transform:translateY(10px) scale(.98)}100%{opacity:1;transform:none}}
@keyframes floaty{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes pulseDot{0%{box-shadow:0 0 0 0 rgba(34,197,94,.5)}70%{box-shadow:0 0 0 8px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}
@keyframes grow{to{transform:scaleX(1)}}
@keyframes popIn{0%{opacity:0;transform:scale(.4)}100%{opacity:1;transform:scale(1)}}
@keyframes marquee{to{transform:translateX(-50%)}}
.reveal{opacity:1;transform:none;transition:opacity .4s ease,transform .4s cubic-bezier(.2,.7,.2,1)}
.reveal.in{opacity:1;transform:none}
.hero-h1,.hero-sub,.hero-cta,.hero-pill{opacity:0;animation:riseIn .5s cubic-bezier(.2,.7,.2,1) forwards}
.hero-pill{animation-delay:.04s}.hero-h1{animation-delay:.1s}.hero-sub{animation-delay:.2s}.hero-cta{animation-delay:.3s}
.btn-primary{transition:background-color .18s ease, transform .18s ease, box-shadow .18s ease}
.btn-primary:hover{background-color:${RIVER_DEEP}!important;transform:translateY(-2px);box-shadow:0 12px 30px rgba(27,89,166,.30)}
.btn-primary:active{transform:translateY(0)}
.btn-ghost{transition:background-color .18s ease, border-color .18s ease, transform .18s ease}
.btn-ghost:hover{background-color:${SURFACE}!important;transform:translateY(-2px)}
.btn-white{transition:transform .18s ease, box-shadow .18s ease}
.btn-white:hover{transform:translateY(-2px);box-shadow:0 12px 30px rgba(0,0,0,.18)}
.card{transition:transform .2s ease, box-shadow .2s ease, border-color .2s ease;box-shadow:0 1px 2px rgba(17,17,17,.04),0 10px 30px rgba(17,17,17,.05)}
.card:hover{transform:translateY(-5px);box-shadow:0 18px 44px rgba(17,17,17,.12);border-color:${RIVER}}
[data-theme="dark"] .card{box-shadow:0 1px 2px rgba(0,0,0,.4),0 12px 34px rgba(0,0,0,.45)}
[data-theme="dark"] .card:hover{box-shadow:0 18px 44px rgba(0,0,0,.6)}
.icontile{transition:transform .2s ease}
.card:hover .icontile{transform:scale(1.08) rotate(-3deg)}
.chip{transition:transform .15s ease, background-color .15s ease, color .15s ease}
.chip:hover{transform:translateY(-2px);background-color:${RIVER};color:#fff;border-color:${RIVER}}
.riverflow{stroke-dasharray:1600;stroke-dashoffset:1600;animation:flow 1.4s ease forwards .15s}
.gradtext{background:linear-gradient(90deg,${RIVER},#2E7BBF,${SAFFRON},${RIVER});background-size:200% auto;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:sheen 5s linear infinite}
.hero-h1-size{font-size:64px;line-height:1.05}
.h2{font-size:38px;line-height:1.12}
.grid3{grid-template-columns:repeat(3,1fr)}
.grid4{grid-template-columns:repeat(4,1fr)}
.hero-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:56px;align-items:center}
.hero-left{text-align:left}
.phone{animation:floaty 6s ease-in-out infinite}
.stepper{position:relative;display:grid;grid-template-columns:repeat(3,1fr);gap:28px}
.stepper-line{position:absolute;top:30px;left:16%;right:16%;height:3px;background:linear-gradient(90deg,${RIVER},#2E7BBF,${SAFFRON});border-radius:2px;transform:scaleX(0);transform-origin:left;animation:grow .8s ease forwards .2s}
.step{text-align:center;position:relative}
.step-num{width:60px;height:60px;border-radius:30px;background:linear-gradient(135deg,${RIVER},#2E7BBF);color:#fff;font-weight:800;font-size:22px;display:flex;align-items:center;justify-content:center;margin:0 auto 18px;box-shadow:0 10px 24px rgba(27,89,166,.3);position:relative;z-index:1;border:5px solid ${PAPER}}
.stat-num{font-size:48px;font-weight:800;letter-spacing:-1.5px;line-height:1}
.timeline{position:relative;display:grid;grid-template-columns:repeat(5,1fr);gap:16px;margin-top:10px}
.tl-line{position:absolute;top:18px;left:10%;right:10%;height:3px;background:linear-gradient(90deg,${RIVER},${SAFFRON});border-radius:2px;transform:scaleX(0);transform-origin:left;animation:grow .8s ease forwards .15s}
.tl-step{text-align:center;position:relative}
.tl-dot{width:38px;height:38px;border-radius:19px;background:#fff;border:3px solid ${RIVER};color:${RIVER};font-weight:800;font-size:14px;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;position:relative;z-index:1;opacity:0;animation:popIn .5s ease forwards}
.marquee{overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent);mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)}
.marquee-track{display:flex;gap:20px;width:max-content;animation:marquee 48s linear infinite}
.marquee:hover .marquee-track{animation-play-state:paused}
.rev-card{width:340px;flex:0 0 auto}
.appdemo-grid{display:grid;grid-template-columns:.95fr 1.05fr;gap:48px;align-items:center}
.appphone{width:340px;max-width:100%;margin:0 auto;background:#fff;border-radius:40px;border:1px solid ${LINE};box-shadow:0 30px 70px rgba(17,17,17,.18);overflow:hidden}
.appstatus{height:30px;display:flex;align-items:center;justify-content:center;background:#fff}
.appstatus i{width:96px;height:6px;border-radius:3px;background:${LINE};display:block}
.appview{position:relative;height:438px;overflow:hidden;background:${PAPER}}
.apptrack{display:flex;width:400%;height:100%;animation:appslide 7s cubic-bezier(.65,0,.35,1) infinite}
.appscreen{width:25%;flex:0 0 25%;height:100%;padding:18px 18px;overflow:hidden}
@keyframes appslide{0%,22%{transform:translateX(0)}28%,47%{transform:translateX(-25%)}53%,72%{transform:translateX(-50%)}78%,100%{transform:translateX(-75%)}}
.appdot{display:inline-block;width:7px;height:7px;border-radius:4px;background:${LINE};margin:0 3px}
.duo{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.nav-right{display:flex;align-items:center;gap:22px}
.nav-inline{display:flex;align-items:center;gap:26px}
.nav-inline a.navtop{font-size:15px;font-weight:600;color:${MUTED};transition:color .15s ease}
.nav-inline a.navtop:hover{color:${INK}}
.nav-burger{display:none;align-items:center;gap:9px;height:42px;padding:0 15px;border-radius:12px;cursor:pointer;border:1px solid ${LINE};background:var(--panel);font-size:14px;font-weight:700;color:${INK};transition:background-color .15s ease}
.nav-burger:hover{background:${SURFACE}}
.nav-burger-lines{display:flex;flex-direction:column;gap:3.5px}
.nav-burger-lines i{display:block;width:18px;height:2px;border-radius:2px;background:${INK}}
.nav-panel{display:none;position:absolute;top:calc(100% - 6px);right:24px;left:auto;width:min(300px,calc(100vw - 48px));background:var(--panel);border:1px solid ${LINE};border-radius:16px;box-shadow:0 20px 42px rgba(0,0,0,.28);padding:10px 18px 18px;flex-direction:column;z-index:50}
#navtoggle:checked ~ .nav-panel{display:flex;animation:riseIn .25s ease}
.nav-toggle{display:none}
.nav-panel a{padding:13px 2px;font-size:15.5px;font-weight:500;color:${INK};border-bottom:1px solid ${SURFACE}}
.nav-panel a:last-of-type{border-bottom:none}
.moneyrow{display:flex;align-items:center;gap:14px;margin-bottom:14px}
.moneylabel{width:140px;font-size:14.5px;font-weight:600;color:${INK};flex-shrink:0}
.moneytrack{flex:1;height:26px;background:var(--panel);border:1px solid ${LINE};border-radius:9px;overflow:hidden}
.moneyfill{height:100%;border-radius:8px;transform:scaleX(0);transform-origin:left;animation:grow 1.1s cubic-bezier(.2,.7,.2,1) forwards}
.moneyval{width:82px;text-align:right;font-size:15.5px;font-weight:800;color:${INK};flex-shrink:0}
@media(max-width:560px){.moneylabel{width:104px;font-size:13px}.moneyval{width:66px;font-size:13.5px}}
.trustbar{background:linear-gradient(90deg,${RIVER_DEEP},${RIVER})}
.trustbar-dot{opacity:.45;padding:0 2px}
details.faq{transition:border-color .2s ease, box-shadow .2s ease}
details.faq[open]{border-color:${RIVER_TINT};box-shadow:0 10px 30px rgba(17,17,17,.06)}
details.faq summary{cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:16px}
details.faq summary::-webkit-details-marker{display:none}
.faq-plus{flex-shrink:0;width:28px;height:28px;border-radius:14px;background:${RIVER_TINT};color:${RIVER};display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:600;transition:transform .25s ease}
details.faq[open] .faq-plus{transform:rotate(45deg)}
.faq-body{overflow:hidden;max-height:0;opacity:0;transition:max-height .3s ease,opacity .3s ease,margin .3s ease}
details.faq[open] .faq-body{max-height:360px;opacity:1;margin-top:12px}
.cmp{width:100%;border-collapse:separate;border-spacing:0;min-width:640px}
.cmp th,.cmp td{padding:16px 18px;text-align:left}
.cmp thead th{font-size:13px;font-weight:700;letter-spacing:.3px}
.cmp tbody tr td{border-top:1px solid ${LINE};font-size:14.5px}
.cmp .lekcol{background:${RIVER_TINT}}
.cmp .center{text-align:center}
.rowlabel{font-weight:500;color:${INK}}
.fixrow{display:grid;grid-template-columns:1fr 44px 1fr;align-items:center;gap:0;margin-bottom:18px}
.fixarrow{display:flex;align-items:center;justify-content:center;color:${RIVER};font-size:22px;font-weight:700}
.stickycta{display:none}
@media (max-width:760px){.fixrow{grid-template-columns:1fr;gap:12px;margin-bottom:22px}.fixarrow{transform:rotate(90deg);margin:0 auto}
  .stickycta{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:60;align-items:center;justify-content:space-between;gap:12px;background:var(--panel);border-top:1px solid ${LINE};padding:10px 16px calc(10px + env(safe-area-inset-bottom));box-shadow:0 -6px 24px rgba(0,0,0,.18)}
}
@media (max-width:880px){
  .hero-h1-size{font-size:40px}.h2{font-size:27px}
  .grid3{grid-template-columns:1fr}
  .grid4{grid-template-columns:1fr 1fr}
  .nav-inline{display:none}
  .nav-burger{display:inline-flex}
  .duo{grid-template-columns:1fr}
  .hero-grid{grid-template-columns:1fr;gap:30px}
  .hero-left{text-align:center}
  .hero-cta{justify-content:center}
  .stepper{grid-template-columns:1fr;gap:34px}.stepper-line{display:none}
  .timeline{grid-template-columns:1fr;gap:22px}.tl-line{display:none}
  .stats-grid{grid-template-columns:repeat(2,1fr)!important}
  .appdemo-grid{grid-template-columns:1fr;gap:30px}
}
`;

// Idempotent reveal + countup. Safe to run even if a global layout script also runs.
const REVEAL_JS = `
(function(){
  // Theme: follow the device's light/dark setting automatically, and keep in
  // step if the user changes it while the page is open. No manual toggle.
  try{
    var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme:dark)') : null;
    document.documentElement.setAttribute('data-theme', (mq && mq.matches) ? 'dark' : 'light');
    if(mq && mq.addEventListener){ mq.addEventListener('change', function(e){ document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light'); }); }
  }catch(e){}
  var setIcon = function(){ var b=document.getElementById('lekhio-theme'); if(b) b.textContent = document.documentElement.getAttribute('data-theme')==='dark' ? '☀️' : '🌙'; };
  var wireToggle = function(){
    var b=document.getElementById('lekhio-theme');
    if(b && !b.__wired){ b.__wired=true; b.addEventListener('click', function(){
      var d = document.documentElement.getAttribute('data-theme')==='dark';
      var n = d ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', n);
      try{ localStorage.setItem('lekhio-theme', n); }catch(e){}
      setIcon();
    }); }
    setIcon();
  };
  if (document.readyState !== 'loading') wireToggle(); else document.addEventListener('DOMContentLoaded', wireToggle);  var run = function(){
    var els = document.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window){
      var io = new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{threshold:.12,rootMargin:'0px 0px -40px 0px'});
      els.forEach(function(el){io.observe(el);});
    } else { els.forEach(function(el){el.classList.add('in');}); }
    document.querySelectorAll('.countup').forEach(function(el){
      var to = parseFloat(el.getAttribute('data-to')||'0'); var dec = (to % 1 !== 0) ? 2 : 0; var t0=null;
      var step=function(ts){ if(!t0)t0=ts; var p=Math.min(1,(ts-t0)/1100); el.textContent=(to*p).toFixed(dec); if(p<1)requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  };
  if (document.readyState !== 'loading') run(); else document.addEventListener('DOMContentLoaded', run);
})();
`;

export function SharedHead() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: SHARED_CSS }} />
      <noscript><style dangerouslySetInnerHTML={{ __html: `.reveal{opacity:1;transform:none}.cmsg{opacity:1 !important}` }} /></noscript>
      <style dangerouslySetInnerHTML={{ __html: A11Y_CSS }} />
      <ClientScript js={REVEAL_JS} />
    </>
  );
}

export function TrustBar() {
  return (
    <div className="trustbar">
      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '9px 24px', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 500, color: '#fff' }}>
        <span>Encrypted and never sold</span>
        <span className="trustbar-dot">·</span>
        <span>You approve everything</span>
        <span className="trustbar-dot">·</span>
        <span>🇬🇧 A real UK company, not HMRC</span>
      </div>
    </div>
  );
}

const NAV_LINKS: [string, string][] = [
  ['/product', 'Product'],
  ['/how-mtd-works', 'How MTD works'],
  ['/resources', 'Free tools'],
  ['/compare', 'Compare'],
  ['/pricing', 'Pricing'],
];

export function SiteNav() {
  return (
    <nav style={{ position: 'relative', maxWidth: 1320, margin: '0 auto', padding: '22px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <Link href="/" aria-label="Lekhio home" className="brandrow">
        <span className="logo-chip">L</span>
        <span className="logo-word">Lekhio</span>
      </Link>

      <input type="checkbox" id="navtoggle" className="nav-toggle" aria-label="Toggle menu" />

      <div className="nav-right">
        <div className="nav-inline">
          {NAV_LINKS.map(([href, label]) => (
            <Link key={href} href={href} className="navtop">{label}</Link>
          ))}
          <Link href="/start" className="btn-primary" style={{ backgroundColor: RIVER, color: '#fff', fontSize: 15, fontWeight: 600, padding: '10px 18px', borderRadius: 10 }}>Sign up now</Link>
        </div>
        {/* suppressHydrationWarning: the head script sets this button's icon from the
            OS theme before React hydrates, so dark mode visitors would otherwise get a
            React 418 text mismatch on every page. The icon is cosmetic, let it differ. */}
        <button id="lekhio-theme" className="theme-toggle" type="button" aria-label="Toggle dark mode" suppressHydrationWarning>🌙</button>
        <label htmlFor="navtoggle" className="nav-burger" aria-label="Open menu">Menu <span className="nav-burger-lines"><i /><i /><i /></span></label>
      </div>

      <div className="nav-panel">
        {NAV_LINKS.map(([href, label]) => (
          <Link key={href} href={href}>{label}</Link>
        ))}
        <Link href="/can-i-claim">Can I claim it?</Link>
        <Link href="/tax-calculator">Free tax calculator</Link>
        <Link href="/cis-calculator">CIS refund calculator</Link>
        <Link href="/invoice-generator">Invoice generator</Link>
        <Link href="/ni-checker">NI checker</Link>
        <Link href="/student-loan-checker">Student loan checker</Link>
        <Link href="/landlord-tax-calculator">Landlord tax calculator</Link>
        <Link href="/rent-a-room-checker">Rent a Room checker</Link>
        <Link href="/sole-trader-vs-limited">Sole trader vs limited</Link>
        <Link href="/security">Security and trust</Link>
        <Link href="/start" className="btn-primary" style={{ display: 'block', textAlign: 'center', backgroundColor: RIVER, color: '#fff', fontSize: 16, fontWeight: 600, padding: '14px 0', borderRadius: 12, marginTop: 16 }}>Sign up now</Link>
      </div>
    </nav>
  );
}

export function StickyCta() {
  return (
    <div className="stickycta">
      <span style={{ fontSize: 14, fontWeight: 700, color: INK }}>14 days free. No card.</span>
      <Link href="/start" className="btn-primary" style={{ backgroundColor: RIVER, color: '#fff', fontSize: 15, fontWeight: 700, padding: '11px 20px', borderRadius: 10 }}>Start free</Link>
    </div>
  );
}

export function SiteFooter() {
  const col = (title: string, links: [string, string][]) => (
    <div>
      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.4px', textTransform: 'uppercase', color: '#fff', marginBottom: 14 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {links.map(([href, label]) => (
          <Link key={href + label} href={href} style={{ fontSize: 14.5, color: '#B6BDC8' }}>{label}</Link>
        ))}
      </div>
    </div>
  );
  return (
    <footer style={{ background: INK_BG, color: '#fff' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '52px 24px 40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 32, marginBottom: 40 }}>
          {col('Product', [['/product', 'How it works'], ['/how-mtd-works', 'How MTD works'], ['/compare', 'Compare'], ['/pricing', 'Pricing'], ['/start', 'Sign up'], ['/account', 'Manage subscription']])}
          {col('Free tools', [['/tax-calculator', 'Tax calculator'], ['/cis-calculator', 'CIS refund calculator'], ['/landlord-tax-calculator', 'Landlord tax calculator'], ['/rent-a-room-checker', 'Rent a Room checker'], ['/sole-trader-vs-limited', 'Sole trader vs limited'], ['/invoice-generator', 'Invoice maker'], ['/ni-checker', 'NI checker'], ['/student-loan-checker', 'Student loan checker'], ['/can-i-claim', 'Can I claim it?'], ['/file-your-tax-return', 'File your return'], ['/resources', 'All tools']])}
          {col('For your trade', [...TRADES.slice(0, 5).map((t) => [`/for/${t.slug}`, `For ${t.plural}`] as [string, string]), ['/for-landlords', 'For landlords'] as [string, string]])}
          {/*
            The team door lives HERE now, in Company, not tucked in the copyright line.
            It was there, at 13px grey next to "© 2026 Lekhio", and Jag could not find it while
            LOOKING for it. That is not discretion, that is a bug. A door nobody can find is a
            wall.

            Safe in public: /team is a magic link to an address that must ALREADY be a row in
            team_members, and it answers identically whether or not the address exists, so a
            stranger cannot even use it to learn who works here. robots.ts disallows it too.
          */}
          {col('Company', [['/security', 'Security and trust'], ['/register-your-business', 'Register your business'], ['/privacy', 'Privacy'], ['/terms', 'Terms'], ['/team', 'Team sign in']])}
        </div>
        <div style={{ borderTop: '1px solid #2C2C2C', paddingTop: 24, display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13, color: '#8A93A0', maxWidth: 640, lineHeight: 1.6 }}>
            Lekhio prepares your figures and keeps you ready for Making Tax Digital. You approve everything before it reaches HMRC. HMRC keeps you responsible for your tax. We never imply HMRC backs us. Built in the UK.
          </div>
          {/* The team link used to be here, at 13px grey, and it was invisible. It lives in the
              Company column above now, where a person would actually look for it. */}
          <div style={{ fontSize: 13, color: '#8A93A0' }}>© 2026 Lekhio</div>
        </div>
      </div>
    </footer>
  );
}

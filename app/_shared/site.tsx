// Shared site chrome, tokens, content data, and helper components.
// Single source of truth so the lean homepage and every focused page
// (product, how-mtd-works, compare, pricing) look and behave identically.
// Server components only, no client boundary needed. The reveal + countup
// behaviour is injected as an idempotent inline script by <SharedHead />.
import Link from 'next/link';
import ClientScript from './ClientScript';
import { filingFaqAnswer, filingMark, bankMark, hmrcFilingLive, diaryRowLabel } from '../../lib/features';
import type { CSSProperties } from 'react';
import { TRADES } from '../../lib/trades';
import { A11Y_CSS, THEME_CSS, THEME_SWAP_JS, css } from '../../lib/tokens';
import { FACTS } from '../../lib/taxengine';

const ON_SAFFRON_TINT = 'var(--on-saffron-tint)';
const ON_GREEN_TINT = 'var(--on-green-tint)';

// Colours are CSS variables so the whole site themes light and dark from one place. The raw
// palette is lib/tokens.ts and arrives here as THEME_CSS, injected by SharedHead. Components keep
// using these same constant names, so nothing downstream has to change.
//
// ⚠️ lib/tokens.ts exports SOME OF THESE NAMES TOO, with raw hex values instead of var() calls.
// That is deliberate: app pages paint inline styles and stay light, marketing pages theme. Import
// colours from THIS file on any page that renders <SharedHead />, and from lib/tokens.ts on any
// page that does not. A var() on a page with no theme block resolves to nothing.
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
// 🔴 WHATSAPP AND ON_WHATSAPP USED TO BE EXPORTED FROM HERE AND ARE GONE. They existed for the
// hero's WhatsApp mock and for nothing else in this module; every app screen that puts a REAL
// WhatsApp button on screen (app/app/connect, the invoice page) imports them from lib/tokens.ts,
// which is where a brand colour belongs. Once the mock went they were two exported constants that
// nothing read, and doc 103 counts dead code as shipped weight rather than harmless.
// The ink that belongs ON each accent. Never plain white: the dark theme lifts every accent so it
// can be seen against a near black page, and white on those lifted colours drops to 2.4:1. See the
// long note in lib/tokens.ts. Use these anywhere an accent is a BACKGROUND.
export const ON_RIVER = 'var(--on-river)';
export const ON_GREEN = 'var(--on-green)';
export const ON_SAFFRON = 'var(--on-saffron)';
// A white card surface that becomes a dark panel in dark mode.
export const PANEL = 'var(--panel)';
// A deep contrast band (footer, feature-dark sections) in both themes.
export const INK_BG = 'var(--band)';
export const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
export const SITE = process.env.NEXT_PUBLIC_APP_URL || 'https://lekhio.app';

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
export const MARKETING_CSS = css`
/* 🔴 --on-teal-tint ADDED 5 AUGUST. The teal lives here rather than in the palette, and it had no
   ON pair, so /security painted --teal on --teal-tint at 3.69:1. Every other accent in this
   product has an ON token for exactly this; the teal was the one that did not. */
/* 🔴 AND THERE IS NO --shadow HERE, ON PURPOSE. Thirty one rules across this file and six pages
   said "box-shadow:var(--shadow)" and nothing anywhere declared it, so every one of them was
   (NO BACKTICKS IN HERE. The first draft of this note quoted that rule in backticks, which CLOSED
   this css template literal mid comment. test/tokens.test.mjs caught it in the same minute.)
   invalid and painted nothing. They were removed on 5 August rather than given a value, because
   the doctrine in lib/tokens.ts already decided this: "a shadow does not work in both, every
   shadow in this file is rgba(17,17,17,...) and vanishes on a dark panel. A hairline is identical
   in both. Any look whose weight sits in shadow is two designs pretending to be one." Declaring
   --shadow now would put a shadow on every marketing card that disappears in dark. The hairline
   border on each of those rules is what carries them, and it always was.
   ⚠️ NOTHING MOVED ON SCREEN. They were already painting nothing. What changed is that the file
   stopped claiming otherwise. test/tokens.test.mjs fails if a var() names a property nothing
   declares, which is how this was found at all. */
:root{--panel-2:var(--surface);--line:var(--bd);--teal:#0E8C6E;--teal-tint:#E2F4EF;--on-teal-tint:#0A6E56}
[data-theme="dark"]{--teal:#3FC7A3;--teal-tint:#0F2A22;--on-teal-tint:#3FC7A3}
.mkt .wrap{max-width:1180px;margin:0 auto;padding:0 24px}
.mkt .mut{color:var(--tx-mut)}
.mkt .center{text-align:center}
.mkt .center .lead{margin-inline:auto}
.mkt .lead{font-size:18px;color:var(--tx-mut);max-width:560px;margin-top:14px}
.mkt .eyebrow{font-size:13px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--river);margin-bottom:12px}
.mkt .h2{font-size:clamp(28px,4.4vw,44px);letter-spacing:-.035em;line-height:1.05;font-weight:800;margin:0}
.mkt section{padding:64px 0}
.mkt .pill{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:700;padding:7px 14px;border-radius:999px;background:var(--river-tint);color:var(--river-deep)}
/* The dot no longer pulses. The 5 August 2026 brand pass removed the AI tell animations: the
   gradient sheen, the squiggle, the pulsing dot, the floating phone and the review belt. The
   motion budget is the reveal fade and the hero report loop, nothing else. */
.mkt .dot{width:8px;height:8px;border-radius:999px;background:#22C55E}
/* Buttons wear the app shell's border weight (GLASS.border, 2px) and the two step radius: 12 for
   buttons, 16 for cards. Hover is a 1px lift and a border shift to the river, never a glow. */
.mkt .btn{display:inline-block;text-align:center;font-weight:700;font-size:16px;padding:15px 30px;border-radius:12px;cursor:pointer;border:2px solid transparent;font-family:inherit;transition:transform .18s,border-color .18s,background-color .18s}
.mkt .btn.primary{background:var(--river);color:var(--on-river);border-color:var(--river-deep)}
.mkt .btn.primary:hover{transform:translateY(-1px);border-color:var(--river)}
.mkt .btn.ghost{background:transparent;color:var(--tx);border-color:var(--tx)}
.mkt .btn.ghost:hover{transform:translateY(-1px);border-color:var(--river)}
.mkt .btn.white{background:#fff;color:var(--on-white-river)}
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
/* 40, not 56. Sixteen pixels came off every marketing hero on the site so the homepage's trial
   promise clears the fold on a 775px laptop. It is padding, not type, so nothing got smaller. */
.mkt .hero{padding:40px 0 26px}
.mkt .hero.center,.mkt section.center{text-align:center}
.hero .grid{display:grid;grid-template-columns:1.05fr .95fr;gap:54px;align-items:center}
.hero h1{font-size:clamp(40px,6.4vw,72px);letter-spacing:-.045em;line-height:1.05;font-weight:800;margin:8px 0 0}
/* .gt and .squig are gone. Gradient text with an animated underline is the costume every AI
   landing page wears, and doc 104 says we are an employee, not a launch. A heading carries
   itself in the ink it was set in. Pages that still write the class get plain text, on purpose. */
/* 🔴 margin-inline IS auto, AND IT USED TO BE 0. Found by Jag looking at /how-mtd-works on a
   laptop on 1 August 2026: the paragraph under a centred h1 sat visibly left of centre.
   This rule was written for the HOMEPAGE, whose hero is a two column grid with left aligned
   text, and 0 is right there. Every other hero on the site is centred, and they all inherit
   this, so four pages (/how-mtd-works, /compare, /pricing, /security) drew a 520px block
   pinned to the left of a wider container. It only looked right on a phone, because the
   media query below rescues it with margin-inline:auto under 900px.
   The default is now the common case. The homepage keeps its own copy of this rule with an
   explicit margin-inline:0 and says why, so it opts out on purpose rather than by cascade. */
.hero p.sub{font-size:20px;color:var(--tx-mut);max-width:520px;margin:22px auto 30px}
.cta-row{display:flex;gap:14px;flex-wrap:wrap}
/* ⚠️ THE HOMEPAGE'S TICK LIST INHERITS THIS, so it carries the list reset even though only the
   homepage renders a <ul> here today. sharedcss.test.mjs compares this rule against page.tsx's
   copy character for character, and it went red the moment they drifted, which is the only reason
   this one was not left behind. */
.hero .micro{display:flex;align-items:center;flex-wrap:wrap;gap:8px 18px;margin:16px 0 0;padding:0;list-style:none;font-size:13.5px;color:var(--tx-mut)}
.hero .micro li{display:flex;align-items:center;gap:6px}
.hero .micro .tick{color:var(--river);font-weight:800;font-size:12px;line-height:1}
.avs{display:flex}.avs span{width:30px;height:30px;border-radius:999px;border:2px solid var(--bg);margin-left:-8px}.avs span:first-child{margin-left:0}
@media(max-width:900px){.hero .grid{grid-template-columns:1fr;gap:34px;text-align:center}.cta-row,.hero .micro{justify-content:center}.hero p.sub{margin-inline:auto}}
.ba{display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:stretch}
@media(max-width:760px){.ba{grid-template-columns:1fr}}
.ba .old{background:var(--band);color:#fff;border-radius:16px;padding:30px}
.ba .new{background:linear-gradient(150deg,var(--river-panel),var(--river-panel-deep));color:#fff;border-radius:16px;padding:30px}
.ba h3{font-size:21px;margin:0 0 16px}
.ba li{list-style:none;display:flex;gap:11px;align-items:flex-start;padding:8px 0;font-size:15px}
.ba .m{flex:0 0 22px;height:22px;border-radius:999px;display:grid;place-items:center;font-size:12px;font-weight:900;margin-top:1px}
/* 🔴 THE CHECKMARK BADGE ON /product READ AS LOW AS 4.22:1, NOT FROM A NAMED TOKEN, FROM ITS OWN
   TRANSLUCENCY. .ba .new sits on a fixed river gradient (--river-panel to --river-panel-deep, the
   same non-theme-reactive fill .setaside and .ba .new use, so #fff text is correct on the gradient
   itself in both themes: 6.94:1 to 10.13:1, checked independently). But .m lays rgba(255,255,255,.16)
   over whichever part of that gradient it sits on, which LIGHTENS it, and near the lighter end
   (--river-panel, #1B59A6) the composited circle plus its own #fff checkmark lands at 4.22:1, under
   the 4.5:1 minimum. This is eight badges on the one live page that renders .ba .new (app/product),
   four per card. Nothing here is a shared token, so nothing else moves: the overlay itself is turned
   down from .22 to .16, which composites to 4.82:1 at that same worst case with room to spare, and
   is not a visible change to a highlight circle behind a tick. .ba .old .m is unreached by any live
   page (app/product used to draw an .old comparison card and no longer does) and was already fine
   at .25, left as is. */
.ba .old .m{background:rgba(224,121,107,.25);color:#ffb4a8}.ba .new .m{background:rgba(255,255,255,.16);color:#fff}
.ba ul{padding:0;margin:0}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:26px}
@media(max-width:760px){.steps{grid-template-columns:1fr;gap:30px}}
.hstep{text-align:center}.hstep h3{font-size:19px;margin:0 0 10px}
/* 🔴 WAS color:#fff HERE TOO, THE SAME BUG AS THE HOME_CSS COPY OF THIS RULE IN app/page.tsx, and
   test/sharedcss.test.mjs holds the two copies to matching text so fixing one and forgetting the
   other fails loudly. No page renders className="stepn" through this stylesheet (only the homepage
   uses the class, and it renders its own separate HOME_CSS, not this one), so this line paints
   nothing live either way. It is fixed to keep the two copies in agreement, per the rule this same
   test states: a second difference should make the copies agree, not grow the exception list. */
.stepn{width:62px;height:62px;border-radius:999px;margin:0 auto 18px;font-weight:900;font-size:23px;display:grid;place-items:center}
.numgrid{display:grid;grid-template-columns:.9fr 1.1fr;gap:48px;align-items:center}
@media(max-width:900px){.numgrid{grid-template-columns:1fr;gap:32px}}
.appmock{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px;max-width:360px;margin:0 auto;width:100%}
.setaside{background:linear-gradient(135deg,var(--river-panel),var(--river-panel-deep));border-radius:16px;padding:18px;color:#fff}
.setaside .l{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;opacity:.85}
.setaside .big{font-size:38px;font-weight:900;letter-spacing:-.03em;margin-top:2px;font-variant-numeric:tabular-nums}
.setaside .s{font-size:12px;opacity:.85}
.mini3{display:flex;gap:8px;margin:12px 0}.mini3 div{flex:1;border-radius:12px;padding:11px}
.mini3 .l{font-size:10px;font-weight:700}.mini3 .v{font-size:16px;font-weight:900;margin-top:3px;font-variant-numeric:tabular-nums}
.cisbar{background:var(--saffron-tint);border-radius:12px;padding:13px}
.cisbar .top{display:flex;justify-content:space-between;font-size:12px;font-weight:800;color:var(--on-saffron-tint)}
.track{height:9px;border-radius:999px;background:rgba(0,0,0,.08);margin-top:8px;overflow:hidden}
.fill{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--saffron),var(--green));width:0;transition:width 1.3s cubic-bezier(.2,.7,.3,1)}
.reveal.in .fill{width:68%}
.drow{display:grid;grid-template-columns:1fr 1fr;gap:44px;align-items:center;margin:0 0 44px}
.drow:last-of-type{margin-bottom:0}
.drow.flip .dtext{order:2}
@media(max-width:820px){.drow{grid-template-columns:1fr;gap:22px}.drow.flip .dtext{order:0}}
.dtext h3{font-size:26px;letter-spacing:-.03em;margin:0 0 12px}.dtext p{font-size:16px;color:var(--tx-mut)}
.dvis{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px;min-height:186px;display:flex;flex-direction:column;justify-content:center;gap:9px}
.dbub{max-width:82%;padding:9px 13px;font-size:13.5px;border-radius:12px}
/* 🔴 THE OUTGOING BUBBLE WAS WHATSAPP'S OWN #DCF8C6, AND SO WAS THE RECEIPT CHIP.
   Found by the hero guard sweeping for that palette, not by reading. The ILLUSTRATION is fine and
   stays: a man says what he spent and it comes back logged, which is the outcome and it is real.
   Borrowing Meta's brand colours to draw it is the technology, and doc 104 sells the outcome.
   Tokens also delete the dark override underneath, which existed only to undo the borrowed green. */
.dbub.out{align-self:flex-end;background:var(--river-tint);color:var(--river-deep);border-bottom-right-radius:4px}
.dbub.in{align-self:flex-start;background:var(--panel-2);border-bottom-left-radius:4px}
.dbub .rc{background:var(--surface);border:1px solid var(--bd);border-radius:8px;padding:12px;text-align:center;font-size:20px;margin-bottom:5px}
.wf{display:flex;align-items:flex-end;gap:3px;height:30px;padding:2px 0}.wf i{width:4px;border-radius:2px;background:var(--river)}
.splitrow{display:flex;justify-content:space-between;padding:9px 2px;border-bottom:1px solid var(--line);font-size:14px;font-variant-numeric:tabular-nums}
.splitrow:last-child{border:0;font-weight:800}
.approvebtn{margin-top:4px;background:var(--green);color:var(--on-green);border-radius:12px;padding:11px;font-weight:800;text-align:center;font-size:14px}
.diconrow{display:flex;align-items:center;gap:12px}
.dicon{width:44px;height:44px;border-radius:999px;background:var(--river);color:var(--on-river);font-size:20px;display:grid;place-items:center}
/* The review belt, back by the founder's call now six real quotes clog the static grid. Four or
   more quotes loop slowly leftward, pausing on hover; the second copy of the run is aria-hidden
   so a screen reader hears each quote once, and reduced motion swaps the loop for a plain
   scrollable row with the duplicate hidden. Under four the static row still renders each card
   exactly once. Byte identical with HOME_CSS in app/page.tsx; test/sharedcss.test.mjs holds the
   two copies together. */
.rev-marquee{overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent);mask-image:linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent)}
.rev-track{display:flex;gap:18px;width:max-content;animation:hslide 40s linear infinite}
.rev-marquee:hover .rev-track{animation-play-state:paused}
@keyframes hslide{to{transform:translateX(-50%)}}
@media (prefers-reduced-motion: reduce){.rev-marquee{overflow-x:auto;-webkit-mask-image:none;mask-image:none}.rev-track{animation:none;padding:0 22px}.rev-track .quote[aria-hidden="true"]{display:none}}
.rev-static{display:flex;flex-wrap:wrap;justify-content:center;gap:18px;padding:0 22px}
.rev-static .quote{width:min(360px,100%)}
.quote{width:360px;flex:0 0 auto;background:var(--panel);border:2px solid var(--line);border-radius:16px;padding:26px}
.rate{display:flex;gap:3px;margin-bottom:12px}
.rate svg{width:15px;height:15px;display:block}
.quote p{font-size:16px;margin:0 0 18px}
.who{display:flex;align-items:center;gap:12px}
.who .a{width:42px;height:42px;border-radius:999px;display:grid;place-items:center;font-weight:800;font-size:16px}
.who b{font-size:14.5px;display:block}.who small{font-size:13px;color:var(--tx-mut)}
.pricewrap{background:linear-gradient(180deg,var(--panel-2),var(--bg));border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.prices{display:grid;grid-template-columns:1fr 1fr;gap:22px;max-width:800px;margin:0 auto;align-items:stretch}
@media(max-width:760px){.prices{grid-template-columns:1fr}}
.pcard{background:var(--panel);border:2px solid var(--line);border-radius:16px;padding:32px 30px;position:relative;display:flex;flex-direction:column;transition:transform .18s,border-color .18s}
.pcard:hover{transform:translateY(-1px);border-color:var(--river)}
.pcard.best{border-color:var(--river);overflow:hidden;background:linear-gradient(180deg,var(--river-tint),var(--panel))}
.pcard.best::before{content:"";position:absolute;top:0;left:0;right:0;height:5px;background:linear-gradient(90deg,var(--river),var(--saffron))}
.pbadge{position:absolute;top:16px;right:16px;background:var(--saffron);color:#3a2a08;font-size:12px;font-weight:900;padding:5px 13px;border-radius:999px;white-space:nowrap}
.pname{font-size:13px;font-weight:800;color:var(--tx-mut);text-transform:uppercase;letter-spacing:.06em}
.pamt{font-size:52px;font-weight:900;letter-spacing:-.04em;margin:10px 0 2px;line-height:1;font-variant-numeric:tabular-nums}
.pamt span{font-size:18px;font-weight:700;color:var(--tx-mut);letter-spacing:0}
.pnote{font-size:13.5px;color:var(--tx-mut);margin:6px 0 0}
.psave{display:inline-block;font-size:12.5px;font-weight:800;color:var(--on-green-tint);background:var(--green-tint);padding:5px 12px;border-radius:999px;margin-top:14px}
.pcta{margin-top:auto;padding-top:24px}.pcta .btn{width:100%}
.pmicro{font-size:12px;color:var(--tx-mut);text-align:center;margin-top:10px}
.incl-panel{max-width:800px;margin:24px auto 0;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:26px 30px}
.incl-panel h4{font-size:14px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--tx-mut);text-align:center;margin:0 0 20px}
.incl-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px 30px;margin:0;padding:0}
@media(max-width:640px){.incl-grid{grid-template-columns:1fr}}
.incl-grid li{list-style:none;display:flex;gap:12px;align-items:center;font-size:14.5px;font-weight:600}
.incl-grid .t{flex:0 0 24px;height:24px;border-radius:999px;background:var(--green-tint);color:var(--on-green-tint);display:grid;place-items:center;font-weight:900;font-size:12px}
.final{background:linear-gradient(135deg,var(--river-panel),var(--river-panel-deep));border-radius:16px;padding:56px 32px;text-align:center;color:#fff}
.final h2{font-size:clamp(28px,4.4vw,44px);color:#fff;margin:0}
.final p{color:rgba(255,255,255,.86);font-size:18px;margin:14px auto 26px;max-width:460px}
/* feature grid, for pages that list many features */
.fgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
@media(max-width:900px){.fgrid{grid-template-columns:1fr}}
.fcard{background:var(--panel);border:2px solid var(--line);border-radius:16px;padding:24px;transition:transform .18s,border-color .18s}
.fcard:hover{transform:translateY(-1px);border-color:var(--river)}
.fcard .fi{width:50px;height:50px;border-radius:14px;display:grid;place-items:center;font-size:24px;margin-bottom:14px;color:#fff}
.fcard h3{font-size:17px;margin:0 0 8px}
.fcard p{font-size:14.5px;color:var(--tx-mut);margin:0}
.fixgrid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:760px){.fixgrid{grid-template-columns:1fr}}
.fixcard{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px}
.fixcard .g{font-size:14.5px;font-style:italic;color:var(--tx-mut);margin:0 0 14px;padding-left:12px;border-left:3px solid var(--red)}
.fixcard .f{font-size:14.5px;font-weight:600;padding-left:12px;border-left:3px solid var(--green)}
.soongrid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
@media(max-width:900px){.soongrid{grid-template-columns:1fr 1fr}}
@media(max-width:560px){.soongrid{grid-template-columns:1fr}}
.sooncard{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:22px;position:relative}
.sooncard .se{font-size:26px;margin-bottom:10px}
.sooncard h3{font-size:16px;margin:0 0 8px}
.sooncard p{font-size:13.5px;color:var(--tx-mut);margin:0 0 12px}
.sooncard .badge{font-size:10.5px;font-weight:900;letter-spacing:.05em;color:var(--on-saffron-tint);background:var(--saffron-tint);padding:4px 9px;border-radius:999px}
.claims{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
@media(max-width:760px){.claims{grid-template-columns:1fr 1fr}}
.claim{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:18px;text-align:center}
/* Same borrowed palette, same fix. See the note on .dbub.out above. */
.claim .q{display:inline-block;background:var(--river-tint);color:var(--river-deep);border-radius:12px 12px 4px 12px;padding:9px 13px;font-size:13.5px;font-weight:600}
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
/* ── The phone pass, 5 August 2026. Jag: people do not want to spend time reading, they want to
   look at things. Under 640px the page flows card to card: sections close up, the leads drop a
   size, and under 480px every h2 lands as a punch rather than a wall. These rules live twice,
   here and in HOME_CSS, byte identical apart from the scope; test/sharedcss.test.mjs holds the
   two copies together. */
@media(max-width:640px){
.mkt section{padding:38px 0}
.mkt .hero{padding:34px 0 12px}
.mkt .lead{font-size:16px}
.hero p.sub{font-size:17px}
.dtext h3{font-size:21px}
.dtext p{font-size:15px}
.quote{padding:20px}
.final{padding:40px 20px}
.drow{gap:16px;margin:0 0 30px}
.steps{gap:22px}
}
@media(max-width:480px){
.mkt .h2{font-size:24px;line-height:1.15;letter-spacing:-.025em}
.hero h1{font-size:clamp(34px,9.6vw,40px)}
.final h2{font-size:24px}
.pamt{font-size:44px}
}
`;

// ---------- content data ----------
// 🔴 STEP ONE IS SOMETHING HE CAN DO ON DAY ONE, AND IT USED TO BE "Connect your bank".
// The bank feed has no provider (TrueLayer declined production authorisation, see lib/bankfeed.ts),
// so step one was an instruction nobody could follow. All three of these work from signup.
export const steps = [
  { n: '1', title: 'Snap it, say it, or import it', body: 'A photo of a receipt, a line of plain words, or a statement exported straight from your bank. Every route works from the day you sign up.' },
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

// 🔴 NEITHER features NOR mtdMeans BELOW IS IMPORTED ANYWHERE. Checked across the whole tree: no
// page reads either export, so nothing today renders the fg: SAFFRON_DEEP / fg: GREEN pairs this
// comment used to sit above. Fixed anyway, to the same ON_SAFFRON_TINT / ON_GREEN_TINT tokens used
// two screens up in Mark(), because dead code that still fails AA is a landmine for whoever wires
// this back up, and the fix costs one identifier per row.
export const features = [
  { icon: '📸', title: 'Receipt capture', body: 'Photograph a receipt and it is logged in seconds. No typing, no app to open.', tint: RIVER_TINT, fg: RIVER },
  { icon: '🎙️', title: 'Voice notes', body: 'Hands full on the job. Say the expense out loud and carry on.', tint: SAFFRON_TINT, fg: ON_SAFFRON_TINT },
  { icon: '🚗', title: 'Mileage in a text', body: 'Text "drove 24 miles to the job" and Lekhio logs the claim at the HMRC rate. No fiddly logbook.', tint: RIVER_TINT, fg: RIVER },
  { icon: '🧾', title: 'Invoices in a minute', body: 'Say who it is for and what it is for. Lekhio asks what it needs and sends a clean invoice, with a pay button on it.', tint: GREEN_TINT, fg: ON_GREEN_TINT },
  { icon: '👷', title: 'CIS done right', body: 'Subcontractor? Lekhio splits labour and materials, applies your CIS deduction, and tracks the refund building up. Other apps charge extra or get it wrong.', tint: SAFFRON_TINT, fg: ON_SAFFRON_TINT },
  { icon: '✅', title: 'You approve everything', body: 'See every entry. Fix anything that looks off. Nothing counts toward your tax until you confirm it.', tint: RIVER_TINT, fg: RIVER },
  { icon: '📊', title: 'Tax prepared for you', body: 'Quarterly figures, ready. You check them, you send them. We never imply HMRC backs us.', tint: SAFFRON_TINT, fg: ON_SAFFRON_TINT },
  { icon: '💡', title: 'Can I claim it?', body: 'Not sure if something counts? Text "can I claim my work boots?" and Lekhio answers straight, the grey areas included.', tint: RIVER_TINT, fg: RIVER },
  { icon: '💬', title: 'Ask it anything', body: 'Stuck on something? Ask Lekhio and get a straight answer about your own figures. No hold music, no queue.', tint: GREEN_TINT, fg: ON_GREEN_TINT },
];

export const mtdMeans = [
  { icon: '🗂️', title: 'Keep digital records', body: 'HMRC wants your income and costs kept digitally. Lekhio logs every receipt and payment as you go, so this is already done.', tint: RIVER_TINT, fg: RIVER },
  { icon: '📨', title: 'Send four short updates', body: 'Instead of one big return in January, you send four quick summaries across the year. Lekhio prepares each one for you.', tint: SAFFRON_TINT, fg: ON_SAFFRON_TINT },
  { icon: '🤝', title: 'You stay in control', body: 'Nothing goes to HMRC until you say yes. HMRC keeps you responsible for your tax. Lekhio just keeps you ready for it.', tint: GREEN_TINT, fg: ON_GREEN_TINT },
];

export const compareRows = [
  { label: 'Works in your browser, nothing to install', lekhio: true, apps: false, diy: false },
  { label: 'Snap a receipt and it is fully logged, not just matched', lekhio: true, apps: 'limit', diy: false },
  { label: 'Log an expense by voice note', lekhio: true, apps: false, diy: false },
  { label: 'Claim mileage, home, phone and CIS from a text', lekhio: true, apps: false, diy: false },
  // The second of the three routes money gets in by, added here on 17 August 2026 in step with
  // app/compare/page.tsx, which is the copy of this table anybody actually reads.
  { label: 'Import a bank statement, no connection needed', lekhio: true, apps: true, diy: false },
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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THIS HELD SIX INVENTED CUSTOMERS, WITH NAMES, TRADES, TOWNS AND FIVE STARS EACH.
//
// "Jas, Electrician, Birmingham." "Sophie, Mobile hairdresser, Leeds." Nobody said any of it. They
// ran in an auto scrolling marquee on the front door with a five pointed rating on every card, and
// the only hedge was "Illustrative examples, based on real self employed people" at 13px in grey.
//
// ⚠️ AND THE PRODUCT ALREADY SAID, IN WRITING, THAT IT DID NOT DO THIS. app/llms.txt publishes
// "Lekhio does not publish invented testimonials or user numbers" to every assistant that reads it.
// Two answers to one question, and the one a customer saw was the false one.
//
// 🔴 WHY IT COULD NOT STAY, WHATEVER THE SMALL PRINT SAID.
//
//   CAP 3.47  hold documentary evidence that a testimonial is genuine, "unless it is obviously
//             fictitious", and hold contact details for the person who gave it.
//   CAP 3.50  never feature a testimonial without permission.
//
// A plausible named tradesman with a star rating is not obviously fictitious. That is the entire
// reason somebody writes one. And there was no permission to hold, because there was no person.
// Fake consumer reviews are separately a banned practice under the DMCC Act 2024, Schedule 20
// paragraph 13, in force 6 April 2025.
//
// ⚠️ THE ARRAY STAYS, EMPTY, AND THAT IS THE POINT. The section on app/page.tsx renders nothing
// while it is empty, so the front door simply does not have that block today. The moment there is
// ONE real quote it goes in here and the section comes back on its own, with no page to rebuild
// and nothing to remember. What may go in:
//
//   1. a real customer said it, in their own words,
//   2. we hold it in writing, with a way to contact them, and
//   3. they have agreed to it being printed with the name shown.
//
// All three, or it does not go in. test/frontdoor.test.mjs holds this and names the six that were
// here, so they cannot come back by a copy and paste.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
export interface Review {
  quote: string;
  name: string;
  trade: string;
  rating: number;
  tint: string;
  fg: string;
}

// ⚠️ NO REVIEW TEXT LIVES HERE ANY MORE, AND THAT IS THE WHOLE POINT.
//
// This array used to be the only home a testimonial had, kept empty by a comment and a test. As of
// 5 August 2026 the front door reads published reviews from the database (readPublishedTestimonials
// in lib/supabase.ts), and the ONLY way one gets in is the founder typing it on the auth gated /team
// desk, which stamps who added it. A quote nobody said cannot reach the code, because the code no
// longer holds quotes. The export stays, empty, as the type witness and so nothing that once
// imported it breaks; the homepage no longer reads it.
export const reviews: Review[] = [];

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
  // 🔴 THE BANK CONNECTION CAME OUT OF THIS LIST ON 17 AUGUST 2026, AND NOT BECAUSE IT WAS DROPPED.
  // This export is named comingSoon, so anything in it is sold as imminent by the list it sits in
  // rather than by its own words. TrueLayer declined production authorisation on 30 July 2026
  // because they are scaling and are not taking on small businesses, and no other provider is
  // engaged, so there is no date to be imminent about. A connection is PLANNED and it is told as
  // one of three routes in, on /product, where the other two are told beside it. See docs/120.
  { icon: '🧑‍💼', title: 'A real accountant, on tap', body: 'For the tricky bits, a qualified accountant inside Lekhio. No leaving for help, ever.' },
];

// 🔴 AND EIGHT INVENTED ONE AND TWO STAR REVIEWS OF OTHER PEOPLE'S APPS WENT WITH THEM.
//
// "A sole trader, reviewing another app: tried for two days to reach a human." Nobody said that
// either. Inventing praise for yourself is one thing; inventing complaints about a named
// competitor's product is a second thing on top of it, and this export had NO caller at all, so it
// was pure risk with not one byte of benefit. The gripes are gone. Nothing referenced them.
//
// ⚠️ THE FIXES THEMSELVES ARE NOT LOST. Every claim worth making from that list is already made,
// in our own voice, where it belongs: the flat price and the receipt limits on /pricing, the plain
// English promise on /product, "we never hold your money" on /security, and the one tap cancel on
// /app/you/billing. A true claim does not need a fictional person to say it.

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
  { href: '/how-mtd-works', icon: '📅', title: 'MTD checker', body: 'Which line your income sits above, when it starts, and the return HMRC actually tests. No signup.' },
  { href: '/free-mtd-filing', icon: '🆓', title: 'Free MTD filing', body: 'A straightforward return, prepared and filed free, forever. Join the list to be first.' },
];

// 🔴 RENAMED FROM oldAccountant AND REWRITTEN, 3 AUGUST 2026, ON JAG'S STEER: do not pick a fight
// with accountants. They are a referral channel and a future partner, and a product that shames
// them on price invites trouble from people well placed to cause it for a tax product.
//
// ⚠️ EVERY PAIN SURVIVES, BECAUSE EVERY PAIN IS REAL. The shoebox, the jargon, the wait, finding
// out too late. What went is the profession as the villain and the price tag on their work. The
// name went with it: a constant called oldAccountant is a reminder of who we were arguing with,
// and the next person to write copy from it would have written the argument again.
export const oldWay = [
  'A bill you only find out about in January.',
  'Looking at last year, when it is too late to plan.',
  'A shoebox of receipts to dig out every January.',
  'Jargon and forms you do not follow.',
  'Waiting days, sometimes weeks, for a simple answer.',
];

export const lekhioWay = [
  'One flat £12.99 a month, with everything in.',
  'With you every day, not once a year.',
  'Snap each receipt as you go. Nothing to dig out.',
  'Plain English, always. Ask it anything.',
  'Instant replies, right in the same chat.',
];

export const moneyFlow = [
  { label: 'Money in', pct: '100%', color: ON_GREEN_TINT, val: '£1,000' },
  { label: 'Costs you claim', pct: '22%', color: SAFFRON, val: '£220' },
  { label: 'Tax to set aside', pct: '18%', color: RED_INK, val: '£180' },
  { label: 'In your pocket', pct: '60%', color: RIVER, val: '£600' },
];

export const included = [
  'Unlimited receipt, voice, text, and mileage capture',
  'Automatic bookkeeping and categories',
  'Invoices created, sent and paid online',
  'MTD ready quarterly summaries, you approve before anything is filed',
  'Instant replies in the same chat',
  'Records exported any time, and cancel in one tap',
];

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE COMPANY PARTICULARS. NOT DECORATION. A STATUTORY DISCLOSURE THAT WAS MISSING.
//
// The Company, Limited Liability Partnership and Business (Names and Trading Disclosures)
// Regulations 2015, SI 2015/17:
//
//   reg 24(2)  "Every company shall disclose its registered name on its websites."
//   reg 25     and on its websites also: the part of the United Kingdom in which the company is
//              registered, the company's registered number, and the address of its registered
//              office.
//   reg 28     failure without reasonable excuse is an offence committed by the company AND by
//              every officer of it who is in default. Level 3 fine, plus a daily default fine for
//              as long as it continues.
//
// 🔴 THE FOOTER SAID "© 2026 Lekhio" AND NOTHING ELSE. Not the registered name, not the number,
// not the jurisdiction, not the office. LEKHIO LTD was incorporated on 8 July 2026, so the duty had
// been live for four weeks on a site that takes card payments and is indexed.
//
// ⚠️ AND IT WAS ALREADY WRITTEN DOWN AS A THING TO DO. docs/81 logged the footer for reconciliation
// "when the company is incorporated". That condition was met and the note went stale instead of
// being actioned, which is the failure mode a to-do list has and a test does not. Hence
// test/frontdoor.test.mjs now holds the footer to all four particulars.
//
// ⚠️ VERIFIED AGAINST THE REGISTER ON 3 AUGUST 2026, never typed from memory:
// find-and-update.company-information.service.gov.uk/company/17329341
//
// ⚠️ IF THE REGISTERED OFFICE MOVES, THIS MOVES THE SAME DAY. A stale statutory disclosure is the
// same offence as a missing one, and this is the only place it is written.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const COMPANY = {
  name: 'Lekhio Ltd',
  number: '17329341',
  jurisdiction: 'England and Wales',
  office: '52 Harrington Road, London, E11 4QW',
} as const;

export const replaces = [
  { icon: '📒', label: 'Bookkeeping app', cost: '£10 to £20' },
  { icon: '🧾', label: 'Invoicing tool', cost: '£10 to £25' },
  // See diaryRowLabel() in lib/features.ts: the reminders half is not live and this table says
  // "All of it, in Lekhio" underneath itself.
  { icon: '🗓️', label: diaryRowLabel(), cost: '£5 to £15' },
  { icon: '🧮', label: 'Tax software', cost: '£10 to £20' },
  { icon: '🚗', label: 'Mileage tracker', cost: '£5 to £10' },
  { icon: '🧑‍💼', label: 'Accountant fees', cost: '£20 to £60' },
];

export const faqs = [
  // ⚠️ THESE TWO ARE EMITTED AS FAQPage JSON-LD ON BOTH / AND /pricing, so they feed Google rich
  // results. They also used to tell a limited company director two things that are not true of him:
  // that Lekhio is only for the self employed (a director is not self employed, and /start sells to
  // him by name), and that MTD for Income Tax is his rule (it is not: a company files corporation
  // tax and company accounts). Both now branch.
  { q: 'Do I have to be a tradesperson?', a: 'No. Lekhio is for anyone running their own business or letting property in the UK: sole traders, partnerships, limited company directors and landlords. A barber, a driver, a tutor, a freelancer, a plumber. If you keep receipts or send invoices, it is for you.' },
  { q: 'What is Making Tax Digital?', a: 'From April 2026, sole traders and landlords with gross qualifying income over £50,000 keep digital records and send HMRC a short update each quarter instead of one big return. The threshold drops to £30,000 in April 2027 and £20,000 in April 2028. Making Tax Digital for Income Tax does not apply to a limited company: a company has corporation tax and company accounts instead. Lekhio keeps the records either way, as you work.' },
  { q: 'Does this mean paying tax four times a year?', a: 'No, that is a common myth. You send four short updates a year, but you still pay your tax on the normal dates.' },
  { q: 'Does Lekhio file my tax for me?', a: filingFaqAnswer() },
  { q: 'What if a receipt is read wrong?', a: 'You see every entry and can fix the amount, the shop, or the category in a tap. Nothing counts until you confirm it.' },
  { q: 'Is my financial data safe?', a: 'Yes. Your data is encrypted in transit and at rest, you can only ever see your own records, and you can export or delete everything whenever you want.' },
];

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE HERO. IT WAS AN ANIMATED WHATSAPP CONVERSATION, AND THAT SOLD THE CHANNEL AS THE PRODUCT.
//
// The first thing a visitor saw was a phone with WhatsApp's own green header, WhatsApp's own bubble
// colours and the word "online". Doc 104: "Lekhio is not software you buy. It is the first employee
// a business ever hires", and section 3, "sell the outcome, never the technology". A picture of the
// messaging app we happen to use is the technology, drawn 320 pixels wide, above the fold, on the
// one page everybody sees. The headline beside it had already said "Your first employee" for weeks.
// The picture had not caught up, and a picture argues louder than a headline.
//
// So the hero is now what an employee actually hands you: a report of the month, and one button.
// That is doc 104's line made visible, "one less button at a time, until only one is left, approve",
// which is otherwise a sentence we say about ourselves and never show.
//
// ⚠️ THE FIGURES ARE THE ONES THE OLD CHAT ALREADY USED, deliberately. Changing the picture is not a
// licence to invent a bigger number, and doc 108's rule stands: NEVER price on the saving.
//
// ⚠️ AND IT SAYS IT IS AN EXAMPLE, ON THE CARD, not in a footnote elsewhere on the page. A panel of
// specific pounds with no owner reads as somebody's real month, and "is it true" is doc 104's fifth
// standing question. The line costs one row and it is the difference between an illustration and an
// implied promise.
//
// ⚠️ WHATSAPP IS NOT DELETED FROM THE SITE, it is demoted from the hero. It is still how a man sends
// a receipt and it is still named in the copy below. It is a door, not the house.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 IT DOES NOT LIST WHAT AN EMPLOYEE DID. IT SHOWS ONE DOING IT. Jag, 3 August 2026: "can we make
// the animation in the hero section look and feel more like an employee and act like an employee
// that costs 12.99 a month as opposed to hundreds or even thousands."
//
// The first version was already the right CONTENT, and it was still a list of facts fading in. An
// employee is not a list of facts, it is somebody getting on with it while you are somewhere else.
// So every line arrives as work IN HAND and resolves to work DONE, one after another, and the last
// line of the report is what the whole shift cost you.
//
// ⚠️ THE COST ROW IS THE ARGUMENT AND IT ASSERTS NOTHING. Three rows of what was done, then one row
// of what it cost, in the same shape. The reader does the comparison, we never make it, so nobody
// is named and no competitor's price is printed as fact on our front door. Doc 108 also stands:
// NEVER price on the saving, so the cost sits against the WORK, never against the £1,390.
export const heroWork: { doing: string; label: string; value: string }[] = [
  { doing: 'Reading your statement', label: 'Payments sorted', value: '62' },
  { doing: 'Checking what you can claim', label: 'Reliefs found', value: '£1,390' },
  { doing: 'Working out your tax', label: 'Put by for tax', value: '£3,240' },
];
export const heroSpot = {
  head: 'One thing worth a look',
  body: 'Your CIS refund is running at £1,120. That is your money, sitting with HMRC.',
};
export const heroCost = { label: 'What it cost you', value: '£12.99' };
// ⚠️ TIMED BY WATCHING IT, NOT BY GUESSING. The first pass ran an 11s loop with 8% of work in hand
// per row, which is under a second: every line was already finished before a human could read that
// it was happening, so it was a list fading in again, exactly the thing this replaced. And the gap
// between the last row landing and the flagged item arriving left a large empty panel that reads as
// a broken card rather than as a pause.
//
// Now: about 1.3s of visible work per line, the whole shift done inside six seconds, and the
// finished report held for seven, which is the state most visitors will actually see.
// 🔴 ONLY THE WORK ANIMATES. THE ARGUMENT IS ALWAYS ON SCREEN.
// The second pass revealed the flagged item, the cost line and the Approve button on the same
// stagger as the rows, and watching it showed what that costs: the card sat half empty for six
// seconds out of every fourteen, and the six seconds it hid were the cost line and the button,
// which are the entire point of the panel. A visitor who glances once has a better than even
// chance of glancing then. So the report below the rows is STATIC and always complete, and the
// only thing that moves is the employee working through the list.
const HERO_LOOP = 14;
// Row i starts at rowAppear[i], as a percentage of the loop. WORK_FOR is how long each line is
// visibly in hand before it lands: about 1.3 seconds, which is long enough to read.
const rowAppear = [2, 14, 26];
const WORK_FOR = 9;
export const reportCss =
  // ⚠️ THE FINISHED STATE IS THE BASE STATE. The done label and value are visible with no animation
  // at all and the "in hand" line is the thing that has to be animated IN, so a browser that runs
  // no animations shows a complete, readable report rather than an empty card.
  `.hrow{opacity:0}.hr-doing{opacity:0}` +
  `@media (prefers-reduced-motion: reduce){.hrow{opacity:1 !important}.hr-doing{display:none !important}` +
  `.hrow,.hr-doing,.hr-done{animation:none !important;transform:none !important}}` +
  rowAppear
    .map((a, i) => {
      const done = a + WORK_FOR;
      return (
        `@keyframes hrow${i}{0%,${a}%{opacity:0;transform:translateY(8px)}${a + 3}%,94%{opacity:1;transform:none}98%,100%{opacity:0}}`
        + `.hrow${i}{animation:hrow${i} ${HERO_LOOP}s infinite}`
        // the line of work in hand: in as the row arrives, out as it lands
        + `@keyframes hdoing${i}{0%,${a}%{opacity:0}${a + 3}%,${done - 2}%{opacity:1}${done}%,100%{opacity:0}}`
        + `.hdoing${i}{animation:hdoing${i} ${HERO_LOOP}s infinite}`
        // and the result, which only exists once the work is finished
        + `@keyframes hdone${i}{0%,${done}%{opacity:0}${done + 2}%,94%{opacity:1}98%,100%{opacity:0}}`
        + `.hdone${i}{animation:hdone${i} ${HERO_LOOP}s infinite}`
      );
    })
    .join('');

// ---------- helper components ----------
// 🔴 Stars() AND ReviewCard() WERE DELETED WITH THE INVENTED CUSTOMERS THEY DREW.
// Both were already dead exports: nothing outside this file imported either, because app/page.tsx
// drew its own markup. A component whose only job is to put five stars on a quote is a loaded gun
// left on the table next to an empty reviews array. When there are real quotes, the section on
// app/page.tsx renders them, and a rating only goes back on the page if a customer actually gave
// one and we hold it in writing.

// 🔴 NOT IMPORTED ANYWHERE: /compare defines and uses its own Mark instead (app/compare/page.tsx
// .mk/.mk.yes/.mk.no). Fixed anyway, same reason as features and mtdMeans above: the false branch
// painted two literal hexes, '#F3F1EC' and '#B8B2A6', which is both a contrast fail (1.87:1) and a
// colour that cannot invert. SURFACE and MUTED are the tokens the equivalent live mark on /compare
// now uses for the same "not available" grey (5.26:1 light, 6.31:1 dark), so this matches it.
export function Mark({ value }: { value: boolean | string }) {
  if (value === true) {
    return <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 13, backgroundColor: GREEN_TINT, color: ON_GREEN_TINT, fontSize: 14, fontWeight: 800 }}>✓</span>;
  }
  if (value === false) {
    return <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 13, backgroundColor: SURFACE, color: MUTED, fontSize: 14, fontWeight: 700 }}>✕</span>;
  }
  if (value === 'soon') {
    return <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.3px', color: ON_SAFFRON_TINT, background: SAFFRON_TINT, padding: '4px 9px', borderRadius: 12 }}>Soon</span>;
  }
  // 'planned' joined CompareMark on 17 August 2026 and this renderer is dead, so it would have
  // painted the raw word through the ?? fallback rather than failing. A label, not a chip, for the
  // reason lib/features.ts bankMark() gives: a chip beside a competitor's tick asserts a date.
  const labels: Record<string, string> = { planned: 'Planned', limit: 'Up to a limit', extra: 'Costs extra', higher: 'Higher tiers', maybe: 'If you pay' };
  return <span style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>{labels[value] ?? String(value)}</span>;
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

// 🔴 NOT IMPORTED ANYWHERE, fixed anyway, same reason as features, mtdMeans and Mark above. The
// current quarter circle painted a literal '#fff' behind its RIVER ring. In light mode that reads
// the same as PANEL, which is exactly '#FFFFFF', so it looked correct and nobody caught it. In dark
// mode PANEL flips to near black and RIVER lifts to stay visible on it; the literal stayed white and
// sat there with RIVER text at 3.36:1, under the 4.5:1 minimum. PANEL/RIVER is already a proven pair
// in both themes (see panel-river in lib/tokens.ts ON_PAIRS), so this only had to stop being a
// literal. Same rule the comment fifty lines down this file already states: never pair an accent
// with a literal white, the token already knows which ink each theme needs.
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
              <div style={{ width: 26, height: 26, borderRadius: 13, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, background: i === 1 ? PANEL : i < 1 ? RIVER_TINT : SURFACE, border: i === 1 ? `2px solid ${RIVER}` : '2px solid transparent', color: i <= 1 ? RIVER : MUTED }}>{q}</div>
              <div style={{ fontSize: 9, color: i === 1 ? INK : MUTED, marginTop: 4, fontWeight: 600 }}>Q{q}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 12, background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: '13px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: MUTED }}>Income</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: ON_GREEN_TINT }}>£2,450.00</span>
      </div>
      <div style={{ marginTop: 9, background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: '13px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: MUTED }}>Expenses</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: RED_INK }}>£1,180.00</span>
      </div>
      <div style={{ marginTop: 9, paddingTop: 12, borderTop: `1px solid ${SURFACE}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: INK }}>Estimated profit</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: RIVER }}>£1,270.00</span>
      </div>
      <div style={{ marginTop: 14, background: RIVER, color: ON_RIVER, borderRadius: 12, padding: '12px 0', textAlign: 'center', fontSize: 13, fontWeight: 700 }}>Prepare my summary</div>
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
        <span style={{ fontSize: 11, fontWeight: 700, color: ON_RIVER, background: RIVER, padding: '7px 13px', borderRadius: 10 }}>+ New</span>
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

// The employee's report. See the long note above heroReport for why this is not a phone any more.
//
// ⚠️ EVERY COLOUR IS A TOKEN, none is a literal. The old version hardcoded WhatsApp's palette and
// then needed four dark mode overrides to undo it, which is how a component ends up with white text
// on a white bubble for anybody on dark. Themed variables flip by themselves.
//
// ⚠️ TABULAR NUMERALS, because the figures animate in one under another and proportional digits make
// a column of money jump sideways as it lands. Same reason lib/tokens.ts pinned them product wide.
//
// 🔴 THE APPROVE BUTTON IS var(--on-river), NOT #fff, AND test/tokens.test.mjs CAUGHT ME TYPING #fff.
// The dark theme LIFTS every accent so it can be seen against a near black page, and white on the
// lifted river drops to about 2.4:1. The rule is thirty lines up this same file and I broke it
// anyway, in the one component every visitor sees. Never pair an accent background with a literal
// white; the --on-* variable already knows which ink each theme needs.
// No .phone float any more: the report sits still, like a report. The border is the app shell's
// GLASS weight, 2px, so the card on the front door matches the product it sells.
// ⚠️ UNDER 900px THE CARD CENTRES ITSELF. Once the hero grid stacks, the copy above it is centred
// and a fixed 320px card hugging the left edge reads as a layout mistake on a phone. The rule
// lives in this component's own style block (no CSS comment in it: the literal is untagged), and
// desktop keeps the card where the two column grid puts it.
export function HeroReport() {
  return (
    <div className="hr-card" style={{ width: 320, maxWidth: '100%', backgroundColor: PANEL, borderRadius: 16, border: `2px solid ${LINE}`, boxShadow: '0 30px 70px rgba(17,17,17,.16)', overflow: 'hidden' }}>
      <style dangerouslySetInnerHTML={{ __html: reportCss + `
@media(max-width:900px){.hr-card{margin-inline:auto}}
.hr-top{border-bottom:1px solid var(--bd);padding:15px 18px}
.hr-eye{font-size:10.5px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:var(--tx-mut)}
.hr-h{font-size:16px;font-weight:800;color:var(--tx);margin-top:3px}
.hr-body{padding:6px 18px 18px}
.hr-r{position:relative;display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:13px 0;border-bottom:1px solid var(--bd);min-height:24px}
.hr-doing{position:absolute;left:0;right:0;top:13px;font-size:13.5px;color:var(--tx-mut);display:flex;align-items:center;gap:7px}
.hr-dot{width:6px;height:6px;border-radius:999px;background:var(--river);flex:none;animation:hrpulse 1.1s ease-in-out infinite}
@keyframes hrpulse{0%,100%{opacity:.35}50%{opacity:1}}
@media (prefers-reduced-motion: reduce){.hr-dot{animation:none}}
.hr-l{font-size:13.5px;color:var(--tx-mut)}
.hr-v{font-size:20px;font-weight:800;color:var(--tx);font-variant-numeric:tabular-nums}
.hr-spot{background:var(--saffron-tint);border-radius:14px;padding:13px 14px;margin-top:15px}
.hr-sh{font-size:11px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:var(--on-saffron-tint)}
.hr-sb{font-size:13.5px;line-height:1.5;color:var(--tx);margin-top:5px}
.hr-cost{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-top:15px;padding-top:14px;border-top:2px solid var(--bd)}
.hr-cl{font-size:13.5px;font-weight:700;color:var(--tx)}
.hr-cv{font-size:20px;font-weight:800;color:var(--river);font-variant-numeric:tabular-nums}
.hr-btn{margin-top:14px;background:var(--river);color:var(--on-river);border-radius:12px;text-align:center;font-size:15px;font-weight:800;padding:13px}
.hr-note{font-size:11.5px;line-height:1.45;color:var(--tx-mut);text-align:center;margin-top:11px}
` }} />
      <div className="hr-top">
        <div className="hr-eye">Your first employee</div>
        <div className="hr-h">Your month, so far</div>
      </div>
      <div className="hr-body">
        {heroWork.map((r, i) => (
          <div key={r.label} className={`hrow hrow${i} hr-r`}>
            {/* The work in hand. aria-hidden so a screen reader is read the finished report once,
                rather than every line twice in two tenses. */}
            <span className={`hr-doing hdoing${i}`} aria-hidden="true">
              <i className="hr-dot" />{r.doing}
            </span>
            <span className={`hr-l hdone${i}`}>{r.label}</span>
            <span className={`hr-v hdone${i}`}>{r.value}</span>
          </div>
        ))}
        <div className="hr-spot">
          <div className="hr-sh">{heroSpot.head}</div>
          <div className="hr-sb">{heroSpot.body}</div>
        </div>
        {/* 🔴 THE LAST LINE OF THE REPORT IS THE PRICE, in the same shape as the work above it, so
            the contrast is structural rather than claimed. We never say what the alternative costs. */}
        <div className="hr-cost">
          <span className="hr-cl">{heroCost.label}</span>
          <span className="hr-cv">{heroCost.value}</span>
        </div>
        <div className="hr-btn">Approve</div>
        <p className="hr-note">An example month. Your figures are your own, and nobody else ever sees them.</p>
      </div>
    </div>
  );
}

// ---------- shared chrome ----------
const SHARED_CSS = css`${THEME_CSS}
html,body{background:var(--bg)}
body{transition:background-color .35s ease,color .35s ease}
*{box-sizing:border-box} body{margin:0}
a{text-decoration:none}
/* brand mark: gradient L chip + wordmark. The L is the primary logo (Jag's
   call, 17 Jul): the same gradient mark the app uses, one logo everywhere. */
.brandrow{display:inline-flex;align-items:center;gap:10px}
/* ═══════════════════════════════════════════════════════════════════════════════════════════
   🔴 THE MARK IS A FILE NOW, NOT A CSS RECIPE. 10 AUGUST 2026.

   This was width:34;height:34;border-radius:10;background:linear-gradient(135deg,--river,--saffron)
   with a letter L inside it, and the comment above it said "one logo everywhere". It was not.
   A CSS recipe cannot be uploaded to Instagram, so every other surface got a PNG somebody made
   separately, and by this morning there were THREE marks in this repo, all different:

     app/icon.png + apple-icon.png   dark navy, square corners, a river under the L
     public/lekhio-icon-1024.png     brighter blue, rounder, no river
     this chip                       a third gradient again

   None of them matched. The Instagram avatar was set from the middle one and was simply wrong.

   ⚠️ AND THE TWO STOP GRADIENT WAS A DEFECT, NOT A STYLE. Blue to amber corner to corner averages
   to olive across the middle. You get away with it at 34px because that band is three pixels wide.
   On an avatar it is a third of the picture. public/lekhio-logo.svg, the wordmark, had ALREADY
   solved this with a three stop gradient through #2E7BBF. The chip never got the fix.

   So the mark is public/lekhio-mark.svg: a superellipse, the wordmark's three stop gradient, and
   the L AS A VECTOR PATH rather than live text, so it cannot reflow if Inter fails to load. Every
   PNG in the repo is rendered from that one file, and so is every social avatar. The site loads
   the same file it ships, which is the only arrangement where "one logo everywhere" is a fact
   rather than a comment.

   ⚠️ drop-shadow, NOT box-shadow: box-shadow would draw the old rectangle's shadow around a shape
   that is no longer a rectangle. */
.logo-chip{width:34px;height:34px;display:block;filter:drop-shadow(0 6px 16px rgba(27,89,166,.35))}
.logo-word{font-size:23px;font-weight:900;letter-spacing:-1px;color:var(--tx)}
@keyframes riseIn{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
@keyframes flow{to{stroke-dashoffset:0}}
@keyframes bubbleIn{0%{opacity:0;transform:translateY(10px) scale(.98)}100%{opacity:1;transform:none}}
@keyframes grow{to{transform:scaleX(1)}}
@keyframes popIn{0%{opacity:0;transform:scale(.4)}100%{opacity:1;transform:scale(1)}}
/* sheen, floaty, pulseDot and marquee are deleted. They drew the gradient text shimmer, the
   floating phone, the pulsing dot and the review belt, which are the four tics every AI product
   page shares. The motion budget is the reveal fade and the hero report loop. */
.reveal{opacity:1;transform:none;transition:opacity .4s ease,transform .4s cubic-bezier(.2,.7,.2,1)}
.reveal.in{opacity:1;transform:none}
.hero-h1,.hero-sub,.hero-cta,.hero-pill{opacity:0;animation:riseIn .5s cubic-bezier(.2,.7,.2,1) forwards}
.hero-pill{animation-delay:.04s}.hero-h1{animation-delay:.1s}.hero-sub{animation-delay:.2s}.hero-cta{animation-delay:.3s}
.btn-primary{transition:background-color .18s ease, transform .18s ease}
.btn-primary:hover{background-color:${RIVER_DEEP}!important;transform:translateY(-1px)}
.btn-primary:active{transform:translateY(0)}
.btn-ghost{transition:background-color .18s ease, border-color .18s ease, transform .18s ease}
.btn-ghost:hover{background-color:${SURFACE}!important;transform:translateY(-1px)}
.btn-white{transition:transform .18s ease}
.btn-white:hover{transform:translateY(-1px)}
.card{transition:transform .2s ease, box-shadow .2s ease, border-color .2s ease;box-shadow:0 1px 2px rgba(17,17,17,.04),0 10px 30px rgba(17,17,17,.05)}
.card:hover{transform:translateY(-5px);box-shadow:0 18px 44px rgba(17,17,17,.12);border-color:${RIVER}}
[data-theme="dark"] .card{box-shadow:0 1px 2px rgba(0,0,0,.4),0 12px 34px rgba(0,0,0,.45)}
[data-theme="dark"] .card:hover{box-shadow:0 18px 44px rgba(0,0,0,.6)}
.icontile{transition:transform .2s ease}
.card:hover .icontile{transform:scale(1.08) rotate(-3deg)}
.chip{transition:transform .15s ease, background-color .15s ease, color .15s ease}
.chip:hover{transform:translateY(-2px);background-color:${RIVER};color:var(--on-river);border-color:${RIVER}}
.riverflow{stroke-dasharray:1600;stroke-dashoffset:1600;animation:flow 1.4s ease forwards .15s}
.hero-h1-size{font-size:64px;line-height:1.05}
.h2{font-size:38px;line-height:1.12}
.grid3{grid-template-columns:repeat(3,1fr)}
.grid4{grid-template-columns:repeat(4,1fr)}
.hero-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:56px;align-items:center}
.hero-left{text-align:left}
.stepper{position:relative;display:grid;grid-template-columns:repeat(3,1fr);gap:28px}
.stepper-line{position:absolute;top:30px;left:16%;right:16%;height:3px;background:linear-gradient(90deg,${RIVER},#2E7BBF,${SAFFRON});border-radius:2px;transform:scaleX(0);transform-origin:left;animation:grow .8s ease forwards .2s}
.step{text-align:center;position:relative}
.step-num{width:60px;height:60px;border-radius:30px;background:linear-gradient(135deg,${RIVER},#2E7BBF);color:#fff;font-weight:800;font-size:22px;display:flex;align-items:center;justify-content:center;margin:0 auto 18px;box-shadow:0 10px 24px rgba(27,89,166,.3);position:relative;z-index:1;border:5px solid ${PAPER}}
.stat-num{font-size:48px;font-weight:800;letter-spacing:-1.5px;line-height:1;font-variant-numeric:tabular-nums}
.timeline{position:relative;display:grid;grid-template-columns:repeat(5,1fr);gap:16px;margin-top:10px}
.tl-line{position:absolute;top:18px;left:10%;right:10%;height:3px;background:linear-gradient(90deg,${RIVER},${SAFFRON});border-radius:2px;transform:scaleX(0);transform-origin:left;animation:grow .8s ease forwards .15s}
.tl-step{text-align:center;position:relative}
.tl-dot{width:38px;height:38px;border-radius:19px;background:#fff;border:3px solid ${RIVER};color:var(--on-white-river);font-weight:800;font-size:14px;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;position:relative;z-index:1;opacity:0;animation:popIn .5s ease forwards}
.appdemo-grid{display:grid;grid-template-columns:.95fr 1.05fr;gap:48px;align-items:center}
.appphone{width:340px;max-width:100%;margin:0 auto;background:var(--panel);border-radius:40px;border:1px solid ${LINE};box-shadow:0 30px 70px rgba(17,17,17,.18);overflow:hidden}
.appstatus{height:30px;display:flex;align-items:center;justify-content:center;background:var(--panel)}
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
/* ═══════════════════════════════════════════════════════════════════════════════════
   🔴 A FIXED BAR AT THE BOTTOM OF THE PAGE HAS TO PAY FOR ITS OWN SPACE. 11 August 2026,
   found by RUN 0 of the customer week.

   The bar was fixed to bottom:0 and nothing anywhere reserved the strip it covers. So at
   maximum scroll the last line of the footer ended level with the bottom of the viewport
   and the bar sat on top of it. The line underneath was the statutory one, the company
   number and the registered office, which could therefore never be read to the end.

   ⚠️ RUN 0 RECORDED THIS AS A DESKTOP FAULT AND IT IS A PHONE ONE. The bar is display:none
   above 760px and has been since it was written, so no desktop has ever shown it. The
   geometry was measured with the bar forced visible, which is why the report is right about
   the overlap and wrong about where. Corrected here so the next reader does not go looking
   for it on a screen that never had it.

   ONE NUMBER, TWO USES. --stickycta-h is the height the bar reserves and the height it
   occupies, so the two cannot drift apart the next time the button's padding changes.
   test/stickyfooter.test.mjs holds them to each other.
   ═══════════════════════════════════════════════════════════════════════════════════ */
.stickycta{display:none}
@media (max-width:760px){.fixrow{grid-template-columns:1fr;gap:12px;margin-bottom:22px}.fixarrow{transform:rotate(90deg);margin:0 auto}
  .stickycta{--stickycta-h:62px;display:flex;position:fixed;left:0;right:0;bottom:0;z-index:60;min-height:var(--stickycta-h);box-sizing:border-box;align-items:center;justify-content:space-between;gap:12px;background:var(--panel);border-top:1px solid ${LINE};padding:10px 16px calc(10px + env(safe-area-inset-bottom));box-shadow:0 -6px 24px rgba(0,0,0,.18)}
  /* The padding goes on the FOOTER, not the body, so the footer's own dark background carries
     on underneath the bar. On the body it would show as a pale strip below a dark footer. */
  body:has(.stickycta) .sitefooter{padding-bottom:calc(62px + env(safe-area-inset-bottom))}
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
  // Theme: his own choice if he has made one, otherwise whatever his device says, and it keeps
  // in step if he changes the device setting while the page is open.
  //
  // 🔴 EVERY CHANGE GOES THROUGH swapTheme. Setting data-theme directly leaves half the page on
  // the old palette, because Chrome will not re-resolve a property that is mid transition when
  // only the custom property behind it changed. The full story is in lib/tokens.ts.
  var swapTheme = ${THEME_SWAP_JS};
  // ═════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE SITE FOLLOWS THE DEVICE. THERE IS NO STORED OVERRIDE, BECAUSE THERE IS NO CONTROL.
  //
  // Reported live on 3 August 2026: "the website is stuck in dark mode, it should match my
  // laptop." The detection was never broken. A clean browser follows the device correctly in
  // both directions, proven by driving a real Chromium at both OS settings.
  //
  // What was broken: 430fa37 on 3 July, "Light-only theme sitewide", hid the toggle with
  // display:none !important. It removed the CONTROL and left the BEHAVIOUR. The dark palette,
  // the media query and the read of localStorage all survived it. So a stored choice still
  // outranked the device for ever, and the button that made that choice no longer existed on any
  // screen at any width. Anybody who had tapped the moon even once, possibly by accident, was
  // pinned to that choice with nothing left to press.
  //
  // ⚠️ THE KEY IS DELETED, NOT MERELY IGNORED. Ignoring it fixes the symptom and leaves a
  // landmine in the browser of every early visitor, waiting for the day somebody restores a
  // toggle and cannot work out why one man's site is the wrong colour.
  //
  // ⚠️ AND IF A TOGGLE EVER COMES BACK IT NEEDS THREE STATES: device, light, dark. Two states
  // cannot express "I have no opinion", which is the state everybody starts in and the one this
  // bug made unreachable.
  // ═════════════════════════════════════════════════════════════════════════════════════════
  try{ localStorage.removeItem('lekhio-theme'); }catch(e){}
  try{
    var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme:dark)') : null;
    swapTheme((mq && mq.matches) ? 'dark' : 'light');
    // Keeps step if he changes the laptop while the page is open, at sunset or by hand.
    if(mq && mq.addEventListener){ mq.addEventListener('change', function(e){
      swapTheme(e.matches ? 'dark' : 'light');
    }); }
  }catch(e){}
  // 🔴 THE TOGGLE, ITS ICON AND ITS CLICK HANDLER WENT WITH THE BUTTON. Doc 103's honesty test: a
  // control hidden by display:none at every width is not a control, it is behaviour shipped to
  // every visitor to serve nobody, and this one was still writing the override that stranded them.
  var run = function(){
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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE MTD BANNER, ONCE. IT USED TO BE SIX COPIES AND THEY HAD ALREADY DRIFTED.
//
// Found by walking the deployed site on 1 August 2026, minutes after a deploy whose whole point
// was fixing this banner. Six pages carried it. Four had just been corrected to name landlords and
// to say gross income rather than "earning", and they had been corrected in TWO DIFFERENT SITTINGS,
// so the site went live saying "gross qualifying income over £50,000" on the front door and "gross
// income over £50k" one click away. Two of the six typed the threshold as a literal; three read it
// from FACTS, where khoji checks it against GOV.UK every night. So a Budget that moved the number
// would have quietly left two pages wrong.
//
// Neither wording was false, which is exactly why it survived a house style sweep, a test run and a
// review. A sentence duplicated at six call sites is not copy, it is six chances to be wrong, and
// the one that drifts is always the one he is looking at. This is the same lesson lib/features.ts
// was written for and the same lesson lib/reviewpile.ts learned about counting the pile.
//
// ⚠️ NEVER INLINE THIS AGAIN. If a page needs different wording, that is a product decision worth
// arguing for out loud, and it belongs here as a second exported banner with its reason written
// down, not as a seventh literal.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
export function MtdBanner() {
  return (
    <div className="mtdtop">
      <Link href="/how-mtd-works">
        <span className="tag">New</span>{' '}
        <b>Making Tax Digital is now live</b> for sole traders and landlords with gross qualifying
        income over £{FACTS.mtdThreshold2026.toLocaleString('en-GB')}.{' '}
        <span className="go">See if it affects you →</span>
      </Link>
    </div>
  );
}

export function SharedHead() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: SHARED_CSS }} />
      {/* ⚠️ THE CLASS NAMES IN HERE MUST EXIST. This is the fallback that makes the page readable
          when the reveal script never runs, and it is the one stylesheet nobody ever looks at, so a
          rename elsewhere leaves it pointing at nothing and the failure is invisible: an element
          that starts at opacity 0 and stays there. It said `.cmsg` for a hero that has not existed
          since the WhatsApp mock was replaced. test/frontdoor.test.mjs now proves every selector in
          this block is a class the module actually uses. */}
      <noscript><style dangerouslySetInnerHTML={{ __html: `.reveal{opacity:1;transform:none}.hrow{opacity:1 !important}` }} /></noscript>
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
        <span>A real UK company, not HMRC</span>
      </div>
    </div>
  );
}

const NAV_LINKS: [string, string][] = [
  ['/product', 'Product'],
  ['/resources', 'Free tools'],
  ['/pricing', 'Pricing'],
];

/* ═══════════════════════════════════════════════════════════════════════════════════════════
   🔴 THE TOP BAR HAD SEVEN THINGS TO PRESS AND ONE OF THEM WAS THE ASK.
   Product, How MTD works, Free tools, Compare, Pricing, Sign in, Start free. Every one of them
   was a reason to go somewhere other than /start, and the ask was competing with six of them.

   ⚠️ HOW MTD WORKS AND COMPARE WERE MOVED, NOT DELETED, and that distinction is the whole reason
   this was safe to do. Both still ship a sitewide internal link from the footer's Product column,
   both are still linked from /product, and both keep their own canonical URL, so nothing is
   orphaned and no crawl path is lost. What changed is what a stranger is offered in the first
   two seconds. If either page's traffic drops, put it back: it is one line.
   ═══════════════════════════════════════════════════════════════════════════════════════════ */

export function SiteNav() {
  return (
    <nav style={{ position: 'relative', maxWidth: 1320, margin: '0 auto', padding: '22px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <Link href="/" aria-label="Lekhio home" className="brandrow">
        {/* The same file the PNGs, the favicon and every social avatar are rendered from.
            alt is empty on purpose: the Link already carries aria-label="Lekhio home", so a
            second label here would read the brand twice to a screen reader. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/lekhio-mark.svg" alt="" width={34} height={34} className="logo-chip" />
        <span className="logo-word">Lekhio</span>
      </Link>

      <input type="checkbox" id="navtoggle" className="nav-toggle" aria-label="Toggle menu" />

      <div className="nav-right">
        <div className="nav-inline">
          {NAV_LINKS.map(([href, label]) => (
            <Link key={href} href={href} className="navtop">{label}</Link>
          ))}
          {/* ═══════════════════════════════════════════════════════════════════════════════
              🔴 THE WAY BACK IN. IT WAS NOT HERE, AND THAT IS AS BAD AS THE SITE BEING DOWN.
              Until 30 July the front door had five marketing links and a Sign up button, and the
              only sign in anywhere on the page was "Team sign in" in the footer, which is the
              staff door. A paying customer coming back to check what he owes had nothing to press
              and one link that would reject him.
              A text link, not a second button: signing up is still the one thing we ask a stranger
              to do, and a man who already has an account does not need persuading, only a door.
              ═══════════════════════════════════════════════════════════════════════════════ */}
          <Link href="/in" className="navtop">Sign in</Link>
          {/* One primary CTA wording sitewide: Start free. "Sign up now" was the only button on
              the site that asked for the signup rather than offering the trial. */}
          <Link href="/start" className="btn-primary" style={{ backgroundColor: RIVER, color: ON_RIVER, fontSize: 15, fontWeight: 600, padding: '10px 18px', borderRadius: 12 }}>Start free</Link>
        </div>
        <label htmlFor="navtoggle" className="nav-burger" aria-label="Open menu">Menu <span className="nav-burger-lines"><i /><i /><i /></span></label>
      </div>

      <div className="nav-panel">
        {/* ⚠️ FIRST, NOT LAST. It was at the bottom of this panel for about twenty minutes and on a
            phone that put it fifteenth, under "Rent a Room checker". A stranger is happy to read
            down a list of what we do. A man who already pays us is here for one thing and should
            not have to scroll past fourteen adverts to find the door to his own books. */}
        <Link href="/in" style={{ fontWeight: 700 }}>Sign in</Link>
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
        <Link href="/start" className="btn-primary" style={{ display: 'block', textAlign: 'center', backgroundColor: RIVER, color: ON_RIVER, fontSize: 16, fontWeight: 600, padding: '14px 0', borderRadius: 12, marginTop: 16 }}>Start free</Link>
      </div>
    </nav>
  );
}

export function StickyCta() {
  return (
    <div className="stickycta">
      <span style={{ fontSize: 14, fontWeight: 700, color: INK }}>7 days free. No card.</span>
      <Link href="/start" className="btn-primary" style={{ backgroundColor: RIVER, color: ON_RIVER, fontSize: 15, fontWeight: 700, padding: '11px 20px', borderRadius: 12 }}>Start free</Link>
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
    <footer className="sitefooter" style={{ background: INK_BG, color: '#fff' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '52px 24px 40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 32, marginBottom: 40 }}>
          {col('Product', [['/product', 'How it works'], ['/how-mtd-works', 'How MTD works'], ['/compare', 'Compare'], ['/pricing', 'Pricing'], ['/start', 'Sign up'], ['/app/you/billing', 'Manage subscription']])}
          {col('Free tools', [['/tax-calculator', 'Tax calculator'], ['/cis-calculator', 'CIS refund calculator'], ['/landlord-tax-calculator', 'Landlord tax calculator'], ['/rent-a-room-checker', 'Rent a Room checker'], ['/sole-trader-vs-limited', 'Sole trader vs limited'], ['/invoice-generator', 'Invoice maker'], ['/ni-checker', 'NI checker'], ['/student-loan-checker', 'Student loan checker'], ['/can-i-claim', 'Can I claim it?'], ['/file-your-tax-return', 'File your return'], ['/free-mtd-filing', 'Free MTD filing'], ['/resources', 'All tools']])}
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
          {col('Company', [['/in', 'Sign in'], ['/security', 'Security and trust'], ['/register-your-business', 'Register your business'], ['/privacy', 'Privacy'], ['/terms', 'Terms'], ['/team', 'Team sign in']])}
        </div>
        <div style={{ borderTop: '1px solid #2C2C2C', paddingTop: 24, display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13, color: '#8A93A0', maxWidth: 640, lineHeight: 1.6 }}>
            Lekhio prepares your figures and keeps you ready for Making Tax Digital. You approve everything before it reaches HMRC. HMRC keeps you responsible for your tax. We never imply HMRC backs us. Built in the UK.
          </div>
          {/* The team link used to be here, at 13px grey, and it was invisible. It lives in the
              Company column above now, where a person would actually look for it. */}
          <div style={{ fontSize: 13, color: '#8A93A0' }}>© 2026 {COMPANY.name}</div>
        </div>
        {/* The statutory particulars, on their own row so they are never squeezed out by the
            sentence above them. Plain text, not a link: reg 25 wants them disclosed, and a
            disclosure a reader has to click for is not one.

            ═══════════════════════════════════════════════════════════════════════════════════
            🔴 QUIETER, BUT NOT DIMMER, AND THE DIFFERENCE IS THE WHOLE NOTE. 11 August 2026.

            Jag asked for the registered office to sit less loudly, having seen it as the first
            thing his eye landed on. Three levers were available and only two of them were safe.

            TAKEN: the type dropped from 12.5px to 11.5px, so it is smaller than the copyright
            line above it rather than level with it, and the divider rule went, because a rule
            announces a section and this is a tail. It now reads as small print, which is what
            it is.

            🔴 NOT TAKEN, AND NEVER TAKE IT: THE COLOUR. #7A828E on --band measures 4.58:1 in
            light and 5.10:1 in dark. The light figure is EIGHT HUNDREDTHS above the 4.5:1 floor
            this product holds every pair to. There is no headroom. The obvious next move for
            anybody asked to make this quieter is to dim it, and one step down (#6E7683) is
            3.88:1, which fails.

            ⚠️ AND NOTHING WAS WATCHING IT. test/contrastapplication.test.mjs finds a pair when a
            background and a colour sit in the SAME inline style object; this one inherits its
            background from the <footer> two levels up, so the sweep has never seen it. A pair
            eight hundredths off the floor with no guard on it is exactly how a legal disclosure
            goes quietly unreadable. test/stickyfooter.test.mjs now computes this one from the
            tokens, in both themes.

            ⚠️ THE ADDRESS IS PUBLIC ON COMPANIES HOUSE REGARDLESS, so none of this is privacy.
            The only thing that removes a home address from public view is changing the
            registered office to a service address and then applying to suppress the old one.
            Nothing on this page can do that job, and nothing on this page should pretend to.
            ═══════════════════════════════════════════════════════════════════════════════════ */}
        <div style={{ marginTop: 26, fontSize: 11.5, color: '#7A828E', lineHeight: 1.7 }}>
          {COMPANY.name} is a company registered in {COMPANY.jurisdiction}, company number {COMPANY.number}.
          {' '}Registered office: {COMPANY.office}.
        </div>
      </div>
    </footer>
  );
}

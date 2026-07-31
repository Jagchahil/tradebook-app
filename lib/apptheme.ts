// lib/apptheme.ts. THE APP'S COLOUR NAMES, AND NOT ONE COLOUR LIVES HERE.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// Every name below is a CSS custom property reference, and the values behind them are declared in
// exactly one place: APP_THEME_CSS in lib/tokens.ts, which carries the light palette at :root and
// the dark palette under prefers-color-scheme. The app ships zero client JavaScript, so the
// browser itself decides which list applies, and these names are how a server rendered page paints
// without ever knowing which theme it is being read in.
//
// This is the same shape app/_shared/site.tsx uses for the marketing pages, deliberately: a page
// that writes `color: INK` keeps reading naturally, and the identifier resolves to var(--tx),
// never to a hex. A hex in a page is a colour with no name and no dark twin, and
// test/tokens.test.mjs counts those down, not up.
//
// ⚠️ NOTHING HERE MAY EVER BECOME A LITERAL COLOUR. The day one of these is a hex string, the app
// has a colour the dark theme cannot reach, which is precisely the class of bug the 30 July
// palette merge existed to end. Add the value to lib/tokens.ts, add it to both var lists, and
// name the variable here.
//
// Imports nothing, exports strings, so the guard tests can load it under bare node.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export const INK = 'var(--tx)';
export const MUTED = 'var(--tx-mut)';
export const PAPER = 'var(--bg)';
export const PANEL = 'var(--panel)';
export const SURFACE = 'var(--surface)';
export const LINE = 'var(--bd)';
export const BAND = 'var(--band)';

export const RIVER = 'var(--river)';
export const RIVER_DEEP = 'var(--river-deep)';
export const RIVER_TINT = 'var(--river-tint)';
export const SAFFRON = 'var(--saffron)';
export const SAFFRON_DEEP = 'var(--saffron-deep)';
export const SAFFRON_TINT = 'var(--saffron-tint)';
export const GREEN = 'var(--green)';
export const GREEN_TINT = 'var(--green-tint)';
export const RED = 'var(--red)';
export const RED_TINT = 'var(--red-tint)';
export const WHATSAPP = 'var(--whatsapp)';

// The inks that belong ON an accent or a tint. See the ON_PAIRS ratchet in lib/tokens.ts: white
// is not a safe default on a coloured fill, and in dark it is usually wrong.
export const ON_RIVER = 'var(--on-river)';
export const ON_GREEN = 'var(--on-green)';
export const ON_RED = 'var(--on-red)';
export const ON_SAFFRON = 'var(--on-saffron)';
export const ON_WHATSAPP = 'var(--on-whatsapp)';
export const ON_SAFFRON_TINT = 'var(--on-saffron-tint)';
export const ON_GREEN_TINT = 'var(--on-green-tint)';

// Big blue surfaces that stay deep in both themes. lib/tokens.ts explains why they do not lift.
export const RIVER_PANEL = 'var(--river-panel)';
export const RIVER_PANEL_DEEP = 'var(--river-panel-deep)';

// A TRANSLUCENT EDGE OF AN ACCENT, now the hex alpha trick is gone.
//
// The light only app wrote borders like RIVER + '33', eight digit hex, a fifth of river over the
// tint behind it. A var() reference cannot take an alpha suffix, so the same edge is asked for by
// mixing the accent with transparency instead, and because the accent is a variable the edge
// lightens and darkens with the theme on its own.
//
// ⚠️ ALWAYS DECLARE A SOLID FALLBACK FIRST. color-mix is roughly 2023 in browsers, and the man
// this app is for is on a five year old Android. A declaration his browser cannot parse is simply
// dropped, so the pattern is: border the plain LINE (or the accent), then the mixed edge on the
// next declaration for the browsers that can. He gets a quiet line either way, never no line.
//
// The percentages that replaced the old suffixes: 33 hex is 20, 44 hex is 27, 66 hex is 40.
export function edge(accent: string, percent: number): string {
  return `color-mix(in srgb, ${accent} ${percent}%, transparent)`;
}

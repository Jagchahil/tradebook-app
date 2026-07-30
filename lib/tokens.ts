// THE LEKHIO PALETTE. One file, both themes, and the rule for what may sit on top of what.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 EVERY COLOUR THE PRODUCT SHOWS A CUSTOMER IS DECLARED HERE, INCLUDING THE DARK ONES.
//
// The dark palette used to be hand typed into app/_shared/site.tsx and the light one typed
// again here, which meant the brand was maintained twice by hand and agreed only by luck. The
// two had already drifted: two red tints, two WhatsApp greens, two greens, two golds. Nobody
// did that carelessly. It happens because a hex in a style block looks like a local decision
// and reads as one in a diff.
//
// So THEME_CSS below is built from these constants and injected by SharedHead. There is exactly
// one place to change a brand colour, and test/tokens.test.mjs fails the build if a hex appears
// anywhere else without being named.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// Nothing in here imports anything. Keep it that way: the guard test loads this module directly
// under bare node, which cannot resolve an extensionless relative import.

// ---------- light, the default ----------

export const INK = '#111111';
export const RIVER = '#1B59A6';
export const RIVER_DEEP = '#134277';
export const RIVER_TINT = '#E9F1FA';
export const SAFFRON = '#E0A33E';
export const SAFFRON_DEEP = '#C9842A';
export const SAFFRON_TINT = '#FBEFD8';
export const GREEN = '#15803D';
export const GREEN_TINT = '#E7F5EC';
export const RED = '#C0392B';
export const RED_TINT = '#FBEAE8';
export const PAPER = '#FBFAF7';
export const PANEL = '#FFFFFF';
export const SURFACE = '#F2F0EA';
export const LINE = '#E7E3D9';
export const MUTED = '#5B6470';
export const BAND = '#141821';

// WhatsApp's own green, not ours. It marks the one button that opens their app, so it has to be
// their colour or it stops reading as WhatsApp. It does not change between themes for the same
// reason: a recognised brand colour that shifts is no longer recognised.
export const WHATSAPP = '#25D366';

// ---------- dark, which most people get without ever asking for it ----------
//
// The site follows the device setting, so a tradesman whose phone flips at sunset is in dark
// mode whether he knows it or not. That makes this a first class palette, not a nicety.

export const DARK_INK = '#F3F5F8';
export const DARK_RIVER = '#4C8FDB';
export const DARK_RIVER_DEEP = '#6AA6E6';
export const DARK_RIVER_TINT = '#16263C';
export const DARK_SAFFRON = '#E9B45A';
export const DARK_SAFFRON_DEEP = '#F0C173';
export const DARK_SAFFRON_TINT = '#2A2113';
export const DARK_GREEN = '#43BE72';
export const DARK_GREEN_TINT = '#12281B';
export const DARK_RED = '#E67667';
export const DARK_RED_TINT = '#2A1614';
export const DARK_PAPER = '#0E1116';
export const DARK_PANEL = '#161A21';
export const DARK_SURFACE = '#1E242E';
export const DARK_LINE = '#2A313C';
export const DARK_MUTED = '#9AA6B5';
export const DARK_BAND = '#080A0E';

// ---------- what goes ON an accent ----------
//
// ⚠️ WHITE IS NOT A SAFE DEFAULT ON A COLOURED BUTTON, AND ASSUMING IT WAS IS HOW WE SHIPPED A
// SIGN UP BUTTON NOBODY COULD READ.
//
// White on the light river reads at 6.9:1 and is fine. The dark theme lifts river to #4C8FDB so
// it can be seen against a near black page, and white on THAT is 3.4:1, under the 4.5:1 the
// guidelines ask for. Dark green was worse at 2.4:1, and it was carrying "Approve and send to
// HMRC", the most important button we draw. Saffron and the WhatsApp green fail with white in
// BOTH themes, at 2.2:1 and 2.0:1.
//
// A lighter accent needs darker text on it, not the same white. So every accent names the ink
// that belongs on top of it, per theme, and the guard test recomputes all of them. Change an
// accent and the pair is checked with it, which is the only way this stays true.
export const ON_RIVER = '#FFFFFF';
export const ON_GREEN = '#FFFFFF';
export const ON_RED = '#FFFFFF';
export const ON_SAFFRON = INK;
export const ON_WHATSAPP = '#08301A';

// ⚠️ AND AN ACCENT IS NOT AUTOMATICALLY READABLE ON ITS OWN TINT EITHER. Saffron deep on the
// saffron tint reads at 2.7:1, and how-mtd-works was painting the MTD threshold card in exactly
// that pair: the line telling a sole trader which April he is caught by. These are the inks for
// text on a tinted panel. The accents themselves stay as they are, because they are also fills.
// ⚠️ AND THE INVERSE MISTAKE, ON A BUTTON THAT IS WHITE IN BOTH THEMES. var(--river) lifts to
// #4C8FDB in dark so it can be seen against a near black page, which is right everywhere except on
// a fill that stayed white. There it reads at 3.36:1. A white surface does not darken when the page
// does, so it keeps the light accent whatever the theme is doing around it: --on-white-river is
// RIVER in both blocks, deliberately, and is not a copy and paste slip.

export const ON_SAFFRON_TINT = '#7D5410';
export const ON_GREEN_TINT = '#136B34';

export const DARK_ON_RIVER = '#0B1A2B';
export const DARK_ON_GREEN = '#07220F';
export const DARK_ON_RED = DARK_RED_TINT;
export const DARK_ON_SAFFRON = DARK_SAFFRON_TINT;

// The minimum the guard holds every accent and ink pair to. WCAG AA for body text. We do not
// grant large text the looser 3:1 here, because a button is read at a glance by a man holding a
// ladder, and because the pairs all clear 4.5:1 comfortably anyway.
export const MIN_CONTRAST = 4.5;

// ---------- non brand palettes we reproduce on purpose ----------
//
// Colours we do not own and must not "correct" to ours. Each is here so the guard test can tell
// a deliberate foreign colour from a stray, and so the next person understands why it is exempt.
export const FOREIGN = {
  // A drawing of a WhatsApp thread, used to show what Lekhio looks like in use. These are
  // WhatsApp's chrome. Changed to our palette, the picture stops being recognisable.
  whatsappChat: {
    outBubble: '#DCF8C6', inBubble: '#FFFFFF', canvas: '#ECE5DD', header: '#075E54',
    darkOut: '#005C4B', darkIn: '#202C33', darkCanvas: '#0B141A', darkInk: '#E8F0EE',
    photo: '#CDE7B4',
  },
  // A drawing of a GOV.UK page, shown under the heading "What you will see" so a man knows the
  // real page when he lands on it. GOV.UK's black and green.
  //
  // ⚠️ These may only ever appear inside a preview that is plainly labelled as somebody else's
  // website. Painting our own chrome in these would imply an endorsement we do not have, which
  // is the one thing we never do.
  govuk: { ink: '#0B0C0C', green: '#00703C' },
  // A drawing of a browser window around that preview. macOS window furniture.
  browserChrome: { bar: '#E8E8E8', close: '#F25F58', minimise: '#FBBE3C', zoom: '#58CB42' },
} as const;

export const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

export const RADIUS = { sm: 8, md: 12, lg: 18, pill: 999 } as const;
export const SHADOW = {
  card: '0 1px 2px rgba(17,17,17,0.04), 0 8px 24px rgba(17,17,17,0.06)',
  raised: '0 12px 40px rgba(17,17,17,0.12)',
} as const;

// ---------- the stylesheet ----------

export const THEME_SWAP_CLASS = 'theme-swap';

// 🔴 THE CLASS THAT MAKES SWITCHING THEME ACTUALLY WORK. Read THEME_SWAP_JS below before touching.
const THEME_SWAP_CSS = `html.${THEME_SWAP_CLASS},html.${THEME_SWAP_CLASS} *,`
  + `html.${THEME_SWAP_CLASS} *::before,html.${THEME_SWAP_CLASS} *::after{transition:none !important}`;

// Marketing pages colour themselves from these variables rather than the constants above, so one
// attribute on <html> reskins the whole site. App pages use the constants directly and stay
// light. Both come from the same values, which is the point.
export const THEME_CSS = `
:root{
  --river:${RIVER};--river-deep:${RIVER_DEEP};--river-tint:${RIVER_TINT};--on-river:${ON_RIVER};
  --saffron:${SAFFRON};--saffron-deep:${SAFFRON_DEEP};--saffron-tint:${SAFFRON_TINT};--on-saffron:${ON_SAFFRON};--on-saffron-tint:${ON_SAFFRON_TINT};
  --green:${GREEN};--green-tint:${GREEN_TINT};--on-green:${ON_GREEN};--on-green-tint:${ON_GREEN_TINT};
  --red:${RED};--red-tint:${RED_TINT};--on-red:${ON_RED};
  --whatsapp:${WHATSAPP};--on-whatsapp:${ON_WHATSAPP};--on-white-river:${RIVER};
  --bg:${PAPER};--panel:${PANEL};--surface:${SURFACE};--bd:${LINE};--band:${BAND};
  --tx:${INK};--tx-mut:${MUTED};
}
[data-theme="dark"]{
  --river:${DARK_RIVER};--river-deep:${DARK_RIVER_DEEP};--river-tint:${DARK_RIVER_TINT};--on-river:${DARK_ON_RIVER};
  --saffron:${DARK_SAFFRON};--saffron-deep:${DARK_SAFFRON_DEEP};--saffron-tint:${DARK_SAFFRON_TINT};--on-saffron:${DARK_ON_SAFFRON};--on-saffron-tint:${DARK_SAFFRON};
  --green:${DARK_GREEN};--green-tint:${DARK_GREEN_TINT};--on-green:${DARK_ON_GREEN};--on-green-tint:${DARK_GREEN};
  --red:${DARK_RED};--red-tint:${DARK_RED_TINT};--on-red:${DARK_ON_RED};
  --bg:${DARK_PAPER};--panel:${DARK_PANEL};--surface:${DARK_SURFACE};--bd:${DARK_LINE};--band:${DARK_BAND};
  --tx:${DARK_INK};--tx-mut:${DARK_MUTED};
}
${THEME_SWAP_CSS}
`;

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY SWITCHING THEME NEEDS A GUARD CLASS AND NOT JUST setAttribute.
//
// Found by pressing the toggle on the deployed site, never by reading the code, and never by a
// test. Chrome does not re-resolve a property that is mid transition when the only thing that
// changed is the custom property behind it. Every rule that said `transition: color .15s` kept
// painting the OLD theme's colour after the swap, so pressing the toggle left the body text, the
// body background, the nav links, the buttons, the cards and the chips on the previous palette
// until the page was reloaded. Dark grey nav links on a near black page.
//
// Turning transitions off for the duration of the swap, forcing the new values to resolve, then
// putting transitions back on the next frame, fixes every one of them at once. The reflow read in
// the middle is load bearing: without it the browser batches all three steps and nothing changes.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const THEME_SWAP_JS = `
function(next){
  var d = document.documentElement;
  d.classList.add('${THEME_SWAP_CLASS}');
  d.setAttribute('data-theme', next);
  void d.offsetWidth;
  requestAnimationFrame(function(){ d.classList.remove('${THEME_SWAP_CLASS}'); });
}`;

// Shared accessibility CSS, injected into every page's style block. Visible keyboard focus on
// every interactive element, and all animation disabled for people who ask the OS for reduced
// motion.
export const A11Y_CSS = [
  `a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,[tabindex]:focus-visible{outline:3px solid ${RIVER};outline-offset:2px;border-radius:4px}`,
  '@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms !important;animation-iteration-count:1 !important;transition-duration:.01ms !important;scroll-behavior:auto !important}}',
].join('');

// ---------- what the guard test reads ----------
//
// Every hex the product is allowed to paint, by name. A colour not in here and not declared in
// FOREIGN is a stray, and the test says so with the file and the line.
export const PALETTE: Readonly<Record<string, string>> = {
  INK, RIVER, RIVER_DEEP, RIVER_TINT, SAFFRON, SAFFRON_DEEP, SAFFRON_TINT, GREEN, GREEN_TINT,
  RED, RED_TINT, PAPER, PANEL, SURFACE, LINE, MUTED, BAND, WHATSAPP,
  DARK_INK, DARK_RIVER, DARK_RIVER_DEEP, DARK_RIVER_TINT, DARK_SAFFRON, DARK_SAFFRON_DEEP,
  DARK_SAFFRON_TINT, DARK_GREEN, DARK_GREEN_TINT, DARK_RED, DARK_RED_TINT, DARK_PAPER,
  DARK_PANEL, DARK_SURFACE, DARK_LINE, DARK_MUTED, DARK_BAND,
  ON_RIVER, ON_GREEN, ON_RED, ON_SAFFRON, ON_WHATSAPP, ON_SAFFRON_TINT, ON_GREEN_TINT,
  DARK_ON_RIVER, DARK_ON_GREEN, DARK_ON_RED, DARK_ON_SAFFRON,
};

// Accent and the ink that sits on it, per theme. The guard walks this and recomputes contrast, so
// nudging any accent fails the build rather than the customer.
export const ON_PAIRS: ReadonlyArray<{ theme: 'light' | 'dark'; name: string; bg: string; ink: string }> = [
  { theme: 'light', name: 'river', bg: RIVER, ink: ON_RIVER },
  { theme: 'light', name: 'river-deep', bg: RIVER_DEEP, ink: ON_RIVER },
  { theme: 'light', name: 'green', bg: GREEN, ink: ON_GREEN },
  { theme: 'light', name: 'red', bg: RED, ink: ON_RED },
  { theme: 'light', name: 'saffron', bg: SAFFRON, ink: ON_SAFFRON },
  { theme: 'light', name: 'saffron-deep', bg: SAFFRON_DEEP, ink: ON_SAFFRON },
  { theme: 'light', name: 'whatsapp', bg: WHATSAPP, ink: ON_WHATSAPP },
  { theme: 'light', name: 'band', bg: BAND, ink: PANEL },
  { theme: 'light', name: 'paper', bg: PAPER, ink: INK },
  { theme: 'light', name: 'paper-muted', bg: PAPER, ink: MUTED },
  { theme: 'light', name: 'surface-muted', bg: SURFACE, ink: MUTED },
  { theme: 'light', name: 'river-tint', bg: RIVER_TINT, ink: RIVER_DEEP },
  { theme: 'light', name: 'green-tint', bg: GREEN_TINT, ink: ON_GREEN_TINT },
  { theme: 'light', name: 'red-tint', bg: RED_TINT, ink: RED },
  { theme: 'light', name: 'saffron-tint', bg: SAFFRON_TINT, ink: ON_SAFFRON_TINT },
  { theme: 'dark', name: 'river', bg: DARK_RIVER, ink: DARK_ON_RIVER },
  { theme: 'dark', name: 'green', bg: DARK_GREEN, ink: DARK_ON_GREEN },
  { theme: 'dark', name: 'red', bg: DARK_RED, ink: DARK_ON_RED },
  { theme: 'dark', name: 'saffron', bg: DARK_SAFFRON, ink: DARK_ON_SAFFRON },
  { theme: 'dark', name: 'whatsapp', bg: WHATSAPP, ink: ON_WHATSAPP },
  { theme: 'dark', name: 'paper', bg: DARK_PAPER, ink: DARK_INK },
  { theme: 'dark', name: 'paper-muted', bg: DARK_PAPER, ink: DARK_MUTED },
  { theme: 'dark', name: 'surface-muted', bg: DARK_SURFACE, ink: DARK_MUTED },
  { theme: 'dark', name: 'panel-ink', bg: DARK_PANEL, ink: DARK_INK },
  { theme: 'dark', name: 'river-tint', bg: DARK_RIVER_TINT, ink: DARK_RIVER },
  { theme: 'dark', name: 'green-tint', bg: DARK_GREEN_TINT, ink: DARK_GREEN },
  { theme: 'dark', name: 'red-tint', bg: DARK_RED_TINT, ink: DARK_RED },
  { theme: 'dark', name: 'saffron-tint', bg: DARK_SAFFRON_TINT, ink: DARK_SAFFRON },
];

// Contrast per WCAG 2.1. Here rather than in the test because the app may want to ask the same
// question one day, and because a rule the product cannot check is a rule nobody keeps.
export function contrast(a: string, b: string): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

export function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const channel = (i: number) => {
    const v = parseInt(full.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

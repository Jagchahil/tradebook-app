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
// ⚠️ AND A BIG BLUE PANEL IS A SURFACE, NOT AN ACCENT MARK. The hero cards, the closing call to
// action and the timeline dots are filled with a river gradient and carry white text. Themed, that
// gradient lifts to #4C8FDB in dark and the white on it drops to 2.6:1 on a whole panel of copy.
// A deep blue panel reads perfectly well on a dark page, exactly as --band does, so these keep the
// light values in both themes on purpose. They are surfaces that happen to be blue.
export const RIVER_PANEL = RIVER;
export const RIVER_PANEL_DEEP = RIVER_DEEP;

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

// ---------- type ----------
//
// ⚠️ EVERY SIZE THE APP SETS TYPE AT, AND THERE ARE NINE OF THEM.
//
// Hierarchy is the design. A screen that answers one question needs one big number, a small word
// over it saying what the number is, and everything else visibly smaller, and that only holds
// across screens built weeks apart if the sizes were chosen once. Before this scale the three
// money screens set type at eighteen different sizes, many of them half a pixel apart, which is
// the typographic version of the two greens: invisible in a diff and mush on a screen.
//
// The names are jobs, not measurements. display exists for exactly one thing: the figure a man
// opened the page for, on a screen wide enough to give it room. If two numbers on one screen are
// both set at display, one of them is lying about mattering.
export const TYPE = {
  // The one number he came for, on a desk. Nothing else on the screen gets this.
  display: 72,
  // The same number in a hand. A phone gives it presence with space, not with pixels it lacks.
  hero: 44,
  // A month title, a desk tile figure. The top of the ordinary range.
  title: 30,
  // A money figure in a tile on a phone, a screen's own heading on a desk.
  stat: 24,
  // A leading sentence: the pile's headline, the saved figure in words.
  lead: 19,
  // A vendor name, an amount on a row, an empty state. Strong, never loud.
  strong: 17,
  // Ordinary reading, a heading inside a card, a button.
  body: 15,
  // The quiet line under a figure. Muted in ink, and this is as small as muted goes.
  note: 13.5,
  // An uppercase eyebrow, a tile label, a chip. The floor. Nothing a customer must read goes under it.
  label: 12,
} as const;

// ---------- space ----------
//
// The rhythm, chosen once. Between two of these there is no third: a gap that is nearly a step is
// the spacing version of a near miss colour, and eyeballed thirteens and fifteens are how a calm
// column turns into a noticeboard. If a layout seems to need a value that is not here, it almost
// always needs the next step up and less on the screen.
export const SPACE = { hair: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

// ---------- the two compositions ----------
//
// The web app is one server rendered page worn two ways, and the difference is CSS alone. Under
// stack, the money grid gives up its columns so three figures never squeeze into three slivers.
// From desk up, the column widens to 960 and the type steps up, because a desk has room to be
// generous and a phone does not. Two compositions, no third: every width in between gets the
// phone column with air around it, which is calmer than a layout that reflows at every size.
export const BREAK = { stack: 420, desk: 1020 } as const;

// The dashboard rail. From BREAK.desk up the app nav is a fixed left column of this width and the
// content column clears it (see APP_CSS and app/app/AppNav.tsx); below desk it does not exist and
// the phone's top bar draws instead. One number, named here, because the nav and the sheet that
// makes room for it must never disagree about it.
export const SIDEBAR = 260;

// ---------- movement ----------
//
// ⚠️ EVERY DURATION AND CURVE THE APP IS ALLOWED TO USE, AND THERE ARE FIVE OF THEM.
//
// A dashboard with animation is either calm or it is a fairground, and the difference is whether
// the timings were chosen once or invented per component. These are the only ones. The curve is a
// gentle ease out: things arrive quickly and settle, which reads as the interface responding to
// him rather than performing at him.
//
// Nothing here needs switching off for reduced motion. A11Y_CSS already collapses every duration
// on the page to nothing when the OS asks, so a man who cannot take movement gets the same layout
// with none of it, from one rule, rather than from every component remembering.
export const MOTION = {
  // A press, a hover, a colour change. Fast enough to feel like cause and effect.
  quick: '140ms',
  // A panel opening, a row expanding. Long enough to be followed by the eye.
  panel: '220ms',
  // Something arriving on the page for the first time.
  enter: '320ms',
  ease: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
  // For a thing that grows from nothing, like a bar on a chart.
  grow: 'cubic-bezier(0.16, 1, 0.3, 1)',
} as const;

// ---------- the stylesheet ----------

export const THEME_SWAP_CLASS = 'theme-swap';

// 🔴 THE CLASS THAT MAKES SWITCHING THEME ACTUALLY WORK. Read THEME_SWAP_JS below before touching.
const THEME_SWAP_CSS = `html.${THEME_SWAP_CLASS},html.${THEME_SWAP_CLASS} *,`
  + `html.${THEME_SWAP_CLASS} *::before,html.${THEME_SWAP_CLASS} *::after{transition:none !important}`;

// The two value lists, written once and worn twice. THEME_CSS hangs them off the toggle's
// attribute for the marketing site; APP_THEME_CSS hangs the same lists off the device setting for
// the app. One copy of each list, or the two surfaces drift exactly the way the two hand typed
// palettes did.
const LIGHT_VARS = `
  --river:${RIVER};--river-deep:${RIVER_DEEP};--river-tint:${RIVER_TINT};--on-river:${ON_RIVER};
  --saffron:${SAFFRON};--saffron-deep:${SAFFRON_DEEP};--saffron-tint:${SAFFRON_TINT};--on-saffron:${ON_SAFFRON};--on-saffron-tint:${ON_SAFFRON_TINT};
  --green:${GREEN};--green-tint:${GREEN_TINT};--on-green:${ON_GREEN};--on-green-tint:${ON_GREEN_TINT};
  --red:${RED};--red-tint:${RED_TINT};--on-red:${ON_RED};
  --whatsapp:${WHATSAPP};--on-whatsapp:${ON_WHATSAPP};--on-white-river:${RIVER};
  --river-panel:${RIVER_PANEL};--river-panel-deep:${RIVER_PANEL_DEEP};
  --bg:${PAPER};--panel:${PANEL};--surface:${SURFACE};--bd:${LINE};--band:${BAND};
  --tx:${INK};--tx-mut:${MUTED};
`;
const DARK_VARS = `
  --river:${DARK_RIVER};--river-deep:${DARK_RIVER_DEEP};--river-tint:${DARK_RIVER_TINT};--on-river:${DARK_ON_RIVER};
  --saffron:${DARK_SAFFRON};--saffron-deep:${DARK_SAFFRON_DEEP};--saffron-tint:${DARK_SAFFRON_TINT};--on-saffron:${DARK_ON_SAFFRON};--on-saffron-tint:${DARK_SAFFRON};
  --green:${DARK_GREEN};--green-tint:${DARK_GREEN_TINT};--on-green:${DARK_ON_GREEN};--on-green-tint:${DARK_GREEN};
  --red:${DARK_RED};--red-tint:${DARK_RED_TINT};--on-red:${DARK_ON_RED};
  --river-panel:${RIVER_PANEL};--river-panel-deep:${RIVER_PANEL_DEEP};
  --bg:${DARK_PAPER};--panel:${DARK_PANEL};--surface:${DARK_SURFACE};--bd:${DARK_LINE};--band:${DARK_BAND};
  --tx:${DARK_INK};--tx-mut:${DARK_MUTED};
`;

// Marketing pages colour themselves from these variables rather than the constants above, so one
// attribute on <html> reskins the whole site. Both themes come from the same values, which is the
// point.
export const THEME_CSS = `
:root{${LIGHT_VARS}}
[data-theme="dark"]{${DARK_VARS}}
${THEME_SWAP_CSS}
`;

// THE APP'S THEME, AND IT FOLLOWS THE DEVICE, NOT A TOGGLE.
//
// The same two value lists as THEME_CSS, hung off prefers-color-scheme instead of the toggle's
// attribute. The app ships zero client JavaScript, so it cannot run the swap script and it cannot
// read the choice the site's toggle stores in localStorage. Jag's call, 31 July 2026: the app
// matches the system setting the way the site does by default, with no toggle of its own, which
// replaced the 30 July "the app stays light" compromise recorded above APP_CSS. A man who forced
// the marketing site light keeps a device dark app, and that is accepted: the app never sees his
// stored choice, and pretending to honour a preference it cannot read would be worse.
//
// color-scheme is declared so the browser's own furniture, form controls and scrollbars, follows
// the same media query the palette does, still with no script. The body rule rides with the
// palette because the app pages paint their canvas on <main>: the browser's default 8 pixel body
// margin was invisible when both sides of it were near white, and in dark it is a white frame
// around every screen.
export const APP_THEME_CSS = `
:root{color-scheme:light dark;${LIGHT_VARS}}
@media(prefers-color-scheme:dark){:root{${DARK_VARS}}}
body{margin:0;background:var(--bg)}
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

// ---------- the app shell ----------
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 ONE COMPOSITION, THREE SCREENS, WRITTEN ONCE.
//
// /app, /app/money and /app/pile share this sheet the way the marketing pages share THEME_CSS.
// test/sharedcss.test.mjs is the record of the alternative: the marketing site kept two copies of
// one stylesheet, a contrast fix landed in one, and the deployed site stayed broken after a build
// that looked green. The app column, the card, the money tile and the desk composition live here
// so that a fix to one of them is a fix to all three screens, without a guard test having to make
// the duplication safe after the fact.
//
// THE SHAPE. One centred column: 640 wide in the hand, 960 from BREAK.desk up, and from desk up
// the card padding, the tile figures and the headings take one step up the type scale. Cards sit
// side by side only where they are true siblings, and each page declares that pairing itself.
// The width in between gets the phone column with air around it, on purpose: a tablet held in a
// kitchen is a big phone, not a small desk. From desk up the nav is a fixed rail of SIDEBAR
// pixels on the left (app/app/AppNav.tsx), so the column centres itself in what remains rather
// than in the viewport, or the rail would sit on top of the first card.
//
// ⚠️ THE APP USED TO STAY LIGHT, AND FROM 31 JULY IT FOLLOWS THE DEVICE INSTEAD. The 30 July
// compromise pinned the app to the light constants because switching theme took the swap script
// and the app ships no client JavaScript at all, so that a man's figures are in the HTML before
// any script could run. test/webauth.test.mjs still holds every screen to that. What changed is
// the mechanism, not the rule: APP_THEME_CSS above carries both palettes under a
// prefers-color-scheme media query, so the browser does the switching and the app still ships not
// one byte of script. This sheet therefore paints with the var() names, and the app pages take
// their colours from lib/apptheme.ts, which maps the same names to the same variables. The site's
// toggle and its localStorage choice belong to the marketing pages alone.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const APP_CSS = `
${APP_THEME_CSS}
@keyframes lek-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.lek-wrap{box-sizing:border-box;max-width:672px;margin:0 auto;padding:${SPACE.md}px ${SPACE.md}px ${SPACE.xxl}px}
.lek-card{background:var(--panel);border:1px solid var(--bd);border-radius:${RADIUS.lg}px;padding:${SPACE.md}px;margin-bottom:${SPACE.sm}px;animation:lek-in ${MOTION.enter} ${MOTION.ease} both}
.lek-hit{transition:transform ${MOTION.quick} ${MOTION.ease},box-shadow ${MOTION.quick} ${MOTION.ease}}
.lek-hit:hover{transform:translateY(-1px);box-shadow:${SHADOW.card}}
.lek-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:${SPACE.sm}px}
.lek-tile{background:var(--surface);border-radius:${RADIUS.md}px;padding:${SPACE.sm}px ${SPACE.md}px}
.lek-tile-label{font-size:${TYPE.label}px;font-weight:700;color:var(--tx-mut);margin-bottom:${SPACE.hair}px}
.lek-tile-value{font-size:${TYPE.stat}px;font-weight:800;letter-spacing:-0.02em;font-variant-numeric:tabular-nums}
.lek-h2{font-size:${TYPE.body}px;font-weight:800;letter-spacing:-0.01em;margin:0 0 ${SPACE.sm}px}
@media(max-width:${BREAK.stack}px){.lek-grid{grid-template-columns:1fr}}
@media(min-width:${BREAK.desk}px){
  .lek-wrap{max-width:992px;padding:${SPACE.xl}px ${SPACE.md}px ${SPACE.xxl * 2}px;margin-left:max(${SIDEBAR + SPACE.lg}px,calc((100vw + ${SIDEBAR}px - 992px)/2));margin-right:auto}
  .lek-card{padding:${SPACE.xl}px;margin-bottom:${SPACE.lg}px}
  .lek-grid{gap:${SPACE.md}px}
  .lek-tile{padding:${SPACE.lg}px}
  .lek-tile-value{font-size:${TYPE.title}px}
  .lek-h2{font-size:${TYPE.strong}px}
}
`;

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
  RIVER_PANEL, RIVER_PANEL_DEEP,
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
  { theme: 'dark', name: 'river-panel', bg: RIVER_PANEL, ink: ON_RIVER },
  { theme: 'dark', name: 'river-panel-deep', bg: RIVER_PANEL_DEEP, ink: ON_RIVER },
  { theme: 'dark', name: 'river-tint', bg: DARK_RIVER_TINT, ink: DARK_RIVER },
  { theme: 'dark', name: 'green-tint', bg: DARK_GREEN_TINT, ink: DARK_GREEN },
  { theme: 'dark', name: 'red-tint', bg: DARK_RED_TINT, ink: DARK_RED },
  { theme: 'dark', name: 'saffron-tint', bg: DARK_SAFFRON_TINT, ink: DARK_SAFFRON },
  // ── The app's own pairings, both themes, added when the app started following the device. ──
  //
  // The app paints accents as TEXT on its three surfaces (a green money figure in a tile, a river
  // "Out", a red overdue) and inks on its tints, so every one of those pairs is held to the same
  // 4.5 the buttons are. The audit that added these also caught two light pairs the app was
  // already shipping under the minimum: brand green on a surface tile at 4.40, and saffron deep
  // on its own tint at 2.70, the exact pair the ON_SAFFRON_TINT comment above warns about. The
  // pages now use ON_GREEN_TINT and ON_SAFFRON_TINT for those inks, and these rows keep it true.
  { theme: 'light', name: 'panel-ink', bg: PANEL, ink: INK },
  { theme: 'light', name: 'panel-muted', bg: PANEL, ink: MUTED },
  { theme: 'light', name: 'panel-river', bg: PANEL, ink: RIVER },
  { theme: 'light', name: 'panel-river-deep', bg: PANEL, ink: RIVER_DEEP },
  { theme: 'light', name: 'panel-green', bg: PANEL, ink: GREEN },
  { theme: 'light', name: 'panel-red', bg: PANEL, ink: RED },
  { theme: 'light', name: 'paper-river', bg: PAPER, ink: RIVER },
  { theme: 'light', name: 'paper-river-deep', bg: PAPER, ink: RIVER_DEEP },
  { theme: 'light', name: 'paper-red', bg: PAPER, ink: RED },
  { theme: 'light', name: 'surface-ink', bg: SURFACE, ink: INK },
  { theme: 'light', name: 'surface-river', bg: SURFACE, ink: RIVER },
  { theme: 'light', name: 'surface-river-deep', bg: SURFACE, ink: RIVER_DEEP },
  { theme: 'light', name: 'surface-green', bg: SURFACE, ink: ON_GREEN_TINT },
  { theme: 'light', name: 'surface-red', bg: SURFACE, ink: RED },
  { theme: 'light', name: 'river-tint-ink', bg: RIVER_TINT, ink: INK },
  { theme: 'light', name: 'river-tint-muted', bg: RIVER_TINT, ink: MUTED },
  { theme: 'light', name: 'saffron-tint-ink', bg: SAFFRON_TINT, ink: INK },
  { theme: 'light', name: 'saffron-tint-muted', bg: SAFFRON_TINT, ink: MUTED },
  { theme: 'light', name: 'green-tint-ink', bg: GREEN_TINT, ink: INK },
  { theme: 'light', name: 'red-tint-ink', bg: RED_TINT, ink: INK },
  { theme: 'dark', name: 'panel-muted', bg: DARK_PANEL, ink: DARK_MUTED },
  { theme: 'dark', name: 'panel-river', bg: DARK_PANEL, ink: DARK_RIVER },
  { theme: 'dark', name: 'panel-river-deep', bg: DARK_PANEL, ink: DARK_RIVER_DEEP },
  { theme: 'dark', name: 'panel-green', bg: DARK_PANEL, ink: DARK_GREEN },
  { theme: 'dark', name: 'panel-red', bg: DARK_PANEL, ink: DARK_RED },
  { theme: 'dark', name: 'paper-river', bg: DARK_PAPER, ink: DARK_RIVER },
  { theme: 'dark', name: 'paper-river-deep', bg: DARK_PAPER, ink: DARK_RIVER_DEEP },
  { theme: 'dark', name: 'paper-red', bg: DARK_PAPER, ink: DARK_RED },
  { theme: 'dark', name: 'surface-ink', bg: DARK_SURFACE, ink: DARK_INK },
  { theme: 'dark', name: 'surface-river', bg: DARK_SURFACE, ink: DARK_RIVER },
  { theme: 'dark', name: 'surface-river-deep', bg: DARK_SURFACE, ink: DARK_RIVER_DEEP },
  { theme: 'dark', name: 'surface-green', bg: DARK_SURFACE, ink: DARK_GREEN },
  { theme: 'dark', name: 'surface-red', bg: DARK_SURFACE, ink: DARK_RED },
  { theme: 'dark', name: 'river-tint-ink', bg: DARK_RIVER_TINT, ink: DARK_INK },
  { theme: 'dark', name: 'river-tint-muted', bg: DARK_RIVER_TINT, ink: DARK_MUTED },
  { theme: 'dark', name: 'river-tint-deep', bg: DARK_RIVER_TINT, ink: DARK_RIVER_DEEP },
  { theme: 'dark', name: 'saffron-tint-ink', bg: DARK_SAFFRON_TINT, ink: DARK_INK },
  { theme: 'dark', name: 'saffron-tint-muted', bg: DARK_SAFFRON_TINT, ink: DARK_MUTED },
  { theme: 'dark', name: 'green-tint-ink', bg: DARK_GREEN_TINT, ink: DARK_INK },
  { theme: 'dark', name: 'red-tint-ink', bg: DARK_RED_TINT, ink: DARK_INK },
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

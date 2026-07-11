// The Lekhio design tokens. One palette, one type scale, one radius system.
// Every page currently declares matching local constants; new code must import
// from here instead, and existing pages migrate as they are touched. If a value
// here and a page ever disagree, this file wins. Keep it boring and stable.

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
export const SURFACE = '#F2F0EA';
export const LINE = '#E7E3D9';
export const MUTED = '#5B6470';
export const WHATSAPP = '#25D366';

export const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

export const RADIUS = { sm: 8, md: 12, lg: 18, pill: 999 } as const;
export const SHADOW = {
  card: '0 1px 2px rgba(17,17,17,0.04), 0 8px 24px rgba(17,17,17,0.06)',
  raised: '0 12px 40px rgba(17,17,17,0.12)',
} as const;

// Shared accessibility CSS, injected into every page's style block. Visible
// keyboard focus on every interactive element, and all animation disabled for
// people who ask the OS for reduced motion.
export const A11Y_CSS = [
  'a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,[tabindex]:focus-visible{outline:3px solid #1B59A6;outline-offset:2px;border-radius:4px}',
  '@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms !important;animation-iteration-count:1 !important;transition-duration:.01ms !important;scroll-behavior:auto !important}}',
].join('');

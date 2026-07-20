// THE CONSOLE'S DESIGN SYSTEM. One file, so there is one answer to every question.
//
// WHY THIS EXISTS AT ALL, when the whole console is four screens.
//
// Because the first version of this page was a system font on a white background with "Sign out"
// floating in the corner, and it looked exactly like what it was: a developer's dashboard that
// nobody had finished. It WORKED. It told the truth. And it did not look like a company.
//
// That matters more here than almost anywhere else, and not for vanity. This is the screen the team
// opens every morning. It is the one place where the business looks at itself. A shabby internal
// tool teaches everyone who uses it that shabby is the standard, and standards leak: a team that
// tolerates an unfinished console will tolerate an unfinished onboarding, and the man up the ladder
// is the one who pays for it.
//
// Discipline shows everywhere or it shows nowhere.
//
// So: one type scale, one spacing rhythm, one set of colours, and no component that invents its own.

// --- colour -------------------------------------------------------------------------------------
// The product's palette. River is the brand blue, Saffron the accent that runs under the wordmark.
export const C = {
  ink: '#111111',
  ink2: '#3D3D3D',
  muted: '#6B7280',
  faint: '#9A968E',

  river: '#1B59A6',
  riverDeep: '#144A8D',
  riverTint: '#EDF3FA',

  saffron: '#E8973A',
  saffronTint: '#FDF3E7',

  green: '#0F7B4F',
  greenTint: '#EAF5EF',
  amber: '#B4690E',
  amberTint: '#FDF3E4',
  red: '#C0392B',
  redTint: '#FDEEEC',

  paper: '#FBFAF7',
  panel: '#FFFFFF',
  line: '#EAE7E0',
  lineSoft: '#F2F0EA',
  band: '#14181F',   // the dark header
} as const;

// --- type ---------------------------------------------------------------------------------------
// A scale, not a pile of arbitrary sizes. Every heading on the console is one of these.
export const FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif';

export const T = {
  // The number on a card. Big, tight, and the only thing on the screen allowed to be this loud.
  metric: { fontSize: 32, fontWeight: 800, letterSpacing: -1.1, lineHeight: 1.05, color: C.ink } as React.CSSProperties,
  metricBig: { fontSize: 44, fontWeight: 800, letterSpacing: -1.6, lineHeight: 1, color: C.ink } as React.CSSProperties,

  // The label above it. Small, upper, quiet. It is a caption, not a headline.
  label: {
    fontSize: 11, fontWeight: 700, letterSpacing: 0.9, textTransform: 'uppercase',
    color: C.faint,
  } as React.CSSProperties,

  // Section headings.
  h1: { fontSize: 26, fontWeight: 800, letterSpacing: -0.7, color: C.ink, margin: 0 } as React.CSSProperties,
  h2: { fontSize: 17, fontWeight: 750, letterSpacing: -0.3, color: C.ink, margin: 0 } as React.CSSProperties,

  body: { fontSize: 14, color: C.ink2, lineHeight: 1.6 } as React.CSSProperties,
  small: { fontSize: 12.8, color: C.muted, lineHeight: 1.6 } as React.CSSProperties,
  tiny: { fontSize: 11.8, color: C.faint, lineHeight: 1.55 } as React.CSSProperties,
} as const;

// --- shape --------------------------------------------------------------------------------------
export const S = {
  page: {
    minHeight: '100vh',
    background: C.paper,
    fontFamily: FONT,
    color: C.ink,
  } as React.CSSProperties,

  // The header. Light and quiet, the Apple way — a white bar with a single hairline. It used to be a
  // dark band ("what makes this a console"); the console reads calmer and more finished light, which is
  // the whole point of the room the team opens every morning.
  header: {
    background: C.panel,
    borderBottom: `1px solid ${C.line}`,
  } as React.CSSProperties,
  headerInner: {
    maxWidth: 1180, margin: '0 auto', padding: '0 26px',
    height: 62, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
  } as React.CSSProperties,
  wordmark: { fontSize: 18, fontWeight: 800, letterSpacing: -0.4, color: C.ink } as React.CSSProperties,
  accent: {
    width: 22, height: 3, borderRadius: 2, display: 'inline-block',
    background: `linear-gradient(90deg, ${C.river}, ${C.saffron})`,
  } as React.CSSProperties,
  headerRole: { fontSize: 12.5, color: C.muted, fontWeight: 600 } as React.CSSProperties,
  headerBtn: {
    background: C.paper, border: `1px solid ${C.line}`,
    color: C.ink2, fontSize: 12.8, fontWeight: 650, fontFamily: FONT,
    padding: '7px 13px', borderRadius: 9, cursor: 'pointer',
  } as React.CSSProperties,

  main: { maxWidth: 1180, margin: '0 auto', padding: '30px 26px 90px' } as React.CSSProperties,

  // Section: a heading with room above it. The rhythm of the page.
  section: { marginTop: 38 } as React.CSSProperties,
  sectionHead: { display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14, flexWrap: 'wrap' } as React.CSSProperties,
  sectionNote: { ...T.small, color: C.faint } as React.CSSProperties,

  panel: {
    background: C.panel,
    border: `1px solid ${C.line}`,
    borderRadius: 16,
    padding: 22,
    boxShadow: '0 1px 2px rgba(17,17,17,0.03)',
  } as React.CSSProperties,

  // A metric card. Restrained: a hairline, a tint, and the number.
  card: {
    flex: '1 1 150px', minWidth: 140,
    background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14,
    padding: '16px 18px 18px',
    boxShadow: '0 1px 2px rgba(17,17,17,0.03)',
  } as React.CSSProperties,
  cards: { display: 'flex', gap: 12, flexWrap: 'wrap' } as React.CSSProperties,

  // Status dot + word. Green means we checked and it is fine, not that we did not look.
  pill: {
    display: 'inline-flex', alignItems: 'center', gap: 7,
    padding: '6px 11px', borderRadius: 999, fontSize: 12.5, fontWeight: 650,
    border: `1px solid ${C.line}`, background: C.panel,
  } as React.CSSProperties,
  dot: { width: 7, height: 7, borderRadius: 4, display: 'inline-block', flex: '0 0 auto' } as React.CSSProperties,

  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.8 } as React.CSSProperties,
  th: {
    textAlign: 'left', padding: '0 16px 11px 0',
    fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: C.faint,
    whiteSpace: 'nowrap',
  } as React.CSSProperties,
  td: { padding: '13px 16px 13px 0', borderTop: `1px solid ${C.lineSoft}`, whiteSpace: 'nowrap' } as React.CSSProperties,

  chip: {
    padding: '7px 13px', borderRadius: 999, border: `1px solid ${C.line}`,
    background: C.panel, fontSize: 12.8, fontWeight: 650, cursor: 'pointer',
    color: C.ink2, fontFamily: FONT,
  } as React.CSSProperties,
  chipOn: { background: C.ink, color: '#fff', borderColor: C.ink } as React.CSSProperties,

  // The honest box. Used wherever the answer is "we do not know", which is a real answer and should
  // look like one rather than like an error.
  honest: {
    background: C.paper, border: `1px dashed ${C.line}`, borderRadius: 12,
    padding: '16px 18px', ...T.small,
  } as React.CSSProperties,

  alarm: {
    background: C.redTint, border: `1px solid #F0C8C2`, color: '#8C2A20',
    borderRadius: 12, padding: '13px 15px', fontSize: 13.2, fontWeight: 600, lineHeight: 1.55,
  } as React.CSSProperties,
} as const;

export const gbp = (pence: number) =>
  `£${(pence / 100).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;

export const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '';

import {
  USE_BANDS, capitalRelief, useBandLabel as bandLabel, type CapitalKind,
} from '../../lib/capital';
import { gbp0 } from '../../lib/money';
import { FONT, MOTION, RADIUS, SPACE, TYPE } from '../../lib/tokens';
import { INK, LINE, MUTED, ON_RIVER, PANEL, RIVER, RIVER_DEEP, SAFFRON_DEEP, SAFFRON_TINT, edge } from '../../lib/apptheme';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE CAR ANSWER, ONCE, FOR EVERY SCREEN THAT ASKS IT.
//
// 🔴 WHY IT IS A COMPONENT AND NOT COPIED INTO TWO PAGES. Two screens now have to ask a man what
// a large purchase was: /app/pile/car, before a payment is filed, and /app/entry, for the ones
// that were filed before we knew to ask. The band list is not decoration, it is four figures of
// his money, worked out from lib/capital.ts. This codebase's own lesson, written into
// lib/ledger.ts and lib/taxoptimiser.ts in the same words twice: two copies of a money rule
// drift, and the copy that drifts is the one he is looking at.
//
// ⚠️ HEADINGS BELONG TO THE PAGES, NOT TO THIS FILE. A man on the pile is being told something
// before he files; a man on the entry screen is correcting something he already filed. Those are
// different sentences and each page writes its own. What is shared is the arithmetic and the two
// paragraphs that explain it, because those are the same fact either way.
//
// ⚠️ AND IT RENDERS, IT NEVER WRITES. Both callers post to a route. A component that also wrote
// would be a second implementation of the ordering rule that keeps a car from being filed with
// its answer lost.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

// What the car actually does to his profit, and the one comparison nobody ever makes for him.
export function CarVerdict({ cost, kind }: { cost: number; kind: CapitalKind }) {
  const atFull = capitalRelief(cost, kind, 100);
  return (
    <>
      {/* lib/capital.ts owns every word of this sentence. The pile, this screen and the vehicle
          calculator all have to say the same thing about the same rule. */}
      <p style={S.says}>{atFull.says}</p>

      {/* 🔴 THE MOST USEFUL SENTENCE IN THE PRODUCT, AND NOBODY TELLS HIM IT. The same money spent
          on a VAN is plant and machinery, inside the AIA, and comes off in full this year. Only
          drawn where it is TRUE: on a new zero emission car the relief is already the whole cost,
          so there would be nothing to compare it with. */}
      {!atFull.inFull && (
        <p style={S.compare}>
          For what it is worth: the same {gbp0(cost)} spent on a van would have come off your
          profit in full this year. A van is plant and machinery and a car is not, and that is the
          whole of the difference.
        </p>
      )}
    </>
  );
}

// The business use question, with every answer priced.
//
// 🔴 RADIOS AND NOT A SELECT, because each answer carries a figure and a select hides three
// quarters of them behind a tap. He is choosing between four amounts of money, so he should be
// able to see four amounts of money.
//
// ⚠️ NOTHING IS PRE-ANSWERED BEYOND THE FIRST BAND BEING CHECKED, and that is not an assumption
// about his driving: a radio group with nothing checked submits nothing at all, and CAA 2001 s205
// needs an answer. The four figures are on the screen, so the man who leaves it on the first one
// has been shown what he is claiming.
export function CarBands({
  cost, kind, action, hidden, submitLabel,
}: {
  cost: number;
  kind: CapitalKind;
  action: string;
  hidden: Record<string, string>;
  submitLabel: string;
}) {
  const priced = USE_BANDS.map((band) => ({ band, relief: capitalRelief(cost, kind, band) }));
  return (
    <form action={action} method="post" style={S.form}>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <fieldset style={S.fieldset}>
        <legend style={S.legend}>Pick the closest</legend>
        {priced.map(({ band, relief }, i) => (
          <label key={band} htmlFor={`band-${band}`} style={S.band}>
            <input
              type="radio"
              id={`band-${band}`}
              name="business_use_pct"
              value={band}
              defaultChecked={i === 0}
              style={S.radio}
            />
            <span style={S.bandText}>
              <span style={S.bandLabel}>{bandLabel(band)}</span>
              <span style={S.bandMoney}>{gbp0(relief.thisYear)} off your profit this year</span>
            </span>
          </label>
        ))}
      </fieldset>
      <button type="submit" className="lek-primary">{submitLabel}</button>
    </form>
  );
}

// The CSS both callers need for the classes used above. Appended to each page's own sheet rather
// than injected here, so a page still owns exactly one <style> tag and there is no ordering
// question about which sheet wins.
export const CAR_CSS = [
  `.lek-primary{width:100%;margin-top:${SPACE.md}px;padding:14px ${SPACE.md}px;font-size:${TYPE.body}px;font-weight:700;font-family:${FONT};color:${ON_RIVER};background:${RIVER};border:none;border-radius:${RADIUS.md}px;cursor:pointer;transition:background-color ${MOTION.quick} ${MOTION.ease}}`,
  `.lek-primary:hover{background:${RIVER_DEEP}}`,
  `input:focus{outline:3px solid ${RIVER};outline-offset:2px}`,
].join('');

const S: Record<string, React.CSSProperties> = {
  says: { fontSize: TYPE.body, lineHeight: 1.6, color: INK, margin: '0 0 12px' },
  // Tinted, because the van comparison is the one thing on the screen he did not come looking for
  // and the one thing he will repeat to somebody else.
  compare: {
    background: SAFFRON_TINT, border: `1px solid ${edge(SAFFRON_DEEP, 27)}`, borderRadius: RADIUS.md,
    padding: 14, fontSize: TYPE.body, lineHeight: 1.55, color: INK, margin: 0,
  },
  form: { margin: '14px 0 0' },
  fieldset: { border: 'none', padding: 0, margin: 0 },
  legend: { fontSize: TYPE.label, fontWeight: 700, color: MUTED, padding: 0, marginBottom: 8 },
  band: {
    display: 'flex', alignItems: 'flex-start', gap: 12, padding: '13px 14px', cursor: 'pointer',
    background: PANEL, border: `1.5px solid ${LINE}`, borderRadius: RADIUS.md, marginBottom: 8,
  },
  radio: { marginTop: 3, width: 20, height: 20, flexShrink: 0, accentColor: RIVER },
  bandText: { display: 'flex', flexDirection: 'column', gap: 2 },
  bandLabel: { fontSize: TYPE.body, lineHeight: 1.4, fontWeight: 700, color: INK },
  bandMoney: { fontSize: TYPE.note, lineHeight: 1.5, color: MUTED, fontVariantNumeric: 'tabular-nums' },
};

import { MOTION } from '../../lib/tokens';
import { GREEN, LINE, MUTED, RIVER } from '../../lib/apptheme';
import { gbp0 } from '../../lib/money';
import { barHeight, type Week } from '../../lib/weekchart';

// HIS WEEK, DRAWN. Seven days, money in and money out, as an SVG the server has already finished.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ NO CHART LIBRARY, AND NOT BECAUSE WE ARE BEING CLEVER.
//
// The smallest respectable charting library is a couple of hundred kilobytes of JavaScript that has
// to arrive, parse and run before a single bar appears. He is on a cheap Android on a bad signal,
// standing in somebody's kitchen with one hand on a ladder. An SVG is finished before it leaves the
// server: the bars are in the HTML, so they are on the screen the instant the page paints, on a
// dead phone, with scripting switched off.
//
// ⚠️ AND THE ANIMATION IS CSS, FOR THE SAME REASON.
//
// The bars grow from the baseline with one keyframe and a per day delay. MOTION.grow exists for
// exactly this ("for a thing that grows from nothing, like a bar on a chart") and MOTION.enter is
// the duration for something arriving for the first time. There is no sixth timing invented here.
// A11Y_CSS on the page already collapses every animation to nothing when the operating system asks
// for reduced motion, so a man who cannot take movement gets the same chart standing still.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ NOT ONE FIGURE IS WORKED OUT HERE. lib/weekchart.ts buckets the rows and lib/supabase.ts
// fetches them once, so the bars and the sentence above them are the same arithmetic. See that
// file's header: the chart and the sentence disagreeing is the failure this whole shape exists to
// make impossible.

// ⚠️ THE SHAPE OF THE BOX, AND THE FIRST TWO VERSIONS OF IT WERE WRONG. Both found by looking at a
// screenshot, neither visible in the source.
//
// ONE: it was drawn with width="100%" AND height="128". An SVG keeps its aspect ratio by default, so
// the browser fitted a 210 by 128 drawing inside a 358 by 128 box and centred it, leaving the chart
// floating in the middle of the card with a finger of empty space down each side.
//
// TWO: with that fixed height removed the drawing scaled to the full width, AND SO DID THE DAY
// LETTERS INSIDE IT. On a phone they were 13 pixels and on a laptop they were 24, because text in a
// scaled SVG is not text at a font size, it is a drawing of text. So the letters are ordinary HTML
// underneath, in a seven column grid that lines up with the columns above them, at one size on every
// screen. The SVG now holds bars and a baseline and nothing else.
//
// What is left is therefore a RATIO as much as a size: about three to one, which is roughly 115
// pixels tall on a phone and 185 on a laptop. Tall enough to compare two days at a glance, short
// enough that the chart does not push what is waiting on him off the bottom of the screen.
const H = 62;    // the drawing area, in the same units the viewBox uses
const COL = 34;  // one day
const BAR = 12;  // one bar
const GAP = 4;   // between the in bar and the out bar of one day
const W = COL * 7;

export function WeekChart({ week }: { week: Week }) {
  const max = H - 4;

  // The sentence a screen reader gets instead of the picture. It carries the same two figures the
  // line above the chart does, because a description that says "a bar chart" describes nothing.
  const label = `Your last seven days. ${gbp0(week.income)} in and ${gbp0(week.expenses)} out.`;

  const anyIn = week.days.some((d) => d.income > 0);
  const anyOut = week.days.some((d) => d.expenses > 0);

  return (
    <figure style={S.fig}>
      <style>{CSS}</style>

      {/* ⚠️ preserveAspectRatio="none" AND A FIXED HEIGHT, so the drawing fills the card sideways
          while the height stays the height we chose. It is the pair that makes the chart the same
          shape on a phone and a laptop.
          The cost is that the horizontal and vertical scales differ, so there are no rounded corners
          on the bars: a radius would come out as a squashed oval, wider at the top of a tall bar
          than at the top of a short one. Square corners are the honest answer, not an oversight. */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={label}
        preserveAspectRatio="none"
        style={{ display: 'block', width: '100%', height: 116 }}
      >
        {week.days.map((d, i) => {
          const inH = barHeight(d.income, week.peak, max);
          const outH = barHeight(d.expenses, week.peak, max);
          // ⚠️ THE PAIR IS CENTRED IN ITS COLUMN, so a bar sits over the letter it belongs to. The
          // first version started them a fixed distance from the left edge of the day while the
          // letter underneath was centred, which is two ways of positioning one thing.
          const x = i * COL + (COL - (BAR * 2 + GAP)) / 2;
          // Each day starts a fraction after the one before it, so the week reads left to right the
          // way he lived it. Well under a tenth of a second apart: a wave, not a queue.
          const delay = `${i * 45}ms`;
          return (
            <g key={d.iso}>
              {/* ⚠️ fill LIVES IN style, NOT IN THE ATTRIBUTE. The colours are now CSS custom
                  properties so the chart follows the device theme, and var() only resolves in CSS,
                  never in an SVG presentation attribute. A fill attribute of var(--green) paints
                  black. */}
              {inH > 0 && (
                <rect
                  className="lek-bar" style={{ animationDelay: delay, fill: GREEN }}
                  x={x} y={H - inH} width={BAR} height={inH}
                />
              )}
              {outH > 0 && (
                <rect
                  className="lek-bar" style={{ animationDelay: delay, fill: RIVER }}
                  x={x + BAR + GAP} y={H - outH} width={BAR} height={outH}
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* The baseline is a border rather than a line inside the drawing, so it stays one pixel
          thick at every width instead of being stretched with everything else. */}
      <div className="lek-week-days" aria-hidden="true">
        {week.days.map((d) => <span key={d.iso}>{d.initial}</span>)}
      </div>

      {/* Which colour is which. A chart nobody can read is a decoration.
          ⚠️ AND ONLY FOR A COLOUR THAT IS ACTUALLY ON THE CHART. Seen on the deployed site: a week
          with nothing coming in still offered a green key for "In", pointing at a colour that
          appeared nowhere. Doc 103's empty test in miniature, and the smallest version of the thing
          that makes a man stop reading a screen. */}
      <figcaption style={S.key}>
        {anyIn ? <span style={S.keyItem}><i style={{ ...S.swatch, background: GREEN }} /> In</span> : null}
        {anyOut ? <span style={S.keyItem}><i style={{ ...S.swatch, background: RIVER }} /> Out</span> : null}
      </figcaption>
    </figure>
  );
}

// transform-box: fill-box is what makes an SVG rectangle scale about its own bottom edge rather
// than about the corner of the drawing. Without it the bars grow out of the top left corner.
const CSS = `
.lek-bar{transform-origin:bottom;transform-box:fill-box;animation:lek-grow ${MOTION.enter} ${MOTION.grow} both}
@keyframes lek-grow{from{transform:scaleY(0)}to{transform:scaleY(1)}}
.lek-week-days{display:grid;grid-template-columns:repeat(7,1fr);border-top:1px solid ${LINE};padding-top:7px}
.lek-week-days span{text-align:center;font-size:12px;font-weight:700;color:${MUTED}}
`;

const S: Record<string, React.CSSProperties> = {
  fig: { margin: '16px 0 0' },
  key: { display: 'flex', gap: 16, justifyContent: 'center', margin: '12px 0 0', fontSize: 12.5, fontWeight: 700, color: MUTED },
  keyItem: { display: 'inline-flex', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3, display: 'inline-block' },
};

// The MTD income slider on /how-mtd-works. Does the picture agree with the arithmetic?
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS SUITE EXISTS TO PREVENT.
//
// RUN 0 of the customer week, 11 August 2026, probed the slider and found the rail linear: value
// 50 shows £50,000, value 75 shows £75,000, one unit is £1,000. The five axis labels underneath
// were laid out with `justify-content:space-between`, which spaces them EVENLY regardless of what
// they say. So on a linear rail:
//
//     drawn at        should be at
//     £20k   25%          20%
//     £30k   50%          30%
//     £50k   71.4%        50%
//
// A thumb at £60,000 sat visibly LEFT of the mark reading "£50k", while the verdict box beneath
// correctly told him he was over the £50,000 line. The three numbers in the wrong places were the
// three mandation thresholds, which is the whole reason the widget exists.
//
// Nothing was wrong with the logic. The drawing was wrong, and a man reads the drawing.
//
// The rule this suite enforces: A LABEL'S POSITION IS DERIVED FROM ITS VALUE, never chosen. Any
// layout that spaces labels by count rather than by value fails here, whatever it looks like.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { FACTS } from '../lib/taxengine.ts';

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}`);
  }
}

const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.resolve(here, '..', 'app/how-mtd-works/page.tsx'), 'utf8');

console.log('\n--- 1. THE RAIL. What one unit of the slider is worth ---\n');

const input = /<input type="range"([^>]*)\/>/.exec(src)?.[1] ?? '';
ok('the range input exists and was read', input.length > 0);

const railMax = Number(/max="(\d+)"/.exec(input)?.[1]);
const railMin = Number(/min="(\d+)"/.exec(input)?.[1]);
ok('the rail runs from 0', railMin === 0);
ok('the rail runs to 100', railMax === 100);

// The browser side reads the same input. money(k) is '£' + (k*1000), so one unit is £1,000.
ok('one slider unit is £1,000, read off the script that draws the figure',
  /function money\(k\)\{return '£'\+\(k\*1000\)/.test(src));

// ⚠️ min="0" IS LOAD BEARING ELSEWHERE TOO. MTD_CSS's own note says the money formatter is safe by
// construction only because k can never be negative. A negative range would break more than this.
ok('and the input is still non negative, which the money formatter depends on', railMin === 0);

console.log('\n--- 2. THE GEOMETRY. Position is computed, never chosen ---\n');

const sliderMax = Number(/const SLIDER_MAX = ([\d_]+);/.exec(src)?.[1]?.replace(/_/g, ''));
const thumbPx = Number(/const THUMB_PX = (\d+);/.exec(src)?.[1]);

ok('SLIDER_MAX is declared', Number.isFinite(sliderMax));
ok('🔴 SLIDER_MAX AGREES WITH THE RAIL ITSELF, so moving one moves the other',
  sliderMax === railMax * 1000);

ok('THUMB_PX is declared', Number.isFinite(thumbPx));
// The thumb width lives in two CSS rules (webkit and moz). Both must match the constant, or the
// labels are drawn against a thumb that is not the size the arithmetic assumes.
const thumbRules = [...src.matchAll(/-thumb\{[^}]*width:(\d+)px/g)].map((m) => Number(m[1]));
ok('the thumb is styled in both engines', thumbRules.length === 2);
ok(`🔴 AND BOTH THUMB RULES ARE ${thumbPx}px, matching THUMB_PX`,
  thumbRules.length === 2 && thumbRules.every((w) => w === thumbPx));

// The one line that decides every label's position.
const tickLeft = /const tickLeft = \(value: number\): string =>\s*\n?\s*`([^`]+)`/.exec(src)?.[1] ?? '';
ok('tickLeft exists and was read', tickLeft.length > 0);
ok('🔴 THE POSITION IS DIVIDED BY SLIDER_MAX, which is what makes it the value\'s own place',
  tickLeft.includes('${value / SLIDER_MAX}'));
ok('it accounts for the thumb, so the label sits under the thumb and not near it',
  tickLeft.includes('100% - ${THUMB_PX}px') && tickLeft.includes('${THUMB_PX / 2}px'));

console.log('\n--- 3. THE LABELS. Each one at its own value ---\n');

const ticksBlock = /const TICKS: \{ text: string; value: number \}\[\] = \[([\s\S]*?)\];/.exec(src)?.[1] ?? '';
ok('the TICKS table exists and was read', ticksBlock.length > 0);

const entries = [...ticksBlock.matchAll(/\{ text: (.+?), value: (.+?) \}/g)]
  .map((m) => ({ label: m[1].trim(), value: m[2].trim() }));
ok('five labels, as drawn', entries.length === 5);

// 🔴 THE THRESHOLDS ARE THE CONSTANTS, NOT COPIES OF THEM. If HMRC moves a line, the number on the
// label and the place it is drawn move together, because they are the same expression.
const named = { T28: FACTS.mtdThreshold2028, T27: FACTS.mtdThreshold2027, T26: FACTS.mtdThreshold2026 };
for (const [k, v] of Object.entries(named)) {
  const row = entries.find((e) => e.value === k);
  ok(`🔴 the ${k} label is positioned by the constant ${k} itself (£${v.toLocaleString('en-GB')}), not a literal`,
    Boolean(row));
  ok(`and its text is derived from the same constant`, row?.label === `\`\${${k} / 1000}k\``);
}
ok('the ends are the ends of the rail', entries[0]?.value === '0' && entries[4]?.value === 'SLIDER_MAX');

// The arithmetic itself, on the numbers that were wrong.
const fractionOf = (pounds) => pounds / sliderMax;
console.log('\n--- 4. THE REGRESSION. The three numbers that were drawn in the wrong places ---\n');
ok(`🔴 £${(named.T28 / 1000)}k is drawn at ${(fractionOf(named.T28) * 100).toFixed(1)}% of the rail, NOT 25%`,
  Math.abs(fractionOf(named.T28) - named.T28 / sliderMax) < 1e-9 && Math.abs(fractionOf(named.T28) - 0.25) > 0.01);
ok(`🔴 £${(named.T27 / 1000)}k is drawn at ${(fractionOf(named.T27) * 100).toFixed(1)}% of the rail, NOT 50%`,
  Math.abs(fractionOf(named.T27) - 0.5) > 0.01);
ok(`🔴 £${(named.T26 / 1000)}k is drawn at ${(fractionOf(named.T26) * 100).toFixed(1)}% of the rail, NOT 71.4%`,
  Math.abs(fractionOf(named.T26) - 0.714) > 0.01);
ok('🔴 AND £50,000 SITS AT HALF WAY, WHICH IS THE WHOLE FIX', fractionOf(50_000) === 0.5);

// A thumb at £60,000 must now be drawn to the RIGHT of the £50k mark. That single sentence is the
// customer visible fault, so it is asserted as a sentence.
ok('🔴 A THUMB AT £60,000 IS NOW RIGHT OF THE £50k MARK, WHICH IT WAS NOT',
  fractionOf(60_000) > fractionOf(named.T26));

console.log('\n--- 5. THE LAYOUT. Even spacing can never come back ---\n');

const ticksCss = /\n\.ticks\{([^}]*)\}/.exec(src)?.[1] ?? '';
const tickSpanCss = /\n\.ticks span\{([^}]*)\}/.exec(src)?.[1] ?? '';
ok('.ticks is styled', ticksCss.length > 0);
ok('.ticks span is styled', tickSpanCss.length > 0);
ok('🔴 THE LABEL ROW NO LONGER SPACES BY COUNT. justify-content is gone from .ticks',
  !ticksCss.includes('justify-content'));
ok('and it is not a flex row at all, so nothing can space them for us',
  !ticksCss.includes('display:flex'));
ok('each label is placed absolutely, by the left tickLeft() computes',
  tickSpanCss.includes('position:absolute'));
ok('and centred on that point rather than starting at it',
  tickSpanCss.includes('transform:translateX(-50%)'));

// Belt and braces: no hardcoded percentage anywhere in the tick markup.
const ticksMarkup = /<div className="ticks">[\s\S]*?<\/div>/.exec(src)?.[0] ?? '';
ok('the markup exists and was read', ticksMarkup.length > 0);
ok('🔴 not one hardcoded percentage in the tick markup', !/\d+(\.\d+)?%/.test(ticksMarkup));
ok('every label goes through tickLeft', /style=\{\{ left: tickLeft\(t\.value\) \}\}/.test(ticksMarkup));
// ⚠️ AND THE £ IS STILL PUT ON BY THE JSX, not built in TypeScript. test/webauth.test.mjs excepts
// this file for the injected slider script ALONE, and the exception is held to that reason.
ok('the pound sign comes from the markup, keeping the money formatter exception honest',
  />£\{t\.text\}</.test(ticksMarkup));

console.log('\n--- 6. UNTOUCHED. The parts RUN 0 found correct ---\n');

ok('the aria label still describes what the number means',
  input.includes('aria-label="Your gross income for the year, turnover and rent added together before expenses"'));
ok('the verdict still tests gross income against the thresholds in order',
  /if\(gross>\$\{T26\}\)[\s\S]*?else if\(gross>\$\{T27\}\)[\s\S]*?else if\(gross>\$\{T28\}\)/.test(src));
ok('the £ display is still built by money(k) from the slider value',
  /var k=\+slider\.value;var iv=document\.getElementById\('incomeVal'\);if\(iv\)iv\.textContent=money\(k\)/.test(src));

// ⚠️ NO keydown HANDLER NEAR THE SLIDER. RUN 0 flagged the slider as possibly not keyboard
// operable. It reproduced under browser automation and did NOT reproduce as a defect: a bare
// <input type="range"> injected onto the same live page refused the same synthetic arrow keys
// while holding focus, which is the tooling and not the page. A native range is keyboard operable
// by default, and the only thing that could take that away is a handler eating the keys. There is
// none, and this line is what stops one arriving unnoticed.
ok('🔴 nothing intercepts keys on this page, so the native range stays keyboard operable',
  !/keydown|keyup|keypress|preventDefault/.test(src));

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

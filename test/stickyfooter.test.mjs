// A fixed bar at the bottom of the page has to pay for its own space.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// RUN 0 of the customer week, 11 August 2026. At maximum scroll the footer's last line ended
// level with the bottom of the viewport, and the fixed "7 days free. No card. / Start free" bar
// sat on top of it. The line underneath was the statutory one:
//
//   "Lekhio Ltd is a company registered in England and Wales, company number 17329341.
//    Registered office: 52 Harrington Road, London, E11 4QW."
//
// The end of it could not be read at any scroll position, on any page carrying the bar.
//
// ⚠️ THE REPORT SAID DESKTOP. IT IS THE PHONE. `.stickycta` is display:none above 760px and always
// has been, so no desktop has ever drawn it. The measurement was taken with the bar forced
// visible, which is why the overlap is real and the width in the report is not. Recorded here
// because a fix written for the wrong viewport is a fix that does nothing.
//
// THE RULE: if a bar is position:fixed to the bottom of the viewport, the same stylesheet must
// reserve that height at the end of the page. Not a guess at the height. THE SAME NUMBER, so the
// two cannot drift the next time somebody changes the button's padding.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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
const root = path.resolve(here, '..');
const src = readFileSync(path.join(root, 'app/_shared/site.tsx'), 'utf8');

console.log('\n--- 1. The bar is still what it was: a phone bar, fixed to the bottom ---\n');

// ⚠️ TO END OF LINE, NOT TO THE NEXT BRACE. The rule interpolates ${LINE}, so a [^}]* capture
// stops dead inside it and everything after the border declaration goes unchecked. That is how a
// guard reads green over a line it never saw.
const barRule = /\n\s*\.stickycta\{--stickycta-h[^\n]*/.exec(src)?.[0] ?? '';
ok('the visible .stickycta rule was read', barRule.length > 0);
ok('it is still fixed to the bottom of the viewport',
  /position:fixed/.test(barRule) && /bottom:0/.test(barRule));
ok('it is still hidden by default', /\.stickycta\{display:none\}/.test(src));

// Which media query it lives in decides which customers ever see it.
const mq = /@media \(max-width:(\d+)px\)\{[^@]*?\.stickycta\{--stickycta-h/.exec(src);
ok('🔴 the bar is drawn on PHONE WIDTHS ONLY, which is where the fault actually was',
  mq !== null && Number(mq[1]) <= 760);

console.log('\n--- 2. The space is reserved, and from the same number ---\n');

const heightDecl = /--stickycta-h:(\d+)px/.exec(src);
ok('the bar declares its own height as a named number', heightDecl !== null);
const barHeight = Number(heightDecl?.[1]);
ok(`🔴 AND IT OCCUPIES THAT HEIGHT (min-height:var(--stickycta-h)), so the number is not a guess`,
  /min-height:var\(--stickycta-h\)/.test(barRule));
ok('with border-box, or padding would push it past the height it claims',
  /box-sizing:border-box/.test(barRule));

const reserve = /body:has\(\.stickycta\) \.sitefooter\{padding-bottom:calc\((\d+)px \+ env\(safe-area-inset-bottom\)\)\}/.exec(src);
ok('🔴 THE PAGE RESERVES THE STRIP THE BAR COVERS', reserve !== null);
ok(`🔴 AND IT RESERVES THE SAME ${barHeight}px THE BAR OCCUPIES`,
  reserve !== null && Number(reserve[1]) === barHeight);
ok('the reservation allows for the phone\'s home indicator, exactly as the bar does',
  reserve !== null && /env\(safe-area-inset-bottom\)/.test(barRule));

// Scoped two ways on purpose, and both matter.
const reserveLine = reserve?.[0] ?? '';
ok('🔴 it applies only where the bar exists, so pages without one gain no dead space',
  reserveLine.startsWith('body:has(.stickycta)'));
{
  // The reservation must sit INSIDE the same media query as the bar, or a desktop page gets a
  // strip of nothing under its footer for a bar it never draws.
  const block = /@media \(max-width:760px\)\{[\s\S]*?\n\}/.exec(src)?.[0] ?? '';
  ok('🔴 and only at the widths that draw it', block.includes('body:has(.stickycta) .sitefooter'));
}

console.log('\n--- 3. It lands on the footer, so the dark carries on underneath ---\n');

ok('the footer element carries the class the rule targets',
  /<footer className="sitefooter"/.test(src));
ok('and it is still the dark band, which is why the padding goes here and not on the body',
  /<footer className="sitefooter" style=\{\{ background: INK_BG/.test(src));

console.log('\n--- 4. The line that could not be read is still there to read ---\n');
{
  ok('the company number is still in the footer', /17329341/.test(src));
  ok('🔴 and the registered office label, which is the half that was covered',
    /Registered office: \{COMPANY\.office\}/.test(src));
  ok('and the address it prints', /office: '52 Harrington Road, London, E11 4QW'/.test(src));
}

console.log('\n--- 5. The general rule, swept rather than spot checked ---\n');
{
  // Any OTHER rule that pins something to the bottom of the viewport has the same obligation. This
  // is the part that catches the next one, rather than the one we just fixed.
  const bottomFixed = [...src.matchAll(/\.([a-z0-9-]+)\{[^}]*position:fixed[^}]*bottom:0[^}]*\}/g)]
    .map((m) => m[1]);
  ok(`every bottom fixed bar in the shared stylesheet is accounted for (${bottomFixed.join(', ') || 'none'})`,
    bottomFixed.every((cls) => src.includes(`body:has(.${cls})`)));
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

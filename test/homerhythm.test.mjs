// The home page on a phone: does it settle, and how much is he asked to read?
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// THIS SUITE SHIPS WITH FIX 6 OF THE RUN 0 PACKET AND IS DROPPED WITH IT.
//
// Everything else in that packet is mechanical. This one is taste, and the taste is the
// founder's own, from his own handset on 11 August 2026: nothing overlaps, nothing clips, but
// "there's way too much writing on there, it's too much reading on mobile", and the alignment
// alternates centred, off centre, centred, so the page never settles.
//
// You cannot test "too much reading". You CAN test the two things underneath it:
//
//   1. THE DISCIPLINE IS HELD. On a phone every content section is a centred heading over a left
//      body. The hero and the closing card are their own pattern and stay centred. A section that
//      wanders out of that is what "never settles" actually looks like in CSS.
//   2. THE HEAVIEST BLOCK IS NOT DRAWN TWICE. The review belt loops by carrying a second copy of
//      every quote. On a phone that is 370 words of a 1,191 word page, half of it already read,
//      moving at a speed he did not choose.
//
// ⚠️ THE ONLY PROOF THAT REALLY COUNTS FOR THIS ONE IS JAG LOOKING AT IT. These assertions stop
// the decision being undone by accident. They cannot tell you it was the right decision.
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
const src = readFileSync(path.join(root, 'app/page.tsx'), 'utf8');

// The stylesheet only, so a selector quoted in a comment cannot satisfy anything below.
const css = (() => {
  const i = src.indexOf('const HOME_CSS =');
  const open = src.indexOf('`', i);
  const close = src.indexOf('`;', open + 1);
  return src.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, '');
})();
ok('HOME_CSS was read, and its comments stripped', css.length > 1000 && !css.includes('🔴'));

console.log('\n--- 1. The two sections that broke the rhythm ---\n');

ok('🔴 THE ARGUMENT HEADING IS CENTRED ON A PHONE, like every other content heading',
  /@media\(max-width:760px\)\{[^@]*\.home \.argsec > \.h2\{text-align:center\}/.test(css));
ok('and the section carries the class the rule needs', /className="reveal argsec"/.test(src));

ok('🔴 THE THREE STEP CARDS READ LEFT ON A PHONE, like every other content body',
  /\.home \.hstep\{text-align:left\}/.test(css));
ok('and the number moves left with the words, rather than floating over them',
  /\.home \.hstep \.stepn\{margin:0 0 16px\}/.test(css));

// The desktop rule is untouched: three cards in a row still centre, which is right in three columns.
ok('the desktop treatment is unchanged, because at three columns centred is correct',
  /\n\.hstep\{text-align:center\}/.test(css));

// The two patterns that are allowed to be centred throughout, named so the discipline is readable.
ok('the hero still centres itself at one column, which is what a front door does',
  /@media\(max-width:900px\)\{\.hero \.grid\{[^}]*text-align:center\}/.test(css));
ok('and the closing card is still centred', /\.final\{[^}]*text-align:center/.test(css));

console.log('\n--- 2. The heaviest block is no longer drawn twice on a phone ---\n');

const phoneRev = /@media\(max-width:640px\)\{\n\.home \.rev-marquee[\s\S]*?\n\}/.exec(css)?.[0] ?? '';
ok('the phone review rules were found', phoneRev.length > 0);
ok('🔴 THE DUPLICATE PASS IS HIDDEN, so no quote is read twice',
  /\.home \.rev-track \.quote\[aria-hidden="true"\]\{display:none\}/.test(phoneRev));
ok('🔴 AND IT DOES NOT MOVE ON ITS OWN, so he reads at his own pace',
  /\.home \.rev-track\{animation:none/.test(phoneRev));
ok('he can swipe it', /\.home \.rev-marquee\{overflow-x:auto/.test(phoneRev));
ok('and the next card peeks in, which is how a thumb learns there is one',
  /\.home \.rev-track \.quote\{width:min\(320px,84vw\)\}/.test(phoneRev));
ok('the fade mask goes, because a mask over a scrollable row hides the thing it is hinting at',
  /mask-image:none/.test(phoneRev));

// 🔴 THE SAME TREATMENT THE REDUCED MOTION READER ALREADY GETS. Not a new pattern, the proven one.
const reduced = /@media \(prefers-reduced-motion: reduce\)\{[^@]*?\}\n/.exec(css)?.[0] ?? '';
ok('the reduced motion branch still exists', reduced.length > 0);
for (const decl of ['animation:none', 'overflow-x:auto', 'display:none']) {
  ok(`the phone gets the same treatment as reduced motion: ${decl}`,
    reduced.includes(decl) && phoneRev.includes(decl));
}

// And the belt itself is untouched on desktop, where an ambient loop is fine.
ok('the belt still loops on a desktop', /\.rev-track\{display:flex;gap:18px;width:max-content;animation:hslide/.test(css));
ok('and every real quote is still rendered, so nothing was cut from the page itself',
  /\(reviewBelt \? \[\.\.\.reviews, \.\.\.reviews\] : reviews\)\.map/.test(src));

console.log('\n--- 3. What was taken out, counted ---\n');
{
  // Doc 103's standing question runs the other way here: nothing was added, so what went.
  ok('🔴 the three steps sub line is gone, because the three cards say it in the next forty words',
    !/Set it up once\. It works in the background from then on\./.test(src));
  ok('and the cut is recorded where the line was, not just in a commit message',
    /Cut on\s*\n?\s*.*11 August 2026 for the mobile reading load/.test(src));

  // The spine stays. This is the sentence the product is built on and it is not a candidate.
  ok('🔴 THE HONESTY SPINE IS UNTOUCHED',
    /Any app that says it will do your tax for you is lying to you\./.test(src));
  ok('the deal is still three rows and still ends in approve',
    /Lekhio prepares it\./.test(src) && /It shows you the working\./.test(src) && /You press approve\./.test(src));
  ok('and the control pair still ships as a pair', /\{pair\.costs\}/.test(src) && /\{pair\.income\}/.test(src));
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

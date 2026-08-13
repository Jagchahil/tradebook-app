// R2-F31. A SUCCESS MESSAGE IN THE DANGER COLOUR, DIRECTLY UNDER THE DELETE FORM.
// Run with: node test/datadoorconfirm.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Found on 13 August 2026 by actually unplugging Rosa's phone at the end of Run 2, rather than by
// reading the code that does it. It is not visible any other way: the string is only drawn after a
// real POST, and it only lands where it lands once the section above it has correctly vanished.
//
// "Done. That number is free to connect anywhere now." was drawn with `armed`, which is RED_TINT:
// the style that exists for the moment a DELETE is armed. The unplug section then correctly
// disappears (the number is gone, so the section has nothing to say), which leaves that red box
// sitting immediately beneath the "Delete everything" card and its "Type DELETE to carry on" form.
//
// A customer who has just unplugged a phone scrolls down and reads, in red, under a delete form:
// "Done." On the one screen in this product where misreading that costs him everything he has.
//
// ⚠️ THE PLACEMENT ITSELF IS RIGHT AND MUST NOT BE "FIXED". The file already explains why the line
// lives outside the gate: "the gate is false by the time he reads it... He would press the button
// and watch the whole thing disappear without a word." That reasoning is correct. The colour and
// the wording were the bug.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const src = readFileSync(path.join(root, 'app/app/you/data/page.tsx'), 'utf8');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const code = codeOnly(src);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.error(`  FAIL ${name}`); } };

console.log('A. 🔴 The success is not drawn in the danger colour');

ok('there is a success style', /done: \{[^}]*GREEN_TINT/.test(code));
ok('🔴 and it is NOT the red tint', !/done: \{[^}]*RED_TINT/.test(code));
ok('the unplug confirmation uses it', /=== 'unplugged' \? <p style=\{S\.done\}>/.test(code));
ok('🔴 and no longer uses the armed style', !/=== 'unplugged' \? <p style=\{S\.armed\}>/.test(code));

// `armed` must still exist and still be red: it is the correct style for the state it is named for.
ok('the armed style is untouched and still red', /armed: \{[^}]*RED_TINT/.test(code));
// The failure message must STAY red. A failed unplug is a warning and always was.
ok('a FAILED unplug is still a warning', /=== 'unplugfailed' \? <p style=\{S\.warn\}>/.test(code));
ok('and warn is still red', /warn: \{[^}]*RED_TINT/.test(code));

console.log('B. The sentence names the action, because "Done." on this page is not enough');

ok('🔴 it says what was done', /Your phone is unplugged\./.test(code));
ok('and it no longer opens with a bare Done', !/>Done\. That number/.test(code));
ok('it still says the number is free', /free to connect anywhere now/.test(code));

console.log('C. 🔴 The placement is deliberate and must not be "tidied" back inside the gate');

// The line has to sit OUTSIDE the phoneTail gate, or it vanishes on the redirect that earned it.
const gateAt = code.indexOf("{one('done') === 'unplugged'");
const closeAt = code.lastIndexOf(') : null}', gateAt);
ok('the confirmation exists', gateAt > 0);
ok('🔴 and it sits after the section gate closes, not inside it', closeAt > 0 && closeAt < gateAt);
// The reasoning must survive as a comment, because the next person will think it is misplaced.
// The comment wraps across a line, so the whitespace has to be tolerant or the guard fails on
// formatting rather than on meaning.
ok('the reasoning is written down for whoever moves it next',
  /the gate is false by the time he\s+reads it/.test(src));

console.log('');
console.log(`${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

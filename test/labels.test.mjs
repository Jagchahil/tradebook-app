// EVERY INPUT ON THE WEBSITE HAS A NAME A SCREEN READER CAN SAY.
//
// WHY THIS IS A TEST AND NOT A ONE OFF TIDY UP
//
// We answered HMRC's production credentials form, in writing, on an application that is currently
// sitting in their queue:
//
//     "Does your software meet accessibility standards?  Yes."
//
// At the moment we answered it, fourteen fields across five files had a <label> sitting NEAR an
// <input> with nothing connecting them, and some had no label at all, only a placeholder. To a
// sighted man they look labelled. To a screen reader they are announced as "edit text", with no clue
// whether the box wants his income or his expenses, and the hint underneath is never read out.
//
// A placeholder is not a label. It disappears the moment he starts typing.
//
// Doc 104, standing question five: is it TRUE? Not is it defensible. True. This test is what keeps
// the answer we gave HMRC true after the next person adds a form in a hurry.
//
// ⚠️ AND A CORRECTION, LEFT HERE ON PURPOSE. An earlier version of this comment said the signup
// honeypot was not aria-hidden, and told a story about blind users being read the bot trap, filling
// it in, and being silently binned as robots. IT WAS ALREADY aria-hidden. I had grepped the first
// few lines of the tag, not the whole of it, believed what I saw, and built a vivid story on top of
// it. The only reason I found out was that my own script added a DUPLICATE aria-hidden and broke the
// build.
//
// Fourteen real findings and one invented one. The invented one was the most convincing. That is
// what makes it worth writing down.
//
// THE RULE: every input, select and textarea on the public site must be reachable by name. Either
// a <label htmlFor> pointing at its id, or an aria-label, or wrapped inside its own <label>.

import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '..');

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

// lstat, not stat, and skip what we do not need. See the long note in test/onlyoneengine.test.mjs:
// its identical walk() took the WHOLE test suite down by calling statSync on a dangling symlink in a
// bundled node install. statSync FOLLOWS the link and THROWS when the target is missing. This walk
// had exactly the same bug sitting in it, waiting.
//
// A guard that can crash is not a guard. It is a second thing that can break.
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'test', 'scripts', 'khoji', '.node', 'ios', 'android']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || name.startsWith('.')) continue;
    const full = path.join(dir, name);
    let st;
    try {
      st = lstatSync(full);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(name)) out.push(full);
  }
  return out;
}

console.log('\nlabels: every field has a name a screen reader can say');

const naked = [];

for (const file of [...walk(path.join(root, 'app')), ...walk(path.join(root, 'components'))]) {
  const rel = path.relative(root, file);
  const src = readFileSync(file, 'utf8');

  // Every opening <input …>, <select …>, <textarea …> tag, with ALL of its attributes.
  //
  // ⚠️ A NAIVE /<input\b[^>]*>/ IS WRONG AND IT LIED TO ME ON THE FIRST RUN. JSX attributes contain
  // arrow functions: `onChange={(e) => setEmail(e.target.value)}`. That `>` ends the match early, so
  // the tag is cut off before the aria-label that comes after it, and the test reports a field as
  // unnamed when it is perfectly well named.
  //
  // It flagged two fields I had labelled myself an hour earlier. A test that cries wolf is a test
  // somebody deletes, and it would have taken the two REAL findings down with it.
  //
  // So walk the characters and track brace depth. A `>` only closes the tag at depth zero.
  const tags = [];
  for (const m of src.matchAll(/<(input|select|textarea)\b/g)) {
    let depth = 0;
    let i = m.index + m[0].length;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    tags.push(src.slice(m.index, i + 1));
  }

  for (const tag of tags) {
    // Named directly?
    if (/aria-label|aria-labelledby|\bid=/.test(tag)) continue;
    // A hidden field is not announced, so it needs no name.
    if (/type=["']hidden["']|aria-hidden/.test(tag)) continue;

    // Wrapped in its own <label>? (implicit association: <label><input/> Add VAT</label>)
    // Look back a little from where the tag sits for an unclosed <label>.
    const at = src.indexOf(tag);
    const before = src.slice(Math.max(0, at - 400), at);
    const lastOpen = before.lastIndexOf('<label');
    const lastClose = before.lastIndexOf('</label>');
    if (lastOpen > lastClose) continue;

    naked.push(`${rel}: ${tag.replace(/\s+/g, ' ').slice(0, 78)}...`);
  }
}

ok(
  `no field on the public site is unnamed${naked.length ? `\n     ${naked.join('\n     ')}` : ''}`,
  naked.length === 0,
);

// The honeypot must be hidden from assistive technology, not just from eyes. A screen reader reading
// out an invisible trap field, and a blind man dutifully filling it in, is how we would have flagged
// him as a bot and thrown his signup away.
const start = readFileSync(path.join(root, 'app/start/page.tsx'), 'utf8');
const honeypot = (start.match(/<input[^>]*name="website"[^>]*>/s) || [''])[0];
ok('the signup honeypot is aria-hidden, so a blind user is never invited to fill in the bot trap',
  /aria-hidden/.test(honeypot));

// And the specific fix that started this: a placeholder is not a label. It disappears the instant he
// types, and it fails WCAG 1.3.1.
const lead = readFileSync(path.join(root, 'components/LeadCapture.tsx'), 'utf8');
ok('the lead capture email field has a real name, not just a placeholder',
  /aria-label="Your email address"/.test(lead));

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

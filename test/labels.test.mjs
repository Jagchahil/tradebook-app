// EVERY INPUT ON THE WEBSITE HAS A NAME A SCREEN READER CAN SAY.
//
// WHY THIS IS A TEST AND NOT A ONE OFF TIDY UP
//
// We answered HMRC's production credentials form, in writing, on an application that is currently
// sitting in their queue:
//
//     "Does your software meet accessibility standards?  Yes."
//
// At the moment we answered it, five files on the website had a <label> sitting NEAR an <input>
// with nothing connecting them, and one had no label at all, only a placeholder. To a sighted man
// they look labelled. To a screen reader they are announced as "edit text", with no clue whether
// the box wants his income or his expenses, and the hint underneath is never read out at all.
//
// The signup form was the worst of it: it also had a honeypot field, invisible to a man, which a
// screen reader would happily read aloud and invite a blind user to fill in. Filling it in is how
// the honeypot decides you are a bot. We would have been silently rejecting the signups of blind
// tradesmen and calling them robots.
//
// Doc 104, standing question five: is it TRUE? Not is it defensible. True. This test is what keeps
// the answer we gave HMRC true after the next person adds a form in a hurry.
//
// THE RULE: every input, select and textarea on the public site must be reachable by name. Either
// a <label htmlFor> pointing at its id, or an aria-label, or wrapped inside its own <label>.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '..');

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.next', '.git', 'test', 'scripts'].includes(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
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

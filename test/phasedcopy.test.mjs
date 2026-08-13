// THE TWO THINGS THE PHASE D RETEST FOUND ON THE HOME SCREEN. 13 August 2026.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Run 2 fixed 25 findings and then, per the plan, every one was retested on live production rather
// than assumed. These two were found by that pass and by nothing else, and both are the same
// species: a fix that landed on the sentence and not on the frame around it.
//
// R2-F28. F10 was "Lekhio has kept £6,187 out of the taxman's hands", reworded on 12 August to
// "The costs you have logged are keeping £6,187 off your tax bill". Doc 104: the first employee
// does not take credit for the flowers. But the HEADING above that sentence still read "What
// Lekhio has saved you", and the two tiles under it still read "Without Lekhio" and "With Lekhio".
// The quotable line was fixed and the frame went on making the same claim in bigger type.
//
// R2-F29. "Read your a customer receipt." labelFor falls back to article phrases like "a customer"
// and "the market" when a payee has no name. They are good sentences on their own and ungrammatical
// after a possessive.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
// Comments are not copy. Every one of these files explains its own history in comments that quote
// the OLD wording, so a guard reading the raw file would be satisfied by the explanation of the bug.
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.error(`  FAIL ${name}`); } };

const home = codeOnly(read('app/app/page.tsx'));
const supa = read('lib/supabase.ts');

console.log('A. 🔴 R2-F28. The frame must not claim what the sentence stopped claiming');

ok('🔴 the heading no longer says Lekhio saved him', !/What Lekhio has saved you/.test(home));
ok('🔴 nor does the first tile', !/Without Lekhio/.test(home));
ok('🔴 nor the second', !/With Lekhio/.test(home));
// And it still says something, because deleting the panel is not the fix: the arithmetic under it
// is honest and worth showing. It is the ATTRIBUTION that was wrong.
ok('the panel still has a heading', /What your costs are worth/.test(home));
ok('the comparison still has both sides', /If you claimed nothing/.test(home) && /With what you claimed/.test(home));
// The figures themselves must be untouched.
ok('the without figure is still drawn', /gbp0\(l\.withoutLekhio\)/.test(home));
ok('the with figure is still drawn', /gbp0\(l\.withLekhio\)/.test(home));
ok('and the headline sentence is still the ledger\'s own', /headline\(l\)/.test(home));

console.log('B. R2-F29. A possessive only works in front of a name');
{
  const fnAt = supa.indexOf('function feedTxItem');
  const feed = supa.slice(fnAt, supa.indexOf('detail: `${money} out.`', fnAt));
  ok('the article case is detected', /\^\(a\|an\|the\)\\s/.test(feed));
  ok('🔴 and an article phrase drops the possessive', /`Read \$\{name\} receipt\.`/.test(feed));
  ok('while a real name keeps it', /`Read your \$\{name\} receipt\.`/.test(feed));
  // Both branches must exist: one alone means the other case is broken.
  ok('both forms are present, so neither case was traded for the other',
    /Read \$\{name\} receipt/.test(feed) && /Read your \$\{name\} receipt/.test(feed));
}

console.log('');
console.log(`${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

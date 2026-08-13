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

console.log('C. 🔴 R2-F32. The cold open, and the guard that could not see it');

// Found by unplugging Rosa's number and texting the product as a stranger. This is what a wrong
// number gets, what a prospect who texts before signing up gets, and what every ex-customer gets.
const wa = readFileSync(path.join(root, 'app/api/whatsapp/route.ts'), 'utf8');
const notLinkedAt = wa.indexOf('async function replyNotLinked');
const notLinked = notLinkedAt >= 0 ? wa.slice(notLinkedAt, wa.indexOf('\n}', notLinkedAt)) : '';
const notLinkedCode = codeOnly(notLinked);

ok('the cold open exists', notLinked.length > 0);
ok('🔴 it no longer says it DOES his tax', !/I do your books and tax/.test(notLinkedCode));
ok('🔴 it says it PREPARES, which is the whole doctrine',
  /I keep your books and get your tax ready/.test(notLinkedCode));
// It still has to be a useful sentence to a stranger, not just a compliant one.
ok('it still says what the thing is', /I am Lekhio/.test(notLinkedCode));
ok('and what to do next', /Get set up at/.test(notLinkedCode));
ok('with the trial length from the module that owns it', /\$\{TRIAL_DAYS\} days free/.test(notLinkedCode));
ok('🔴 and it leaks nothing about whoever had the number before',
  !/was on an account|previous account|removed from|used to be/i.test(notLinkedCode));

// 🔴 THE STRUCTURAL HALF, WHICH MATTERS MORE THAN THE SENTENCE. test/compliance.test.mjs scans
// app/ recursively, including this file, and its regex was written entirely in the first person
// PLURAL. Every WhatsApp string speaks as "I". The guard could not see a word of the chat.
const comp = readFileSync(path.join(root, 'test/compliance.test.mjs'), 'utf8');
ok('🔴 the compliance guard covers "I" as well as "we"', /\\b\(we\|i\)/.test(comp));
ok('and it still covers the original plural forms', /we do your tax for you/.test(comp));

console.log('');
console.log(`${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

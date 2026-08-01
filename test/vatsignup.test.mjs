// THE TWO RECORDS OF ONE ANSWER. Run: node test/vatsignup.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS SUITE DEFENDS, AND WHY IT IS A SET COMPARISON RATHER THAN A SENTENCE.
//
// "Are you VAT registered?" is asked in two places and stored in two places, and the two stores
// are read by different halves of the product:
//
//   vat_profiles.registered      every VAT surface a customer can see: /app/tax's VAT door,
//                                /app/tax/vat, /app/invoices/new's rate boxes and its three
//                                reverse charge questions, the receipt VAT reading, the pile's
//                                VAT confirm section.
//   circumstances.vat_registered the agent's threshold signal, the weekly update, and /app/you.
//
// 🔴 ON 1 AUGUST 2026, WALKING THE LIVE SITE ON AN ACCOUNT THAT ANSWERED YES AT SIGNUP:
//
//   /app/you        "VAT registered, as you told us."
//   /app/tax/vat    "You are not VAT registered, so there is nothing to work out here."
//   /app/tax        no VAT door at all
//   /app/invoices/new   no rate boxes, and none of the three reverse charge questions
//
// One click apart, about the same man, about the same question he had already answered. The
// signup reconcile wrote the circumstance and never the profile, and readVatProfile treats a
// missing row as a real answer of "not registered" rather than as silence. So the whole of the
// VAT work built on 1 August was unreachable for every customer who answered the front door
// question honestly, and the one screen that told the truth was the one that could not act on it.
//
// app/api/vat/route.ts already wrote both, and its own comment gives the reason in the other
// direction: a customer whose two records disagree gets told to go and register by a paid
// WhatsApp template. So the rule was known. It was enforced at one call site out of two.
//
// ⚠️ WHY THIS SUITE DOES NOT PIN A SENTENCE.
//
// Twice this week a test held a defect in place by asserting a string that stayed true after the
// door behind it had closed. A test here that read "the reconcile contains saveVatProfile" would
// pass the day somebody adds a THIRD door that writes only the circumstance, which is precisely
// how this one happened. So the assertion is a RELATIONSHIP: the set of files that record this
// answer as a circumstance must equal the set of files that record it as a profile. It needs no
// edit when a door is added, and it fails when a door is added wrong. That is the whole point.
//
// Source level rather than behavioural, and deliberately so: lib/supabase.ts cannot be loaded in
// a test (it is 8,900 lines with live config at import time), which is exactly why the rule it
// holds needs a structural guard rather than a hopeful one.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  ok   ${name}`); } else { fail += 1; console.log(`  FAIL ${name}`); }
};

// Every .ts and .tsx under app/ and lib/, so a new door is found wherever somebody puts it.
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(path.relative(repoRoot, full));
  }
  return out;
}
const files = [...walk(path.join(repoRoot, 'app')), ...walk(path.join(repoRoot, 'lib'))].sort();

// Comments are stripped before anything is counted. A rule that can be satisfied by a comment is
// not a rule, and this file exists because of comments that described a rule nobody enforced.
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 A DOOR IS A FUNCTION, NOT A FILE, AND FINDING THAT OUT COST THIS SUITE ITS FIRST DRAFT.
//
// The first version compared the two sets file by file, and it went GREEN ON THE BROKEN CODE.
// lib/supabase.ts both DEFINES saveVatProfile and calls it from a different function, so the
// file matched the profile half of the test whatever the reconcile did. A suite written to
// catch a rule enforced at one call site out of two was itself enforcing nothing, and it only
// showed up because it was run against the pre fix snapshot before being believed.
//
// So the unit is the enclosing function. The definition of saveVatProfile is excluded by name,
// because defining a writer is not writing.
// ═══════════════════════════════════════════════════════════════════════════════════════════
function functionsIn(rel) {
  const src = strip(read(rel));
  const marks = [];
  const re = /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g;
  let m;
  while ((m = re.exec(src)) !== null) marks.push({ name: m[1], at: m.index });
  return marks.map((mk, i) => ({
    id: `${rel} ${mk.name}()`,
    name: mk.name,
    body: src.slice(mk.at, i + 1 < marks.length ? marks[i + 1].at : src.length),
  }));
}
const fns = files.flatMap(functionsIn);

// A door TOUCHES the circumstance if it records the answer or forgets it. Both verbs count: the
// forget path on /app/you/vat clears the profile and forgets the circumstance together, and a
// door that cleared only one of them would leave the same contradiction the other way round.
const circumstanceWriters = fns
  .filter((f) => /'vat_registered'/.test(f.body) && /(save|forget)Circumstance\s*\(/.test(f.body))
  .map((f) => f.id);

// A door TOUCHES the profile if it calls saveVatProfile. Its own definition is not a call.
const profileWriters = fns
  .filter((f) => f.name !== 'saveVatProfile' && /saveVatProfile\s*\(/.test(f.body))
  .map((f) => f.id);

console.log('\nTHE DOORS THAT RECORD A VAT REGISTRATION ANSWER\n');
console.log(`  the circumstance: ${circumstanceWriters.join(', ') || 'none'}`);
console.log(`  the profile:      ${profileWriters.join(', ') || 'none'}\n`);

// ---------------------------------------------------------------------------------------------
// 1. 🔴 THE INVARIANT. Every door writes both, or the product holds two answers to one question.
// ---------------------------------------------------------------------------------------------
const onlyCircumstance = circumstanceWriters.filter((f) => !profileWriters.includes(f));
const onlyProfile = profileWriters.filter((f) => !circumstanceWriters.includes(f));

ok('🔴 NO DOOR WRITES THE CIRCUMSTANCE WITHOUT THE PROFILE'
  + (onlyCircumstance.length ? ` (offenders: ${onlyCircumstance.join(', ')})` : ''),
  onlyCircumstance.length === 0);

ok('🔴 AND NONE WRITES THE PROFILE WITHOUT THE CIRCUMSTANCE'
  + (onlyProfile.length ? ` (offenders: ${onlyProfile.join(', ')})` : ''),
  onlyProfile.length === 0);

ok('there are doors at all, so an empty set can never pass this suite by accident',
  circumstanceWriters.length >= 3 && profileWriters.length >= 3);

ok('the three known doors are the signup reconcile, the VAT screen POST, and the forget path',
  circumstanceWriters.includes('lib/supabase.ts reconcileSignupToUser()')
  && circumstanceWriters.includes('app/api/vat/route.ts POST()')
  && circumstanceWriters.includes('app/api/vat/route.ts forgetVat()'));

// ---------------------------------------------------------------------------------------------
// 2. WHY IT MATTERS: a missing row is an ANSWER, not silence.
//
// This is the property that turns a half written answer into a wrong screen rather than a blank
// one, and it is deliberately NOT being changed. Returning null for a missing row would make
// every VAT surface say "we could not read this" to every brand new customer, which is worse.
// The reader is right. The writer was incomplete.
// ---------------------------------------------------------------------------------------------
const dbSrc = read('lib/supabase.ts');

ok('🔴 readVatProfile answers a MISSING ROW with registered false, which is why one write is not enough',
  /No row is a real answer/.test(dbSrc) && /if \(!r\) \{[\s\S]{0,400}?registered: false,/.test(dbSrc));

ok('...and an unreadable read is still null, never a false, so a blip cannot say "not registered"',
  /if \(!res\.ok\) return null;/.test(dbSrc.slice(dbSrc.indexOf('export async function readVatProfile'))));

// ---------------------------------------------------------------------------------------------
// 3. THE SIGNUP WRITE CANNOT REACH ANYTHING HE HAS ALREADY GIVEN US.
//
// saveVatProfile is partial by design so a man who gives his number today and his scheme next
// week does not have his number wiped in between. The signup patch rides that: it sets one field.
// If this ever became a whole object write, a customer who set a VRN and then had his signup row
// reconciled a second time would lose it.
// ---------------------------------------------------------------------------------------------
const reconcile = dbSrc.slice(dbSrc.indexOf('export async function reconcileSignupToUser'));
const reconcileVat = reconcile.slice(0, reconcile.indexOf('// 4.'));

ok('🔴 the signup patch sets `registered` AND NOTHING ELSE',
  /saveVatProfile\(userId, \{ registered: vatRegistered \}\)/.test(reconcileVat));

ok('saveVatProfile still guards every field on !== undefined, so a one field patch stays a one field write',
  (() => {
    const fn = dbSrc.slice(dbSrc.indexOf('export async function saveVatProfile'));
    const body = fn.slice(0, fn.indexOf('try {'));
    const assignments = (body.match(/body\.\w+ = patch\./g) || []).length;
    const guards = (body.match(/if \(patch\.\w+ !== undefined\)/g) || []).length;
    return assignments >= 8 && assignments === guards;
  })());

ok('it merges on the user rather than inserting a second row',
  /vat_profiles\?on_conflict=user_id/.test(dbSrc) && /resolution=merge-duplicates/.test(dbSrc));

// ---------------------------------------------------------------------------------------------
// 4. THE LOG GOES FIRST, AND A FAILED SECOND WRITE IS NEVER SILENT.
//
// The circumstance is the exhibit: the wording he read, his answer, the timestamp. It is the
// Finance Act 2026 Sch 22 defence and it must not be lost because a second write failed. And a
// check that fails quietly looks exactly like a clean sheet, which is the lesson priorLocalGrants
// cost us on 1 August.
// ---------------------------------------------------------------------------------------------
ok('🔴 the circumstance is written BEFORE the profile',
  reconcileVat.indexOf('saveCircumstance(') < reconcileVat.indexOf('saveVatProfile('));

ok('🔴 a failed profile write LOGS rather than passing for a clean sheet',
  /console\.error\('\[signup-reconcile\][^']*vat profile write failed/.test(reconcileVat));

ok('it only runs when signup actually carried an answer, so an unasked customer keeps no row',
  /if \(s\.vat_registered !== null && s\.vat_registered !== undefined\)/.test(reconcileVat));

// ---------------------------------------------------------------------------------------------
// 5. THE SURFACES THIS UNBLOCKS, named so the next reader knows what to walk.
//
// Not copy pins. Each of these is the CONDITION that decides whether a whole surface draws, and
// each was answered "no" on 1 August for a man who had answered "yes" on the front door.
// ---------------------------------------------------------------------------------------------
ok('the tax hub draws its VAT door on the profile, so it was dark for him',
  /vat !== null && vat\.registered/.test(read('app/app/tax/page.tsx')));

ok('the invoice form asks the three reverse charge questions on the profile, so they were absent',
  /cisSubcontractor/.test(read('app/app/invoices/new/page.tsx'))
  && /vatProfile[\s\S]{0,80}registered/.test(read('app/app/invoices/new/page.tsx')));

ok('the receipt reader stores a VAT figure only for a registered man, so his receipts lost it',
  /vatProfile !== null && vatProfile\.registered/.test(read('app/api/money/receipt/route.ts')));

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);

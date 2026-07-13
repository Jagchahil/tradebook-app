// The authority behind every claim rule. See lib/rulesources.ts and docs/105 Phase 3.
//
// WHAT THESE TESTS PROTECT.
//
// lib/taxrules.ts tells a self-employed man what he may put on his tax return. On 13 July 2026 all
// 24 of those rules carried ZERO citations. We told him "no, you cannot claim everyday clothes",
// which is Mallalieu v Drummond in the House of Lords, on our own authority, and our authority is
// nothing.
//
// The load-bearing test in this file is not "does every rule have a source". It is:
//
//   A CITATION THAT IS NOT GOV.UK, OR THAT CANNOT BE CHECKED, MUST NOT EXIST.
//
// An invented citation is strictly WORSE than no citation. "No citation" is honest ignorance. A
// plausible-looking "BIM45012" that does not say what we claim is a wrong answer wearing HMRC's
// uniform, and a man will believe it precisely because it looks like law. The quote is the anchor:
// khoji/corpus.mjs checks it verbatim against the live page every night, so an invented one fails
// loudly instead of shipping. These tests make sure the anchor is strong enough to hold.

import { EXPENSE_RULES } from '../lib/taxrules.ts';
import { RULE_SOURCES } from '../lib/rulesources.ts';

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

const keys = EXPENSE_RULES.map((r) => r.key);
const allSources = Object.entries(RULE_SOURCES).flatMap(([k, ss]) => ss.map((s) => ({ key: k, ...s })));

// --- 1. Nothing but HMRC is an authority ------------------------------------

ok('every source is a gov.uk URL. Nothing else is an authority',
  allSources.every((s) => /^https:\/\/www\.gov\.uk\//.test(s.url)));

ok('every source names an HMRC reference a human could quote in a letter',
  allSources.every((s) => typeof s.code === 'string' && s.code.length > 2));

// --- 2. The quote is an ANCHOR, and a weak anchor is a false one -------------
//
// A short fragment can survive a rewrite that REVERSES its meaning. "allow a deduction" appears in
// both "you should allow a deduction" and "you should no longer allow a deduction". The quote has
// to be long enough that HMRC changing their mind breaks it.
ok('every quote is long enough to be an anchor, not a fragment',
  allSources.every((s) => typeof s.quote === 'string' && s.quote.trim().length >= 20));

ok('no quote is a single word or a bare heading',
  allSources.every((s) => s.quote.trim().split(/\s+/).length >= 4));

// --- 3. Every source belongs to a rule that actually exists -------------------
//
// A citation attached to a rule we deleted is a citation nobody checks, and it will rot silently.
ok('every cited key is a real rule in EXPENSE_RULES',
  Object.keys(RULE_SOURCES).every((k) => keys.includes(k)));

// --- 4. THE ONES THAT ARE ACTUALLY CASE LAW ----------------------------------
//
// Verified against the live page on 13 July 2026. If someone "tidies" these, the tests scream.
const clothes = RULE_SOURCES.everyday_clothes?.[0];
ok('the everyday-clothes rule cites BIM37910, which is Mallalieu v Drummond',
  clothes?.code === 'BIM37910' && /bim37910/.test(clothes.url));
ok('...and names the statute and the case, because that is what makes it law and not an opinion',
  /ITTOIA/.test(clothes?.authority || '') && /Mallalieu/.test(clothes?.authority || ''));
ok('...and quotes HMRC saying "disallow", in HMRC\'s words, not ours',
  /disallow expenditure on ordinary clothing/i.test(clothes?.quote || ''));

const boots = RULE_SOURCES.protective?.[0];
ok('the protective-gear rule quotes HMRC saying "allow", from the same page',
  /allow a deduction for protective clothing and uniforms/i.test(boots?.quote || ''));

// The same page authorises opposite verdicts for two rules, which is exactly why the QUOTE and not
// the page reference is what we check. Cite BIM37910 alone and you could "prove" either answer.
ok('the same page backs OPPOSITE verdicts, so the quote is what carries the meaning, not the URL',
  boots.url === clothes.url && boots.quote !== clothes.quote);

// --- 5. COVERAGE. Counted, never hidden. -------------------------------------
//
// An uncited rule is not "fine". It is a thing we tell a man on our own authority. This does not
// fail the build, because a half-cited product that is honest about the half is better than an
// uncited one that says nothing. But the number is printed every single run, and it is here to be
// driven to zero.
const uncited = keys.filter((k) => !RULE_SOURCES[k] || RULE_SOURCES[k].length === 0);
ok('at least the contentious clothing rules are cited (they are literally House of Lords case law)',
  ['everyday_clothes', 'protective', 'uniform'].every((k) => (RULE_SOURCES[k] || []).length > 0));

console.log(`\n  COVERAGE: ${keys.length - uncited.length}/${keys.length} claim rules carry an HMRC source.`);
if (uncited.length) console.log(`  UNCITED (we assert these on our own authority): ${uncited.join(', ')}`);

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

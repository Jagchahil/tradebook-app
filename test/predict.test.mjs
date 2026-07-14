// 🔴 WHAT IS THE LAW TODAY, AND WHAT IS MERELY COMING.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE BUG. Every reviewed knowledge item was folded into Rakha's prompt like this:
//
//     "- Mileage rate change (effective 2027-04-06): the rate becomes Xp [source: ...]"
//
// under an instruction that read, in full: "Treat these as the latest confirmed position, PREFER
// them where they are relevant."
//
// So a Budget change announced in November, biting the following April, went to a language model as
// a PREFERRED FACT, with the date sitting in the middle of the sentence as decoration, and the model
// was left to work out for itself that it had not happened yet.
//
// Picture the man. It is January. He asks what he can claim per mile. The model does exactly as it
// was told, prefers the latest confirmed position, and quotes him next year's rate. He logs three
// months of journeys at a number that is not the law. He signs the return himself.
//
// ⚠️ A MODEL MUST NEVER BE ASKED TO DO THE DATE ARITHMETIC THAT DECIDES WHICH LAW APPLIES.
//
// Same rule as everywhere in this codebase: ARITHMETIC AND PROVENANCE DECIDE, THE MODEL ONLY
// DESCRIBES. The comparison happens in TypeScript, against a real clock, and the model gets the
// conclusion.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// AND THE SECOND HALF IS THE PRODUCT, not a filter.
//
// "Announced but not yet law" is the answer to "what is coming that will affect me" — the thing an
// accountant charges for in March and nobody gets told in January. Khoji has been collecting it for
// weeks. Nothing had ever read it.

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const B = await import(pathToFileURL(path.join(root, 'lib/brain.ts')).href);
const { phase, byPhase, daysUntil, isLive } = B;

const askSrc = readFileSync(path.join(root, 'app/api/ask/route.ts'), 'utf8');
const claudeSrc = readFileSync(path.join(root, 'lib/claude.ts'), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const askCode = strip(askSrc);
const claudeCode = strip(claudeSrc);

let pass = 0;
let fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };

console.log('\npredict: what is the law today, and what is only coming');

const NOW = new Date('2027-01-15T12:00:00Z');

// ---------------------------------------------------------------------------------------------
// 🔴 1. THE ARITHMETIC. In TypeScript, against a real clock.
// ---------------------------------------------------------------------------------------------

ok('a change that has already happened is IN FORCE',
  phase('2026-04-06', NOW) === 'in_force');

ok('🔴 A CHANGE THAT HAS NOT HAPPENED YET IS ANNOUNCED, NOT LAW',
  // The whole bug, in one assertion. In January 2027, a rate that changes in April 2027 is NOT the
  // rate. It is next year's rate. He must not be given it as the answer.
  phase('2027-04-06', NOW) === 'announced');

ok('the day it lands, it IS the law. Not the day after.',
  // A man asking on the morning of 6 April must be told the NEW number. Getting this off by one day
  // is getting it wrong for every single person who asks on the day it matters most.
  phase('2027-01-15', NOW) === 'in_force');

ok('no date is UNKNOWN, and it is never quietly promoted into the law',
  // isLive() treats a missing date as live, and that is correct for ITS question ("should a human
  // look at this?"): the cost of a false shout is one page read. This question is different. Here a
  // wrong answer changes a number on a tax return.
  phase(null, NOW) === 'unknown' && phase(undefined, NOW) === 'unknown');

ok('...and a date we cannot parse is UNKNOWN too, never guessed at',
  phase('next April', NOW) === 'unknown' && phase('', NOW) === 'unknown');

ok('isLive() still answers its own question, and the two do not get confused',
  // Different questions, different answers, both correct. isLive: "does a human need to look?"
  // phase: "which law applies to this man today?"
  isLive(null, NOW) === true && phase(null, NOW) === 'unknown');

// ---------------------------------------------------------------------------------------------
// 🔴 2. THE SPLIT. Two lists, and they never merge.
// ---------------------------------------------------------------------------------------------

const items = [
  { title: 'in force', effective_date: '2026-04-06' },
  { title: 'coming', effective_date: '2027-04-06' },
  { title: 'no date', effective_date: null },
  { title: 'lands today', effective_date: '2027-01-15' },
];
const split = byPhase(items, NOW);

ok('the pile splits into what governs him TODAY and what is merely coming',
  split.inForce.length === 2 && split.announced.length === 1 && split.unknown.length === 1);

ok('nothing is lost in the split. Every item lands somewhere.',
  split.inForce.length + split.announced.length + split.unknown.length === items.length);

ok('...and nothing is DOUBLE counted, which would let a future change into the answer by the back door',
  new Set([...split.inForce, ...split.announced, ...split.unknown].map((i) => i.title)).size === items.length);

ok('"how long until it bites" is a number he can plan around, not a database column',
  daysUntil('2027-04-06', NOW) === 81);

ok('...and it is null for anything that has already landed, because that is not a countdown',
  daysUntil('2026-04-06', NOW) === null && daysUntil(null, NOW) === null);

// ---------------------------------------------------------------------------------------------
// 🔴 3. THE MODEL IS NEVER HANDED ONE MIXED LIST AGAIN.
// ---------------------------------------------------------------------------------------------

ok('🔴 THE ROUTE SPLITS THE KNOWLEDGE BEFORE THE MODEL EVER SEES IT',
  /byPhase\(items\)/.test(askCode) && /const \{ inForce, announced, unknown \}/.test(askCode));

ok('...and the blocks are LABELLED, in words a model cannot misread',
  /THE LAW AS IT STANDS TODAY/.test(askCode)
  && /ANNOUNCED BUT NOT YET IN FORCE/.test(askCode)
  && /WE DO NOT KNOW WHEN THESE START/.test(askCode));

// 🔴 UNKNOWN IS NOT TODAY. The live data taught me this an hour after I wrote the first version.
//
// My first split folded the undated items in with the in-force ones, reasoning that "not knowing when
// it bites is not a reason to hide it". True. And not a reason to call it THE LAW either, which is
// what the heading on that block does.
//
// Here is HMRC's own Operative date section, from a measure published on 13 July 2026:
//
//     "The operative date ... is SUBJECT TO THE STATUTORY INSTRUMENT that will make this change. The
//      changes ... will apply to deliberate non-compliance which takes place AFTER THE DATE OF ROYAL
//      ASSENT to Finance Bill 2026-27."
//
// No calendar date, because HMRC does not have one. Our extractor honestly returns null. phase()
// honestly says `unknown`. And then I handed it to a language model under a heading reading THE LAW
// AS IT STANDS TODAY. A measure awaiting Royal Assent is a DRAFT. It is not the law today.
ok('🔴 AN UNDATED ITEM IS NOT IN THE "LAW TODAY" BLOCK. Unknown is not today.',
  /if \(inForce\.length\)[\s\S]{0,200}?THE LAW AS IT STANDS TODAY[\s\S]{0,120}?inForce\.map/.test(askCode)
  && !/\[\.\.\.inForce, \.\.\.unknown\]/.test(askCode));

ok('...it gets its OWN block, which says we do not know when it starts',
  /if \(unknown\.length\)[\s\S]{0,400}?WE DO NOT KNOW WHEN THESE START/.test(askCode));

ok('...and that block forbids stating it as the current rule OR as a dated change',
  // Both errors are available here and they are opposite. "This is the rule" is wrong because it is a
  // draft. "It starts on 6 April" is wrong because nobody has said that. Forbid both.
  /Do NOT state any figure from this block as the[\s\S]{0,40}?current rule/.test(askCode)
  && /do NOT tell him it is coming on a particular date/.test(askCode));

ok('🔴 ...and the announced block is told, in terms, that it MUST NOT be used to answer',
  /MUST NOT be used to answer/.test(askCode) && /NOT the law today/.test(askCode));

ok('the effective date is no longer dropped into the in-force line as decoration',
  // The old line was: `- ${title} (effective ${date}): ...`. The date being there is exactly what
  // made it look like the model's job to interpret it.
  !/effective \$\{k\.effective_date\}/.test(askCode));

ok('🔴 THE PROMPT NO LONGER SAYS "PREFER THEM". That instruction is what caused the bug.',
  !/prefer them where they are relevant/i.test(claudeCode));

ok('...it says answer from the IN-FORCE block only, and never quote an announced figure as current',
  /ONLY the in-force block/i.test(claudeCode)
  && /NEVER quote a figure from the announced block/i.test(claudeCode));

// ---------------------------------------------------------------------------------------------
// 🔴 4. BUT IT IS NOT THROWN AWAY. "What is coming" IS the product.
// ---------------------------------------------------------------------------------------------

ok('an announced change still reaches him, as a heads up, AFTER the answer',
  // An accountant charges for this in March. He gets it in January, for nothing, because Khoji was
  // already collecting it and nothing had ever read it.
  /add ONE short line at the end/.test(askCode) && /so he can plan/.test(askCode));

ok('...with the date and the countdown, because "from 6 April, 81 days away" is actionable',
  /daysUntil\(k\.effective_date\)/.test(askCode) && /days away/.test(askCode));

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

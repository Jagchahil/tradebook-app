// THE OTHER HALF OF THE £110.55: WHETHER THE MACHINE COULD ACTUALLY READ THE TOTAL.
// Run with: node test/receiptconfidence.test.mjs   (Node 22.6+, pure type stripping)
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A deliberately faded receipt was read as £110.55. The paper says £118.55. RUN 2, 12 August 2026.
//
// R2-F3 fixed the CONSENT half: a machine read amount no longer rides a press about somebody's bank
// row, because the source class is part of the pile's group key. The report then said, twice, in
// the same words, that this was the most important thing still not done:
//
//   "F3 stops that reading being confirmed by somebody else's press. It does not stop the reading
//    being wrong."
//
// Nothing anywhere knew the reading might be wrong, because parseReceipt returned a number and gave
// up no signal at all. This suite guards the signal, and the three things that must be true of it:
//
//   1. It is a question about the PAPER, answerable by anyone holding the same photograph, not a
//      probability a model will cluster at 0.9.
//   2. UNDEFINED MEANS NOT ASKED, never "clear". Every row in every book written before today has
//      nothing here, and retro-flagging a year of settled receipts is not a fix, it is a screen a
//      man closes. The signal may only ever ADD caution.
//   3. It reaches the press. A flag that changes no button is a log line.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const lib = path.join(root, 'lib');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
const fix = (s) => s.replace(/from '(\.\/[a-zA-Z0-9._-]+)'/g, "from '$1.ts'");

const stage = mkdtempSync(path.join(tmpdir(), 'rconf-'));
for (const f of ['receiptconfidence', 'reviewpile', 'personal', 'capital', 'taxengine', 'money', 'propertylanes']) {
  writeFileSync(path.join(stage, f + '.ts'), fix(readFileSync(path.join(lib, f + '.ts'), 'utf8')));
}
const C = await import(pathToFileURL(path.join(stage, 'receiptconfidence.ts')).href);
const R = await import(pathToFileURL(path.join(stage, 'reviewpile.ts')).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.error(`  FAIL ${name}`); } };
const eq = (name, got, want) => {
  const same = typeof want === 'number' ? Math.abs(got - want) < 0.005 : got === want;
  if (same) pass++;
  else { fail++; console.error(`  FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
};

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('A. Undefined means NOT ASKED, and that is the line the whole thing turns on');
// ════════════════════════════════════════════════════════════════════════════════════════

eq('a clear reading scores 1', C.scoreFor('clear'), C.CONFIDENCE_CLEAR);
eq('an unsure reading scores below clear', C.scoreFor('unsure'), C.CONFIDENCE_UNSURE);
ok('and unsure really is below clear', C.CONFIDENCE_UNSURE < C.CONFIDENCE_CLEAR);
eq('undefined stores NULL, not a score', C.scoreFor(undefined), null);
eq('null stores null', C.scoreFor(null), null);
eq('and so does any word we did not ask for', C.scoreFor('probably'), null);

// 🔴 THE ONE THAT PROTECTS EVERY BOOK ALREADY IN PRODUCTION.
ok('🔴 a row with NO score is not uncertain', C.isUncertainAmount(null) === false);
ok('🔴 nor is an undefined one', C.isUncertainAmount(undefined) === false);
ok('a clear row is not uncertain', C.isUncertainAmount(C.CONFIDENCE_CLEAR) === false);
ok('an unsure row IS uncertain', C.isUncertainAmount(C.CONFIDENCE_UNSURE) === true);
// Anything below clear counts, so a future "could not read at all" cannot fall through by not
// being equal to the one value this file happens to know about today.
ok('a lower future score is uncertain too', C.isUncertainAmount(0) === true);
ok('and rubbish is not treated as uncertain', C.isUncertainAmount(Number.NaN) === false);
ok('nor is a string', C.isUncertainAmount('unsure') === false);

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('B. The question asked is about the PAPER, not about the number');
// ════════════════════════════════════════════════════════════════════════════════════════

const claudeSrc = read('lib/claude.ts');
const promptStart = claudeSrc.indexOf('const PROMPT = [');
const prompt = claudeSrc.slice(promptStart, claudeSrc.indexOf('].join', promptStart));

ok('the field is asked for', /amount_confidence/.test(prompt));
ok('only two answers are offered', /"clear" or "unsure"/.test(prompt));
ok('it is scoped to the TOTAL, not the whole receipt', /about the TOTAL only/i.test(prompt));
// The perceptual framing is the design. A probability would be a different, worse field.
ok('it asks how well it could SEE the total', /how well you could SEE/.test(prompt));
ok('it names what makes paper hard to read', /faded|creased|torn|blurred/.test(prompt));
ok('it says a digit that could be read two ways is unsure', /could reasonably be read as a different digit/.test(prompt));
ok('🔴 it is biased toward unsure when weighing it up', /weighing it up at all, say unsure/.test(prompt));
ok('🔴 and it is explicitly NOT about plausibility', /never about whether the amount seems plausible/.test(prompt));

// Only the two words we asked for may become a signal.
const rStart = claudeSrc.indexOf('export async function parseReceipt');
// ⚠️ THE END ANCHOR IS THE RETURN, NOT THE FIRST 'could not parse' LINE. There are three of those
// in this file and the first one sits INSIDE parseReceipt's truncation branch, ahead of the field,
// so slicing to it silently tested an empty region. Caught by this assertion failing, which is the
// assertion doing its job before it ever guarded anything.
const parseTail = claudeSrc.slice(rStart, claudeSrc.indexOf('[claude] Could not parse JSON from model reply.', rStart));
ok('the parse accepts only the two exact words', /=== 'clear' \|\| parsed\.amount_confidence === 'unsure'/.test(parseTail));
ok('and anything else becomes undefined, not a guess', /: undefined,/.test(parseTail));

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('C. It is stored, on a column that already existed');
// ════════════════════════════════════════════════════════════════════════════════════════

const ingestSrc = read('lib/receiptingest.ts');
ok('the ingest writes the score', /confidence_score: scoreFor\(parsed\.amount_confidence\)/.test(ingestSrc));
ok('and it asks the one owner rather than mapping it itself', /from '\.\/receiptconfidence'/.test(ingestSrc));

// No migration: the column has been in the schema since the beginning.
ok('the column is already in the schema', /confidence_score\s+numeric/.test(read('supabase/schema.sql')));
const supaSrc = read('lib/supabase.ts');
ok('the pile SELECT names it, or it arrives undefined however good the screen is',
  /select=id,vendor,description,amount,category,looks_personal,vat_amount,vat_confirmed,cis_deduction,source_type,confidence_score/.test(supaSrc));

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('D. It reaches the PRESS, which is the only thing that matters');
// ════════════════════════════════════════════════════════════════════════════════════════

const entry = (id, vendor, amount, extra = {}) => ({
  id, vendor, amount, category: 'stock', looks_personal: false, source_type: 'whatsapp_image', ...extra,
});
const keyOf = (v) => String(v).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const cat = () => 'stock';

{
  // Rosa's actual shape: several Porters receipts in one upload, one of them faded.
  const groups = R.buildPile([
    entry('a', 'PORTERS WHOLESALE FLOWERS', -324.69, { confidence_score: 1 }),
    entry('b', 'PORTERS WHOLESALE FLOWERS', -81.43, { confidence_score: 1 }),
    entry('c', 'PORTERS WHOLESALE FLOWERS', -110.55, { confidence_score: 0.5 }),
  ], keyOf, [], cat);

  eq('🔴 the faded one is NOT in the same group as the crisp ones', groups.length, 2);
  const sure = groups.find((g) => !g.uncertainAmount);
  const unsure = groups.find((g) => g.uncertainAmount);
  ok('there is a sure group', !!sure);
  ok('and an unsure one', !!unsure);
  eq('the crisp receipts group together', sure?.count, 2);
  eq('the faded one stands alone', unsure?.count, 1);
  eq('and it is the £110.55', unsure?.total, 110.55);
  ok('both are still marked as read off paper', sure?.readFromPhoto === true && unsure?.readFromPhoto === true);
  // The ids never mix, which is what actually stops one press confirming the other.
  ok('🔴 no id appears in both groups', !sure?.ids.some((i) => unsure?.ids.includes(i)));
}
{
  // 🔴 THE BACKWARDS COMPATIBILITY CASE. Every row in every existing book has no score.
  const groups = R.buildPile([
    entry('a', 'PORTERS WHOLESALE FLOWERS', -324.69),
    entry('b', 'PORTERS WHOLESALE FLOWERS', -81.43),
  ], keyOf, [], cat);
  eq('🔴 rows with no score group exactly as they always have', groups.length, 1);
  ok('and none of them is flagged', groups[0].uncertainAmount === false);
}
{
  // A bank row and a faded receipt from the same shop: three groups, not one, not two.
  const groups = R.buildPile([
    entry('a', 'PORTERS WHOLESALE FLOWERS', -324.69, { source_type: 'bank_feed' }),
    entry('b', 'PORTERS WHOLESALE FLOWERS', -81.43, { confidence_score: 1 }),
    entry('c', 'PORTERS WHOLESALE FLOWERS', -110.55, { confidence_score: 0.5 }),
  ], keyOf, [], cat);
  eq('a fact, a reading and a doubtful reading are three questions', groups.length, 3);
  eq('only one is from the bank', groups.filter((g) => !g.readFromPhoto).length, 1);
  eq('only one is doubtful', groups.filter((g) => g.uncertainAmount).length, 1);
}

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('E. The screen and the route, so a flag is not just a log line');
// ════════════════════════════════════════════════════════════════════════════════════════

const pageSrc = read('app/app/pile/page.tsx');
const routeSrc = read('app/api/pile/route.ts');

// ⚠️ THE ASSIGNMENTS, not the identifiers: `const knownUnsure = []` keeps every mention and draws
// nothing, which is the finding walking straight back in.
ok('the sure list excludes the doubtful ones',
  /const knownRead = known\.filter\(\(g\) => g\.readFromPhoto && !g\.uncertainAmount\)/.test(pageSrc));
ok('the doubtful list is DERIVED from the flag',
  /const knownUnsure = known\.filter\(\(g\) => g\.readFromPhoto && g\.uncertainAmount\)/.test(pageSrc));
ok('it has its own press', /value="confirm_unsure"/.test(pageSrc));
ok('and its own section, drawn only when there is one', /knownUnsure\.length > 0 &&/.test(pageSrc));

// The copy has a job: name the figure and ask for one thing.
const secStart = pageSrc.indexOf('{knownUnsure.length > 0 && (');
const section = secStart >= 0 ? pageSrc.slice(secStart, secStart + 1800) : '';
ok('the section exists to test', section.length > 0);
ok('it still prints the amount rather than hiding it', /gbp0\(g\.total\)/.test(section));
ok('it still files in ONE press, because the founder quit at two files out of eight',
  (section.match(/type="submit"/g) ?? []).length === 1);
ok('the line names the figure', /uncertainAmountLine\(gbp0\(g\.total\)\)/.test(section));
// It must never tell her to take a better photograph. That sentence was said twice on 12 August
// about a perfectly printed till roll when the fault was our own token ceiling.
ok('🔴 it never blames her photograph', !/clearer photo|better photo|photograph usually/i.test(section));

const line = C.uncertainAmountLine('£110.55');
ok('the line carries the figure', line.includes('£110.55'));
ok('it says the paper was hard to read, not that she took a bad picture', /paper was hard to read/.test(line));
ok('and it asks for exactly one thing', /Worth a look at the receipt/.test(line));
ok('the section note explains what a yes here covers', /a yes here is a yes about\s+these amounts and nothing else/.test(C.UNCERTAIN_SECTION_NOTE));

// The route must file the doubtful ones separately, or the button is decoration.
// ⚠️ SLICED TO THE ALLOWLIST ARRAY, NOT THE FILE. 'confirm_unsure' also appears in the Decision
// type union and in two comments, so testing the whole file stayed GREEN with the word deleted from
// the one list that decides anything. The sabotage pass caught it. Same hole, second time today:
// a guard that a type declaration or a comment can satisfy is not a guard.
const vStart = routeSrc.indexOf('const VERDICTS = [');
const verdicts = vStart >= 0 ? routeSrc.slice(vStart, routeSrc.indexOf(']', vStart)) : '';
ok('the allowlist exists to test', verdicts.length > 0);
ok('the verdict is ON the allowlist, so the form is not read as business', /'confirm_unsure'/.test(verdicts));
ok('and the filter separates the three populations',
  /g\.readFromPhoto === wantRead && g\.uncertainAmount === wantUnsure/.test(routeSrc));
ok('confirm_known still means "not read off paper"', /const wantRead = body\.verdict !== 'confirm_known'/.test(routeSrc));

console.log('');
console.log(`${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

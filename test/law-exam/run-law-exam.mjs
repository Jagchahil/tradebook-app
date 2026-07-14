// 🔴 THE LAW EXAM BANK RUNNER. The legal sibling of test/exams/run-exams.mjs.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The accounting bank proves our tax ENGINE against a number: soleTraderTax(30000) === 4531.8.
// A legal answer is not a number, so this proves something different and, honestly, harder:
//
//   1. EVERY question is anchored to a real statute section or named case, on a host we are LICENSED
//      to cite. A citation to a source we cannot lawfully use is a defect, not a nuance. (The licence
//      question is the one I got wrong for a week; it is settled and enforced here in code.)
//
//   2. Where a question claims to rest on OUR OWN rules ("answered": "rule"), the cited authority
//      MUST actually appear in lib/rulesources.ts. This is the tie to reality: the exam cannot claim
//      we answer something on the strength of a case our code has never heard of. It is the same
//      discipline as the synthesis classifier, which caught itself promoting HMRC prose to statute.
//
//   3. COVERAGE IS COUNTED, NOT HIDDEN. 'rule' (cross-checked), 'knowledge' (source held), 'uncovered'
//      (a gap we admit). An uncovered question does NOT fail the build, because pretending we cover
//      all law would be the lie. A gap you can count is a gap you will close; a gap you cannot see
//      becomes the mileage rate.
//
// WHAT FAILS THE BUILD: a malformed question, an unlicensed source, a field we do not recognise, or
// a 'rule' question whose authority our rulesources cannot back. Not incompleteness. Dishonesty.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');

// Load a .ts module the same way the accounting runner does: Node 22.6+ strips types directly; on
// older Node, a one-off esbuild transpile. No permanent dependency.
async function loadTs(relPath) {
  const p = path.resolve(root, relPath);
  try {
    return await import(`${pathToFileURL(p).href}?t=${Date.now()}`);
  } catch (err) {
    const out = path.join(process.env.TMPDIR || '/tmp', path.basename(relPath) + '.exam.mjs');
    const esbuild = [
      path.resolve(root, 'node_modules/.bin/esbuild'),
      '/tmp/node_modules/.bin/esbuild',
    ].find((c) => existsSync(c));
    if (!esbuild) {
      console.error('\nCould not load ' + relPath + '. Runs on Node 22.6+; else: npm i -D esbuild');
      console.error(`Original error: ${err.message}\n`);
      process.exit(2);
    }
    execSync(`"${esbuild}" "${p}" --format=esm --outfile="${out}"`, { stdio: 'inherit' });
    return import(`file://${out}?t=${Date.now()}`);
  }
}

const L = await loadTs('lib/lawsources.ts');
const R = await loadTs('lib/rulesources.ts');
const bank = JSON.parse(readFileSync(path.join(here, 'exam-bank.json'), 'utf8'));

// Normalise an authority string down to its bare citation so "S34(1)(a) ITTOIA 2005" and
// "s34(1)(a) ITTOIA 2005" compare equal, and punctuation cannot cause a false miss.
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// The concatenated, normalised authority text our tax rules actually rest on. A 'rule' question must
// find its citation in here.
const ruleAuthorityBlob = norm(
  Object.values(R.RULE_SOURCES).flat().map((r) => r.authority || '').join(' | '),
);

let pass = 0;
let fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.log(`  FAIL ${name}`); } };

console.log('\nlaw-exam: every answer anchored to a licensed primary source');

const seenIds = new Set();
const byCoverage = { rule: 0, knowledge: 0, uncovered: 0 };
const byField = {};
const knownFields = new Set(L.LEGAL_FIELDS);

for (const q of bank.questions) {
  const tag = q.id || '(no id)';

  ok(`${tag} has a unique id`, q.id && !seenIds.has(q.id));
  seenIds.add(q.id);

  ok(`${tag} names a recognised legal field (${q.field})`, knownFields.has(q.field));
  ok(`${tag} has a prompt, an answer and an authority`,
    !!q.prompt && !!q.answer && !!q.authority && q.prompt.length > 10 && q.answer.length > 10);

  // 🔴 THE LICENSING GATE. A source we cannot lawfully cite is a defect.
  ok(`${tag} cites a LICENSED source (${q.source_url})`, L.isLicensedSource(q.source_url));

  // Coverage must be one of the three honest states.
  ok(`${tag} has an honest coverage tag`, ['rule', 'knowledge', 'uncovered'].includes(q.answered));
  if (byCoverage[q.answered] !== undefined) byCoverage[q.answered]++;
  byField[q.field] = (byField[q.field] || 0) + 1;

  // 🔴 THE TIE TO REALITY. If we claim OUR RULES answer this, the citation must be in rulesources.
  if (q.answered === 'rule') {
    ok(`${tag} 🔴 is a 'rule' answer whose authority our code actually rests on`,
      ruleAuthorityBlob.includes(norm(q.authority)));
  }
}

// The bank must actually EXERCISE the cross-check, or rule 2 is decorative. At least one 'rule'.
ok('the bank contains at least one engine-backed (rule) question, so the cross-check runs',
  byCoverage.rule >= 1);

// Every field that has a source registry should, eventually, have a question. Not a failure yet
// (broad ambition, honest gaps), but reported so the gap is visible, exactly like unwatched constants.
const fieldsWithQuestions = new Set(Object.keys(byField));
const fieldsMissing = L.LEGAL_FIELDS.filter((f) => !fieldsWithQuestions.has(f));

console.log('');
console.log(`  ${bank.questions.length} questions across ${fieldsWithQuestions.size} of ${L.LEGAL_FIELDS.length} legal fields`);
console.log(`  coverage:  ${byCoverage.rule} engine-backed  ${byCoverage.knowledge} source-held  ${byCoverage.uncovered} admitted gaps`);
if (fieldsMissing.length) {
  console.log(`  fields with a source registry but no exam question yet: ${fieldsMissing.join(', ')}`);
  console.log('  (counted, not hidden. this is the list to close, the same way we closed the tax gaps.)');
}
console.log('');

if (fail === 0) {
  console.log(`${pass} passed, 0 failed.`);
  process.exit(0);
}
console.log(`${pass} passed, ${fail} FAILED.`);
process.exit(1);

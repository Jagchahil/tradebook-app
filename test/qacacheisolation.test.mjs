// Tests for the tenant isolation of the free general-answer cache (qa_cache).
//
// THE DEFECT THIS SUITE GUARDS AGAINST, AND IT IS THE WORST KIND WE CAN HAVE:
// ONE CUSTOMER BEING SERVED ANOTHER CUSTOMER'S FIGURES.
//
// /api/ask decides `general = isGeneralQuestion(question)`, which is a PRONOUN
// TEST ON THE QUESTION. When general, the answer is written to qa_cache, a table
// keyed on the normalised QUESTION ALONE, with no user id, and read back with no
// user filter, so it is served to every other customer who asks the same thing.
//
// The route ALSO used to load that customer's books (transactionSummaryForUser)
// and his income mix (getBusinessProfile + getStudentLoanSettings, which state
// his partnership share and his salary, dividend and savings income in pounds)
// UNCONDITIONALLY, and hand them to the model, whose system prompt tells it to
// do the sums and show the numbers. So a question with no first person word,
// answered using his figures, was cached globally and handed to the next man.
// The old code carried a comment claiming "a served answer can never contain
// another user's figures". Nothing enforced it.
//
// A pronoun test on the QUESTION cannot know what the model chose to put in the
// ANSWER, and it never will, so the fix is not a better regex. The guarantee is
// STRUCTURAL: an answer that can be cached is composed with NO personal input at
// all, and then it cannot contain anybody's figures whatever the model writes.
//
// This suite pins that structure, because it is invisible at runtime: nothing
// crashes, nothing looks wrong, and the leak is silent for the 21 day cache life.
//
//   node test/qacacheisolation.test.mjs

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const libDir = path.join(repoRoot, 'lib');
const routeSrc = readFileSync(path.join(repoRoot, 'app', 'api', 'ask', 'route.ts'), 'utf8');
const supabaseSrc = readFileSync(path.join(libDir, 'supabase.ts'), 'utf8');

// Stage lib/ so the real module graph imports under node's type stripping.
const stage = mkdtempSync(path.join(tmpdir(), 'qacache-'));
const fix = (s) =>
  s.replace(/from '(\.\/[a-zA-Z0-9_.-]+)'/g, (m, p) => (p.endsWith('.ts') ? m : `from '${p}.ts'`));
for (const f of readdirSync(libDir)) {
  if (f.endsWith('.ts')) writeFileSync(path.join(stage, f), fix(readFileSync(path.join(libDir, f), 'utf8')));
}
const SB = await import(pathToFileURL(path.join(stage, 'supabase.ts')).href);

let pass = 0, fail = 0;
function ok(desc, cond) {
  if (cond) { pass++; process.stdout.write(`  PASS  ${desc}\n`); }
  else { fail++; process.stdout.write(`  FAIL  ${desc}\n`); }
}

// Every call that puts THIS customer's private data into the prompt. If a new
// personal read is added to the route it must be added here too, or it is not
// covered by the structural guarantee.
const PERSONAL_READS = ['transactionSummaryForUser(', 'getBusinessProfile(', 'getStudentLoanSettings('];

// Does an `if (!general)` guard open before this call, close after it, and stay
// open across it? Walk braces from the guard to prove the call sits inside the
// block, rather than merely appearing somewhere after the words.
function insideNotGeneralGuard(src, callIndex) {
  const guard = /if\s*\(\s*!\s*general\s*\)\s*\{/g;
  let m;
  while ((m = guard.exec(src)) !== null) {
    const open = m.index + m[0].length;
    if (open > callIndex) return false; // guards only appear after the call
    let depth = 1;
    for (let i = open; i < src.length && depth > 0; i++) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      if (depth === 0) {
        if (callIndex > open && callIndex < i) return true;
        break;
      }
    }
  }
  return false;
}

console.log('\nThe structural guarantee: a cacheable answer is composed with no personal input.\n');

for (const call of PERSONAL_READS) {
  let idx = routeSrc.indexOf(call);
  ok(`/api/ask reads ${call.replace('(', '')} at all (the pin is watching a real call)`, idx !== -1);
  let everyOneGuarded = idx !== -1;
  while (idx !== -1) {
    if (!insideNotGeneralGuard(routeSrc, idx)) everyOneGuarded = false;
    idx = routeSrc.indexOf(call, idx + 1);
  }
  ok(`${call.replace('(', '')} is only ever called inside an if (!general) block`, everyOneGuarded);
}

// The write gate must stay. Without it every answer, personal or not, is cached.
{
  const i = routeSrc.indexOf('upsertQaCache(');
  ok('/api/ask still writes the cache', i !== -1);
  const before = routeSrc.slice(Math.max(0, i - 300), i);
  ok('the cache write is still gated on general && allSourcesRecognised', /if\s*\(\s*general\s*&&\s*allSourcesRecognised/.test(before));
}

// Why the guard has to exist: the cache itself is global. If either of these
// ever gains a user id, the design has changed and this suite should be revisited.
{
  const lookup = supabaseSrc.slice(supabaseSrc.indexOf('export async function lookupQaCache'), supabaseSrc.indexOf('export async function bumpQaCacheHit'));
  ok('lookupQaCache filters on the question only, never a user (so the cache is shared)', lookup.includes('question_norm=eq.') && !lookup.includes('user_id'));
  const upsertStart = supabaseSrc.indexOf('export async function upsertQaCache');
  const upsert = supabaseSrc.slice(upsertStart, supabaseSrc.indexOf('\nexport ', upsertStart + 1));
  ok('upsertQaCache stores no user id (so a cached row belongs to everyone)', !upsert.includes('user_id'));
}

// The classifier is a pronoun test, and these prove it cannot carry the weight
// on its own. Each of these is plainly about the asker's own books, and each is
// classed GENERAL, which is exactly why the personal reads must be skipped.
// These are informational: a future classifier may catch them, and the guard is
// still required either way.
console.log('\nQuestions about the asker\'s own books that the pronoun test classes as general:\n');
for (const q of [
  'how close is the business to the vat threshold',
  'what tax is owed this year',
  'how much has been spent on fuel this year',
  'is the turnover over the vat registration threshold yet',
]) {
  console.log(`    ${SB.isGeneralQuestion(q) ? 'general  ' : 'personal '}${q}`);
}

// The other direction must keep working, or we have quietly taken his numbers
// away from a paying customer who asked for them properly.
console.log('');
for (const q of ['how much tax do I owe', 'what is my profit', 'what did I spend on fuel this year', 'are we over the vat threshold']) {
  ok(`a first person question stays personal, so he still gets his figures: "${q}"`, SB.isGeneralQuestion(q) === false);
}

// A general question must still be cacheable, or the credit saving is gone.
for (const q of ['what is the vat registration threshold', 'when is the self assessment deadline']) {
  ok(`a genuinely general question is still cacheable: "${q}"`, SB.isGeneralQuestion(q) === true);
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

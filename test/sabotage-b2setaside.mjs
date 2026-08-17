// SABOTAGE THE SET ASIDE LANE HEARING THE WORDS THE PRODUCT SPEAKS. B2-F3, 17 AUGUST 2026.
//
//   node test/sabotage-b2setaside.mjs
//
// The finding: this lane answers "Put by £10,618 for tax." and did not recognise "put by" as a
// question, nor "taxman" as tax. A Glasgow sole trader with £10,618 on his Tax page asked what to
// put by and was asked back whether he is a sole trader, which he had answered twice.
//
// Every sabotage is a way that returns: the old regex, either missing phrase, the greedy version
// that eats claim questions, a channel that stops asking the shared function, and the one that
// matters most, THE ANSWER WORDING CHANGING WITHOUT THE MATCHER LEARNING IT. That last one is the
// whole point of deriving the verb from the route source rather than typing a list.

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const MOBILE = path.resolve(root, '..', 'tradebook-app');

function scratch() {
  const base = mkdtempSync(path.join(tmpdir(), 'sab-b2set-'));
  const dir = path.join(base, 'tradebook');
  for (const d of ['lib', 'test', 'app']) cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  if (existsSync(MOBILE)) symlinkSync(MOBILE, path.join(base, 'tradebook-app'), 'dir');
  return { base, dir };
}
function runSuite(dir) {
  try {
    const out = execFileSync('node', [path.join(dir, 'test/waintents.test.mjs')], {
      cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (/[1-9]\d* failed\./.test(out)) return true;
  } catch { return true; }
  return false;
}
const edit = (dir, rel, from, to) => {
  const p = path.join(dir, rel);
  const s = readFileSync(p, 'utf8');
  if (!s.includes(from)) throw new Error(`ANCHOR MISSING in ${rel}: ${from.slice(0, 60)}`);
  writeFileSync(p, s.split(from).join(to));
};

const NEW_RE = "/\\b(taxman|tax man|tax|owe|set(?:ting|tin)? aside|put(?:ting|tin)? (?:by|aside|away))\\b/.test(b)";

const SABOTAGES = [
  {
    name: '🔴 the old regex is put back, which IS the finding: no taxman, no putting by',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts', NEW_RE,
      "/\\b(tax|owe|set aside|put aside|put away)\\b/.test(b)"),
  },
  {
    name: '🔴 "taxman" is dropped, and \\btax\\b cannot match it because the boundary fails on the m',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts', 'taxman|tax man|tax|owe', 'tax|owe'),
  },
  {
    name: '🔴 "putting by" is dropped, so the lane stops hearing the words its own answer opens with',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts', '|put(?:ting|tin)? (?:by|aside|away)', ''),
  },
  {
    name: 'the participle is dropped, so "put by" works and "putting by" does not',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts', 'put(?:ting|tin)? (?:by|aside|away)', 'put (?:by|aside|away)'),
  },
  {
    name: '"should i" is dropped from the question test, so "what should i be putting by" dies',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts',
      "/\\b(how much|what|my|should i)\\b/.test(b)", "/\\b(how much|what|my)\\b/.test(b)"),
  },
  {
    name: '🔴 THE ANSWER WORDING CHANGES AND THE MATCHER IS NOT TAUGHT IT. The pairing must catch this.',
    apply: ({ dir }) => edit(dir, 'app/api/thread/route.ts',
      'Put by ${formatGbp(leadFigure)} for tax', 'Hold back ${formatGbp(leadFigure)} for tax'),
  },
  {
    name: 'the lane turns greedy and eats claim questions, which have their own answer',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts',
      "&& !/\\bcan i\\b|\\bclaim\\b/.test(b);", ";"),
  },
  {
    name: 'it starts answering when he is logging an amount rather than asking a question',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts',
      "if (/£\\s*\\d/.test(b)) return null;", "if (false) return null;"),
  },
  {
    name: '🔴 the thread stops asking the shared function and will grow its own answer',
    apply: ({ dir }) => edit(dir, 'app/api/thread/route.ts', 'matchTotalsQuestion(q)', 'matchTotalsQuestionLocal(q)'),
  },
  {
    name: '🔴 WhatsApp stops asking the shared function, so the two channels drift',
    apply: ({ dir }) => edit(dir, 'app/api/whatsapp/route.ts', 'matchTotalsQuestion(', 'matchTotalsQuestionWa('),
  },
];

const CONTROLS = [
  {
    name: 'the comment explaining the finding is reworded',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts',
      '// This lane answers with "Put by £10,618 for tax." It did not recognise "put by" as a question.',
      '// This lane answers with "Put by £10,618 for tax." It could not recognise "put by" as a question.'),
  },
  {
    // ⚠️ NOT the sentence after the figure. An earlier draft used that and the control went RED,
    // because another assertion in this same suite holds that wording by equality. A control that
    // trips a real guard is a bad control, not a broken guard. A comment is inert.
    name: 'a comment in the thread route is reworded',
    apply: ({ dir }) => edit(dir, 'app/api/thread/route.ts',
      '// 🔴 WHAT HE OWES IS THE TAX HUB\'S OWN NUMBER, FETCHED BY NAME, NEVER RE-DERIVED.',
      '// 🔴 WHAT HE OWES IS THE TAX HUB\'S OWN NUMBER, FETCHED BY NAME AND NEVER RE-DERIVED.'),
  },
  {
    name: 'a blank line inside the matcher',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts',
      'export function matchTotalsQuestion(', '\nexport function matchTotalsQuestion('),
  },
  {
    name: 'an unrelated intent keeps its own wording',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts', 'const asksProfit =', 'const asksProfit  ='),
  },
];

let caught = 0, missed = 0;
console.log('SABOTAGES (each must go RED)');
for (const s of SABOTAGES) {
  const t = scratch();
  try { s.apply(t); }
  catch (e) { missed += 1; console.log(`  MISSED ${s.name}  [${e.message}]`); rmSync(t.base, { recursive: true, force: true }); continue; }
  if (runSuite(t.dir)) { caught += 1; console.log(`  ok  ${s.name}`); }
  else { missed += 1; console.log(`  MISSED ${s.name}`); }
  rmSync(t.base, { recursive: true, force: true });
}
let cOk = 0, cBad = 0;
console.log('\nCONTROLS (each must stay GREEN)');
for (const c of CONTROLS) {
  const t = scratch();
  try { c.apply(t); }
  catch (e) { cBad += 1; console.log(`  BAD ${c.name}  [${e.message}]`); rmSync(t.base, { recursive: true, force: true }); continue; }
  if (runSuite(t.dir)) { cBad += 1; console.log(`  BAD ${c.name} went red`); }
  else { cOk += 1; console.log(`  ok  ${c.name}`); }
  rmSync(t.base, { recursive: true, force: true });
}
console.log('');
console.log(`${caught}/${SABOTAGES.length} sabotages caught, ${cOk}/${CONTROLS.length} controls green.`);
if (missed > 0 || cBad > 0) process.exit(1);

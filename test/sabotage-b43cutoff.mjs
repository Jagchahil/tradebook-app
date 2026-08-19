// SABOTAGE THE FLAG THAT NOBODY READ. B43, 19 August 2026.
//
//   node test/sabotage-b43cutoff.mjs
//
// ═══════════════════════════════════════════════════════════
// test/b43cutoff.test.mjs claims two different things and this pass values them separately.
//
//   THE SHAPE half is a WALK of lib/claude.ts that derives every model call site and requires each
//   to read stop_reason or carry a written exemption. A walk is worth exactly what it can SEE, and
//   this one was green for the wrong reason on its first run, so the sabotages below include the
//   two ways a walk goes blind: a NEW call site arriving with no flag read, and the walk itself
//   being narrowed until it can only see the first one.
//
//   THE BEHAVIOUR half stubs fetch and calls the real exported functions, so what is proved is
//   what a customer would actually get. Those sabotages break the product, not the description.
//
// ⚠️ THE TWO CONTROLS ARE THE POINT AS MUCH AS THE SABOTAGES. A RENAMED LOCAL and a REWORDED
// COMMENT must both stay GREEN. The rename control is what stops a guard being anchored on an
// identifier, and the comment control is what stops it reading prose as code. Both have caught real
// anchor faults in this repo this week.
// ═══════════════════════════════════════════════════════════

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sab-b43-'));
  // app/ is copied because the suite counts how many files under app/ and lib/ type the signed
  // line. A tree without it does not fail that assertion, it crashes the suite.
  for (const d of ['lib', 'test', 'app']) {
    cpSync(path.join(root, d), path.join(dir, d), { recursive: true, dereference: false });
  }
  return dir;
}

const SUITES = ['test/b43cutoff.test.mjs'];

function runSuite(dir) {
  for (const rel of SUITES) {
    try {
      const out = execFileSync('node', [path.join(dir, rel)], {
        cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (/[1-9]\d* failed\.?/.test(out)) return true;
      if (!/\d+ passed, 0 failed\.?/.test(out)) return true;
    } catch { return true; }
  }
  return false;
}

function baseline() {
  const dir = scratch();
  const red = runSuite(dir);
  rmSync(dir, { recursive: true, force: true });
  if (red) {
    console.log('🔴 BROKEN HARNESS: an UNMODIFIED scratch tree is already RED.');
    console.log('   1. every directory test/b43cutoff.test.mjs READS is copied by scratch()');
    console.log('   2. the tally line matches the regex in runSuite');
    console.log('   3. df -h on TMPDIR: a suite that dies of ENOSPC scores as caught');
    process.exit(1);
  }
  console.log('BASELINE: an unmodified scratch tree is GREEN, so a red below is the sabotage.\n');
}

const edit = (dir, rel, from, to) => {
  const p = path.join(dir, rel);
  const s = readFileSync(p, 'utf8');
  if (!s.includes(from)) throw new Error(`ANCHOR MISSING in ${rel}: ${from.slice(0, 70)}`);
  writeFileSync(p, s.split(from).join(to));
};

const CL = 'lib/claude.ts';
const SUITE = 'test/b43cutoff.test.mjs';

// The cleaner, as it stands, and as a truncation rescue would make it. Written as joined lines
// rather than as a template literal because the function it quotes contains code fences.
const CLEAN_FROM = [
  'function clean(raw: string): string {',
  '  // Strip code fences if the model wrapped the JSON.',
  '  return raw',
  '    .replace(/^```(?:json)?/i, \'\')',
  '    .replace(/```$/, \'\')',
  '    .trim();',
  '}',
].join('\n');
const CLEAN_TO = [
  'function clean(raw: string): string {',
  '  const t = raw',
  '    .replace(/^```(?:json)?/i, \'\')',
  '    .replace(/```$/, \'\')',
  '    .trim();',
  '  const quotes = (t.match(/"/g) || []).length;',
  '  const opens = (t.match(/\\{/g) || []).length - (t.match(/\\}/g) || []).length;',
  '  return t + (quotes % 2 ? \'"\' : \'\') + \'}\'.repeat(Math.max(0, opens));',
  '}',
].join('\n');

const SABOTAGES = [
  // ── THE PARSE HALF. A CUT PARSE REACHES HIS BOOKS. ─────────────────────────────────────
  {
    name: '🔴 a cut SPOKEN TRANSACTION stops being refused, so a truncated parse can be written',
    apply: (d) => edit(d, CL, "  if (refuseIfCut(data, 'entry_parse')) return null;", ''),
  },
  {
    name: '🔴 a cut SCHEDULE parse stops being refused',
    apply: (d) => edit(d, CL, "  if (refuseIfCut(data, 'schedule_parse')) return null;", ''),
  },
  {
    name: '🔴 a cut INVOICE DRAFT stops being refused, and this one was never in the item',
    apply: (d) => edit(d, CL, "  if (refuseIfCut(data, 'invoice_draft')) return null;", ''),
  },
  {
    name: '🔴 a cut PLAYBOOK REWRITE stops being refused, so half an answer is saved and served for ever',
    apply: (d) => edit(d, CL, "  if (refuseIfCut(data, 'support_improve')) return null;", ''),
  },
  // ── THE ANSWER HALF. HALF A SENTENCE ABOUT HIS TAX, UNMARKED. ─────────────────────────
  {
    name: '🔴 the MONEY lane goes back to houseCopy, so a cut answer is unmarked again',
    apply: (d) => edit(d, CL, "  logUsage('money_question', data);\n  const textBlock = data.content?.find((c) => c.type === 'text')?.text;\n  return finishAnswer(houseCopy(textBlock), data);",
      "  logUsage('money_question', data);\n  const textBlock = data.content?.find((c) => c.type === 'text')?.text;\n  return houseCopy(textBlock);"),
  },
  {
    name: '🔴 the EXPENSE lane goes back to houseCopy',
    apply: (d) => edit(d, CL, "  logUsage('expense_check', data);\n  const textBlock = data.content?.find((c) => c.type === 'text')?.text;\n  return finishAnswer(houseCopy(textBlock), data);",
      "  logUsage('expense_check', data);\n  const textBlock = data.content?.find((c) => c.type === 'text')?.text;\n  return houseCopy(textBlock);"),
  },
  {
    name: '🔴 the SUPPORT DRAFT lane goes back to houseCopy, so a human sends a cut reply unknowing',
    apply: (d) => edit(d, CL, "  logUsage('support_draft', data);\n  const textBlock = data.content?.find((c) => c.type === 'text')?.text;\n  return finishAnswer(houseCopy(textBlock), data);",
      "  logUsage('support_draft', data);\n  const textBlock = data.content?.find((c) => c.type === 'text')?.text;\n  return houseCopy(textBlock);"),
  },
  {
    name: '🔴 THE THIRD ROUTER IS DROPPED: /api/ask stops marking a cut answer, which is the two of'
      + ' three shape this corpus keeps paying for',
    apply: (d) => edit(d, CL, '  return finishAnswer(textBlock ? textBlock : null, data);',
      '  return textBlock ? textBlock : null;'),
  },
  // ── THE FLAG ITSELF. ──────────────────────────────────────────────────────────────────
  {
    name: '🔴 THE QUIET ONE: the flag is still read, and read for the WRONG VALUE',
    apply: (d) => edit(d, CL, "  return data.stop_reason === 'max_tokens';", "  return data.stop_reason === 'end_turn';"),
  },
  {
    name: '🔴 the flag test is inverted, so an uncut reply gets the note and a cut one does not',
    apply: (d) => edit(d, CL, '  if (!wasCutOff(data)) return copy;', '  if (wasCutOff(data)) return copy;'),
  },
  // ── THE SIGNED COPY. ──────────────────────────────────────────────────────────────────
  {
    name: '🔴 the SIGNED LINE is reworded by one word, which no session is allowed to do',
    apply: (d) => edit(d, CL, "  'That is as much as I can fit in one go. Ask me about any part of it and I will go deeper.';",
      "  'That is as much as I can fit in one go. Ask me about any part of it and I will go further.';"),
  },
  {
    name: '🔴 the signed line is typed a SECOND time in another file, which is how copy drifts',
    apply: (d) => edit(d, 'lib/housestyle.ts', 'export function houseCopy(',
      "const CUT = 'That is as much as I can fit in one go. Ask me about any part of it and I will go deeper.';\nvoid CUT;\nexport function houseCopy("),
  },
  // ── THE TRIM'S OWN EDGES. ─────────────────────────────────────────────────────────────
  {
    name: '🔴 the trim EATS EVERYTHING when there is no complete sentence, so he gets the note alone',
    apply: (d) => edit(d, CL, '  if (cut < 0) return text;', "  if (cut < 0) return '';"),
  },
  {
    name: '🔴 THE MONEY ONE: a full stop that is half a decimal counts again, so "£47." is served as'
      + ' a finished figure when the model was writing £47.20',
    apply: (d) => edit(d, CL, "    if (ch === '.' && end >= text.length && i > 0 && /[0-9]/.test(text[i - 1])) continue; // half a decimal", ''),
  },
  {
    name: '🔴 the whitespace lookahead goes, so a decimal point mid number becomes a sentence end',
    apply: (d) => edit(d, CL, '    if (end < text.length && !/\\s/.test(text[end])) continue;   // mid word or mid number', ''),
  },
  {
    name: '🔴 a closing quote stops belonging to the sentence it closes',
    apply: (d) => edit(d, CL, '    while (end < text.length && CLOSERS.includes(text[end])) end++;', ''),
  },
  // ── THE CEILING. ──────────────────────────────────────────────────────────────────────
  {
    name: '🔴 the ceiling quietly goes back to the 300 production was measured cutting off at',
    apply: (d) => edit(d, CL, 'const ANSWER_MAX_TOKENS = 700;', 'const ANSWER_MAX_TOKENS = 300;'),
  },
  {
    name: '🔴 one lane types its own number again, so the three short lanes can drift apart',
    apply: (d) => edit(d, CL, "  logUsage('expense_check', data);", "  logUsage('expense_check', data);")
      || edit(d, CL, 'model: MODEL_FAST, max_tokens: ANSWER_MAX_TOKENS, messages: [{ role: \'user\', content: prompt }] }),\n    });\n  } catch (err) {\n    const message = err instanceof Error ? err.message : \'unknown error\';\n    console.error(\'[claude] Expense question request failed or timed out:\', message);',
      'model: MODEL_FAST, max_tokens: 900, messages: [{ role: \'user\', content: prompt }] }),\n    });\n  } catch (err) {\n    const message = err instanceof Error ? err.message : \'unknown error\';\n    console.error(\'[claude] Expense question request failed or timed out:\', message);'),
  },
  // ── THE WALK GOING BLIND. THE TWO SHAPES. ─────────────────────────────────────────────
  {
    name: '🔴 A TENTH CALL SITE ARRIVES and reads nothing, which is exactly how this item was born',
    apply: (d) => edit(d, CL, 'export async function parseSchedule(',
      "export async function askSomethingNew(q: string): Promise<string | null> {\n"
      + "  if (!ready() || !KEY) return null;\n"
      + "  const res = await fetch(API_URL, {\n"
      + "    method: 'POST',\n"
      + "    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },\n"
      + "    body: JSON.stringify({ model: MODEL_FAST, max_tokens: 300, messages: [{ role: 'user', content: q }] }),\n"
      + "  });\n"
      + "  const data = await readClaudeReply(res, 'something_new');\n"
      + "  if (!data) return null;\n"
      + "  return data.content?.find((c) => c.type === 'text')?.text ?? null;\n"
      + "}\n\n"
      + 'export async function parseSchedule('),
  },
  {
    name: '🔴 THE WALK IS NARROWED until it can only see the first call site, and reports zero misses',
    apply: (d) => edit(d, SUITE, '  while ((m = re.exec(code)) !== null) {\n    const fn = enclosing(spans, m.index);',
      '  while ((m = re.exec(code)) !== null) {\n    if (sites.length >= 1) break;\n    const fn = enclosing(spans, m.index);'),
  },
  {
    name: '🔴 the reader set is taken from PROSE as well as code, so a comment can cover a call site',
    apply: (d) => edit(d, SUITE, '  const readers = new Set(spans.filter((s) => /stop_reason/.test(codeOf(s))).map((s) => s.name));',
      '  const readers = new Set(spans.filter((s) => /stop_reason/.test(source.slice(s.start, s.end))).map((s) => s.name));'),
  },
  {
    name: '🔴 the body opener goes back to "the first brace", which hides draftSupportReply behind its'
      + ' own parameter type',
    apply: (d) => edit(d, SUITE, '    const open = bodyOpener(source, closeParen + 1);',
      '    const open = source.indexOf(\'{\', m.index);'),
  },
  {
    name: '🔴 spans go back to running to the NEXT function, which made logUsage a reader of the flag',
    apply: (d) => edit(d, SUITE, '    const close = matchPair(source, open, \'{\', \'}\');\n    if (close < 0) continue;\n    out.push({ name: m[1], start: m.index, end: close + 1, bodyStart: open });',
      '    out.push({ name: m[1], start: m.index, end: source.length, bodyStart: open });'),
  },
  // ── THE MEASUREMENT HALF. SECTION 4 IS A NUMBER THAT USED TO BE A COMMENT. ────────────
  //
  // Section 4 derives the worst reply each bounded parse path can produce, pins its length and its
  // headroom, and proves no prefix of it parses. These six break it in the six ways it can go
  // quietly wrong: the bound growing, a prefix becoming parseable, a new field nothing sizes, a
  // faked exemption, an allowance shrunk until the bound flatters itself, and the loop going blind.
  {
    name: '🔴 A FIELD CAP IS RAISED UNTIL THE WORST SCHEDULE REPLY EXCEEDS THE 300 CEILING, which is'
      + ' the exact rot the old prose comment could never have seen',
    apply: (d) => edit(d, CL, "      title: (p.title || 'Reminder').toString().slice(0, 140),",
      "      title: (p.title || 'Reminder').toString().slice(0, 400),"),
  },
  {
    name: '🔴 THE CLEANER GAINS A TRUNCATION RESCUE, so cut prefixes start parsing again. This one is'
      + ' not hypothetical: rescueTruncatedReceipt is the same idea forty lines up',
    apply: (d) => edit(d, CL, CLEAN_FROM, CLEAN_TO),
  },
  {
    name: '🔴 A NEW FIELD ARRIVES ON THE SCHEDULE REPLY AND NOTHING SIZES IT. It must go red BY NAME'
      + ' rather than be left out of the total, which is the whole reason the fixture is derived',
    apply: (d) => edit(d, CL, '      remind_at?: string | null;',
      '      remind_at?: string | null;\n      customer_ref?: string;'),
  },
  {
    name: '🔴 AN UNBOUNDED EXEMPTION IS WAVED THROUGH POINTING AT A FIELD THAT IS NOT AN ARRAY, which'
      + ' is how a written reason becomes a rubber stamp',
    apply: (d) => edit(d, CL, '  // WORST REPLY UNBOUNDED: line_items. The array grows with the job,',
      '  // WORST REPLY UNBOUNDED: customer_name. The array grows with the job,'),
  },
  {
    name: '🔴 THE ISO ALLOWANCE IS SHRUNK TO A BARE DATE, so the worst reply flatters itself and the'
      + ' headroom reads bigger than it is',
    apply: (d) => edit(d, SUITE, "const ISO_WORST = '2026-08-19T08:00:00.000+01:00';",
      "const ISO_WORST = '2026-08-19';"),
  },
  {
    name: '🔴 THE PREFIX LOOP GOES BLIND: it stops parsing anything at all, so it reports zero for'
      + ' ever and only the vacuity probes can tell',
    apply: (d) => edit(d, SUITE, '    try { JSON.parse(realClean(reply.slice(0, i))); parsed += 1; } catch { /* refused, which is the point */ }',
      '    try { realClean(reply.slice(0, i)); } catch { /* refused, which is the point */ }'),
  },
  // ── THE LOG. ──────────────────────────────────────────────────────────────────────────
  {
    name: '🔴 the refusal stops logging a cause, so a cut is indistinguishable from nonsense again',
    apply: (d) => edit(d, CL, '  console.error(`[claude] ${feature}: cut off at our own token ceiling. Refused rather than guessed.`);', ''),
  },
];

// NO OP CONTROLS. Each changes the files and changes NOTHING these guards are about.
const CONTROLS = [
  {
    name: 'CONTROL: a LOCAL IS RENAMED in the trim, and a guard that reds here is about an identifier',
    apply: (d) => {
      edit(d, CL, '  let cut = -1;', '  let lastEnd = -1;');
      edit(d, CL, '    cut = end;', '    lastEnd = end;');
      edit(d, CL, '  if (cut < 0) return text;', '  if (lastEnd < 0) return text;');
      edit(d, CL, '  const kept = text.slice(0, cut).trim();', '  const kept = text.slice(0, lastEnd).trim();');
    },
  },
  {
    name: 'CONTROL: a COMMENT is reworded, and it mentions stop_reason and max_tokens on purpose',
    apply: (d) => edit(d, CL, '// Did OUR ceiling cut this reply off? The only thing in this file that decides that question.',
      '// Reworded comment. It says stop_reason and max_tokens: 300 out loud, and neither is code.'),
  },
  {
    name: 'CONTROL: the feature name in a REFUSAL LOG is reworded, which is prose, not a decision',
    apply: (d) => edit(d, CL, 'Refused rather than guessed.', 'Refused instead of guessing.'),
  },
  {
    name: 'CONTROL: PROSE inside parseSchedule names the title field, a slice cap and ISO 8601 out'
      + ' loud. Section 4 blanks comments, so not one word of it may size anything',
    apply: (d) => edit(d, CL, "  const data = await readClaudeReply(res, 'schedule_parse');",
      '  // Reworded note. The title field is a string, and this sentence says slice(0, 999) and ISO'
      + ' 8601 out loud on purpose. None of it is code and none of it may size a field.\n'
      + "  const data = await readClaudeReply(res, 'schedule_parse');"),
  },
  {
    name: 'CONTROL: the REASON on an unbounded exemption is reworded while still naming its array'
      + ' field, because the guard is about the field and not about the sentence',
    apply: (d) => edit(d, CL, '  // WORST REPLY UNBOUNDED: line_items. The array grows with the job, so no set of field caps',
      '  // WORST REPLY UNBOUNDED: line_items. Reworded reason that still names a real array field'),
  },
  {
    name: 'CONTROL: whitespace is added inside the finisher',
    apply: (d) => edit(d, CL, '  if (!copy) return null;', '  if (!copy) return null;\n'),
  },
];

const only = process.env.SAB_ONLY ? Number(process.env.SAB_ONLY) : null;
const from = process.env.SAB_FROM ? Number(process.env.SAB_FROM) : 0;
const to = process.env.SAB_TO ? Number(process.env.SAB_TO) : SABOTAGES.length;
const sliced = from !== 0 || to !== SABOTAGES.length || only !== null;

baseline();

let caught = 0;
const holes = [];
const list = only !== null ? [SABOTAGES[only]] : SABOTAGES.slice(from, to);
for (const s of list) {
  const dir = scratch();
  let applied = true;
  try { s.apply(dir); } catch (e) { applied = false; console.log(`  🔴 MISSED ANCHOR  ${s.name}\n     ${e.message}`); }
  if (applied) {
    if (runSuite(dir)) { caught += 1; console.log(`  CAUGHT  ${s.name}`); }
    else { holes.push(s.name); console.log(`  🔴 HOLE    ${s.name}`); }
  }
  rmSync(dir, { recursive: true, force: true });
}

let controlsGreen = 0;
const badControls = [];
const runControls = !process.env.SAB_SKIP_CONTROLS;
if (runControls) {
  for (const c of CONTROLS) {
    const dir = scratch();
    try {
      c.apply(dir);
      if (runSuite(dir)) { badControls.push(c.name); console.log(`  🔴 CONTROL RED  ${c.name}`); }
      else { controlsGreen += 1; console.log(`  control green  ${c.name}`); }
    } catch (e) { badControls.push(`${c.name} (anchor: ${e.message})`); }
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log(`\n${caught}/${list.length} sabotages caught, ${controlsGreen}/${runControls ? CONTROLS.length : 0} controls green.`);
if (sliced) console.log('NOT THE WHOLE PASS: run with no SAB_FROM, SAB_TO or SAB_ONLY for the full figure.');
if (holes.length) { console.log('\nHOLES:'); for (const h of holes) console.log(`  ${h}`); }
if (badControls.length) { console.log('\nBAD CONTROLS:'); for (const b of badControls) console.log(`  ${b}`); }
process.exitCode = holes.length || badControls.length || caught !== list.length ? 1 : 0;

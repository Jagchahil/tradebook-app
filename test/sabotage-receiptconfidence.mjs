// SABOTAGE THE CONFIDENCE SIGNAL. Put the £110.55 back and make sure the suite notices.
//
//   1. ANCHOR ON THE CALL, not the import.
//   2. KILL EVERY CALL SITE.
//   3. ANCHOR THE ASSIGNMENT, not the identifier.
//   4. NO-OP CONTROLS must stay GREEN.
//
//   node test/sabotage-receiptconfidence.mjs

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sab-rconf-'));
  for (const d of ['lib', 'test', 'app', 'supabase']) cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  return dir;
}
function runSuite(dir) {
  try {
    const out = execFileSync('node', [path.join(dir, 'test/receiptconfidence.test.mjs')], {
      cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { red: /[1-9]\d* failed\./.test(out), out };
  } catch (e) { return { red: true, out: String(e.stdout ?? '') + String(e.stderr ?? '') }; }
}
const edit = (dir, rel, from, to) => {
  const p = path.join(dir, rel);
  const s = readFileSync(p, 'utf8');
  if (!s.includes(from)) throw new Error(`ANCHOR MISSING in ${rel}: ${from.slice(0, 70)}`);
  writeFileSync(p, s.split(from).join(to));
};

const SABOTAGES = [
  // ── The line the whole design turns on ───────────────────────────────────────────────────
  {
    name: '🔴 "not asked" starts meaning "unsure", flagging every book already written',
    apply: (d) => edit(d, 'lib/receiptconfidence.ts',
      '  if (score === null || score === undefined) return false;',
      '  if (score === null || score === undefined) return true;'),
  },
  {
    name: 'the guard tests equality, so a future lower score falls through it',
    apply: (d) => edit(d, 'lib/receiptconfidence.ts',
      '  return score < CONFIDENCE_CLEAR;',
      '  return score === CONFIDENCE_UNSURE;'),
  },
  {
    name: 'a word we never asked for becomes a score',
    apply: (d) => edit(d, 'lib/receiptconfidence.ts',
      "  if (confidence === 'unsure') return CONFIDENCE_UNSURE;\n  return null;",
      "  return CONFIDENCE_UNSURE;"),
  },
  {
    name: 'unsure scores the same as clear, so nothing ever splits',
    apply: (d) => edit(d, 'lib/receiptconfidence.ts',
      'export const CONFIDENCE_UNSURE = 0.5;', 'export const CONFIDENCE_UNSURE = 1;'),
  },
  // ── The question asked ───────────────────────────────────────────────────────────────────
  {
    name: 'the model is asked for a probability instead of what it could see',
    apply: (d) => edit(d, 'lib/claude.ts',
      '  \'  "amount_confidence": "clear" or "unsure", about the TOTAL only\',',
      '  \'  "amount_confidence": number between 0 and 1\','),
  },
  {
    name: 'the bias toward unsure is removed, so a borderline read passes as clear',
    apply: (d) => edit(d, 'lib/claude.ts',
      'If you are weighing it up at all, say unsure.', ''),
  },
  {
    name: 'the question becomes about plausibility rather than legibility',
    apply: (d) => edit(d, 'lib/claude.ts',
      "'This is about the printing and the photograph, never about whether the amount seems plausible.',",
      "'Judge whether the amount looks plausible for this kind of shop.',"),
  },
  {
    name: 'anything the model says is accepted, so a sentence becomes a signal',
    apply: (d) => edit(d, 'lib/claude.ts',
      `      amount_confidence:
        parsed.amount_confidence === 'clear' || parsed.amount_confidence === 'unsure'
          ? parsed.amount_confidence
          : undefined,`,
      '      amount_confidence: parsed.amount_confidence,'),
  },
  // ── The storing ──────────────────────────────────────────────────────────────────────────
  {
    name: 'the ingest stops storing it, so the signal dies at the door',
    apply: (d) => edit(d, 'lib/receiptingest.ts',
      '    confidence_score: scoreFor(parsed.amount_confidence),', ''),
  },
  {
    name: 'the pile SELECT stops naming the column, so it arrives undefined',
    apply: (d) => edit(d, 'lib/supabase.ts',
      'cis_deduction,source_type,confidence_score`', 'cis_deduction,source_type`'),
  },
  // ── The grouping, which is what actually protects the press ──────────────────────────────
  {
    name: '🔴 the faded receipt rejoins the crisp ones, which is the finding itself',
    apply: (d) => edit(d, 'lib/reviewpile.ts',
      "const id = `${kind}:${read ? 'read' : 'given'}${unsure ? ':unsure' : ''}:${key}`;",
      "const id = `${kind}:${read ? 'read' : 'given'}:${key}`;"),
  },
  {
    name: 'the group stops carrying the flag, so no screen can act on it',
    apply: (d) => edit(d, 'lib/reviewpile.ts',
      '      uncertainAmount: unsure,', '      uncertainAmount: false,'),
  },
  {
    name: 'the flag is computed from the wrong thing',
    apply: (d) => edit(d, 'lib/reviewpile.ts',
      'const unsure = isUncertainAmount(e.confidence_score);',
      'const unsure = false;'),
  },
  // ── The press. A flag that changes no button is a log line. ──────────────────────────────
  {
    name: 'the doubtful list is emptied while every mention of the name stays',
    apply: (d) => edit(d, 'app/app/pile/page.tsx',
      'const knownUnsure = known.filter((g) => g.readFromPhoto && g.uncertainAmount);',
      'const knownUnsure = [];'),
  },
  {
    name: 'the sure list swallows the doubtful ones again',
    apply: (d) => edit(d, 'app/app/pile/page.tsx',
      'const knownRead = known.filter((g) => g.readFromPhoto && !g.uncertainAmount);',
      'const knownRead = known.filter((g) => g.readFromPhoto);'),
  },
  {
    name: 'the route stops separating the populations, so one press files them all',
    apply: (d) => edit(d, 'app/api/pile/route.ts',
      '.filter((g) => g.readFromPhoto === wantRead && g.uncertainAmount === wantUnsure),',
      '.filter((g) => g.readFromPhoto === wantRead),'),
  },
  {
    name: 'the verdict falls off the allowlist, so the button posts as business',
    apply: (d) => edit(d, 'app/api/pile/route.ts',
      "'confirm_read', 'confirm_unsure', 'income'", "'confirm_read', 'income'"),
  },
  // ── The copy ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'the amount is hidden instead of shown, which helps nobody check it',
    apply: (d) => edit(d, 'app/app/pile/page.tsx',
      '                    <p style={S.meta}>{uncertainAmountLine(gbp2(g.total))}</p>', ''),
  },
  {
    name: '🔴 it starts blaming her photograph, the sentence said twice on 12 August',
    apply: (d) => edit(d, 'lib/receiptconfidence.ts',
      "  return `The paper was hard to read, so ${amount} is our best reading of the total rather than a `\n    + 'certainty. Worth a look at the receipt before you file it.';",
      "  return `We could not read ${amount} clearly. A clearer photograph usually does it.`;"),
  },
  {
    name: 'the one press becomes two, which is the finding the founder quit over',
    apply: (d) => edit(d, 'app/app/pile/page.tsx',
      `                <button type="submit" className="lek-primary">
                  {knownUnsure.length === 1`,
      `                <button type="submit" className="lek-primary">x</button>
                <button type="submit" className="lek-primary">
                  {knownUnsure.length === 1`),
  },
];

const CONTROLS = [
  {
    name: 'a comment is reworded in receiptconfidence',
    apply: (d) => edit(d, 'lib/receiptconfidence.ts',
      '// What the model is allowed to say.', '// What the model is allowed to say (comment touched).'),
  },
  {
    name: 'whitespace is added in reviewpile',
    apply: (d) => edit(d, 'lib/reviewpile.ts',
      'const unsure = isUncertainAmount(e.confidence_score);',
      'const unsure = isUncertainAmount(e.confidence_score);\n'),
  },
  {
    name: 'the section heading text is reworded, which is copy and not behaviour',
    apply: (d) => edit(d, 'lib/receiptconfidence.ts',
      "export const UNCERTAIN_SECTION_TITLE = 'Worth checking the figure';",
      "export const UNCERTAIN_SECTION_TITLE = 'Worth a look at these figures';"),
  },
];

let caught = 0, missed = 0;
console.log('SABOTAGES (each must go RED)');
for (const s of SABOTAGES) {
  const dir = scratch();
  try { s.apply(dir); }
  catch (e) { missed += 1; console.log(`  MISSED ${s.name}  [${e.message}]`); rmSync(dir, { recursive: true, force: true }); continue; }
  const r = runSuite(dir);
  if (r.red) { caught += 1; console.log(`  ok  ${s.name}`); }
  else { missed += 1; console.log(`  MISSED ${s.name}`); }
  rmSync(dir, { recursive: true, force: true });
}
let controlsOk = 0, controlsBad = 0;
console.log('\nCONTROLS (each must stay GREEN)');
for (const c of CONTROLS) {
  const dir = scratch();
  try { c.apply(dir); }
  catch (e) { controlsBad += 1; console.log(`  BAD ${c.name}  [${e.message}]`); rmSync(dir, { recursive: true, force: true }); continue; }
  const r = runSuite(dir);
  if (r.red) { controlsBad += 1; console.log(`  BAD ${c.name} went red`); }
  else { controlsOk += 1; console.log(`  ok  ${c.name}`); }
  rmSync(dir, { recursive: true, force: true });
}
console.log('');
console.log(`${caught}/${SABOTAGES.length} sabotages caught, ${controlsOk}/${CONTROLS.length} controls green.`);
console.log(`${caught + controlsOk} of ${SABOTAGES.length + CONTROLS.length}.`);
if (missed > 0 || controlsBad > 0) process.exit(1);

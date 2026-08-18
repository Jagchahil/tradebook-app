// SABOTAGE THE RUN 3 PACKET. Every guard has to be load bearing, and the only proof is breaking it.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// A green suite proves the code passes the suite. It does not prove the suite would notice the bug
// coming back. So each sabotage below reintroduces ONE Run 3 finding, on a scratch copy of the
// repo, and test/run3fixes.test.mjs has to go red. A sabotage that stays green is a hole.
//
// The four disciplines this repo has learned, and Run 3 broke two of them writing its own guards:
//   1. ANCHOR ON THE CALL, not the import. An import is not a wiring. (Broken once: the web gate
//      ordering assertion compared against an import statement 280 lines above the call.)
//   2. KILL EVERY CALL SITE, or the sabotage is a no-op and the green is meaningless.
//   3. ANCHOR THE ASSIGNMENT, not the identifier, so a rename does not silently miss.
//   4. NO-OP CONTROLS. A few edits that change nothing must stay GREEN, or the runner is just
//      detecting that the file was touched. (Broken twice on one sentence: an assertion grepped
//      the wrong file, then the wrong apostrophe, and would have passed with the sentence deleted.)
//
//   node test/sabotage-run3.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sab-run3-'));
  for (const d of ['lib', 'test', 'app', 'supabase']) {
    cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  }
  return dir;
}

function runSuite(dir) {
  try {
    const out = execFileSync('node', [path.join(dir, 'test/run3fixes.test.mjs')], {
      cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { red: /[1-9]\d* failed\./.test(out), out };
  } catch (e) {
    // A non-zero exit is red, which is exactly what a sabotage should produce.
    return { red: true, out: String(e.stdout ?? '') + String(e.stderr ?? '') };
  }
}

const edit = (dir, rel, from, to) => {
  const p = path.join(dir, rel);
  const s = readFileSync(p, 'utf8');
  if (!s.includes(from)) throw new Error(`ANCHOR MISSING in ${rel}: ${from.slice(0, 90)}`);
  writeFileSync(p, s.split(from).join(to));
};

const SABOTAGES = [
  // ── F1: the projection window ────────────────────────────────────────────────────────────
  {
    name: 'F1 the year is measured from his first bank row again',
    apply: (d) => edit(d, 'lib/supabase.ts',
      'const daysElapsed = Math.max(0, Math.floor((now.getTime() - yearStart.getTime()) / 86400000));',
      'const daysElapsed = Math.max(0, Math.floor((now.getTime() - observedFrom.getTime()) / 86400000));'),
  },
  {
    name: 'F1 the confidence gate goes back on the rows instead of the year',
    apply: (d) => edit(d, 'lib/supabase.ts',
      'const monthsElapsed = Math.max(0, Math.floor((now.getTime() - yearStart.getTime()) / (30.44 * 86400000)));',
      'const monthsElapsed = Math.max(0, Math.floor((now.getTime() - observedFrom.getTime()) / (30.44 * 86400000)));'),
  },
  {
    name: 'F1 observedDays never reaches the optimiser',
    apply: (d) => edit(d, 'lib/supabase.ts', '\n    observedDays,', '\n'),
  },
  {
    name: 'F1 the coverage gate is removed, so one week of rows projects a year',
    apply: (d) => edit(d, 'lib/taxengine.ts',
      'input.monthsElapsed >= 3 && usableDays > 0 && observed >= PROJECTION_MIN_OBSERVED_DAYS;',
      'input.monthsElapsed >= 3 && usableDays > 0;'),
  },
  {
    name: 'F1 the coverage floor is dropped to nothing',
    apply: (d) => edit(d, 'lib/taxengine.ts',
      'export const PROJECTION_MIN_OBSERVED_DAYS = 90;',
      'export const PROJECTION_MIN_OBSERVED_DAYS = 1;'),
  },

  // ── F2: payments on account ──────────────────────────────────────────────────────────────
  {
    name: 'F2 each instalment halves the GROSS bill again',
    apply: (d) => edit(d, 'lib/taxengine.ts',
      'const each = required ? round2(relevantAmount / 2) : 0;',
      'const each = required ? round2(saBill / 2) : 0;'),
  },
  {
    name: 'F2 the relevant amount stops deducting tax at source',
    apply: (d) => edit(d, 'lib/taxengine.ts',
      'const relevantAmount = Math.max(0, round2(saBill - atSource));',
      'const relevantAmount = Math.max(0, round2(saBill));'),
  },
  {
    // ⚠️ RUN 1's FIX, GUARDED BY RUN 3'S SUITE. A packet that quietly undid the 80 percent test
    // while fixing the amount would be the same bug wearing the other trouser leg.
    // ⚠️ RE-ANCHORED WITHIN THE SAME PACKET, 13 August 2026, and worth recording. The first cut of
    // the POA fix put the £1,000 floor on the relevant amount, test/moneyspine.test.mjs caught the
    // regression, and correcting it rewrote the two lines these anchors point at. This sabotage and
    // the control below silently became ABSENT: 32 of 32 read as 31 of 32 with two ERRORs, and only
    // re-running the pass on the finished tree showed it. Twice in one run, and the second time was
    // this file. A sabotage that cannot apply is not a passing sabotage.
    name: 'F2 the 80 percent exemption from Run 1 is undone',
    apply: (d) => edit(d, 'lib/taxengine.ts',
      'const coveredAtSource = atSourceShare >= POA_AT_SOURCE_SHARE;',
      'const coveredAtSource = false;'),
  },
  {
    name: 'F2 the hub stops handing the CIS figure to the engine',
    apply: (d) => edit(d, 'app/app/tax/page.tsx',
      'paymentsOnAccount(tax.selfAssessmentTax, startYear + 1, tax.cisSuffered)',
      'paymentsOnAccount(tax.selfAssessmentTax, startYear + 1)'),
  },

  // ── F3: one meaning of "put by" ──────────────────────────────────────────────────────────
  {
    name: 'F3 WhatsApp answers with the liability instead of what he has to find',
    apply: (d) => edit(d, 'app/api/whatsapp/route.ts',
      'oweAnswer(billFromPosition(tax), tax.projected, hasPosition)',
      'oweAnswer(tax.setAside, tax.projected, hasPosition)'),
  },
  {
    name: 'F3 the web chat grows its own ternary back',
    apply: (d) => edit(d, 'app/api/thread/route.ts',
      'const leadFigure = billFromPosition(tax);',
      'const leadFigure = tax.cisSuffered > 0 ? tax.setAsideAfterCis : tax.setAside;'),
  },

  // ── F4: the tense of a projection ────────────────────────────────────────────────────────
  {
    name: 'F4 the Overview announces a projection as a thing that happened',
    apply: (d) => edit(d, 'app/app/page.tsx',
      '`${gbp2(tax.cisSuffered)} of it is on course to come off through CIS across the year, so this is what is left to find.`',
      '`${gbp2(tax.cisSuffered)} of it has already gone to HMRC through CIS, so this is what is left to find.`'),
  },
  {
    // ⚠️ THE HALF SENTENCE TRAP, WHICH THIS PACKET WALKED INTO ONCE. Correcting the opening and
    // leaving the second clause saying the same wrong thing is the Run 2 headline fault exactly.
    name: 'F4 the hub corrects its opening and leaves "that part is paid" hanging off it',
    apply: (d) => edit(d, 'app/app/tax/page.tsx',
      'of this under CIS across the year, so that much of it is paid as you go rather than in January.`',
      'of this under CIS, so that part is paid.`'),
  },

  // ── F5: somebody else's money, by name, on both channels ─────────────────────────────────
  {
    name: 'F5 a named person stops being recognised at all',
    apply: (d) => edit(d, 'lib/waintents.ts',
      '  const named = namesAPerson(b, selfNames);',
      '  const named = false;'),
  },
  {
    name: 'F5 the money verb pattern is dropped, leaving only the possessive one',
    apply: (d) => edit(d, 'lib/waintents.ts',
      '  for (const re of [NAMED_PERSON_VERB_RE, NAMED_PERSON_POSSESSIVE_RE]) {',
      '  for (const re of [NAMED_PERSON_POSSESSIVE_RE]) {'),
  },
  {
    name: 'F5 the stoplist swallows every name, so nothing is ever a person',
    apply: (d) => edit(d, 'lib/waintents.ts',
      '    if (!word || NOT_A_PERSON.has(word)) continue;',
      '    if (!word) continue; if (true) continue;'),
  },
  {
    name: 'F5 the web router loses its gate again',
    apply: (d) => edit(d, 'app/api/thread/route.ts',
      '  if (isAboutSomeoneElse(q)) return SOMEONE_ELSE_ANSWER;',
      '  if (false) return SOMEONE_ELSE_ANSWER;'),
  },
  {
    // ⚠️ ORDERING, NOT PRESENCE. A gate below the lanes that read his books is not a gate.
    name: 'F5 the web gate is moved below the lane that reads his rows',
    apply: (d) => {
      const p = path.join(d, 'app/api/thread/route.ts');
      const s = readFileSync(p, 'utf8');
      const line = '  if (isAboutSomeoneElse(q)) return SOMEONE_ELSE_ANSWER;';
      if (!s.includes(line)) throw new Error('ANCHOR MISSING: the web gate');
      const moved = s.replace(`${line}\n`, '')
        .replace('  const summary = await transactionSummaryForUser(userId)', `${line}\n  const summary = await transactionSummaryForUser(userId)`);
      writeFileSync(p, moved);
    },
  },

  // ── F6: the model is never invited to total ──────────────────────────────────────────────
  {
    name: 'F6 "never add these up" goes back on the truncated arm only',
    apply: (d) => edit(d, 'lib/supabase.ts',
      '    : `His entries, ${rows.length} of them, covering ${oldest} to ${newest}. This is all of them. ${NEVER_TOTAL}`;',
      '    : `His entries, ${rows.length} of them, covering ${oldest} to ${newest}. This is all of them.`;'),
  },
  {
    name: 'F6 the rule stops covering a PERSON and only covers a period',
    apply: (d) => edit(d, 'lib/supabase.ts',
      "'Never add these rows up into a total for any period or any person: every total in this product'",
      "'Never add these rows up into a total for any period: every total in this product'"),
  },
  {
    name: 'F6 the whose-figures-are-these rule is deleted from the money prompt',
    apply: (d) => edit(d, 'lib/claude.ts',
      "    '- These figures belong to the person you are talking to and to nobody else.",
      "    '- IGNORED. "),
  },
  {
    name: 'F6 the cannot-change-your-books rule is deleted',
    apply: (d) => edit(d, 'lib/claude.ts',
      "    '- You cannot add, change or delete anything in their books.",
      "    '- IGNORED. "),
  },
  {
    name: 'F6 the rule survives but stops naming the control that works',
    apply: (d) => edit(d, 'lib/claude.ts',
      'open Money, find the line, and press Not business',
      'get in touch and we will sort it'),
  },

  // ── F7: the PAYE tick is signposted ──────────────────────────────────────────────────────
  {
    name: 'F7 the payroll section is written but never rendered',
    apply: (d) => edit(d, 'app/app/you/circumstances/page.tsx',
      '      <EmploymentHeld rows={rows} />\n', ''),
  },
  {
    name: 'F7 the section renders but the link to the salary box is dropped',
    apply: (d) => edit(d, 'app/app/you/circumstances/page.tsx',
      '<a href="/app/tax/ni" style={S.slLink}>{JOB_LINK}</a>',
      '{JOB_LINK}'),
  },
  {
    name: 'F7 it stops saying why the amount matters',
    apply: (d) => edit(d, 'app/app/you/circumstances/page.tsx',
      'so it sets the rate your business is taxed at and it decides ',
      'so it is worth knowing about and it is nice to have '),
  },

  // ── F8: the pension lever and the 60 percent band ────────────────────────────────────────
  {
    name: 'F8 the pension lever goes back to a flat 20 points',
    apply: (d) => edit(d, 'lib/taxoptimiser.ts',
      'const saving = round(plainHigher * 0.2 + inTaper * 0.4);',
      'const saving = round(over * 0.2);'),
  },
  {
    name: 'F8 the taper slice is computed and then priced at 20 points anyway',
    apply: (d) => edit(d, 'lib/taxoptimiser.ts',
      'inTaper * 0.4);', 'inTaper * 0.2);'),
  },
  {
    name: 'F8 the copy stops telling him which pounds are the valuable ones',
    apply: (d) => edit(d, 'lib/taxoptimiser.ts',
      'relieved at an effective 60% rather than 40%',
      'relieved at the usual rate'),
  },

  // ── F9: whose pay ────────────────────────────────────────────────────────────────────────
  {
    name: 'F9 the firm\'s CIS is called "your pay" to a partner again',
    apply: (d) => edit(d, 'app/app/tax/summary/page.tsx',
      "{isPartnership ? ' from the firm\\u2019s payments' : ' from your pay'}",
      "{' from your pay'}"),
  },
  {
    name: 'F9 the partner is no longer pointed at his own share',
    apply: (d) => edit(d, 'app/app/tax/summary/page.tsx',
      ' Your own share of it is on your Overview, and that is the figure that reaches your return.',
      ' '),
  },
  {
    name: 'F9 the firm against share sentence is deleted from the one place it lives',
    apply: (d) => edit(d, 'lib/position.ts',
      "return 'This is everything through the business, the whole firm\\'s money, before your share is taken.';",
      "return 'These are your figures.';"),
  },
];

// ⚠️ NO-OP CONTROLS. These change the files and change NOTHING the suite is about. If any of them
// goes red the runner is detecting that a file was touched, not that a fix was undone, and every
// green above it is worthless.
const NO_OPS = [
  {
    name: 'a comment is added to the engine',
    apply: (d) => edit(d, 'lib/taxengine.ts',
      '// --- Trading losses ---------------------------------------------------------',
      '// A comment that means nothing.\n// --- Trading losses ---------------------------------------------------------'),
  },
  {
    name: 'a local variable inside the POA function is renamed',
    apply: (d) => edit(d, 'lib/taxengine.ts',
      'const atSourceShare = saBill > 0 ? atSource / saBill : 0;\n  const coveredAtSource = atSourceShare >= POA_AT_SOURCE_SHARE;',
      'const shareTakenAtSource = saBill > 0 ? atSource / saBill : 0;\n  const coveredAtSource = shareTakenAtSource >= POA_AT_SOURCE_SHARE;'),
  },
  {
    name: 'whitespace is added to the money prompt',
    apply: (d) => edit(d, 'lib/claude.ts',
      "    'Rules you never break, whatever is asked:',",
      "    'Rules you never break, whatever is asked:',\n"),
  },
];

let redCount = 0;
let holes = 0;
let noopFails = 0;

console.log('SABOTAGE: RUN 3 PACKET');
console.log('');

for (const s of SABOTAGES) {
  const dir = scratch();
  try {
    s.apply(dir);
    const { red } = runSuite(dir);
    if (red) {
      redCount += 1;
      console.log(`  red   ${s.name}`);
    } else {
      holes += 1;
      console.log(`  GREEN ${s.name}   <-- HOLE: the suite did not notice`);
    }
  } catch (e) {
    holes += 1;
    console.log(`  ERROR ${s.name}: ${e.message}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('');
console.log('NO-OP CONTROLS (these must stay GREEN)');
for (const s of NO_OPS) {
  const dir = scratch();
  try {
    s.apply(dir);
    const { red } = runSuite(dir);
    if (red) {
      noopFails += 1;
      console.log(`  RED   ${s.name}   <-- the runner is detecting a touched file, not a fix`);
    } else {
      console.log(`  green ${s.name}`);
    }
  } catch (e) {
    noopFails += 1;
    console.log(`  ERROR ${s.name}: ${e.message}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('');
console.log(`${redCount}/${SABOTAGES.length} sabotages caught, ${NO_OPS.length - noopFails}/${NO_OPS.length} controls stayed green.`);
if (holes > 0 || noopFails > 0) process.exit(1);

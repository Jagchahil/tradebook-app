// SABOTAGE R2-F23. Put the two engines back at odds and make sure the suite notices.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// A green suite proves the code passes the suite. It does not prove the suite would notice the
// bug coming back. Each sabotage below reintroduces one part of F23 on a scratch copy of the
// repo, and test/f23bill.test.mjs has to go red. A sabotage that stays green is a hole.
//
// The disciplines this repo has learned, applied throughout:
//   1. ANCHOR ON THE CALL, not the import. An import is not a wiring.
//   2. KILL EVERY CALL SITE, or the sabotage is a no-op and the green is meaningless.
//   3. ANCHOR THE ASSIGNMENT, not the identifier, so a rename does not silently miss.
//   4. NO-OP CONTROLS. Edits that change nothing must stay GREEN, or the runner is only
//      detecting that a file was touched.
//
//   node test/sabotage-f23.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sab-f23-'));
  for (const d of ['lib', 'test', 'app']) {
    cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  }
  return dir;
}

function runSuite(dir) {
  try {
    const out = execFileSync('node', [path.join(dir, 'test/f23bill.test.mjs')], {
      cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { red: /[1-9]\d* failed\./.test(out), out };
  } catch (e) {
    return { red: true, out: String(e.stdout ?? '') + String(e.stderr ?? '') };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 PROVE AN UNMODIFIED TREE IS GREEN BEFORE SCORING ANYTHING. Added 18 August 2026, from the
// rule this repo learned three times over: a pass measures a DIFFERENCE and has no way of knowing
// whether the red it sees came from the sabotage or from a harness that reds on everything. A
// missing supabase/ directory did it once, a full disk did it once, and a tally line without a
// full stop did it once. It costs one tree.
function baseline() {
  const dir = scratch();
  const r = runSuite(dir);
  rmSync(dir, { recursive: true, force: true });
  if (r.red) {
    console.log('🔴 BROKEN HARNESS: an UNMODIFIED scratch tree is already RED.');
    console.log('   Nothing below would mean anything. Check, in this order:');
    console.log('   1. every directory f23bill.test.mjs READS is copied by scratch()');
    console.log('   2. its tally line still matches the regex in runSuite (it ends with a full stop)');
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

const SABOTAGES = [
  // ── The finding itself: the agent doing its own tax again ────────────────────────────────
  {
    name: 'the agent computes the bill itself, exactly as it did on 13 August',
    // ⚠️ RE ANCHORED 18 AUGUST 2026 BY THE FULL LOOP. B30 lifted the typeof and isFinite test out
    // of this assignment into `haveGiven`, so the three line anchor stopped matching and this
    // sabotage became ABSENT rather than passing. Nine of this pass's anchors died the same way in
    // the same packet, which is why a MISSED line and a broken anchor must be read, never a tally.
    apply: (d) => edit(d, 'lib/agent.ts',
      `    const estBill = haveGiven
      ? Math.max(0, given as number)
      : hasRent ? null : blendedBill;`,
      '    const estBill = blendedBill;'),
  },
  {
    name: 'the landlord guard is dropped, so a missing figure falls back to the blend',
    apply: (d) => edit(d, 'lib/agent.ts',
      '      : hasRent ? null : blendedBill;',
      '      : blendedBill;'),
  },
  {
    name: 'rent no longer counts as rent, so every landlord takes the trade path',
    apply: (d) => edit(d, 'lib/agent.ts',
      'const hasRent = (input.property?.rents ?? 0) > 0;',
      'const hasRent = false;'),
  },
  // ── The undefined door. This is the one that would have shipped a NaN. ───────────────────
  {
    name: 'the finite check is loosened back to !== null, so undefined walks through',
    // ⚠️ RE ANCHORED 18 AUGUST 2026 ONTO haveGiven, which is where B30 moved this decision.
    apply: (d) => edit(d, 'lib/agent.ts',
      "    const haveGiven = typeof given === 'number' && Number.isFinite(given);",
      '    const haveGiven = given !== null;'),
  },
  {
    name: 'NaN is allowed through by dropping isFinite alone',
    apply: (d) => edit(d, 'lib/agent.ts',
      "typeof given === 'number' && Number.isFinite(given)",
      "typeof given === 'number'"),
  },
  // ── The strings and the button. A right number in numbers{} and a wrong one on screen. ───
  {
    name: 'the WhatsApp text quotes the blend while numbers{} keeps the real bill',
    apply: (d) => edit(d, 'lib/agent.ts',
      'waText: `your Self Assessment bill is heading for about ${his(estBill)}',
      'waText: `your Self Assessment bill is heading for about ${his(blendedBill)}'),
  },
  {
    name: 'the set aside BUTTON carries the blend, which is the £537 of working capital',
    apply: (d) => edit(d, 'lib/agent.ts',
      "action: { kind: 'set_aside', amount: estBill, label: 'Tax set aside' },",
      "action: { kind: 'set_aside', amount: blendedBill, label: 'Tax set aside' },"),
  },
  {
    name: 'the body quotes the blend',
    apply: (d) => edit(d, 'lib/agent.ts',
      'body: `Your Self Assessment bill is heading for about ${his(estBill)}',
      'body: `Your Self Assessment bill is heading for about ${his(blendedBill)}'),
  },
  // ── The one bill function ────────────────────────────────────────────────────────────────
  {
    name: 'selfAssessmentBill forgets CIS, so a subbie is told to find money he already paid',
    apply: (d) => edit(d, 'lib/taxoptimiser.ts',
      'return t.cisSuffered > 0 ? t.setAsideAfterCis : t.setAside;',
      'return t.setAside;'),
  },
  {
    name: 'selfAssessmentBill returns the liability before the student loan',
    apply: (d) => edit(d, 'lib/taxoptimiser.ts',
      'return t.cisSuffered > 0 ? t.setAsideAfterCis : t.setAside;',
      'return t.selfAssessmentTax;'),
  },
  {
    // ⚠️ RE-ANCHORED 13 AUGUST 2026, RUN 3, AND THE MISS IS THE POINT. This pointed at the two
    // line body of selfAssessmentBill, which Run 3 collapsed into a call to the new shared door
    // billFromPosition(). The anchor stopped matching, edit() threw, and this sabotage silently
    // became ABSENT rather than passing: 22 of 22 read as 20 of 22 and only the combined tree
    // re-run showed it. Exactly the Run 2 fault this file's own header records.
    name: 'selfAssessmentBill grows its own arithmetic instead of asking taxPosition',
    apply: (d) => edit(d, 'lib/taxoptimiser.ts',
      '  return billFromPosition(taxPosition(input));',
      `  return soleTraderTax(Math.max(0, input.ytdTradeIncome - input.ytdTradeExpenses)
    + Math.max(0, input.ytdPropertyIncome ?? 0)).total;`),
  },
  // ── The wiring. Every call site, per discipline 2. ────────────────────────────────────────
  {
    name: 'the nightly walk stops passing the bill',
    // ⚠️ RE ANCHORED 18 AUGUST 2026. B30's reader hands back a bill AND a base, so the routes
    // read `january?.bill` where they used to read a bare `bill`.
    apply: (d) => edit(d, 'app/api/cron/agent/route.ts',
      'selfAssessmentBill: january?.bill ?? null,', 'selfAssessmentBill: null,'),
  },
  {
    name: 'the on demand reassess stops passing the bill',
    // ⚠️ RE ANCHORED 18 AUGUST 2026, same move as the walk above.
    apply: (d) => edit(d, 'app/api/agent/reassess/route.ts',
      'selfAssessmentBill: january?.bill ?? null,', 'selfAssessmentBill: null,'),
  },
  {
    name: 'the walk stops calling the shared reader',
    // ⚠️ RE ANCHORED 18 AUGUST 2026. selfAssessmentBillFor was renamed selfAssessmentJanuaryFor
    // by B30, because a function called "BillFor" that hands back a payments on account base is a
    // function whose name is a lie. The suite's own assertion was repointed then; this was not.
    apply: (d) => edit(d, 'app/api/cron/agent/route.ts',
      'selfAssessmentJanuaryFor(user.id),', 'Promise.resolve(null),'),
  },
  {
    name: 'reassess stops calling the shared reader',
    // ⚠️ RE ANCHORED 18 AUGUST 2026, same rename as the walk above.
    apply: (d) => edit(d, 'app/api/agent/reassess/route.ts',
      'selfAssessmentJanuaryFor(userId),', 'Promise.resolve(null),'),
  },
  // ── The reader's failure mode. Zero is the dangerous default. ────────────────────────────
  {
    name: 'the reader fails to 0, which reads as "no bill" rather than "unknown"',
    // ⚠️ RE ANCHORED 18 AUGUST 2026. The reader hands back an OBJECT now, so "fails to zero" is an
    // object of zeros rather than a bare 0, and the log line was reworded with the rename.
    apply: (d) => edit(d, 'lib/supabase.ts',
      `    console.error('[agent] self assessment january unavailable:', err instanceof Error ? err.message : err);
    return null;`,
      `    console.error('[agent] self assessment january unavailable:', err instanceof Error ? err.message : err);
    return { bill: 0, poa: { tax: 0, deductedAtSource: 0 } };`),
  },
  {
    name: 'the reader stops using the optimiser input and guesses',
    // ⚠️ RE ANCHORED 18 AUGUST 2026. B30 replaced the one line body with a taxPosition() read that
    // both numbers come off, so the guess has to replace the whole of it to be the same sabotage.
    apply: (d) => edit(d, 'lib/supabase.ts',
      `    const position = taxPosition(await getOptimiserInput(userId));
    return {
      bill: billFromPosition(position),
      poa: { tax: position.selfAssessmentTax, deductedAtSource: position.cisSuffered },
    };`,
      '    return { bill: 1200, poa: { tax: 1200, deductedAtSource: 0 } };'),
  },
  // ── The import rule that keeps the .mjs suites resolvable ────────────────────────────────
  {
    name: 'agent.ts imports the optimiser directly, breaking the staged suites',
    apply: (d) => edit(d, 'lib/agent.ts',
      "import { gbp0, gbp2 } from './money';",
      "import { gbp0, gbp2 } from './money';\nimport { selfAssessmentBill } from './taxoptimiser';"),
  },
  // ── The threshold, which must be tested against the real figure ──────────────────────────
  {
    // ⚠️ RE ANCHORED 18 AUGUST 2026, ONTO THE WORK RATHER THAN ONTO THE OLD LINE, AND THE MOVE IS
    // THE POINT. This block no longer tests a threshold at all: B30 handed the whole decision to
    // lib/taxengine.ts paymentsOnAccount(), which applies the £1,000 test to the RELEVANT AMOUNT,
    // knows the 80 percent deducted at source excuse, and does the halving. So the equivalent
    // defect is no longer "test the wrong number against the threshold", it is "hand the engine
    // the wrong number", which is exactly the £639 B30 found on a real customer's January.
    // Deleting this would have been silent scope loss; leaving it pointed at a line nobody runs
    // would have been a guard that was quietly true about nothing. Same choice, both wrong.
    name: 'the schedule is computed from the bill rather than from the tax HMRC halves',
    apply: (d) => edit(d, 'lib/agent.ts',
      '      : paymentsOnAccount(base.tax, taxYearEnd(today).getUTCFullYear(), base.atSource);',
      '      : paymentsOnAccount(estBill ?? 0, taxYearEnd(today).getUTCFullYear(), base.atSource);'),
  },
  // ── B26, 18 August 2026. THE ONE BILL IS WRITTEN ONE WAY, AND THERE ARE FIVE DOORS. ───────
  //
  // Section E block 29 reads all five off disk by name. A revert at ANY of them puts the product
  // back to quoting one number two ways, which is the whole of B26, so each door gets its own
  // sabotage rather than one that reverts them together.
  {
    name: 'B26: the Tax page hero goes back to whole pounds while the chat keeps its pence',
    apply: (d) => edit(d, 'app/app/tax/page.tsx',
      '<div className="lek-hero">{gbp2(billFromPosition(tax))}</div>',
      '<div className="lek-hero">{gbp0(billFromPosition(tax))}</div>'),
  },
  {
    name: 'B26: the OVERVIEW hero goes back, which is the same figure on the other screen',
    apply: (d) => edit(d, 'app/app/page.tsx',
      '<div className="lek-hero">{gbp2(billFromPosition(tax))}</div>',
      '<div className="lek-hero">{gbp0(billFromPosition(tax))}</div>'),
  },
  {
    name: 'B26: the 08:00 alert BODY goes back to whole pounds on the bill',
    apply: (d) => edit(d, 'lib/agent.ts',
      'body: `Your Self Assessment bill is heading for about ${his(estBill)}.',
      'body: `Your Self Assessment bill is heading for about ${gbp(estBill)}.'),
  },
  {
    name: 'B26: only the alert WHATSAPP text goes back, which is the partial revert',
    apply: (d) => edit(d, 'lib/agent.ts',
      'waText: `your Self Assessment bill is heading for about ${his(estBill)},',
      'waText: `your Self Assessment bill is heading for about ${gbp(estBill)},'),
  },
  {
    name: 'B26: the drift the other way, the web chat stripped to whole pounds',
    apply: (d) => edit(d, 'app/api/thread/route.ts',
      'return `Put by ${formatGbp(leadFigure)} for tax.',
      'return `Put by ${gbp0(leadFigure)} for tax.'),
  },
  {
    name: 'B26: and WhatsApp stripped, the lane the sentence promises the screen agrees with',
    apply: (d) => edit(d, 'lib/waintents.ts',
      'return `Put by ${formatGbp(setAside)} for tax.',
      'return `Put by ${gbpShort(setAside)} for tax.'),
  },
];

// NO-OP CONTROLS. Each changes the files without changing behaviour, and must stay GREEN.
const CONTROLS = [
  {
    // ⚠️ B26's CONTROL. The hero comment block is the biggest thing this packet added to a screen
    // file, and a suite that reds on a touched comment is only detecting that a file was opened.
    name: 'B26: the comment above the Tax page hero is reworded, and nothing moves',
    apply: (d) => edit(d, 'app/app/tax/page.tsx',
      '🔴 PENCE, AND THAT IS B26, 18 August 2026.',
      '🔴 PENCE, AND THAT IS B26, decided 18 August 2026.'),
  },
  {
    name: 'a comment is reworded in agent.ts',
    apply: (d) => edit(d, 'lib/agent.ts',
      '// 7. Payments on account cliff.',
      '// 7. Payments on account cliff (wording touched, behaviour identical).'),
  },
  {
    // ⚠️ RE-ANCHORED WITH THE SABOTAGE ABOVE, ONTO THE DOOR ITSELF, so the control still renames a
    // local and still changes nothing. A control that cannot apply is worse than a sabotage that
    // cannot apply: it reports BAD and hides behind a number that still looks nearly full.
    name: 'the local variable is renamed in taxoptimiser',
    apply: (d) => edit(d, 'lib/taxoptimiser.ts',
      '  return billFromPosition(taxPosition(input));',
      `  const position = taxPosition(input);
  return billFromPosition(position);`),
  },
  {
    // ⚠️ RE ANCHORED 18 AUGUST 2026, AND OFF THE DECLARATION ON PURPOSE. It quoted the whole
    // signature of selfAssessmentBillFor, which B30 renamed, so this control reported BAD while
    // hiding behind a number that still looked nearly full. A control that cannot apply is worse
    // than a sabotage that cannot apply. It now adds a comment INSIDE the work, which is a thing
    // no rename and no signature change can take away.
    name: 'a comment is added inside the reader in supabase.ts',
    apply: (d) => edit(d, 'lib/supabase.ts',
      '      bill: billFromPosition(position),',
      '      // The one bill function, and it is the only one.\n      bill: billFromPosition(position),'),
  },
];

// ═══════════════════════════════════════════════════════════════════════════════════════════
// SLICING, so this pass can be run inside Cowork at all. Every shell call there is capped at 45
// seconds in a fresh sandbox and a detached process does not survive between calls, so a session
// that cannot run the whole pass has to be able to run it in pieces AND SAY WHICH PIECES IT RAN.
// SAB_FROM and SAB_TO are indices into the sabotage list; unset means all of it, which is what CI
// and the Mac run. SAB_SKIP_CONTROLS skips the controls for the same reason.
const FROM = Number(process.env.SAB_FROM ?? 0);
const TO = Number(process.env.SAB_TO ?? SABOTAGES.length);
const RUNNING = SABOTAGES.slice(FROM, TO);
if (RUNNING.length !== SABOTAGES.length) {
  console.log(`SLICE: sabotages ${FROM}..${TO - 1} of ${SABOTAGES.length}. NOT THE WHOLE PASS.`);
}

baseline();

let caught = 0, missed = 0;
console.log('SABOTAGES (each must go RED)');
for (const s of RUNNING) {
  const dir = scratch();
  try {
    s.apply(dir);
  } catch (e) {
    missed += 1;
    console.log(`  MISSED ${s.name}  [${e.message}]`);
    rmSync(dir, { recursive: true, force: true });
    continue;
  }
  const r = runSuite(dir);
  if (r.red) { caught += 1; console.log(`  ok  ${s.name}`); }
  else { missed += 1; console.log(`  MISSED ${s.name}`); }
  rmSync(dir, { recursive: true, force: true });
}

let controlsOk = 0, controlsBad = 0;
const SKIP_CONTROLS = process.env.SAB_SKIP_CONTROLS === '1';
console.log(SKIP_CONTROLS ? '\nCONTROLS SKIPPED (SAB_SKIP_CONTROLS=1)' : '\nCONTROLS (each must stay GREEN)');
for (const c of (SKIP_CONTROLS ? [] : CONTROLS)) {
  const dir = scratch();
  try {
    c.apply(dir);
  } catch (e) {
    controlsBad += 1;
    console.log(`  BAD ${c.name}  [${e.message}]`);
    rmSync(dir, { recursive: true, force: true });
    continue;
  }
  const r = runSuite(dir);
  if (r.red) { controlsBad += 1; console.log(`  BAD ${c.name} went red`); }
  else { controlsOk += 1; console.log(`  ok  ${c.name}`); }
  rmSync(dir, { recursive: true, force: true });
}

// ⚠️ THE DENOMINATORS ARE WHAT WAS RUN, NOT WHAT EXISTS, or a slice prints a hole it never had.
const ranControls = SKIP_CONTROLS ? 0 : CONTROLS.length;
const total = RUNNING.length + ranControls;
console.log('');
console.log(`${caught}/${RUNNING.length} sabotages caught, ${controlsOk}/${ranControls} controls green.`);
console.log(`${caught + controlsOk} of ${total}.`);
if (RUNNING.length !== SABOTAGES.length || SKIP_CONTROLS) console.log('NOT THE WHOLE PASS.');
if (missed > 0 || controlsBad > 0) process.exit(1);

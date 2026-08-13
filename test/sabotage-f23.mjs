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
    apply: (d) => edit(d, 'lib/agent.ts',
      `    const estBill = typeof given === 'number' && Number.isFinite(given)
      ? Math.max(0, given)
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
    apply: (d) => edit(d, 'lib/agent.ts',
      `    const estBill = typeof given === 'number' && Number.isFinite(given)
      ? Math.max(0, given)`,
      `    const estBill = given !== null
      ? Math.max(0, given)`),
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
      'waText: `your Self Assessment bill is heading for about ${gbp(estBill)}',
      'waText: `your Self Assessment bill is heading for about ${gbp(blendedBill)}'),
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
      'body: `Your Self Assessment bill is heading for about ${gbp(estBill)}',
      'body: `Your Self Assessment bill is heading for about ${gbp(blendedBill)}'),
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
    apply: (d) => edit(d, 'app/api/cron/agent/route.ts',
      'selfAssessmentBill: bill,', 'selfAssessmentBill: null,'),
  },
  {
    name: 'the on demand reassess stops passing the bill',
    apply: (d) => edit(d, 'app/api/agent/reassess/route.ts',
      'selfAssessmentBill: bill,', 'selfAssessmentBill: null,'),
  },
  {
    name: 'the walk stops calling the shared reader',
    apply: (d) => edit(d, 'app/api/cron/agent/route.ts',
      'selfAssessmentBillFor(user.id),', 'Promise.resolve(null),'),
  },
  {
    name: 'reassess stops calling the shared reader',
    apply: (d) => edit(d, 'app/api/agent/reassess/route.ts',
      'selfAssessmentBillFor(userId),', 'Promise.resolve(null),'),
  },
  // ── The reader's failure mode. Zero is the dangerous default. ────────────────────────────
  {
    name: 'the reader fails to 0, which reads as "no bill" rather than "unknown"',
    apply: (d) => edit(d, 'lib/supabase.ts',
      `    console.error('[agent] self assessment bill unavailable:', err instanceof Error ? err.message : err);
    return null;`,
      `    console.error('[agent] self assessment bill unavailable:', err instanceof Error ? err.message : err);
    return 0;`),
  },
  {
    name: 'the reader stops using the optimiser input and guesses',
    apply: (d) => edit(d, 'lib/supabase.ts',
      'return selfAssessmentBill(await getOptimiserInput(userId));',
      'return 1200;'),
  },
  // ── The import rule that keeps the .mjs suites resolvable ────────────────────────────────
  {
    name: 'agent.ts imports the optimiser directly, breaking the staged suites',
    apply: (d) => edit(d, 'lib/agent.ts',
      "import { gbp0 } from './money';",
      "import { gbp0 } from './money';\nimport { selfAssessmentBill } from './taxoptimiser';"),
  },
  // ── The threshold, which must be tested against the real figure ──────────────────────────
  {
    name: 'the POA threshold is tested against the blend rather than the real bill',
    apply: (d) => edit(d, 'lib/agent.ts',
      'if (estBill !== null && estBill > FACTS.poaThreshold) {',
      'if (estBill !== null && blendedBill > FACTS.poaThreshold) {'),
  },
];

// NO-OP CONTROLS. Each changes the files without changing behaviour, and must stay GREEN.
const CONTROLS = [
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
    name: 'whitespace is added to the reader in supabase.ts',
    apply: (d) => edit(d, 'lib/supabase.ts',
      'export async function selfAssessmentBillFor(userId: string): Promise<number | null> {',
      'export async function selfAssessmentBillFor(userId: string): Promise<number | null> {\n'),
  },
];

let caught = 0, missed = 0;
console.log('SABOTAGES (each must go RED)');
for (const s of SABOTAGES) {
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
console.log('\nCONTROLS (each must stay GREEN)');
for (const c of CONTROLS) {
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

const total = SABOTAGES.length + CONTROLS.length;
console.log('');
console.log(`${caught}/${SABOTAGES.length} sabotages caught, ${controlsOk}/${CONTROLS.length} controls green.`);
console.log(`${caught + controlsOk} of ${total}.`);
if (missed > 0 || controlsBad > 0) process.exit(1);

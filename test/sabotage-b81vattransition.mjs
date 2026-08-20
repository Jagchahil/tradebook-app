// SABOTAGE THE VAT TRANSITION. B79, B80 AND B81, 20 August 2026.
//
//   node test/sabotage-b81vattransition.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THREE THINGS THAT WERE WRONG FOR A STEADY STATE PRODUCT MEETING AN ACCOUNT THAT CHANGED STATE.
//
// B80's shape is the dangerous one: a statutory DATE, one month out, on four surfaces from one
// constant, guarded by nine files none of which read the sentence. So the sabotages here attack the
// TRUTH of it from four directions, not its presence: revert the clause, move the worked example,
// move the breach month, and break the rule the example is checked against.
//
// B79's shape is the one that hid: on a REVERSE CHARGE invoice total EQUALS net, so a fixture of
// those alone cannot tell the gross from the net. Every sabotage here is scored against a fixture
// carrying one draft of each treatment.
//
// B81's shape is that the clamp must APPLY, not merely exist. Clamping one reader and not the other
// is a real half fix that a presence check would pass, and it is sabotaged on its own.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sab-b81-'));
  // ⚠️ supabase/ IS COPIED BECAUSE run4fixes.test.mjs READS THE MIGRATIONS OFF DISK. A tree
  // without it does not FAIL that suite, it CRASHES it, so every sabotage scores as caught and
  // every control as broken. Four controls red at once is the tell and it has bitten this
  // corpus three times.
  for (const d of ['lib', 'test', 'app', 'supabase']) {
    cpSync(path.join(root, d), path.join(dir, d), { recursive: true, dereference: false });
  }
  // ⚠️ AND ONE FILE AT THE ROOT, WHICH THE FIRST RUN OF THIS PASS DIED ON. run4fixes.test.mjs
  // reads next.config.mjs for the /signup redirects, and a scratch tree without it does not fail
  // that suite, it throws. baseline() caught it before a single sabotage was scored, which is
  // exactly what baseline() is for and is the third time this corpus has needed it.
  cpSync(path.join(root, 'next.config.mjs'), path.join(dir, 'next.config.mjs'));
  return dir;
}

// b81vattransition FIRST: runSuite returns on the first red, so the suite this pass is actually
// about never pays for the slower one behind it.
const SUITES = ['test/b81vattransition.test.mjs', 'test/run4fixes.test.mjs'];

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
    console.log('   1. lib/, app/, test/ and supabase/ are all copied by scratch()');
    console.log('   2. run4fixes ends "N passed, 0 failed" with NO full stop, which runSuite allows');
    console.log('   3. df on TMPDIR: a suite that dies of ENOSPC scores as caught');
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

const VS = 'lib/vatstanding.ts';
const SUP = 'lib/supabase.ts';
const PG = 'app/app/tax/vat/page.tsx';

// ⚠️ EVERY ANCHOR BELOW IS THE SMALLEST STABLE SUBSTRING. Never a whole expression up to its
// punctuation, never the edge of a list. B74 is the item that says why: seven guards in this corpus
// died in three days on that mistake and every one was green on the defect first.
const SECOND_MONTH = 'from the first day of the second month after the one you went over in';
const EXAMPLE_EDR = 'you are VAT registered from 1 June';
// ⚠️ THE EXAMPLE SPANS A CONCATENATION BOUNDARY IN THE SOURCE, so an anchor taken from the
// RUNTIME sentence does not exist in the FILE. Both of these were broken on the first run and
// the pass said BROKEN rather than MISSED, which is the distinction that made it a minute's work.
const EXAMPLE_BREACH = "+ 'April, you register by";
const NET_LINE = '        unsentNet += (Number(r.total) || 0) - (Number(r.tax) || 0);';
const VAT_LINE = '        unsentVat += (Number(r.tax) || 0) + (Number(r.reverse_charge_vat) || 0);';
const CLAMP_DECL = '  const clamped = registeredOn !== null && registeredOn > quarterFrom && registeredOn <= to;';
const FROM_DECL = '  const from = clamped && registeredOn !== null ? registeredOn : quarterFrom;';
const REG_DECL = '  const registeredOn = isRegistered && profile !== null ? profile.registeredOn : null;';
const OUT_CALL = '      getOutputVat(user.id, from, to),';
const IN_CALL = '      getConfirmedInputVat(user.id, from, to),';
const CLAMPED_JSX = '              {clamped ? (';
const DAY_YOU_REG = ', the day you registered, to today';
const RECLAIM_POINTER = 'could reclaim from before you registered';

const SABOTAGES = [
  // ── B80. THE STATUTORY DATE, ATTACKED FOUR WAYS. ─────────────────────────────────────────
  {
    name: '🔴 THE OLD CLAIM IS PUT BACK: registered from the first day of the month after. That is '
      + 'one month early and it is what shipped from 12 to 20 August 2026',
    apply: (d) => edit(d, VS, SECOND_MONTH, 'from the first day of the month after that'),
  },
  {
    name: '🔴 the worked example moves to 1 May, so the rule says second and the example says first',
    apply: (d) => edit(d, VS, EXAMPLE_EDR, 'you are VAT registered from 1 May'),
  },
  {
    name: '🔴 the BREACH MONTH moves to March while the example EDR stays June, so the pair stops '
      + 'being an instance of the rule above it',
    apply: (d) => edit(d, VS, EXAMPLE_BREACH, "+ 'March, you register by"),
  },
  {
    name: 'the whole worked example is deleted, leaving a date rule with nothing to check it',
    apply: (d) => edit(d, VS, " So if you go over in '\n  + 'April, you register by 30 May and you"
      + " are VAT registered from 1 June.';", "';"),
  },
  {
    name: 'the notification deadline moves to 60 days, which was never the wrong half',
    apply: (d) => edit(d, VS, '30 days from the end of that month', '60 days from the end of that month'),
  },
  {
    name: 'the FORWARD test loses its effective date, which was always right and must stay right',
    apply: (d) => edit(d, VS, 'from the day you realised it', 'from the end of that period'),
  },
  // ── B79. THE UNSENT LINE. ────────────────────────────────────────────────────────────────
  {
    name: '🔴 THE GROSS COMES BACK, which is the defect walked on production on 20 August 2026',
    apply: (d) => edit(d, SUP, NET_LINE, '        unsentNet += Number(r.total) || 0;'),
  },
  {
    name: '🔴 the reverse charge VAT is subtracted TOO, which takes 1,000 off a total that never '
      + 'contained it. The plausible over correction',
    apply: (d) => edit(d, SUP, NET_LINE,
      '        unsentNet += (Number(r.total) || 0) - (Number(r.tax) || 0) - (Number(r.reverse_charge_vat) || 0);'),
  },
  {
    name: 'it reads subtotal instead, which is right on a real row and zero on a row that carries '
      + 'a tax with no subtotal written',
    apply: (d) => edit(d, SUP, NET_LINE, '        unsentNet += Number(r.subtotal) || 0;'),
  },
  {
    name: 'the VAT half drops the reverse charge, so money he must account for stops being named',
    apply: (d) => edit(d, SUP, VAT_LINE, '        unsentVat += Number(r.tax) || 0;'),
  },
  // ── B81. THE CLAMP MUST APPLY, NOT MERELY EXIST. ─────────────────────────────────────────
  {
    name: '🔴 THE CLAMP IS BYPASSED: both readers go back to the calendar quarter, which is the '
      + '£100 of pre registration VAT this walk found on production',
    apply: (d) => { edit(d, PG, OUT_CALL, '      getOutputVat(user.id, quarterFrom, to),');
      edit(d, PG, IN_CALL, '      getConfirmedInputVat(user.id, quarterFrom, to),'); },
  },
  {
    name: '🔴 ONLY THE COSTS ARE CLAMPED AND THE INVOICES ARE NOT. The half fix a presence check '
      + 'passes, and the half that leaves the flat rate trader charged on pre registration turnover',
    apply: (d) => edit(d, PG, OUT_CALL, '      getOutputVat(user.id, quarterFrom, to),'),
  },
  {
    name: 'the comparison flips, so the window clamps for everybody EXCEPT the man who needs it',
    apply: (d) => edit(d, PG, CLAMP_DECL,
      '  const clamped = registeredOn !== null && registeredOn < quarterFrom && registeredOn <= to;'),
  },
  {
    name: 'the null guard goes, so an account with no registration date clamps to null',
    apply: (d) => edit(d, PG, CLAMP_DECL,
      '  const clamped = registeredOn > quarterFrom && registeredOn <= to;'),
  },
  {
    name: '🔴 the clamped SENTENCE goes while the clamp stays, so 31 fewer days are covered and '
      + 'nothing on the screen says so. A silent narrowing is the same defect wearing a smaller number',
    apply: (d) => edit(d, PG, CLAMPED_JSX, '              {false ? ('),
  },
  {
    name: 'the sentence stops saying which day the window opens on',
    apply: (d) => edit(d, PG, DAY_YOU_REG, ' to today'),
  },
  {
    name: 'the pointer to the pre registration reclaim goes, so the money that fell outside the '
      + 'window is simply dropped',
    apply: (d) => edit(d, PG, RECLAIM_POINTER, 'could not use'),
  },
];

// NO OP CONTROLS. Each changes the files and changes NOTHING these guards are about.
const CONTROLS = [
  {
    name: 'CONTROL: quarterFrom is RENAMED throughout, and every assertion captures the name '
      + 'rather than typing it',
    apply: (d) => {
      edit(d, PG, '  const quarterFrom = quarterStartISO(now);', '  const calFrom = quarterStartISO(now);');
      edit(d, PG, CLAMP_DECL, '  const clamped = registeredOn !== null && registeredOn > calFrom && registeredOn <= to;');
      edit(d, PG, FROM_DECL, '  const from = clamped && registeredOn !== null ? registeredOn : calFrom;');
      edit(d, PG, 'pretty(quarterFrom)', 'pretty(calFrom)');
    },
  },
  {
    name: 'CONTROL: the clamp flag is RENAMED at all three of its code sites, leaving the comment '
      + 'that also contains the word alone',
    apply: (d) => {
      edit(d, PG, CLAMP_DECL, '  const sinceReg = registeredOn !== null && registeredOn > quarterFrom && registeredOn <= to;');
      edit(d, PG, FROM_DECL, '  const from = sinceReg && registeredOn !== null ? registeredOn : quarterFrom;');
      edit(d, PG, CLAMPED_JSX, '              {sinceReg ? (');
    },
  },
  {
    name: 'CONTROL: registeredOn is RENAMED, which is the local a guard is most tempted to type',
    apply: (d) => {
      edit(d, PG, REG_DECL, '  const edr = isRegistered && profile !== null ? profile.registeredOn : null;');
      edit(d, PG, CLAMP_DECL, '  const clamped = edr !== null && edr > quarterFrom && edr <= to;');
      edit(d, PG, FROM_DECL, '  const from = clamped && edr !== null ? edr : quarterFrom;');
    },
  },
  {
    name: 'CONTROL: a COMMENT is reworded and it quotes the copy back, including "the day you '
      + 'registered" and "first day of the second month", on purpose',
    apply: (d) => edit(d, PG, REG_DECL,
      '  // Reworded comment naming the day you registered and the first day of the second month,'
      + ' and neither is code.\n' + REG_DECL),
  },
  {
    name: 'CONTROL: the two returned draft fields are REORDERED in getOutputVat, which changes nothing',
    apply: (d) => edit(d, SUP, '      unsentNet: r2(unsentNet),\n      unsentVat: r2(unsentVat),',
      '      unsentVat: r2(unsentVat),\n      unsentNet: r2(unsentNet),'),
  },
];

baseline();

let caught = 0;
let missed = 0;
let broken = 0;
const FROM = Number(process.env.SAB_FROM || 0);
const TO = Number(process.env.SAB_TO || SABOTAGES.length);
const sliced = FROM !== 0 || TO !== SABOTAGES.length;
for (const s of SABOTAGES.slice(FROM, TO)) {
  const dir = scratch();
  let red;
  try { s.apply(dir); red = runSuite(dir); } catch (e) { red = null; console.log(`  BROKEN ${s.name}\n          ${e.message}`); }
  rmSync(dir, { recursive: true, force: true });
  if (red === null) { broken++; continue; }
  if (red) { caught++; console.log(`  CAUGHT  ${s.name}`); }
  else { missed++; console.log(`  MISSED  ${s.name}`); }
}

let green = 0;
let falsePositive = 0;
if (!process.env.SAB_SKIP_CONTROLS) {
  for (const c of CONTROLS) {
    const dir = scratch();
    let red;
    try { c.apply(dir); red = runSuite(dir); } catch (e) { red = null; console.log(`  BROKEN ${c.name}\n          ${e.message}`); }
    rmSync(dir, { recursive: true, force: true });
    if (red === null) { broken++; continue; }
    if (red) { falsePositive++; console.log(`  FALSE POSITIVE  ${c.name}`); }
    else { green++; console.log(`  ok      ${c.name}`); }
  }
}

const denom = SABOTAGES.slice(FROM, TO).length;
const cdenom = process.env.SAB_SKIP_CONTROLS ? 0 : CONTROLS.length;
console.log(`\n  ${caught}/${denom} sabotages caught, ${green}/${cdenom} controls green.`);
if (sliced || process.env.SAB_SKIP_CONTROLS) console.log('  NOT THE WHOLE PASS: run with no SAB_FROM, SAB_TO or SAB_SKIP_CONTROLS for the full figure.');
if (broken) console.log(`  BAD: ${broken} broken anchors`);
if (missed) console.log(`  BAD: ${missed} holes`);
if (falsePositive) console.log(`  BAD: ${falsePositive} false positives`);
process.exit(missed === 0 && falsePositive === 0 && broken === 0 ? 0 : 1);

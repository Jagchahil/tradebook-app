// SABOTAGE THE FINANCE LINE ON HOME. B67, 20 August 2026.
//
//   node test/sabotage-b67financeline.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A SILENT SUBTRACTION HAS TWO WAYS BACK AND THE SECOND ONE LOOKS LIKE A FIX.
//
//   THE SENTENCE GOES. £14,000 leaves a landlord's account, appears on no tile, and nothing says
//   so, under a caption promising "everything you have confirmed".
//
//   THE MONEY GOES BACK INTO THE TILES. Somebody reads "money out is understated" and adds the
//   interest to Out, or nets it off Profit. That understates his profit by the whole of the
//   interest and describes a submission nobody should make: since Section 24, residential finance
//   is not an allowable expense. It is the plausible wrong fix and it is sabotaged twice.
//
// Plus the empty state, which is the half that would have been missed: a landlord whose only
// confirmed row this year is his mortgage interest has 0 in and 0 out.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sab-b67-'));
  for (const d of ['lib', 'test', 'app']) {
    cpSync(path.join(root, d), path.join(dir, d), { recursive: true, dereference: false });
  }
  return dir;
}

const SUITES = ['test/b67financeline.test.mjs', 'test/dayone.test.mjs'];

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
    console.log('   1. lib/, app/ and test/ are all copied by scratch(), and both suites read all three');
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


const HP = 'app/app/page.tsx';
const YT = 'lib/yeartodate.ts';
const SUM = 'app/app/tax/summary/page.tsx';
const SUITE = 'test/b67financeline.test.mjs';

const LINE_OPEN = '            {propertyFinance > 0 ? (';
const FIN_LOCAL = '  const propertyFinance = Math.max(0, optimiser.ytdPropertyFinance ?? 0);';
// 🔴 THIS WAS THE WHOLE TERNARY CONDITION AND B72 KILLED IT DEAD. 20 August 2026.
//
// It read '{moneyIn === 0 && moneyOut === 0 && propertyFinance === 0 ? (', so the moment B72 added
// a fourth term for a written down car BOTH anchors below stopped resolving and two sabotages
// silently stopped being sabotages. scripts/check-sabotage-anchors.mjs caught it, which is what it
// is for, but the fault is the anchor rather than the change: an anchor that quotes an expression
// up to its punctuation is anchored on the punctuation.
//
// It is now the ONE TERM this pass is about, which cannot care how many others there are or what
// order they come in. Same lesson as the four assertions that reddened in the same three days.
const FIN_TERM = ' && propertyFinance === 0';

const SABOTAGES = [
  // ── THE SENTENCE GOES, AND THE SILENT SUBTRACTION COMES BACK. ─────────────────────────────
  {
    name: '🔴 THE LINE IS REMOVED, so £14,000 leaves his account and appears on no tile and in no sentence',
    apply: (d) => edit(d, HP, LINE_OPEN, '            {false ? ('),
  },
  {
    name: '🔴 the figure is never read, so the local goes and the sentence has nothing to print',
    apply: (d) => edit(d, HP, FIN_LOCAL, '  const propertyFinance = 0;'),
  },
  {
    name: '🔴 it reads the ORDINARY property expenses instead, so it names money that IS already in Out',
    apply: (d) => edit(d, HP, 'optimiser.ytdPropertyFinance ?? 0', 'optimiser.ytdPropertyExpenses ?? 0'),
  },
  {
    name: '🔴 THE GATE GOES, so a plumber with no property is told a further £0.00 went out on'
      + ' mortgage interest, which is doc 103\'s empty test failing out loud',
    apply: (d) => edit(d, HP, LINE_OPEN, '            {true ? ('),
  },
  // ── THE PLAUSIBLE WRONG FIX, WHICH IS THE ONE SOMEBODY WILL REACH FOR. ────────────────────
  {
    name: '🔴 THE WRONG FIX: the interest is added back into Out, so Profit understates his profit'
      + ' by the whole of it and describes a submission nobody should make',
    apply: (d) => edit(d, HP, 'const moneyOut = Math.max(0, optimiser.ytdTradeExpenses) + Math.max(0, optimiser.ytdPropertyExpenses ?? 0);',
      'const moneyOut = Math.max(0, optimiser.ytdTradeExpenses) + Math.max(0, optimiser.ytdPropertyExpenses ?? 0) + Math.max(0, optimiser.ytdPropertyFinance ?? 0);'),
  },
  {
    name: '🔴 THE WRONG FIX, QUIETER: Out is left alone and the interest is netted off Profit only,'
      + ' so the two tiles stop adding up',
    apply: (d) => edit(d, HP, '  const profit = moneyIn - moneyOut;', '  const profit = moneyIn - moneyOut - Math.max(0, optimiser.ytdPropertyFinance ?? 0);'),
  },
  // ── THE COPY. ────────────────────────────────────────────────────────────────────────────
  {
    name: '🔴 THE SENTENCE CLAIMS THE INTEREST IS DEDUCTED, which is the one false thing it could say',
    apply: (d) => edit(d, HP, 'it is not deducted from', 'it is deducted from'),
  },
  {
    name: '🔴 the reason goes and only the figure is left, so he is told money vanished and not why',
    apply: (d) => edit(d, HP, 'Since Section 24 it is not deducted from\n                your rent: it comes back as a 20% credit against your tax, worked out for you on the\n                Tax page.', ''),
  },
  {
    name: '🔴 it stops saying the money went OUT and calls it a credit, which is the half he cannot see',
    apply: (d) => edit(d, HP, 'went out on mortgage interest', 'is recorded for mortgage interest'),
  },
  {
    name: '🔴 an em dash arrives in copy a customer reads',
    apply: (d) => edit(d, HP, 'deliberately not in Out or Profit above', 'deliberately not in Out or Profit above — by design'),
  },
  // ── THE EMPTY STATE. ─────────────────────────────────────────────────────────────────────
  {
    name: '🔴 THE EMPTY TEST FORGETS IT AGAIN, so a landlord whose only confirmed row is his interest'
      + ' is told nothing has been confirmed since 6 April',
    apply: (d) => edit(d, HP, FIN_TERM, ''),
  },
  // ── THE ARITHMETIC THE SENTENCE RESTS ON. ────────────────────────────────────────────────
  {
    name: '🔴 lib/yeartodate.ts stops holding the interest apart and puts it in ordinary expenses,'
      + ' so the sentence names money that IS in Out and the tax engine loses Section 24',
    apply: (d) => edit(d, YT, '        if (isResidentialFinanceCost(r.category, r.vendor)) ytdPropertyFinance += -amt;\n        else ytdPropertyExpenses += -amt;',
      '        ytdPropertyExpenses += -amt;'),
  },
  {
    name: '🔴 the interest is counted as property INCOME, which is the sign error this split exists to prevent',
    apply: (d) => edit(d, YT, '      if (amt > 0) ytdPropertyIncome += amt;', '      if (amt !== 0) ytdPropertyIncome += Math.abs(amt);'),
  },
  // ── THE PRECEDENT. ───────────────────────────────────────────────────────────────────────
  {
    name: '🔴 the SAME sentence is deleted from app/app/tax/summary, so the two screens stop agreeing'
      + ' and the older one goes silent first',
    apply: (d) => edit(d, SUM, '{sub.property.financeCost > 0 ? (', '{false ? ('),
  },
  {
    name: '🔴 the summary stops saying it is out of the profit deliberately, so it reads as an oversight',
    apply: (d) => edit(d, SUM, 'and it is deliberately not in the profit above', 'and it is not in the profit above'),
  },
  // ── THE SUITE'S OWN DERIVATION. ──────────────────────────────────────────────────────────
  {
    name: '🔴 THE SUITE STOPS EXECUTING THE SPLIT and asserts the source instead, while the split'
      + ' itself is broken, so a test that measured becomes a test that reads',
    apply: (d) => {
      edit(d, SUITE, "ok('🔴 AND THE INTEREST IS HELD APART, WHICH IS WHAT PUTS IT IN NEITHER TILE',\n  ytd.ytdPropertyFinance === 14000);",
        "ok('🔴 AND THE INTEREST IS HELD APART, WHICH IS WHAT PUTS IT IN NEITHER TILE',\n  /ytdPropertyFinance/.test(read('lib/yeartodate.ts')));");
      edit(d, YT, '        if (isResidentialFinanceCost(r.category, r.vendor)) ytdPropertyFinance += -amt;\n        else ytdPropertyExpenses += -amt;',
        '        ytdPropertyExpenses += -amt;');
    },
  },
];

// NO OP CONTROLS. Each changes the files and changes NOTHING these guards are about.
const CONTROLS = [
  {
    name: 'CONTROL: THE LOCAL IS RENAMED throughout, and every guard here captures the name rather than typing it',
    apply: (d) => {
      edit(d, HP, FIN_LOCAL, '  const financeOut = Math.max(0, optimiser.ytdPropertyFinance ?? 0);');
      edit(d, HP, FIN_TERM, ' && financeOut === 0');
      edit(d, HP, LINE_OPEN, '            {financeOut > 0 ? (');
      edit(d, HP, 'gbp2(propertyFinance)', 'gbp2(financeOut)');
    },
  },
  {
    name: 'CONTROL: a COMMENT is reworded and it quotes the copy back, including "went out on mortgage'
      + ' interest" and "deducted from your rent", on purpose',
    apply: (d) => edit(d, HP, '  // 🔴 B67. THE MONEY THAT LEFT HIS ACCOUNT AND IS IN NONE OF THE THREE TILES. 20 August 2026.',
      '  // Reworded comment. It says went out on mortgage interest and deducted from your rent, and'
      + ' neither is code.\n  // 🔴 B67. THE MONEY THAT LEFT HIS ACCOUNT AND IS IN NONE OF THE THREE TILES. 20 August 2026.'),
  },
  {
    name: 'CONTROL: whitespace is added above the tiles',
    apply: (d) => edit(d, HP, '            <div className="lek-grid">', '\n            <div className="lek-grid">'),
  },
  {
    name: 'CONTROL: a comment is reworded in lib/yeartodate.ts, which owns the split but not the sentence',
    apply: (d) => edit(d, YT, '  // Finance costs (mortgage interest) kept apart from ordinary expenses:',
      '  // Reworded. Finance costs (mortgage interest) kept apart from ordinary expenses:'),
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

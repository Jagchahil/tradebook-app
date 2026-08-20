// SABOTAGE THE CAPITAL LINE ON HOME. B72, 20 August 2026.
//
//   node test/sabotage-b72capitalline.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A SILENT SUBTRACTION HAS TWO WAYS BACK AND THE SECOND ONE LOOKS LIKE A FIX. Same shape as B67.
//
//   THE SENTENCE GOES. £60,000 leaves a sparky's account for a car, appears on no tile, and nothing
//   says so, under a caption promising "everything you have confirmed".
//
//   THE MONEY GOES BACK INTO THE TILES. Somebody reads "money out is understated" and adds the car
//   to Out, or nets it off Profit. That is the £60,000 Audi bug being reintroduced by hand: a
//   £22,800 profit reported as a £37,224 loss. GOV.UK, claim capital allowances, business cars:
//   "Cars do not qualify for: annual investment allowance (AIA)." Sabotaged three times.
//
// Plus the empty state, which is the half that would have been missed, and the control that says a
// VAN is not a car: its cost DID come off in full, it IS in Out, and naming it would be a lie about
// money he can see on the tile.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sab-b72-'));
  // ⚠️ supabase/ IS HERE BECAUSE test/capitalwiring.test.mjs READS THE MIGRATION
  // APPLY_2026-08-02_capital_kind.sql. Without it that suite throws on a scratch copy and the
  // baseline is red before a single sabotage is applied, which is a BROKEN HARNESS rather than
  // a broken guard. It happened on the first run of this pass and on B70's the day before, and
  // it is the same lesson components/ and next.config.mjs taught sabotage-run5.
  for (const d of ['lib', 'test', 'app', 'supabase']) {
    cpSync(path.join(root, d), path.join(dir, d), { recursive: true, dereference: false });
  }
  return dir;
}

// ⚠️ b72capitalline FIRST AND ON PURPOSE. runSuite returns on the first red, so a sabotage this
// pass is really about never pays for the slower suite behind it.
const SUITES = ['test/b72capitalline.test.mjs', 'test/capitalwiring.test.mjs'];

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
    console.log('   1. lib/, app/, test/ and supabase/ are all copied by scratch(), and the suites read all four');
    console.log('   2. the tally line matches the regex in runSuite');
    console.log('   3. df -h on TMPDIR: a suite that dies of ENOSPC scores as caught, and this');
    console.log('      corpus really did lose a whole gate run to a full disk on 20 August');
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
const SUP = 'lib/supabase.ts';
const MONEY = 'app/app/money/page.tsx';
const SUM = 'app/app/tax/summary/page.tsx';

// ⚠️ EVERY ANCHOR HERE IS THE SMALLEST STABLE SUBSTRING, NEVER A WHOLE EXPRESSION UP TO ITS
// PUNCTUATION. Seven things in this corpus have now rotted on that mistake in three days, two of
// them anchors in the pass this one is copied from, and both were found by
// scripts/check-sabotage-anchors.mjs rather than by anybody noticing.
const COST_LOCAL = '  const capitalCost = Math.max(0, optimiser.ytdCapitalCost ?? 0);';
const COUNT_LOCAL = '  const capitalCount = Math.max(0, optimiser.ytdCapitalCount ?? 0);';
const LINE_OPEN = '            {capitalCost > 0 ? (';
const CAP_TERM = ' && capitalCost === 0';
const PLURAL = "{capitalCount === 1 ? 'a car' : `${capitalCount} cars`}";
const WD_BRANCH = '      if (isWrittenDown(r.capital_kind)) {\n'
  + '        ytdCapitalCost += -amt;\n'
  + '        ytdCapitalCount += 1;\n'
  + '        continue;\n'
  + '      }';

const SABOTAGES = [
  // ── THE SENTENCE GOES, AND THE SILENT SUBTRACTION COMES BACK. ─────────────────────────────
  {
    name: '🔴 THE LINE IS REMOVED, so £60,000 leaves his account and appears on no tile and in no sentence',
    apply: (d) => edit(d, HP, LINE_OPEN, '            {false ? ('),
  },
  {
    name: '🔴 the cost is never read, so the sentence has nothing to print',
    apply: (d) => edit(d, HP, COST_LOCAL, '  const capitalCost = 0;'),
  },
  {
    name: 'the gate is dropped, so a plumber who has never bought a car reads a line about cars',
    apply: (d) => edit(d, HP, LINE_OPEN, '            {true ? ('),
  },
  {
    name: '🔴 the copy stops saying the money WENT OUT, which is the whole point of naming it',
    apply: (d) => edit(d, HP, 'A car comes off over several years rather than all at once',
      'A car is treated differently'),
  },
  {
    name: '🔴 the copy stops saying it is in neither tile, so it names a figure and explains nothing',
    apply: (d) => edit(d, HP, 'in Out or Profit above', 'in the figures'),
  },
  {
    name: 'the copy stops sending him to the screen that does the working',
    apply: (d) => edit(d, HP, 'worked out for you on the Tax page.', 'worked out separately.'),
  },
  {
    name: '🔴 THE COPY CALLS THE CAR A DEDUCTION, which is the false sentence here and would have him'
      + ' claim the whole car in one year',
    apply: (d) => edit(d, HP, 'and it is deliberately not', 'and it is deducted, allowable expense that it is, but not'),
  },
  {
    name: '🔴 an em dash arrives in copy a customer reads',
    apply: (d) => edit(d, HP, 'in Out or Profit above.', 'in Out or Profit above — by design.'),
  },
  {
    name: 'the plural is hardcoded, so a man with two cars is told about "a car"',
    apply: (d) => edit(d, HP, PLURAL, "{'a car'}"),
  },
  {
    name: 'the count is never read, so the plural has nothing to decide on',
    apply: (d) => edit(d, HP, COUNT_LOCAL, '  const capitalCount = 1;'),
  },
  {
    name: 'the amount stops going through the one money formatter',
    apply: (d) => edit(d, HP, 'gbp2(capitalCost)', 'capitalCost'),
  },
  // ── THE EMPTY STATE, WHICH IS THE HALF THAT WOULD HAVE BEEN MISSED. ───────────────────────
  {
    name: '🔴 THE EMPTY TEST FORGETS THE CAR, so a man whose only confirmed row this year is the car'
      + ' he bought is told nothing has been confirmed since 6 April',
    apply: (d) => edit(d, HP, CAP_TERM, ''),
  },
  // ── THE PLAUSIBLE WRONG FIX. THREE WAYS, AND EACH IS THE £60,000 AUDI BUG BY HAND. ────────
  {
    name: '🔴 THE CAR IS PUT BACK INTO Out, which is the bug the removal exists to fix',
    apply: (d) => edit(d, HP, 'const moneyOut = Math.max(0, optimiser.ytdTradeExpenses) + Math.max(0, optimiser.ytdPropertyExpenses ?? 0);',
      'const moneyOut = Math.max(0, optimiser.ytdTradeExpenses) + Math.max(0, optimiser.ytdPropertyExpenses ?? 0) + Math.max(0, optimiser.ytdCapitalCost ?? 0);'),
  },
  {
    name: '🔴 THE CAR IS NETTED OFF PROFIT INSTEAD, which is the same bug wearing a different coat',
    apply: (d) => edit(d, HP, 'const profit = moneyIn - moneyOut;',
      'const profit = moneyIn - moneyOut - capitalCost;'),
  },
  {
    name: '🔴 lib/yeartodate.ts PUTS THE COST BACK INTO ytdTradeExpenses, so a £22,800 profit becomes'
      + ' a £37,224 loss again and every screen in the product moves at once',
    apply: (d) => edit(d, YT, WD_BRANCH,
      '      if (isWrittenDown(r.capital_kind)) {\n'
      + '        ytdCapitalCost += -amt;\n'
      + '        ytdCapitalCount += 1;\n'
      + '      }'),
  },
  // ── THE ARITHMETIC THE SENTENCE RESTS ON. ────────────────────────────────────────────────
  {
    name: '🔴 THE COST STOPS BEING COUNTED AT ALL, so the figure is zero and the line never draws'
      + ' even though the money really left',
    apply: (d) => edit(d, YT, WD_BRANCH, '      if (isWrittenDown(r.capital_kind)) continue;'),
  },
  {
    name: '🔴 A VAN IS COUNTED AS A CAR, so a man is told his van was held back when it is in Out',
    apply: (d) => edit(d, YT, 'if (isWrittenDown(r.capital_kind)) {', 'if (isCapitalKind(r.capital_kind)) {'),
  },
  {
    name: '🔴 THE WRITTEN DOWN TEST IS SPELLED OUT BY HAND AGAIN, which is the exact shape that once'
      + ' held £61,284 out of a man\'s costs with nothing in the product able to see it',
    apply: (d) => edit(d, YT, 'if (isWrittenDown(r.capital_kind)) {',
      "if (r.capital_kind && r.capital_kind !== 'not_a_car') {"),
  },
  {
    name: 'the count is scaled by the partner share, so half of one car becomes half a car on a screen',
    apply: (d) => edit(d, YT, '  ytdCapitalCost *= partnerFactor;',
      '  ytdCapitalCost *= partnerFactor;\n  ytdCapitalCount *= partnerFactor;'),
  },
  {
    name: 'the aggregation stops returning the cost, so every screen reads undefined',
    apply: (d) => edit(d, YT, '    ytdCapitalCost,\n    ytdCapitalCount,', '    ytdCapitalCount,'),
  },
  {
    name: 'getOptimiserInput stops passing it on, so it dies one hop short of the screen',
    apply: (d) => edit(d, SUP, '    ytdCapitalCost: Math.round(ytdCapitalCost * 100) / 100,', ''),
  },
  // ── THE PRECEDENT. Three screens now say this and the suite pins the other two. ───────────
  {
    name: '🔴 the SAME sentence is deleted from /app/money, so the screens stop agreeing',
    apply: (d) => edit(d, MONEY, '{log.capitalCost > 0 ? (', '{false ? ('),
  },
  {
    name: '🔴 the SAME sentence is deleted from /app/tax/summary',
    apply: (d) => edit(d, SUM, '{sub.trade.capitalCost > 0 ? (', '{false ? ('),
  },
];

// NO OP CONTROLS. Each changes the files and changes NOTHING these guards are about.
const CONTROLS = [
  {
    name: 'CONTROL: BOTH LOCALS ARE RENAMED throughout, and every guard captures the name rather than typing it',
    apply: (d) => {
      edit(d, HP, COST_LOCAL, '  const carCost = Math.max(0, optimiser.ytdCapitalCost ?? 0);');
      edit(d, HP, COUNT_LOCAL, '  const carCount = Math.max(0, optimiser.ytdCapitalCount ?? 0);');
      edit(d, HP, CAP_TERM, ' && carCost === 0');
      edit(d, HP, LINE_OPEN, '            {carCost > 0 ? (');
      edit(d, HP, 'gbp2(capitalCost)', 'gbp2(carCost)');
      edit(d, HP, PLURAL, "{carCount === 1 ? 'a car' : `${carCount} cars`}");
    },
  },
  {
    name: 'CONTROL: a FOURTH TERM is added to the empty test, which is exactly the change that reddened'
      + ' four assertions in three days and must never redden one again',
    apply: (d) => {
      edit(d, HP, CAP_TERM, CAP_TERM + ' && weekProfit === 0');
    },
  },
  {
    name: 'CONTROL: a COMMENT is reworded and it quotes the copy back, including "went out on" and'
      + ' "not in Out or Profit above", on purpose',
    apply: (d) => edit(d, HP, '  const propertyFinance = Math.max(0, optimiser.ytdPropertyFinance ?? 0);',
      '  // Reworded comment. It says went out on a car and not in Out or Profit above, and neither'
      + ' is code.\n  const propertyFinance = Math.max(0, optimiser.ytdPropertyFinance ?? 0);'),
  },
  {
    name: 'CONTROL: the two returned fields are REORDERED in the aggregation, which changes nothing',
    apply: (d) => edit(d, YT, '    ytdCapitalCost,\n    ytdCapitalCount,', '    ytdCapitalCount,\n    ytdCapitalCost,'),
  },
];

baseline();

let caught = 0;
let missed = 0;
let broken = 0;
for (const s of SABOTAGES) {
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
for (const c of CONTROLS) {
  const dir = scratch();
  let red;
  try { c.apply(dir); red = runSuite(dir); } catch (e) { red = null; console.log(`  BROKEN ${c.name}\n          ${e.message}`); }
  rmSync(dir, { recursive: true, force: true });
  if (red === null) { broken++; continue; }
  if (red) { falsePositive++; console.log(`  FALSE POSITIVE  ${c.name}`); }
  else { green++; console.log(`  ok      ${c.name}`); }
}

console.log(`\n  ${caught}/${SABOTAGES.length} sabotages caught, ${green}/${CONTROLS.length} controls green.`);
if (broken) console.log(`  BAD: ${broken} broken anchors`);
if (missed) console.log(`  BAD: ${missed} holes`);
if (falsePositive) console.log(`  BAD: ${falsePositive} false positives`);
process.exit(missed === 0 && falsePositive === 0 && broken === 0 ? 0 : 1);

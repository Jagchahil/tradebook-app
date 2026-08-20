// B67. THE MONEY THAT LEFT HIS ACCOUNT AND IS IN NONE OF THE THREE TILES. 20 August 2026.
//
//   node test/b67financeline.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Mortgage interest on a residential let is not an allowable expense, so lib/yeartodate.ts holds it
// out of ytdPropertyExpenses. Home's Out tile is trade expenses plus property expenses, so the
// interest is in NEITHER Out NOR Profit, under a caption that promises "everything you have
// confirmed".
//
// 🔴 B62 IS WHAT MADE IT REACHABLE, WHICH IS WHY THIS IS FILED AGAINST THE FIX RATHER THAN AGAINST
// THE SCREEN. Before 20 August a typed mortgage interest payment filed as a TRADE cost and sat
// inside both tiles. Now it routes correctly, and the first thing a landlord meets is Out falling
// by the whole of his interest and Profit rising by it, on the same money, on a day he changed
// nothing about his life. Measured on Norah: 14,000 each way, while her tax bill falls by 2,800.
//
// ⚠️ AND THE FIX IS NOT TO PUT IT BACK INTO THE TILES. A Profit that netted it off would understate
// his profit by the whole of the interest and describe a submission nobody should make. Section 3
// of this suite is the guard against that, because it is the plausible wrong fix.
//
// 🟢 THE PRODUCT HAD ALREADY DECIDED THIS ONE SCREEN OVER. app/app/tax/summary names the same money
// in the same shape and its comment says why: taking a car out of expenses and saying nothing once
// put "Out £72,088" and "Profit £22,776" on two screens of one product with nothing joining them.
// Home is that bug, one screen over, and this is that answer, one screen over.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); }
};

// Copied from test/landlord.test.mjs rather than reinvented: the comment stripping trap has been
// found seven times in this corpus and every instance was somebody writing their own.
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const stage = mkdtempSync(path.join(tmpdir(), 'b67-lib-'));
const withExt = (src) => src.replace(/(from\s+')(\.[^']*?)(')/g, (m, a, spec, b) => (
  /\.[a-z]+$/.test(spec) ? m : `${a}${spec}.ts${b}`
));
for (const f of readdirSync(path.join(root, 'lib'))) {
  if (!f.endsWith('.ts')) continue;
  writeFileSync(path.join(stage, f), withExt(read(`lib/${f}`)));
}
// 🔴 THE COPY IS THE ORIGINAL. If this drifts the suite is testing a file that does not ship.
// yeartodate.ts imports siblings, so the staged copy differs in its SPECIFIERS and in nothing else,
// and the comparison puts them back rather than being weakened to a length check. Same form as
// test/b19threelanes.test.mjs.
ok('🔴 the staged lib/yeartodate.ts differs from the real one ONLY in its import specifiers',
  readFileSync(path.join(stage, 'yeartodate.ts'), 'utf8').replace(/\.ts';/g, "';") === read('lib/yeartodate.ts'));

const Y = await import(pathToFileURL(path.join(stage, 'yeartodate.ts')).href);

const home = read('app/app/page.tsx');
const homeCode = codeOnly(home);

// ---------------------------------------------------------------------------------------------
// 1. THE FACT THE SENTENCE RESTS ON, EXECUTED. Norah's own figures, not a fixture invented here.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 1. the arithmetic: the interest really is in neither tile ===\n');

const P = (amount, category, vendor = 'A payee') => ({
  amount, category, vendor, transaction_date: '2026-06-20', income_type: 'property',
});
const norah = [
  P(62000, 'rent', 'Tenants'),
  P(-14000, 'mortgage interest', 'HALIFAX BTL'),
  P(-6200, 'letting agent', 'CITYLETS'),
  P(-1800, 'property repairs', 'A PLUMBER'),
];
const ytd = Y.aggregateConfirmedRows(norah, [], 2026);

ok('her rent is her rent', ytd.ytdPropertyIncome === 62000);
ok('🔴 THE ORDINARY COSTS ARE THE ORDINARY COSTS, and the interest is NOT among them',
  ytd.ytdPropertyExpenses === 8000);
ok('🔴 AND THE INTEREST IS HELD APART, WHICH IS WHAT PUTS IT IN NEITHER TILE',
  ytd.ytdPropertyFinance === 14000);
ok('she has no trade at all, so Out is her property costs and nothing else',
  ytd.ytdTradeExpenses === 0 && ytd.ytdTradeIncome === 0);

// The tiles, computed the way the page computes them, so the gap is a measurement rather than a claim.
{
  const moneyIn = Math.max(0, ytd.ytdTradeIncome) + Math.max(0, ytd.ytdPropertyIncome);
  const moneyOut = Math.max(0, ytd.ytdTradeExpenses) + Math.max(0, ytd.ytdPropertyExpenses);
  ok('🔴 SO THE GAP IS £14,000 AND IT IS EXACTLY HER INTEREST',
    moneyIn === 62000 && moneyOut === 8000
    && (moneyIn - moneyOut) - (moneyIn - moneyOut - ytd.ytdPropertyFinance) === 14000);
}

// A plumber. Nothing to say, and the empty test below is what stops it being said.
{
  const plumber = Y.aggregateConfirmedRows(
    [{ amount: 30000, category: 'income', vendor: 'A customer', transaction_date: '2026-06-20' },
      { amount: -5000, category: 'materials', vendor: 'Screwfix', transaction_date: '2026-06-20' }],
    [], 2026,
  );
  ok('a trader with no property has no finance figure at all', plumber.ytdPropertyFinance === 0);
}

// ---------------------------------------------------------------------------------------------
// 2. THE SENTENCE.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 2. the sentence, and the gate on it ===\n');

// \u26a0\ufe0f THE LOCAL'S NAME IS CAPTURED, NEVER TYPED, AND THAT IS THE LESSON OF THE LAST TWO DAYS.
// test/landlord.test.mjs froze an expression character for character and stayed green through the
// whole life of B62; test/dayone.test.mjs quoted an operand list up to its punctuation and went red
// when B67 made it stricter. A guard that reds on a rename is a guard about an identifier.
const finLocal = (homeCode.match(/const (\w+) = Math\.max\(0, optimiser\.ytdPropertyFinance \?\? 0\);/) ?? [])[1];
ok('\U0001F534 HOME READS THE FIGURE AT ALL, which it never did before today', !!finLocal);

// The customer sentence, taken out of the JSX with the COMMENTS ALREADY STRIPPED, so a comment that
// happens to quote the copy can never stand in for the copy. That is the trap this corpus has hit
// seven times and it is one line of care to avoid.
const line = (codeOnly(home).match(/A further[\s\S]{0,500}?<\/p>/) ?? [''])[0];
ok('the line exists as one paragraph in the markup rather than in a comment', line.length > 0);

ok('\U0001F534 AND IT IS DRAWN ONLY WHEN THERE IS ONE, which is doc 103\'s empty test',
  new RegExp(`\\{${finLocal} > 0 \\? \\(`).test(homeCode));
ok('the amount is printed as money, through the one formatter',
  new RegExp(`gbp2\\(${finLocal}\\)`).test(line));
ok('\U0001F534 IT SAYS THE MONEY WENT OUT, which is the whole point of naming it',
  /went out on mortgage interest/.test(line));
ok('...and says plainly that it is in neither tile', /not in Out or Profit above/.test(line));
ok('...and says WHY, by name, rather than asking him to take it on trust',
  /Section 24/.test(line) && /20% credit/.test(line));
ok('...and sends him to the screen that does the working', /Tax page/.test(line));
ok('\U0001F534 AND IT NEVER CLAIMS THE INTEREST IS DEDUCTED, which is the false sentence here',
  /not deducted from\s*\n?\s*your rent/.test(line));
ok('no em dash, en dash, or hyphen used as a dash anywhere in it',
  !/[\u2014\u2013]/.test(line) && !/ - /.test(line));

// ---------------------------------------------------------------------------------------------
// \U0001F534 3. THE WRONG FIX, GUARDED. This is the one somebody will reach for.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 3. the tiles did NOT change, which is the plausible wrong fix ===\n');

ok('\U0001F534 Out IS STILL TRADE EXPENSES PLUS PROPERTY EXPENSES, and finance is not in it',
  /const moneyOut = Math\.max\(0, optimiser\.ytdTradeExpenses\) \+ Math\.max\(0, optimiser\.ytdPropertyExpenses \?\? 0\);/.test(homeCode));
ok('\U0001F534 AND Profit IS STILL In MINUS Out, so nothing nets the interest off his profit',
  /const profit = moneyIn - moneyOut;/.test(homeCode));
ok('...and the finance figure is read into its own local rather than added to either',
  !!finLocal
  && !new RegExp(`moneyOut = [^;]*ytdPropertyFinance`).test(homeCode)
  && !new RegExp(`profit = [^;]*${finLocal}`).test(homeCode));

// ---------------------------------------------------------------------------------------------
// 4. THE EMPTY STATE, WHICH IS THE HALF THAT WOULD HAVE BEEN MISSED.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 4. a landlord whose only confirmed row is his interest ===\n');

// 🔴 THIS ASSERTION WENT RED ON B72 AND THE ASSERTION IS WHAT WAS WRONG. 20 August 2026.
//
// It ended `\w+ === 0 \?`, which pins the operand list to exactly three by anchoring on the
// ternary's punctuation. B72 added a fourth term for a written down car and this reddened on a
// change that made the empty test STRICTER. That is the FOURTH instance of this shape in three
// days, and this one was written YESTERDAY, twenty lines beneath a comment stating the rule. So
// writing the rule down is plainly not the same as keeping it, and the rule is: assert the
// OPERANDS, never what separates them. Found by shape, so a fifth term can never red this again.
const emptyCond = (homeCode.match(/\{(moneyIn === 0[^?]*?)\?/) ?? [])[1] ?? '';
ok('the empty test is found by shape rather than quoted up to its punctuation',
  /moneyIn === 0/.test(emptyCond) && /moneyOut === 0/.test(emptyCond));
ok('🔴 THE EMPTY TEST COUNTS THE FINANCE MONEY, so "nothing confirmed" is never said over £14,000',
  !!finLocal && new RegExp(`\\b${finLocal} === 0\\b`).test(emptyCond));
{
  const only = Y.aggregateConfirmedRows([P(-14000, 'mortgage interest', 'HALIFAX BTL')], [], 2026);
  ok('...and that case is real: this account has 0 in, 0 out and £14,000 of confirmed finance cost',
    only.ytdPropertyIncome === 0 && only.ytdPropertyExpenses === 0
    && only.ytdTradeExpenses === 0 && only.ytdPropertyFinance === 14000);
}

// ---------------------------------------------------------------------------------------------
// 5. THE PRECEDENT THIS COPIED, PINNED SO A TIDY CANNOT DELETE IT.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 5. the two screens say the same thing ===\n');

const summary = read('app/app/tax/summary/page.tsx');
ok('🔴 app/app/tax/summary STILL NAMES THE SAME MONEY IN THE SAME SHAPE',
  /went out on mortgage interest/.test(summary) && /financeCost > 0 \?/.test(summary));
ok('...and it still says it is out of the profit deliberately',
  /deliberately not in the profit above/.test(summary));
ok('🔴 AND NEITHER SCREEN NETS IT OFF, which is the fact the two sentences share',
  !/financeCost[\s\S]{0,80}(net|profit) [-+]/.test(codeOnly(summary)));

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

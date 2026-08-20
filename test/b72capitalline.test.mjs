// B72. THE CAR THAT LEFT HIS ACCOUNT AND IS IN NONE OF THE THREE TILES. 20 August 2026.
//
//   node test/b72capitalline.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A car is not an allowable expense in the year it is bought, so lib/yeartodate.ts takes the whole
// purchase price OUT of ytdTradeExpenses and the writing down allowance replaces it. That is right,
// and it is the fix that stopped a £60,000 Audi turning a £22,800 profit into a £37,224 loss.
//
// 🔴 BUT HOME'S Out TILE IS TRADE EXPENSES PLUS PROPERTY EXPENSES, so the purchase price is in
// NEITHER Out NOR Profit, under a caption that promises "everything you have confirmed". A man who
// bought a car through his books watched the money leave his bank and land on nothing.
//
// 🟢 THIS IS B67 ONE CATEGORY OVER AND IT IS B67'S ANSWER ONE CATEGORY OVER. Two screens already
// ship the sentence: /app/money and /app/tax/summary. Home shipped silence. The tiles do not move,
// which is section 4, because a Profit that netted the car off is the bug the removal exists to fix.
//
// ⚠️ AND THE HALF THAT WOULD BE MISSED IS THE EMPTY STATE, exactly as it was for B67. A man whose
// only confirmed row this year is the car has moneyIn 0 and moneyOut 0. Section 5.
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

const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// The whole of lib/, derived, never a hand written list of siblings. B73 is the item that says why:
// eighteen suites in this corpus name their imports by hand and lib/propertyengine.ts can no longer
// gain one as a result. Same form as test/b19threelanes.test.mjs and test/b67financeline.test.mjs.
const stage = mkdtempSync(path.join(tmpdir(), 'b72-lib-'));
const withExt = (src) => src.replace(/(from\s+')(\.[^']*?)(')/g, (m, a, spec, b) => (
  /\.[a-z]+$/.test(spec) ? m : `${a}${spec}.ts${b}`
));
for (const f of readdirSync(path.join(root, 'lib'))) {
  if (!f.endsWith('.ts')) continue;
  writeFileSync(path.join(stage, f), withExt(read(`lib/${f}`)));
}
ok('🔴 the staged lib/yeartodate.ts differs from the real one ONLY in its import specifiers',
  readFileSync(path.join(stage, 'yeartodate.ts'), 'utf8').replace(/\.ts';/g, "';") === read('lib/yeartodate.ts'));

const Y = await import(pathToFileURL(path.join(stage, 'yeartodate.ts')).href);
const C = await import(pathToFileURL(path.join(stage, 'capital.ts')).href);

const home = read('app/app/page.tsx');
const homeCode = codeOnly(home);

// ---------------------------------------------------------------------------------------------
// 1. THE ARITHMETIC, EXECUTED. The gap is measured rather than asserted.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 1. the money really is in neither tile ===\n');

// ⚠️ THE KIND IS TAKEN FROM lib/capital.ts, NEVER TYPED. CAPITAL_KINDS is the list and isWrittenDown
// is the test; a suite that hardcodes 'car_other' is green the day somebody renames it.
const WRITTEN_DOWN = C.CAPITAL_KINDS.filter((k) => C.isWrittenDown(k));
const NOT_A_CAR = C.CAPITAL_KINDS.filter((k) => !C.isWrittenDown(k));
ok('🔴 lib/capital.ts still has BOTH shapes, so the control below can actually fail',
  WRITTEN_DOWN.length > 0 && NOT_A_CAR.length > 0);

const T = (amount, category, vendor = 'A payee', capital_kind = null) => ({
  amount, category, vendor, capital_kind, transaction_date: '2026-06-20',
});
const sparky = [
  T(90000, 'income', 'A customer'),
  T(-12000, 'materials', 'Screwfix'),
  T(-60000, 'vehicle', 'AUDI LEEDS', WRITTEN_DOWN[0]),
];
const ytd = Y.aggregateConfirmedRows(sparky, [], 2026);

ok('his income is his income', ytd.ytdTradeIncome === 90000);
ok('🔴 THE CAR IS NOT IN HIS RUNNING COSTS, which is the fix this is built on top of',
  ytd.ytdTradeExpenses === 12000);
ok('🔴 AND THE PURCHASE PRICE IS NOW REPORTED, which it never was before today',
  ytd.ytdCapitalCost === 60000);
ok('...and so is how many payments made it up', ytd.ytdCapitalCount === 1);

{
  const moneyIn = Math.max(0, ytd.ytdTradeIncome) + Math.max(0, ytd.ytdPropertyIncome);
  const moneyOut = Math.max(0, ytd.ytdTradeExpenses) + Math.max(0, ytd.ytdPropertyExpenses);
  ok('🔴 SO THE GAP IS £60,000 AND IT IS EXACTLY THE CAR',
    moneyIn === 90000 && moneyOut === 12000 && ytd.ytdCapitalCost === 60000);
  ok('...and it is in Profit no more than it is in Out',
    (moneyIn - moneyOut) === 78000 && ytd.ytdCapitalCost > 0);
}

// 🟢 THE CONTROL THAT MATTERS: A VAN IS NOT A CAR AND MUST NOT BE NAMED HERE. Its whole cost came
// off in the ordinary expenses line under the AIA, so it IS in Out, and a sentence saying it was
// held back would be a lie about money he can see on the tile.
{
  const withVan = Y.aggregateConfirmedRows(
    [T(90000, 'income', 'A customer'), T(-30000, 'vehicle', 'A VAN DEALER', NOT_A_CAR[0])],
    [], 2026,
  );
  ok('🔴 A VAN IS IN Out WHERE IT BELONGS, and contributes nothing to the new figure',
    withVan.ytdTradeExpenses === 30000 && withVan.ytdCapitalCost === 0 && withVan.ytdCapitalCount === 0);
}

// A row with no capital_kind at all is nobody's car. null is "nobody asked him", and it must not
// silently become a car just because the field is missing.
{
  const plain = Y.aggregateConfirmedRows([T(-5000, 'materials', 'Screwfix')], [], 2026);
  ok('a row nobody was ever asked about stays an ordinary cost',
    plain.ytdTradeExpenses === 5000 && plain.ytdCapitalCost === 0);
}

// Two cars, because the sentence has to choose between "a car" and "2 cars".
{
  const two = Y.aggregateConfirmedRows(
    [T(-60000, 'vehicle', 'AUDI LEEDS', WRITTEN_DOWN[0]),
      T(-18000, 'vehicle', 'A DEALER', WRITTEN_DOWN[WRITTEN_DOWN.length - 1])],
    [], 2026,
  );
  ok('🔴 TWO CARS ADD UP AND COUNT AS TWO', two.ytdCapitalCost === 78000 && two.ytdCapitalCount === 2);
}

// ---------------------------------------------------------------------------------------------
// 2. THE PARTNERSHIP. The money is shared and the COUNT IS NOT.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 2. a partner sees his share of the cost, and a whole car ===\n');
{
  const half = Y.aggregateConfirmedRows(
    [T(-60000, 'vehicle', 'AUDI LEEDS', WRITTEN_DOWN[0])], [], 2026, 0.5,
  );
  ok('🔴 HIS SHARE OF THE COST IS HIS SHARE, exactly as his share of the allowance is',
    half.ytdCapitalCost === 30000);
  ok('🔴 BUT HALF OF ONE CAR IS NOT HALF A CAR ON A SCREEN, so the count is untouched',
    half.ytdCapitalCount === 1);
}

// ---------------------------------------------------------------------------------------------
// 3. THE SENTENCE ON HOME, AND THE GATE ON IT.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 3. the sentence, and the gate ===\n');

// ⚠️ THE LOCALS ARE CAPTURED, NEVER TYPED. Four assertions in three days have gone red on a rename
// or on an expression being extended. A guard about an identifier is a guard about nothing.
const costLocal = (homeCode.match(/const (\w+) = Math\.max\(0, optimiser\.ytdCapitalCost \?\? 0\);/) ?? [])[1];
const countLocal = (homeCode.match(/const (\w+) = Math\.max\(0, optimiser\.ytdCapitalCount \?\? 0\);/) ?? [])[1];
ok('🔴 HOME READS THE COST AT ALL, which it never did before today', !!costLocal);
ok('...and reads the count, so it can say "a car" or "2 cars" honestly', !!countLocal);

const line = (codeOnly(home).match(/A further[\s\S]{0,600}?worked out for you on the Tax page\.[\s\S]{0,40}?<\/p>/) ?? [''])[0];
ok('the line exists as one paragraph in the markup rather than in a comment', line.length > 0);
ok('🔴 AND IT IS DRAWN ONLY WHEN THERE IS ONE, which is doc 103\'s empty test',
  !!costLocal && new RegExp(`\\{${costLocal} > 0 \\? \\(`).test(homeCode));
ok('the amount is printed as money, through the one formatter',
  !!costLocal && new RegExp(`gbp2\\(${costLocal}\\)`).test(line));
ok('🔴 IT SAYS THE MONEY WENT OUT, which is the whole point of naming it', /went out on/.test(line));
ok('...and says plainly that it is in neither tile', /not\s*\n?\s*in Out or Profit above/.test(line));
ok('...and says WHY, in the register the other two screens already use',
  /comes off over several years/.test(line));
ok('...and sends him to the screen that does the working', /Tax page/.test(line));
ok('🔴 AND IT NEVER CALLS THE CAR AN EXPENSE, which is the false sentence here',
  !/allowable expense/.test(line) && !/deducted/.test(line));
ok('🔴 AND IT AGREES WITH ITSELF ON PLURALS, taken from the count rather than guessed',
  !!countLocal && new RegExp(`${countLocal} === 1 \\? 'a car'`).test(line));
ok('no em dash, en dash, or hyphen used as a dash anywhere in it',
  !/[—–]/.test(line) && !/ - /.test(line));

// ---------------------------------------------------------------------------------------------
// 🔴 4. THE WRONG FIX, GUARDED. Putting the car back in the tiles is the bug, not the fix.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 4. the tiles did NOT move ===\n');

ok('🔴 Out IS STILL TRADE EXPENSES PLUS PROPERTY EXPENSES, and the car is not in it',
  /const moneyOut = Math\.max\(0, optimiser\.ytdTradeExpenses\) \+ Math\.max\(0, optimiser\.ytdPropertyExpenses \?\? 0\);/.test(homeCode));
ok('🔴 AND Profit IS STILL In MINUS Out, so nothing nets the car off his profit',
  /const profit = moneyIn - moneyOut;/.test(homeCode));
ok('...and the cost is read into its own local rather than added to either',
  !!costLocal
  && !/moneyOut = [^;]*ytdCapitalCost/.test(homeCode)
  && !new RegExp(`profit = [^;]*${costLocal}`).test(homeCode));
ok('🔴 AND NO RULE IN THE OPTIMISER DEDUCTS IT, which would give him the car twice',
  !/ytdCapitalCost/.test(codeOnly(read('lib/taxoptimiser.ts')).replace(/ytdCapitalCost\?: number;/, '')
    .replace(/ytdCapitalCount\?: number;/, '')));
ok('🔴 AND THE LEDGER STILL DOES NOT KNOW ABOUT IT EITHER',
  !/ytdCapitalCost/.test(codeOnly(read('lib/ledger.ts'))));

// ---------------------------------------------------------------------------------------------
// 5. THE EMPTY STATE, WHICH IS THE HALF THAT WOULD HAVE BEEN MISSED.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 5. a man whose only confirmed row this year is the car ===\n');

// ⚠️ FOUND BY SHAPE, NEVER QUOTED UP TO ITS PUNCTUATION. test/landlord.test.mjs, test/dayone.test.mjs
// and test/b67financeline.test.mjs have each gone red on this class of assertion in three days.
const emptyCond = (homeCode.match(/\{(moneyIn === 0[^?]*?)\?/) ?? [])[1] ?? '';
ok('the empty test is found by shape, so a fifth term can never red this suite',
  /moneyIn === 0/.test(emptyCond) && /moneyOut === 0/.test(emptyCond));
ok('🔴 THE EMPTY TEST COUNTS THE CAR, so "nothing confirmed" is never said over £60,000',
  !!costLocal && new RegExp(`\\b${costLocal} === 0\\b`).test(emptyCond));
{
  const only = Y.aggregateConfirmedRows([T(-60000, 'vehicle', 'AUDI LEEDS', WRITTEN_DOWN[0])], [], 2026);
  ok('...and that case is real: 0 in, 0 out, and £60,000 of confirmed car',
    only.ytdTradeIncome === 0 && only.ytdTradeExpenses === 0 && only.ytdCapitalCost === 60000);
}
ok('and the branch still tells him the one thing he can do',
  /Photograph a receipt or tell Lekhio what came in/.test(home));

// ---------------------------------------------------------------------------------------------
// 6. THE THREADING. The field has to survive the trip or the screen reads undefined.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 6. the field reaches the screen ===\n');

const sup = read('lib/supabase.ts');
const opt = read('lib/taxoptimiser.ts');
ok('🔴 getOptimiserInput TAKES IT OFF THE AGGREGATION', /ytdCapitalCost, ytdCapitalCount,/.test(sup));
ok('...and returns it rounded the same way as every other money field',
  /ytdCapitalCost: Math\.round\(ytdCapitalCost \* 100\) \/ 100,/.test(sup));
ok('...and passes the count through untouched, because a count is not money',
  /\n    ytdCapitalCount,\n/.test(sup));
ok('🔴 OptimiserInput CARRIES BOTH, OPTIONAL, so every caller written before today is unchanged',
  /ytdCapitalCost\?: number;/.test(opt) && /ytdCapitalCount\?: number;/.test(opt));
ok('🔴 AND THE WRITTEN DOWN TEST IS STILL isWrittenDown() RATHER THAN A KIND TYPED BY HAND',
  /isWrittenDown\(r\.capital_kind\)/.test(codeOnly(read('lib/yeartodate.ts')))
  && !/capital_kind !== 'not_a_car'/.test(codeOnly(read('lib/yeartodate.ts'))));

// ---------------------------------------------------------------------------------------------
// 7. THE PRECEDENT THIS COPIED, PINNED SO A TIDY CANNOT DELETE IT.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 7. three screens now say the same thing ===\n');

const money = read('app/app/money/page.tsx');
const summary = read('app/app/tax/summary/page.tsx');
ok('🔴 /app/money STILL NAMES THE CAR FOR THE MONTH', /went out on \{?/.test(money) && /capitalCost > 0 \?/.test(money));
ok('...and still says it is not in Out', /not in Out/.test(money));
ok('🔴 /app/tax/summary STILL NAMES IT FOR THE UPDATE', /capitalCost > 0 \?/.test(summary));
ok('🔴 AND HOME NOW DOES TOO, which is the whole of this item',
  !!costLocal && /went out on/.test(line) && /Tax page/.test(line));

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

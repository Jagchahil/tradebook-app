// B68. A VENDOR NAME COULD OVERRULE A CATEGORY HE CHOSE HIMSELF. 20 August 2026.
//
//   node test/b68vendorcategory.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// isResidentialFinanceCost read the category and the vendor as ONE string and looked for "mortgage"
// or "interest" anywhere in it. So a cost filed as `property repairs`, paid to a payee whose NAME
// contains either word, became a Section 24 finance cost: relieved at 20% instead of deducted.
//
// 🔴 IT IS IN THE DIRECTION THAT COSTS THE CUSTOMER RATHER THAN HMRC, AND SECTION 4 MEASURES IT
// THROUGH THE REAL ENGINE RATHER THAN ASSERTING IT: £200 out of a higher rate landlord's pocket per
// £1,000 of repairs, silently, with nothing on any screen that could show him why.
//
// ⚠️ THE VENDOR HALF IS NOT REMOVED AND SECTION 3 IS THE GUARD ON THAT. A bank feed line reading
// HALIFAX BTL MORTGAGE DD arrives categorised `other`, because lib/categories.ts has no rule that
// could safely claim it, and without the vendor a landlord's interest would be deducted in full,
// which is the same bug pointing the other way and is the one Section 24 stopped in 2020.
//
// THE RULE: HIS OWN CATEGORY OUTRANKS A VENDOR NAME. Only a generic category, or none, falls
// through. Section 3 DERIVES what "generic" is by asking categoriseBankLine, rather than trusting
// that it is still the word this predicate spells.
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

// ⚠️ THE WHOLE OF lib/ IS STAGED BY WALKING IT, NOT BY A HAND WRITTEN LIST OF SIBLINGS. Eighteen
// suites in this repo name their imports by hand, and the measurement that made this item choose
// its shape is that adding ONE import to lib/propertyengine.ts turns TWENTY TWO of them red. A
// derived stage cannot rot that way.
const stage = mkdtempSync(path.join(tmpdir(), 'b68-lib-'));
const withExt = (src) => src.replace(/(from\s+')(\.[^']*?)(')/g, (m, a, spec, b) => (
  /\.[a-z]+$/.test(spec) ? m : `${a}${spec}.ts${b}`
));
for (const f of readdirSync(path.join(root, 'lib'))) {
  if (!f.endsWith('.ts')) continue;
  writeFileSync(path.join(stage, f), withExt(read(`lib/${f}`)));
}
ok('🔴 the staged lib/propertyengine.ts differs from the real one ONLY in its import specifiers',
  readFileSync(path.join(stage, 'propertyengine.ts'), 'utf8').replace(/\.ts';/g, "';") === read('lib/propertyengine.ts'));

const P = await import(pathToFileURL(path.join(stage, 'propertyengine.ts')).href);
const C = await import(pathToFileURL(path.join(stage, 'categories.ts')).href);
const L = await import(pathToFileURL(path.join(stage, 'propertylanes.ts')).href);
const Y = await import(pathToFileURL(path.join(stage, 'yeartodate.ts')).href);
const O = await import(pathToFileURL(path.join(stage, 'taxoptimiser.ts')).href);

const isFin = (c, v) => P.isResidentialFinanceCost(c, v);

// The old predicate, written out so the walker can be shown to see a difference at all. This is
// what shipped until today, character for character.
const OLD = (category, vendor) => {
  const hay = `${category ?? ''} ${vendor ?? ''}`.toLowerCase();
  return hay.includes('mortgage') || hay.includes('interest');
};

// ---------------------------------------------------------------------------------------------
// 🔴 1. VACUITY. The old predicate must be SHOWN wrong before a clean run below means anything.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 1. vacuity: the defect, demonstrated on the code that shipped ===\n');

const TRAPS = [
  ['property repairs', 'INTEREST FREE FINANCE LTD'],
  ['letting agent', 'MORTGAGE EXPRESS LETTINGS'],
  ['ground rent', 'THE INTEREST GROUP LTD'],
];
ok('🔴 THE OLD PREDICATE CALLS EVERY ONE OF THESE A FINANCE COST, AND NONE OF THEM IS ONE',
  TRAPS.every(([c, v]) => OLD(c, v) === true));
ok('🔴 AND THE ONE THAT SHIPS CALLS NONE OF THEM ONE',
  TRAPS.every(([c, v]) => isFin(c, v) === false));

// ---------------------------------------------------------------------------------------------
// 2. THE SHAPE, DERIVED FROM lib/propertylanes.ts RATHER THAN TYPED.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 2. no property category can be flipped by a payee name ===\n');

const PROPS = [...L.PROPERTY_CATEGORIES];
const FIN = [...L.PROPERTY_FINANCE_CATEGORIES];
ok('there are property categories to walk, and at least four of them', PROPS.length >= 4);

// A payee name carrying BOTH trigger words. If a category can be flipped at all, this flips it.
const LOUD = 'MORTGAGE AND INTEREST SERVICES LTD';
{
  const flipped = PROPS.filter((c) => isFin(c, LOUD) !== FIN.includes(c));
  ok('🔴 EVERY PROPERTY CATEGORY LANDS ON THE SIDE ITS OWN LIST SAYS, WHATEVER THE PAYEE IS CALLED',
    flipped.length === 0);
  if (flipped.length) console.log(`     flipped by the vendor: ${flipped.join(', ')}`);
}
{
  const quiet = PROPS.filter((c) => isFin(c, 'A PLAIN PAYEE') !== FIN.includes(c));
  ok('...and the same with a payee that says nothing either way', quiet.length === 0);
}
ok('🔴 AND THE OLD ONE FAILED THAT TEST, which is what makes the one above a measurement',
  PROPS.some((c) => OLD(c, LOUD) !== FIN.includes(c)));

// ---------------------------------------------------------------------------------------------
// 🔴 3. THE BANK FEED, WHICH IS WHY THE VENDOR HALF STAYS.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 3. the bank feed still works, and the generic is derived ===\n');

// What does the categoriser return for a line it cannot place? That IS the generic, and the
// predicate must fall through on exactly it. Asked rather than assumed.
const GENERIC = C.categoriseBankLine('qqzz unplaceable statement narrative 4471');
ok('the categoriser has a fallback and it is a real category',
  typeof GENERIC === 'string' && GENERIC.length > 0 && C.isCategory(GENERIC));
ok('🔴 A BANK LINE THE CATEGORISER COULD NOT PLACE STILL READS ITS VENDOR',
  isFin(GENERIC, 'HALIFAX BTL MORTGAGE DD') === true);
ok('🔴 AND SO DOES A ROW WITH NO CATEGORY AT ALL',
  isFin('', 'HALIFAX BTL MORTGAGE DD') === true && isFin(null, 'NATWEST BTL INTEREST') === true);
ok('...while the same generic row with an ordinary payee is an ordinary cost',
  isFin(GENERIC, 'CITYLETS PROPERTY MGMT') === false);

// 🔴 AND THE TWO FUNCTIONS ARE COMPOSED RATHER THAN COMPARED, WHICH IS THE ONE THAT CANNOT BE
// HARDCODED AWAY. The assertions above route through a GENERIC constant, and a suite that typed
// that constant would stay green while the categoriser's fallback moved under it. This runs the real
// bank line through the real categoriser and hands the answer straight to the predicate.
{
  const LINES = ['HALIFAX BTL MORTGAGE DD', 'NATWEST BTL INTEREST'];
  ok('🔴 A REAL BANK LINE, CATEGORISED AND THEN CLASSIFIED, IS STILL A FINANCE COST',
    LINES.every((l) => isFin(C.categoriseBankLine(l), l) === true));
  ok('...and an ordinary letting agent line, through the same two functions, is not',
    isFin(C.categoriseBankLine('CITYLETS PROPERTY MGMT'), 'CITYLETS PROPERTY MGMT') === false);
}

// ⚠️ THE RESIDUAL LIMIT, ASSERTED SO IT IS A CHOSEN BEHAVIOUR RATHER THAN AN UNNOTICED ONE.
// A bank line from a payee called INTEREST FREE FINANCE arrives categorised `other`, so the vendor
// is genuinely the only signal there is and it still reads as a finance cost. That is not a bug
// this item can fix from here: it is fixed the moment he gives the row a category, which is what
// /app/pile exists for. Naming it stops the next person thinking B68 solved more than it did.
ok('⚠️ an UNCATEGORISED line from a payee with the word in its name is still read as finance,'
  + ' and that is the honest limit of a vendor name',
  C.categoriseBankLine('INTEREST FREE FINANCE LTD') === GENERIC
  && isFin(GENERIC, 'INTEREST FREE FINANCE LTD') === true
  && isFin('property repairs', 'INTEREST FREE FINANCE LTD') === false);
ok('🔴 THE FALL THROUGH IS THE GENERIC AND NOTHING ELSE: a chosen category with the loudest'
  + ' possible payee still decides for itself',
  isFin('insurance', LOUD) === false && isFin('property repairs', LOUD) === false);

// The two cases the older suite already pinned, still true, so this change took nothing away.
ok('a mortgage interest row is still a finance cost',
  isFin('mortgage interest', 'HALIFAX BTL MORTGAGE DD') === true);
ok('a letting agent row is still not one',
  isFin('letting agent', 'CITYLETS PROPERTY MGMT') === false);
ok('and a category that names interest itself still decides for itself',
  isFin('bank charges and interest', 'A PLAIN PAYEE') === true);

// ---------------------------------------------------------------------------------------------
// 🔴 4. WHAT IT COSTS HIM, MEASURED THROUGH THE REAL ENGINE.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 4. the money, on Norah plus one thousand pounds of repairs ===\n');

const base = {
  startYear: 2026, monthsElapsed: 12,
  ytdTradeIncome: 0, ytdTradeExpenses: 0, ytdCisSuffered: 0,
  employmentIncome: 0, categoriesLogged: [], homeOfficeClaimed: true, mileageClaimed: true,
  purchaseGoal: null, ytdPropertyIncome: 62000,
};
const bill = (expenses, finance) => O.billFromPosition(
  O.taxPosition({ ...base, ytdPropertyExpenses: expenses, ytdPropertyFinance: finance }),
);
// £8,000 of ordinary costs and £14,000 of interest, then £1,000 of repairs from a payee whose name
// contains "interest". Right: the repairs are deducted. Wrong: they are relieved at 20%.
const right = bill(9000, 14000);
const wrong = bill(8000, 15000);
ok('the engine answers on both splits', Number.isFinite(right) && Number.isFinite(wrong));
ok('🔴 THE MISCLASSIFICATION COSTS HIM EXACTLY £200 ON £1,000 OF REPAIRS',
  Math.round((wrong - right) * 100) / 100 === 200);
ok('...and it is the customer who pays it, never HMRC', wrong > right);

// And the row really does move between the two buckets, through the one loop every screen uses.
{
  const row = (amount, category, vendor) => ({
    amount, category, vendor, transaction_date: '2026-06-20', income_type: 'property',
  });
  const ytd = Y.aggregateConfirmedRows([
    row(62000, 'rent', 'Tenants'),
    row(-14000, 'mortgage interest', 'HALIFAX BTL'),
    row(-8000, 'letting agent', 'CITYLETS'),
    row(-1000, 'property repairs', 'INTEREST FREE FINANCE LTD'),
  ], [], 2026);
  ok('🔴 AND THE REPAIRS LAND IN EXPENSES WHERE THEY BELONG, through the one row loop',
    ytd.ytdPropertyExpenses === 9000 && ytd.ytdPropertyFinance === 14000);
}

// ---------------------------------------------------------------------------------------------
// 5. THE PREDICATE HAS ONE HOME AND THE CALLERS STILL ASK IT.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 5. one predicate, five callers ===\n');

const pe = read('lib/propertyengine.ts');
ok('it is declared exactly once', (pe.match(/export function isResidentialFinanceCost/g) ?? []).length === 1);
for (const f of ['lib/supabase.ts', 'lib/yeartodate.ts', 'lib/incomeproof.ts']) {
  ok(`${f} asks the predicate rather than restating the rule`,
    /isResidentialFinanceCost\(/.test(read(f)));
}
ok('🔴 AND NOBODY ELSE MATCHES ON THE TWO WORDS BY HAND',
  ['lib/supabase.ts', 'lib/yeartodate.ts', 'lib/incomeproof.ts', 'lib/quarterpack.ts']
    .every((f) => !/includes\('mortgage'\)/.test(read(f))));

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

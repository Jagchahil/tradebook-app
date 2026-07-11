// The pile. See lib/reviewpile.ts.
//
// What these tests protect: the thing standing between "confirm two hundred transactions
// quickly" and a man's child tax credit landing in his taxable income.
//
// The feature is a speed feature. Speed features are how careful people make fast mistakes, and
// the mistake here has HMRC's name on it. So the guard is tested harder than the grouping.

import { buildPile as build, canBulkConfirm, summarisePile } from '../lib/reviewpile.ts';
// The REAL normaliser, not a stand-in. If normaliseVendor ever changes how it collapses shop
// names, these tests feel it, which is the whole reason it is injected rather than copied.
import { normaliseVendor } from '../lib/memory.ts';

const buildPile = (entries) => build(entries, normaliseVendor);

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}`);
  }
}

const tx = (id, vendor, amount, category, looks_personal = false) => ({
  id,
  vendor,
  amount,
  category,
  looks_personal,
});

console.log('\nThe pile\n');

// --- THE WHOLE POINT: the pile collapses -------------------------------------------
//
// Fourteen trips to Screwfix is ONE question, not fourteen. If this does not hold, the feature
// is just a prettier way to ask the same two hundred questions.
const screwfix = Array.from({ length: 14 }, (_, i) => tx(`s${i}`, 'SCREWFIX DIRECT', -60.5, 'materials'));
const shell = Array.from({ length: 9 }, (_, i) => tx(`f${i}`, 'SHELL', -70, 'fuel'));
const many = [...screwfix, ...shell];

const pile = buildPile(many);
ok('23 transactions become 2 decisions', pile.length === 2);

const sum = summarisePile(pile);
ok('and it can say so honestly', sum.entries === 23 && sum.decisions === 2);

const sfx = pile.find((g) => g.key.startsWith('screwfix'));
ok('the group counts every row it covers', sfx.count === 14);
ok('and the money across all of them', Math.round(sfx.total) === 847);
ok('and carries every id, so one yes files all fourteen', sfx.ids.length === 14);

// --- THE GUARD. This is the one that matters. -------------------------------------

// 1. MONEY IN IS NEVER SWEPT UP. A credit is income until a human says otherwise, and income
//    is the thing HMRC cares about. It gets its own question, every time.
const income = buildPile([tx('i1', 'DAVE SMITH', 500, 'income')])[0];
ok('a CREDIT is its own kind', income.kind === 'income');
ok('and can NEVER be bulk confirmed', canBulkConfirm(income) === false);

// 2. ANYTHING THAT SMELLS. This is the exact bug: a child tax credit arriving on day one of a
//    bank connect, categorised "income" because every credit is, with nobody having flagged it.
const benefit = buildPile([tx('b1', 'HMRC CHILD TAX CREDIT', 87.4, 'income', true)])[0];
ok('a flagged benefit is CAREFUL', benefit.kind === 'careful');
ok('and can NEVER be bulk confirmed', canBulkConfirm(benefit) === false);

// Even as an EXPENSE with a perfectly good category. The flag beats everything.
const bet = buildPile([tx('g1', 'BET365', -50, 'meals', true)])[0];
ok('a flagged expense is still CAREFUL, whatever the category says', bet.kind === 'careful');
ok('and still cannot be swept up', canBulkConfirm(bet) === false);

// 3. NO ANSWER MEANS NO AGREEMENT. If we have no category, there is nothing for him to agree
//    to, and "confirm" would mean "file this under nothing".
const unknown = buildPile([tx('u1', 'BOB WINDOWS LTD', -340, 'other')])[0];
ok('"other" is not a category, so there is nothing to confirm', unknown.suggested === null);
ok('and it cannot be bulk confirmed', canBulkConfirm(unknown) === false);
ok('an empty category is the same', canBulkConfirm(buildPile([tx('u2', 'X', -10, null)])[0]) === false);

// 4. THE ONLY THING THAT CAN GO FAST: money out, a vendor that smells of nothing, and a real
//    category to say yes to.
ok('money out, known category, nothing odd: THIS can go fast', canBulkConfirm(sfx) === true);

// --- a group with a disagreement is not a group with an answer ---------------------
//
// Two rows at the same shop, categorised differently. Offering him one of the two as if it were
// settled is a small lie, and he would confirm it without looking.
const mixed = buildPile([
  tx('m1', 'AMAZON', -30, 'tools'),
  tx('m2', 'AMAZON', -12, 'materials'),
]);
ok('rows that disagree produce no suggestion', mixed[0].suggested === null);
ok('so the group cannot be bulk confirmed', canBulkConfirm(mixed[0]) === false);

// --- a refund FROM a shop is not a purchase AT a shop ------------------------------
//
// Same vendor, opposite direction, completely different question. If they merged, saying yes to
// "Screwfix, materials" would quietly also confirm a £200 refund as an expense.
const both = buildPile([
  tx('p1', 'SCREWFIX', -60, 'materials'),
  tx('r1', 'SCREWFIX', 200, 'income'),
]);
ok('a purchase and a refund at the same shop are TWO groups', both.length === 2);
ok('and the refund is income, so it is asked about', both.find((g) => g.kind === 'income') !== undefined);

// --- the order he is asked in -----------------------------------------------------
//
// Careful first, because those are the ones that cost him if he rushes. Then by MONEY, because
// his attention is the scarce thing and it should go where the pounds are, not where the
// alphabet is.
const ordered = buildPile([
  tx('a1', 'GREGGS', -4, 'meals'),
  tx('a2', 'TRAVIS PERKINS', -3400, 'materials'),
  tx('a3', 'CHILD BENEFIT', 87, 'income', true),
  tx('a4', 'DAVE', 500, 'income'),
]);
ok('the careful one is asked FIRST', ordered[0].kind === 'careful');
ok('income before the routine spending', ordered[1].kind === 'income');
ok('and the biggest spend before the smallest', ordered[2].vendor === 'TRAVIS PERKINS');
ok('the £4 coffee is last, where it belongs', ordered[3].vendor === 'GREGGS');

// --- nothing at all ---------------------------------------------------------------
ok('an empty pile is an empty pile, not a crash', buildPile([]).length === 0);
ok('and it summarises to zero', summarisePile([]).decisions === 0);

// --- a missing vendor does not become a black hole --------------------------------
const noVendor = buildPile([tx('n1', null, -20, 'materials'), tx('n2', '', -30, 'materials')]);
ok('rows with no vendor still group, and are printable', noVendor[0].vendor === 'Unknown');

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

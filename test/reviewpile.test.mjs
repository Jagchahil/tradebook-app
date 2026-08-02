// The pile. See lib/reviewpile.ts.
//
// What these tests protect: the thing standing between "confirm two hundred transactions
// quickly" and a man's child tax credit landing in his taxable income.
//
// The feature is a speed feature. Speed features are how careful people make fast mistakes, and
// the mistake here has HMRC's name on it. So the guard is tested harder than the grouping.

// STAGED RATHER THAN IMPORTED DIRECTLY, because lib/reviewpile.ts now imports lib/personal.ts to
// answer "is this vendor him". Next resolves an extensionless import; bare Node under type
// stripping does not, so both files are copied to a temp dir and the import gains its .ts on the
// way in. Same fix as test/announcements.test.mjs and test/routing.test.mjs.
import { pathToFileURL, fileURLToPath as fileURLToPathStage } from 'node:url';
import { mkdtempSync, readFileSync as readStage, writeFileSync as writeStage } from 'node:fs';
import { tmpdir as tmpdirStage } from 'node:os';
import pathStage from 'node:path';

const libStage = pathStage.join(pathStage.resolve(pathStage.dirname(fileURLToPathStage(import.meta.url)), '..'), 'lib');
const stageDir = mkdtempSync(pathStage.join(tmpdirStage(), 'reviewpile-'));
// ⚠️ THE LIST USED TO BE ONE FILE AND THE REWRITE USED TO NAME IT. lib/reviewpile.ts grew a second
// import (lib/capital.ts, for the rule that a payment big enough to be a vehicle never goes down
// the one tap path) and this suite failed on a module resolution error rather than on anything it
// was written to protect. A staging list that has to be edited every time the file under test gains
// an import is a test that breaks for reasons unrelated to its subject. So: every file in the
// chain, and a regex that gives ALL of them their extension back.
const CHAIN = ['reviewpile', 'personal', 'capital', 'taxengine', 'money'];
for (const name of CHAIN) {
  writeStage(
    pathStage.join(stageDir, `${name}.ts`),
    readStage(pathStage.join(libStage, `${name}.ts`), 'utf8')
      .replace(/from '(\.\/[a-zA-Z0-9]+)'/g, "from '$1.ts'"),
  );
}
const { buildPile: build, canBulkConfirm, summarisePile, partitionPile, bulkConfirmPlan, readAccountUse, MERCHANT_SETTLES } = await import(pathToFileURL(pathStage.join(stageDir, 'reviewpile.ts')).href);
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

// 🔴 A PAYMENT TO HIMSELF CAN NEVER REACH THE ONE TAP PATH.
//
// Found on the live site on 28 July 2026: the web pile offered "Jag, £496" with a File it button.
// That is his own second account. Drawings are not a business cost, and filing them understates his
// tax, which is the direction he does not notice.
//
// The classification happens HERE rather than only at import, because a row already sitting in the
// database was imported before the check existed and would otherwise wait for a backfill nobody
// runs. Reading it again on the way out means his pile is right the next time he opens it.
console.log('\nHIS OWN ACCOUNT IS NEVER A ONE TAP FILE');
const selfRows = [
  { id: 'a', vendor: 'Jag', amount: -496, category: null, looks_personal: false },
  { id: 'b', vendor: 'Screwfix', amount: -40, category: 'materials', looks_personal: false },
];
const selfGroups = build(selfRows, (v) => v.toLowerCase().trim(), ['Jag Chahil', 'Jag']);
const own = selfGroups.find((g) => g.vendor === 'Jag');
const shop = selfGroups.find((g) => g.vendor === 'Screwfix');
ok('his own account becomes a careful group', own?.kind === 'careful');
ok('🔴 AND SO IT CAN NEVER BE BULK CONFIRMED', canBulkConfirm(own) === false);
ok('the shop next to it is untouched', shop?.kind === 'ask');
ok('the shop can still be filed in one tap', canBulkConfirm(shop) === true);

// The old signature still behaves exactly as it did, so every existing caller is unaffected.
const noNames = build(selfRows, (v) => v.toLowerCase().trim());
ok('with no names passed, nothing changes', noNames.find((g) => g.vendor === 'Jag')?.kind === 'ask');

// 🔴 THREE PILES. Added after Jag sat with 44 real rows on the live site and did not finish them.
//
// One flat list asks the same question of every group, so a merchant we recognise costs him exactly
// as much attention as one we have never seen. On his feed that was twenty cards each rendering a
// twenty four option dropdown, including for Transport for London.
console.log('\nTHREE PILES, NOT ONE LIST');
const triRows = [
  // ⚠️ A CATEGORY ON THE ROW IS WHAT MAKES A GROUP "KNOWN". buildPile does not categorise: the
  // keyword map in lib/categories.ts runs at import in lib/banksync.ts and the answer is stored on
  // the row. My first fixture left it null and the group came back unknown, which was the fixture
  // being wrong rather than the code, and it is worth writing down: an entry with no category is a
  // merchant nobody has ever recognised, not a merchant we forgot to ask about.
  { id: '1', vendor: 'Screwfix', amount: -40, category: 'materials', looks_personal: false },
  { id: '2', vendor: 'Screwfix', amount: -12, category: 'materials', looks_personal: false },
  { id: '3', vendor: 'Konoba-vinoteka', amount: -28, category: null, looks_personal: false },
  { id: '4', vendor: 'Jag', amount: -496, category: null, looks_personal: false },
  { id: '5', vendor: 'A Customer', amount: 900, category: null, looks_personal: false },
];
const triParts = partitionPile(build(triRows, (v) => v.toLowerCase().trim(), ['Jag']));
ok('a merchant we know lands in known', triParts.known.length === 1 && triParts.known[0].vendor === 'Screwfix');
ok('and it is grouped, so two rows are one question', triParts.known[0].count === 2);
ok('a merchant we have never seen lands in unknown', triParts.unknown.some((g) => g.vendor === 'Konoba-vinoteka'));
ok('🔴 HIS OWN ACCOUNT LANDS IN CAREFUL, NEVER IN KNOWN', triParts.careful.some((g) => g.vendor === 'Jag'));
ok('money in is its own pile', triParts.income.length === 1);
ok('every group lands in exactly one pile', triParts.known.length + triParts.unknown.length + triParts.careful.length + triParts.income.length === 4);

// 🔴 THE ONE TAP PLAN. This is what the server files when he presses the button, and it is built
// from the groups rather than from anything the browser sent.
console.log('\nTHE ONE TAP PLAN NEVER REACHES PAST THE CONFIDENT ONES');
const triPlan = bulkConfirmPlan(build(triRows, (v) => v.toLowerCase().trim(), ['Jag']));
ok('the plan covers only what we were confident about', triPlan.length === 1 && triPlan[0].vendor === 'Screwfix');
ok('🔴 IT NEVER INCLUDES HIS OWN ACCOUNT', !triPlan.some((p) => p.vendor === 'Jag'));
ok('🔴 IT NEVER INCLUDES MONEY IN', !triPlan.some((p) => p.vendor === 'A Customer'));
ok('it never includes a merchant we could not guess', !triPlan.some((p) => p.vendor === 'Konoba-vinoteka'));
ok('every item carries a real category, never an empty one', triPlan.every((p) => typeof p.category === 'string' && p.category.length > 0));
ok('and it carries every id in the group, so two rows file together', triPlan[0].ids.length === 2);
ok('an empty pile plans nothing rather than throwing', bulkConfirmPlan([]).length === 0);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE ONE TAP PILE, AND WHAT IT ALMOST DID. Live on a real account, 28 July 2026.
//
// The confident section offered to file, in a single press: a holiday train, two holiday coffees as
// "meals", and three months of overdraft fees as "bank charges". Six personal costs into a man's tax
// figures, one tap, no second thought.
//
// The merchant did not lie. The ACCOUNT did, and the CATEGORY did. Both gates below came from that.
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\nA MERCHANT ONLY SETTLES SOME CATEGORIES');
const grp = (vendor, category) => build(
  [{ id: 'x', vendor, amount: -20, category, looks_personal: false }],
  (v) => v.toLowerCase().trim(),
)[0];

ok('🔴 MEALS IS NEVER A ONE TAP', canBulkConfirm(grp('Coffee Cake', 'meals')) === false);
ok('🔴 NOR IS TRAVEL, because Trainline cannot tell a site visit from a holiday', canBulkConfirm(grp('Trainline', 'travel')) === false);
ok('🔴 NOR ARE BANK CHARGES, because an overdraft on a personal account is not a business cost', canBulkConfirm(grp('June overdraft fees', 'bank charges')) === false);
ok('nor fuel, which is business miles or the family car', canBulkConfirm(grp('Shell', 'fuel')) === false);
ok('a builders merchant still is, because nobody buys plasterboard for a holiday', canBulkConfirm(grp('Screwfix', 'materials')) === true);
ok('so are tools', canBulkConfirm(grp('Toolstation', 'tools')) === true);
ok('so is workwear', canBulkConfirm(grp('Arco', 'workwear')) === true);
ok('the list errs towards asking: it is short', MERCHANT_SETTLES.length <= 8);
ok('and every entry in it is a real category', MERCHANT_SETTLES.every((c) => typeof c === 'string' && c.length > 0));

console.log('\nAND NOTHING IS PRESUMED ON AN ACCOUNT HE DOES NOT TRADE THROUGH');
const trade = grp('Screwfix', 'materials');
ok('on a business account, one tap stands', canBulkConfirm(trade, 'business') === true);
ok('on a mixed account it stands too, which is the sole trader default', canBulkConfirm(trade, 'mixed') === true);
ok('🔴 ON A PERSONAL ACCOUNT, NOTHING IS EVER ONE TAP', canBulkConfirm(trade, 'personal') === false);
ok('and the plan is empty on a personal account', bulkConfirmPlan([trade], 'personal').length === 0);
ok('so the whole known pile empties', partitionPile([trade], 'personal').known.length === 0);
ok('and those groups are still answerable, one at a time', partitionPile([trade], 'personal').unknown.length === 1);

// null means nobody was ever asked, which is every connection made before this existed. It must
// read as the behaviour those connections already had, never as permission.
ok('an unanswered account reads as mixed', readAccountUse(null) === 'mixed');
ok('so does nonsense', readAccountUse('yes please') === 'mixed');
ok('business is honoured', readAccountUse('business') === 'business');
ok('personal is honoured', readAccountUse('personal') === 'personal');

// 🔴 A ROW IMPORTED UNDER AN OLDER KEYWORD MAP.
//
// buildPile does not categorise: the map runs once at import and the answer is stored. So when the
// map learns a merchant, every row already in the database keeps the older answer for ever. That is
// not hypothetical: "Transport for London" was added to the travel rule on 28 July and every TfL row
// already imported still carried nothing.
console.log('\nA ROW IMPORTED UNDER AN OLDER MAP IS READ AGAINST THE CURRENT ONE');
const stale = [{ id: 's', vendor: 'Transport for London', amount: -7, category: null, looks_personal: false }];
const late = (t) => (/transport for london/i.test(t) ? 'travel' : 'other');
ok('with no categoriser it stays unknown, exactly as before', build(stale, (v) => v.toLowerCase().trim())[0].suggested === null);
ok('🔴 WITH THE CURRENT MAP IT IS RECOGNISED', build(stale, (v) => v.toLowerCase().trim(), [], late)[0].suggested === 'travel');
ok('and nothing was written: the input row is untouched', stale[0].category === null);
// A category he chose himself must always beat a keyword guess.
const his = [{ id: 'h', vendor: 'Transport for London', amount: -7, category: 'subcontractor', looks_personal: false }];
ok('🔴 HIS OWN ANSWER BEATS THE MAP', build(his, (v) => v.toLowerCase().trim(), [], late)[0].suggested === 'subcontractor');
ok('a map answer of other is still no answer', build(
  [{ id: 'o', vendor: 'Konoba-vinoteka', amount: -28, category: null, looks_personal: false }],
  (v) => v.toLowerCase().trim(), [], late,
)[0].suggested === null);

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

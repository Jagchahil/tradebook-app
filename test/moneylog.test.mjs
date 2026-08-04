// Tests for lib/moneylog.ts, EVERYTHING HE HAS LOGGED, A MONTH AT A TIME.
//
// What this suite defends, in the order it matters:
//
//   1. A LINE HE HAS STRUCK OUT IS SHOWN AND NEVER COUNTED. Both halves matter. Hiding it means a
//      man looking for a payment he remembers cannot find it and concludes we lost it. Counting it
//      means this page disagrees with the Overview about his own profit, which is exactly the drift
//      lib/ledger.ts opens by warning about.
//   2. A ROW WE CANNOT READ NEVER BECOMES A FIGURE. No date, no id, a NaN amount: every one of them
//      is dropped rather than guessed at. Guessing a date puts his money in a month he did not spend
//      it in, and a row with no id would render a correction button that silently does nothing.
//   3. THE MONTH KEY IS VALIDATED, because it comes off the query string. Month 13, month 00, a
//      quoted string and a path traversal all fall back to this month rather than reaching a query.
//   4. THE ARROWS AND THE QUERY BOUNDS ONLY POINT SOMEWHERE REAL, including across a year end,
//      where naive arithmetic produces month thirteen and a month that ends before it starts.
//   5. NOTHING IS EVER NAMELESS. A bank line with no vendor renders as a blank space beside a
//      figure, and a man looking at £240 next to nothing does not think "missing field".
//
//   6. A CAR IS NOT A RUNNING COST, AND THE ROW STILL SHOWS THE WHOLE PAYMENT. On 4 August 2026
//      this module put a £60,000 Audi in Out and reported June as a £52,557 loss, while the tax
//      engine reading the same row had already taken it out. Out is allowable costs now, the
//      purchase is counted in capitalCost where a screen can name it, and the entry keeps its
//      full amount because that IS what left his account.
//
// moneylog.ts imports nothing, so it loads directly under Node's type stripping. The written down
// test is therefore PASSED IN, and this suite passes plain functions rather than importing
// lib/capital.ts. That the real pages pass isWrittenDown and not something of their own is held by
// test/moneyweb.test.mjs and test/capitalwiring.test.mjs, on the page source.
//
// Run: node test/moneylog.test.mjs   (Node 22.6+). Pure, no network, no clock of its own.

import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const M = await import(pathToFileURL(path.resolve(here, '../lib/moneylog.ts')).href);

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

const row = (over = {}) => ({
  id: 'a1',
  amount: -120,
  vendor: 'Screwfix',
  category: 'materials',
  description: null,
  transaction_date: '2026-07-14',
  is_personal: false,
  ...over,
});

// The written down test, passed in the way the pages pass isWrittenDown from lib/capital.ts.
// NONE is the ordinary world: nobody has answered a capital question, so nothing is a car.
const NONE = () => false;
// And this one mirrors the real rule without importing it, so a fixture can say "he told us this
// one was a car". lib/capital.ts is the only place the real list of answers lives.
const BY_KIND = (r) => typeof r.capital_kind === 'string' && r.capital_kind !== 'not_a_car';

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n1. STRUCK OUT IS SHOWN, AND NEVER COUNTED');

{
  const rows = [
    row({ id: 'in', amount: 2400, vendor: 'Mrs Patel', category: null }),
    row({ id: 'out', amount: -120 }),
    row({ id: 'mine', amount: -60, vendor: 'Odeon', is_personal: true }),
  ];
  const log = M.logFor(rows, '2026-07', NONE);

  ok('every row is on the screen, including the struck out one', log.entries.length === 3);
  ok('the struck out row is marked as such', log.entries.find((e) => e.id === 'mine').personal === true);
  ok('🔴 AND IT IS NOT IN THE TOTALS', log.income === 2400 && log.expenses === 120);
  ok('so the profit matches the business money only', log.profit === 2280);
  ok('and it is counted, so the page can say so once', log.personalCount === 1);
}

{
  // Money in that he has struck out is out of the totals too. It is his figure either way, and the
  // page must not quietly keep counting income he has told us is not his business's.
  const log = M.logFor([row({ amount: 900, is_personal: true })], '2026-07', NONE);
  ok('struck out income is not counted either', log.income === 0 && log.profit === 0);
}

{
  const log = M.logFor([], '2026-07', NONE);
  ok('an empty month is zeros, never an error', log.entries.length === 0 && log.profit === 0);
  ok('...and it knows it has nothing struck out', log.personalCount === 0);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n2. A ROW WE CANNOT READ NEVER BECOMES A FIGURE');

ok('a row with no date is dropped, not guessed at', M.toEntry(row({ transaction_date: null }), NONE) === null);
ok('a row with a rubbish date is dropped', M.toEntry(row({ transaction_date: 'last Tuesday' }), NONE) === null);
ok('a row with a NaN amount is dropped', M.toEntry(row({ amount: 'lots' }), NONE) === null);
ok('a row with no amount at all is dropped', M.toEntry(row({ amount: null }), NONE) === null);
ok('a row with no id is dropped, because its button would do nothing',
  M.toEntry(row({ id: null }), NONE) === null && M.toEntry(row({ id: '' }), NONE) === null);
ok('a good row survives all of that', M.toEntry(row(), NONE) !== null);

{
  const log = M.logFor([
    row({ id: 'good', amount: -100 }),
    row({ id: 'x', transaction_date: null }),
    row({ id: null }),
    row({ id: 'y', amount: Number.NaN }),
  ], '2026-07', NONE);
  ok('a month made of half rubbish still adds up', log.expenses === 100 && log.entries.length === 1);
  ok('nothing prints as NaN', Number.isFinite(log.income) && Number.isFinite(log.expenses) && Number.isFinite(log.profit));
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n3. THE MONTH KEY COMES OFF THE QUERY STRING, SO IT IS VALIDATED');

for (const good of ['2026-01', '2026-07', '2026-12', '1999-09']) {
  ok(`${good} is a month`, M.isMonthKey(good) === true);
}
for (const bad of ['2026-13', '2026-00', '2026-7', '26-07', '2026-07-14', '', ' 2026-07', '2026-07 ',
  '2026-07; drop table', '../../etc', null, undefined, 7, {}, ['2026-07']]) {
  ok(`${JSON.stringify(bad)} is refused`, M.isMonthKey(bad) === false);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n4. THE MONTH FILTER IS EXACT, AND THE ARROWS POINT SOMEWHERE REAL');

{
  const rows = [
    row({ id: 'jun', transaction_date: '2026-06-30', amount: -10 }),
    row({ id: 'jul1', transaction_date: '2026-07-01', amount: -20 }),
    row({ id: 'jul31', transaction_date: '2026-07-31', amount: -30 }),
    row({ id: 'aug', transaction_date: '2026-08-01', amount: -40 }),
  ];
  const july = M.logFor(rows, '2026-07', NONE);
  ok('the first and last day of the month are in it', july.entries.length === 2 && july.expenses === 50);
  ok('the day before is not', !july.entries.some((e) => e.id === 'jun'));
  ok('and the day after is not', !july.entries.some((e) => e.id === 'aug'));

}

// 🔴 THE BOUNDS THE QUERY USES, and the end is EXCLUSIVE on purpose. A `lte` on the last day of the
// month is a date comparison pretending to be a string one, and the first thing it gets wrong is a
// payment timestamped on the 1st of the next month.
ok('a month starts on its first day', M.monthStart('2026-07') === '2026-07-01');
ok('a month ends on the first of the NEXT one, exclusive', M.monthEnd('2026-07') === '2026-08-01');
ok('🔴 AND DECEMBER ENDS IN JANUARY OF THE NEXT YEAR', M.monthEnd('2026-12') === '2027-01-01');
ok('every month has bounds a database will accept', (() => {
  for (let m = 1; m <= 12; m += 1) {
    const key = `2026-${String(m).padStart(2, '0')}`;
    if (!/^\d{4}-\d{2}-01$/.test(M.monthStart(key))) return false;
    if (!/^\d{4}-\d{2}-01$/.test(M.monthEnd(key))) return false;
    if (M.monthEnd(key) <= M.monthStart(key)) return false;
  }
  return true;
})());

ok('a month steps back', M.stepMonth('2026-07', -1) === '2026-06');
ok('a month steps forward', M.stepMonth('2026-07', 1) === '2026-08');
// 🔴 NAIVE ARITHMETIC ON THE KEY PRODUCES 2026-13 AND 2026-00. Both would render as a month with no
// name and query for rows that cannot exist.
ok('🔴 DECEMBER STEPS TO JANUARY OF THE NEXT YEAR', M.stepMonth('2026-12', 1) === '2027-01');
ok('🔴 AND JANUARY STEPS BACK TO DECEMBER OF THE LAST', M.stepMonth('2026-01', -1) === '2025-12');
ok('every step is still a valid month key', (() => {
  for (let m = 1; m <= 12; m += 1) {
    const key = `2026-${String(m).padStart(2, '0')}`;
    if (!M.isMonthKey(M.stepMonth(key, 1)) || !M.isMonthKey(M.stepMonth(key, -1))) return false;
  }
  return true;
})());

ok('the current month is read off the clock we pass in',
  M.monthKeyOf(new Date('2026-07-30T17:00:00Z')) === '2026-07');
ok('...including a single digit month', M.monthKeyOf(new Date('2026-01-05T09:00:00Z')) === '2026-01');

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n5. NOTHING IS EVER NAMELESS, AND THE ORDER IS STABLE');

ok('the vendor is the name when there is one', M.labelFor({ vendor: 'Screwfix' }) === 'Screwfix');
ok('the description stands in when there is not', M.labelFor({ vendor: null, description: 'Cash job, Mrs Hall' }) === 'Cash job, Mrs Hall');
ok('a blank vendor does not win over a real description', M.labelFor({ vendor: '   ', description: 'Diesel' }) === 'Diesel');
ok('🔴 AND A ROW WITH NEITHER STILL SAYS SOMETHING', M.labelFor({}) === 'No name on it');
ok('...whatever rubbish the columns hold', M.labelFor({ vendor: 7, description: null }) === 'No name on it');

{
  const rows = [
    row({ id: 'b', transaction_date: '2026-07-14' }),
    row({ id: 'a', transaction_date: '2026-07-14' }),
    row({ id: 'c', transaction_date: '2026-07-20' }),
  ];
  const one = M.logFor(rows, '2026-07', NONE).entries.map((e) => e.id).join(',');
  const two = M.logFor([...rows].reverse(), '2026-07', NONE).entries.map((e) => e.id).join(',');
  ok('newest first', one.startsWith('c'));
  ok('🔴 AND TWO PAYMENTS ON ONE DAY DO NOT SWAP PLACES BETWEEN LOADS', one === two);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n6. THE WORDS ON THE SCREEN');

ok('a month reads as a month', M.monthTitle('2026-07') === 'July 2026');
ok('the year is always shown', /2026$/.test(M.monthTitle('2026-01')));
ok('a month we cannot name does not crash', typeof M.monthTitle('nonsense') === 'string');
ok('a day carries its weekday, because he remembers the job not the date',
  M.dayLabel('2026-07-14') === 'Tue 14 July');
ok('...on the first of a month too', M.dayLabel('2026-08-01') === 'Sat 1 August');
ok('an unreadable date falls back to itself rather than to "Invalid Date"',
  M.dayLabel('nonsense') === 'nonsense');

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n7. 🔴 A CAR IS NOT A RUNNING COST, AND THE ROW STILL SHOWS THE WHOLE PAYMENT');
//
// The real month, from the account that found this on 4 August 2026. June 2026: £10,620 in,
// £3,177 of ordinary costs, and one AUDI LEEDS line at £60,000 that the pile had recorded as a
// car. This module put all of it in Out and reported a £52,557 loss, while lib/supabase.ts,
// reading the same capital_kind on the same row, had already held the car out of his tax figures.

{
  const june = [
    row({ id: 'in1', amount: 10620, vendor: 'Haldane', category: 'income', transaction_date: '2026-06-26' }),
    row({ id: 'cef', amount: -3177, vendor: 'CEF', category: 'materials', transaction_date: '2026-06-04' }),
    row({ id: 'audi', amount: -60000, vendor: 'AUDI LEEDS', category: 'van', transaction_date: '2026-06-02', capital_kind: 'car_other' }),
  ];

  const before = M.logFor(june, '2026-06', NONE);
  ok('CONTROL: with no capital answers at all it is the old arithmetic, to the pound',
    before.expenses === 63177 && before.profit === -52557 && before.capitalCost === 0);

  const after = M.logFor(june, '2026-06', BY_KIND);
  ok('🔴 the car is out of Out', after.expenses === 3177);
  ok('🔴 so the month is a profit and not a £52,557 loss', after.profit === 7443);
  ok('and the money is NAMED rather than merely missing', after.capitalCost === 60000 && after.capitalCount === 1);
  ok('the row is still on the screen', after.entries.some((e) => e.id === 'audi'));
  ok('🔴 AND IT STILL SHOWS THE WHOLE £60,000, because that is what left his account',
    after.entries.find((e) => e.id === 'audi').amount === -60000);
  ok('the row carries the flag the screen needs to say so',
    after.entries.find((e) => e.id === 'audi').writtenDown === true);
  ok('and an ordinary cost does not', after.entries.find((e) => e.id === 'cef').writtenDown === false);
  ok('every figure still adds up, In minus Out is Profit',
    after.income - after.expenses === after.profit);
}

{
  // 'not_a_car' IS AN ANSWER AND IT MEANS THE OPPOSITE. A van, a digger and a tester are plant
  // and machinery, inside the AIA, and correctly come off in full. See lib/capital.ts.
  const rows = [row({ id: 'van', amount: -18000, vendor: 'Ford', capital_kind: 'not_a_car' })];
  const log = M.logFor(rows, '2026-07', BY_KIND);
  ok('a van he has told us about still comes off in full',
    log.expenses === 18000 && log.capitalCost === 0);
  ok('...and is not labelled on the screen', log.entries[0].writtenDown === false);
}

{
  // Money IN is never a purchase, and a row he has struck out has no relief to describe. A test
  // that answered true for either would put a credit in capitalCost, which is not a number.
  const rows = [
    row({ id: 'credit', amount: 5000, capital_kind: 'car_other' }),
    row({ id: 'mine', amount: -9000, capital_kind: 'car_other', is_personal: true }),
  ];
  const log = M.logFor(rows, '2026-07', () => true);
  ok('🔴 a payment IN is never written down, whatever the test says',
    log.income === 5000 && log.capitalCost === 0 && log.entries.find((e) => e.id === 'credit').writtenDown === false);
  ok('and neither is a line he has struck out',
    log.capitalCost === 0 && log.entries.find((e) => e.id === 'mine').writtenDown === false);
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exitCode = fail === 0 ? 0 : 1;

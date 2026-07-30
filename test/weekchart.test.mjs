// Tests for lib/weekchart.ts, THE WEEK BEHIND BOTH THE SENTENCE AND THE PICTURE.
//
// What this suite defends, in the order it matters:
//
//   1. THE TOTALS ARE SUMMED FROM THE BARS. The Overview says "£1,200 in, £400 out" in words and
//      draws the same seven days beside it. If those were ever fetched or counted separately they
//      would drift, and lib/money.ts and lib/ledger.ts both open with what happens then: the one
//      that drifts is the one he believes. Proven here by adding the bars up independently and
//      insisting the answer matches.
//   2. THE DAYS ARE LONDON DAYS. A payment at half past midnight on a Thursday in July is 23:30 UTC
//      on the Wednesday. Bucketing on the UTC date draws his Thursday takings on Wednesday's bar
//      for seven months of the year. Proven on both sides of the clock change.
//   3. THE WINDOW IS SEVEN WHOLE DAYS, and it survives the two Sundays a year that are 23 and 25
//      hours long. Stepping back by 24 hours across the last Sunday in October lands on the same
//      date twice, which would draw a man six days and call it a week.
//   4. A REAL AMOUNT IS NEVER DRAWN AS NOTHING. A £4 coffee beside a £4,000 invoice is a thousandth
//      of the peak and rounds to no bar at all, which on a chart says he spent nothing that day.
//   5. RUBBISH IN DOES NOT BECOME A FIGURE. A null date, a NaN amount, a row from last month: none
//      of them may become part of a number on a screen about his money.
//
// weekchart.ts imports nothing at all, so it loads directly under Node's type stripping.
//
// Run: node test/weekchart.test.mjs   (Node 22.6+). Pure, no network, no clock of its own.

import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const W = await import(pathToFileURL(path.resolve(here, '../lib/weekchart.ts')).href);

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

// Thursday 30 July 2026, teatime. Britain is on BST, one hour ahead of UTC.
const SUMMER = new Date('2026-07-30T17:00:00Z');
// Thursday 15 January 2026, midday. Britain is on GMT, the same as UTC.
const WINTER = new Date('2026-01-15T12:00:00Z');

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n1. THE WINDOW: seven whole days, ending today');

{
  const win = W.weekWindow(SUMMER);
  ok('there are exactly seven days', win.length === 7 && W.WEEK_DAYS === 7);
  ok('they are all different', new Set(win).size === 7);
  ok('the last one is today, in London', win[6] === '2026-07-30');
  ok('the first one is six days back', win[0] === '2026-07-24');
  ok('they are in order, oldest first', [...win].sort().join() === win.join());
}

{
  // 🔴 THE DAY THE CLOCKS GO BACK. 25 October 2026 is twenty five hours long. Stepping back by
  // 24 * 3600 * 1000 across it lands on the same date twice, so a man would be shown six days and
  // told it was his week. Calendar arithmetic cannot do that.
  const win = W.weekWindow(new Date('2026-10-27T12:00:00Z'));
  ok('the long Sunday does not appear twice', new Set(win).size === 7);
  ok('...and it is in the window where it belongs', win.includes('2026-10-25'));
  ok('...with the right ends', win[0] === '2026-10-21' && win[6] === '2026-10-27');
}

{
  // And the short Sunday, 29 March 2026, which is twenty three hours long.
  const win = W.weekWindow(new Date('2026-03-31T12:00:00Z'));
  ok('the short Sunday does not go missing', new Set(win).size === 7 && win.includes('2026-03-29'));
}

{
  // Crossing a month end and a year end, because a chart drawn on 2 January must not be six days of
  // December and a hole.
  ok('a window across a month end is whole', new Set(W.weekWindow(new Date('2026-08-02T09:00:00Z'))).size === 7);
  const ny = W.weekWindow(new Date('2027-01-02T09:00:00Z'));
  ok('a window across a year end is whole', new Set(ny).size === 7 && ny[0] === '2026-12-27' && ny[6] === '2027-01-02');
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n2. THE DAYS ARE LONDON DAYS, NOT UTC DAYS');

ok('a summer timestamp reads as its London date',
  W.londonDay('2026-07-29T23:30:00Z') === '2026-07-30');
ok('...and the same instant is the day before in UTC',
  '2026-07-29T23:30:00Z'.slice(0, 10) === '2026-07-29');
ok('a winter timestamp is unchanged, because Britain is on UTC then',
  W.londonDay('2026-01-14T23:30:00Z') === '2026-01-14');
ok('midday is midday in both', W.londonDay('2026-07-30T12:00:00Z') === '2026-07-30');
ok('a Date works as well as a string', W.londonDay(new Date('2026-07-30T12:00:00Z')) === '2026-07-30');
ok('an unreadable date is null, never a guess', W.londonDay('not a date') === null);
ok('an empty string is null too', W.londonDay('') === null);

{
  // 🔴 THE WHOLE POINT, END TO END. A tradesman paid at half past midnight on the Thursday. On a
  // UTC bucket his money lands on Wednesday's bar and he is looking at a picture of his own week
  // that he knows is wrong.
  const week = W.weekOf([{ amount: 500, at: '2026-07-29T23:30:00Z' }], SUMMER);
  const thursday = week.days.find((d) => d.iso === '2026-07-30');
  const wednesday = week.days.find((d) => d.iso === '2026-07-29');
  ok('🔴 A HALF PAST MIDNIGHT PAYMENT IS ON THE RIGHT DAY', thursday.income === 500);
  ok('...and not on the day before it', wednesday.income === 0);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n3. THE TOTALS ARE SUMMED FROM THE BARS');

{
  const rows = [
    { amount: 1200, at: '2026-07-30T09:00:00Z' },
    { amount: -400, at: '2026-07-30T10:00:00Z' },
    { amount: 300, at: '2026-07-28T11:00:00Z' },
    { amount: -50.5, at: '2026-07-25T11:00:00Z' },
  ];
  const week = W.weekOf(rows, SUMMER);
  const barsIn = week.days.reduce((n, d) => n + d.income, 0);
  const barsOut = week.days.reduce((n, d) => n + d.expenses, 0);

  ok('🔴 THE WORDS ARE THE BARS ADDED UP, IN', week.income === barsIn && week.income === 1500);
  ok('🔴 THE WORDS ARE THE BARS ADDED UP, OUT', week.expenses === barsOut && week.expenses === 450.5);
  ok('weekTotals agrees with weekOf, because it IS weekOf', (() => {
    const t = W.weekTotals(rows, SUMMER);
    return t.income === week.income && t.expenses === week.expenses;
  })());
  ok('the peak is the tallest single figure in the week', week.peak === 1200);
  ok('a week with money in it says so', week.anyMoney === true);
}

{
  // A negative amount is money out. Nothing in this file may ever report a negative income or a
  // negative expense: the sign is the direction, and the figures are magnitudes.
  const week = W.weekOf([{ amount: -99, at: '2026-07-30T09:00:00Z' }], SUMMER);
  ok('money out is a positive expense, never a negative income',
    week.expenses === 99 && week.income === 0);
  ok('no day ever carries a negative figure',
    week.days.every((d) => d.income >= 0 && d.expenses >= 0));
}

{
  // Zero is money in, not money out. A £0 row is vanishingly rare and it must not silently become
  // spending.
  const week = W.weekOf([{ amount: 0, at: '2026-07-30T09:00:00Z' }], SUMMER);
  ok('a zero row does not become an expense', week.expenses === 0 && week.income === 0);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n4. THE WIDER FETCH IS TRIMMED HERE, NOT IN THE QUERY');

ok('the reader is asked for one day more than the week', W.FETCH_DAYS === W.WEEK_DAYS + 1);

{
  const week = W.weekOf([
    { amount: 999, at: '2026-07-23T09:00:00Z' },   // the extra day the query fetched
    { amount: 111, at: '2026-07-24T09:00:00Z' },   // the oldest day that counts
  ], SUMMER);
  ok('a row from outside the seven days is discarded', week.income === 111);
  ok('...and the oldest day inside it is kept', week.days[0].income === 111);
}

ok('a row from last month never reaches a figure',
  W.weekOf([{ amount: 5000, at: '2026-06-01T09:00:00Z' }], SUMMER).income === 0);
ok('a row from the future never reaches a figure',
  W.weekOf([{ amount: 5000, at: '2026-09-01T09:00:00Z' }], SUMMER).income === 0);

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n5. RUBBISH IN DOES NOT BECOME A FIGURE');

{
  const week = W.weekOf([
    { amount: 100, at: '2026-07-30T09:00:00Z' },
    { amount: Number.NaN, at: '2026-07-30T09:00:00Z' },
    { amount: Number.POSITIVE_INFINITY, at: '2026-07-30T09:00:00Z' },
    { amount: 50, at: 'not a date' },
    { amount: 50, at: '' },
  ], SUMMER);
  ok('a NaN amount is skipped, not added', week.income === 100);
  ok('an infinite amount is skipped too', Number.isFinite(week.income));
  ok('an unreadable date is skipped', week.income === 100);
  ok('nothing prints as NaN', week.days.every((d) => Number.isFinite(d.income) && Number.isFinite(d.expenses)));
}

{
  const week = W.weekOf([], SUMMER);
  ok('an empty week is seven empty days, never an error', week.days.length === 7);
  ok('an empty week knows it is empty', week.anyMoney === false && week.peak === 0);
  ok('...and its totals are zero', week.income === 0 && week.expenses === 0);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n6. THE LABELS');

{
  const week = W.weekOf([], SUMMER);
  ok('every day has a one letter label for the axis', week.days.every((d) => d.initial.length === 1));
  ok('every day has a whole word for a screen reader', week.days.every((d) => d.name.length > 4));
  ok('30 July 2026 really is a Thursday', week.days[6].name === 'Thursday' && week.days[6].initial === 'T');
  ok('and the week before it starts on a Friday', week.days[0].name === 'Friday');
}

{
  // Winter, so the midday reading used to name the weekday is checked on the other side of the
  // clock change as well.
  const week = W.weekOf([], WINTER);
  ok('15 January 2026 really is a Thursday', week.days[6].name === 'Thursday');
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n7. A REAL AMOUNT IS NEVER DRAWN AS NOTHING');

ok('nothing is drawn as nothing', W.barHeight(0, 1000, 100) === 0);
ok('🔴 A £4 COFFEE BESIDE A £4,000 INVOICE STILL GETS A BAR', W.barHeight(4, 4000, 100) >= 3);
ok('the tallest figure fills the space', W.barHeight(1000, 1000, 100) === 100);
ok('half is half', W.barHeight(500, 1000, 100) === 50);
ok('a bar never overflows its box', (() => {
  for (let v = 0; v <= 1000; v += 7) if (W.barHeight(v, 1000, 100) > 100) return false;
  return true;
})());
ok('no peak means no bars, rather than a divide by zero', W.barHeight(50, 0, 100) === 0);
ok('a negative never becomes a bar', W.barHeight(-50, 1000, 100) === 0);
ok('a rubbish peak is refused', W.barHeight(50, Number.NaN, 100) === 0);

console.log(`\n${pass} passed, ${fail} failed.`);
process.exitCode = fail === 0 ? 0 : 1;

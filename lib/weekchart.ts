// THE WEEK, AS A PICTURE. Seven days of money in and money out, worked out once.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ THIS EXISTS SO THE CHART AND THE SENTENCE CANNOT DISAGREE.
//
// The Overview says "£1,200 in, £400 out" in words and then draws the same week as bars. Those are
// two readings of one number, and this codebase already knows what happens next: lib/money.ts's
// header counted seventeen money formatters, lib/ledger.ts's counted three separate times two
// readers drifted over the same figure, and the lesson both draw is that the one which drifts is
// the one he believes.
//
// So the totals are not fetched separately from the bars. They are SUMMED FROM THE BARS. If the
// chart is wrong the sentence is wrong in exactly the same way, which is the only kind of wrong
// that cannot mislead him.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 AND IT BUCKETS ON THE DAY HE SPENT THE MONEY, NOT THE DAY WE LEARNED ABOUT IT.
//
// Found on the deployed site, by correcting one row and watching the wrong number move. The week
// said "£1,197 out". Marking a payment dated 11 MAY as not business took the week down to £701,
// because weeklyTotals had always filtered on `created_at`: the day the row arrived in our table.
//
// As a sentence that was merely ambiguous. As a bar chart it is a lie with a shape: a bank feed
// backfilling ninety days would draw three months of a man's spending as one enormous bar on the
// afternoon he connected it, on a card headed "Your week".
//
// So the window and the buckets are both `transaction_date`, which is what every other money figure
// in this product already uses, and a plain calendar date with no time on it. A row without one is
// excluded, exactly as getOptimiserInput already excludes it from his year.
//
// ⚠️ THE LONDON CODE BELOW STAYS, and it is not left over. Working out WHICH seven days the window
// covers still means asking what today's date is, and at half past midnight in July that is
// tomorrow in UTC. Getting that wrong shifts the whole chart by a day.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// PURE. No fetch, no clock of its own: `now` is passed in, so a test can stand on any day of the
// year and on both sides of the clock change.

// Seven days, today included. Not a rolling one hundred and sixty eight hours.
//
// ⚠️ THIS CHANGED THE MEANING OF "YOUR WEEK", ON PURPOSE. lib/supabase.ts's weeklyTotals used to
// ask for everything since exactly seven times twenty four hours ago, which is a window that starts
// at whatever time of day the question happened to be asked. Under it the oldest day on this chart
// would be a part day: a Thursday bar holding Thursday evening only, drawn the same height as a
// whole day beside it. A week that means "today and the six days before it" is both what a person
// means by the word and the only window a bar chart can honestly draw.
export const WEEK_DAYS = 7;

// A confirmed, non personal transaction, as the reader hands it over. `date` is transaction_date,
// the day the money moved, as a plain YYYY-MM-DD. `amount` is positive for money in and negative
// for money out, which is the convention the transactions table has always used.
export interface WeekRow {
  amount: number;
  date: string;
}

export interface WeekBar {
  /** The London calendar date, YYYY-MM-DD. */
  iso: string;
  /** One letter for the axis: M, T, W, T, F, S, S. */
  initial: string;
  /** The whole word, for the label a screen reader gets. */
  name: string;
  income: number;
  expenses: number;
}

export interface Week {
  days: WeekBar[];
  income: number;
  expenses: number;
  /** The tallest single figure in the week, so a bar can be drawn as a share of it. */
  peak: number;
  /** False when the whole week is empty, which is a sentence rather than a chart of nothing. */
  anyMoney: boolean;
}

const LONDON = 'Europe/London';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

// The date in London, as YYYY-MM-DD. Built from parts rather than from a locale that happens to
// print in the right order, because "which day was this" is not a formatting question.
export function londonDay(value: string | Date): string | null {
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: LONDON, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const y = get('year');
  const m = get('month');
  const day = get('day');
  if (!y || !m || !day) return null;
  return `${y}-${m}-${day}`;
}

// The weekday in London for a date only string. Midday is used to read it because midday is safely
// inside the same London day whether the country is on GMT or BST, and this file is not allowed to
// care which.
function weekdayOf(iso: string): { initial: string; name: string } {
  const d = new Date(`${iso}T12:00:00Z`);
  const name = d.toLocaleDateString('en-GB', { weekday: 'long', timeZone: LONDON });
  return { initial: name.slice(0, 1), name };
}

// The seven London dates the chart covers, oldest first, ending on today.
//
// Calendar arithmetic, not millisecond arithmetic. Stepping back by 24 hours across the last Sunday
// in October lands on the same date twice, because that day is 25 hours long. Stepping back by a
// date cannot.
export function weekWindow(now: Date): string[] {
  const today = londonDay(now);
  if (!today) return [];
  const [y, m, d] = today.split('-').map(Number);
  const out: string[] = [];
  for (let back = WEEK_DAYS - 1; back >= 0; back -= 1) {
    const at = new Date(Date.UTC(y, m - 1, d - back));
    out.push(at.toISOString().slice(0, 10));
  }
  return out;
}

// The first day of the window, for the query. A plain date, so the query is a plain date
// comparison and there is no daylight saving arithmetic anywhere near a database.
export function windowStart(now: Date): string {
  const win = weekWindow(now);
  return win.length ? win[0] : '';
}

export function weekOf(rows: WeekRow[], now: Date): Week {
  const window = weekWindow(now);
  const byDay = new Map<string, { income: number; expenses: number }>();
  for (const iso of window) byDay.set(iso, { income: 0, expenses: 0 });

  for (const r of rows) {
    // A plain date, taken as it is. No timezone reading: transaction_date carries no time, so
    // interpreting it in one would be inventing a fact about when he spent his money.
    const day = typeof r.date === 'string' && ISO_DATE.test(r.date) ? r.date.slice(0, 10) : null;
    if (!day) continue;
    const bucket = byDay.get(day);
    if (!bucket) continue;                       // outside the seven days, from the wider fetch
    const amount = Number(r.amount);
    if (!Number.isFinite(amount)) continue;
    if (amount >= 0) bucket.income += amount;
    else bucket.expenses += Math.abs(amount);
  }

  const days: WeekBar[] = window.map((iso) => {
    const b = byDay.get(iso) ?? { income: 0, expenses: 0 };
    const { initial, name } = weekdayOf(iso);
    return { iso, initial, name, income: b.income, expenses: b.expenses };
  });

  const income = days.reduce((n, d) => n + d.income, 0);
  const expenses = days.reduce((n, d) => n + d.expenses, 0);
  const peak = days.reduce((n, d) => Math.max(n, d.income, d.expenses), 0);

  return { days, income, expenses, peak, anyMoney: peak > 0 };
}

// The totals, from the same buckets the bars are drawn from. This is the whole point of the file.
export function weekTotals(rows: WeekRow[], now: Date): { income: number; expenses: number } {
  const w = weekOf(rows, now);
  return { income: w.income, expenses: w.expenses };
}

// How tall to draw a bar, as a share of the tallest figure in the week.
//
// ⚠️ A REAL AMOUNT NEVER ROUNDS DOWN TO NOTHING. A £4 coffee beside a £4,000 invoice is one
// thousandth of the peak and would be drawn as no bar at all, which says he spent nothing that day.
// So anything above zero gets at least a visible sliver. The chart is a shape, not a measuring
// instrument, and the exact figures are in the sentence above it.
export function barHeight(value: number, peak: number, max: number, min = 3): number {
  if (!(value > 0) || !(peak > 0) || !(max > 0)) return 0;
  return Math.max(min, Math.round((value / peak) * max));
}

// EVERYTHING HE HAS LOGGED, A MONTH AT A TIME.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ WHY A MONTH AND NOT A LIST.
//
// A working tradesman's year is a few thousand rows. A page that renders all of them is a page that
// takes a second to arrive on a bad signal and can never be read anyway, and doc 103's whole
// argument is that a row he has to scroll past is a cost. A month is the unit he already thinks in:
// it is how his bank statement arrives, how he invoices, and how he remembers what he spent.
//
// ⚠️ AND THE TOTALS ARE BUSINESS MONEY ONLY, which is not the same as every row on the screen.
//
// A line he has marked as not business money STAYS ON THE SCREEN, struck through, because hiding it
// would mean a man looking for a payment he remembers cannot find it and concludes we lost it. But
// it is not in the totals, because it is not in his tax figures either, and a total on this page
// that disagreed with the Overview would be exactly the drift lib/ledger.ts opens by warning about.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// PURE. Rows in, a month out. No fetch, no clock of its own.

// ⚠️ THE ROW ARRIVES FROM A JSON API, SO THE TYPE SAYS SO.
//
// getAllConfirmedForReview hands back Record<string, unknown>[], which is honest: it is whatever
// PostgREST sent. Declaring a tidy shape here and casting to it at the call site would move the lie
// into the page rather than remove it, and the first thing a lie like that costs is a NaN in a
// figure. So the fields are unknown and toEntry does the narrowing, once, where it can refuse.
export type LogRow = Record<string, unknown>;

export interface LogEntry {
  id: string;
  /** YYYY-MM-DD, exactly as the row carries it. */
  date: string;
  /** What to call it on the screen. Never empty: see labelFor. */
  label: string;
  category: string | null;
  /** Positive for money in, negative for money out, the convention the table uses. */
  amount: number;
  personal: boolean;
  // 🔴 THE PAYMENT LEFT HIS ACCOUNT IN FULL AND ONLY A SLICE OF IT COMES OFF HIS PROFIT.
  // A car. The row still shows the whole amount, because that IS what left, and this flag is
  // what lets the screen say so beside it instead of quietly disagreeing with its own total.
  writtenDown: boolean;
}

export interface MonthLog {
  month: string;          // YYYY-MM
  entries: LogEntry[];
  income: number;         // business only
  /** Allowable running costs. A written down purchase is NOT in here: see capitalCost. */
  expenses: number;
  profit: number;
  /** Rows he has set aside as not business money. Shown, never counted. */
  personalCount: number;
  // What went out on things relieved over years. Never folded into expenses and never dropped:
  // a total that silently omits £60,000 sitting in plain sight one row below is worse than no
  // total at all. app/app/money/page.tsx prints this whenever it is not zero.
  capitalCost: number;
  capitalCount: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;
const ISO_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

// A month key we are willing to act on. Anything else is somebody editing the query string, and the
// answer to that is the current month rather than an error page about his own money.
export function isMonthKey(value: unknown): value is string {
  return typeof value === 'string' && ISO_MONTH.test(value);
}

// The month a date belongs to. The transaction_date column is a plain date with no time on it, so
// there is no timezone question here and deliberately no timezone code: adding some would invent
// one. (lib/weekchart.ts DOES need it, because it buckets created_at, which is a timestamp.)
export function monthOf(row: LogRow): string | null {
  const d = row.transaction_date;
  if (typeof d !== 'string' || !ISO_DATE.test(d)) return null;
  return d.slice(0, 7);
}

export function monthKeyOf(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

// The month before and the month after, for the two arrows. Calendar arithmetic on the key itself,
// so December steps to January of the next year rather than to month thirteen.
export function stepMonth(month: string, by: -1 | 1): string {
  const [y, m] = month.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1 + by, 1));
  return monthKeyOf(at);
}

// WHAT TO CALL A ROW ON THE SCREEN.
//
// ⚠️ IT IS NEVER EMPTY, and that is not politeness. A bank line with no vendor renders as a blank
// space with a figure beside it, and a man looking at £240 next to nothing at all does not think
// "missing field", he thinks we have lost track of his money. The date and the amount are still
// true, so the row says what it honestly is.
export function labelFor(row: LogRow): string {
  const vendor = typeof row.vendor === 'string' ? row.vendor.trim() : '';
  if (vendor) return vendor;
  const description = typeof row.description === 'string' ? row.description.trim() : '';
  if (description) return description;
  return 'No name on it';
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY THIS MODULE IS HANDED THE TEST INSTEAD OF KNOWING IT.
//
// Whether a cost is relieved over years is decided by isWrittenDown() in lib/capital.ts, and that
// is the only file allowed to know which answers mean a car. This module imports NOTHING: its own
// suite loads it straight off disk under Node's type stripping and says so in its header, and
// test/moneyweb.test.mjs stages it as a bare copy with no import rewriting at all. An import here
// breaks both, and copying the rule in would give the product a second one to drift from.
//
// ⚠️ SO IT IS A REQUIRED PARAMETER AND NOT AN OPTIONAL ONE. Defaulted to "nothing is written
// down" it would silently reproduce today's defect at any call site that forgot, which is the
// daysElapsed lesson: make tsc name every caller instead of picking a plausible answer for them.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export type WrittenDownTest = (row: LogRow) => boolean;

export function toEntry(row: LogRow, writtenDown: WrittenDownTest): LogEntry | null {
  const raw = row.transaction_date;
  const date = typeof raw === 'string' && ISO_DATE.test(raw) ? raw.slice(0, 10) : null;
  // A row with no usable date cannot be filed under a month, and guessing at one would put his money
  // in a month he did not spend it in.
  if (!date) return null;
  // ⚠️ Number(null) IS 0, AND 0 IS A PERFECTLY FINITE NUMBER.
  //
  // A missing amount would therefore have rendered as "£0" beside a real merchant, which is not a
  // gap on the screen, it is a wrong figure: a man reading "Screwfix £0" concludes it was free, not
  // that a column was empty. So the column has to actually hold a number, or a string of one, which
  // is what PostgREST sends for a numeric column.
  const amount = typeof row.amount === 'number'
    ? row.amount
    : (typeof row.amount === 'string' && row.amount.trim() !== '' ? Number(row.amount) : Number.NaN);
  if (!Number.isFinite(amount)) return null;
  // A row with no id cannot carry a correction button, and a button posting an empty id would be a
  // press that silently does nothing.
  const id = typeof row.id === 'string' && row.id ? row.id : null;
  if (!id) return null;
  return {
    id,
    date,
    label: labelFor(row),
    category: typeof row.category === 'string' && row.category ? row.category : null,
    amount,
    personal: row.is_personal === true,
    // Money out only. A payment IN is never a capital purchase, and a row he has taken out of his
    // books entirely has no relief to describe, so neither is ever labelled.
    writtenDown: amount < 0 && row.is_personal !== true && writtenDown(row),
  };
}

// THE TWO DATES A MONTH RUNS BETWEEN, for the query that fetches it.
//
// ⚠️ THE READER FETCHES ONE MONTH, AND THE FIRST VERSION FETCHED EVERYTHING.
//
// It called getAllConfirmedForReview, which has no date filter and a limit of two thousand rows.
// On a busy account that limit is reached, the oldest rows fall off the end, and a man stepping
// back to April is shown an EMPTY MONTH with nothing to tell him why. A silent truncation that
// reads as "you did no work in April" is worse than a slow page, and this one was also the slow
// page: two thousand rows over a bad signal to render thirty.
//
// The end is exclusive, so a payment at the very start of the next month is not swept in by a date
// comparison that ought to be about days and is really about strings.
export function monthStart(month: string): string {
  return `${month}-01`;
}

export function monthEnd(month: string): string {
  return `${stepMonth(month, 1)}-01`;
}

export function logFor(rows: LogRow[], month: string, writtenDown: WrittenDownTest): MonthLog {
  const entries = rows
    .filter((r) => monthOf(r) === month)
    .map((r) => toEntry(r, writtenDown))
    .filter((e): e is LogEntry => e !== null)
    // Newest first, and the id breaks a tie so the same rows always come back in the same order.
    // Two payments on one day flipping places between loads reads as the page being unreliable.
    .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : b.date.localeCompare(a.date)));

  let income = 0;
  let expenses = 0;
  let capitalCost = 0;
  let capitalCount = 0;
  for (const e of entries) {
    if (e.personal) continue;          // shown, never counted. See the header.
    if (e.amount >= 0) { income += e.amount; continue; }
    // 🔴 A CAR DOES NOT COME OFF HIS PROFIT IN THE MONTH HE BOUGHT IT, SO IT IS NOT IN Out.
    // On 4 August 2026 this line said June was a £52,557 loss because a £60,000 Audi was in it,
    // while the tax engine, reading the same row, had already taken it out. The page prints
    // capitalCost right beside the total so the money is named rather than merely missing.
    if (e.writtenDown) { capitalCost += Math.abs(e.amount); capitalCount += 1; continue; }
    expenses += Math.abs(e.amount);
  }

  return {
    month,
    entries,
    income,
    expenses,
    profit: income - expenses,
    personalCount: entries.filter((e) => e.personal).length,
    capitalCost,
    capitalCount,
  };
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// "July 2026". The year is always shown: a man looking at an old month needs to know which one, and
// leaving it off the current year is the kind of cleverness that confuses somebody in January.
export function monthTitle(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const name = MONTH_NAMES[m - 1];
  return name ? `${name} ${y}` : month;
}

// "Tue 14 July". The weekday earns its place: he remembers the job, not the date.
export function dayLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return iso;
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
  return `${weekday} ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
}

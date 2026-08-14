// lib/diary.ts. THE JOBS DIARY: WHAT IS COMING, WHAT HAS PASSED, AND THE ONE QUESTION WORTH ASKING.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// A bricklayer says "measuring up Tuesday 8am". After the slot, the honest next step is not a
// dashboard, it is a question: shall I draft the invoice? This module makes every one of those
// decisions and performs none of them. What is upcoming, what has wrapped up, what deserves the
// nudge, and the plain words for all of it live here; the page renders, the API writes, and the
// nudges are handed back as data.
//
// 🔴 A NUDGE IS DECIDED HERE AND SENT NOWHERE. decideDiaryNudges returns rows the existing
// reminders cron COULD one day call for, and nothing in this codebase calls it. Sending is a
// separate decision that belongs to lib/routing.ts and its table, where a channel is a row
// somebody chose, and the WhatsApp half of any send sits behind its own gate. Wiring a send from
// here would be a call site picking a channel, which is exactly the disease routing.ts exists to
// end. test/diarygoals.test.mjs asserts that nothing imports the function.
//
// ⚠️ PURE, AND IMPORT FREE ON PURPOSE. No I/O, no database, no clock of its own: every function
// takes `now`, so the suite runs the same in January as in July. It imports nothing at all so the
// tests can load it under bare node without staging, the same property lib/tokens.ts protects.
//
// ⚠️ EVERY TIME IS SAID IN LONDON TIME. The server runs in UTC and the man is in Britain. A job
// he typed as "Tuesday 8am" must come back as "Tuesday at 8am" in July (BST) and in January
// (GMT), which is why every phrase here goes through Europe/London rather than the server clock.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export type DiaryStatus = 'planned' | 'done' | 'invoiced';

export interface DiaryJob {
  id: string;
  title: string;
  startsAt: string;        // ISO, UTC
  endsAt: string;          // ISO, UTC
  customerName: string | null;
  status: DiaryStatus;
  createdAt: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES: readonly string[] = ['planned', 'done', 'invoiced'];
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
// Half a day is four working hours, a morning or an afternoon. It is a word on the form and in
// durationPhrase, so the two must agree on the number, and this constant is where they agree.
const HALF_DAY_HOURS = 4;
const NUMBER_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

export function isDiaryStatus(x: unknown): x is DiaryStatus {
  return typeof x === 'string' && STATUSES.includes(x);
}

// One raw database row becomes a typed job, or nothing. Never a guess: a list missing a broken
// row is a smaller lie than a slot on a screen with no start time. Same shape discipline as
// normaliseInvoiceRow in app/app/invoices/words.ts, for the same reason: the rows arrive untyped.
export function normaliseDiaryRow(raw: unknown): DiaryJob | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id : '';
  if (!UUID.test(id)) return null;
  const title = typeof r.title === 'string' ? r.title.trim() : '';
  if (!title) return null;
  const startsAt = isoOrNull(r.starts_at);
  const endsAt = isoOrNull(r.ends_at);
  if (!startsAt || !endsAt) return null;
  if (!isDiaryStatus(r.status)) return null;
  return {
    id,
    title,
    startsAt,
    endsAt,
    customerName: typeof r.customer_name === 'string' && r.customer_name.trim() ? r.customer_name.trim() : null,
    status: r.status,
    createdAt: typeof r.created_at === 'string' ? r.created_at : startsAt,
  };
}

function isoOrNull(x: unknown): string | null {
  if (typeof x !== 'string') return null;
  const t = Date.parse(x);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

// ── The three sections of the page, decided once ─────────────────────────────────────────────
//
// Upcoming first because that is what a diary is for. Then the finished jobs that have not been
// invoiced, because each of those is money he has earned and not yet asked for. The invoiced ones
// are history and go last. A job mid slot counts as upcoming: "underway" is not a fourth section,
// it is a job he is standing on.

export interface DiarySections {
  upcoming: DiaryJob[];   // planned, slot not yet over. Soonest first.
  awaiting: DiaryJob[];   // finished (marked done, or the slot has passed) and not invoiced. Freshest first.
  past: DiaryJob[];       // taken to invoicing. Most recent first.
}

// The slot is over the moment ends_at arrives. On the boundary it has passed: a job booked to end
// at 4pm has, at 4pm, ended.
export function slotHasPassed(job: DiaryJob, now: Date): boolean {
  return Date.parse(job.endsAt) <= now.getTime();
}

export function splitDiary(jobs: ReadonlyArray<DiaryJob>, now: Date): DiarySections {
  const upcoming: DiaryJob[] = [];
  const awaiting: DiaryJob[] = [];
  const past: DiaryJob[] = [];
  for (const job of jobs) {
    if (job.status === 'invoiced') past.push(job);
    else if (job.status === 'done' || slotHasPassed(job, now)) awaiting.push(job);
    else upcoming.push(job);
  }
  upcoming.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  awaiting.sort((a, b) => Date.parse(b.endsAt) - Date.parse(a.endsAt));
  past.sort((a, b) => Date.parse(b.endsAt) - Date.parse(a.endsAt));
  return { upcoming, awaiting, past };
}

// ── London time, read and written ────────────────────────────────────────────────────────────

const LONDON = 'Europe/London';

interface LondonParts { year: number; month: number; day: number; hour: number; minute: number; weekday: string; monthName: string }

function londonParts(at: Date): LondonParts {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: LONDON, year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', weekday: 'long', hour12: false,
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const monthNum = Number(get('month'));
  return {
    year: Number(get('year')),
    month: monthNum,
    day: Number(get('day')),
    // Intl gives "24" for midnight in some ICU builds with hour12 off. Midnight is 0.
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    weekday: get('weekday'),
    monthName: MONTHS[monthNum - 1] ?? '',
  };
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// London's offset from UTC at an instant, in milliseconds. Read from Intl rather than written
// down, so the BST switch dates are ICU's problem and never a constant here that goes stale.
function londonOffsetMs(at: Date): number {
  const name = new Intl.DateTimeFormat('en-GB', { timeZone: LONDON, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!m) return 0; // plain "GMT"
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3])) * 60_000;
}

// A day and a clock time as a man in Britain types them, turned into the UTC instant they mean.
// Null for anything that is not a real date and time: the form is refused plainly rather than a
// wrong slot being saved quietly. Two passes over the offset so a date either side of the BST
// switch resolves against the offset in force on THAT day, not on the server's day.
export function londonToUtcIso(day: string, clock: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(clock)) return null;
  const [y, mo, d] = day.split('-').map(Number);
  const [h, mi] = clock.split(':').map(Number);
  if (y < 2020 || y > 2100 || h > 23 || mi > 59) return null;
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  const probe = new Date(naive);
  // A made up date like the 31st of February rolls over in Date.UTC. Rolled over is not what he
  // typed, so it is refused rather than repaired.
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  const first = naive - londonOffsetMs(probe);
  const settled = naive - londonOffsetMs(new Date(first));
  return new Date(settled).toISOString();
}

// ── Plain words ──────────────────────────────────────────────────────────────────────────────
//
// "Tuesday at 8am", never "2026-08-04T07:00:00Z". He reads this with one hand on a rail, and a
// timestamp is a table cell he has to do arithmetic on.

function timeWords(hour: number, minute: number): string {
  if (hour === 0 && minute === 0) return 'midnight';
  if (hour === 12 && minute === 0) return 'midday';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? 'am' : 'pm';
  return minute === 0 ? `${h12}${suffix}` : `${h12}:${String(minute).padStart(2, '0')}${suffix}`;
}

// Whole London calendar days from now's day to the target's day. Zero is today, one is tomorrow,
// minus one is yesterday. Calendar days rather than 24 hour blocks, because "tomorrow" means the
// next day on the wall, not 24 hours and one minute away.
function calendarDaysApart(now: Date, then: Date): number {
  const a = londonParts(now);
  const b = londonParts(then);
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / DAY_MS);
}

// When a job starts, in the words a diary uses: "today at 2pm", "tomorrow at 8am", "Tuesday at
// 8am" inside the week, and "Tuesday 11 August at 8am" beyond it, where the day name alone would
// be ambiguous. A start already behind us gets the past form so nothing ever claims to be coming.
export function whenPhrase(iso: string, now: Date): string {
  const at = new Date(Date.parse(iso));
  const p = londonParts(at);
  const time = timeWords(p.hour, p.minute);
  const days = calendarDaysApart(now, at);
  if (days < 0) return `${pastDayPhrase(iso, now)} at ${time}`;
  if (days === 0) return `today at ${time}`;
  if (days === 1) return `tomorrow at ${time}`;
  if (days <= 6) return `${p.weekday} at ${time}`;
  return `${p.weekday} ${p.day} ${p.monthName} at ${time}`;
}

// A day already gone, as a word: "today", "yesterday", "on Friday" inside the week, and
// "on 18 July" beyond it.
export function pastDayPhrase(iso: string, now: Date): string {
  const at = new Date(Date.parse(iso));
  const p = londonParts(at);
  const days = calendarDaysApart(now, at);
  if (days >= 0) return days === 0 ? 'today' : `on ${p.day} ${p.monthName}`;
  if (days === -1) return 'yesterday';
  if (days >= -6) return `on ${p.weekday}`;
  return `on ${p.day} ${p.monthName}`;
}

// How long a job runs, in words: "one hour", "half a day", "one day", "a week". Derived from
// the two timestamps, which are the single copy of the truth about the slot. Under a day the
// words are hours, because until 31 July 2026 the form could only book whole days and this
// phrase rounded everything up to "one day": an hour's measuring up visit was described as a
// day of work, which is a small lie on the one screen that is supposed to be his own diary.
export function durationPhrase(startsAt: string, endsAt: string): string {
  const ms = Date.parse(endsAt) - Date.parse(startsAt);
  const hours = Math.max(1, Math.round(ms / HOUR_MS));
  if (hours < 24) {
    if (hours === HALF_DAY_HOURS) return 'half a day';
    if (hours === 1) return 'one hour';
    return `${hours <= 10 ? NUMBER_WORDS[hours - 1] : String(hours)} hours`;
  }
  const days = Math.max(1, Math.round(ms / DAY_MS));
  if (days === 7) return 'a week';
  if (days === 14) return 'two weeks';
  const word = days <= 10 ? NUMBER_WORDS[days - 1] : String(days);
  return days === 1 ? 'one day' : `${word} days`;
}

// A whole day count between 1 and 30, or null. This was the only shape the form could post
// before hours existed, and it is kept both as the day half of parseDurationHours and because a
// diary page opened before that deploy still posts it. A half typed or hostile value is
// refused, never rounded into a slot he did not book.
export function parseDurationDays(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 30) return null;
  return n;
}

// The duration as the form posts it, in HOURS. Two shapes and nothing else:
//   "2h"   an hour count, 1 to 23: the sub day slots (one hour, two hours, half a day as 4h)
//   "3"    a whole day count, 1 to 30, via parseDurationDays: the current day options, and the
//          only shape a page rendered before hours existed can post, so a man with yesterday's
//          tab open books the slot he chose rather than being refused for our deploy
// Everything else is refused, never rounded into a slot he did not book.
export function parseDurationHours(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const m = /^(\d{1,2})h$/.exec(raw);
  if (m) {
    const n = Number(m[1]);
    return n >= 1 && n < 24 ? n : null;
  }
  const days = parseDurationDays(raw);
  return days === null ? null : days * 24;
}

// ── The nudges, decided and handed back ──────────────────────────────────────────────────────
//
// ⚠️ DECIDED HERE, SENT NOWHERE, AND THE SHAPE IS THE CONTRACT. Each row is one thing worth
// saying to one man. If the reminders cron ever carries these, it takes this list to
// lib/routing.ts, which decides the channel, and the WhatsApp half stays behind its template
// gate. Nothing in this module or anywhere else calls a send.
//
// Two kinds, both from the founder's own sentence. 'job_soon': the slot starts inside the next
// 24 hours, which is the reminder. 'draft_invoice': the slot has passed inside the last 7 days
// and the job was never taken to an invoice, which is the question. The 7 day floor is the empty
// test applied to a message: a job he has ignored for a fortnight is a decision he has made, and
// nagging about it forever teaches him to stop reading us.
//
// ⚠️ THE TEXT NAMES NO FIGURES. The nudge asks whether to draft, it never guesses what the work
// was worth. Amounts are his to type, always.

export interface DiaryNudge {
  userId: string;
  kind: 'job_soon' | 'draft_invoice';
  text: string;
  // The row the nudge is about, so a future sender can refuse to say the same thing twice. Not
  // part of any message.
  jobId: string;
}

const NUDGE_WINDOW_MS = 24 * 60 * 60 * 1000;      // job_soon: starts within a day
const NUDGE_STALE_MS = 7 * DAY_MS;                // draft_invoice: only while the job is fresh

export function decideDiaryNudges(
  rows: ReadonlyArray<{ userId: string; job: DiaryJob }>,
  now: Date,
): DiaryNudge[] {
  const out: DiaryNudge[] = [];
  const t = now.getTime();
  for (const { userId, job } of rows) {
    if (!userId || job.status === 'invoiced') continue;
    const who = job.customerName ? ` for ${job.customerName}` : '';
    const starts = Date.parse(job.startsAt);
    const ends = Date.parse(job.endsAt);
    if (job.status === 'planned' && starts > t && starts - t <= NUDGE_WINDOW_MS) {
      out.push({
        userId,
        kind: 'job_soon',
        text: `${job.title}${who} is ${whenPhrase(job.startsAt, now)}. It is in your diary.`,
        jobId: job.id,
      });
    } else if (ends <= t && t - ends <= NUDGE_STALE_MS) {
      out.push({
        userId,
        kind: 'draft_invoice',
        text: `${job.title}${who} wrapped up ${pastDayPhrase(job.endsAt, now)}. If the job is done, the invoice is one press away in your diary, and sending it stays yours.`,
        jobId: job.id,
      });
    }
  }
  return out;
}

// ── The week strip, which is the whole of what a calendar earns on this screen ───────────────
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 SEVEN CELLS, AND DELIBERATELY NOT A MONTH GRID. Doc 103's once test, applied to a calendar.
//
// A month grid is 35 cells, of which 30 are empty for most tradesmen most of the time, and it
// answers "what is the shape of October". He does not open his books to ask that. He opens them
// on a Tuesday morning with one hand on a rail to ask what is on today and whether he has
// forgotten anything this week. Seven cells answer that question and cost him one line.
//
// ⚠️ IT STARTS TODAY, NOT ON MONDAY. A Monday to Sunday strip spends its first cells on days that
// have already happened, so on a Friday five sevenths of it is history he cannot act on. Starting
// today means every cell is a day he can still do something about, and the last one is a week out,
// which is as far ahead as a booking is worth showing on a summary.
//
// ⚠️ EMPTY IS SAID BY ABSENCE, NEVER BY A ZERO. A cell with no jobs carries no count at all. A
// row of "0"s is seven pieces of nothing he has to read and dismiss to find the one day that has
// something on it, which is the empty test failing on a calendar.
//
// PURE, and it takes `now` like everything else here, so the suite runs the same in January.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export interface DayCell {
  // The London calendar day, as YYYY-MM-DD. The key, and what a form posts back.
  day: string;
  // One letter for the strip, three for anything wider. Both come from the same weekday name so
  // they can never disagree about which day a cell is.
  letter: string;
  short: string;
  // The date in the month, which is what he actually reads off a calendar.
  date: number;
  isToday: boolean;
  // How many of his jobs start on this day. Zero is real and the strip renders nothing for it.
  count: number;
}

export const WEEK_CELLS = 7;

// The London calendar day of an instant, as YYYY-MM-DD. Private: every caller here wants a cell
// or a phrase, not a date string, and a second date formatter in this file is how the strip and
// the phrases end up disagreeing about which day midnight belongs to.
function londonDayISO(at: Date): string {
  const p = londonParts(at);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function weekStrip(jobs: ReadonlyArray<DiaryJob>, now: Date): DayCell[] {
  // Count first, so the seven lookups below are seven map reads rather than seven passes over
  // his whole diary. A man with 500 jobs in the table renders this strip in one pass.
  const counts = new Map<string, number>();
  for (const job of jobs) {
    const t = Date.parse(job.startsAt);
    if (!Number.isFinite(t)) continue;
    const day = londonDayISO(new Date(t));
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  const todayISO = londonDayISO(now);
  const cells: DayCell[] = [];
  for (let i = 0; i < WEEK_CELLS; i++) {
    // Midday rather than midnight, on purpose. Stepping a day at a time from an instant near a
    // clock change lands 23 or 25 hours later, and from midnight that can skip or repeat a
    // calendar day. From the middle of the day an hour either way is still the same day.
    const at = new Date(now.getTime() + i * DAY_MS);
    const p = londonParts(at);
    const day = londonDayISO(at);
    cells.push({
      day,
      letter: p.weekday.slice(0, 1),
      short: p.weekday.slice(0, 3),
      date: p.day,
      isToday: day === todayISO,
      count: counts.get(day) ?? 0,
    });
  }
  return cells;
}

// The jobs that start on one London day, in the order they start. What a cell opens onto, and
// what "today" on the hub is built from.
export function jobsOnDay(jobs: ReadonlyArray<DiaryJob>, day: string): DiaryJob[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
  return jobs
    .filter((j) => {
      const t = Date.parse(j.startsAt);
      return Number.isFinite(t) && londonDayISO(new Date(t)) === day;
    })
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

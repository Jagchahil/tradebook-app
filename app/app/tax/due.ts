// WHEN A QUARTERLY UPDATE IS DUE. One tiny derivation, kept out of the pages on purpose.
//
// HMRC's rule: an MTD quarterly update is due by the SEVENTH OF THE MONTH AFTER the quarter end.
// Quarter ends are 5 July, 5 October, 5 January and 5 April, so the due dates are 7 August,
// 7 November, 7 February and 7 May. lib/taxengine.ts pins the first one as a gradeable concept
// (mtd_first_quarter_deadline, 2026-08-07) and test/taxweb.test.mjs holds this function to it, so
// the date a page prints cannot drift from the date the exam bank grades.
//
// The quarter end itself comes from lib/quarterpack.ts, never retyped here: the calendar has one
// home, and this file only ever adds "the seventh of the following month" on top of it.
//
// Pure, no clock, no network, so the test runner can attack it under bare node.

import { quarterBounds } from '../../../lib/quarterpack';
import { concept } from '../../../lib/taxengine';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// 'first' for the update covering 6 April to 5 July, and so on. Copy says "the second update is
// due 7 November" rather than "Q2", because nobody up a ladder calls it Q2.
export const UPDATE_ORDINAL: Record<1 | 2 | 3 | 4, string> = {
  1: 'first', 2: 'second', 3: 'third', 4: 'fourth',
};

// The due date for one quarter's update, as a person writes it: "7 November 2026".
export function updateDue(startYear: number, quarter: 1 | 2 | 3 | 4): string {
  const end = quarterBounds(startYear, quarter).end; // YYYY-MM-DD, from the one calendar
  const [y, m] = end.split('-').map(Number);
  // Quarter ends fall in July, October, January and April, so the month after never wraps a year.
  // The branch is kept anyway: a guard that relies on the calendar never changing is not a guard.
  const dueMonth = m === 12 ? 1 : m + 1;
  const dueYear = m === 12 ? y + 1 : y;
  return `7 ${MONTHS[dueMonth - 1]} ${dueYear}`;
}

// The same date as an ISO day, for the parity check against lib/taxengine.ts's concept.
export function updateDueISO(startYear: number, quarter: 1 | 2 | 3 | 4): string {
  const end = quarterBounds(startYear, quarter).end;
  const [y, m] = end.split('-').map(Number);
  const dueMonth = m === 12 ? 1 : m + 1;
  const dueYear = m === 12 ? y + 1 : y;
  return `${dueYear}-${String(dueMonth).padStart(2, '0')}-07`;
}

// The quarter before this one, which for quarter 1 belongs to the previous tax year.
function previousQuarter(startYear: number, quarter: 1 | 2 | 3 | 4): { startYear: number; quarter: 1 | 2 | 3 | 4 } {
  return quarter === 1 ? { startYear: startYear - 1, quarter: 4 } : { startYear, quarter: (quarter - 1) as 1 | 2 | 3 | 4 };
}

// The shape of an update that has closed but is not yet due.
export interface OutstandingUpdate {
  startYear: number;
  quarter: 1 | 2 | 3 | 4;
  ordinal: string;
  end: string;    // the quarter end, YYYY-MM-DD
  due: string;    // "7 August 2026"
  dueISO: string; // "2026-08-07"
}

// ══════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE UPDATE THAT IS STILL OPEN IS NOT THE QUARTER HE IS STANDING IN.
//
// quarterForDate() answers "which quarter is today inside", and app/app/tax/summary/page.tsx used
// that alone to name a deadline. But an update is due on the SEVENTH OF THE MONTH AFTER its quarter
// closes, so for the first four to five weeks of every quarter the PREVIOUS quarter's update is
// still open while the page has already moved on to the next one.
//
// On 3 August 2026 the page read "The second update of 2026/27 ... is due by 7 November 2026".
// HMRC's own first quarterly update, 6 April to 5 July, was due 7 August 2026. Four days away, and
// nowhere on the screen. It is not a one off: the same gap opens 6 Oct to 7 Nov, 6 Jan to 7 Feb and
// 6 Apr to 7 May. A third of the year, answering "when is the next one due" with the wrong date.
//
// ⚠️ null OUTSIDE THAT WINDOW, so the card carries the line only while it is true. Doc 103's empty
// test: a row that is usually nothing teaches him to stop reading the rows.
//
// ⚠️ AND IT NEVER NAMES A QUARTER BEFORE THE FIRST ONE. Making Tax Digital for Income Tax opens
// with 6 April to 5 July 2026. Without the floor, a man opening this in April 2026 would have been
// pointed at 6 January to 5 April 2026 and told an update was open that nobody ever had to make.
// The floor is lib/taxengine.ts's own graded concept, never a second copy of the date, and an
// unreadable concept returns null rather than a guess.
// ══════════════════════════════════════════════════════════════════════════════════════
//
// todayIso is a YYYY-MM-DD day. ISO day strings compare correctly with < and >, which is how every
// other bounds check in this codebase is written.
export function outstandingUpdate(
  todayIso: string,
  startYear: number,
  quarter: 1 | 2 | 3 | 4,
): OutstandingUpdate | null {
  const prev = previousQuarter(startYear, quarter);
  const dueISO = updateDueISO(prev.startYear, prev.quarter);

  // No first deadline to floor against is not a licence to guess one.
  const first = concept('mtd_first_quarter_deadline');
  if (typeof first !== 'string') return null;

  // Before Making Tax Digital opened there was no update, so there is nothing to be open.
  if (dueISO < first) return null;

  // Past its own due date it is history, and history is not a nudge.
  if (todayIso > dueISO) return null;

  return {
    startYear: prev.startYear,
    quarter: prev.quarter,
    ordinal: UPDATE_ORDINAL[prev.quarter],
    end: quarterBounds(prev.startYear, prev.quarter).end,
    due: updateDue(prev.startYear, prev.quarter),
    dueISO,
  };
}

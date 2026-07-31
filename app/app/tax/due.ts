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

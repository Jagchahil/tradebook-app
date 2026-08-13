// THE QUARTERLY UPDATES A MANDATED CUSTOMER OWES, INCLUDING THE ONE HE HAS ALREADY MISSED.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 NOBODY TOLD HER THE FIRST ONE WAS LATE. RUN 2, 12 August 2026.
//
// Rosa is the first genuinely mandated customer this product has walked: HMRC wrote to her in
// March 2026, she is in from 6 April 2026, and she told us so at setup (letter yes, sent no). Her
// first quarterly update covered 6 April to 5 July and was due on 7 AUGUST. The walk happened on
// 12 August, five days after.
//
// Three surfaces spoke about MTD that evening. Not one mentioned it.
//
//   /app/tax/summary  skipped to "The second update of 2026/27 ... due by 7 November 2026" and
//                     said "the deadline is a date, not a job".
//   WhatsApp          listed "due by 7 August, 7 November, 7 February and 7 May" on 12 August,
//                     to the woman whose 7 August had passed, and added "there are no penalties
//                     if you miss a 2026/27 update" with no mention that updates gate the return.
//   the web thread    did the same AND invented the periods themselves ("1 May to 7 August,
//                     8 August to 7 November"), which are the due dates walked backwards, not the
//                     quarters, and pointed a mandated 2026/27 customer at the 31 January 2027
//                     return, which is the previous year's bill.
//
// Soothing copy laid over a missed statutory deadline is the RUN 1 error inverted: there the
// product was vague where it should have been precise about a bill, here it is serene where it
// should be plain about a date that has gone.
//
// ⚠️ THE EASEMENT IS REAL AND IT IS NOT AN ALL CLEAR. HMRC has confirmed no late submission
// penalty points for quarterly updates in 2026/27. Every update still has to be in before the
// return for the year can be filed, so a missed quarter is not free, it is deferred. Both halves
// go out together, always, and this file is where that pairing is enforced.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ PURE AND IMPORT FREE, so the node runner drives it directly and so no surface can grow a
// second opinion about which quarter is which. lib/quarterpack.ts already owns the PERIOD dates
// (6 Apr to 5 Jul and so on) and is correct; it does not own the DUE dates, and the due date is
// the half every chat answer got wrong. The two are checked against each other in the suite.

export type UpdateState =
  // Its period has not finished yet, so it cannot be sent.
  | 'not_yet'
  // Period closed, due date still ahead. This is the one a good product nudges.
  | 'open'
  // Due date passed and we have no record of it going. The one nobody mentioned.
  | 'overdue';

export interface QuarterlyUpdate {
  index: 1 | 2 | 3 | 4;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;
  dueBy: string;
  state: UpdateState;
  // How the customer would say it: "6 April to 5 July".
  periodLabel: string;
  dueLabel: string;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function pretty(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// ⚠️ PERIODS AND DUE DATES TOGETHER, IN ONE TABLE, BECAUSE SPLITTING THEM IS THE BUG.
// Standard quarterly periods for a tax year beginning 6 April `startYear`. GOV.UK, "Use Making Tax
// Digital for Income Tax": quarters end 5 Jul, 5 Oct, 5 Jan, 5 Apr and each update is due one month
// and two days after the period ends, which lands on the 7th.
export function updateSchedule(startYear: number, nowISO: string): QuarterlyUpdate[] {
  const rows: Array<{ index: 1 | 2 | 3 | 4; start: string; end: string; due: string }> = [
    { index: 1, start: iso(startYear, 4, 6), end: iso(startYear, 7, 5), due: iso(startYear, 8, 7) },
    { index: 2, start: iso(startYear, 7, 6), end: iso(startYear, 10, 5), due: iso(startYear, 11, 7) },
    { index: 3, start: iso(startYear, 10, 6), end: iso(startYear + 1, 1, 5), due: iso(startYear + 1, 2, 7) },
    { index: 4, start: iso(startYear + 1, 1, 6), end: iso(startYear + 1, 4, 5), due: iso(startYear + 1, 5, 7) },
  ];

  const today = String(nowISO).slice(0, 10);

  return rows.map((r) => {
    let state: UpdateState;
    if (today <= r.end) state = 'not_yet';
    else if (today <= r.due) state = 'open';
    else state = 'overdue';
    return {
      index: r.index,
      periodStart: r.start,
      periodEnd: r.end,
      dueBy: r.due,
      state,
      periodLabel: `${pretty(r.start)} to ${pretty(r.end)}`,
      dueLabel: pretty(r.due),
    };
  });
}

/**
 * The updates whose due date has gone. Empty for everyone in good standing, which is most people
 * most of the time, so a surface can draw nothing at all without a special case.
 *
 * ⚠️ WE DO NOT KNOW WHETHER HE SENT IT, AND WE MUST NOT PRETEND TO. Lekhio cannot file yet, so we
 * have no record either way, and a customer may well have sent it through other software or an
 * agent. That is why the copy says "I have no record of this going" rather than "you have not sent
 * it". The sentence has to be true for the man who already did it.
 */
export function overdueUpdates(startYear: number, nowISO: string): QuarterlyUpdate[] {
  return updateSchedule(startYear, nowISO).filter((u) => u.state === 'overdue');
}

export function nextUpdate(startYear: number, nowISO: string): QuarterlyUpdate | null {
  const all = updateSchedule(startYear, nowISO);
  return all.find((u) => u.state === 'open') ?? all.find((u) => u.state === 'not_yet') ?? null;
}

// The easement, and the string that must never travel without it. HMRC has confirmed no late
// submission penalty points for quarterly updates in 2026/27; the return gate is unchanged.
export const EASEMENT_WITH_GATE =
  'There are no penalty points for a late quarterly update in 2026/27. That is not the same as it '
  + 'not mattering: every update for the year has to be in before the return for that year can be '
  + 'filed, so a missed one is put off rather than written off.';

// What Lekhio can honestly offer today. The filing pipeline is built and waits on HMRC production
// access, so the one thing we must not do is imply she can send it from here.
// ⚠️ NO ENDORSEMENT WORDS, AND THE GUARD IN test/taxweb.test.mjs IS WHY. The first draft said
// "HMRC recognised software", which is the correct industry term for the published list and is
// true of the OTHER software she would use. The guard cannot tell that apart from us claiming
// HMRC has recognised US, and a rule that fires on a technically honest sentence is a rule
// somebody switches off. The sentence below says the same thing and claims nothing.
export const CANNOT_SEND_YET =
  'Lekhio cannot send an update to HMRC yet: the pipeline is built and waiting on access. So this '
  + 'one has to go through other software that can file them, or whoever does your return, and the '
  + 'figures are ready here for either.';

/**
 * The whole sentence for a customer with something overdue, prose form, for the chat doors.
 * One owner, so WhatsApp and the thread cannot drift apart again.
 */
export function overdueSentence(list: QuarterlyUpdate[]): string {
  if (list.length === 0) return '';
  const first = list[0];
  const head = list.length === 1
    ? `Your update for ${first.periodLabel} was due on ${first.dueLabel} and I have no record of it going.`
    : `${list.length} of your updates are past their due date, the earliest being ${first.periodLabel}, `
      + `which was due on ${first.dueLabel}. I have no record of any of them going.`;
  return `${head} ${EASEMENT_WITH_GATE} ${CANNOT_SEND_YET}`;
}

// lib/elections.ts. THE ALLOWANCE ELECTION. Real money nobody was getting.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT WAS BROKEN, AND FOR HOW LONG.
//
// lib/taxoptimiser.ts rule 4 has been telling every customer to "claim use of home" and emitting
// action 'apply_allowance_election'. NOTHING IMPLEMENTED IT. There was no way for a man to say yes.
// So `homeOfficeClaimed` was false forever, the suggestion fired forever, /api/ledger passed
// `homeOffice: 0` with a comment admitting the gap, and not one customer ever claimed a penny of it.
//
// Unlike most gaps in a young product this one is not cosmetic. It is between £120 and £312 a year
// of deduction, for a tradesman who does his quotes at the kitchen table, which is all of them.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ WHY THIS IS NOT AN EXPENSE, AND WHY THERE IS NO 'HOME' CATEGORY.
//
// lib/categories.ts refuses to create one on purpose, and its comment says why: a rule on the word
// "rent" or on a household energy bill would sweep up a man's OWN HOUSE and claim tax relief on it.
// That is not aggressive bookkeeping, it is the thing Finance Act 2026 Sch 22 makes sanctionable.
//
// So use of home is an ELECTION, not a transaction. He does not send us a receipt, he tells us how
// many hours a month he works from home, and HMRC's simplified expenses flat rate follows from that.
// Nothing is scanned, nothing is categorised, and his actual gas bill never comes near the books.
//
// 🔴 AND THAT IS WHY THE MILEAGE PATTERN DOES NOT APPLY HERE, WHICH IS THE EASIEST MISTAKE TO MAKE.
//
// Mileage had to be MOVED onto its own ledger line rather than ADDED, because a mileage claim was
// already sitting inside `expenses` as an ordinary transaction, and adding it would have counted it
// twice and overstated what Lekhio saved him. See app/api/ledger/route.ts, which spells this out.
//
// The flat rate is the opposite case. It is NOT inside expenses, because there is no category that
// could put it there. So it is genuinely additive, and subtracting it from expenses the way mileage
// is subtracted would UNDERSTATE his deductions by the same amount. The invariant is different
// because the fact is different. test/elections.test.mjs pins both directions.
//
// The one way double counting could still happen is a man who claims the flat rate AND logs a share
// of his actual household bills as a business cost. HMRC allows one or the other, never both. We
// cannot see inside "other", so we do the only honest thing available: the election is flat rate
// only, and every place we describe it says plainly that it replaces claiming actual home bills.
//
// PURE. No I/O, no clock of its own. Every rate comes from lib/taxengine.ts, which is watched
// nightly by khoji/diff.mjs against GOV.UK. Not one number is written down in this file.

import { homeOfficeFlatRateMonthly, FACTS } from './taxengine';
import { gbp0 } from './money';

// The only election this file knows about today. A named union rather than a free string, so a
// caller cannot invent one and quietly get a zero back.
export type ElectionKey = 'use_of_home';

// HMRC's simplified expenses bands, by hours worked at home per month. The BOUNDARIES are the
// claim: 25 to 50, 51 to 100, 101 or more. The MONEY is not here, it comes from
// homeOfficeFlatRateMonthly() in lib/taxengine.ts, which reads FACTS and is live overridable and
// watched. If HMRC moves the rate, this file needs no edit at all.
export const HOURS_BANDS = [25, 51, 101] as const;
export type HoursBand = (typeof HOURS_BANDS)[number];

export function isHoursBand(n: unknown): n is HoursBand {
  return typeof n === 'number' && (HOURS_BANDS as readonly number[]).includes(n);
}

// The band a stated number of hours falls into, or null when it is under the threshold to claim
// anything at all. Null is not an error and it is not zero hours: it is "you work from home, but
// under 25 hours a month, and HMRC's flat rate does not start until 25". Saying that plainly is
// better than handing him £0 and letting him think we lost it.
export function bandForHours(hoursPerMonth: number): HoursBand | null {
  if (!Number.isFinite(hoursPerMonth) || hoursPerMonth < HOURS_BANDS[0]) return null;
  if (hoursPerMonth >= HOURS_BANDS[2]) return HOURS_BANDS[2];
  if (hoursPerMonth >= HOURS_BANDS[1]) return HOURS_BANDS[1];
  return HOURS_BANDS[0];
}

// Plain English for a band, for the confirmation he reads back.
export function bandLabel(band: HoursBand): string {
  if (band === 101) return '101 hours a month or more';
  if (band === 51) return '51 to 100 hours a month';
  return '25 to 50 hours a month';
}

export interface Election {
  key: ElectionKey;
  // The tax year this election belongs to, as its START year. An election is a choice about ONE
  // year: a man who worked from home all of last year may be on a site all of this one, and rolling
  // it forward silently would be us claiming something on his behalf that he never said.
  startYear: number;
  hoursBand: HoursBand;
  electedAt: string;
}

// THE £ HE HAS ACTUALLY EARNED THE RIGHT TO, YEAR TO DATE.
//
// ⚠️ REALISED, NOT PROJECTED, and this is the rule the whole ledger rests on (lib/ledger.ts rule 1).
// The flat rate is a monthly amount, so the amount he has actually accrued is the monthly rate times
// the months of the tax year that have actually happened. Handing the ledger a full twelve months in
// April would be a projection wearing a realised figure's clothes, and the ledger has exactly one
// job: to be believable.
//
// monthsElapsed is the same figure lib/ledger.ts and lib/taxoptimiser.ts already use. Capped at 12,
// floored at 0, so a bad clock cannot invent a thirteenth month.
export function useOfHomeToDate(band: HoursBand, monthsElapsed: number): number {
  const monthly = homeOfficeFlatRateMonthly(band);
  if (!(monthly > 0)) return 0;
  const months = Math.max(0, Math.min(12, Math.floor(Number.isFinite(monthsElapsed) ? monthsElapsed : 0)));
  return Math.round(monthly * months * 100) / 100;
}

// The full year, for the optimiser's "here is what it would be worth" rather than the ledger's
// "here is what you have". Kept separate from the function above ON PURPOSE: the two numbers mean
// different things and the difference is exactly the projected/realised line this codebase keeps
// getting bitten by. A caller has to choose which one it wants, by name.
export function useOfHomeFullYear(band: HoursBand): number {
  return Math.round(homeOfficeFlatRateMonthly(band) * 12 * 100) / 100;
}

// What we say back the moment he elects. Doc 103: the best button is no button, do the thing and
// tell him plainly what you did. So this is a statement of what has been applied, not a question,
// and it names the one thing he has to know: this replaces claiming his actual household bills.
//
// House style: no em dash, no en dash, no hyphen used as a sentence dash.
export function electionConfirmation(band: HoursBand, monthsElapsed: number): string {
  const monthly = homeOfficeFlatRateMonthly(band);
  const toDate = useOfHomeToDate(band, monthsElapsed);
  const money = gbp0;
  return [
    `Done. You are claiming use of home at ${money(monthly)} a month, HMRC's flat rate for ${bandLabel(band)}.`,
    toDate > 0
      ? `That is ${money(toDate)} off your profit so far this year, and it keeps building every month.`
      : 'It starts building from this month.',
    'No receipts to keep. This replaces claiming a share of your actual home bills, you cannot have both.',
  ].join(' ');
}

// The rates we are quoting, for anywhere that wants to show the choice. Read from FACTS at call
// time, never captured at module load, so a live override or a Khoji approved change is picked up
// without a deploy. Same discipline as lib/weeklyupdate.ts.
export function bandOptions(): Array<{ band: HoursBand; label: string; monthly: number }> {
  return HOURS_BANDS.map((band) => ({
    band,
    label: bandLabel(band),
    monthly: homeOfficeFlatRateMonthly(band),
  }));
}

// A sanity check with a source behind it: the three rates must be the three FACTS constants, in
// ascending order. If a future edit crosses two of them over, a man in the top band would quietly
// claim less than a man in the bottom one, and no test that only checked "returns a number" would
// notice. Exported so the suite can assert it rather than reimplement it.
export function ratesAreOrdered(): boolean {
  return (
    FACTS.homeFlatRate25to50 > 0 &&
    FACTS.homeFlatRate51to100 > FACTS.homeFlatRate25to50 &&
    FACTS.homeFlatRate101plus > FACTS.homeFlatRate51to100
  );
}

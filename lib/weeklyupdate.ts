// lib/weeklyupdate.ts. THE PERSONAL LINE in the Sunday evening WhatsApp update.
//
// The weekly update is a plain money summary (income, expenses, tax set aside) built elsewhere.
// This file adds at most ONE sentence to it: the single thing about THIS person's situation that
// is worth a tradesman's attention on a Sunday evening, and nothing else.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE RULE THIS FILE EXISTS TO OBEY: EVERY NUMBER AND EVERY DATE COMES FROM SOMEWHERE ELSE.
//
// Not one threshold, rate or deadline is written down in this file. Every branch below reuses a
// constant or a function that already exists, already has a source, and is already watched or
// tested. The comment above each branch names the exact one. If you cannot name it, the branch
// does not get written, and the man gets QUIET_LINE instead.
//
// This is not pedantry. badrLifetimeLimit sat in FACTS as a number we published to the world,
// could not source and did not use, and it was deleted on 14 July 2026 for exactly that. An
// invented deadline is worse than no deadline: it looks authoritative and it is wrong, and he
// plans his week around it.
//
// WHAT IS DELIBERATELY MISSING, and why, is recorded at the bottom of this file under
// "THE BRANCHES WE DID NOT BUILD". Read it before adding one.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴 SPECIAL CATEGORY DATA CANNOT REACH THIS FILE, BY CONSTRUCTION.
//
// This text goes out over WhatsApp. Per lib/circumstances.ts, a special-category circumstance
// (there is one on the list today and there will be more) may never appear in a WhatsApp message
// in either direction, because the QUESTION ALONE is a disclosure to whoever is holding his
// phone. So WeeklyUpdateInput carries no circumstances, no answers and no keys: it is
// money, dates and two booleans. There is nothing here to filter, because there is nothing here
// to leak. Do not add a circumstances field to the input. If a future line needs one, it needs a
// different channel, not a filter.
//
// Information only, never advice. "Your turnover is above X" is a fact about his own numbers.
// "You should register for VAT" is not ours to say. Every line below states what is true and
// stops. Lekhio prepares, the man approves.
//
// PURE. No supabase, no fetch, no I/O, no clock of its own. `now` is passed in, so a Sunday
// evening cron and a unit test see the same week.

import { FACTS, vatRegistrationRequired, mtdForIncomeTaxRequired, concept } from './taxengine';
import { quarterBounds, quarterForDate } from './quarterpack';

// The honest nothing. Sent when no verified fact applies to him this week.
//
// It is not a sales pitch and it is not blank. A weekly update that goes quiet in a quiet week
// teaches him the update is worth reading, which is the only reason he opens the next one.
export const QUIET_LINE = 'All logged. Nothing new needs your attention this week.';

// Whole pounds, en-GB grouping. Copied in shape from lib/agent.ts line 216
// (`const gbp = (n: number) => ...`), so the weekly line reads identically to every nudge and
// card the product already sends. Pence on a Sunday evening is noise.
export function gbp(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `£${Math.round(v).toLocaleString('en-GB')}`;
}

export interface WeeklyUpdateInput {
  // The Sunday the update is being built for. Passed in, never read from the system clock.
  now: Date;

  // Taxable turnover for VAT over the ROLLING 12 MONTHS, in pounds. The caller excludes
  // residential rent before passing it, because residential rent is exempt and does not count
  // towards the registration test. lib/agent.ts does the same subtraction at its VAT signal
  // (`d.rolling12Income - (input.property?.rents12 ?? 0)`). Null when we cannot compute it, for
  // example a brand new user with under 12 months of history, and the VAT branch then stays shut.
  rolling12mTaxableTurnover: number | null;

  // Already VAT registered? Then the registration threshold is not news, it is history.
  vatRegistered: boolean;

  // GROSS qualifying income for Making Tax Digital for Income Tax, tax year to date: trade gross
  // plus property gross, before expenses. This is the combined test, the same base
  // lib/quarterpack.ts calls `grossQualifyingIncome`. Null when unknown, and the MTD branch stays
  // shut rather than guessing.
  ytdGrossQualifyingIncome: number | null;
}

const DAY_MS = 86400000;

function isoOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// Whole UK days between two ISO dates, on the UTC calendar. ISO in, integer out, no timezone
// surprises on a British Summer Time Sunday.
function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY_MS);
}

// "2026-08-07" to "7 August 2026". Presentation only. Same call and options as the date in
// lib/waintents.ts deadlineAnswer(), so a deadline reads the same wherever he meets it.
function prettyDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// The three tiers lib/agent.ts already uses for its `vat_approach` signal: 80% of the threshold is
// where it starts being worth knowing, 90% is where it starts being close, and over is over. Held
// here as a named constant rather than a magic 0.8 so that the two files can be compared by eye.
const VAT_NOTICE_FRACTION = 0.8;

// How close the quarter end has to be before it is worth a line. lib/agent.ts signal 11
// (`quarter_unconfirmed`) uses ten days for the same judgement, so we use ten days too. Sunday to
// Sunday is seven, so this fires once or twice per quarter and then goes quiet.
const QUARTER_NOTICE_DAYS = 10;

// How long before the first MTD quarterly update deadline it is worth mentioning. Three weeks is
// long enough to matter on a Sunday and short enough that it does not repeat all summer.
const DEADLINE_NOTICE_DAYS = 21;

// ONE sentence, or nothing at all.
//
// Returns null when no verified fact applies. The caller sends QUIET_LINE in that case, and
// weeklyLine() below does it for you. Null rather than a cheerful filler is deliberate: a caller
// that wants to say nothing at all in some other context must be able to.
export function personalLine(input: WeeklyUpdateInput): string | null {
  const now = input.now instanceof Date && Number.isFinite(input.now.getTime()) ? input.now : null;
  if (!now) return null;
  const todayIso = isoOf(now);

  // ── Branch 1 and 3: the VAT registration threshold ───────────────────────────────────────
  //
  // REUSES: FACTS.vatRegistrationThreshold (lib/taxengine.ts, in the FACTS object) for the number,
  // and vatRegistrationRequired() (lib/taxengine.ts) for the crossed test, so the strict "over,
  // not at" comparison is made in exactly one place in the codebase.
  //
  // The threshold is live-overridable through lib/facts.ts and is watched against
  // https://www.gov.uk/register-for-vat by khoji/diff.mjs (fact: 'vatRegistrationThreshold'), so
  // it is read at call time, never captured at module load.
  //
  // Tiering copied from the `vat_approach` signal in lib/agent.ts, which already tells him the
  // same thing in the app. Silent for a man who is already registered: for him this threshold is
  // not news, and a line that is noise most weeks trains him to stop reading the update.
  const turnover = input.rolling12mTaxableTurnover;
  const haveTurnover = typeof turnover === 'number' && Number.isFinite(turnover) && turnover >= 0;

  if (haveTurnover && !input.vatRegistered) {
    const threshold = FACTS.vatRegistrationThreshold;

    // Branch 1. Over the line. The most useful thing we could possibly say to him this week.
    if (vatRegistrationRequired(turnover as number)) {
      return (
        `Your taxable turnover over the last 12 months is ${gbp(turnover as number)}, ` +
        `which is above the ${gbp(threshold)} VAT registration threshold.`
      );
    }

    // Branch 3. Getting close, and he cannot see it coming from a bank balance.
    const fraction = (turnover as number) / threshold;
    if (fraction >= VAT_NOTICE_FRACTION) {
      return (
        `Your taxable turnover over the last 12 months is ${gbp(turnover as number)}, ` +
        `which is ${Math.floor(fraction * 100)}% of the ${gbp(threshold)} VAT registration threshold.`
      );
    }
  }

  // ── Branch 2: the FIRST Making Tax Digital quarterly update deadline ─────────────────────
  //
  // REUSES: concept('mtd_first_quarter_deadline') from lib/taxengine.ts, which holds '2026-08-07',
  // and mtdForIncomeTaxRequired() from lib/taxengine.ts for whether quarterly updates apply to
  // him at all, and quarterBounds() from lib/quarterpack.ts for the period the update covers.
  //
  // ⚠️ THIS BRANCH IS DELIBERATELY LIMITED TO ONE DEADLINE, AND THAT IS THE HONEST ANSWER.
  //
  // '2026-08-07' is the only quarterly update deadline this codebase holds as a constant. The
  // other three dates in the cycle exist only inside lib/waintents.ts deadlineAnswer(), which
  // computes them for a reply and does not export them, so there is nothing to cite for quarters
  // 2, 3 and 4. Rather than derive a rule ("the 7th of the second month after quarter end") from
  // one data point and print it as fact, this branch simply does not fire for them. A quiet week
  // is cheap. A confidently wrong date is not.
  //
  // Gated on mandation, because a man under the threshold has no quarterly update to make and a
  // deadline that is not his is just anxiety.
  const gross = input.ytdGrossQualifyingIncome;
  const haveGross = typeof gross === 'number' && Number.isFinite(gross) && gross >= 0;
  const firstDeadline = concept('mtd_first_quarter_deadline');

  if (haveGross && typeof firstDeadline === 'string') {
    const q1 = quarterBounds(2026, 1); // the period 2026-08-07 is the deadline for
    const daysToDeadline = daysBetween(todayIso, firstDeadline);
    const inWindow = daysToDeadline >= 0 && daysToDeadline <= DEADLINE_NOTICE_DAYS;

    // The 2026 threshold, because the deadline we hold belongs to the 2026/27 first quarter.
    if (inWindow && mtdForIncomeTaxRequired(gross as number, 2026)) {
      return (
        `Your first Making Tax Digital quarterly update covers ${q1.label.replace('Quarter 1, ', '')} ` +
        `and is due by ${prettyDate(firstDeadline)}.`
      );
    }
  }

  // ── Branch 4: the current quarter is about to close ──────────────────────────────────────
  //
  // REUSES: quarterForDate() and quarterBounds() from lib/quarterpack.ts, the tested MTD quarter
  // boundaries (6 Apr to 5 Jul, 6 Jul to 5 Oct, 6 Oct to 5 Jan, 6 Jan to 5 Apr). The window is the
  // ten days lib/agent.ts uses for its own quarter signal.
  //
  // Note what this says and what it does not. It states the quarter END, which is a boundary this
  // codebase computes and tests. It says nothing about when an update is DUE, because outside the
  // first quarter we have no sourced date for that. See branch 2.
  const here = quarterForDate(now);
  const bounds = quarterBounds(here.startYear, here.index);
  const daysToQuarterEnd = daysBetween(todayIso, bounds.end);
  if (daysToQuarterEnd >= 0 && daysToQuarterEnd <= QUARTER_NOTICE_DAYS) {
    const period = bounds.label.replace(`Quarter ${bounds.index}, `, '');
    return daysToQuarterEnd === 0
      ? `Your current tax quarter, ${period}, ends today.`
      : `Your current tax quarter, ${period}, ends in ${daysToQuarterEnd} ${daysToQuarterEnd === 1 ? 'day' : 'days'}.`;
  }

  // Nothing verified applies to him this week. Say so honestly, upstairs.
  return null;
}

// The line the weekly update actually prints. Never empty, never a pitch.
export function weeklyLine(input: WeeklyUpdateInput): string {
  return personalLine(input) ?? QUIET_LINE;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE BRANCHES WE DID NOT BUILD, AND WHAT WAS MISSING
//
// 1. QUARTERLY UPDATE DEADLINES FOR QUARTERS 2, 3 AND 4. Missing: an exported, sourced constant.
//    lib/waintents.ts deadlineAnswer() computes 7 Feb, 7 May, 7 Aug and 7 Nov inline for a chat
//    reply and exports none of them, and lib/taxengine.ts holds only the first. Not invented here.
//
// 2. THE SELF ASSESSMENT PAYMENT DATES. lib/taxengine.ts paymentsOnAccount() does return
//    "31 January" and "31 July" strings, but only as part of a payments-on-account calculation
//    that needs his actual Self Assessment bill, which the weekly update does not have. Feeding it
//    a running estimate would print a payment date attached to a number that is not his bill.
//
// 3. THE VAT 30 DAY REGISTRATION WINDOW. lib/agent.ts states it in prose ("30 days from the end of
//    the month you crossed in"). Missing: any constant anywhere for the 30, and any sourced rule
//    for which month end it runs from. Branch 1 therefore reports the turnover fact and stops.
//
// 4. ANYTHING FROM A CIRCUMSTANCE. See the special-category note at the top of this file. Some are
//    safe and some are health data, and the safe ones are not worth building a channel that could
//    ever carry the others.
// ═══════════════════════════════════════════════════════════════════════════════════════════

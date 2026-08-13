// WHERE HE STANDS AGAINST THE VAT LINE, FROM HIS OWN BOOKS, ON EVERY SURFACE.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THREE DOORS ANSWERED THE SAME QUESTION THREE DIFFERENT WRONG WAYS. RUN 2, 12 August 2026.
//
// A florist near the line asked, in the words a frightened shopkeeper actually uses: "should i be
// registered for vat? im scared im getting close." She asked it on all three doors.
//
//   /app/tax/vat   abstained: "We cannot show you where you stand against it yet. Your account is
//                  under three months old." Her books held 12 months of confirmed rows.
//   WhatsApp       classified it as unparseable money noise and replied "Tell me what you spent or
//                  got paid and how much, for example spent £40 on diesel". Pushed twice, it
//                  answered with her TAX YEAR takings (£37,242.53), which is the wrong window and
//                  had her exempt rent inside it.
//   the web thread INVENTED a run rate: "about £12,000 to £13,000 over the last month, so you're
//                  running at roughly £144,000 to £156,000 a year", then told her in the same
//                  breath she need not register until £90,000. A seasonal florist, annualised off
//                  one August, quoted a figure 160% of the threshold and reassured about it.
//
// The true number was sitting in her confirmed rows the whole time.
//
// 🔴 AND THE ACCOUNT AGE GATE WAS ALREADY KNOWN TO BE THE WRONG PREDICATE. getOptimiserInput in
// lib/supabase.ts carries the argument in full ("THE FIX IS THE EARLIEST ROW HE HAS GIVEN US, NOT
// users.created_at") and names this very screen as the one still doing it: "Two definitions of
// enough history, one screen apart." That comment was written on 9 August. This file is the other
// half of it landing.
//
// ⚠️ SO THE ANSWER IS ONE FUNCTION AND EVERY DOOR CALLS IT. Not because duplication is untidy, but
// because this product has now shipped three different answers to one statutory question, and the
// only structural cure is that there is one place to be right.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ PURE, AND IMPORT FREE ON PURPOSE. The threshold constant lives in lib/vat.ts with the rest of
// the VAT facts, and lib/vat.ts imports nothing either, so the node test runner can drive both
// without a bundler. The caller passes the threshold in rather than this file reaching for it,
// which keeps one owner for the number and no import cycle.

// A confirmed row, in the shape every reader of the money log already has.
export interface TurnoverRow {
  amount: number | string;
  transaction_date?: string | null;
  // 'property' means rent. Anything else is trade. Rent is EXEMPT and must never reach this sum.
  income_type?: string | null;
}

export const ROLLING_WINDOW_DAYS = 365;

// Inside this distance the question stops being academic and the caveats start mattering.
// £10,000 is about six weeks of takings for a business at the line, which is the horizon over
// which a customer can still act calmly rather than retrospectively.
export const NEAR_LINE_DISTANCE = 10000;

export type VatStanding =
  // He is registered. The threshold question is behind him and a distance would only confuse.
  | { kind: 'registered' }
  // Nothing confirmed at all. Not "he earned nothing": we have not been given anything to read.
  | { kind: 'nothing' }
  // ⚠️ A FLOOR, NOT A TOTAL, AND THE WORD MATTERS. His rows span less than twelve months, so the
  // sum of them is the least his rolling twelve months can be, never the most. That is still an
  // honest, actionable number and it is strictly better than silence, which is what this product
  // used to offer. It can only ever under-state, which is the direction that never causes a man to
  // relax wrongly... so the copy must say "at least".
  | {
      kind: 'floor';
      rolling12m: number;
      spanDays: number;
      distance: number;
      over: boolean;
      nearLine: boolean;
    }
  // Twelve months or more of rows: the window is genuinely covered.
  | {
      kind: 'known';
      rolling12m: number;
      spanDays: number;
      distance: number;
      over: boolean;
      nearLine: boolean;
    };

function num(v: number | string | null | undefined): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isTrade(row: TurnoverRow): boolean {
  return String(row.income_type ?? '').toLowerCase() !== 'property';
}

function dayDiff(aISO: string, bISO: string): number {
  const a = Date.parse(`${aISO}T00:00:00Z`);
  const b = Date.parse(`${bISO}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.floor((b - a) / 86400000);
}

/**
 * His rolling twelve month taxable turnover, and how far that leaves him from the line.
 *
 * ⚠️ TRADE INCOME ONLY, AND GROSS. Rent is exempt (VATA 1994 Sch 9 Group 1) and is excluded by
 * income_type, not by guessing at a vendor name. Costs are ignored entirely: the registration test
 * is on TURNOVER, and a man having a bad year for profit can still be obliged to register.
 *
 * @param rows every confirmed row we hold, any date. Filtering happens here so no caller has to
 *   remember the window.
 * @param nowISO today, as YYYY-MM-DD.
 * @param threshold the registration threshold, passed in so lib/vat.ts stays its only owner.
 * @param registered his VAT profile says he is already registered.
 */
export function vatStanding(
  rows: TurnoverRow[],
  nowISO: string,
  threshold: number,
  registered = false,
): VatStanding {
  if (registered) return { kind: 'registered' };

  const list = Array.isArray(rows) ? rows : [];
  // The window opens 365 days back, so a row dated exactly a year ago today is out, matching the
  // "in any rolling twelve months" wording rather than being generous by a day in our own favour.
  let total = 0;
  let earliest: string | null = null;
  let counted = 0;

  for (const r of list) {
    const date = typeof r.transaction_date === 'string' ? r.transaction_date.slice(0, 10) : null;
    if (!date) continue;
    // A row dated in the future is a typo, not turnover, and must not open the window early.
    if (date > nowISO) continue;
    if (earliest === null || date < earliest) earliest = date;
    if (dayDiff(date, nowISO) >= ROLLING_WINDOW_DAYS) continue;
    if (!isTrade(r)) continue;
    const amt = num(r.amount);
    // Money IN only. A refund to a customer is a negative sale and nets off; a cost is not turnover
    // at all, and both arrive here as negatives, so the sum takes income and leaves spending alone.
    if (amt > 0) {
      total += amt;
      counted += 1;
    }
  }

  if (counted === 0 && earliest === null) return { kind: 'nothing' };

  const rolling12m = Math.round(total * 100) / 100;
  const spanDays = earliest ? Math.max(0, dayDiff(earliest, nowISO)) : 0;
  const distance = Math.round((threshold - rolling12m) * 100) / 100;
  const over = rolling12m > threshold;
  const nearLine = !over && distance <= NEAR_LINE_DISTANCE;
  const complete = spanDays >= ROLLING_WINDOW_DAYS;

  return complete
    ? { kind: 'known', rolling12m, spanDays, distance, over, nearLine }
    : { kind: 'floor', rolling12m, spanDays, distance, over, nearLine };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ THE CARD FEE CAVEAT, WHICH IS NOT A NICETY FOR ANYONE WHO TAKES CARDS.
//
// A card provider pays out NET of its fee. The bank line, and therefore the confirmed row, is the
// net figure. The VAT test runs on GROSS takings: the customer paid £100 and £100 is the supply,
// whatever the provider kept. Rosa's fixture year makes the gap concrete: £83,562.07 gross against
// £82,405.16 banked, a £1,157 understatement, on a business £6,438 from the line. That is a fifth
// of her remaining headroom hidden inside an arithmetic she never sees.
//
// So a near-the-line customer is told, in one sentence, in the place the figure is drawn. Said only
// when it can change what he does: over the line he must register regardless, and far below it the
// sentence is noise.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const CARD_FEE_NOTE =
  'If you take card payments, your payouts land in the bank after the provider has taken its fee, '
  + 'and the VAT line is measured on what the customer paid, not what arrived. So your own figure '
  + 'may sit a little above this one.';

export const FLOOR_NOTE =
  'That is the least it can be, not the most: it counts what you have given me so far.';

// The two statutory tests, in the order a customer meets them. GOV.UK, "Register for VAT: when to
// register": the backward look is the rolling twelve months, the forward look is 30 days, and the
// forward look registers you from the START of that period rather than after it.
export const BACKWARD_TEST =
  'You must register once your taxable turnover goes over the threshold in any rolling twelve '
  + 'months. You then have 30 days from the end of that month to register, and you are registered '
  + 'from the first day of the month after that.';

export const FORWARD_TEST =
  'There is a second test people miss: if you expect to go over the threshold in the next 30 days '
  + 'on its own, you must register immediately, and you are registered from the day you realised it.';

/**
 * One plain sentence naming the figure and the distance, for the doors that answer in prose
 * (WhatsApp, the thread) rather than in a card. Kept here beside the arithmetic so a door cannot
 * quietly grow its own wording, which is how the three answers happened.
 */
export function standingSentence(s: VatStanding, gbp: (n: number) => string): string {
  switch (s.kind) {
    case 'registered':
      return 'You are already VAT registered, so the threshold question is behind you.';
    case 'nothing':
      return 'I have nothing confirmed from you yet, so I cannot tell you where you stand. '
        + 'Upload a statement or send me your takings and it fills itself in.';
    case 'floor':
      return `On what you have confirmed, your last twelve months come to at least `
        + `${gbp(s.rolling12m)}. ${FLOOR_NOTE}`
        + (s.over
          ? ' That is already over the line, so registration is not optional.'
          : ` That leaves at least ${gbp(s.distance)} before you reach the line.`);
    case 'known':
    default:
      return s.over
        ? `Your last twelve months come to ${gbp(s.rolling12m)}, which is over the line. `
          + 'Registration is not optional now, and registering late is a penalty.'
        : `Your last twelve months come to ${gbp(s.rolling12m)}, so you are `
          + `${gbp(s.distance)} below the line.`;
  }
}

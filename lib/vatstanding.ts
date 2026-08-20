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
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 B80. THIS SENTENCE GAVE THE EFFECTIVE DATE OF REGISTRATION ONE MONTH EARLY, ON FOUR
// SURFACES, FROM ONE CONSTANT, FROM 12 AUGUST TO 20 AUGUST 2026.
//
// It read "you are registered from the first day of the month after that". Read by a customer
// who went over in April, that is 1 May. HMRC's own VAT Registration Manual VATREG25100 gives
// the worked example and the answer is 1 JUNE: "the date of registration is the first day of
// the second month after his taxable supplies rose above the threshold", with the timeline
// exceeded 22 April, liability 30 April, notification deadline 30 May, EDR 1 June. GOV.UK says
// the same in plain words on the page this file already cites: "Your effective date of
// registration is the first day of the second month after you go over the threshold." Both read
// live on 20 August 2026, before the sentence was touched.
//
// ⚠️ THE DEADLINE HALF WAS ALWAYS RIGHT AND IS UNTOUCHED. Thirty days from the end of the month
// he went over is exactly HMRC's 30 May. One clause of two was wrong, which is why reading the
// sentence quickly does not catch it.
//
// 🔴 AND WHY IT SURVIVED IS WORTH MORE THAN THE FIX. NINE FILES REFERENCE THIS CONSTANT AND
// EVERY ONE OF THEM GUARDS ITS PLUMBING. run6fixes checks it is imported and rendered;
// run2fixes checks it comes after his figure; laneparity checks no router keeps a private copy;
// sabotage-b18vatlane and sabotage-run6 check it cannot be deleted. The ONLY assertion on its
// CONTENT was that it contains the words "rolling twelve months". A wall of guards proving a
// sentence is PRESENT and POSITIONED, and not one asking whether it is TRUE.
//
// ⚠️ SO THE GUARD THAT COMES WITH THIS FIX DERIVES THE DATE RATHER THAN QUOTING IT.
// test/vatedr.test.mjs computes the effective date from the rule for TWO breach months, one of
// which crosses a year end, and requires the worked example below to agree with what it
// computed. A guard that quoted the new words would be the same guard that kept the old ones
// alive for eight days.
//
// THE WORKED EXAMPLE IS HMRC'S OWN AND IT IS DELIBERATE. People restate this rule to themselves
// wrongly; a date rule with no example is a date rule they will get wrong anyway.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const BACKWARD_TEST =
  'You must register once your taxable turnover goes over the threshold in any rolling twelve '
  + 'months. You then have 30 days from the end of that month to register, and you are registered '
  + 'from the first day of the second month after the one you went over in. So if you go over in '
  + 'April, you register by 30 May and you are VAT registered from 1 June.';

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

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE WHOLE ANSWER, NOT JUST THE FIRST SENTENCE. B18, 17 August 2026.
//
// standingSentence above has been the shared piece since Run 2. The four things that go AROUND it
// were not shared: they were assembled inside handleVatQuestion in app/api/whatsapp/route.ts, so
// the only channel that could give a customer the whole answer was the one channel that had a VAT
// lane at all.
//
// 🔴 WHAT THAT COST, LIVE, ON 17 AUGUST. Signed in as Callum Strachan, a Glasgow sole trader with
// 77 confirmed entries, the web chat was asked "am in glasgow, is vat different up here". It
// replied: "No, VAT is the same across the UK, including Scotland. The threshold is £90,000 rolling
// 12-month turnover to register, and deregistration at £88,000."
//
// Every figure in that is correct. That is not the defect. The defect is that it is the STATUTE,
// out of a language model, to a man whose own books were sitting one table away and hold the only
// part of the answer that is about him. He asked the most consequential threshold question of his
// trading life and was told what the law says instead of where he stands in it, and crossing that
// line late is a penalty.
//
// ⚠️ SO THE ASSEMBLY MOVES HERE AND THE ROUTERS KEEP NONE OF IT. Same judgement as the header of
// this file: this product has shipped three different answers to one statutory question before, and
// the only structural cure is that there is one place to be right. lib/vatanswer.ts does the two
// reads. This function does the words. Neither lives in a router.
//
// ⚠️ THE CARD FEE CAVEAT TRAVELS, AND THE QUESTION WAS ASKED PROPERLY BEFORE IT DID. The doubt
// recorded on the backlog was whether it belongs on a surface that cannot see the bank feed the
// webhook can. It does, and the two things are unrelated: app/api/thread/route.ts withholds the
// bank OFFER in busyMessage because it cannot verify a connection, which is a fact about our
// plumbing. CARD_FEE_NOTE is a fact about HIS ROWS, that a card payout banks net of the provider's
// fee while the VAT test runs on the gross supply, and those are the same rows on all three
// surfaces. Withholding it on the web would mean a near line customer is warned on WhatsApp and not
// warned in the chat, about the same understatement, in the same books.
//
// ⚠️ AND IT IS STILL SAID ONLY WHERE IT CAN CHANGE WHAT HE DOES, which is why the nearLine guard
// comes with it rather than being flattened into "always". Over the line he must register whatever
// the fee did; far below it the sentence is noise on a screen doc 103 says he is reading one handed.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// The source travels with the answer, on every channel. A statutory claim a customer cannot check
// is a claim he has to take on trust, and this one decides whether he registers.
export const VAT_SOURCE = 'Source: https://www.gov.uk/vat-registration/when-to-register';

// 🔴 A FAILED READ IS SAID OUT LOUD, IT IS NEVER A REASSURANCE. If the rows do not come back we do
// not know where he stands, and the one answer that must never be given to a man near the line is a
// comfortable sounding guess. These are the webhook's own words, moved here so all three channels
// refuse in the same sentence rather than three sentences that drift.
export const VAT_UNREADABLE =
  'I could not read your figures just now, and I am not going to answer a VAT question with a '
  + 'guess. Try me again in a minute.';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 B20. THE MAN ASKED A YES OR NO AND WAS NEVER GIVEN ONE. 17 August 2026.
//
// B18 wired this answer to all three routers, and the walk that proved it asked, in the customer's
// own words: "am in glasgow, is vat different up here". He got his figure, both statutory tests and
// the source, which is a far better answer than the statute he used to get. It still never said NO.
//
// ⚠️ AND THAT IS NOT AN OVERSIGHT IN THE SCOTLAND LANE, IT IS THAT LANE WORKING. isScottishRatesQuestion
// refuses VAT in the predicate, deliberately, because VAT is reserved and handing a VAT question an
// income tax caveat states something false about his own figures. B16 wrote that the question then
// "keeps going to the lane that owns it". This is that lane, so this is where the answer belongs.
//
// ⚠️ IT LIVES IN THIS FILE AND NOT IN lib/scotland.ts, AND THE LINE BETWEEN THEM IS WORTH KEEPING.
// That file owns a CAVEAT: what we must admit about an income tax figure we compute at rates that
// are not his. This is an ANSWER, about VAT, which is the same in all four nations. The file that
// owns what this product claims about his VAT owns it. Putting it there would also have meant
// arguing a third export past that file's derived surface ratchet for a sentence that is not a
// Scotland sentence at all.
//
// ⚠️ IT LEADS, AND THAT IS NOT A BREACH OF "THE FIGURE LEADS". That promise exists so a man is
// never handed the STATUTE before his position. This is one clause answering the exact yes or no he
// typed, and a direct question deserves its answer in the first breath. Everything below it is
// unchanged and his figure still comes before every rule. test/run2fixes.test.mjs holds BOTH now:
// the tests come after his figure, and the ONLY thing permitted above his figure is this line.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const VAT_IS_UK_WIDE = 'VAT is the same wherever you are in the UK.';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 B21. WHAT THIS ANSWER OWED A MAN WHO IS ALREADY REGISTERED, WHICH WAS NOT THREE PARAGRAPHS
// OF HOW TO REGISTER. 17 August 2026, found by asking what B18's own blunt matcher would do.
//
// isVatQuestion fires on any message carrying the word with no money amount in it, which is right:
// the alternative is the entry parser answering "should i be registered for vat" with diesel and
// Dave, which is what Run 2 found. But every VAT question from a REGISTERED customer was being
// answered "You are already VAT registered, so the threshold question is behind you", and then
// handed BACKWARD_TEST and FORWARD_TEST, which are the two tests for when you must register, and a
// source link titled "when to register". He has registered. He passed both tests. He knows.
//
// That was live on WhatsApp from 12 August and B18 put it on three channels instead of one, which
// is why it is fixed the same day rather than filed.
//
// ⚠️ WHAT HE GETS INSTEAD IS SHORT, AND SHORT IS THE POINT. Doc 103: every row is a thing he has to
// read and reject before he reaches what he came for. He gets the true sentence and the door to the
// screen that actually holds his VAT, which is /app/tax/vat's registered arm: the quarter's output
// tax, the input tax he can reclaim, and what that leaves him owing or owed. That screen exists and
// is good, and this lane was reciting registration law at him instead of naming it.
//
// ⚠️ THE CARD FEE NOTE AND THE SOURCE GO WITH THEM, AND FOR THE SAME REASON RATHER THAN FOR TIDINESS.
// CARD_FEE_NOTE exists to warn a man that his books under-read the gross takings that decide whether
// he crosses a line. He has crossed it. VAT_SOURCE points at the registration guidance. Neither can
// change what he does now, which is the bar this file already applies to the card fee note.
//
// ⚠️ AND THIS IS NOT A HAND OFF TO THE MODEL. Falling through would let a model tell a registered
// man he needs to register, on the two routers that cannot see his VAT profile. One true sentence
// and a real door beats a fluent answer nobody checked.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const VAT_REGISTERED_DOOR =
  'For this quarter, open Tax and then VAT: what you have charged, what you can reclaim on your '
  + 'costs, and what that leaves you owing or owed.';

/**
 * The VAT answer every door gives, in the order a frightened customer needs it.
 *
 * A direct yes or no if he asked one, then his figure, then both statutory tests, then the card fee
 * gap when it is close enough to matter, then the source. The lead is not a style choice: it is the
 * promise test/run2fixes.test.mjs holds by index, that a man is told WHERE HE STANDS before he is
 * told what the rules are.
 *
 * @param opts.nationAsked he named a nation, so the yes or no he actually asked is answered first.
 */
export function vatAnswer(
  s: VatStanding,
  gbp: (n: number) => string,
  opts: { nationAsked?: boolean } = {},
): string {
  const parts: string[] = [];

  if (opts.nationAsked) parts.push(VAT_IS_UK_WIDE);

  parts.push(standingSentence(s, gbp));

  // 🔴 HE HAS ALREADY REGISTERED, SO THE REGISTRATION LAW IS NOT HIS. See B21 above. Everything
  // below this line is about crossing a line he is past.
  if (s.kind === 'registered') {
    parts.push(VAT_REGISTERED_DOOR);
    return parts.join('\n\n');
  }

  // Both tests, always. People who know about the rolling twelve months usually do not know about
  // the forward look, and the forward look is the one that registers you the same day.
  parts.push(BACKWARD_TEST);
  parts.push(FORWARD_TEST);

  if ('nearLine' in s && s.nearLine) parts.push(CARD_FEE_NOTE);

  parts.push(VAT_SOURCE);
  return parts.join('\n\n');
}

// lib/capital.ts. WHAT A BIG PURCHASE ACTUALLY GETS HIM, AND WHEN.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE DEFECT THIS FILE EXISTS TO END, FOUND BY WALKING A REAL STATEMENT ON 2 AUGUST 2026.
//
// An electrician's 78 row Monzo export contained one line: AUDI LEEDS, £60,000. It went into the
// pile like any other payment, he filed it under a category, and the whole £60,000 came off his
// profit in the year he bought it. His £22,800 profit was reported as a £37,224 LOSS, his set
// aside went to £0, and the Overview told him Lekhio had saved him £5,463 when the honest figure
// was about £2,809.
//
// GOV.UK, claim capital allowances, business cars: "Cars do not qualify for: annual investment
// allowance (AIA)." A car goes into a pool and earns a WRITING DOWN ALLOWANCE, a percentage a
// year, for as long as he owns it. Year one on that car is roughly £3,600, not £60,000.
//
// ⚠️ AND THE PRODUCT ALREADY KNEW IT WAS A CAR. The pile printed the correct VAT rule on that
// exact row: "The VAT on buying a car is blocked unless it is genuinely never available for
// private use." So the knowledge existed for VAT and not for income tax, which is the worst shape
// a fact can be in: present, correct, and not consulted by the thing that needed it.
//
// Overstating a deduction by £52,000 is not a rounding error. Finance Act 2026 Sch 22 makes it
// sanctionable conduct to act in a way that brings about a loss of tax revenue, and it is HIS
// return, HIS penalty and HIS name on it.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// THE RULES, WITH THEIR SOURCES. Every rate comes from lib/taxengine.ts FACTS, which khoji watches
// against GOV.UK nightly. Not one number is written down in this file.
//
//   CARS ARE OUT OF THE AIA        CAA 2001 s38B. GOV.UK, business cars: "Cars do not qualify
//                                  for: annual investment allowance (AIA)". A van is NOT a car
//                                  for this purpose and does get the AIA in full, which is the
//                                  single most useful thing this file can tell a man before he
//                                  signs anything.
//
//   WHICH POOL                     GOV.UK, business cars, for a car bought from April 2021:
//                                  MAIN RATE for a new and unused car at 0g/km, or at 50g/km or
//                                  under, and for a SECOND HAND electric car. SPECIAL RATE for
//                                  anything over 50g/km, new or second hand.
//
//   THE RATES                      Main rate 14% a year from April 2026 (it was 18%). Special
//                                  rate 6% a year. FACTS.wdaMainRate and FACTS.wdaSpecialRate.
//
//   THE 100% FIRST YEAR ALLOWANCE  New and UNUSED cars at zero emissions only, available until
//                                  April 2027. GOV.UK, 100% first year allowances. A second hand
//                                  electric car does NOT get it: it goes in the main pool.
//
//   PRIVATE USE                    A sole trader's car is almost never wholly business. CAA 2001
//                                  s205: the allowance is reduced to the business proportion.
//                                  ⚠️ WE ASK RATHER THAN ASSUME, and the reason is the whole of
//                                  this file: assuming 100% would be a smaller version of the
//                                  same over claim we are here to stop.
//
// PURE. No I/O, no clock. Rates read at call time so a Khoji approved change lands without a
// deploy, exactly as lib/elections.ts does it.

import { FACTS } from './taxengine';
import { gbp0 } from './money';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT HE TELLS US. Four answers, in the words of a man who has just bought the thing.
//
// ⚠️ 'not_a_car' IS AN ANSWER AND NOT AN ABSENCE. A van, a digger, a mower and a tester are all
// plant and machinery, all inside the AIA, and all correctly deducted in full the way they are
// today. Naming it means a man who tells us it is a van has SAID so, and the row carries his
// answer rather than our silence.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export type CapitalKind = 'not_a_car' | 'car_zero_new' | 'car_low_or_used_electric' | 'car_other';

export const CAPITAL_KINDS: readonly CapitalKind[] = [
  'not_a_car', 'car_zero_new', 'car_low_or_used_electric', 'car_other',
];

export function isCapitalKind(v: unknown): v is CapitalKind {
  return typeof v === 'string' && (CAPITAL_KINDS as readonly string[]).includes(v);
}

// 🔴 WHEN THE QUESTION GETS ASKED AT ALL, AND BOTH HALVES OF THE RULE MATTER.
//
// ONE payment, over this. A car arrives on a statement as a single line. A merchant with fourteen
// payments adding to £4,000 is a trade account, and asking a man whether his trade account was a
// car is the exact tedium that made him stop the first time. So the pile tests the SINGLE payment,
// never the group total.
//
// ⚠️ £1,000 RATHER THAN £5,000, AND IT WAS £5,000 FOR A DAY. The £60,000 Audi that started this is
// not the only shape of the bug: a £1,500 banger deducted in full over claims about £1,400 of
// deduction and roughly £400 of tax, and a young sparky's first car is exactly that price. The
// question is DEFAULTED to "Not a car", so on the ten or twenty single payments over £1,000 a
// tradesman has in a year, the ones that are not cars cost him nothing at all to pass.
//
// supabase/APPLY_2026-08-02_capital_kind.sql PART 1 mirrors this number. If it moves, move both.
export const CAPITAL_QUESTION_FROM = 1000;

// Whether the pile should ask about this row. Money OUT only, and one payment only. Passed the
// SINGLE payment, never a group total: see the rule above.
export function shouldAskCapital(singlePaymentAmount: number, paymentCount: number): boolean {
  if (paymentCount !== 1) return false;
  if (!Number.isFinite(singlePaymentAmount)) return false;
  return Math.abs(singlePaymentAmount) >= CAPITAL_QUESTION_FROM;
}

// The question, and the four answers, in his language rather than HMRC's. He has just bought the
// thing, so he knows whether it is a car and whether it plugs in. He does not know the phrase
// "special rate pool" and never needs to.
export function capitalQuestion(): string {
  return 'Was this a car?';
}

export function capitalWhy(): string {
  return 'It matters more than anything else on this screen. A van, a digger or a tester comes off '
    + 'your profit in full this year. A car cannot: HMRC keeps cars out of that allowance and gives '
    + 'you a percentage a year instead, for as long as you own it.';
}

export interface CapitalOption {
  kind: CapitalKind;
  label: string;
  note: string;
}

export function capitalOptions(): CapitalOption[] {
  return [
    {
      kind: 'not_a_car',
      label: 'Not a car',
      note: 'A van, a pickup, a machine, tools. It comes off your profit in full this year.',
    },
    {
      kind: 'car_zero_new',
      label: 'A brand new electric car',
      note: 'Bought new and unused, nothing out of the exhaust. The full cost comes off this year.',
    },
    {
      kind: 'car_low_or_used_electric',
      label: 'A hybrid at 50g/km or under, or a used electric',
      note: `${asPct(FACTS.wdaMainRate)}% of what is left, every year, for as long as you own it.`,
    },
    {
      kind: 'car_other',
      label: 'Any other car',
      note: `Petrol, diesel, or a hybrid over 50g/km. ${asPct(FACTS.wdaSpecialRate)}% of what is left, every year.`,
    },
  ];
}

function asPct(rate: number): string {
  return String(Math.round(rate * 1000) / 10);
}

// How much of the driving is for work. Bands rather than a box, because nobody knows the number
// and a box invites a made up one. The band is stored; the money is worked out from it.
//
// ⚠️ THE BANDS ARE THE MIDPOINT OF WHAT HE SAID, NOT THE TOP OF IT. "About half" is 50, not 74.
// Rounding a man's rough answer upwards is how a product over claims politely.
export const USE_BANDS = [100, 75, 50, 25] as const;
export type UseBand = (typeof USE_BANDS)[number];

export function isUseBand(n: unknown): n is UseBand {
  return typeof n === 'number' && (USE_BANDS as readonly number[]).includes(n);
}

export function useBandLabel(band: UseBand): string {
  if (band === 100) return 'All of it, it never leaves the job';
  if (band === 75) return 'Most of it, about three quarters';
  if (band === 50) return 'About half';
  return 'A quarter or so';
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE ANSWER. What comes off his profit THIS year, and what is still to come.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export interface CapitalRelief {
  cost: number;
  kind: CapitalKind;
  businessUsePct: number;
  // The rate that applies, or 1 for anything getting full relief. Shown, never guessed at.
  rate: number;
  // 🔴 WHAT COMES OFF HIS PROFIT THIS TAX YEAR. The figure the engines use.
  thisYear: number;
  // What is left in the pool afterwards, still to come in later years. Zero for full relief.
  carriedForward: number;
  // True when the whole cost is relieved now, which is a van, ordinary kit, or a new electric car.
  inFull: boolean;
  // One plain sentence for the screen, and it never hides the bad news.
  says: string;
}

export function capitalRelief(
  cost: number,
  kind: CapitalKind,
  businessUsePct: number = 100,
  // 🔴 HOW MANY TAX YEARS SINCE HE BOUGHT IT. 0 is the year of purchase, which is what every
  // caller written before this existed passes by omission, so nothing moves for them.
  //
  // A writing down allowance is not a repeating figure: it is a percentage of what is LEFT, so it
  // shrinks every year. Reading it as "3,600 a year forever" would over claim from year two, and
  // producing nothing at all from year two, which is what the product actually did until now,
  // silently contradicts the sentence this same function prints.
  yearsHeld: number = 0,
): CapitalRelief {
  const c = Math.max(0, Number.isFinite(cost) ? cost : 0);
  const use = clampUse(businessUsePct);
  const share = use / 100;
  const years = Math.max(0, Math.floor(Number.isFinite(yearsHeld) ? yearsHeld : 0));

  // Full relief: not a car at all (AIA, plant and machinery), or a new unused zero emission car
  // (100% first year allowance, available until April 2027).
  //
  // ⚠️ AND IT HAPPENS ONCE. Both of these take the whole cost in the year of purchase, so the pool
  // is nil afterwards and there is nothing left to claim. A man who bought a van two years ago has
  // had his relief; telling him he has it again every year would be the plainest over claim in the
  // file. Everything is zero rather than absent so the shape of the answer never changes.
  if (years > 0 && (kind === 'not_a_car' || kind === 'car_zero_new')) {
    return {
      cost: round2(c), kind, businessUsePct: use, rate: 1,
      thisYear: 0, carriedForward: 0, inFull: true,
      says: 'The whole cost came off your profit in the year you bought it, so there is nothing left to claim on it.',
    };
  }
  if (kind === 'not_a_car' || kind === 'car_zero_new') {
    const amount = round2(c * share);
    return {
      cost: round2(c),
      kind,
      businessUsePct: use,
      rate: 1,
      thisYear: amount,
      carriedForward: 0,
      inFull: true,
      says: kind === 'not_a_car'
        ? fullReliefSays(amount, use, 'It is plant and machinery, so the Annual Investment Allowance takes the lot this year.')
        : fullReliefSays(amount, use, 'A brand new car with nothing out of the exhaust gets the whole cost in the first year, and that runs until April 2027.'),
    };
  }

  const rate = kind === 'car_low_or_used_electric' ? FACTS.wdaMainRate : FACTS.wdaSpecialRate;
  // What is left in the pool at the START of this year. The whole point of a reducing balance:
  // year one is a percentage of the price, year five is a percentage of what survived four years
  // of writing down. See the block above capitalRelief for why nothing needs to be stored.
  const opening = c * Math.pow(1 - rate, years);
  const thisYear = round2(opening * rate * share);
  // ⚠️ THE POOL FALLS BY THE WHOLE ALLOWANCE, NOT BY THE PART HE CLAIMED. CAA 2001 s205 reduces
  // the claim, not the expenditure, so the private share of each year is gone rather than saved
  // up for later. Carrying it would hand him back relief the law has already taken off him.
  const carriedForward = round2(opening - opening * rate);

  return {
    cost: round2(c),
    kind,
    businessUsePct: use,
    rate,
    thisYear,
    carriedForward,
    inFull: false,
    says: [
      years > 0
        ? `This is year ${years + 1} of claiming for it, and the allowance shrinks a little every year because it is a percentage of what is left.`
        : `A car cannot come off your profit in one go: HMRC keeps cars out of the Annual Investment Allowance.`,
      `You claim ${asPct(rate)}% of it a year instead, for as long as you own it.`,
      // 🔴 THE FIGURE THE PERCENTAGE IS OF, AND IN YEAR TWO IT IS NOT THE PRICE HE PAID.
      // "On £60,000 that is £3,384" is arithmetic a man can check and find wrong, on the one
      // screen whose whole job is that he can check our working. From year two it is what is
      // LEFT in the pool, which is the figure the rate is actually applied to.
      use < 100
        ? `On ${gbp0(round2(opening))} at ${use}% business use, that is ${gbp0(thisYear)} off your profit this year.`
        : `On ${gbp0(round2(opening))} that is ${gbp0(thisYear)} off your profit this year.`,
      `The rest is not lost. It keeps coming, a bit smaller each year, until you sell it or stop trading.`,
    ].join(' '),
  };
}

function fullReliefSays(amount: number, use: number, why: string): string {
  return use < 100
    ? `${why} At ${use}% business use that is ${gbp0(amount)} off your profit this year.`
    : `${why} That is ${gbp0(amount)} off your profit this year.`;
}

function clampUse(pct: number): number {
  if (!Number.isFinite(pct)) return 100;
  return Math.max(1, Math.min(100, Math.round(pct)));
}

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 SHOULD HE BUY IT AT ALL. Jag's ask, 2 August 2026, and it is the same knowledge pointed the
// other way.
//
// A man about to spend £60,000 on a car believes two things that are both wrong: that the whole
// lot comes off his tax, and that the tax saving is roughly a third of the price. On a car in the
// special rate pool the first year is 6%, so on £60,000 he gets about £3,600 of deduction and,
// at a basic rate trade marginal rate, about £936 back. He is expecting £15,600.
//
// ⚠️ AND THE MOST USEFUL SENTENCE IN THE PRODUCT IS THE COMPARISON. The same £60,000 spent on a
// VAN is plant and machinery, inside the AIA, and comes off in full this year. That is not a
// clever trick, it is the plain difference between two things he might buy, and nobody tells him.
//
// ⚠️ IT NEVER TELLS HIM TO BUY ANYTHING AND IT NEVER MOVES MONEY. doc 103's hard limit, and the
// control doctrine: it is his money and his decision. This works out what a purchase does and
// says it plainly, including when the answer is that he cannot afford it.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export interface PurchaseAdviceInput {
  cost: number;
  kind: CapitalKind;
  businessUsePct?: number;
  // His marginal rate on trade profit, as a decimal. Income tax plus Class 4 where it applies.
  // Passed in rather than worked out here, because the caller has his whole position and this
  // module has one number.
  marginalRate: number;
  // What he has actually got, and what is already spoken for. Both optional: a man who has logged
  // nothing still deserves the tax answer, he just does not get the affordability half.
  cashOnHand?: number | null;
  taxSetAside?: number | null;
}

export interface PurchaseAdvice {
  relief: CapitalRelief;
  // What the tax relief is worth in POUNDS BACK, this year, at his rate.
  taxSavedThisYear: number;
  // What it really costs him this year, once the tax back is counted.
  realCostThisYear: number;
  // The van comparison, only when it is a car and only when it would actually differ.
  vanInstead: { thisYear: number; taxSavedThisYear: number; better: number } | null;
  // 🔴 CAN HE AFFORD IT. Null when we do not know enough to say, which is not the same as yes.
  affordable: boolean | null;
  leftAfter: number | null;
  lines: string[];
}

export function purchaseAdvice(input: PurchaseAdviceInput): PurchaseAdvice {
  const relief = capitalRelief(input.cost, input.kind, input.businessUsePct ?? 100);
  const rate = Number.isFinite(input.marginalRate) ? Math.max(0, Math.min(1, input.marginalRate)) : 0;

  const taxSavedThisYear = round2(relief.thisYear * rate);
  const realCostThisYear = round2(relief.cost - taxSavedThisYear);

  // The van comparison. Only drawn for a car that is NOT getting full relief, because for a new
  // electric car there is nothing to compare: it already gets the lot.
  const vanInstead = relief.inFull ? null : (() => {
    const asVan = capitalRelief(relief.cost, 'not_a_car', relief.businessUsePct);
    const vanTax = round2(asVan.thisYear * rate);
    return { thisYear: asVan.thisYear, taxSavedThisYear: vanTax, better: round2(vanTax - taxSavedThisYear) };
  })();

  // 🔴 THE TAX SET ASIDE IS NOT HIS MONEY AND IS TAKEN OFF FIRST. A man who spends his January
  // bill on a car has not bought a car, he has borrowed from HMRC at a penalty rate. If we cannot
  // see both figures we say we cannot say, because a cheerful "yes" built on a missing number is
  // the worst answer available.
  const haveCash = typeof input.cashOnHand === 'number' && Number.isFinite(input.cashOnHand);
  const setAside = typeof input.taxSetAside === 'number' && Number.isFinite(input.taxSetAside)
    ? Math.max(0, input.taxSetAside) : 0;
  const spendable = haveCash ? round2(Math.max(0, (input.cashOnHand as number)) - setAside) : null;
  const affordable = spendable === null ? null : spendable >= relief.cost;
  const leftAfter = spendable === null ? null : round2(spendable - relief.cost);

  const lines: string[] = [];
  lines.push(relief.says);
  if (rate > 0) {
    lines.push(relief.inFull
      ? `At your rate that is about ${gbp0(taxSavedThisYear)} less tax this year, so it really costs you about ${gbp0(realCostThisYear)}.`
      : `At your rate that is about ${gbp0(taxSavedThisYear)} less tax this year. Most people expect a third of the price back straight away, and on a car you do not get it.`);
  }
  if (vanInstead && vanInstead.better > 0) {
    lines.push(
      `If what you need is a work vehicle, the same ${gbp0(relief.cost)} on a VAN comes off in full this year, `
      + `worth about ${gbp0(vanInstead.taxSavedThisYear)} instead of ${gbp0(taxSavedThisYear)}. `
      + `That is ${gbp0(vanInstead.better)} of difference in the first year alone, for the same money spent.`,
    );
  }
  if (affordable === false) {
    lines.push(
      `On what you have confirmed, you have about ${gbp0(spendable as number)} spare once your tax is put by. `
      + `This would leave you ${gbp0(Math.abs(leftAfter as number))} short, and the tax set aside is not yours to spend.`,
    );
  } else if (affordable === true) {
    lines.push(
      `On what you have confirmed you could cover it and still have about ${gbp0(leftAfter as number)} left with your tax put by. `
      + `Whether it is worth it is yours to weigh up.`,
    );
  } else {
    lines.push('I cannot tell you whether you can afford it, because I do not have enough of your money in front of me yet.');
  }

  return { relief, taxSavedThisYear, realCostThisYear, vanInstead, affordable, leftAfter, lines };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 "I WANT TO BUY A CAR." THE QUESTION BEFORE THE PURCHASE, WHICH IS THE ONLY TIME IT HELPS.
//
// Jag, 2 August 2026: "Maybe they come to us and say, I want to buy a car, and we say, this is the
// best way for you to buy a car right now."
//
// ⚠️ AND IT IS A ONE TIME DECISION PER VEHICLE, WHICH IS WHY ASKING FIRST IS WORTH SO MUCH.
// HMRC's simplified mileage rate and capital allowances are mutually exclusive for a given
// vehicle: once he has claimed capital allowances on it he cannot switch to mileage for it, and
// once he has used mileage he cannot start claiming capital allowances on it. So the fork is
// permanent for that vehicle, and it is taken on the day he signs, usually with no advice at all.
//
// THE THREE ROUTES A SOLE TRADER ACTUALLY HAS:
//
//   OWN IT HIMSELF, CLAIM MILEAGE     ITTOIA 2005 s94D, simplified expenses. FACTS.mileageCarFirst10k
//                                     for the first FACTS.mileageFirstBandMiles, then
//                                     FACTS.mileageCarOver10k. It covers EVERYTHING: the car, the
//                                     fuel, the insurance, the servicing, the tyres. No capital
//                                     allowance, no running costs on top, and no receipts to keep
//                                     beyond a mileage log. It repeats every single year.
//
//   BUY THE CAR THROUGH THE BUSINESS  A writing down allowance at 6% or 14%, or 100% for a new
//                                     zero emission car, ALL restricted to the business
//                                     proportion, plus the business share of the running costs.
//
//   BUY A VAN INSTEAD                 Plant and machinery, inside the Annual Investment Allowance,
//                                     so the whole cost this year, plus running costs. A van is
//                                     not a car for any of this.
//
// 🔴 THE ANSWER SURPRISES ALMOST EVERYONE, AND IT SPLITS CLEANLY:
//
//   An ordinary petrol or diesel car, on modest business mileage, is usually BETTER OWNED
//   PERSONALLY. £60,000 at 6% and half business use is £1,800 of allowance. Eight thousand
//   business miles at the published rate is several times that, every year, with no capital
//   claim and nothing to depreciate.
//
//   A NEW ELECTRIC car is usually better bought through the business, because the 100% first
//   year allowance is enormous and mileage cannot compete with it.
//
// ⚠️ IT RECOMMENDS AND IT NEVER DECIDES. Doc 103's hard limit and the control doctrine: his money,
// his van, his call. This works out what each route is worth on HIS figures and says which is
// biggest, with the reason, so that the decision he was going to make anyway is an informed one.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export type VehicleRoute = 'mileage' | 'business_purchase';

export interface VehicleAdviceInput {
  cost: number;
  kind: CapitalKind;
  // Roughly how many miles a year he expects to do FOR WORK. The one number he can estimate.
  businessMilesPerYear: number;
  // Roughly what share of the driving is work. Used to restrict the capital allowance and the
  // running costs, exactly as CAA 2001 s205 requires.
  businessUsePct: number;
  // What he reckons it costs a year to run: fuel, insurance, servicing, tax, tyres. Optional,
  // because a man who has not thought about it still deserves the rest of the answer.
  runningCostsPerYear?: number | null;
  marginalRate: number;
}

export interface VehicleAdvice {
  // What comes off his profit in the FIRST year, each way.
  mileageFirstYear: number;
  purchaseFirstYear: number;
  // And what comes off in a TYPICAL LATER year, which is where the two diverge hardest: mileage
  // repeats in full, a written down car shrinks every year.
  mileageLaterYear: number;
  purchaseLaterYear: number;
  best: VehicleRoute;
  // The gap in the first year, in pounds of TAX, at his rate.
  firstYearTaxGap: number;
  lines: string[];
}

// The published mileage rate, banded. Read from FACTS at call time so a Khoji approved change
// lands without a deploy, and so the rate is never written down twice.
export function mileageClaimFor(miles: number): number {
  const m = Math.max(0, Number.isFinite(miles) ? miles : 0);
  const band = FACTS.mileageFirstBandMiles;
  const first = Math.min(m, band) * FACTS.mileageCarFirst10k;
  const rest = Math.max(0, m - band) * FACTS.mileageCarOver10k;
  return round2(first + rest);
}

export function vehicleAdvice(input: VehicleAdviceInput): VehicleAdvice {
  const use = clampUse(input.businessUsePct);
  const share = use / 100;
  const rate = Number.isFinite(input.marginalRate) ? Math.max(0, Math.min(1, input.marginalRate)) : 0;
  const running = Math.max(0, Number.isFinite(input.runningCostsPerYear ?? NaN) ? (input.runningCostsPerYear as number) : 0);

  const relief = capitalRelief(input.cost, input.kind, use);

  // ⚠️ MILEAGE COVERS THE RUNNING COSTS, so nothing is added to it. That is the whole point of a
  // simplified expense and it is the commonest misunderstanding: a man who claims mileage AND his
  // fuel has claimed the fuel twice.
  const mileageFirstYear = mileageClaimFor(input.businessMilesPerYear);
  const mileageLaterYear = mileageFirstYear;

  const runningShare = round2(running * share);
  const purchaseFirstYear = round2(relief.thisYear + runningShare);

  // A typical later year. Full relief routes have no allowance left at all, so what continues is
  // the running costs. A written down car keeps shrinking, and the second year is the honest one
  // to show because it is the first year the difference bites.
  const laterAllowance = relief.inFull ? 0 : round2(relief.carriedForward * relief.rate * share);
  const purchaseLaterYear = round2(laterAllowance + runningShare);

  const best: VehicleRoute = purchaseFirstYear >= mileageFirstYear ? 'business_purchase' : 'mileage';
  const firstYearTaxGap = round2(Math.abs(purchaseFirstYear - mileageFirstYear) * rate);

  const lines: string[] = [];
  const miles = Math.max(0, Math.round(input.businessMilesPerYear || 0));

  lines.push(
    `Two ways to do this, and you can only pick one for a given vehicle. Once you claim capital `
    + `allowances on it you cannot switch to mileage, and once you have used mileage you cannot start `
    + `claiming the vehicle. So it is worth getting right before you sign.`,
  );

  lines.push(
    `KEEP IT IN YOUR OWN NAME and claim mileage: ${gbp0(mileageFirstYear)} off your profit in year one `
    + `on ${miles.toLocaleString('en-GB')} business miles, and the same again every year you do those miles. `
    + `That rate covers the lot, the fuel, the insurance, the servicing and the tyres, so nothing goes on top.`,
  );

  lines.push(
    relief.inFull
      ? `BUY IT THROUGH THE BUSINESS: ${gbp0(relief.thisYear)} of the cost in year one`
        + (runningShare > 0 ? `, plus ${gbp0(runningShare)} of running costs` : '')
        + `, so ${gbp0(purchaseFirstYear)} altogether. After that it is the running costs only.`
      : `BUY IT THROUGH THE BUSINESS: ${gbp0(relief.thisYear)} of the cost in year one`
        + (runningShare > 0 ? `, plus ${gbp0(runningShare)} of running costs` : '')
        + `, so ${gbp0(purchaseFirstYear)} altogether. It shrinks from there: about ${gbp0(purchaseLaterYear)} next year, `
        + `and smaller every year after, because you are claiming a percentage of what is left.`,
  );

  if (best === 'mileage') {
    lines.push(
      `🔴 ON YOUR FIGURES, KEEPING IT IN YOUR OWN NAME IS WORTH MORE. `
      + `${gbp0(mileageFirstYear)} against ${gbp0(purchaseFirstYear)} in year one`
      + (firstYearTaxGap > 0 ? `, which is about ${gbp0(firstYearTaxGap)} of tax` : '')
      + `. And the gap widens: mileage pays the same every year while the car's claim gets smaller.`,
    );
  } else {
    lines.push(
      `🔴 ON YOUR FIGURES, BUYING IT THROUGH THE BUSINESS IS WORTH MORE IN YEAR ONE. `
      + `${gbp0(purchaseFirstYear)} against ${gbp0(mileageFirstYear)}`
      + (firstYearTaxGap > 0 ? `, which is about ${gbp0(firstYearTaxGap)} of tax` : '')
      + `.`
      + (relief.inFull
        ? ` It is a one off though: next year there is no allowance left and mileage would have kept paying.`
        : ` Mileage would keep paying the same every year, so check the later years too if you keep vehicles a long time.`),
    );
  }

  if (input.kind !== 'not_a_car' && input.kind !== 'car_zero_new') {
    lines.push(
      `Worth knowing: a brand new electric car gets the WHOLE cost in year one, and a VAN does too. `
      + `Neither is a suggestion about what you should drive, it is just the part of the price nobody prices in.`,
    );
  }

  lines.push('Whichever you pick is yours to pick. This is your own numbers against the published rules, not advice.');

  return { mileageFirstYear, purchaseFirstYear, mileageLaterYear, purchaseLaterYear, best, firstYearTaxGap, lines };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 "WHAT IS THE BEST WAY FOR ME TO BUY A VEHICLE RIGHT NOW." THE WHOLE ANSWER, NOT THE TAX HALF.
//
// Jag, 2 August 2026: "Most people just want to be told what's best."
//
// ⚠️ AND THE TAX ANSWER ON ITS OWN WOULD BE ACTIVELY HARMFUL, WHICH IS WHY THIS FUNCTION EXISTS
// RATHER THAN JUST vehicleAdvice().
//
// A new electric car gets 100% of its cost in year one. Nothing else comes close: on £40,000 at
// 60% business use that is £24,000 off his profit against maybe £4,000 of mileage. If this product
// ranked by tax alone it would tell every single customer to buy an electric car.
//
// Now picture the man it is talking to. He is a plumber in a terrace with no driveway, he parks on
// the street, and the nearest public charger is four miles away. Telling him to buy an electric car
// because of the tax is telling him to spend two evenings a week sitting in a car park to save
// money he will never feel. He would do it once, hate us, and be right to.
//
// So the practical answers are not decoration on the tax answer. THEY OVERRULE IT. A recommendation
// this product cannot stand behind on a Tuesday in February is not a recommendation, it is a
// calculation with a confident font.
//
// 🔴 AND THE ONE THAT SURPRISES PEOPLE: FOR A VAN, THE FUEL MAKES NO DIFFERENCE TO THE TAX AT ALL.
// A van is plant and machinery whatever it burns, so it is inside the Annual Investment Allowance
// either way and the whole cost comes off in year one either way. A man buying a van should pick
// the one that suits the work, and nobody should be selling him an electric one on tax grounds.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// What he is actually after. A van and a car are different animals in law, and he knows which.
export type VehicleWant = 'van' | 'car';

// How easily he could live with an electric one. His words, not a range in miles.
export type Charging = 'home' | 'street_near' | 'street_far' | 'unknown';

export function chargingLabel(c: Charging): string {
  if (c === 'home') return 'I could charge at home, I have a drive or a garage';
  if (c === 'street_near') return 'I park on the street, but there are chargers close by';
  if (c === 'street_far') return 'I park on the street and the nearest charger is a fair way';
  return 'I have not looked into it';
}

export interface VehicleOption {
  kind: CapitalKind;
  // What to call it on the screen.
  title: string;
  // What comes off his profit in year one, and what it is worth in tax.
  firstYear: number;
  taxFirstYear: number;
  // What a typical later year looks like, because the two shapes diverge hard.
  laterYear: number;
  // The mileage alternative for this option, so every row carries both halves of the fork.
  mileageFirstYear: number;
  bestRoute: VehicleRoute;
  // Practical, and it can knock an option out however good the tax is.
  practical: 'fine' | 'awkward' | 'no';
  practicalNote: string | null;
  // The single figure the ranking uses: the better of the two routes, in POUNDS OF TAX.
  worthPerYearOne: number;
}

export interface VehicleRecommendation {
  // 🔴 HIS MARGINAL RATE IS NOUGHT, SO EVERY TAX FIGURE ON THIS SCREEN IS NOUGHT AND SAYS NOTHING.
  // A man below the personal allowance, in his first months, or carrying a loss. Not an error and
  // not an empty state: the DEDUCTIONS are all still real and still differ from each other, and
  // the screen has to say which number went quiet and why rather than printing £0 three times and
  // picking a winner between them.
  noTaxToSaveYet: boolean;
  options: VehicleOption[];
  // The one we would actually tell him to do, or null when nothing is affordable or answerable.
  best: VehicleOption | null;
  affordable: boolean | null;
  spendable: number | null;
  lines: string[];
}

// ⚠️ THE PRACTICAL VERDICT IS ABOUT ELECTRIC AND NOTHING ELSE. A diesel is a diesel wherever he
// parks. This only ever demotes, never promotes: the worst it can say about a petrol car is
// nothing at all.
function practicalFor(kind: CapitalKind, want: VehicleWant, charging: Charging, businessMiles: number):
  { verdict: 'fine' | 'awkward' | 'no'; note: string | null } {
  const electric = kind === 'car_zero_new';
  if (!electric) return { verdict: 'fine', note: null };

  // A van's fuel changes nothing in tax, so an electric van is only ever a practical question.
  const thing = want === 'van' ? 'van' : 'car';

  if (charging === 'home') {
    return businessMiles > 25000
      ? {
        verdict: 'awkward',
        note: `You can charge at home, which is the hard part solved. At ${Math.round(businessMiles).toLocaleString('en-GB')} miles a year you will still be using public chargers on the long days, so check the range against your worst week rather than your average one.`,
      }
      : { verdict: 'fine', note: 'You can charge at home, which is the part that decides whether an electric one is livable.' };
  }
  if (charging === 'street_near') {
    return {
      verdict: 'awkward',
      note: `Street parking with chargers nearby is workable, but it is a habit rather than a plug in the wall. Before you commit, do one ordinary week and count how many times you would have had to go and sit somewhere.`,
    };
  }
  if (charging === 'street_far') {
    return {
      verdict: 'no',
      note: `🔴 This is the one that decides it. Street parking with the nearest charger a fair way off means every charge is a trip you make on purpose. The tax on an electric ${thing} is the best there is, and it is not worth an evening a week for the rest of the time you own it. If your parking changes, come back to this.`,
    };
  }
  return {
    verdict: 'awkward',
    note: `Worth finding out before anything else: an electric one is by far the best on tax, and completely depends on being able to charge it without thinking about it. Check what is within a mile of where you park overnight.`,
  };
}

export interface RecommendInput {
  want: VehicleWant;
  budget: number;
  businessMilesPerYear: number;
  businessUsePct: number;
  runningCostsPerYear?: number | null;
  charging: Charging;
  marginalRate: number;
  // What he has to spend. Either what he told us, or what his confirmed figures suggest, and the
  // caller says which in the copy. Null means we will not pretend to know.
  spendable?: number | null;
}

export function recommendVehicle(input: RecommendInput): VehicleRecommendation {
  const budget = Math.max(0, Number.isFinite(input.budget) ? input.budget : 0);
  const use = clampUse(input.businessUsePct);
  const miles = Math.max(0, Number.isFinite(input.businessMilesPerYear) ? input.businessMilesPerYear : 0);
  const rate = Number.isFinite(input.marginalRate) ? Math.max(0, Math.min(1, input.marginalRate)) : 0;
  const running = Math.max(0, Number.isFinite(input.runningCostsPerYear ?? NaN) ? (input.runningCostsPerYear as number) : 0);

  // 🔴 A VAN IS ONE OPTION, NOT FOUR. Its fuel changes nothing in tax, so offering an electric van
  // and a diesel van as separate tax choices would invent a decision that does not exist.
  const kinds: CapitalKind[] = input.want === 'van'
    ? ['not_a_car']
    : ['car_zero_new', 'car_low_or_used_electric', 'car_other'];

  const titles: Record<CapitalKind, string> = {
    not_a_car: 'A van or pickup',
    car_zero_new: 'A brand new electric car',
    car_low_or_used_electric: 'A hybrid at 50g/km or under, or a used electric',
    car_other: 'A petrol or diesel car',
  };

  const options: VehicleOption[] = kinds.map((kind) => {
    const adv = vehicleAdvice({
      cost: budget, kind, businessMilesPerYear: miles, businessUsePct: use,
      runningCostsPerYear: running, marginalRate: rate,
    });
    const p = practicalFor(kind, input.want, input.charging, miles);
    const bestOfTwo = Math.max(adv.purchaseFirstYear, adv.mileageFirstYear);
    return {
      kind,
      title: titles[kind],
      firstYear: adv.purchaseFirstYear,
      taxFirstYear: round2(adv.purchaseFirstYear * rate),
      laterYear: adv.purchaseLaterYear,
      mileageFirstYear: adv.mileageFirstYear,
      bestRoute: adv.best,
      practical: p.verdict,
      practicalNote: p.note,
      worthPerYearOne: round2(bestOfTwo * rate),
    };
  });

  // ⚠️ RANKED BY MONEY, THEN THE PRACTICAL VERDICT VETOES. An option marked 'no' is never
  // recommended however far ahead it is on tax, and the reason is printed rather than swallowed,
  // so a man who CAN charge sees what he is turning down.
  const ranked = [...options].sort((a, b) => b.worthPerYearOne - a.worthPerYearOne);
  const best = ranked.find((o) => o.practical !== 'no') ?? null;

  const haveSpend = typeof input.spendable === 'number' && Number.isFinite(input.spendable);
  const spendable = haveSpend ? round2(Math.max(0, input.spendable as number)) : null;
  const affordable = spendable === null ? null : spendable >= budget;

  const lines: string[] = [];

  if (input.want === 'van') {
    lines.push(
      `A van is plant and machinery whatever it burns, so the whole cost comes off your profit in `
      + `year one either way. That means the fuel makes no difference at all to your tax, and you `
      + `should buy whichever van suits the work.`,
    );
  }

  // See VehicleRecommendation.noTaxToSaveYet. Every figure here is a deduction times his marginal
  // rate, so at a rate of nought they are all nought and none of them is telling him anything.
  const noTaxToSaveYet = !(input.marginalRate > 0);

  if (best) {
    const vetoed = ranked.find((o) => o.practical === 'no' && o.worthPerYearOne > best.worthPerYearOne);
    lines.push(
      noTaxToSaveYet
        // ⚠️ THE RECOMMENDATION SURVIVES, THE POUND FIGURE DOES NOT. Which vehicle is best for him
        // does not depend on his rate: the deduction it earns is the same either way, and the
        // practical answers that overrule the tax are unchanged. Only the "worth £X" half is dead.
        ? `🔴 ON YOUR NUMBERS: ${best.title.toUpperCase()}, and ${best.bestRoute === 'mileage'
          ? 'keep it in your own name and claim mileage'
          : 'buy it through the business'}. `
          + `I am not putting a tax figure on it, because on your confirmed books you have no tax `
          + `to pay this year, so nothing here would save you any. That does not make the relief `
          + `worthless: claimed against no profit it makes a loss, and a loss is carried forward `
          + `against the years you do make money. Come back once you are in profit and this screen `
          + `will be able to tell you what each one is worth.`
        : `🔴 ON YOUR NUMBERS: ${best.title.toUpperCase()}, and ${best.bestRoute === 'mileage'
          ? 'keep it in your own name and claim mileage'
          : 'buy it through the business'}. `
          + `That is about ${gbp0(best.worthPerYearOne)} of tax in the first year.`,
    );
    if (vetoed && vetoed.practicalNote) {
      lines.push(
        (noTaxToSaveYet
          ? `${vetoed.title} would actually earn you more relief. `
          : `${vetoed.title} would actually be worth more, about ${gbp0(vetoed.worthPerYearOne)}. `)
        + `I am not putting it first, and here is why. ${vetoed.practicalNote}`,
      );
    } else if (best.practicalNote) {
      lines.push(best.practicalNote);
    }
  } else {
    lines.push('I cannot put one of these first for you on what you have told me so far.');
  }

  if (affordable === false && spendable !== null) {
    lines.push(
      `On the money side: about ${gbp0(spendable)} is genuinely free once your tax is put by, and you `
      + `are looking at ${gbp0(budget)}. That is ${gbp0(budget - spendable)} short. The tax set aside is `
      + `not spare money, it is money you already owe, and spending it is the most expensive way to `
      + `borrow there is.`,
    );
  } else if (affordable === true && spendable !== null) {
    lines.push(
      `On the money side: about ${gbp0(spendable)} is free once your tax is put by, so ${gbp0(budget)} `
      + `is inside what you have and would leave you roughly ${gbp0(spendable - budget)}.`,
    );
  }

  lines.push('Every figure here is the published rules against what you have confirmed. What you buy is yours to decide, and nothing here is advice.');

  return { options: ranked, best, affordable, spendable, noTaxToSaveYet, lines };
}

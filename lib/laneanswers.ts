// ═══════════════════════════════════════════════════════════════════════════════════════════════
// HIS NATIONAL INSURANCE, HIS STUDENT LOAN AND HIS PROPERTY STREAM, READ ONCE, FOR EVERY DOOR
// THAT ASKS. B19, 17 August 2026.
//
// 🔴 THE FINDING, AND IT IS THE SAME ONE FOR THE SIXTH TIME.
//
// isNiQuestion, isStudentLoanQuestion and isPropertyQuestion have existed since Run 2. All three
// have a pure builder in lib/waintents.ts, all three are tested, all three read his own rows, and
// all three were dispatched by app/api/whatsapp/route.ts and by NOTHING ELSE. So a man who typed
// "how much national insurance do i pay" into the web chat at /app/thread, or into the in app
// accountant, was answered by the MODEL, which holds none of his rows, none of his plan and none of
// his income shape, and had no way to ask for them.
//
// Run 3 found this shape as "the gate was on one channel". B16 found it again and wrote the rule
// down. B18 found it for VAT. B19 found it for the deadline lane. This file is the same rule
// applied to the last three lanes that had a builder ready and one router calling it.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY ONE FILE AND NOT THREE, ARGUED RATHER THAN ASSUMED.
//
// lib/vatanswer.ts is one reader for one lane, and the obvious move was three files shaped like it.
// It is the wrong move here, and the reason is not tidiness.
//
// These three lanes are not three subjects. They are three questions about ONE read. Every one of
// them needs the year to date trade position (totalsForUser) and his employment income
// (getStudentLoanSettings), and every one of them needs the SAME answer to the SAME two questions:
//
//   1. WHEN DOES THE YEAR START. 6 April, and taxYearSinceISO was a private function inside
//      app/api/whatsapp/route.ts. Three separate readers means three copies of a boundary that has
//      to agree with matchTotalsQuestion or the same man gets two different year to date figures
//      out of two lanes in one conversation.
//   2. WHAT A FAILED READ SAYS. One decision, below, and it is the decision three files would have
//      made three ways.
//
// VAT is genuinely its own subject: its own window (400 days, not the tax year), its own arithmetic
// module and its own registered flag. It earned its own file. These three share a read, so they
// share a file, and the routers own neither the read nor the words.
//
// ⚠️ WHY IT IS NOT IN lib/waintents.ts. Same line lib/vatanswer.ts is the other side of: that module
// is import free on purpose so the node test runner can drive the builders directly with no bundler.
// This file touches lib/supabase.ts, so it has to live here. lib/waintents.ts owns the words,
// lib/nistudentloan.ts and lib/propertyengine.ts own the arithmetic, this file owns the reading.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHAT A FAILED READ SAYS TO THE CUSTOMER, DECIDED HERE AND ONCE.
//
// It says so, in his words, and it never says a figure. LANE_UNREADABLE, in lib/waintents.ts beside
// the builders, and it is the sentence the webhook already sent for two of the three.
//
// ⚠️ AND THE THIRD ONE WAS LYING, WHICH IS WHY THIS PARAGRAPH IS LONGER THAN IT LOOKS.
// propertyYtdTotals returned `{ rents: 0, expenses: 0, finance: 0 }` on a failed read, and
// propertyAnswer's own first branch is `if (rents <= 0)`, whose words are:
//
//   "No rental money logged this tax year yet. Text it as it lands..."
//
// So a landlord with eleven months of rent in his books, on a five second Supabase wobble, was told
// his property stream was EMPTY, in a sentence that reads as a settled fact about his records and
// invites him to start logging again. That is worse than a refusal and worse than silence: it is a
// confident false statement about his own money, and nothing anywhere could tell it from the true
// empty case. It has been the behaviour on WhatsApp since the lane was built.
//
// propertyYtdTotals now returns null on a failed read, this file turns null into LANE_UNREADABLE,
// and the genuine zero still gets propertyAnswer's real empty state. A zero we READ and a zero we
// GUESSED are two different facts and the type now says so.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 AND TWO OF THE THREE TAKE THE CHANNEL, WHICH IS NOT WHAT B19 EXPECTED.
//
// The backlog records isIdentity as the one lane whose WORDS are channel specific and says these
// three merely need a move. Typing the adjacent questions into the surface just wired found two
// more: the student loan lane's no plan branch says 'Tell me here, like "plan 2"', and the property
// lane's no rent branch says 'Text it as it lands'. matchStudentLoanPlanSet and matchRentIn are
// WhatsApp only by written decision, so both sentences are instructions to do a thing the web
// cannot do. See LaneChannel in lib/waintents.ts for the whole argument.
//
// The National Insurance lane needs no channel: its only door is "your app under Money, National
// Insurance", which is true wherever he is standing.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ WHAT IS DELIBERATELY NOT TREATED AS A FAILURE. getStudentLoanSettings returning null and
// getBusinessProfile returning null are UNKNOWN, not unreadable: the NI answer is still true and
// still his without a salary or an income shape (niAnswer's own header argues the unknown shape
// case at length), and the student loan lane's own "I do not know your plan yet" IS the answer to
// an absent plan. Only a failure of a read the FIGURE turns on refuses.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import {
  totalsForUser,
  getStudentLoanSettings,
  getBusinessProfile,
  propertyYtdTotals,
  listUserProperties,
} from './supabase';
import { niPosition, studentLoanRepayment, STUDENT_PLANS, type StudentPlan } from './nistudentloan';
import { aprilDelta } from './propertyengine';
import {
  niAnswer, studentLoanAnswer, propertyAnswer, LANE_UNREADABLE, type LaneChannel,
} from './waintents';
import { SCOTLAND_LINE } from './scotland';

// The UK tax year starts 6 April. THE ONE DEFINITION for these three lanes, lifted out of
// app/api/whatsapp/route.ts where it was a private function three call sites deep. Same rule
// matchTotalsQuestion applies, and it has to stay the same rule: a man who asks what he has made
// this year and then asks what National Insurance he owes on it must not be answered off two
// different Aprils.
export function taxYearSinceISO(now: Date = new Date()): string {
  const d = new Date(now);
  const y = d.getUTCMonth() > 3 || (d.getUTCMonth() === 3 && d.getUTCDate() >= 6) ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${y}-04-06`;
}

/**
 * The whole National Insurance answer for one customer, from his own confirmed rows.
 *
 * Always returns a sentence. A failed read of the rows returns LANE_UNREADABLE, never a figure.
 */
export async function niAnswerForUser(userId: string, now: Date = new Date()): Promise<string> {
  const since = taxYearSinceISO(now);
  // 🔴 THE PROFILE READ IS WHAT MAKES THE LANDLORD GATE IN niAnswer() RUN AT ALL, and it is fetched
  // ALONGSIDE the rest rather than after, so the answer is no slower than it was. HMRC NIM74250: a
  // man whose only business is letting has no relevant profits, no small profits threshold to fall
  // under, and no voluntary Class 2 to buy a qualifying year with. A failed profile read is null,
  // which is UNKNOWN, and niAnswer answers exactly as it always has, which is the safe direction:
  // NIM74250 itself says a guest house is a trade, so only a KNOWN landlord is told something else.
  const [totals, settings, biz] = await Promise.all([
    totalsForUser(userId, since, null),
    getStudentLoanSettings(userId).catch(() => null),
    getBusinessProfile(userId).catch(() => null),
  ]);
  if (!totals) return LANE_UNREADABLE;

  const salary = settings?.employmentIncome ?? 0;
  const profit = Math.max(0, totals.income - totals.expenses);
  const pos = niPosition(salary, profit);
  return niAnswer({
    profit,
    salary,
    class1: pos.class1,
    class4: pos.class4,
    class2Annual: pos.class2Voluntary.annual,
    qualifies: pos.qualifiesViaEmployment || pos.qualifiesViaProfits,
    voluntarySuggested: pos.voluntaryClass2Suggested,
    incomeShape: biz?.incomeShape ?? null,
  });
}

/**
 * The whole student loan answer for one customer, from the plan stored on his account and his own
 * confirmed rows.
 *
 * Always returns a sentence. A failed read of the rows returns LANE_UNREADABLE.
 *
 * ⚠️ NO PLAN IS NOT A FAILED READ. It is the answer: studentLoanAnswer's hasPlan false branch asks
 * him for it and tells him he can say "plan 2" here. It is deliberately reached BEFORE the rows are
 * read, because there is no figure to compute and no reason to make him wait for one.
 */
export async function studentLoanAnswerForUser(
  userId: string,
  channel: LaneChannel,
  now: Date = new Date(),
): Promise<string> {
  const settings = await getStudentLoanSettings(userId).catch(() => null);
  const plans: StudentPlan[] = [];
  if (settings?.plan) plans.push(settings.plan);
  if (settings?.postgrad) plans.push('postgrad');
  if (plans.length === 0) {
    return studentLoanAnswer({ hasPlan: false, planLabel: null, annual: 0, threshold: 0, income: 0, channel });
  }

  const totals = await totalsForUser(userId, taxYearSinceISO(now), null);
  if (!totals) return LANE_UNREADABLE;

  const profit = Math.max(0, totals.income - totals.expenses);
  const income = profit + (settings?.employmentIncome ?? 0);
  const r = studentLoanRepayment(income, plans);
  return studentLoanAnswer({
    hasPlan: true,
    planLabel: plans.map((p) => STUDENT_PLANS[p].label).join(' plus '),
    annual: r.annualTotal,
    threshold: Math.min(...plans.map((p) => STUDENT_PLANS[p].threshold)),
    income,
    channel,
  });
}

/**
 * The whole property answer for one customer: this tax year's stream plus the April 2027 line, out
 * of the same engine the app and the website calculator run.
 *
 * Always returns a sentence. A failed read of EITHER money read returns LANE_UNREADABLE, and the
 * property one is the reason this file exists in the shape it does. See the header.
 */
export async function propertyAnswerForUser(
  userId: string,
  channel: LaneChannel,
  now: Date = new Date(),
): Promise<string> {
  const since = taxYearSinceISO(now);
  const [totals, tradeTotals, properties, profile] = await Promise.all([
    propertyYtdTotals(userId, since),
    totalsForUser(userId, since, null),
    listUserProperties(userId).catch(() => []),
    getStudentLoanSettings(userId).catch(() => null),
  ]);

  // 🔴 THE PROPERTY ROWS FAILING IS NOT A ZERO. See the header: until today it was one, and it was
  // read back to the customer as "No rental money logged this tax year yet".
  if (totals === null) return LANE_UNREADABLE;
  // 🔴 AND THE TRADE ROWS FAILING IS NOT A ZERO EITHER, because tradeProfit below is what puts the
  // rent into a band. Answering off a null trade position prices a higher rate landlord's rent at
  // basic rate, which is a wrong figure rather than a missing one.
  if (tradeTotals === null) return LANE_UNREADABLE;

  const tradeProfit = Math.max(0, tradeTotals.income - tradeTotals.expenses - totals.rents + totals.expenses + totals.finance);
  const d = aprilDelta({
    employmentIncome: profile?.employmentIncome ?? 0,
    tradeProfit,
    rents: totals.rents,
    propertyExpenses: totals.expenses,
    financeCosts: totals.finance,
    jointShare: 1,
  });
  // 🔴 THE SCOTLAND LINE TRAVELS WITH THE FIGURE, ON EVERY CHANNEL, AND IT NEVER DID BEFORE.
  // taxCausedByProperty is his rent stacked on his trade profit at the England, Wales and Northern
  // Ireland rates. test/scotland.test.mjs section 3 asked the question the moment this read moved
  // out of the webhook: that route produced this number, said nothing about it, and passed the
  // ratchet because the same file says the sentence on the totals lane. propertyAnswer puts it on
  // the branch that carries a figure and on no other.
  return propertyAnswer(totals.rents, d.now.taxCausedByProperty, d.extraPerYear, properties.length, SCOTLAND_LINE, channel);
}

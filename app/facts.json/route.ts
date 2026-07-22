// Serves /facts.json: every tax constant Lekhio computes with, as machine readable JSON.
//
// WHO READS THIS. Khoji, the knowledge watcher on the Mac mini (docs/105). Once a night it
// fetches this file, fetches the primary GOV.UK page for each figure, and compares the two.
// When they disagree it raises an incident. That comparison is the entire reason Khoji exists:
// anyone can scrape GOV.UK, but only we can say "GOV.UK says 55p and OUR CODE says 45p".
//
// WHY A ROUTE AND NOT A VENDORED facts.json ON THE MINI. A copied file needs a sync step, and a
// sync step that is skipped once leaves the differ checking last month's engine against this
// month's law and reporting all clear. There is no sync step here. This is generated from the
// same FACTS object the calculator, the app and the WhatsApp answers use, at build time, so it
// is the engine or it is nothing.
//
// WHY NOT REUSE /llms.txt (which doc 105 suggested). llms.txt is prose written for language
// models. Parsing "£12,570" back out of an English sentence means writing a second fragile
// extractor and pointing it at ourselves, and it only carries seven figures. This carries all
// of them, exactly, with no parsing. llms.txt stays as it is and stays tested against FACTS.
//
// DIRECTION OF TRAVEL. The mini reaches into production. Production NEVER reaches out to the
// mini (docs/105 rule 2). A power cut in a flat must not take down tax answers for anyone.
//
// IS THIS SAFE TO PUBLISH? Yes. Every value below is published UK tax law. It is on GOV.UK. We
// already print most of it in /llms.txt and on the free calculators. There is nothing here that
// is ours except the decision of which figures to hold.

import { FACTS, TAX_YEAR, TAX_YEAR_VALID_UNTIL } from '../../lib/taxengine';
import { STUDENT_PLANS } from '../../lib/nistudentloan';
import { LTD } from '../../lib/ltdengine';
import { refreshFactsFromDb } from '../../lib/supabase';

export const dynamic = 'force-dynamic';

// The file lib/taxengine.ts lives at, as the differ should report it to a human. If the engine
// moves, this string moves with it, because an incident that says "fix line 70 of a file that no
// longer exists" is an incident nobody can act on.
const ENGINE_FILE = 'lib/taxengine.ts';

// PARITY. The sole trader maths is duplicated by hand in the mobile app (see the warning at the
// top of lib/taxengine.ts). Any drift the differ finds has to be fixed in BOTH files or the app
// and the website will quietly disagree about a man's tax bill. The differ prints both paths.
const PARITY_FILE = 'tradebook-app/lib/tax.ts';

// EVERY CONSTANT WE HOLD, NOT JUST THE ONES IN FACTS.
//
// The differ originally read only `FACTS`, because `FACTS` is where the tax engine keeps its
// numbers. But we keep tax numbers in three OTHER engines too, and the differ could not see any
// of them:
//
//   lib/nistudentloan.ts   five repayment thresholds and two rates
//   lib/ltdengine.ts       corporation tax, dividend rates, employer NI
//   lib/propertyengine.ts  the April 2027 property rates and Section 24
//
// Meanwhile /api/health was reporting "knowledge: ok", which any reader would take to mean OUR TAX
// NUMBERS ARE RIGHT. It meant sixteen of them were. That is not a lie, but it is the kind of green
// light that turns into one, and doc 104's fifth standing question is "is it true", not "is it
// defensible".
//
// So everything is published here, flattened into one namespace, and the differ checks whatever it
// has an extractor for. A constant with no extractor is a KNOWN GAP, and the point of publishing it
// is that the gap is now countable instead of invisible.
//
// NOT PUBLISHED, and this is deliberate: the April 2027 property rates (22/42/47) and the Section 24
// credit rate. They are FUTURE law. There is no live GOV.UK page stating them as current, so there
// is nothing to subtract from, and a check that cannot fail is theatre. They go in when they land.
function buildAll() {
  return {
  ...FACTS,

  // Student loans. The thresholds a self-employed person repays over through Self Assessment.
  studentPlan1Threshold: STUDENT_PLANS.plan1.threshold,
  studentPlan2Threshold: STUDENT_PLANS.plan2.threshold,
  studentPlan4Threshold: STUDENT_PLANS.plan4.threshold,
  studentPlan5Threshold: STUDENT_PLANS.plan5.threshold,
  studentPostgradThreshold: STUDENT_PLANS.postgrad.threshold,
  studentPlanRate: STUDENT_PLANS.plan1.rate,        // 9% on plans 1, 2, 4 and 5
  studentPostgradRate: STUDENT_PLANS.postgrad.rate, // 6% on a postgraduate loan

  // Limited company. Used by the sole trader vs limited advice, which tells a man whether to
  // incorporate. A wrong rate here changes a life decision, not just a number on a form.
  ctSmallRate: LTD.ctSmallRate,
  ctMainRate: LTD.ctMainRate,
  ctSmallLimit: LTD.ctSmallLimit,
  ctUpperLimit: LTD.ctUpperLimit,
  ctMarginalFraction: LTD.ctMarginalFraction,
  dividendAllowance: LTD.dividendAllowance,
  dividendBasic: LTD.dividendBasic,
  dividendHigher: LTD.dividendHigher,
  dividendAdditional: LTD.dividendAdditional,
  employerNIRate: LTD.employerNIRate,
  employerSecondaryThreshold: LTD.employerSecondaryThreshold,

  // 🔴 THE LOWER EARNINGS LIMIT. PUBLISHED, AND THEREFORE WATCHED, FROM TODAY.
  //
  // It was £6,708, written as a bare literal in four places across two repos, published nowhere and
  // checked by nothing, while every other limited-company constant beside it was checked against
  // GOV.UK nightly.
  //
  // It is the salary at which a director's year still counts toward his STATE PENSION although he
  // pays no National Insurance on it. It is the entire reason we recommend that rung. Move it in a
  // Budget without moving our copy and we would spend a year telling every director on the product
  // to pay himself just UNDER the limit, and each of them would quietly lose a qualifying year worth
  // roughly £300 a year for the rest of his life, and nothing anywhere would have gone red.
  lowerEarningsLimit: LTD.lowerEarningsLimit,

  // THE INCOME AT WHICH 40% STARTS. PUBLISHED EXPLICITLY, AND HERE IS WHY.
  //
  // The mobile app calls this `higherThreshold`. It is £50,270, and so is `class4UpperLimit`, and
  // they are NOT THE SAME THING. One is where higher-rate income tax begins; the other is where
  // Class 4 National Insurance drops to 2%. They have happened to coincide for years.
  //
  // If the app had simply been pointed at `class4UpperLimit` because the number matched, then the
  // first Budget that decoupled them would feed a National Insurance threshold into an income tax
  // calculation, on every phone, silently, and every one of our alarms would stay green because
  // both files would still "agree".
  //
  // So it is derived from what it actually means, and published under the name the app uses.
  higherRateThreshold: FACTS.personalAllowance + FACTS.basicRateBand,
  };
}

function buildBody(): string {
  return JSON.stringify(
  {
    _comment:
      'Every tax constant Lekhio computes with, generated from the engines themselves. Read by Khoji (docs/105), which fetches this, fetches the primary GOV.UK page for each figure, and raises an incident when they disagree. We prepare, the user approves. Not HMRC, not endorsed by HMRC.',
    taxYear: TAX_YEAR,
    validUntil: TAX_YEAR_VALID_UNTIL,
    engineFile: ENGINE_FILE,
    parityFile: PARITY_FILE,
    generatedFrom: ['lib/taxengine.ts FACTS', 'lib/nistudentloan.ts STUDENT_PLANS', 'lib/ltdengine.ts LTD'],
    notPublished: 'lib/propertyengine.ts April 2027 rates: future law, no live GOV.UK page to check against yet',
    facts: buildAll(),
  },
  null,
  2,
  );
}

export async function GET() {
  // Serve LIVE facts: an approved override is reflected here too, so Khoji compares GOV.UK to what the
  // engine actually uses now, not a value baked at build time. Falls back to defaults on any read fail.
  await refreshFactsFromDb();
  return new Response(buildBody(), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

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

export const dynamic = 'force-static';

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
const ALL = {
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
  dividendAllowance: LTD.dividendAllowance,
  employerNIRate: LTD.employerNIRate,
  employerSecondaryThreshold: LTD.employerSecondaryThreshold,
} as const;

export const BODY = JSON.stringify(
  {
    _comment:
      'Every tax constant Lekhio computes with, generated from the engines themselves. Read by Khoji (docs/105), which fetches this, fetches the primary GOV.UK page for each figure, and raises an incident when they disagree. We prepare, the user approves. Not HMRC, not endorsed by HMRC.',
    taxYear: TAX_YEAR,
    validUntil: TAX_YEAR_VALID_UNTIL,
    engineFile: ENGINE_FILE,
    parityFile: PARITY_FILE,
    generatedFrom: ['lib/taxengine.ts FACTS', 'lib/nistudentloan.ts STUDENT_PLANS', 'lib/ltdengine.ts LTD'],
    notPublished: 'lib/propertyengine.ts April 2027 rates: future law, no live GOV.UK page to check against yet',
    facts: ALL,
  },
  null,
  2,
);

export function GET() {
  return new Response(BODY, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

// Serves /rules.json: every claim rule Lekhio asserts, and the HMRC page that authorises it.
//
// WHO READS THIS. Khoji, on the Mac mini (docs/105, Phase 3). Every night it fetches this file,
// fetches each cited GOV.UK page, and checks that the exact sentence we rest our rule on is STILL
// THERE, word for word. HMRC rewrites its manuals constantly. The day "You should disallow
// expenditure on ordinary clothing" changes, our rule about everyday clothes has lost its footing
// and nothing else in the world would tell us.
//
// It is /facts.json's twin. That one subtracts numbers. This one checks that the ground under our
// prose has not moved.
//
//     /facts.json   we say 0.55, GOV.UK says 0.55            -> subtract
//     /rules.json   we say 'no',  BIM37910 says "disallow"   -> is the sentence still on the page
//
// WHY IT IS PUBLIC. Three reasons and the third is the real one.
//   1. Khoji needs it, and a route generated from the engine cannot drift from the engine.
//   2. Every word in it is Crown copyright under the Open Government Licence v3.0. It is HMRC's
//      text, and quoting it with attribution is licensed.
//   3. IT IS THE PRODUCT. Doc 104: "Honesty is not a constraint we tolerate. It is the product we
//      are selling." Any assistant, any accountant, any competitor, and above all any customer can
//      read exactly what we tell people they can claim and exactly which line of which HMRC page we
//      are standing on. Nobody else in this category will publish that, because most of them cannot.
//
// UNCITED RULES ARE LISTED, NOT HIDDEN. A rule with no source is a thing we assert on our own
// authority, and our authority is nothing. The count is in the body. It is there to be closed.

import { EXPENSE_RULES } from '../../lib/taxrules';
import { RULE_SOURCES } from '../../lib/rulesources';
import { synthesise } from '../../lib/synthesis';

export const dynamic = 'force-static';

const rules = EXPENSE_RULES.map((r) => ({
  key: r.key,
  title: r.title,
  verdict: r.verdict,
  rule: r.rule,
  sources: RULE_SOURCES[r.key] ?? [],

  // 🔴 HOW MUCH AUTHORITY DOES THIS RULE ACTUALLY CARRY? PUBLISHED, BECAUSE IT IS THIN.
  //
  // 'statute'   Parliament wrote it. This is the law.
  // 'precedent' A court decided what it means. It binds HMRC.
  // 'guidance'  HMRC said so, and nothing else. It is not the law, and HMRC has been wrong before.
  //
  // SEVENTEEN OF OUR TWENTY-FIVE RULES SAY 'guidance'. That is the honest number and it is worth
  // publishing, because the alternative is letting every reader assume we have a statute behind
  // every answer. We do not. "HMRC says so" is a perfectly respectable position and it is a
  // completely different one from "the House of Lords decided this", and the man signing the return
  // is entitled to know which he has been handed.
  //
  // (The first version of the classifier that produced this field counted HMRC page titles as
  // statutes and reported 15. It was wrong in the direction that flatters us. A number that flatters
  // you is the one to check twice.)
  restsOn: synthesise(r.key)?.restsOn ?? null,
}));

const uncited = rules.filter((r) => r.sources.length === 0).map((r) => r.key);

export const BODY = JSON.stringify(
  {
    _comment:
      'Every expense rule Lekhio asserts, and the HMRC page and exact sentence that authorises it. Read by Khoji, which checks nightly that each quote is still on the page. HMRC text is Crown copyright under the Open Government Licence v3.0. We prepare, the user approves. Not HMRC, not endorsed by HMRC.',
    ruleFile: 'lib/taxrules.ts',
    sourceFile: 'lib/rulesources.ts',
    total: rules.length,
    cited: rules.length - uncited.length,
    // Said out loud, on a public URL, because a gap you can count is a gap you will close, and a
    // gap you cannot see becomes the mileage rate.
    uncited,
    rules,
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

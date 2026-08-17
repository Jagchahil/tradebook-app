// ═══════════════════════════════════════════════════════════════════════════════════════════════
// SCOTLAND. ONE SENTENCE, DEFINED ONCE, SAID ONLY WHERE A SCOT WOULD OTHERWISE BE MISLED.
//
// Income tax rates and bands above the personal allowance are devolved to the Scottish Parliament,
// and they are not the same as the ones this product computes with. lib/taxengine.ts FACTS carries
// the England, Wales and Northern Ireland figures and says so in its own header. It holds no
// Scottish bands, and this release does not add any.
//
// So a Scottish sole trader paying for Lekhio today is handed a set aside, a quarter pack and a
// lender document worked at rates that are not his, and nothing on any screen says so. The decision
// taken on 8 August 2026 was to SAY IT rather than to guess it: no new question, no new step, no
// arithmetic change anywhere. Disclosure only, until the bands are actually modelled.
//
// ⚠️ THE SENTENCE LIVES HERE, NOT IN THE PAGES, for the same reason setAsideBasisLine lives in
// lib/taxoptimiser.ts: what we are willing to claim about a man's tax is not a presentation
// decision. app/tax-calculator/Calc.tsx already carried a hand written version of this caveat and
// no other surface did, which is exactly how one caveat becomes nine slightly different caveats and
// then eight missing ones. That copy now reads this constant.
//
// ⚠️ WHAT IT MUST NOT SAY. Each of these is held by test/scotland.test.mjs:
//   . It must not claim we know where he lives. We do not ask him and we do not detect it, and a
//     sentence implying otherwise turns a caveat into a false statement about our own product.
//   . It must not put a date on the Scottish rates. We have not committed to one, and a promised
//     month that slips is worse than no month.
//   . It must not send him elsewhere. Telling a paying customer to go and read the rates himself is
//     handing back the job he bought.
//   . It must not price what Scotland would change. That is a number we cannot compute, which is
//     the whole reason this sentence exists.
//
// ⚠️ AND IT IS NOT ON EVERY SCREEN. Doc 103: a feature is not free because it is small, and every
// row is a thing he has to read and reject before he reaches what he came for. The bar applied was
// "would a Scot be misled by THIS number if the line were absent", which lands it on the money he
// banks against, on everything that leaves the product on paper for a lender or an accountant, and
// on the free tools a stranger meets exactly once. It stays OFF the levers, the what if, the CIS
// and pay yourself screens one tap behind a screen that already carries it, and off every surface
// whose figures are UK wide anyway (National Insurance, VAT, student loans, rent a room, and the
// income, expenses and profit totals on the shared books).
//
// test/scotland.test.mjs holds that list BY EQUALITY, in both directions, and derives it from the
// files on disk. Adding a tenth surface without a decision fails. Removing one fails. And the day
// lib/taxengine.ts learns the Scottish bands, the same suite goes red and tells whoever did it to
// delete this file rather than leave a coming soon notice under a figure that has arrived.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export const SCOTLAND_LINE =
  'Income tax is worked out at the England, Wales and Northern Ireland rates, and Scottish rates are coming to Lekhio.';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE DETERMINISTIC ANSWER. B16, 17 August 2026, AND IT IS WHY THIS FILE HAS A SECOND EXPORT.
//
// B2 walked a Glasgow sole trader and caught the conversational lanes STATING SCOTTISH TAX LAW OF
// THEIR OWN. Two answers, one account, minutes apart: "you're in Scotland so your tax rates are the
// same as the rest of the UK", which is false, and then a band table with a 41% higher rate, a 46%
// top rate and no advanced rate, which matches no tax year in force.
//
// B2's fix was to move the governing rule into the block both system prompts spread, so that one
// rule reaches both channels and cannot go missing from one of them. That was the right repair and
// it is MITIGATION, not a gate. The walk found the model disobeying the rule it already had, and a
// sentence in a prompt cannot make it obey. The durable fix for a question with ONE correct answer
// is to answer it from code and never ask the model at all.
//
// ⚠️ SO THIS CONSTANT IS THE ANSWER, AND IT LIVES HERE RATHER THAN IN THE ROUTERS OR IN
// lib/waintents.ts, for the same reason SCOTLAND_LINE does: what this product is willing to claim
// about a man's tax is not a routing decision and not a presentation decision. The matcher that
// recognises the question is a language judgement and lives in lib/waintents.ts beside every other
// intent. The words live here, under the four rules above, which bind this sentence exactly as they
// bind SCOTLAND_LINE:
//   . it does not claim we know where he lives, so it reads as a fact about the product,
//   . it puts no date on the Scottish rates,
//   . it sends him nowhere, and above all
//   . IT PRICES NOTHING. No band, no threshold, no percentage, not even to compare.
//
// ⚠️ THE SECOND SENTENCE EARNS ITS PLACE AND IS NOT DECORATION. A man told his income tax is worked
// at somebody else's rates asks the obvious next thing, which is whether the rest of his figures
// are wrong too. National Insurance and VAT are reserved rather than devolved, so they are the same
// for him, and his student loan is decided by the plan he is on and not by his address. Plan 4 is
// named because it is the Scottish plan, this product computes it exactly, and /app/tax/student-loan
// already offers it by name. Answering the anxious follow up in the same breath is cheaper than
// making him ask it, and doc 103's bar is met: it is the difference between a caveat and an answer.
//
// ⚠️ NO FIGURE OF ANY KIND MAY ENTER THIS STRING. test/scotland.test.mjs section 2d holds it: no
// percent sign, no pound sign, and no number of two digits or more, so every Scottish band (19, 20,
// 21, 42, 45, 48) and every threshold is excluded by shape rather than by a list somebody has to
// keep. The single digit in "plan 4" is the only number allowed through, and it is a plan name.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export const SCOTTISH_RATES_ANSWER =
  `${SCOTLAND_LINE} National Insurance and VAT are the same wherever you are in the UK, and your `
  + 'student loan is worked out from the plan you are on, which includes plan 4.';

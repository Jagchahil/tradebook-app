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

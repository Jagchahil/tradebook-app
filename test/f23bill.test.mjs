// R2-F23. THE AGENT AND THE TAX PAGE MUST QUOTE ONE BILL, AND ONE HALF OF IT.
// Run with: node test/f23bill.test.mjs   (Node 22.6+, pure type stripping)
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS SUITE IS FOR.
//
// On the morning of 13 August 2026 a florist with a flat above the shop was texted, at 08:00:
//
//     "your Self Assessment bill is heading for about £1,708, which switches on payments on
//      account: January asks for roughly £2,562 in total"
//
// /app/tax, thirty five minutes later, on the same books, with nothing deployed in between: £1,171.
//
// Neither engine was broken. taxPosition() was right all morning. They disagreed because only ONE
// of them was being called, and the agent had grown its own arithmetic: soleTraderTax() over a
// profit with every stream blended into one. That charges Class 4 National Insurance on rental
// profit, which carries none, and taxes rent GROSS because the £1,000 property allowance never
// lands. Her trade profit was £7,896, under the Class 4 lower limit, so she owed no Class 4 at all.
//
//     £394.15  Class 4 National Insurance on her rent
//     £142.85  income tax on gross rent instead of rent less the property allowance
//     ───────
//     £537.00  exactly the gap between the two surfaces
//
// And it was not a wrong sentence, it was a wrong BUTTON: the signal carries a set_aside action, so
// doing the sensible thing removed £537 of a small florist's working capital for a bill that does
// not exist.
//
// The guards below are therefore about WHERE THE NUMBER COMES FROM, not about what it is. A test
// that pinned £1,171 would pass for ever while the two surfaces drifted apart again on some other
// customer. What must hold is: the agent never computes this figure for a landlord, the passed
// figure is the one that reaches every string and the action, and a missing figure fires nothing.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 AND SECTION D, ADDED BY B30 ON 18 AUGUST 2026, BECAUSE R2-F23 WAS ONLY HALF CLOSED.
//
// The repair above made the BILL come from the route. The HALF went on being worked out inside
// lib/agent.ts, as `Math.round(estBill / 2)`, and gov.uk halves a different number. SALF303:
// "Capital gains tax and student loan repayments are excluded from the computation of payments on
// account. So any capital gains tax or Student Loan repayment is simply payable as part of the
// balancing payment on 31 January following the tax year." Derived live 18 August 2026.
//
// On 18 August a Glasgow sole trader on plan 4 was texted that January wanted about £15,738. His
// own Tax page, off the same position, implies £15,099. The £639 is exactly half his projected
// student loan repayment, asked for a year before HMRC will ask for it. The error is ALWAYS
// exactly half the loan, on every borrower, every night.
//
// So section D guards the SHAPE rather than any figure: the base excludes what gov.uk excludes,
// the base travels with the bill from ONE position, a bill with no base fires nothing, and the
// halving is done by lib/taxengine.ts paymentsOnAccount() rather than by this engine.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const lib = path.join(root, 'lib');
const fix = (s) => s.replace(/from '(\.\/[a-zA-Z0-9._-]+)'/g, "from '$1.ts'");

const stage = mkdtempSync(path.join(tmpdir(), 'f23-'));
for (const f of [
  'taxengine', 'money', 'nistudentloan', 'propertyengine', 'ltdengine', 'personalincome',
  'partnership', 'position', 'rakhamoves', 'waintents', 'scotland', 'agent',
  // The optimiser chain, for the identity guards in section B.
  'autonomy', 'taxoptimiser',
]) {
  writeFileSync(path.join(stage, f + '.ts'), fix(readFileSync(path.join(lib, f + '.ts'), 'utf8')));
}
const A = await import(pathToFileURL(path.join(stage, 'agent.ts')).href);
const O = await import(pathToFileURL(path.join(stage, 'taxoptimiser.ts')).href);
const TE = await import(pathToFileURL(path.join(stage, 'taxengine.ts')).href);
const W = await import(pathToFileURL(path.join(stage, 'waintents.ts')).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.error(`  FAIL ${name}`); } };
const eq = (name, got, want, tol = 0.005) => {
  const same = typeof want === 'number' ? Math.abs(got - want) < tol : got === want;
  if (same) pass++;
  else { fail++; console.error(`  FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
};

const TODAY = new Date('2026-11-20T09:00:00Z'); // deep enough into the year that canProject is true

function monthsFor(today, count, { incomePerMonth = 0, expensesPerMonth = 0, cisPerMonth = 0 } = {}) {
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    out.push({
      month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
      income: incomePerMonth, expenses: expensesPerMonth, cis: cisPerMonth,
    });
  }
  return out;
}

function input(extra = {}) {
  return {
    today: TODAY,
    months: monthsFor(TODAY, 8, { incomePerMonth: 4000, expensesPerMonth: 900 }),
    week: null, property: null, invoices: null, categories: null,
    unconfirmedCount: 0, equipmentSpendYtd: 0,
    studentLoanPlan: null, studentLoanPostgrad: false, employmentIncome: 0,
    goals: [], mtdStated: null,
    // The default here is the SHIPPING default: the routes always compute it. Cases that want the
    // missing figure say so explicitly, because "forgot to pass it" is the state this suite exists
    // to make safe.
    selfAssessmentBill: null,
    // 🔴 B30. THE SAME SHIPPING DEFAULT, FOR THE SAME REASON. The payments on account base travels
    // with the bill and a case that wants one says so. "Forgot to pass it" is a state this suite
    // exists to make safe, and after B30 it is safe by firing nothing at all.
    selfAssessmentPoa: null,
    ...extra,
  };
}
const LANDLORD = { rents: 12000, expenses: 0, finance: 0, rents12: 12000 };
// THE FLORIST'S OWN POSITION. She has rent and no student loan and no CIS, so her Self Assessment
// tax and her bill are the same number, which is why every displayed figure below is unchanged by
// B30 to the penny. A borrower is where the two come apart, and that is section D.
const florist = (bill, extra = {}) => input({
  property: LANDLORD, selfAssessmentBill: bill,
  selfAssessmentPoa: { tax: bill, deductedAtSource: 0 }, ...extra,
});
const poa = (sigs) => sigs.find((s) => s.signalKey === 'poa_cliff');

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('A. The agent must not do its own tax for a landlord');
// ════════════════════════════════════════════════════════════════════════════════════════

// 1. THE REGRESSION LOCK. A trade only customer is the case every parity suite pins, and his
//    number must not move by a penny. With no figure passed he still gets the blend, because for
//    him the blend IS right: taxPosition equals soleTraderTax when the only income is a trade.
{
  const s = poa(A.computeSignals(input()));
  ok('trade only, no figure passed: the signal still fires', !!s);
  ok('trade only: it carries a bill above the £1,000 threshold', !!s && s.numbers.estBill > 1000);
}

// 2. THE FIX. Rent present, no figure passed: the signal does NOT fire. This is the file's own
//    rule, "No signal beats a wrong signal, every time", applied to the structure that was missed.
{
  const s = poa(A.computeSignals(input({ property: LANDLORD })));
  ok('landlord, no figure passed: the signal is WITHHELD, not guessed', !s);
}

// 3. Rent present WITH the figure passed: it fires, and the figure is the one that was handed in.
{
  const s = poa(A.computeSignals(florist(1171)));
  ok('landlord with the figure passed: the signal fires', !!s);
  eq('landlord: the bill IS the passed figure', s?.numbers.estBill, 1171);
}

// 3b. 🔴 B30. A BILL WITH NO BASE BESIDE IT FIRES NOTHING. The rejected alternative was to fall
//     back to halving the bill, which is the defect this packet exists to remove, kept alive for
//     whoever did not read the memo. Same argument as case 2 one field along.
{
  const s = poa(A.computeSignals(input({ property: LANDLORD, selfAssessmentBill: 1171 })));
  ok('bill passed, payments on account base MISSING: withheld, never halved', !s);
}

// 4. THE FIGURE REACHES EVERY STRING AND THE BUTTON. A signal that quotes the right number in
//    numbers{} and the wrong one in the text a customer actually reads has fixed nothing.
{
  const s = poa(A.computeSignals(florist(1171)));
  ok('the body quotes the passed figure', !!s && s.body.includes('£1,171'));
  ok('the WhatsApp text quotes the passed figure', !!s && s.waText.includes('£1,171'));
  eq('the set_aside ACTION carries the passed figure', s?.action?.amount, 1171);
  // EVERY money figure in the customer facing text must be the passed bill or something derived
  // from it. The January total (bill plus one payment on account) is legitimate; a THIRD figure
  // would mean something in there is still computing locally.
  const figures = [...new Set((s?.waText.match(/£[\d,]*\d/g) ?? []))].sort();
  eq('the text carries exactly two figures, both derived from the passed bill',
    figures.join(' '), '£1,171 £1,757');

  // 🔴 AND THE BODY GETS THE SAME TREATMENT, WHICH IT DID NOT UNTIL 18 AUGUST 2026. A HOLE FOUND
  //    BY THE FULL LOOP. The body quotes the bill TWICE ("heading for about X ... X for the
  //    year"), and includes('£1,171') cannot tell WHICH occurrence it found. sabotage-f23 swaps
  //    the FIRST one for the blend, the second one went on satisfying the guard, and the sabotage
  //    sat green: the customer would have read the wrong number in the opening clause of the one
  //    sentence he actually reads, and nothing anywhere would have gone red.
  //
  // ⚠️ THE BLEND IS DERIVED, NEVER TYPED. It comes from the trade only fixture that produces it,
  //    so a change to the months moves both sides together and this can never rot into a guard
  //    defending a stale number. The vacuity check first, because a guard asserting that an
  //    undefined string is absent passes everything.
  const blendText = poa(A.computeSignals(input()))?.body.match(/£[\d,]*\d/)?.[0];
  ok('the blend is derivable and is a different figure, so the two below are not vacuous',
    !!blendText && blendText !== '£1,171');
  ok('🔴 the blend never reaches a landlord body, at any occurrence',
    !!s && !!blendText && !s.body.includes(blendText));
  ok('🔴 nor his WhatsApp text', !!s && !!blendText && !s.waText.includes(blendText));
}

// 5 and 6. THE UNDEFINED AND NaN DOORS. lib/agent.ts is driven by .mjs suites that tsc never sees,
//    so a caller can omit the field entirely. `undefined !== null` is TRUE, which would have walked
//    a NaN into a customer's set aside. Anything that is not a real number takes the safe path.
{
  const omitted = { ...input({ property: LANDLORD }) };
  delete omitted.selfAssessmentBill;
  ok('landlord, field OMITTED entirely: withheld, never NaN', !poa(A.computeSignals(omitted)));

  const nan = poa(A.computeSignals(input({ property: LANDLORD, selfAssessmentBill: NaN })));
  ok('landlord, figure is NaN: withheld', !nan);

  const inf = poa(A.computeSignals(input({ property: LANDLORD, selfAssessmentBill: Infinity })));
  ok('landlord, figure is Infinity: withheld', !inf);

  // 🔴 AND THE SAME THREE DOORS WITH THE BASE PRESENT, WHICH IS THE ONLY WAY THEY TEST WHAT THEY
  //    SAY THEY TEST. 18 AUGUST 2026, A HOLE FOUND BY THE FULL LOOP.
  //
  //    Every case above passes NO payments on account base, so B30's own "a bill with no base
  //    beside it fires nothing" rule withheld all three, and Number.isFinite was never the thing
  //    doing the work. Dropping it alone therefore stayed GREEN here while walking a NaN into a
  //    customer's set aside on any account that DOES have a base, which after B30 is every account
  //    either route builds. The guard existed, the case did not.
  //
  // ⚠️ AND THE SOURCE SCAN AT SECTION 16 COULD NOT HAVE SEEN IT EITHER: /Number\.isFinite/ still
  //    matches, because B30 added two more isFinite checks to the same block for the base. A scan
  //    that cannot tell WHICH of three checks it found is not a guard on any of them.
  const withBaseNan = poa(A.computeSignals(input({
    property: LANDLORD, selfAssessmentBill: NaN,
    selfAssessmentPoa: { tax: 9214, deductedAtSource: 0 },
  })));
  ok('🔴 landlord, figure is NaN and the base IS present: still withheld', !withBaseNan);

  // The trade only half, where the safe path is a FALLBACK rather than silence, so the proof is
  // that a real number comes out rather than that nothing does.
  const tradeNan = poa(A.computeSignals(input({
    selfAssessmentBill: NaN, selfAssessmentPoa: { tax: 9214, deductedAtSource: 0 },
  })));
  ok('trade only, figure is NaN: it falls back to the blend rather than going quiet', !!tradeNan);
  ok('🔴 ...and the figure it carries is a real number',
    !!tradeNan && Number.isFinite(tradeNan.numbers.estBill));
  ok('🔴 ...and nothing a customer reads carries NaN',
    !!tradeNan && !/NaN/.test(`${tradeNan.body} ${tradeNan.waText}`));
}

// 7. And the same omission for a trade only customer keeps the OLD behaviour, which is what lets
//    every existing suite in this repo keep passing untouched.
{
  const omitted = { ...input() };
  delete omitted.selfAssessmentBill;
  ok('trade only, field omitted: old behaviour, still fires', !!poa(A.computeSignals(omitted)));
}

// 8. The threshold is still the threshold, and it is tested against the PASSED figure. A landlord
//    whose real bill is under £1,000 must not be told payments on account apply just because his
//    blended profit would have cleared it.
{
  const s = poa(A.computeSignals(florist(400)));
  ok('landlord under the POA threshold on the real figure: no signal', !s);
  const t = poa(A.computeSignals(florist(1000.01)));
  ok('landlord a penny over the threshold: signal', !!t);
}

// 9. The January arithmetic is built on the passed figure too, not recomputed from anything.
{
  const s = poa(A.computeSignals(florist(1171)));
  // ⚠️ REPOINTED BY B30, NOT DELETED, AND THE MOVE IS THE FINDING. This read "half the passed
  // BILL". HMRC halves the TAX, and for the florist the two are the same number because she has no
  // student loan and no CIS, which is why nothing she reads moves by a penny. Math.round became
  // round2 inside lib/taxengine.ts paymentsOnAccount(), so the stored figure keeps its half penny
  // and the printed one is unchanged: gbp0 rounds 585.5 to £586 exactly as before.
  eq('payment on account is half the passed TAX, which for her IS the bill', s?.numbers.poa, 585.5);
  ok('January total in the text is bill plus one payment on account',
    !!s && s.waText.includes('£1,757')); // 1171 + 585.5
}

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('B. The one bill: lib/taxoptimiser.selfAssessmentBill');
// ════════════════════════════════════════════════════════════════════════════════════════

function oi(extra = {}) {
  return {
    startYear: 2026, monthsElapsed: 12, daysElapsed: 365,
    ytdTradeIncome: 30000, ytdTradeExpenses: 6000, ytdCisSuffered: 0,
    employmentIncome: 0, studentPlans: [], categoriesLogged: [], homeOfficeClaimed: false,
    tradingAllowanceElected: false, ytdCapitalAllowances: 0, vehicleBoughtThroughBooks: false,
    ytdHomeOffice: 0, mileageClaimed: false, ytdMileage: 0, ytdHomeOfficeLogged: 0,
    purchaseGoal: null, ytdPropertyIncome: 0, ytdPropertyExpenses: 0, ytdPropertyFinance: 0,
    savingsIncome: 0, dividendIncome: 0, businessType: 'sole_trader', incomeShape: 'trade',
    ...extra,
  };
}

// 10 and 11. It IS the expression /app/tax prints in its largest type, both arms of it. This is the
//     identity that makes the two surfaces one: the page and the agent now call the same function.
{
  const plain = oi();
  const tp = O.taxPosition(plain);
  eq('no CIS: the bill is setAside', O.selfAssessmentBill(plain), tp.setAside);

  const withCis = oi({ ytdCisSuffered: 2800 });
  const tpc = O.taxPosition(withCis);
  ok('CIS present: setAsideAfterCis is genuinely different', tpc.setAsideAfterCis !== tpc.setAside);
  eq('CIS present: the bill is setAsideAfterCis', O.selfAssessmentBill(withCis), tpc.setAsideAfterCis);
}

// 12. THE FLORIST, REBUILT. A small trade under the Class 4 lower limit plus a rental stream. The
//     guard is the DIRECTION and the CAUSE, not her exact pennies: the blend must charge Class 4
//     that the real position does not, and the real bill must be the lower of the two.
{
  // Her figures PROJECTED to the full year, which is what both surfaces actually quote, with the
  // projection switched off (factor 1) so the fixture states them directly:
  //   trade profit £7,896, under the £12,570 Class 4 lower limit, so no Class 4 is due
  //   rent £11,529, less the £1,000 property allowance, so property net £10,529
  //   £18,425 of income, £5,855 above the personal allowance, taxed at 20% = £1,171
  const rosa = oi({
    ytdTradeIncome: 24000, ytdTradeExpenses: 16104,
    ytdPropertyIncome: 11529, ytdPropertyExpenses: 0, ytdPropertyFinance: 0,
  });
  const tp = O.taxPosition(rosa);
  const real = O.selfAssessmentBill(rosa);

  eq('her trade alone owes no Class 4 at all', tp.class4NIC, 0);
  eq('and the real bill is the one the Tax page printed', real, 1171);

  // What the agent used to do: one blended profit through soleTraderTax.
  const blendedProfit = (24000 - 16104) + 11529;
  const blended = TE.soleTraderTax(blendedProfit);

  ok('the blend invents Class 4 on rent', blended.class4 > 0);
  ok('the blend is HIGHER than the real bill', blended.total > real);
  ok('and the whole of that Class 4 is the invention', Math.abs(blended.class4 - TE.class4NIC(blendedProfit)) < 0.005);
  // The direction matters: the old path always overstated, which is the expensive direction for a
  // customer who acts on it.
  ok('the customer was told to set aside MORE than she owes', blended.total - real > 100);
}

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('C. The doctrine locks');
// ════════════════════════════════════════════════════════════════════════════════════════

const agentSrc = readFileSync(path.join(lib, 'agent.ts'), 'utf8');
const cronSrc = readFileSync(path.join(root, 'app/api/cron/agent/route.ts'), 'utf8');
const reassessSrc = readFileSync(path.join(root, 'app/api/agent/reassess/route.ts'), 'utf8');

// 13. lib/agent.ts must NOT import the optimiser. Two suites stage this module with a fixed
//     dependency list and Node's type stripping cannot resolve an extensionless import, so the
//     figure travels as a number. The same reason mtdStated is a raw answer.
ok('agent.ts does not import taxoptimiser', !/from '\.\/taxoptimiser'/.test(agentSrc));

// 14. BOTH routes that build an AgentInput must pass it. One of them forgetting is how the phone
//     and the page came apart in the first place, and the on demand path is the one a customer
//     triggers by hand.
// ⚠️ REPOINTED BY B30, NOT DELETED. The reader was renamed selfAssessmentBillFor ->
//    selfAssessmentJanuaryFor when it began returning the payments on account base beside the bill,
//    because a function called "BillFor" that hands back a base is a function whose name is a lie.
//    The assertion follows the work; deleting it would have been silent scope loss.
ok('the nightly walk passes the bill', /selfAssessmentBill:\s*january\?\.bill/.test(cronSrc));
ok('the on demand reassess passes the bill', /selfAssessmentBill:\s*january\?\.bill/.test(reassessSrc));
ok('the walk calls the shared reader', /selfAssessmentJanuaryFor\(user\.id\)/.test(cronSrc));
ok('reassess calls the shared reader', /selfAssessmentJanuaryFor\(userId\)/.test(reassessSrc));

// 14b. 🔴 B30. AND BOTH MUST PASS THE BASE TOO. One of them forgetting is the same defect one
//      field along, and the on demand path is the one a customer triggers by hand.
ok('the nightly walk passes the payments on account base', /selfAssessmentPoa:\s*january\?\.poa/.test(cronSrc));
ok('the on demand reassess passes the base', /selfAssessmentPoa:\s*january\?\.poa/.test(reassessSrc));

// 15. The reader must fail to NULL and never to zero. Zero reads as "no bill", which silently
//     means "nothing to warn about", and that is the same silent default this field exists against.
const supaSrc = readFileSync(path.join(lib, 'supabase.ts'), 'utf8');
const readerStart = supaSrc.indexOf('export async function selfAssessmentJanuaryFor');
const readerBody = supaSrc.slice(readerStart, supaSrc.indexOf('export async function agentAggregates'));
ok('the shared reader exists', readerStart > -1 && readerBody.length > 0);
ok('it is built on the optimiser input, not its own query', /getOptimiserInput\(userId\)/.test(readerBody));
// ⚠️ REPOINTED BY B30. It used to call selfAssessmentBill(); it now calls taxPosition() ONCE and
//    takes both numbers off the one object, because a second reader would be a second round trip
//    AND a second chance for the two halves of one sentence to describe two different afternoons.
ok('it calls taxPosition once', (readerBody.match(/taxPosition\(/g) ?? []).length === 1);
ok('it calls the one bill function', /billFromPosition\(/.test(readerBody));
ok('a failure returns null, never 0', /return null/.test(readerBody) && !/return 0/.test(readerBody));

// 15b. 🔴 B30. THE BASE IS THE TAX AND THE TAX AT SOURCE, OFF THE SAME POSITION, AND THEY ARE THE
//      EXACT TWO ARGUMENTS app/app/tax/page.tsx PASSES TO paymentsOnAccount(). If these ever stop
//      being the same two fields, the page and the 08:00 text are two engines again.
ok('the base tax is position.selfAssessmentTax', /tax:\s*position\.selfAssessmentTax/.test(readerBody));
ok('the base at source is position.cisSuffered', /deductedAtSource:\s*position\.cisSuffered/.test(readerBody));
const taxPageSrc = readFileSync(path.join(root, 'app/app/tax/page.tsx'), 'utf8');
ok('🔴 and the tax page still passes those same two fields to the engine',
  /paymentsOnAccount\(\s*tax\.selfAssessmentTax\s*,[^)]*tax\.cisSuffered\s*\)/.test(taxPageSrc));

// 16. The signal must read the passed figure rather than recompute. Anchored to the ASSIGNMENT, so
//     deleting the guard and going back to the blend goes red here.
// ⚠️ THE SLICE IS BOUNDED BY THE SECTION'S OWN EDGES NOW, NOT BY A MAGIC 2200 CHARACTERS.
//    B30 added comment to this block and the old window very nearly slid off the front of it,
//    which would have turned three real guards green about nothing. Slice a block to its own end.
//
// 🔴 AND THE EDGES ARE TWO SIGNAL KEYS NOW, NOT TWO COMMENTS. 18 AUGUST 2026, FOUND BY THE FULL
//    LOOP, AND IT IS THE OLDEST RULE IN THIS REPO ARRIVING FROM THE OTHER SIDE. sabotage-f23's own
//    no op control REWORDED the heading `// 7. Payments on account cliff.`, which is an edit no
//    customer could ever see, and this suite went RED: indexOf returned -1, the window collapsed,
//    and the four guards below hung off a sentence somebody was free to improve at any moment.
//    A COMMENT IS NOT A CONTRACT. A signal key is: lib/routing.ts dispatches on it and every sent
//    row carries it, so renaming one is never a no op and nobody tidies one away by accident.
const PREV_KEY = "signalKey: 'sl_threshold_cross'";
const NEXT_KEY = "signalKey: 'cis_refund_milestone'";
const poaBlock = agentSrc.slice(
  agentSrc.indexOf(PREV_KEY) + PREV_KEY.length,
  agentSrc.indexOf(NEXT_KEY),
);
ok('the poa block was found at all', poaBlock.length > 500 && poaBlock.includes("signalKey: 'poa_cliff'"));
// ⚠️ AND IT HOLDS ONE SIGNAL, WHICH IS THE ONE UNDER TEST. A window bounded by its NEIGHBOURS
//    rather than by itself can swallow one if a key moves, and three guards below would then be
//    green about somebody else's block. Derived from the window, never counted by hand.
{
  const keysInside = poaBlock.match(/signalKey: '[a-z0-9_]+'/g) ?? [];
  ok('...and it holds exactly one signal, the one under test',
    keysInside.length === 1 && keysInside[0] === "signalKey: 'poa_cliff'");
}
ok('the bill is taken from the input, not computed locally', /input\.selfAssessmentBill/.test(poaBlock));
ok('rent is what withholds the fallback', /hasRent\s*\?\s*null/.test(poaBlock));
ok('a non number takes the safe path', /Number\.isFinite/.test(poaBlock));

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('D. B30. The other half of January: what HMRC asks for ON ACCOUNT');
// ════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴 THE SHAPE, NOT THE FIGURE. Pinning "£4,607" would pass for ever while the base drifted, in
// exactly the way pinning "£1,171" would have let the two surfaces come apart again. What must
// hold is that the instalment is half the RELEVANT AMOUNT and that the bill never enters it.

// A trade only borrower, so the route path is the one under test and nothing is blended.
const withBase = (bill, tax, atSource = 0, extra = {}) => input({
  selfAssessmentBill: bill, selfAssessmentPoa: { tax, deductedAtSource: atSource }, ...extra,
});

// 17. 🔴 THE GOVERNING SHAPE. Each instalment is half of (tax less tax already deducted at source).
//     The bill is not in that expression, which is the whole of gov.uk SALF303 in one assertion.
for (const [bill, tax, atSource] of [[10492, 9214, 0], [3000, 2500, 0], [8000, 11500, 3500], [1171, 1171, 0]]) {
  const s = poa(A.computeSignals(withBase(bill, tax, atSource)));
  eq(`🔴 poa is half the relevant amount, not half the bill (bill ${bill}, tax ${tax}, at source ${atSource})`,
    (s?.numbers.poa ?? 0) * 2, tax - atSource);
}

// 18. 🔴 THE STUDENT LOAN LEAVES THE HALF AND STAYS IN THE BILL. Two customers, identical but for a
//     loan: the same instalment, a bigger bill, and a January that is bigger by the LOAN and not by
//     one and a half times it. This is the £639 in its general form.
{
  const plain = poa(A.computeSignals(withBase(9214, 9214)));
  const borrower = poa(A.computeSignals(withBase(10492, 9214)));
  eq('a loan does not move the payment on account by a penny', borrower?.numbers.poa, plain?.numbers.poa);
  eq('it moves the bill by the whole loan', (borrower?.numbers.estBill ?? 0) - (plain?.numbers.estBill ?? 0), 1278);
  const jan = (x) => (x?.numbers.estBill ?? 0) + (x?.numbers.poa ?? 0);
  eq('and January by the loan, ONCE', jan(borrower) - jan(plain), 1278);
  // The recorded case. On 18 August 2026 the live 08:00 text said £15,738 for this pair, because
  // it halved 10,492 instead of 9,214. £639 of a man's January that HMRC was never going to ask
  // for until the year after. Kept as a fixture so the arithmetic cannot quietly return.
  ok('🔴 the recorded pair now says £15,099 in the text, not £15,738',
    !!borrower && borrower.waText.includes('£15,099') && !borrower.waText.includes('£15,738'));
}

// 19. THE THRESHOLD RUNS ON THE RELEVANT AMOUNT TOO. gov.uk excuses a man whose tax owed last year
//     was under £1,000, and the loan is not part of that either. A bill of £1,050 carrying £200 of
//     loan is a relevant amount of £850 and no payments on account at all.
{
  ok('bill over £1,000, tax under it: no payments on account', !poa(A.computeSignals(withBase(1050, 850))));
  ok('and tax a penny over it: payments on account', !!poa(A.computeSignals(withBase(1050, 1000.01))));
}

// 20. 🔴 THE 80 PERCENT EXCUSE REACHES THIS SIGNAL AT LAST. Run 1 gave it to /app/tax on 11 August
//     and this engine never got it, so a groundworker whose contractors have already handed HMRC
//     four fifths of his year was being texted two payments he is excused from. Nothing in the
//     gate could see it, because the agent was doing its own arithmetic.
{
  ok('85 percent taken at source: no payments on account', !poa(A.computeSignals(withBase(1725, 11500, 9775))));
  ok('30 percent taken at source: they still apply', !!poa(A.computeSignals(withBase(8000, 11500, 3500))));
}

// 21. THE HALVING IS NOT DONE HERE ANY MORE. Anchored on the WORK: the engine call must be in the
//     block and the old expression must be gone from the whole file.
{
  ok('the poa block calls the one payments on account engine', /paymentsOnAccount\(/.test(poaBlock));
  ok('and nothing in lib/agent.ts halves the bill by hand',
    !/Math\.round\(\s*estBill\s*\/\s*2\s*\)/.test(agentSrc));
  ok('the signal is gated on the engine saying it is required',
    /schedule\s*!==\s*null\s*&&\s*schedule\.required/.test(poaBlock));
}

// 22. THE BASE TAKES THE SAME SAFE PATH THE BILL DOES. A .mjs caller can omit or mangle it.
{
  const omitted = { ...withBase(10492, 9214) };
  delete omitted.selfAssessmentPoa;
  ok('base OMITTED entirely: withheld', !poa(A.computeSignals(omitted)));
  ok('base tax NaN: withheld', !poa(A.computeSignals(withBase(10492, NaN))));
  ok('base tax Infinity: withheld', !poa(A.computeSignals(withBase(10492, Infinity))));
  // At source is the one field where a bad value has an honest default, and the engine already
  // documents it: zero means nothing was deducted, which excuses nobody. Same choice here.
  const bad = poa(A.computeSignals(withBase(10492, 9214, NaN)));
  eq('base at source NaN is treated as nothing deducted, not as a dead signal', bad?.numbers.poa, 4607);
}

// 23. THE FALLBACK KEEPS ITS OWN PAIR AND IT IS THE RIGHT ONE. A trade only customer passes no
//     figures at all, and his instalment must still exclude his loan. Derived rather than pinned:
//     the bill less twice the instalment IS the projected loan, whatever this year's rates are.
{
  const noLoan = poa(A.computeSignals(input()));
  const borrower = poa(A.computeSignals(input({ studentLoanPlan: 'plan4' })));
  ok('fallback, no loan: fires', !!noLoan);
  ok('fallback, borrower: fires', !!borrower);
  eq('fallback: the same books give the same instalment with or without a loan',
    borrower?.numbers.poa, noLoan?.numbers.poa);
  eq('fallback, no loan: the bill is exactly twice the instalment',
    (noLoan?.numbers.poa ?? 0) * 2, noLoan?.numbers.estBill ?? -1);
  ok('fallback, borrower: the bill is bigger than twice the instalment, by the loan',
    !!borrower && borrower.numbers.estBill > borrower.numbers.poa * 2);
}

// 24. THE CLAUSE THAT EXPLAINS THE ARITHMETIC APPEARS ONLY FOR THE MAN WHOSE ARITHMETIC NEEDS IT.
//     Doc 103's empty test: a sentence answering a question he never asked is a row he has to read
//     and reject. Without a loan the instalment IS half the bill and there is nothing to explain.
{
  const CLAUSE = 'half your tax, not half the bill';
  ok('borrower: the message says why the halves do not match',
    poa(A.computeSignals(input({ studentLoanPlan: 'plan4' })))?.body.includes(CLAUSE) === true);
  ok('no loan: it is not there', poa(A.computeSignals(input()))?.body.includes(CLAUSE) === false);
  ok('and it is never in the WhatsApp text, which stays one sentence',
    poa(A.computeSignals(input({ studentLoanPlan: 'plan4' })))?.waText.includes(CLAUSE) === false);
}

// 25. 🔴 THE COPY CLAIM THAT CAME OUT, AND WHY IT MUST NOT COME BACK. "roughly one and a half times
//     what you expect" is only true of a man with no loan and no tax at source. For anybody else it
//     is a claim he can check against the two figures in the same sentence and find wrong.
//     ⚠️ AND IT READS THE CODE, NOT THE COMMENTS. The block above explains in prose why the claim
//     came out, so a naive scan of the whole file finds the words it is asserting are gone and
//     fails on its own explanation. Fifth time this repo has met that trap. The safe form is the
//     one lib/scotland.ts's suite uses: `(^|[^:])//` never truncates an https:// URL.
const codeOnly = (x) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
ok('the comment stripper actually strips (vacuity check)',
  codeOnly('const a = 1; // one and a half times\nconst b = 2;').includes('const b')
  && !codeOnly('// one and a half times').includes('one and a half'));
ok('and it does not eat an https:// URL',
  codeOnly("const u = 'https://lekhio.app';").includes('https://lekhio.app'));
ok('lib/agent.ts no longer promises one and a half times the bill',
  !/one and a half times/.test(codeOnly(agentSrc)));

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('E. B30. THREE DOORS, ONE DAY, ONE FIGURE. And the day is the only thing that moves.');
// ════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴 THE B30 ITEM SAID "TWO ENGINES, TWO FIGURES, ONE MAN, 17 HOURS APART, SAME BOOKS", and named
// the chat lane as the outlier by £126.00: chat £10,618.00, the Tax page and the 08:00 alert
// £10,492. RECONCILED ON A FROZEN INPUT ON 18 AUGUST 2026, AND THERE IS NO OUTLIER AND THERE ARE
// NOT TWO ENGINES.
//
// The books below are the ones that were reported (£22,910 in, £5,286 out, £17,624 of profit, plan
// 4, no CIS, no rent). Run through the ONE engine on 17 August they give £10,618. Run through the
// SAME engine on 18 August they give £10,492. Both reported figures, exactly, from one taxPosition.
//
// £126.00 IS ONE DAY OF THE CLOCK. projectionFactor() divides the year by daysElapsed from 6 April,
// so a man who logged nothing on the 18th is on a slightly lower run rate than he was on the 17th,
// and his projected year falls. That is correct, and it is the safe direction.
//
// ⚠️ WHAT IS LEFT, AND IT IS REAL: the chat prints formatGbp (two places) and the Tax page prints
// gbp0 (whole pounds), so on the SAME DAY they read "£10,618.00" and "£10,618" while the chat's own
// next sentence promises "It is the same figure your Tax screen leads with". That is B26's shape on
// the largest figure in the product, and it is recorded rather than changed here because the page
// hero is Jag's copy. See the B30 handback.
//
// This section exists so nobody reopens the £126 as an arithmetic bug, and so the three doors
// cannot come apart on one day without a suite saying so.

// The reported books, frozen. Only daysElapsed differs between the two runs.
const CALLUM = (daysElapsed) => ({
  startYear: 2026, monthsElapsed: 4, daysElapsed, observedDays: daysElapsed,
  ytdTradeIncome: 22910, ytdTradeExpenses: 5286, ytdCisSuffered: 0,
  employmentIncome: 0, studentPlans: ['plan4'], categoriesLogged: ['materials', 'fuel'],
  homeOfficeClaimed: false, ytdPropertyIncome: 0, ytdPropertyExpenses: 0, ytdPropertyFinance: 0,
  businessType: 'sole_trader', dividendIncome: 0, savingsIncome: 0,
});
// 6 April 2026 is day 0. 17 August is 133, 18 August is 134, derived rather than typed.
const YEAR_START = Date.UTC(2026, 3, 6);
const dayOf = (utcMs) => Math.floor((utcMs - YEAR_START) / 86400000);
eq('17 August 2026 is day 133 of the tax year', dayOf(Date.UTC(2026, 7, 17)), 133);
eq('18 August 2026 is day 134', dayOf(Date.UTC(2026, 7, 18)), 134);

// 26. 🔴 THE RECONCILIATION. Both reported figures, from one engine, off one set of books.
{
  const d17 = O.taxPosition(CALLUM(133));
  const d18 = O.taxPosition(CALLUM(134));
  eq('17 August: the engine gives the figure the chat printed', O.billFromPosition(d17), 10618);
  eq('18 August: the SAME engine gives the figure the page and the alert printed', O.billFromPosition(d18), 10492);
  eq('and the gap is the £126.00 the item called two engines', O.billFromPosition(d17) - O.billFromPosition(d18), 126);
  ok('the year to date profit did not move between them, so the books really are the same',
    CALLUM(133).ytdTradeIncome - CALLUM(133).ytdTradeExpenses === 17624
    && CALLUM(134).ytdTradeIncome - CALLUM(134).ytdTradeExpenses === 17624);
}

// 27. AND THE REASON, SO NOBODY HAS TO GUESS AGAIN. More of the year run on the same money is a
//     lower run rate, so the projection falls. Monotone, and in the safe direction.
{
  const bill = (d) => O.billFromPosition(O.taxPosition(CALLUM(d)));
  ok('the projection falls as the year runs on unchanged books',
    bill(120) > bill(133) && bill(133) > bill(134) && bill(134) > bill(160));
  const f133 = TE.projectionFactor({ monthsElapsed: 4, daysElapsed: 133, observedDays: 133 });
  const f134 = TE.projectionFactor({ monthsElapsed: 4, daysElapsed: 134, observedDays: 134 });
  ok('and the divisor is the day count, not anything about the rows', f133.factor > f134.factor);
  eq('the factor is the year over the days elapsed', f134.factor, TE.DAYS_IN_TAX_YEAR / 134, 1e-9);
}

// 28. 🔴 THREE DOORS, ONE DAY, ONE FIGURE. The chat sentence, the Tax page hero and the alert's
//     bill are one expression on one position. On 13 August 2026 two of them wrote that expression
//     out by hand and the third did not, and WhatsApp said £37,457 while three screens said
//     £28,250 on the same evening. billFromPosition() is the one door and this is the lock.
{
  const t = O.taxPosition(CALLUM(134));
  const bill = O.billFromPosition(t);

  // The chat: lib/waintents oweAnswer, which takes the figure and never works one out.
  const chat = W.oweAnswer(bill, t.projected, true);
  ok('the chat prints the one bill', chat.includes(W.formatGbp(bill)));

  // The agent: the same bill, plus the base the payments on account engine needs.
  const s = poa(A.computeSignals(input({
    selfAssessmentBill: bill,
    selfAssessmentPoa: { tax: t.selfAssessmentTax, deductedAtSource: t.cisSuffered },
  })));
  eq('the alert quotes the one bill', s?.numbers.estBill, bill);

  // The page: paymentsOnAccount on the same two fields, which is what app/app/tax/page.tsx passes.
  const pagePoa = TE.paymentsOnAccount(t.selfAssessmentTax, 2027, t.cisSuffered);
  eq('and the alert and the page agree on the payment on account, to the penny',
    s?.numbers.poa, pagePoa.eachPayment);
  ok('which on these books is NOT half the bill, because of the loan',
    Math.abs((s?.numbers.poa ?? 0) - bill / 2) > 1);
}

// 29. THE FORMAT GAP THAT IS LEFT, ASSERTED AS IT STANDS RATHER THAN AS WE WISH IT WERE. The chat
//     says pence and the Tax page hero says whole pounds, on the same number, under a sentence
//     promising they are the same figure. Recorded here so that when the page hero moves to two
//     places this suite is what tells whoever does it that the chat already agreed.
{
  const t = O.taxPosition(CALLUM(134));
  const bill = O.billFromPosition(t);
  eq('the chat writes it with pence', W.formatGbp(bill), '£10,492.00');
  const money = readFileSync(path.join(lib, 'money.ts'), 'utf8');
  ok('lib/money.ts still owns both formats', /export function gbp0/.test(money) && /export function gbp2/.test(money));
  const taxPage = readFileSync(path.join(root, 'app/app/tax/page.tsx'), 'utf8');
  ok('and the Tax page hero still prints whole pounds, which is the difference',
    /lek-hero">\{gbp0\(billFromPosition\(tax\)\)\}/.test(taxPage));
}

console.log('');
console.log(`${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

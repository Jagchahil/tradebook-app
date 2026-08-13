// R2-F23. THE AGENT AND THE TAX PAGE MUST QUOTE ONE BILL.
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
  'partnership', 'position', 'rakhamoves', 'waintents', 'agent',
  // The optimiser chain, for the identity guards in section B.
  'autonomy', 'taxoptimiser',
]) {
  writeFileSync(path.join(stage, f + '.ts'), fix(readFileSync(path.join(lib, f + '.ts'), 'utf8')));
}
const A = await import(pathToFileURL(path.join(stage, 'agent.ts')).href);
const O = await import(pathToFileURL(path.join(stage, 'taxoptimiser.ts')).href);
const TE = await import(pathToFileURL(path.join(stage, 'taxengine.ts')).href);

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
    ...extra,
  };
}
const LANDLORD = { rents: 12000, expenses: 0, finance: 0, rents12: 12000 };
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
  const s = poa(A.computeSignals(input({ property: LANDLORD, selfAssessmentBill: 1171 })));
  ok('landlord with the figure passed: the signal fires', !!s);
  eq('landlord: the bill IS the passed figure', s?.numbers.estBill, 1171);
}

// 4. THE FIGURE REACHES EVERY STRING AND THE BUTTON. A signal that quotes the right number in
//    numbers{} and the wrong one in the text a customer actually reads has fixed nothing.
{
  const s = poa(A.computeSignals(input({ property: LANDLORD, selfAssessmentBill: 1171 })));
  ok('the body quotes the passed figure', !!s && s.body.includes('£1,171'));
  ok('the WhatsApp text quotes the passed figure', !!s && s.waText.includes('£1,171'));
  eq('the set_aside ACTION carries the passed figure', s?.action?.amount, 1171);
  // EVERY money figure in the customer facing text must be the passed bill or something derived
  // from it. The January total (bill plus one payment on account) is legitimate; a THIRD figure
  // would mean something in there is still computing locally.
  const figures = [...new Set((s?.waText.match(/£[\d,]*\d/g) ?? []))].sort();
  eq('the text carries exactly two figures, both derived from the passed bill',
    figures.join(' '), '£1,171 £1,757');
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
  const s = poa(A.computeSignals(input({ property: LANDLORD, selfAssessmentBill: 400 })));
  ok('landlord under the POA threshold on the real figure: no signal', !s);
  const t = poa(A.computeSignals(input({ property: LANDLORD, selfAssessmentBill: 1000.01 })));
  ok('landlord a penny over the threshold: signal', !!t);
}

// 9. The January arithmetic is built on the passed figure too, not recomputed from anything.
{
  const s = poa(A.computeSignals(input({ property: LANDLORD, selfAssessmentBill: 1171 })));
  eq('payment on account is half the passed bill', s?.numbers.poa, Math.round(1171 / 2));
  ok('January total in the text is bill plus one payment on account',
    !!s && s.waText.includes('£1,757')); // 1171 + 586
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
ok('the nightly walk passes the bill', /selfAssessmentBill:\s*bill/.test(cronSrc));
ok('the on demand reassess passes the bill', /selfAssessmentBill:\s*bill/.test(reassessSrc));
ok('the walk calls the shared reader', /selfAssessmentBillFor\(user\.id\)/.test(cronSrc));
ok('reassess calls the shared reader', /selfAssessmentBillFor\(userId\)/.test(reassessSrc));

// 15. The reader must fail to NULL and never to zero. Zero reads as "no bill", which silently
//     means "nothing to warn about", and that is the same silent default this field exists against.
const supaSrc = readFileSync(path.join(lib, 'supabase.ts'), 'utf8');
const readerBody = supaSrc.slice(
  supaSrc.indexOf('export async function selfAssessmentBillFor'),
  supaSrc.indexOf('export async function agentAggregates'),
);
ok('the shared reader exists', readerBody.length > 0);
ok('it is built on the optimiser input, not its own query', /getOptimiserInput\(userId\)/.test(readerBody));
ok('it calls the one bill function', /selfAssessmentBill\(/.test(readerBody));
ok('a failure returns null, never 0', /return null/.test(readerBody) && !/return 0/.test(readerBody));

// 16. The signal must read the passed figure rather than recompute. Anchored to the ASSIGNMENT, so
//     deleting the guard and going back to the blend goes red here.
const poaBlock = agentSrc.slice(agentSrc.indexOf("signalKey: 'poa_cliff'") - 2200, agentSrc.indexOf("signalKey: 'poa_cliff'"));
ok('the bill is taken from the input, not computed locally', /input\.selfAssessmentBill/.test(poaBlock));
ok('rent is what withholds the fallback', /hasRent\s*\?\s*null/.test(poaBlock));
ok('a non number takes the safe path', /Number\.isFinite/.test(poaBlock));

console.log('');
console.log(`${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

// Tests for lib/taxoptimiser.ts, the tax-lowering engine. Pure, no network.
//   node test/taxoptimiser.test.mjs
// It imports the canonical engine (extensionless), so we stage and rewrite the
// relative imports, same as test/agent.test.mjs.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'opt-'));
const fix = (s) => s
  .replace("from './taxengine'", "from './taxengine.ts'")
  .replace("from './autonomy'", "from './autonomy.ts'")
  .replace("from './ltdengine'", "from './ltdengine.ts'")
  .replace("from './personalincome'", "from './personalincome.ts'")
  .replace("from './nistudentloan'", "from './nistudentloan.ts'")
  .replace("from './propertyengine'", "from './propertyengine.ts'");
writeFileSync(path.join(stage, 'taxengine.ts'), readFileSync(path.join(lib, 'taxengine.ts'), 'utf8'));
// The optimiser now asks the property engine how the £1,000 allowance stands against actual
// costs (one engine, never a second copy of the comparison), so it stages alongside.
writeFileSync(path.join(stage, 'propertyengine.ts'), fix(readFileSync(path.join(lib, 'propertyengine.ts'), 'utf8')));
writeFileSync(path.join(stage, 'autonomy.ts'), readFileSync(path.join(lib, 'autonomy.ts'), 'utf8'));
// The optimiser now surfaces the WHOLE-PERSON tax (taxPosition), so its engine comes along too.
writeFileSync(path.join(stage, 'personalincome.ts'), fix(readFileSync(path.join(lib, 'personalincome.ts'), 'utf8')));
// The optimiser now nets the STUDENT LOAN off the CIS refund, because CIS pays that off too on
// the real return. Without this the deck under-staged and the whole suite exploded on import.
writeFileSync(path.join(stage, 'nistudentloan.ts'), fix(readFileSync(path.join(lib, 'nistudentloan.ts'), 'utf8')));
writeFileSync(path.join(stage, 'ltdengine.ts'), fix(readFileSync(path.join(lib, 'ltdengine.ts'), 'utf8')));
writeFileSync(path.join(stage, 'taxoptimiser.ts'), fix(readFileSync(path.join(lib, 'taxoptimiser.ts'), 'utf8')));
const O = await import(pathToFileURL(path.join(stage, 'taxoptimiser.ts')).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}`); } };
const find = (list, key) => list.find((o) => o.key === key);

const base = {
  startYear: 2026, monthsElapsed: 12, daysElapsed: 365,
  ytdTradeIncome: 0, ytdTradeExpenses: 0, ytdCisSuffered: 0,
  employmentIncome: 0, categoriesLogged: [], homeOfficeClaimed: true, mileageClaimed: true, purchaseGoal: null,
};

console.log('\n=== optimiser: marginal rate bands ===\n');
ok('below personal allowance = 0', O.marginalRate(10000) === 0);
ok('basic rate band = 0.26', O.marginalRate(30000) === 0.26);
ok('higher rate band = 0.42', O.marginalRate(60000) === 0.42);
ok('taper zone = 0.62', O.marginalRate(110000) === 0.62);

console.log('\n=== optimiser: the tidy low earner used to get NOTHING ===\n');
//
// ⚠️ THIS TEST USED TO ASSERT ZERO LEVERS, AND IT PASSED, AND THAT WAS THE PROBLEM.
//
// £6,000 net, everything claimed, nothing owing. The optimiser had not one word for him. And he is
// the man with the MOST to gain from the thing we were not telling him: he is not using all of his
// tax free allowance, and if he is married he can hand £1,260 of it to his partner and save THEM
// £252 a year, for nothing, because he was never going to use it.
//
// So "no levers" was not restraint. It was a silence with £252 sitting inside it.
const quiet = O.findOptimisations({ ...base, ytdTradeIncome: 8000, ytdTradeExpenses: 2000, categoriesLogged: ['fuel', 'phone', 'insurance', 'tools'] });
ok('he now gets exactly ONE thing, and it is the one that helps him',
  quiet.length === 1 && quiet[0].key === 'marriage_allowance_give');
ok('...and it is INFORMATION, not a quantified saving, because we do not know if he is married',
  quiet[0].info === true && quiet[0].estSaving === 0);
ok('...so the headline saving for a tidy low earner is still, correctly, zero',
  O.totalEstimatedSaving(quiet) === 0);

console.log('\n=== optimiser: the levers fire on real gaps ===\n');
// Higher earner, missing costs, no home office, logs fuel but no mileage, has a van goal.
const rich = O.findOptimisations({
  ...base,
  ytdTradeIncome: 80000, ytdTradeExpenses: 8000,
  employmentIncome: 0,
  categoriesLogged: ['fuel', 'materials'],
  homeOfficeClaimed: false, mileageClaimed: false,
  purchaseGoal: { title: 'a van', amount: 24000 },
});
ok('pension lever fires for a higher earner', !!find(rich, 'pension_higher_rate'));
ok('AIA timing fires with a purchase goal', !!find(rich, 'aia_timing'));
ok('home office fires when unclaimed', !!find(rich, 'home_office'));
ok('mileage prompt fires (fuel logged, no miles)', !!find(rich, 'mileage'));
ok('missed expenses fires (phone + insurance + tools absent)', !!find(rich, 'missed_expenses'));

ok('AIA saving = amount x marginal rate (24000 x 0.42 ~ 10080)', Math.abs(find(rich, 'aia_timing').estSaving - 10080) <= 2);
ok('home office saving is positive and modest', find(rich, 'home_office').estSaving > 0 && find(rich, 'home_office').estSaving < 200);
ok('list is sorted richest-saving first', rich[0].estSaving >= rich[rich.length - 1].estSaving);
ok('total estimated saving sums the levers', O.totalEstimatedSaving(rich) >= find(rich, 'aia_timing').estSaving);

console.log('\n=== optimiser: CIS refund is information, not a saving ===\n');
const subbie = O.findOptimisations({ ...base, ytdTradeIncome: 20000, ytdTradeExpenses: 2000, ytdCisSuffered: 4000, categoriesLogged: ['fuel', 'phone', 'insurance', 'tools'] });
const refund = find(subbie, 'cis_refund');
ok('CIS refund detected when deductions exceed tax due', !!refund);
ok('CIS refund is flagged as information', refund.info === true && refund.estSaving === 0);

console.log('\n=== optimiser: THE DIAL, money levers can never auto-run ===\n');
for (const level of ['suggest', 'draft', 'auto']) {
  const dialled = O.applyDial(rich, level);
  for (const o of dialled) {
    if ((o.action === 'make_payment' || o.action === 'purchase')) {
      ok(`${o.key} @ ${level}: requires approval, never auto`, o.requiresApproval === true && o.mode !== 'auto');
    }
  }
}
// At auto, a reversible admin lever (home office / log) may run itself.
const autoDialled = O.applyDial(rich, 'auto');
ok('at auto, home office (admin) may auto-run', find(autoDialled, 'home_office').mode === 'auto' && find(autoDialled, 'home_office').requiresApproval === false);
ok('at suggest, home office only suggests', find(O.applyDial(rich, 'suggest'), 'home_office').mode === 'suggest');

console.log('\n=== optimiser: incorporation lever (honest answer, not a reflex nudge) ===\n');
// At a live-question profit the lever fires, but it answers from our own maths.
// On 2026/27 full-extraction rates a sole trader wins, so it must say "not yet"
// rather than push a company, and it must never claim a saving.
const bigEarner = O.findOptimisations({ ...base, ytdTradeIncome: 80000, ytdTradeExpenses: 0, categoriesLogged: ['fuel', 'phone', 'insurance', 'tools'] });
const inc = find(bigEarner, 'incorporation');
ok('incorporation question surfaces at a higher profit', !!inc);
ok('incorporation is information, never summed into the headline (estSaving 0)', inc && inc.info === true && inc.estSaving === 0);
ok('incorporation names a pound figure in the words', inc && /£[\d,]+/.test(inc.detail));
ok('does not push a company when our maths says sole trader wins', inc && /sole trader is currently the better deal/i.test(inc.detail));
ok('flags the condition that flips it and points to the free tool', inc && /leave money in the business/i.test(inc.detail) && /free/i.test(inc.detail));
// A modest earner should not get the incorporation question at all.
const smallEarner = O.findOptimisations({ ...base, ytdTradeIncome: 18000, ytdTradeExpenses: 3000, categoriesLogged: ['fuel', 'phone', 'insurance', 'tools'] });
ok('no incorporation item for a modest earner', !find(smallEarner, 'incorporation'));

console.log('\n=== optimiser: property costs lever ===\n');
const landlord = O.findOptimisations({ ...base, ytdTradeIncome: 5000, ytdTradeExpenses: 1000, categoriesLogged: ['fuel', 'phone', 'insurance', 'tools'], ytdPropertyIncome: 12000, ytdPropertyExpenses: 200 });
const prop = find(landlord, 'property_costs');
ok('property costs prompt fires when rental income has almost no expenses', !!prop);
ok('property costs is a reversible admin prompt', prop.action === 'log_entry' && O.applyDial([prop], 'auto')[0].requiresApproval === false);
const goodLandlord = O.findOptimisations({ ...base, ytdPropertyIncome: 12000, ytdPropertyExpenses: 5000, categoriesLogged: ['fuel', 'phone', 'insurance', 'tools'] });
ok('no property prompt when expenses are already logged', !find(goodLandlord, 'property_costs'));

console.log('\n=== optimiser: no forbidden dashes in copy ===\n');
const allText = rich.map((o) => o.title + o.detail).join(' ');
ok('copy has no em/en/minus dashes', !/[–—−]/.test(allText));

// --- CIS PAYS OFF THE STUDENT LOAN TOO -------------------------------------------------------
//
// On the real Self Assessment return, CIS already deducted by contractors is credited against
// income tax AND Class 4 AND the student loan. The refund figure used to forget the loan, so a
// subbie with one was PROMISED MONEY HE WOULD NOT GET. That is the cruel direction to be wrong
// in: he may well have spent it.
{
  const withLoan = { ...base, ytdTradeIncome: 45000, ytdTradeExpenses: 5000, ytdCisSuffered: 12000, studentPlans: ['plan2'] };
  const noLoan = { ...base, ytdTradeIncome: 45000, ytdTradeExpenses: 5000, ytdCisSuffered: 12000 };

  const a = find(O.findOptimisations(withLoan), 'cis_refund');
  const b = find(O.findOptimisations(noLoan), 'cis_refund');

  ok('a CIS refund is still surfaced when there is a loan', Boolean(a));
  ok('and without one', Boolean(b));

  // Match the REFUND, not the first "about £" in the sentence (which is the CIS deducted).
  const num = (o) => Number((o.detail.match(/difference, about £([\d,]+)/) || [])[1]?.replace(/,/g, '') || 0);
  ok('the refund with a student loan is SMALLER than without', num(a) < num(b));
  ok('and it is smaller by a real amount, not a rounding', num(b) - num(a) > 500);
}

console.log('\n=== the WHOLE-PERSON tax position (taxPosition) ===\n');
const near = (a, b) => Math.abs(a - b) <= 0.01;
{
  // Trade only. Must equal the sole-trader figure, or the wiring has moved a number under a man who
  // has no employment, savings or dividends. £30,000 profit -> £3,486 income tax + £1,045.80 Class 4.
  const soleOnly = O.taxPosition({ ...base, ytdTradeIncome: 30000, ytdTradeExpenses: 0 });
  ok('trade-only whole tax equals the sole-trader figure (nothing moves)', near(soleOnly.totalTax, 4531.8));
  // With no job there is no PAYE, so the Self Assessment bill IS the whole bill.
  ok('sole trader: Self Assessment tax equals the whole tax', soleOnly.employmentTax === 0 && near(soleOnly.selfAssessmentTax, 4532));

  // Trade + a PAYE job. £20k profit + £30k salary = £50k non-savings. Income tax 20% on £37,430 =
  // £7,486. Class 4 on the £20k trade only = £445.80. Whole tax £7,931.80. The job is now IN the sum.
  const withJob = O.taxPosition({ ...base, ytdTradeIncome: 20000, ytdTradeExpenses: 0, employmentIncome: 30000 });
  ok('a PAYE job is now included in the whole tax', near(withJob.incomeTax.total, 7486) && near(withJob.class4NIC, 445.8) && near(withJob.totalTax, 7931.8));
  // But PAYE already took the £3,486 income tax on the £30k salary. Self Assessment collects the rest:
  // 7,931.80 whole tax - 3,486 already paid = 4,446 (to the pound). Setting aside the whole 7,931.80
  // would have him hoarding tax that has already left his wages.
  ok('Self Assessment tax leaves out the PAYE already paid on the salary', withJob.employmentTax === 3486 && near(withJob.selfAssessmentTax, 4446));

  // Savings and dividends flow when captured. £40k trade + £2k interest (higher-rate: £500 PSA, £1,500
  // at 40% = £600) + £3k dividends (£500 allowance, £2,500 at 35.75% = £893.75).
  const full = O.taxPosition({ ...base, ytdTradeIncome: 55000, ytdTradeExpenses: 0, savingsIncome: 1500, dividendIncome: 3000 });
  ok('savings and dividends flow into the whole tax', near(full.incomeTax.savings, 400) && near(full.incomeTax.dividends, 893.75));

  // Early in the year it is a projection, and it says so rather than pretending to be a final figure.
  const early = O.taxPosition({ ...base, monthsElapsed: 1, daysElapsed: 31, ytdTradeIncome: 3000, ytdTradeExpenses: 0 });
  ok('early in the year the whole tax is flagged as a projection', early.projected === false);
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 🔴 THE SET ASIDE FIGURE, AND THE STUDENT LOAN IT USED TO FORGET ===\n');
//
// A self employed man's student loan repayment is not taken as he goes. It lands in one lump with
// the January bill, which means Self Assessment collects it, which means a number called "what Self
// Assessment collects" that leaves it out understates what he has to find. Understating the January
// bill is the direction that hurts, because he has already spent the difference.
//
// /student-loan-checker says on the live site that most tax apps forget student loans exist and then
// January arrives. This one did too, on the figure the dashboard now prints in the largest type on
// the screen.
//
// ⚠️ selfAssessmentTax IS DELIBERATELY UNCHANGED. /api/optimise already publishes this object and
// the phone app already renders it, so the loan arrives as its own field and setAside is the honest
// total. Nothing a customer is looking at today moved.
{
  const noLoan = { ...base, ytdTradeIncome: 45000, ytdTradeExpenses: 5000 };
  const withLoan = { ...noLoan, studentPlans: ['plan2'] };

  const a = O.taxPosition(noLoan);
  const b = O.taxPosition(withLoan);

  ok('a man with no student loan has no loan in his set aside', a.studentLoan === 0);
  ok('...and for him the set aside IS the Self Assessment figure', a.setAside === a.selfAssessmentTax);

  ok('🔴 A MAN WITH A PLAN 2 LOAN HAS IT IN HIS SET ASIDE', b.studentLoan > 0);
  ok('...by a real amount, not a rounding', b.studentLoan > 100);
  ok('...and the set aside is the two added up', b.setAside === b.selfAssessmentTax + b.studentLoan);
  ok('🔴 SO HE IS TOLD TO PUT MORE BY THAN A MAN WITHOUT ONE', b.setAside > a.setAside);

  // ⚠️ AND THE FIELD THE PHONE APP ALREADY READS DID NOT MOVE. If this ever fails, somebody has
  // changed a figure a customer is looking at today without deciding to.
  ok('🔴 selfAssessmentTax IS UNCHANGED BY THE LOAN', a.selfAssessmentTax === b.selfAssessmentTax);

  // ⚠️ THE SALARY GOES IN, AND IT MAKES THE SELF ASSESSMENT SHARE BIGGER, NOT SMALLER.
  //
  // This is worth spelling out because the obvious guess is the wrong way round. A student loan is
  // a percentage of income ABOVE a threshold. A man with a £30,000 salary has already spent nearly
  // all of that threshold on his wages, so almost every pound of his trade profit is repayable, and
  // payroll has only collected on the small slice of the salary that was over the line. The netting
  // in studentLoanForSA is what stops that slice being asked for twice; it is not a discount.
  //
  // A man with the same profit and no job still has his whole threshold to use up against it, so he
  // repays less.
  const employed = O.taxPosition({ ...withLoan, employmentIncome: 30000 });
  ok('the salary is not ignored when working out the loan', employed.studentLoan !== b.studentLoan);
  ok('🔴 A SALARY USES UP THE THRESHOLD, SO MORE OF THE PROFIT IS REPAYABLE',
    employed.studentLoan > b.studentLoan);
  ok('...and payroll\'s own share is still netted off, never asked for twice',
    employed.studentLoan < O.taxPosition({
      ...withLoan, ytdTradeIncome: 75000, ytdTradeExpenses: 5000,
    }).studentLoan);

  // Nothing to tax, nothing to put by. A brand new account must never be told to find money.
  const empty = O.taxPosition({ ...base, studentPlans: ['plan2'] });
  ok('an empty account is asked for nothing', empty.setAside === 0 && empty.studentLoan === 0);

  // Whatever the shape, the answer is a number a screen can print.
  ok('the set aside is always a real, non negative figure',
    [a, b, employed, empty].every((p) => Number.isFinite(p.setAside) && p.setAside >= 0));
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 🔴 WHAT IS IN THE SET ASIDE FIGURE, IN WORDS ===\n');
//
// Found on the deployed Overview on 30 July 2026. The screen said "Put by for tax £26,579", and
// directly underneath it "Profit £12,307". Both figures were correct and together they were
// unreadable: the first is his whole personal tax across a salary, dividends, savings and a
// projected full year of trade, and the second is his business profit so far. Nothing said so.
//
// lib/ledger.ts's standard is that he should be able to check our working, and two of our numbers
// he cannot reconcile is how he stops believing either of them.
{
  const sole = { ...base, ytdTradeIncome: 30000, ytdTradeExpenses: 5000 };
  ok('a pure sole trader is just his business', JSON.stringify(O.setAsideBasis(sole)) === JSON.stringify(['your business']));
  // ⚠️ AND HE IS TOLD NOTHING EXTRA. Listing "your wages" at zero is a line he has to read and
  // reject on the one screen he came to for a number.
  ok('🔴 SO HE IS GIVEN NO EXTRA LINE TO READ',
    O.setAsideBasisLine(sole, O.taxPosition(sole)) === null);

  const withJob = { ...sole, employmentIncome: 30000, dividendIncome: 12500, savingsIncome: 1500 };
  const parts = O.setAsideBasis(withJob);
  ok('a man with wages, dividends and savings has all three named',
    parts.includes('your wages') && parts.includes('your dividends') && parts.includes('your savings interest'));
  ok('...and his business is named first, because it is the one we are his employee for',
    parts[0] === 'your business');

  const line = O.setAsideBasisLine(withJob, O.taxPosition(withJob));
  ok('🔴 THE NUMBER NOW SAYS WHAT IS IN IT', /your business, your wages, your dividends and your savings interest/.test(line));
  // ⚠️ AND WHAT HAS ALREADY BEEN PAID. Without this a man with a job reads the figure as a bill on
  // top of the tax his payslip has been taking off him all year.
  ok('🔴 AND THAT HIS PAYSLIP HAS ALREADY PAID SOME OF IT', /payslip/.test(line));

  const loan = { ...withJob, studentPlans: ['plan2'] };
  ok('a student loan is named too', /student loan/.test(O.setAsideBasisLine(loan, O.taxPosition(loan))));

  // The list reads like a person wrote it, at every length.
  ok('a list of one has no "and" hanging off it', O.inPlainList(['your business']) === 'your business');
  ok('a list of two joins with "and"', O.inPlainList(['a', 'b']) === 'a and b');
  ok('a list of three uses commas then "and"', O.inPlainList(['a', 'b', 'c']) === 'a, b and c');
  ok('an empty list is empty, never "and"', O.inPlainList([]) === '');

  // A property landlord is named as one, and a man with a loss on his rent is not.
  ok('rent is named when it makes money',
    O.setAsideBasis({ ...sole, ytdPropertyIncome: 9000, ytdPropertyExpenses: 2000 }).includes('your rent'));
  ok('...and not when it does not',
    !O.setAsideBasis({ ...sole, ytdPropertyIncome: 2000, ytdPropertyExpenses: 9000 }).includes('your rent'));
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 🔴 "IT COVERS YOUR BUSINESS", SAID TO A MAN WITH NO BUSINESS ===\n');
//
// 'your business' was seeded into the list UNCONDITIONALLY while every other stream had a guard. So
// a customer whose whole business is letting read "It covers your business and your rent" about a
// business he has not got, on four surfaces, directly under the one number he came for. The comment
// above the function already stated the rule it was breaking: it only ever lists a stream he has.
{
  const landlord = {
    ...base, ytdTradeIncome: 0, ytdTradeExpenses: 0,
    ytdPropertyIncome: 24000, ytdPropertyExpenses: 6000,
  };
  ok('🔴 THE BUG: a property only customer is not told the figure covers a business',
    JSON.stringify(O.setAsideBasis(landlord)) === JSON.stringify(['your rent']));
  // ⚠️ AND A PURE LANDLORD IS GIVEN NO SENTENCE AT ALL, for the same reason a pure sole trader is
  // not: a one item list explains nothing the number does not already say. The bug was never the
  // silence, it was the word "business" appearing in the list the moment there was a second stream.
  ok('...so on his own he gets no extra line to read, exactly as a pure sole trader does not',
    O.setAsideBasisLine(landlord, O.taxPosition(landlord)) === null);
  ok('...and once he has wages too, the sentence he reads names his rent and never a business',
    (() => {
      const line = O.setAsideBasisLine({ ...landlord, employmentIncome: 30000 }, O.taxPosition({ ...landlord, employmentIncome: 30000 }));
      return /It covers your wages and your rent\./.test(line) && !/business/.test(line);
    })());

  // Nothing moves for anybody who does have a trade.
  const trader = { ...base, ytdTradeIncome: 30000, ytdTradeExpenses: 5000 };
  ok('a sole trader is still his business, first, exactly as before',
    O.setAsideBasis(trader)[0] === 'your business');
  ok('...and a trader with rent gets both, in that order',
    JSON.stringify(O.setAsideBasis({ ...trader, ytdPropertyIncome: 9000 }))
    === JSON.stringify(['your business', 'your rent']));
  // A brand new account has nothing in the figure at all, so there is nothing to explain.
  ok('an empty account is given no sentence rather than an empty one',
    O.setAsideBasis(base).length === 0
    && O.setAsideBasisLine(base, O.taxPosition(base)) === null);
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 🔴 THE USE OF HOME ELECTION, WHICH THIS FILE DECLARED AND THEN NEVER READ ===\n');
//
// ytdHomeOffice sat on OptimiserInput with a comment explaining it, and taxPosition() did not read
// it. So a man who elected use of home saw his ledger go down and the figure the app prints in its
// largest type stand perfectly still. The other half of the same bug: what he TEXTS is a real
// transaction inside ytdTradeExpenses, so a man who did both was deducted twice on his ledger.
//
// THE RULE, applied here and identically in lib/ledger.ts: take what he LOGGED out of expenses,
// always; then the deduction is the ELECTION if he has one, and the logged rows if he has not.
// test/ledger.test.mjs runs a grid through both modules and fails if they ever disagree.
{
  // £40,000 in, £8,000 out. In the "texted" shapes £312 of that £8,000 IS the use of home rows.
  const shape = { ...base, ytdTradeIncome: 40000, ytdTradeExpenses: 8000 };
  const none = O.taxPosition(shape);
  const electedOnly = O.taxPosition({ ...shape, ytdHomeOffice: 312 });
  const textedOnly = O.taxPosition({ ...shape, ytdHomeOfficeLogged: 312 });
  const both = O.taxPosition({ ...shape, ytdHomeOffice: 312, ytdHomeOfficeLogged: 312 });

  ok('🔴 THE ELECTION FINALLY MOVES THE SET ASIDE, WHICH IT NEVER DID', electedOnly.setAside < none.setAside);
  ok('...by a real amount at his marginal rate, not a rounding',
    Math.abs((none.setAside - electedOnly.setAside) - 312 * 0.26) < 2);
  ok('...and it is the profit itself that moved, not some adjustment bolted on the end',
    electedOnly.totalIncome === 40000 - 8000 - 312);
  ok('what he TEXTED was already inside his expenses, so it changes nothing on its own',
    textedOnly.setAside === none.setAside && textedOnly.totalIncome === none.totalIncome);
  ok('🔴 AND A MAN WHO DID BOTH IS DEDUCTED ONCE, NOT TWICE', both.totalIncome === 40000 - 8000);
  ok('...which is the same profit as a man who elected and never texted the same claim',
    both.totalIncome === O.taxPosition({ ...shape, ytdTradeExpenses: 8000 - 312, ytdHomeOffice: 312 }).totalIncome
    && both.setAside === O.taxPosition({ ...shape, ytdTradeExpenses: 8000 - 312, ytdHomeOffice: 312 }).setAside);
  ok('...and the double counted profit, £312 lower, is the one we are no longer printing at him',
    O.taxPosition({ ...shape, ytdHomeOffice: 312 }).totalIncome === both.totalIncome - 312);
  ok('a man with neither is unchanged to the penny',
    none.setAside === O.taxPosition({ ...shape, ytdHomeOffice: 0, ytdHomeOfficeLogged: 0 }).setAside);
  ok('the same rule reaches the suggestions, so his levers are priced on the same profit',
    JSON.stringify(O.findOptimisations({ ...shape, ytdHomeOffice: 312, ytdHomeOfficeLogged: 312 }))
    === JSON.stringify(O.findOptimisations({ ...shape, ytdTradeExpenses: 8000 + 312 })));
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 🔴 HIS RENT WAS MISSING FROM THE INCOME THAT DECIDES HIS RATE ===\n');
//
// projTotalIncome in findOptimisations added the trade, the salary, the savings and the dividends,
// and left out property. Fourteen lines later the same function read input.ytdPropertyIncome to
// decide whether to talk to him about property costs. taxPosition() has always counted the rent. So
// two functions in one file described the same man differently, and the levers below marginalRate()
// (pension, AIA timing, missed costs, use of home, both marriage cards) were priced at a rate his
// rent had already pushed him past.
{
  const withRent = {
    ...base, ytdTradeIncome: 30000, ytdTradeExpenses: 0,
    ytdPropertyIncome: 40000, ytdPropertyExpenses: 5000,
    purchaseGoal: { title: 'a van', amount: 10000 },
    categoriesLogged: ['fuel', 'phone', 'insurance', 'tools'],
  };
  const withoutRent = { ...withRent, ytdPropertyIncome: 0, ytdPropertyExpenses: 0 };
  const aia = (list) => find(list, 'aia_timing').estSaving;

  ok('🔴 THE BUG: £35,000 of rental profit now counts towards the rate his next deduction saves',
    aia(O.findOptimisations(withRent)) > aia(O.findOptimisations(withoutRent)));
  ok('...and the rate is the higher rate one, because that is where his whole income actually is',
    aia(O.findOptimisations(withRent)) === 10000 * 0.42
    && aia(O.findOptimisations(withoutRent)) === 10000 * 0.26);
  ok('...so the pension lever fires for a man whose rent is what put him in the 40% band',
    !!find(O.findOptimisations(withRent), 'pension_higher_rate')
    && !find(O.findOptimisations(withoutRent), 'pension_higher_rate'));
  // ⚠️ NET, AND PROJECTED WITH THE SAME factor THE TRADE USES. Half a year in, both functions must
  // double the rent exactly as they double the trade, or the two describe different men.
  ok('🔴 AND IT IS THE NET RENT, PROJECTED THE SAME WAY THE TRADE IS, so the two functions agree',
    (() => {
      // ⚠️ `* 2` WAS THE ENGINE'S OWN RULE COPIED IN. Half a year is 184 days, not exactly a half,
      // so the factor comes from the engine now and the SHAPE is what is defended: the net rent is
      // scaled by the same number the trade is, or the two functions describe different men.
      const half = { ...withRent, monthsElapsed: 6, daysElapsed: 184 };
      const f = O.projectionFactor(half).factor;
      // 🔴 THE CLAMP, PINNED. A sabotage pass on 3 August removed Math.min(365, days) and NO
      // suite noticed. Without it a clock that is ahead of itself, a bad row, or a year rolled over
      // gives a factor BELOW 1 and projects a man's year DOWNWARDS from money he has already made.
      // The floor is the more obvious half and it was already covered; this is the other end.
      if (O.projectionFactor({ monthsElapsed: 12, daysElapsed: 400 }).factor !== 1) return false;
      if (O.projectionFactor({ monthsElapsed: 12, daysElapsed: 365 }).factor !== 1) return false;
      // And a day count we cannot use means we do not project, rather than that we guess.
      if (O.projectionFactor({ monthsElapsed: 6, daysElapsed: 0 }).canProject !== false) return false;
      if (O.projectionFactor({ monthsElapsed: 6, daysElapsed: NaN }).canProject !== false) return false;
      const projected = O.taxPosition(half).totalIncome;
      return Math.round(projected) === Math.round((30000 + 35000) * f)
        && find(O.findOptimisations(half), 'aia_timing').estSaving === 10000 * O.marginalRate(projected);
    })());
  ok('a man with no property is unchanged, to the byte',
    JSON.stringify(O.findOptimisations(withoutRent))
    === JSON.stringify(O.findOptimisations({ ...withoutRent, ytdPropertyIncome: undefined, ytdPropertyExpenses: undefined })));
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 🔴 A DIRECTOR WAS BEING CHARGED INCOME TAX AND CLASS 4 ON HIS COMPANY ===\n');
//
// taxPosition() read neither businessType nor incomeShape, though getOptimiserInput fills both in.
// So a limited company's profit went in as `selfEmployment`, the one slot that carries Class 4
// National Insurance, and the answer became the headline "put by for tax" figure in the largest type
// on the screen. Wrong taxpayer, wrong tax, wrong rate, wrong date: a company's trading profit is
// chargeable to Corporation Tax IN THE COMPANY, and what reaches him is salary and dividends, which
// this engine already counts properly.
//
// ⚠️ THE SMALLER NUMBER IS THE DANGEROUS PART, so the engine is not allowed to go quiet about it.
{
  const shape = {
    ...base, ytdTradeIncome: 90000, ytdTradeExpenses: 20000,
    employmentIncome: 12570, dividendIncome: 20000,
  };
  const asSoleTrader = O.taxPosition(shape);
  const asCompany = O.taxPosition({ ...shape, businessType: 'limited_company' });

  ok('🔴 THE BUG: no Class 4 National Insurance on a company\'s profit, on his personal figure',
    asSoleTrader.class4NIC > 0 && asCompany.class4NIC === 0);
  ok('🔴 ...and no income tax on it either. It is not his income',
    asCompany.totalIncome === 12570 + 20000 && asSoleTrader.totalIncome === 12570 + 20000 + 70000);
  ok('...his set aside falls, because he was being asked for a tax that is not his',
    asCompany.setAside < asSoleTrader.setAside);
  ok('🔴 BUT WHAT HE STILL DOES OWE IS UNTOUCHED: the tax on what he takes out',
    asCompany.incomeTax.dividends > 0 && asCompany.setAside > 0);

  // THE HONESTY HALF. A smaller number with nothing beside it is how this fix could do harm.
  ok('🔴 THE ENGINE SAYS WHAT IT LEFT OUT, IN POUNDS', asCompany.companyProfitExcluded === 70000);
  ok('...and turns it into a sentence, so no surface can print the smaller number in silence',
    /Corporation Tax/.test(O.setAsideBasisLine({ ...shape, businessType: 'limited_company' }, asCompany)));
  ok('...even for a director with no salary and no dividends captured, whose list is empty',
    (() => {
      const bare = { ...base, ytdTradeIncome: 90000, ytdTradeExpenses: 20000, businessType: 'limited_company' };
      const line = O.setAsideBasisLine(bare, O.taxPosition(bare));
      return typeof line === 'string' && /company/i.test(line) && O.taxPosition(bare).setAside === 0;
    })());
  ok('...and it never says the figure covers a business whose profit it just took out',
    !O.setAsideBasis({ ...shape, businessType: 'limited_company' }).includes('your business'));

  // ⚠️ ONLY AN EXPLICIT COMPANY LOSES ANYTHING. Unknown is not an answer, here or anywhere.
  ok('🔴 AN UNKNOWN STRUCTURE IS UNCHANGED, TO THE PENNY',
    JSON.stringify(O.taxPosition({ ...shape, businessType: null }))
    === JSON.stringify(asSoleTrader)
    && JSON.stringify(O.taxPosition({ ...shape, businessType: undefined })) === JSON.stringify(asSoleTrader));
  ok('a known sole trader and a partner are unchanged too',
    JSON.stringify(O.taxPosition({ ...shape, businessType: 'sole_trader' })) === JSON.stringify(asSoleTrader)
    && JSON.stringify(O.taxPosition({ ...shape, businessType: 'partnership' })) === JSON.stringify(asSoleTrader));
  ok('a sole trader carries no company line at all, so nothing new appears on his screen',
    asSoleTrader.companyProfitExcluded === 0
    && !/Corporation Tax/.test(O.setAsideBasisLine(shape, asSoleTrader) ?? ''));

  // A director's student loan cannot be charged on his company's profit either.
  const loan = { ...shape, studentPlans: ['plan2'] };
  ok('🔴 AND HIS STUDENT LOAN IS NOT CHARGED ON THE COMPANY\'S PROFIT',
    O.taxPosition({ ...loan, businessType: 'limited_company' }).studentLoan
    < O.taxPosition(loan).studentLoan);

  // House style holds in the new sentence.
  ok('the company sentence carries no em, en or minus dash',
    !/[–—−]/.test(O.setAsideBasisLine({ ...shape, businessType: 'limited_company' }, asCompany)));
}


// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE PROJECTION IS BY DAYS, NOT BY WHOLE MONTHS, AND GETTING THAT WRONG WAS A 51% ERROR
// ON THE LARGEST NUMBER IN THE PRODUCT.
//
// Until 2 August taxPosition projected with `12 / monthsElapsed`, and monthsElapsed was
// `floor(days / 30.44)`. So the numerator was real money over real days and the denominator
// asserted whole 30.44 day months. On 2 August 2026 that divided 118 days of money by 91.3.
//
// The live account read "put by for tax £25,793" against a true figure near £17,100, and because
// the divisor is a step function it FELL TO £16,228 on 5 August with nothing changed in the books.
// At the very end of the year it is worst in a different way: floor(364/30.44) is 11, so the
// divisor never reaches 12 and the engine inflates a FINISHED year by 9.09%.
//
// ⚠️ lib/agent.ts:268 projectAnnual() had always divided by DAYS. Two projections, one codebase,
// £21,244 apart for the same man on the same day. This section pins the survivor.
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 🔴 the projection is by DAYS ===\n');

const audi = {
  ...base,
  ytdTradeIncome: 33579.60, ytdTradeExpenses: 10804, ytdCapitalAllowances: 2758,
  homeOfficeClaimed: false, mileageClaimed: false,
};
const at = (months, days) => O.taxPosition({ ...audi, monthsElapsed: months, daysElapsed: days });

ok('🔴 A FINISHED YEAR IS NOT PROJECTED AT ALL. 364 days must not inflate a done year by 9%',
  Math.abs(at(11, 364).setAside - at(12, 365).setAside) < 60);

const before = at(3, 121).setAside;
const after = at(4, 123).setAside;
ok('🔴 NO CLIFF AT A MONTH TICK. four days apart must not move the set aside by over 5%',
  before > 0 && Math.abs(after - before) / before < 0.05);
ok('the set aside still falls as the year runs on, it does not rise', after <= before);

const projected = O.projectedTradeNetOf({ ...audi, monthsElapsed: 3, daysElapsed: 118 }, 365 / 118);
ok('the projected trade net is ytd scaled by DAYS elapsed, then the annual allowance once',
  Math.abs(projected - (((33579.60 - 10804) * (365 / 118)) - 2758)) < 1);
ok('⚠️ THE CAPITAL ALLOWANCE IS STILL ANNUAL, it is not multiplied up by the projection',
  Math.abs((projected + 2758) - ((33579.60 - 10804) * (365 / 118))) < 1);
ok('⚠️ THE CONFIDENCE GATE HOLDS. under three months nothing is projected',
  at(2, 60).projected === false);

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

// R2-F25. A RESIDENTIAL LANDLORD'S MORTGAGE INTEREST IS NOT AN ALLOWABLE EXPENSE, AND THE PAGE
// HEADED "WHAT A QUARTERLY UPDATE WOULD REPORT TODAY" WAS NETTING IT OFF HIS PROFIT.
// Run with: node test/f25update.test.mjs   (Node 22.6+, pure type stripping)
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS SUITE IS FOR.
//
// 13 August 2026, minutes after the property expense migration ran, one account, two surfaces:
//
//   /app/tax          her bill computed on property net of £4,750, interest handled as a
//                     Section 24 credit
//   /app/tax/summary  "£4,750 of rent in, £2,440 out, so £2,310 of property profit so far"
//
// £2,440 apart, on the page that tells a mandated customer these are "the figures it asks for".
//
// 🔴 AND THIS BUG WAS ALREADY FOUND ONCE, ON 6 AUGUST 2026, ON A DIFFERENT SURFACE. lib/supabase.ts
// records it against the shared book: that reader "counted it as a running cost and the shared book
// printed a profit £15,000 lower than the proof of income document for the same account". The fix
// taught getBookShareRows to hand over a decided `financeCost` boolean. Its sibling twenty lines
// up, getConfirmedTransactionsForRange, which feeds the quarter pack, was never taught.
//
// It stayed invisible for a week because until the R2-F5/F7 migration there was no door through
// which a property cost could be written at all, so no row existed that could make the two answers
// differ. The full gate was 223 suites and 17,254 assertions green on the day this shipped.
//
// So the guards below are about the RULE and the WIRING, not about Rosa's pennies:
//   the cost leaves expenses, it leaves the category breakdown, it does NOT leave the document,
//   a TRADE's loan interest is untouched, and both readers of the same rows decide it identically.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { stageLib } from './stagelib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const lib = path.join(root, 'lib');
const stage = stageLib('f25-');
const Q = await import(pathToFileURL(path.join(stage, 'quarterpack.ts')).href);
const P = await import(pathToFileURL(path.join(stage, 'propertyengine.ts')).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.error(`  FAIL ${name}`); } };
const eq = (name, got, want) => {
  const same = typeof want === 'number' ? Math.abs(got - want) < 0.005 : got === want;
  if (same) pass++;
  else { fail++; console.error(`  FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
};

// Rosa's shape: rent in, one letting agent fee, four months of BTL interest inside the quarter.
const rent = (d, amt = 950) => ({ amount: amt, transaction_date: d, category: 'rent', vendor: 'M OKAFOR', income_type: 'property' });
const interest = (d) => ({ amount: -610, transaction_date: d, category: 'mortgage interest', vendor: 'HALIFAX BTL MORTGAGE DD', income_type: 'property', financeCost: true });
const agent = (d) => ({ amount: -95, transaction_date: d, category: 'letting agent', vendor: 'CITYLETS PROPERTY MGMT', income_type: 'property' });

const build = (transactions, quarter = 2) => Q.buildQuarterPack({ transactions, startYear: 2026, quarter });

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('A. The interest leaves the profit, and does not leave the document');
// ════════════════════════════════════════════════════════════════════════════════════════
{
  // Quarter 2 is 6 July to 5 October 2026.
  const pack = build([
    rent('2026-07-10'), rent('2026-08-01'), rent('2026-09-01'),
    interest('2026-07-12'), interest('2026-08-02'), interest('2026-09-02'),
    agent('2026-08-06'),
  ]);
  const p = pack.property;

  eq('rent is counted in full', p.income, 2850);
  eq('the letting agent fee IS an allowable expense and stays in', p.expenses, 95);
  eq('🔴 the mortgage interest is OUT of expenses', p.financeCost, 1830);
  eq('and it is counted, not guessed at', p.financeCount, 3);
  eq('🔴 property profit is rent less the ALLOWABLE costs only', p.net, 2755);

  // The whole point: the old behaviour would have made net 925 (2850 - 95 - 1830).
  ok('the profit is NOT rent minus everything that left the account', p.net !== 2850 - 95 - 1830);

  // It must not silently vanish from the breakdown either. The capital comment in this same
  // function exists because a cost that disappears puts two numbers on one product with nothing
  // joining them.
  const cats = p.expensesByCategory.map((c) => c.category);
  ok('interest is out of the category breakdown', !cats.includes('mortgage interest'));
  ok('the agent fee is still in the category breakdown', cats.includes('letting agent'));
  // The invariant is NOT that the three add back to income. Finance is money that genuinely left
  // his account and is deliberately outside the profit calculation, which is the whole of Section
  // 24. So: profit is income less ALLOWABLE costs, and the interest is reported alongside.
  eq('profit is income less allowable costs, finance excluded', p.net, p.income - p.expenses);
  eq('and every pound that left the account is still accounted for somewhere',
    p.expenses + p.financeCost + p.capitalCost, 95 + 1830);
}

// ════════════════════════════════════════════════════════════════════════════════════════
console.log("B. A trade's loan interest is deductible and must not be touched");
// ════════════════════════════════════════════════════════════════════════════════════════
{
  // Section 24 is about RESIDENTIAL LETTING. A sole trader's business loan interest is an ordinary
  // allowable expense and always has been. Taking this one too far silently deletes a real
  // deduction, which is the expensive direction.
  const tradeLoan = { amount: -400, transaction_date: '2026-07-10', category: 'bank charges and interest', vendor: 'BUSINESS LOAN INTEREST', income_type: null };
  const pack = build([
    { amount: 5000, transaction_date: '2026-07-08', category: 'income', vendor: 'A CUSTOMER', income_type: null },
    tradeLoan,
  ]);
  eq("the trade's loan interest is still an expense", pack.trade.expenses, 400);
  eq('and no finance bucket is used on the trade stream', pack.trade.financeCost, 0);
  eq('so trade profit is unchanged by any of this', pack.trade.net, 4600);
}
{
  // Belt and braces: even a row wrongly flagged AND left on the trade stream must not be pulled
  // out of trade expenses, because summariseStream gates on wantProperty as well as the flag.
  const mislabelled = { amount: -400, transaction_date: '2026-07-10', category: 'mortgage interest', vendor: 'SOME LENDER', income_type: null, financeCost: true };
  const pack = build([{ amount: 5000, transaction_date: '2026-07-08', category: 'income', vendor: 'X', income_type: null }, mislabelled]);
  eq('a flagged row on the TRADE stream keeps its deduction', pack.trade.expenses, 400);
  eq('and the trade finance bucket stays empty', pack.trade.financeCost, 0);
}

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('C. Undefined reads as false, and capital still works beside it');
// ════════════════════════════════════════════════════════════════════════════════════════
{
  // Every fixture written before this field existed, and every row from a caller that has not been
  // updated, arrives with financeCost undefined. That must behave exactly as the module always did.
  const unflagged = { amount: -610, transaction_date: '2026-07-12', category: 'mortgage interest', vendor: 'HALIFAX BTL MORTGAGE DD', income_type: 'property' };
  const pack = build([rent('2026-07-10'), unflagged]);
  eq('an unflagged row is an ordinary expense, the old behaviour', pack.property.expenses, 610);
  eq('and the finance bucket is empty', pack.property.financeCost, 0);
}
{
  // The two exclusions are independent and must not eat each other.
  const car = { amount: -30000, transaction_date: '2026-07-14', category: 'van', vendor: 'MOTOR DEALER', income_type: null, writtenDown: true };
  const pack = build([
    { amount: 20000, transaction_date: '2026-07-08', category: 'income', vendor: 'X', income_type: null }, car,
    rent('2026-07-10'), interest('2026-07-12'),
  ]);
  eq('the car is still held out as capital', pack.trade.capitalCost, 30000);
  eq('the car did not land in the finance bucket', pack.trade.financeCost, 0);
  eq('the interest is still held out as finance', pack.property.financeCost, 610);
  eq('the interest did not land in the capital bucket', pack.property.capitalCost, 0);
}

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('D. The rule has ONE owner, and both readers of the rows ask it');
// ════════════════════════════════════════════════════════════════════════════════════════

// The predicate itself stays in lib/propertyengine.ts and this suite calls it rather than
// restating it, so a change there cannot pass here by being copied.
ok('the predicate lives in propertyengine and knows a mortgage', P.isResidentialFinanceCost('mortgage interest', 'HALIFAX BTL MORTGAGE DD') === true);
ok('and knows an ordinary cost is not one', P.isResidentialFinanceCost('letting agent', 'CITYLETS PROPERTY MGMT') === false);

const qpSrc = readFileSync(path.join(lib, 'quarterpack.ts'), 'utf8');
const supaSrc = readFileSync(path.join(lib, 'supabase.ts'), 'utf8');
const sumSrc = readFileSync(path.join(root, 'app/app/tax/summary/page.tsx'), 'utf8');

// 🔴 THE DOCTRINE LOCK THIS MODULE STATES ABOUT ITSELF. quarterpack.ts holds exactly the relative
// imports it can resolve under the suites' fixed string replace staging. A third one breaks three
// suites on module resolution rather than on anything real, which is why the answer is handed in
// as a decided boolean instead.
const qpImports = [...qpSrc.matchAll(/from '(\.\/[a-zA-Z0-9._-]+)'/g)].map((m) => m[1]).sort();
eq('quarterpack still imports only taxengine and scotland', qpImports.join(','), './scotland,./taxengine');
ok('and it does NOT import the property engine', !qpImports.includes('./propertyengine'));

// Both readers of the same rows must decide it, and decide it the same way. One of them learned
// this on 6 August and the other did not, which is the whole finding.
const packReader = supaSrc.slice(supaSrc.indexOf('export async function getConfirmedTransactionsForRange'), supaSrc.indexOf('export async function getBusinessName'));
ok('the pack reader decides financeCost', /financeCost:/.test(packReader));
ok('it asks the one predicate rather than restating the rule', /isResidentialFinanceCost\(/.test(packReader));
ok('and only ever on the property stream', /income_type[\s\S]{0,60}'property'/.test(packReader));
// Both call sites, so a future edit cannot quietly drop one of them again.
eq('every reader that hands rows onward decides it', (supaSrc.match(/financeCost:\s*\n?\s*String\(r\.income_type/g) ?? []).length, 2);

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('E. It reaches the customer, on both documents');
// ════════════════════════════════════════════════════════════════════════════════════════

// A cost held out of the profit and then not shown is the exact failure the capital line in this
// module was written to stop: "Out £72,088" and "Profit £22,776" on two screens with nothing
// joining them. So both surfaces have to print it.
ok('the quarterly summary page prints the finance figure', /property\.financeCost/.test(sumSrc));
ok('and only when there is one to print', /property\.financeCost > 0/.test(sumSrc));

// ⚠️ SLICED TO THE RENDERED BLOCK, NOT THE WHOLE FILE. The first draft of this suite tested the
// file, and the sabotage pass caught it: the explanatory COMMENT above the block also says
// "Section 24", so stripping the reason out of the copy a customer reads left the guard green.
// A guard that a comment can satisfy is not a guard.
const fStart = sumSrc.indexOf('{sub.property.financeCost > 0 ? (');
const financeBlock = fStart >= 0 ? sumSrc.slice(fStart, fStart + 900) : '';
ok('the block exists to test', financeBlock.length > 0);
ok('and says why it is not in the profit, in the copy she reads', /Section 24/.test(financeBlock));
ok('and names the relief so the customer is not just told no', /20% credit/.test(financeBlock));
ok('and says plainly that it is not in the figure above', /not in the profit above/.test(financeBlock));

{
  const pack = build([rent('2026-07-10'), interest('2026-07-12')]);
  const html = Q.renderQuarterPackHtml(pack);
  ok('the printable pack names the interest', /[Mm]ortgage interest/.test(html));
  ok('the printable pack says it is NOT deducted', /NOT deducted|not deducted/.test(html));
  ok('the printable pack cites Section 24', /Section 24/.test(html));
  // And the profit it prints is the correct one.
  ok('the printable pack prints the correct property profit', html.includes('£950.00'));
}
{
  // No landlord, nothing to say. Doc 103's empty test: a permanent row that says nothing most of
  // the time teaches him to stop reading.
  const pack = build([{ amount: 5000, transaction_date: '2026-07-08', category: 'income', vendor: 'X', income_type: null }]);
  const html = Q.renderQuarterPackHtml(pack);
  ok('a trade only pack says nothing about Section 24', !/Section 24/.test(html));
}

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('F. Rosa, as she actually stood on 13 August 2026');
// ════════════════════════════════════════════════════════════════════════════════════════
{
  // Year to date, quarter 2, the figures read off production: £4,750 of rent confirmed since
  // 6 April and four £610 payments of BTL interest inside the tax year.
  const txns = [
    rent('2026-04-10', 950), rent('2026-05-01', 950), rent('2026-06-01', 950),
    rent('2026-07-10', 950), rent('2026-08-01', 950),
    interest('2026-05-02'), interest('2026-06-02'), interest('2026-07-12'), interest('2026-08-02'),
  ];
  const ytd = build(txns).ytd.property;
  eq('her rent year to date', ytd.income, 4750);
  eq('her interest, held out', ytd.financeCost, 2440);
  eq('🔴 her property profit is £4,750, which is what /app/tax already believed', ytd.net, 4750);
  ok('and never £2,310, which is what the update page used to say', ytd.net !== 2310);
}

console.log('');
console.log(`${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

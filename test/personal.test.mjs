// Is this actually business money?
//
// The fixtures below are REAL rows from real books, which is why this exists. All
// three were confirmed, and all three were being counted as taxable trading income.
//
// The thing these tests protect: we must catch the money that is not business money,
// and we must NOT catch the money that is. A false positive here tells a working
// tradesperson that the job he just got paid for was not real work.

import * as P from '../lib/personal.ts';

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}`);
  }
}

console.log('\nIs this business money?\n');

// --- the ones we found in real books ----------------------------------------
ok('CHILD TAX CREDIT is a benefit, not income', P.looksPersonal('CHILD TAX CREDIT')?.reason === 'benefit');
ok('CIRCLE UK TRADING REFUND is a refund, not income', P.looksPersonal('CIRCLE UK TRADING REFUND')?.reason === 'refund');
ok('MR JOHN SMITH is a personal transfer', P.looksPersonal('MR JOHN SMITH')?.reason === 'transfer');
ok('BET365 is gambling', P.looksPersonal('BET365')?.reason === 'gambling');

// --- benefits ----------------------------------------------------------------
for (const v of ['UNIVERSAL CREDIT', 'DWP UC', 'Child Benefit', 'PIP PAYMENT', 'Carers Allowance', 'STATE PENSION']) {
  ok(`${v} is a benefit`, P.looksPersonal(v)?.reason === 'benefit');
}

// --- gambling ----------------------------------------------------------------
for (const v of ['PADDY POWER', 'SkyBet', 'WILLIAM HILL', 'NATIONAL LOTTERY']) {
  ok(`${v} is gambling`, P.looksPersonal(v)?.reason === 'gambling');
}

// --- own money ---------------------------------------------------------------
ok('a savings transfer is your own money', P.looksPersonal('TRANSFER TO SAVINGS')?.reason === 'savings');
ok('a Monzo pot is your own money', P.looksPersonal('Monzo Pot')?.reason === 'savings');
ok('Klarna is personal credit', P.looksPersonal('KLARNA')?.reason === 'loan');

// --- THE FALSE POSITIVES THAT WOULD MATTER MOST ------------------------------
//
// If we wrongly flag a real job, we tell a working man that the work he did was
// not real. These are the ones that must NOT trip.
const REAL_BUSINESS = [
  'SCREWFIX',
  'City Electrical Factors',
  'Toolstation',
  'SHELL',
  'TRAVIS PERKINS',
  'Ravi',                 // a customer, first name only
  'Dave',                 // a customer
  'Harding Builders',
  'TSB CLEVELEYS',        // a bank branch paying in a customer cheque
  'NICEIC',
  'Wickes',
  'B&Q',
  'Ford Finance',         // the van. A real business cost.
  'L&G INSURANCE',
  'Vodafone',
];
for (const v of REAL_BUSINESS) {
  ok(`"${v}" is NOT flagged (it is real business money)`, P.looksPersonal(v) === null);
}

// A sole trader trading under his own name must not be swept up. The person check
// requires a TITLE for exactly this reason.
ok('"John Smith Electrical" is not flagged', P.looksPersonal('John Smith Electrical') === null);
ok('a bare name with no title is not flagged', P.looksPersonal('J SMITH LTD') === null);
ok('but "MR J SMITH" IS flagged', P.looksPersonal('MR J SMITH')?.reason === 'transfer');

// --- empties ------------------------------------------------------------------
ok('empty vendor is not flagged', P.looksPersonal('') === null);
ok('null vendor is not flagged', P.looksPersonal(null) === null);
ok('undefined is not flagged', P.looksPersonal(undefined) === null);

// --- the description is searched too -----------------------------------------
ok('a benefit found in the description', P.looksPersonal('HMRC', 'child tax credit payment')?.reason === 'benefit');

// --- findPersonal: what we ask the user about --------------------------------
const BOOKS = [
  { id: '1', vendor: 'CHILD TAX CREDIT', amount: 345.13, confirmed: true },
  { id: '2', vendor: 'BET365', amount: -0.01, confirmed: true },
  { id: '3', vendor: 'SCREWFIX', amount: -84.3, confirmed: true },
  { id: '4', vendor: 'MR JOHN SMITH', amount: 137.6, confirmed: true },
  { id: '5', vendor: 'UNIVERSAL CREDIT', amount: 900, confirmed: true, is_personal: true }, // already handled
];
const found = P.findPersonal(BOOKS);

ok('finds the three that need asking about', found.length === 3);
ok('does NOT re-ask about one the user already marked', !found.some((f) => f.id === '5'));
ok('does not flag the Screwfix run', !found.some((f) => f.id === '3'));
ok('biggest first, because it distorts the tax most', found[0].vendor === 'CHILD TAX CREDIT');
ok('every hit carries a plain reason the user can judge', found.every((f) => f.why.length > 30));

// --- the impact: the number that makes someone care --------------------------
const impact = P.impactOf(found);
ok('adds up the income that should not be there', impact.incomeRemoved === 482.73);
ok('adds up the expenses that should not be there', impact.expensesRemoved === 0.01);

// --- house style ---------------------------------------------------------------
const allCopy = found.map((f) => f.why).join(' ') + Object.values(['benefit','refund','gambling','transfer','savings','loan']).map((r) => P.personalLabel(r)).join(' ');
ok('no em dashes or en dashes in the copy', !/[–—−]/.test(allCopy));
ok('never says we changed it ourselves', !/we have removed|we removed|we took it out/i.test(allCopy));

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

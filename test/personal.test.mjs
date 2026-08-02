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

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 HIS OWN NAME. Found on the live site, 28 July 2026, on real data.
//
// The web pile put "Jag, £496, money out" at the top with a one tap File it button under it. That
// is a transfer to his own second account. Drawings are not a business expense, so filing it takes
// £496 off his taxable profit that should not come off, and UNDERSTATES his tax. Of the two ways to
// be wrong, that is the one he does not notice, because the number moved in his favour.
//
// The existing person matcher could never have caught it: it requires a title (mr, mrs, dr), which
// is deliberate so a sole trader trading under his own name is not swept up. That guesses at whether
// a string is a person. This does not guess. We know his name and we were not asking.
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\nHIS OWN NAME');

const NAMES = ['Jag', 'Jag Chahil', 'Chahil Electrical Ltd'];

ok('🔴 A PAYMENT TO HIMSELF IS CAUGHT', P.looksPersonal('Jag', null, NAMES)?.reason === 'self');
ok('the full name is caught', P.looksPersonal('JAG CHAHIL', null, NAMES)?.reason === 'self');
ok('the name inside a longer bank line is caught', P.looksPersonal('PAYMENT TO JAG CHAHIL', null, NAMES)?.reason === 'self');
ok('punctuation and case do not matter', P.looksPersonal('J.A.G.  CHAHIL', null, ['J A G Chahil'])?.reason === 'self');
ok('the business he trades under is him too', P.looksPersonal('CHAHIL ELECTRICAL LTD', null, NAMES)?.reason === 'self');

// ⚠️ THE FALSE POSITIVE DIRECTION IS THE EXPENSIVE ONE HERE, and it is the opposite of everywhere
// else in this file. Wrongly flagging a supplier does not tell him a job was not real work: it
// quietly costs him a deduction he was entitled to. A naive includes() would do exactly that to
// every one of these.
ok('🔴 JAGUAR IS NOT JAG', P.looksPersonal('JAGUAR LAND ROVER', null, NAMES) === null);
ok('Jagged Edge Roofing is a supplier, not him', P.looksPersonal('JAGGED EDGE ROOFING', null, NAMES) === null);
ok('a longer word starting with the name is not the name', P.looksPersonal('CHAHILS CASH AND CARRY', null, NAMES) === null);
ok('an ordinary merchant is untouched', P.looksPersonal('SCREWFIX DIRECT', null, NAMES) === null);
ok('no names on file means the check never fires', P.looksPersonal('Jag', null, []) === null);
ok('the old behaviour is unchanged when no names are passed', P.looksPersonal('Jag') === null);

// Initials belong to too many suppliers to be worth the risk of a wrong refusal.
ok('a name under three characters is ignored', P.looksPersonal('JC BUILDING SUPPLIES', null, ['JC']) === null);

// ⚠️ THE VENDOR ONLY. A description can carry his name for ordinary reasons, and treating that as a
// transfer to himself throws away a real cost.
ok('🔴 HIS NAME IN THE DESCRIPTION IS NOT A TRANSFER', P.looksPersonal('SCREWFIX', 'invoice for Jag Chahil', NAMES) === null);

// The sentence has to tell him WHY, in words he can argue with, and it must not claim we changed
// anything on his behalf.
const selfWhy = P.looksPersonal('Jag', null, NAMES)?.why ?? '';
ok('the reason explains drawings rather than just refusing', /drawings/i.test(selfWhy));
ok('the self reason carries no dashes', !/[–—−]/.test(selfWhy));
ok('there is a short label for it', P.personalLabel('self') === 'Looks like your own account');

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE DIRECTION. A PERSON PAYING MONEY IN IS A CUSTOMER, NOT A TRANSFER.
//
// Found by walking a real 78 row statement on 2 August 2026. Three of an electrician's domestic
// customers, paying £1,450, £920 and £680, were flagged by PERSON_NAME and dropped into the
// careful pile. A careful row offers one button, "not business money", and confirm_pile and
// confirm_income both refuse a flagged row in SQL, so £3,050 of real income could not be recorded
// by any route at all. For a domestic trade that is most of the book, and it made understating
// income the only available action, which app/app/money/add calls the one direction of error this
// product must never make easy.
//
// ⚠️ ONLY PERSON_NAME IS WRONG ON A CREDIT, which is why the fix is one check and not the rule.
// Every other pattern is still right when the money comes in, and the assertions below hold each
// of them to that.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const IN = 1450;
const OUT = -1450;

ok('🔴 A PERSON PAYING MONEY IN IS NOT FLAGGED. This is the whole finding',
  P.looksPersonal('MR A WHITELEY', 'Garden office supply', [], IN) === null);

ok('...and the same name paying money OUT still is, because that one might be family',
  P.looksPersonal('MR A WHITELEY', 'Garden office supply', [], OUT)?.reason === 'transfer');

ok('...and with no amount at all it behaves exactly as it did before, which is the safe default',
  P.looksPersonal('MR A WHITELEY', null, [])?.reason === 'transfer');

ok('a title prefixed woman paying in is a customer too',
  P.looksPersonal('MRS H BARLOW', 'Kitchen rewire', [], IN) === null
  && P.looksPersonal('MRS D OKONKWO', 'Consumer unit', [], IN) === null);

ok('🔴 HIS OWN NAME IS STILL A TRANSFER WHEN THE MONEY COMES IN',
  P.looksPersonal('RYAN VASEY', null, ['Ryan Vasey'], IN)?.reason === 'self');
ok('a benefit paid in is still a benefit', P.looksPersonal('HMRC CHILD BENEFIT', null, [], IN)?.reason === 'benefit');
ok('a gambling win paid in is still gambling', P.looksPersonal('BET365', null, [], IN)?.reason === 'gambling');
ok('a refund paid in is still a refund', P.looksPersonal('DVLA REFUND', null, [], IN)?.reason === 'refund');

ok('and a real business paying in was never flagged either way',
  P.looksPersonal('MARSH BUILDING SERVICES LTD', null, [], IN) === null
  && P.looksPersonal('MARSH BUILDING SERVICES LTD', null, [], OUT) === null);

ok('a non finite or zero amount falls back to the safe direction rather than guessing',
  P.looksPersonal('MR A WHITELEY', null, [], Number.NaN)?.reason === 'transfer'
  && P.looksPersonal('MR A WHITELEY', null, [], 0)?.reason === 'transfer');

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

// Tests for the deterministic WhatsApp intent logic in lib/waintents.ts.
// Pure functions, no network, no framework. Run with:
//   node test/waintents.test.mjs
// Node 22.6+ reads the TypeScript directly (type stripping).

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const W = await import(`${pathToFileURL(path.resolve(here, '../lib/waintents.ts')).href}`);

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};
const eq = (name, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name} got ${g} want ${w}`); }
};

console.log('\n=== waintents: amounts ===\n');
eq('plain amount', W.extractMoneyAmount('spent 40 on diesel'), 40);
eq('pound amount with comma', W.extractMoneyAmount('got paid £1,200.50 by Dave'), 1200.5);
eq('k suffix', W.extractMoneyAmount('invoiced 1.2k for the extension'), 1200);
eq('pound k suffix', W.extractMoneyAmount('got paid £2k'), 2000);
eq('rejects zero', W.extractMoneyAmount('spent £0 on nothing'), null);
eq('rejects over a million', W.extractMoneyAmount('spent £2,000,000'), null);
eq('CIS comma amounts', W.poundAmounts('Dave paid £1,200, £240 CIS deducted'), [1200, 240]);
eq('poundAmounts ignores bare numbers', W.poundAmounts('80% of 45'), []);

console.log('\n=== waintents: money entries ===\n');
const e1 = W.parseMoneyEntryRegex('spent £40 on diesel');
ok('expense parses', e1 && e1.direction === 'expense' && e1.amount === 40 && e1.category === 'fuel');
const e2 = W.parseMoneyEntryRegex('got paid £500 by Dave');
ok('income parses with payer', e2 && e2.direction === 'income' && e2.amount === 500 && /dave/i.test(e2.merchant_name));
const e3 = W.parseMoneyEntryRegex('Dave paid £300');
ok('subject payer is income', e3 && e3.direction === 'income');
const e4 = W.parseMoneyEntryRegex('I paid £30 for parking');
ok('first person paid is expense', e4 && e4.direction === 'expense' && e4.category === 'travel');
ok('question is not an entry', W.parseMoneyEntryRegex('how much did I spend on fuel?') === null);
const e5 = W.parseMoneyEntryRegex('got a refund of £25 from Screwfix');
ok('refund received is income', e5 && e5.direction === 'income' && e5.amount === 25);
const e6 = W.parseMoneyEntryRegex('spent £1,250.75 at Jewson on timber');
ok('comma amount entry', e6 && e6.amount === 1250.75 && e6.category === 'materials');

// 🔴 THE MERCHANT NAME RAN INTO THE NEXT CLAUSE. Found 27 Jul 2026 by the WhatsApp end to end test,
// on a LIVE number, not by any fixture in this file.
//
// The merchant capture class includes spaces (real merchants have them: "travis perkins", "b & q"),
// so a greedy match ran straight through the following preposition. "bought a drill from screwfix
// for £129" was filed under the merchant name "screwfix for", and the reply to the customer read
// "screwfix for for £129.00".
//
// Every fixture above used a SINGLE WORD merchant, which is exactly why a hundred and sixty passing
// assertions said nothing. The bug lived in the gap between how we write test data and how a man
// actually texts. These fixtures are deliberately messier.
const e7 = W.parseMoneyEntryRegex('bought a drill from screwfix for £129');
ok('🔴 the name is cut at the next clause, not filed with the preposition attached',
  e7 && e7.merchant_name.toLowerCase() === 'screwfix');
ok('...and the amount still parses on the same message', e7 && e7.amount === 129);

const e8 = W.parseMoneyEntryRegex('spent £80 at travis perkins for cement');
ok('🔴 a genuine multi word merchant survives, and the trailing clause is dropped',
  e8 && e8.merchant_name.toLowerCase() === 'travis perkins');

// ⚠️ THE REGRESSION THIS FIX COULD EASILY HAVE CAUSED. Cutting on "and" as well would have been the
// obvious tidier rule, and it would have filed "bath and body works" as "bath". A fix that mangles
// real shop names to clean up a parse is worse than the bug.
const e9 = W.parseMoneyEntryRegex('spent £45 at bath and body works');
ok('🔴 "and" is NOT a cut point: a real shop name containing it survives whole',
  e9 && e9.merchant_name.toLowerCase() === 'bath and body works');

console.log('\n=== waintents: dates ===\n');
const now = new Date('2026-07-02T10:00:00Z');
eq('today by default', W.entryDate('spent £40 on diesel', now), '2026-07-02');
eq('yesterday dated back', W.entryDate('spent £40 on diesel yesterday', now), '2026-07-01');
eq('receipt date kept', W.clampReceiptDate('2026-06-28', now), '2026-06-28');
eq('future receipt date clamped', W.clampReceiptDate('2027-01-01', now), '2026-07-02');
eq('ancient receipt date clamped', W.clampReceiptDate('2019-01-01', now), '2026-07-02');
eq('garbage receipt date clamped', W.clampReceiptDate('28/06/2026', now), '2026-07-02');
eq('null receipt date clamped', W.clampReceiptDate(null, now), '2026-07-02');

console.log('\n=== waintents: small talk and fixes ===\n');
ok('thanks', W.isThanks('Thanks mate!'));
ok('cheers', W.isThanks('cheers'));
ok('not thanks with content', !W.isThanks('thanks, also spent £40 on diesel'));
eq('bare yes', W.matchAck('Yes'), 'yes');
// A FRIENDLY NOISE IS NOT AN APPROVAL. This test used to assert the opposite, and
// that assertion was protecting a real bug: "ok", "done", "sure" and 👍 all returned
// 'yes', and 'yes' confirmed EVERY unconfirmed entry in the account. A man replying
// 👍 to "Logged. Screwfix, £84.30" was silently approving months of bank lines he had
// never seen. Approving what you were never shown is not an approval gate.
eq('bare ok is an ACK, not an approval', W.matchAck('ok.'), 'ack');
eq('a thumbs up is an ACK, not an approval', W.matchAck('👍'), 'ack');
eq('"done" is an ACK, not an approval', W.matchAck('done'), 'ack');
eq('"sure" is an ACK, not an approval', W.matchAck('sure'), 'ack');
eq('"cheers" is an ACK', W.matchAck('cheers'), 'ack');
// Only an explicit, unambiguous yes files anything.
eq('an explicit yes IS an approval', W.matchAck('yes'), 'yes');
eq('yeah is an approval', W.matchAck('yeah'), 'yes');
eq('confirm is an approval', W.matchAck('confirm'), 'yes');
eq('no is still no', W.matchAck('no'), 'no');
eq('bare no', W.matchAck('nah'), 'no');
ok('yes with content passes through', W.matchAck('yes I spent £40') === null);
eq('stop', W.matchStopStart('STOP'), 'stop');
eq('stop reminders', W.matchStopStart('stop the reminders'), 'stop');
eq('start', W.matchStopStart('start reminders'), 'start');
ok('stop invoice not matched', W.matchStopStart('stop the invoice') === null);
ok('delete that', W.isDeleteLast('delete that'));
ok('undo', W.isDeleteLast('undo'));
ok('scrap it', W.isDeleteLast('scrap that'));
ok('delete with target passes', !W.isDeleteLast('delete my account'));
eq('change it to 45', W.matchEditLast('change it to 45'), { amount: 45 });
eq('make that £1,250', W.matchEditLast('make that £1,250'), { amount: 1250 });
eq('that should be 80', W.matchEditLast('that should be 80'), { amount: 80 });
ok('plain number is not an edit', W.matchEditLast('45') === null);

console.log('\n=== waintents: static answers ===\n');
ok('pricing question', W.isPricing('how much do you cost?'));
ok('pricing is it free', W.isPricing('is it free?'));
ok('pricing not spending question', !W.isPricing('how much did I spend this month?'));
ok('identity bot', W.isIdentity('are you a bot?'));
ok('identity who', W.isIdentity('who are you'));
ok('deadline question', W.isDeadlineQuestion('when is my tax due?'));
ok('deadline quarterly', W.isDeadlineQuestion('when is the next quarterly update due'));
ok('non deadline when', !W.isDeadlineQuestion('when did Dave pay me'));
ok('deadline answer names the cycle', /7 August/.test(W.deadlineAnswer(new Date('2026-07-02T10:00:00Z'))));
ok('deadline answer picks next date', /7 August 2026/.test(W.deadlineAnswer(new Date('2026-07-02T10:00:00Z'))));
ok('deadline rolls to Nov after Aug', /7 November 2026/.test(W.deadlineAnswer(new Date('2026-08-08T10:00:00Z'))));

console.log('\n=== waintents: totals questions ===\n');
const t1 = W.matchTotalsQuestion('how much have I spent this month?', now);
ok('spent this month', t1 && t1.kind === 'spent' && t1.sinceISO === '2026-07-01' && t1.periodLabel === 'this month');
const t2 = W.matchTotalsQuestion('how much did I spend on fuel this year', now);
ok('spent on fuel this tax year', t2 && t2.kind === 'spent' && t2.category === 'fuel' && t2.sinceISO === '2026-04-06');
const t3 = W.matchTotalsQuestion('what is my profit', now);
ok('profit all time', t3 && t3.kind === 'profit' && t3.sinceISO === null);
const t4 = W.matchTotalsQuestion('how much tax do I owe', now);
ok('tax keyed to the tax year', t4 && t4.kind === 'tax' && t4.sinceISO === '2026-04-06');
const t5 = W.matchTotalsQuestion('how much have I made this week?', now);
ok('made this week starts Monday', t5 && t5.kind === 'made' && t5.sinceISO === '2026-06-29');
ok('money entry is not a totals question', W.matchTotalsQuestion('spent £40 on diesel', now) === null);
ok('entry with question mark is not totals', W.matchTotalsQuestion('spent 40 on diesel?', now) === null);
ok('claim question is not totals', W.matchTotalsQuestion('how much can I claim for tools?', now) === null);
eq('gbp formatting', W.formatGbp(1250.5), '£1,250.50');


console.log('\n=== waintents: NI and student loan ===\n');
ok('ni question full phrase', W.isNiQuestion('how much national insurance do I pay'));
ok('ni question class 4', W.isNiQuestion('what is my class 4'));
ok('ni question class 2', W.isNiQuestion('do i need to pay class 2'));
ok('ni question state pension', W.isNiQuestion('am i paying enough for my state pension'));
ok('bare ni with question shape', W.isNiQuestion('how much ni do i pay'));
ok('bare ni without question shape is not', !W.isNiQuestion('ni'));
ok('money entry is not an ni question', !W.isNiQuestion('spent £40 on national insurance'));
ok('generic tax question is not ni', !W.isNiQuestion('how much tax do I owe'));

ok('student loan question', W.isStudentLoanQuestion('how much student loan will I owe'));
ok('uni loan question', W.isStudentLoanQuestion('whats my uni loan looking like'));
ok('postgrad loan question', W.isStudentLoanQuestion('do i owe on my postgraduate loan'));
ok('plain tax question is not student loan', !W.isStudentLoanQuestion('how much tax do I owe'));

eq('plan set bare', W.matchStudentLoanPlanSet('plan 2'), 'plan2');
eq('plan set with context', W.matchStudentLoanPlanSet('my student loan is plan 5'), 'plan5');
eq('plan set student loan plan 4', W.matchStudentLoanPlanSet('student loan plan 4'), 'plan4');
eq('plan 3 does not exist', W.matchStudentLoanPlanSet('student loan plan 3'), null);
eq('plan without loan context rejected', W.matchStudentLoanPlanSet('plan 2 rewires next week'), null);
eq('totals question is not a plan set', W.matchStudentLoanPlanSet('how much tax do I owe'), null);

const nia = W.niAnswer({ profit: 30000, salary: 0, class1: 0, class4: 1045.8, class2Annual: 189.8, qualifies: true, voluntarySuggested: false });
ok('ni answer names class 4', /Class 4/.test(nia) && /1,045\.80/.test(nia));
ok('ni answer says pension covered', /pension year looks covered/i.test(nia));
const nib = W.niAnswer({ profit: 5000, salary: 0, class1: 0, class4: 0, class2Annual: 189.8, qualifies: false, voluntarySuggested: true });
ok('low profit ni answer suggests voluntary class 2', /Voluntary Class 2/i.test(nib) && /189\.80/.test(nib));

const sla = W.studentLoanAnswer({ hasPlan: true, planLabel: 'Plan 2', annual: 505.35, threshold: 29385, income: 35000 });
ok('student loan answer has figure and january', /505\.35/.test(sla) && /January/.test(sla));
const slb = W.studentLoanAnswer({ hasPlan: false, planLabel: null, annual: 0, threshold: 0, income: 0 });
ok('no plan answer asks for the plan', /plan 2/i.test(slb));
const slc = W.studentLoanAnswer({ hasPlan: true, planLabel: 'Plan 5', annual: 0, threshold: 25000, income: 20000 });
ok('under threshold answer says nothing due', /Nothing due/.test(slc) && /25,000/.test(slc));


console.log('\n=== waintents: goals ===\n');
const g1 = W.matchGoalSet('my goal is a van for 24k');
ok('goal set parses', g1 && g1.amount === 24000 && g1.kind === 'purchase');
ok('goal title is the thing', g1 && g1.title === 'van');
const g2 = W.matchGoalSet('saving up for a rainy day fund 5000');
ok('savings kind detected', g2 && g2.kind === 'savings' && g2.amount === 5000);
const g3 = W.matchGoalSet('new goal earn 60k this year');
ok('income kind detected', g3 && g3.kind === 'income' && g3.amount === 60000);
ok('no trigger no goal', W.matchGoalSet('spent 40 on diesel') === null);
ok('no amount no goal', W.matchGoalSet('my goal is a van') === null);
ok('goal question matches', W.isGoalQuestion('how are my goals looking'));
ok('goal question progress', W.isGoalQuestion('what is my goal progress'));
ok('plain goal word alone is not a question', !W.isGoalQuestion('goal'));
ok('goal done matches', W.isGoalDone('goal done'));
ok('goal smashed matches', W.isGoalDone('goal smashed mate'));
ok('unrelated done does not match', !W.isGoalDone('job done'));
const ga = W.goalAnswer([{ title: 'van', amount: 24000 }], 12000);
ok('goal answer shows coverage', /12,000\.00/.test(ga) && /50%/.test(ga));
const gb = W.goalAnswer([], 0);
ok('no goals answer invites one', /my goal is/.test(gb));

// --- Property: rent in and the property question ---------------------------------
{
  const a = W.matchRentIn('rent 950 in from flat 2');
  ok('rent in from a property matches', a && a.amount === 950 && a.property === 'flat 2');
  const b = W.matchRentIn('received rent 800');
  ok('received rent matches without a property', b && b.amount === 800 && b.property === null);
  const c = W.matchRentIn('rent in 1200 from the leeds house');
  ok('the strips from the nickname', c && c.property === 'leeds house');
  ok('paying rent out never matches', !W.matchRentIn('paid 950 rent for the yard'));
  ok('a rent question never matches', !W.matchRentIn('how much rent did I get?'));
  ok('rent with no amount never matches', !W.matchRentIn('rent came in from flat 2'));
  ok('rent with no direction never matches', !W.matchRentIn('rent 950'));
  ok('tenant paid me counts as incoming', !!W.matchRentIn('tenant paid me 950 rent in'));

  ok('property question matches', W.isPropertyQuestion('how are my properties doing'));
  ok('rental tax question matches', W.isPropertyQuestion('what tax do I owe on my rental'));
  ok('logging never reads as a question', !W.isPropertyQuestion('rent 950 in from flat 2'));
  ok('plain trade totals stay out', !W.isPropertyQuestion('how much have I made'));

  const empty = W.propertyAnswer(0, 0, 0, 0);
  ok('no rent answer teaches the intent', /rent 950 in from flat 2/.test(empty));
  const full = W.propertyAnswer(12000, 800, 80, 2);
  ok('answer carries the figures', /£12,000/.test(full) && /£800/.test(full) && /2 properties/.test(full));
  ok('answer warns about April 2027', /April 2027/.test(full) && /£80/.test(full));
  ok('no NI line present', /no National Insurance/.test(full));
  ok('answers carry no forbidden dashes', !/[\u2013\u2014\u2212]/.test(empty + full));
}

// --- The invoice chaser -----------------------------------------------------------
{
  ok('chase invoice with number', W.matchChaseRequest('chase invoice 12').number === '12');
  ok('chase INV form', W.matchChaseRequest('chase INV-0012 payment').number === '0012'.replace(/^0+(?=\d)/, ''));
  ok('who owes me matches', !!W.matchChaseRequest('who owes me'));
  ok('unpaid invoices matches', !!W.matchChaseRequest('any unpaid invoices'));
  ok('chase up without number', W.matchChaseRequest('chase up that invoice').number === null);
  ok('plain chat never matches', !W.matchChaseRequest('going to chase some leads today'));
  ok('rent logging never matches', !W.matchChaseRequest('rent 950 in from flat 2'));

  const nudge = W.chaseMessage('Dave Wilson', '0012', 850, 18, 'https://x/i/1');
  ok('14 day draft is friendly', nudge.includes('friendly nudge') && nudge.includes('£850') && nudge.includes('https://x/i/1'));
  const firm = W.chaseMessage('Dave Wilson', '0012', 850, 34, 'https://x/i/1');
  ok('30 day draft is firmer', firm.includes('outstanding') && firm.includes('this week'));
  ok('empty customer falls back politely', W.chaseMessage('', '7', 100, 20, 'https://x').startsWith('Hi there'));
  ok('drafts carry no forbidden dashes', !/[\u2013\u2014\u2212]/.test(nudge + firm));
}

// --- The guided setup --------------------------------------------------------------
{
  ok('setup matches', W.isSetupRequest('setup'));
  ok('set me up matches', W.isSetupRequest('set me up'));
  ok('a question never starts setup', !W.isSetupRequest('how do i set up a limited company?'));
  ok('chat about setup does not trigger', !W.isSetupRequest('the site setup took ages'));

  ok('salary 32000 saves', W.matchSalarySet('salary 32000') === 32000);
  ok('my salary is 28,500', W.matchSalarySet('my salary is 28,500') === 28500);
  ok('i earn 45k', W.matchSalarySet('i earn 45k') === 45000);
  ok('rent never reads as salary', W.matchSalarySet('rent 950 in from flat 2') === null);
  ok('a salary question stays a question', W.matchSalarySet('what salary should i pay myself?') === null);
  ok('tiny numbers rejected', W.matchSalarySet('salary 5') === null);
}

{
  console.log('\n--- instant invoice: "invoice this" ---');
  ok('invoice this fires', W.isInvoiceThis('invoice this') === true);
  ok('invoice that fires', W.isInvoiceThis('Invoice that') === true);
  ok('invoice it fires', W.isInvoiceThis('invoice it') === true);
  ok('make that an invoice fires', W.isInvoiceThis('make that an invoice') === true);
  ok('turn it into an invoice fires', W.isInvoiceThis('turn it into an invoice') === true);
  ok('invoice the last job fires', W.isInvoiceThis('invoice the last job') === true);
  ok('create invoice does NOT fire (that is the full flow)', W.isInvoiceThis('create invoice') === false);
  ok('invoice Dave 500 does NOT fire here', W.isInvoiceThis('invoice Dave 500') === false);
  ok('a bare invoice word does not fire', W.isInvoiceThis('invoice') === false);
  ok('empty is safe', W.isInvoiceThis('') === false);
}

{
  console.log('\n--- moneyAmounts: pound sign optional, skips percentages ---');
  const a = W.moneyAmounts('Dave paid 500, 100 CIS held');
  ok('bare numbers both captured', a.length === 2 && a[0] === 500 && a[1] === 100);
  const b = W.moneyAmounts('£400, £80 CIS deducted');
  ok('pound amounts still work', b.length === 2 && b[0] === 400 && b[1] === 80);
  const c = W.moneyAmounts('20% CIS on 500');
  ok('a percentage is not read as an amount', c.length === 1 && c[0] === 500);
  ok('thousands separators handled', W.moneyAmounts('paid 1,200')[0] === 1200);
  ok('no numbers gives empty', W.moneyAmounts('nothing here').length === 0);
}


// ═══════════════════════════════════════════════════════════════════════════════════════════
// isWeeklySummaryRequest: the free inbound pull that replaced the paid Sunday push (27 July 2026).
//
// THE ONE THING THIS MUST NOT DO is swallow a totals question. "How much did I make this week" is
// a totals question and has its own answer; "send me my weekly summary" is this. They are routed
// one after the other, so a matcher that is too greedy silently changes what a man gets back.
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  console.log('\n=== the weekly summary, asked for ===\n');
  const yes = (s) => ok(`asks for the weekly summary: "${s}"`, W.isWeeklySummaryRequest(s) === true);
  const no = (s) => ok(`does NOT ask for the weekly summary: "${s}"`, W.isWeeklySummaryRequest(s) === false);

  yes('send me my weekly summary');
  yes('weekly summary');
  yes('can i have my week summary please');
  yes('weekly update');
  yes('weekly figures');
  yes('weekly numbers');
  yes('weekly round up');
  yes('weekly roundup');
  yes('summary for this week');
  yes('numbers for last week');
  yes('how was my week');
  yes('how did my week go');
  yes('send me my weekly');
  yes('WEEKLY SUMMARY');

  // 🔴 The overlap. Every one of these belongs to another intent and must stay there.
  no('how much did i make this week');
  no('how much have i spent this week');
  no('what did i earn this week');
  no('this week');
  no('week');
  no('spent £40 on fuel this week');
  no('£120 weekly summary');
  no('how much do i owe');
  no('what is my profit');
  no('');
  no('   ');

  // And the pairing that actually matters, asserted rather than assumed: a totals question must not
  // match this, and the weekly request must not look like a money entry.
  ok('a totals question never matches the weekly request', ['how much did i make this week', 'how much have i spent this month', 'what did i earn']
    .every((s) => W.isWeeklySummaryRequest(s) === false));
  ok('a weekly request is never parsed as a money entry', ['weekly summary', 'how was my week']
    .every((s) => W.parseMoneyEntryRegex(s) === null));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// matchUseOfHomeElection: claiming use of home by text (27 July 2026).
//
// 🔴 THE ONE THING THIS MUST NOT DO IS ACT ON A QUESTION. "Can I claim working from home?" is a
// claim CHECK with an answer in lib/claimrules.data.ts. Electing off the back of it would be us
// making a tax choice on a man's behalf because he asked what the rules were, which is precisely
// the conduct the whole product exists to avoid.
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  console.log('\n=== claiming use of home by text ===\n');
  const M = W.matchUseOfHomeElection;
  const elects = (s, hours) => ok(`elects (${hours === null ? 'no hours' : hours + 'h'}): "${s}"`, (() => {
    const r = M(s);
    return r !== null && r.hoursPerMonth === hours;
  })());
  const no = (s) => ok(`does NOT elect: "${s}"`, M(s) === null);

  // Instructions.
  elects('claim use of home', null);
  elects('claim working from home', null);
  elects('yes claim use of home', null);
  elects('add home office', null);
  elects('start claiming use of home', null);
  elects('sort it, work from home', null);

  // Instructions carrying his hours. Monthly only, on purpose.
  elects('claim use of home, 30 hours a month', 30);
  elects('i work from home 60 hours per month', 60);
  elects('work from home 120 hrs a month', 120);
  elects('use of home 25 hours each month', 25);

  // 🔴 QUESTIONS. Every one of these belongs to the claim checker.
  no('can i claim working from home?');
  no('can i claim use of home');
  no('could i claim for my home office');
  no('do i get anything for working from home');
  no('what can i claim for working from home?');
  no('how much is use of home');
  no('is it worth claiming use of home?');
  no('am i able to claim home office');

  // Not about use of home at all.
  no('claim my mileage');
  no('spent £40 on fuel');
  no('home');
  no('');

  // A WEEKLY figure is deliberately NOT read as monthly. Reading "10 hours a week" as 10 hours a
  // month would put a man in no band at all when he belongs in the middle one, and the wrong band is
  // a wrong figure on a return he is legally responsible for.
  // A bare statement of weekly hours is not an instruction at all, so it does not elect. And even
  // WITH an instruction, the weekly figure is not read: treating "10 hours a week" as 10 a month
  // would put a man in no band when he belongs in the middle one, and the wrong band is a wrong
  // figure on a return he is legally responsible for. He gets asked instead.
  no('i work from home 10 hours a week');
  ok('an instruction with weekly hours asks rather than guessing', M('claim use of home, 10 hours a week').hoursPerMonth === null);
  ok('a bare number with no period is not read', M('claim use of home 30 hours').hoursPerMonth === null);

  // The question we ask when he has not said. The rates are passed in, never written in waintents.
  const q = W.useOfHomeHoursQuestion([
    { band: 25, label: '25 to 50 hours a month', monthly: 10 },
    { band: 51, label: '51 to 100 hours a month', monthly: 18 },
    { band: 101, label: '101 hours a month or more', monthly: 26 },
  ]);
  ok('the question offers all three bands', ['25 to 50', '51 to 100', '101 hours'].every((t) => q.includes(t)));
  ok('the question asks for a number', /how many hours/i.test(q));
  ok('the question carries no forbidden dash', !/[–—−]|\s-\s/.test(q));
  ok('waintents writes down no rate of its own', (() => {
    const src = readFileSync(path.resolve(here, '../lib/waintents.ts'), 'utf8');
    const fn = src.slice(src.indexOf('export function useOfHomeHoursQuestion'));
    return !/\b(10|18|26)\b/.test(fn.slice(0, fn.indexOf('\n}')));
  })());
}
console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

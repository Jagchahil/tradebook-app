// Tests for the deterministic WhatsApp intent logic in lib/waintents.ts.
// Pure functions, no network, no framework. Run with:
//   node test/waintents.test.mjs
// Node 22.6+ reads the TypeScript directly (type stripping).

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

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
eq('bare ok', W.matchAck('ok.'), 'yes');
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

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

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
// 🔴 THE ASKER GOES IN NOW, AND THESE THREE ARE THE ONE MAN WHO GENUINELY HAS A QUARTERLY UPDATE.
// stated_in is the only position that means mandated, and mtdPosition() makes it reachable from
// his own answer and never from arithmetic. Every other asker is held in
// test/wave9_deadlineasker.test.mjs, which proves a director, a partner and an unstated sole
// trader are each answered honestly instead of being handed his date.
const STATED_IN = { structure: 'sole_trader', mtdPosition: 'stated_in' };
ok('deadline answer names the cycle', /7 August/.test(W.deadlineAnswer(new Date('2026-07-02T10:00:00Z'), STATED_IN)));
ok('deadline answer picks next date', /7 August 2026/.test(W.deadlineAnswer(new Date('2026-07-02T10:00:00Z'), STATED_IN)));
ok('deadline rolls to Nov after Aug', /7 November 2026/.test(W.deadlineAnswer(new Date('2026-08-08T10:00:00Z'), STATED_IN)));
// 🔴 AND THE DAY ITSELF IS NOT LATE. It compared instants with `>`, so from midnight on 7 August
// 2026 it skipped to 7 November and told a man his update was three months away on the morning it
// was due. app/app/tax/due.ts reports it still open that day and app/free-mtd-filing compares whole
// days for the same reason. Two surfaces, one fact, and this was the one that disagreed.
ok('🔴 the deadline due TODAY is the answer today, not the next one',
  /7 August 2026/.test(W.deadlineAnswer(new Date('2026-08-07T00:05:00+01:00'), STATED_IN))
  && /7 August 2026/.test(W.deadlineAnswer(new Date('2026-08-07T23:30:00+01:00'), STATED_IN)));

console.log('\n=== waintents: totals questions ===\n');
const t1 = W.matchTotalsQuestion('how much have I spent this month?', now);
ok('spent this month', t1 && t1.kind === 'spent' && t1.sinceISO === '2026-07-01' && t1.periodLabel === 'this month');
const t2 = W.matchTotalsQuestion('how much did I spend on fuel this year', now);
ok('spent on fuel this tax year', t2 && t2.kind === 'spent' && t2.category === 'fuel' && t2.sinceISO === '2026-04-06');
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 SILENCE MEANS THE TAX YEAR. THIS ASSERTION USED TO SAY THE OPPOSITE.
//
// It read `sinceISO === null`, all time, and it passed for as long as that was the default. On
// 12 August 2026 a man on the live WhatsApp number typed "how much have i made this yeat" and was
// answered "You have brought in £70,000.00 all time". The typo missed periodFrom's year test by
// one letter and the fall through handed him a different period without noticing.
//
// The typo was not the fault. matchTotalsQuestion has forced the tax year for a TAX question since
// it was written, with the reason in its own comment: "the only period that makes sense". What he
// made, what he spent and his profit are all numbers with a bill attached, drawn on the same year.
// And "all time" means since Lekhio started counting, which for a June joiner is eleven weeks under
// a phrase that sounds like a career.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const t3 = W.matchTotalsQuestion('what is my profit', now);
ok('🔴 PROFIT WITH NO PERIOD IS THE TAX YEAR, not since we started counting',
  t3 && t3.kind === 'profit' && t3.sinceISO === '2026-04-06' && t3.periodLabel === 'this tax year');
const t3b = W.matchTotalsQuestion('how much have i made all time', now);
ok('and all time is still reachable, deliberately',
  t3b && t3b.kind === 'made' && t3b.sinceISO === null);
ok('🔴 AND WHEN IT IS REACHED IT SAYS WHAT IT ACTUALLY COVERS',
  t3b && t3b.periodLabel === 'since your first entry here' && !/all time/.test(t3b.periodLabel));
const t3c = W.matchTotalsQuestion('how much have i made ever', now);
ok('"ever" reaches it too', t3c && t3c.sinceISO === null);
// 🔴 THE BRANCH IS A FLAG, NOT THE DISPLAY TEXT. Both routers used to choose between "Nothing
// logged yet" and "Nothing logged <period>" by comparing periodLabel to the string 'all time'.
// Rewording the label would have shipped "For since your first entry here:" from four call sites.
ok('🔴 THE ALL TIME BRANCH IS A BOOLEAN, so rewording the label cannot break a sentence',
  t3b && t3b.allTime === true && t3c.allTime === true);
// The defect, exactly as typed on the handset. It is a year question with a typo in it, and the
// answer it gets is now the year either way.
const t3d = W.matchTotalsQuestion('how much have i made this yeat', now);
ok('🔴 AND THE TYPO THAT STARTED THIS GETS THE YEAR, because that is what silence means now',
  t3d && t3d.kind === 'made' && t3d.sinceISO === '2026-04-06');
const t4 = W.matchTotalsQuestion('how much tax do I owe', now);
ok('tax keyed to the tax year', t4 && t4.kind === 'tax' && t4.sinceISO === '2026-04-06');
ok('and the flag is false for every real period',
  t3.allTime === false && t1.allTime === false && t2.allTime === false && t4.allTime === false);
ok('the flag and the window never disagree, so neither can drift alone',
  [t1, t2, t3, t3b, t3c, t4].every((t) => t.allTime === (t.sinceISO === null)));
const t5 = W.matchTotalsQuestion('how much have I made this week?', now);
ok('made this week starts Monday', t5 && t5.kind === 'made' && t5.sinceISO === '2026-06-29');
ok('money entry is not a totals question', W.matchTotalsQuestion('spent £40 on diesel', now) === null);
ok('entry with question mark is not totals', W.matchTotalsQuestion('spent 40 on diesel?', now) === null);
ok('claim question is not totals', W.matchTotalsQuestion('how much can I claim for tools?', now) === null);
eq('gbp formatting', W.formatGbp(1250.5), '£1,250.50');


console.log('\n=== waintents: what do I owe, one figure on every channel ===\n');
// ⚠️ THE THIRD ARGUMENT IS "IS THERE A POSITION AT ALL", added 9 August 2026 after both chat
// lanes were caught announcing "Put by £0.00 for tax" to a man with costs logged and no income
// confirmed. hasTaxPosition() in lib/taxoptimiser.ts owns the rule and the caller passes the
// answer in; test/emptyposition.test.mjs owns both arms of it. These two stay on the arm that has
// a figure, because that is what the assertions below are about.
const oweP = W.oweAnswer(2450.5, true, true);
const oweE = W.oweAnswer(320, false, true);
ok('the owe answer leads with the figure', oweP.startsWith('Put by £2,450.50 for tax.'));
ok('a projection is called a projection', /heading for/.test(oweP) && /confirmed so far/.test(oweP));
ok('an early year says it is too early to call', /too early to call the whole year yet/.test(oweE));
ok('both stay short and end at the Tax screen', [oweP, oweE].every((s) => /Full picture in the app under Tax\.$/.test(s)));
ok('no forbidden dashes in either', [oweP, oweE].every((s) => !/[–—]/.test(s)));

// 🔴 BOTH CHANNELS DERIVE THE OWE FIGURE FROM THE SAME FUNCTION, BY NAME (31 July 2026).
//
// The WhatsApp webhook used to run a little January of its own for this question (soleTraderTax
// plus the loan minus CIS, with company and partnership variants) after the thread had already
// moved to the tax hub's own taxPosition() on getOptimiserInput(). Two channels, two numbers, one
// question. These assertions read both routes' source and tie them together the same way
// test/thread.test.mjs ties the thread to the tax hub, so the channels cannot drift apart again.
{
  const waSrc = readFileSync(path.resolve(here, '../app/api/whatsapp/route.ts'), 'utf8');
  const threadSrc = readFileSync(path.resolve(here, '../app/api/thread/route.ts'), 'utf8');
  ok('🔴 the WhatsApp owe answer is taxPosition on getOptimiserInput, the thread and tax hub call',
    /taxPosition\(optimiser\)/.test(waSrc) && /taxPosition\(optimiser\)/.test(threadSrc)
    && /getOptimiserInput\(userId\)/.test(waSrc) && /getOptimiserInput\(userId\)/.test(threadSrc));
  // 🔴 THIS ASSERTION CAUSED THE BUG IT WAS WRITTEN TO PREVENT. Run 3, 13 August 2026.
  //
  // Its heading, four lines up, is that both channels must derive the owe figure from the same
  // function so they cannot drift. It then pinned the LITERAL `tax.setAside`. On 11 August the CIS
  // credit landed and the web surfaces moved to what a man still has to FIND. This line held
  // WhatsApp on the liability and stayed green, and on 13 August WhatsApp answered "Put by
  // £37,457.00 for tax" against £28,250 everywhere else, the difference being exactly his CIS.
  //
  // A guard that names one side's expression cannot notice the other side moving. So what is
  // pinned now is the shared FUNCTION, and that neither side writes the rule out by hand.
  ok('🔴 the figure WhatsApp speaks comes through the one door, billFromPosition',
    /oweAnswer\(billFromPosition\(tax\), tax\.projected, hasPosition\)/.test(waSrc));
  ok('🔴 and the thread speaks the same one, so the channels cannot drift again',
    /billFromPosition\(tax\)/.test(threadSrc));
  ok('🔴 neither channel keeps a hand written copy of the CIS rule',
    !/tax\.cisSuffered > 0 \? tax\.setAsideAfterCis : tax\.setAside/.test(waSrc + threadSrc));
  ok('🔴 the little January is gone from the webhook: no second engine on this question',
    !/studentLoanForSA/.test(waSrc) && !/corporationTax\(/.test(waSrc) && !/rough bill/.test(waSrc));
  ok('the projection notes are the thread\'s own sentences word for word',
    threadSrc.includes('That is what the year is heading for, on everything you have confirmed so far.')
    && oweP.includes('That is what the year is heading for, on everything you have confirmed so far.')
    && threadSrc.includes('too early to call the whole year yet')
    && oweE.includes('too early to call the whole year yet'));
}


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

const sla = W.studentLoanAnswer({ hasPlan: true, planLabel: 'Plan 2', annual: 505.35, threshold: 29385, income: 35000, channel: 'whatsapp' });
ok('student loan answer has figure and january', /505\.35/.test(sla) && /January/.test(sla));
// 🔴 THE NO PLAN BRANCH TURNS ON THE CHANNEL SINCE 17 August 2026, AND THE TWO ANSWERS ARE HELD
// APART HERE. It offers a door, and only WhatsApp has it: matchStudentLoanPlanSet is dispatched by
// that router alone, by the written decision in test/laneparity.test.mjs section 9b. Telling a man
// in a browser to "tell me here, like plan 2" is telling him to do a thing the box will not hear,
// and he finds out by doing it.
const slb = W.studentLoanAnswer({ hasPlan: false, planLabel: null, annual: 0, threshold: 0, income: 0, channel: 'whatsapp' });
ok('no plan answer asks for the plan', /plan 2/i.test(slb));
ok('...and offers to take it right here, because on WhatsApp it can', /Tell me here/.test(slb));
const slbWeb = W.studentLoanAnswer({ hasPlan: false, planLabel: null, annual: 0, threshold: 0, income: 0, channel: 'web' });
ok('🔴 ON THE WEB HE IS NEVER TOLD TO TELL US HERE, because nothing on that channel would hear it',
  !/Tell me here/.test(slbWeb) && !/"plan 2"/.test(slbWeb));
ok('...and he is still sent to the screen that does work', /Money, Student loan/.test(slbWeb));
ok('...and both spellings still say the same true thing: we do not know his plan',
  /I do not know your student loan plan yet/.test(slb) && /I do not know your student loan plan yet/.test(slbWeb));
const slc = W.studentLoanAnswer({ hasPlan: true, planLabel: 'Plan 5', annual: 0, threshold: 25000, income: 20000, channel: 'whatsapp' });
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

  // 🔴 SAME CHANGE, SAME REASON, ON THE PROPERTY EMPTY STATE. matchRentIn is WhatsApp only too.
  const empty = W.propertyAnswer(0, 0, 0, 0, '', 'whatsapp');
  ok('no rent answer teaches the intent', /rent 950 in from flat 2/.test(empty));
  const emptyWeb = W.propertyAnswer(0, 0, 0, 0, '', 'web');
  ok('🔴 ON THE WEB HE IS NEVER TOLD TO TEXT IT, because that channel has no rent lane at all',
    !/Text it as it lands/.test(emptyWeb) && !/rent 950 in from flat 2/.test(emptyWeb));
  ok('...and he is still sent to the door that works, and still told why the stream is kept apart',
    /under Money/.test(emptyWeb) && /separate from your work money/.test(emptyWeb));
  const full = W.propertyAnswer(12000, 800, 80, 2, '', 'whatsapp');
  ok('answer carries the figures', /£12,000/.test(full) && /£800/.test(full) && /2 properties/.test(full));
  ok('answer warns about April 2027', /April 2027/.test(full) && /£80/.test(full));
  ok('no NI line present', /no National Insurance/.test(full));
  ok('answers carry no forbidden dashes', !/[\u2013\u2014\u2212]/.test(empty + emptyWeb + full));
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

// ---------------------------------------------------------------------------------------------
// 🔴 WHICH DOOR HIS WORDS ACTUALLY REACH. Moved 1 August 2026, on Jag's call.
//
// matchUseOfHomeElection was tested EIGHTEEN LINES AND NINE BRANCHES below isHomeOffice in the one
// else-if chain in app/api/whatsapp/route.ts. HOMEOFFICE_RE carries every phrase in HOME_WORDS
// except "home as office", so every phrase this suite asserts as an election was eaten by the
// transaction door before the election matcher was ever called. That door writes a row into
// expenses, which is the door that double counts against the election.
//
// So the matcher was right and unreachable, which is the worst combination: green tests, dead code,
// and a man deducted twice. The assertions below are on the ORDER in the route, not on the
// matchers, because the matchers were never the problem.
// ---------------------------------------------------------------------------------------------
const wroute = readFileSync(path.resolve(here, '../app/api/whatsapp/route.ts'), 'utf8');
const iElection = wroute.indexOf('} else if (matchUseOfHomeElection(text)) {');
const iTransaction = wroute.indexOf('} else if (isHomeOffice(text)) {');
ok('both home working doors are still in the chain', iElection > 0 && iTransaction > 0);
ok('🔴 the ELECTION door is tested before the transaction door', iElection < iTransaction);
ok('the election branch appears exactly once, so the old dead one is gone',
  (wroute.match(/\} else if \(matchUseOfHomeElection\(text\)\) \{/g) || []).length === 1);
ok('and the transaction door is still reachable, for a question or a pound sign',
  (wroute.match(/\} else if \(isHomeOffice\(text\)\) \{/g) || []).length === 1);

// The phrases that now reach the election. Each was reaching the transaction door before the move.
for (const phrase of ['claim use of home', 'claim use of home, 30 hours a month',
  'use of home 25 hours each month', 'start claiming working from home', 'yes claim home office']) {
  ok(`"${phrase}" is an election, and now actually gets there`, W.matchUseOfHomeElection(phrase) !== null);
}

// ---------------------------------------------------------------------------------------------
// A DIRECTOR'S "WHAT DO I OWE" CARRIES THE SENTENCE THAT EXPLAINS THE SMALLER NUMBER.
// ---------------------------------------------------------------------------------------------
ok('🔴 the owe answer renders setAsideBasisLine, so WhatsApp cannot show a smaller figure bare',
  /setAsideBasisLine/.test(wroute) && /oweAnswer\(billFromPosition\(tax\), tax\.projected, hasPosition\)/.test(wroute));

// ---------------------------------------------------------------------------------------------
// QUESTIONS ABOUT LEKHIO ITSELF NEVER REACH THE CLAIM RULEBOOK OR THE TOTALS LANE. (6 Aug 2026.)
// The three live reproductions first, word for word as a customer typed them.
// ---------------------------------------------------------------------------------------------
eq('"Are you HMRC approved software or not?" is the approval question, not a claim check',
  W.matchProductTruth('Are you HMRC approved software or not?'), 'approved');
eq('"Do you file my tax return for me?" is the filing question, not a totals question',
  W.matchProductTruth('Do you file my tax return for me?'), 'files');
eq('"How much tax will you save me? Give me a number." is a promise hunt',
  W.matchProductTruth('How much tax will you save me? Give me a number.'), 'savings');

eq('"are you government software" is the approval question without the word approved',
  W.matchProductTruth('are you government software'), 'approved');
eq('"is lekhio endorsed by hmrc" matches', W.matchProductTruth('is lekhio endorsed by hmrc'), 'approved');
eq('"will you submit my vat to hmrc" matches', W.matchProductTruth('will you submit my vat to hmrc'), 'files');
eq('"will you do my tax return" matches', W.matchProductTruth('will you do my tax return'), 'files');
eq('"can you save me money" matches', W.matchProductTruth('can you save me money'), 'savings');
eq('"do you guarantee the savings" matches', W.matchProductTruth('do you guarantee the savings'), 'savings');

// The near misses stay where they belong.
eq('"can I claim software for the business" stays a claim check',
  W.matchProductTruth('can I claim software for the business'), null);
eq('"what do I owe so far" stays a totals question', W.matchProductTruth('what do I owe so far'), null);
eq('"how much tax do you reckon I owe" stays a totals question',
  W.matchProductTruth('how much tax do you reckon I owe'), null);
eq('"what have you saved me" stays the real saved figure', W.matchProductTruth('what have you saved me'), null);
ok('...and isSavingsQuestion still owns it', W.isSavingsQuestion('what have you saved me'));
eq('"can you save this receipt" is not a savings promise', W.matchProductTruth('can you save this receipt'), null);
eq('"when do you file my updates" is a deadline question and deadlineAnswer knows',
  W.matchProductTruth('when do you file my updates'), null);
eq('"can you check if hmrc approved my refund" is about his refund, not us',
  W.matchProductTruth('can you check if hmrc approved my refund'), null);

// The fixed words keep every promise the compliance docs make, live or not.
for (const live of [false, true]) {
  for (const kind of ['approved', 'files', 'savings']) {
    const a = W.productTruthAnswer(kind, { filingLive: live });
    ok(`${kind} (filingLive ${live}) has no digits, no approval claim, and prepares`,
      !/\d/.test(a) && !/approved by hmrc|hmrc approved/i.test(a) && /prepare/i.test(a));
    ok(`${kind} (filingLive ${live}) has no dashes`, !/[\u2014\u2013]/.test(a) && !/ - /.test(a));
  }
}
ok('the approval answer opens with No', W.productTruthAnswer('approved', { filingLive: false }).startsWith('No'));
ok('the filing answer opens with No', W.productTruthAnswer('files', { filingLive: false }).startsWith('No'));
ok('before the grant, the filing answer says the switch is not on yet',
  /not switched on yet/.test(W.productTruthAnswer('files', { filingLive: false })));
ok('behind the flag, the filing answer still approves first',
  /reviewed and approved|approve first/i.test(W.productTruthAnswer('files', { filingLive: true })));

// An ask to conceal income is refused before any lane can answer it with a figure. The live
// reproduction first, word for word: it carried "tax" and "you" and was answered by the totals
// lane with the set aside block (6 August 2026).
eq('"...cash in hand. Can you keep that income out of the books so I pay less tax?" is refused',
  W.matchProductTruth('Some of my jobs are cash in hand. Can you keep that income out of the books so I pay less tax?'), 'concealment');
eq('"hide my income from hmrc" is refused with no product subject needed',
  W.matchProductTruth('hide my income from hmrc'), 'concealment');
eq('"dont declare the cash to hmrc" is refused', W.matchProductTruth('dont declare the cash to hmrc'), 'concealment');
eq('"off the books" is refused', W.matchProductTruth('can we do this job off the books'), 'concealment');
eq('"how do I declare cash in hand jobs" is an honest question and stays answerable',
  W.matchProductTruth('how do I declare cash in hand jobs'), null);
eq('"cash in hand £200 from dave" is an entry, not an ask', W.matchProductTruth('cash in hand £200 from dave'), null);
const refusal = W.productTruthAnswer('concealment', { filingLive: false });
ok('the refusal opens with No, never helps, and points at the legal savings',
  refusal.startsWith('No') && /never help hide/.test(refusal) && /Ways to save/.test(refusal) && !/[\u2014\u2013]/.test(refusal));

// A request for investment advice is refused, not answered with a tax figure. The live
// reproduction: "Should I put my tax refund into Bitcoin? Which stock should I buy?" carried the
// word tax and was answered by the totals lane with the set aside block (6 August 2026).
eq('"Should I put my tax refund into Bitcoin? Which stock should I buy?" is refused',
  W.matchProductTruth('Should I put my tax refund into Bitcoin? Which stock should I buy?'), 'investment');
eq('"is bitcoin a good investment" is refused', W.matchProductTruth('is bitcoin a good investment'), 'investment');
eq('"should i sell my shares" is refused', W.matchProductTruth('should i sell my shares'), 'investment');
eq('"do i pay tax on savings interest" is a real tax question and stays answerable',
  W.matchProductTruth('do i pay tax on savings interest'), null);
eq('"should I buy a new van for the business" is a business question, not portfolio advice',
  W.matchProductTruth('should I buy a new van for the business'), null);
const invRefusal = W.productTruthAnswer('investment', { filingLive: false });
ok('the investment refusal names what Lekhio is not and offers the tax side only',
  /not a financial adviser/.test(invRefusal) && /regulated adviser/.test(invRefusal) && !/[\u2014\u2013]/.test(invRefusal));

// ---------------------------------------------------------------------------------------------
// THE NINE PHRASINGS THAT WALKED STRAIGHT PAST THE GATE. (6 August 2026, launch walk.)
//
// Every one of these was run against the real matcher and every one came back null, which meant
// the question went to whichever lane caught it next: the totals lane answered an evasion question
// with a set aside figure, and the claim rulebook answered an approval question with a tick.
//
// They are here as a block because they are one lesson, not nine. The gate was written against the
// phrasings somebody sat down and imagined, and real customers do not phrase things that way. They
// use the bare verb ("approve"), they call it "the app" rather than "you", they do not ask a
// question at all ("so you file everything for me right"), they test the water politely instead of
// saying the word hide, and they ask what we save somebody else rather than what we save them.
// ---------------------------------------------------------------------------------------------
eq('"did hmrc approve you?" is the approval question, in the bare verb people actually use',
  W.matchProductTruth('did hmrc approve you?'), 'approved');
eq('"does the app submit to hmrc?" calls it the app, and the app is still us',
  W.matchProductTruth('does the app submit to hmrc?'), 'files');
eq('"will the app do my tax return?" is the filing question about the app',
  W.matchProductTruth('will the app do my tax return?'), 'files');
eq('"so you file everything with hmrc for me right?" is a man assuming, not asking',
  W.matchProductTruth('so you file everything with hmrc for me right?'), 'files');
eq('"can I just not put the cash jobs through?" is evasion asked politely',
  W.matchProductTruth('can I just not put the cash jobs through?'), 'concealment');
eq('"can I pay myself cash to avoid tax?" is evasion asked politely',
  W.matchProductTruth('can I pay myself cash to avoid tax?'), 'concealment');
eq('"do I really need to declare cash jobs?" is a whether, and the answer is yes, always',
  W.matchProductTruth('do I really need to declare cash jobs?'), 'concealment');
eq('"is it ok to leave a small job off?" is the same ask with the books left unnamed',
  W.matchProductTruth('is it ok to leave a small job off?'), 'concealment');
eq('"how much tax do you save the average sparky?" is a promise hunt about somebody else',
  W.matchProductTruth('how much tax do you save the average sparky?'), 'savings');

// ---------------------------------------------------------------------------------------------
// AND THE NINE NEIGHBOURS THAT MUST STAY IN THEIR OWN LANES.
//
// This half of the block is the one that matters. Widening a gate is easy; widening it without
// swallowing the honest question standing next to it is the whole job. Each of these sits one word
// away from something above: a how instead of a whether, his refund instead of ours, the past
// tense instead of the future, a van instead of a share.
// ---------------------------------------------------------------------------------------------
for (const [phrase, why] of [
  ['can I claim software', 'a claim check, and the claim rulebook owns it'],
  ['what do I owe', 'a totals question about his own figures'],
  ['what have you saved me', 'arithmetic on his own figures, and isSavingsQuestion owns it'],
  ['how do I declare cash in hand', 'a how, not a whether, and it deserves a real answer'],
  ['should I buy a new van', 'a business decision, not portfolio advice'],
  ['do I pay tax on savings interest', 'a real tax question that happens to carry the word savings'],
  ['when is my tax return due', 'a deadline question, and deadlineAnswer knows the dates'],
  ['hmrc approved my refund', 'his refund, not us'],
  ['save this receipt', 'a man asking us to keep a record'],
]) {
  eq(`"${phrase}" stays null: ${why}`, W.matchProductTruth(phrase), null);
}

// The wiring: the thread and the webhook both ask the product question FIRST.
const threadSrc = readFileSync(path.resolve(here, '../app/api/thread/route.ts'), 'utf8');
ok('the thread asks matchProductTruth before the totals lane',
  threadSrc.indexOf('matchProductTruth(q)') > -1
  && threadSrc.indexOf('matchProductTruth(q)') < threadSrc.indexOf('matchTotalsQuestion(q)'));
ok('the webhook asks matchProductTruth before the claim rulebook and the totals lane',
  wroute.indexOf('matchProductTruth(text)') > -1
  && wroute.indexOf('matchProductTruth(text)') < wroute.indexOf('isExpenseCheck(text)')
  && wroute.indexOf('matchProductTruth(text)') < wroute.indexOf('matchTotalsQuestion(text)'));
ok('a product truth question is answered even in read only',
  /\|\| matchProductTruth\(text\) !== null/.test(wroute));


// ═══════════════════════════════════════════════════════════════════════════════════════════════
// B2-F3. THE PRODUCT MUST HEAR THE WORDS IT SPEAKS.
//
// 🔴 WALKED LIVE, 17 August 2026, on a Glasgow sole trader with 77 confirmed entries and £10,618
// on his Tax page:
//
//   him: how much should i be putting by for the taxman
//   it:  are you a sole trader registered for CIS, or do you run a limited company?
//
// He answered that at signup step 2 and again at setup step 2, and production SQL says
// business_type is sole_trader. Nothing downstream was broken: matchTotalsQuestion never fired, so
// the question fell through to the model, which asked for a fact it had been handed and gave him no
// figure, on a surface that promises "I answer from your own figures, straight away".
//
// "taxman" does not match \btax\b, the boundary fails on the m. And "putting by" was in none of
// the phrases, while "Put by" is how the answer itself OPENS.
//
// ⚠️ SO THIS IS NOT A LIST OF PHRASINGS, IT IS A PAIRING, DERIVED FROM THE ROUTE SOURCE. The verb
// the answer uses is read off app/api/thread/route.ts and fed back in as a question. Change the
// answer wording without teaching the matcher and this fails here, which is the only place it can
// fail that is not in front of a customer.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== B2-F3: the set aside lane hears the words the product answers with ===\n');

const threadRoute = readFileSync(path.resolve(here, '../app/api/thread/route.ts'), 'utf8');
const waRoute = readFileSync(path.resolve(here, '../app/api/whatsapp/route.ts'), 'utf8');

// The answer template, e.g. `Put by ${formatGbp(leadFigure)} for tax.` The captured verb phrase is
// what a customer will say back to us.
const answerVerbs = [...threadRoute.matchAll(/`([A-Z][a-z]+(?: [a-z]+)?) \$\{formatGbp\([^)]*\)\} for tax/g)]
  .map((m) => m[1].toLowerCase());
ok(`🔴 the thread's set aside answer template was found, verbs: ${JSON.stringify(answerVerbs)}`,
  answerVerbs.length > 0);
// ⚠️ THE QUESTION MUST NOT CONTAIN THE WORD TAX. An earlier draft of this asked
// "how much should i <verb> for tax", and "tax" is itself a trigger, so the verb could have been
// anything at all and the assertion still passed. It was vacuous, and the sabotage that changes the
// answer wording walked straight through it. The verb has to carry the match on its own.
for (const verb of answerVerbs) {
  const asked = `how much should i ${verb}`;
  ok(`🔴 the answer opens "${verb}", so the question "${asked}" must be heard, and it says nothing about tax`,
    !/tax/.test(asked));
  const got = W.matchTotalsQuestion(asked);
  ok(`🔴 it answers with "${verb}", so it must hear "${asked}"`, got !== null && got.kind === 'tax');
}

// The phrasings the walk used, and the ordinary British ones beside them. Each of these is a man
// asking the single most important question this product answers.
for (const asked of [
  'how much should i be putting by for the taxman',
  'how much should i put by for the taxman',
  'what should i be putting by',
  'how much do i owe the taxman',
  'how much am i putting by for the tax man',
  'how much should i put away for tax',
  'what do i need to set aside',
  'how much tax do i owe',
  // ⚠️ EACH OF THE NEXT TWO CARRIES THE MATCH ON ONE THING ONLY, so removing that one thing fails
  // here. Every phrase above it has two or more triggers, which is why the first draft of this
  // section had five sabotages walk through it untouched.
  'what does the taxman want',                    // "taxman" alone. \btax\b cannot match it.
  'should i be putting money by for the taxman',  // "should i" alone as the question word.
]) {
  const got = W.matchTotalsQuestion(asked);
  ok(`hears "${asked}"`, got !== null && got.kind === 'tax');
}

// And it must not have got greedier. A claim question is a different lane with a different answer,
// and an amount is an entry he is logging, not a question he is asking.
for (const asked of [
  'can i claim my boots',
  'can i claim a van against tax',
  'i spent £40 on tax software',
  // ⚠️ THESE TWO CARRY A TRIGGER AND A QUESTION WORD, so they are the only ones that actually test
  // the two exclusions. The three above are refused for want of a trigger and prove nothing.
  'how much tax can i claim on my van',  // tests the can i / claim exclusion
  'my tax bill was £500',                // tests the amount guard: he is telling us, not asking
]) {
  const got = W.matchTotalsQuestion(asked);
  ok(`does NOT hear "${asked}" as a tax question`, got === null || got.kind !== 'tax');
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// B34. THE THREE SET ASIDE PHRASINGS THAT FELL TO THE MODEL, AND WHY EACH ONE NEEDED WHAT IT DID.
//
// The item measured 3 of 18 set aside phrasings reaching the model rather than this lane. Re
// derived at head before anything was changed, and THE ITEM WAS WRONG ABOUT WHY ON THE FIRST:
// it says all three lack a money noun, and "whats the taxman going to want" HAS one. It fails on
// the interrogative clause, because \bwhat\b does not match "whats". The word boundary fails on
// the s, which is B2-F3's own defect one clause over: "taxman" not matching \btax\b.
//
// ⚠️ THE OTHER TWO CARRY NO MONEY NOUN AND NEEDED A COMPANION, AND THE WIDE FIX WAS BUILT,
// MEASURED AND REJECTED TWICE. Adding "january" to the money noun list hijacks EIGHT ordinary
// period questions ("how much did i spend in january" becomes a set aside answer). Adding "am i"
// to the interrogative clause hands FOUR questions that are not the set aside question a set aside
// figure. Both numbers are in lib/waintents.ts above the clause.
//
// 🔴 EVERY ALTERNATIVE IN THAT COMPANION IS WALKED BELOW, OR IT IS NOT IN THE COMPANION. An
// unexercised alternative is a hole with a name, and a sabotage deletes it for free.
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== B34: the three set aside phrasings that used to reach the model ===\n');

// The three from the item, verbatim. These are the targets and they are the whole of the item.
const B34_THREE = [
  'whats the taxman going to want',
  'am i going to get stung in january',
  'what will january cost me',
];
for (const asked of B34_THREE) {
  const got = W.matchTotalsQuestion(asked);
  ok(`🔴 B34: hears "${asked}", which reached the model before 18 August`,
    got !== null && got.kind === 'tax');
}

// 🔴 ONE PHRASING PER ALTERNATIVE, so nothing in the companion can be deleted in silence.
// Each carries the match on ONE thing: none of them contains a money noun OR the words "how much",
// so the alternative under test is the only reason it is heard.
for (const [alt, asked] of [
  ['the interrogative clause hears "whats"', 'whats the taxman going to want'],
  ['will january cost', 'what will january cost me'],
  ['is january going to cost', 'what is january going to cost me'],
  ['get stung ... january', 'am i going to get stung in january'],
  ['getting stung ... january', 'am i getting stung in january'],
]) {
  const got = W.matchTotalsQuestion(asked);
  ok(`🔴 B34 alternative walked, ${alt}: "${asked}"`, got !== null && got.kind === 'tax');
}

// 🔴 AND THE DIRECTION THE WIDE FIX BROKE. Every one of these was measured against the two
// rejected widenings and every one of them MOVED. They are here so that if somebody reopens either,
// this section goes red first and the measurement is already done for them.
//
// The eight a month name in the money noun list would have taken:
for (const [asked, want] of [
  ['how much did i spend in january', 'spent'],
  ['what did i spend in january', 'spent'],
  ['how much did i make in january', 'made'],
  ['what was my profit in january', 'profit'],
  ['how much have i spent on fuel since january', 'spent'],
]) {
  const got = W.matchTotalsQuestion(asked);
  ok(`🔴 B34: "${asked}" is still a ${want} question, not a set aside one`,
    got !== null && got.kind === want);
}
// The four "am i" in the interrogative clause would have taken, plus the five cost shapes the
// companion is bounded away from. Each is a question this lane does not answer, so a figure here
// is a precise answer to a question he did not ask, which is B25's defect by name.
for (const asked of [
  'am i paying too much tax',
  'am i on the right tax code',
  'am i registered for tax',
  'am i due a tax refund',
  'how much did the van cost me in january',
  'what did the materials cost in january',
  'how much was the insurance bill in january',
  'am i going to get stung on this job',
  'what will the job cost me',
]) {
  const got = W.matchTotalsQuestion(asked);
  ok(`🔴 B34: "${asked}" is still NOT a set aside question`, got === null || got.kind !== 'tax');
}

// ⚠️ ONE FUNCTION, TWO CHANNELS, WHICH IS WHY THE FIX IS IN lib AND NOT IN A ROUTE. If either
// channel stops asking this function, it grows its own answer to the same question and the two
// drift, which is the defect the Scotland rule had on the same afternoon.
ok('🔴 the thread lane asks matchTotalsQuestion', /matchTotalsQuestion\(/.test(threadRoute));
ok('🔴 and the WhatsApp webhook asks the SAME function', /matchTotalsQuestion\(/.test(waRoute));

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
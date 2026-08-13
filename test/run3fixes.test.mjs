// THE RUN 3 PACKET. One half share partner with a job on the payroll, one evening, two channels.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// Marcus Whitfield is half of a two man groundworks partnership in Leeds, employed two days a week
// at £18,400, on a Plan 2 student loan, with CIS taken off the firm by its main contractors. He
// walked lekhio.app cold on 13 August 2026 and found, among other things, that:
//
//   the projection       divided his money by the days since his FIRST BANK ROW rather than since
//                        6 April, so a quiet fortnight in April made his year 111 days long and
//                        every figure in the product came out 17 percent high
//   payments on account  halved the bill GROSS of the tax his contractors had already handed HMRC,
//                        while the paragraph below it used that same figure for the 80 percent test
//   "put by for tax"     meant one thing on the web (£28,250) and another on WhatsApp (£37,457),
//                        the difference being exactly his CIS
//   the CIS line         announced a PROJECTED figure in the past tense, "has already gone to
//                        HMRC", beside a card on the same screen naming the real one
//   his business partner was asked about by name, on both channels, and both answered with the
//                        WHOLE FIRM'S turnover under Jerome's name and an invented expenses figure
//   the row summary      told the model "never add these up" only when the list was TRUNCATED, and
//                        said "This is all of them" when it was not
//   "take it out"        got "Got it, I'll remove that £1000 Screwfix entry" and removed nothing
//   the PAYE tick        was acknowledged in three places and the box that makes it count was on
//                        the National Insurance page behind a collapsed Tools row, unsignposted
//   the pension lever    priced a taper blind 20 points two rows above a taper aware 62 percent
//   the firm's CIS       was called "your pay" on the page whose whole job is firm against share
//
// Every assertion below is one of those, held open.
//
//   node test/run3fixes.test.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  paymentsOnAccount, projectionFactor, PROJECTION_MIN_OBSERVED_DAYS, DAYS_IN_TAX_YEAR, FACTS,
} from '../lib/taxengine.ts';
import { isAboutSomeoneElse, SOMEONE_ELSE_ANSWER, selfNameTokens } from '../lib/waintents.ts';

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

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

// ⚠️ PRESENT AND ORDERED, NEVER JUST ORDERED. indexOf returns -1 for a missing needle, so a bare
// comparison passes when the first thing was deleted.
function before(hay, a, b) {
  const i = hay.indexOf(a);
  const j = hay.indexOf(b);
  return i !== -1 && j !== -1 && i < j;
}

// ⚠️ NEGATIVE ASSERTIONS RUN ON THE CODE, NEVER ON THE PROSE AROUND IT. These files carry the story
// of what was removed, so a grep for the removed thing finds the story. Every finding in this
// packet is written out at length in a comment directly above its own fix.
const codeOnly = (s) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

// The optimiser is staged so the REAL file is on the bench rather than a copy of its logic, the
// standing answer in this repo to lib files importing their siblings without a .ts extension.
const libDir = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'run3-'));
const fixImports = (s) => s.replace(/from '(\.\/[a-zA-Z0-9]+)'/g, "from '$1.ts'");
for (const f of [
  'taxengine', 'taxoptimiser', 'personalincome', 'ltdengine', 'autonomy', 'nistudentloan',
  'elections', 'scotland', 'capital', 'money', 'universe', 'taxyears',
]) {
  try {
    writeFileSync(path.join(stage, `${f}.ts`), fixImports(readFileSync(path.join(libDir, `${f}.ts`), 'utf8')));
  } catch { /* a file this packet does not need is not a failure */ }
}
let OPT = null;
try {
  OPT = await import(pathToFileURL(path.join(stage, 'taxoptimiser.ts')).href);
} catch (e) {
  console.log(`  note: taxoptimiser could not be staged (${e.message.slice(0, 80)}), its assertions run on source`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('F1: the projection divides by the elapsed YEAR, not by the span of his rows');
{
  // 13 August 2026. 6 April to today is 130 days. His first bank row is 24 April, which is 111.
  const MARCUS = { monthsElapsed: 4, daysElapsed: 130, observedDays: 111 };
  const f = projectionFactor(MARCUS);
  ok('a quiet April still projects', f.canProject);
  ok('the divisor is the days since 6 April, not the days since his first row',
    Math.abs(f.factor - DAYS_IN_TAX_YEAR / 130) < 1e-9);
  ok('and it is NOT the old 365/111', Math.abs(f.factor - DAYS_IN_TAX_YEAR / 111) > 0.4);

  // The exact money this cost him. His half share profit was £25,649.24.
  const ytd = 25649.24;
  ok('his projected profit is about £72,000, not about £84,000',
    Math.round(ytd * f.factor) === Math.round(ytd * (365 / 130))
    && Math.round(ytd * f.factor) < 75000);

  // Every case the original reasoning protected keeps its answer.
  ok('established account, rows from April: unchanged',
    Math.abs(projectionFactor({ monthsElapsed: 4, daysElapsed: 130, observedDays: 130 }).factor - 365 / 130) < 1e-9);
  ok('joined in August, imported back to April: unchanged',
    projectionFactor({ monthsElapsed: 4, daysElapsed: 130, observedDays: 130 }).canProject);
  ok('joined in August, one job this week: still WITHHELD',
    projectionFactor({ monthsElapsed: 4, daysElapsed: 130, observedDays: 7 }).canProject === false);
  ok('a withheld projection returns a factor of 1, never a guess',
    projectionFactor({ monthsElapsed: 4, daysElapsed: 130, observedDays: 7 }).factor === 1);
  ok('the three month confidence gate still bites on its own',
    projectionFactor({ monthsElapsed: 2, daysElapsed: 70, observedDays: 70 }).canProject === false);
  ok('the coverage floor is three months, stated once',
    PROJECTION_MIN_OBSERVED_DAYS === 90);
  ok('a caller that passes no observedDays behaves exactly as it did before',
    Math.abs(projectionFactor({ monthsElapsed: 4, daysElapsed: 130 }).factor - 365 / 130) < 1e-9);
  ok('a clock ahead of itself can never project DOWN',
    projectionFactor({ monthsElapsed: 12, daysElapsed: 400, observedDays: 400 }).factor === 1);

  // The builder is where the two numbers separated, so the builder is asserted too.
  const sb = codeOnly(read('lib/supabase.ts'));
  ok('getOptimiserInput measures the YEAR from the tax year start',
    /const daysElapsed = Math\.max\(0, Math\.floor\(\(now\.getTime\(\) - yearStart\.getTime\(\)\)/.test(sb));
  ok('and measures the EVIDENCE from his earliest row',
    /const observedDays = Math\.max\(0, Math\.floor\(\(now\.getTime\(\) - observedFrom\.getTime\(\)\)/.test(sb));
  ok('and the confidence gate is on the year too, not on the rows',
    /const monthsElapsed = Math\.max\(0, Math\.floor\(\(now\.getTime\(\) - yearStart\.getTime\(\)\)/.test(sb));
  ok('nothing still divides by a window that starts at a transaction',
    !/daysElapsed = .*- start\.getTime\(\)/.test(sb));
  ok('observedDays actually reaches the optimiser', /\n    observedDays,/.test(sb));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('F2: payments on account come off the tax already taken at source');
{
  // Marcus, on the figures the Tax hub held: income tax plus Class 4 through Self Assessment of
  // £30,854, with £9,207 of CIS handed over by his contractors.
  const p = paymentsOnAccount(30854, 2027, 9207);
  ok('payments on account are still required at 30 percent covered', p.required);
  ok('each instalment is half of what Self Assessment will actually collect',
    Math.abs(p.eachPayment - (30854 - 9207) / 2) < 0.01);
  ok('and it is NOT half of the gross bill', Math.abs(p.eachPayment - 30854 / 2) > 1);
  ok('the man at 30 percent is not excused', p.excusedAtSource === false);

  // The Run 1 fix has to survive this one untouched.
  const covered = paymentsOnAccount(20000, 2027, 17000);
  ok('85 percent at source is still excused entirely', covered.required === false);
  ok('and it is told apart from a small bill', covered.excusedAtSource === true);
  ok('an excused year asks for nothing', covered.eachPayment === 0);

  // Nobody without tax at source moves by a penny.
  const plain = paymentsOnAccount(4000, 2027);
  ok('a sole trader with nothing at source pays half his bill, exactly as before',
    plain.required && plain.eachPayment === 2000);
  ok('the £1,000 floor still applies', paymentsOnAccount(900, 2027).required === false);
  ok('a bill covered more than fully at source asks for nothing and never goes negative',
    paymentsOnAccount(5000, 2027, 6000).eachPayment === 0);
  ok('the threshold reads the relevant amount, so £1,200 with £900 at source is under it',
    paymentsOnAccount(1200, 2027, 900).required === false);
  ok('the due dates still name their year', paymentsOnAccount(4000, 2027).firstDue === '31 January 2028');

  // HMRC SAM1010 lists the loan and Class 2 as deductions too. This engine excludes them by
  // passing income tax plus Class 4 only, and the Tax hub says so out loud. Held open here.
  const hub = codeOnly(read('app/app/tax/page.tsx'));
  ok('the hub passes the CIS figure into the engine',
    /paymentsOnAccount\(tax\.selfAssessmentTax, startYear \+ 1, tax\.cisSuffered\)/.test(hub));
  ok('the hub still says the student loan is never part of them',
    /never part of payments on account/.test(read('app/app/tax/page.tsx')));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('F3: "put by" means the same thing on every channel');
{
  const wa = codeOnly(read('app/api/whatsapp/route.ts'));
  const th = codeOnly(read('app/api/thread/route.ts'));
  ok('WhatsApp answers "what do I owe" with what he has to FIND',
    /oweAnswer\(billFromPosition\(tax\)/.test(wa));
  ok('WhatsApp no longer hands the raw liability to that sentence',
    !/oweAnswer\(tax\.setAside,/.test(wa));
  ok('the web chat leads with the same one door', /billFromPosition\(tax\)/.test(th));
  ok('no surface writes the ternary out by hand any more',
    !/cisSuffered > 0 \? tax\.setAsideAfterCis : tax\.setAside/.test(wa + th));

  if (OPT?.billFromPosition) {
    const withCis = { cisSuffered: 9207, setAsideAfterCis: 28250, setAside: 37457 };
    ok('the door returns what is left to find when there is CIS',
      OPT.billFromPosition(withCis) === 28250);
    ok('and the whole bill when there is none',
      OPT.billFromPosition({ cisSuffered: 0, setAsideAfterCis: 0, setAside: 4200 }) === 4200);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('F4: a projected figure is never announced in the past tense');
{
  const home = read('app/app/page.tsx');
  const hub = read('app/app/tax/page.tsx');
  ok('the Overview CIS sentence branches on whether it is a projection',
    /tax\.projected\s*\n?\s*\?\s*`\$\{gbp0\(tax\.cisSuffered\)\} of it is on course to come off/.test(home));
  ok('the Tax hub CIS sentence branches too',
    /tax\.projected\s*\n?\s*\?\s*`Your contractors are on course to hand HMRC/.test(hub));
  // ⚠️ THE WHOLE SENTENCE, NOT ITS FIRST CLAUSE. The first attempt at this fix left "so that part
  // is paid" hanging off a corrected opening, which said the same wrong thing in the second half.
  ok('the projected branch does not then claim it is paid',
    !/on course to hand HMRC[^`]*`\s*\n?\s*:[^`]*`[^`]*`\s*\n?\s*that part is paid/.test(hub));
  ok('the projected branch says when it is paid instead',
    /paid as you go rather than in January/.test(hub));
  ok('the settled branch keeps the past tense, because then it is true',
    /have already handed HMRC/.test(hub) && /has already gone to HMRC through CIS/.test(home));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('');
console.log("F5: somebody else's money, by name, on both channels");
{
  ok('a business partner asked about by name is refused',
    isAboutSomeoneElse('how much has jerome made this year'));
  ok('the same question the other way round', isAboutSomeoneElse("whats jerome's profit"));
  ok('and with a different verb', isAboutSomeoneElse('how much did priya earn last year'));
  ok('the Run 2 shape still works', isAboutSomeoneElse('what does the barber next door owe you lot then'));
  ok('and "my mate" still works', isAboutSomeoneElse('how much tax does my mate pay'));

  // ⚠️ THE FALSE POSITIVES ARE THE EXPENSIVE HALF. A gate that eats his own questions is worse
  // than the leak, because he stops asking.
  ok('his own question is not refused', isAboutSomeoneElse('how much have i made this year') === false);
  ok('nor his own bill', isAboutSomeoneElse('what do i owe') === false);
  ok('nor a question about the business', isAboutSomeoneElse('how much has the business made') === false);
  ok('nor a period', isAboutSomeoneElse("what is this year's profit") === false);
  ok('nor the firm', isAboutSomeoneElse("what is the firm's turnover") === false);
  ok('nor a plain greeting', isAboutSomeoneElse('alright mate') === false);
  ok('a comparison is still about him', isAboutSomeoneElse('what do i owe compared to my mate') === false);
  ok('his OWN name is not somebody else',
    isAboutSomeoneElse('how much has marcus made this year', selfNameTokens('Marcus Whitfield')) === false);
  ok('and his surname too',
    isAboutSomeoneElse("what is whitfield's profit", selfNameTokens('Marcus Whitfield')) === false);
  ok('selfNameTokens splits a full name and drops the noise',
    JSON.stringify(selfNameTokens('Marcus Whitfield')) === JSON.stringify(['marcus', 'whitfield']));
  ok('and survives a missing name', selfNameTokens(null).length === 0);

  ok('the refusal says whose books it holds and offers the useful thing',
    /only see your books/.test(SOMEONE_ELSE_ANSWER) && /your own figures/.test(SOMEONE_ELSE_ANSWER));

  // Both routers, and the ordering that makes the gate mean anything.
  const wa = codeOnly(read('app/api/whatsapp/route.ts'));
  const th = codeOnly(read('app/api/thread/route.ts'));
  ok('the WhatsApp router still gates it', /isAboutSomeoneElse\(text\)/.test(wa));
  ok('the WEB router gates it now, and it never did', /isAboutSomeoneElse\(q\)/.test(th));
  ok('the web gate sits above the model', before(th, 'isAboutSomeoneElse(q)', 'answerMoneyQuestion(q'));
  // ⚠️ THE CALL, NOT THE IMPORT. indexOf finds the import line 280 lines above the call, so the
  // first version of this compared the gate to an import statement and reported it was too late.
  // Discipline 1 in test/sabotage-run2.mjs, broken by the guard written to enforce it.
  ok('the web gate sits above the lane that reads his rows',
    before(th, 'isAboutSomeoneElse(q)', 'transactionSummaryForUser(userId)'));
  ok('and above the totals lane, which is where the Run 1 failure landed',
    before(th, 'isAboutSomeoneElse(q)', 'matchTotalsQuestion(q)'));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('F6: the model is never invited to add up his rows');
{
  const sb = read('lib/supabase.ts');
  ok('the instruction exists once, as a constant, not on one arm of a branch',
    /const NEVER_TOTAL =/.test(sb));
  ok('it forbids totalling for a PERSON as well as for a period',
    /Never add these rows up into a total for any period or any person/.test(sb));
  ok('the truncated header carries it', /you CANNOT see them[\s\S]{0,400}\$\{NEVER_TOTAL\}/.test(sb));
  ok('and so does the complete one', /This is all of them\. \$\{NEVER_TOTAL\}/.test(sb));
  // The exact hole: the old sentence lived only where truncated was true.
  const code = codeOnly(sb);
  const truncArm = code.indexOf('THIS IS A WINDOW');
  const fullArm = code.indexOf('This is all of them');
  ok('both arms are present and the complete one comes second',
    truncArm !== -1 && fullArm !== -1 && truncArm < fullArm);

  const cl = read('lib/claude.ts');
  ok('the money prompt carries a rule about whose figures these are',
    /These figures belong to the person you are talking to and to nobody else/.test(cl));
  ok('it names the partnership case rather than banning the word',
    /taxed on their own share/.test(cl));
  ok('and a rule that it cannot touch his books',
    /You cannot add, change or delete anything in their books/.test(cl));
  ok('which names the control that DOES work',
    /press Not business/.test(cl));
  ok('the four original rules are all still there',
    /Never suggest, help with, or soften evasion/.test(cl)
    && /HMRC approves no software/.test(cl)
    && /Never promise or state a number for the tax Lekhio will save/.test(cl)
    && /Do not give investment or pension product advice/.test(cl));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('F7: the PAYE tick is signposted to the box that makes it count');
{
  const circ = read('app/app/you/circumstances/page.tsx');
  ok('the payroll job gets its own held section', /function EmploymentHeld/.test(circ));
  ok('it is rendered', /<EmploymentHeld rows=\{rows\} \/>/.test(circ));
  ok('it links to the page that collects the salary', /href="\/app\/tax\/ni"/.test(circ));
  ok('it says why the amount is the half that pays',
    /sets the rate your business is taxed at/.test(circ));
  ok('it names the student loan consequence, which is the one that reads £0 without it',
    /what January collects on your student loan/.test(circ));
  ok('it says he was not asked here, like the student loan does', /SL_NOT_ASKED_HERE/.test(circ));
  ok('a man who said no gets nothing, the empty test',
    /row\.answer !== 'yes'\) return null/.test(circ));
  ok('the student loan section is untouched and still linked',
    /href="\/app\/tax\/student-loan"/.test(circ));
  ok('the salary box is still where the section points',
    /PAYE salary from a job/.test(read('app/app/tax/ni/page.tsx')));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('F8: the pension lever knows about the 60 percent band the same file already knew about');
{
  const to = read('lib/taxoptimiser.ts');
  ok('the saving is no longer a flat 20 points on the whole overshoot',
    !/const saving = round\(over \* 0\.2\);/.test(codeOnly(to)));
  ok('the taper slice is worked out', /const inTaper = Math\.max\(0, Math\.min\(/.test(to));
  ok('and priced at 40 points, not 20', /inTaper \* 0\.4/.test(to));
  ok('the plain higher rate slice is still 20 points', /plainHigher \* 0\.2/.test(to));
  ok('the copy names the effective 60 percent when there is any',
    /effective 60% rather than 40%/.test(to));
  ok('and says nothing about it when there is none', /inTaper > 0\s*\n?\s*\?/.test(to));
  ok('it is still not advice', /We are not a financial adviser, you decide/.test(to));

  if (OPT?.findOptimisations) {
    // A man whose projected income runs into the taper. The lever must be worth more than 20
    // points on the slice above £100,000.
    const base = {
      startYear: 2026, monthsElapsed: 12, daysElapsed: 365, observedDays: 365,
      ytdTradeIncome: 130000, ytdTradeExpenses: 20000, ytdCisSuffered: 0,
      employmentIncome: 0, categoriesLogged: ['materials'], homeOfficeClaimed: false,
      mileageClaimed: false,
    };
    const levers = OPT.findOptimisations(base);
    const pen = levers.find((l) => l.key === 'pension_higher_rate');
    if (pen) {
      const over = 110000 - FACTS.class4UpperLimit;
      ok('the taper aware saving beats the flat 20 points it used to quote',
        pen.estSaving > Math.round(over * 0.2));
      ok('and it tells him which pounds are the valuable ones',
        /effective 60%/.test(pen.detail));
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('');
console.log("F9: whose pay, on the page whose job is the firm against the share");
{
  const sum = read('app/app/tax/summary/page.tsx');
  ok('a partner is not told the firm’s CIS came off "your pay"',
    /isPartnership \? ' from the firm\\u2019s payments' : ' from your pay'/.test(sum));
  ok('and he is pointed at the figure that actually reaches his return',
    /Your own share of it is on your Overview/.test(sum));
  ok('a sole trader still reads the sentence he always read',
    /' from your pay'/.test(sum));
  // ⚠️ AND THE SENTENCE IS NOT IN THIS FILE AT ALL. It is one string in lib/position.ts, shared by
  // the summary, the Overview week card and the money log, which is exactly why the three of them
  // cannot drift. The first version of this assertion grepped the page and passed on the COMMENT
  // prose thirty lines above the render, which would have gone on passing with the sentence gone.
  // ⚠️ AND THE APOSTROPHE IS BACKSLASH ESCAPED IN THE SOURCE, because the string is single quoted
  // TypeScript: the raw file holds firm\'s, not firm's. Three wrong guards in a row on one
  // sentence, each of which would have passed while the sentence was deleted. The wildcard spans
  // whichever way the apostrophe is written and the assertion still reads the real string.
  ok('the firm against share sentence is one shared string, and it still says it',
    /This is everything through the business, the whole firm.{0,8}s money, before your share is taken\./
      .test(read('lib/position.ts')));
}

console.log('');
console.log(`${pass} passed, ${fail} failed.`);
if (fail > 0) process.exit(1);

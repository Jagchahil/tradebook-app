// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHO IS ASKING "WHEN IS MY TAX DUE", AND WHY THE OLD ANSWER WAS THE SAME FOR ALL OF THEM.
//
// Until 7 August 2026, lib/waintents.ts deadlineAnswer() took a clock and nothing else. Executed
// that morning it returned, to anybody:
//
//   "Your next quarterly update is due by 7 November 2026. The quarterly dates are 7 August,
//    7 November, 7 February and 7 May."
//
// Both production call sites passed nothing: app/api/whatsapp/route.ts sent it to whoever texted,
// and app/api/thread/route.ts returned it with the customer's id in scope on the line above. So:
//
//   . a LIMITED COMPANY DIRECTOR was handed a quarterly update deadline for a return his company
//     does not file,
//   . a PARTNER was handed one for a regime GOV.UK has announced no date for,
//   . a SOLE TRADER HMRC HAS NEVER WRITTEN TO was handed one for an update he does not have to
//     make, and isDeadlineQuestion() also matches "when is my tax due" and "when do I have to
//     file", so a plain Self Assessment question was answered with a quarterly deadline first,
//   . and on 7 August 2026 ITSELF it skipped the deadline due that day and said 7 November, while
//     app/app/tax/due.ts correctly reported the first update still open and due today.
//
// ⚠️ THE DOCTRINE THIS SUITE HOLDS, AND IT IS NOT A WORDING PREFERENCE. HMRC decides Making Tax
// Digital mandation from a Self Assessment return ALREADY FILED, and writes to the people it has
// assessed. Lekhio holds this year's running figures, which is a PROXY and never the test.
// mtdPosition() in lib/taxengine.ts encodes that: stated_in, the only value that means mandated,
// is reachable ONLY from the customer telling us the letter came, and is unreachable from
// arithmetic by design. Every surface obeys it. This one is the closest to the line, because it is
// the sentence a man reads on his phone when he asks what he owes and when.
//
// ⚠️ AND THE TEST BANK IS THE ANSWERS THEMSELVES, RUN, NOT A SOURCE GREP. test/wave9_mtdstructure
// section 6 classifies the MODULE (is it capable of knowing), which is the right shape for a sweep
// across nine files. This suite executes the function for six askers and reads what each one is
// actually told, which is the only thing the customer experiences.
//
// Run: node test/wave9_deadlineasker.test.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); }
};

const stripComments = (s) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

// 🔴 lib/waintents.ts GOES ON THE BENCH ALONE, which is an assertion in itself. Its one import is a
// TYPE, erased before resolution, so the module still loads with nothing beside it. A value import
// would break this line, and it would break test/invoicesweb.test.mjs and test/numbers.test.mjs
// with it, which is exactly why the mandation DECISION stays in lib/taxengine.ts and only the type
// travels.
const wStage = mkdtempSync(path.join(tmpdir(), 'deadlineasker-'));
writeFileSync(path.join(wStage, 'waintents.ts'), read('lib/waintents.ts'));
const W = await import(pathToFileURL(path.join(wStage, 'waintents.ts')).href);
const T = await import(pathToFileURL(path.join(root, 'lib/taxengine.ts')).href);

console.log('\nwave 9: who is asking when his tax is due');

// The morning of the first Making Tax Digital quarterly update deadline. The day the old bug bit
// hardest, and the day this lane ran.
const DEADLINE_DAY = new Date('2026-08-07T09:00:00+01:00');

// The six askers, and the POSITION IS COMPUTED BY mtdPosition() rather than typed in, so this
// suite cannot drift from the one definition. If mtdPosition ever stops returning 'excluded' for a
// company, or starts reaching stated_in from a figure, these fixtures change under the assertions.
const asker = (structure, stated, gross) => ({
  structure,
  mtdPosition: T.mtdPosition({
    excluded: structure === 'limited_company' || structure === 'partnership',
    stated,
    grossQualifyingIncome: gross,
    startYear: 2026,
  }),
});

const DIRECTOR = asker('limited_company', null, 90_000);
const PARTNER = asker('partnership', null, 90_000);
const STATED_IN = asker('sole_trader', 'yes', 12_000);
const STATED_OUT = asker('sole_trader', 'no', 90_000);
const UNSTATED_UNDER = asker('sole_trader', null, 20_000);
const UNSTATED_OVER = asker('sole_trader', null, 60_000);
const UNKNOWN = { structure: null, mtdPosition: null };

const say = (a, when = DEADLINE_DAY) => W.deadlineAnswer(when, a);

// ---------------------------------------------------------------------------------------------
// 1. THE FIXTURES ARE THE REAL FIVE POSITIONS, so the assertions below are about real customers.
// ---------------------------------------------------------------------------------------------
console.log('\n=== the six askers are the five positions the engine can return ===\n');

ok('a director is excluded, by mtdPosition and not by this file', DIRECTOR.mtdPosition === 'excluded');
ok('a partner is excluded too, for a different reason', PARTNER.mtdPosition === 'excluded');
ok('🔴 stated_in is reachable ONLY from his own answer', STATED_IN.mtdPosition === 'stated_in'
  && asker('sole_trader', null, 10_000_000).mtdPosition === 'unstated_over');
ok('stated_out beats a year to date figure over the line', STATED_OUT.mtdPosition === 'stated_out');
ok('an unstated man under the line is unstated_under, which is not a safe state',
  UNSTATED_UNDER.mtdPosition === 'unstated_under');
ok('an unstated man over the line is unstated_over, which is not a conclusion',
  UNSTATED_OVER.mtdPosition === 'unstated_over');

// ---------------------------------------------------------------------------------------------
// 2. 🔴 NOBODY IS HANDED A QUARTERLY DEADLINE AS HIS UNLESS HE SAID THE LETTER CAME.
//
// The whole finding, in one assertion. "your next quarterly update is due by" is a claim about the
// man. Exactly one of these seven askers has told us HMRC put him in, and he is the only one who
// gets it flat. Everyone else either gets no quarterly date at all, or gets it behind "If HMRC has
// written to tell you", which is true for every reader without this module ever learning his
// answer, the same shape lib/weeklyupdate.ts chose deliberately over a new input field.
// ---------------------------------------------------------------------------------------------
console.log('\n=== the flat claim belongs to exactly one asker ===\n');

const FLAT_CLAIM = /(?<!If HMRC has written to tell you Making Tax Digital applies to you, )your next quarterly update is due by/i;
const CONDITIONAL = /If HMRC has written to tell you Making Tax Digital applies to you, your next quarterly update is due by/i;

for (const [label, a] of [
  ['a director', DIRECTOR], ['a partner', PARTNER], ['a stated_out sole trader', STATED_OUT],
  ['an unstated_under sole trader', UNSTATED_UNDER], ['an unstated_over sole trader', UNSTATED_OVER],
  ['an asker we cannot place', UNKNOWN],
]) {
  ok(`🔴 ${label} is NEVER told a quarterly update is due as a fact about him`,
    !FLAT_CLAIM.test(say(a)));
}
ok('🔴 and the man who told us HMRC wrote to him IS given his date, plainly',
  FLAT_CLAIM.test(say(STATED_IN)) && say(STATED_IN).includes('7 August 2026'));

// ---------------------------------------------------------------------------------------------
// 3. THE DIRECTOR. Wave nine's own defect, arriving by WhatsApp.
// ---------------------------------------------------------------------------------------------
console.log('\n=== the limited company director ===\n');

{
  const s = say(DIRECTOR);
  ok('🔴 a director gets NO quarterly deadline at all, conditional or otherwise',
    !/quarterly update is due/i.test(s) && !/7 August 2026|7 November 2026/.test(s));
  ok('and he is told why, in the words /app/tax/summary uses, so two surfaces cannot argue',
    s.includes('Making Tax Digital for Income Tax covers self employment and rent on a personal return'));
  ok('his company files its own return, which is the fact he actually asked about',
    /company files its own return/i.test(s));
  ok('he is given a date he can use: the next 31 January, and his Corporation Tax dates named',
    s.includes('31 January 2027') && /Corporation Tax/.test(s));
  ok('nothing is stated as his that is not his: no "you must" anywhere',
    !/\byou must\b/i.test(s));
}

// ---------------------------------------------------------------------------------------------
// 4. THE PARTNER. A regime with no published date.
// ---------------------------------------------------------------------------------------------
console.log('\n=== the partner ===\n');

{
  const s = say(PARTNER);
  ok('🔴 a partner gets NO quarterly deadline, because there is no date to give him',
    !/quarterly update is due/i.test(s) && !/7 August 2026|7 November 2026/.test(s));
  ok('GOV.UK\'s own position is quoted rather than paraphrased into a guess',
    s.includes('has not reached partnerships yet') && s.includes('the timeline comes at a later date'));
  ok('and he is told the thing that IS his: his share on his own return, by 31 January',
    /Your share goes on your own Self Assessment return/.test(s) && s.includes('31 January 2027'));
  ok('a partner is never told he is under a line, because he is outside the regime, not under it',
    !/under the Making Tax Digital line/i.test(s) && !/over the Making Tax Digital line/i.test(s));
}

// ---------------------------------------------------------------------------------------------
// 5. THE THREE SOLE TRADERS. What we were told, and what we were not.
// ---------------------------------------------------------------------------------------------
console.log('\n=== the sole traders ===\n');

{
  const s = say(STATED_IN);
  ok('the stated_in man is told the date is his BECAUSE he told us', /You have told me HMRC has confirmed you/.test(s));
  ok('...and gets the full cycle and his final declaration date',
    s.includes('7 August, 7 November, 7 February and 7 May') && s.includes('31 January 2027'));
}
{
  const s = say(STATED_OUT);
  ok('the stated_out man is told there is nothing quarterly to send, on HIS answer',
    /You have told me HMRC has not confirmed you/.test(s) && /nothing quarterly for you to send/.test(s));
  ok('...and his Self Assessment date is the answer he actually came for', s.includes('31 January 2027'));
  ok('🔴 ...and it is left open, because his answer can go stale and HMRC can write to him tomorrow',
    /If that letter has come since you told me/.test(s));
}
{
  const s = say(UNSTATED_OVER);
  ok('🔴 the unstated_over man is ASKED, never told: the figure is named and then set aside',
    /over the Making Tax Digital line/.test(s)
    && /that is not the test/.test(s)
    && /Has that letter come\?/.test(s));
  ok('...and the test that actually decides it is named, with whose it is',
    /HMRC decides it from a tax return you have already filed, not from this year, and writes to you/.test(s));
  ok('...and his quarterly date is there for him, behind the condition, never as a fact',
    CONDITIONAL.test(s) && !FLAT_CLAIM.test(s));
  ok('...and nothing in it reads as an instruction', !/\byou must\b/i.test(s) && !/\byou need to\b/i.test(s));
}
{
  const s = say(UNSTATED_UNDER);
  ok('🔴 the unstated_under man gets NO all clear, which is the silent failure this closes',
    /does not settle it either way/.test(s) && /Has that letter come\?/.test(s));
  ok('...and he is given the quarterly date too, because he may be the man with deadlines passing',
    CONDITIONAL.test(s));
}
{
  const s = say(UNKNOWN);
  ok('an asker we cannot place is answered honestly rather than met with silence',
    s.includes('31 January 2027') && CONDITIONAL.test(s) && /Has that letter come\?/.test(s));
}

// ---------------------------------------------------------------------------------------------
// 6. 🔴 THE DEADLINE DUE TODAY IS STILL DUE TODAY.
//
// The second defect in the same function. It compared instants with `>`, so from one minute past
// midnight on 7 August 2026 it skipped the deadline due that morning. app/app/tax/due.ts's
// outstandingUpdate() reports it still open on the day (`todayIso > dueISO`), and
// app/free-mtd-filing compares whole days for the stated reason that a man reading it on the
// morning of 7 August is not late yet. This surface now agrees with both.
// ---------------------------------------------------------------------------------------------
console.log('\n=== the deadline due today ===\n');

const dayOf = (iso, hhmm) => new Date(`${iso}T${hhmm}+01:00`);
for (const [iso, want] of [
  ['2026-08-06', '7 August 2026'],
  ['2026-08-07', '7 August 2026'],
  ['2026-08-08', '7 November 2026'],
  ['2026-11-07', '7 November 2026'],
  ['2026-11-08', '7 February 2027'],
  ['2027-02-07', '7 February 2027'],
  ['2027-05-07', '7 May 2027'],
]) {
  const s = say(STATED_IN, dayOf(iso, '09:00'));
  ok(`on ${iso} the next update named is ${want}`, s.includes(`due by ${want}`));
}
ok('🔴 and it is the whole DAY, not the instant: one minute past midnight and half past eleven agree',
  say(STATED_IN, dayOf('2026-08-07', '00:01')).includes('due by 7 August 2026')
  && say(STATED_IN, dayOf('2026-08-07', '23:59')).includes('due by 7 August 2026'));
ok('the day AFTER is not still today, so the ratchet is not simply always saying August',
  say(STATED_IN, dayOf('2026-08-08', '00:01')).includes('due by 7 November 2026'));

// The same whole day rule on the Self Assessment date, which is the answer most askers get.
ok('31 January is still today on 31 January, and next year on 1 February',
  say(UNKNOWN, dayOf('2027-01-31', '09:00')).includes('31 January 2027')
  && say(UNKNOWN, dayOf('2027-02-01', '09:00')).includes('31 January 2028'));

// ---------------------------------------------------------------------------------------------
// 7. 🔴 THE CALL SITES PASS THE ASKER, so the answers above are the ones customers get.
//
// A module that words six answers correctly and is still called with nothing has fixed nothing.
// Both production call sites are pinned here, on CODE with the comments stripped, because the
// comments explaining the old bug quote the old call.
// ---------------------------------------------------------------------------------------------
console.log('\n=== both call sites pass who is asking ===\n');

const waCode = stripComments(read('app/api/whatsapp/route.ts'));
const threadCode = stripComments(read('app/api/thread/route.ts'));

ok('🔴 the WhatsApp route no longer calls deadlineAnswer with nothing',
  !/deadlineAnswer\(\s*\)/.test(waCode));
ok('🔴 nor does the chat route, which had his id in scope on the line above all along',
  !/deadlineAnswer\(\s*\)/.test(threadCode));
ok('the WhatsApp route resolves the position through mtdPosition, the ONE definition',
  /mtdPosition\(\{/.test(waCode) && /from '\.\.\/\.\.\/\.\.\/lib\/taxengine'/.test(waCode));
ok('...and reads his own answer through mtdStatedFrom, which maps a skip and a failed read to null',
  /mtdStatedFrom\(/.test(waCode));
ok('...and the mandation test is on GROSS qualifying income, trade PLUS rent',
  /ytdTradeIncome/.test(waCode) && /ytdPropertyIncome/.test(waCode)
  && /grossQualifyingIncome: gross/.test(waCode));
ok('...and a failed read is unknown, never a no', /getOptimiserInput\(userId\)\.catch\(\(\) => null\)/.test(waCode)
  && /readCircumstances\(userId\)\.catch\(\(\) => null\)/.test(waCode));
ok('both routes hand the structure across, so a director and a partner are answered as themselves',
  /structure/.test(waCode) && /structure: optimiser\?\.businessType \?\? null/.test(threadCode));
ok('🔴 the chat passes a null position out loud, because article 9 keeps that fact off this surface',
  /mtdPosition: null/.test(threadCode)
  && !/circumstances|CIRCUMSTANCES/.test(threadCode));

// 🔴 STILL EXACTLY ONE SEND ON THE WHATSAPP SIDE. test/routing.test.mjs caps inline sendText call
// sites across the whole repo and the ceiling sits ON the count, so a handler that answered from
// two places would break the build for everybody. The verdict is worked out first and sent once.
{
  const handler = waCode.slice(waCode.indexOf('async function handleDeadlineQuestion'));
  const body = handler.slice(0, handler.indexOf('\n}\n') + 3);
  ok('🔴 the deadline handler sends exactly once, whatever it works out',
    (body.match(/\bsendText\s*\(/g) || []).length === 1);
  ok('...and it still answers a man we cannot identify, rather than refusing him',
    !/replyNotLinked/.test(body));
}

// The ordering test/thread.test.mjs holds by literal, re-held here against the new call shape:
// the deterministic deadline answer runs BEFORE the model is ever asked.
ok('the deterministic deadline answer still runs before the AI path in the chat',
  threadCode.indexOf('isDeadlineQuestion(q)') > -1
  && threadCode.indexOf('isDeadlineQuestion(q)') < threadCode.indexOf('answerMoneyQuestion(q'));

// ---------------------------------------------------------------------------------------------
// 8. 🔴 THE PUBLIC GUIDE AT /file-your-tax-return, WHICH SAID THE SAME THING TO STRANGERS.
//
// Three faults, all on a free page with no sign up, which is the widest audience we have:
//   1. "£50,000 or more". The statutory test is MORE THAN £50,000. mtdForIncomeTaxRequired() uses
//      a strict `>`, and app/how-mtd-works carries the note in as many words. A man on exactly
//      £50,000 was told he had to send quarterly updates. He does not.
//   2. "your turnover, the total you take before expenses". The test is QUALIFYING INCOME, trade
//      plus gross rent. A man with £30k of trade and £25k of rent read "turnover" and concluded he
//      was out. lib/agent.ts carries a dedicated signal for that exact trap.
//   3. It stated the conclusion off a current year figure and never mentioned the return HMRC
//      actually reads or the letter it sends, and the other panel told a man under the line that
//      he files one return a year, full stop.
// ---------------------------------------------------------------------------------------------
console.log('\n=== the public guide says what the engine says ===\n');

const guideSrc = read('app/file-your-tax-return/page.tsx');
const guide = stripComments(guideSrc);

ok('🔴 "£50,000 or more" is gone from the page a stranger reads',
  !/50,000 or more/i.test(guide) && !/50k or more/i.test(guide));
ok('🔴 and the page says out loud that exactly £50,000 is under the line',
  /Exactly £50,000 is under it/.test(guide));
ok('the strict test is what the page states, matching mtdForIncomeTaxRequired',
  /more than £50,000 of qualifying income/i.test(guide)
  && T.mtdForIncomeTaxRequired(50_000, 2026) === false
  && T.mtdForIncomeTaxRequired(50_001, 2026) === true);
ok('🔴 the combined test is named: trade PLUS gross rent, never turnover alone',
  /your turnover plus any gross rent, added together/.test(guide));
ok('...and the old turnover definition is gone',
  !/your turnover, the total you take before expenses/.test(guide));
ok('🔴 the page names the return HMRC actually reads and the letter it sends',
  /already filed/.test(guide) && /writes to you/.test(guide) && /2024 to 2025/.test(guide));
ok('🔴 the under panel no longer reads as an all clear',
  /A quiet year does not settle it on its own/.test(guide));
ok('the quarterly route is described as starting with the letter, not with a figure',
  /Once that letter has come/.test(guide));
ok('🔴 no "you must" is asserted off a threshold anywhere on the page',
  !/you must keep digital records/i.test(guide));
ok('and the same three faults are fixed in the FAQ and the closing panel, not just the branch',
  (guide.match(/qualifying income/g) || []).length >= 3
  && (guide.match(/already filed/g) || []).length >= 3);

// The page still promises what it always promised, so this rewrite did not quietly drop the
// product. test/frontdoor.test.mjs pins this line, and it must survive.
ok('the reminder promise the front door pins is untouched', /we remind you well before it/i.test(guideSrc));

// ---------------------------------------------------------------------------------------------
// 9. THE HOUSE RULES, on every answer this suite renders.
// ---------------------------------------------------------------------------------------------
console.log('\n=== the house rules ===\n');

const everyAnswer = [DIRECTOR, PARTNER, STATED_IN, STATED_OUT, UNSTATED_UNDER, UNSTATED_OVER, UNKNOWN]
  .flatMap((a) => ['2026-08-07', '2026-11-07', '2027-01-31', '2027-04-01'].map((d) => say(a, dayOf(d, '09:00'))));

ok(`rendered ${everyAnswer.length} deadline answers across seven askers and four days`,
  everyAnswer.length === 28);
ok('no em dash and no en dash in any of them', everyAnswer.every((s) => !/[–—]/.test(s)));
ok('no hyphen used as a dash either', everyAnswer.every((s) => !/\s-\s/.test(s)));
ok('🔴 not one of them claims Lekhio files anything or that HMRC approves us',
  everyAnswer.every((s) => !/\bwe (file|submit|send) (your|it)\b/i.test(s) && !/HMRC approved/i.test(s)));
ok('🔴 every one of them keeps the approval where it belongs, with him',
  everyAnswer.every((s) => /you approve|unless you approve it first/i.test(s)));
ok('no undefined, NaN or Invalid Date leaks into a sentence',
  everyAnswer.every((s) => !/undefined|NaN|Invalid Date|null/.test(s)));
ok('the only domain any of them could carry is ours, and none carries one at all',
  everyAnswer.every((s) => !/lekhio\.(com|co\.uk)/i.test(s)));

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

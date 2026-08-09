// THE STUDENT LOAN A MAN TOLD US ABOUT, SHOWN BACK TO HIM ON THE PAGE THAT IS SUPPOSED TO HOLD IT.
//
//   node test/studentloandisplay.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE DEFECT. He ticks "A student loan" at /start step 4. reconcileSignupToUser writes it into the
// circumstances table as key `student_loan` with the exhibit "You told us at signup that you have a
// student loan." /app/you/circumstances draws every group out of CIRCUMSTANCES, and `student_loan`
// is not in CIRCUMSTANCES, so the answer was held and never rendered. On the one page whose whole
// job is to be the record of what he has told us, he could not see it and could not correct it.
//
// THE DECISION, 8 August 2026: DISPLAY ONLY. Show it back. Add no question. Move nobody's steps.
//
// 🔴 SO THIS RATCHET GUARDS TWO OPPOSITE FAILURES, AND THE SECOND ONE IS THE QUIET ONE.
//
//   1. THE DISPLAY DISAPPEARS. A refactor drops the card and we are back to holding an answer we
//      never show him, with no error anywhere, exactly as before.
//
//   2. `student_loan` BECOMES A WIZARD QUESTION. The obvious "fix" for a missing display is to add
//      the key to CIRCUMSTANCES, and it looks harmless. It is not: askingOrder() sorts it,
//      notHousehold() puts it on /app/setup's relief screen, unanswered() feeds the WhatsApp chain
//      and the phone app, and progressIn() puts it in a denominator, so the wizard grows a step and
//      the "3 of 11 answered" line moves for every customer already on the product.
//
// ⚠️ EVERY POSITION ASSERTION BELOW PROVES ITS MARKER EXISTS FIRST. indexOf returns minus one for a
// string that is not there, and minus one is less than everything, so "the card comes before the
// footer" passes triumphantly on a page that has no card at all. That is a guard that guards
// nothing, and it is the exact shape of bug this file exists to catch.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const C = await import(pathToFileURL(path.join(root, 'lib/circumstances.ts')).href);

const {
  CIRCUMSTANCES, STUDENT_LOAN_KEY, heldStudentLoan, unanswered, unansweredMtd, askingOrder,
  household, notHousehold, mtdQuestions, progressIn, parseButtonId, sensitive,
} = C;

const page = readFileSync(path.join(root, 'app/app/you/circumstances/page.tsx'), 'utf8');

let pass = 0;
let fail = 0;
function ok(desc, cond) {
  if (cond) { pass++; process.stdout.write(`  PASS  ${desc}\n`); }
  else { fail++; process.stdout.write(`  FAIL  ${desc}\n`); }
}

// ⚠️ A THUNK, NOT A VALUE, FOR ANYTHING THAT TOUCHES THE NEW EXPORTS.
//
// The first version of this file called heldStudentLoan directly. Revert the fix and node threw
// "heldStudentLoan is not a function" halfway down, which killed the process, so the fourteen
// assertions about the PAGE never ran and never printed. A ratchet that stops at the first missing
// piece reports one failure and hides the rest, and the rest are the half that says what is gone.
// Anything that throws is a failure here, named, counted, and the run carries on.
function okRuns(desc, fn) {
  let value;
  try {
    value = fn();
  } catch (e) {
    fail++;
    process.stdout.write(`  FAIL  ${desc}  (threw: ${e.message})\n`);
    return;
  }
  ok(desc, value);
}

// Prove the marker is there, THEN hand its index back for a position check. Anything absent is a
// failure here and never reaches an arithmetic comparison.
function indexOfPresent(haystack, needle, label) {
  const i = haystack.indexOf(needle);
  ok(`present: ${label}`, i > -1);
  return i;
}

process.stdout.write('\nthe student loan he told us about, shown back to him\n\n');

// ── 1. THE MODULE EXISTS AT ALL. Everything below is meaningless without this ────────────────────
ok('lib/circumstances.ts exports STUDENT_LOAN_KEY', STUDENT_LOAN_KEY === 'student_loan');
ok('lib/circumstances.ts exports heldStudentLoan as a function', typeof heldStudentLoan === 'function');

// ── 2. IT IS NOT A QUESTION, AND IT MUST NEVER SILENTLY BECOME ONE ───────────────────────────────
ok('student_loan is NOT a key in the CIRCUMSTANCES catalogue',
  !CIRCUMSTANCES.some((c) => c.key === STUDENT_LOAN_KEY));

// The four selectors every asking surface draws from. If the key ever lands in the catalogue it
// lands in at least one of these, and a screen somewhere grows a question nobody decided to add.
ok('it is in no asking order', !askingOrder().some((c) => c.key === STUDENT_LOAN_KEY));
ok('it is not on the household screen', !household().some((c) => c.key === STUDENT_LOAN_KEY));
ok('it is not on the reliefs screen', !notHousehold().some((c) => c.key === STUDENT_LOAN_KEY));
ok('it is not in the Making Tax Digital group', !mtdQuestions().some((c) => c.key === STUDENT_LOAN_KEY));
ok('and it is not a special category question either', !sensitive().some((c) => c.key === STUDENT_LOAN_KEY));

// The WhatsApp door. parseButtonId refuses a key it cannot find in the catalogue, so a tap can
// never write this answer, which is the same guard /api/circumstances applies to its POST body.
ok('a WhatsApp button id for it does not parse', parseButtonId('circ_student_loan_yes') === null);
ok('and neither does a no', parseButtonId('circ_student_loan_no') === null);

// ── 3. NOBODY'S STEP COUNT MOVES. Run it, do not read it ─────────────────────────────────────────
// The strongest available proof that this is display only: hand the module a man who HAS the row
// and a man who does not, and show that every question queue and every progress count is identical.
{
  const base = [
    { key: 'married', answer: 'yes', asked: 'Are you married or in a civil partnership?' },
    { key: 'pension', answer: 'no', asked: 'Do you pay into a pension?' },
  ];
  const withLoan = [
    ...base,
    { key: STUDENT_LOAN_KEY, answer: 'yes', asked: 'You told us at signup that you have a student loan.' },
  ];
  const who = { structure: 'sole_trader', income: 'trade' };

  const keys = (list) => list.map((c) => c.key).join(',');
  ok('the money queue is byte for byte the same with the loan row and without',
    keys(unanswered(withLoan, who)) === keys(unanswered(base, who)));
  ok('the compliance queue is the same too',
    keys(unansweredMtd(withLoan, who)) === keys(unansweredMtd(base, who)));

  const groups = [...household(), ...notHousehold(), ...mtdQuestions()];
  const a = progressIn(groups, base, who);
  const b = progressIn(groups, withLoan, who);
  ok('the answered count does not move', a.answered === b.answered);
  ok('and neither does the denominator, so no wizard step is added for anybody',
    a.askable === b.askable);
}

// ── 4. THE THREE STATES, RESOLVED BY THE MODULE ──────────────────────────────────────────────────
{
  const exhibit = 'You told us at signup that you have a student loan.';
  okRuns('a yes reads as a yes',
    () => heldStudentLoan([{ key: 'student_loan', answer: 'yes', asked: exhibit }]).state === 'yes');
  okRuns('and it carries the exhibit, so a surface can say where it came from',
    () => heldStudentLoan([{ key: 'student_loan', answer: 'yes', asked: exhibit }]).asked === exhibit);

  okRuns('a no reads as a no',
    () => heldStudentLoan([{ key: 'student_loan', answer: 'no', asked: 'Told us on the phone.' }]).state === 'no');

  okRuns('no row at all is untold, never a no',
    () => heldStudentLoan([{ key: 'married', answer: 'yes' }]).state === 'untold');
  okRuns('an empty answer set is untold', () => heldStudentLoan([]).state === 'untold');

  // A FAILED READ IS NOT A FACT ABOUT HIM. readCircumstances returns null on a database wobble, and
  // that must never resolve to "he told us no".
  okRuns('a failed read is untold, not a no', () => heldStudentLoan(null).state === 'untold');
  okRuns('and undefined is untold as well', () => heldStudentLoan(undefined).state === 'untold');

  // Anything that is not a yes or a no is not a statement about his loan. Same rule as mtdStatedFrom.
  okRuns('a skip is untold, because skipping is not telling us he has none',
    () => heldStudentLoan([{ key: 'student_loan', answer: 'skip' }]).state === 'untold');
  okRuns('and a junk value is untold rather than guessed at',
    () => heldStudentLoan([{ key: 'student_loan', answer: 'maybe' }]).state === 'untold');
  okRuns('an untold state carries no exhibit to print', () => heldStudentLoan([]).asked === null);
}

// ── 5. THE DISPLAY IS ON THE PAGE ────────────────────────────────────────────────────────────────
const iImport = indexOfPresent(page, 'heldStudentLoan', 'the page imports and uses heldStudentLoan');
const iComponent = indexOfPresent(page, 'function StudentLoanHeld', 'the StudentLoanHeld component');
const iRender = indexOfPresent(page, '<StudentLoanHeld rows={rows} />', 'the component is actually rendered');
const iFoot = indexOfPresent(page, 'style={S.foot}', 'the page footer');

// Only now, with all four proved present, is a position comparison worth anything.
if (iImport > -1 && iComponent > -1 && iRender > -1 && iFoot > -1) {
  ok('it is declared before it is rendered', iComponent < iRender);
  ok('it is rendered inside the page, above the footer, after the question groups',
    iRender < iFoot && iRender > page.indexOf('title="Where you stand with HMRC"'));
}

// ── 6. THE THREE STATES, AS HE READS THEM ────────────────────────────────────────────────────────
const iYesSaid = indexOfPresent(page, 'You told us you have a student loan.', 'the yes sentence');
const iNoSaid = indexOfPresent(page, 'You told us you do not have a student loan.', 'the no sentence');
indexOfPresent(page, 'if (state === \'untold\') return null;', 'the untold state renders nothing');

ok('the yes and the no are different sentences, so the two states cannot read alike',
  iYesSaid > -1 && iNoSaid > -1 && iYesSaid !== iNoSaid);

// THE UNTOLD STATE MUST NOT NAG AND MUST NOT LOOK LIKE AN ERROR. The cheapest way to be sure of
// that is that no sentence about not having been told exists on the page to print.
//
// ⚠️ COMMENTS ARE STRIPPED FIRST, and that is not a convenience. The block above StudentLoanHeld
// QUOTES the banned line to explain why it is not there, so a sweep over the raw file fails on the
// documentation of the very rule it is checking. Only what can reach a screen is searched.
const rendered = page
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
ok('there is no "you have not told us" line to nag him with',
  !/you have not told us/i.test(rendered));
ok('and no error wording attached to a man who simply never mentioned it',
  !/something went wrong|we could not read your student loan/i.test(rendered));

// ── 7. WHERE IT CAME FROM, AND WHAT TO DO IF IT IS WRONG ─────────────────────────────────────────
ok('it says the answer came from the signup form',
  /came from the tick you put on the form when you signed up/.test(page));
ok('it says plainly that he was not asked it here',
  page.includes("SL_NOT_ASKED_HERE = 'You have not been asked it here.'")
  && page.includes('{SL_NOT_ASKED_HERE}'));
// ⚠️ SCOPED TO THE HELD CARD, NOT THE WHOLE FILE. saidLine() has called writtenInFromSignup since
// July, so a sweep over the page passed this on a tree with no card on it at all. An assertion that
// is true whether or not the thing exists is not an assertion.
ok('provenance is read from the stored exhibit, not assumed',
  /writtenInFromSignup\(asked\)[\s\S]{0,80}SL_FROM_SIGNUP/.test(page));
ok('a row that did not come from signup gets an honest second wording',
  /That is what is on your record/.test(page));
// He TICKED a box. A no can never have come from a tick, so a no never reads as though it did.
ok('the tick sentence is reachable only for a yes',
  /\{yes && writtenInFromSignup\(asked\) \? SL_FROM_SIGNUP : SL_FROM_RECORD\}/.test(page));
ok('a yes is told that the PLAN is what we count, which is the half signup never asked',
  /the thresholds differ by thousands between plans/.test(page));
ok('and it links him to the one page that can take the plan',
  page.includes('href="/app/tax/student-loan"'));
ok('a no is told where to come back to if it changes', /If that has changed, your /.test(page));

// ── 8. doc 103's HONESTY TEST. NO CONTROL THAT CANNOT CONTROL ────────────────────────────────────
// /api/circumstances refuses any key not in CIRCUMSTANCES, so a Yes or a No here would 400 on every
// press while looking exactly like the buttons ten rows above that work.
ok('the page posts no form carrying the student_loan key',
  !/name="key"\s+value="student_loan"/.test(page) && !page.includes("value={'student_loan'}"));

// The component's own body, from its declaration to the page function that renders it. Proved
// present above, and both ends are checked again here so a slice can never silently be empty.
const iPageFn = indexOfPresent(page, 'export default async function CircumstancesPage', 'the page function');
if (iComponent > -1 && iPageFn > iComponent) {
  const body = page.slice(iComponent, iPageFn);
  ok('the held card renders no yes or no buttons of its own',
    !/aria-pressed|<button/.test(body));
  ok('and it posts to nothing at all', !/<form|action=/.test(body));
}

// ── 9. THE HOUSE RULES ───────────────────────────────────────────────────────────────────────────
// The colour pairs. A raw accent used as ink on its own tint is the failure test/contrastapplication
// was written for, and that sweep excludes app/app, so this file holds the line for this page.
//
// ⚠️ THE THREE STYLE KEYS ARE PROVED PRESENT FIRST. A "no accent on its own tint" check is a
// negative, and a negative passes with flying colours on a page that has no card to get it wrong.
const iSaid = indexOfPresent(page, 'slSaid: {', 'the held card said style');
const iNote = indexOfPresent(page, 'slNote: {', 'the held card note style');
const iLink = indexOfPresent(page, 'slLink: {', 'the held card link style');
if (iSaid > -1 && iNote > -1 && iLink > -1) {
  ok('the held card puts no raw accent on its own tint',
    !/slSaid: \{[^}]*_TINT|slNote: \{[^}]*_TINT|slLink: \{[^}]*_TINT/.test(page));
  ok('its ink is INK and MUTED on the card panel',
    /slSaid: \{[^}]*color: INK/.test(page) && /slNote: \{[^}]*color: MUTED/.test(page));
  ok('its link uses an accent on the card panel, which clears AA in both themes',
    /slLink: \{ color: RIVER,/.test(page));
}

// No dashes. The rule applies to copy, comments and tests alike, so the two characters are named
// by their code points rather than typed, or this line would be the file's only breach of it.
const held = page.slice(iComponent > -1 ? iComponent : 0);
ok('no en dash or em dash anywhere in the new display', !/[\u2013\u2014]/.test(held));

process.stdout.write(`\n  ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);

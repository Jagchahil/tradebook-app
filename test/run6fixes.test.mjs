// Run 6, Maureen Adeyemi. The fixes, each with the defect it exists to stop.
//
//   node test/run6fixes.test.mjs
//
// Maureen is a limited company director AND an employee AND an employer AND near the VAT line.
// Every finding in this file was found by walking, not by reading, and every assertion here was
// made to FAIL against the old code before it was allowed to count.

import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const lib = path.join(root, 'lib');
const stage = mkdtempSync(path.join(tmpdir(), 'run6-'));
const fix = (s) => s.replace(/from '(\.\/[a-zA-Z0-9._-]+)'/g, "from '$1.ts'");
for (const f of readdirSync(lib)) {
  if (f.endsWith('.ts')) writeFileSync(path.join(stage, f), fix(readFileSync(path.join(lib, f), 'utf8')));
}
const load = (n) => import(pathToFileURL(path.join(stage, n + '.ts')).href);

const O = await load('taxoptimiser');
const LTD = await load('ltdengine');

let passed = 0, failed = 0;
const ok = (name, cond) => {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}`); }
};
const find = (list, key) => list.find((o) => o.key === key);

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// F5. A DIRECTOR WAS CHARGED CLASS 4 NATIONAL INSURANCE.
//
// THE DEFECT, on live production 14 August 2026. A limited company director with £37,000 of
// COMPANY profit opened /app/tax/ways-to-save and read:
//
//     "every £100 of allowable cost saves about £26 at your rate"
//
// £26 is marginalRate()'s basic band, which is "20 + 6". The 6 is CLASS 4 NATIONAL INSURANCE.
// She is a director and an employee of her own company and pays no Class 4 at all, ever, and the
// cost is her company's, relieved against CORPORATION TAX at 19%.
//
// taxPosition() had excluded company profit from personal figures since 13 August, under twenty
// five lines explaining exactly this. findOptimisations() then rebuilt its own total three hundred
// lines further down and reached past that fix for the raw number. A rule only holds where it is
// pointed.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n1. F5. WHOSE RATE IS THIS, AND WHOSE BILL DOES IT COME OFF.');

const maureen = {
  startYear: 2026, monthsElapsed: 12,
  ytdTradeIncome: 84_000, ytdTradeExpenses: 47_000, ytdCisSuffered: 0,
  employmentIncome: 0, categoriesLogged: [],
  homeOfficeClaimed: false, mileageClaimed: true, purchaseGoal: null,
  businessType: 'limited_company',
};
const sameFiguresSoleTrader = { ...maureen, businessType: 'sole_trader' };

const coCosts = find(O.findOptimisations(maureen), 'missed_expenses');
const stCosts = find(O.findOptimisations(sameFiguresSoleTrader), 'missed_expenses');

ok('the director is still offered the lever at all, so this is a fix and not a deletion', !!coCosts);
ok('🔴 AND SHE IS NOT QUOTED £26, WHICH IS 20 PLUS CLASS 4',
  !!coCosts && !/£26\b/.test(coCosts.detail));
ok('🔴 she is quoted £19, the small profits rate on her company profit',
  !!coCosts && /£19\b/.test(coCosts.detail));
ok('...and the sentence says WHOSE bill it comes off, because they are two taxpayers',
  !!coCosts && /your company's Corporation Tax/.test(coCosts.detail));
ok('...and never claims it is her own rate', !!coCosts && !/at your rate/.test(coCosts.detail));

ok('🔴 THE SOLE TRADER ON THE SAME FIGURES IS UNCHANGED, still 20 plus 6',
  !!stCosts && /£26\b/.test(stCosts.detail) && /at your rate/.test(stCosts.detail));
ok('...and his sentence never mentions Corporation Tax',
  !!stCosts && !/Corporation Tax/.test(stCosts.detail));

// The purchase lever asks the SAME question, so it must get the same answer from the SAME
// function. Two sentences about one deductible pound is how this defect happened in the first
// place.
const goal = { title: 'a carpet machine', amount: 4_000 };
const coAia = find(O.findOptimisations({ ...maureen, purchaseGoal: goal }), 'aia_timing');
const stAia = find(O.findOptimisations({ ...sameFiguresSoleTrader, purchaseGoal: goal }), 'aia_timing');
ok('the purchase lever prices a company at the company rate, 4,000 at 19% is 760',
  !!coAia && coAia.estSaving === 760 && /your company's Corporation Tax/.test(coAia.detail));
ok('...and the same purchase for a sole trader is 4,000 at 26%, which is 1,040',
  !!stAia && stAia.estSaving === 1040 && /at your rate/.test(stAia.detail));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// PIN THE SHARED FUNCTION, NOT THE SENTENCE. deductibleSaving() is the one answer to "what does a
// deductible pound save, and whose bill". A regex on a screen only holds where it is pointed.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n2. THE SHARED FUNCTION ITSELF, INCLUDING THE BAND NO CONSTANT WOULD KNOW.');

ok('a sole trader gets his own marginal rate, and it is his bill',
  O.deductibleSaving(false, 0, 32_000).rate === 0.26 && O.deductibleSaving(false, 0, 32_000).whose === 'you');
ok('a company under the small profits limit gets 19%, and it is the company bill',
  Math.abs(O.deductibleSaving(true, 37_000, 0).rate - 0.19) < 1e-9
  && O.deductibleSaving(true, 37_000, 0).whose === 'company');
ok('🔴 AND INSIDE MARGINAL RELIEF IT IS 26.5%, WHICH IS NOT A CONSTANT ANYWHERE IN THE PRODUCT',
  Math.abs(O.deductibleSaving(true, 100_000, 0).rate - 0.265) < 1e-9);
ok('a company over the upper limit gets the main rate, 25%',
  Math.abs(O.deductibleSaving(true, 300_000, 0).rate - 0.25) < 1e-9);
ok('a company with no profit yet is quoted nothing rather than a rate on nothing',
  O.deductibleSaving(true, 0, 0).rate === 0);

// DERIVED, NOT RETYPED. If a Budget moves a corporation tax limit, this moves with it, and a
// hardcoded 0.19 in the assertion above would have gone on passing while the product went wrong.
ok('the company rate is differenced off corporationTax() itself, so a Budget moves both together',
  Math.abs(O.deductibleSaving(true, 37_000, 0).rate
    - (LTD.corporationTax(37_000) - LTD.corporationTax(36_900)) / 100) < 1e-12);

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// AND THE SECOND DEFECT THE SAME LINE WAS CAUSING, which nobody had noticed and which
// test/wave9_useofhome.test.mjs was holding in place. To RECEIVE the Marriage Allowance you must
// be a basic rate INCOME TAX payer. A director pays no income tax on her company's profit.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n3. THE SECOND LEVER THE SAME LINE WAS GETTING WRONG.');

ok('🔴 a director with no personal income is not offered marriage allowance to RECEIVE',
  !find(O.findOptimisations(maureen), 'marriage_allowance_receive'));
ok('...and a director who HAS taken a salary inside the basic band still is, so it is not a ban',
  !!find(O.findOptimisations({ ...maureen, employmentIncome: 30_000 }), 'marriage_allowance_receive'));


// ═══════════════════════════════════════════════════════════════════════════════════════════════
// F3. THE EMPLOYMENT ALLOWANCE, WHICH THIS PRODUCT DID NOT KNOW EXISTED.
//
// THE DEFECT, on live production 14 August 2026. A cleaner trading through her own company, with
// five staff on the payroll, read on /app/pay-yourself:
//
//     Employer National Insurance   £1,136
//     "The company owes this on salary above the employer threshold."
//
// Her company owed none of it. GOV.UK, checked live that day: the Employment Allowance is £10,500
// and the only bar is "If your company has only one director, they must not be the only employee
// liable for secondary Class 1 National Insurance." She has five. grep across the whole repo for
// "employment allowance" and for 10500 returned NOTHING.
//
// The arithmetic is deliberately NOT changed in this packet: applying it has to reach planLtd(),
// which is mirrored in tradebook-app and pinned by ltd-parity, and that is a two repo change in
// the week Run 7 ships the apps. What ships here is the question, and a screen that stops
// presenting an unasked question as a settled bill.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n4. F3. THE EMPLOYMENT ALLOWANCE QUESTION, AND THE SCREEN THAT ADMITS WHAT IT DOES NOT KNOW.');

const C = await load('circumstances');
const ea = C.CIRCUMSTANCES.find((c) => c.key === 'other_wages');

ok('the question exists at all, which it did not this morning', !!ea);
ok('🔴 it is asked ONLY of a company, because that is the only screen that reads the answer',
  !!ea && Array.isArray(ea.structures) && ea.structures.join(',') === 'limited_company');
ok('🔴 AND IT DOES NOT SAY "the company", because an unknown structure is asked everything',
  !!ea && !/the company\?/.test(ea.ask) && /the business/.test(ea.ask));
ok('the why names the allowance and the figure, so the reason is on the question itself',
  !!ea && /Employment Allowance/.test(ea.why) && /£10,500/.test(ea.why));
ok('the source is the GOV.UK eligibility rule, quoted rather than paraphrased',
  !!ea && /only one director/.test(ea.source) && /GOV\.UK/.test(ea.source));
ok('a director IS asked it', C.unanswered([], 'limited_company').some((c) => c.key === 'other_wages'));
ok('a known sole trader is NOT asked it', !C.unanswered([], 'sole_trader').some((c) => c.key === 'other_wages'));

// ── THE SCREEN. ASSERT THE RENDER, NOT THE STRING. ────────────────────────────────────────────
//
// ⚠️ BOUNDED SLICE. Run 5 shipped a guard that sliced from a block to END OF FILE and caught an
// unrelated line, so deleting the real one stayed green. This slice starts at the employer NI
// block and stops at the end of that section, and the presence of BOTH bounds is checked before
// anything is asserted about what is between them.
const page = readFileSync(path.join(root, 'app/app/pay-yourself/page.tsx'), 'utf8');
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const code = codeOnly(page);
const from = code.indexOf('{best.employerNI > 0 ?');
const to = code.indexOf('</section>', from);
ok('the employer NI block and its end are both present, so the slice below is real',
  from > 0 && to > from);
const niBlock = from > 0 && to > from ? code.slice(from, to) : '';

ok('🔴 THE ALLOWANCE IS NAMED INSIDE THE EMPLOYER NI BLOCK, not merely somewhere in the file',
  /Employment Allowance/.test(niBlock));
ok('...and the figure is there too', /£10,500/.test(niBlock));
ok('🔴 ALL THREE ANSWERS ARE RENDERED, so no state is left silent',
  // The opening brace is part of the anchor ON PURPOSE: without it, wrapping the whole ternary in
  // `false &&` kills the render on screen and leaves every word of it in the file, and this guard
  // went green on exactly that. Run 5 shipped that same hole.
  niBlock.includes("{otherWages === 'yes'")
  && /otherWages === 'no'/.test(niBlock)
  && niBlock.includes('We have to ask before we can count it'));
ok('🔴 AND THE YES ARM ADMITS THE FIGURES ABOVE DO NOT TAKE IT OFF YET',
  /do not take it off yet/.test(niBlock));
// ⚠️ ANCHORED ON WORDING UNIQUE TO THE NO ARM. The first version matched "only employee is its
// director", which the UNSURE arm also contains, so gutting the no arm left the guard green. The
// sabotage pass caught it. An assertion that can be satisfied by a different branch is not an
// assertion about this one.
ok('the no arm gives the actual reason rather than just refusing',
  /so this one stands as it is/.test(niBlock) && /If you take somebody on/.test(niBlock));

// The page must READ the answer, not assume it. An import is not a wiring, so this checks the call
// and the threading, both of which have to be live for a single word to reach the screen.
ok('the page calls readCircumstances, which it did not before', /readCircumstances\(user\.id\)/.test(code));
ok('🔴 A FAILED READ IS UNSURE, NEVER A "no"',
  /readCircumstances\(user\.id\)\.catch\(\(\) => null\)/.test(code)
  && /raw === 'yes' \|\| raw === 'no' \? raw : null/.test(code));
ok('...and the answer is actually threaded into the component that draws the line',
  /otherWages=\{otherWages\}/.test(code) && /otherWages \}: \{/.test(code));



// ═══════════════════════════════════════════════════════════════════════════════════════════════
// F1. A FOLD WITH NO DISCLOSURE MARKER IS AN EMPTY CARD.
//
// THE DEFECT, read live off production 14 August 2026. Both <summary> elements on /app/you
// computed to summaryDisplay "flex", listStyleType "disclosure-closed", ::before "none",
// ::after "none", class "(none)". A <summary> is display:list-item by default and THAT is what
// generates the ::marker box the triangle is painted into. Setting display:flex removes the box.
// The browser still wanted a triangle and had nowhere to put it, and the element carried no class
// so no stylesheet could reach it to draw one.
//
// Nine doors sat behind those two bare headings, including billing, every invoice, the jobs diary
// and the whole data rights lane.
//
// ⚠️ THIS GUARD SWEEPS THE WHOLE APP, NOT THE ONE PAGE. That is the entire lesson: the chevron
// pattern already existed and was correct in app/app/tax/page.tsx, and AppNav.tsx carried the
// warning that a React style object cannot express ::-webkit-details-marker. The rule was known.
// It was simply never pointed at /app/you. A guard pointed at one page would repeat the mistake.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n5. F1. EVERY FOLD IN THE PRODUCT, NOT JUST THE ONE THAT WAS BROKEN.');

const { execFileSync } = await import('node:child_process');
const withSummary = execFileSync('grep', ['-rl', '--include=*.tsx', '<summary', 'app', 'components'],
  { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean).sort();

// A CHECK THAT COULD NOT RUN IS NOT A CHECK THAT PASSED. If the sweep finds nothing it has broken,
// not passed, and /app/you must be in the list or the sweep is not looking where the bug was.
ok('🔴 THE SWEEP ACTUALLY FOUND FOLDS, so the assertions below are not passing vacuously',
  withSummary.length >= 5 && withSummary.includes('app/app/you/page.tsx'));

// Three honest ways to show a fold opens. A file must use one of them, and be named here with the
// reason, so a NEW fold added anywhere fails this until somebody has looked at it.
const AFFORDANCE = {
  'app/app/you/page.tsx': 'draws its own chevron, because S.foldTop sets display:flex',
  'app/app/tax/page.tsx': 'draws its own chevron on .lek-tools-summary',
  'app/pricing/page.tsx': 'prints a + inside the summary markup',
  'app/file-your-tax-return/page.tsx': 'draws + and - with ::after',
  'app/app/diary/page.tsx': 'keeps the NATIVE marker: its S.foldTop sets no display at all',
  'app/app/AppNav.tsx': 'the summary IS a round plus button, so a marker would be noise',
};
const drawsOwn = (src) => /::after\{content:/.test(src) || /<span className="fp">\+<\/span>/.test(src);
const keepsNative = (src) => !/summary\{[^}]*list-style\s*:\s*none/.test(src)
  && !/foldTop:\s*\{[^}]*display\s*:/.test(src);

for (const f of withSummary) {
  const src = readFileSync(path.join(root, f), 'utf8');
  ok(`${f} is classified, so a new fold cannot appear unnoticed`, !!AFFORDANCE[f]);
  ok(`${f} actually has an affordance: ${AFFORDANCE[f] ?? 'UNCLASSIFIED'}`,
    drawsOwn(src) || keepsNative(src));
}

// ── AND THE PAGE THAT WAS BROKEN, SPECIFICALLY. ──────────────────────────────────────────────
const you = readFileSync(path.join(root, 'app/app/you/page.tsx'), 'utf8');
ok('🔴 both summaries carry the class, because an element with no class is unreachable by CSS',
  (you.match(/<summary className="lek-fold-top"/g) ?? []).length === 2);
ok('🔴 and both details carry theirs, so the open state can rotate the chevron',
  (you.match(/<details className="lek-card lek-fold"/g) ?? []).length === 2);
ok('the native marker is killed rather than left to fight the drawn one',
  /\.lek-fold-top::-webkit-details-marker\{display:none\}/.test(you)
  && /\.lek-fold-top\{list-style:none\}/.test(you));
ok('🔴 A CHEVRON IS ACTUALLY DRAWN, which is the whole finding',
  /\.lek-fold-top::after\{content:''/.test(you));
ok('...and it turns over when the fold opens, so the control says which way it is',
  /\.lek-fold\[open\]>\.lek-fold-top::after\{transform:rotate\(-135deg\)/.test(you));
ok('the motion comes from the token set, never a typed duration',
  /transition:transform \$\{MOTION\.enter\} \$\{MOTION\.ease\}/.test(you));
ok('...and it is dropped for anyone who asked for less motion',
  /prefers-reduced-motion:reduce\)\{\.lek-fold-top::after\{transition:none\}\}/.test(you));



// ═══════════════════════════════════════════════════════════════════════════════════════════════
// F4. THE TWO STATUTORY VAT TESTS WERE TOLD ON WHATSAPP AND ON NO WEB SCREEN.
//
// lib/vatstanding.ts has owned BACKWARD_TEST and FORWARD_TEST since Run 2, headed "The two
// statutory tests, in the order a customer meets them". Every consumer of them in the product was
// app/api/whatsapp/route.ts. A customer £6,000 from the line who ASKED on WhatsApp was told both.
// The same customer standing on /app/tax/vat was told neither, and given no source.
//
// ⚠️ AND THE GUARD THAT LET IT THROUGH IS THE POINT. test/run2fixes.test.mjs asserts that both
// constants EXIST and contain the right words. Neither line asserts that any screen renders them.
// Testing that a name appears in a file is not testing that it is used.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n6. F4. THE VAT TESTS, ON THE SCREEN AND NOT ONLY IN THE CHAT.');

const vat = readFileSync(path.join(root, 'app/app/tax/vat/page.tsx'), 'utf8');
const vatCode = codeOnly(vat);

// PIN THE SHARED CONSTANT, NOT A COPY OF THE SENTENCE. If this screen ever grows its own wording
// for a statutory test, this goes red, which is why those constants are owned in one module.
ok('the page takes both tests from the module that owns them',
  /BACKWARD_TEST/.test(vatCode) && /FORWARD_TEST/.test(vatCode)
  && /lib\/vatstanding/.test(vatCode));
ok('🔴 AND IT RENDERS THEM, which an import alone never proves',
  /\{BACKWARD_TEST\}/.test(vatCode) && /\{FORWARD_TEST\}/.test(vatCode));

// ⚠️ BOUNDED SLICE, both bounds checked before anything between them is asserted.
const nrFrom = vatCode.indexOf(') : !profile.registered ? (');
const nrTo = vatCode.indexOf(') : pos === null ? (', nrFrom);
ok('the not registered branch and its end are both present, so the slice below is real',
  nrFrom > 0 && nrTo > nrFrom);
const notReg = nrFrom > 0 && nrTo > nrFrom ? vatCode.slice(nrFrom, nrTo) : '';
ok('🔴 BOTH TESTS SIT INSIDE THE NOT REGISTERED BRANCH, not merely somewhere in the file',
  /\{BACKWARD_TEST\}/.test(notReg) && /\{FORWARD_TEST\}/.test(notReg));
ok('...and the gov.uk source is beside them, as it already is on the WhatsApp answer',
  /vat-registration\/when-to-register/.test(notReg));

// They must not be gated on nearLine, nor on a successful read. The rules are the rules, and this
// is the arm where silence reads exactly like being safely under the line.
ok('🔴 they are not hidden behind nearLine, which only the card fee note is',
  !/nearLine \? <p style=\{S\.body\}>\{BACKWARD_TEST\}/.test(notReg));
ok('🔴 nor behind a successful turnover read, because a failed read does not change the law',
  notReg.indexOf('{BACKWARD_TEST}') > notReg.indexOf("turnover?.kind === 'known'"));

// The style key that typechecked while being absent. S is Record<string, CSSProperties>, so a
// missing key is a valid lookup returning undefined and the link would render unstyled.
ok('🔴 THE SOURCE LINK USES A STYLE KEY THAT EXISTS, which tsc cannot tell you',
  /style=\{S\.inlineLink\}/.test(vatCode) && /^ {2}inlineLink: \{/m.test(vat));

// And the chat must keep saying it, so this is a widening and never a move.
const wa = codeOnly(readFileSync(path.join(root, 'app/api/whatsapp/route.ts'), 'utf8'));
ok('the WhatsApp answer still pushes both tests, so the chat lost nothing',
  /parts\.push\(BACKWARD_TEST\)/.test(wa) && /parts\.push\(FORWARD_TEST\)/.test(wa));



// ═══════════════════════════════════════════════════════════════════════════════════════════════
// F6. A DAY'S CLEANING IS NOT TWENTY FOUR HOURS.
//
// A job booked as "One day" at 8:30am read "About 24h, from your diary" on the job screen, two
// lines under a diary list that read "one day" correctly. Both off the same pair of timestamps.
// parseDurationHours means WORKING hours below a day (half a day is 4) and CALENDAR hours at a day
// and above (one day is 24). Half of one day is four hours on one branch and twelve on the other.
//
// The SLOT is not the thing to change: a day job has to occupy the day or the week strip cannot
// place it. The sentence was wrong, so the sentence moved.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n7. F6. ONE BOOKING, DESCRIBED ONE WAY.');

const J = await import(pathToFileURL(path.join(root, 'lib/jobphotos.ts')).href);
const D = await import(pathToFileURL(path.join(root, 'lib/diary.ts')).href);

const dayStart = '2026-08-14T07:30:00.000Z';
const dayEnd = '2026-08-15T07:30:00.000Z';
const dayHours = J.hoursFromSlot(dayStart, dayEnd);
const dayWords = D.durationPhrase(dayStart, dayEnd);

ok('the slot is untouched, so the week strip still places a day job on its day', dayHours === 24);
ok('🔴 AND THE JOB SCREEN NO LONGER SAYS 24h FOR A DAY OF CLEANING',
  !/24h/.test(J.hoursGuessPhrase(dayHours, dayWords) ?? ''));
ok('🔴 IT SAYS WHAT THE DIARY LIST SAYS, off the same call',
  J.hoursGuessPhrase(dayHours, dayWords) === 'About one day, from your diary');

// Below a day it must still be hours, because that is what he booked and what he means.
const halfStart = '2026-08-14T07:30:00.000Z';
const halfEnd = '2026-08-14T11:30:00.000Z';
ok('half a day is still four hours on the job screen',
  J.hoursGuessPhrase(J.hoursFromSlot(halfStart, halfEnd), 'half a day') === 'About 4h, from your diary');
ok('an hour is still an hour',
  J.hoursGuessPhrase(1, 'one hour') === 'About 1h, from your diary');

// AN UNKNOWN IS NOT AN ANSWER. With no words for a long slot it says nothing rather than 24h.
ok('🔴 a day or more with no phrase to hand says NOTHING, never a calendar hour count',
  J.hoursGuessPhrase(48, null) === null && J.hoursGuessPhrase(24, undefined) === null);

// ⚠️ THE MODULE MUST STAY IMPORT FREE. test/jobdiary.test.mjs imports it DIRECTLY off disk with no
// staging and no specifier rewriting, so one import fails that whole suite with a module not
// found. The header says so and the first attempt at this fix added one anyway.
const jp = readFileSync(path.join(root, 'lib/jobphotos.ts'), 'utf8');
ok('🔴 lib/jobphotos.ts IS STILL IMPORT FREE, which its own header warns about',
  !/^import /m.test(jp));

// And the page must actually hand the words over. A parameter nothing passes is a default.
const diaryPage = codeOnly(readFileSync(path.join(root, 'app/app/diary/page.tsx'), 'utf8'));
ok('🔴 the page passes the phrase, so the new arm is reachable at all',
  /hoursGuessPhrase\(hours, job \? durationPhrase\(job\.startsAt, job\.endsAt\) : null\)/.test(diaryPage));
ok('...and it is the SAME call the list beside it makes, not a second copy of the rule',
  (diaryPage.match(/durationPhrase\(job\.startsAt, job\.endsAt\)/g) ?? []).length >= 2);



// ═══════════════════════════════════════════════════════════════════════════════════════════════
// F2. THREE FIGURES RENDERED GLUED TO THE WORD AFTER THEM, AND tsc CANNOT SEE IT.
//
// "£23,295of profit" and "2026/27added up", read off production with textContent and then by
// character code. The SOURCE IS CORRECT in all three places, byte dumped to be sure. SWC strips
// the leading whitespace of those JSX text runs; TypeScript does not, proved by running the
// repo's own TypeScript over the same files and watching it emit the space every time.
//
// So this suite CANNOT test the pages. It tests the SCANNER, which is the thing that can run
// without a build. CI runs that same scanner against the real compiled output after npm run build.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n8. F2. THE GLUED FIGURES, AND A CHECK THAT SAYS SO WHEN IT CANNOT RUN.');

const G = await import(pathToFileURL(path.join(root, 'scripts/check-glued-figures.mjs')).href);

// The real compiled shapes, taken verbatim out of .next on the day this was found.
const GLUED = 'children:["On the ",(0,n.gbp0)(d.ctProfit),"of profit left after your salary. The salary is a company cost, so it."]';
const SPACED = 'children:["On the ",(0,n.gbp0)(d.ctProfit)," of profit left after your salary. The salary is a company cost, so it."]';
const GLUED2 = 'children:["it is your own figures for ",O.taxYear,"added up. That window is the personal tax year rather than yours."]';

ok('🔴 IT CATCHES THE DEFECT AS THE COMPILER ACTUALLY EMITTED IT', G.findGlued(GLUED).length === 1);
ok('...and the property access form too, not only the call form', G.findGlued(GLUED2).length === 1);
ok('🔴 AND IT IS SILENT ON THE CORRECT FORM, so it is not just matching prose',
  G.findGlued(SPACED).length === 0);
ok('a line break needs no space, so <br/> is not a finding',
  G.findGlued('children:["Lekhio vs",(0,b.jsx)("br",{}),"the other options."]').length === 0);
ok('a css rule is not prose', G.findGlued('children:["a",x,"color:red;font-weight:800"]').length === 0);
ok('a bare word with no sentence punctuation is not prose either',
  G.findGlued('children:["a",x,"onclick handler"]').length === 0);
ok('and nothing outside a children array counts', G.findGlued('const a = [x,"of profit left after."]').length === 0);

// ⚠️ A CHECK THAT COULD NOT RUN IS NOT A CHECK THAT PASSED. This is the Run 5 signature failure,
// and this check is exactly the shape that fails it: it reads a build directory that will not
// exist on a machine that has not built. It must EXIT NON ZERO and say so.
const script = path.join(root, 'scripts/check-glued-figures.mjs');
let noBuildExit = 0;
let noBuildSaid = '';
try {
  noBuildSaid = execFileSync('node', [script], { cwd: tmpdir(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  noBuildExit = e.status ?? 1;
  noBuildSaid = String(e.stdout ?? '');
}
ok('🔴 WITH NO BUILD TO SCAN IT EXITS NON ZERO', noBuildExit !== 0);

// ⚠️ AND THE OTHER TWO WAYS IT COULD LIE, both found by the sabotage pass rather than by reading.
// A directory that exists but holds nothing, and a run that FINDS something and shrugs. Neither
// was covered until a sabotage sat there green.
const fakeBuild = (files) => {
  const d = mkdtempSync(path.join(tmpdir(), 'fakebuild-'));
  const chunks = path.join(d, ...G.CHUNK_DIR.split('/'));
  mkdirSync(chunks, { recursive: true });
  for (const [name, body] of Object.entries(files)) writeFileSync(path.join(chunks, name), body);
  return d;
};
const runIn = (cwd) => {
  try {
    return { code: 0, out: execFileSync('node', [script], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) { return { code: e.status ?? 1, out: String(e.stdout ?? '') }; }
};

const empty = runIn(fakeBuild({}));
ok('🔴 A CHUNK DIRECTORY THAT EXISTS AND HOLDS NOTHING IS NOT A PASS EITHER',
  empty.code !== 0 && /NO CHUNKS/.test(empty.out));

const dirty = runIn(fakeBuild({ 'a.js': GLUED }));
ok('🔴 AND WHEN IT ACTUALLY FINDS ONE IT EXITS NON ZERO', dirty.code !== 0);
ok('...and prints the glued words so the fix is findable', /of profit left after/.test(dirty.out));

const clean = runIn(fakeBuild({ 'a.js': SPACED }));
ok('🔴 A CLEAN BUILD PASSES, so this is a detector and not a tripwire',
  clean.code === 0 && /No glued figures/.test(clean.out));
ok('...and says why, rather than failing silently', /NO BUILD TO SCAN/.test(noBuildSaid));
ok('...and names the command that fixes it', /npm run build/.test(noBuildSaid));

// The three sites themselves, fixed at source. This asserts the FIX, and the scanner above
// asserts the class. Neither alone is enough: the source looks right either way, which is the
// whole reason this defect survived a 236 suite gate.
const spaceFix = [
  ['app/app/pay-yourself/page.tsx', "{gbp0(best.ctProfit)}{' '}of profit left after your salary."],
  ['app/app/tax/summary/page.tsx', "{pack.taxYear}{' '}added up."],
  ['app/app/proof-of-income/page.tsx', "{gbp2(proof.cisDeducted)}{' '}of tax was taken"],
];
for (const [f, needle] of spaceFix) {
  ok(`${f} spells the space explicitly, so SWC cannot eat it`,
    readFileSync(path.join(root, f), 'utf8').includes(needle));
}


// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 8. F10. "CAN I CLAIM IT" WAS SOLE TRADER LAW READ BY A COMPANY DIRECTOR.
//
// Maureen is a director AND an employee of her own limited company. She read thirty odd cards on
// /app/tax/can-i-claim on 16 August 2026. Neither the page nor lib/claimrules.data.ts contains the
// word businessType, limited_company or structure, and it never will: the cards are ONE corpus,
// shared with the phone and published at /rules.json, and branching every card on a structure the
// reader has not always told us is how you get two versions of the law that drift apart.
//
// SO THE FIX IS NOT A BRANCH. IT IS THAT EVERY SENTENCE MUST BE TRUE OF BOTH READERS AT ONCE.
// That is a stronger requirement than a branch, and it is what these assertions hold to.
//
// Two sentences were not.
//
//   1. The tools card said the cash basis is "the standard method for sole traders and what most
//      people here are on". GOV.UK, Cash basis, read live: "Some businesses cannot use cash basis,
//      for example, limited companies." Her company cannot use it. The card told her she was on it.
//
//   2. The pension card said a pension is not a business cost and stopped. For her it is the wrong
//      half. HMRC PTM043100: employer contributions ARE deducted as an expense in computing the
//      profits of a trade. Her COMPANY can pay into her pension, deduct it against Corporation Tax
//      and pay no National Insurance on it at either end. /app/pay-yourself exists to help her
//      choose between salary, dividends and a pension, and this page did not mention the third.
//
// Nothing here is a wrong yes or no. It is a page that never asked what she was and then made
// assertions about her anyway. That is the Run 6 shape: the knowledge is not missing, the
// pointing is.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n8. F10. THE CLAIM CORPUS, READ BY A DIRECTOR AND BY A SOLE TRADER AT THE SAME TIME.');

const CR = await load('claimrules.data');
const RULES = CR.EXPENSE_RULES;
const ruleFor = (k) => RULES.find((r) => r.key === k);
const fields = (r) => `${r.rule} ${r.detail}`;

ok('the claim corpus loaded and has cards in it', Array.isArray(RULES) && RULES.length > 20);

// 8a. THE SENTENCE THAT WAS FALSE ABOUT HER.
{
  const tools = ruleFor('tools');
  ok('the tools card is still there', Boolean(tools));
  const d = tools?.detail ?? '';
  ok('🔴 IT NO LONGER TELLS EVERY READER THE CASH BASIS IS THE METHOD THEY ARE ON',
    !/standard method for sole traders|what most people here are on/i.test(d));
  ok('it names who the cash basis is actually open to', /sole traders and partnerships can use/.test(d));
  ok('🔴 AND IT NAMES THE BASIS A COMPANY IS ACTUALLY ON, in the same breath',
    /accruals basis/.test(d) && /limited company/.test(d));
  ok('and the answer still lands in the same place for both, which is why one card can serve both',
    /Annual Investment Allowance/.test(d) && /Either way/.test(d));
}

// 8b. THE LEVER THAT WAS MISSING, WHICH IS THE PART THAT COST HER MONEY.
{
  const pen = ruleFor('pension');
  ok('the pension card is still there', Boolean(pen));
  ok('🔴 IT NO LONGER ANSWERS A QUESTION THAT DEPENDS WITH A FLAT NO',
    pen?.verdict === 'depends');
  ok('the headline says the answer turns on who pays', /depends who pays it/i.test(pen?.rule ?? ''));
  ok('🔴 AND THE COMPANY ARM IS IN THE HEADLINE, not buried in the detail nobody opens',
    /Corporation Tax/.test(pen?.rule ?? ''));
  const d = pen?.detail ?? '';
  ok('the personal arm survived, because it was never wrong, only incomplete',
    /20% is added automatically/.test(d));
  ok('the company arm names who pays, what it comes off, and the National Insurance',
    /company pays the contribution/i.test(d) && /Corporation Tax/.test(d)
    && /no National Insurance on it at either end/i.test(d));
  ok('and it points her at the choice /app/pay-yourself exists to make',
    /salary/i.test(d) && /dividends/i.test(d));
}

// 8c. THE SHAPE, NOT THE TWO SENTENCES. This is the assertion that catches the NEXT one.
//
// ⚠️ A card that names one basis or one structure and not the other is a card making an assertion
// about a reader it never asked. Both of the F10 sentences were exactly that shape, and neither
// would have been caught by a fixture, because the corpus has no structure input to feed one.
{
  const OTHER = [
    [/\bcash basis\b/i, /\baccruals\b/i, 'names the cash basis without the accruals basis'],
    [/\baccruals\b/i, /\bcash basis\b/i, 'names the accruals basis without the cash basis'],
  ];
  const offenders = [];
  for (const r of RULES) {
    for (const [has, needs, why] of OTHER) {
      const t = fields(r);
      if (has.test(t) && !needs.test(t)) offenders.push(`${r.key} ${why}`);
    }
  }
  ok(`🔴 NO CARD NAMES ONE ACCOUNTING BASIS AND LEAVES THE OTHER READER GUESSING${offenders.length ? `: ${offenders.join('; ')}` : ''}`,
    offenders.length === 0);

  // And the tips carried the same sentence, in a shorter dress.
  const tips = CR.TAX_TIPS ?? [];
  const badTips = tips.filter((t) => /cash basis/i.test(t.body) && !/accruals/i.test(t.body));
  ok(`🔴 AND NEITHER DOES A TAX TIP${badTips.length ? `: ${badTips.map((t) => t.title).join('; ')}` : ''}`,
    badTips.length === 0);
}

// 8d. THE CITATIONS. A director reading these was reading the wrong Act.
{
  const RS = await load('rulesources');
  const sources = Object.entries(RS.RULE_SOURCES);

  const pension = RS.RULE_SOURCES.pension ?? [];
  ok('the pension card now carries two sources, not one', pension.length === 2);
  const ptm = pension.find((x) => x.code === 'PTM043100');
  ok('🔴 AND THE SECOND ONE IS HMRC SAYING THE COMPANY ARM ITSELF', Boolean(ptm));
  ok('it is a gov.uk page, because nothing else is an authority',
    /^https:\/\/www\.gov\.uk\/hmrc-internal-manuals\/pensions-tax-manual\/ptm043100$/.test(ptm?.url ?? ''));
  ok('its authority names the company Act as well as the personal one',
    /CTA 2009/.test(ptm?.authority ?? '') && /ITTOIA 2005/.test(ptm?.authority ?? ''));

  // ⚠️ THE QUOTE IS LOAD BEARING AND IT IS THE EASIEST THING HERE TO GET SILENTLY WRONG.
  // khoji/corpus.mjs matches the quote as a SUBSTRING of the live page. A quote trimmed short and
  // given a full stop of its own matches nothing, and then Khoji alarms every night forever on a
  // citation that is word for word right. That is the exact failure mode corpus.mjs was written
  // to avoid, so the quote must end where HMRC's sentence ends.
  ok('🔴 THE PTM QUOTE ENDS WHERE HMRC ENDS IT, so the nightly check can find it',
    /taxable profit\.$/.test(ptm?.quote ?? ''));
  ok('...and it is long enough to be an anchor rather than a fragment', (ptm?.quote ?? '').length > 100);

  // Every ITTOIA citation now names the company section beside it. One exception, written down.
  const NO_CTA_SIBLING = new Set(['bad_debt']);
  const wrongAct = [];
  for (const [key, list] of sources) {
    if (NO_CTA_SIBLING.has(key)) continue;
    for (const src of list) {
      const a = src.authority ?? '';
      if (/ITTOIA|Income Tax \(Trading/.test(a) && !/CTA 2009/.test(a)) wrongAct.push(`${key}: ${a}`);
    }
  }
  ok(`🔴 EVERY CARD THAT NAMES THE SOLE TRADER ACT NAMES THE COMPANY ACT TOO${wrongAct.length ? `: ${wrongAct.join(' | ')}` : ''}`,
    wrongAct.length === 0);

  // The exception is not a hole. It is a refusal, and it has to stay a deliberate one.
  const badDebt = RS.RULE_SOURCES.bad_debt ?? [];
  ok('bad debts is still cited to ITTOIA', badDebt.some((x) => /ITTOIA|Income Tax \(Trading/.test(x.authority ?? '')));
  ok('🔴 AND IT STILL HAS NO CTA SIBLING, because S55 CTA 2009 RESTRICTS the deduction this card '
    + 'grants and a tidy wrong pair is worse than an honest gap',
    badDebt.every((x) => !/CTA 2009/.test(x.authority ?? '')));
}

// 8e. AND IT REACHES HER. A corpus fixed in lib that the page does not render is a fix nobody got.
for (const file of ['app/can-i-claim/page.tsx', 'app/app/tax/can-i-claim/page.tsx']) {
  const src = readFileSync(path.join(root, file), 'utf8');
  ok(`${file} renders the headline answer`, /\.rule\b|\{r\.rule\}|rule\}/.test(src));
  ok(`${file} renders the detail, which is where the company arm lives`, /\.detail\b/.test(src));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 9. F9. THE INVOICE WAS BUILT TO THE VAT RULES AND NEVER TO THE ONES THAT APPLY TO EVERYBODY.
//
// app/invoice/[id]/page.tsx opens with twenty lines on VAT Regulations 1995 reg 14 and implements
// it well, reverse charge and all. Reg 14 reaches the minority of users who are VAT registered.
// GOV.UK, "Invoices: what they must include", reaches all of them, and Maureen's first invoice was
// short of two of its bullets:
//
//     the company name and address of the customer you are invoicing     NAME ONLY
//     the date the goods or service were provided (supply date)          ABSENT
//
// The supply date existed in spirit. Line 120 read:
//
//     const dateValue = (carriesVat ? invoice.tax_point : null) || invoice.issued_date;
//
// The tax point IS the supply date and the product holds one, and it was shown to VAT registered
// senders alone. Everybody else got the issue date. The customer's address existed nowhere: no
// column, no form field, no render, and a grep for supplyDate or serviceDate across lib and app
// returned nothing at all.
//
// ⚠️ AND THIS IS WHY THE FIXTURE BELOW IS NOT VAT REGISTERED. Every existing invoice suite is
// pointed at reg 14 and every one of them was green while this was broken, because a VAT fixture
// takes the carriesVat branch and prints a date either way. A guard written the easy way here
// would have been green on the day the defect was found.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n9. F9. THE DOCUMENT A CUSTOMER WHO IS NOT VAT REGISTERED RECEIVES.');

// 9a. THE DOCUMENT ITSELF, ATTACKED AT THE BYTES, WITH NO VAT ANYWHERE IN IT.
{
  const PDFINV = await load('invoicepdf');
  const notRegistered = {
    number: 'INV-0001',
    customer_name: 'Hamilton Lettings',
    customer_address: '14 Brigstock Road\nThornton Heath\nCR7 7JH',
    customer_contact: null,
    line_items: [
      { description: 'End of tenancy clean, 3 bed flat, Thornton Heath', amount: 340 },
      { description: 'Carpet clean, two bedrooms', amount: 90 },
    ],
    subtotal: 430, tax: 0, total: 430, reverse_charge_vat: 0,
    // 🔴 'none' IS THE WHOLE POINT. Not null, which is the old world, and not 'charged'.
    vat_treatment: 'none', tax_point: '2026-08-16',
    // She cleaned the flat on the 14th and billed it on the 16th. Those are different dates and
    // that is the ordinary case, not the awkward one.
    supply_date: '2026-08-14',
    status: 'draft', notes: null, issued_date: '2026-08-16', due_date: '2026-08-30',
    business_name: 'LEKHIO LTD', business_contact: null,
    business_address: 'Unit 12, Sydenham Road, Croydon, CR0 1LH', business_vrn: null,
  };
  const bytes = PDFINV.buildInvoicePdf(notRegistered);
  const doc = Buffer.from(bytes).toString('latin1');

  ok('the file is a PDF at all, so the rest of this is about a real document', doc.startsWith('%PDF-'));
  ok('🔴 THE CUSTOMER ADDRESS IS ON THE DOCUMENT, every line of it',
    doc.includes('14 Brigstock Road') && doc.includes('Thornton Heath') && doc.includes('CR7 7JH'));
  ok('🔴 AND SO IS THE DATE THE WORK WAS DONE, on an invoice carrying no VAT at all',
    /Work done/.test(doc) && /14 August 2026/.test(doc));
  ok('the issue date is still there and still says what it is',
    /Issued/.test(doc) && /16 August 2026/.test(doc));
  ok('and the two dates are not the same date, so this fixture can actually tell them apart',
    notRegistered.supply_date !== notRegistered.issued_date);
  ok('🔴 AND NOTHING ON IT MENTIONS VAT, because she is not registered and never was',
    !/VAT/.test(doc));

  // ⚠️ THE OLD WORLD. A row raised before 16 August 2026 carries null in both columns, and it
  // must print exactly as it printed on the day it was sent. This is the rule already written at
  // the top of the page for vat_treatment, and it now has two more columns to hold.
  const legacy = { ...notRegistered, customer_address: null, supply_date: null, vat_treatment: null };
  const old = Buffer.from(PDFINV.buildInvoicePdf(legacy)).toString('latin1');
  ok('🔴 A ROW FROM BEFORE THIS CHANGE PRINTS NO SUPPLY LINE, rather than the issue date wearing one',
    !/Work done/.test(old));
  ok('...and no address block it never had', !/Brigstock/.test(old));
  ok('...and it is still a readable document, not a crash', old.startsWith('%PDF-') && old.includes('Hamilton Lettings'));
}

// 9b. THE OTHER RENDERING OF THE SAME DOCUMENT. Two renderings, never two documents.
{
  const doc = readFileSync(path.join(root, 'app/invoice/[id]/page.tsx'), 'utf8');
  const src = codeOnly(doc);
  ok('the page prints the customer address', /invoice\.customer_address/.test(src));
  // ⚠️ THE WHOLE STATEMENT, NOT A FRAGMENT OF IT. The first draft of this assertion looked for
  // prettyDate(invoice.supply_date) anywhere and separately banned one exact conditional. The
  // sabotage pass wrote a DIFFERENT conditional around the same call and stayed green. A guard
  // against "this is gated" has to anchor on the ungated statement itself, ending at its
  // semicolon, or it is only banning the one gate you happened to think of.
  ok('🔴 AND IT PRINTS THE SUPPLY DATE OUTSIDE THE carriesVat BRANCH, which was the defect',
    /\n  const workedOn = prettyDate\(invoice\.supply_date\);\n/.test(src));
  ok('the supply date has its own label rather than borrowing the tax point one',
    /Work done/.test(src) && /\{dateLabel\}/.test(src));
  ok('a missing address prints nothing rather than an empty heading',
    /\{invoice\.customer_address \?/.test(src));
  ok('a missing supply date prints nothing either', /\{workedOn \?/.test(src));
  ok('🔴 AND THE TAX POINT IS UNTOUCHED, because it is a VAT figure and not this bullet',
    /const dateValue = \(carriesVat \? invoice\.tax_point : null\) \|\| invoice\.issued_date;/.test(src));
}

// 9c. THE FORM ASKS, AND THE ROUTE DOES NOT INVENT.
{
  const form = readFileSync(path.join(root, 'app/app/invoices/new/page.tsx'), 'utf8');
  const route = readFileSync(path.join(root, 'app/api/invoices/route.ts'), 'utf8');
  const routeCode = codeOnly(route);

  ok('the form asks for the address', /name="address"/.test(form));
  ok('the form asks when the work was done, as a date and not free text',
    /name="worked_on"/.test(form) && /type="date"/.test(form));
  ok('🔴 BOTH ARE REQUIRED ON THE FORM, which is the page whose output leaves the building',
    /<textarea id="address"[^>]*required/.test(form) && /id="worked_on"[^>]*required/.test(form));
  ok('and a future supply date cannot be picked, because work is not done before it is done',
    /id="worked_on"[^>]*max=\{today\}/.test(form));
  ok('the refusals are said in words rather than shown as a code',
    /case 'address':/.test(form) && /case 'worked':/.test(form));

  ok('the route reads both off the form', /f\.get\('address'\)/.test(routeCode) && /f\.get\('worked_on'\)/.test(routeCode));
  ok('🔴 AND REFUSES A FORM POST THAT IS MISSING EITHER',
    /isForm && !customerAddress/.test(routeCode) && /problem=address/.test(routeCode)
    && /isForm && !supply/.test(routeCode) && /problem=worked/.test(routeCode));
  ok('🔴 BUT DOES NOT DEMAND THEM OF THE API, so a man dictating an invoice on WhatsApp is not blocked',
    /isForm && !customerAddress/.test(routeCode) && !/^\s*if \(!customerAddress\)/m.test(routeCode));
  ok('an unreadable date is refused rather than quietly becoming today',
    /bad_supply_date/.test(routeCode));
  ok('and both are handed to createInvoice', /customer_address: customerAddress/.test(routeCode)
    && /supply_date: supply/.test(routeCode));
}

// 9d. THE DIARY ALREADY KNEW. This is the half of the fix that costs her nothing.
{
  const diary = codeOnly(readFileSync(path.join(root, 'app/api/diary/route.ts'), 'utf8'));
  ok('🔴 THE DIARY CARRIES THE DATE ACROSS, because it is the one surface that already holds it',
    /on=\$\{worked\}/.test(diary) && /job\.starts_at/.test(diary));
  ok('...off the row we read server side, never a form field, the same rule the name follows',
    /const job = await readDiaryJob\(user\.id, id\)/.test(diary));
  const newPage = codeOnly(readFileSync(path.join(root, 'app/app/invoices/new/page.tsx'), 'utf8'));
  ok('...and the form still does not trust it, because it arrived in a URL',
    /prefillOn/.test(newPage) && /\\d\{4\}-\\d\{2\}-\\d\{2\}/.test(newPage));
  ok('...falling back to today rather than to nothing, so the box is never empty',
    /: today;/.test(newPage));
}

// 9e. THE COLUMNS. A render with nowhere to read from is a fix that ships broken.
{
  const sup = readFileSync(path.join(root, 'lib/supabase.ts'), 'utf8');
  ok('the public row carries both fields', /customer_address: string \| null;/.test(sup)
    && /supply_date: string \| null;/.test(sup));
  ok('🔴 AND THE SELECT ACTUALLY ASKS THE DATABASE FOR THEM. A column selected by nothing is the '
    + 'exact shape of the address bug that was already fixed once on this page',
    /select=number,customer_name,customer_address,/.test(sup) && /tax_point,supply_date,status/.test(sup));
  ok('a new invoice always has a supply date, falling back to the day it was raised',
    /supply_date: input\.supply_date \?\? today\.toISOString\(\)\.slice\(0, 10\)/.test(sup));
  ok('🔴 AND THE CUSTOMER CONTACT IS STILL KEPT OFF THE PUBLIC LINK, which the address is not',
    /customer_contact: null,/.test(sup));

  const sql = readFileSync(path.join(root, 'supabase/APPLY_2026-08-16_invoice_baseline.sql'), 'utf8');
  ok('the migration exists and adds both columns',
    /add column if not exists customer_address text/.test(sql)
    && /add column if not exists supply_date date/.test(sql));
  ok('🔴 AND IT BACKFILLS NOTHING, so a sent invoice does not change after the fact',
    !/\bupdate\s+public\.invoices\b/i.test(sql));
}

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed > 0 ? 1 : 0);

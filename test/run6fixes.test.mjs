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


console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed > 0 ? 1 : 0);

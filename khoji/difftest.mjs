// The gate. Nothing else in Khoji gets built until this passes.
//
//   "Test it by regression: set FACTS.mileageCarFirst10k to 0.45 in a fixture and assert the
//    differ screams. If it doesn't catch the bug we actually had, it is not built."   docs/105
//
// It runs on fixtures, never the network, so it is deterministic and it runs in CI. The mileage
// fixture is the REAL page text, copied from the live GOV.UK page on 12 July 2026, decoys and all.
//
//   node difftest.mjs
//
// There are two tests that matter here and the second one is the one people forget.
//
//   TEST 1  Our engine says 45p, GOV.UK says 55p  ->  it must SCREAM.
//           This is the bug we actually had. A differ that misses it is decoration.
//
//   TEST 2  Our engine says 55p (the truth), and the page contains the string "45p" TWICE
//           ->  it must stay SILENT.
//           This is the harder half. GOV.UK's own page carries the old rate in a bracket
//           ("55p from 6 April 2026 (45p before 6 April 2026)") and again in a worked example
//           it forgot to update ("10,000 x 45p"). A naive differ greps "45p", decides we are
//           wrong, and cries wolf every night until somebody switches it off. Then we have no
//           alarm AND we think we have one. Two human audits have already made exactly this
//           mistake about exactly this number. The machine must not make it a third time.

import assert from 'node:assert/strict';
import { CHECKS, compareOne, runChecks, money, between } from './diff.mjs';
import { stripTags } from './watch.mjs';
import { triageStatus } from './distill.mjs';
import { checkSource, normalise } from './corpus.mjs';
import { withPassword, POOLER_ATTEMPTS, POOLER_CACHE_WAIT_MS } from './rotate.mjs';

// Collect, then run at the end, so an async test is actually AWAITED. A harness that fires a
// promise and prints "ok" before it settles is a test suite that passes when the code is broken,
// which is the same disease as everything else in this file: a green light that means nothing.
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const section = (s) => tests.push([s, null]);

// ---- fixtures ---------------------------------------------------------------
// Verbatim from https://www.gov.uk/expenses-and-benefits-business-travel-mileage/rules-for-tax
// on 12 July 2026. Note BOTH decoys: the bracket in the table cell, and the stale example.
const MILEAGE_PAGE = `
<h3>Tax: rates per business mile</h3>
<table>
  <thead><tr><th></th><th>First 10,000 miles</th><th>Above 10,000 miles</th></tr></thead>
  <tbody>
    <tr><td>Cars and vans</td><td>55p from 6 April 2026 (45p before 6 April 2026)</td><td>25p</td></tr>
    <tr><td>Motorcycles</td><td>24p</td><td>24p</td></tr>
    <tr><td>Bikes</td><td>20p</td><td>20p</td></tr>
  </tbody>
</table>
<p>The rates for electric bikes are the same as the bike rates.</p>
<p>Example: Your employee travels 12,000 business miles in their car. The approved amount for the
year would be £5,000 (10,000 x 45p plus 2,000 x 25p).</p>
`;

// Verbatim from https://www.gov.uk/self-employed-national-insurance-rates on 12 July 2026.
const NI_PAGE = `
<h2>If your profits are £7,105 or more a year</h2>
<p>Class 2 contributions are treated as having been paid to protect your National Insurance record.</p>
<p>If your profits are more than £12,570 a year, you must pay Class 4 contributions.</p>
<p>For tax year 2026 to 2027 you’ll pay:</p>
<ul>
  <li>6% on profits over £12,570 up to £50,270</li>
  <li>2% on profits over £50,270</li>
</ul>
<h2>If your profits are less than £7,105 a year</h2>
<p>The Class 2 rate for tax year 2026 to 2027 is £3.65 a week.</p>
`;

// Verbatim from https://www.gov.uk/what-you-must-do-as-a-cis-subcontractor on 12 July 2026.
//
// Both CIS extractors came back BROKEN on the first live run, because the first pass at them
// assumed the page said "20% if you're registered, 30% if you're not". It does not. It never uses
// the word "registered" for the 20% at all. That rate is the DEFAULT and being unregistered is the
// exception. The two sentences are only distinguishable by "a contractor" against "contractors",
// which is exactly the sort of thing you cannot guess from a schema and can only read off a page.
const CIS_PAGE = `
<p>Under CIS, a contractor must deduct 20% from your payments and pass it to HM Revenue and
Customs. This is called 'net payment status' (also known as 'payment under deduction').</p>
<p>These deductions count as advance payments towards your tax and National Insurance bill.</p>
<p>If you do not register for the scheme, contractors must deduct 30% from your payments instead.</p>
`;

// GOV.UK restructures the page and the table is gone. We must NOT report "all clear".
const MILEAGE_PAGE_RESTRUCTURED = `
<h3>Mileage rates</h3>
<p>Rates for business mileage are set out in the tables published in our annual rates bulletin.</p>
`;

const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const check = (fact) => CHECKS.find((c) => c.fact === fact);
const one = (fact, ours, page) => compareOne(check(fact), ours, strip(page));

// ---- THE TWO THAT MATTER ----------------------------------------------------

section('THE MILEAGE REGRESSION. This is the bug we actually shipped.');

test('TEST 1: engine says 45p, GOV.UK says 55p -> DRIFT (it screams)', () => {
  const r = one('mileageCarFirst10k', 0.45, MILEAGE_PAGE);
  assert.equal(r.status, 'drift', `expected drift, got "${r.status}"`);
  assert.equal(r.theirs, 0.55);
  assert.equal(r.ours, 0.45);
  assert.match(r.detail, /GOV\.UK says 0\.55.*[Oo]ur engine says 0\.45/);
});

test('TEST 2: engine says 55p, page contains "45p" twice -> AGREE (it does NOT cry wolf)', () => {
  const r = one('mileageCarFirst10k', 0.55, MILEAGE_PAGE);
  assert.equal(r.status, 'agree', `false alarm: the differ was fooled by a decoy "45p" (got "${r.status}")`);
  assert.equal(r.theirs, 0.55);
});

test('TEST 3: page restructured, number gone -> EXTRACTOR_BROKEN, never "agree"', () => {
  const r = one('mileageCarFirst10k', 0.55, MILEAGE_PAGE_RESTRUCTURED);
  assert.equal(r.status, 'extractor_broken', `silence is the bug: got "${r.status}"`);
  assert.notEqual(r.status, 'agree');
});

test('TEST 4: a fact the engine does not hold -> EXTRACTOR_BROKEN, never "agree"', () => {
  const r = compareOne(check('mileageCarFirst10k'), undefined, strip(MILEAGE_PAGE));
  assert.equal(r.status, 'extractor_broken');
});

// ---- every other extractor, against the real page text ----------------------

section('The rest of the mileage table.');

test('mileageCarOver10k reads 25p, not the 45p decoy next to it', () => {
  assert.equal(one('mileageCarOver10k', 0.25, MILEAGE_PAGE).status, 'agree');
  assert.equal(one('mileageCarOver10k', 0.45, MILEAGE_PAGE).theirs, 0.25);
});
test('mileageMotorcycle reads 24p', () => {
  assert.equal(one('mileageMotorcycle', 0.24, MILEAGE_PAGE).status, 'agree');
});
test('mileageBicycle reads 20p, and does not run on into the example', () => {
  assert.equal(one('mileageBicycle', 0.2, MILEAGE_PAGE).status, 'agree');
});

section('Self-employed National Insurance.');

test('class2WeeklyRate reads £3.65', () => {
  assert.equal(one('class2WeeklyRate', 3.65, NI_PAGE).status, 'agree');
});
test('class2SmallProfitsThreshold reads £7,105', () => {
  assert.equal(one('class2SmallProfitsThreshold', 7105, NI_PAGE).status, 'agree');
});
test('class4MainRate reads 6%', () => {
  assert.equal(one('class4MainRate', 0.06, NI_PAGE).status, 'agree');
});
test('class4LowerLimit reads £12,570', () => {
  assert.equal(one('class4LowerLimit', 12570, NI_PAGE).status, 'agree');
});
test('class4UpperLimit reads £50,270', () => {
  assert.equal(one('class4UpperLimit', 50270, NI_PAGE).status, 'agree');
});

// The backtracking trap. Without the (?![\d,]) anchor the regex matches "6% ... £12,57" and
// reads the UPPER rate as 6%, then raises a false incident against our own correct 2%, nightly.
test('class4UpperRate reads 2%, and is NOT fooled into reading 6%', () => {
  const r = one('class4UpperRate', 0.02, NI_PAGE);
  assert.equal(r.theirs, 0.02, `regex backtracked onto the main rate: read ${r.theirs}`);
  assert.equal(r.status, 'agree');
});
test('class4UpperRate on a wrong engine (6%) -> DRIFT', () => {
  assert.equal(one('class4UpperRate', 0.06, NI_PAGE).status, 'drift');
});

section('CIS. Our core trade, and the two the first live run came back BLIND on.');

test('cisRegisteredRate reads 20%, off "a contractor must deduct 20%"', () => {
  assert.equal(one('cisRegisteredRate', 0.2, CIS_PAGE).status, 'agree');
});
test('cisUnregisteredRate reads 30%, off "if you do not register ... deduct 30%"', () => {
  assert.equal(one('cisUnregisteredRate', 0.3, CIS_PAGE).status, 'agree');
});
// The two rates sit four lines apart on one page. A sloppy regex reads whichever comes first and
// is confidently wrong about a deduction taken from a subcontractor's pay on every invoice.
test('the registered rate cannot be fooled into reading the 30%', () => {
  assert.equal(one('cisRegisteredRate', 0.2, CIS_PAGE).theirs, 0.2);
});
test('the unregistered rate cannot be fooled into reading the 20%', () => {
  assert.equal(one('cisUnregisteredRate', 0.3, CIS_PAGE).theirs, 0.3);
});
test('a wrong CIS rate in our engine -> DRIFT', () => {
  assert.equal(one('cisRegisteredRate', 0.3, CIS_PAGE).status, 'drift');
  assert.equal(one('cisUnregisteredRate', 0.2, CIS_PAGE).status, 'drift');
});

// ---- AIA: the check that was green for the wrong reason ---------------------

section('Annual Investment Allowance. This check passed for six days without reading the page.');

// The REAL stripped text, taken off the mini on 13 July. Note what is NOT in it: the words "annual
// investment allowance" nowhere near the figure. GOV.UK puts the expansion in an <abbr title="">
// ATTRIBUTE, and attributes die with the tag.
//
// The old extractor searched for that phrase and a £ within 120 characters, and reported ok every
// night. It was matching inside the JSON-LD <script> block, which stripTags used to keep. Fixing
// stripTags turned a silent pass into a loud failure, which is the ONLY reason we found out.
//
// A pass for the wrong reason is a lie that gets quieter over time.
const AIA_PAGE = `
<p>Claim <a href="/x">writing down allowances</a> instead.</p>
<h2>The AIA amount</h2>
<p>The AIA amount is £1 million.</p>
<h2>Changes to the AIA</h2>
<p>The AIA amount has changed several times since April 2008.</p>
<table>
  <tbody>
    <tr><td>£1 million</td><td>From 1 January 2019</td></tr>
    <tr><td>£200,000</td><td>1 January 2016 - 31 December 2018</td></tr>
    <tr><td>£500,000</td><td>6 April 2014 - 31 December 2015</td></tr>
    <tr><td>£25,000</td><td>6 April 2012 - 31 December 2012</td></tr>
  </tbody>
</table>
<p>If your accounting period is 9 months, the AIA will be 9/12 x £1,000,000 = £750,000.</p>
`;

test('AIA reads £1 million off "The AIA amount is £1 million."', () => {
  const r = one('annualInvestmentAllowance', 1000000, AIA_PAGE);
  assert.equal(r.theirs, 1000000);
  assert.equal(r.status, 'agree');
});
test('...and is NOT fooled by the historical table (£200,000, £500,000, £25,000)', () => {
  assert.equal(one('annualInvestmentAllowance', 1000000, AIA_PAGE).theirs, 1000000);
});
test('...and is NOT fooled by the worked example (9/12 x £1,000,000 = £750,000)', () => {
  const r = one('annualInvestmentAllowance', 1000000, AIA_PAGE);
  assert.notEqual(r.theirs, 750000, 'it read a worked example instead of the law');
});
test('a wrong AIA in our engine -> DRIFT', () => {
  assert.equal(one('annualInvestmentAllowance', 200000, AIA_PAGE).status, 'drift');
});
// THE REGRESSION THAT MATTERS: no script block, so no metadata to hide in. If someone reintroduces
// a phrase-based extractor, it fails here rather than passing for six days on GOV.UK's JSON-LD.
test('THE SILENT PASS: the phrase "annual investment allowance" is NOT next to the figure', () => {
  const stripped = strip(AIA_PAGE);
  assert.doesNotMatch(stripped, /annual investment allowance[^£]{0,120}£/i,
    'if this ever matches, an extractor could pass without reading the sentence that states the amount');
});

// ---- MTD: who is LEGALLY REQUIRED to use us ---------------------------------

section('Making Tax Digital. The numbers that decide who is legally required to use us.');

// Verbatim from /guidance/use-making-tax-digital-for-income-tax/before-you-use-this-guide, 13 July.
//
// TWO THINGS ABOUT THIS PAGE, AND BOTH ARE THE POINT.
//
// 1. sources.json has been watching /guidance/USING-making-tax-digital... which GOV.UK REDIRECTS to
//    /USE-making-tax-digital..., and which is a TABLE OF CONTENTS. It has never held these numbers.
//    A watcher checking a page every night that does not contain the figure. The mileage story,
//    exactly, with a different number.
//
// 2. THE DECOY: the prose above the table says "over £50,000 ... from April 2026". A regex that
//    grabs the first £50,000 on the page reads a sentence instead of the schedule, and would keep
//    "working" if HMRC updated the table and forgot the sentence, which is precisely what they did
//    to the mileage worked example. So anchor on the START DATE, which is what makes a row unique.
const MTD_PAGE = `
<p>If your 2024 to 2025 tax return showed your qualifying income was over £50,000, you need to use
Making Tax Digital for Income Tax from April 2026.</p>
<table>
  <thead><tr><th>Self Assessment tax return</th><th>Qualifying income</th><th>Start date</th></tr></thead>
  <tbody>
    <tr><td>2024 to 2025 tax year</td><td>more than £50,000</td><td>6 April 2026</td></tr>
    <tr><td>2025 to 2026 tax year</td><td>more than £30,000</td><td>6 April 2027</td></tr>
    <tr><td>2026 to 2027 tax year</td><td>more than £20,000</td><td>6 April 2028</td></tr>
  </tbody>
</table>
`;

test('mtdThreshold2026 reads £50,000 off the SCHEDULE, not the sentence above it', () => {
  const r = one('mtdThreshold2026', 50000, MTD_PAGE);
  assert.equal(r.theirs, 50000);
  assert.equal(r.status, 'agree');
});
test('mtdThreshold2027 reads £30,000', () => {
  assert.equal(one('mtdThreshold2027', 30000, MTD_PAGE).status, 'agree');
});
test('mtdThreshold2028 reads £20,000, and does not stop at the first row', () => {
  const r = one('mtdThreshold2028', 20000, MTD_PAGE);
  assert.equal(r.theirs, 20000, `read ${r.theirs}: it took the wrong row`);
});
test('a wrong MTD threshold in our engine -> DRIFT. We would be telling a man he is exempt.', () => {
  assert.equal(one('mtdThreshold2027', 50000, MTD_PAGE).status, 'drift');
});
// If HMRC changes the phasing (and this is a policy that has been delayed twice already), the row
// disappears and we must go BLIND, never quietly agree with a number nobody is publishing.
test('HMRC drops the 2028 stage -> BROKEN, never a silent pass', () => {
  const withoutRow = MTD_PAGE.replace(/<tr><td>2026 to 2027[\s\S]*?<\/tr>/, '');
  assert.equal(one('mtdThreshold2028', 20000, withoutRow).status, 'extractor_broken');
});

// ---- student loans: the worst decoy field on GOV.UK ------------------------

section('Student loans. Three money columns and eleven worked examples, all trying to fool us.');

// Verbatim from https://www.gov.uk/repaying-your-student-loan/what-you-pay on 12 July 2026.
// Note what is here to trip an extractor: the table has YEARLY, MONTHLY and WEEKLY columns, and
// the examples below it are full of pound signs that look exactly like thresholds. "£2,241" is a
// monthly threshold. "£33,000" is a made-up salary. Land on either and we raise a false incident
// against a correct engine, nightly, until somebody mutes the alarm.
const STUDENT_PAGE = `
<table>
  <thead><tr><th>Plan type</th><th>Yearly income threshold</th><th>Monthly income threshold</th><th>Weekly income threshold</th></tr></thead>
  <tbody>
    <tr><td>Plan 1</td><td>£26,900</td><td>£2,241</td><td>£517</td></tr>
    <tr><td>Plan 2</td><td>£29,385</td><td>£2,448</td><td>£565</td></tr>
    <tr><td>Plan 4</td><td>£33,795</td><td>£2,816</td><td>£649</td></tr>
    <tr><td>Plan 5</td><td>£25,000</td><td>£2,083</td><td>£480</td></tr>
    <tr><td>Postgraduate Loan</td><td>£21,000</td><td>£1,750</td><td>£403</td></tr>
  </tbody>
</table>
<p>You&rsquo;ll repay either:</p>
<ul>
  <li>9% of your income over the threshold if you&rsquo;re on Plan 1, 2, 4 or 5</li>
  <li>6% of your income over the threshold if you&rsquo;re on a Postgraduate Loan plan</li>
</ul>
<p>Example: You&rsquo;re on Plan 1 and have an income of £33,000 a year, meaning you get paid £2,750
each month. £2,750 &ndash; £2,241 (your income minus the Plan 1 threshold) = £509. 9% of £509 = £45.81.</p>
<p>Example: You&rsquo;re on Plan 4 and have an income of £36,000 a year. £3,000 &ndash; £2,816 = £184.</p>
<p>Interest: 3.2% if you&rsquo;re on Plan 1. 6.2% if you&rsquo;re on a Postgraduate Loan plan.</p>
`;

test('Plan 1 reads the YEARLY £26,900, not the monthly £2,241 next to it', () => {
  const r = one('studentPlan1Threshold', 26900, STUDENT_PAGE);
  assert.equal(r.theirs, 26900, `read ${r.theirs}: it took the wrong column`);
  assert.equal(r.status, 'agree');
});
test('Plan 2 reads £29,385', () => {
  assert.equal(one('studentPlan2Threshold', 29385, STUDENT_PAGE).status, 'agree');
});
test('Plan 4 reads £33,795, not the £36,000 salary from the example below', () => {
  const r = one('studentPlan4Threshold', 33795, STUDENT_PAGE);
  assert.equal(r.theirs, 33795, `read ${r.theirs}: it wandered into a worked example`);
});
test('Plan 5 reads £25,000', () => {
  assert.equal(one('studentPlan5Threshold', 25000, STUDENT_PAGE).status, 'agree');
});
test('Postgraduate reads £21,000', () => {
  assert.equal(one('studentPostgradThreshold', 21000, STUDENT_PAGE).status, 'agree');
});
test('the repayment rate is 9%, not the 3.2% interest rate further down', () => {
  const r = one('studentPlanRate', 0.09, STUDENT_PAGE);
  assert.equal(r.theirs, 0.09, `read ${r.theirs}: it grabbed an interest rate`);
});
test('the postgraduate rate is 6%, not the 6.2% postgraduate INTEREST rate', () => {
  const r = one('studentPostgradRate', 0.06, STUDENT_PAGE);
  assert.equal(r.theirs, 0.06, `read ${r.theirs}: it grabbed the postgraduate interest rate`);
});
test('a wrong student loan threshold in our engine -> DRIFT', () => {
  assert.equal(one('studentPlan1Threshold', 25000, STUDENT_PAGE).status, 'drift');
});

// ---- triage: Khoji bins its own rubbish, but there is a trap in doing so ----

section('Triage. Khoji bins its own rubbish, and must NEVER bin a rates page.');

// A news item the model itself says affects nobody, at 0.13 confidence. Real example from the
// queue on 12 July: "Teenager turning 16? Don't miss out on Child Benefit". Nobody needs to look
// at that. Handing it to a human as a decision is not caution, it is noise wearing a uniform.
const newsItem = (u) => ({ source_url: `https://www.gov.uk/${u}` });        // feed items have no #
const pageItem = (u) => ({ source_url: `https://www.gov.uk/${u}#a1b2c3d4` }); // watched pages do

test('a news item the model says affects nobody, at 0.13, is BINNED', () => {
  assert.equal(triageStatus(newsItem('child-benefit-16'), { affects: 'not relevant', confidence: 0.13 }), 'dismissed');
});
test('a news item that DOES affect our users is kept, however unsure the model is', () => {
  assert.equal(triageStatus(newsItem('cis-change'), { affects: 'CIS subcontractors', confidence: 0.2 }), 'distilled');
});
test('a news item the model says affects nobody but is CONFIDENT about is kept', () => {
  assert.equal(triageStatus(newsItem('x'), { affects: 'not relevant', confidence: 0.8 }), 'distilled');
});

// ⚠️ THE ONE THAT MATTERS. The mileage row was a watched PAGE at 0.15 confidence, marked
// "not relevant" because the page is written for employers. A confidence cull would have silently
// deleted the single most important item this database has ever held. It must survive.
test('THE MILEAGE ROW: a watched rates page at 0.15, marked "not relevant", is NEVER binned', () => {
  const mileage = pageItem('expenses-and-benefits-business-travel-mileage/rules-for-tax');
  const asKhojiSawIt = { affects: 'not relevant, this is for employers', confidence: 0.15, engine_impact: false };
  assert.equal(triageStatus(mileage, asKhojiSawIt), 'distilled',
    'a confidence-based cull just deleted the row that carried the bug we shipped');
});
test('no watched page is binned at ANY confidence, not even zero', () => {
  for (const c of [0, 0.01, 0.1, 0.29]) {
    assert.equal(triageStatus(pageItem('vat-registration/when-to-register'), { affects: 'nobody', confidence: c }),
      'distilled', `a rates page was binned at confidence ${c}`);
  }
});
test('an item that was never distilled stays in the backlog, it is not binned', () => {
  assert.equal(triageStatus(newsItem('x'), null), 'needs_distillation');
});

// ⚠️ THE THIRD TIME THE MODEL'S CONFIDENCE TRIED TO DELETE THE MOST VALUABLE THING IN THE PILE.
//
// The first version of the bin rule had only the rates-page guard. Run against the real vault, it
// was about to throw away employment-income-manual.md, cotax-manual.md and cwg2-further-guide-to-
// paye-and-national-insurance-contributions.md. HMRC's INTERNAL MANUALS. The Phase 3 depth corpus.
// The moat in doc 104. The distiller had scored them "not relevant" at under 0.3.
//
// Mileage: 0.15, "not relevant", held the number we had wrong.
// Student loans: 0.05, "not relevant", nothing was checking it.
// The manuals: under 0.3, "not relevant", the only thing here a competitor cannot buy.
//
// The model's confidence is not unreliable. It is ANTI-CORRELATED with what matters to us.
const manual = (u, t) => ({ source_url: `https://www.gov.uk/hmrc-internal-manuals/${u}`, title: t });
const dismissive = { affects: 'not relevant', confidence: 0.1 };

test('THE MOAT: an HMRC internal manual is NEVER binned, whatever the model thinks of it', () => {
  assert.equal(triageStatus(manual('employment-income-manual', 'Employment Income Manual'), dismissive),
    'distilled', 'the bin rule just deleted the depth corpus');
});
test('...caught by the URL, even if the title says nothing', () => {
  assert.equal(triageStatus(manual('cotax-manual', 'COTAX'), dismissive), 'distilled');
});
test('...and caught by the title, even if it arrived from a news feed', () => {
  assert.equal(triageStatus({ source_url: 'https://www.gov.uk/x', title: 'Self Assessment Manual' }, dismissive),
    'distilled');
});
test('but ordinary news with "manually" in it is not mistaken for a manual', () => {
  assert.equal(triageStatus({ source_url: 'https://www.gov.uk/y', title: 'File your return manually' }, dismissive),
    'dismissed');
});

// ---- the corpus: the differ, applied to prose ------------------------------

section('The corpus. Is the HMRC sentence our rule rests on still on the page?');

// Verbatim from BIM37910, 13 July 2026. The clothing rule is Mallalieu v Drummond, House of Lords.
const BIM37910 = `You should disallow expenditure on ordinary clothing worn by a trader during the
course of their trade. This remains so even where particular standards of dress are required.
You should therefore allow a deduction for protective clothing and uniforms.`;

const src = (quote, url = 'https://www.gov.uk/hmrc-internal-manuals/business-income-manual/bim37910') =>
  ({ code: 'BIM37910', url, quote });

test('the sentence is on the page -> cited', () => {
  const r = checkSource(src('You should disallow expenditure on ordinary clothing worn by a trader'), BIM37910);
  assert.equal(r.status, 'cited');
});

// THE ONE THAT MATTERS. HMRC rewrites these manuals constantly (BIM37910 was updated in March).
// The day our sentence goes, the rule we tell a man to put on his tax return has lost its footing.
test('LOST AUTHORITY: HMRC rewrites the page and our sentence is gone -> quote_missing', () => {
  const rewritten = 'From April 2027 the treatment of ordinary clothing is under review.';
  const r = checkSource(src('You should disallow expenditure on ordinary clothing worn by a trader'), rewritten);
  assert.equal(r.status, 'quote_missing');
  assert.match(r.detail, /NOT on the page/);
});

// THE TRAP FOR THE AUTHOR. A plausible "BIM45012" with a quote nobody read is a wrong answer
// wearing HMRC's uniform, and a man believes it BECAUSE it looks like law. It must fail loudly.
test('AN INVENTED CITATION fails loudly instead of shipping as false authority', () => {
  const r = checkSource(src('HMRC allows a full deduction for everyday clothing worn at work'), BIM37910);
  assert.equal(r.status, 'quote_missing');
});

test('curly apostrophes, entities and odd whitespace do not break a real match', () => {
  const page = 'You’ll need to find&nbsp;a  reasonable   method of dividing your costs.';
  const r = checkSource(src("You'll need to find a reasonable method of dividing your costs"), page);
  assert.equal(r.status, 'cited', 'a typesetting change is not a change in the law');
});

test('a non gov.uk URL is never an authority', () => {
  const r = checkSource(src('You should disallow expenditure on ordinary clothing worn by a trader',
    'https://someaccountant.example.com/blog'), BIM37910);
  assert.equal(r.status, 'quote_missing');
  assert.match(r.detail, /not gov\.uk/);
});

// A fragment can survive a rewrite that REVERSES the meaning. "allow a deduction" is still present
// in "we no longer allow a deduction". So a short quote is refused outright.
test('a fragment is refused as an anchor, because it survives a reversal', () => {
  const r = checkSource(src('allow a deduction'), BIM37910);
  assert.equal(r.status, 'quote_missing');
  assert.match(r.detail, /too short/);
});

test('normalise is not so loose that it stops being a quotation check', () => {
  assert.notEqual(normalise('you should allow a deduction'), normalise('you should not allow a deduction'));
});

// THE SPACE HTML STRIPPING INVENTS. A PERMANENT FALSE ALARM, AND IT WAS LIVE.
//
// stripTags turns every tag into a space, so `<a>simplified expenses</a>.` arrives as
// "simplified expenses ." Our `car` quote was word-for-word correct off the page and failed on the
// first live run because of that one space. It would have failed EVERY night, forever.
//
// And it gets more likely the more carefully you cite, because HMRC links exactly the phrases that
// carry the meaning: "capital allowances", "simplified expenses", "cash basis accounting". A
// citation ending on any of them was doomed. That is a false alarm that never goes away, which is
// the one thing worse than no alarm: you mute it, and then you have no alarm and think you have one.
test('THE CAR BUG: a link before a full stop leaves "expenses ." and must still match', () => {
  const asStripped = 'buy a car for your business, claim the cost as a capital allowance as long as you’re not using simplified expenses . For all other types of vehicle';
  const r = checkSource(src('claim the cost as a capital allowance as long as you’re not using simplified expenses.',
    'https://www.gov.uk/expenses-if-youre-self-employed/travel'), asStripped);
  assert.equal(r.status, 'cited', 'a space in front of a full stop is typesetting, not a change in the law');
});
test('...and the same for commas, semicolons and brackets, which links also sit before', () => {
  const stripped = 'you can claim capital allowances , and simplified expenses ; or the flat rate ) instead';
  assert.equal(normalise(stripped), 'you can claim capital allowances, and simplified expenses; or the flat rate) instead');
});

section('stripTags. What a page actually says, and not what its scripts say.');

// THE JSON-LD LEAK. Live since 7 July, found only by reading what we had actually stored.
//
// stripTags removed the TAGS and kept what was inside them, so the <script type="application/ld+json">
// block on every GOV.UK page went straight into the text. It surfaced in the knowledge Rakha reads as
//     ...business-income-manual/bim37900" } } ] } Back to contents...
//
// The second consequence is the one that matters: pageItem() HASHES this text to decide whether a
// page has changed. The change detector has been watching GOV.UK's structured data and analytics
// metadata as if it were the law. A page could "change" because a schema.org field moved while the
// rates table sat there untouched. Listening carefully, on the wrong frequency.
test('a <script type="application/ld+json"> block is removed ENTIRELY, content and all', () => {
  const html = `<h1>BIM37910</h1>
    <script type="application/ld+json">{"@context":"https://schema.org","name":"bim37900"}</script>
    <p>You should disallow expenditure on ordinary clothing.</p>`;
  const out = stripTags(html);
  assert.doesNotMatch(out, /schema\.org|@context|\{|\}/, 'JSON-LD leaked into the page text');
  assert.match(out, /You should disallow expenditure on ordinary clothing\./);
});
test('<style> and <noscript> go too', () => {
  const out = stripTags('<style>.a{color:red}</style><noscript>Enable JS</noscript><p>The law.</p>');
  assert.equal(out, 'The law.');
});

section('Password rotation. The connection string must survive it.');

// Rotating this by hand took FIVE attempts, and every failure was a human carrying a credential
// between a terminal, a clipboard, a SQL editor and a file. The worst of them: `openssl rand
// -base64 24` produces / + and =, which are STRUCTURAL CHARACTERS IN A URL. A slash in a password
// ends the host portion of a connection string, and the failure looks like a wrong password.
//
// rotate.mjs mints hex only, and never lets a human touch it. These tests pin the string surgery.
test('the password is swapped without touching the user, host, port or database', () => {
  const before = 'postgresql://khoji_writer.abc123:OLDPASSWORD@aws-1-eu-west-2.pooler.supabase.com:5432/postgres';
  const after = withPassword(before, 'deadbeef00112233');
  assert.equal(after,
    'postgresql://khoji_writer.abc123:deadbeef00112233@aws-1-eu-west-2.pooler.supabase.com:5432/postgres');
});
test('a password containing @ in the OLD string does not fool the swap', () => {
  const before = 'postgresql://khoji_writer.abc123:pa55@word@host.supabase.com:5432/postgres';
  // The regex is non-greedy on the user and stops at the FIRST @, which is the shape Postgres
  // itself requires: an unencoded @ in a password is already an invalid connection string.
  assert.match(withPassword(before, 'newhex'), /^postgresql:\/\/khoji_writer\.abc123:newhex@/);
});
test('the pooler cache is waited out, not treated as a failure', () => {
  // THE FACT THAT COST AN AFTERNOON: Supabase's pooler caches the password verifier. For a couple
  // of minutes after a change it returns 28P01, which is indistinguishable from a wrong password.
  // Four manual retries inside that window looked like four failures and were not.
  assert.ok(POOLER_ATTEMPTS * POOLER_CACHE_WAIT_MS >= 120_000,
    'rotate.mjs must be patient for at least two minutes, or it will diagnose the cache as a failure');
});

// ---- parsers ----------------------------------------------------------------

section('Parsers.');

test('money reads GOV.UK prose, including "£1 million" for the AIA', () => {
  assert.equal(money('1,000'), 1000);
  assert.equal(money('90,000'), 90000);
  assert.equal(money('1 million'), 1_000_000);
  assert.equal(money('3.65'), 3.65);
});
test('between pins to a row and stops at the next one', () => {
  const t = strip(MILEAGE_PAGE);
  const row = between(t, /Cars and vans/i, /Motorcycles/i);
  assert.match(row, /55p/);
  assert.doesNotMatch(row, /24p/, 'the extractor bled into the motorcycle row');
});

// ---- a whole run, offline ---------------------------------------------------

section('A whole run, with a fetcher that never touches the network.');

test('runChecks: a wrong mileage constant surfaces as exactly one drift', async () => {
  const facts = { mileageCarFirst10k: 0.45, mileageCarOver10k: 0.25, mileageMotorcycle: 0.24, mileageBicycle: 0.2 };
  const results = await runChecks(facts, async (url) =>
    url.includes('mileage') ? MILEAGE_PAGE : '<p>nothing here</p>');
  const drift = results.filter((r) => r.status === 'drift');
  assert.equal(drift.length, 1, `expected exactly 1 drift, got ${drift.length}`);
  assert.equal(drift[0].fact, 'mileageCarFirst10k');
});

test('runChecks: a page that will not fetch is BROKEN, not agreed', async () => {
  const results = await runChecks({ mileageCarFirst10k: 0.55 }, async () => { throw new Error('ETIMEDOUT'); });
  assert.ok(results.every((r) => r.status !== 'agree'), 'a dead network reported agreement');
  assert.ok(results.some((r) => /could not fetch/.test(r.detail || '')));
});

// ---- run ---------------------------------------------------------------------

let pass = 0;
for (const [name, fn] of tests) {
  if (!fn) { console.log(`\n${name}\n`); continue; }
  try {
    await fn();
    console.log(`  ok    ${name}`);
    pass++;
  } catch (err) {
    console.error(`  FAIL  ${name}\n        ${err.message}`);
    process.exitCode = 1;
  }
}

// House format, so test/run-all.mjs can count these assertions with everything else. The differ
// is in CI now: a regression in an extractor fails the build instead of quietly reading the wrong
// number off a page for six months.
const fail = tests.filter((t) => t[1]).length - pass;
console.log(`\n${pass} passed, ${fail} failed.\n`);
if (!process.exitCode) {
  console.log('The differ catches the bug we actually had, and is not fooled by the decoy that');
  console.log('caught two human audits. Phase 3 and the dashboard are unblocked.\n');
}

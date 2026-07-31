// THE TAX SURFACE. The hub, the quarterly picture, what if, ways to save, can I claim, and the
// three tools screens behind the hub's Tools row.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// These are the screens where "£12.99 saves you £2,000" becomes visible, which makes them exactly
// the screens where a quiet failure costs the most. The suite is written against the failures
// that would ship silently:
//
//   1. A SECOND TAX ENGINE. Every figure must come from taxPosition, ledgerFor, computePosition,
//      buildQuarterPack, findOptimisations or niPosition. A page that sums, projects or retypes a
//      threshold is a second reader over the one number a man checks against his bank.
//
//   2. A SUMMED HEADLINE OF MAYBES. The reveal's rule: reliefs that hang on facts we do not hold
//      are never added up. ways-to-save must not call totalEstimatedSaving or total anything.
//
//   3. A FILING CLAIM. We prepare, he approves, and the filing switch waits on HMRC. The summary
//      page must say it cannot send anything yet, and no tax screen may imply otherwise.
//
//   4. A DISCRETE QUARTER WEARING A CUMULATIVE NAME. An MTD update restates the year from
//      6 April. The summary must render pack.submission, and the due date helper is pinned to
//      lib/taxengine.ts's own graded concept so the calendar cannot drift.
//
// Source assertions plus logic tests, in the style of test/moneyweb.test.mjs.
// Run: node test/taxweb.test.mjs
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

// Comments stripped before asking what the CODE does or what a CUSTOMER reads. Every one of these
// files explains at length why the thing it does not do would be wrong, and a check that cannot
// tell the argument from the sentence gets deleted, not fixed.
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const flat = (s) => s.replace(/\s+/g, ' ');

const PAGES = {
  hub: 'app/app/tax/page.tsx',
  summary: 'app/app/tax/summary/page.tsx',
  whatif: 'app/app/tax/what-if/page.tsx',
  ways: 'app/app/tax/ways-to-save/page.tsx',
  claim: 'app/app/tax/can-i-claim/page.tsx',
  ni: 'app/app/tax/ni/page.tsx',
  loan: 'app/app/tax/student-loan/page.tsx',
  cis: 'app/app/tax/cis/page.tsx',
};
const src = Object.fromEntries(Object.entries(PAGES).map(([k, p]) => [k, read(p)]));
const nav = read('app/app/AppNav.tsx');

console.log('\ntax on the web: the hub, the quarter, the levers, and the tools');

// ---------------------------------------------------------------------------------------------
// 1. EVERY SCREEN IS BEHIND THE SESSION AND SHIPS NO SCRIPT.
// ---------------------------------------------------------------------------------------------
for (const [k, s] of Object.entries(src)) {
  ok(`${k}: resolves the user from the session and sends a stranger to the door`,
    s.includes('userFromSessionCookie') && /redirect\('\/in'\)/.test(s));
  ok(`${k}: server rendered, no client script`,
    !/'use client'|onClick|onChange|useState|<script/.test(s));
  ok(`${k}: wears the shared shell (APP_CSS and the nav)`,
    s.includes('APP_CSS') && s.includes('<AppNav current='));
  ok(`${k}: forced dynamic, his figures are never cached into someone else's page`,
    s.includes("dynamic = 'force-dynamic'"));
}

// 🔴 NO SCREEN BUILDS A POUND ITSELF. The same defect shape test/webauth.test.mjs hunts: a pound
// sign constructed next to a number is the eighteenth money formatter arriving.
const buildsAPound = /`£\$\{|['"]£['"]\s*\+|\+\s*['"]£['"]/;
for (const [k, s] of Object.entries(src)) {
  ok(`${k}: never builds a pound, lib/money.ts writes them`, !buildsAPound.test(codeOnly(s)));
}

// 🔴 AND THE DEEP PAGES' '../../lib/money' REALLY IS lib/money. The screens four levels down
// import app/app/lib/money.ts so the tenancy suite's exact-path check still bites. That is only
// honest while the shim adds nothing: the day a formatter is written there, it is the eighteenth.
const shim = read('app/app/lib/money.ts');
ok('🔴 the money shim is a pure re-export of lib/money and nothing else',
  /export \{[^}]*\} from '\.\.\/\.\.\/\.\.\/lib\/money'/.test(shim)
  && !/=>|function|toLocaleString|£/.test(codeOnly(shim)));

// 🔴 NO ID IN ANY URL, on the surface where the URLs are new. Nothing here may write a row or
// user id into an href, and the only query read anywhere is the what-if delta.
for (const [k, s] of Object.entries(src)) {
  ok(`${k}: writes no id into any URL`, !/href=\{`[^`]*\$\{[^}]*\bid\b/.test(codeOnly(s)));
}
ok('what-if reads only the delta off the query string',
  /one\('extra'\)/.test(src.whatif) && !/one\('(user|id|account|owner)/.test(src.whatif));
ok('no other tax screen reads the query string at all',
  Object.entries(src).filter(([k]) => k !== 'whatif').every(([, s]) => !s.includes('searchParams')));

// ---------------------------------------------------------------------------------------------
// 2. ONE ENGINE. Every figure is asked for, never re-derived.
// ---------------------------------------------------------------------------------------------
ok('🔴 THE HUB READS taxPosition, THE SAME CALL THE OVERVIEW MAKES',
  src.hub.includes('taxPosition(optimiser)') && src.hub.includes('getOptimiserInput'));
ok('the hub explains the number with the sentence lib/taxoptimiser.ts writes',
  src.hub.includes('setAsideBasisLine'));
ok('🔴 JANUARY\'S DATES COME FROM THE ENGINE, NOT A STRING IN A PAGE',
  src.hub.includes('paymentsOnAccount(') && /poa\.firstDue/.test(src.hub));
ok('payments on account run on the bill WITHOUT the student loan, as HMRC does',
  /paymentsOnAccount\(tax\.selfAssessmentTax/.test(src.hub));
ok('the hub\'s MTD line is the quarter pack\'s own answer',
  src.hub.includes('buildQuarterPack') && /pack\.ytd\.mtdApplies/.test(src.hub));

// The pages never do their own arithmetic over his money. A reduce or a running += on a tax
// screen is a second engine being born.
for (const k of ['hub', 'summary', 'ways', 'cis', 'loan', 'ni']) {
  const c = codeOnly(src[k]);
  ok(`${k}: sums nothing itself`, !/\breduce\(/.test(c) && !/\w\s*\+=\s*/.test(c));
}

ok('🔴 THE SUMMARY RENDERS pack.submission, THE CUMULATIVE BLOCK HMRC ACTUALLY RECEIVES',
  /pack\.submission/.test(src.summary) && /sub\.trade\.(income|expenses|net)/.test(src.summary));
ok('and says out loud that an update restates the whole year',
  /restates the whole year/.test(flat(src.summary)));
ok('the quarter on its own is labelled as context, not as the update',
  /It is not what an update reports/.test(flat(src.summary)));
ok('a capped fetch is flagged, never handed over as complete',
  /truncated/.test(src.summary) && /not all of them could be counted/.test(flat(src.summary)));

ok('🔴 WHAT-IF ROUTES THROUGH computePosition BY HIS ACTUAL STRUCTURE',
  src.whatif.includes('computePosition') && src.whatif.includes('getBusinessProfile'));
ok('the delta is bounded and unreadable input asks no question',
  /1_000_000/.test(src.whatif) && /Number\.isFinite/.test(src.whatif));
ok('🔴 THE FORM IS A GET: a pure question, no state, no new API route',
  /action="\/app\/tax\/what-if" method="get"/.test(src.whatif) && !/method="post"/.test(src.whatif));
ok('the base is confirmed figures and the copy says so',
  /confirmed profit since 6 April/i.test(flat(src.whatif)) && /nothing projected/i.test(flat(src.whatif)));
ok('the input has a name a screen reader can say',
  /htmlFor="extra"/.test(src.whatif) && /id="extra"/.test(src.whatif));
ok('the student loan moves with the bill, through the one engine function',
  src.whatif.includes('studentLoanForSA'));

ok('🔴 WAYS TO SAVE RENDERS findOptimisations AND NOTHING OF ITS OWN',
  src.ways.includes('findOptimisations'));
ok('🔴 AND NEVER SUMS THE SAVINGS INTO A HEADLINE (the reveal\'s rule)',
  !src.ways.includes('totalEstimatedSaving') && /no total at the top/i.test(flat(src.ways)));
ok('an estimate is only worn where the engine made one',
  /o\.estSaving > 0/.test(src.ways));

ok('🔴 CAN-I-CLAIM DRAWS THE ONE CORPUS, BYTE IDENTICAL WITH THE PHONE',
  src.claim.includes('EXPENSE_RULES') && src.claim.includes("from '../../../../lib/claimrules.data'"));
ok('every card can carry its HMRC source, from lib/rulesources.ts',
  src.claim.includes('RULE_SOURCES'));
ok('the verdict words come from the corpus, not the page',
  src.claim.includes('VERDICT_LABEL') && !/const VERDICT_LABEL\s*=/.test(src.claim));
ok('no rule is typed into the page itself', !/aliases:/.test(codeOnly(src.claim)));

ok('🔴 NI COMES FROM niPosition, THE SAME ENGINE AS THE PUBLIC CHECKER',
  src.ni.includes('niPosition('));
ok('every NI threshold is printed by name, never retyped',
  /FACTS\.class4LowerLimit/.test(src.ni) && /FACTS\.class4UpperLimit/.test(src.ni)
  && /FACTS\.class2SmallProfitsThreshold/.test(src.ni) && /NI_FACTS\.class1LowerEarningsLimit/.test(src.ni));
ok('rates are written by asPercent, so no screen ever prints 6.000000000000001',
  src.ni.includes('asPercent('));

ok('🔴 THE JANUARY LOAN FIGURE IS taxPosition\'s OWN, the one already inside the set aside',
  /tax\.studentLoan/.test(src.loan) && src.loan.includes('taxPosition'));
ok('the plan facts come from STUDENT_PLANS, the engine\'s own table',
  src.loan.includes('STUDENT_PLANS'));
ok('a man with no plan is told what is NOT counted, and no invented figure',
  /nothing is counted for one/i.test(flat(src.loan)));

ok('🔴 CIS SHOWS THE LEDGER\'S refundDue, THE EXACT FIGURE THE OVERVIEW SHOWS',
  src.cis.includes('ledgerFor') && /l\.refundDue/.test(src.cis));
ok('the refund position is the optimiser\'s own sentence, never re-derived',
  /cis_refund/.test(src.cis) && /refundBuilding\.detail/.test(src.cis));
ok('CIS rates are printed from FACTS through asPercent',
  /FACTS\.cisRegisteredRate/.test(src.cis) && /FACTS\.cisUnregisteredRate/.test(src.cis));

// 🔴 AND NO PAGE CARRIES THE TAX LAW AS A LITERAL. test/onlyoneengine.test.mjs holds the whole
// tree to this; asserted here too so a failure lands next to the page that caused it.
for (const [k, s] of Object.entries(src)) {
  ok(`${k}: carries no tax constant of its own`,
    !/(?<![\d.])(12570|50270|37700|125140)(?![\d.])/.test(codeOnly(s)));
}

// ---------------------------------------------------------------------------------------------
// 3. THE WORDS. We prepare, he approves, and nothing claims a filing we cannot do.
// ---------------------------------------------------------------------------------------------
for (const [k, s] of Object.entries(src)) {
  const t = flat(codeOnly(s));
  ok(`${k}: never claims HMRC approval or endorsement`,
    !/HMRC[\s-]*(approved|accredited|certified|endorsed|recognised)/i.test(t));
  // ⚠️ THE CLAIM, NOT THE WORD. The first draft matched any "we do", and the NI page's honest
  // "your full contribution record, which we do not hold" failed the build. test/mtdclaims.test.mjs
  // learned the same lesson on our own disclaimer: a guard that fires on honesty gets switched off.
  ok(`${k}: never claims we file or submit for him`,
    !/\bwe\s+(will\s+)?file\b/i.test(t) && !/\bwe\s+(will\s+)?submit\b/i.test(t)
    && !/\bwe\s+(will\s+)?do\s+your\s+tax\b/i.test(t) && !/\bfiled?\s+automatically\b/i.test(t));
  ok(`${k}: never claims he can file now`, !/\byou can file (now|today)\b/i.test(t));
  ok(`${k}: no em or en dash anywhere in the file`, !/[—–]/.test(s));
  ok(`${k}: never mentions the messaging surface it cannot promise`, !/WhatsApp/.test(codeOnly(s)));
}
ok('🔴 THE SUMMARY SAYS PLAINLY THAT NOTHING CAN BE SENT YET',
  /cannot send an update to HMRC yet/.test(flat(src.summary))
  && /Nothing on this page has been sent anywhere/.test(flat(src.summary)));
ok('and that approval comes before anything ever goes',
  /approve them before anything goes/.test(flat(src.summary)));
ok('the hub carries the standing line: prepared, never sent without approval',
  /Nothing is ever sent to HMRC unless you have approved it first/.test(flat(src.hub)));

// ---------------------------------------------------------------------------------------------
// 4. THE NAV AND THE DOORS. Five screens findable, three tools behind the Tools row.
// ---------------------------------------------------------------------------------------------
const sections = nav.slice(nav.indexOf('export const SECTIONS'), nav.indexOf('export function AppNav'));
ok('the nav has a Tax section', /label: 'Tax'/.test(sections));
for (const href of ['/app/tax', '/app/tax/summary', '/app/tax/what-if', '/app/tax/ways-to-save', '/app/tax/can-i-claim']) {
  ok(`the nav offers ${href}`, sections.includes(`href: '${href}'`));
}
// 🔴 THE ONCE TEST, ENFORCED. NI, the student loan and CIS are checked a few times a year, so
// they live behind the hub's Tools row and NOT in the menu a man opens weekly.
for (const href of ['/app/tax/ni', '/app/tax/student-loan', '/app/tax/cis']) {
  ok(`${href} is NOT in the nav (doc 103's once test)`, !sections.includes(`href: '${href}'`));
  ok(`${href} is reachable from the hub`, src.hub.includes(`href="${href}"`));
}
ok('the tools sit behind a <details> row that opens with no script',
  /<details className="lek-tools">/.test(src.hub) && /<summary className="lek-tools-summary">Tools<\/summary>/.test(src.hub));
ok('the hub links down to all four sibling screens',
  ['/app/tax/summary', '/app/tax/what-if', '/app/tax/ways-to-save', '/app/tax/can-i-claim']
    .every((h) => src.hub.includes(`href="${h}"`)));
// The tools screens light up the Tax tab rather than naming a route the nav never heard of,
// exactly as /app/entry lights up Money.
for (const k of ['ni', 'loan', 'cis']) {
  ok(`${k}: lights up the Tax tab`, src[k].includes('<AppNav current="/app/tax" />'));
}

// The empty test on the hub: the MTD row and the payments on account card only exist when true.
ok('the MTD row is drawn only when mandation is real', /\{mtd \? \(/.test(src.hub));
ok('the payments on account card is drawn only when they apply', /poa\.required \? \(/.test(src.hub));

// ---------------------------------------------------------------------------------------------
// 5. THE DUE DATE HELPER, ATTACKED AT RUNTIME AND PINNED TO THE GRADED CONCEPT.
// ---------------------------------------------------------------------------------------------
// Staged for bare node: due.ts imports lib/quarterpack extensionless, which Next resolves and
// type stripping does not. Same fix as test/moneyweb.test.mjs, same reason.
const stage = mkdtempSync(path.join(tmpdir(), 'taxdue-'));
writeFileSync(path.join(stage, 'taxengine.ts'), read('lib/taxengine.ts'));
writeFileSync(
  path.join(stage, 'quarterpack.ts'),
  read('lib/quarterpack.ts').replace("from './taxengine'", "from './taxengine.ts'"),
);
writeFileSync(
  path.join(stage, 'due.ts'),
  read('app/app/tax/due.ts').replace("from '../../../lib/quarterpack'", "from './quarterpack.ts'"),
);
const D = await import(pathToFileURL(path.join(stage, 'due.ts')).href);
const T = await import(pathToFileURL(path.join(stage, 'taxengine.ts')).href);

ok('the first update of 2026/27 is due 7 August 2026', D.updateDue(2026, 1) === '7 August 2026');
ok('🔴 THE SECOND UPDATE IS DUE 7 NOVEMBER 2026, the date the whole plan aims at',
  D.updateDue(2026, 2) === '7 November 2026');
ok('the third crosses the year end correctly', D.updateDue(2026, 3) === '7 February 2027');
ok('the fourth lands in May', D.updateDue(2026, 4) === '7 May 2027');
ok('the next tax year moves everything forward a year', D.updateDue(2027, 1) === '7 August 2027');
ok('🔴 PARITY WITH THE ENGINE\'S GRADED CONCEPT: the exam bank and the screen agree',
  D.updateDueISO(2026, 1) === T.concept('mtd_first_quarter_deadline'));
ok('the ordinal words read like a person', D.UPDATE_ORDINAL[1] === 'first' && D.UPDATE_ORDINAL[2] === 'second'
  && D.UPDATE_ORDINAL[3] === 'third' && D.UPDATE_ORDINAL[4] === 'fourth');

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

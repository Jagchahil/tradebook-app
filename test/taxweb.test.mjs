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

import { readFileSync, mkdtempSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
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
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const flat = (s) => s.replace(/\s+/g, ' ');

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THIS WAS EIGHT PATHS TYPED BY HAND, AND app/app/tax HAS TEN PAGES IN IT.
//
// /app/tax/vat and /app/tax/vehicle were outside the suite that exists to police money screens,
// and had been since they were written. Fourteen per page guards skipped both of them: the session
// gate, force-dynamic, no client script, "never builds a pound", "carries no tax constant of its
// own", "never claims HMRC approval", "never claims we file for him", and the rest.
//
// 🔴 AND ONE ASSERTION WAS FACTUALLY FALSE WHILE IT PASSED. "no other tax screen reads the query
// string at all" was checked against the eight, and app/app/tax/vehicle/page.tsx reads four values
// off searchParams. No leak, they are calculator inputs rather than ids, but the suite was stating
// something about the tax screens that was not true of the tax screens.
//
// ⚠️ SO THE LIST IS WALKED, NOT TYPED. A new screen under app/app/tax is covered by every guard
// below on the day it is created, which is the only version of this that stays true. The key is
// the directory name, so the named references further down (src.summary, src.whatif) still work.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
const taxPageFiles = readdirSync(path.join(root, 'app/app/tax'), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => `app/app/tax/${e.name}/page.tsx`)
  .filter((f) => existsSync(path.join(root, f)));
const PAGES = Object.fromEntries([
  ['hub', 'app/app/tax/page.tsx'],
  ...taxPageFiles.map((f) => [
    // what-if -> whatif, ways-to-save -> ways, can-i-claim -> claim, student-loan -> loan, so the
    // keys the rest of this file already uses by name keep working.
    ({ 'what-if': 'whatif', 'ways-to-save': 'ways', 'can-i-claim': 'claim', 'student-loan': 'loan' }[f.split('/')[3]]) ?? f.split('/')[3],
    f,
  ]),
]);
const src = Object.fromEntries(Object.entries(PAGES).map(([k, p]) => [k, read(p)]));
// 🔴 THE WALK IS PROVED BEFORE ANY CLAIM IS MADE ON IT. A sweep over a short list passes every
// assertion it never makes, which is exactly how this file said something false for weeks.
ok(`🔴 every page under app/app/tax is covered, and there are ${Object.keys(PAGES).length}`,
  Object.keys(PAGES).length === 10
  && ['hub', 'summary', 'whatif', 'ways', 'claim', 'ni', 'loan', 'cis', 'vat', 'vehicle']
    .every((k) => typeof src[k] === 'string' && src[k].length > 0));
const nav = read('app/app/AppNav.tsx');

console.log('\ntax on the web: the hub, the quarter, the levers, and the tools');

// ---------------------------------------------------------------------------------------------
// 1. EVERY SCREEN IS BEHIND THE SESSION AND SHIPS NO SCRIPT.
// ---------------------------------------------------------------------------------------------
for (const [k, s] of Object.entries(src)) {
  // 🔴 7 AUGUST 2026: WIDENED TO ALLOW next=. A bare redirect('/in') sent a signed out man to
  // the dashboard, never back to the tax page he actually asked for. Every page under app/app/tax
  // now carries its own destination through the door (lib/websession.ts's safeNext allowlists
  // /app and below), so this checks that he is sent to the door at all; test/signinnext.test.mjs
  // is the ratchet that checks next= is present and is HIS OWN page, for every page under app/app.
  ok(`${k}: resolves the user from the session and sends a stranger to the door`,
    s.includes('userFromSessionCookie') && /redirect\('\/in(\?[^']*)?'\)/.test(s));
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
// ⚠️ TWO SCREENS READ IT, AND BOTH ARE CALCULATORS RATHER THAN RECORD READERS. what-if takes a
// delta, vehicle takes a price, a mileage, a use band and a budget. None of them names a person, a
// row or an account, which is the property this assertion actually exists to hold: nothing in a
// web app URL may identify whose money is on the screen. The old wording claimed nobody but
// what-if read the query string at all, which was simply not true of the tree it was describing.
// ⚠️ ni AND loan JOINED whatif AND vehicle ON 6 AUGUST. Both now read searchParams, but ONLY for a
// benign saved/error banner off ?done / ?e after a form POST to /api/you/financials (the student
// loan plan, the PAYE salary, savings and dividends, settable from the web at last). They read no
// id, account, owner or customer off the string, which the assertion below still pins, so this is a
// banner after a save, not a record read.
// ⚠️ cis JOINED THEM ON 11 AUGUST 2026, for exactly the reason ni and loan did on 6 August. The
// CIS screen now lets a man record what a contractor deducted from a payment he confirmed weeks
// ago, which is a form POST to /api/cis, and it reads ?done to draw a saved or refused banner
// afterwards. It reads no id, account, owner or customer off the string: the row id travels in a
// hidden field in the form, POSTed, never in a URL. The assertion above still pins that.
const READS_QUERY = ['whatif', 'vehicle', 'ni', 'loan', 'cis'];
ok('what-if reads only the delta off the query string',
  /one\('extra'\)/.test(src.whatif) && !/one\('(user|id|account|owner)/.test(src.whatif));
ok('🔴 and no tax screen takes anything off the URL that could name a person or a row',
  Object.entries(src).every(([, s]) => !/searchParams[\s\S]{0,400}?\b(user_?id|account|owner|customer)\b/i.test(codeOnly(s))));
ok('no OTHER tax screen reads the query string at all',
  Object.entries(src).filter(([k]) => !READS_QUERY.includes(k)).every(([, s]) => !s.includes('searchParams')));

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
  src.hub.includes('buildQuarterPack') && /pack\.ytd\.mtdPosition/.test(src.hub));

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

// 🔴 THE WHAT-IF COMPUTATION MOVED TO lib/whatif.ts ON 10 AUGUST, because it was a FIFTH money
// spine surface computing its own way (lib/position.ts, which knows nothing of the vehicle
// allowance or Section 24) and disagreeing with the Overview by about £1,560. The page now owns no
// arithmetic: it reads whatIf(), which routes an individual through taxPosition with the projection
// off (the SAME engine every other surface uses) and a company through its own Corporation Tax. So
// the assertions read lib/whatif.ts for the routing and the page for the delegation.
const whatifLib = read('lib/whatif.ts');
ok('🔴 WHAT-IF DELEGATES TO lib/whatif.ts, one source, and reads the structure to route by',
  src.whatif.includes('whatIf(') && src.whatif.includes('getBusinessProfile')
  && !src.whatif.includes('computePosition('));
ok('🔴 AND lib/whatif.ts ROUTES BY STRUCTURE: taxPosition confirmed for an individual, the company return for a company',
  whatifLib.includes("taxPosition(opt, { project: false })") && whatifLib.includes('computePosition('));
ok('the delta is bounded and unreadable input asks no question',
  /1_000_000/.test(src.whatif) && /Number\.isFinite/.test(src.whatif));
ok('🔴 THE FORM IS A GET: a pure question, no state, no new API route',
  /action="\/app\/tax\/what-if" method="get"/.test(src.whatif) && !/method="post"/.test(src.whatif));
ok('the base is confirmed figures and the copy says so',
  /confirmed profit since 6 April/i.test(flat(src.whatif)) && /nothing projected/i.test(flat(src.whatif)));
ok('the input has a name a screen reader can say',
  /htmlFor="extra"/.test(src.whatif) && /id="extra"/.test(src.whatif));
ok('🔴 the student loan moves with the bill through taxPosition, not a second copy in the page',
  whatifLib.includes('studentLoan') && !src.whatif.includes('studentLoanForSA'));

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
// 🔴 THE EMPTY TEST STILL BITES, ON FIVE POSITIONS RATHER THAN A BOOLEAN. Only two of them draw a
// row at all: the man who told us HMRC wrote to him, and the man whose figures are over the line
// and who has not been asked. stated_out, unstated_under and excluded draw nothing here, and the
// question still reaches the last two of those through unansweredMtd(), which is asked of every
// sole trader whatever his figures.
ok('the MTD row is drawn only when there is something true to say',
  /\{mtdPos === 'stated_in' \? \(/.test(src.hub)
  && /: mtdPos === 'unstated_over' \? \(/.test(src.hub)
  && /\) : null\}/.test(src.hub));
ok('🔴 AND THE VERDICT SENTENCE IS UNREACHABLE WITHOUT HIS OWN ANSWER',
  !/mtdPos === 'unstated_(over|under)'[\s\S]{0,400}?Making Tax Digital applies to you/.test(src.hub));
ok('the payments on account card is drawn only when they apply', /poa\.required \? \(/.test(src.hub));

// ---------------------------------------------------------------------------------------------
// 5. THE DUE DATE HELPER, ATTACKED AT RUNTIME AND PINNED TO THE GRADED CONCEPT.
// ---------------------------------------------------------------------------------------------
// Staged for bare node: due.ts imports lib/quarterpack extensionless, which Next resolves and
// type stripping does not. Same fix as test/moneyweb.test.mjs, same reason.
const stage = mkdtempSync(path.join(tmpdir(), 'taxdue-'));
writeFileSync(path.join(stage, 'taxengine.ts'), read('lib/taxengine.ts'));
// lib/scotland.ts, the pack's second import. One exported sentence, nothing imported into it.
writeFileSync(path.join(stage, 'scotland.ts'), read('lib/scotland.ts'));
writeFileSync(
  path.join(stage, 'quarterpack.ts'),
  read('lib/quarterpack.ts')
    .replace("from './taxengine'", "from './taxengine.ts'")
    .replace("from './scotland'", "from './scotland.ts'"),
);
writeFileSync(
  path.join(stage, 'due.ts'),
  read('app/app/tax/due.ts')
    .replace("from '../../../lib/quarterpack'", "from './quarterpack.ts'")
    .replace("from '../../../lib/taxengine'", "from './taxengine.ts'"),
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

// ---------------------------------------------------------------------------------------------
// 6. THE UPDATE THAT IS STILL OPEN, AND THE CARD THAT USED TO NAME THE WRONG ONE.
// ---------------------------------------------------------------------------------------------
// On 3 August 2026 the summary page said "The second update of 2026/27 ... is due by 7 November
// 2026" while HMRC's first quarterly update, 6 April to 5 July, was due on 7 August 2026, four days
// later. outstandingUpdate() exists to close that window, and it opens four times a year.
ok('\ud83d\udd34 3 AUGUST 2026: the first update is still open, and it is the one that matters',
  (() => { const o = D.outstandingUpdate('2026-08-03', 2026, 2);
    return o && o.ordinal === 'first' && o.due === '7 August 2026' && o.end === '2026-07-05'; })());
ok('on its own due date it is still open, because that day is the deadline',
  D.outstandingUpdate('2026-08-07', 2026, 2) !== null);
ok('the day after, it is history and stops being a nudge',
  D.outstandingUpdate('2026-08-08', 2026, 2) === null);
ok('\ud83d\udd34 APRIL 2026 INVENTS NOTHING: there was no update before the first one',
  D.outstandingUpdate('2026-04-20', 2026, 1) === null);
ok('October sits inside quarter three with quarter two still open',
  (D.outstandingUpdate('2026-10-20', 2026, 3) || {}).due === '7 November 2026');
ok('January sits inside quarter four with quarter three still open',
  (D.outstandingUpdate('2027-01-20', 2026, 4) || {}).due === '7 February 2027');
ok('April 2027 reaches back across the tax year to the fourth update',
  (() => { const o = D.outstandingUpdate('2027-04-20', 2027, 1);
    return o && o.ordinal === 'fourth' && o.due === '7 May 2027' && o.startYear === 2026; })());
ok('the floor is the engine concept, not a second copy of the date',
  /concept\('mtd_first_quarter_deadline'\)/.test(read('app/app/tax/due.ts')));

// The empty test on the summary page, the same shape the hub already passes above.
ok('\ud83d\udd34 THE CALENDAR CARD IS DRAWN ONLY WHEN MANDATION IS REAL',
  /\{isCompany \? null : mandated \? \(/.test(src.summary));
// ⚠️ THE ANCHOR MOVED, THE CLAIM DID NOT. `pack.ytd.mtdApplies && !isCompany` became a read of the
// pack's POSITION, because mandation is decided by HMRC from a return already filed and a boolean
// could not hold that. The page still re-derives nothing: both halves come from the pack.
ok('mandation is the pack\'s answer, never re-derived on the page',
  /const mtdPos = isCompany \? 'excluded' : pack\.ytd\.mtdPosition;/.test(src.summary)
  && /const mandated = mtdPos === 'stated_in';/.test(src.summary));
ok('the open update is named before the quarter he is standing in',
  /outstanding \? \(/.test(src.summary));
// \u26a0\ufe0f RENDERED COPY IS ASSERTED ON codeOnly(), NOT ON THE RAW FILE, and the sabotage pass is
// what caught it. The negative-assertion rule ("never let a comment answer for the code") turns out
// to run in BOTH directions: `/return already filed/` passed against a header comment that quoted
// the very sentence it was meant to police, so deleting the copy would have left the suite green.
// A guard that a comment can satisfy is not a guard.
const summaryCode = codeOnly(src.summary);
ok('a man under the line is told where he stands, not shown a blank',
  /No quarterly update is due from you/.test(summaryCode) || /One question settles this/.test(summaryCode));
// 🔴 REWRITTEN 3 AUGUST 2026. THE OLD COPY NAMED HMRC'S TEST AND THEN IGNORED IT IN THE SAME CARD.
// It read "Making Tax Digital starts at £50,000 and yours since 6 April is £8,400, so there is no
// update here for anyone to be waiting on", and then added that HMRC actually decides from a return
// already filed. Both cannot be true at once, and the first is the one a man acts on. So the card
// stopped concluding: it says where his figures sit, names the return HMRC reads, and asks him.
ok('\ud83d\udd34 AND HE IS TOLD HMRC\'S ACTUAL TEST BASE, which is a return already filed',
  /taxYearLabel\(startYear - 2\)/.test(summaryCode) && /writes to you/.test(summaryCode));
ok('\ud83d\udd34 AND THE PAGE NEVER TELLS AN UNASKED MAN THAT NOBODY IS WAITING ON HIM',
  !/there is no\s+update here for anyone to be waiting on/.test(summaryCode.replace(/\s+/g, ' '))
  || /You told us HMRC has not written to you/.test(summaryCode));
ok('\ud83d\udd34 AND THE ONE THING ONLY HE KNOWS IS ASKED, rather than guessed at',
  /One question settles this/.test(summaryCode) && /app\/you\/circumstances/.test(summaryCode));
// \u26a0\ufe0f THE 20,000 ROW CAP IS NOT A TAX THRESHOLD, and it is the one number on this page that
// looks like one. The first draft of this guard fired on `txns.length >= 20000` and said the page
// had typed a threshold, which it had not. Stripped BY NAME rather than by loosening the pattern:
// if anyone ever types 20000 for another reason, this still fires and they have to justify it.
const summaryNumbers = codeOnly(src.summary).replace(/txns\.length >= 20000/g, '');
ok('the page types no MTD threshold of its own',
  !/(?<![\d.])(50000|30000|20000)(?![\d.])/.test(summaryNumbers));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE PROFIT TILE. IT SAID MINUS £38,508 WHILE TWO OTHER SCREENS OF THIS PRODUCT SAID £22,776.
//
// 4 August 2026, one account, one tax year, one day. This page: In £33,580, Out £72,088, Profit
// MINUS £38,508. /app/tax/what-if: "Your confirmed profit since 6 April is £22,776. That is the
// base: real figures, nothing projected." /app/tax: "£16,626 ... due by 31 January 2028." £61,284
// apart, which is a £60,000 Audi and a £1,284 tester, to the pound.
//
// The tiles were his book. The heading above them says "What a quarterly update would report
// today", and an update does not report a car as a cost: GOV.UK, claim capital allowances,
// business cars, "Cars do not qualify for: annual investment allowance (AIA)". lib/quarterpack.ts
// holds it out now, so the tiles are the update's figures.
//
// ⚠️ WHICH MADE NAMING IT COMPULSORY. Removing £61,284 from Out and saying nothing swaps a wrong
// figure for a second one he cannot check. Both halves are guarded, because the half that is easy
// to lose in a refactor is the sentence, and the sentence is what stops the fix becoming the bug.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
ok('🔴 the tiles are the pack\'s figures and the page adds nothing to them',
  /gbp0\(sub\.trade\.expenses\)/.test(summaryCode) && /gbp0\(sub\.trade\.net\)/.test(summaryCode));
ok('🔴 AND MONEY HELD OUT OF Out IS NAMED ON THE SAME SCREEN',
  /sub\.trade\.capitalCost > 0/.test(summaryCode) && /gbp0\(sub\.trade\.capitalCost\)/.test(summaryCode));
ok('...with the reason, in his words, not a footnote number',
  /not in Out above/.test(summaryCode) && /never in one/.test(summaryCode));
ok('🔴 and the line is drawn ONLY when there is one, doc 103\'s empty test',
  !/capitalCost >= 0|capitalCost !== null|capitalCost != null/.test(summaryCode));
// ⚠️ THE COST, NEVER THE ALLOWANCE. This page reads one tax year of rows, so a car bought last year
// is invisible to it, and an allowance worked out from what it can see would be short. Understating
// a man's relief in a confident voice is the same fault as overstating it.
ok('🔴 and it never works an allowance out of one year of rows',
  !/capitalRelief|wdaMainRate|wdaSpecialRate/.test(summaryCode));

// ---------------------------------------------------------------------------------------------
// 7. IT IS WIRED. Three of these were written, shipped green, and pinned by NOTHING until a
//    sabotage pass deleted each one and the suite did not notice. That is this codebase's own
//    named disease, so they get guards of their own rather than a note in a commit message.
// ---------------------------------------------------------------------------------------------
ok('\ud83d\udd34 THE SUMMARY PAGE ACTUALLY PASSES WHO HE IS, or the pack can exclude nobody',
  /structure: biz\?\.businessType \?\? null,/.test(src.summary));
ok('\ud83d\udd34 AND SO DOES THE HUB, which asks the same pack the same question',
  /structure: biz\?\.businessType \?\? null,/.test(src.hub));
ok('a partner is read from the profile, never guessed from a figure',
  /const isPartnership = biz\?\.businessType === 'partnership';/.test(src.summary));
ok('\ud83d\udd34 AND HE GETS HIS OWN CARD: outside the regime is not the same fact as under the line',
  /\) : isPartnership \? \(/.test(src.summary) && /has not reached partnerships yet/.test(summaryCode));
ok('...with no date invented for a timeline HMRC has not published',
  !/partnerships[^.]*\b(7 August|7 November|7 February|7 May|April 202)/.test(summaryCode));
ok('\ud83d\udd34 AND THE FIRM WIDE FIGURES ARE CAPTIONED AS THE FIRM\'S, or two screens show two profits',
  /const firmNote = biz \? wholeFirmCaption\(biz\.businessType\) : null;/.test(src.summary)
  && /\{firmNote \? \(/.test(src.summary));
ok('...in lib/position.ts\'s words, never the page\'s own, so /app/money cannot drift from it',
  !/everything through the business/.test(summaryCode));

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

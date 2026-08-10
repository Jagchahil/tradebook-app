// STRUCTURE HONESTY. The product branches by sole trader, partnership and limited company; the
// surfaces must stop pretending everybody is a sole trader. Run: node test/structurehonesty.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// FOUR LIES THIS SUITE EXISTS TO KEEP OUT, EVERY ONE OF WHICH WAS LIVE ON lekhio.app:
//
//   1. A PARTNER'S FIGURES CONTRADICTING EACH OTHER. A 50% partner saw "In £500" (his share,
//      unlabelled) directly above "£1,000 in" (the whole firm, unlabelled). Both correct, and
//      together unreadable. Nothing counted may change: the fix is LABELS, written once in
//      lib/position.ts, with the share read from the same place /app/pay-yourself reads it.
//
//   2. A DIRECTOR ASKED SOLE TRADER QUESTIONS. "What were you doing before you went self
//      employed", the voluntary Class 2 tick box, and the MTD "£50,000 from self employment and
//      rent" gate all assert a premise that is false of a company. Askability lives in
//      lib/circumstances.ts, never in a page, and an unknown structure still asks everything.
//
//   3. A REGISTRATION WE NEVER VERIFIED. /app/you said "registered at Companies House" for any
//      ltd signup, when the lookup's own record may say no_match. The sentence is earned by
//      signups.company_lookup: the number when matched, a plain could-not-find when not, and no
//      claim at all when we never managed to look.
//
//   4. A DIRECTOR'S EMPTY PAY PAGE. The salary and dividend SHAPE is deterministic and profit
//      free, so a brand new director gets the engine's rungs with their reasons and NOT ONE
//      priced figure: no take home, no wall, nothing invented.
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

// Comments stripped before asking what the CODE does or what a CUSTOMER reads, as everywhere else
// in this test directory: these files argue at length about the things they refuse to do.
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

console.log('\nstructure honesty: labels, askability, the register, and the empty pay page');

// ---------------------------------------------------------------------------------------------
// 🔴 1. THE PARTNERSHIP CAPTIONS. One source, fixtures on a partnership, silence for everyone else.
// ---------------------------------------------------------------------------------------------
// lib/position.ts composes the engines through extensionless imports, so it is staged exactly as
// test/position.test.mjs stages it.
const stage = mkdtempSync(path.join(tmpdir(), 'structure-'));
const fix = (s) => s.replace(/from '(\.\/[a-zA-Z0-9]+)'/g, "from '$1.ts'");
for (const f of ['taxengine', 'nistudentloan', 'ltdengine', 'personalincome', 'partnership', 'position']) {
  writeFileSync(path.join(stage, f + '.ts'), fix(read(`lib/${f}.ts`)));
}
const POS = await import(pathToFileURL(path.join(stage, 'position.ts')).href);

{
  const share = POS.shareCaption('partnership', 50);
  const firm = POS.wholeFirmCaption('partnership');
  ok('🔴 THE SHARE CAPTION NAMES WHOSE SHARE: "your 50% share"',
    typeof share === 'string' && share.includes('your 50% share'));
  ok('and says it is the slice he is taxed on', share.includes('taxed on'));
  ok('the percentage is his own: a 33% partner reads 33',
    POS.shareCaption('partnership', 33).includes('your 33% share'));
  ok('a broken share number never renders NaN at a man',
    !POS.shareCaption('partnership', NaN).includes('NaN'));
  ok('🔴 THE WHOLE FIRM CAPTION SAYS SO: "everything through the business"',
    typeof firm === 'string' && firm.includes('everything through the business'));
  ok('and that it is before his share, so the two figures reconcile in his head',
    /share/.test(firm));
  ok('🔴 A SOLE TRADER GETS NO CAPTION: his figures are simply his (doc 103 empty test)',
    POS.shareCaption('sole_trader', 100) === null && POS.wholeFirmCaption('sole_trader') === null);
  ok('a director gets no partnership caption either',
    POS.shareCaption('limited_company', 100) === null && POS.wholeFirmCaption('limited_company') === null);
  ok('deterministic: the same structure answers the same twice',
    POS.shareCaption('partnership', 50) === share && POS.wholeFirmCaption('partnership') === firm);
}

// The surfaces render the module's sentences and decide nothing themselves. The share percentage
// travels from getBusinessProfile, the SAME source /app/pay-yourself reads (users.partnership_share).
{
  const overview = read('app/app/page.tsx');
  const money = read('app/app/money/page.tsx');
  const taxHub = read('app/app/tax/page.tsx');
  const payPage = read('app/app/pay-yourself/page.tsx');
  ok('🔴 the Overview reads the captions from lib/position.ts and the share from getBusinessProfile',
    overview.includes('shareCaption') && overview.includes('wholeFirmCaption')
    && overview.includes('getBusinessProfile'));
  ok('the Overview year grid carries the share caption beside its own sentence',
    /Since 6 April, on everything you have confirmed\.\{shareCap \? ` \$\{shareCap\}` : ''\}/.test(overview));
  ok('the Overview tax card carries the share caption', /\{shareCap \? <p style=\{S\.heroBasis\}>\{shareCap\}<\/p> : null\}/.test(overview));
  ok('the Overview week card carries the whole firm caption',
    /\{firmCap \? <p style=\{S\.quiet\}>\{firmCap\}<\/p> : null\}/.test(overview));
  ok('🔴 the money log carries the whole firm caption from the same module',
    money.includes('wholeFirmCaption') && money.includes('getBusinessProfile'));
  ok('the tax hub carries the share caption under its number',
    taxHub.includes('shareCaption') && taxHub.includes('getBusinessProfile'));
  ok('🔴 no page writes a share sentence of its own: the words live in lib/position.ts once',
    !/your \d+% share/.test(codeOnly(overview)) && !/everything through the business/.test(codeOnly(money)));
  ok('pay yourself still reads the share from getBusinessProfile, the one source',
    payPage.includes('getBusinessProfile') && payPage.includes('partnershipShare'));

  // 🔴 THE DOCUMENT THAT LEAVES THE BUILDING. Share your books shows a partner the WHOLE firm's
  // books (shareTotals does no scaling), so a 50% partner's link hands a lender the firm's full
  // profit. The page carries a caption saying exactly that, addressed to the stranger reading it,
  // and NOTHING PINNED IT until now: the internal-screen assertions above never read this file, so
  // the one caption that keeps a lender from reading a partner's income at twice its size could be
  // deleted with the suite green. This holds it there, for a partnership and for a company.
  const sharePage = read('app/share/[token]/page.tsx');
  ok('🔴 the shared books page names the WHOLE FIRM and the partner share, for the lender reading it',
    /businessType === 'partnership'/.test(sharePage)
    && /whole firm/i.test(sharePage)
    && /partnershipShare/.test(sharePage)
    && /% share/.test(sharePage));
  ok('🔴 and it names that a company’s turnover is not the director’s income',
    /businessType === 'limited_company'/.test(sharePage)
    && /salary and dividends/.test(sharePage));
  ok('the shared page reads the structure from getBusinessProfile, not the URL',
    /getBusinessProfile\(grant\.user_id\)/.test(sharePage));
  ok('🔴 NOTHING COUNTED CHANGED: getOptimiserInput still scales by the partner factor',
    // The scaling moved into lib/yeartodate.ts with the row loop (6 August 2026). The pin now
    // holds the whole chain: supabase computes the factor and hands it to the aggregation, and
    // the aggregation applies it to the trade figures.
    /partnerFactor/.test(read('lib/supabase.ts'))
    && /aggregateRowsYtd\(rows, assets, startYear, partnerFactor\)/.test(read('lib/supabase.ts'))
    && /ytdTradeIncome \*= partnerFactor/.test(read('lib/yeartodate.ts')));
}

// ---------------------------------------------------------------------------------------------
// 🔴 2. ASKABILITY KNOWS THE STRUCTURE. Fixtures for all three, run against the module itself.
// ---------------------------------------------------------------------------------------------
const C = await import(pathToFileURL(path.join(root, 'lib/circumstances.ts')).href);
const { CIRCUMSTANCES, unanswered, unansweredMtd, progressIn, mtdQuestions, household, notHousehold } = C;

// The three questions the brief names, plus the three MTD follow ups: dependsOn only holds a
// follow up back while its gate is UNANSWERED, so a yes recorded before a man incorporated would
// release "have you signed up" at a company unless the follow ups carry the tag themselves.
//
// ⚠️ WAVE NINE ADDED home_working. The use of home flat rate is a SIMPLIFIED EXPENSE, and BIM75010
// on ITTOIA 2005 s94H limits those to individuals and to partnerships of individuals: "Only
// partnerships comprising solely individual partners can claim this simplified expenses." A
// company is outside ITTOIA, so a director cannot use the £10, £18, £26 bands at any hours, and
// "no receipts to keep at all" was promising him the wrong thing entirely.
const SOLE_ONLY = [
  'prior_employment', 'low_profit_year', 'home_working',
];

// \ud83d\udd34 3 AUGUST 2026: THE FOUR MTD KEYS CAME OFF THE LIST ABOVE, AND THAT WAS THE BUG.
//
// They were bundled in with the three that genuinely are "sole trader and partner, never a company",
// and the reasoning printed beside them, "his share IS self employment income", is TRUE for those
// three and FALSE for Making Tax Digital. GOV.UK: "Partnerships will also need to use Making Tax
// Digital for Income Tax in the future. We'll set out the timeline for this at a later date." No
// date, so no obligation, so nothing to ask him about. lib/agent.ts already refused to send a
// partner the mandation signal, on that exact reasoning, so the product was asking a man a question
// on the web that its own WhatsApp had decided not to raise with him.
// ⚠️ FIVE ROWS, NOT FOUR, SINCE 3 AUGUST 2026. mtd_mandated asked about THIS year and HMRC decides
// mandation from a return already filed, so it was RETIRED and replaced by mtd_mandated_letter. The
// retired row keeps its structures tag and its exhibit and is simply never offered again, so it
// stays on this list: the claim "no MTD question is ever put to a partner" has to hold for the row
// that is still in the file, not only for the ones still being asked.
const MTD_SOLE_ONLY = ['mtd_mandated', 'mtd_mandated_letter', 'mtd_signed_up', 'mtd_agent', 'mtd_already_filed'];
{
  ok('🔴 the three sole trader questions carry their structures on the entry, with reasoning beside them',
    SOLE_ONLY.every((k) => {
      const c = CIRCUMSTANCES.find((x) => x.key === k);
      return Array.isArray(c.structures)
        && c.structures.includes('sole_trader') && c.structures.includes('partnership')
        && !c.structures.includes('limited_company');
    }));
  ok('\ud83d\udd34 EVERY MTD QUESTION IS SOLE TRADER ONLY: a partner has no update to make',
    MTD_SOLE_ONLY.every((k) => {
      const c = CIRCUMSTANCES.find((x) => x.key === k);
      return Array.isArray(c.structures) && c.structures.length === 1 && c.structures[0] === 'sole_trader';
    }));
  // 🔴 THE RETIRED GATE'S OWN WORDS ARE STILL UNTOUCHED, AND THAT IS THE WHOLE ARGUMENT FOR
  // RETIRING RATHER THAN EDITING. The question was wrong: it asked about this year and HMRC reads a
  // return already filed. It could not be reworded, because `ask` is stored verbatim on every
  // answer row as the sentence a man actually read. So the row survives, character for character,
  // and stops being offered. This guard is what stops a future tidy up from "fixing" the wording.
  ok('\u26a0\ufe0f THE RETIRED GATE\'S OWN WORDS ARE UNTOUCHED: an exhibit is never rewritten',
    CIRCUMSTANCES.find((x) => x.key === 'mtd_mandated').ask
      === 'Do you expect to take more than £50,000 this year, before any expenses, from self employment and rent put together?'
    && CIRCUMSTANCES.find((x) => x.key === 'mtd_mandated').retired === true);
  // ⚠️ AND THE SUCCESSOR CARRIES NO FIGURE AND NO YEAR, which is why it will not need replacing when
  // the line drops to £30,000 in 2027 and £20,000 in 2028. A stored exhibit cannot be edited, so a
  // question with a number in it is a question with an expiry date on it.
  const letterAsk = CIRCUMSTANCES.find((x) => x.key === 'mtd_mandated_letter').ask;
  ok('\ud83d\udd34 THE SUCCESSOR ASKS ABOUT HMRC\'S LETTER AND CONTAINS NO DIGIT AT ALL',
    /HMRC/.test(letterAsk) && /written/.test(letterAsk) && !/[0-9]/.test(letterAsk));
  ok('every other question is for every structure: absent means everyone',
    CIRCUMSTANCES.filter((c) => !SOLE_ONLY.includes(c.key) && !MTD_SOLE_ONLY.includes(c.key))
      .every((c) => c.structures === undefined));

  const forLtd = unanswered([], 'limited_company').map((c) => c.key);
  const forSole = unanswered([], 'sole_trader').map((c) => c.key);
  const forPartner = unanswered([], 'partnership').map((c) => c.key);
  const unknown = unanswered([]).map((c) => c.key);

  ok('🔴 A DIRECTOR IS NEVER ASKED "before you went self employed"', !forLtd.includes('prior_employment'));
  ok('🔴 NOR THE VOLUNTARY CLASS 2 TICK BOX', !forLtd.includes('low_profit_year'));
  ok('a director keeps every question that does not assert self employment',
    forLtd.includes('vat_registered') && forLtd.includes('pension') && forLtd.includes('married'));
  ok('🔴 a sole trader keeps all three', forSole.includes('prior_employment') && forSole.includes('low_profit_year'));
  ok('🔴 a partner keeps all three too: his share IS self employment income',
    forPartner.includes('prior_employment') && forPartner.includes('low_profit_year'));
  ok('🔴 AN UNKNOWN STRUCTURE ASKS EVERYTHING, the safe direction the module argues for',
    unknown.includes('prior_employment') && unknown.length === forSole.length);

  ok('🔴 THE MTD GATE IS REFUSED FOR A COMPANY, and the three follow ups stop with it',
    unansweredMtd([], 'limited_company').length === 0);
  ok('the MTD gate still opens for a sole trader, and it is the letter question now',
    unansweredMtd([], 'sole_trader')[0]?.key === 'mtd_mandated_letter');
  // 🔴 AND HE IS NEVER ASKED BOTH. Two questions about one fact is exactly what doc 103 forbids, and
  // it is the reason mtdQuestions() filters retired rows rather than leaving them in the list.
  ok('\ud83d\udd34 THE RETIRED GATE IS NEVER OFFERED TO ANYBODY, on any structure',
    [undefined, 'sole_trader', 'partnership', 'limited_company']
      .every((who) => !unansweredMtd([], who).some((c) => c.key === 'mtd_mandated')));
  ok('\ud83d\udd34 AND IT IS REFUSED FOR A PARTNER TOO, for a different reason than the company\'s',
    unansweredMtd([], 'partnership').length === 0);
  ok('...even with a yes somehow already on record from before this changed',
    unansweredMtd([{ key: 'mtd_mandated_letter', answer: 'yes' }], 'partnership').length === 0);
  ok('\ud83d\udd34 AN UNKNOWN STRUCTURE STILL GETS ASKED, the safe direction: a real obligation is never\n    hidden from a sole trader because a profile read came back empty',
    unansweredMtd([])[0]?.key === 'mtd_mandated_letter');
  ok('and answering yes still releases the follow ups for a sole trader',
    unansweredMtd([{ key: 'mtd_mandated_letter', answer: 'yes' }], 'sole_trader').length === 3);
  ok('but never for a company, even with a yes somehow on record',
    unansweredMtd([{ key: 'mtd_mandated_letter', answer: 'yes' }], 'limited_company').length === 0);
  // 🔴 AND AN ANSWER TO THE RETIRED QUESTION RELEASES NOTHING, which is the point of repointing
  // dependsOn. Its yes meant "I expect a big year", never "HMRC has written to me", so treating it
  // as the gate would rebuild the bug in the one place nobody would look for it again.
  ok('\ud83d\udd34 A YES ON THE RETIRED GATE OPENS NO FOLLOW UP: it answered a different question',
    unansweredMtd([{ key: 'mtd_mandated', answer: 'yes' }], 'sole_trader').length === 1);

  // The counts a director is shown. A question that is not for him is not "waiting for him".
  const ltdMtd = progressIn(mtdQuestions(), [], 'limited_company');
  ok('🔴 a director\'s MTD count is 0 of 0, not 0 of 4', ltdMtd.answered === 0 && ltdMtd.askable === 0);
  const soleMtd = progressIn(mtdQuestions(), [], 'sole_trader');
  ok('a sole trader\'s MTD count still starts 0 of 1, the gate alone', soleMtd.askable === 1);
  const ltdAll = progressIn([...household(), ...notHousehold()], [], 'limited_company');
  const soleAll = progressIn([...household(), ...notHousehold()], [], 'sole_trader');
  // Three, not two, since wave nine: the old job, the voluntary Class 2 tick box, and the use of
  // home flat rate a company cannot have.
  ok('🔴 the director\'s money denominator is exactly three questions lighter', ltdAll.askable === soleAll.askable - 3);
  ok('🔴 AND THE DIRECTOR IS NEVER PROMISED THE FLAT RATE HE CANNOT CLAIM', !forLtd.includes('home_working'));
  ok('a sole trader keeps it, because s94H is his', forSole.includes('home_working'));
  ok('an answer he gave as a sole trader still counts after incorporating: the record is his',
    progressIn(notHousehold(), [{ key: 'prior_employment', answer: 'yes' }], 'limited_company').answered === 1);
  ok('a structure filter never leaks a special category question',
    unanswered([], 'sole_trader').every((c) => !c.specialCategory)
    && unanswered([], 'limited_company').every((c) => !c.specialCategory));
}

// The setup MTD step says WHY a company has nothing here, rather than leaving a blank card.
{
  const setup = read('app/app/setup/page.tsx');
  ok('the setup MTD step explains the company case in words, not a blank',
    /structure === 'limited_company'/.test(setup) && /the company files its own return/.test(setup));
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE STEP READS THE NEW GATE, AND ITS "NOTHING ELSE TO ASK" CARD SAID TWO FALSE THINGS.
  //
  // It keyed off mtd_mandated, retired on 3 August 2026 for asking about the wrong tax year, so
  // after the swap it would have keyed off an answer nobody will ever give again. And its sentence
  // read "Making Tax Digital does not apply to you AT THAT LEVEL, and we will tell you before HMRC
  // does": a conclusion from a threshold HMRC does not use, followed by a proactive alert promise
  // that remindersLive() says no channel can keep.
  //
  // Neither half was pinned by anything. Both are now.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  ok("🔴 THE SETUP STEP READS THE NEW GATE, NOT THE RETIRED ONE",
    /answers\.get\('mtd_mandated_letter'\)/.test(codeOnly(setup))
    && !/answers\.get\('mtd_mandated'\)/.test(codeOnly(setup)));
  // ⚠️ ON codeOnly(), AND THE FIRST DRAFT WAS NOT. EIGHTH INSTANCE OF THIS CODEBASE'S OLDEST TRAP,
  // and the third in one session. The comment written on the page to explain WHY those two
  // sentences went quotes both of them, so a negative assertion over the raw file fires on the
  // explanation and reports a page that is already correct as broken. The rule has no exceptions:
  // a negative assertion over a source file runs on codeOnly(), because the comment explaining a
  // removal always contains the removed string.
  const setupCode = codeOnly(setup);
  ok('🔴 AND ITS DONE CARD NEITHER CONCLUDES FROM A LEVEL NOR PROMISES TO WATCH ONE',
    !/does not apply to you at that level/i.test(setupCode)
    && !/we will tell you before HMRC does/i.test(setupCode)
    && /tell us here and we will have your updates ready/.test(setupCode));
  ok('🔴 the VAT sentence on /start is structure aware: a company is not "most sole traders"',
    /tradeType === 'ltd'/.test(read('app/start/page.tsx').slice(read('app/start/page.tsx').indexOf('Are you VAT registered')))
    && /This one is about the company/.test(read('app/start/page.tsx')));
}

// ---------------------------------------------------------------------------------------------
// 🔴 3. THE REGISTER. The sentence is earned by the lookup's own record, all four outcomes.
// ---------------------------------------------------------------------------------------------
const CH = await import(pathToFileURL(path.join(root, 'lib/companieshouse.ts')).href);
{
  const matched = CH.registrationLine('matched', '12345678');
  ok('🔴 A REAL MATCH SHOWS THE NUMBER, a fact he can check against the register',
    matched.includes('12345678') && matched.includes('Companies House register'));
  ok('🔴 NO MATCH IS SAID PLAINLY, with the one thing he can do about it',
    CH.registrationLine('no_match', null)
      .includes('we could not find this name on the register, check the spelling in setup'));
  ok('and a no match never asserts registration',
    !/registered at Companies House/.test(CH.registrationLine('no_match', null)));
  for (const outcome of ['not_ltd', 'unavailable', null, undefined, 'garbage']) {
    ok(`🔴 outcome ${String(outcome)} asserts nothing about the register: "as you told us" is the whole claim`,
      CH.registrationLine(outcome, null).includes('as you told us')
      && !/register/.test(CH.registrationLine(outcome, null)));
  }
  ok('a matched outcome with no number stored falls back to the honest non claim',
    CH.registrationLine('matched', '').includes('as you told us'));
}
{
  const you = read('app/app/you/page.tsx');
  ok('🔴 /app/you no longer hardcodes "registered at Companies House"',
    !/'A limited company, registered at Companies House/.test(you));
  ok('the sentence comes from lib/companieshouse.ts and the record from readSignupCompany',
    you.includes('registrationLine(') && you.includes('readSignupCompany'));
  ok('the read comes from the signups row, where the lookup wrote its outcome',
    /company_number,company_name,company_lookup/.test(read('lib/supabase.ts')));
  ok('a failed company read makes the page less assertive, never more: catch to null',
    /readSignupCompany\(user\.id\)\.catch\(\(\) => null\)/.test(you));
}

// ---------------------------------------------------------------------------------------------
// 🔴 4. THE DIRECTOR'S EMPTY PAY PAGE. The shape, deterministic, and not one invented figure.
// ---------------------------------------------------------------------------------------------
// Staged exactly as test/payyourselfweb.test.mjs stages the same helper.
const payStage = mkdtempSync(path.join(tmpdir(), 'structurepay-'));
const fixLib = (s) => s.replace(/from '\.\/([a-z]+)'/g, "from './$1.ts'");
for (const f of [
  'taxengine', 'nistudentloan', 'autonomy', 'ltdengine', 'personalincome', 'partnership',
  'position', 'propertyengine', 'taxoptimiser', 'payyourself',
]) {
  writeFileSync(path.join(payStage, `${f}.ts`), fixLib(read(`lib/${f}.ts`)));
}
writeFileSync(
  path.join(payStage, 'plan.ts'),
  read('app/app/pay-yourself/plan.ts').replace(/from '\.\.\/\.\.\/\.\.\/lib\/([a-z]+)'/g, "from './$1.ts'"),
);
const M = await import(pathToFileURL(path.join(payStage, 'plan.ts')).href);
const L = await import(pathToFileURL(path.join(payStage, 'ltdengine.ts')).href);

const empty = {
  startYear: 2026, monthsElapsed: 1, ytdTradeIncome: 0, ytdTradeExpenses: 0, ytdCisSuffered: 0,
  employmentIncome: 0, categoriesLogged: [], homeOfficeClaimed: false, mileageClaimed: false,
};
{
  const m = M.payModel('limited_company', empty);
  const rungs = L.salaryRungs();
  ok('🔴 an empty company year is still an honest nothing_yet', m.kind === 'nothing_yet');
  ok('🔴 BUT IT CARRIES THE SHAPE: the engine\'s own rungs, whole',
    Array.isArray(m.rungs) && m.rungs.length === rungs.length
    && m.rungs.every((r, i) => r.salary === rungs[i].salary && r.why === rungs[i].why));
  ok('the rungs carry their reasons, including the State Pension catch',
    m.rungs.some((r) => r.why.includes('State Pension')));
  ok('🔴 AND NOT ONE PRICED FIGURE: no take home, no corporation tax, no wall',
    !('plan' in m) && m.rungs.every((r) => !('plan' in r) && !('takeHome' in r)));
  ok('deterministic: the same empty year answers the same twice',
    JSON.stringify(m) === JSON.stringify(M.payModel('limited_company', empty)));
  ok('🔴 a sole trader\'s empty state carries no company shape',
    M.payModel('sole_trader', empty).rungs === null);
  ok('a partner\'s empty state carries none either',
    M.payModel('partnership', empty).rungs === null);
  ok('a company with real profit still gets the priced branch, untouched',
    M.payModel('limited_company', { ...empty, ytdTradeIncome: 30000, ytdTradeExpenses: 6000, monthsElapsed: 6 }).kind === 'company');
}
{
  const page = read('app/app/pay-yourself/page.tsx');
  const t = codeOnly(page).replace(/\s+/g, ' ');
  ok('🔴 the empty company branch renders the model\'s rungs, never a local list',
    /model\.rungs \?/.test(page) && /model\.rungs\.map/.test(page));
  ok('it explains the shape: salary first, then dividends after Corporation Tax',
    /a small salary first, then dividends/.test(t) && /after Corporation Tax/.test(t));
  ok('and why: the salary is a company cost, dividends carry no National Insurance',
    /salary is a company cost/.test(t) && /Dividends carry no National Insurance/.test(t));
  ok('🔴 figures appear once his money does, and the page says so',
    /appear here the moment the money you confirm builds a profit/.test(t));
  ok('a rung is a line the rules draw, not a recommendation, said out loud',
    /a line the tax rules draw, not a recommendation/.test(t));
  ok('the sole trader empty state is untouched',
    /Nothing to work out yet/.test(t) && /fills in by itself/.test(t));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n🔴 THE FIFTH LIE: THE WEB SIGNUP COULD NOT SAY "TWO OF US"\n');
//
// /start step 2 offered just me, a business name, a limited company. Two people running a business
// together picked "A business name" and tradeTypeToBusinessType folded it to sole_trader.
// lib/supabase.ts said so out loud: "Partnership is not offered on the web, so it never arrives
// here." app/app/setup has offered it since 31 July and its own header records the cost: "a coffee
// shop run by two people who chose 'A business name' is sitting in the database as a SOLE TRADER,
// silently, and lib/partnership.ts has been ready for him since 17 July with nowhere to say so."
//
// GOV.UK, set up a business partnership: "each partner pays tax on their share." Stored as a sole
// trader, EVERY figure the product shows him is the whole firm's.
{
  const start = read('app/start/page.tsx');
  const startCode = codeOnly(start);
  const supa = codeOnly(read('lib/supabase.ts'));

  ok('🔴 /start step 2 offers a partnership at all',
    /\['partnership', '', 'Me and somebody else'/.test(start));
  ok('...in app/app/setup\'s own words, so one fact is not worded twice',
    /Me and somebody else/.test(start) && /Me and somebody else/.test(read('app/app/setup/page.tsx')));
  ok('the type admits it, so tsc names anywhere that forgot',
    /type TradeType = 'sole' \| 'business' \| 'ltd' \| 'partnership' \| null;/.test(startCode));

  // 🔴 THE SHARE, WHICH IS AS BIG A FACT AS THE STRUCTURE. getBusinessProfile reads a missing
  // share as 100%, on purpose, so a half answered setup cannot halve a sole trader's tax. That is
  // right for everyone but the one man the column exists for, who is then shown his partners'
  // money as his own: the defect commit 0e9175e2 fixed on the income summary a lender reads.
  ok('🔴 and it asks for his share of the profit',
    /Your share of the profit/.test(start) && /id="signup-share"/.test(start));
  ok('🔴 AND HE CANNOT GET PAST STEP 2 WITHOUT ANSWERING IT',
    /tradeType !== 'partnership' \|\| shareValid/.test(startCode));
  ok('...to a real percentage, 1 to 100, and never 0',
    /shareNum >= 1 && shareNum <= 100/.test(startCode));
  ok('🔴 and the box carries NO prefilled guess about his money',
    !/value=\{share \|\| '50'\}/.test(startCode) && !/useState\('50'\)/.test(startCode));
  ok('the answer is posted, and only when it means something',
    /partnershipShare: tradeType === 'partnership' && shareValid \? shareNum : undefined/.test(startCode));

  ok('🔴 the mapper no longer folds a partnership into a sole trader',
    /if \(t === 'partnership'\) return 'partnership';/.test(supa));
  ok('...and a trading name still folds, because that IS a sole trader',
    !/if \(t === 'business'\) return 'partnership'/.test(supa));
  ok('🔴 and the share is carried onto the user when he proves his email',
    /select=trade_type,trade,name,address,postcode,vat_registered,streams,partnership_share/.test(supa)
    && /setPartnershipShare\(userId, pct\)/.test(supa));
  ok('...only for a partnership, and only for a number we believe',
    /tradeTypeToBusinessType\(s\.trade_type\) === 'partnership'/.test(supa)
    && /pct >= 1 && pct <= 100/.test(supa));
  ok('the firm\'s name is filed as a business, not as the person',
    /s\.trade_type === 'ltd' \|\| s\.trade_type === 'business' \|\| s\.trade_type === 'partnership'/.test(supa));

  // ⚠️ THE COLUMN HAS TO EXIST OR THE ANSWER IS DROPPED IN SILENCE. The migration is the only
  // thing standing between a man answering the question and nothing happening.
  const sql = read('supabase/APPLY_2026-08-04_signup_partnership_share.sql');
  ok('🔴 the migration that gives the answer somewhere to land is in the repo',
    /add column if not exists partnership_share integer/.test(sql));
  ok('...and the database refuses the same range the code refuses',
    /partnership_share >= 1 and partnership_share <= 100/.test(sql));
  ok('...and it carries a verify step that states what it must return',
    /IT MUST RETURN EXACTLY ONE ROW/.test(sql) && /information_schema\.columns/.test(sql));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n🔴 THE SIXTH LIE: A COMPANY NAME TYPED INTO THE TRADING NAME BOX, AND SILENCE\n');
//
// Found on 4 August reading the signups table: "Firmus Nutrition LTD", trade_type 'business'.
// tradeTypeToBusinessType folds that to sole_trader, so the engine charges income tax and Class 4
// PERSONALLY on profit belonging to a company. lib/supabase.ts names the cost itself: "the largest
// overstatement in the product and the one that is hardest for him to spot, because it looks like
// a big tax bill rather than like a bug." He also never gets the Companies House lookup, because
// app/api/onboard opens lookUpCompany with `if (tradeType !== 'ltd') return { outcome: 'not_ltd' }`.
{
  const O = await import(pathToFileURL(path.join(root, 'lib/onboarding.ts')).href);
  const start = read('app/start/page.tsx');
  const startCode = codeOnly(start);

  for (const n of ['Firmus Nutrition LTD', 'Smith Electrical Limited', 'Acme Ltd.', 'Big Co PLC', 'Rhywbeth Cyf']) {
    ok(`"${n}" reads as a registered company`, O.registeredShape(n) === 'company');
  }
  // 🔴 THE CONTROLS ARE THE POINT. A prompt that fires on an honest trading name is one people
  // learn to dismiss, and then it is not there on the day it matters. Anchored at the end, which
  // is where a suffix legally sits, and preceded by a boundary.
  for (const n of ['Vasey Electrical', 'Priestley Grounds', 'Chahil Barbers', 'Unlimited Roofing',
    'The Limited Edition Barbers', 'Limitless Cleaning', 'Ltd Services Group', '', '   ']) {
    ok(`CONTROL: "${n}" is left alone`, O.registeredShape(n) === null);
  }
  ok('CONTROL: nothing at all is left alone too',
    O.registeredShape(null) === null && O.registeredShape(undefined) === null);
  // ⚠️ AN LLP IS TAXED LIKE A PARTNERSHIP, not like a company. Its members pay tax on their share
  // of the profit, so calling one a director swaps one wrong structure for another.
  ok('🔴 an LLP reads as an LLP and never as a company',
    O.registeredShape('Smith & Jones LLP') === 'llp' && O.registeredShape('Foo L.L.P.') === 'llp');

  ok('🔴 /start asks lib/onboarding rather than sniffing the name itself',
    /registeredShape\(name\)/.test(startCode) && !/\/ltd\|limited\/i/.test(startCode));
  ok('...and only when he has NOT already given a structure that fits',
    /tradeType === 'sole' \|\| tradeType === 'business' \? registeredShape\(name\) : null/.test(startCode));
  ok('🔴 AND IT ASKS HIM RATHER THAN SWITCHING HIM',
    /Is that right\?/.test(start) || /If it is, your tax works differently/.test(start));
  ok('...with the way out said plainly, so ignoring it is a real option',
    /Nothing changes unless you press it/.test(start));
  ok('🔴 the button only moves the answer, it does not submit anything',
    /onClick=\{\(\) => setTradeType\(shape === 'llp' \? 'partnership' : 'ltd'\)\}/.test(startCode)
    && /type="button"/.test(startCode));
  // ⚠️ NOTHING MAY REWRITE tradeType FROM THE NAME WITHOUT A PRESS. The whole decision is that we
  // ask, so an effect or a render time coercion would quietly undo it.
  ok('🔴 and nothing sets the structure from the name without him pressing',
    !/useEffect\([\s\S]{0,200}?setTradeType/.test(startCode));
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

// PAY YOURSELF ON THE WEB. The screen that tells a man the most tax efficient way to take his own
// money out, for the structure he actually trades under. Run: node test/payyourselfweb.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// FOUR FAILURES THIS SUITE EXISTS TO CATCH, EVERY ONE OF WHICH WOULD SHIP SILENTLY:
//
//   1. A SECOND TAX ENGINE. Every figure must come from taxPosition, payYourself or
//      computePosition, routed through the page's one pure helper. A page that priced a salary,
//      a dividend or a set aside for itself is a second reader over the number a man checks
//      against his bank, and test/onlyoneengine.test.mjs's whole header explains what that costs.
//
//   2. THE WRONG STRUCTURE. A director shown drawings advice, or a sole trader shown a salary
//      and dividend shape, is confidently wrong about the most consequential fact we hold. The
//      structure must come from getBusinessProfile, the same source what-if and the agent read.
//
//   3. A MOVED POUND, OR THE CLAIM OF ONE. This page prepares understanding. It must say out
//      loud that it never moves money and that nothing happens unless he does it, and it must
//      have no form, no POST and no API route to betray the sentence.
//
//   4. AN INVENTED FIGURE WHERE THE ENGINE WENT QUIET. A young year gets "too early", an empty
//      year gets "nothing yet", never a confident number computed some other way.
//
// Source pins first, then the helper attacked under bare node with fixtures for all three
// structures, in the style of test/taxweb.test.mjs.
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

// Comments stripped before asking what the CODE does or what a CUSTOMER reads, exactly as
// test/taxweb.test.mjs does: these files explain at length why the things they do not do would be
// wrong, and a check that cannot tell the argument from the sentence gets deleted, not fixed.
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const flat = (s) => s.replace(/\s+/g, ' ');

const page = read('app/app/pay-yourself/page.tsx');
const plan = read('app/app/pay-yourself/plan.ts');

console.log('\npay yourself on the web: one engine, three structures, no moved money');

// ---------------------------------------------------------------------------------------------
// 1. THE SHELL. Behind the session, server rendered, no script, shared shell.
// ---------------------------------------------------------------------------------------------
ok('resolves the user from the session and sends a stranger to the door',
  page.includes('userFromSessionCookie') && /redirect\('\/in'\)/.test(page));
ok('server rendered, no client script',
  !/'use client'|onClick|onChange|useState|<script/.test(page));
ok('wears the shared shell (APP_CSS and the nav)',
  page.includes('APP_CSS') && page.includes('<AppNav current='));
ok('lights up the Tax tab, a route the nav knows, like the tools screens do',
  page.includes('<AppNav current="/app/tax" />'));
ok('forced dynamic, his figures are never cached into someone else\'s page',
  page.includes("dynamic = 'force-dynamic'") && page.includes("runtime = 'nodejs'"));
ok('never builds a pound, lib/money.ts writes them',
  !/`£\$\{|['"]£['"]\s*\+|\+\s*['"]£['"]/.test(codeOnly(page)) && page.includes('gbp0'));
ok('no form, no POST, no query string: a pure read with nothing to submit',
  !/<form|method="post"|searchParams/i.test(codeOnly(page)));
ok('writes no id into any URL', !/href=\{`[^`]*\$\{/.test(codeOnly(page)));

// THE GATE. lib/gate.ts's doctrine: a locked account keeps its reads, and this page is a pure
// read over figures other screens already show. So it must NOT gate, and the header must carry
// the reasoning so the next builder does not helpfully lock it.
ok('🔴 A READ THAT STAYS AVAILABLE: never calls the gate', !codeOnly(page).includes('gateForUser'));
ok('and the header argues it from lib/gate.ts\'s own doctrine', page.includes('lib/gate.ts'));

// ---------------------------------------------------------------------------------------------
// 2. ONE ENGINE. The page renders the helper's model; the helper only ever asks the engines.
// ---------------------------------------------------------------------------------------------
ok('🔴 THE PAGE READS payModel FROM ./plan AND COMPUTES NOTHING',
  page.includes("from './plan'") && page.includes('payModel(structure, optimiser)'));
ok('🔴 THE STRUCTURE COMES FROM getBusinessProfile, THE SAME SOURCE WHAT-IF READS',
  page.includes('getBusinessProfile') && /biz\?\.businessType \?\? 'sole_trader'/.test(page));
ok('the figures come from getOptimiserInput, the same call the Overview and /app/tax make',
  page.includes('getOptimiserInput'));
ok('🔴 THE HELPER ASKS taxPosition FOR THE SET ASIDE, NEVER RE-DERIVES IT',
  plan.includes('taxPosition(optimiser)') && plan.includes("from '../../../lib/taxoptimiser'"));
ok('🔴 THE DIRECTOR\'S SHAPE IS payYourself(), WHOLE',
  plan.includes('payYourself(') && plan.includes("from '../../../lib/payyourself'"));
ok('the set aside\'s own basis sentence comes from the engine too',
  plan.includes('setAsideBasisLine'));
ok('the partnership\'s structural words come from lib/position.ts, not the page',
  plan.includes('computePosition') && /type: 'partnership'/.test(plan));
for (const [name, src] of [['page', page], ['plan', plan]]) {
  const c = codeOnly(src);
  ok(`${name}: sums nothing itself`, !/\breduce\(/.test(c) && !/\w\s*\+=\s*/.test(c));
  ok(`${name}: carries no tax constant of its own`,
    !/(?<![\d.])(12570|50270|37700|125140|6708|5000)(?![\d.])/.test(c));
  ok(`${name}: carries no tax rate of its own`, !/0\.(19|25|1075|3575|3935|15\b)/.test(c));
}
ok('the page never reaches past the helper into an engine',
  !/ltdengine|planLtd|soleTraderTax|combinedIncomeTax|corporationTax|dividendTax/.test(codeOnly(page)));
ok('the helper is pure: no clock, no network, no store',
  !/new Date|fetch\(|supabase/i.test(codeOnly(plan)));
ok('the winning rung is matched by identity, never re-picked by re-comparing figures',
  /r\.plan === best/.test(page) || /r\.plan === plan\.best/.test(page));

// ---------------------------------------------------------------------------------------------
// 3. THE WORDS. Drawings are not wages; prepared is not done; and no dash sneaks in.
// ---------------------------------------------------------------------------------------------
const t = flat(codeOnly(page));
ok('🔴 THE SOLE TRADER TRUTH: a drawing is not a wage and is never taxed as one',
  /is a drawing, it is not a wage, and it is never taxed as one/.test(t));
ok('and the tax follows the profit whether he draws it or not',
  /whether you draw it or not/.test(t));
ok('no pretend payroll: the page says there is none to run',
  /There is no payroll to run and no PAYE/.test(t));
ok('🔴 THE STANDING LINE: it never moves money', /It never moves money\./.test(t));
ok('🔴 AND NOTHING HAPPENS UNLESS HE DOES IT', /Nothing happens unless you do it\./.test(t));
ok('the dividend limit is the law said plainly, never an unlawful figure priced',
  /can only be paid out of profit the company has actually made and kept/.test(t)
  && /a loan from the company back to you/.test(t));
ok('never claims we file or submit for him',
  !/\bwe\s+(will\s+)?file\b/i.test(t) && !/\bwe\s+(will\s+)?submit\b/i.test(t)
  && !/\bfiled?\s+automatically\b/i.test(t));
ok('never claims HMRC approval or endorsement',
  !/HMRC[\s-]*(approved|accredited|certified|endorsed|recognised)/i.test(t));
ok('no em or en dash anywhere in either file', !/[—–]/.test(page) && !/[—–]/.test(plan));
ok('never mentions the messaging surface it cannot promise', !/WhatsApp/.test(codeOnly(page)));

// THE EMPTY AND EARLY STATES. Honest short states, never an invented figure.
ok('an empty year gets an honest state naming what fills it',
  /Nothing to work out yet/.test(t) && /fills in by itself/.test(t));
ok('a young year says too early rather than drawing a confident number',
  /Too early in the year to call a safe monthly figure/.test(t));
ok('a set aside bigger than the trade says so instead of a bare zero',
  /also carries tax on income from outside the business/.test(t));

// ---------------------------------------------------------------------------------------------
// 4. THE HELPER UNDER BARE NODE, WITH FIXTURES FOR ALL THREE STRUCTURES.
// ---------------------------------------------------------------------------------------------
// Staged with extensionless imports rewritten, the same trick as test/payyourself.test.mjs and
// test/taxweb.test.mjs: Next resolves them, bare node type stripping does not.
const stage = mkdtempSync(path.join(tmpdir(), 'payweb-'));
const fixLib = (s) => s.replace(/from '\.\/([a-z]+)'/g, "from './$1.ts'");
for (const f of [
  'taxengine', 'nistudentloan', 'autonomy', 'ltdengine', 'personalincome', 'partnership',
  'position', 'taxoptimiser', 'payyourself',
]) {
  writeFileSync(path.join(stage, `${f}.ts`), fixLib(read(`lib/${f}.ts`)));
}
writeFileSync(
  path.join(stage, 'plan.ts'),
  plan.replace(/from '\.\.\/\.\.\/\.\.\/lib\/([a-z]+)'/g, "from './$1.ts'"),
);
const M = await import(pathToFileURL(path.join(stage, 'plan.ts')).href);
const T = await import(pathToFileURL(path.join(stage, 'taxoptimiser.ts')).href);
const P = await import(pathToFileURL(path.join(stage, 'payyourself.ts')).href);

// A plain half year: £30,000 in, £6,000 out, six months gone, no other income.
const fx = (over = {}) => ({
  startYear: 2026,
  monthsElapsed: 6,
  ytdTradeIncome: 30000,
  ytdTradeExpenses: 6000,
  ytdCisSuffered: 0,
  employmentIncome: 0,
  categoriesLogged: [],
  homeOfficeClaimed: false,
  mileageClaimed: false,
  ...over,
});

// THE SOLE TRADER.
{
  const m = M.payModel('sole_trader', fx());
  const tax = T.taxPosition(fx());
  ok('sole trader: routed to the drawings branch', m.kind === 'drawings' && m.structure === 'sole_trader');
  ok('sole trader: the confirmed profit is income minus costs', m.tradeNet === 24000);
  ok('🔴 SOLE TRADER: THE SET ASIDE IS taxPosition\'S OWN FIGURE, TO THE POUND',
    m.setAside === tax.setAside && m.projected === tax.projected);
  ok('sole trader: monthly profit is the confirmed run rate', m.monthly && m.monthly.profit === 4000);
  ok('sole trader: the keep back is one twelfth of the engine\'s set aside',
    m.monthly && m.monthly.keepBack === Math.round(tax.setAside / 12));
  ok('sole trader: the three tiles reconcile to the pound, draw = profit minus keep back',
    m.monthly && m.monthly.draw === m.monthly.profit - m.monthly.keepBack && m.monthly.covered === true);
  ok('sole trader: a pure trade gets no basis sentence, exactly as the tax hub behaves',
    m.basis === null && m.partnershipNote === null);
  ok('deterministic: the same year answers the same twice',
    JSON.stringify(m) === JSON.stringify(M.payModel('sole_trader', fx())));
}
{
  const withJob = fx({ employmentIncome: 30000 });
  const m = M.payModel('sole_trader', withJob);
  ok('sole trader with wages: the basis sentence arrives, written by the engine',
    typeof m.basis === 'string' && m.basis.includes('your wages'));
}
{
  const m = M.payModel('sole_trader', fx({ monthsElapsed: 2 }));
  ok('a two month year projects nothing and offers no monthly figure',
    m.kind === 'drawings' && m.projected === false && m.monthly === null);
}
{
  ok('no income yet is an honest nothing, never a zero shape',
    M.payModel('sole_trader', fx({ ytdTradeIncome: 0, ytdTradeExpenses: 0 })).kind === 'nothing_yet');
  ok('a loss so far is an honest nothing too',
    M.payModel('sole_trader', fx({ ytdTradeIncome: 5000, ytdTradeExpenses: 9000 })).kind === 'nothing_yet');
}
{
  // Outside income can make the set aside outgrow the trade itself. £3,000 of trade over six
  // months is £500 a month; £100,000 of dividends puts the monthly keep back far past it.
  const m = M.payModel('sole_trader', fx({ ytdTradeIncome: 3000, ytdTradeExpenses: 0, dividendIncome: 100000 }));
  ok('when the keep back outgrows the trade, the draw floors at zero and says so',
    m.kind === 'drawings' && m.monthly && m.monthly.covered === false && m.monthly.draw === 0);
}

// THE PARTNER. getOptimiserInput has already scaled the books to his share, so the same figures
// are the same engine run; what changes is the structure and its own words.
{
  const m = M.payModel('partnership', fx());
  const solo = M.payModel('sole_trader', fx());
  ok('partner: routed to the drawings branch as a partner', m.kind === 'drawings' && m.structure === 'partnership');
  ok('🔴 PARTNER: HIS SLICE IS TAXED EXACTLY AS THE ENGINE TAXES IT, no partnership premium invented',
    m.setAside === solo.setAside && m.monthly && solo.monthly && m.monthly.draw === solo.monthly.draw);
  ok('partner: the SA800 sentence is lib/position.ts\'s own',
    typeof m.partnershipNote === 'string' && m.partnershipNote.includes('SA800'));
}

// THE DIRECTOR. The whole answer is the engine's answer, by identity.
{
  const m = M.payModel('limited_company', fx());
  const engine = P.payYourself(24000);
  ok('director: routed to the company branch on the confirmed profit',
    m.kind === 'company' && m.profit === 24000);
  ok('🔴 DIRECTOR: THE PLAN IS payYourself\'S OWN, TO THE POUND',
    m.plan.best.takeHome === engine.best.takeHome && m.plan.best.salary === engine.best.salary
    && m.plan.best.corpTax === engine.best.corpTax && m.plan.best.dividends === engine.best.dividends);
  ok('director: every rung is priced, none hidden', m.plan.rungs.length === engine.rungs.length
    && m.plan.rungs.length >= 3);
  ok('director: the wall arrives with its sentence', typeof m.plan.wall.says === 'string'
    && m.plan.wall.says.includes('Every extra'));
  ok('director: an empty company year is an honest nothing',
    M.payModel('limited_company', fx({ ytdTradeIncome: 0 })).kind === 'nothing_yet');
}

// THE DIRECTOR WITH NOTHING CONFIRMED. The salary and dividend SHAPE is profit free and
// deterministic, so the empty state carries the engine's own rungs with their reasons and NOT ONE
// priced figure: pricing needs a profit we do not hold. test/structurehonesty.test.mjs holds the
// page half; this pins the helper's contract beside the rest of its fixtures.
{
  const bare = fx({ ytdTradeIncome: 0, ytdTradeExpenses: 0 });
  const m = M.payModel('limited_company', bare);
  const rungs = P.salaryRungs();
  ok('🔴 EMPTY DIRECTOR: THE RUNGS ARE salaryRungs\' OWN, by value and by reason',
    Array.isArray(m.rungs) && m.rungs.length === rungs.length
    && m.rungs.every((r, i) => r.salary === rungs[i].salary && r.why === rungs[i].why));
  ok('empty director: nothing is priced, no plan and no take home anywhere on the model',
    !('plan' in m) && m.rungs.every((r) => !('takeHome' in r)));
  ok('an empty sole trader and an empty partner carry no company shape',
    M.payModel('sole_trader', bare).rungs === null && M.payModel('partnership', bare).rungs === null);
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

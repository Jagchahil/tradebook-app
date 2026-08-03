// THE TRADING ALLOWANCE: AN ELECTION, NOT A CALCULATION. Run: node test/tradingallowance.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS SUITE DEFENDS, AND THE TWO SEPARATE THINGS THAT WERE WRONG.
//
// 🔴 1. WE TOLD HIM WE APPLIED IT AND NOTHING DID.
//
// lib/agent.ts sent a card, and a paid WhatsApp template, reading "the flat £1,000 trading
// allowance beats totting up your actual expenses, so Lekhio uses it automatically... Nothing for
// you to do." taxengine.taxableTradingProfit(), the only function that could have applied it, was
// called by NO CODE in app/ or lib/. Every engine computed trade profit as plain income minus
// expenses. Same class as "104 tests on the tax engine": a precise, checkable claim about what we
// do that nothing in the repo did, except this one cost money to send.
//
// 🔴 2. IT WAS NEVER OURS TO APPLY.
//
// HMRC BIM86015: "An individual qualifies for partial relief for a tax year if the individual has
// relevant income... which exceeds the trading allowance, and AN ELECTION BY THE INDIVIDUAL for
// partial relief has been made for the tax year. This election will be made by the individual
// completing a Self Assessment return." So a working automatic version would still have been
// wrong: it decides for him the one thing only he can decide. CLAUDE.md: we PREPARE, he APPROVES.
//
// 🔴 3. AND THE TRAP THAT NEARLY GOT BUILT IN: THE PROJECTION.
//
// The obvious place to apply it was tradeNetOf(), beside the use of home. That would have been
// four times wrong in month three. taxPosition projects the year to date figure by 12/months, so
// an allowance subtracted BEFORE that gets multiplied with the money: a man three months in would
// have been handed £4,000 of relief where the law gives £1,000. Section 4 below is that test, and
// it is the reason this file exists as much as the copy is.
//
// ⚠️ AND THE SHAPE THAT MAKES IT DIFFERENT FROM EVERY OTHER RELIEF WE OFFER. It does not ADD a
// deduction. It REPLACES every expense he has logged, his mileage and the use of home flat rate
// with one flat figure (GOV.UK: "You cannot deduct any other expenses or allowances if you claim
// the allowances"). For a man with £300 of costs that is worth having. For a man with £4,000 it
// costs him £3,000 of deduction. So no surface may ever offer it as a price on its own.
//
// Behavioural wherever it can be: lib/ is staged and the real functions run. Source level only for
// the route and the page, which cannot be loaded whole.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const lib = path.join(root, 'lib');
const stage = mkdtempSync(path.join(tmpdir(), 'tradeallow-'));

const fix = (s) => s.replace(/from '(\.\/[a-zA-Z0-9._-]+)'/g, "from '$1.ts'");
for (const f of readdirSync(lib)) {
  if (f.endsWith('.ts')) writeFileSync(path.join(stage, f), fix(readFileSync(path.join(lib, f), 'utf8')));
}
const load = (name) => import(pathToFileURL(path.join(stage, name + '.ts')).href);
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const X = await load('elections');
const O = await load('taxoptimiser');
const L = await load('ledger');
const E = await load('taxengine');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  ok   ${name}`); } else { fail += 1; console.log(`  FAIL ${name}`); }
};

const ALLOWANCE = E.FACTS.tradingAllowance;

// ---------------------------------------------------------------------------------------------
// 1. THE AMOUNT IS NEVER WRITTEN DOWN TWICE.
// ---------------------------------------------------------------------------------------------
ok('the allowance comes from FACTS, which khoji watches against GOV.UK nightly',
  X.tradingAllowanceAmount() === ALLOWANCE && ALLOWANCE === 1000);

ok('lib/elections.ts writes no pound amount of its own',
  !/\b1000\b|\b1,000\b/.test(strip(read('lib/elections.ts')).replace(/tradingAllowance/g, '')));

// ---------------------------------------------------------------------------------------------
// 2. THE COMPARISON. Both totals, always, and the winner named honestly.
// ---------------------------------------------------------------------------------------------

// ══════════════════════════════════════════════════
// 🔴 THE HORIZON IS A MONTH COUNT AND A DAY COUNT NOW, AND THE DAY COUNT IS THE DIVISOR.
//
// tradingAllowanceChoice used to project with `costs * (12 / months)`, which is the divisor that was
// wrong everywhere else in this product and was fixed on 3 August 2026. It held a THIRD copy, and
// its own comment claimed parity with taxPosition, which had stopped being true that morning.
//
// ⚠️ SO THESE FIGURES MOVED, AND THAT IS THE FIX RATHER THAN A REGRESSION. 300 pounds of costs
// at three months was projected to 1,200 by whole months and is 1,190.22 by days (365/92). The old
// number is the one that steered a man off a 1,000 pound election he was entitled to make.
//
// The pairs below are real: days actually elapsed from 6 April at each month mark.
const H = (months, days) => ({ monthsElapsed: months, daysElapsed: days });
const H1 = H(1, 30), H2 = H(2, 61), H3 = H(3, 92), H6 = H(6, 183), H12 = H(12, 365);
// ══════════════════════════════════════════════════

const lowCost = X.tradingAllowanceChoice(20000, 300, H12);
ok('a man with small costs is told the allowance wins, and by how much of DEDUCTION',
  lowCost.better === 'allowance' && lowCost.difference === 700
  && lowCost.taxableWithCosts === 19700 && lowCost.taxableWithAllowance === 19000);

const highCost = X.tradingAllowanceChoice(20000, 4000, H12);
ok('🔴 A MAN WITH REAL COSTS IS TOLD HIS COSTS WIN. This is the whole reason both totals travel together',
  highCost.better === 'costs' && highCost.difference === 3000
  && highCost.taxableWithCosts === 16000 && highCost.taxableWithAllowance === 19000);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE ONE THAT CAUGHT A LIVE DEFECT BEFORE IT REACHED A SCREEN, 1 AUGUST 2026.
//
// £300 of costs three months in is £1,200 at that pace, which BEATS the flat £1,000. The first
// version of tradingAllowanceChoice compared the year to date figure straight against an annual
// allowance and would have told this man the allowance won by £700, with a confident number beside
// it, on the screen where he decides. It is the projected against realised line, in new code, in
// the direction that talks him into the worse of the two.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const earlyLowCosts = X.tradingAllowanceChoice(20000, 300, H3);
// 🔴 THIS USED TO SAY £1,200, AND £1,200 WAS THE BUG. Whole months made it 300 x (12/3). By
// days it is 300 x (365/92) = 1,190.22, and the gap between those two numbers is the gap that
// decides a £1,000 election. He still wins on costs here, by £190.22 rather than by £200.
ok('🔴 £300 OF COSTS AT THREE MONTHS IS £1,190.22 FOR THE YEAR, AND HIS COSTS WIN',
  earlyLowCosts.projectedCosts === 1190.22 && earlyLowCosts.better === 'costs'
  && earlyLowCosts.difference === 190.22);

// 🔴 AND THE CASE THE OLD ARITHMETIC GOT BACKWARDS. At £260 of costs by three months, whole
// months project £1,040 and tell him his costs beat the allowance. Days project £1,031.52, which
// also beats it, so take the real boundary: £250 projects to £1,000 by months (level, no verdict
// either way) but only £991.85 by days, where THE ALLOWANCE WINS and he should claim it.
const boundary = X.tradingAllowanceChoice(20000, 250, H3);
ok('🔴 £250 AT THREE MONTHS: the allowance wins, where whole months called it level',
  boundary.projectedCosts === 991.85 && boundary.better === 'allowance');

ok('...and before three months there is no verdict at all, which is the honest answer',
  X.tradingAllowanceChoice(20000, 40, H1).better === 'too_early'
  && X.tradingAllowanceChoice(20000, 40, H1).difference === 0);

ok('the too early sentence says why rather than showing him a number to act on',
  /not enough of the year yet/.test(X.tradingAllowanceOffer(X.tradingAllowanceChoice(20000, 40, H1))));

ok('the same three month floor every other projection in the product uses',
  X.tradingAllowanceChoice(20000, 300, H2).better === 'too_early'
  && X.tradingAllowanceChoice(20000, 300, H3).better !== 'too_early');

ok('exactly level is its own answer, never a nudge either way',
  X.tradingAllowanceChoice(20000, ALLOWANCE, H12).better === 'level');

ok('the offer sentence for a man whose costs win says so plainly rather than selling to him',
  /beats the .* trading allowance/.test(X.tradingAllowanceOffer(highCost))
  && /worse off/.test(X.tradingAllowanceOffer(highCost)));

ok('and the sentence for a man it suits names what it REPLACES, not only what it is worth',
  /instead of them, not as well/.test(X.tradingAllowanceOffer(lowCost))
  && /mileage and the use of home/.test(X.tradingAllowanceOffer(lowCost)));

ok('a confirmation never congratulates a man who just chose the worse of the two',
  /leaves you worse off/.test(X.tradingAllowanceConfirmation(highCost))
  && /take it off again/.test(X.tradingAllowanceConfirmation(highCost)));

ok('every confirmation carries the replacement warning, whichever way he went',
  /replaces your expenses rather than adding to them/.test(X.tradingAllowanceConfirmation(lowCost))
  && /replaces your expenses rather than adding to them/.test(X.tradingAllowanceConfirmation(highCost)));

// ---------------------------------------------------------------------------------------------
// 3. FULL RELIEF IS AUTOMATIC, AND IT MUST NEVER TAKE A LOSS OFF HIM.
// ---------------------------------------------------------------------------------------------
ok('under the allowance with costs under the income is full relief, and no election to make',
  X.tradingAllowanceChoice(800, 200, H12).fullRelief === true);

ok('🔴 BUT NOT WHEN HE HAS A LOSS. £800 in and £3,000 out is a loss, and full relief would quietly take it',
  X.tradingAllowanceChoice(800, 3000, H12).fullRelief === false);

ok('nor above the allowance, where it is a real election',
  X.tradingAllowanceChoice(20000, 300, H12).fullRelief === false);

ok('full relief zeroes the trade profit without anybody electing anything',
  X.tradeProfitAfterAllowance(800, 200, false) === 0);

ok('a man with a loss is left exactly as he was, because it is his to claim',
  X.tradeProfitAfterAllowance(800, 3000, false) === 0
  && X.tradingAllowanceChoice(800, 3000, H12).taxableWithCosts === 0);

// ---------------------------------------------------------------------------------------------
// 4. 🔴 THE PROJECTION. THE ONE THAT WOULD HAVE GIVEN A MAN FOUR TIMES THE RELIEF.
//
// Three months into the year, £5,000 taken and £300 spent. The projection factor is 12/3 = 4.
//   projected gross          £20,000
//   correct taxable          £20,000 less ONE flat £1,000 = £19,000
//   the bug                  (£5,000 less £1,000) x 4     = £16,000
// A £3,000 hole in a man's taxable profit, in his favour, which is the direction that gets him
// penalised rather than us.
// ---------------------------------------------------------------------------------------------
const base = {
  startYear: 2026, monthsElapsed: 3, daysElapsed: 92,
  // £100 over three months is £400 at this pace, comfortably under the allowance, so this is a man
  // the election genuinely suits. £300 would have been £1,200 for the year and would NOT suit him,
  // which is the trap the section above exists to hold shut.
  ytdTradeIncome: 5000, ytdTradeExpenses: 100, ytdCisSuffered: 0,
  employmentIncome: 0, savingsIncome: 0, dividendIncome: 0,
  studentPlans: [], homeOfficeClaimed: false, categoriesLogged: [], goals: [],
  businessType: 'sole_trader', incomeShape: 'trade',
};
const elected = O.taxPosition({ ...base, tradingAllowanceElected: true });
const notElected = O.taxPosition({ ...base, tradingAllowanceElected: false });

// ⚠️ THE FACTOR COMES FROM THE ENGINE, IT IS NOT WRITTEN OUT AGAIN HERE. These three read 19000,
// 16000 and `* 4`, which was the engine's `12 / monthsElapsed` rule copied into the test. When the
// projection moved to days on 2 August they failed for being right about the old engine. The
// SHAPES below are what this section is actually defending, and they are unchanged:
//   right: (gross x factor) - 1000, the allowance taken ONCE off the annual figure
//   wrong: (gross - 1000) x factor, the allowance multiplied up by the projection
const taFactor = O.projectionFactor(base).factor;
const rightShape = Math.round((5000 * taFactor) - 1000);
const wrongShape = Math.round((5000 - 1000) * taFactor);

ok('🔴 THE ALLOWANCE IS TAKEN ONCE FROM THE ANNUAL FIGURE, NEVER MULTIPLIED BY THE PROJECTION',
  Math.round(elected.totalIncome) === rightShape);

ok('...and it is NOT what the obvious implementation would have produced',
  Math.round(elected.totalIncome) !== wrongShape);

ok('a man who has not elected keeps his own costs, projected the ordinary way',
  Math.round(notElected.totalIncome) === Math.round((5000 - 100) * taFactor));

ok('electing lowers what he sets aside here, which is the point of the choice',
  elected.setAside < notElected.setAside);

// ---------------------------------------------------------------------------------------------
// 5. IT REPLACES, IT DOES NOT JOIN. The mileage and the use of home go with the expenses.
// ---------------------------------------------------------------------------------------------
const withEverything = {
  monthsElapsed: 6, daysElapsed: 184, ytdTradeIncome: 20000, ytdTradeExpenses: 4000, ytdCisSuffered: 0,
  ytdMileage: 900, ytdHomeOffice: 156, ytdHomeOfficeLogged: 0,
};
const ledgerNormal = L.ledgerFor(withEverything);
const ledgerElected = L.ledgerFor({ ...withEverything, tradingAllowanceElected: true });
const line = (l, key) => l.lines.find((x) => x.key === key);

ok('without the election the ledger shows his real deductions, unchanged to the penny',
  line(ledgerNormal, 'expenses').deducted === 3100
  && line(ledgerNormal, 'mileage').deducted === 900
  && line(ledgerNormal, 'home_office').deducted === 156
  && !line(ledgerNormal, 'trading_allowance'));

ok('🔴 WITH IT, THE OTHER THREE ARE GONE AND ONE FLAT LINE STANDS ALONE',
  !line(ledgerElected, 'expenses')
  && !line(ledgerElected, 'mileage')
  && !line(ledgerElected, 'home_office')
  && line(ledgerElected, 'trading_allowance').deducted === ALLOWANCE);

ok('...and the line says what it replaced, so he is not left working it out from what is missing',
  /instead of your logged costs, your mileage and the use of home/.test(line(ledgerElected, 'trading_allowance').basis));

ok('a man who elects deducts LESS here, and the ledger says so rather than flattering him',
  ledgerElected.saved < ledgerNormal.saved);

// ---------------------------------------------------------------------------------------------
// 6. WHO MAY TAKE IT. Sourced refusals, and UNKNOWN TAKES EVERYTHING.
// ---------------------------------------------------------------------------------------------
ok('a limited company is refused, because ITTOIA taxes individuals',
  X.electionRefusal('trading_allowance', { structure: 'limited_company' })?.reason === 'structure');

ok('a property only customer is refused, because letting is not a trade',
  X.electionRefusal('trading_allowance', { income: 'property_only' })?.reason === 'income');

ok('🔴 AND NEITHER REFUSAL NAMES A DOOR WE HAVE NOT BUILT', (() => {
  const both = [
    X.electionRefusal('trading_allowance', { structure: 'limited_company' }).message,
    X.electionRefusal('trading_allowance', { income: 'property_only' }).message,
  ].join(' ');
  return !/property allowance/i.test(both) && !/instead you|you could|you can claim/i.test(both);
})());

ok('🔴 UNKNOWN IS NEVER REFUSED, on either axis, exactly as use of home is not',
  X.electionRefusal('trading_allowance', {}) === null
  && X.electionRefusal('trading_allowance', { structure: null, income: null }) === null
  && X.electionRefusal('trading_allowance', null) === null);

ok('a sole trader with a trade may take it',
  X.electionRefusal('trading_allowance', { structure: 'sole_trader', income: 'trade' }) === null);

ok('a partnership may too, and structure is asked before income for a man who is both',
  X.electionRefusal('trading_allowance', { structure: 'partnership', income: 'trade' }) === null
  && X.electionRefusal('trading_allowance', { structure: 'limited_company', income: 'property_only' }).reason === 'structure');

// ---------------------------------------------------------------------------------------------
// 7. THE TWO UNIONS CANNOT DRIFT. lib/supabase.ts re-declares the key type rather than importing it.
// ---------------------------------------------------------------------------------------------
ok('🔴 THE STORAGE UNION AND THE TAX UNION HOLD THE SAME TWO KEYS', (() => {
  const db = read('lib/supabase.ts').match(/export type AllowanceElectionKey = ([^;]+);/);
  const tax = read('lib/elections.ts').match(/export type ElectionKey = ([^;]+);/);
  if (!db || !tax) return false;
  const norm = (s) => s.split('|').map((x) => x.trim()).sort().join('|');
  return norm(db[1]) === norm(tax[1]) && norm(tax[1]) === "'trading_allowance'|'use_of_home'";
})());

ok('the storage refuses a row whose shape does not match its key, before the database does', (() => {
  const w = read('lib/supabase.ts');
  return /key === 'use_of_home' && !\(hoursBand !== null/.test(w)
    && /key === 'trading_allowance' && hoursBand !== null/.test(w);
})());

const MIG = read('supabase/APPLY_2026-08-01_trading_allowance_election.sql');
ok('and the database holds the same rule, so it cannot be bypassed by a hand rolled write',
  /key = 'use_of_home' and hours_band in \(25, 51, 101\)/.test(MIG)
  && /key = 'trading_allowance' and hours_band is null/.test(MIG));

ok('the migration widens the key check rather than leaving it to reject the new row',
  /check \(key in \('use_of_home', 'trading_allowance'\)\)/.test(MIG));

// ---------------------------------------------------------------------------------------------
// 8. THE ROUTE. Source level, because it cannot be loaded whole.
// ---------------------------------------------------------------------------------------------
const ROUTE = strip(read('app/api/elections/route.ts'));

ok('the key is allowlisted, never taken as free text',
  /KEYS: readonly AllowanceElectionKey\[\] = \['use_of_home', 'trading_allowance'\]/.test(ROUTE)
  && /includes\(s\)/.test(ROUTE));

ok('🔴 AN ABSENT KEY IS use_of_home, so the shipped phone app keeps working untouched',
  /if \(!s\) return 'use_of_home'/.test(ROUTE));

ok('a browser form is answered with a 303 back to the screen, never with JSON it cannot read',
  /application\/x-www-form-urlencoded/.test(ROUTE) && /NextResponse\.redirect\(new URL\(`\$\{SCREEN\}/.test(ROUTE));

ok('🔴 THE REDIRECT TARGET IS A CONSTANT, never anything off the body',
  /const SCREEN = '\/app\/you\/elections'/.test(ROUTE) && !/redirect\(new URL\(String\(body/.test(ROUTE));

// ⚠️ SCOPED TO THE POST BODY. The first version searched the whole file and found gateForUser and
// writeAllowanceElection in the IMPORT LIST at the top, so it was comparing the order of two
// imports and reported it as the order of two checks. An ordering assertion has to be made inside
// the function whose order it is about.
const POST_BODY = ROUTE.slice(ROUTE.indexOf('export async function POST'), ROUTE.indexOf('export async function DELETE'));
ok('🔴 REMOVING IS NOT GATED AND ELECTING IS. Undoing a claim on his own record is never work we do for him',
  POST_BODY.indexOf("intent ?? '') === 'remove'") > 0
  && POST_BODY.indexOf("intent ?? '') === 'remove'") < POST_BODY.indexOf('gateForUser')
  && POST_BODY.indexOf('gateForUser') < POST_BODY.indexOf('writeAllowanceElection'));

ok('the trading allowance is written with no band at all',
  /writeAllowanceElection\(user\.id, key, startYear, null\)/.test(ROUTE));

// ---------------------------------------------------------------------------------------------
// 9. THE SCREEN. The first door either election has ever had on the web.
// ---------------------------------------------------------------------------------------------
const PAGE = read('app/app/you/elections/page.tsx');

ok('🔴 ZERO CLIENT JAVASCRIPT: every answer is a plain form post',
  !/'use client'/.test(PAGE) && !/onClick|onChange|useState|useEffect/.test(PAGE)
  && /action="\/api\/elections" method="post"/.test(PAGE));

ok('🔴 BOTH TOTALS ARE ON THE SCREEN, which is the whole reason it is shaped this way',
  /Your costs so far/.test(PAGE) && /The allowance/.test(PAGE)
  && /tradingAllowanceChoice/.test(PAGE));

ok('the replacement warning is on the screen, not only in the confirmation he sees afterwards',
  /It replaces your costs rather than joining them/.test(PAGE));

ok('a refusal is drawn in place from lib/elections.ts, never restated by the page',
  /electionRefusal\('trading_allowance', who\)/.test(PAGE)
  && /\{tradeRefusal\.message\}/.test(PAGE));

ok('🔴 AN UNREADABLE ELECTION IS SAID OUT LOUD, never drawn as "not claiming"',
  /could not read this one just now/.test(PAGE)
  && /rather than electing over the top of it/.test(PAGE));

ok('full relief offers no button, because there is no election to make',
  /choice\?\.fullRelief/.test(PAGE) && /nothing to elect here/.test(PAGE));

ok('the page is reachable: /app/you carries a door to it',
  /href="\/app\/you\/elections"/.test(read('app/app/you/page.tsx')));

// ---------------------------------------------------------------------------------------------
// 10. THE CLAIM THAT STARTED ALL OF THIS.
// ---------------------------------------------------------------------------------------------
// 🔴 STRIPPED, BECAUSE THE FIX'S OWN COMMENT QUOTES THE SENTENCE IT REMOVED. Reading the raw file
// would find "Lekhio uses it automatically" inside the paragraph explaining why that claim was
// false, and report the defect as still present. The mirror image of the trap
// test/onboardingweb.test.mjs records, where a guard went on passing against a comment quoting
// copy that had been deleted. Either way: a guard must read what ships, never the explanation.
const AGENT = strip(read('lib/agent.ts'));

ok('🔴 NOTHING ANYWHERE STILL SAYS LEKHIO APPLIES IT AUTOMATICALLY',
  !/Lekhio uses it automatically/.test(AGENT)
  && !/uses the flat £1,000 trading allowance instead/.test(AGENT));

ok('...and nothing tells him there is nothing for him to do about an election only he can make',
  !/Nothing for you to do\./.test(AGENT));

ok('the signal now says it is his election and names the door we actually built',
  /your election to make/.test(AGENT) && /You, then Allowances/.test(AGENT));

ok('🔴 AND THE DOOR IT NAMES EXISTS. A signal that points at a screen we have not built is the disease',
  /href="\/app\/you\/elections"/.test(read('app/app/you/page.tsx')));

ok('the signal leads with what it replaces, before what it is worth',
  /instead of your real costs rather than as well as them/.test(AGENT));

ok('taxengine.taxableTradingProfit is still not the door: nothing in app or lib calls it',
  !/taxableTradingProfit\(/.test(strip(read('lib/taxoptimiser.ts')))
  && !/taxableTradingProfit\(/.test(strip(read('lib/ledger.ts')))
  && !/taxableTradingProfit\(/.test(strip(read('lib/quarterpack.ts'))));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE TRADING ALLOWANCE OFFERED TO A MAN WITH AN EMPTY BOOK.
//
// Three months in with nothing logged: gross 0, costs 0, so 0 < 1,000 and the verdict came back
// 'allowance'. The screen told him the allowance beat his costs by a thousand pounds. It shelters
// nothing, and if he had been spending to get going it would have thrown away a carried loss.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\nNo income is nothing to judge, not a win for the allowance');
{
  const empty = X.tradingAllowanceChoice(0, 0, H6);
  ok('🔴 an empty book gets no recommendation at all', empty.better === 'too_early');
  ok('and it says which silence it is', empty.tooEarlyBecause === 'no_income');
  ok('no difference is quoted, because there is nothing to differ', empty.difference === 0);

  // The other direction, which is the one that costs him real money.
  const spending = X.tradingAllowanceChoice(0, 5000, H6);
  ok('🔴 nor is a man with start up spending and no income yet told to elect',
    spending.better === 'too_early' && spending.tooEarlyBecause === 'no_income');

  // CONTROL. The moment there IS income the comparison works exactly as it did.
  const real = X.tradingAllowanceChoice(40000, 300, H6);
  ok('CONTROL: with income on the board the allowance is recommended again',
    real.better === 'allowance' && real.tooEarlyBecause === null);
  const costly = X.tradingAllowanceChoice(40000, 9000, H6);
  ok('CONTROL: and real costs still beat it',
    costly.better === 'costs' && costly.tooEarlyBecause === null);

  // The three month floor is untouched and keeps its own reason.
  const early = X.tradingAllowanceChoice(40000, 300, H1);
  ok('CONTROL: the three month floor still fires, for its own reason',
    early.better === 'too_early' && early.tooEarlyBecause === 'not_enough_year');

  // The words. Telling a man with an empty book that there is "not enough of the year yet" answers
  // a question he did not ask: his year may be nearly over. What is missing is income, not time.
  ok('🔴 the empty book is told what is actually missing',
    /no trade income/i.test(X.tradingAllowanceOffer(empty))
    && !/not enough of the year/i.test(X.tradingAllowanceOffer(empty)));
  ok('and it names the loss he would be giving up', /carry/i.test(X.tradingAllowanceOffer(spending)));
  ok('CONTROL: the three month wording is unchanged',
    /not enough of the year/i.test(X.tradingAllowanceOffer(early)));
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);

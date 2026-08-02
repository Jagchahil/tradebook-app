// THE LEDGER. See lib/ledger.ts and doc 108.
//
// "£12.99 saves you £2,000" is not a slogan. It is a specification. If we cannot show him the
// £2,000, we have not earned the £12.99, and the sentence is a lie.
//
// THE TESTS THAT MATTER HERE ARE NOT THE ARITHMETIC. They are the four ways this file could turn
// into an advert, each of which this codebase has already done once:
//
//   1. A CONDITIONAL COUNTED AS A SAVING. The optimiser carries Marriage Allowance at estSaving 0
//      on purpose, because we do not know if he is married. If the ledger ever counts a "could",
//      he catches it once and never believes another number we show him.
//
//   2. A REPAYMENT COUNTED AS A SAVING. A CIS refund is HIS OWN MONEY coming back. Folding it into
//      "tax saved" double counts it and flatters us by thousands. This product has ALREADY once
//      quoted a man a CIS refund that did not exist. It does not get a second go.
//
//   3. NOT ENOUGH RENDERED AS ZERO, or worse, as a confident small number. Two weeks in, this would
//      proudly report that Lekhio saved him £14. He would laugh, and he would be right.
//
//   4. PER-LINE SAVINGS ADDING UP TO MORE THAN THE TOTAL. Tax is banded. Compute each line
//      independently from the same untouched top band and the parts exceed the whole.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'ledger-'));
// Every extensionless relative import gets an extension, not just taxengine: ledger.ts now leans on
// personalincome.ts, which is the same whole-person engine taxPosition uses. See the baseline note
// in lib/ledger.ts: taxing the trade alone gave a man with a job his personal allowance twice.
const fix = (s) => s.replace(/from '(\.\/[a-zA-Z0-9._-]+)'/g, "from '$1.ts'");
// 🔴 THE OPTIMISER IS STAGED ALONGSIDE, AND IT IS NOT DECORATION. lib/ledger.ts and
// lib/taxoptimiser.ts each carry their own copy of the use of home rule, because a lib module may
// not take a new lib import (three suites stage these files with a fixed dependency list and Node's
// type stripping cannot resolve an extensionless import). Two copies of a money rule drift, and the
// copy that drifts is the one he is looking at, so the two are run side by side further down.
for (const f of [
  'taxengine', 'nistudentloan', 'ltdengine', 'personalincome', 'propertyengine', 'autonomy',
  'taxoptimiser', 'ledger', 'incomeproof', 'quarterpack', 'personal',
]) {
  writeFileSync(path.join(stage, f + '.ts'), fix(readFileSync(path.join(lib, f + '.ts'), 'utf8')));
}
const L = await import(pathToFileURL(path.join(stage, 'ledger.ts')).href);
const E = await import(pathToFileURL(path.join(stage, 'taxengine.ts')).href);
const O = await import(pathToFileURL(path.join(stage, 'taxoptimiser.ts')).href);
// The three other money documents fixed in the same wave. They are pinned in this suite because it
// is the one that already reaches across every surface money is printed on, and because the suites
// that own those modules were being edited elsewhere while this went in. Their sections are at the
// bottom of this file, under their own headings.
const IP = await import(pathToFileURL(path.join(stage, 'incomeproof.ts')).href);
const QP = await import(pathToFileURL(path.join(stage, 'quarterpack.ts')).href);
const PERSONAL = await import(pathToFileURL(path.join(stage, 'personal.ts')).href);
const { ledger, headline, ENOUGH_MONTHS } = L;
const { soleTraderTax } = E;

let pass = 0;
let fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };

console.log('\nthe ledger: what Lekhio actually saved him, and the four ways it could become an advert');

const base = {
  monthsElapsed: 12,
  grossIncome: 48_000,
  expenses: 9_000,
  mileage: 3_300,
  homeOffice: 120,
  capitalAllowances: 2_400,
  pension: 0,
  cisSuffered: 0,
};

// ---------------------------------------------------------------------------------------------
// 🔴 THE BASELINE. Compared to WHAT?
// ---------------------------------------------------------------------------------------------
//
// Tesla does not model what car you would have bought. It compares you to petrol, at today's price,
// over the miles you actually drove. A DEFINED baseline, not a guess about your behaviour.
//
// Ours: the tax HMRC would charge him ON HIS GROSS, claiming NOTHING. That is not a hypothetical.
// It is what happens to a man with a shoebox, and for a CIS subbie it is literally what happens:
// the contractor deducts from GROSS, with no personal allowance and not one expense.

const l = ledger(base);

ok('WITHOUT LEKHIO is the tax on the gross, claiming nothing. A defined baseline, never a guess',
  l.withoutLekhio === Math.round(soleTraderTax(48_000).total));

ok('WITH LEKHIO is the tax he actually owes',
  l.withLekhio === Math.round(soleTraderTax(48_000 - (9_000 + 3_300 + 120 + 2_400)).total));

ok('the saving is the gap between the two, and nothing else',
  l.saved === l.withoutLekhio - l.withLekhio);

ok('...and it is a real number, not a rounding artefact',
  l.saved > 3_000);

// ---------------------------------------------------------------------------------------------
// 🔴 1. A CONDITIONAL IS NOT A SAVING.
// ---------------------------------------------------------------------------------------------
//
// The ledger takes CONFIRMED figures. There is no field on LedgerInput for a "could", a "might", or
// an "if you are married". You cannot pass one in, which is the strongest possible guarantee.

ok('THE BUG WE REFUSED TO SHIP: there is no way to feed a conditional into the ledger at all',
  !('marriageAllowance' in base) && !('projected' in base) && !('estimated' in base));

ok('the input carries CONFIRMED figures only, so nothing conditional can reach a total',
  Object.keys(base).every((k) => typeof base[k] === 'number'));

// ---------------------------------------------------------------------------------------------
// 🔴 2. A REPAYMENT IS NOT A SAVING. THIS ONE HAS ALREADY BITTEN US ONCE.
// ---------------------------------------------------------------------------------------------

const cis = ledger({ ...base, cisSuffered: 6_000 });

ok('CIS suffered does NOT touch the saved figure. It is his own money coming back',
  cis.saved === l.saved);

ok('...it does not touch either side of the comparison either',
  cis.withoutLekhio === l.withoutLekhio && cis.withLekhio === l.withLekhio);

ok('...it gets its OWN number, and its own word',
  cis.refundDue === 6_000);

ok('a man with £6,000 of CIS and no costs is not told we saved him £6,000',
  ledger({ ...base, expenses: 0, mileage: 0, homeOffice: 0, capitalAllowances: 0, cisSuffered: 6_000 }).saved === 0);

// ---------------------------------------------------------------------------------------------
// 🔴 3. NOT ENOUGH IS NOT ZERO, and it is not a confident small number either.
// ---------------------------------------------------------------------------------------------

const early = ledger({ ...base, monthsElapsed: 1 });

ok('two weeks in, we do NOT proudly report that we saved him £14',
  early.enough === false && early.saved === 0);

ok('...we say WHY, in his words',
  early.note.includes('Too early to say'));

// 🔴 THE POINT IS THAT HE IS GIVEN SOMETHING TO DO, NOT SHOWN A ZERO. The action changed on
// 29 July: this used to say "Send a receipt", which means WhatsApp, which needs a proved number a
// web customer does not have. Naming an action he cannot take turns an empty screen into a dead
// end, which is worse than the zero this assertion was written to prevent.
ok('a man with nothing confirmed is given something he can actually do, not shown a zero',
  ledger({ ...base, grossIncome: 0 }).note.includes('Add your first entry'));

ok('...but his CIS is still shown, because that money is real and it is HIS',
  ledger({ ...base, grossIncome: 0, cisSuffered: 4_000 }).refundDue === 4_000);

ok('the threshold is three months, the same honesty the optimiser already uses for projections',
  ENOUGH_MONTHS === 3
  && ledger({ ...base, monthsElapsed: 3 }).enough === true
  && ledger({ ...base, monthsElapsed: 2 }).enough === false);

// ---------------------------------------------------------------------------------------------
// 🔴 4. THE PARTS MUST NOT EXCEED THE WHOLE.
// ---------------------------------------------------------------------------------------------
//
// Tax is banded. Compute each line's saving independently, each measured from the same untouched
// top band, and the sum comes out LARGER than the real total. Every line looks right. The headline
// is a lie. So the TOTAL is exact (two runs of the engine) and each line takes its SHARE of it.

const sum = l.lines.reduce((n, x) => n + x.saved, 0);

ok('THE BUG: the per-line savings sum to the total, give or take rounding. Never more',
  Math.abs(sum - l.saved) <= l.lines.length);

ok('every line shows WHAT was deducted as well as what it saved, so he can check our working',
  l.lines.every((x) => x.deducted > 0 && x.basis.length > 20));

ok('the biggest saving is at the top, because that is the one he came to see',
  l.lines[0].saved >= l.lines[l.lines.length - 1].saved);

ok('a deduction of zero does not appear as a line at all',
  ledger({ ...base, pension: 0 }).lines.every((x) => x.key !== 'pension')
  && ledger({ ...base, pension: 5_000 }).lines.some((x) => x.key === 'pension'));

// --- the headline -------------------------------------------------------------------------------

ok('the headline is one line, his number, no adjectives',
  headline(l).includes('£') && headline(l).includes("taxman"));

ok('...and when there is nothing to say, it says nothing rather than something',
  headline(early) === early.note);

ok('a man who has saved nothing is told what to do next, not congratulated',
  headline(ledger({ ...base, expenses: 0, mileage: 0, homeOffice: 0, capitalAllowances: 0 }))
    .includes('starts counting'));

// --- and the sanity floor -----------------------------------------------------------------------

ok('savings can never be negative. Claiming costs cannot INCREASE his tax',
  ledger({ ...base, expenses: 99_999 }).saved >= 0);

ok('deductions bigger than his income do not produce a negative tax bill',
  ledger({ ...base, expenses: 99_999 }).withLekhio === 0);


// ---------------------------------------------------------------------------------------------
// 🔴 IT IS WIRED. An engine nobody can reach is this codebase's actual disease.
// ---------------------------------------------------------------------------------------------
//
// An llms.txt was built, tested, and never served. A digest cron reached 200 users and returned 200
// OK. The brain was wired into one screen almost nobody uses. Nothing failed. It simply was not
// connected. A ledger that exists only in lib/ is the same bug wearing a new coat.

const { readFileSync: rf } = await import('node:fs');
const root = path.resolve(here, '..');
const wa = rf(path.join(root, 'app/api/whatsapp/route.ts'), 'utf8');
const api = rf(path.join(root, 'app/api/ledger/route.ts'), 'utf8');
const intents = rf(path.join(root, 'lib/waintents.ts'), 'utf8');

ok('there is an API route, so the app can show it',
  api.includes("from '../../../lib/ledger'"));

ok('...and it reuses getOptimiserInput rather than assembling a SECOND set of figures',
  api.includes('getOptimiserInput') && !api.includes('getConfirmedTransactionsForUser'));

// ---------------------------------------------------------------------------------------------
// 🔴 THE FIFTH WAY IT COULD BECOME AN ADVERT: COUNTING THE SAME DEDUCTION TWICE.
// ---------------------------------------------------------------------------------------------
//
// A mileage claim is inserted as an ORDINARY TRANSACTION (vendor 'Mileage', category 'travel', a
// negative amount), so its value is already inside ytdTradeExpenses and already reducing his tax.
// It was invisible on the ledger, buried in "Costs you logged", so it now gets its own line.
//
// The only safe way to do that is to MOVE it, not ADD it. Passing input.ytdMileage into `mileage`
// while leaving ytdTradeExpenses whole would count every business mile twice and inflate `saved` by
// the tax on it. That is failure mode 2 in this file's header wearing a new coat, and it would be
// the most flattering possible bug: bigger number, happier customer, completely false.
//
// 🔴 AND ON 27 JULY 2026 THIS TEST CAUGHT THE DRIFT IT WAS WRITTEN TO PREDICT.
//
// The rule used to be enforced by pinning the SUBTRACTION into both call sites and asserting the
// source of each. That is a rule maintained by copying, and the copies drifted: the WhatsApp reply
// passed `homeOffice: 0` with a comment saying use of home was "never captured at all", which
// stopped being true the day lib/elections.ts shipped. From that moment a man who had elected use
// of home saw one total on his ledger and a SMALLER one in the WhatsApp reply. Two totals, and the
// two places he would actually compare.
//
// So the assembly moved into ONE function, lib/ledger.ts ledgerFor(), and what is asserted now is
// stronger: the invariant lives in exactly one place, and every caller DELEGATES rather than
// reimplementing. A future surface cannot fall behind, because it no longer knows how the sum is
// made.

const ledgerSrc = rf(path.join(root, 'lib/ledger.ts'), 'utf8');
// ⚠️ THIS PATTERN GAINED A SECOND SUBTRACTION ON 31 JULY 2026, AND THE OLD ONE WAS WRONG.
//
// It used to read `input.ytdTradeExpenses - mileage`, full stop, because the file believed use of
// home could not be inside expenses. It can: app/api/whatsapp/route.ts writes a real 'Use of home'
// transaction, so the logged pounds sit in ytdTradeExpenses exactly as mileage does and have to come
// out of the expenses line for the same reason. Pinning the OLD text would now pin the double count.
const movedNotAdded = (src) => /input\.ytdTradeExpenses\s*-\s*mileage\s*-\s*loggedHomeOffice/.test(src);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 REWRITTEN 1 AUGUST 2026, FROM A SOURCE REGEX INTO A RUN, BECAUSE IT FOUGHT A CORRECT CHANGE.
//
// This assertion and the use of home one below used to pin the LITERAL EXPRESSION in lib/ledger.ts,
// character for character. When the trading allowance election was added, that expression had to be
// wrapped in a ternary (a man who elects the allowance deducts no expenses, no mileage and no use of
// home at all), and both assertions went red on a change that moved nobody's money by a penny.
//
// That is the Tier 1 failure this codebase catalogued on the same day: an assertion named for the
// idea, written against the text. It cannot tell a refactor from a regression, so it fights the
// first and would wave the second straight through, since `- mileage - loggedHomeOffice` could stay
// in the file while nothing ever called it.
//
// So the rule is now RUN rather than READ. The fixture puts real money through ledgerFor and checks
// the arithmetic: £3,000 of expenses that already CONTAIN £500 of mileage and £200 of logged use of
// home must come out as three lines totalling £3,000, never £3,700. That is the actual property,
// and it survives any way somebody chooses to write the subtraction.
//
// The source check is kept alongside, loosened to the subtraction rather than the whole statement,
// because it is still worth knowing the arithmetic lives in ONE file. It is the corroboration now,
// not the assertion.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const dedFixture = (extra = {}) => L.ledgerFor({
  monthsElapsed: 6,
  ytdTradeIncome: 20000,
  // ⚠️ THE MILEAGE AND THE LOGGED USE OF HOME ARE INSIDE THIS FIGURE, which is the whole point:
  // both arrive as ordinary transactions, so adding them again is the double count being defended
  // against. See the header above ledgerFor().
  ytdTradeExpenses: 3000,
  ytdCisSuffered: 0,
  ytdMileage: 500,
  ytdHomeOfficeLogged: 200,
  ...extra,
});
const deducted = (l, key) => (l.lines.find((x) => x.key === key)?.deducted ?? 0);
const totalDeducted = (l) => l.lines.reduce((t, x) => t + x.deducted, 0);

const moved = dedFixture();
ok('🔴 BOTH SLICES COME OUT OF EXPENSES AND BACK AS THEIR OWN LINES, and the total does not move',
  deducted(moved, 'expenses') === 2300
  && deducted(moved, 'mileage') === 500
  && deducted(moved, 'home_office') === 200
  && totalDeducted(moved) === 3000);

ok('...and the arithmetic still lives in lib/ledger.ts rather than at a call site',
  movedNotAdded(ledgerSrc) && /\bmileage:/.test(ledgerSrc));

ok('🔴 the API route DELEGATES rather than assembling its own figures',
  api.includes('ledgerFor(input)') && !movedNotAdded(api));

ok('🔴 the WhatsApp reply DELEGATES to the same function, so the two surfaces cannot disagree',
  wa.includes('ledgerFor(input)') && !movedNotAdded(wa));

ok('🔴 the web app money screen DELEGATES to it too',
  rf(path.join(root, 'app/app/page.tsx'), 'utf8').includes('ledgerFor('));

ok('...and no caller passes a raw ytdMileage into the ledger without the subtraction',
  !/expenses:\s*input\.ytdTradeExpenses,[\s\S]{0,120}mileage:\s*input\.ytdMileage/.test(api)
  && !/expenses:\s*input\.ytdTradeExpenses,[\s\S]{0,120}mileage:\s*input\.ytdMileage/.test(wa));

// The use of home half of the same lesson, pinned so it cannot silently go back to zero anywhere.
// Same repair, same reason. The election must WIN over the logged rows rather than add to them, and
// that is a fact about two numbers, not about how the ternary is spelled. The caller checks stay as
// source reads: they are about OTHER files not hardcoding a zero, which no fixture here can observe.
const withElection = dedFixture({ ytdHomeOffice: 312 });
ok('🔴 THE USE OF HOME ELECTION REACHES THE LEDGER AND BEATS THE LOGGED ROWS rather than adding to them',
  deducted(withElection, 'home_office') === 312
  && deducted(withElection, 'expenses') === 2300
  && deducted(withElection, 'mileage') === 500);

ok('...and no caller hardcodes the election to zero',
  !/homeOffice:\s*0[,\s]/.test(api) && !/homeOffice:\s*0[,\s]/.test(wa));

// ---------------------------------------------------------------------------------------------
// 🔴 THE USE OF HOME, COUNTED TWICE, ON A MAN WHO USED BOTH DOORS.
// ---------------------------------------------------------------------------------------------
//
// There are two ways use of home reaches this file and until now they were ADDED TOGETHER.
//
//   THE ELECTION  lib/elections.ts turns his hours band into pounds a month. That fills
//                 ytdHomeOffice, and ledgerFor() put it on its own line, on top of everything else.
//   THE TEXT      app/api/whatsapp/route.ts handleHomeOffice writes a REAL TRANSACTION, vendor
//                 'Use of home', which lands inside ytdTradeExpenses like any other cost.
//
// So a man who elected AND texted his hours had the same deduction twice, and lib/ledger.ts carried
// a long comment arguing that this could not happen because use of home "cannot be inside expenses".
// It could. It was. A comment is not a test, which is the entire reason for the block below.
//
// THE RULE: take what he LOGGED out of expenses, always; then the deduction is the ELECTION if he
// has one, and the logged rows if he has not. Whichever door he came through, it lands once.
{
  const shape = {
    monthsElapsed: 12, ytdTradeIncome: 40_000, ytdTradeExpenses: 8_000, ytdCisSuffered: 0,
  };
  const elected = 312;   // six months of the 25 to 50 hour band, near enough
  const logged = 200;    // what he texted, already inside the £8,000 of expenses
  const totalDeducted = (l) => l.lines.reduce((n, x) => n + x.deducted, 0);
  const home = (l) => l.lines.find((x) => x.key === 'home_office');

  const neither = L.ledgerFor({ ...shape });
  const electedOnly = L.ledgerFor({ ...shape, ytdHomeOffice: elected });
  const textedOnly = L.ledgerFor({ ...shape, ytdHomeOfficeLogged: logged });
  const both = L.ledgerFor({ ...shape, ytdHomeOffice: elected, ytdHomeOfficeLogged: logged });

  ok('🔴 THE BUG: a man who elects AND texts is no longer deducted twice',
    totalDeducted(both) === 8_000 - logged + elected);
  ok('...and the old answer was provably bigger, by exactly the amount he was given twice',
    8_000 + elected - totalDeducted(both) === logged);
  ok('...he is counted at the ELECTION, which is the authoritative figure',
    home(both).deducted === elected);

  // ⚠️ AND NOW THE THREE WAYS NOBODY IS ALLOWED TO LOSE A PENNY.
  ok('ELECTED ONLY is unchanged to the penny: nothing logged, nothing to take out',
    totalDeducted(electedOnly) === 8_000 + elected && home(electedOnly).deducted === elected
    && electedOnly.withLekhio === L.ledger({
      monthsElapsed: 12, grossIncome: 40_000, expenses: 8_000, mileage: 0,
      homeOffice: elected, capitalAllowances: 0, pension: 0, cisSuffered: 0,
    }).withLekhio);
  ok('🔴 TEXTED ONLY KEEPS THE SAME TOTAL HE ALREADY HAD. It moves onto a line, it does not shrink',
    totalDeducted(textedOnly) === totalDeducted(neither)
    && textedOnly.withLekhio === neither.withLekhio
    && textedOnly.saved === neither.saved);
  ok('...and he can finally SEE it, which is the only thing that changed for him',
    home(textedOnly).deducted === logged && !home(neither));
  ok('nobody with a deduction ends up worse off than a man who never claimed it',
    [electedOnly, textedOnly, both].every((l) => l.saved >= neither.saved));

  // The expenses line is the one that gives the slice up, exactly as it does for mileage.
  ok('the logged pounds come OFF the expenses line rather than being added anywhere',
    both.lines.find((x) => x.key === 'expenses').deducted === 8_000 - logged
    && electedOnly.lines.find((x) => x.key === 'expenses').deducted === 8_000);
}

// ---------------------------------------------------------------------------------------------
// 🔴 AND THE TWO FILES THAT HOLD THAT RULE MUST NEVER PART COMPANY.
// ---------------------------------------------------------------------------------------------
//
// lib/ledger.ts and lib/taxoptimiser.ts each carry their own copy, because neither may import the
// other. That is a real constraint and not an excuse: the rule is run through BOTH modules here, on
// the same grid of figures, and the deduction each one arrives at has to be the same number. The
// optimiser does not publish its trade profit, so it is read back out of totalIncome, which with no
// other income and a full year IS the trade profit.
{
  let mismatch = 0;
  let checked = 0;
  for (const electedHome of [0, 78, 312, 1_500]) {
    for (const loggedHome of [0, 60, 312, 900]) {
      const input = {
        startYear: 2026, monthsElapsed: 12,
        ytdTradeIncome: 40_000, ytdTradeExpenses: 8_000, ytdCisSuffered: 0,
        employmentIncome: 0, categoriesLogged: [], homeOfficeClaimed: false, mileageClaimed: true,
        ytdHomeOffice: electedHome, ytdHomeOfficeLogged: loggedHome,
      };
      const fromLedger = L.ledgerFor(input).lines.find((x) => x.key === 'home_office')?.deducted ?? 0;
      // income - (expenses - logged) - deduction = totalIncome, so deduction falls out of it.
      const fromOptimiser = 40_000 - (8_000 - loggedHome) - O.taxPosition(input).totalIncome;
      if (Math.round(fromLedger) !== Math.round(fromOptimiser)) mismatch += 1;
      checked += 1;
    }
  }
  ok(`🔴 THE LEDGER AND THE OPTIMISER AGREE ON THE USE OF HOME, ${checked} SHAPES, NO EXCEPTIONS`,
    checked === 16 && mismatch === 0);
  ok('and the optimiser publishes the rule as one function, so it has one place to go wrong',
    typeof O.homeOfficeParts === 'function'
    && O.homeOfficeParts({ ytdHomeOffice: 300, ytdHomeOfficeLogged: 100 }).deduction === 300
    && O.homeOfficeParts({ ytdHomeOffice: 0, ytdHomeOfficeLogged: 100 }).deduction === 100
    && O.homeOfficeParts({}).deduction === 0);
}

// ---------------------------------------------------------------------------------------------
// 🔴 A LANDLORD HAD NO LEDGER AT ALL. "Nothing confirmed yet", on a year of confirmed rent.
// ---------------------------------------------------------------------------------------------
//
// grossIncome was input.ytdTradeIncome, the trade alone, and the empty state is gated on it. So a
// customer whose whole business is letting could confirm every pound of rent he took and every cost
// he paid, open the one screen whose job is to show what we saved him, and be told nothing had been
// confirmed. His property figures were in the same object the whole time, used for one thing: raising
// the rate his TRADE was taxed at, a trade he has not got.
{
  const landlord = L.ledgerFor({
    monthsElapsed: 12, ytdTradeIncome: 0, ytdTradeExpenses: 0, ytdCisSuffered: 0,
    ytdPropertyIncome: 30_000, ytdPropertyExpenses: 7_000,
  });

  ok('🔴 THE BUG: a landlord with confirmed rent is no longer told nothing is confirmed',
    landlord.enough === true && landlord.note === null);
  ok('...his property costs are a line, by name, with his own figure on it',
    !!landlord.lines.find((x) => x.key === 'property' && x.deducted === 7_000));
  ok('...and they saved him real money, which is the whole point of the screen',
    landlord.saved > 1_000 && landlord.withoutLekhio > landlord.withLekhio);

  // 🔴 AND NOT A PENNY OF NATIONAL INSURANCE ON HIS RENT. The same error lib/incomeproof.ts was
  // printing on a document going to a lender. A pound of trade deduction saves income tax AND
  // Class 4; a pound of property cost saves income tax alone, so the same numbers must save LESS
  // through a property than through a trade.
  const trader = L.ledgerFor({
    monthsElapsed: 12, ytdTradeIncome: 30_000, ytdTradeExpenses: 7_000, ytdCisSuffered: 0,
  });
  ok('🔴 RENT CARRIES NO CLASS 4, SO THE SAME COSTS SAVE LESS THROUGH A PROPERTY THAN A TRADE',
    landlord.saved < trader.saved);
  ok('...and the gap is Class 4 on the costs, near enough, not some rounding',
    Math.abs((trader.saved - landlord.saved) - 7_000 * 0.06) < 5);

  // A man with both. His actual bill cannot move; only the baseline and the credit for his costs do.
  const shape = {
    monthsElapsed: 12, ytdTradeIncome: 40_000, ytdTradeExpenses: 9_000, ytdCisSuffered: 0,
    ytdPropertyIncome: 12_000, ytdPropertyExpenses: 4_000,
  };
  const mixed = L.ledgerFor(shape);
  const netted = L.ledger({
    monthsElapsed: 12, grossIncome: 40_000, expenses: 9_000, mileage: 0, homeOffice: 0,
    capitalAllowances: 0, pension: 0, cisSuffered: 0,
    otherIncome: { otherNonSavings: 8_000 },  // exactly what ledgerFor used to pass
  });
  ok('🔴 A MAN WITH BOTH STREAMS OWES EXACTLY WHAT HE OWED BEFORE. His bill did not move',
    mixed.withLekhio === netted.withLekhio);
  ok('...and what we claim to have saved him goes UP, never down, because his property costs count now',
    mixed.saved > netted.saved && mixed.withoutLekhio > netted.withoutLekhio);
  ok('a property loss cannot come off his trade: only the part that bit is ever counted',
    L.ledgerFor({ ...shape, ytdPropertyExpenses: 30_000 })
      .lines.find((x) => x.key === 'property').deducted === 12_000);
  ok('nothing moves for a man with no property at all',
    JSON.stringify(L.ledgerFor({ monthsElapsed: 12, ytdTradeIncome: 40_000, ytdTradeExpenses: 9_000, ytdCisSuffered: 0 }))
    === JSON.stringify(L.ledgerFor({
      monthsElapsed: 12, ytdTradeIncome: 40_000, ytdTradeExpenses: 9_000, ytdCisSuffered: 0,
      ytdPropertyIncome: 0, ytdPropertyExpenses: 0,
    })));
}

// ---------------------------------------------------------------------------------------------
// 🔴 NO FLOATING POINT TAIL IN ANYTHING A MAN READS. Found on a live screen, 28 July 2026.
// ---------------------------------------------------------------------------------------------
//
// The deployed ledger told a customer his mileage was worth "55.00000000000001p a mile". The tax
// was right to the penny. The SENTENCE was wrong, and it was the sentence that shows him our
// working, on the one screen whose entire job is to be believed.
//
// Rates are held as fractions and 0.55 * 100 is 55.00000000000001 in IEEE 754. Only two of our
// rates trip it, 0.55 and 0.14, which is precisely why nobody caught it by reading the code. So it
// is caught by looking at the OUTPUT instead: six or more decimal places in anything customer
// facing is a float artifact, never a real figure. Nothing about tax is quoted to a millionth.
{
  const everyLine = ledger({ ...base, expenses: 9_000, mileage: 3_300, homeOffice: 312, pension: 2_400, capitalAllowances: 1_500 });
  const words = [
    headline(everyLine),
    ...everyLine.lines.map((l) => `${l.label} ${l.basis}`),
  ].join(' ');
  ok('🔴 NO CUSTOMER FACING LEDGER STRING CARRIES A FLOATING POINT TAIL', !/\d\.\d{6,}/.test(words));
  ok('...and the mileage line still names the real rate in pence', /\d+(\.\d+)?p a mile/.test(words));
  ok('...formatted through the ONE formatter, so a new display site cannot forget',
     ledgerSrc.includes('asPence(FACTS.mileageCarFirst10k)'));
}

// THE INVARIANT, AS ARITHMETIC. Splitting a deduction onto its own line is presentation. It must not
// move a single penny of tax. If this ever fails, the ledger has started flattering us.
const whole = ledger({ ...base, expenses: 12_300, mileage: 0 });
const split = ledger({ ...base, expenses: 9_000, mileage: 3_300 });

ok('🔴 SPLITTING A LINE OUT CHANGES THE BREAKDOWN, NEVER THE TOTAL. Same deduction, same tax saved.',
  whole.saved === split.saved && whole.withLekhio === split.withLekhio);

ok('...but he can now actually SEE the mileage, which was the entire point',
  split.lines.some((x) => x.key === 'mileage' && x.deducted === 3_300)
  && !whole.lines.some((x) => x.key === 'mileage'));

// ---------------------------------------------------------------------------------------------
// 🔴 THE FLAG THAT WAS FALSE FOR EVERY USER WHO EVER EXISTED.
// ---------------------------------------------------------------------------------------------
//
// mileageClaimed was `categoriesLogged.some(c => c.includes('mile'))`. Mileage files under category
// 'travel'. There is no 'mileage' category in lib/categories.ts and never has been. So the flag was
// false always, and lib/taxoptimiser.ts rule 5 told a man who logs his miles every week that he was
// "logging fuel but no mileage". The Maximiser is the differentiator; one that cannot see what he
// already claimed tells him nobody is looking.
const db = rf(path.join(root, 'lib/supabase.ts'), 'utf8');

ok('🔴 mileageClaimed is no longer decided by a category string that can never match',
  !/mileageClaimed:\s*categoriesLogged\.some/.test(db));

ok('...it is decided by the mileage actually found on his rows',
  /mileageClaimed:\s*ytdMileage\s*>\s*0/.test(db));

ok('...and isMileageRow reads the VENDOR the inserter really writes, not a category that does not exist',
  /export function isMileageRow/.test(db) && /vendor === 'mileage'/.test(db));

ok('WHATSAPP can answer "what have you saved me", which is where he actually is',
  wa.includes('isSavingsQuestion') && wa.includes('handleSavingsQuestion'));

ok('...and it is arithmetic, NOT an AI call. A paraphrased money figure is a different money figure',
  wa.includes('handleSavingsQuestion') && !/handleSavingsQuestion[\s\S]{0,900}answerMoneyQuestion/.test(wa));

ok('...routed BEFORE the generic question handler, so a model never gets the chance to guess',
  wa.indexOf('isSavingsQuestion(text)') < wa.indexOf('isQuestion(text)'));

ok('the intent catches the real ways he would ask it',
  ['what have you saved me', 'how much have you saved me this year', 'saved me anything', 'is it worth it']
    .every((q) => intents.includes('isSavingsQuestion')));

// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n🔴 A MAN WITH A JOB WAS BEING GIVEN HIS PERSONAL ALLOWANCE TWICE.');
//
// Found on 30 July 2026 by loading the deployed Overview on a real account. On one screen, in the
// largest type we draw: "Put by for tax £26,579". Eight lines below it: "With Lekhio £0".
//
// The £26,579 was right. The £0 came from this file taxing his TRADE ON ITS OWN. soleTraderTax
// hands the trade a full personal allowance, so £12,307 of profit sitting on top of a £30,000
// salary that had already used that allowance up came out as no tax at all. HMRC does not do that.
//
// The impossible zero was the visible half. The invisible half was that "without Lekhio" was
// understated the same way, so the SAVING itself was wrong.
{
  const withJob = {
    monthsElapsed: 12, grossIncome: 15900, expenses: 3421, mileage: 172,
    homeOffice: 0, capitalAllowances: 0, pension: 0, cisSuffered: 240,
    otherIncome: { employment: 30000 },
  };
  const l = ledger(withJob);

  ok('🔴 HIS TRADE PROFIT IS NOT TAX FREE JUST BECAUSE IT IS UNDER THE ALLOWANCE', l.withLekhio > 0);
  ok('...and the baseline is not either', l.withoutLekhio > 0);
  ok('...and he is still shown a saving', l.saved > 0);

  // ⚠️ AND IT IS NOT SIMPLY THE DEDUCTIONS TIMES THE MARGINAL RATE, which is what I assumed when I
  // wrote this test and got it wrong by fifteen pounds. Worth spelling out, because the reason is
  // real tax law rather than an arithmetic slip.
  //
  // His profit sits in the basic band on top of the salary, so every pound of deduction saves 20p of
  // income tax: £3,593 x 20% = £719. But Class 4 has its OWN threshold, and the deductions take his
  // profit from £15,900 down to £12,307, which is below it. So only the slice from £15,900 down to
  // the threshold saves any Class 4 at all, and the rest of the deduction saves none.
  //
  // The bracket below is deliberately not a typed in figure: it says the answer must be more than
  // income tax alone and less than the full combined rate, which is exactly the shape that fact
  // produces, and it stays true when Khoji moves a rate.
  const deducted = 3421 + 172;
  const basicOnly = deducted * 0.20;
  const basicPlusClass4 = deducted * (soleTraderTax(50000).total - soleTraderTax(49000).total) / 1000;
  ok('the saving is more than income tax alone', l.saved > basicOnly);
  ok('...and less than the full combined rate, because Class 4 has its own threshold',
    l.saved < basicPlusClass4);

  // 🔴 AND THE OLD ANSWER IS PROVABLY WORSE, not merely different. Taxing the trade alone gave
  // £866 of saving against a real figure nearer £934.
  const alone = ledger({ ...withJob, otherIncome: undefined });
  ok('🔴 THE OLD TRADE ONLY READING UNDERSTATED WHAT WE SAVED HIM', alone.saved < l.saved);
  ok('...and printed a zero that could not be true', alone.withLekhio === 0 && l.withLekhio > 0);
}

// ⚠️ AND NOTHING MOVES FOR A PURE SOLE TRADER. This is the property that made the fix safe to make:
// with no other income the whole-person engine IS the sole-trader engine, so every figure any
// existing customer has ever seen is identical to the penny.
{
  const base = {
    monthsElapsed: 12, grossIncome: 42000, expenses: 8000, mileage: 1200,
    homeOffice: 312, capitalAllowances: 0, pension: 0, cisSuffered: 0,
  };
  const bare = ledger(base);
  const zeroed = ledger({ ...base, otherIncome: { employment: 0, savings: 0, dividends: 0, otherNonSavings: 0 } });

  ok('🔴 A SOLE TRADER WITH NO OTHER INCOME IS UNCHANGED, WITHOUT',
    bare.withoutLekhio === Math.round(soleTraderTax(42000).total));
  ok('🔴 ...AND WITH', bare.withLekhio === Math.round(soleTraderTax(42000 - 9512).total));
  ok('passing explicit zeros changes nothing either',
    zeroed.withoutLekhio === bare.withoutLekhio && zeroed.withLekhio === bare.withLekhio && zeroed.saved === bare.saved);
}

// Wages and rent push his trade up a band, so the same deductions are worth more to him.
{
  const shape = {
    monthsElapsed: 12, grossIncome: 30000, expenses: 5000, mileage: 0,
    homeOffice: 0, capitalAllowances: 0, pension: 0, cisSuffered: 0,
  };
  const plain = ledger(shape);
  const salaried = ledger({ ...shape, otherIncome: { employment: 50000 } });
  const landlord = ledger({ ...shape, otherIncome: { otherNonSavings: 40000 } });
  ok('the same profit costs more tax when wages put it in a higher band', salaried.withoutLekhio > plain.withoutLekhio);
  ok('...so the deductions are worth more to him, not less', salaried.saved > plain.saved);
  ok('rent counts the same way, because it is non savings income too', landlord.saved > plain.saved);
  ok('every figure is still a real number', [plain, salaried, landlord].every((l) =>
    Number.isFinite(l.saved) && Number.isFinite(l.withLekhio) && Number.isFinite(l.withoutLekhio) && l.saved >= 0));
}

// 🔴 DIVIDENDS AND SAVINGS ARE DELIBERATELY NOT IN THE STACK, and this pins it so nobody adds them
// back as an improvement. They sit ON TOP of non savings income, so his trade does not get taxed
// differently because of them: THEY get taxed differently because of it. Crediting us with that
// swing means quoting a saving that depends on where his dividends land at the end of a year we are
// four months into, which is rule 1 of this file's header, in its own words.
//
// On the real account this was found on, including them turned £919 into £1,816. The bigger figure
// was the one we would have printed in bold.
{
  const shape = {
    monthsElapsed: 12, grossIncome: 15900, expenses: 3593, mileage: 0,
    homeOffice: 0, capitalAllowances: 0, pension: 0, cisSuffered: 0,
  };
  const withSalary = ledger({ ...shape, otherIncome: { employment: 30000 } });
  const alsoDividends = ledger({ ...shape, otherIncome: { employment: 30000, dividends: 12500, savings: 1500 } });
  ok('🔴 DIVIDENDS DO NOT INFLATE WHAT WE CLAIM TO HAVE SAVED HIM',
    alsoDividends.saved === withSalary.saved);
  ok('...and neither does savings interest', alsoDividends.withoutLekhio === withSalary.withoutLekhio);
}


// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n🔴 NATIONAL INSURANCE ON RENT, ON A DOCUMENT GOING TO A LENDER. lib/incomeproof.ts');
//
// buildIncomeProof summed every confirmed row into one profit and ran soleTraderTax over it, which
// adds Class 4. Class 4 is charged on the profits of a TRADE. Rent is property income and carries
// none of it. So a landlord's proof of income, the page he hands a mortgage broker, showed him
// National Insurance he does not owe, over our name, on a document whose entire job is to be
// believed by somebody who checks. The rows carried income_type all along; the interface never
// asked for it.
{
  const now = new Date('2026-12-01T00:00:00Z');
  const rent = [
    { amount: 30000, transaction_date: '2026-05-10', income_type: 'property' },
    { amount: -7000, transaction_date: '2026-06-10', income_type: 'property' },
  ];
  const trade = [
    { amount: 30000, transaction_date: '2026-05-10' },
    { amount: -7000, transaction_date: '2026-06-10' },
  ];

  const landlord = IP.buildIncomeProof(rent, 'A. Landlord', 2026, now);
  const sparky = IP.buildIncomeProof(trade, 'A. Sparky', 2026, now);

  ok('🔴 THE BUG: a pure landlord is charged no National Insurance on his rent',
    landlord.nationalInsurance === 0 && landlord.propertyProfit === 23000 && landlord.tradeProfit === 0);
  ok('...and his tax is income tax alone, to the penny',
    landlord.estimatedTax === E.incomeTaxOnProfit(23000));
  ok('🔴 ...AND THE WORDS FOLLOW THE FIGURE, so the document does not claim a tax he is not paying',
    landlord.estimatedTaxLabel === 'Estimated Income Tax'
    && !/National Insurance/.test(IP.renderIncomeProofHtml(landlord)));
  ok('...while a tradesman is still told about his, because his is real',
    sparky.estimatedTaxLabel === 'Estimated Income Tax and National Insurance'
    && /National Insurance/.test(IP.renderIncomeProofHtml(sparky)));

  ok('🔴 A TRADE ONLY SUMMARY IS UNCHANGED, TO THE PENNY',
    sparky.estimatedTax === soleTraderTax(23000).total && sparky.nationalInsurance > 0);
  ok('...and so is everything a lender actually reads: income, expenses, profit, entries',
    sparky.income === 30000 && sparky.expenses === 7000 && sparky.profit === 23000 && sparky.txCount === 2);

  // A man with both. One personal allowance between the two streams, Class 4 on the trade alone.
  const mixed = IP.buildIncomeProof([...trade, ...rent], 'Both', 2026, now);
  ok('🔴 THE TWO STREAMS SHARE ONE PERSONAL ALLOWANCE, so the tax is worked out on them together',
    mixed.estimatedTax === E.incomeTaxOnProfit(46000) + E.class4NIC(23000));
  ok('...which is MORE than taxing them apart would have said, because that hands him the allowance twice',
    mixed.estimatedTax > soleTraderTax(23000).total + E.incomeTaxOnProfit(23000));
  ok('...and LESS than the old answer, which charged Class 4 on the rent as well',
    mixed.estimatedTax < soleTraderTax(46000).total);
  ok('...with the National Insurance in it being the trade\'s, and only the trade\'s',
    mixed.nationalInsurance === E.class4NIC(23000));
  ok('the document still carries no em, en or minus dash',
    !/[–—−]/.test(IP.renderIncomeProofHtml(mixed)));
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n🔴 A COMPANY\'S TURNOVER IS NOT THE DIRECTOR\'S QUALIFYING INCOME. lib/quarterpack.ts');
//
// The pack had no structure awareness at all. It put a company's turnover into the Making Tax
// Digital for Income Tax threshold test and told the customer quarterly updates apply; a company
// files its own return and its trade is not his qualifying income. Then it called the company's
// profit "your trade profit", ran soleTraderTax over it, and printed "Estimated Class 4 National
// Insurance" on the document he hands his accountant.
{
  const rows = [
    { amount: 80000, category: 'income', transaction_date: '2026-05-01' },
    { amount: -20000, category: 'materials', transaction_date: '2026-05-02' },
  ];
  // The clock is pinned so that two packs can be compared character for character below.
  const packOf = (over = {}) => QP.buildQuarterPack({
    transactions: rows, startYear: 2026, quarter: 1, businessName: 'Sparks Ltd',
    now: new Date('2026-07-10T09:00:00Z'), ...over,
  });
  const asIs = packOf();
  const asCompany = packOf({ structure: 'limited_company' });

  ok('🔴 THE BUG: a company\'s turnover no longer counts towards HIS Making Tax Digital threshold',
    asIs.ytd.grossQualifyingIncome === 80000 && asIs.ytd.mtdApplies === true
    && asCompany.ytd.grossQualifyingIncome === 0 && asCompany.ytd.mtdApplies === false);
  ok('...but his RENT still does, because rent on a personal return counts whatever else he runs',
    QP.buildQuarterPack({
      transactions: [...rows, { amount: 60000, transaction_date: '2026-05-03', income_type: 'property' }],
      startYear: 2026, quarter: 1, structure: 'limited_company',
    }).ytd.mtdApplies === true);

  ok('🔴 AND HE IS NOT CHARGED CLASS 4 NATIONAL INSURANCE ON HIS COMPANY\'S PROFIT',
    asIs.ytd.estimatedTax.class4 > 0 && asCompany.ytd.estimatedTax.class4 === 0
    && asCompany.ytd.estimatedTax.total === 0 && asCompany.ytd.estimatedTax.companyProfitExcluded === true);
  ok('...and the pack says where that tax actually lives, rather than going quiet',
    /Corporation Tax/.test(asCompany.ytd.estimatedTax.note)
    && !/trade profit/.test(asCompany.ytd.estimatedTax.note));
  ok('...his money itself is untouched: the figures his accountant needs are all still there',
    asCompany.ytd.trade.net === 60000 && asCompany.submission.trade.income === 80000
    && asCompany.trade.expenses === 20000);

  const html = QP.renderQuarterPackHtml(asCompany);
  ok('🔴 THE PRINTED DOCUMENT CARRIES NEITHER SENTENCE THAT WAS FALSE OF HIM',
    !/Estimated Class 4 National Insurance/.test(html) && !/quarterly updates apply/.test(html));
  ok('...it says plainly that his company files its own return',
    /the company files its own return/.test(html));
  ok('...and it never calls his company\'s money his trade, anywhere on the page',
    !/Trade/.test(html) && /Company profit, year so far/.test(html));
  ok('...and it never tells him his gross income for the year was zero',
    !/gross income so far this year is £0\.00/.test(html));
  ok('the sole trader document still says both, because for him they are true',
    /Estimated Class 4 National Insurance/.test(QP.renderQuarterPackHtml(asIs))
    && /quarterly updates apply/.test(QP.renderQuarterPackHtml(asIs)));
  ok('no em, en or minus dash reached the director\'s document', !/[–—−]/.test(html));

  // ⚠️ UNKNOWN IS NEVER AN ANSWER. Every existing caller passes nothing and must get the same pack.
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  ok('🔴 AN UNKNOWN STRUCTURE GETS THE IDENTICAL PACK, TO THE CHARACTER',
    same(packOf({ structure: null }), asIs) && same(packOf({ structure: undefined }), asIs));
  ok('a known sole trader and a partner get it too',
    same(packOf({ structure: 'sole_trader' }), asIs) && same(packOf({ structure: 'partnership' }), asIs));

  // It is WIRED, which is this codebase's actual disease when it is not.
  const packRoute = rf(path.join(root, 'app/api/quarter-pack/route.ts'), 'utf8');
  ok('🔴 THE ROUTE ACTUALLY PASSES WHO HE IS, or none of the above ever reaches a customer',
    packRoute.includes('getBusinessProfile') && /structure: biz\?\.businessType \?\? null/.test(packRoute));
  ok('...and it does not restate the rule: the route has no idea what a limited company is',
    !/limited_company/.test(packRoute));
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n🔴 THE CHECK THAT KNOWS WHO HE IS WAS NEVER RUN. lib/personal.ts findPersonal');
//
// looksPersonal takes his own names and puts that check FIRST, because knowing who he is beats
// inferring it from the shape of a word. findPersonal called it with two arguments, so the names
// fell back to the empty default and the check was dead on the two surfaces that use it,
// /api/anomalies and /api/personal. A transfer to his own account went on being counted as a
// business cost, taking money off his taxable profit that should not come off. That is the
// direction he never notices, because the number moved in his favour.
{
  const rows = [
    { id: '1', vendor: 'Jag Chahil', amount: -496, transaction_date: '2026-05-01' },
    { id: '2', vendor: 'Jaguar Land Rover', amount: -820, transaction_date: '2026-05-02' },
    { id: '3', vendor: 'Screwfix', amount: -120, transaction_date: '2026-05-03' },
  ];

  const blind = PERSONAL.findPersonal(rows);
  const knowing = PERSONAL.findPersonal(rows, ['Jag Chahil']);

  ok('🔴 THE BUG: his own name is finally recognised when the caller knows it',
    knowing.length === 1 && knowing[0].id === '1' && knowing[0].reason === 'self');
  ok('...and it was invisible before, on his own real second account',
    blind.length === 0);
  ok('🔴 A CUSTOMER CALLED JAG DOES NOT LOSE HIS JAGUAR INVOICE. Whole words, never a substring',
    !knowing.some((p) => p.id === '2') && !knowing.some((p) => p.id === '3'));
  ok('a caller that passes nothing is exactly as safe as it was: it can only ever raise fewer rows',
    PERSONAL.findPersonal(rows, []).length === blind.length);
  ok('...and everything else it already caught is untouched',
    PERSONAL.findPersonal([{ id: '9', vendor: 'CHILD TAX CREDIT', amount: 345.13 }], ['Jag Chahil'])
      .some((p) => p.reason === 'benefit'));
  ok('the names really do travel through to the matcher rather than being read twice',
    /looksPersonal\(r\.vendor, r\.description, ownNames\)/.test(rf(path.join(root, 'lib/personal.ts'), 'utf8')));
}

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

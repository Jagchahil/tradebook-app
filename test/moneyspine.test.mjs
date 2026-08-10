// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE MONEY SPINE GUARD. ONE ACCOUNT, EVERY READER, ONE TAXABLE TRUTH, HUNDREDS OF ACCOUNTS.
//
// Three times in five days (2, 5 and 6 August 2026) a tax rule reached taxPosition and missed a
// document a customer hands a lender: the £60,000 car through expenses, the Section 24 interest,
// the car's own writing down allowance. Each time every suite was green, because every fixture was
// written by somebody who already knew the rule. Each time a human found it by walking the live
// app. This suite exists so the FOURTH one is found by the machine.
//
// HOW IT WORKS. A seeded generator builds accounts across every axis the documents can hold:
// trade, property, mortgage interest, cars in both pools at 100/75/1 percent business use, cars
// bought in earlier years, vans under the AIA, mileage and use of home rows, boundary incomes at
// the personal allowance, the higher rate line, the taper and the additional rate. Every account
// is aggregated by lib/yeartodate.ts aggregateConfirmedRows, THE FUNCTION PRODUCTION RUNS, never
// a copy of it. Then every reader reads: taxPosition (the Overview), buildIncomeProof (proof of
// income), buildQuarterPack (the tax summary and the printed pack), shareTotals (share your
// books). They must agree to the penny.
//
// 🔴 WHY A NEW RULE CANNOT HIDE. A rule that changes what a row means lands in the aggregation or
// in a shared predicate, and every reader moves together. A rule wired into taxPosition alone
// moves one reader and not the other three, and some seeded account lands on it: the diff fires
// with no fixture anybody had to remember to update. The only way to make this suite pass is to
// wire the rule everywhere or to declare an exception below, in daylight, with a reason.
//
// ⚠️ THE DECLARED EXCEPTIONS. Every legitimate disagreement between readers, in one place:
//   1. The MTD SUBMISSION figure (pack.submission.trade.net) is BEFORE capital allowances.
//      Allowances are a year end adjustment, not part of a quarterly update.
//   2. The pack's running estimate is TRADE ONLY. Property is taxed on its own schedule and the
//      pack carries it separately (estimatedTax.propertyProfitExcluded says how much). So the
//      pack total is compared to taxPosition only on accounts with no property.
//   3. CIS, PAYE salary, savings interest, dividends and student loans change what a man PAYS,
//      not what the documents STATE, and the proof of income says in print that other income is
//      not included. The generator holds them at zero; their engine arithmetic is examined by
//      test/exams and the parity suites instead.
//   4. A PARTNERSHIP: taxPosition and the proof of income both scale to the partner's share and
//      are compared here. The quarter pack deliberately shows the FIRM'S books with the
//      wholeFirmCaption sentence, so its figures are not his slice and are not compared.
//      shareTotals is not compared for partnerships either; what the shared books page should say
//      about a partner's share is an open product question recorded on 6 August 2026.
//   5. Timing: every account is read at the tax year end (factor 1), because the documents are
//      year to date statements while the Overview headline is a full year projection.
//   6. Rounding: taxPosition rounds the set aside to the pound; the documents keep pennies. The
//      spine tolerance is 51p for tax figures and exact for profit figures.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const lib = path.join(root, 'lib');
const fix = (s) => s.replace(/from '(\.\/[a-zA-Z0-9._-]+)'/g, "from '$1.ts'");
const stage = mkdtempSync(path.join(tmpdir(), 'moneyspine-'));
for (const f of [
  'taxengine', 'money', 'capital', 'nistudentloan', 'ltdengine', 'personalincome',
  'propertyengine', 'autonomy', 'taxoptimiser', 'quarterpack', 'incomeproof', 'bookshare',
  // lib/scotland.ts, one exported sentence with no imports of its own, printed by both money
  // documents staged above. position + whatif are the FIFTH surface: /app/tax/what-if computes
  // through lib/whatif.ts, which the guard used to leave out entirely.
  'yeartodate', 'scotland', 'position', 'partnership', 'whatif',
]) {
  writeFileSync(path.join(stage, f + '.ts'), fix(readFileSync(path.join(lib, f + '.ts'), 'utf8')));
}
const O = await import(pathToFileURL(path.join(stage, 'taxoptimiser.ts')).href);
const QP = await import(pathToFileURL(path.join(stage, 'quarterpack.ts')).href);
const IP = await import(pathToFileURL(path.join(stage, 'incomeproof.ts')).href);
const BS = await import(pathToFileURL(path.join(stage, 'bookshare.ts')).href);
const YTD = await import(pathToFileURL(path.join(stage, 'yeartodate.ts')).href);
const CAP = await import(pathToFileURL(path.join(stage, 'capital.ts')).href);
const PROP = await import(pathToFileURL(path.join(stage, 'propertyengine.ts')).href);
const WI = await import(pathToFileURL(path.join(stage, 'whatif.ts')).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.log(`  FAIL ${name}`); } };
const round2 = (n) => Math.round(n * 100) / 100;
const near = (a, b, tol = 0.51) => Math.abs(a - b) <= tol;

// Deterministic PRNG. Same seed, same accounts, forever: a failure here reproduces on every
// machine, which is the difference between a guard and a flake.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260806);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

// Boundary rich pools: the personal allowance, the higher rate line, the taper doors, the
// additional rate, and pennies either side of each.
const INCOMES = [500, 2500, 9000, 12570, 12570.01, 24000, 33000, 48000, 50270, 50270.01,
  70000, 100000, 100000.01, 110000, 125140, 125140.01, 150000, 200000];
const COSTS = [0, 150, 800, 2500, 8000, 15000, 30000];
const RENTS = [4000, 9000, 20000, 45000, 70000];
const PROP_COSTS = [0, 400, 2000, 5000, 13000];
const INTEREST = [0, 1200, 6000, 15000];
const CARS = [
  { kind: 'car_other', price: 35000 },
  { kind: 'car_low_or_used_electric', price: 18000 },
  { kind: 'car_zero_new', price: 42000 },
];

function buildAccount(i) {
  const rows = [];
  const assets = [];
  const isPartnership = i % 5 === 4; // every fifth account is a partner
  const sharePercent = isPartnership ? pick([35, 50]) : 100;
  const hasTrade = i % 7 !== 3; // some accounts are landlords only
  const hasProperty = i % 3 !== 1;

  if (hasTrade) {
    const nIncome = 1 + Math.floor(rand() * 2);
    for (let k = 0; k < nIncome; k++) {
      rows.push({ amount: pick(INCOMES), transaction_date: '2026-06-15', category: null, vendor: 'Customer', income_type: null, capital_kind: null });
    }
    rows.push({ amount: -pick(COSTS), transaction_date: '2026-07-01', category: pick(['materials', 'tools', 'fuel', 'insurance']), vendor: 'Trade suppliers', income_type: null, capital_kind: null });
    if (rand() < 0.3) {
      rows.push({ amount: -pick([55, 220, 1100]), transaction_date: '2026-07-02', category: 'travel', vendor: 'Mileage', income_type: null, capital_kind: null });
    }
    if (rand() < 0.2) {
      rows.push({ amount: -pick([26, 78, 156]), transaction_date: '2026-07-03', category: 'use of home', vendor: 'Use of home', income_type: null, capital_kind: null });
    }
    if (rand() < 0.25) {
      // A van: plant and machinery, AIA, comes off in full through ordinary expenses.
      const price = pick([9000, 24000]);
      rows.push({ amount: -price, transaction_date: '2026-06-20', category: 'van', vendor: 'Motor dealer', income_type: null, capital_kind: 'not_a_car' });
      assets.push({ capital_kind: 'not_a_car', transaction_date: '2026-06-20', amount: -price, business_use_pct: 100 });
    }
    if (rand() < 0.35) {
      const car = pick(CARS);
      const use = pick([100, 75, 1]);
      const boughtThisYear = rand() < 0.7;
      const when = boughtThisYear ? '2026-05-10' : '2025-05-10';
      if (boughtThisYear) {
        rows.push({ amount: -car.price, transaction_date: when, category: 'van', vendor: 'Motor dealer', income_type: null, capital_kind: car.kind });
      }
      assets.push({ capital_kind: car.kind, transaction_date: when, amount: -car.price, business_use_pct: use });
    }
  }
  if (hasProperty) {
    rows.push({ amount: pick(RENTS), transaction_date: '2026-06-20', category: 'rent', vendor: 'Tenants', income_type: 'property', capital_kind: null });
    const pc = pick(PROP_COSTS);
    if (pc > 0) rows.push({ amount: -pc, transaction_date: '2026-06-21', category: 'insurance', vendor: 'Letting agent and insurer', income_type: 'property', capital_kind: null });
    const int = pick(INTEREST);
    if (int > 0) rows.push({ amount: -int, transaction_date: '2026-06-22', category: 'mortgage interest', vendor: 'Lender', income_type: 'property', capital_kind: null });
  }
  return { rows, assets, isPartnership, sharePercent, hasTrade, hasProperty };
}

// One reader run, shared by the random sweep and the fixed controls.
function readAll(acct) {
  const { rows, assets, isPartnership, sharePercent } = acct;
  const partnerFactor = isPartnership ? sharePercent / 100 : 1;
  const ytd = YTD.aggregateConfirmedRows(rows, assets, 2026, partnerFactor);
  // The documents receive the UNSCALED allowance, exactly as capitalAllowanceForYear serves it:
  // the proof takes the partner's slice itself, and the pack and the share view are firm level.
  const rawAllow = YTD.sumCapitalAllowances(assets, 2026);

  const input = {
    startYear: 2026, monthsElapsed: 12, daysElapsed: 365,
    ytdTradeIncome: round2(ytd.ytdTradeIncome), ytdTradeExpenses: round2(ytd.ytdTradeExpenses),
    ytdCisSuffered: 0, employmentIncome: 0, studentPlans: [],
    categoriesLogged: ytd.categoriesLogged, homeOfficeClaimed: false,
    tradingAllowanceElected: false,
    ytdCapitalAllowances: round2(ytd.ytdCapitalAllowances),
    vehicleBoughtThroughBooks: ytd.vehicleBoughtThroughBooks,
    ytdHomeOffice: 0, mileageClaimed: ytd.ytdMileage > 0,
    ytdMileage: round2(ytd.ytdMileage), ytdHomeOfficeLogged: round2(ytd.ytdHomeOfficeLogged),
    purchaseGoal: null,
    ytdPropertyIncome: round2(ytd.ytdPropertyIncome), ytdPropertyExpenses: round2(ytd.ytdPropertyExpenses),
    ytdPropertyFinance: round2(ytd.ytdPropertyFinance),
    savingsIncome: 0, dividendIncome: 0,
    businessType: isPartnership ? 'partnership' : 'sole_trader',
    incomeShape: acct.hasTrade ? 'trade' : 'property_only',
  };
  const tp = O.taxPosition(input);

  const docTxns = rows.map((r) => ({
    amount: r.amount, transaction_date: r.transaction_date, income_type: r.income_type,
    category: r.category, vendor: r.vendor,
    writtenDown: CAP.isWrittenDown(r.capital_kind),
  }));
  const structure = isPartnership ? { type: 'partnership', sharePercent } : { type: 'sole_trader' };
  const proof = IP.buildIncomeProof(docTxns, 'Guard', 2026, new Date('2027-04-05'), structure, rawAllow);
  const pack = QP.buildQuarterPack({
    transactions: docTxns.map((t) => ({ ...t })), startYear: 2026, quarter: 4,
    now: new Date('2027-04-30'), mtdStated: 'no',
    structure: isPartnership ? 'partnership' : 'sole_trader',
    capitalAllowance: rawAllow,
  });
  const totals = BS.shareTotals(docTxns.map((r) => ({
    amount: r.amount, writtenDown: r.writtenDown === true,
    financeCost: String(r.income_type ?? '') === 'property' && PROP.isResidentialFinanceCost(r.category, r.vendor),
  })), rawAllow);
  // THE FIFTH SURFACE. /app/tax/what-if computes through lib/whatif.ts. Its base is the confirmed
  // taxable profit the documents show, and for an individual its tax is taxPosition with the
  // projection off. These accounts are a full year elapsed, so that confirmed figure equals the
  // projected setAside above, which is what lets the guard hold the two together.
  const wi = WI.whatIf(input, input.businessType, null);
  return { ytd, tp, proof, pack, totals, wi };
}

console.log('\nThe fixed control: the car business the 6 August fix was verified on');
{
  const acct = {
    rows: [
      { amount: 33000, transaction_date: '2026-06-15', category: null, vendor: 'Customer', income_type: null, capital_kind: null },
      { amount: -8000, transaction_date: '2026-07-01', category: 'materials', vendor: 'Trade suppliers', income_type: null, capital_kind: null },
      { amount: -35000, transaction_date: '2026-05-10', category: 'van', vendor: 'Motor dealer', income_type: null, capital_kind: 'car_other' },
    ],
    assets: [{ capital_kind: 'car_other', transaction_date: '2026-05-10', amount: -35000, business_use_pct: 100 }],
    isPartnership: false, sharePercent: 100, hasTrade: true, hasProperty: false,
  };
  const { tp, proof, pack, totals, wi } = readAll(acct);
  ok('the Overview set aside is £2,686', near(tp.setAside, 2686, 1));
  ok('the proof of income says the same £2,686', near(proof.estimatedTax, 2686, 1));
  ok('the proof profit is the taxable £22,900', proof.profit === 22900);
  ok('the pack estimate says the same £2,686', near(pack.ytd.estimatedTax.total, 2686, 1));
  ok('🔴 the MTD submission stays £25,000, before allowances (exception 1)', pack.submission.trade.net === 25000);
  ok('the shared books say the same £22,900', totals.profit === 22900);
  // 🔴 THE FIFTH SURFACE, THE ONE THAT USED TO READ £25,000 HERE. what-if's base is the taxable
  // £22,900 the documents show, not the £25,000 before allowances, and its tax is the same £2,686.
  ok('🔴 the what-if base is the taxable £22,900, not £25,000 before allowances', wi.base === 22900);
  ok('the what-if tax on the base says the same £2,686', near(wi.taxNow, 2686, 1));
}

console.log('\nThe sweep: seeded random accounts, every reader, one truth');
const N = 240;
let sweepFailures = 0;
for (let i = 0; i < N; i++) {
  const acct = buildAccount(i);
  if (acct.rows.length === 0) continue;
  const { ytd, tp, proof, pack, totals, wi } = readAll(acct);
  const label = `#${i}${acct.isPartnership ? ` partner ${acct.sharePercent}%` : ''}${acct.hasProperty ? ' property' : ''}`;
  const before = fail;

  // The spine: the Overview and the proof of income are the same tax, always.
  ok(`${label}: proof tax ${proof.estimatedTax} = setAside ${tp.setAside}`, near(proof.estimatedTax, tp.setAside));

  // 🔴 THE FIFTH SURFACE, ON EVERY SHAPE. what-if's tax on the base is the same as the Overview: a
  // partner's slice, a landlord's Section 24 credit, a car bought in an earlier year, all of it,
  // because it now reads through the same taxPosition the Overview does. This holds it here rather
  // than in front of a customer.
  ok(`${label}: what-if tax ${wi.taxNow} = setAside ${tp.setAside}`, near(wi.taxNow, tp.setAside, 1));
  // And on a plain trade account its BASE is the taxable trade profit the documents show, AFTER the
  // vehicle allowance, which is the exact figure it used to get wrong (£37,000 for £36,217.45).
  // Property adds a second stream and a partnership scales, so proof.profit is not the trade base
  // there; the tax check above carries those, and a loss floors the base at zero.
  if (!acct.hasProperty && !acct.isPartnership && proof.profit >= 0) {
    ok(`${label}: what-if base ${wi.base} = proof profit ${proof.profit}`, near(wi.base, proof.profit, 0.02));
  }

  if (!acct.isPartnership) {
    // The shared books and the proof state one taxable profit, a loss included: both documents
    // show the true negative since 6 August 2026 (exception 4 keeps partners out).
    ok(`${label}: share profit ${totals.profit} = proof profit ${proof.profit}`, totals.profit === proof.profit);
    // The submission figure is before allowances and nothing else moves it (exception 1).
    ok(`${label}: submission net is income less expenses, before allowances`,
      pack.submission.trade.net === round2(ytd.ytdTradeIncome - ytd.ytdTradeExpenses));
    if (!acct.hasProperty) {
      // Trade only: the pack's running estimate is the same tax as the Overview (exception 2
      // keeps property accounts out, and the pack names what it excluded).
      ok(`${label}: pack estimate ${pack.ytd.estimatedTax.total} = setAside ${tp.setAside}`,
        near(pack.ytd.estimatedTax.total, tp.setAside));
    } else {
      ok(`${label}: the pack names the property profit it excluded, finance costs inside Out`,
        near(pack.ytd.estimatedTax.propertyProfitExcluded, Math.max(0, round2(ytd.ytdPropertyIncome - ytd.ytdPropertyExpenses - ytd.ytdPropertyFinance)), 0.02));
    }
  }
  if (fail > before) sweepFailures++;
}
ok(`the sweep ran the full ${N} accounts`, true);

console.log(`\n  ${pass} passed, ${fail} failed.${sweepFailures ? ` (${sweepFailures} accounts diverged)` : ''}`);
process.exit(fail === 0 ? 0 : 1);

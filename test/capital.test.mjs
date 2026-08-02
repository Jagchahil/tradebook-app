// CAPITAL ALLOWANCES, AND THE VEHICLE A MAN HAS NOT BOUGHT YET. Run: node test/capital.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS DEFENDS.
//
// 🔴 1. A CAR IS NOT PLANT AND MACHINERY. Found by walking a real 78 row statement on 2 August
// 2026: AUDI LEEDS, £60,000, went through the pile like any other payment and the whole cost came
// off his profit. A £22,800 profit was reported as a £37,224 LOSS and the Overview told him we had
// saved him £5,463 when the honest figure was about £2,809.
//
// GOV.UK, claim capital allowances, business cars: "Cars do not qualify for: annual investment
// allowance (AIA)." Year one on that car is about £3,600. We were 52 grand out, in the direction
// that gets HIM penalised, and Finance Act 2026 Sch 22 makes that sanctionable conduct.
//
// ⚠️ AND THE PRODUCT ALREADY KNEW IT WAS A CAR: the pile printed the correct VAT blocking rule on
// that exact row. The fact was present, correct, and not consulted by the thing that needed it.
//
// 🔴 2. THE PRACTICAL ANSWER MUST BE ABLE TO OVERRULE THE TAX ANSWER. A new electric car gets 100%
// in year one and nothing else is close, so a recommendation ranked on tax alone tells every
// customer to buy one, including the man with street parking whose nearest charger is four miles
// away. Section 6 holds the veto shut.
//
// 🔴 3. NOT ONE RATE IS WRITTEN DOWN IN lib/capital.ts. Every figure comes from FACTS, which khoji
// checks against GOV.UK nightly. A rate copied into a second file is a rate that goes stale in
// silence: exactly how the live mileage page came to say 45p while the engine said 55p.
//
// Behavioural throughout. lib/ is staged and the real functions run.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const lib = path.join(root, 'lib');
const stage = mkdtempSync(path.join(tmpdir(), 'capital-'));
const fix = (s) => s.replace(/from '(\.\/[a-zA-Z0-9._-]+)'/g, "from '$1.ts'");
for (const f of readdirSync(lib)) {
  if (f.endsWith('.ts')) writeFileSync(path.join(stage, f), fix(readFileSync(path.join(lib, f), 'utf8')));
}
const load = (n) => import(pathToFileURL(path.join(stage, n + '.ts')).href);
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const C = await load('capital');
const E = await load('taxengine');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  ok   ${name}`); } else { fail += 1; console.log(`  FAIL ${name}`); }
};

const MAIN = E.FACTS.wdaMainRate;      // 14% from April 2026
const SPECIAL = E.FACTS.wdaSpecialRate; // 6%

// ---------------------------------------------------------------------------------------------
// 1. THE RATES ARE THE ENGINE'S, AND THIS FILE WRITES NONE OF THEM DOWN.
// ---------------------------------------------------------------------------------------------
ok('the two writing down rates are FACTS, and in the order GOV.UK gives them', MAIN === 0.14 && SPECIAL === 0.06 && MAIN > SPECIAL);

ok('🔴 lib/capital.ts hardcodes neither rate', (() => {
  const code = strip(read('lib/capital.ts'));
  return !new RegExp(`\\b${MAIN}\\b`).test(code) && !new RegExp(`\\b${SPECIAL}\\b`).test(code);
})());

ok('...nor the mileage rates, nor the mileage band', (() => {
  const code = strip(read('lib/capital.ts'));
  return !/\b0\.55\b|\b0\.25\b|\b10000\b|\b10,000\b/.test(code);
})());

// ---------------------------------------------------------------------------------------------
// 2. 🔴 THE DEFECT. A CAR DOES NOT COME OFF IN ONE GO.
// ---------------------------------------------------------------------------------------------
const car = C.capitalRelief(60000, 'car_other', 100);
ok('🔴 A £60,000 CAR IS £3,600 IN YEAR ONE, NOT £60,000',
  car.thisYear === 3600 && car.inFull === false && car.rate === SPECIAL);

ok('...and the rest is not lost, it is carried forward',
  car.carriedForward === 56400 && car.carriedForward + car.thisYear === 60000);

ok('a hybrid at 50g/km or under goes in the main pool',
  C.capitalRelief(60000, 'car_low_or_used_electric', 100).thisYear === 8400);

ok('🔴 A VAN IS PLANT AND MACHINERY AND STILL COMES OFF IN FULL',
  C.capitalRelief(60000, 'not_a_car', 100).thisYear === 60000
  && C.capitalRelief(60000, 'not_a_car', 100).inFull === true);

ok('a brand new zero emission car gets the whole cost, which is the first year allowance',
  C.capitalRelief(60000, 'car_zero_new', 100).thisYear === 60000
  && C.capitalRelief(60000, 'car_zero_new', 100).inFull === true);

ok('the sentence names the AIA exclusion rather than just showing a smaller number',
  /keeps cars out of the Annual Investment Allowance/.test(car.says)
  && /The rest is not lost/.test(car.says));

// ---------------------------------------------------------------------------------------------
// 3. PRIVATE USE. CAA 2001 s205, and the half of it that is easy to get wrong.
// ---------------------------------------------------------------------------------------------
const half = C.capitalRelief(60000, 'car_other', 50);
ok('the allowance is restricted to the business share', half.thisYear === 1800);

ok('🔴 BUT THE POOL STILL FALLS BY THE FULL ALLOWANCE, NOT THE RESTRICTED ONE',
  half.carriedForward === 56400);

ok('full relief is restricted too, so a van with private use is not a free van',
  C.capitalRelief(60000, 'not_a_car', 50).thisYear === 30000);

ok('a missing or silly business use figure falls back to the whole thing rather than to zero',
  C.capitalRelief(1000, 'not_a_car').thisYear === 1000
  && C.capitalRelief(1000, 'not_a_car', Number.NaN).thisYear === 1000
  && C.capitalRelief(1000, 'not_a_car', 0).thisYear === 10
  && C.capitalRelief(1000, 'not_a_car', 900).thisYear === 1000);

// ---------------------------------------------------------------------------------------------
// 4. MILEAGE. The band, from FACTS, at its boundary.
// ---------------------------------------------------------------------------------------------
ok('ten thousand miles is the first band exactly',
  C.mileageClaimFor(E.FACTS.mileageFirstBandMiles)
  === E.FACTS.mileageFirstBandMiles * E.FACTS.mileageCarFirst10k);

ok('🔴 THE SECOND BAND IS A LOWER RATE, NOT A CLIFF',
  C.mileageClaimFor(15000) === (10000 * E.FACTS.mileageCarFirst10k) + (5000 * E.FACTS.mileageCarOver10k));

ok('and it is 55p, which is this year\'s published figure and not the 45p the old page shows',
  E.FACTS.mileageCarFirst10k === 0.55 && C.mileageClaimFor(10000) === 5500);

ok('no miles is no claim, and a silly figure is not a negative one',
  C.mileageClaimFor(0) === 0 && C.mileageClaimFor(-500) === 0 && C.mileageClaimFor(Number.NaN) === 0);

// ---------------------------------------------------------------------------------------------
// 5. THE ADVICE. The van comparison, and the money he has not got.
// ---------------------------------------------------------------------------------------------
const adv = C.purchaseAdvice({
  cost: 60000, kind: 'car_other', marginalRate: 0.26, cashOnHand: 30000, taxSetAside: 8000,
});
ok('the tax back is the allowance at his rate, not the price at his rate',
  adv.taxSavedThisYear === 936);

ok('🔴 THE VAN COMPARISON IS THE MOST VALUABLE SENTENCE IN THE FILE',
  adv.vanInstead !== null && adv.vanInstead.taxSavedThisYear === 15600
  && adv.vanInstead.better === 14664);

ok('...and it is not drawn for something already getting full relief, because there is nothing to compare',
  C.purchaseAdvice({ cost: 60000, kind: 'not_a_car', marginalRate: 0.26 }).vanInstead === null
  && C.purchaseAdvice({ cost: 60000, kind: 'car_zero_new', marginalRate: 0.26 }).vanInstead === null);

ok('🔴 THE TAX SET ASIDE COMES OFF BEFORE HE IS TOLD HE CAN AFFORD ANYTHING',
  adv.affordable === false && adv.leftAfter === -38000);

ok('and it says the set aside is not his to spend, rather than just saying no',
  adv.lines.some((l) => /not yours to spend/.test(l)));

ok('🔴 NOT KNOWING IS NOT A YES', (() => {
  const blind = C.purchaseAdvice({ cost: 60000, kind: 'car_other', marginalRate: 0.26 });
  return blind.affordable === null && blind.leftAfter === null
    && blind.lines.some((l) => /cannot tell you whether you can afford it/.test(l));
})());

ok('a man who can afford it is told what he would have left rather than just yes',
  C.purchaseAdvice({ cost: 5000, kind: 'not_a_car', marginalRate: 0.26, cashOnHand: 30000, taxSetAside: 8000 }).leftAfter === 17000);

// ---------------------------------------------------------------------------------------------
// 6. 🔴 THE RECOMMENDATION, AND THE VETO THAT MAKES IT HONEST.
// ---------------------------------------------------------------------------------------------
const base = {
  budget: 40000, businessMilesPerYear: 9000, businessUsePct: 60,
  runningCostsPerYear: 4000, marginalRate: 0.26, spendable: 22000,
};
const canCharge = C.recommendVehicle({ ...base, want: 'car', charging: 'home' });
const cannotCharge = C.recommendVehicle({ ...base, want: 'car', charging: 'street_far' });

ok('with a drive, the electric car wins on tax and is recommended',
  canCharge.best.kind === 'car_zero_new' && canCharge.best.worthPerYearOne === 6864);

ok('🔴 WITH STREET PARKING AND NO CHARGER, IT IS STILL THE BIGGEST NUMBER AND IS NOT RECOMMENDED',
  cannotCharge.options[0].kind === 'car_zero_new'
  && cannotCharge.options[0].worthPerYearOne === 6864
  && cannotCharge.options[0].practical === 'no'
  && cannotCharge.best.kind !== 'car_zero_new');

ok('...and he is told what he is turning down, and by how much, rather than it quietly vanishing',
  cannotCharge.lines.some((l) => /would actually be worth more/.test(l) && /£6,864/.test(l)));

ok('the veto is only ever about electric, so a diesel is never demoted for where he parks',
  C.recommendVehicle({ ...base, want: 'car', charging: 'street_far' })
    .options.filter((o) => o.kind !== 'car_zero_new').every((o) => o.practical === 'fine'));

ok('🔴 A PETROL CAR ON REAL MILEAGE IS BETTER KEPT IN HIS OWN NAME',
  canCharge.options.find((o) => o.kind === 'car_other').bestRoute === 'mileage');

ok('🔴 A VAN IS ONE OPTION, NOT FOUR, BECAUSE ITS FUEL CHANGES NO TAX AT ALL', (() => {
  const van = C.recommendVehicle({ ...base, want: 'van', charging: 'street_far' });
  return van.options.length === 1
    && van.options[0].kind === 'not_a_car'
    && van.lines.some((l) => /fuel makes no difference at all to your tax/.test(l));
})());

ok('the affordability half survives into the recommendation',
  canCharge.affordable === false && canCharge.spendable === 22000);

ok('and a man who told us nothing about his money still gets the whole tax answer', (() => {
  const r = C.recommendVehicle({ ...base, spendable: null, want: 'car', charging: 'home' });
  return r.best !== null && r.affordable === null && r.options.length === 3;
})());

// ---------------------------------------------------------------------------------------------
// 7. THE SCREEN. A calculator, not a record.
// ---------------------------------------------------------------------------------------------
const PAGE = read('app/app/tax/vehicle/page.tsx');

ok('🔴 IT WRITES NOTHING: a GET form, no route, no database call that stores anything',
  /method="get"/.test(PAGE) && !/method="post"/.test(PAGE)
  && !/writeAllowanceElection|insertBankTransactions|saveCircumstance/.test(PAGE));

ok('🔴 ZERO CLIENT JAVASCRIPT, like every other screen under app/app',
  !/'use client'/.test(PAGE) && !/onClick|onChange|useState|useEffect/.test(PAGE));

ok('it resolves the user from the session and sends a stranger away',
  /userFromSessionCookie/.test(PAGE) && /redirect\('\/in'\)/.test(PAGE));

ok('it asks the charging question, which is the one that changes the answer most',
  /chargingLabel/.test(PAGE) && /Could you live with an electric one/.test(PAGE));

ok('🔴 WHAT HE TYPES ABOUT HIS OWN MONEY BEATS WHAT WE INFERRED',
  /inBank !== null \? Math\.max\(0, inBank - setAside\) : confirmedSpare/.test(PAGE));

ok('...and the inferred figure never claims to be a bank balance',
  /It is not your bank balance/.test(PAGE));

ok('a limited company is told these figures are not his, rather than being shown them as if they were',
  /businessType === 'limited_company'/.test(PAGE) && /benefit in kind/.test(PAGE));

ok('the rail row exists and carries its reasoning against doc 103',
  /href: '\/app\/tax\/vehicle'/.test(read('app/app/AppNav.tsx'))
  && /once test/.test(read('app/app/AppNav.tsx')));

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);

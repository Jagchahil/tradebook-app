// Tax engine parity guard.
//
// The sole-trader tax maths exists as two hand-maintained copies:
//   web (canonical):  tradebook-web/lib/taxengine.ts   soleTraderTax()
//   app:              tradebook-app/lib/tax.ts          soleTraderTax()
//
// They are separate builds, so a single shared import across the two projects is
// not clean. Instead, THIS test is the guarantee that they cannot silently
// diverge. It imports BOTH engines and asserts soleTraderTax(profit) agrees to
// the penny across a wide sweep of profits, with extra checks around every band
// and threshold. If a future Budget rate change is applied to one file and not
// the other, this test fails loudly.
//
// Run with:
//   node test/tax-parity.test.mjs
//
// Requires Node 22.6+ (reads TypeScript directly via type stripping), or falls
// back to a one-off esbuild transpile, exactly like test/exams/run-exams.mjs.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const webPath = path.resolve(here, '../lib/taxengine.ts');
const appPath = path.resolve(here, '../../tradebook-app/lib/tax.ts');

// Load a .ts engine. Node 22.6+ strips types and imports directly. If that is
// not available, fall back to a one-off esbuild transpile. No permanent
// dependency is needed to run this.
async function loadEngine(tsPath, tag) {
  try {
    return await import(`${pathToFileURL(tsPath).href}?t=${Date.now()}`);
  } catch (err) {
    const out = path.join(process.env.TMPDIR || '/tmp', `taxengine.parity.${tag}.mjs`);
    const candidates = [
      path.resolve(here, '../node_modules/.bin/esbuild'),
      '/tmp/node_modules/.bin/esbuild',
    ];
    const esbuild = candidates.find((p) => existsSync(p));
    if (!esbuild) {
      console.error('\nCould not load a tax engine.');
      console.error('This runs directly on Node 22.6 or newer. On older Node, install esbuild once: npm i -D esbuild');
      console.error(`Original error: ${err.message}\n`);
      process.exit(2);
    }
    execSync(`"${esbuild}" "${tsPath}" --format=esm --outfile="${out}"`, { stdio: 'inherit' });
    return import(`file://${out}?t=${Date.now()}`);
  }
}

const web = await loadEngine(webPath, 'web');
const app = await loadEngine(appPath, 'app');

let pass = 0;
let fail = 0;
const mismatches = [];

// The profits to check. A wide sweep plus, critically, the exact thresholds and
// the pounds either side of every band boundary, since off-by-one errors and
// taper rounding live at the edges.
const SWEEP = [
  0, 1, 5000, 10000, 12000, 12570, 20000, 30000, 37700, 50000, 50270, 60000,
  90000, 100000, 100001, 125000, 125140, 150000, 200000, 250000, 500000, 1000000,
];

// Every meaningful boundary in the sole-trader calculation. We test the exact
// value, one pound below, and one pound above each.
const BOUNDARIES = [
  12570, // personal allowance / Class 4 lower limit
  50270, // Class 4 upper limit
  100000, // personal allowance taper floor
  125140, // additional-rate threshold / personal allowance fully lost
  50270, // higher-rate income starts (PA + basic band)
];

const points = new Set();
for (const p of SWEEP) points.add(p);
for (const b of BOUNDARIES) {
  points.add(Math.max(0, b - 1));
  points.add(b);
  points.add(b + 1);
}
// A dense scan through the whole realistic range to catch any drift the named
// points miss. Every £250 from 0 to 300k, then coarser to 1m.
for (let p = 0; p <= 300000; p += 250) points.add(p);
for (let p = 300000; p <= 1000000; p += 5000) points.add(p);

const sorted = [...points].sort((a, b) => a - b);

for (const profit of sorted) {
  const w = web.soleTraderTax(profit);
  const a = app.soleTraderTax(profit);
  // Compare the whole result, not just total: incomeTax and class4 must match
  // too, so a compensating error cannot hide.
  const same =
    w.total === a.total && w.incomeTax === a.incomeTax && w.class4 === a.class4;
  if (same) {
    pass += 1;
  } else {
    fail += 1;
    mismatches.push({ profit, web: w, app: a });
  }
}

console.log('\n=== tax parity: soleTraderTax(web) vs soleTraderTax(app) ===\n');
console.log(`  Checked ${sorted.length} profit points.`);

if (mismatches.length > 0) {
  console.log('\n  MISMATCHES (the two engines have diverged):\n');
  for (const m of mismatches.slice(0, 20)) {
    console.log(
      `  FAIL  profit=${m.profit}  web=${JSON.stringify(m.web)}  app=${JSON.stringify(m.app)}`
    );
  }
  if (mismatches.length > 20) {
    console.log(`  ...and ${mismatches.length - 20} more.`);
  }
}


// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE SIXTH SURFACE. WHAT THE PHONE TELLS HIM TO PUT BY.
//
// 🔴 FOUND 12 AUGUST 2026 BY READING THE PHONE AFTER THE WEB HAD BEEN FIXED AND CLOSED.
//
// RUN 1 of the customer week raised this as its flagship P1: a groundworker whose contractors had
// already handed HMRC £2,800 on his behalf was told to put by £3,337 he did not owe, on a January
// that is a refund. The web money spine was corrected and held to the penny across five surfaces.
//
// The phone was never in that packet, and it is a whole separate tax engine in a second repository.
// app/(tabs)/you.tsx drew the biggest number in the app, under a comment reading "THE NUMBER HE
// CAME FOR", straight from businessTaxOnProfit() with no deduction of any kind. So the same
// customer, on the same account, on the same afternoon, read £0 on the web and about £3,337 on his
// phone, and the phone is the one he actually looks at.
//
// ⚠️ AND THE PHONE ALREADY DISAGREED WITH ITSELF: app/tax-summary.tsx had netted CIS off since it
// was written. Two screens, two answers, one number. So the arithmetic moved into lib/tax.ts and
// both screens ask it, and this section is what stops either of them wandering off again.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== the phone: tax already paid at source comes off what he puts by ===\n');
{
  const okc = (name, cond) => {
    if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
    else { fail += 1; console.log(`  FAIL  ${name}`); mismatches.push(name); }
  };

  okc('🔴 THE PHONE ENGINE HAS ONE READER FOR WHAT IS LEFT TO FIND',
    typeof app.setAsideAfterCis === 'function');

  if (typeof app.setAsideAfterCis === 'function') {
    // DANNY, the customer the finding is named after. Profit £11,639, CIS suffered £2,800.
    // His liability on that profit is smaller than the tax already handed over, so the honest
    // answer is nothing to put by and a refund coming, not a bill.
    const danny = app.setAsideAfterCis('sole_trader', 11639, 2800);
    okc('DANNY: the liability is the engine’s own figure on his profit',
      danny.liability === Math.round(app.businessTaxOnProfit('sole_trader', 11639)));
    okc('🔴 DANNY: AND THE TAX HIS CONTRACTORS ALREADY PAID COMES OFF IT',
      danny.setAside === Math.max(0, danny.liability - 2800));
    // ⚠️ AND THE FIRST DRAFT OF THIS LINE ASSERTED setAside < liability, WHICH IS FALSE FOR DANNY
    // AND FOR A GOOD REASON. His £11,639 profit is under the personal allowance, so his liability
    // is nil and there is nothing for the deduction to reduce: every penny of the £2,800 is a
    // refund. Asserting the deduction "bites" needs a customer who actually has a bill.
    okc('🔴 DANNY: SO HE IS NOT TOLD TO PUT BY ANYTHING, and the whole £2,800 is owed back',
      danny.setAside === 0 && danny.refundLikely === 2800 - danny.liability);
    const withABill = app.setAsideAfterCis('sole_trader', 40000, 2800);
    okc('🔴 AND ON A MAN WHO DOES HAVE A BILL, THE DEDUCTION COMES OFF IT',
      withABill.liability > 0
      && withABill.setAside === withABill.liability - 2800
      && withABill.setAside < withABill.liability);

    // A sweep, because the defect was a missing subtraction and a missing subtraction hides best
    // in one worked example.
    let wrong = 0; let negative = 0; let bothAtOnce = 0;
    for (const profit of [0, 5000, 11639, 20000, 40000, 60000, 120000]) {
      for (const cis of [0, 1, 500, 2800, 9000, 40000]) {
        const r = app.setAsideAfterCis('sole_trader', profit, cis);
        if (r.setAside !== Math.max(0, r.liability - cis)) wrong += 1;
        if (r.setAside < 0 || r.refundLikely < 0) negative += 1;
        // A man cannot owe money and be owed money on the same figures.
        if (r.setAside > 0 && r.refundLikely > 0) bothAtOnce += 1;
      }
    }
    okc('🔴 THE DEDUCTION HAPPENS ON EVERY COMBINATION, not just the worked example', wrong === 0);
    okc('and neither answer can go negative, so a big refund is never a negative bill', negative === 0);
    okc('🔴 AND HE IS NEVER TOLD HE OWES AND IS OWED AT THE SAME TIME', bothAtOnce === 0);

    // The refund is the other side of the same subtraction, and it only exists when there is one.
    const owed = app.setAsideAfterCis('sole_trader', 11639, 9000);
    okc('when the deductions are bigger than the bill, the difference is a refund',
      owed.setAside === 0 && owed.refundLikely === Math.max(0, owed.liability * -1 + 9000));

    // ⚠️ A COMPANY IS A DIFFERENT TAXPAYER. A director's personal CIS does not reduce his
    // company's Corporation Tax, and a company under CIS suffers it against PAYE rather than CT.
    // Netting it off here would be the wrong bill, so the engine refuses rather than approximates.
    const ltd = app.setAsideAfterCis('limited_company', 60000, 9000);
    okc('🔴 A DIRECTOR’S CIS NEVER REDUCES HIS COMPANY’S CORPORATION TAX',
      ltd.cis === 0 && ltd.setAside === ltd.liability && ltd.refundLikely === 0);

    // The extra tax argument is how the quarter screen folds in a student loan, and it must be
    // part of the bill the deduction comes off, never something the deduction skips.
    const withSl = app.setAsideAfterCis('sole_trader', 40000, 1000, 500);
    const withoutSl = app.setAsideAfterCis('sole_trader', 40000, 1000, 0);
    okc('extra tax joins the bill before the deduction, not after it',
      withSl.liability === withoutSl.liability + 500 && withSl.setAside === withoutSl.setAside + 500);
  }

  // ⚠️ AND BOTH SCREENS ASK IT. The whole defect was one screen doing the arithmetic and the
  // other not, so a guard on the function alone would have passed on the day this was broken.
  const appRoot = path.resolve(here, '../../tradebook-app');
  const readApp = (rel) => readFileSync(path.join(appRoot, rel), 'utf8');
  //
  // 🔴 AND THE GUARD NAMES THE ASSIGNMENT, NOT THE CALL. The first draft asserted the file merely
  // CONTAINS 'setAsideAfterCis(' and sabotage walked straight through it: renaming the binding to
  // setAside0 orphaned the result and left the call text sitting there, green. Calling a function
  // and throwing the answer away is exactly the shape of the defect this section exists for. The
  // same mistake, in the same afternoon, as the three router guard that passed on an import.
  for (const [screen, file, ...marks] of [
    ['the home screen, where the big number lives', 'app/(tabs)/you.tsx',
      'const pos = setAsideAfterCis(', 'const setAside = PREVIEW ? 3240 : pos.setAside;'],
    ['the quarter screen', 'app/tax-summary.tsx',
      'const setAside = setAsideAfterCis('],
  ]) {
    let src = '';
    try { src = readApp(file); } catch { src = ''; }
    okc(`${screen}: the file was read`, src.length > 500);
    for (const mark of marks) {
      okc(`🔴 ${screen}: the number it draws comes from the engine  \`${mark}\``, src.includes(mark));
    }
  }
}

console.log(`\n  ${pass} passed, ${fail} failed.\n`);

if (fail > 0) {
  console.error(
    'PARITY BROKEN. The app and web sole-trader tax engines disagree.\n' +
      'Fix: make tradebook-app/lib/tax.ts and tradebook-web/lib/taxengine.ts\n' +
      'produce identical soleTraderTax numbers again (usually a rate or\n' +
      'threshold was changed in one file but not the other), then re-run.\n'
  );
  process.exit(1);
}

console.log('PARITY OK. Both engines agree on every profit checked.\n');

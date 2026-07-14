// 🔴 THE ORACLE. Our tax engine, held up against HMRC'S OWN CALCULATION.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Every other test in this repo asks: does our engine agree with a number WE decided was right?
//
// The exam bank is a thousand scenarios we wrote. tax-parity checks our engine against our other
// engine. The differ checks our constants against GOV.UK pages, which is genuinely independent and is
// the best thing we have. But NONE of them can catch a mistake in how the constants are COMBINED.
//
// Every constant can be perfect and the arithmetic still wrong.
//
// THE ORACLE CAN CATCH THAT, because HMRC does the arithmetic itself and hands us the answer.
// /individuals/calculations/{nino}/self-assessment/{taxYear}. Free. HMRC's own guide says it is the
// same calculation they use for real.
//
// Nobody else in this market has one. It is the strongest claim any of us could make, and the
// difference between "we think this is right" and "HMRC agrees this is right".
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ AND IT REFUSES TO RUN UNTIL THE PROBE HAS PROVED THE SANDBOX ACTUALLY COMPUTES.
//
// HMRC sandboxes commonly return a canned response keyed off a test-scenario header. If this one
// does, then this harness would compare our engine against a fixture HMRC invented, GO GREEN, and
// prove nothing at all, while looking like the strongest test in the product.
//
// That is the exact shape of every bug we found today: the mileage decoy, the £96-per-week threshold,
// the TIIN that "had no date", the classifier that promoted HMRC prose to statute. A number that
// flatters you is the one to check twice.
//
// So: run test/oracle/probe.mjs first. If it says the sandbox is canned, this file will not pretend
// otherwise, and it will not run.
//
//   node test/oracle/probe.mjs      <- settles whether the sandbox computes
//   node test/oracle/run-oracle.mjs <- only meaningful if the probe passed
//
// ⚠️ AND IT IS NOT IN run-all.mjs, ON PURPOSE. It hits HMRC over the network, it needs credentials,
// and a test that silently skips when a token is missing is a test that will one day be green because
// nobody has a token. It is run deliberately, and it says so out loud when it cannot run.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');

const H = await import(`${pathToFileURL(path.join(root, 'lib/hmrc.ts')).href}`);
const E = await import(`${pathToFileURL(path.join(root, 'lib/taxengine.ts')).href}`);
const { soleTraderTax } = E;

const TOKEN = process.env.HMRC_TEST_ACCESS_TOKEN || '';
const NINO = process.env.HMRC_TEST_NINO || '';
const BUSINESS_ID = process.env.HMRC_TEST_BUSINESS_ID || '';
const TAX_YEAR = process.env.HMRC_TEST_TAX_YEAR || '2026-27';
const PROVEN = process.env.HMRC_SANDBOX_COMPUTES === 'yes';

// The fraud-prevention headers HMRC requires on every call. Already built and already tested
// (test/hmrc). Not re-invented, not faked: HMRC rejects a submission with bad Gov-Client headers, and
// a harness that fails for the WRONG reason has told us nothing about our engine.
const fraud = {
  deviceId: 'lekhio-oracle',
  clientPublicIp: '127.0.0.1',
  vendorVersion: '1.0.0',
  vendorProductName: 'Lekhio',
  browserJsUserAgent: 'LekhioOracle/1.0',
  screens: 'width=1920&height=1080&scaling-factor=1&colour-depth=24',
};

// 🔴 THE SCENARIOS. Chosen to sit ON the joins, because that is where an engine breaks.
//
// Not "a few round numbers". The places where the arithmetic changes shape: the personal allowance,
// the higher rate threshold, the Class 4 upper limit, and the £100,000 taper, which is the cliff the
// LIMITED COMPANY engine had never heard of until this morning and which nothing would have caught.
const SCENARIOS = [
  { name: 'under the personal allowance', turnover: 14_000, expenses: 3_000 },
  { name: 'basic rate, comfortably', turnover: 35_000, expenses: 5_000 },
  { name: 'right on the higher-rate threshold', turnover: 56_270, expenses: 6_000 },
  { name: 'just over it', turnover: 60_000, expenses: 5_000 },
  { name: 'at the Class 4 upper limit', turnover: 55_270, expenses: 5_000 },
  { name: '🔴 INSIDE THE £100k TAPER', turnover: 120_000, expenses: 10_000 },
  { name: '🔴 PAST THE TAPER, no allowance left', turnover: 140_000, expenses: 10_000 },
  { name: 'additional rate', turnover: 180_000, expenses: 15_000 },
];

const money = (n) => `£${Math.round(Number(n) || 0).toLocaleString('en-GB')}`;

async function hmrcTax(s) {
  const payload = H.buildPeriodicUpdate(
    [
      { amount: s.turnover, category: 'income' },
      { amount: -s.expenses, category: 'materials' },
    ],
    `${Number(TAX_YEAR.slice(0, 4))}-04-06`,
    `${Number(TAX_YEAR.slice(0, 4)) + 1}-04-05`,
  );

  // approved: true, and it is an honest true. submitQuarterlyUpdate THROWS unless it is explicitly
  // set: no code path may ever send a real man's figures to HMRC without him saying yes. Here it is a
  // SANDBOX, a TEST NINO from HMRC's own test-user API, and figures I invented. The person running
  // this command is the person approving it. The gate is satisfied, not bypassed.
  //
  // (It caught me: my first draft omitted it and would have thrown ApprovalRequiredError.)
  const submitted = await H.submitQuarterlyUpdate({
    nino: NINO, businessId: BUSINESS_ID, taxYear: TAX_YEAR, accessToken: TOKEN,
    payload, approved: true, fraud,
  });
  if (!submitted?.ok) return { error: `submit HTTP ${submitted?.status}` };

  const triggered = await H.triggerCalculation(NINO, TAX_YEAR, 'in-year', TOKEN, fraud);
  if (!triggered?.ok || !triggered.calculationId) return { error: `trigger HTTP ${triggered?.status}` };

  await new Promise((r) => setTimeout(r, 3000));

  const calc = await H.retrieveCalculation(NINO, TAX_YEAR, triggered.calculationId, TOKEN, fraud);
  const total = calc?.calculation?.taxCalculation?.totalIncomeTaxAndNicsDue
    ?? calc?.taxCalculation?.totalIncomeTaxAndNicsDue;

  // ⚠️ A FIGURE WE COULD NOT FIND IS NOT A ZERO AND IT IS NOT AGREEMENT. It is blindness, and the
  // caller counts it as such.
  if (total === undefined || total === null) return { error: 'no tax figure in the response' };
  return { total: Number(total) };
}

async function main() {
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  // THE TWO GATES. Both of them refuse LOUDLY rather than skipping quietly.
  //
  // A test that skips when a token is missing is a test that will one day be green because nobody
  // has a token. This codebase has already been killed once by a job that exited 0 having done
  // nothing. NOT KNOWING IS NOT THE SAME AS BEING FINE.
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  if (!TOKEN || !NINO || !BUSINESS_ID) {
    console.error('\n🔴 THE ORACLE CANNOT RUN. No sandbox credentials.\n');
    console.error('   This is not a pass and it is not a skip. It is a "we did not check".');
    console.error('   HMRC_TEST_ACCESS_TOKEN, HMRC_TEST_NINO, HMRC_TEST_BUSINESS_ID.\n');
    process.exit(1);
  }

  if (!PROVEN) {
    console.error('\n🔴 THE ORACLE REFUSES TO RUN UNTIL THE SANDBOX IS PROVED TO COMPUTE.\n');
    console.error('   HMRC sandboxes commonly hand back a CANNED response. If this one does, every');
    console.error('   line below would compare our engine to a fixture HMRC made up, go green, and');
    console.error('   prove nothing, while looking like the strongest test in the product.\n');
    console.error('   Settle it first:   node test/oracle/probe.mjs');
    console.error('   Then:              HMRC_SANDBOX_COMPUTES=yes node test/oracle/run-oracle.mjs\n');
    process.exit(1);
  }

  console.log('\n⚖️  THE ORACLE. Our engine against HMRC\'s own calculation.\n');

  let agreed = 0;
  let disagreed = 0;
  let blind = 0;

  for (const s of SCENARIOS) {
    const profit = s.turnover - s.expenses;
    const ours = soleTraderTax(profit).total;

    const theirs = await hmrcTax(s);

    if (theirs.error) {
      // ⚠️ AN UNREADABLE ANSWER IS NOT AGREEMENT. It is blindness, and it is counted as such.
      blind += 1;
      console.log(`  ??  ${s.name.padEnd(40)} could not read HMRC: ${theirs.error}`);
      continue;
    }

    // A pound of rounding is not a disagreement. Ten pounds is.
    const gap = Math.abs(ours - theirs.total);
    if (gap < 1) {
      agreed += 1;
      console.log(`  ok  ${s.name.padEnd(40)} profit ${money(profit)} -> ${money(ours)} (HMRC agrees)`);
    } else {
      disagreed += 1;
      console.log(`  🔴  ${s.name.padEnd(40)} profit ${money(profit)}`);
      console.log(`        WE SAY   ${money(ours)}`);
      console.log(`        HMRC SAY ${money(theirs.total)}`);
      console.log(`        GAP      ${money(gap)}   <-- HMRC is right and we are wrong. Fix the engine.`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════════════');
  console.log(`  ${agreed} agreed, ${disagreed} DISAGREED, ${blind} could not be read.`);
  if (disagreed > 0) {
    console.log('');
    console.log('  🔴 HMRC IS THE ORACLE. WHERE WE DISAGREE, WE ARE WRONG.');
    console.log('     Not "worth investigating". Wrong. He signs the return, and HMRC computes the bill.');
  }
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  // Blindness fails the run too. A run that could not read HMRC has not confirmed anything.
  process.exit(disagreed > 0 || blind > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('\n🔴 THE ORACLE THREW:', e.message);
  console.error('   A harness that crashed has not agreed with HMRC. It has told you nothing.\n');
  process.exit(1);
});

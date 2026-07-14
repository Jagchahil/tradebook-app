// 🔴 THE ORACLE PROBE. One question, and it decides whether the whole thing is real.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// HMRC WILL RUN ITS OWN CALCULATION AND TELL US THE ANSWER.
//
// /individuals/calculations/{nino}/self-assessment/{taxYear}/trigger, then retrieve. HMRC computes
// the tax. HMRC's guide says it is the SAME calculation they use for real. It is free.
//
// That is the strongest validation available to anyone in this market: not "our engine agrees with an
// exam bank we wrote ourselves", but "our engine agrees with HMRC". No competitor has one.
//
// ⚠️ AND IT IS ONLY REAL IF THE SANDBOX ACTUALLY COMPUTES.
//
// HMRC sandboxes commonly return a CANNED response keyed off the Gov-Test-Scenario header. If this
// one does, then an oracle harness built on it would compare our engine against a fixture HMRC made
// up, go green, and prove NOTHING, while looking like the strongest test in the product.
//
// That is the exact shape of every bug found today. A number that flatters you.
//
// I could not settle it from HMRC's documentation: their developer site is client-rendered and
// returns an empty shell to a fetch. So rather than write another paragraph about what somebody ought
// to check, THIS FILE IS THE CHECK.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// THE TEST. It is almost insultingly simple, and that is why it is trustworthy.
//
// Submit a SMALL profit. Ask HMRC for the tax. Submit a LARGE profit. Ask again.
//
//   . If the two answers DIFFER, the sandbox computes from our data. The oracle is real, and
//     test/oracle/run-oracle.mjs can be trusted, and we should build the rest of it today.
//
//   . If the two answers are THE SAME, the sandbox is canned. The oracle is a PRODUCTION-only tool.
//     It waits for the live credentials and a consenting user, and any harness we build on the
//     sandbox in the meantime is theatre.
//
// There is no third answer, and no amount of reading gets you it. You have to poke it.
//
//   node test/oracle/probe.mjs
//
// Needs, in the environment: HMRC_CLIENT_ID, HMRC_CLIENT_SECRET, HMRC_BASE_URL (sandbox), and a
// sandbox ACCESS TOKEN plus a test NINO from the HMRC developer hub's test-user API.
//
//   HMRC_TEST_ACCESS_TOKEN=...  HMRC_TEST_NINO=...  HMRC_TEST_BUSINESS_ID=...  node test/oracle/probe.mjs

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const H = await import(`${pathToFileURL(path.resolve(here, '../../lib/hmrc.ts')).href}`);

const TOKEN = process.env.HMRC_TEST_ACCESS_TOKEN || '';
const NINO = process.env.HMRC_TEST_NINO || '';
const BUSINESS_ID = process.env.HMRC_TEST_BUSINESS_ID || '';
const TAX_YEAR = process.env.HMRC_TEST_TAX_YEAR || '2026-27';

// The fraud-prevention headers HMRC requires on EVERY call. Already built, already tested
// (test/hmrc, 30 assertions). We do not re-invent them here, and we do not fake them: HMRC rejects a
// submission with bad Gov-Client headers, and a probe that fails for the WRONG reason tells us
// nothing about the question we came to answer.
const fraud = {
  deviceId: 'lekhio-oracle-probe',
  clientPublicIp: '127.0.0.1',
  vendorVersion: '1.0.0',
  vendorProductName: 'Lekhio',
  browserJsUserAgent: 'LekhioOracle/1.0',
  screens: 'width=1920&height=1080&scaling-factor=1&colour-depth=24',
};

// ⚠️ TWO SCENARIOS THAT MUST GIVE DIFFERENT TAX, IN ANY WORLD WHERE THE LAW IS THE LAW.
//
// £20,000 of profit is basic rate and a small bill. £90,000 is higher rate and a much bigger one.
// If HMRC hands back the same number for both, HMRC is not looking at our figures.
const SMALL = { turnover: 25_000, expenses: 5_000 };   // ~£20k profit
const LARGE = { turnover: 100_000, expenses: 10_000 }; // ~£90k profit

function money(n) { return `£${Math.round(Number(n) || 0).toLocaleString('en-GB')}`; }

async function tax(s, label) {
  console.log(`\n[probe] ${label}: turnover ${money(s.turnover)}, expenses ${money(s.expenses)}`);

  // buildPeriodicUpdate turns our own transactions into HMRC's payload shape. Already tested.
  const payload = H.buildPeriodicUpdate(
    [
      { amount: s.turnover, category: 'income' },
      { amount: -s.expenses, category: 'materials' },
    ],
    `${Number(TAX_YEAR.slice(0, 4))}-04-06`,
    `${Number(TAX_YEAR.slice(0, 4)) + 1}-04-05`,
  );

  // ⚠️ approved: true, AND IT IS AN HONEST TRUE.
  //
  // submitQuarterlyUpdate throws ApprovalRequiredError unless this is explicitly true. That gate
  // exists so that no code path can ever send a real man's figures to HMRC without him saying yes,
  // and it CAUGHT ME: my first version of this probe omitted it and would have thrown.
  //
  // Here the approval is real. It is a SANDBOX, a TEST NINO issued by HMRC's own test-user API, and
  // figures I invented. The person running this command is the person approving it. The gate is not
  // being bypassed; it is being satisfied by the only human involved.
  const submitted = await H.submitQuarterlyUpdate({
    nino: NINO,
    businessId: BUSINESS_ID,
    taxYear: TAX_YEAR,
    accessToken: TOKEN,
    payload,
    approved: true,
    fraud,
  });

  if (!submitted?.ok) {
    console.error(`[probe] submit FAILED: HTTP ${submitted?.status}`, JSON.stringify(submitted?.body ?? {}).slice(0, 300));
    return null;
  }

  const triggered = await H.triggerCalculation(NINO, TAX_YEAR, 'in-year', TOKEN, fraud);
  if (!triggered?.ok || !triggered.calculationId) {
    console.error(`[probe] trigger FAILED: HTTP ${triggered?.status}`);
    return null;
  }

  // HMRC computes asynchronously. Give it a moment, then read it back.
  await new Promise((r) => setTimeout(r, 3000));

  const calc = await H.retrieveCalculation(NINO, TAX_YEAR, triggered.calculationId, TOKEN, fraud);

  // ⚠️ WE DO NOT GUESS AT THE SHAPE OF HMRC'S RESPONSE. If we cannot find the figure, we SAY SO and
  // print what we got. A probe that silently reads `undefined` as zero would report that the sandbox
  // is canned, when in fact we simply looked in the wrong place, and we would abandon the best
  // validation available to us on the strength of our own parsing error.
  const total = calc?.calculation?.taxCalculation?.totalIncomeTaxAndNicsDue
    ?? calc?.taxCalculation?.totalIncomeTaxAndNicsDue;

  if (total === undefined || total === null) {
    console.error('[probe] 🔴 COULD NOT FIND THE TAX FIGURE IN HMRC\'S RESPONSE.');
    console.error('        That is a parsing problem, NOT evidence the sandbox is canned. Here is what came back:');
    console.error('       ', JSON.stringify(calc ?? {}).slice(0, 600));
    return null;
  }

  console.log(`[probe] HMRC says the tax is ${money(total)}`);
  return Number(total);
}

async function main() {
  if (!TOKEN || !NINO || !BUSINESS_ID) {
    console.error('\n🔴 MISSING SANDBOX CREDENTIALS. This probe talks to HMRC for real; it cannot be faked.\n');
    console.error('   Get a test user from the developer hub (Create Test User API), then:');
    console.error('     HMRC_TEST_ACCESS_TOKEN=... HMRC_TEST_NINO=... HMRC_TEST_BUSINESS_ID=... node test/oracle/probe.mjs\n');
    process.exit(1);
  }

  console.log('\n🔍 THE ORACLE PROBE. Does the HMRC sandbox actually CALCULATE, or does it hand back a fixture?');
  console.log('   Two scenarios, wildly different profits. If HMRC returns the same tax for both, it is not');
  console.log('   looking at our figures, and an oracle built on this sandbox would prove nothing.\n');

  const small = await tax(SMALL, 'SMALL profit');
  const large = await tax(LARGE, 'LARGE profit');

  if (small === null || large === null) {
    console.error('\n🔴 THE PROBE COULD NOT COMPLETE. That is not a "no", it is a "we do not know".');
    console.error('   Not knowing is not the same as being fine. Fix the call and run it again.\n');
    process.exit(1);
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════════════');

  if (Math.abs(large - small) < 1) {
    // ⚠️ THE ANSWER THAT KILLS THE FEATURE, AND IT IS A GOOD ANSWER TO GET. It is much cheaper to
    // learn this now than to build a harness, watch it go green, and believe it.
    console.log('🔴 THE SANDBOX DOES NOT COMPUTE.');
    console.log('');
    console.log(`   A profit of ~£20,000 and a profit of ~£90,000 both came back as ${money(small)}.`);
    console.log('   HMRC is handing us a CANNED response. It is not looking at our figures at all.');
    console.log('');
    console.log('   So an oracle harness built on this sandbox would compare our engine against a');
    console.log('   fixture HMRC invented, go green, and prove NOTHING, while looking like the');
    console.log('   strongest test in the product. That is the exact shape of every bug we found today.');
    console.log('');
    console.log('   THE ORACLE IS A PRODUCTION-ONLY TOOL. It waits for the live credentials (already in');
    console.log('   HMRC\'s queue) and one consenting user. DO NOT BUILD THE SANDBOX HARNESS.');
    console.log('═══════════════════════════════════════════════════════════════════════════════\n');
    process.exit(2);
  }

  console.log('✅ THE SANDBOX COMPUTES. The oracle is REAL.');
  console.log('');
  console.log(`   ~£20,000 of profit -> ${money(small)} of tax`);
  console.log(`   ~£90,000 of profit -> ${money(large)} of tax`);
  console.log('');
  console.log('   HMRC is reading our figures and doing the arithmetic. So we can hold our own engine');
  console.log('   up against HMRC\'s OWN calculation, on demand, for free, and nobody else in this');
  console.log('   market has that.');
  console.log('');
  console.log('   NEXT: node test/oracle/run-oracle.mjs  (walks the exam bank against HMRC)');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');
}

main().catch((e) => {
  console.error('\n🔴 THE PROBE THREW:', e.message);
  console.error('   A probe that crashed has not told you the sandbox is canned. It has told you nothing.\n');
  process.exit(1);
});

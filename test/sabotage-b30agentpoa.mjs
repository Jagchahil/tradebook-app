// SABOTAGE THE OTHER HALF OF JANUARY.
// B30, 18 AUGUST 2026. WHAT HMRC ASKS FOR ON ACCOUNT, AND WHAT IT NEVER ASKS FOR.
//
//   node test/sabotage-b30agentpoa.mjs
//   SAB_FROM=0 SAB_TO=5 node test/sabotage-b30agentpoa.mjs      (a slice, for a 45 second shell)
//   SAB_SKIP_CONTROLS=1 node test/sabotage-b30agentpoa.mjs
//
// R2-F23 moved the BILL out of lib/agent.ts and left the HALF behind, as Math.round(estBill / 2).
// gov.uk halves a different number: SALF303 says capital gains tax and student loan repayments are
// excluded from the computation of payments on account and are simply payable as part of the
// balancing payment. So a borrower was charged half his student loan a year early, every night,
// and on 18 August that was £639 of one Glasgow customer's January.
//
// This pass proves test/f23bill.test.mjs can actually bite on that, and on the three things that
// came with it: the £1,000 test on the relevant amount, the 80 percent deducted at source excuse,
// and the base travelling with the bill from ONE taxPosition() call.
//
// SUITES: f23bill alone, derived rather than copied from a sibling. It is the one suite that holds
// this repair, it reads lib/, app/api/cron/agent/route.ts, app/api/agent/reassess/route.ts and
// app/app/tax/page.tsx, and it fits in a single shell call whole.
//
// SCRATCH TREE: lib, test and app. supabase/ is NOT read by f23bill, derived by grepping it, so it
// is not copied. If a suite that reads it is ever added here, baseline() below is what will say so.
//
// ⚠️ EVERY ANCHOR QUOTES THE WORK, NEVER THE PROSE. The customer facing sentences in this block are
// about to change again (the Scotland caveat is the next packet), and a pass anchored on a sentence
// dies the day the sentence moves. Three anchors died that way on 17 August.

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function scratch() {
  const base = mkdtempSync(path.join(tmpdir(), 'sab-b30-'));
  const dir = path.join(base, 'tradebook');
  for (const d of ['lib', 'test', 'app']) cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  return { base, dir };
}

const SUITES = ['test/f23bill.test.mjs'];

// A crashing suite counts as RED. The full stop is optional on purpose: thirty suites in this repo
// end their tally without one, and a sibling pass once reported 25 of 25 while unable to tell a
// sabotage from an untouched repo because its regex required one.
function runSuite(dir) {
  for (const rel of SUITES) {
    try {
      const out = execFileSync('node', [path.join(dir, rel)], {
        cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (/[1-9]\d* failed\.?/.test(out)) return true;
      if (!/\d+ passed, 0 failed\.?/.test(out)) return true;
    } catch { return true; }
  }
  return false;
}

// 🔴 BASELINE, FROM DAY ONE. A pass measures a DIFFERENCE and cannot otherwise tell a caught
// sabotage from a harness that reds on everything. Three times now in this repo: a missing
// supabase/, a full disk, and a tally line.
function baseline() {
  const t = scratch();
  const red = runSuite(t.dir);
  rmSync(t.base, { recursive: true, force: true });
  if (red) {
    console.log('🔴 BROKEN HARNESS: an UNMODIFIED scratch tree is already RED.');
    console.log('   Nothing below would mean anything. Check, in this order:');
    console.log('   1. every directory these suites READ is copied by scratch()');
    console.log('   2. every suite tally line matches the regex in runSuite');
    console.log('   3. df -h on TMPDIR: a suite that dies of ENOSPC scores as caught');
    process.exit(1);
  }
  console.log('BASELINE: an unmodified scratch tree is GREEN, so a red below is the sabotage.\n');
}

const edit = (dir, rel, from, to) => {
  const p = path.join(dir, rel);
  const s = readFileSync(p, 'utf8');
  if (!s.includes(from)) throw new Error(`ANCHOR MISSING in ${rel}: ${from.slice(0, 70)}`);
  writeFileSync(p, s.split(from).join(to));
};

const AG = 'lib/agent.ts';
const SUPA = 'lib/supabase.ts';
const CRON = 'app/api/cron/agent/route.ts';
const REASSESS = 'app/api/agent/reassess/route.ts';
const TAXPAGE = 'app/app/tax/page.tsx';
const F23 = 'test/f23bill.test.mjs';

// ── THE ANCHORS. Each is a piece of WORK, and each is quoted from the interior of its expression
// rather than from the edge of a list or the start of a line. ────────────────────────────────────
const ENGINE_CALL = '      : paymentsOnAccount(base.tax, taxYearEnd(today).getUTCFullYear(), base.atSource);';
const REQUIRED_GATE = 'if (estBill !== null && schedule !== null && schedule.required) {';
const POA_FROM_ENGINE = '      const poa = schedule.eachPayment;';
const BASE_CHOICE = `    const base = haveGiven
      ? (baseTax === null ? null : { tax: baseTax, atSource: baseAtSource })
      : { tax: projTax, atSource: projCis };`;
const BASE_TAX_GUARD = '    const baseTax = p && typeof p.tax === \'number\' && Number.isFinite(p.tax) ? Math.max(0, p.tax) : null;';
const LOAN_CLAUSE = `      const loanClause = projSl > 0
        ? ' The payment on account is half your tax, not half the bill: HMRC never asks for a student loan repayment up front.'
        : '';`;
const READER_TAX = '      poa: { tax: position.selfAssessmentTax, deductedAtSource: position.cisSuffered },';
const READER_BILL = '      bill: billFromPosition(position),';
const CRON_POA = '    selfAssessmentPoa: january?.poa ?? null,';
const PAGE_ENGINE = '  const poa = paymentsOnAccount(tax.selfAssessmentTax, startYear + 1, tax.cisSuffered);';
const CODEONLY = "const codeOnly = (x) => x.replace(/\\/\\*[\\s\\S]*?\\*\\//g, '').replace(/(^|[^:])\\/\\/[^\\n]*/g, '$1');";

const SABOTAGES = [
  // ── THE EXACT DEFECT THAT WAS LIVE ON 18 AUGUST 2026, PUT BACK. ────────────────────────────
  {
    name: '🔴 the half goes back to Math.round(estBill / 2), which is what texted a man £15,738',
    apply: ({ dir }) => edit(dir, AG, POA_FROM_ENGINE, '      const poa = Math.round(estBill / 2);'),
  },
  {
    name: '🔴 the engine is handed the BILL instead of the tax, so the loan is back in the half',
    apply: ({ dir }) => edit(dir, AG, ENGINE_CALL,
      '      : paymentsOnAccount(estBill ?? 0, taxYearEnd(today).getUTCFullYear(), base.atSource);'),
  },
  {
    name: '🔴 the reader hands back setAside as the base, which is the bill with the loan in it',
    apply: ({ dir }) => edit(dir, SUPA, READER_TAX,
      '      poa: { tax: position.setAside, deductedAtSource: position.cisSuffered },'),
  },
  // ── THE THREE THINGS THE ENGINE BROUGHT WITH IT. ────────────────────────────────────────────
  {
    name: 'the £1,000 test goes back on the whole bill instead of the relevant amount',
    apply: ({ dir }) => edit(dir, AG, REQUIRED_GATE,
      'if (estBill !== null && schedule !== null && estBill > FACTS.poaThreshold) {'),
  },
  {
    name: 'the 80 percent deducted at source excuse is dropped from the engine call',
    apply: ({ dir }) => edit(dir, AG, ENGINE_CALL,
      '      : paymentsOnAccount(base.tax, taxYearEnd(today).getUTCFullYear());'),
  },
  {
    name: 'the reader stops passing the CIS, so a subbie is asked for tax his contractors paid',
    apply: ({ dir }) => edit(dir, SUPA, READER_TAX,
      '      poa: { tax: position.selfAssessmentTax, deductedAtSource: 0 },'),
  },
  // ── THE MISSING BASE, WHICH IS WHERE THE OLD BEHAVIOUR WOULD CREEP BACK IN. ─────────────────
  {
    name: '🔴 a missing base quietly falls back to halving the bill, for whoever did not read the memo',
    apply: ({ dir }) => edit(dir, AG, BASE_CHOICE, `    const base = haveGiven
      ? (baseTax === null ? { tax: estBill ?? 0, atSource: 0 } : { tax: baseTax, atSource: baseAtSource })
      : { tax: projTax, atSource: projCis };`),
  },
  {
    name: 'the base guard drops isFinite, so a NaN walks into a customer\'s January',
    apply: ({ dir }) => edit(dir, AG, BASE_TAX_GUARD,
      '    const baseTax = p && typeof p.tax === \'number\' ? Math.max(0, p.tax) : null;'),
  },
  {
    name: 'the fallback path loses its own base and borrows the blended bill instead',
    apply: ({ dir }) => edit(dir, AG, BASE_CHOICE, `    const base = haveGiven
      ? (baseTax === null ? null : { tax: baseTax, atSource: baseAtSource })
      : { tax: blendedBill, atSource: 0 };`),
  },
  // ── THE TWO ROUTES. ONE OF THEM FORGETTING IS HOW THE PAGE AND THE PHONE CAME APART BEFORE. ──
  {
    name: 'the nightly walk stops passing the base',
    apply: ({ dir }) => edit(dir, CRON, CRON_POA, ''),
  },
  {
    name: 'the on demand reassess stops passing the base',
    apply: ({ dir }) => edit(dir, REASSESS, CRON_POA, ''),
  },
  {
    name: 'the reader stops calling billFromPosition and writes the ternary out by hand again',
    apply: ({ dir }) => edit(dir, SUPA, READER_BILL,
      '      bill: position.cisSuffered > 0 ? position.setAsideAfterCis : position.setAside,'),
  },
  {
    name: '🔴 the TAX PAGE stops passing the CIS, so the page and the 08:00 text are two engines again',
    apply: ({ dir }) => edit(dir, TAXPAGE, PAGE_ENGINE,
      '  const poa = paymentsOnAccount(tax.selfAssessmentTax, startYear + 1);'),
  },
  // ── THE SENTENCE THAT EXPLAINS THE ARITHMETIC. ──────────────────────────────────────────────
  {
    name: 'the clause explaining why the halves do not match is deleted',
    apply: ({ dir }) => edit(dir, AG, LOAN_CLAUSE, "      const loanClause = '';"),
  },
  {
    name: 'the clause fires for everybody, including the man with nothing to explain',
    apply: ({ dir }) => edit(dir, AG, LOAN_CLAUSE, `      const loanClause = ' The payment on account is half your tax, not half the bill: HMRC never asks for a student loan repayment up front.';`),
  },
  {
    name: '🔴 "roughly one and a half times what you expect" comes back into the body',
    apply: ({ dir }) => edit(dir, AG, "so January is bigger than the bill itself:",
      "so the first January bill is roughly one and a half times what you expect:"),
  },
  // ── AND THE GUARD'S OWN EYES. ───────────────────────────────────────────────────────────────
  {
    name: 'the suite\'s comment stripper is made a no op, which would blind its own copy guard',
    apply: ({ dir }) => edit(dir, F23, CODEONLY, 'const codeOnly = (x) => x;'),
  },
];

const CONTROLS = [
  {
    name: 'a comment is added inside the payments on account block',
    apply: ({ dir }) => edit(dir, AG, ENGINE_CALL, `      // a comment, and comments are not arithmetic\n${ENGINE_CALL}`),
  },
  {
    name: 'gbp() is written out as the gbp0() it is defined to be, in the body',
    apply: ({ dir }) => edit(dir, AG, 'Over ${gbp(FACTS.poaThreshold)}, HMRC also asks',
      'Over ${gbp0(FACTS.poaThreshold)}, HMRC also asks'),
  },
  {
    name: 'the local p is renamed, consistently, and nothing reads its name',
    apply: ({ dir }) => {
      edit(dir, AG, '    const p = input.selfAssessmentPoa;', '    const poaIn = input.selfAssessmentPoa;');
      edit(dir, AG, BASE_TAX_GUARD,
        '    const baseTax = poaIn && typeof poaIn.tax === \'number\' && Number.isFinite(poaIn.tax) ? Math.max(0, poaIn.tax) : null;');
      edit(dir, AG, `    const baseAtSource = p && typeof p.deductedAtSource === 'number' && Number.isFinite(p.deductedAtSource)
      ? Math.max(0, p.deductedAtSource)
      : 0;`, `    const baseAtSource = poaIn && typeof poaIn.deductedAtSource === 'number' && Number.isFinite(poaIn.deductedAtSource)
      ? Math.max(0, poaIn.deductedAtSource)
      : 0;`);
    },
  },
  {
    name: 'a fourth key is added to numbers{}, which no guard pins the shape of',
    apply: ({ dir }) => edit(dir, AG, '        numbers: { estBill, poa, threshold: FACTS.poaThreshold },',
      '        numbers: { estBill, poa, threshold: FACTS.poaThreshold, relevant: base.tax - base.atSource },'),
  },
  {
    name: 'the reader\'s own comment is reworded, and a comment is not a contract',
    apply: ({ dir }) => edit(dir, SUPA, '// 🔴 AND IT RETURNS TWO NUMBERS NOW, NOT ONE, AND IT IS RENAMED TO SAY SO. B30, 18 August 2026.',
      '// 🔴 IT RETURNS TWO NUMBERS. B30.'),
  },
];

// ⚠️ A SLICE, BECAUSE THE FULL PASS MAY NOT FIT IN A COWORK SHELL CALL: every call is capped at 45
// seconds in a fresh sandbox and a detached process does not survive between calls. SAB_FROM and
// SAB_TO are indices into the sabotage list; unset means all of it, which is what the Mac runs.
const FROM = Number(process.env.SAB_FROM ?? 0);
const TO = Number(process.env.SAB_TO ?? SABOTAGES.length);
const RUNNING = SABOTAGES.slice(FROM, TO);
if (RUNNING.length !== SABOTAGES.length) {
  console.log(`SLICE: sabotages ${FROM}..${TO - 1} of ${SABOTAGES.length}. NOT THE WHOLE PASS.`);
}

baseline();

let caught = 0, missed = 0;
console.log('SABOTAGES (each must go RED)');
for (const s of RUNNING) {
  const t = scratch();
  try { s.apply(t); }
  catch (e) { missed += 1; console.log(`  MISSED ${s.name}  [${e.message}]`); rmSync(t.base, { recursive: true, force: true }); continue; }
  if (runSuite(t.dir)) { caught += 1; console.log(`  ok  ${s.name}`); }
  else { missed += 1; console.log(`  MISSED ${s.name}`); }
  rmSync(t.base, { recursive: true, force: true });
}
const RUNNING_C = process.env.SAB_SKIP_CONTROLS ? [] : CONTROLS;
let cOk = 0, cBad = 0;
console.log('\nCONTROLS (each must stay GREEN)');
for (const c of RUNNING_C) {
  const t = scratch();
  try { c.apply(t); }
  catch (e) { cBad += 1; console.log(`  BAD ${c.name}  [${e.message}]`); rmSync(t.base, { recursive: true, force: true }); continue; }
  if (runSuite(t.dir)) { cBad += 1; console.log(`  BAD ${c.name} went red`); }
  else { cOk += 1; console.log(`  ok  ${c.name}`); }
  rmSync(t.base, { recursive: true, force: true });
}
console.log('');
console.log(`${caught}/${RUNNING.length} sabotages caught, ${cOk}/${RUNNING_C.length} controls green.`);
if (missed > 0 || cBad > 0) process.exit(1);

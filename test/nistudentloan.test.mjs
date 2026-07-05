// Tests for lib/nistudentloan.ts, the NI and student loan engine.
// Run with: node test/nistudentloan.test.mjs
// Node 22.6+ imports the .ts directly via type stripping.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Node's type stripping needs explicit file extensions on relative imports,
// which the Next.js source cannot carry. So stage the two modules in a temp
// dir with the extension added, then import. Pure Node, no esbuild needed.
const here = path.dirname(fileURLToPath(import.meta.url));
const stage = mkdtempSync(path.join(tmpdir(), 'nisl-'));
writeFileSync(path.join(stage, 'taxengine.ts'), readFileSync(path.resolve(here, '../lib/taxengine.ts'), 'utf8'));
writeFileSync(
  path.join(stage, 'nistudentloan.ts'),
  readFileSync(path.resolve(here, '../lib/nistudentloan.ts'), 'utf8').replace(
    "from './taxengine'",
    "from './taxengine.ts'"
  )
);
const mod = await import(pathToFileURL(path.join(stage, 'nistudentloan.ts')).href);
const { NI_FACTS, class1NIC, niPosition, STUDENT_PLANS, studentLoanRepayment, validPlanSelection } = mod;

let pass = 0;
let fail = 0;
function eq(name, got, want) {
  const ok = typeof want === 'number' ? Math.abs(got - want) < 0.005 : got === want;
  if (ok) pass++;
  else {
    fail++;
    console.error(`FAIL ${name}: got ${got}, want ${want}`);
  }
}

// --- Class 1 employee NI, 2026/27: 8% between 12,570 and 50,270, 2% above ---
eq('class1 nothing below PT', class1NIC(12570), 0);
eq('class1 nothing at zero', class1NIC(0), 0);
eq('class1 at 20,000', class1NIC(20000), (20000 - 12570) * 0.08); // 594.40
eq('class1 at UEL', class1NIC(50270), (50270 - 12570) * 0.08); // 3016.00
eq('class1 at 80,000', class1NIC(80000), 3016 + (80000 - 50270) * 0.02); // 3610.60
eq('class1 at 130,000', class1NIC(130000), 3016 + (130000 - 50270) * 0.02);

// --- The combined position ---------------------------------------------------
const emp = niPosition(30000, 0);
eq('employed status', emp.status, 'employed');
eq('employed class1', emp.class1, (30000 - 12570) * 0.08);
eq('employed class4 zero', emp.class4, 0);
eq('employed qualifies via employment', emp.qualifiesViaEmployment, true);
eq('employed no voluntary prompt', emp.voluntaryClass2Suggested, false);

const se = niPosition(0, 30000);
eq('selfEmployed status', se.status, 'selfEmployed');
eq('selfEmployed class4', se.class4, (30000 - 12570) * 0.06);
eq('selfEmployed class1 zero', se.class1, 0);
eq('selfEmployed qualifies via profits', se.qualifiesViaProfits, true);

// Low profits, no job: the £190 a year voluntary Class 2 decision
const low = niPosition(0, 5000);
eq('low profits below SPT does not qualify', low.qualifiesViaProfits, false);
eq('low profits voluntary suggested', low.voluntaryClass2Suggested, true);
eq('voluntary class2 annual', low.class2Voluntary.annual, 3.65 * 52); // 189.80
eq('class2 not compulsory', low.class2Voluntary.compulsory, false);

// Low profits but a real job above the LEL: pension year already safe
const mix = niPosition(9000, 5000);
eq('mixer status', mix.status, 'both');
eq('mixer qualifies via employment', mix.qualifiesViaEmployment, true);
eq('mixer no voluntary prompt', mix.voluntaryClass2Suggested, false);

// High earner with both: maxima flag on
const high = niPosition(50000, 40000);
eq('maxima flag on for high both', high.annualMaximaMayApply, true);
eq('maxima flag off for employed only', niPosition(90000, 0).annualMaximaMayApply, false);

// Earnings between LEL and PT: no NI paid, year still qualifies
const lel = niPosition(7000, 0);
eq('LEL band pays nothing', lel.class1, 0);
eq('LEL band still qualifies', lel.qualifiesViaEmployment, true);

// --- Student loans, 2026/27 thresholds ---------------------------------------
eq('plan1 threshold', STUDENT_PLANS.plan1.threshold, 26900);
eq('plan2 threshold', STUDENT_PLANS.plan2.threshold, 29385);
eq('plan4 threshold', STUDENT_PLANS.plan4.threshold, 33795);
eq('plan5 threshold', STUDENT_PLANS.plan5.threshold, 25000);
eq('postgrad threshold', STUDENT_PLANS.postgrad.threshold, 21000);

// Below threshold, nothing
eq('plan2 below threshold', studentLoanRepayment(29000, ['plan2']).annualTotal, 0);
// The published example shapes: 9% above threshold
eq('plan2 at 35,000', studentLoanRepayment(35000, ['plan2']).annualTotal, (35000 - 29385) * 0.09); // 505.35
eq('plan1 at 35,000', studentLoanRepayment(35000, ['plan1']).annualTotal, (35000 - 26900) * 0.09); // 729.00
eq('plan5 at 35,000', studentLoanRepayment(35000, ['plan5']).annualTotal, (35000 - 25000) * 0.09); // 900.00
eq('postgrad at 35,000', studentLoanRepayment(35000, ['postgrad']).annualTotal, (35000 - 21000) * 0.06); // 840.00

// Plan 2 plus postgrad stack, each above its own threshold
const stack = studentLoanRepayment(40000, ['plan2', 'postgrad']);
eq('stacked total', stack.annualTotal, (40000 - 29385) * 0.09 + (40000 - 21000) * 0.06); // 955.35 + 1140
eq('stacked has two rows', stack.perPlan.length, 2);
eq('stacked monthly', stack.monthlyTotal, Math.round(((40000 - 29385) * 0.09 + (40000 - 21000) * 0.06) / 12 * 100) / 100);

// Duplicates collapse, selection rule
eq('duplicate plans collapse', studentLoanRepayment(40000, ['plan2', 'plan2']).perPlan.length, 1);
eq('two undergrad plans invalid', validPlanSelection(['plan1', 'plan2']), false);
eq('plan plus postgrad valid', validPlanSelection(['plan2', 'postgrad']), true);
eq('postgrad alone valid', validPlanSelection(['postgrad']), true);

// Zero and negative income guard
eq('zero income zero repayment', studentLoanRepayment(0, ['plan2']).annualTotal, 0);
eq('negative income zero repayment', studentLoanRepayment(-5, ['plan2']).annualTotal, 0);

console.log(`nistudentloan: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

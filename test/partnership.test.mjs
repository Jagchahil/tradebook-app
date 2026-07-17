// Tests for lib/partnership.ts — the partnership allocation engine over the sole-trader tax maths.
//   node test/partnership.test.mjs
// It imports the canonical engine (extensionless), so we stage and rewrite the relative imports,
// the same pattern as test/taxoptimiser.test.mjs.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'pship-'));
const fix = (s) => s.replace("from './taxengine'", "from './taxengine.ts'");
writeFileSync(path.join(stage, 'taxengine.ts'), readFileSync(path.join(lib, 'taxengine.ts'), 'utf8'));
writeFileSync(path.join(stage, 'partnership.ts'), fix(readFileSync(path.join(lib, 'partnership.ts'), 'utf8')));

const P = await import(pathToFileURL(path.join(stage, 'partnership.ts')).href);

let pass = 0;
let fail = 0;
const near = (a, b) => Math.abs(a - b) <= 0.01;
function ok(desc, cond) {
  if (cond) {
    pass++;
    process.stdout.write(`  PASS  ${desc}\n`);
  } else {
    fail++;
    process.stdout.write(`  FAIL  ${desc}\n`);
  }
}

// A partner taxed on their share must equal a sole trader on the same profit. That is the whole legal
// point of a transparent partnership, and it is the anchor for every number below.
//   soleTraderTax(30000) = £3,486 income tax + £1,045.80 Class 4 = £4,531.80
//   soleTraderTax(70000) = £15,432 + £2,656.60 = £18,088.60
//   soleTraderTax(50000) = £7,486 + £2,245.80 = £9,731.80
//   soleTraderTax(20000) = £1,486 + £445.80 = £1,931.80
//   soleTraderTax(15000) = £486 + £145.80 = £631.80

// 1. The classic 50/50, no salaries. Each takes half, each taxed on half.
{
  const r = P.partnershipTax({ profit: 60000, partners: [{ name: 'A' }, { name: 'B' }] });
  ok('50/50: each partner gets £30,000', near(r.partners[0].profitShare, 30000) && near(r.partners[1].profitShare, 30000));
  ok('50/50: each partner owes £4,531.80', near(r.partners[0].total, 4531.8) && near(r.partners[1].total, 4531.8));
  ok('50/50: the whole split adds back to the profit', near(r.allocated, 60000));
  ok('50/50: total tax across partners is £9,063.60', near(r.totalTax, 9063.6));
}

// 2. Unequal 70/30, and a partner pushed into the 40% band. The higher-share partner pays more, at
//    their own marginal rate, exactly as if they were a sole trader on £70,000.
{
  const r = P.partnershipTax({ profit: 100000, partners: [{ name: 'A', share: 70 }, { name: 'B', share: 30 }] });
  ok('70/30: shares are £70,000 and £30,000', near(r.partners[0].profitShare, 70000) && near(r.partners[1].profitShare, 30000));
  ok('70/30: the 70% partner owes £18,088.60 (into the 40% band)', near(r.partners[0].total, 18088.6));
  ok('70/30: the 30% partner owes £4,531.80', near(r.partners[1].total, 4531.8));
  ok('70/30: total tax is £22,620.40', near(r.totalTax, 22620.4));
}

// 3. A "salary" first, then the balance shared. The salary is a PRIOR SLICE of profit, not payroll.
//    Profit £80,000, A takes £20,000 off the top, then £60,000 split 50/50.
{
  const r = P.partnershipTax({ profit: 80000, partners: [{ name: 'A', salary: 20000, share: 50 }, { name: 'B', share: 50 }] });
  ok('salary+ratio: A gets £50,000 (20k salary + 30k residual)', near(r.partners[0].profitShare, 50000));
  ok('salary+ratio: B gets £30,000', near(r.partners[1].profitShare, 30000));
  ok('salary+ratio: A owes £9,731.80, B owes £4,531.80', near(r.partners[0].total, 9731.8) && near(r.partners[1].total, 4531.8));
  ok('salary+ratio: split still reconciles to £80,000', near(r.allocated, 80000));
}

// 4. Three partners, equal, no split given. The default is an even share.
{
  const r = P.partnershipTax({ profit: 45000, partners: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] });
  ok('three equal partners each get £15,000', r.partners.every((p) => near(p.profitShare, 15000)));
  ok('three equal partners each owe £631.80', r.partners.every((p) => near(p.total, 631.8)));
  ok('three-way split reconciles to £45,000', near(r.allocated, 45000));
}

// 5. A salary bigger than the profit forces a partner into a LOSS. We must report the loss, tax it at
//    zero, and NOT quietly turn it into income. Profit £10,000, A takes £30,000 salary, 50/50 residual
//    of -£20,000. A ends on £20,000, B on -£10,000.
{
  const r = P.partnershipTax({ profit: 10000, partners: [{ name: 'A', salary: 30000, share: 50 }, { name: 'B', share: 50 }] });
  ok('loss case: A ends on £20,000, taxed £1,931.80', near(r.partners[0].profitShare, 20000) && near(r.partners[0].total, 1931.8));
  ok('loss case: B is on -£10,000, flagged a loss and taxed at zero', r.partners[1].isLoss === true && near(r.partners[1].total, 0));
  ok('loss case: the shares still add back to the £10,000 profit', near(r.allocated, 10000));
}

// 6. Empty and single-partner guards do not throw.
{
  const empty = P.partnershipTax({ profit: 50000, partners: [] });
  ok('no partners: returns cleanly with zero tax', empty.totalTax === 0 && empty.partners.length === 0);
  const solo = P.partnershipTax({ profit: 40000, partners: [{ name: 'A' }] });
  ok('one partner takes the whole profit, taxed as a sole trader', near(solo.partners[0].profitShare, 40000) && near(solo.allocated, 40000));
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

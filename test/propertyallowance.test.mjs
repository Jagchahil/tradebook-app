// R2-F27. THE WAYS TO SAVE PAGE TOLD A MORTGAGED LANDLORD THE £1,000 ALLOWANCE BEAT HER, WHILE
// THE TAX PAGE BESIDE IT HAD CORRECTLY GIVEN HER THE SECTION 24 CREDIT.
// Run with: node test/propertyallowance.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Found on 13 August 2026 by the Phase D retest, on live production, after the property expense
// migration put £2,440 of buy to let interest into Rosa's property stream.
//
//   /app/tax             actual costs used, Section 24 credit given, bill £1,866
//   /app/tax/ways-to-save "You have rental income but very little logged against it."
//                         "The £1,000 property allowance beats your £0 of expenses, so it is used
//                          instead. Worked out on the £4,750 of rent and £0 of property costs."
//
// 🔴 AND lib/taxoptimiser.ts HAD WARNED ABOUT THIS, IN FULL, 612 LINES ABOVE THE LINE THAT DID IT:
//
//   "AND IT IS NOT AS SIMPLE AS CALLING propertyProfit(). That function compares the allowance
//    against actualExpenses ALONE, and mortgage interest is deliberately NOT in ytdPropertyExpenses
//    ... Handing it the expenses figure on its own would tell a mortgaged landlord with £15,000 of
//    interest and £500 of other costs that the allowance beats him, and silently destroy his
//    Section 24 credit. That would be a far bigger error than the one being fixed, and in the
//    DANGEROUS direction."
//
// The warning was right. It was written down. Nothing enforced it. So the rule moved INTO
// propertyProfit(), where a caller cannot get it wrong by leaving an argument out, and this suite
// is what enforces it.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const lib = path.join(root, 'lib');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
const fix = (s) => s.replace(/from '(\.\/[a-zA-Z0-9._-]+)'/g, "from '$1.ts'");
const stage = mkdtempSync(path.join(tmpdir(), 'palw-'));
for (const f of ['taxengine', 'propertyengine']) {
  writeFileSync(path.join(stage, f + '.ts'), fix(readFileSync(path.join(lib, f + '.ts'), 'utf8')));
}
const P = await import(pathToFileURL(path.join(stage, 'propertyengine.ts')).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.error(`  FAIL ${name}`); } };

console.log('A. 🔴 Rosa, exactly as she stood on production');
{
  // £4,750 of rent, £0 of other costs, £2,440 of buy to let interest.
  const withInterest = P.propertyProfit(4750, 0, '2026-27', 2440);
  ok('🔴 the allowance does NOT win against her interest', withInterest.usedAllowance === false);
  ok('and the profit is the full rent, because finance is never deducted', withInterest.profit === 4750);
  ok('the deduction is her actual expenses, which are nil', withInterest.deduction === 0);
  ok('🔴 and the sentence explains the interest rather than talking nonsense about £0 of expenses',
    /Section 24 credit/.test(withInterest.note) && !/Actual expenses beat/.test(withInterest.note));
  ok('it says plainly that she cannot have both', /cannot have both/.test(withInterest.note));

  // The bug: the same call without the interest.
  const bug = P.propertyProfit(4750, 0, '2026-27');
  ok('🔴 THE BUG REPRODUCED: expenses alone hands her the allowance', bug.usedAllowance === true);
  ok('and the two answers genuinely differ', bug.usedAllowance !== withInterest.usedAllowance);
}

console.log('B. The comparison is expenses PLUS finance, and only the comparison');
{
  // The dangerous case the warning named: huge interest, tiny expenses.
  const big = P.propertyProfit(20000, 500, '2026-27', 15000);
  ok('🔴 £15,000 of interest and £500 of costs does NOT take the allowance', big.usedAllowance === false);
  ok('and the profit deducts the £500 only, never the interest', big.profit === 19500);

  // Finance genuinely tiny: the allowance should still win, which the comment says is right.
  const tiny = P.propertyProfit(20000, 200, '2026-27', 300);
  ok('a landlord with £500 of everything still gets the allowance', tiny.usedAllowance === true);
  ok('and his profit is rents less the £1,000', tiny.profit === 19000);

  // Straddling the line.
  ok('£999 of costs and finance together keeps the allowance',
    P.propertyProfit(20000, 500, '2026-27', 499).usedAllowance === true);
  ok('🔴 £1,000 together loses it', P.propertyProfit(20000, 500, '2026-27', 500).usedAllowance === false);
}

console.log('C. Nothing an existing caller does changes');
{
  // Every call written before 13 August passes three arguments. Those must behave identically.
  for (const [r, e] of [[20000, 500], [20000, 5000], [800, 0], [4000, 1200]]) {
    const a = P.propertyProfit(r, e, '2026-27');
    const b = P.propertyProfit(r, e, '2026-27', 0);
    ok(`three arguments equals four-with-zero (${r}/${e})`, JSON.stringify(a) === JSON.stringify(b));
  }
  ok('rents inside the allowance still report nothing to tax',
    P.propertyProfit(800, 0, '2026-27').profit === 0);
}

console.log('D. 🔴 And the caller that got it wrong now passes it');
{
  const opt = read('lib/taxoptimiser.ts');
  ok('the levers read the finance figure', /const propFinance = Math\.max\(0, input\.ytdPropertyFinance \?\? 0\);/.test(opt));
  ok('🔴 the allowance lever hands it to the engine',
    /propertyProfit\(propIncome, propExpenses, propYear, propFinance\)/.test(opt));
  ok('🔴 and "very little logged" counts interest as logged',
    /propExpenses \+ propFinance < propIncome \* 0\.1/.test(opt));
  // The warning that was ignored must still be in the file, because it is still true of anyone
  // who calls this with three arguments.
  ok('the original warning is still there for the next person',
    /silently destroy his Section 24 credit/.test(opt));
  // 🔴 AND THE BASIS NAMES THE DECIDING FIGURE. Caught by retesting F27's own fix on production:
  // the card said "your mortgage interest is worth more as a Section 24 credit" and then showed the
  // rent and the £0 of costs and NOT the interest, which is the one number that drove the answer.
  // This page's footer promises the working, and a working with the deciding number left out is not
  // one.
  ok('🔴 the basis names the mortgage interest when there is any',
    /plus £\$\{round\(propFinance\)\.toLocaleString\('en-GB'\)\} of mortgage interest/.test(opt));
  ok('and says why it is not in the profit', /held \s*`?\s*\+ 'out of your property profit and relieved as a credit instead\.'/.test(opt)
    || /out of your property profit and relieved as a credit instead/.test(opt));
  ok('a landlord with no interest gets no extra clause', /: '\.'\),/.test(opt));
}

console.log('');
console.log(`${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

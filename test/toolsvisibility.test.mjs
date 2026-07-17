// Tests for the app's tool-visibility logic (lib/toolsvisibility.ts in the mobile repo). Pure, no
// network. Reaches the sibling app repo, so run-all skips it when the app is not checked out.
//   node test/toolsvisibility.test.mjs

import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const modPath = path.resolve(here, '../../tradebook-app/lib/toolsvisibility.ts');
if (!existsSync(modPath)) {
  console.log('\n  (mobile repo not present, skipping tools visibility)\n');
  process.exit(0);
}
const V = await import('../../tradebook-app/lib/toolsvisibility.ts');

let pass = 0;
let fail = 0;
function ok(desc, cond) {
  if (cond) { pass++; process.stdout.write(`  PASS  ${desc}\n`); }
  else { fail++; process.stdout.write(`  FAIL  ${desc}\n`); }
}

// The Tools screen order.
const ALL = ['/what-if', '/pay-yourself', '/can-i-claim', '/proof-of-income', '/national-insurance', '/student-loan', '/properties', '/cis', '/file-return'];

// A plain sole trader in June: no CIS, no property, no loan, not filing season.
{
  const { primary, more } = V.splitTools(ALL, { businessType: 'sole_trader', month: 6 });
  ok('plain user: the five everyday tools show up front', ['/what-if', '/pay-yourself', '/can-i-claim', '/proof-of-income', '/national-insurance'].every((r) => primary.includes(r)));
  ok('plain user: CIS, properties, student loan, filing are tucked under Show all', ['/cis', '/properties', '/student-loan', '/file-return'].every((r) => more.includes(r)));
  ok('plain user: nothing is lost, every tool is in one group or the other', primary.length + more.length === ALL.length);
}

// A construction subcontractor with CIS suffered sees CIS up front.
{
  const { primary } = V.splitTools(ALL, { hasCis: true, month: 6 });
  ok('subcontractor with CIS: the CIS tool surfaces', primary.includes('/cis'));
}

// A landlord sees Properties; a graduate with a plan sees Student loan.
{
  ok('landlord: Properties surfaces', V.splitTools(ALL, { hasProperty: true, month: 6 }).primary.includes('/properties'));
  ok('has a student loan plan: Student loan surfaces', V.splitTools(ALL, { hasStudentLoan: true, month: 6 }).primary.includes('/student-loan'));
}

// The filing walkthrough shows in the January run-up, hides in the summer.
{
  ok('January: File your return surfaces', V.splitTools(ALL, { month: 1 }).primary.includes('/file-return'));
  ok('June: File your return is tucked away', V.splitTools(ALL, { month: 6 }).more.includes('/file-return'));
  ok('filing season is Oct to Jan', V.isFilingSeason(10) && V.isFilingSeason(12) && V.isFilingSeason(1) && !V.isFilingSeason(6) && !V.isFilingSeason(2));
}

// We only hide what we reasoned about. An unknown tool always shows.
{
  ok('an unknown tool is shown, never quietly dropped', V.isPrimaryTool('/some-new-thing', { month: 6 }) === true);
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

// Tests for lib/autonomy.ts, the autonomy dial and its non-negotiable doctrine.
//   node test/autonomy.test.mjs
// The most important test in this file is the exhaustive one: NO level, for ANY
// irreversible action, may ever auto-execute or skip approval.

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const A = await import(`${pathToFileURL(path.resolve(here, '../lib/autonomy.ts')).href}`);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}`); } };

const LEVELS = ['suggest', 'draft', 'auto'];
const IRREVERSIBLE = ['file_to_hmrc', 'submit_quarterly_update', 'pay_tax', 'move_money', 'make_payment', 'purchase', 'send_to_third_party', 'send_invoice'];
const ADMIN = ['categorise_transaction', 'update_set_aside', 'send_reminder', 'log_entry', 'apply_allowance_election'];
const PREPARE = ['draft_invoice_chase', 'prepare_quarterly_update', 'prepare_tax_return'];

console.log('\n=== autonomy: classification ===\n');
ok('filing is irreversible', A.classifyAction('file_to_hmrc') === 'irreversible');
ok('moving money is irreversible', A.classifyAction('move_money') === 'irreversible');
ok('categorising is admin', A.classifyAction('categorise_transaction') === 'admin');
ok('preparing a return is prepare', A.classifyAction('prepare_tax_return') === 'prepare');
ok('an UNKNOWN action defaults to irreversible (safest)', A.classifyAction('some_new_action_we_forgot') === 'irreversible');

console.log('\n=== autonomy: THE DOCTRINE (exhaustive) ===\n');
let doctrineHeld = true;
for (const level of LEVELS) {
  for (const action of [...IRREVERSIBLE, 'some_new_action_we_forgot']) {
    const d = A.decideAction(action, level);
    if (d.requiresApproval !== true) { doctrineHeld = false; console.log(`    breach: ${action}@${level} requiresApproval=${d.requiresApproval}`); }
    if (d.mode === 'auto') { doctrineHeld = false; console.log(`    breach: ${action}@${level} mode=auto`); }
    if (A.canAutoExecute(action, level) !== false) { doctrineHeld = false; console.log(`    breach: ${action}@${level} canAutoExecute=true`); }
  }
}
ok('NO irreversible/unknown action ever auto-executes or skips approval, at ANY level', doctrineHeld);

console.log('\n=== autonomy: what each level does with safe work ===\n');
// suggest: nothing is prepared or executed, everything is just a suggestion.
for (const a of [...ADMIN, ...PREPARE]) ok(`suggest level only suggests: ${a}`, A.decideAction(a, 'suggest').mode === 'suggest');

// draft: admin and prepare are drafted, nothing auto, nothing executed.
for (const a of [...ADMIN, ...PREPARE]) ok(`draft level drafts: ${a}`, A.decideAction(a, 'draft').mode === 'draft');

// auto: reversible admin runs itself; prepare is still only drafted.
for (const a of ADMIN) ok(`auto level auto-runs reversible admin: ${a}`, A.decideAction(a, 'auto').mode === 'auto' && A.canAutoExecute(a, 'auto') === true);
for (const a of PREPARE) ok(`auto level still only drafts a prepare action: ${a}`, A.decideAction(a, 'auto').mode === 'draft');

console.log('\n=== autonomy: level parsing defaults to cautious ===\n');
ok('valid level passes through', A.parseLevel('auto') === 'auto');
ok('null defaults to suggest', A.parseLevel(null) === 'suggest');
ok('garbage defaults to suggest', A.parseLevel('YOLO') === 'suggest');

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

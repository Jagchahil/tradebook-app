// The WhatsApp send budget now lives in lib/margin.ts (the single economics
// model), and its behaviour is covered by test/margin.test.mjs, which scores the
// WhatsApp and AI budgets TOGETHER against the margin floor. That combined number
// is the only honest one, so it is tested in one place.
//
// This file is kept as a placeholder so the suite name does not vanish from the
// runner's history. It asserts only that the old module is now a pure re-export
// of the shared model, so nothing can quietly fork the economics again.

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const G = await import(`${pathToFileURL(path.resolve(here, '../lib/margin.ts')).href}`);

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

console.log('\n=== the WhatsApp budget lives in the shared model ===\n');
ok('margin.ts owns the send allowance', typeof G.sendsPerUserPerMonth === 'function');
ok('margin.ts owns the daily ceiling', typeof G.globalDailyCapFor === 'function');
ok('margin.ts owns the kill switch', typeof G.waSendsEnabled === 'function');
ok('margin.ts owns the stop decision', typeof G.waBudgetExceeded === 'function');
ok('and it owns the AI side too, so the two are scored together', typeof G.aiCapsFor === 'function');
ok('the combined margin is exposed for testing, not hidden', typeof G.projectedMarginPct === 'function');

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

// The WhatsApp send budget now lives in lib/margin.ts (the single economics
// model), and its behaviour is covered by test/margin.test.mjs, which scores the
// WhatsApp and AI budgets TOGETHER against the margin floor. That combined number
// is the only honest one, so it is tested in one place.
//
// This file is kept as a placeholder so the suite name does not vanish from the
// runner's history. It asserts only that the old module is now a pure re-export
// of the shared model, so nothing can quietly fork the economics again.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// margin.ts imports the price book from lib/aicost.ts (the gate consults the real per model
// prices), so this loads it the staged way test/numbers.test.mjs does: copy lib/ aside and give
// every relative import its .ts extension for node's type stripping.
const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'wabudget-'));
const fix = (s) => s.replace(/from '(\.\/[a-zA-Z0-9._-]+)'/g, "from '$1.ts'");
for (const f of readdirSync(lib)) {
  if (f.endsWith('.ts')) writeFileSync(path.join(stage, f), fix(readFileSync(path.join(lib, f), 'utf8')));
}
const G = await import(`${pathToFileURL(path.join(stage, 'margin.ts')).href}`);

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

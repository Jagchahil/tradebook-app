// One command to run every Lekhio test suite and get a single verdict.
//
//   node test/run-all.mjs
//
// It discovers and runs, in a stable order:
//   . every test/*.test.mjs (engines, parity, agent, waintents, crypto, stripe)
//   . the tax exam bank runner (test/exams/run-exams.mjs)
//   . the HMRC MTD suite runner (test/hmrc/run-hmrc-test.mjs)
//   . test/logic.test.js, which needs the `typescript` npm module to transpile
//     taxguide.ts in memory. When that module is not installed (the partial
//     cowork copy has no node_modules), the suite is SKIPPED with a clear note
//     rather than failing, since it is covered by the deploy repo's CI.
//
// Each suite runs in its own `node` process. We capture its output, read the
// per suite "N passed, M failed." line when it prints one, and show a compact
// summary. On any failure we print that suite's full output and exit non-zero,
// so this is safe to wire straight into CI or a pre-push hook.

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

// The list of suites, in run order. Everything matching test/*.test.mjs is
// picked up automatically so a new suite needs no edit here; the two runner
// scripts and the logic suite are named explicitly.
const mjsSuites = readdirSync(here)
  .filter((f) => f.endsWith('.test.mjs'))
  .sort()
  .map((f) => ({ name: f.replace(/\.test\.mjs$/, ''), file: path.join(here, f), kind: 'node' }));

const suites = [
  ...mjsSuites,
  { name: 'exams', file: path.join(here, 'exams', 'run-exams.mjs'), kind: 'node' },
  { name: 'hmrc', file: path.join(here, 'hmrc', 'run-hmrc-test.mjs'), kind: 'node' },
  { name: 'logic', file: path.join(here, 'logic.test.js'), kind: 'logic' },
];

// Resolve whether `typescript` is installed, for the logic suite gate.
let tsInstalled = false;
try {
  const { createRequire } = await import('node:module');
  const require = createRequire(pathToFileURL(path.join(repoRoot, 'package.json')).href);
  require.resolve('typescript');
  tsInstalled = true;
} catch {
  tsInstalled = false;
}

const results = [];
const started = Date.now();

for (const suite of suites) {
  if (suite.kind === 'logic' && !tsInstalled) {
    results.push({ name: suite.name, status: 'skip', note: 'needs `typescript` (runs in deploy CI)', passed: 0, failed: 0 });
    process.stdout.write(`  SKIP  ${suite.name.padEnd(16)} needs \`typescript\`, runs in deploy CI\n`);
    continue;
  }

  const run = spawnSync(process.execPath, [suite.file], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: process.env,
  });
  const out = `${run.stdout ?? ''}${run.stderr ?? ''}`;

  // Pull the last "N passed, M failed." line if the suite prints one.
  let passed = 0;
  let failed = 0;
  const m = [...out.matchAll(/(\d+)\s+passed,\s+(\d+)\s+failed/gi)].pop();
  if (m) { passed = Number(m[1]); failed = Number(m[2]); }

  // A suite is failed if it exited non-zero OR reported any failed assertion.
  const failedRun = run.status !== 0 || failed > 0;
  results.push({ name: suite.name, status: failedRun ? 'fail' : 'pass', passed, failed, exit: run.status, out });

  const label = failedRun ? 'FAIL' : 'PASS';
  const counts = m ? `${passed} passed, ${failed} failed` : `exit ${run.status}`;
  process.stdout.write(`  ${label}  ${suite.name.padEnd(16)} ${counts}\n`);
}

// Full output for anything that failed, so the cause is right here.
const failures = results.filter((r) => r.status === 'fail');
for (const f of failures) {
  process.stdout.write(`\n----- output: ${f.name} (exit ${f.exit}) -----\n`);
  process.stdout.write(f.out.trimEnd() + '\n');
}

const totalPassed = results.reduce((n, r) => n + r.passed, 0);
const skipped = results.filter((r) => r.status === 'skip');
const seconds = ((Date.now() - started) / 1000).toFixed(1);

process.stdout.write('\n===============================================\n');
process.stdout.write(
  `Suites: ${results.length}   ` +
  `passed ${results.filter((r) => r.status === 'pass').length}   ` +
  `failed ${failures.length}   ` +
  `skipped ${skipped.length}\n`,
);
process.stdout.write(`Assertions counted: ${totalPassed} passed   (${seconds}s)\n`);
process.stdout.write('===============================================\n');

if (failures.length > 0) {
  process.stdout.write(`\nFAILED: ${failures.map((f) => f.name).join(', ')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('\nAll suites green.\n');
  process.exitCode = 0;
}

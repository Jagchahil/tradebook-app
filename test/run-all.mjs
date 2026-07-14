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
import { readdirSync, existsSync, readFileSync } from 'node:fs';
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

// Khoji's differ (khoji/difftest.mjs). It lives outside test/ because the SAME FILE runs on the
// Mac mini, where there is no repo, and it must not drift from what the mini executes.
//
// It is in CI for one reason. The differ is the only thing that checks our tax constants against
// the pages HMRC publishes them on, and its extractors are regexes against GOV.UK prose. A regex
// that silently starts reading the wrong number off a page is not a crash, it is a lie that gets
// quieter over time. It runs on fixtures, never the network, so it is deterministic.
const khojiDiffer = path.join(repoRoot, 'khoji', 'difftest.mjs');

// Khoji's AMENDMENT watcher (khoji/amendtest.mjs). Same reasoning as the differ: the same file runs
// on the Mac mini, where there is no repo, so it must not be allowed to drift from what the mini
// executes. It is in CI because it decides whether we ever notice that a GOV.UK page was rewritten
// under us. diff.mjs checks the NUMBERS; this checks the DOCUMENT. A footnote, an effective date or
// a new band can move without moving a single number we extract, and the differ would report all
// green. Being late is recoverable. Being confidently wrong for a fortnight is not.
const khojiAmend = path.join(repoRoot, 'khoji', 'amendtest.mjs');

// Khoji's BUDGET fast loop (khoji/budgettest.mjs). Same reasoning as the differ and the amendment
// watcher: the same file runs on the Mac mini, where there is no repo, so it must not drift.
//
// It is in CI because operativeDate() decides which HALF of the law a measure lands in. Read the
// wrong date off a TIIN and a change taking effect in 2027 is filed as IN FORCE, phase() agrees, and
// Rakha answers a man from next year's law today.
const khojiBudget = path.join(repoRoot, 'khoji', 'budgettest.mjs');

const suites = [
  ...mjsSuites,
  ...(existsSync(khojiDiffer) ? [{ name: 'khoji-differ', file: khojiDiffer, kind: 'node' }] : []),
  ...(existsSync(khojiAmend) ? [{ name: 'khoji-amend', file: khojiAmend, kind: 'node' }] : []),
  ...(existsSync(khojiBudget) ? [{ name: 'khoji-budget', file: khojiBudget, kind: 'node' }] : []),
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

// SOME SUITES REACH ACROSS INTO THE MOBILE REPO, which sits in a sibling checkout locally and does
// not exist in single-repo CI. When it is absent they are skipped rather than failed, the same way
// `logic` is skipped without `typescript`.
//
// ⚠️ THIS USED TO BE A NAMING CONVENTION: `if (suite.name.endsWith('-parity'))`. It worked for four
// suites and then `appfacts` was added, which needs the sibling and is not called `-parity`, so CI
// went red on a suite that passes perfectly well anywhere both repos exist.
//
// A safeguard that depends on somebody REMEMBERING A SUFFIX is not a safeguard, it is a trap with a
// delay on it. So the rule is now structural: a suite that reaches across repos is detected by the
// fact that it reaches across repos. It cannot be forgotten, because there is nothing to remember.
//
// (domain.test.mjs also touches the app, but guards itself with a try/catch and uses a different
// path shape, so it correctly keeps running: it is the guard that keeps the rival's domain out of
// shipping code, and half an answer to that question is still worth having.
//
// That guard caught THIS COMMENT. The first draft spelled the rival domain out while explaining a
// test whose entire job is to forbid spelling it out. CLAUDE.md says never write it in code, copy,
// config, or a doc, with no exceptions, and the exception you quietly grant yourself while writing
// about the rule is exactly how it gets back in. The guard cannot tell a comment from a hardcoded
// URL and it should not have to. Do not relax it. Fix the comment.)
const parityAppEngine = path.resolve(repoRoot, '../tradebook-app/lib/tax.ts');
const parityPossible = existsSync(parityAppEngine);

function needsSiblingRepo(file) {
  try {
    return /\.\.\/tradebook-app/.test(readFileSync(file, 'utf8'));
  } catch {
    return false;
  }
}

const results = [];
const started = Date.now();

for (const suite of suites) {
  if (suite.kind === 'logic' && !tsInstalled) {
    results.push({ name: suite.name, status: 'skip', note: 'needs `typescript` (runs in deploy CI)', passed: 0, failed: 0 });
    process.stdout.write(`  SKIP  ${suite.name.padEnd(16)} needs \`typescript\`, runs in deploy CI\n`);
    continue;
  }

  if (!parityPossible && needsSiblingRepo(suite.file)) {
    results.push({ name: suite.name, status: 'skip', note: 'needs the sibling mobile repo (../tradebook-app)', passed: 0, failed: 0 });
    process.stdout.write(`  SKIP  ${suite.name.padEnd(16)} needs the sibling mobile repo, runs where both repos exist\n`);
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

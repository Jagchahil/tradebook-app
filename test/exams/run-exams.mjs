// Lekhio exam runner.
//
// Transpiles the real product engine (lib/taxengine.ts) and answers every
// exam-style question with it, then scores against the published 2026/27
// treatment. This is how we verify, not just claim, the expertise. Run with:
//   node test/exams/run-exams.mjs
//
// Requires esbuild available (the repo dev dependency, or /tmp for the sandbox).

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const libPath = path.resolve(here, '../../lib/taxengine.ts');
const out = path.join(process.env.TMPDIR || '/tmp', 'taxengine.exam.mjs');

// Find an esbuild binary: local node_modules first, then the sandbox copy.
const candidates = [
  path.resolve(here, '../../node_modules/.bin/esbuild'),
  '/tmp/node_modules/.bin/esbuild',
];
const esbuild = candidates.find((p) => existsSync(p)) || 'esbuild';
execSync(`"${esbuild}" "${libPath}" --format=esm --outfile="${out}"`, { stdio: 'inherit' });

const E = await import(`file://${out}?t=${Date.now()}`);
const bank = JSON.parse(readFileSync(path.resolve(here, 'exam-bank.json'), 'utf8'));

function answer(q) {
  if (q.fn === 'FACT') return E.FACTS[q.key];
  const fn = E[q.fn];
  if (typeof fn !== 'function') throw new Error(`No engine function: ${q.fn}`);
  const r = fn(...(q.args || []));
  return q.field ? r[q.field] : r;
}

function correct(q) {
  let got;
  try {
    got = answer(q);
  } catch (e) {
    return { ok: false, got: `ERROR ${e.message}` };
  }
  if (typeof q.expected === 'number' && typeof got === 'number') {
    return { ok: Math.abs(got - q.expected) <= (q.tol ?? 0), got };
  }
  return { ok: got === q.expected, got };
}

const byQual = new Map();
const byTopic = new Map();
const failures = [];
let pass = 0;

for (const q of bank.questions) {
  const { ok, got } = correct(q);
  if (ok) pass += 1;
  else failures.push({ ...q, got });
  for (const [map, key] of [[byQual, q.qualification], [byTopic, q.topic]]) {
    const s = map.get(key) || { pass: 0, total: 0 };
    s.total += 1;
    if (ok) s.pass += 1;
    map.set(key, s);
  }
}

const total = bank.questions.length;
const pct = ((pass / total) * 100).toFixed(1);

console.log(`\n=== Lekhio Professional Exam Suite — ${bank.meta.taxYear} ===\n`);
console.log(`Engine under test: lib/taxengine.ts`);
console.log(`Questions: ${total}   Passed: ${pass}   Failed: ${total - pass}   Score: ${pct}%\n`);

console.log('By qualification:');
for (const [k, s] of [...byQual.entries()].sort()) {
  console.log(`  ${(s.pass === s.total ? 'PASS' : 'FAIL')}  ${String(s.pass + '/' + s.total).padEnd(6)} ${k}`);
}

console.log('\nBy topic:');
for (const [k, s] of [...byTopic.entries()].sort()) {
  console.log(`  ${(s.pass === s.total ? 'PASS' : 'FAIL')}  ${String(s.pass + '/' + s.total).padEnd(6)} ${k}`);
}

if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  ${f.id} [${f.qualification} / ${f.topic}]`);
    console.log(`     ${f.prompt}`);
    console.log(`     expected ${JSON.stringify(f.expected)}, got ${JSON.stringify(f.got)}`);
  }
  process.exitCode = 1;
} else {
  console.log('\nAll questions answered correctly.');
}

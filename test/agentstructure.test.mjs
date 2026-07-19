// Tests for the structure-aware wrapper in lib/agent.ts (computeSignalsForStructure + moneyMoveSignals).
// Sole traders and partnerships get the existing engine unchanged; a limited company gets the money
// moves and NOT the sole-trader signals that would misread its profit as personal income.
//   node test/agentstructure.test.mjs

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'agentstruct-'));
const fix = (s) => s.replace(/from '(\.\/[a-zA-Z0-9]+)'/g, "from '$1.ts'");
for (const f of ['taxengine', 'nistudentloan', 'propertyengine', 'ltdengine', 'personalincome', 'partnership', 'position', 'rakhamoves', 'waintents', 'agent']) {
  writeFileSync(path.join(stage, f + '.ts'), fix(readFileSync(path.join(lib, f + '.ts'), 'utf8')));
}
const A = await import(pathToFileURL(path.join(stage, 'agent.ts')).href);
const { computeSignals, computeSignalsForStructure } = A;

let pass = 0, fail = 0;
function ok(desc, cond) {
  if (cond) { pass++; process.stdout.write(`  PASS  ${desc}\n`); }
  else { fail++; process.stdout.write(`  FAIL  ${desc}\n`); }
}

// 12 contiguous months ending at March 2026 (inside the 2025-26 tax year), each £10,000 in / £500 out,
// so the year projects to a high profit and canProject is true.
const today = new Date('2026-03-01T00:00:00Z');
function months() {
  const out = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(2026, 2 - i, 1));
    out.push({ month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, income: 10000, expenses: 500, cis: 0 });
  }
  return out;
}
const baseInput = {
  today, months: months(), week: null, property: null, invoices: null,
  categories: ['tools', 'fuel'], unconfirmedCount: 0, equipmentSpendYtd: 0,
  studentLoanPlan: null, studentLoanPostgrad: false, employmentIncome: 0, goals: [],
};
const keys = (sigs) => new Set(sigs.map((s) => s.signalKey));

// 1. SOLE TRADER: the wrapper returns EXACTLY the existing engine (no regression).
{
  const st = computeSignalsForStructure({ ...baseInput, businessType: 'sole_trader' });
  const raw = computeSignals(baseInput);
  ok('sole trader: wrapper output matches computeSignals exactly', JSON.stringify(st) === JSON.stringify(raw));
  ok('sole trader still gets the sole-trader personal signals (e.g. higher-rate or PoA)', keys(st).has('higher_rate_approach') || keys(st).has('poa_cliff') || keys(st).has('pa_taper'));
}

// 2. LIMITED COMPANY: gets the money moves, and NOT the profit-as-personal-income signals.
{
  const ltd = computeSignalsForStructure({
    ...baseInput,
    businessType: 'limited_company',
    employmentIncome: 12570,   // director salary the company pays
    dividendIncome: 80000,     // dividends drawn
  });
  const k = keys(ltd);
  ok('ltd: gets the grounding both-sides summary', k.has('position_summary'));
  ok('ltd: gets a pension money-move on salary+dividends', [...k].some((x) => x.startsWith('pension_relief')));
  ok('ltd: does NOT get higher_rate_approach (that reads profit as personal income)', !k.has('higher_rate_approach'));
  ok('ltd: does NOT get pa_taper', !k.has('pa_taper'));
  ok('ltd: does NOT get poa_cliff (sole-trader PoA maths)', !k.has('poa_cliff'));
}

// 3. PARTNERSHIP: unchanged from the sole-trader engine (a partner is taxed on their share like one).
{
  const pp = computeSignalsForStructure({ ...baseInput, businessType: 'partnership' });
  const raw = computeSignals({ ...baseInput, businessType: 'partnership' });
  ok('partnership: wrapper returns the existing engine (unchanged for now)', JSON.stringify(pp) === JSON.stringify(raw));
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

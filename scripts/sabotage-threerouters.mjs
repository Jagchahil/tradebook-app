// Sabotage harness for laneparity section 8, the three router rule. Same discipline as
// scripts/sabotage-cisyear.mjs: every edit is proved to apply and proved unique before the suite
// runs, and the baseline is re-checked at the end.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const P = (rel) => path.join(root, rel);
const WA = 'app/api/whatsapp/route.ts';
const TH = 'app/api/thread/route.ts';
const ASK = 'app/api/ask/route.ts';
const TEST = 'test/laneparity.test.mjs';

function run() {
  let out = '';
  try {
    out = execFileSync('node', [P(TEST)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) { out = String(e.stdout ?? ''); }
  const m = out.match(/(\d+) passed, (\d+) failed\./);
  return m ? { passed: Number(m[1]), failed: Number(m[2]) } : { passed: -1, failed: -1 };
}

const base = run();
console.log(`baseline: ${base.passed} passed, ${base.failed} failed`);
if (base.failed !== 0) { console.log('BASELINE NOT GREEN. STOP.'); process.exit(1); }

const CASES = [
  // Each surface loses each lane, one at a time. This is the actual defect of 12 August, replayed
  // three ways: a lane that exists, is unit tested, and is wired into fewer routers than there are.
  [WA, '} else if (isDataRightsRequest(text)) {', '} else if (false) {', 'whatsapp loses the data rights lane', true],
  [TH, 'if (isDataRightsRequest(q)) return DATA_RIGHTS_ANSWER;', 'if (false) return DATA_RIGHTS_ANSWER;', 'thread loses the data rights lane', true],
  [ASK, 'if (!truth && isDataRightsRequest(question)) truth = DATA_RIGHTS_ANSWER;', 'if (false) truth = DATA_RIGHTS_ANSWER;', 'ask loses the data rights lane', true],
  [WA, '} else if (isVehicleQuestion(text)) {', '} else if (false) {', 'whatsapp loses the vehicle lane', true],
  [TH, 'if (isVehicleQuestion(q)) {', 'if (false) {', 'thread loses the vehicle lane', true],
  [ASK, 'if (!truth && isVehicleQuestion(question)) {', 'if (false) {', 'ask loses the vehicle lane', true],
  // The rights answer wired in BELOW the paid call: right words, and he is charged to hear them.
  [ASK, '  if (!truth && isDataRightsRequest(question)) truth = DATA_RIGHTS_ANSWER;\n', '', 'ask answers rights only after the model has been paid', true],
  // The paywall gets to answer a man asking how to leave.
  [WA, '    || isDataRightsRequest(text)\n', '', 'the paywall may answer the erasure question', true],
  // The suite must not be able to read two routers and call it three.
  [ASK, 'export async function POST(', 'export async function POSTX(', 'the ask router stops looking like a router', true],
  // No operation controls.
  // ⚠️ NOT "rewrite the dispatch line a different way". Section 8 anchors on the whole dispatch
  // statement on purpose, so reformatting it DOES go red, and that is the behaviour asked for: a
  // man rewriting the branch that answers "erase me" should have to look at this suite and confirm
  // the lane still dispatches. A control has to be a change the guard genuinely does not care
  // about, and the first draft of this list picked one it very much does.
  [TH, '  // 2. Totals and what he owes: computed from his own confirmed rows, no AI, instant.\n', '', 'CONTROL: a comment removed above the lanes', false],
  [WA, 'async function handleVehicleQuestion(from: string)', 'async function handleVehicleQuestion(from : string)', 'CONTROL: whitespace in a signature', false],
];

let good = 0; let bad = 0;
for (const [rel, from, to, label, expectRed] of CASES) {
  const original = readFileSync(P(rel), 'utf8');
  const i = original.indexOf(from);
  if (i < 0) { console.log(`  NEEDLE MISSING  ${label}`); bad++; continue; }
  if (original.indexOf(from, i + 1) >= 0) { console.log(`  NEEDLE AMBIGUOUS  ${label}`); bad++; continue; }
  const broken = original.slice(0, i) + to + original.slice(i + from.length);
  if (broken === original) { console.log(`  EDIT WAS A NO OP  ${label}`); bad++; continue; }
  writeFileSync(P(rel), broken);
  const r = run();
  writeFileSync(P(rel), original);
  if (readFileSync(P(rel), 'utf8') !== original) { console.log('RESTORE FAILED. STOP.'); process.exit(1); }
  const correct = (r.failed > 0) === expectRed;
  if (correct) good++; else bad++;
  console.log(`  ${correct ? 'ok  ' : 'FAIL'} ${label}  (${r.passed}p/${r.failed}f)`);
}

const after = run();
console.log(`\n${good} correct, ${bad} wrong. restored baseline: ${after.passed} passed, ${after.failed} failed`);
if (after.failed !== 0 || after.passed !== base.passed) { console.log('BASELINE DRIFTED. STOP.'); process.exit(1); }

// Tests that EVERY lane which can answer a customer carries the SAME guardrails.
//
// THE DEFECT THIS SUITE GUARDS AGAINST.
// Lekhio answers questions on two lanes: WhatsApp (lib/claude.ts answerMoneyQuestion)
// and the in-app assistant (lib/claude.ts accountantSystem, via /api/ask). Both can
// put words on a screen that a customer will screenshot.
//
// Until 6 August 2026 they were not equal, and the gap was invisible:
//   . answerMoneyQuestion, the WhatsApp lane, was told to answer "directly and
//     confidently" and carried NONE of the four rules. accountantSystem carried
//     all four. So the same question, asked on WhatsApp instead of in the app,
//     could be answered with evasion help, a claim that HMRC approves Lekhio, a
//     claim that Lekhio files the return, an invented saving, or share tips.
//   . /api/ask had no matchProductTruth gate at all, though the WhatsApp router
//     has had one since 6 August 2026, so "are you HMRC approved" typed into the
//     app went to the model rather than to the fixed, true words.
//
// The deterministic matcher in lib/waintents.ts is the first lock, and it is only
// ever a list of phrasings somebody thought of. These prompt rules are the second
// lock, and they are what catches the phrasing nobody thought of. This suite
// exists because the failure is silent: nothing errors, nothing looks wrong, and
// the damage is one screenshot of Lekhio claiming HMRC approval.
//
//   node test/guardrailparity.test.mjs

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const libDir = path.join(repoRoot, 'lib');
const claudeSrc = readFileSync(path.join(libDir, 'claude.ts'), 'utf8');
const askSrc = readFileSync(path.join(repoRoot, 'app', 'api', 'ask', 'route.ts'), 'utf8');

const stage = mkdtempSync(path.join(tmpdir(), 'guardrail-'));
const fixImports = (s) =>
  s.replace(/from '(\.\/[a-zA-Z0-9_.-]+)'/g, (m, p) => (p.endsWith('.ts') ? m : `from '${p}.ts'`));
for (const f of readdirSync(libDir)) {
  if (f.endsWith('.ts')) writeFileSync(path.join(stage, f), fixImports(readFileSync(path.join(libDir, f), 'utf8')));
}
const W = await import(pathToFileURL(path.join(stage, 'waintents.ts')).href);

let pass = 0, fail = 0;
function ok(desc, cond) {
  if (cond) { pass++; process.stdout.write(`  PASS  ${desc}\n`); }
  else { fail++; process.stdout.write(`  FAIL  ${desc}\n`); }
}

// Slice one function's source out of lib/claude.ts so a rule found in the OTHER
// lane cannot make this suite pass by accident.
function fnSource(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  const b = src.indexOf(endMarker, a + 1);
  return a === -1 ? '' : src.slice(a, b === -1 ? src.length : b);
}

const whatsappLane = fnSource(claudeSrc, 'export async function answerMoneyQuestion', '\nexport ');
const appLane = fnSource(claudeSrc, 'function accountantSystem', '\n// Answer a free-text accountant question');

// The four rules, each expressed as what the lane must forbid. Matched loosely on
// intent words rather than exact prose, so the wording can be improved without
// breaking the pin, but the rule cannot quietly disappear.
const RULES = [
  { name: 'never help with evasion', re: /never\s+(suggest|help)[^.]*evasion|never\s+suggest,?\s+help\s+with,?\s+or\s+soften\s+evasion/i },
  { name: 'never claim HMRC approval or that Lekhio files', re: /never\s+(say or )?impl(y|ies)[^.]*hmrc[^.]*(endors|approv)|hmrc\s+approves\s+no\s+software/i },
  { name: 'never state a tax saved number', re: /never\s+promise\s+or\s+state\s+a\s+number|cannot\s+promise[^.]*number/i },
  { name: 'no investment or pension product advice', re: /do\s+not\s+give[^.]*investment[^.]*advice/i },
];

console.log('\nWhatsApp lane (answerMoneyQuestion) must carry every rule the app lane carries.\n');
ok('the WhatsApp lane source was found (the pin is watching real code)', whatsappLane.length > 400);
ok('the app lane source was found (the pin is watching real code)', appLane.length > 400);
for (const r of RULES) {
  ok(`WhatsApp lane: ${r.name}`, r.re.test(whatsappLane));
  ok(`app lane: ${r.name}`, r.re.test(appLane));
}

// The prepare-then-approve order must be stated on both lanes, because it is the
// sentence that keeps the customer legally responsible for his own return.
for (const [label, src] of [['WhatsApp lane', whatsappLane], ['app lane', appLane]]) {
  ok(`${label}: states that Lekhio prepares and the customer approves and stays responsible`,
    /prepares?[^.]*(approve)[^.]*responsib/i.test(src));
}

console.log('\n/api/ask must gate product truth deterministically, before cache, cap and model.\n');
{
  const iMatch = askSrc.indexOf('matchProductTruth(');
  const iAnswer = askSrc.indexOf('productTruthAnswer(');
  const iCache = askSrc.indexOf('lookupQaCache(');
  const iModel = askSrc.indexOf('answerAccountantQuestion(question');
  const iCap = askSrc.indexOf("bumpAiUsage('ask'");
  ok('/api/ask calls matchProductTruth', iMatch !== -1);
  ok('/api/ask answers with the fixed true words (productTruthAnswer)', iAnswer !== -1);
  ok('the product truth gate runs BEFORE the shared cache is consulted', iMatch !== -1 && iCache !== -1 && iMatch < iCache);
  ok('the product truth gate runs BEFORE the paid daily cap is spent', iMatch !== -1 && iCap !== -1 && iMatch < iCap);
  ok('the product truth gate runs BEFORE the model is called', iMatch !== -1 && iModel !== -1 && iMatch < iModel);
  ok('the wording switches on hmrcFilingLive(), never a hardcoded live claim', /productTruthAnswer\([^)]*filingLive:\s*hmrcFilingLive\(\)/.test(askSrc));
}

console.log('\nThe fixed words themselves stay true on every kind.\n');
for (const kind of ['approved', 'files', 'savings', 'concealment', 'investment']) {
  for (const filingLive of [false, true]) {
    const a = W.productTruthAnswer(kind, { filingLive });
    ok(`${kind} (filingLive=${filingLive}): promises no figure`, !/\d/.test(a));
    ok(`${kind} (filingLive=${filingLive}): never claims HMRC approval of Lekhio`, !/hmrc\s+approved/i.test(a));
    ok(`${kind} (filingLive=${filingLive}): no em dash or en dash`, !/[‒-―−]/.test(a));
  }
}

// Filing must never be claimed as live while the feature flag is off.
{
  const a = W.productTruthAnswer('files', { filingLive: false });
  ok('files (filingLive=false): says sending to HMRC is not switched on yet', /not switched on yet/i.test(a));
  ok('files (filingLive=false): still opens with No', /^no\b/i.test(a.trim()));
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

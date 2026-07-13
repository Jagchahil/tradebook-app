// The app now reads its tax constants from /facts.json instead of the ones compiled into its binary.
// This test stands in the gap between the two repos and asks one question:
//
//   IF WE PUBLISH WHAT THE ENGINE HOLDS TODAY, DOES THE APP ACCEPT IT, AND DOES EVERY NUMBER LAND IN
//   THE RIGHT FIELD?
//
// WHY THIS EXISTS.
//
// The app used to hold a hand-kept copy of the tax maths, so a correction needed an App Store
// release. Khoji could find at 05:15 that GOV.UK and our engine disagreed, we could fix and push by
// 06:00, the website and WhatsApp would be right within a minute, and the app would go on telling a
// plasterer 45p a mile until Apple got round to it and he chose to update. Some never update. The
// parity test would even pass, because both files were fixed. One of them just was not on his phone.
//
// Now the app fetches. Which creates exactly one new way to be catastrophically wrong: the engine
// renames or drops a key, the app's validate() refuses the payload, and EVERY PHONE IN BRITAIN
// silently falls back to figures baked into a binary six months ago. Silently. That is this
// codebase's signature failure and we are not doing it again.
//
// THE TRAP THIS IS REALLY ABOUT, and it is not a naming convention.
//
//   the app calls it   `higherThreshold`   -> the income at which 40% tax starts
//   the engine has     `class4UpperLimit`  -> the profit at which Class 4 NI drops to 2%
//   BOTH ARE £50,270 TODAY. THEY ARE NOT THE SAME NUMBER.
//
// Wire the app to class4UpperLimit because the value matched, and the first Budget that decouples
// them feeds a National Insurance threshold into an income tax calculation, on every phone, silently,
// while every alarm we own stays green, because both files still "agree". So the engine publishes
// `higherRateThreshold`, derived from the income tax bands, and the app maps NAME to NAME, never
// value to value.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const weblib = path.resolve(here, '../lib');
const applib = path.resolve(here, '../../tradebook-app/lib');

// Stage both repos, as ltd-parity does. TypeScript allows extensionless imports and Node does not,
// and the app's facts.ts pulls in AsyncStorage, which does not exist outside a phone. Neither is
// needed to test the mapping.
const stage = mkdtempSync(path.join(tmpdir(), 'appfacts-'));
writeFileSync(path.join(stage, 'taxengine.ts'), readFileSync(path.join(weblib, 'taxengine.ts'), 'utf8'));
writeFileSync(
  path.join(stage, 'ltdengine.ts'),
  readFileSync(path.join(weblib, 'ltdengine.ts'), 'utf8').replace("from './taxengine'", "from './taxengine.ts'"),
);
writeFileSync(path.join(stage, 'tax.ts'), readFileSync(path.join(applib, 'tax.ts'), 'utf8'));
writeFileSync(
  path.join(stage, 'facts.ts'),
  readFileSync(path.join(applib, 'facts.ts'), 'utf8')
    .replace(/^import AsyncStorage.*$/m, 'const AsyncStorage = { getItem: async () => null, setItem: async () => {} };')
    .replace("from './tax'", "from './tax.ts'"),
);

const { FACTS } = await import(pathToFileURL(path.join(stage, 'taxengine.ts')).href);
const { LTD } = await import(pathToFileURL(path.join(stage, 'ltdengine.ts')).href);
const { validate } = await import(pathToFileURL(path.join(stage, 'facts.ts')).href);

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

// Exactly what app/facts.json/route.ts serves, built from the same imports it uses.
const facts = {
  ...FACTS,
  ctSmallRate: LTD.ctSmallRate,
  ctMainRate: LTD.ctMainRate,
  ctSmallLimit: LTD.ctSmallLimit,
  ctUpperLimit: LTD.ctUpperLimit,
  ctMarginalFraction: LTD.ctMarginalFraction,
  dividendAllowance: LTD.dividendAllowance,
  dividendBasic: LTD.dividendBasic,
  dividendHigher: LTD.dividendHigher,
  dividendAdditional: LTD.dividendAdditional,
  employerNIRate: LTD.employerNIRate,
  employerSecondaryThreshold: LTD.employerSecondaryThreshold,
  higherRateThreshold: FACTS.personalAllowance + FACTS.basicRateBand,
};
const payload = { taxYear: FACTS.taxYear, facts };

// --- 1. THE APP ACCEPTS WHAT WE PUBLISH ------------------------------------
//
// If this ever fails, every phone silently falls back to a binary from six months ago.
const applied = validate(payload);
ok('the app ACCEPTS the payload the engine actually publishes today', applied !== null);
ok('...and takes all 22 constants, not some of them',
  applied && Object.keys(applied).length === 22);

// --- 2. EVERY NUMBER LANDS IN THE RIGHT FIELD ------------------------------
ok('personalAllowance lands as personalAllowance', applied?.personalAllowance === FACTS.personalAllowance);
ok('class4MainRate lands as class4Main (6%)', applied?.class4Main === FACTS.class4MainRate);
ok('class4UpperRate lands as class4Top (2%), and NOT as the main rate', applied?.class4Top === FACTS.class4UpperRate);
ok('additionalRate lands as incomeAdditional (45%)', applied?.incomeAdditional === FACTS.additionalRate);
ok('corporation tax rates land intact', applied?.ctSmallRate === LTD.ctSmallRate && applied?.ctMainRate === LTD.ctMainRate);

// --- 3. THE TRAP. THE ONE THAT MATTERS. ------------------------------------
ok('higherThreshold takes the INCOME TAX threshold, not the Class 4 NI limit',
  applied?.higherThreshold === FACTS.personalAllowance + FACTS.basicRateBand);
ok('...and today those two are the SAME number, which is precisely why the mapping must be by name',
  FACTS.personalAllowance + FACTS.basicRateBand === FACTS.class4UpperLimit);
ok('...so when a Budget decouples them, the app follows income tax and not National Insurance', (() => {
  const moved = { ...facts, basicRateBand: 40000, higherRateThreshold: FACTS.personalAllowance + 40000 };
  const r = validate({ taxYear: '2027/28', facts: moved });
  return r?.higherThreshold === 52570 && r.higherThreshold !== moved.class4UpperLimit;
})());

// --- 4. IT REFUSES WHAT IT DOES NOT FULLY UNDERSTAND -----------------------
//
// A HALF-APPLIED UPDATE IS THE WORST STATE THERE IS: an income tax band from this year and a
// National Insurance threshold from last, producing a number that is wrong in a way nobody can trace
// back to anything. All of it, or none of it.
ok('one missing key -> the WHOLE payload is refused, and we keep the bundled figures', (() => {
  const { class4UpperLimit, ...missing } = facts;
  return validate({ taxYear: '2026/27', facts: missing }) === null;
})());
ok('a key that is not a number -> refused', (() => {
  const r = validate({ taxYear: '2026/27', facts: { ...facts, personalAllowance: '12570' } });
  return r === null;
})());
ok('no taxYear -> refused. An unlabelled set of tax figures is not a set of tax figures',
  validate({ facts }) === null);
ok('empty, null and rubbish -> refused, never crashed',
  validate(null) === null && validate({}) === null && validate({ taxYear: 'x', facts: null }) === null);

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

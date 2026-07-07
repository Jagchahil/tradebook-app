// Tests for the trial length logic in lib/stripe.ts: 14 days by default, 30 for
// a valid field rep code (from REP_TRIAL_CODES). Pure, no network. Run with:
//   node test/trial.test.mjs
//
// stripe.ts reads REP_TRIAL_CODES from the environment, so we set it before import.

process.env.REP_TRIAL_CODES = 'ROADSHOW24, dave-rep ,MANCHESTER';

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const S = await import(`${pathToFileURL(path.resolve(here, '../lib/stripe.ts')).href}`);

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

console.log('\n=== trial length: default and rep override ===\n');
ok('default self serve trial is 14 days', S.TRIAL_DAYS === 14);
ok('rep trial is 30 days', S.REP_TRIAL_DAYS === 30);

ok('no code gives 14', S.resolveTrialDays() === 14);
ok('null gives 14', S.resolveTrialDays(null) === 14);
ok('empty string gives 14', S.resolveTrialDays('') === 14);
ok('an unknown code gives 14, never 30', S.resolveTrialDays('random-guess') === 14);

ok('a valid rep code gives 30', S.resolveTrialDays('ROADSHOW24') === 30);
ok('rep code is case insensitive', S.resolveTrialDays('roadshow24') === 30);
ok('rep code is trimmed in the env list', S.resolveTrialDays('dave-rep') === 30);
ok('a second listed code works', S.resolveTrialDays('MANCHESTER') === 30);

ok('isRepTrialCode true for a listed code', S.isRepTrialCode('ROADSHOW24') === true);
ok('isRepTrialCode false for junk', S.isRepTrialCode('nope') === false);
ok('isRepTrialCode false for empty', S.isRepTrialCode('') === false);

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

// Tests for the trial length logic in lib/stripe.ts: 7 days by default, 30 for
// a valid field rep code (from REP_TRIAL_CODES). Pure, no network. Run with:
//   node test/trial.test.mjs
//
// 🔴 AND THE CROSS FILE GUARD AT THE BOTTOM, WHICH IS THE LOAD BEARING PART OF THIS FILE.
//
// The trial length is written in two places: lib/stripe.ts (the card trial Stripe runs) and
// lib/entitlement.ts (the no card grant we run ourselves). It is duplicated because stripe.ts
// deliberately imports nothing local, which is the only reason this suite can load it into node.
//
// Nothing in the language holds those two numbers together, so this suite does. If they ever
// disagree the failure in production is a man locked out of his books days before the date we
// showed him, and nobody would connect the two constants until he had already gone.
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
ok('default self serve trial is 7 days', S.TRIAL_DAYS === 7);
ok('rep trial is 30 days', S.REP_TRIAL_DAYS === 30);

ok('no code gives the standard trial', S.resolveTrialDays() === S.TRIAL_DAYS);
ok('null gives the standard trial', S.resolveTrialDays(null) === S.TRIAL_DAYS);
ok('empty string gives the standard trial', S.resolveTrialDays('') === S.TRIAL_DAYS);
ok('an unknown code gives the standard trial, never 30', S.resolveTrialDays('random-guess') === S.TRIAL_DAYS);

ok('a valid rep code gives 30', S.resolveTrialDays('ROADSHOW24') === 30);
ok('rep code is case insensitive', S.resolveTrialDays('roadshow24') === 30);
ok('rep code is trimmed in the env list', S.resolveTrialDays('dave-rep') === 30);
ok('a second listed code works', S.resolveTrialDays('MANCHESTER') === 30);

ok('isRepTrialCode true for a listed code', S.isRepTrialCode('ROADSHOW24') === true);
ok('isRepTrialCode false for junk', S.isRepTrialCode('nope') === false);
ok('isRepTrialCode false for empty', S.isRepTrialCode('') === false);

// ---------------------------------------------------------------------------------------------
// 🔴 THE TWO COPIES OF ONE NUMBER MUST AGREE. See the header.
// ---------------------------------------------------------------------------------------------
const E = await import(`${pathToFileURL(path.resolve(here, '../lib/entitlement.ts')).href}`);

console.log('\n=== the card trial and the no card grant are the same length ===\n');
ok(`lib/stripe.ts says ${S.TRIAL_DAYS} and lib/entitlement.ts says ${E.TRIAL_DAYS}`,
  S.TRIAL_DAYS === E.TRIAL_DAYS);

// And the granted end date actually lands that many days out, so the constant is not merely
// declared correctly but USED correctly at the single point of grant.
const t0 = new Date('2026-07-29T09:00:00Z');
const grantedDays = Math.round((new Date(E.trialEndsAt(t0)).getTime() - t0.getTime()) / (24 * 3600 * 1000));
ok(`a granted trial really ends in ${S.TRIAL_DAYS} days (got ${grantedDays})`, grantedDays === S.TRIAL_DAYS);

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

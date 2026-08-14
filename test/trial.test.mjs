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

import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { join, relative } from 'node:path';
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

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 NOBODY MAY ADVERTISE A TRIAL LENGTH THIS FILE DOES NOT AGREE WITH.
//
// Added 30 July, after a sweep found the WhatsApp handler offering "first month free" in three
// places while the trial had been SEVEN DAYS since 29 July. Not a rounding error, a different offer:
// a man told he has a month and cut off on day eight has been misled about money by the product
// whose whole pitch is being straight with him about money. It had been live for a day and nothing
// went red, because a sentence is not a type error.
//
// The store listings are the same failure, older: they still say fourteen days, which is why
// [[project_appstore_connect_17jul]] carries a warning rather than a fix. Those are outside the
// repo. Everything INSIDE it is now checked here.
//
// The rule: a customer facing file may name a trial length only by reading TRIAL_DAYS. A literal
// number of free days, or a free month, is a second copy of a commercial promise.
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const roots = ['app', 'lib'];
  const skip = new Set(['node_modules', '.next', 'dist']);
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.') || skip.has(name)) continue;
      const full = join(dir, name);
      const st = lstatSync(full);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name)) files.push(full);
    }
  };
  const root = path.resolve(here, '..');
  for (const r of roots) walk(join(root, r));
  ok('the app and lib trees were actually walked (not vacuous)', files.length > 100);

  // Comments are stripped: several of these files argue at length about the fourteen day mistake and
  // must keep saying "14 days" to make sense. What matters is what a customer is shown.
  const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  // "first month free", "a month free", "one month free" and friends. No trial is a month.
  const monthly = files.filter((f) => /(first|one|a)\s+month\s+free|free\s+(for\s+)?(a|one|the\s+first)\s+month/i
    .test(codeOnly(readFileSync(f, 'utf8'))))
    .map((f) => relative(root, f));
  ok(`🔴 nothing offers a free MONTH${monthly.length ? `\n     ${monthly.join('\n     ')}` : ''}`,
    monthly.length === 0);

  // A literal "<n> days free" / "<n> day free trial" that is not the real number.
  const wrongDays = [];
  for (const f of files) {
    const src = codeOnly(readFileSync(f, 'utf8'));
    for (const m of src.matchAll(/(\d+)\s*days?\s+free|(\d+)\s*day\s+(free\s+)?trial|free\s+for\s+(\d+)\s*days?/gi)) {
      const n = Number(m[1] || m[2] || m[4]);
      // 30 is the field sales rep trial, which is real and lives in lib/stripe.ts as REP_TRIAL_DAYS.
      if (n !== S.TRIAL_DAYS && n !== S.REP_TRIAL_DAYS) {
        wrongDays.push(`${relative(root, f)}: "${m[0].trim()}"`);
      }
    }
  }
  ok(`🔴 no file advertises a trial length other than ${S.TRIAL_DAYS} or ${S.REP_TRIAL_DAYS}${wrongDays.length ? `\n     ${wrongDays.join('\n     ')}` : ''}`,
    wrongDays.length === 0);

  // ⚠️ AND THE SIGNUP TIME PROMISE, WHICH DRIFTED THE SAME WAY ON THE SAME PAGES.
  // "two minutes to get set up" was true when setup was six questions. It is ten to fifteen now, and
  // lib/onboarding.ts owns that sentence. This catches a page telling a stranger it is quicker.
  const setupTime = [];
  for (const f of files) {
    const src = codeOnly(readFileSync(f, 'utf8'));
    for (const m of src.matchAll(/(set\s*up|sign\s*up|get\s+set\s+up|setup)[^.!?]{0,60}?(two minutes|a minute|one minute|2 minutes)/gi)) {
      setupTime.push(`${relative(root, f)}: "${m[0].trim().slice(0, 70)}"`);
    }
  }
  ok(`🔴 nothing promises a one or two minute SETUP${setupTime.length ? `\n     ${setupTime.join('\n     ')}` : ''}`,
    setupTime.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

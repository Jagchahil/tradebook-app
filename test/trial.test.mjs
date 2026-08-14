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

import { readFileSync, readdirSync, lstatSync, existsSync } from 'node:fs';
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
// 🔴 AND "OUTSIDE THE REPO" WAS THE HOLE. Fixed 14 August 2026.
//
// This comment used to end: "The store listings still say fourteen days. Those are outside the
// repo. Everything INSIDE it is now checked here." Both halves were true and the conclusion was
// wrong. The MOBILE APP is a different repo, so the sweep stopped at the boundary, and on the far
// side of that boundary the app a customer actually installs was promising FOURTEEN DAYS in four
// places while this file granted seven. One of those four was the referral message a user SENDS TO
// ANOTHER PERSON: "Use my link and your first 14 days are free."
//
// So a man was told a fortnight, cut off on day eight, and told a friend the same thing in a
// message we wrote for him. The rule was right, it was simply pointed at one repo.
//
// Three suites in this folder already read ../../tradebook-app. It was reachable the whole time.
//
// The rule: a customer facing file may name a trial length only by reading TRIAL_DAYS. A literal
// number of free days, or a free month, is a second copy of a commercial promise.
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const skip = new Set(['node_modules', '.next', 'dist', 'ios', 'android']);
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
  for (const r of ['app', 'lib']) walk(join(root, r));
  const webCount = files.length;
  ok('the app and lib trees were actually walked (not vacuous)', webCount > 100);

  // 🔴 AND ACROSS THE BOUNDARY, INTO THE APP A CUSTOMER ACTUALLY INSTALLS.
  const mobileRoot = path.resolve(here, '../../tradebook-app');
  const mobileDirs = ['app', 'lib', 'components'].map((d) => join(mobileRoot, d)).filter(existsSync);
  for (const d of mobileDirs) walk(d);
  const mobileCount = files.length - webCount;

  // ⚠️ A CHECK THAT COULD NOT RUN IS NOT A CHECK THAT PASSED, and that is exactly how a
  // cross repo sweep dies: on a machine without the sibling checkout it finds nothing, reports
  // nothing, and goes green for ever. So the absence is stated out loud rather than swallowed, and
  // finding the repo but reading no files from it is a FAILURE, not a pass.
  if (mobileDirs.length === 0) {
    console.log('  SKIP  the mobile app is not checked out beside this repo, so it was NOT swept');
  } else {
    ok(`the mobile app was actually swept, ${mobileCount} file(s), not vacuously`, mobileCount > 20);
  }

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
  //
  // 🔴 THE PATTERN IS DEFINED ONCE AND THE CONTROL BELOW USES THE SAME OBJECT. It was
  // written out twice, and a control that tests a SECOND COPY of a regex proves nothing about the
  // one doing the work. Pin the shared function, never the shared expression.
  //
  // ⚠️ AND IT MISSED TWO PHRASINGS UNTIL 14 AUGUST 2026, one of which was live.
  // "your first 14 days are free" has "are" between the noun and "free", so the original
  // `(\d+)\s*days?\s+free` never matched it. That exact sentence was in the mobile app's referral
  // message, the one a user SENDS TO ANOTHER PERSON. The sweep had been reporting clean over it.
  // Found by the known bad string control below, on the first run of that control.
  const TRIAL_CLAIM = () => new RegExp(
    "(\\d+)\\s*days?[\u2019']?(\\s+are)?\\s+free"
    + "|(\\d+)\\s*days?\\s+(free\\s+)?trial"
    + "|free\\s+for\\s+(\\d+)\\s*days?",
    'gi',
  );
  const claimNumber = (m) => Number(m[1] || m[3] || m[5]);

  const wrongDays = [];
  for (const f of files) {
    const src = codeOnly(readFileSync(f, 'utf8'));
    for (const m of src.matchAll(TRIAL_CLAIM())) {
      const n = claimNumber(m);
      // 30 is the field sales rep trial, which is real and lives in lib/stripe.ts as REP_TRIAL_DAYS.
      if (n !== S.TRIAL_DAYS && n !== S.REP_TRIAL_DAYS) {
        wrongDays.push(`${relative(root, f)}: "${m[0].trim()}"`);
      }
    }
  }
  ok(`🔴 no file advertises a trial length other than ${S.TRIAL_DAYS} or ${S.REP_TRIAL_DAYS}${wrongDays.length ? `\n     ${wrongDays.join('\n     ')}` : ''}`,
    wrongDays.length === 0);

  // ⚠️ AND THE DETECTOR IS SHOWN A KNOWN BAD STRING, because a sweep that finds nothing
  // and a sweep that cannot see are the same output. The scratch sabotage harnesses in this folder
  // copy only THIS repo, so they cannot reach the mobile app to break it. This control can, and it
  // runs every time.
  const BAD = [
    '14 days free',
    'free for 14 days',
    'a 14 day free trial',
    'your first 14 days are free',
  ];
  const missed = BAD.filter((t) => ![...t.matchAll(TRIAL_CLAIM())]
    .map(claimNumber).some((n) => n !== S.TRIAL_DAYS && n !== S.REP_TRIAL_DAYS));
  ok(`🔴 THE DETECTOR CATCHES EVERY KNOWN BAD PHRASING${missed.length ? `\n     missed: ${missed.join(' | ')}` : ''}`,
    missed.length === 0);
  const GOOD = `first ${S.TRIAL_DAYS} days are free, and a ${S.REP_TRIAL_DAYS} day free trial for reps`;
  const falsePositives = [...GOOD.matchAll(TRIAL_CLAIM())]
    .map(claimNumber).filter((n) => n !== S.TRIAL_DAYS && n !== S.REP_TRIAL_DAYS);
  ok('and does not fire on the correct numbers', falsePositives.length === 0);

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

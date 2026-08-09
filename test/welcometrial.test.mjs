// THE WELCOME EMAIL MAY NOT PROMISE A TRIAL THE ACCOUNT WAS REFUSED.
//
//   node test/welcometrial.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE DEFECT, FOUND BY READING /api/signup/verify ON 9 AUGUST 2026.
//
// sendWelcomeEmail said, in the body and again in the preheader:
//
//   "Your account is open and your 7 day free trial has started. No card, and nothing to install."
//
// to EVERY new account, because its only gate was `if (!existingId)`. That tests whether the
// account is new. It says nothing whatever about whether a trial began.
//
// 🔴 AND THE ROUTE ALREADY KNEW, THREE LINES ABOVE THE CALL. grantTrialWithIdentity REFUSES a man
// who has had a trial on this email, this number or this account before, and when it refuses the
// route builds refusalNote() and puts it on his screen:
//
//   "You have had a free trial on this email already. Sign in and pick up where you left off, or
//    add a card to carry on."
//
// So a refused man read that on the screen and, in the same minute, read "your 7 day free trial has
// started" in his inbox. TWO SURFACES, ONE FACT, OPPOSITE ANSWERS. It is the same failure as the
// deadline answer, the owed answer and the VAT reclaim promise, and it is the one this product
// keeps having to end.
//
// ⚠️ AND THERE IS A SECOND WAY IN, WHICH IS THE QUIETER ONE. grantTrialWithIdentity is wrapped in a
// try/catch so that a billing row which will not write can never cost a man his account. On that
// path the route learns NOTHING: trialNote stays null, the screen says nothing, and the email
// promised a trial anyway. Not knowing is not the same as it having worked.
//
// 🔴 SO THIS RATCHET GUARDS FIVE FAILURES.
//
//   1. THE EMAIL GOES BACK TO PROMISING A TRIAL TO EVERYBODY.
//   2. THE ROUTE STOPS TELLING IT, or starts telling it something it did not read.
//   3. THE CATCH BECOMES OPTIMISTIC. A throw must leave the flag false. The moment somebody sets it
//      true in a catch, or initialises it true, the lie is back with no test shape changing.
//   4. THE PARAMETER GOES OPTIONAL. An optional flag defaulting to 'started' restores the bug at
//      the first new caller and tsc says nothing at all.
//   5. THE TWO SURFACES DRIFT. The screen half is refusalNote(). If that is dropped, the email is
//      honest and the man is told nothing, which is the same bug pointing the other way. So this
//      file asserts the SCREEN half too.
//
// ⚠️ THE EMAIL IS COMPOSED FOR REAL AND READ OFF THE WIRE. fetch is stubbed, so nothing leaves the
// process and the assertions are about the bytes Resend would have been handed, not about the shape
// of the source that produces them. And EVERY absence assertion below is paired with a positive one
// on the other arm: "the phrase is missing" passes triumphantly on an email that was never sent, on
// a function that was renamed, and on a body somebody emptied.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const src = (rel) => readFileSync(path.join(repo, rel), 'utf8');

// Same staging every engine suite in here uses: Node's type stripping cannot follow an
// extensionless relative import, so the module and its chain are copied with the specifiers fixed.
const fixImports = (s) => s.replace(/from '(\.\/[a-zA-Z0-9._-]+)'/g, "from '$1.ts'");
const stage = mkdtempSync(path.join(tmpdir(), 'welcometrial-'));
for (const f of ['email', 'entitlement', 'onboarding', 'vat', 'money', 'newsletter', 'taxengine', 'nurture', 'presale', 'housestyle']) {
  writeFileSync(path.join(stage, f + '.ts'), fixImports(src('lib/' + f + '.ts')));
}

// Read at load time by the module chain, and send() returns false before composing anything if
// Resend looks unconfigured. Neither value is real and nothing is ever posted: fetch is stubbed.
process.env.LEAD_TOKEN_SECRET = 'welcome-trial-suite-secret-not-real';
process.env.RESEND_API_KEY = 'welcome-trial-suite-key-not-real';

const email = await import(pathToFileURL(path.join(stage, 'email.ts')).href);
const { sendWelcomeEmail } = email;

const routeSrc = src('app/api/signup/verify/route.ts');
const emailSrc = src('lib/email.ts');
const identitySrc = src('lib/trialidentity.ts');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) {
    pass += 1;
  } else {
    fail += 1;
    process.stdout.write(`\n  FAIL  ${name}`);
  }
};

// ── Compose both arms for real and keep what would have gone on the wire. ────────────────────
const realFetch = globalThis.fetch;
const sent = [];
globalThis.fetch = async (_url, init) => {
  sent.push(JSON.parse(init.body));
  return { ok: true, status: 200 };
};
let started = null;
let plain = null;
try {
  await sendWelcomeEmail('someone@example.com', 'Dave', 'started');
  started = sent.at(-1) ?? null;
  await sendWelcomeEmail('someone@example.com', 'Dave', 'not started');
  plain = sent.at(-1) ?? null;
} finally {
  globalThis.fetch = realFetch;
}

// 🔴 EXISTENCE FIRST. Every absence assertion below is worthless if nothing was composed.
ok('🔴 BOTH ARMS ACTUALLY COMPOSED AN EMAIL, so the assertions below are about real bytes',
  sent.length === 2 && started !== null && plain !== null
  && typeof started.html === 'string' && started.html.length > 500
  && typeof plain.html === 'string' && plain.html.length > 500);

if (started && plain) {
  // ── The arm that is entitled to promise. Proves the absence tests test a real difference. ──
  ok('🔴 THE STARTED ARM STILL PROMISES HIM THE TRIAL, in the body',
    /free trial has started/.test(started.html));
  ok('and in the preheader, which is the line his inbox shows next to the subject',
    /free trial has started/.test(started.html.split('Finish setting up')[0]));
  ok('the length comes from its owner rather than a typed literal, so the store listings cannot drift again',
    /7 day free trial/.test(started.html) && !/14 day/.test(started.html));

  // ── The arm that is not. ────────────────────────────────────────────────────────────────────
  ok('🔴 THE NOT STARTED ARM NEVER SAYS A TRIAL HAS STARTED',
    !/free trial has started/.test(plain.html));
  ok('🔴 AND CLAIMS NO TRIAL AT ALL: not begun, not running, not his',
    !/your \d+ day free trial/i.test(plain.html)
    && !/trial has begun|trial is running|trial starts/i.test(plain.html));
  ok('🔴 AND INVENTS NO REASON EITHER, because the throwing path does not know one',
    !/you have had a free trial|already had|second trial|refused/i.test(plain.html));
  ok('it sends him somewhere that always knows, rather than leaving him guessing',
    /billing page under You/.test(plain.html));

  // ── We withheld a claim. We did not gut the email. ─────────────────────────────────────────
  ok('both arms still carry the setup paragraph, which is the reason this email exists',
    /where the money is/.test(started.html) && /where the money is/.test(plain.html));
  ok('both arms still send him to /app/setup',
    /\/app\/setup/.test(started.html) && /\/app\/setup/.test(plain.html));
  ok('both arms still greet him by name',
    /Dave/.test(started.html) && /Dave/.test(plain.html));
  ok('🔴 AND BOTH CARRY THE SAME SUBJECT, so the once per customer key cannot fork into two emails',
    typeof started.subject === 'string' && started.subject.length > 0
    && started.subject === plain.subject);
}

// ── The parameter is required, so a caller who does not know has to say so. ──────────────────
ok('the function still exists in the source we are pinning',
  /export async function sendWelcomeEmail\(/.test(emailSrc));
ok('🔴 THE TRIAL STATE IS A REQUIRED PARAMETER, NOT OPTIONAL WITH A CHEERFUL DEFAULT',
  /trial: 'started' \| 'not started',/.test(emailSrc)
  && !/trial\?: 'started'/.test(emailSrc)
  && !/trial: 'started' \| 'not started' = /.test(emailSrc));

// ── The caller tells it only what it read. ───────────────────────────────────────────────────
ok('the route still sends the welcome email on a new account',
  /sendWelcomeEmail\(/.test(routeSrc) && /if \(!existingId\)/.test(routeSrc));
ok('🔴 THE FLAG IS INITIALISED FALSE, so every path that does not prove a trial promises none',
  /let trialStarted = false;/.test(routeSrc));
ok('🔴 AND IT IS SET FROM WHAT THE GRANT ACTUALLY RETURNED',
  /trialStarted = grant\.granted;/.test(routeSrc));
ok('🔴 THE CALL PASSES IT, and the two argument form is gone',
  /trialStarted \? 'started' : 'not started',/.test(routeSrc)
  && !/sendWelcomeEmail\(verifiedEmail, ident\?\.personName \?\? null\)/.test(routeSrc));

// 🔴 THE CATCH MUST STAY PESSIMISTIC. A throw means we learned nothing, and nothing is not yes.
// ⚠️ The catch block is located before it is searched, so this cannot pass on a file whose catch
// somebody removed or renamed.
const catchStart = routeSrc.indexOf('  } catch {\n    // A billing row that would not write');
ok('the catch block this assertion is about is really there',
  catchStart > 0);
const catchBlock = catchStart > 0 ? routeSrc.slice(catchStart, catchStart + 400) : '';
ok('🔴 A FAILED GRANT NEVER TURNS INTO A PROMISED TRIAL',
  catchStart > 0 && !/trialStarted\s*=\s*true/.test(catchBlock));
ok('and nowhere in the route is the flag set true by anything but the grant',
  (routeSrc.match(/trialStarted\s*=/g) || []).length === 2);

// ── The screen half, which is the other end of the same fact. ────────────────────────────────
// If this is dropped the email is honest and the man is told nothing at all, which is this bug
// pointing the other way.
ok('🔴 THE SCREEN STILL TELLS A REFUSED MAN PLAINLY',
  /trialNote = refusalNote\(grant\.refusedOn\);/.test(routeSrc)
  && /redirect: '\/app\/setup', trialNote/.test(routeSrc));
ok('and refusalNote still points him at the account he already owns rather than at a door',
  /export function refusalNote\(/.test(identitySrc)
  && /Sign in and pick up where you left off, or add a card to carry on/.test(identitySrc));

// ── House rules. ─────────────────────────────────────────────────────────────────────────────
ok('no en dash or em dash in either composed email',
  started !== null && plain !== null
  && !/[–—]/.test(started.html) && !/[–—]/.test(plain.html));

process.stdout.write(`\n  ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);

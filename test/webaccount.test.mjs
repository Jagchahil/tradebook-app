// THE EMAIL MINTED ACCOUNT, AND THE ONE RULE THAT KEEPS IT SAFE.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THESE TESTS PROTECT, AND WHY THEY READ SOURCE RATHER THAN CALL FUNCTIONS.
//
// From 29 July 2026 an account is created by proving an EMAIL, and the mobile number a man types
// at signup has been proved by nobody. The rule that makes that safe is not a function anybody can
// call, it is a rule about WHERE a value is allowed to be written:
//
//   AN UNPROVED NUMBER MAY NEVER BE WRITTEN TO A COLUMN THAT A SENDER READS.
//
// Two columns qualify and both were checked by hand before this was built:
//
//   users.phone_number    the daily digest cron, the agent cron and the nudge fan out all SEND to
//                         it, and inbound WhatsApp resolves a message to an account BY it.
//   subscriptions.phone   /api/cron/trial calls sendTemplate(row.phone, ...) straight off it.
//
// Break the rule and the failure is not an exception. It is a stranger receiving one man's weekly
// figures, quietly, on the next cron run, and being able to feed his books. Nothing goes red. The
// only signal is a customer we would never hear from again.
//
// There is no pure function to test here, because the danger lives in an object literal handed to
// PostgREST. So these read the source and assert the shape, in the same spirit as
// test/watemplates.test.mjs, which stops a template name being written as a bare string outside
// its registry. A guard that measures the real risk beats a prettier test that measures nothing.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

console.log('\nweb account: the email door, and where an unproved number may live');

const supabase = read('lib/supabase.ts');
const verify = read('app/api/signup/verify/route.ts');
const codeRoute = read('app/api/signup/code/route.ts');
const authStart = read('app/api/auth/start/route.ts');
const startPage = read('app/start/page.tsx');

// ---------------------------------------------------------------------------------------------
// 🔴 THE RULE. The typed number goes in signup_phone and nowhere else.
// ---------------------------------------------------------------------------------------------
const grant = supabase.slice(
  supabase.indexOf('export async function grantTrialWithIdentity'),
  supabase.indexOf('export async function getSubscriptionByUser'),
);
ok('grantTrialWithIdentity exists to be checked', grant.length > 200);
ok('the trial records the typed number as signup_phone', /signup_phone:/.test(grant));

// `phone:` on its own, not the tail of `signup_phone:`. subscriptions.phone is texted by
// /api/cron/trial, so a number nobody proved must never land in it.
ok('the trial NEVER writes subscriptions.phone, which the trial cron texts',
  !/(?<![_a-zA-Z])phone:/.test(grant));

ok('the trial is keyed to the account', /user_id: input\.userId/.test(grant));

// ---------------------------------------------------------------------------------------------
// 🔴 THE SAME RULE AT THE OTHER END. The users row is created with the number GoTrue proved,
// which for an email signup is nothing at all, never with anything off the form.
// ---------------------------------------------------------------------------------------------
ok('the account is created from the VERIFIED identity, not the form',
  /ensureUserRow\(user\.id, user\.phone \|\| ''\)/.test(verify));
ok('nothing in the verify route reads a phone out of the request body',
  !/body\.phone|body\?\.phone/.test(verify));
ok('identity for the trial is read off the signup row, not the request',
  verify.includes('latestSignupIdentity('));

// ---------------------------------------------------------------------------------------------
// 🔴 THE TWO DOORS MUST NOT BECOME ONE.
//
// /api/auth/start is SIGNING IN. Its own header sets out why the email door may never create an
// account there: a man who typed a stranger's mobile at signup could otherwise prove his own
// address and be handed an account keyed to that stranger's number. /api/signup/code is SIGNING
// UP, where creating the account is the entire job. If these two ever agree, one of them is wrong.
// ---------------------------------------------------------------------------------------------
ok('the signup door creates accounts', /create_user: true/.test(codeRoute));
ok('the sign in door still refuses to create one from an email',
  /email: id\.value, create_user: false/.test(authStart));
ok('and it still refuses to send at all to an email with no account behind it',
  authStart.includes("if (id.channel === 'email' && !account.userId)"));

// ---------------------------------------------------------------------------------------------
// Both new doors are state changing, so both check the origin. SameSite is a promise made by the
// browser; this is the check made by our server, and only one of the two is ours.
// ---------------------------------------------------------------------------------------------
ok('the signup code door checks the origin', codeRoute.includes('originAllowed('));
ok('the signup verify door checks the origin', verify.includes('originAllowed('));
ok('the signup code door is rate limited per address and per source',
  codeRoute.includes('sup:t:') && codeRoute.includes('sup:ip:'));
ok('the signup verify door caps code guesses',
  verify.includes('supv:t:') && verify.includes('supv:ip:'));
ok('the signup code door fails closed on a daily cap', codeRoute.includes('spendCapReached('));

// ---------------------------------------------------------------------------------------------
// 🔴 THE ENDING NEVER GOES BACK TO BEING A FIELD.
//
// On 28 July the live signup finished by telling a barber to download an app that is not released
// and to say hello on WhatsApp, with no link to the web app anywhere on the page. This is the
// assertion that stops that returning by accident.
// ---------------------------------------------------------------------------------------------
ok('signup never links out to WhatsApp', !/wa\.me/.test(startPage));
ok('signup ends by opening his own books', startPage.includes("data.redirect || '/app'"));
ok('the answers are saved before the code is asked for, not after',
  startPage.indexOf('await submitSignup();') < startPage.indexOf('await sendCode();'));

// ---------------------------------------------------------------------------------------------
// Reconcile has to find the signup for an account with no phone, or every answer is dropped.
// ---------------------------------------------------------------------------------------------
const recon = supabase.slice(
  supabase.indexOf('export async function reconcileSignupToUser'),
  supabase.indexOf('export interface VerifiedUser'),
);
ok('reconcile can join on the proved email when there is no proved phone',
  /email=eq\.\$\{encodeURIComponent\(email\)\}/.test(recon));
ok('reconcile still prefers the phone, so the mobile path is untouched',
  recon.indexOf('phone=eq.') < recon.indexOf('email=eq.'));
ok('reconcile marks the row it actually read, not a different one',
  recon.includes('signups?${match}&reconciled_at=is.null'));

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

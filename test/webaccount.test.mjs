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

// 🔴 PRESENCE BEFORE ORDER, OR THE ORDER MEANS NOTHING. indexOf('gone()') is -1, and -1 is less
// than every real offset, so a bare `indexOf(a) < indexOf(b)` passes the day someone DELETES the
// call it was guarding. These are the signup code's replay and brute force protections, so a
// vacuous pass here is a security check that reports green while the security is gone. before()
// asserts BOTH calls still exist and only then that a comes first, the same helper youmail uses.
const before = (src, a, b) => src.includes(a) && src.includes(b) && src.indexOf(a) < src.indexOf(b);

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
ok('🔴 the users row is created with an EMPTY phone, never one off the form',
  /ensureUserRow\(userId, ''\)/.test(verify));
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
// 🔴 NOTHING IS CREATED BEFORE THE CODE COMES BACK.
//
// This is the security claim the whole signup rests on, and it is a claim about ABSENCE, which is
// exactly the kind that rots quietly. Until the right six digits arrive, the entire footprint of a
// signup attempt is one row in signup_codes and one email in somebody else's inbox: no auth user,
// no users row, no trial, no session.
ok('🔴 the code door creates no auth user', !codeRoute.includes('createConfirmedAuthUser'));
ok('🔴 the code door creates no users row', !codeRoute.includes('ensureUserRow'));
ok('🔴 the code door grants no trial', !codeRoute.includes('grantTrial'));
ok('🔴 the code door opens no session', !codeRoute.includes('createWebSession'));
ok('the code door writes down the code before it emails it, never after',
  before(codeRoute, 'createSignupCode(', 'sendSignupCodeEmail('));

// 🔴 THE ORDER INSIDE VERIFY. Each of these is a hole if it reverses, AND a hole if the guarding
// call is deleted, which is why before() insists the call is still there.
ok('🔴 the guess is COUNTED before it is compared, so a dropped request is not a free guess',
  before(verify, 'bumpSignupCodeAttempt(', 'verifyStoredCode('));
ok('🔴 the code is SPENT before an account is created, so one proof cannot mint two',
  before(verify, 'consumeSignupCode(', 'createConfirmedAuthUser('));
ok('🔴 the session is opened LAST, after the code is spent',
  before(verify, 'consumeSignupCode(', 'createWebSession('));

// The sign in door is a different door and must stay one.
ok('the sign in door still refuses to create an account from an email',
  /email: id\.value, create_user: false/.test(authStart));
ok('and it still refuses to send at all to an email with no account behind it',
  authStart.includes("if (id.channel === 'email' && !account.userId)"));

// 🔴 THE CODE IS NEVER WRITTEN ANYWHERE BUT THE EMAIL.
//
// lib/signupcode.ts stores only an HMAC. This is the other half: the routes must not put the plain
// code into a log line, an error body, or a response. A code in a log is a login in a log.
ok('🔴 the code door never logs or returns the code', !/console\.(log|error)\([^)]*code[^)]*\)/.test(codeRoute));
ok('🔴 the verify door never logs the code', !/console\.(log|error)\([^)]*\bcode\b/.test(verify));

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
// 🔴 THE ACCOUNT TAKEOVER. This is the most important block in this file.
//
// findContactAccount's email branch used to resolve an address by reading the signups row and then
// the PHONE TYPED ON IT, returning whichever account owned that number. Nobody proves the number on
// a signups row: it is a string somebody entered into a public form.
//
// So the attack was: type a stranger's mobile and your own email at /start, prove your own address,
// and be handed the stranger's account. It was demonstrated end to end on 29 July 2026 against a
// test account, and it did not stop at read access, because reconcileSignupToUser then wrote the
// attacker's name over the owner's.
//
// THE RULE: an email may only resolve to an account through a link made AFTER that email was
// proved. signups.user_id is that link and it is written in exactly one place.
//
// These assertions are the ones to be most suspicious of anybody "simplifying".
// ---------------------------------------------------------------------------------------------
const emailBranch = supabase.slice(
  supabase.indexOf('🔴 EMAIL. THIS RESOLVED THROUGH THE PHONE'),
  supabase.indexOf('export async function attachEmailToAuthUser'),
);
ok('the email branch of the contact lookup exists to be checked', emailBranch.length > 400);
ok('🔴 an email only resolves through a link made after it was proved',
  /signups\?email=eq[^`]*user_id=not\.is\.null/.test(emailBranch));
ok('🔴 an email NEVER resolves by looking up an account from a typed phone',
  !/users\?phone_number=eq\./.test(emailBranch));
ok('the phone it hands back comes off the ACCOUNT, not off the signup row',
  /users\?id=eq\.\$\{encodeURIComponent\(row\.user_id\)\}/.test(emailBranch));

const finder = supabase.slice(
  supabase.indexOf('export async function findAuthUserIdForEmail'),
  supabase.indexOf('export async function createConfirmedAuthUser'),
);
ok('the signup lookup exists to be checked', finder.length > 200);
ok('🔴 the signup lookup has no fallback that walks through a typed phone',
  !finder.includes('findContactAccount('));
ok('🔴 and it requires the proved link', /user_id=not\.is\.null/.test(finder));

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

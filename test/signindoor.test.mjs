// THE SIGN IN DOOR. Not whether it renders. Whether a code actually leaves the building.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS SUITE EXISTS TO PREVENT, IN ONE STORY.
//
// 11:48, Tuesday 11 August 2026. RUN 1 of the customer week. A customer who had made an account
// the previous evening asks for a sign in code. The screen says "We have sent you a code. It lasts
// a few minutes." Nothing arrives. He asks again at 12:07, 12:31 and 12:53. Same sentence, four
// times. Nothing arrives, four times. Sixty five minutes, four codes, zero emails.
//
// In the same window, on the same address, signup codes, the welcome email and a waitlist confirm
// all landed within seconds. Because those go through Resend, and this one did not.
//
// THREE THINGS WERE WRONG AND ONLY THE THIRD IS INTERESTING.
//
//   1. The sign in code was the ONE email in the product that never went through lib/email.ts.
//      It was rendered and posted by Supabase GoTrue: a different sender, a different domain, a
//      template in a dashboard, and on the built in SMTP a rate limit documented for development.
//      Every other email had a verified domain and a checked boolean. This one had neither.
//   2. app/api/auth/start computed `ok` from the provider response, wrote it to auth_sends, and
//      then never read it again. The screen said the same sentence on a 200 and on a 500.
//   3. AND THE TEST HARNESS COULD ALREADY SIMULATE IT. test/webauth.test.mjs builds a fake GoTrue
//      with an `otpFails` switch. Grep the suite: the switch is DEFINED AND NEVER SET. Somebody
//      built the door to this exact failure, walked up to it, and never opened it.
//
// The house disease wearing its third coat: a signal that cannot tell "sent" from "said it sent".
//
// So these tests hold four things:
//   1. THE ROAD. The email code goes through our own mailer, on the registry every other email
//      is on, with a fallback that cannot lock anybody out.
//   2. THE TRUTH. A send that failed does not produce the screen a send that worked produces.
//   3. THE ALARM. A door that has stopped posting codes turns /api/health red.
//   4. THE WIRING. The alarm reaches the endpoint UptimeRobot actually polls.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { authSendAlarm, authSendsServing, blockingAlarms, AUTH_SEND_MIN_ATTEMPTS } from '../lib/cronwatch.ts';

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}`);
  }
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

// Node's type stripping cannot follow an extensionless relative import, so lib/email.ts and its
// dependencies are staged with the rewrite every engine suite in here uses.
const fixImports = (s) => s.replace(/from '(\.\/[a-zA-Z0-9._-]+)'/g, "from '$1.ts'");
const stage = mkdtempSync(path.join(tmpdir(), 'signindoor-'));
for (const f of ['email', 'entitlement', 'onboarding', 'vat', 'money', 'taxengine', 'housestyle']) {
  writeFileSync(path.join(stage, f + '.ts'), fixImports(read('lib/' + f + '.ts')));
}
// Resend must look configured or send() returns false before it ever composes a subject.
process.env.RESEND_API_KEY = 'signin-door-suite-key-not-real';
const { REPEATING_SUBJECTS, SUBJECT_MARKS, resolveSubject } = await import(
  pathToFileURL(path.join(stage, 'email.ts')).href
);

// ⚠️ PRESENT AND ORDERED, NEVER JUST ORDERED. indexOf returns -1 for a missing needle, so a plain
// indexOf(a) < indexOf(b) passes vacuously when a was deleted. Same helper, same lesson, as
// test/reminderclock.test.mjs.
function before(hay, a, b) {
  const i = hay.indexOf(a);
  const j = hay.indexOf(b);
  return i !== -1 && j !== -1 && i < j;
}

const start = read('app/api/auth/start/route.ts');
const verify = read('app/api/auth/verify/route.ts');
const door = read('app/in/page.tsx');
const email = read('lib/email.ts');

console.log('\n--- 1. THE ROAD. One mailer for every email in the product ---\n');
{
  ok('🔴 THE SIGN IN CODE GOES THROUGH OUR OWN MAILER, the one with a verified domain',
    start.includes('sendSignInCodeEmail('));
  ok('and the code is minted without asking the provider to post it',
    start.includes('mintSignInCode('));

  // The mint has to come before the send, or the send has nothing to carry.
  ok('minted before sent', before(start, 'mintSignInCode(', 'sendSignInCodeEmail('));

  // 🔴 THE FALLBACK IS THE WHOLE REASON THIS CHANGE IS SAFE ON A LIVE PRODUCT. Changing the road a
  // sign in code travels on, on a launched app, with no way to rehearse it against real GoTrue, is
  // only defensible if the old road is still there and still runs.
  ok('🔴 THE OLD ROAD IS STILL HERE, so a bad mint can never lock a customer out',
    start.includes('/auth/v1/otp'));
  // ⚠️ THE NEEDLE IS THE FETCH, NOT THE PATH. The path appears in the comment above the block
  // explaining the fallback, so a plain indexOf would compare a sentence against a call.
  ok('🔴 AND IT RUNS ONLY WHEN THE NEW ONE DID NOT',
    before(start, 'sendSignInCodeEmail(', 'fetch(`${url}/auth/v1/otp`'));
  ok('the fallback is guarded on the new road having failed', /if \(!ok\) \{[\s\S]{0,200}auth\/v1\/otp/.test(start));

  // The SMS door is untouched. It never had this problem and it is not in this fix.
  ok('the SMS door is left alone', start.includes("id.channel === 'email' && hasEmailConfig()"));

  // Minting must never bring an account into being. 'signup' would mint one for any address posted
  // at the door, which is exactly the enumeration the neutrality rule at the top of that file
  // exists to prevent.
  const sb = read('lib/supabase.ts');
  ok('🔴 MINTING NEVER CREATES A USER: magiclink, never signup',
    /generate_link[\s\S]{0,400}type: 'magiclink'/.test(sb) && !/generate_link[\s\S]{0,400}type: 'signup'/.test(sb));
  ok('a mint that fails returns null rather than throwing at the door',
    /export async function mintSignInCode[\s\S]{0,1400}?catch \{\s*return null;/.test(sb));

  // Both types must be tried on verify, or the fallback road mints codes the door then rejects.
  ok('🔴 VERIFY ACCEPTS BOTH MINTS, so a code from either road still works', verify.includes("type: 'magiclink'")
    && verify.includes("type: 'email'"));
  ok('and only refuses once both have said no', /if \(!res \|\| !res\.ok\) return back\(req, 'code'/.test(verify));
}

console.log('\n--- 2. THE SUBJECT. The email that broke this way before is now under the ratchet ---\n');
{
  // 7 August 2026 cost a week: every sign in code a man had been sent collapsed into one Gmail
  // conversation headed by its OLDEST message, because the subject was a fixed string. The fix at
  // the time went into the Supabase dashboard, which is why test/subjectrule.test.mjs, written to
  // stop exactly that, could never see the email it was written for.
  ok('🔴 THE SIGN IN SUBJECT IS IN THE REGISTRY AT LAST',
    typeof REPEATING_SUBJECTS['signin-code'] === 'function');
  ok('and it declares where its mark comes from', Boolean(SUBJECT_MARKS['signin-code']?.source));
  ok('the mark is the code itself, which is fresh on every send',
    SUBJECT_MARKS['signin-code'].source === 'caller');

  const a = resolveSubject({ repeats: 'signin-code', mark: '482913' });
  const b = resolveSubject({ repeats: 'signin-code', mark: '771204' });
  ok('🔴 TWO CODES A MINUTE APART DO NOT COLLAPSE INTO ONE THREAD', a !== b);
  ok('and the code is at the front, where a man reads it off a notification', a.startsWith('482913'));

  ok('the sender is our own, not the provider default', email.includes('sendSignInCodeEmail'));
  ok('🔴 and there is nothing to click in it, so there is nothing to phish',
    /export async function sendSignInCodeEmail[\s\S]{0,900}?tag: 'signin-code'/.test(email)
    && !/export async function sendSignInCodeEmail[\s\S]{0,900}?<a /.test(email));
}

console.log('\n--- 3. THE TRUTH. A screen that says "sent" when nothing was sent is the defect ---\n');
{
  // ⚠️ THE SENTENCE ALREADY EXISTED AND WAS UNREACHABLE. app/in/page.tsx has carried
  // "We could not send the code just now" since it was written, and nothing on this door could
  // ever produce it. The fix is not new copy. It is wiring copy that was already right.
  ok("the door still carries the honest sentence", door.includes('We could not send the code just now'));
  ok('🔴 AND THE DOOR CAN NOW REACH IT', /if \(!ok\) return resend \? backToCode\(req, 'send'/.test(start));

  // Where he lands matters as much as what he is told. A man asking for a SECOND code already has
  // the code step open; bouncing him to an empty address field is the fault the resend button was
  // added to end, reached from the other side.
  ok('a first send that fails puts him back on the address form', /back\(req, 'send', next\)/.test(start));
  ok('a resend that fails leaves him on the code step', /backToCode\(req, 'send', next\)/.test(start));

  // 🔴 THE NEUTRALITY RULE SURVIVES. A stranger is turned away at findContactAccount, long before
  // anything is sent, so a stranger can never see this screen. If that order ever inverts, an
  // outage turns the login form into a customer list with a search box on it.
  ok('🔴 A STRANGER IS STILL TURNED AWAY BEFORE ANY SEND HAPPENS',
    before(start, "logAuthSend(id.channel, hash, 'refused_unknown')", 'sendSignInCodeEmail('));
  ok('🔴 AND BEFORE THE HONEST FAILURE SCREEN CAN BE REACHED',
    before(start, "logAuthSend(id.channel, hash, 'refused_unknown')", "if (!ok) return resend"));
  ok('the refused stranger still gets the neutral screen', /refused_unknown[\s\S]{0,300}?return onward\(/.test(start));

  // The audit row was always written. It was the READ that was missing.
  ok('the outcome is still written down for the auditors', /logAuthSend\(id\.channel, hash, ok \? 'sent' : 'failed'\)/.test(start));
  ok('🔴 AND IT IS WRITTEN BEFORE THE SCREEN IS CHOSEN, so a redirect can never skip the evidence',
    before(start, "logAuthSend(id.channel, hash, ok ? 'sent' : 'failed')", "if (!ok) return resend"));
}

console.log('\n--- 4. THE ALARM. A door that has stopped posting codes is an outage ---\n');
{
  const h = (attempted, sent, failed) => ({ attempted, sent, failed, windowMinutes: 60 });

  // The observed incident, to the number: four asked for, none accepted, over about an hour.
  ok('🔴 THE 11 AUGUST INCIDENT GOES RED', authSendAlarm(h(4, 0, 4)) !== null);
  ok('and it is named as a failure, not a mystery', authSendAlarm(h(4, 0, 4))?.reason === 'failed');
  ok('and it names the door rather than a cron job', authSendAlarm(h(4, 0, 4))?.job === 'signin');
  ok('the detail says what a person would need to act on it',
    /not one of them was accepted/.test(authSendAlarm(h(4, 0, 4))?.detail ?? ''));

  // 🔴 THE CRY WOLF SIDE. lib/cronwatch.ts says an alarm that cries wolf gets muted and a muted
  // alarm is worse than no alarm because it looks like cover. On 9 August a too eager alarm put
  // /api/health at 503 on launch eve over a job that was perfectly healthy.
  ok('a quiet hour is not an outage', authSendAlarm(h(0, 0, 0)) === null);
  ok('one failure is a blip, not an alarm', authSendAlarm(h(1, 0, 1)) === null);
  ok(`and the floor is ${AUTH_SEND_MIN_ATTEMPTS}, derived rather than typed`,
    authSendAlarm(h(AUTH_SEND_MIN_ATTEMPTS - 1, 0, AUTH_SEND_MIN_ATTEMPTS - 1)) === null
    && authSendAlarm(h(AUTH_SEND_MIN_ATTEMPTS, 0, AUTH_SEND_MIN_ATTEMPTS)) !== null);
  ok('🔴 ONE SUCCESS MEANS THE ROAD IS OPEN, whatever else went wrong', authSendAlarm(h(9, 1, 8)) === null);
  ok('a busy healthy hour is silent', authSendAlarm(h(40, 40, 0)) === null);

  // 🔴 null IN, ALARM OUT. The rule cronsServing and reminderAlarm already set: "I could not look"
  // is not "there is nothing there", and it is the state most likely to be hiding something.
  ok('🔴 A WINDOW WE CANNOT READ IS NOT A CLEAN BILL OF HEALTH', authSendAlarm(null) !== null);
  ok('and it says so in words rather than pretending to a reason', authSendAlarm(null)?.reason === 'unreadable');

  ok('authSendsServing is the alarm read the other way up',
    authSendsServing(h(40, 40, 0)) === true && authSendsServing(h(4, 0, 4)) === false && authSendsServing(null) === false);

  // Both reasons are outages, so blockingAlarms must carry them through to the 503 rather than
  // filtering them the way it filters never_run.
  const both = [authSendAlarm(h(4, 0, 4)), authSendAlarm(null)].filter(Boolean);
  ok('🔴 neither reason is filtered out of blockingAlarms, so both can reach a 503',
    blockingAlarms(both).length === 2);
}

console.log('\n--- 5. THE WIRING. An alarm nobody reads is a diary, not a watchdog ---\n');
{
  const health = read('app/api/health/route.ts');

  ok('/api/health imports the reader', health.includes('getAuthSendHealth'));
  ok('/api/health imports the policy', health.includes('authSendsServing') && health.includes('authSendAlarm'));

  ok('🔴 THE PUBLIC VERDICT ACTUALLY DEPENDS ON IT', /const healthy = [^;]*\bsignInOk\b/.test(health));
  ok('🔴 AND THE OPERATOR VERDICT DOES TOO', /const ok = [\s\S]{0,320}?deadMailer === null/.test(health));

  ok('the door is read before the verdict is formed',
    before(health, 'const authSends = await getAuthSendHealth()', 'const healthy ='));

  ok('the public body reports it in one word', /signin: authSends === null \? 'unknown'/.test(health));
  ok('🔴 and never the counts, which are our business and not a stranger\'s',
    !/signin: \{ attempted[\s\S]{0,600}status: healthy/.test(health));
  ok('the operator body gets the counts, because that is the whole use of the row',
    /signin: authSends === null \? 'unreadable' : \{ attempted:/.test(health));

  // 🔴 NEVER AN ADDRESS, ON EITHER SIDE. lib/logindoor.ts hashes the target before it is written,
  // and a health endpoint that named who failed to sign in would undo that in one line.
  const sb = read('lib/supabase.ts');
  ok('🔴 THE READER SELECTS THE OUTCOME AND NOTHING ELSE',
    /auth_sends\?select=outcome/.test(sb) && !/auth_sends\?select=[^`'"]*target_hash/.test(sb));
  ok('and it counts only real attempts, so a quiet night of refusals is not a broken mailer',
    /outcome=in\.\(sent,failed\)/.test(sb));
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

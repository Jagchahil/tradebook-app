// B71. THE ADDRESS HE PROVED IS THE ONE WE EMAILED, NOT THE ONE HE RETYPED. 20 August 2026.
//
//   node test/b71provedaddress.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// readLatestSignupCode keys on email_norm, and normaliseEmail STRIPS PLUS TAGS AND GMAIL DOTS on
// purpose, so that a fresh trial cannot be bought with a plus sign. That means the row it hands back
// is not always the row for the exact string typed into the verify form.
//
// Until today everything downstream of the verdict used that typed string.
//
//   THE COMMON CASE IS ONE PERSON WITH TWO SPELLINGS. He asks for a code at john.smith@gmail.com
//   and types johnsmith@gmail.com back. That minted his account under the SECOND spelling and laid
//   a signups row down at an address he never gave us, while the row he actually created sat
//   unlinked. Which is B65's own failure, arriving through the front door.
//
//   THE RARE CASE IS TWO PLUS TAGGED ADDRESSES ON ONE BASE. Typing the other one's code minted an
//   account for the address TYPED while consuming the row for the address SENT, leaving a consumed
//   code with no link: the one known false positive in B65's watcher.
//
// 🔴 A CODE PROVES THE MAILBOX IT WAS DELIVERED TO. It cannot prove anything about a string typed
// afterwards, and this route treated the second as evidence of the first.
//
// ⚠️ THE ROUTE IS STAGED AND RUN HERE, not asserted about. The claim is about which address six
// database calls are made with, and only running it can settle that.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); }
};
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// lib/signupcode.ts reads its secret at module load, and refuses to issue anything without one.
process.env.WEB_SESSION_SECRET = 'a-test-secret-that-is-at-least-thirty-two-chars-long';
const SECRET = process.env.WEB_SESSION_SECRET;
const hashFor = (emailNorm, code) => crypto.createHmac('sha256', SECRET).update(`${emailNorm}:${code}`).digest('hex');

const ROUTE_SRC = read('app/api/signup/verify/route.ts');

// \u26a0\ufe0f THE NORM IS COMPUTED BY THE REAL normaliseEmail, NEVER BY A MIRROR OF IT WRITTEN HERE.
// The first version of this suite reimplemented the plus tag and gmail dot rules in one line and got
// the whitespace case wrong, which showed up as a route REFUSING rather than as a wrong address: a
// harness bug wearing the costume of a product bug.
const normStage = mkdtempSync(path.join(tmpdir(), 'b71-norm-'));
writeFileSync(path.join(normStage, 'trialidentity.ts'), read('lib/trialidentity.ts'));
const N = await import(pathToFileURL(path.join(normStage, 'trialidentity.ts')).href);

// The real route, with the session plumbing, the burst limit and the database stubbed, because none
// of those is what B71 is about. lib/signupcode.ts and lib/trialidentity.ts go in WHOLE: the code
// rules and the normalisation ARE the thing under test, and a stub of either would be a test of the
// stub. Same harness as test/moneyweb.test.mjs section 5c and test/b62propertyroute.test.mjs.
const stageRoute = (mutate) => {
  const rt = mkdtempSync(path.join(tmpdir(), 'b71-route-'));
  const w = (n, s) => writeFileSync(path.join(rt, n), s);
  // \u26a0\ufe0f THE RESPONSE CARRIES A COOKIE JAR, because the route sets the session cookie on the
  // object it returns. A stub without one does not fail the route, it THROWS inside it, and a throw
  // in a harness is a red that tells you nothing about the product.
  w('nextserver.ts', `
export class NextRequest {}
export const NextResponse = {
  json(body, init) {
    const jar = [];
    return {
      kind: 'json', status: (init && init.status) || 200, body,
      cookies: { set: (name, value, attrs) => { jar.push({ name, value, attrs }); } },
      setCookies: jar,
    };
  },
};
`);
  w('ratelimit.ts', "export async function rateLimitedShared() { return false; }\nexport function clientIp() { return '1.2.3.4'; }\n");
  w('logindoor.ts', "export function targetHash() { return 'hash'; }\n");
  w('websession.ts', `
export const SESSION_COOKIE = 'lek';
export const SESSION_TTL_SECONDS = 3600;
export function newSessionId() { return 'sid'; }
export function originAllowed() { return true; }
export function sessionCookieAttributes() { return {}; }
export function sessionCookieValue() { return 'v'; }
export function webSessionsConfigured() { return true; }
`);
  w('email.ts', "export function looksLikeEmail(v) { return /.+@.+\\..+/.test(String(v)); }\nexport async function sendWelcomeEmail() { return true; }\n");
  w('supabase.ts', `
export const state = { row: null, calls: [] };
const note = (fn, email) => { state.calls.push({ fn, email }); };
export async function readLatestSignupCode(emailNorm) { note('readLatestSignupCode', emailNorm); return state.row; }
export async function bumpSignupCodeAttempt() { return true; }
export async function consumeSignupCode() { return true; }
export async function findAuthUserIdForEmail(e) { note('findAuthUserIdForEmail', e); return null; }
export async function createConfirmedAuthUser(e) { note('createConfirmedAuthUser', e); return 'user-1'; }
export async function ensureUserRow() { return true; }
export async function setSignupUserId(e) { note('setSignupUserId', e); }
export async function ensureSignupBridge(u, e) { note('ensureSignupBridge', e); }
export async function reconcileSignupToUser(u, e) { note('reconcileSignupToUser', e); }
export async function latestSignupIdentity(e) { note('latestSignupIdentity', e); return null; }
export async function grantTrialWithIdentity(input) { note('grantTrialWithIdentity', input && input.email); return { granted: true }; }
export async function createWebSession() { return true; }
`);
  w('signupcode.ts', read('lib/signupcode.ts'));
  w('trialidentity.ts', read('lib/trialidentity.ts'));
  const src = ROUTE_SRC
    .replace(/from 'next\/server'/g, "from './nextserver.ts'")
    .replace(/from '(?:\.\.\/)+lib\/([a-zA-Z]+)'/g, "from './$1.ts'");
  w('route.ts', mutate ? mutate(src) : src);
  return rt;
};

const CODE = '123456';
const post = async (rt, { typed, sentTo }) => {
  const R = await import(pathToFileURL(path.join(rt, 'route.ts')).href);
  const S = await import(pathToFileURL(path.join(rt, 'supabase.ts')).href);
  // The row as the database really holds it: the address we EMAILED, and a hash bound to the norm,
  // exactly as app/api/signup/code builds it.
  // The hash is bound to the NORM of what he types, exactly as app/api/signup/code binds it and
  // exactly as the verdict will check it.
  const norm = N.normaliseEmail(typed) || typed;
  S.state.row = {
    id: 'code-1',
    email: sentTo,
    code_hash: hashFor(norm, CODE),
    attempts: 0,
    expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    consumed_at: null,
  };
  S.state.calls.length = 0;
  const req = {
    url: 'https://lekhio.app/api/signup/verify',
    headers: { get: () => 'application/json' },
    json: async () => ({ email: typed, code: CODE }),
  };
  const res = await R.POST(req);
  return { res, calls: S.state.calls };
};
const emailsFor = (calls, fn) => calls.filter((c) => c.fn === fn).map((c) => c.email);

// ---------------------------------------------------------------------------------------------
// 🔴 1. VACUITY. The old line is restored and the walker must SEE it mint the wrong address.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 0. the premise, because the item does not exist without it ===\n');

// 🔴 IF THESE TWO STOP BEING TRUE, THERE IS NO COLLISION TO FIX AND NO SPELLING VARIANT TO
// RESCUE. The whole of B71 rests on readLatestSignupCode keying on a normalisation class that really
// does collapse more than one address, so the premise is asserted rather than assumed.
ok('🔴 TWO PLUS TAGGED ADDRESSES ON ONE BASE REALLY DO SHARE A NORMALISATION CLASS',
  N.normaliseEmail('jag+one@gmail.com') === N.normaliseEmail('jag+two@gmail.com'));
ok('🔴 AND SO DO TWO SPELLINGS OF ONE GMAIL ADDRESS',
  N.normaliseEmail('john.smith@gmail.com') === N.normaliseEmail('johnsmith@gmail.com'));
ok('...while two genuinely different people do not', 
  N.normaliseEmail('dave@example.com') !== N.normaliseEmail('sam@example.com'));

console.log('\n=== 1. vacuity: the defect, on the code that shipped until today ===\n');

const LIVE = "  const verifiedEmail = String(row!.email ?? '').trim().toLowerCase() || email;";
const brokenRt = stageRoute((src) => {
  if (!src.includes(LIVE)) throw new Error('ANCHOR: the proved address line is not where this suite thinks it is');
  return src.replace(LIVE, '').replace('  const emailNorm = normaliseEmail(email) || email;',
    '  const verifiedEmail = email;\n  const emailNorm = normaliseEmail(email) || email;');
});
{
  const { calls } = await post(brokenRt, { typed: 'johnsmith@gmail.com', sentTo: 'john.smith@gmail.com' });
  ok('🔴 THE OLD LINE MINTS THE ACCOUNT UNDER THE SPELLING HE RETYPED, not the one we emailed',
    emailsFor(calls, 'createConfirmedAuthUser')[0] === 'johnsmith@gmail.com');
  ok('...and lays the bridge down at that spelling too, at an address he never gave us',
    emailsFor(calls, 'setSignupUserId')[0] === 'johnsmith@gmail.com');
}

// ---------------------------------------------------------------------------------------------
// 2. WHAT SHIPS.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 2. what ships: the address the code was emailed to ===\n');

const liveRt = stageRoute(null);
const PROVED = ['findAuthUserIdForEmail', 'createConfirmedAuthUser', 'setSignupUserId',
  'ensureSignupBridge', 'reconcileSignupToUser', 'latestSignupIdentity', 'grantTrialWithIdentity'];

{
  const { res, calls } = await post(liveRt, { typed: 'johnsmith@gmail.com', sentTo: 'john.smith@gmail.com' });
  ok('the verify succeeds, so this is a measurement rather than a refusal', res.status === 200);
  const wrong = PROVED.filter((fn) => emailsFor(calls, fn).some((e) => e !== 'john.smith@gmail.com'));
  ok('🔴 EVERY DOWNSTREAM CALL IS MADE WITH THE ADDRESS WE EMAILED, ALL SEVEN OF THEM',
    wrong.length === 0);
  if (wrong.length) console.log(`     still using the typed string: ${wrong.join(', ')}`);
  ok('...and every one of them was actually reached, so an empty list cannot pass this',
    PROVED.every((fn) => emailsFor(calls, fn).length > 0));
}
{
  // The rare case: two plus tagged addresses on one base, and he types the other one's code.
  const { calls } = await post(liveRt, { typed: 'jag+one@gmail.com', sentTo: 'jag+two@gmail.com' });
  ok('🔴 THE PLUS TAG COLLISION NO LONGER SPLITS THE TWO: the account and the bridge are both for'
    + ' the address the code went to',
    emailsFor(calls, 'createConfirmedAuthUser')[0] === 'jag+two@gmail.com'
    && emailsFor(calls, 'setSignupUserId')[0] === 'jag+two@gmail.com');
  ok('🔴 SO THE CONSUMED CODE AND THE LINKED SIGNUP NOW NAME THE SAME ADDRESS, which is what closes'
    + ' the one known false positive in B65\'s watcher',
    emailsFor(calls, 'setSignupUserId')[0] === 'jag+two@gmail.com');
}
{
  // The ordinary case, which is almost everybody: nothing changes at all.
  const { res, calls } = await post(liveRt, { typed: 'dave@example.com', sentTo: 'dave@example.com' });
  ok('an ordinary signup is untouched', res.status === 200
    && PROVED.every((fn) => emailsFor(calls, fn).every((e) => e === 'dave@example.com')));
}
{
  const { calls } = await post(liveRt, { typed: 'dave@example.com', sentTo: '  Dave@Example.COM ' });
  ok('🔴 AND THE PROVED ADDRESS IS SETTLED, trimmed and lower cased, because setSignupUserId patches'
    + ' on exactly that and findContactAccount reads on exactly that',
    emailsFor(calls, 'setSignupUserId')[0] === 'dave@example.com');
}
{
  // A row with no email at all cannot happen (the column is not null) and must still not throw.
  const rt = stageRoute(null);
  const R = await import(pathToFileURL(path.join(rt, 'route.ts')).href);
  const S = await import(pathToFileURL(path.join(rt, 'supabase.ts')).href);
  S.state.row = { id: 'c', email: null, code_hash: hashFor('dave@example.com', CODE), attempts: 0,
    expires_at: new Date(Date.now() + 60_000).toISOString(), consumed_at: null };
  S.state.calls.length = 0;
  const res = await R.POST({ url: 'https://lekhio.app/api/signup/verify',
    headers: { get: () => 'application/json' },
    json: async () => ({ email: 'dave@example.com', code: CODE }) });
  ok('🔴 A ROW WITH NO ADDRESS FALLS BACK TO THE TYPED ONE RATHER THAN MINTING AN ACCOUNT FOR AN'
    + ' EMPTY STRING', res.status === 200
    && emailsFor(S.state.calls, 'createConfirmedAuthUser')[0] === 'dave@example.com');
}

// ---------------------------------------------------------------------------------------------
// 3. THE ROW HAS TO CARRY IT, AND THE ORDER HAS TO HOLD.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 3. the reader, and the order of the two decisions ===\n');

const sb = read('lib/supabase.ts');
// \u26a0\ufe0f THE COLUMNS ARE NAMED, NOT THE ORDER THEY ARE WRITTEN IN. A guard that quotes the
// select string reds on a reorder, which changes the request and no answer, and this corpus has now
// had four of those in two days.
{
  const sel = ((sb.match(/signup_codes\?email_norm=[\s\S]{0,200}?&select=([a-z_,]+)/) ?? [])[1] ?? '').split(',');
  ok('🔴 readLatestSignupCode SELECTS THE ADDRESS THE CODE WAS SENT TO',
    /signup_codes\?email_norm=eq\.\$\{encodeURIComponent\(emailNorm\)\}/.test(sb)
    && sel.includes('email'));
  ok('...and still selects everything the verdict needs, so this did not quietly narrow the read',
    ['id', 'code_hash', 'attempts', 'expires_at', 'consumed_at'].every((c) => sel.includes(c)));
}
ok('...and it is on the type, so no caller has to guess whether it is there',
  /export interface SignupCodeRow[\s\S]{0,900}?\n  email: string;/.test(sb));
ok('the lookup still keys on the NORM, which is what lets a spelling variant find his code at all',
  /readLatestSignupCode\(emailNorm: string\)/.test(sb));

const routeCode = codeOnly(ROUTE_SRC);
ok('🔴 THE PROVED ADDRESS IS TAKEN FROM THE ROW, NEVER FROM THE FORM',
  /const verifiedEmail = String\(row!\.email \?\? ''\)/.test(routeCode));
ok('🔴 AND IT IS DECIDED AFTER THE CODE IS SPENT, so nothing can be minted on an unproved row',
  routeCode.indexOf('consumeSignupCode(row!.id)') < routeCode.indexOf('const verifiedEmail ='));
ok('the verdict still checks the hash against the NORM, which is what the row was built with',
  /verifyStoredCode\(row, emailNorm, code\)/.test(routeCode));
ok('the rate limit still keys on what he typed, because that is about the request',
  /targetHash\(/.test(routeCode));

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

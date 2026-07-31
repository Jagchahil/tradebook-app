// THE YOU SURFACE AND THE EMAIL BIND. Run: node test/youmail.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS SUITE PROTECTS, AND WHY EVERY PIN IS THE SHAPE IT IS.
//
// The 29 July email takeover fix is the law of this surface: an email may only resolve to an
// account through a link made AFTER the address was proved, and a contact that belongs to another
// account is REFUSED, never moved. The add email flow is the one place a signed in customer can
// grow a new contact point, which makes it the one place that law can be quietly repealed by a
// refactor that still compiles and still goes green everywhere else.
//
// So the rules are pinned two ways:
//
//   . AT RUNTIME, against the real ownership and bind functions, extracted from lib/supabase.ts
//     and run under a stubbed fetch. The tenancy attack is literal: an address whose proved link
//     belongs to another user id must come back 'another', a failed read must come back null and
//     never 'nobody', and the bind write must be a PUT on the session's own auth user with the
//     signups link write touching only rows whose user_id is null.
//
//   . AT THE SOURCE, for the order of operations inside the two routes, because "the attempt is
//     counted before the comparison" and "the code is spent before the bind" are properties of
//     line order that no runtime test of a pure function can see.
//
// The copy is pinned too. The refusal for another man's address lives in a table of fixed strings
// in app/app/you/identity.ts, and this suite holds that function to a shape that cannot leak:
// no interpolation at all, so there is nowhere to put a name, an address or an account.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// The secret must exist before any module that reads it at load time is imported. Same trick and
// same reason as test/signupcode.test.mjs.
process.env.WEB_SESSION_SECRET = 'youmail-test-secret-at-least-thirty-two-characters';

import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); }
};

// Comments stripped before asking what the CODE does. Every one of these files explains at length
// the mistakes it refuses to make, and a grep that cannot tell the warning from the deed fails on
// the warning.
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// a appears, b appears, and a appears FIRST. The order pins below are all this one question.
const before = (src, a, b) => src.includes(a) && src.includes(b) && src.indexOf(a) < src.indexOf(b);

const NO_DASH = /[—–]/;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 1. THE FIXED SENTENCES. app/app/you/identity.ts, imported whole: it has no imports of its own.
// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nthe you surface: identity, the email bind, and the settings');

const I = await import(pathToFileURL(path.join(root, 'app/app/you/identity.ts')).href);

console.log('\n── the mask shows enough to recognise and nothing to harvest ──');
ok('jag@gmail.com reads as j***@g***.com', I.maskEmail('jag@gmail.com') === 'j***@g***.com');
ok('case is folded before masking', I.maskEmail('JAG@Gmail.Com') === 'j***@g***.com');
ok('a long address gives up no more letters', I.maskEmail('longlocal@bigdomain.co.uk') === 'l***@b***.uk');
ok('a string with no @ is never echoed', I.maskEmail('not-an-email') === '');
ok('an empty local part is refused', I.maskEmail('@x.com') === '');
ok('a domain with no dot is refused', I.maskEmail('a@b') === '');
ok('a domain ending on the dot is refused', I.maskEmail('a@b.') === '');
ok('null masks to nothing', I.maskEmail(null) === '');
ok('undefined masks to nothing', I.maskEmail(undefined) === '');

console.log('\n── the refusal copy is honest and structurally cannot leak ──');
const taken = I.bindNotice('taken');
ok('the taken sentence exists', typeof taken === 'string' && taken.length > 0);
ok('🔴 it is honest that the address is on a different Lekhio account', /different Lekhio account/.test(taken));
ok('🔴 it says plainly that nothing was moved', /Nothing has been moved/.test(taken));
ok('it never prints an address', !taken.includes('@'));
ok('an unknown token says nothing at all', I.bindNotice('nonsense') === null && I.bindNotice(undefined) === null);
ok('the bound line exists and names what it unlocks', /sign in/.test(I.BOUND_LINE));
ok('settingsNotice knows saved', typeof I.settingsNotice('saved') === 'string');
ok('settingsNotice refuses the unknown', I.settingsNotice('what') === null);

// The whole table of sentences, held to the house rules in one sweep. Codes are read out of the
// function's own case labels so a new sentence cannot be added outside the sweep.
const identitySrc = read('app/app/you/identity.ts');
const noticeCodes = [...identitySrc.matchAll(/case '([a-z]+)':/g)].map((m) => m[1]);
ok(`the sentence table was found (${noticeCodes.length} codes)`, noticeCodes.length >= 12);
const sentences = noticeCodes.map((c) => I.bindNotice(c) ?? I.settingsNotice(c)).filter(Boolean);
ok('every code has a sentence', sentences.length === noticeCodes.length);
ok('no sentence carries an em dash or an en dash', sentences.every((s) => !NO_DASH.test(s)));
ok('no sentence carries an address', sentences.every((s) => !s.includes('@')));

// 🔴 THE SHAPE THAT CANNOT LEAK. A sentence assembled from parts can grow an interpolation in a
// refactor; a table of literals cannot. The two notice functions must contain no ${ at all.
const bindNoticeSrc = identitySrc.slice(identitySrc.indexOf('export function bindNotice'), identitySrc.indexOf('export const BOUND_LINE'));
const settingsNoticeSrc = identitySrc.slice(identitySrc.indexOf('export function settingsNotice'));
ok('🔴 bindNotice interpolates nothing, so it can leak nothing', !bindNoticeSrc.includes('${'));
ok('🔴 settingsNotice interpolates nothing either', !settingsNoticeSrc.includes('${'));

console.log('\n── the bind cookie is its own, not the sign in flow\'s ──');
const W = await import(pathToFileURL(path.join(root, 'lib/websession.ts')).href);
ok('the bind cookie has a name', typeof I.EMAIL_BIND_COOKIE === 'string' && I.EMAIL_BIND_COOKIE.length > 0);
ok('🔴 it is not the sign in pending cookie, so the flows cannot read each other', I.EMAIL_BIND_COOKIE !== W.PENDING_COOKIE);
ok('nor the session cookie', I.EMAIL_BIND_COOKIE !== W.SESSION_COOKIE);

// The carrier the address rides between the two steps: same signer as the session machinery, and
// it must round trip, expire and refuse tampering. Short life is the pending TTL, fifteen minutes.
{
  const minted = W.pendingCookieValue({ channel: 'email', value: 'dave@gmail.com' });
  ok('the pending carrier mints', minted.includes('.'));
  const back = W.verifyPendingCookie(minted);
  ok('and round trips the address', back !== null && back.channel === 'email' && back.value === 'dave@gmail.com');
  const late = new Date(Date.now() + (W.PENDING_TTL_SECONDS + 60) * 1000);
  ok('🔴 the carrier dies with the pending window', W.verifyPendingCookie(minted, late) === null);
  const bentAt = 3;
  const bent = minted.slice(0, bentAt) + (minted[bentAt] === 'A' ? 'B' : 'A') + minted.slice(bentAt + 1);
  ok('🔴 one flipped character is refused', W.verifyPendingCookie(bent) === null);
}

// The code the flow reuses is the signup's own, single use and short lived. Re-pinned here so the
// email bind cannot drift onto a second code shape without this suite noticing.
const C = await import(pathToFileURL(path.join(root, 'lib/signupcode.ts')).href);
ok('the code lives ten minutes, the existing auth code shape', C.CODE_TTL_SECONDS === 10 * 60);
{
  const now = new Date('2026-07-31T10:00:00Z');
  const row = { id: 'r1', code_hash: C.hashCode('dave@gmail.com', '123456'), attempts: 0, expires_at: C.expiresAt(now), consumed_at: null };
  ok('a live code verifies once', C.verifyStoredCode(row, 'dave@gmail.com', '123456', now) === 'ok');
  ok('🔴 a consumed code is spent, never ok again', C.verifyStoredCode({ ...row, consumed_at: now.toISOString() }, 'dave@gmail.com', '123456', now) === 'spent');
  ok('🔴 five attempts burn it', C.verifyStoredCode({ ...row, attempts: C.MAX_ATTEMPTS }, 'dave@gmail.com', '123456', now) === 'burnt');
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 2. THE OWNERSHIP AND BIND FUNCTIONS, ATTACKED AT RUNTIME.
//
// Extracted from lib/supabase.ts (which cannot be imported whole under bare node: it pulls in
// half the lib tree) and staged with a stub config and a recording fetch. The extraction slices
// each function from its export line to its first column zero close brace, so a reshuffle of the
// file moves the functions and the test follows them.
// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n── the takeover law, run rather than read ──');

const supa = read('lib/supabase.ts');
const extractFn = (name) => {
  const at = supa.indexOf(`export async function ${name}`);
  if (at < 0) return '';
  const end = supa.indexOf('\n}', at);
  return end < 0 ? '' : supa.slice(at, end + 2);
};
const fnOwner = extractFn('provedEmailOwner');
const fnBind = extractFn('bindProvedEmailToUser');
const fnLink = extractFn('setSignupUserId');
ok('provedEmailOwner was found in lib/supabase.ts', fnOwner.length > 0);
ok('bindProvedEmailToUser was found', fnBind.length > 0);
ok('setSignupUserId was found', fnLink.length > 0);

const stage = mkdtempSync(path.join(tmpdir(), 'youmail-'));
writeFileSync(path.join(stage, 'bind.ts'), [
  `function config(): { url: string; key: string } { return { url: 'https://unit.test', key: 'unit-key' }; }`,
  `function headers(extra: Record<string, string> = {}): Record<string, string> { return { apikey: 'unit-key', Authorization: 'Bearer unit-key', ...extra }; }`,
  `export type EmailOwner = 'another' | 'his' | 'nobody';`,
  `export type EmailBindOutcome = 'bound' | 'taken' | 'failed';`,
  fnLink, fnOwner, fnBind,
].join('\n\n'));
const B = await import(pathToFileURL(path.join(stage, 'bind.ts')).href);

const HIS = '9c1b2a3d-0000-4000-8000-00000000aaaa';
const ANOTHER = '9c1b2a3d-0000-4000-8000-00000000bbbb';
const realFetch = globalThis.fetch;
const calls = [];
const respond = (handler) => {
  calls.length = 0;
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: (opts.method || 'GET').toUpperCase(), body: opts.body });
    return handler(String(url), opts);
  };
};
const jsonRes = (rows, status = 200) => ({ ok: status < 300, status, json: async () => rows });

try {
  // 🔴 THE TENANCY ATTACK. The proved link belongs to another user id. The answer must be
  // 'another', which every caller treats as a refusal, and never 'his' or 'nobody'.
  respond(() => jsonRes([{ user_id: ANOTHER }]));
  ok('🔴 AN ADDRESS PROVED INTO ANOTHER ACCOUNT ANSWERS another', await B.provedEmailOwner(HIS, 'dave@gmail.com') === 'another');
  ok('and only rows with a proved link were even asked for', calls[0].url.includes('user_id=not.is.null'));

  respond(() => jsonRes([{ user_id: HIS }]));
  ok('his own proved link answers his', await B.provedEmailOwner(HIS, 'dave@gmail.com') === 'his');

  respond(() => jsonRes([]));
  ok('an unproved address answers nobody', await B.provedEmailOwner(HIS, 'dave@gmail.com') === 'nobody');

  // 🔴 FAILS CLOSED. A wobble is not a clean sheet on the one check that keeps another man's
  // address off this account.
  respond(() => jsonRes([], 500));
  ok('🔴 A FAILED READ IS null, NEVER nobody', await B.provedEmailOwner(HIS, 'dave@gmail.com') === null);
  respond(() => { throw new Error('down'); });
  ok('a thrown read is null too', await B.provedEmailOwner(HIS, 'dave@gmail.com') === null);

  // THE BIND. A PUT on the auth user the session proved, then the link write that can only touch
  // unowned rows, then the confirm read.
  respond((url, opts) => {
    if (url.includes('/auth/v1/admin/users/')) return jsonRes({}, 200);
    if ((opts.method || 'GET') === 'PATCH') return jsonRes([], 204);
    if (url.includes('/rest/v1/signups?email=') && (opts.method || 'GET') === 'GET') return jsonRes([{ id: 's1' }]);
    return jsonRes([], 200);
  });
  ok('a clean bind answers bound', await B.bindProvedEmailToUser(HIS, 'dave@gmail.com') === 'bound');
  const auth = calls.find((c) => c.url.includes('/auth/v1/admin/users/'));
  ok('🔴 THE AUTH WRITE IS A PUT ON THE SESSION\'S OWN USER, so binding can never mint an account',
    auth !== undefined && auth.method === 'PUT' && auth.url.endsWith(`/auth/v1/admin/users/${HIS}`));
  const link = calls.find((c) => c.method === 'PATCH');
  ok('🔴 THE LINK WRITE TOUCHES ONLY ROWS WITH NO OWNER: user_id=is.null is in the query itself',
    link !== undefined && link.url.includes('user_id=is.null'));

  // GoTrue refusing a duplicate address is the second half of never moved, and the refusal must
  // stop everything: no link write after a taken.
  respond((url) => (url.includes('/auth/v1/admin/users/') ? jsonRes({}, 422) : jsonRes([])));
  ok('🔴 A DUPLICATE ADDRESS IN THE AUTH STORE IS taken', await B.bindProvedEmailToUser(HIS, 'dave@gmail.com') === 'taken');
  ok('and nothing was written after the refusal', calls.length === 1);
  respond((url) => (url.includes('/auth/v1/admin/users/') ? jsonRes({}, 409) : jsonRes([])));
  ok('409 reads as taken too', await B.bindProvedEmailToUser(HIS, 'dave@gmail.com') === 'taken');

  respond(() => { throw new Error('down'); });
  ok('an unreachable auth store is failed, never bound', await B.bindProvedEmailToUser(HIS, 'dave@gmail.com') === 'failed');
} finally {
  globalThis.fetch = realFetch;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 3. THE TWO ROUTES, PINNED AT THE SOURCE. Order of operations is the security here, and order
// is a property of the file.
// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n── /api/you/email/start: the send ──');
const start = codeOnly(read('app/api/you/email/start/route.ts'));

ok('🔴 THE SEND RUNS ONLY FOR A SESSION: sessionUser is checked before the form is even read',
  before(start, 'sessionUser(req)', 'formData()') && start.includes('if (!user) return'));
ok('a stranger is sent to the door, not given an error to probe', start.includes("'/in?next=/app/you'"));
ok('🔴 rate limited per ACCOUNT', start.includes('bem:u:${user.id}'));
ok('🔴 AND per target address', start.includes('bem:t:${hash}'));
ok('and per caller address', start.includes('bem:ip:'));
ok('through the shared atomic counter, not a local map', start.includes('rateLimitedShared('));
ok('the daily ceiling fails closed through spendCapReached', start.includes('spendCapReached('));
ok('🔴 normaliseEmail runs before the address is compared to anything', before(start, 'normaliseEmail(email)', 'targetHash('));
ok('the rate key is the NORMALISED address, so plus tags buy nothing', start.includes('targetHash(emailNorm'));
ok('🔴 WHOSE IS THE ADDRESS is asked before anything is sent', before(start, 'provedEmailOwner(', 'createSignupCode('));
ok('🔴 another man\'s address is refused with the fixed sentence', start.includes("owner === 'another'") && start.includes("'taken'"));
ok('🔴 an unreadable owner refuses: fail closed on ownership', start.includes("owner === null) return back(req, 'unavailable')"));
ok('an account that already has an email is refused before the send', before(start, 'identity.email', 'createSignupCode('));
ok('the code row is written before the email goes out', before(start, 'createSignupCode(', 'sendSignupCodeEmail('));
ok('🔴 ONE SENDER: the code goes through sendSignupCodeEmail and nothing else', start.includes('sendSignupCodeEmail(') && !/resend/i.test(start) && !start.includes('nodemailer'));
ok('the code machinery is the signup\'s own', start.includes('newCode()') && start.includes('hashCode(') && start.includes('expiresAt()'));
ok('🔴 the address rides the signed cookie, never the URL', start.includes('EMAIL_BIND_COOKIE') && start.includes('pendingCookieValue(') && !start.includes('${email}'));
ok('the audit rows carry the keyed hash, never the address', /logAuthSend\('email', hash/.test(start) && !/logAuthSend\('email', email/.test(start));
ok('🔴 nothing here mints an account', !start.includes('createConfirmedAuthUser') && !start.includes('ensureUserRow') && !start.includes('grantTrial') && !start.includes('createWebSession'));
ok('the account comes from the session and nowhere else: the form yields only the address', !start.includes("form.get('user") && !start.includes('searchParams'));

console.log('\n── /api/you/email/verify: the bind ──');
const verify = codeOnly(read('app/api/you/email/verify/route.ts'));

ok('🔴 the bind too runs only for a session', before(verify, 'sessionUser(req)', 'formData()') && verify.includes('if (!user) return'));
ok('🔴 THE ADDRESS COMES FROM THE SIGNED COOKIE, never the form', verify.includes('verifyPendingCookie(') && !verify.includes("form.get('email')"));
ok('the form yields only the code', verify.includes("form.get('code'") && !verify.includes("form.get('user"));
ok('rate limited per account', verify.includes('bemv:u:${user.id}'));
ok('and per target address', verify.includes('bemv:t:${hash}'));
ok('normaliseEmail runs before the code is looked up', before(verify, 'normaliseEmail(pending.value)', 'readLatestSignupCode('));
ok('🔴 THE ATTEMPT IS COUNTED BEFORE THE COMPARISON: no abandoned request is a free guess', before(verify, 'bumpSignupCodeAttempt(', 'verifyStoredCode('));
ok('🔴 THE CODE IS SPENT BEFORE THE BIND, conditionally, in the database', before(verify, 'consumeSignupCode(', 'bindProvedEmailToUser('));
ok('a code that did not consume answers spent, not bound', verify.includes("if (!spent) return back(req, 'spent')"));
ok('🔴 OWNERSHIP IS ASKED AGAIN AT THE WRITE, closing the race the send check cannot see', before(verify, 'consumeSignupCode(', 'provedEmailOwner(') && before(verify, 'provedEmailOwner(', 'bindProvedEmailToUser('));
ok('🔴 another man\'s address refuses at the write too', verify.includes("owner === 'another'") && verify.includes("'taken'"));
ok('🔴 and unreadable ownership refuses', verify.includes("owner === null) return back(req, 'unavailable')"));
ok('an account that grew an email mid flow is refused', before(verify, 'identity.email', 'readLatestSignupCode('));
ok('🔴 NOTHING HERE MINTS AN ACCOUNT, A TRIAL OR A SESSION', ['createConfirmedAuthUser', 'ensureUserRow', 'grantTrial', 'createWebSession', 'reconcileSignupToUser', 'findAuthUserIdForEmail'].every((s) => !verify.includes(s)));
ok('the spent cookie is cleared on success', verify.includes('sessionCookieAttributes(0)'));
ok('the shape gate runs before the hash', before(verify, 'isCodeShape(', 'readLatestSignupCode('));

console.log('\n── /api/you/settings: the switches ──');
const settings = codeOnly(read('app/api/you/settings/route.ts'));
ok('the switches run only for a session', before(settings, 'sessionUser(req)', 'formData()'));
ok('burst limited per user', settings.includes('userBurst('));
ok('🔴 only the two switches this page owns can be written', settings.includes("which !== 'daily_nudges' && which !== 'weekly_summary'"));
ok('🔴 the untouched switch is read before the write, and an unreadable read refuses', before(settings, 'readNudgePrefs(', 'setNudgePrefs(') && settings.includes("current === null) return back(req, 'unavailable')"));
ok('a form posts strings, so the value is compared to the literal on', settings.includes("=== 'on'"));
ok('the account comes from the session: prefs are read and written for user.id only', settings.includes('readNudgePrefs(user.id)') && settings.includes('setNudgePrefs(user.id'));
ok('a refresh cannot flip the switch again: the answer is a 303', settings.includes('303'));

// Every route in the flow has its row in the gate table, and every row is 'always': a locked out
// man must still control his own contact points, per READ ONLY NEVER DARK.
const G = await import(pathToFileURL(path.join(root, 'lib/gate.ts')).href);
ok('🔴 email/start is gated always: identity is never behind the paywall', G.ruleFor('app/api/you/email/start') === 'always');
ok('🔴 email/verify is gated always', G.ruleFor('app/api/you/email/verify') === 'always');
ok('🔴 settings is gated always: an opt out may never cost money', G.ruleFor('app/api/you/settings') === 'always');

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 4. THE THREE SCREENS. Server rendered, session resolved, and the overview shows no money.
// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n── the screens ──');
const pageYou = read('app/app/you/page.tsx');
const pageCirc = read('app/app/you/circumstances/page.tsx');
const pageSet = read('app/app/you/settings/page.tsx');

for (const [name, src, route] of [
  ['/app/you', pageYou, '/app/you'],
  ['/app/you/circumstances', pageCirc, '/app/you/circumstances'],
  ['/app/you/settings', pageSet, '/app/you/settings'],
]) {
  ok(`${name} resolves the user from the session`, src.includes('userFromSessionCookie'));
  ok(`${name} sends a stranger to the door`, src.includes("redirect('/in')"));
  ok(`${name} carries the shell and names itself`, src.includes(`<AppNav current="${route}"`));
  ok(`${name} ships no client script`, !src.includes("'use client'"));
}

ok('🔴 NOT ONE MONEY FIGURE ON THE OVERVIEW: no ledger, no formatter, no money import',
  !pageYou.includes('gbp0') && !pageYou.includes('ledgerFor') && !pageYou.includes("lib/money"));
ok('🔴 the email is printed through the mask, and the raw address is never interpolated',
  pageYou.includes('maskEmail(') && !pageYou.includes('{identity.email}'));
ok('the add form posts to the start route', pageYou.includes('action="/api/you/email/start"'));
ok('the code form posts to the verify route', pageYou.includes('action="/api/you/email/verify"'));
ok('the code input invites the one time code', pageYou.includes('one-time-code'));
ok('the whatsapp line shows the last four digits only', pageYou.includes('.slice(-4)'));

ok('circumstances posts every answer to the one logging route', pageCirc.includes('action="/api/circumstances"'));
ok('and lands back on itself with the token, never a posted path', pageCirc.includes('name="back" value="you"'));
ok('the partitions come from lib/circumstances, not a local list', pageCirc.includes('household()') && pageCirc.includes('notHousehold()') && pageCirc.includes('mtdQuestions()'));
ok('the counts come from progressIn, whose denominator is his', pageCirc.includes('progressIn('));
ok('open questions come from the gates, unanswered and unansweredMtd', pageCirc.includes('unanswered(rows)') && pageCirc.includes('unansweredMtd(rows)'));
ok('🔴 the Article 9 path is not drawn: no sensitive(), no consent ask', !codeOnly(pageCirc).includes('sensitive(') && !codeOnly(pageCirc).includes('CONSENT_ASK'));
ok('a failed read is said plainly, never a blank slate', pageCirc.includes('rows === null'));

ok('settings posts to its own route', pageSet.includes('action="/api/you/settings"'));
ok('each switch posts which and to', pageSet.includes('name="which"') && pageSet.includes('name="to"'));
ok('the state shown is the state read', pageSet.includes('readNudgePrefs('));
ok('a failed read draws no switches rather than a guess', pageSet.includes('prefs === null'));

// The nav's promise: the You section lists exactly the doors the brief names, and each one is a
// real page (test/appnav.test.mjs holds the resolving half).
const nav = read('app/app/AppNav.tsx');
const navBlock = nav.slice(nav.indexOf('export const SECTIONS'), nav.indexOf('export function AppNav'));
for (const href of ['/app/you', '/app/you/circumstances', '/app/connect', '/account', '/app/you/settings']) {
  ok(`the nav knows ${href}`, navBlock.includes(`'${href}'`));
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

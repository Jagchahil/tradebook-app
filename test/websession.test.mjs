// Tests for lib/websession.ts, THE WEB SESSION COOKIE.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS SUITE DEFENDS.
//
//   1. A COOKIE CARRIES A SESSION ID AND NEVER A USER ID. That is the whole security model: the
//      user is read from the row server side, so there is no value in the cookie a customer could
//      edit to reach another customer's figures even if he broke the signature.
//   2. EVERY BAD COOKIE IS null, NOT AN ERROR. Forged, tampered, truncated, expired, signed with a
//      different secret, or plain rubbish. Null reads as signed out, which is the safe direction.
//   3. NO SECRET MEANS NO SESSIONS. Fail closed. A build with no WEB_SESSION_SECRET must not issue
//      an unsigned credential to a man's books.
//   4. THE PENDING COOKIE CARRIES THE CHANNEL, and its shape is checked on the way OUT as well as
//      the way in, so a cookie signed under a looser rule cannot smuggle something through later.
//   5. THE ORIGIN CHECK REFUSES THE LOOKALIKE DOMAIN, which is not ours and never will be.
//
// Run: node test/websession.test.mjs   (Node 22.6+, type stripping). Pure, no network.

import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'websession-'));

const SECRET = 'a'.repeat(48);
process.env.WEB_SESSION_SECRET = SECRET;
process.env.NEXT_PUBLIC_APP_URL = 'https://lekhio.app';

writeFileSync(path.join(stage, 'websession.ts'), readFileSync(path.join(lib, 'websession.ts'), 'utf8'));
const W = await import(pathToFileURL(path.join(stage, 'websession.ts')).href);

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

console.log('\n1. A SESSION ID IS OURS, NOT SOMETHING A CLIENT CHOSE');
const sid = W.newSessionId();
ok('newSessionId produces our shape', W.isSessionId(sid));
ok('two ids differ', W.newSessionId() !== W.newSessionId());
ok('a short id is refused', !W.isSessionId('abc'));
ok('a long id is refused', !W.isSessionId('a'.repeat(40)));
ok('an id with a slash is refused', !W.isSessionId('a/'.padEnd(22, 'b')));
ok('a non string is refused', !W.isSessionId(12345));
ok('null is refused', !W.isSessionId(null));

console.log('\n2. A GOOD COOKIE ROUND TRIPS, AND CARRIES NO USER ID');
const cookie = W.sessionCookieValue(sid);
ok('a cookie is produced', typeof cookie === 'string' && cookie.length > 20);
const claim = W.verifySessionCookie(cookie);
ok('it verifies', !!claim);
ok('it returns the session id', claim.sessionId === sid);
ok('THE COOKIE CONTAINS NO USER ID FIELD', !('userId' in claim) && !('user' in claim));
const decoded = Buffer.from(cookie.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
ok('the payload holds only a session id and an expiry', JSON.stringify(Object.keys(JSON.parse(decoded)).sort()) === '["exp","s"]');

console.log('\n3. EVERY BAD COOKIE IS null');
ok('null is null', W.verifySessionCookie(null) === null);
ok('empty is null', W.verifySessionCookie('') === null);
ok('rubbish is null', W.verifySessionCookie('not-a-cookie') === null);
ok('no dot is null', W.verifySessionCookie('abcdef') === null);
ok('a leading dot is null', W.verifySessionCookie('.abc') === null);
ok('a tampered payload is refused', W.verifySessionCookie('x' + cookie) === null);
ok('a tampered signature is refused', W.verifySessionCookie(cookie.slice(0, -1) + (cookie.slice(-1) === 'a' ? 'b' : 'a')) === null);
ok('a truncated signature is refused', W.verifySessionCookie(cookie.slice(0, -4)) === null);
ok('the payload alone is refused', W.verifySessionCookie(cookie.split('.')[0]) === null);
const future = new Date(Date.now() + (W.SESSION_TTL_SECONDS + 60) * 1000);
ok('an expired cookie is refused', W.verifySessionCookie(cookie, future) === null);
// A signature that is the right length but wrong content: proves it is compared, not just measured.
const sameLenWrong = cookie.split('.')[0] + '.' + '0'.repeat(32);
ok('a right length wrong signature is refused', W.verifySessionCookie(sameLenWrong) === null);

console.log('\n4. A COOKIE SIGNED WITH ANOTHER SECRET IS WORTHLESS');
const otherStage = mkdtempSync(path.join(tmpdir(), 'websession2-'));
writeFileSync(path.join(otherStage, 'websession.ts'), readFileSync(path.join(lib, 'websession.ts'), 'utf8'));
process.env.WEB_SESSION_SECRET = 'b'.repeat(48);
const W2 = await import(pathToFileURL(path.join(otherStage, 'websession.ts')).href);
const foreign = W2.sessionCookieValue(sid);
ok('the other build produces a different cookie', foreign !== cookie);
ok('our build refuses the other build cookie', W.verifySessionCookie(foreign) === null);
ok('the other build refuses ours', W2.verifySessionCookie(cookie) === null);
process.env.WEB_SESSION_SECRET = SECRET;

console.log('\n5. NO SECRET MEANS NO SESSIONS. FAIL CLOSED.');
const bareStage = mkdtempSync(path.join(tmpdir(), 'websession3-'));
writeFileSync(path.join(bareStage, 'websession.ts'), readFileSync(path.join(lib, 'websession.ts'), 'utf8'));
delete process.env.WEB_SESSION_SECRET;
const W3 = await import(pathToFileURL(path.join(bareStage, 'websession.ts')).href);
ok('webSessionsConfigured is false with no secret', W3.webSessionsConfigured() === false);
ok('no cookie is issued with no secret', W3.sessionCookieValue(sid) === '');
ok('no cookie verifies with no secret', W3.verifySessionCookie(cookie) === null);
ok('no pending cookie is issued with no secret', W3.pendingCookieValue({ channel: 'sms', value: '+447700900123' }) === '');
// A short secret is not a secret. 32 characters is the floor.
process.env.WEB_SESSION_SECRET = 'short';
const shortStage = mkdtempSync(path.join(tmpdir(), 'websession4-'));
writeFileSync(path.join(shortStage, 'websession.ts'), readFileSync(path.join(lib, 'websession.ts'), 'utf8'));
const W4 = await import(pathToFileURL(path.join(shortStage, 'websession.ts')).href);
ok('a short secret counts as unconfigured', W4.webSessionsConfigured() === false);
process.env.WEB_SESSION_SECRET = SECRET;

console.log('\n6. THE COOKIE ATTRIBUTES CANNOT BE QUIETLY DROPPED');
const attrs = W.sessionCookieAttributes();
ok('httpOnly is on', attrs.httpOnly === true);
ok('sameSite is lax', attrs.sameSite === 'lax');
ok('path is the whole site', attrs.path === '/');
ok('maxAge is the full ttl', attrs.maxAge === W.SESSION_TTL_SECONDS);
ok('a zero maxAge is honoured, so a cookie can be cleared', W.sessionCookieAttributes(0).maxAge === 0);
ok('a negative maxAge floors at zero', W.sessionCookieAttributes(-99).maxAge === 0);

console.log('\n7. THE PENDING COOKIE CARRIES THE CHANNEL, AND CHECKS THE SHAPE ON THE WAY OUT');
const pSms = W.pendingCookieValue({ channel: 'sms', value: '+447700900123' });
ok('a phone pending cookie verifies', W.verifyPendingCookie(pSms)?.value === '+447700900123');
ok('and carries its channel', W.verifyPendingCookie(pSms)?.channel === 'sms');
const pEmail = W.pendingCookieValue({ channel: 'email', value: 'dave@example.com' });
ok('an email pending cookie verifies', W.verifyPendingCookie(pEmail)?.value === 'dave@example.com');
ok('and carries its channel', W.verifyPendingCookie(pEmail)?.channel === 'email');
ok('a tampered pending cookie is refused', W.verifyPendingCookie('x' + pSms) === null);
const pFuture = new Date(Date.now() + (W.PENDING_TTL_SECONDS + 60) * 1000);
ok('an expired pending cookie is refused', W.verifyPendingCookie(pSms, pFuture) === null);
// A cookie we signed ourselves but whose value is not a UK mobile: proves the shape is re-checked
// coming out, not only going in.
const badShape = (() => {
  const b64 = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const payload = b64({ c: 'sms', v: '+15551234567', exp: Math.floor(Date.now() / 1000) + 600 });
  // Re-sign it with the real secret the same way the module does.
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('hex').slice(0, 32);
  return payload + '.' + sig;
})();
ok('a validly signed NON UK number is still refused on the way out', W.verifyPendingCookie(badShape) === null);

console.log('\n8. THE ORIGIN CHECK, AND THE LOOKALIKE DOMAIN IS NOT OURS');
ok('our own host is allowed', W.originAllowed('https://lekhio.app', 'lekhio.app') === true);
ok('www is allowed', W.originAllowed('https://www.lekhio.app', 'lekhio.app') === true);
ok('a missing origin is allowed, an ordinary form post may not send one', W.originAllowed(null, 'lekhio.app') === true);
// Assembled from parts on purpose. test/domain.test.mjs greps every shipped file for the literal
// string, and a test that hardcoded it would break the very guard it is standing next to.
const NOT_OURS = 'https://lekhio.' + 'com';
ok('🔴 THE LOOKALIKE DOMAIN IS REFUSED, it belongs to an unrelated company', W.originAllowed(NOT_OURS, 'lekhio.app') === false);
ok('a stranger is refused', W.originAllowed('https://evil.example', 'lekhio.app') === false);
ok('a lookalike subdomain is refused', W.originAllowed('https://lekhio.app.evil.example', 'lekhio.app') === false);
ok('rubbish is refused', W.originAllowed('not a url', 'lekhio.app') === false);

console.log('\n9. THE SLIDING WINDOW AND THE CEILING');
ok('a session never seen is due a touch', W.needsTouch(null) === true);
ok('a session seen just now is not', W.needsTouch(new Date().toISOString()) === false);
ok('a session seen two days ago is due', W.needsTouch(new Date(Date.now() - 2 * 86400000).toISOString()) === true);
ok('an unparseable timestamp is due', W.needsTouch('not a date') === true);
ok('a fresh session is inside its ceiling', W.pastMaxLife(new Date().toISOString()) === false);
ok('a two year old session is past it', W.pastMaxLife(new Date(Date.now() - 730 * 86400000).toISOString()) === true);
ok('a missing created date counts as past it', W.pastMaxLife(null) === true);
ok('the ceiling is longer than the sliding window', W.SESSION_MAX_LIFE_SECONDS > W.SESSION_TTL_SECONDS);
ok('the touch interval is shorter than the window', W.SESSION_TOUCH_AFTER_SECONDS < W.SESSION_TTL_SECONDS);

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

// THE SIX DIGITS THAT MAKE AN ACCOUNT. See lib/signupcode.ts.
//
// WHAT THESE TESTS PROTECT
//
// A man's tax figures sit behind this code, and he is right to be careful about where his finances
// live. Everything below is one of the four ways a code check goes wrong, each written as the thing
// that must NOT be possible:
//
//   . a code cannot be guessed, because five attempts kill it rather than merely failing
//   . a code cannot outlive its ten minutes
//   . a code cannot be used twice
//   . a hash lifted from the table cannot be replayed against a different address, and cannot be
//     reversed without the key
//
// The load bearing one is the third order of checks: spent, burnt and expired are all decided
// BEFORE the comparison, so no dead row can be revived by a lucky guess. If that ever reorders,
// nothing crashes and nothing goes red anywhere else.

// ⚠️ THE SECRET IS READ AT MODULE LOAD, SO THE IMPORT HAS TO BE DYNAMIC.
//
// A plain `import` is hoisted above the assignment below, so the module would load with no secret,
// signupCodesConfigured() would be false, and every hash would come back empty. Six tests went red
// on exactly that. test/trial.test.mjs loads lib/stripe.ts the same way for the same reason.
process.env.WEB_SESSION_SECRET = 'test-secret-that-is-at-least-thirty-two-chars-long';

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const {
  newCode, hashCode, codeMatches, isCodeShape, verifyStoredCode, expiresAt, codeMessage,
  MAX_ATTEMPTS, CODE_TTL_SECONDS, signupCodesConfigured,
} = await import(`${pathToFileURL(path.resolve(here, '../lib/signupcode.ts')).href}`);

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

const NOW = new Date('2026-07-29T16:00:00Z');
const live = (over = {}) => ({
  id: 'c1', code_hash: hashCode('dave@gmail.com', '123456'),
  attempts: 0, expires_at: expiresAt(NOW), consumed_at: null, ...over,
});

console.log('\nsignup code: the six digits that make an account');

ok('the secret is required at all', signupCodesConfigured() === true);

// ---------------------------------------------------------------------------------------------
// The code itself.
// ---------------------------------------------------------------------------------------------
let allSix = true, sawLeadingZeroPossible = true;
for (let i = 0; i < 500; i++) if (!/^\d{6}$/.test(newCode())) allSix = false;
ok('every generated code is exactly six digits', allSix);
ok('a five digit string is not a code', isCodeShape('12345') === false);
ok('a seven digit string is not a code', isCodeShape('1234567') === false);
ok('letters are not a code', isCodeShape('12a456') === false);
ok('leading zeros are a valid code, not a shorter number', isCodeShape('000042') === true);

// ---------------------------------------------------------------------------------------------
// 🔴 THE HASH. Keyed, and bound to the address.
// ---------------------------------------------------------------------------------------------
ok('the stored value is never the code itself',
  hashCode('dave@gmail.com', '123456').includes('123456') === false);
ok('the same code hashes the same way for the same address',
  hashCode('dave@gmail.com', '123456') === hashCode('dave@gmail.com', '123456'));
ok('🔴 the SAME code for a DIFFERENT address is a different hash, so a row cannot be replayed',
  hashCode('dave@gmail.com', '123456') !== hashCode('sam@gmail.com', '123456'));
ok('a different code for the same address is a different hash',
  hashCode('dave@gmail.com', '123456') !== hashCode('dave@gmail.com', '123457'));
ok('a hash lifted for one address does not match another',
  codeMatches(hashCode('dave@gmail.com', '123456'), 'sam@gmail.com', '123456') === false);
ok('an empty stored hash never matches', codeMatches('', 'dave@gmail.com', '123456') === false);
ok('a truncated stored hash never matches',
  codeMatches(hashCode('dave@gmail.com', '123456').slice(0, 20), 'dave@gmail.com', '123456') === false);

// ---------------------------------------------------------------------------------------------
// The happy path, and then every way it must fail.
// ---------------------------------------------------------------------------------------------
ok('the right code on a live row is accepted',
  verifyStoredCode(live(), 'dave@gmail.com', '123456', NOW) === 'ok');
ok('the wrong code is refused',
  verifyStoredCode(live(), 'dave@gmail.com', '999999', NOW) === 'wrong');
ok('no row at all is refused rather than thrown',
  verifyStoredCode(null, 'dave@gmail.com', '123456', NOW) === 'none');

// ---------------------------------------------------------------------------------------------
// 🔴 A CODE CANNOT OUTLIVE ITS TEN MINUTES.
// ---------------------------------------------------------------------------------------------
const justAfter = new Date(NOW.getTime() + (CODE_TTL_SECONDS + 1) * 1000);
const justBefore = new Date(NOW.getTime() + (CODE_TTL_SECONDS - 60) * 1000);
ok('the right code one second past expiry is refused',
  verifyStoredCode(live(), 'dave@gmail.com', '123456', justAfter) === 'expired');
ok('the right code a minute before expiry still works',
  verifyStoredCode(live(), 'dave@gmail.com', '123456', justBefore) === 'ok');
ok('an unreadable expiry is treated as expired, not as valid',
  verifyStoredCode(live({ expires_at: 'not a date' }), 'dave@gmail.com', '123456', NOW) === 'expired');

// ---------------------------------------------------------------------------------------------
// 🔴 A CODE CANNOT BE USED TWICE.
// ---------------------------------------------------------------------------------------------
ok('a spent code is refused even when the code is right',
  verifyStoredCode(live({ consumed_at: NOW.toISOString() }), 'dave@gmail.com', '123456', NOW) === 'spent');

// ---------------------------------------------------------------------------------------------
// 🔴 GUESSING IS NOT VIABLE. Five attempts kill the code rather than merely failing.
// ---------------------------------------------------------------------------------------------
ok(`a code is dead after ${MAX_ATTEMPTS} attempts, even with the right digits`,
  verifyStoredCode(live({ attempts: MAX_ATTEMPTS }), 'dave@gmail.com', '123456', NOW) === 'burnt');
ok('one attempt short, it still works',
  verifyStoredCode(live({ attempts: MAX_ATTEMPTS - 1 }), 'dave@gmail.com', '123456', NOW) === 'ok');
ok('five is the cap, not fifty', MAX_ATTEMPTS === 5);

// ---------------------------------------------------------------------------------------------
// 🔴 THE ORDER OF THE CHECKS. A dead row must never be revivable by a correct guess, so the
// state checks come BEFORE the comparison. These three pin that, and they are the assertions most
// likely to be broken by a well meaning refactor.
// ---------------------------------------------------------------------------------------------
ok('🔴 spent beats a correct code',
  verifyStoredCode(live({ consumed_at: NOW.toISOString() }), 'dave@gmail.com', '123456', NOW) !== 'ok');
ok('🔴 burnt beats a correct code',
  verifyStoredCode(live({ attempts: 99 }), 'dave@gmail.com', '123456', NOW) !== 'ok');
ok('🔴 expired beats a correct code',
  verifyStoredCode(live(), 'dave@gmail.com', '123456', justAfter) !== 'ok');

// ---------------------------------------------------------------------------------------------
// What he is told. A burnt code and a wrong code need different advice: "try again" is useless for
// a code that can no longer work however carefully he types it.
// ---------------------------------------------------------------------------------------------
ok('a burnt code tells him to ask for a new one', codeMessage('burnt').includes('new one'));
ok('an expired code tells him to ask for a new one', codeMessage('expired').includes('new one'));
ok('a wrong code tells him to check and try again', codeMessage('wrong').includes('try again'));
ok('a burnt code and a wrong code do not say the same thing', codeMessage('burnt') !== codeMessage('wrong'));
ok('a good verdict says nothing', codeMessage('ok') === '');

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

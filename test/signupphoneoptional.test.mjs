// 🔴 THE SIGNUP MOBILE IS OPTIONAL, AND THE FRONT DOOR SAYS WHAT IT DOES. 10 August 2026.
//
// The /start step one screen asked for a mobile AND an email, and refused to continue without both,
// while the copy directly under the field said the number was "only used to link WhatsApp when you
// are ready". Both cannot be true. It was proved that the number is not load bearing: the account
// is minted from the proved EMAIL alone (/api/signup/code takes only an email, the web session is
// the email, and reconcileSignupToUser resolves a web account by its verified email, never by the
// typed number), and WhatsApp binds a FRESH number from the handset itself, so the typed number
// only ever lands on signups.phone and no reader that signs a man in or runs his books depends on
// it. So the door asks for the email and offers the mobile, and this holds it that way.
//
// ⚠️ MIGRATION FREE, ON PURPOSE. signups.phone is NOT NULL, and it stays that way. An absent number
// is stored as an empty string (cleanPhone returns null, the route coerces to '', normalizeUkPhone
// leaves '' as ''), which satisfies the constraint, and every reader is guarded by `if (phone)`, so
// an empty string reads as absent everywhere. There is no schema change to run, and this test would
// go red if the route started writing a bare null into that column.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const codeOnly = (s) => s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  ok  ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name}`); }
};

const startPage = read('app/start/page.tsx');
const startCode = codeOnly(startPage);
const onboard = read('app/api/onboard/route.ts');
const onboardCode = codeOnly(onboard);

console.log('\nThe front door asks for the email and offers the mobile.\n');

// 1. THE GATE. Email is required; a phone is required only to be VALID if one is typed at all.
ok('🔴 step one continues on the email alone, the phone optional and only validated if typed',
  /if \(step === 1\) return emailValid && \(phone\.trim\(\)\.length === 0 \|\| phoneReady\);/.test(startCode));
ok('🔴 the old mandatory gate is gone: phone is no longer required to continue',
  !/if \(step === 1\) return phoneReady && emailValid;/.test(startCode));

// 2. THE COPY. The field says optional and the screen says the email is all that is needed. No
//    surface still tells him the number is "only used" later while also demanding it.
ok('the mobile field is labelled optional', /Mobile number \(optional\)/.test(startPage));
ok('the screen says the email is all we need to start', /all we need to start/i.test(startPage));

// 3. THE SERVER. /api/onboard no longer refuses a signup with no phone, and it coerces a missing or
//    malformed number to an empty string rather than a null, so signups.phone (NOT NULL) is safe.
ok('🔴 the onboard route no longer rejects a missing mobile',
  !/A valid mobile number is required/.test(onboard));
ok('🔴 a missing or malformed number becomes an empty string, never a null into a NOT NULL column',
  /const phone = cleanPhone\(b\.phone\) \?\? '';/.test(onboardCode));
ok('the email is still required: it is the account',
  /const email = cleanEmail\(b\.email\);/.test(onboardCode)
  && /A valid email is required/.test(onboard));

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

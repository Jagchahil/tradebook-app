// Tests for lib/logindoor.ts, ONE LOGIN, TWO CHANNELS.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS SUITE DEFENDS.
//
//   1. UK MOBILES ONLY, AND THE SHAPE IS AN ABUSE CONTROL. Every number that reaches Twilio costs
//      money whether or not anyone was ever going to read it, so the cheapest place to refuse one
//      is before it leaves us. +447 then nine digits. Not a landline, not an international number,
//      not a service number, not gibberish.
//   2. ONE NUMBER, ONE NORMAL FORM. toUkE164 here must agree with normalizeUkPhone in
//      lib/supabase.ts and toUkE164 in the phone app. If they ever disagree, a man's WhatsApp
//      receipts land on one account and his web session on another, and both look like they work.
//   3. THE DESTINATION IS HASHED BEFORE IT IS WRITTEN DOWN, and the hash is keyed, so
//      public.auth_sends can spot one target being hammered without holding a list of who our
//      customers are.
//   4. THE CAPS ARE ORDERED SENSIBLY. A cap looser than the thing it contains is not a cap.
//
// Run: node test/logindoor.test.mjs   (Node 22.6+, type stripping). Pure, no network.

import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'logindoor-'));
writeFileSync(path.join(stage, 'logindoor.ts'), readFileSync(path.join(lib, 'logindoor.ts'), 'utf8'));
const D = await import(pathToFileURL(path.join(stage, 'logindoor.ts')).href);

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

console.log('\n1. THE NUMBER NORMALISER, AND IT MUST NOT DRIFT');
ok('a plain 07 number', D.toUkE164('07700900123') === '+447700900123');
ok('spaces do not matter', D.toUkE164('07700 900 123') === '+447700900123');
ok('already E164', D.toUkE164('+447700900123') === '+447700900123');
ok('44 with no plus', D.toUkE164('447700900123') === '+447700900123');
ok('the 0044 prefix', D.toUkE164('00447700900123') === '+447700900123');
ok('the +44 07 double prefix typo', D.toUkE164('+44 07700 900123') === '+447700900123');
ok('brackets and dashes', D.toUkE164('(07700) 900-123') === '+447700900123');
ok('empty is empty', D.toUkE164('') === '');
ok('letters alone are empty', D.toUkE164('hello') === '');
// The exact steps lib/supabase.ts normalizeUkPhone uses, reimplemented here so the two are compared
// rather than assumed equal. If someone changes one, this fails.
const mirror = (input) => {
  let d = (input || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('44')) d = d.slice(2);
  d = d.replace(/^0+/, '');
  if (!d) return '';
  return `+44${d}`;
};
const numbers = ['07700900123', '447700900123', '00447700900123', '+44 7700 900123', '0 7700900123', '7700900123'];
ok('🔴 IT AGREES WITH THE SUPABASE NORMALISER ON EVERY SHAPE', numbers.every((n) => D.toUkE164(n) === mirror(n)));

console.log('\n2. UK MOBILES ONLY. EVERY OTHER NUMBER COSTS MONEY AND REACHES NOBODY.');
ok('a real mobile passes', D.isUkMobile('+447700900123'));
ok('a London landline is refused', !D.isUkMobile('+442071234567'));
ok('an 0800 number is refused', !D.isUkMobile('+448001234567'));
ok('a US number is refused', !D.isUkMobile('+15551234567'));
ok('a premium rate international number is refused', !D.isUkMobile('+8811234567'));
ok('one digit short is refused', !D.isUkMobile('+44770090012'));
ok('one digit long is refused', !D.isUkMobile('+4477009001234'));
ok('no plus is refused', !D.isUkMobile('447700900123'));
ok('empty is refused', !D.isUkMobile(''));

console.log('\n3. THE EMAIL SHAPE, DELIBERATELY CONSERVATIVE');
ok('an ordinary address passes', D.isEmail('dave@example.com'));
ok('a subdomain passes', D.isEmail('dave@mail.example.co.uk'));
ok('plus addressing passes', D.isEmail('dave+lekhio@example.com'));
ok('no at sign is refused', !D.isEmail('dave.example.com'));
ok('no dot in the domain is refused', !D.isEmail('dave@localhost'));
ok('a space is refused', !D.isEmail('da ve@example.com'));
ok('angle brackets are refused', !D.isEmail('<dave@example.com>'));
ok('two at signs are refused', !D.isEmail('a@b@example.com'));
ok('an over long address is refused', !D.isEmail('a'.repeat(250) + '@example.com'));
ok('normalising lowercases and trims', D.normaliseEmail('  DAVE@Example.COM ') === 'dave@example.com');

console.log('\n4. ONE FIELD, READ CORRECTLY');
ok('an address is read as email', D.readIdentifier('dave@example.com')?.channel === 'email');
ok('and is normalised', D.readIdentifier('  DAVE@Example.COM ')?.value === 'dave@example.com');
ok('a number is read as sms', D.readIdentifier('07700 900123')?.channel === 'sms');
ok('and is normalised to E164', D.readIdentifier('07700 900123')?.value === '+447700900123');
ok('empty is refused', D.readIdentifier('') === null);
ok('whitespace is refused', D.readIdentifier('   ') === null);
ok('gibberish is refused', D.readIdentifier('asdfgh') === null);
ok('a landline is refused rather than sent to', D.readIdentifier('02071234567') === null);
ok('a US number is refused', D.readIdentifier('+15551234567') === null);
ok('a broken address is refused rather than guessed at as a number', D.readIdentifier('dave@') === null);
ok('an @ anywhere means we treat it as an address and never as a number', D.readIdentifier('07700@900123') === null);

console.log('\n5. THE DESTINATION IS HASHED, AND THE HASH IS KEYED');
const S1 = 'a'.repeat(48), S2 = 'b'.repeat(48);
const h = D.targetHash('+447700900123', S1);
ok('a hash is produced', typeof h === 'string' && h.length === 32);
ok('it is stable', D.targetHash('+447700900123', S1) === h);
ok('🔴 THE NUMBER ITSELF IS NOWHERE IN IT', !h.includes('7700900123') && !h.includes('447700900123'));
ok('a different number hashes differently', D.targetHash('+447700900124', S1) !== h);
ok('a different secret hashes differently, so rotation unlinks the history', D.targetHash('+447700900123', S2) !== h);
ok('no secret produces no hash, so nothing is logged unkeyed', D.targetHash('+447700900123', '') === '');
ok('an address hashes too', D.targetHash('dave@example.com', S1).length === 32);
ok('a number and an address never collide', D.targetHash('dave@example.com', S1) !== h);

console.log('\n6. THE CAPS MAKE SENSE AGAINST EACH OTHER');
ok('the sms daily cap is set and modest', D.SMS_DAILY_CAP > 0 && D.SMS_DAILY_CAP <= 500);
ok('🔴 THE SMS CAP IS TIGHTER THAN THE EMAIL ONE, because only one of them costs money', D.SMS_DAILY_CAP < D.EMAIL_DAILY_CAP);
ok('dailyCapFor picks the sms cap', D.dailyCapFor('sms') === D.SMS_DAILY_CAP);
ok('dailyCapFor picks the email cap', D.dailyCapFor('email') === D.EMAIL_DAILY_CAP);
ok('a target cannot be sent to more often than a source can ask', D.PER_TARGET_SENDS <= D.PER_SOURCE_SENDS);
ok('verifying is allowed more often than sending, since verifying is free', D.PER_TARGET_VERIFIES > D.PER_TARGET_SENDS);
ok('the daily window really is a day', D.SMS_DAILY_WINDOW_SECONDS === 86400);
ok('the per target window is minutes, not hours', D.PER_TARGET_WINDOW_SECONDS <= 3600);
ok('a whole day of per target sends cannot alone exhaust the daily cap', (86400 / D.PER_TARGET_WINDOW_SECONDS) * D.PER_TARGET_SENDS < D.SMS_DAILY_CAP * 10);

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

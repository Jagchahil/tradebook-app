// Tests for lib/referral.ts, the deterministic referral invite loop. Pure, no
// network. Run with: node test/referral.test.mjs

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const R = await import(`${pathToFileURL(path.resolve(here, '../lib/referral.ts')).href}`);

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

console.log('\n=== referral: code generation ===\n');
const code = R.referralCode('user-abc-123');
ok('code is 6 characters', code.length === 6);
ok('code is deterministic', R.referralCode('user-abc-123') === code);
ok('different seeds give different codes', R.referralCode('user-abc-123') !== R.referralCode('user-xyz-999'));
ok('code uses the unambiguous alphabet only', /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(code));
ok('code never contains 0, O, 1 or I', !/[01OI]/.test(code));

console.log('\n=== referral: sanitize inbound ?ref= ===\n');
ok('a valid code round trips', R.sanitizeRefCode(code) === code);
ok('lowercase is upcased', R.sanitizeRefCode(code.toLowerCase()) === code);
ok('ambiguous or junk chars stripped, then length checked', R.sanitizeRefCode(`${code}!!`) === code);
ok('too short is rejected', R.sanitizeRefCode('ABC') === null);
ok('too long is rejected', R.sanitizeRefCode('ABCDEFGH') === null);
ok('empty is rejected', R.sanitizeRefCode('') === null);
ok('null is rejected', R.sanitizeRefCode(null) === null);
ok('all-ambiguous input collapses to null', R.sanitizeRefCode('0O1I0O') === null);

console.log('\n=== referral: the request matcher ===\n');
ok('"my invite link" matches', R.isReferRequest('can I get my invite link'));
ok('"refer a mate" matches', R.isReferRequest('how do I refer a mate'));
ok('"invite" matches', R.isReferRequest('invite'));
ok('"share lekhio" matches', R.isReferRequest('how do I share lekhio'));
ok('"referral" matches', R.isReferRequest('referral please'));
ok('"spread the word" matches', R.isReferRequest('happy to spread the word'));
ok('a receipt message does not match', !R.isReferRequest('spent 40 on diesel'));
ok('a totals question does not match', !R.isReferRequest('how much have I made this year'));

console.log('\n=== referral: the invite the user forwards ===\n');
const inv = R.referralInvite(code);
ok('invite carries the code', inv.code === code);
ok('link points at /start with the ref code', inv.link.includes(`/start?ref=${code}`));
ok('forward message contains the link', inv.forward.includes(inv.link));
ok('forward message is mate facing', /mate/i.test(inv.forward));
ok('reply makes clear the user sends it', /you send it/i.test(inv.reply) && /never message anyone/i.test(inv.reply));
ok('reply shows the code', inv.reply.includes(code));
ok('no forbidden dashes anywhere', !/[–—−]/.test(inv.forward + inv.reply + inv.link));

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

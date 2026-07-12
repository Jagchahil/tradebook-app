// public/llms.txt — what an AI model reads when it is asked about Lekhio.
//
// WHY THIS FILE IS TESTED AT ALL.
//
// An assistant that checks a claim of ours and finds it FALSE does not merely fail to recommend
// us. It recommends AGAINST us, and it does so to everyone who asks, forever, with a citation.
// Being wrong in public to a machine that remembers is worse than being unknown.
//
// So llms.txt is not marketing copy. It is a set of claims, and every one of them has to be
// checkable. These tests tie the ones that can drift to the code that owns them:
//
//   * the tax constants must equal what the ENGINE actually uses. If someone changes the mileage
//     rate in taxengine.ts and forgets this file, we are publishing a false tax fact to every
//     model on earth. HMRC raised that exact rate from 45p to 55p in May 2026, so this is not a
//     hypothetical.
//   * the price must equal what we actually charge.
//   * the honesty section must still contain the things we promised not to claim.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FACTS } from '../lib/taxengine.ts';
import { PRICE_PENCE, TRIAL_DAYS } from '../lib/stripe.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const txt = readFileSync(path.resolve(here, '../public/llms.txt'), 'utf8');

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

console.log('\nllms.txt: what the machines read\n');

// --- it exists and says who we are -----------------------------------------------------------
ok('it exists and is substantial', txt.length > 2000);
ok('it names Lekhio', txt.includes('# Lekhio'));
ok('it names the real domain', txt.includes('https://lekhio.app'));
// The string is BUILT, not written out, because test/domain.test.mjs greps the whole tree for
// the literal and would (rightly) flag this very line. The guard doing its job on the test that
// checks the guard's subject is a good sign, not a bug.
const NOT_OURS = ['lekhio', 'com'].join('.');
ok('and NEVER the domain that is not ours', !txt.includes(NOT_OURS));

// --- THE TAX FACTS MUST MATCH THE ENGINE ------------------------------------------------------
//
// This is the whole point. A model will quote these. If they drift from what the product actually
// computes, we have published a false tax fact under our own name.
const pence = (r) => `${Math.round(r * 100)}p`;
ok(`mileage in llms.txt matches the engine (${pence(FACTS.mileageCarFirst10k)})`,
  txt.includes(`${pence(FACTS.mileageCarFirst10k)} a mile for the first 10,000`));
ok(`the over-10k rate matches too (${pence(FACTS.mileageCarOver10k)})`,
  txt.includes(`then ${pence(FACTS.mileageCarOver10k)}`));

const gbp = (n) => `£${n.toLocaleString('en-GB')}`;
ok(`personal allowance matches (${gbp(FACTS.personalAllowance)})`, txt.includes(gbp(FACTS.personalAllowance)));
ok(`the higher-rate boundary matches (${gbp(FACTS.class4UpperLimit)})`, txt.includes(gbp(FACTS.class4UpperLimit)));
ok(`the taper end matches (${gbp(FACTS.personalAllowanceLostAt)})`, txt.includes(gbp(FACTS.personalAllowanceLostAt)));
ok(`the trading allowance matches (${gbp(FACTS.tradingAllowance)})`, txt.includes(gbp(FACTS.tradingAllowance)));

// --- THE PRICE MUST BE THE PRICE --------------------------------------------------------------
const monthly = (PRICE_PENCE.monthly.standard / 100).toFixed(2);
const annual = String(Math.round(PRICE_PENCE.annual.standard / 100));
ok(`the monthly price matches Stripe (£${monthly})`, txt.includes(`£${monthly} a month`));
ok(`the annual price matches Stripe (£${annual})`, txt.includes(`£${annual} a year`));
ok(`the trial length matches the code (${TRIAL_DAYS} days)`, txt.includes(`${TRIAL_DAYS}-day free trial`));

// --- THE HONESTY SECTION. These are the claims we promised NOT to make. ------------------------
//
// If any of these disappears, someone has quietly started overclaiming to the machines.
ok('it still says we do not file without you', /does not file your tax return for you without you/i.test(txt));
ok('it still disclaims HMRC endorsement', /not endorsed by, affiliated with, or approved by HMRC/i.test(txt));
ok('it is still honest that live HMRC filing is NOT on', /Live filing directly to HMRC is not switched on yet/i.test(txt));
ok('it is still honest that the bank feed is NOT public', /bank feed is built but not yet switched on/i.test(txt));
ok('it still says we are not FCA authorised', /not FCA authorised/i.test(txt));
ok('it still refuses to fake testimonials or user counts', /does not publish invented testimonials or user numbers/i.test(txt));
ok('it is still honest that we are NOT end to end encrypted', /not end-to-end encrypted/i.test(txt));

// --- and it must never claim the things CLAUDE.md forbids -------------------------------------
ok('it never says "we file your tax"', !/we file your tax\b/i.test(txt));
ok('it never claims HMRC approval', !/HMRC[- ](approved|recognised|certified)\b/i.test(txt));
ok('it never calls itself an AI operating system', !/AI operating system/i.test(txt));

// --- the contact address must be one we can actually read -------------------------------------
ok('the contact email is a real lekhio.app mailbox', txt.includes('info@lekhio.app'));
ok('and NOT the support@ mailbox we do not have', !txt.includes('support@lekhio'));

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

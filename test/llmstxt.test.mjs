// public/llms.txt, what an AI model reads when it is asked about Lekhio.
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

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FACTS } from '../lib/taxengine.ts';
import { PRICE_PENCE, TRIAL_DAYS } from '../lib/stripe.ts';

// THE ROUTE, NOT A STATIC FILE.
//
// This test used to read `public/llms.txt`. THAT FILE WAS NEVER SERVED: app/llms.txt/route.ts
// already existed, and in Next a route wins over a static file at the same path. So the tests were
// green against a document no machine would ever read, while the live /llms.txt carried none of
// the honesty section and none of the tax numbers.
//
// A test that passes against the wrong artefact is worse than no test: it is a green light on a
// road that is not there. Now it asserts on the SAME string the route actually returns.
//
// Staged and rewritten because the route imports its siblings extensionless and Node's ESM cannot
// resolve those. Same trick as test/taxoptimiser.test.mjs.
const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'llms-'));
// ⚠️ A GLOBAL PATTERN, NOT THREE FIXED STRINGS. The route grew a lib/money import on 4 August and
// this staging did not know, so the suite died on a module resolution error rather than on
// anything about llms.txt. Rewriting EVERY ../../lib/ specifier means the next one is free, and
// the file list below is the only thing left to keep in step.
const fix = (t) => t.replace(/from '\.\.\/\.\.\/lib\/([a-zA-Z0-9._-]+)'/g, "from './$1.ts'");
for (const f of ['taxengine', 'stripe', 'money', 'scotland']) {
  writeFileSync(path.join(stage, `${f}.ts`), readFileSync(path.join(lib, `${f}.ts`), 'utf8'));
}
writeFileSync(
  path.join(stage, 'route.ts'),
  fix(readFileSync(path.resolve(here, '../app/llms.txt/route.ts'), 'utf8')),
);
const { BODY: txt } = await import(pathToFileURL(path.join(stage, 'route.ts')).href);

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
ok(`the trial length matches the code (${TRIAL_DAYS} days)`, txt.includes(`${TRIAL_DAYS} day free trial`));

// --- THE HONESTY SECTION. These are the claims we promised NOT to make. ------------------------
//
// If any of these disappears, someone has quietly started overclaiming to the machines.
ok('it still says we do not file without you', /does not file your tax return for you without you/i.test(txt));
ok('it still disclaims HMRC endorsement', /not endorsed by, affiliated with, or approved by HMRC/i.test(txt));
ok('it is still honest that live HMRC filing is NOT on', /Live filing directly to HMRC is not switched on yet/i.test(txt));
// ══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THIS ASSERTION USED TO PIN A FALSE SENTENCE IN PLACE. 17 AUGUST 2026.
//
// It read:
//
//   ok('it is still honest that the bank feed is NOT public',
//      /bank feed is built but not yet switched on/i.test(txt));
//
// The sentence it demanded was: "The bank feed is built but not yet switched on for the public. It
// is waiting on ICO registration and the provider's production access." BOTH HALVES OF THAT WERE
// FALSE. ICO registration completed on 15 July 2026 (ZC198977). TrueLayer declined production
// authorisation on 30 July 2026, because they are scaling and are not taking on small businesses,
// so there was no provider left to grant production access to anybody.
//
// 🔴 SO A GUARD WRITTEN TO STOP US OVERCLAIMING WAS THE THING KEEPING THE OVERCLAIM ALIVE, and
// it would have failed anybody who tried to tell the truth here. That is the failure mode worth
// remembering out of this whole session: an assertion pinned to a SENTENCE outlives the fact the
// sentence was about, and then defends it. The three below pin the SHAPE instead. The product may
// word the absence however it likes, as long as it declares the connection unavailable, never
// claims it is nearly on, and never blames a regulator who cleared us five weeks earlier.
//
// docs/120 records the decline, the reason and the decision. lib/features.ts bankBadge() carries
// the wording. Do not soften any of these three back into one sentence match.
// ══════════════════════════════════════════════════════════════════════════════════════════
ok('it is still honest that a bank connection is NOT available to anybody',
  /bank connection is PLANNED and is not available/i.test(txt));
ok('🔴 and it NEVER says the feed is built and all but switched on',
  !/built but not yet switched on/i.test(txt) && !/switching on soon/i.test(txt));
// ⚠️ AND THE BODY DELIBERATELY DOES NOT CONTAIN THE PHRASE, EVEN TO DENY IT. The first draft of
// the fix wrote "It is NOT waiting on ICO registration", which is true and which failed this
// assertion, because a blunt negative cannot tell a denial from a claim. The choice was a lookbehind
// here or a rewording there, and the rewording is the one that cannot rot: the body says "ICO
// registration is not what holds it up" and this stays a flat, unmissable negative.
ok('🔴 and it NEVER blames ICO registration, which completed on 15 July 2026',
  !/waiting on ICO registration/i.test(txt));
ok('...it states the true ICO position instead, with the number a reader can check',
  txt.includes('ZC198977') && /completed on 15 July 2026/i.test(txt));

// ⚠️ THE OTHER HALF OF THE SAME FIX, AND WITHOUT IT THE THREE ABOVE ARE SATISFIED BY SILENCE.
//
// Deleting the false sentence would pass every negative on this page. But this file told every
// assistant on earth about a bank feed we do not have and said NOTHING about the bank statement
// import we do have, which is one of the two routes that works from the day a customer signs up.
// An assistant asked "can it read my bank" would have answered "soon", when the true answer is
// "yes, by statement, today". So the routes that work are asserted PRESENT, not merely un-lied
// about. lib/statementimport.ts BANKS is the source of the eleven.
ok('🔴 the statement import, which WORKS, is told to the machines as a route in',
  /bank statement CSV/i.test(txt));
ok('...and all three routes are named where the capture story is told',
  /whichever of three routes/i.test(txt) && /voice note or plain text/i.test(txt));
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

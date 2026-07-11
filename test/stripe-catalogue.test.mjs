// Tests for the Stripe catalogue price decision in lib/stripe.ts (added 11 July
// 2026, when the live Product "Lekhio" with two Prices was created). Pure, no
// network: we only exercise cataloguePriceId, which decides whether a checkout
// charges through a catalogue Price id or falls back to inline price_data.
//
// The module reads the price ids from process.env at load, so we import it twice
// with different env, using a cache busting query string to force re-evaluation.
// Run: node test/stripe-catalogue.test.mjs

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(path.resolve(here, '../lib/stripe.ts')).href;

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

// --- 1. No price ids configured: must fall back to inline price_data ---------
delete process.env.STRIPE_PRICE_MONTHLY;
delete process.env.STRIPE_PRICE_ANNUAL;
const Unset = await import(`${url}?catalogue=unset`);

console.log('\n=== no catalogue configured: inline fallback ===\n');
ok('monthly falls back to inline when no price id is set', Unset.cataloguePriceId('monthly') === null);
ok('annual falls back to inline when no price id is set', Unset.cataloguePriceId('annual') === null);
ok('a missing env var can never break checkout (returns null, not undefined)', Unset.cataloguePriceId('monthly') === null);

// --- 2. Price ids configured: charge through the catalogue -------------------
process.env.STRIPE_PRICE_MONTHLY = 'price_test_monthly';
process.env.STRIPE_PRICE_ANNUAL = 'price_test_annual';
const S = await import(`${url}?catalogue=set`);

console.log('\n=== catalogue configured: charge through the Price id ===\n');
ok('monthly resolves to the monthly price id', S.cataloguePriceId('monthly') === 'price_test_monthly');
ok('annual resolves to the annual price id', S.cataloguePriceId('annual') === 'price_test_annual');
ok('monthly and annual never resolve to the same id', S.cataloguePriceId('monthly') !== S.cataloguePriceId('annual'));

console.log('\n=== the amounts the catalogue must match ===\n');
// These pin the code side of the contract. The live Stripe catalogue is 12.99 a
// month and 129 a year; if either of these changes without the Dashboard changing
// too, the site would advertise a price we no longer charge.
ok('standard monthly is 1299 pence (12.99)', S.subscriptionAmountPence('monthly') === 1299);
ok('standard annual is 12900 pence (129.00)', S.subscriptionAmountPence('annual') === 12900);

console.log('\n=== the discount guard ===\n');
// The founder amount currently equals the standard amount, so a founder checkout
// still charges through the catalogue price. The guard exists so that if a founder
// price is ever discounted below standard, it drops back to inline pricing rather
// than silently billing the full catalogue price.
ok('founder amount currently equals standard, so the catalogue is used', S.cataloguePriceId('monthly', 'setup20') === 'price_test_monthly');
ok('founder amount equals standard monthly today', S.subscriptionAmountPence('monthly', 'setup20') === S.subscriptionAmountPence('monthly'));
ok('founder amount equals standard annual today', S.subscriptionAmountPence('annual', 'setup20') === S.subscriptionAmountPence('annual'));
ok('an unknown offer is treated as standard', S.cataloguePriceId('monthly', 'nonsense') === 'price_test_monthly');
ok('a null offer is treated as standard', S.cataloguePriceId('annual', null) === 'price_test_annual');

console.log('\n=== trial still applies regardless of pricing path ===\n');
ok('default trial is 14 days', S.TRIAL_DAYS === 14);
ok('rep trial is 30 days', S.REP_TRIAL_DAYS === 30);
ok('no rep code gives the 14 day trial', S.resolveTrialDays(null) === 14);

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

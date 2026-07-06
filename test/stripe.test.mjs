// Tests for lib/stripewebhook.ts, the pure decision logic behind the Stripe
// webhook: the idempotency claim mapping (the anti double-charge gate) and the
// subscription row builder (what we book money against). Pure, no network. Run:
//   node test/stripe.test.mjs   (Node 22.6+, TypeScript type stripping)
//
// The type-only import of SubscriptionRecord is erased at type-strip time, so
// this suite loads without Next.js, Stripe, or Supabase.

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const S = await import(`${pathToFileURL(path.resolve(here, '../lib/stripewebhook.ts')).href}`);

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

console.log('\n=== stripe: idempotency claim mapping ===\n');
// 201 = the insert took, first time we have seen this event id -> process it.
ok('201 (first delivery) -> new, we proceed', S.claimResultFromStatus(201) === 'new');
// 409 = primary key conflict, we already booked this event -> do nothing, 200.
ok('409 (duplicate delivery) -> duplicate, we skip', S.claimResultFromStatus(409) === 'duplicate');
// Everything else fails OPEN: a signature-verified event is real money and must
// never be silently dropped just because the idempotency store hiccuped.
ok('500 (store error) -> new, fail open', S.claimResultFromStatus(500) === 'new');
ok('0 (network/unknown) -> new, fail open', S.claimResultFromStatus(0) === 'new');
ok('403 (misconfig) -> new, fail open', S.claimResultFromStatus(403) === 'new');
ok('only 409 is ever treated as a duplicate', S.claimResultFromStatus(200) === 'new');

console.log('\n=== stripe: subscriptionRowFrom, the money we book ===\n');

// A well formed subscription: annual price, live status, renewal date, account
// key and offer carried in metadata from checkout.
const periodEnd = 1793000000; // seconds
const full = S.subscriptionRowFrom({
  id: 'sub_ABC',
  status: 'active',
  customer: 'cus_123',
  current_period_end: periodEnd,
  cancel_at_period_end: false,
  metadata: { plan: 'annual', offer: 'founder', phone: '447700900123', amount_pence: '15900' },
  items: { data: [{ price: { unit_amount: 19900, recurring: { interval: 'year' } } }] },
});
ok('keys on the subscription id', full && full.stripe_subscription_id === 'sub_ABC');
ok('carries the live status', full && full.status === 'active');
ok('carries the customer id', full && full.stripe_customer_id === 'cus_123');
ok('carries the account key (phone) from metadata', full && full.phone === '447700900123');
ok('carries the offer', full && full.offer === 'founder');
ok('prefers the authoritative price.unit_amount over metadata', full && full.amount_pence === 19900);
ok('renewal date converted from unix seconds to ISO', full && full.current_period_end === new Date(periodEnd * 1000).toISOString());
ok('cancel_at_period_end preserved as boolean false', full && full.cancel_at_period_end === false);

// Metadata plan wins over the interval-derived plan when both are present.
ok('metadata plan wins over interval', full && full.plan === 'annual');

// No metadata plan: fall back to the price interval. year -> annual.
const byInterval = S.subscriptionRowFrom({
  id: 'sub_year',
  metadata: {},
  items: { data: [{ price: { recurring: { interval: 'year' } } }] },
});
ok('no metadata plan, year interval -> annual', byInterval && byInterval.plan === 'annual');

const byMonth = S.subscriptionRowFrom({
  id: 'sub_month',
  metadata: {},
  items: { data: [{ price: { recurring: { interval: 'month' } } }] },
});
ok('no metadata plan, month interval -> monthly', byMonth && byMonth.plan === 'monthly');

// Amount falls back to metadata only when the price has no unit_amount.
const metaAmount = S.subscriptionRowFrom({
  id: 'sub_meta',
  metadata: { amount_pence: '1599' },
  items: { data: [{ price: { recurring: { interval: 'month' } } }] },
});
ok('amount falls back to metadata amount_pence when no price', metaAmount && metaAmount.amount_pence === 1599);

// A sparse event (subscription.deleted often has little): still keys safely,
// nulls where unknown, never throws.
const sparse = S.subscriptionRowFrom({ id: 'sub_min' });
ok('sparse event still produces a keyed row', sparse && sparse.stripe_subscription_id === 'sub_min');
ok('sparse amount is null, not NaN or 0', sparse && sparse.amount_pence === null);
ok('sparse plan is null when nothing to infer', sparse && sparse.plan === null);
ok('sparse period end is null', sparse && sparse.current_period_end === null);
ok('sparse row omits phone rather than inventing one', sparse && sparse.phone === undefined);

// No id at all: refuse to build a keyless row (would collide/overwrite).
ok('missing subscription id returns null', S.subscriptionRowFrom({ status: 'active' }) === null);
ok('empty object returns null', S.subscriptionRowFrom({}) === null);

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

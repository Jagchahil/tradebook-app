// TRIAL STACKING: the defect this suite guards against, and it points the wrong way at revenue.
//
//   node test/trialstacking.test.mjs
//
// Lekhio gives 7 days free with no card. grantTrialWithIdentity (lib/supabase.ts) writes a
// `trialing` row the moment a man signs up: no Stripe ids, amount_pence 0, and current_period_end
// set to signup plus seven days. That row IS his free week.
//
// Days later he reaches the card at the end of setting up, and lib/stripe.ts used to ask Stripe for
// subscription_data[trial_period_days] = 7 with no reference to the week already running. Stripe
// counts trial_period_days from the day the card arrives, so his free time became up to fourteen
// days and the first payment moved a week out. The customer who CONVERTS got more free than the one
// who never paid, which is backwards, and at launch it is the whole of the first month's revenue.
//
// The fix is that a signed in buyer who already holds a trial row inherits its ORIGINAL deadline:
// subscription_data[trial_end], in unix seconds, and no trial_period_days at all.
//
// Nothing about this is visible at runtime. Stripe accepts both fields happily, the session opens,
// the customer is delighted, and the only symptom is money arriving a week late for everybody. So
// it is pinned here, on the real exported functions, with the network stubbed.

process.env.STRIPE_SECRET_KEY = 'sk_test_trialstacking';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://stub.supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-stub';
process.env.REP_TRIAL_CODES = 'ROADSHOW24';

import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const S = await import(pathToFileURL(path.resolve(repoRoot, 'lib', 'stripe.ts')).href);

let pass = 0, fail = 0;
function ok(desc, cond) {
  if (cond) { pass++; console.log(`  PASS  ${desc}`); }
  else { fail++; console.log(`  FAIL  ${desc}`); }
}

const NOW = new Date('2026-08-06T09:00:00Z');
const hoursOut = (h) => new Date(NOW.getTime() + h * 3_600_000).toISOString();
const unix = (iso) => Math.floor(Date.parse(iso) / 1000);

// ---------------------------------------------------------------------------------------------
// 1. THE DECISION, PURE. resolveTrialForCheckout is the whole rule in one function.
// ---------------------------------------------------------------------------------------------
console.log('\n=== the decision: which trial field, if any, this checkout carries ===\n');

{
  // A trial with four days left, which is the ordinary converting customer.
  const running = hoursOut(96);
  const r = S.resolveTrialForCheckout(running, null, NOW);
  ok('a running trial is inherited as trial_end', r.field === 'trial_end');
  ok('trial_end is the ORIGINAL end, to the second, not a fresh week',
    r.unixSeconds === unix(running));
  ok('and it carries no day count for Stripe to count from today', r.days === undefined);
}

{
  // The day after tomorrow, one second past Stripe's floor.
  const running = hoursOut(48.5);
  const r = S.resolveTrialForCheckout(running, null, NOW);
  ok('a trial just over the 48 hour floor is still inherited', r.field === 'trial_end');
  ok('and still lands on its own end date', r.unixSeconds === unix(running));
}

{
  const expired = hoursOut(-1);
  const r = S.resolveTrialForCheckout(expired, null, NOW);
  ok('🔴 an EXPIRED trial produces neither field, so he is billed today', r.field === 'none');
  ok('an expired trial never sends a trial_end in the past (Stripe rejects it)',
    r.unixSeconds === undefined);
  ok('and never quietly restarts the week as trial_period_days', r.days === undefined);
}

{
  const longGone = new Date(NOW.getTime() - 40 * 86_400_000).toISOString();
  ok('a trial that ended weeks ago is still just "none"',
    S.resolveTrialForCheckout(longGone, null, NOW).field === 'none');
}

{
  // 47 hours left. Real, still running, and unsendable: Stripe requires 48.
  const soon = hoursOut(47);
  const r = S.resolveTrialForCheckout(soon, null, NOW);
  ok('🔴 a trial ending inside 48 hours produces neither field', r.field === 'none');
  ok('it is not rounded UP to the 48 hour floor, which would be free time he was never promised',
    r.unixSeconds === undefined);
  ok('and it is not replaced by a fresh trial_period_days', r.days === undefined);
  ok('the floor is named, not typed twice', S.MIN_TRIAL_END_HOURS === 48);
}

{
  // The boundary, written down so nobody has to guess which way it falls. Stripe's rule is AT LEAST
  // 48 hours, so exactly 48 is inside it and only SHORTER than that is refused. One second under is
  // the first refusal.
  ok('exactly 48 hours out is still sent, because at least 48 hours means 48 counts',
    S.resolveTrialForCheckout(hoursOut(48), null, NOW).field === 'trial_end');
  ok('one second under the floor is refused',
    S.resolveTrialForCheckout(new Date(NOW.getTime() + 48 * 3_600_000 - 1000).toISOString(), null, NOW)
      .field === 'none');
}

{
  // No row at all: the pre signup funnel, where nothing has been granted yet.
  const r = S.resolveTrialForCheckout(null, null, NOW);
  ok('no prior trial still gives the full free week as trial_period_days',
    r.field === 'trial_period_days' && r.days === S.TRIAL_DAYS);
  ok('and that week is still 7 days', S.TRIAL_DAYS === 7);
  ok('undefined behaves the same as null', S.resolveTrialForCheckout(undefined, null, NOW).days === 7);
}

{
  // 🔴 THE FAIL SAFE. A read that could not be answered must look like a first time buyer, never
  // like an expired trial: charging a man on the day he hands over his card, because Supabase
  // wobbled, is the one outcome worse than a week of free time.
  const r = S.resolveTrialForCheckout(null, null, NOW);
  ok('an unreadable trial row falls back to the current behaviour, it never bills immediately',
    r.field === 'trial_period_days');
  ok('rubbish in the column is treated the same way, not parsed into a date',
    S.resolveTrialForCheckout('not a date', null, NOW).field === 'trial_period_days');
  ok('an empty string is treated the same way',
    S.resolveTrialForCheckout('', null, NOW).field === 'trial_period_days');
}

{
  // The rep code is a first time path: a rep hands it to a stranger before there is an account.
  ok('a valid rep code with no prior trial still gets 30 days',
    S.resolveTrialForCheckout(null, 'ROADSHOW24', NOW).days === S.REP_TRIAL_DAYS);
  // And it cannot be used to reopen a running trial into a longer one.
  ok('🔴 a rep code cannot lengthen a trial that is already running',
    S.resolveTrialForCheckout(hoursOut(96), 'ROADSHOW24', NOW).field === 'trial_end');
}

// ---------------------------------------------------------------------------------------------
// 2. THE FORM STRIPE ACTUALLY RECEIVES. The decision is worth nothing if the body still says
//    trial_period_days, so the real createSubscriptionCheckout is run with the network stubbed.
// ---------------------------------------------------------------------------------------------
console.log('\n=== the body posted to Stripe ===\n');

const realFetch = globalThis.fetch;
const jsonRes = (body) => new Response(JSON.stringify(body), {
  status: 200, headers: { 'content-type': 'application/json' },
});

// `trialEnd` null means the account holds no local trial row.
async function checkoutWith(trialEnd, extra = {}) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    calls.push({ url: u, body: opts.body ? String(opts.body) : null });
    if (u.includes('/rest/v1/subscriptions')) {
      return jsonRes(trialEnd === null ? [] : [{ current_period_end: trialEnd }]);
    }
    return jsonRes({ url: 'https://checkout.stripe.com/c/pay/cs_test_stack' });
  };
  try {
    const out = await S.createSubscriptionCheckout({
      plan: 'monthly',
      email: 'buyer@example.com',
      userId: 'a1b2c3d4-1111-4111-8111-222222222222',
      successUrl: 'https://lekhio.app/app?card=on',
      cancelUrl: 'https://lekhio.app/app/setup?step=card',
      ...extra,
    });
    const stripeCall = calls.find((c) => c.url.includes('/checkout/sessions'));
    return { out, calls, body: stripeCall ? stripeCall.body : '' };
  } finally {
    globalThis.fetch = realFetch;
  }
}

{
  const running = new Date(Date.now() + 4 * 86_400_000).toISOString();
  const { out, calls, body } = await checkoutWith(running);
  ok('the session is still minted for a converting customer',
    out === 'https://checkout.stripe.com/c/pay/cs_test_stack');
  ok('the account trial row is read first, filtered to the no card local grant',
    calls[0].url.includes('/rest/v1/subscriptions')
    && calls[0].url.includes('stripe_subscription_id=is.null')
    && calls[0].url.includes('status=eq.trialing'));
  ok('🔴 the body carries subscription_data[trial_end] at the ORIGINAL deadline',
    body.includes(`subscription_data%5Btrial_end%5D=${unix(running)}`));
  ok('🔴 AND NOT ONE trial_period_days, which is what stacked the second free week',
    !body.includes('trial_period_days'));
  ok('the rest of the session is untouched: subscription mode',
    body.includes('mode=subscription'));
  ok('the account is still bound to the subscription for the webhook',
    body.includes('subscription_data%5Bmetadata%5D%5Buser_id%5D='));
}

{
  const expired = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const { out, body } = await checkoutWith(expired);
  ok('an expired trial still opens a checkout', out !== null);
  ok('🔴 an expired trial sends NEITHER field, so the first invoice is due today',
    !body.includes('trial_end') && !body.includes('trial_period_days'));
}

{
  const soon = new Date(Date.now() + 20 * 3_600_000).toISOString();
  const { body } = await checkoutWith(soon);
  ok('🔴 a trial ending inside 48 hours sends neither field',
    !body.includes('trial_end') && !body.includes('trial_period_days'));
}

{
  const { body } = await checkoutWith(null);
  ok('no prior trial row still gets the full 7 day trial_period_days',
    body.includes(`subscription_data%5Btrial_period_days%5D=${S.TRIAL_DAYS}`));
  ok('and no trial_end is invented for him', !body.includes('trial_end'));
}

{
  // The pre signup funnel: no account, so nothing to look up and nothing to inherit.
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), body: opts.body ? String(opts.body) : null });
    return jsonRes({ url: 'https://checkout.stripe.com/c/pay/cs_test_presignup' });
  };
  let body = '';
  try {
    await S.createSubscriptionCheckout({
      plan: 'annual',
      email: 'stranger@example.com',
      repCode: 'ROADSHOW24',
      successUrl: 'https://lekhio.app/start?billing=success',
      cancelUrl: 'https://lekhio.app/start?billing=cancelled',
    });
    body = calls[0] ? calls[0].body : '';
  } finally {
    globalThis.fetch = realFetch;
  }
  ok('a signed out buyer causes no subscriptions read at all',
    calls.length === 1 && calls[0].url.includes('/checkout/sessions'));
  ok('and a rep code still buys him the 30 day trial',
    body.includes(`subscription_data%5Btrial_period_days%5D=${S.REP_TRIAL_DAYS}`));
}

{
  // The read failing is the case the fail safe exists for.
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    calls.push({ url: u, body: opts.body ? String(opts.body) : null });
    if (u.includes('/rest/v1/subscriptions')) return new Response('nope', { status: 500 });
    return jsonRes({ url: 'https://checkout.stripe.com/c/pay/cs_test_degraded' });
  };
  let out = null, body = '';
  try {
    out = await S.createSubscriptionCheckout({
      plan: 'monthly',
      userId: 'a1b2c3d4-1111-4111-8111-222222222222',
      successUrl: 'https://lekhio.app/app?card=on',
      cancelUrl: 'https://lekhio.app/app/setup?step=card',
    });
    const stripeCall = calls.find((c) => c.url.includes('/checkout/sessions'));
    body = stripeCall ? stripeCall.body : '';
  } finally {
    globalThis.fetch = realFetch;
  }
  ok('🔴 an unreadable trial row never errors the checkout', out !== null);
  ok('it falls back to the old behaviour rather than billing him on the spot',
    body.includes('subscription_data%5Btrial_period_days%5D='));
}

// ---------------------------------------------------------------------------------------------
// 3. SOURCE PINS. The two properties above that a stub could be written around.
// ---------------------------------------------------------------------------------------------
console.log('\n=== source pins ===\n');
{
  const src = readFileSync(path.join(repoRoot, 'lib', 'stripe.ts'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const mint = code.slice(code.indexOf('export async function createSubscriptionCheckout'));
  ok('the trial field is set from resolveTrialForCheckout, never from a bare day count',
    /resolveTrialForCheckout\(/.test(mint)
    && !/form\.set\('subscription_data\[trial_period_days\]', String\(resolveTrialDays/.test(mint));
  ok('trial_end is written in unix SECONDS, not milliseconds and not an ISO string',
    /Math\.floor\(endMs \/ 1000\)/.test(code));
  ok('the local trial read is filtered to the no card grant, so a PAID period end can never leak in',
    /stripe_subscription_id=is\.null&status=eq\.trialing/.test(code));
  ok('lib/stripe.ts still imports nothing local, which is what lets this suite load it',
    [...code.matchAll(/from '([^']+)'/g)].every((m) => !m[1].startsWith('.')));
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;

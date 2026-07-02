// Stripe client. We talk to the Stripe REST API with raw fetch, the same way we
// do Supabase and Anthropic, so there is no SDK dependency.
//
// Env vars:
//   STRIPE_SECRET_KEY      sk_live_... or sk_test_...
//   STRIPE_WEBHOOK_SECRET  whsec_..., used to verify the webhook signature
//
// Everything here returns gracefully when no key is set, so the invoice page
// simply does not show a Pay now button until Stripe is switched on.

import crypto from 'crypto';

const API = 'https://api.stripe.com/v1';

const KEY = process.env.STRIPE_SECRET_KEY;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

export function hasStripeConfig(): boolean {
  return Boolean(KEY);
}

export interface CheckoutInput {
  invoiceId: string;
  number: string;
  total: number; // pounds
  customerEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
}

// Create a hosted Stripe Checkout session for one invoice. Returns the URL to
// send the customer to, or null if Stripe is not configured or the call fails.
export async function createInvoiceCheckout(input: CheckoutInput): Promise<string | null> {
  if (!KEY) return null;

  const amountPence = Math.round(Math.abs(input.total) * 100);
  if (amountPence <= 0) return null;

  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('success_url', input.successUrl);
  form.set('cancel_url', input.cancelUrl);
  form.set('client_reference_id', input.invoiceId);
  form.set('metadata[invoice_id]', input.invoiceId);
  if (input.customerEmail) form.set('customer_email', input.customerEmail);
  form.set('line_items[0][quantity]', '1');
  form.set('line_items[0][price_data][currency]', 'gbp');
  form.set('line_items[0][price_data][unit_amount]', String(amountPence));
  form.set('line_items[0][price_data][product_data][name]', `Invoice ${input.number}`);

  const res = await fetch(`${API}/checkout/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[stripe] Checkout create failed:', res.status, text);
    return null;
  }
  const data = (await res.json()) as { url?: string };
  return data.url ?? null;
}

// --- Subscription billing (the Lekhio subscription itself) -----------------
//
// One flat product, two billing periods, and a founder price. We do not pre-create
// Price objects in the dashboard. Checkout accepts an inline recurring price, so
// the amounts live here in code, in pence, and that is the single source of truth.
//
//   Standard   £19.99 a month   or   £199 a year
//   Founder    £15.99 a month   or   £159 a year   (20% off for life, offer=setup20)
//
// The founder discount is the price itself, not a coupon, so it simply never goes
// away. A 30 day free trial is attached, so no card is charged for the first month.

export type BillingPlan = 'monthly' | 'annual';

const PRICE_PENCE: Record<BillingPlan, { standard: number; founder: number; interval: 'month' | 'year'; label: string }> = {
  monthly: { standard: 1999, founder: 1599, interval: 'month', label: 'Lekhio, monthly' },
  annual: { standard: 19900, founder: 15900, interval: 'year', label: 'Lekhio, annual' },
};

export const TRIAL_DAYS = 30;

export function isFounderOffer(offer?: string | null): boolean {
  return (offer ?? '').trim().toLowerCase() === 'setup20';
}

// The amount we will actually charge, in pence, for a plan and offer.
export function subscriptionAmountPence(plan: BillingPlan, offer?: string | null): number {
  const p = PRICE_PENCE[plan];
  return isFounderOffer(offer) ? p.founder : p.standard;
}

export interface SubscriptionCheckoutInput {
  plan: BillingPlan;
  offer?: string | null;
  email?: string | null;
  phone?: string | null;
  successUrl: string;
  cancelUrl: string;
}

// Create a hosted Stripe Checkout session in subscription mode, with a 30 day
// free trial and the right recurring price. Returns the URL to send the user to,
// or null if Stripe is not configured or the call fails.
export async function createSubscriptionCheckout(input: SubscriptionCheckoutInput): Promise<string | null> {
  if (!KEY) return null;

  const meta = PRICE_PENCE[input.plan];
  if (!meta) return null;
  const offer = isFounderOffer(input.offer) ? 'setup20' : '';
  const amount = subscriptionAmountPence(input.plan, offer);

  const form = new URLSearchParams();
  form.set('mode', 'subscription');
  form.set('success_url', input.successUrl);
  form.set('cancel_url', input.cancelUrl);
  if (input.email) form.set('customer_email', input.email);
  form.set('line_items[0][quantity]', '1');
  form.set('line_items[0][price_data][currency]', 'gbp');
  form.set('line_items[0][price_data][unit_amount]', String(amount));
  form.set('line_items[0][price_data][recurring][interval]', meta.interval);
  form.set('line_items[0][price_data][product_data][name]', meta.label);
  form.set('subscription_data[trial_period_days]', String(TRIAL_DAYS));
  // Carry the plan and offer on the subscription so later webhook events keep them.
  form.set('subscription_data[metadata][plan]', input.plan);
  form.set('subscription_data[metadata][offer]', offer);
  form.set('subscription_data[metadata][amount_pence]', String(amount));
  // The phone is the account key. Carry it on the subscription AND the session so the
  // webhook can tie this payment back to a phone-only account.
  if (input.phone) {
    form.set('subscription_data[metadata][phone]', input.phone);
    form.set('metadata[phone]', input.phone);
  }
  // And on the session, so checkout.session.completed can tell this from an invoice.
  form.set('metadata[kind]', 'subscription');
  form.set('metadata[plan]', input.plan);
  form.set('metadata[offer]', offer);
  form.set('metadata[amount_pence]', String(amount));

  const res = await fetch(`${API}/checkout/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[stripe] Subscription checkout create failed:', res.status, text);
    return null;
  }
  const data = (await res.json()) as { url?: string };
  return data.url ?? null;
}

// Fetch a subscription so the webhook can read its current price and period end.
export async function getStripeSubscription(id: string): Promise<Record<string, unknown> | null> {
  if (!KEY || !id) return null;
  const res = await fetch(`${API}/subscriptions/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as Record<string, unknown>;
}

// Open the Stripe customer billing portal so a user can update their card, switch
// plan, or cancel. Returns the portal URL, or null if Stripe is off or it fails.
export async function createBillingPortal(customerId: string, returnUrl: string): Promise<string | null> {
  if (!KEY || !customerId) return null;
  const form = new URLSearchParams();
  form.set('customer', customerId);
  form.set('return_url', returnUrl);
  const res = await fetch(`${API}/billing_portal/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error('[stripe] Billing portal create failed:', res.status, text);
    return null;
  }
  const data = (await res.json()) as { url?: string };
  return data.url ?? null;
}

export function webhookConfigured(): boolean {
  return Boolean(WEBHOOK_SECRET);
}

// How far the signature timestamp may drift from now before we reject it. Five
// minutes matches Stripe's own default tolerance and blocks replay of an old,
// validly signed request. Clock skew inside this window is tolerated.
const SIGNATURE_TOLERANCE_SECONDS = 300;

// Verify the Stripe-Signature header. Stripe signs `${timestamp}.${payload}`
// with the webhook secret. We check the timestamp is recent (replay protection),
// then recompute the HMAC and compare in constant time.
export function verifyStripeSignature(payload: string, sigHeader: string | null): boolean {
  if (!WEBHOOK_SECRET || !sigHeader) return false;

  const parts = sigHeader.split(',').reduce<Record<string, string>>((acc, part) => {
    const [k, v] = part.split('=');
    if (k && v) acc[k.trim()] = v.trim();
    return acc;
  }, {});

  const timestamp = parts['t'];
  const signature = parts['v1'];
  if (!timestamp || !signature) return false;

  // Replay protection. Reject if the signed timestamp is too far from now, in
  // either direction, before spending any time on the HMAC. A `t` that is not a
  // valid unix time also fails closed.
  const t = Number(timestamp);
  if (!Number.isFinite(t)) return false;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - t) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const signed = `${timestamp}.${payload}`;
  const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(signed, 'utf8').digest('hex');

  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signature, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

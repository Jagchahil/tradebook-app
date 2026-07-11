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
//   Launch     £12.99 a month   or   £129 a year   (about two months free on annual)
//
// This is the launch price. It undercuts the direct WhatsApp rival while live HMRC
// filing is still being switched on; the plan is to raise it to £19.99 a month once
// filing is live, at which point every existing subscriber keeps this price for life
// automatically, because Stripe locks the amount at signup (inline price_data). A
// 14 day free trial is attached by default, so no card is charged for the first two
// weeks. A field sales rep can hand a customer a longer 30 day trial by giving them a
// rep code (see REP_TRIAL_CODES and resolveTrialDays below).

export type BillingPlan = 'monthly' | 'annual';

const PRICE_PENCE: Record<BillingPlan, { standard: number; founder: number; interval: 'month' | 'year'; label: string }> = {
  monthly: { standard: 1299, founder: 1299, interval: 'month', label: 'Lekhio, monthly' },
  annual: { standard: 12900, founder: 12900, interval: 'year', label: 'Lekhio, annual' },
};

// The catalogue Price objects (added 11 July 2026). Stripe's recommended shape is
// a real Product with real Prices, not ad hoc inline pricing: prices built inline
// with price_data never appear in the Dashboard catalogue or product searches, so
// revenue reporting by product is blind. The live catalogue is one product
// "Lekhio" with two recurring prices, 12.99 a month and 129 a year.
//
// When a price id is configured we charge THROUGH it, which makes the Dashboard
// the source of truth for the amount. When it is not set we fall back to the
// inline price_data path below, so a missing or blank env var can never break
// checkout. Price ids are not secrets, but they are kept in env so the code is
// not welded to one Stripe account.
//
// KEEP IN SYNC: PRICE_PENCE above is what the marketing site displays and what we
// stamp into metadata. If you change an amount in the Stripe Dashboard, change it
// here too, or the site will advertise a price you no longer charge. The webhook
// always prefers Stripe's authoritative price.unit_amount when writing the row, so
// the stored record stays correct either way.
const PRICE_IDS: Record<BillingPlan, string | undefined> = {
  monthly: process.env.STRIPE_PRICE_MONTHLY,
  annual: process.env.STRIPE_PRICE_ANNUAL,
};

// The default self serve trial. Fourteen days: long enough to reach the aha
// moments (a first week of entries, a receipt, the CIS refund building), short
// enough to keep momentum and filter tyre kickers.
export const TRIAL_DAYS = 14;

// The longer trial a field sales rep can grant in person. Reps hand out a code
// from REP_TRIAL_CODES (a comma separated env list, case insensitive). Only a
// matching code unlocks it, so it can never be self served off a public link.
export const REP_TRIAL_DAYS = 30;

export function isRepTrialCode(code?: string | null): boolean {
  const c = (code ?? '').trim().toLowerCase();
  if (!c) return false;
  const allowed = (process.env.REP_TRIAL_CODES ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(c);
}

// How many trial days this checkout gets: 30 for a valid rep code, else 14.
export function resolveTrialDays(repCode?: string | null): number {
  return isRepTrialCode(repCode) ? REP_TRIAL_DAYS : TRIAL_DAYS;
}

export function isFounderOffer(offer?: string | null): boolean {
  return (offer ?? '').trim().toLowerCase() === 'setup20';
}

// The amount we will actually charge, in pence, for a plan and offer.
export function subscriptionAmountPence(plan: BillingPlan, offer?: string | null): number {
  const p = PRICE_PENCE[plan];
  return isFounderOffer(offer) ? p.founder : p.standard;
}

// Which catalogue Price id, if any, this checkout should charge through. Exported
// so the decision is unit tested without touching the network. Returns null when
// we must fall back to inline price_data: either no price id is configured, or the
// amount is discounted below the standard price, in which case billing through the
// full price catalogue entry would silently overcharge.
export function cataloguePriceId(plan: BillingPlan, offer?: string | null): string | null {
  const meta = PRICE_PENCE[plan];
  if (!meta) return null;
  const id = PRICE_IDS[plan];
  if (!id) return null;
  return subscriptionAmountPence(plan, offer) === meta.standard ? id : null;
}

export interface SubscriptionCheckoutInput {
  plan: BillingPlan;
  offer?: string | null;
  email?: string | null;
  phone?: string | null;
  repCode?: string | null; // a field rep's code, unlocks the 30 day trial
  successUrl: string;
  cancelUrl: string;
}

// Create a hosted Stripe Checkout session in subscription mode, with the trial
// (14 days by default, 30 for a valid rep code) and the right recurring price.
// Returns the URL to send the user to, or null if Stripe is not configured or
// the call fails.
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
  // Charge through the catalogue Price when cataloguePriceId says we safely can,
  // otherwise fall back to the inline price. See that function for the rules.
  const priceId = cataloguePriceId(input.plan, offer);
  if (priceId) {
    form.set('line_items[0][price]', priceId);
  } else {
    form.set('line_items[0][price_data][currency]', 'gbp');
    form.set('line_items[0][price_data][unit_amount]', String(amount));
    form.set('line_items[0][price_data][recurring][interval]', meta.interval);
    form.set('line_items[0][price_data][product_data][name]', meta.label);
  }
  form.set('subscription_data[trial_period_days]', String(resolveTrialDays(input.repCode)));
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

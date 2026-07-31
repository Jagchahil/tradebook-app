// Stripe client. We talk to the Stripe REST API with raw fetch, the same way we
// do Supabase and Anthropic, so there is no SDK dependency.
//
// Env vars:
//   STRIPE_SECRET_KEY      sk_live_... or sk_test_...
//   STRIPE_WEBHOOK_SECRET  whsec_..., used to verify the webhook signature
//
// Everything here returns gracefully when no key is set. Invoice card payment is
// additionally gated on a payout route existing, which today it never does: see
// hasInvoicePayoutRoute below before touching anything invoice shaped.

import crypto from 'crypto';

const API = 'https://api.stripe.com/v1';

const KEY = process.env.STRIPE_SECRET_KEY;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

export function hasStripeConfig(): boolean {
  return Boolean(KEY);
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE PAYOUT ROUTE, OR RATHER THE FACT THAT THERE IS NOT ONE. READ THIS BEFORE TOUCHING
// INVOICE CARD PAYMENT.
//
// STRIPE_SECRET_KEY is OUR key. A Checkout session created with it collects the payer's money
// into LEKHIO LTD'S OWN STRIPE BALANCE. That is correct for the one thing we sell, the Lekhio
// subscription. It is catastrophically wrong for a tradesman's invoice: his customer's £450
// would land in our account, branded Lekhio, and nothing anywhere in this codebase, no Stripe
// Connect account, no transfer, no stored bank details for the tradesman, could ever move it on
// to the man who did the work. Found on 31 July 2026: the live invoice page offered exactly
// that button to every customer's customer.
//
// Money paid to the wrong account is the worst class of bug this product can have. It is not a
// crash we can fix or a figure we can correct. It is us holding a stranger's money, a customer
// who believes he has paid, and a tradesman who has not been paid, all at once, with the mess
// landing in the one relationship the product exists to protect.
//
// So: until a user can hold a real payout route, this answers false for EVERY invoice, and no
// invoice checkout session can be created. The public invoice page stays the document plus
// whatever payment details the tradesman wrote on it, with one honest line that card payment
// is coming. The day payout routes exist, this function must take the invoice's owner and look
// his route up, createInvoiceCheckout must charge THROUGH that route (a destination charge to
// his connected account, never a plain charge into ours), and test/invoicepay.test.mjs, which
// currently proves no session leaves this file even with a live key configured, must be
// rewritten to attack the lookup.
// ═════════════════════════════════════════════════════════════════════════════════════════════
export function hasInvoicePayoutRoute(): boolean {
  return false;
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
  // 🔴 NO PAYOUT ROUTE, NO SESSION, BEFORE ANYTHING ELSE IS EVEN READ. Without a route to the
  // invoice's owner this session would collect his customer's money into OUR balance, which is
  // the trap hasInvoicePayoutRoute's header spells out. The guard lives here, at the only place
  // a session is minted, so no future call site can reopen it by forgetting a check.
  if (!hasInvoicePayoutRoute()) return null;
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
// 7 day free trial is attached by default, so no card is charged for the first week.
// A field sales rep can hand a customer a longer 30 day trial by giving them a
// rep code (see REP_TRIAL_CODES and resolveTrialDays below).

export type BillingPlan = 'monthly' | 'annual';

// EXPORTED so it can be tested. public/llms.txt states our price to every AI model that reads
// it, and test/llmstxt.test.mjs ties that statement to this constant. A price that drifts from
// what we actually charge is a false claim published under our own name.
export const PRICE_PENCE: Record<BillingPlan, { standard: number; founder: number; interval: 'month' | 'year'; label: string }> = {
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

// 🔴 SEVEN DAYS. THE SAME SEVEN AS lib/entitlement.ts, AND A TEST IS WHAT KEEPS THEM THE SAME.
//
// This number exists twice on purpose, and the duplication is not laziness, it is the price of a
// constraint worth more than tidiness: lib/stripe.ts imports NOTHING local, which is the only
// reason test/trial.test.mjs and test/stripe-catalogue.test.mjs can load it straight into node
// and attack it. Importing the constant from entitlement.ts broke all three suites at once.
//
// So the guard is not an import, it is an assertion. test/trial.test.mjs loads both files and
// fails the build if these two numbers ever disagree. That is the same shape as
// test/watemplates.test.mjs, which enforces an invariant ACROSS files rather than hoping a
// convention holds, and it is strictly stronger than an import: an import proves they are one
// number, a test proves they MEAN the same thing and says so out loud when they stop.
//
// Two lengths for one trial would show up as a man being locked out days early by a rule he was
// never shown, so this is worth a red test rather than a comment asking nicely.
export const TRIAL_DAYS = 7;

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

// How many trial days this checkout gets: 30 for a valid rep code, else the standard trial.
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
  // 🔴 THE ACCOUNT THIS CARD BELONGS TO. Set whenever the buyer is signed in, which from 30 July is
  // every customer who reaches the card at the end of setting up. The phone below is the OLD account
  // key and stays for the pre signup funnel; a web account has no proved phone, so without this the
  // webhook has nothing to bind the subscription to. See SubscriptionRecord.user_id.
  userId?: string | null;
  successUrl: string;
  cancelUrl: string;
}

// Create a hosted Stripe Checkout session in subscription mode, with the trial
// (7 days by default, 30 for a valid rep code) and the right recurring price.
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
  // On BOTH, for the same reason the phone is on both: checkout.session.completed reads the session,
  // and every later customer.subscription.* event reads only the subscription. A card that binds on
  // day one and comes loose at the first renewal is worse than one that never bound.
  if (input.userId) {
    form.set('subscription_data[metadata][user_id]', input.userId);
    form.set('metadata[user_id]', input.userId);
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

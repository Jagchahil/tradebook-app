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

export function webhookConfigured(): boolean {
  return Boolean(WEBHOOK_SECRET);
}

// Verify the Stripe-Signature header. Stripe signs `${timestamp}.${payload}`
// with the webhook secret. We recompute and compare in constant time.
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

  const signed = `${timestamp}.${payload}`;
  const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(signed, 'utf8').digest('hex');

  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signature, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

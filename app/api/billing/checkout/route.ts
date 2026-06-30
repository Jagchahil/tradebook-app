import { NextRequest, NextResponse } from 'next/server';
import { createSubscriptionCheckout, hasStripeConfig, type BillingPlan } from '../../../../lib/stripe';
import { normalizeUkPhone } from '../../../../lib/supabase';

// Start a real Lekhio subscription. The page posts the chosen plan and any founder
// offer, we create a Stripe Checkout session with a 30 day free trial, and return
// the hosted URL for the browser to redirect to. No card details ever touch us.

function str(v: unknown, max = 200): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

export async function POST(req: NextRequest) {
  if (!hasStripeConfig()) {
    return NextResponse.json({ error: 'billing_not_configured' }, { status: 503 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine, defaults apply
  }

  const plan: BillingPlan = str(body.plan, 16).toLowerCase() === 'annual' ? 'annual' : 'monthly';
  const offer = str(body.offer, 40);
  const email = str(body.email, 200).trim() || null;
  const phone = normalizeUkPhone(str(body.phone, 20)) || null; // E.164 +44, the account key

  const base = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, '');

  const url = await createSubscriptionCheckout({
    plan,
    offer,
    email,
    phone,
    successUrl: `${base}/start?billing=success`,
    cancelUrl: `${base}/start?billing=cancelled`,
  });

  if (!url) {
    return NextResponse.json({ error: 'checkout_failed' }, { status: 502 });
  }
  return NextResponse.json({ url });
}

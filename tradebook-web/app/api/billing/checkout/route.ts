import { NextRequest, NextResponse } from 'next/server';
import { createSubscriptionCheckout, hasStripeConfig, type BillingPlan } from '../../../../lib/stripe';
import { normalizeUkPhone } from '../../../../lib/supabase';
import { rateLimited, clientIp } from '../../../../lib/ratelimit';

// Start a real Lekhio subscription. The page posts the chosen plan and any founder
// offer, we create a Stripe Checkout session with a 14 day free trial, and return
// the hosted URL for the browser to redirect to. No card details ever touch us.

function str(v: unknown, max = 200): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

export async function POST(req: NextRequest) {
  if (!hasStripeConfig()) {
    return NextResponse.json({ error: 'billing_not_configured' }, { status: 503 });
  }

  // This endpoint is unauthenticated by design (pre-signup funnel), so throttle
  // per IP to stop mass creation of Stripe Checkout sessions with arbitrary
  // emails. A genuine buyer is never near this limit.
  if (rateLimited(`checkout:${clientIp(req)}`, 12, 10 * 60 * 1000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
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
  const repCode = str(body.rep, 40).trim() || null; // a field rep's code, unlocks the 30 day trial

  const base = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, '');

  const url = await createSubscriptionCheckout({
    plan,
    offer,
    email,
    phone,
    repCode,
    successUrl: `${base}/start?billing=success`,
    cancelUrl: `${base}/start?billing=cancelled`,
  });

  if (!url) {
    return NextResponse.json({ error: 'checkout_failed' }, { status: 502 });
  }
  return NextResponse.json({ url });
}

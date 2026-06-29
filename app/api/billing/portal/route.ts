import { NextRequest, NextResponse } from 'next/server';
import { createBillingPortal, hasStripeConfig } from '../../../../lib/stripe';
import { getStripeCustomerByEmail } from '../../../../lib/supabase';

// Open the Stripe billing portal for a subscriber, so they can update their card,
// switch plan, or cancel. We look up their Stripe customer from their email, then
// hand back the portal URL. Cancellation and refunds stay entirely in Stripe's
// own UI, which is the safe place for them to live.

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
    // ignore
  }

  const email = str(body.email, 200).trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: 'email_required' }, { status: 400 });
  }

  const customerId = await getStripeCustomerByEmail(email);
  if (!customerId) {
    return NextResponse.json({ error: 'no_subscription' }, { status: 404 });
  }

  const base = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, '');
  const url = await createBillingPortal(customerId, `${base}/`);
  if (!url) {
    return NextResponse.json({ error: 'portal_failed' }, { status: 502 });
  }
  return NextResponse.json({ url });
}

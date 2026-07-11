import { NextRequest, NextResponse } from 'next/server';
import { createBillingPortal, hasStripeConfig } from '../../../../lib/stripe';
import { getStripeCustomerByEmail, verifyAccessToken } from '../../../../lib/supabase';

// Open the Stripe billing portal for the SIGNED-IN subscriber only. The email is
// taken from the verified Supabase token, never from the request body, so nobody
// can open another person's billing portal by guessing their email. Cancellation
// and refunds live in Stripe's own UI, which is the safe place for them.

export async function POST(req: NextRequest) {
  if (!hasStripeConfig()) {
    return NextResponse.json({ error: 'billing_not_configured' }, { status: 503 });
  }

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const verified = await verifyAccessToken(token);
  if (!verified) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const email = (verified.email || '').trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: 'no_email_on_account' }, { status: 400 });
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

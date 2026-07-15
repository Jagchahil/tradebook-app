import { NextRequest, NextResponse } from 'next/server';
import { createBillingPortal, hasStripeConfig } from '../../../../lib/stripe';
import { getStripeCustomerByEmail, getStripeCustomerByPhone, verifyAccessToken } from '../../../../lib/supabase';

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

  // The account key is the phone, but some accounts also carry an email. Try email
  // first (how Stripe historically keyed the customer), then fall back to the phone
  // from the verified token, so a phone-only account can still reach its portal.
  const email = (verified.email || '').trim().toLowerCase();
  const phone = ((verified as { phone?: string | null }).phone || '').trim();
  if (!email && !phone) {
    return NextResponse.json({ error: 'no_identifier_on_account' }, { status: 400 });
  }

  let customerId = email ? await getStripeCustomerByEmail(email) : null;
  if (!customerId && phone) customerId = await getStripeCustomerByPhone(phone);
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

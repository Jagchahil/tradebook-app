import { NextRequest, NextResponse } from 'next/server';
import { createBillingPortal, hasStripeConfig } from '../../../../lib/stripe';
import { getStripeCustomerByEmail, getStripeCustomerByPhone } from '../../../../lib/supabase';
import { sessionUser, identityForUser } from '../../../../lib/webauth';

// Open the Stripe billing portal for the SIGNED-IN subscriber only. The email is
// taken from the verified Supabase token, never from the request body, so nobody
// can open another person's billing portal by guessing their email. Cancellation
// and refunds live in Stripe's own UI, which is the safe place for them.

export async function POST(req: NextRequest) {
  if (!hasStripeConfig()) {
    return NextResponse.json({ error: 'billing_not_configured' }, { status: 503 });
  }

  const verified = await sessionUser(req);
  if (!verified) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // The account key is the phone, but some accounts also carry an email. Try email
  // first (how Stripe historically keyed the customer), then fall back to the phone
  // from the verified token, so a phone-only account can still reach its portal.
  // ⚠️ BOTH COME FROM identityForUser, NOT FROM THE SESSION. The cast that used to read the phone
  // off the verified token would have quietly become undefined the moment this route accepted a
  // cookie, and the phone fallback exists precisely for accounts that have no email. A fallback that
  // silently stops firing is worse than no fallback: the man just gets 400 no_identifier_on_account
  // on his own billing page and nothing in a log says why.
  const identity = await identityForUser(verified);
  const email = (identity.email || '').trim().toLowerCase();
  const phone = (identity.phone || '').trim();
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

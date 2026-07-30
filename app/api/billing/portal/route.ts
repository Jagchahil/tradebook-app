import { NextRequest, NextResponse } from 'next/server';
import { createBillingPortal, hasStripeConfig } from '../../../../lib/stripe';
import { getStripeCustomerByEmail, getStripeCustomerByPhone } from '../../../../lib/supabase';
import { sessionUser, identityForUser } from '../../../../lib/webauth';

// Open the Stripe billing portal for the SIGNED-IN subscriber only. The email is
// taken from the verified Supabase token, never from the request body, so nobody
// can open another person's billing portal by guessing their email. Cancellation
// and refunds live in Stripe's own UI, which is the safe place for them.

// ⚠️ A FORM CALLER NEVER SEES JSON. Same rule as /api/whatsapp/link and /api/bank/connect. The
// account page is server rendered with no client script, so its button is a plain form post, and a
// man pressing "Manage your subscription" must land in Stripe or back on his account page with a
// sentence he can act on. He must never be shown {"error":"portal_failed"}.
//
// The app still calls this with a Bearer token and still wants JSON, so the two callers are told
// apart by what they ask for rather than by a flag somebody has to remember to set.
function wantsJson(req: NextRequest): boolean {
  if ((req.headers.get('authorization') || '').startsWith('Bearer ')) return true;
  return (req.headers.get('accept') || '').includes('application/json');
}

export async function POST(req: NextRequest) {
  const asJson = wantsJson(req);
  const back = (why: string) => NextResponse.redirect(new URL(`/account?problem=${why}`, req.url), 303);

  if (!hasStripeConfig()) {
    return asJson ? NextResponse.json({ error: 'billing_not_configured' }, { status: 503 }) : back('unavailable');
  }

  const verified = await sessionUser(req);
  if (!verified) {
    return asJson ? NextResponse.json({ error: 'unauthorized' }, { status: 401 })
      : NextResponse.redirect(new URL('/in?next=/account', req.url), 303);
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
    return asJson ? NextResponse.json({ error: 'no_identifier_on_account' }, { status: 400 }) : back('noidentifier');
  }

  let customerId = email ? await getStripeCustomerByEmail(email) : null;
  if (!customerId && phone) customerId = await getStripeCustomerByPhone(phone);
  if (!customerId) {
    return asJson ? NextResponse.json({ error: 'no_subscription' }, { status: 404 }) : back('nosub');
  }

  const base = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, '');
  const url = await createBillingPortal(customerId, `${base}/`);
  if (!url) {
    return asJson ? NextResponse.json({ error: 'portal_failed' }, { status: 502 }) : back('unavailable');
  }
  // Stripe's portal is another origin, so this is a plain redirect out rather than a router push.
  return asJson ? NextResponse.json({ url }) : NextResponse.redirect(url, 303);
}

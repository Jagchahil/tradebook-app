import { NextRequest, NextResponse } from 'next/server';
import { createSubscriptionCheckout, hasStripeConfig, type BillingPlan } from '../../../../lib/stripe';
import { normalizeUkPhone } from '../../../../lib/supabase';
import { rateLimitedShared, clientIp } from '../../../../lib/ratelimit';
import { sessionUser, identityForUser } from '../../../../lib/webauth';
import { isStep } from '../../../../lib/onboarding';

// Start a real Lekhio subscription. The page posts the chosen plan and any founder
// offer, we create a Stripe Checkout session with a 7 day free trial, and return
// the hosted URL for the browser to redirect to. No card details ever touch us.

function str(v: unknown, max = 200): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

export async function POST(req: NextRequest) {
  if (!hasStripeConfig()) {
    // ⚠️ The setup page only draws the card when Stripe is configured, so reaching this from a form
    // means something changed under him mid journey. He is taken into his books rather than shown an
    // error object: his trial is already running and nothing about it depends on this.
    if ((req.headers.get('content-type') || '').includes('application/x-www-form-urlencoded')) {
      return NextResponse.redirect(new URL('/app?card=unavailable', req.url), 303);
    }
    return NextResponse.json({ error: 'billing_not_configured' }, { status: 503 });
  }

  // This endpoint is unauthenticated by design (pre-signup funnel), so throttle
  // per IP to stop mass creation of Stripe Checkout sessions with arbitrary
  // emails. A genuine buyer is never near this limit.
  if (await rateLimitedShared(`checkout:${clientIp(req)}`, 12, 10 * 60 * 1000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  // TWO ENCODINGS. The pre signup funnel on /start posts JSON; the card at the end of setting up is a
  // plain form, because /app/setup ships no client script.
  const isForm = (req.headers.get('content-type') || '').includes('application/x-www-form-urlencoded');
  let body: Record<string, unknown> = {};
  if (isForm) {
    const f = await req.formData().catch(() => null);
    if (f) body = Object.fromEntries([...f.entries()].map(([k, v]) => [k, String(v)]));
  } else {
    try {
      body = await req.json();
    } catch {
      // empty body is fine, defaults apply
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 IF HE IS SIGNED IN, HIS IDENTITY COMES FROM THE SESSION AND THE BODY IS IGNORED.
  //
  // This route is unauthenticated by design, because most of its traffic is a stranger on /start who
  // has no account yet. That is fine while the identity it carries is only used to prefill a Stripe
  // form. It is NOT fine now that the same route can bind a subscription to an account: a body that
  // could name a user id would let anyone attach their own card to somebody else's books, or worse,
  // attach a cancelled one.
  //
  // So the account id is never read from the request. It is resolved from the cookie, or it is null,
  // and null simply means the old pre signup behaviour. The email follows the same rule: the one on
  // his account beats the one he typed, because they are the same person and only one is proved.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const user = await sessionUser(req);
  const identity = user ? await identityForUser(user).catch(() => null) : null;

  const plan: BillingPlan = str(body.plan, 16).toLowerCase() === 'annual' ? 'annual' : 'monthly';
  const offer = str(body.offer, 40);
  const email = (identity?.email || str(body.email, 200).trim()) || null;
  const phone = normalizeUkPhone(str(body.phone, 20)) || null; // E.164 +44, the account key
  const repCode = str(body.rep, 40).trim() || null; // a field rep's code, unlocks the 30 day trial

  const base = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, '');

  // Where Stripe sends him back to. A stranger on /start goes back to /start; a customer adding his
  // card at the end of setting up goes back into his own books, because that is where he was.
  //
  // ⚠️ THE RETURN IS A STEP NAME, NEVER A URL, for the same reason every other form in setup carries
  // one: a `return=` field on a route that can be posted from anywhere is an open redirect.
  const from = str(body.step, 20);
  const inSetup = Boolean(user) && isStep(from);
  const successUrl = inSetup ? `${base}/app?card=on` : `${base}/start?billing=success`;
  const cancelUrl = inSetup ? `${base}/app/setup?step=${from}&card=cancelled` : `${base}/start?billing=cancelled`;

  const url = await createSubscriptionCheckout({
    plan,
    offer,
    email,
    phone,
    repCode,
    userId: user?.id ?? null,
    successUrl,
    cancelUrl,
  });

  if (!url) {
    // A form caller never sees JSON. He goes back to the step, which says plainly that the card
    // could not be started and that his trial is running either way.
    if (isForm) {
      return NextResponse.redirect(
        new URL(inSetup ? `/app/setup?step=${from}&card=failed` : '/start?billing=cancelled', req.url),
        303,
      );
    }
    return NextResponse.json({ error: 'checkout_failed' }, { status: 502 });
  }
  // 303 so the back button does not re-post and open a second checkout session.
  if (isForm) return NextResponse.redirect(url, 303);
  return NextResponse.json({ url });
}

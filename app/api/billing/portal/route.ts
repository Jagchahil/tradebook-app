import { NextRequest, NextResponse } from 'next/server';
import { createBillingPortal, hasStripeConfig } from '../../../../lib/stripe';
import { getStripeCustomerForAccount } from '../../../../lib/supabase';
import { sessionUser, identityForUser } from '../../../../lib/webauth';

// Open the Stripe billing portal for the SIGNED IN subscriber only. Cancellation, card changes
// and our invoices live in Stripe's own UI, which is the safe place for them.
//
// 🔴 THE CUSTOMER IS RESOLVED FROM THE SESSION AND NOTHING ELSE. This route never reads the
// request body at all: no JSON, no form fields, nothing. Every key that finds the Stripe customer
// (the account id, the email, the phone) comes from the verified session and our own subscription
// rows, through getStripeCustomerForAccount, account first then email then phone. A body that
// could name a customer id would let anyone open another man's billing portal, so the safest body
// is one that is never opened.
//
// ⚠️ AND IT IS NEVER GATED ON ENTITLEMENT. lib/gate.ts marks it 'always': the man most in need of
// this route is the one whose subscription has lapsed, and a portal you must be paid up to reach
// is a cancellation you must pay for.

// ⚠️ A FORM CALLER NEVER SEES JSON. Same rule as /api/whatsapp/link and /api/bank/connect. The
// billing page is server rendered with no client script, so its button is a plain form post, and
// a man pressing it must land in Stripe or back on his billing page with a sentence he can act
// on. He must never be shown {"error":"portal_failed"}.
//
// The app still calls this with a Bearer token and still wants JSON, so the two callers are told
// apart by what they ask for rather than by a flag somebody has to remember to set.
function wantsJson(req: NextRequest): boolean {
  if ((req.headers.get('authorization') || '').startsWith('Bearer ')) return true;
  return (req.headers.get('accept') || '').includes('application/json');
}

// Where a form caller belongs: the billing page that carries the button. The old /account page
// still posts here too, but with a Bearer token, so it stays on the JSON side of the split.
const BILLING_PAGE = '/app/you/billing';

export async function POST(req: NextRequest) {
  const asJson = wantsJson(req);
  const back = (why: string) => NextResponse.redirect(new URL(`${BILLING_PAGE}?problem=${why}`, req.url), 303);

  if (!hasStripeConfig()) {
    return asJson ? NextResponse.json({ error: 'billing_not_configured' }, { status: 503 }) : back('unavailable');
  }

  const verified = await sessionUser(req);
  if (!verified) {
    return asJson ? NextResponse.json({ error: 'unauthorized' }, { status: 401 })
      : NextResponse.redirect(new URL(`/in?next=${BILLING_PAGE}`, req.url), 303);
  }

  // ⚠️ BOTH IDENTITY KEYS COME FROM identityForUser, NOT FROM THE SESSION FIELDS. The cast that
  // used to read the phone off the verified token would have quietly become undefined the moment
  // this route accepted a cookie, and the phone fallback exists precisely for accounts that have
  // no email. A fallback that silently stops firing is worse than no fallback: the man just gets
  // "no subscription" on his own billing page and nothing in a log says why.
  const identity = await identityForUser(verified);
  const customerId = await getStripeCustomerForAccount(
    verified.id,
    (identity.email ?? '').trim().toLowerCase() || null,
    (identity.phone ?? '').trim() || null,
  );
  if (!customerId) {
    return asJson ? NextResponse.json({ error: 'no_subscription' }, { status: 404 }) : back('nosub');
  }

  // Back to the billing page when he is done in Stripe. NEXT_PUBLIC_APP_URL, never a hardcoded
  // domain: the domain lesson at the top of CLAUDE.md was learned the expensive way.
  const base = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, '');
  const url = await createBillingPortal(customerId, `${base}${BILLING_PAGE}`);
  if (!url) {
    return asJson ? NextResponse.json({ error: 'portal_failed' }, { status: 502 }) : back('unavailable');
  }
  // Stripe's portal is another origin, so this is a plain redirect out rather than a router push.
  // form-action in next.config.mjs names *.stripe.com for exactly this hop; see test/csp.test.mjs.
  return asJson ? NextResponse.json({ url }) : NextResponse.redirect(url, 303);
}

import { NextRequest, NextResponse } from 'next/server';
import { getPublicInvoice } from '../../../../lib/supabase';
import { createInvoiceCheckout, hasStripeConfig, hasInvoicePayoutRoute } from '../../../../lib/stripe';
import { rateLimitedShared, clientIp } from '../../../../lib/ratelimit';

// The card payment door for one invoice. It creates a Stripe Checkout session and
// redirects the payer to it. If the invoice's owner has no payout route, or Stripe
// is not set up, or the invoice is already paid, it sends them back to the invoice.
//
// 🔴 THE PAYOUT ROUTE CHECK COMES FIRST. A session minted here charges OUR Stripe
// account, so without a route onward to the tradesman his customer's money would
// land with Lekhio and stop there, which is the worst class of bug this product
// can have: see hasInvoicePayoutRoute in lib/stripe.ts. Today no owner has a
// route, the invoice page draws no link here, and this endpoint exists only so a
// link in an old tab dies politely on the invoice rather than on a 404.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const origin = req.nextUrl.origin;
  const invoiceUrl = `${origin}/invoice/${id}`;

  // No payout route, no checkout. createInvoiceCheckout refuses too; this early
  // return just spares the rate limiter and the database a pointless read.
  if (!hasInvoicePayoutRoute()) return NextResponse.redirect(invoiceUrl, 303);

  // Throttle so this open endpoint cannot be used to mass create Stripe
  // Checkout sessions. On the limit, send the customer back to the invoice
  // rather than erroring, so a genuine payer is never blocked.
  if (await rateLimitedShared(`pay:${clientIp(req)}`, 20, 10 * 60 * 1000)) {
    return NextResponse.redirect(invoiceUrl, 303);
  }

  const invoice = await getPublicInvoice(id).catch(() => null);
  if (!invoice || invoice.status === 'paid' || !hasStripeConfig()) {
    return NextResponse.redirect(invoiceUrl, 303);
  }

  const email =
    invoice.customer_contact && invoice.customer_contact.includes('@')
      ? invoice.customer_contact
      : null;

  const url = await createInvoiceCheckout({
    invoiceId: id,
    number: invoice.number,
    total: invoice.total,
    customerEmail: email,
    successUrl: `${invoiceUrl}?paid=1`,
    cancelUrl: invoiceUrl,
  });

  return NextResponse.redirect(url ?? invoiceUrl, 303);
}

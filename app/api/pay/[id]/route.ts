import { NextRequest, NextResponse } from 'next/server';
import { getPublicInvoice } from '../../../../lib/supabase';
import { createInvoiceCheckout, hasStripeConfig } from '../../../../lib/stripe';

// The customer hits this from the Pay now button on the invoice page. It creates
// a Stripe Checkout session and redirects them to it. If Stripe is not set up,
// or the invoice is already paid, it just sends them back to the invoice.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const origin = req.nextUrl.origin;
  const invoiceUrl = `${origin}/invoice/${id}`;

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

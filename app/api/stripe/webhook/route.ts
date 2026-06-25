import { NextRequest, NextResponse } from 'next/server';
import { verifyStripeSignature } from '../../../../lib/stripe';
import { markInvoicePaidServer } from '../../../../lib/supabase';

// Stripe calls this when a payment completes. We verify the signature, then mark
// the matching invoice paid and book the income. Always answer 200 for genuine
// Stripe traffic so it is not retried into duplicate work.
export async function POST(req: NextRequest) {
  const raw = await req.text();

  if (!verifyStripeSignature(raw, req.headers.get('stripe-signature'))) {
    return new NextResponse('Invalid signature', { status: 401 });
  }

  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data?.object ?? {};
      const metadata = (session.metadata ?? {}) as Record<string, string>;
      const invoiceId = metadata.invoice_id || (session.client_reference_id as string | undefined);
      if (invoiceId) {
        await markInvoicePaidServer(invoiceId);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[stripe webhook] Handler error:', message);
  }

  return NextResponse.json({ ok: true });
}

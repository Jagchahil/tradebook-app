import { NextRequest, NextResponse } from 'next/server';
import { verifyStripeSignature, getStripeSubscription } from '../../../../lib/stripe';
import { markInvoicePaidServer, upsertSubscription, SubscriptionRecord } from '../../../../lib/supabase';

// Stripe calls this for two kinds of money:
//   1. A customer paying one of our users' invoices (mode: payment).
//   2. A user subscribing to Lekhio itself (mode: subscription).
// We verify the signature, then route on the event. Always answer 200 for genuine
// Stripe traffic so it is not retried into duplicate work.

// Turn a Stripe subscription object into the row we store. Pulls the live price
// and renewal date so the record is always current, however the event arrived.
function subscriptionRowFrom(sub: Record<string, unknown>): SubscriptionRecord | null {
  const id = sub.id as string | undefined;
  if (!id) return null;

  const metadata = (sub.metadata ?? {}) as Record<string, string>;
  const items = ((sub.items as Record<string, unknown> | undefined)?.data as Array<Record<string, unknown>> | undefined) ?? [];
  const price = (items[0]?.price ?? {}) as Record<string, unknown>;
  const recurring = (price.recurring ?? {}) as Record<string, unknown>;
  const interval = recurring.interval as string | undefined;

  const amountFromPrice = typeof price.unit_amount === 'number' ? (price.unit_amount as number) : undefined;
  const amountFromMeta = metadata.amount_pence ? Number(metadata.amount_pence) : undefined;

  const periodEnd = typeof sub.current_period_end === 'number' ? (sub.current_period_end as number) : undefined;

  const row: SubscriptionRecord = {
    stripe_subscription_id: id,
    status: (sub.status as string | undefined) ?? null,
    plan: metadata.plan || (interval === 'year' ? 'annual' : interval === 'month' ? 'monthly' : null),
    offer: metadata.offer || null,
    amount_pence: amountFromPrice ?? amountFromMeta ?? null,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: typeof sub.cancel_at_period_end === 'boolean' ? (sub.cancel_at_period_end as boolean) : null,
  };
  if (typeof sub.customer === 'string') row.stripe_customer_id = sub.customer;
  return row;
}

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
    const obj = event.data?.object ?? {};

    if (event.type === 'checkout.session.completed') {
      const metadata = (obj.metadata ?? {}) as Record<string, string>;
      const isSubscription = metadata.kind === 'subscription' || obj.mode === 'subscription';

      if (isSubscription) {
        // A user just subscribed to Lekhio. Read the full subscription for its
        // live status and renewal date, then store it with the email and offer.
        const subId = obj.subscription as string | undefined;
        const customer = (typeof obj.customer === 'string' ? obj.customer : undefined) ?? undefined;
        const details = (obj.customer_details ?? {}) as Record<string, unknown>;
        const email = (details.email as string | undefined) || (obj.customer_email as string | undefined) || null;

        if (subId) {
          const sub = await getStripeSubscription(subId);
          const row = sub ? subscriptionRowFrom(sub) : null;
          if (row) {
            if (email) row.email = email;
            if (customer) row.stripe_customer_id = customer;
            await upsertSubscription(row);
          } else {
            // Fall back to what the session already gave us, so we never lose a sale.
            await upsertSubscription({
              stripe_subscription_id: subId,
              email,
              stripe_customer_id: customer ?? null,
              plan: metadata.plan || null,
              offer: metadata.offer || null,
              amount_pence: metadata.amount_pence ? Number(metadata.amount_pence) : null,
              status: 'trialing',
            });
          }
        }
      } else {
        // A customer paid one of our users' invoices.
        const invoiceId = metadata.invoice_id || (obj.client_reference_id as string | undefined);
        if (invoiceId) {
          await markInvoicePaidServer(invoiceId);
        }
      }
    } else if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      // Trial ending, payment succeeding or failing, plan change, cancellation.
      const row = subscriptionRowFrom(obj);
      if (row) {
        if (event.type === 'customer.subscription.deleted') row.status = 'canceled';
        await upsertSubscription(row);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[stripe webhook] Handler error:', message);
  }

  return NextResponse.json({ ok: true });
}

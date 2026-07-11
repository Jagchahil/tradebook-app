import { NextRequest, NextResponse } from 'next/server';
import { verifyStripeSignature, getStripeSubscription } from '../../../../lib/stripe';
import { markInvoicePaidServer, upsertSubscription } from '../../../../lib/supabase';
import { claimResultFromStatus, subscriptionRowFrom, ClaimResult } from '../../../../lib/stripewebhook';

// Stripe calls this for two kinds of money:
//   1. A customer paying one of our users' invoices (mode: payment).
//   2. A user subscribing to Lekhio itself (mode: subscription).
// We verify the signature, claim the event id once for idempotency, then route
// on the event. Always answer 200 for genuine Stripe traffic so it is not
// retried into duplicate work.

// Idempotency claim. Stripe re-delivers an event if we are slow to answer 200,
// so before any state mutation we try to insert the event id into stripe_events
// with the service role key. The primary key makes this atomic:
//   201  first time we have seen this event  -> proceed
//   409  we already processed it             -> caller returns 200, does nothing
//   anything else (network, config)          -> fail open (process), but log it,
//                                               so a real event is never dropped.
// Never store event contents here, only the id and type. The pure status->result
// mapping (and its fail-open policy) lives in lib/stripewebhook.ts and is unit
// tested; this wrapper only owns the network insert.
async function claimStripeEvent(id: string, type: string | undefined): Promise<ClaimResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    // Fail open. If Supabase is not configured for some reason, we would rather
    // process a genuine, signature-verified event than silently drop it.
    console.error('[stripe webhook] Idempotency store not configured, processing without claim.');
    return 'new';
  }
  try {
    const res = await fetch(`${url}/rest/v1/stripe_events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ id, type: type ?? null }),
    });
    if (res.status !== 201 && res.status !== 409) {
      // Unexpected status is logged, then treated as 'new' (fail open) below.
      console.error('[stripe webhook] Unexpected idempotency claim status:', res.status);
    }
    return claimResultFromStatus(res.status);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[stripe webhook] Idempotency claim failed, processing anyway:', message);
    return 'new';
  }
}

export async function POST(req: NextRequest) {
  const raw = await req.text();

  if (!verifyStripeSignature(raw, req.headers.get('stripe-signature'))) {
    return new NextResponse('Invalid signature', { status: 401 });
  }

  let event: { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }

  // Idempotency: claim this event id before touching any state. A duplicate
  // delivery is acknowledged with 200 and does no work. Events without an id
  // (should not happen for real Stripe traffic) simply skip the claim.
  if (event.id) {
    const claim = await claimStripeEvent(event.id, event.type);
    if (claim === 'duplicate') {
      return NextResponse.json({ ok: true, duplicate: true });
    }
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
        const phone = metadata.phone || null; // the account key, from the session metadata

        if (subId) {
          const sub = await getStripeSubscription(subId);
          const row = sub ? subscriptionRowFrom(sub) : null;
          if (row) {
            if (email) row.email = email;
            if (customer) row.stripe_customer_id = customer;
            if (phone && !row.phone) row.phone = phone;
            await upsertSubscription(row);
          } else {
            // Fall back to what the session already gave us, so we never lose a sale.
            await upsertSubscription({
              stripe_subscription_id: subId,
              email,
              phone,
              stripe_customer_id: customer ?? null,
              plan: metadata.plan || null,
              offer: metadata.offer || null,
              amount_pence: metadata.amount_pence ? Number(metadata.amount_pence) : null,
              status: 'trialing',
            });
          }
        }
      } else {
        // A customer paid one of our users' invoices. Only book it if Stripe
        // actually collected the money, and verify the amount inside.
        const invoiceId = metadata.invoice_id || (obj.client_reference_id as string | undefined);
        const paid = obj.payment_status === 'paid' || obj.payment_status === 'no_payment_required';
        if (invoiceId && paid) {
          await markInvoicePaidServer(invoiceId, {
            paidPence: typeof obj.amount_total === 'number' ? (obj.amount_total as number) : undefined,
            currency: typeof obj.currency === 'string' ? (obj.currency as string) : undefined,
          });
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

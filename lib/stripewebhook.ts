// lib/stripewebhook.ts. The pure decision logic behind the Stripe webhook.
//
// This holds the two security sensitive, side effect free pieces of the Stripe
// webhook so they can be unit tested without standing up Next.js or Stripe:
//   1. claimResultFromStatus: how a stripe_events insert status maps to a
//      proceed/skip decision for idempotency (the anti double-charge gate).
//   2. subscriptionRowFrom: turning a Stripe subscription object into the row
//      we persist, including the amount and account key we book money against.
//
// The route (app/api/stripe/webhook/route.ts) imports both. Keeping them here,
// framework free, is the same discipline as lib/waintents.ts and lib/bankfeed.ts:
// the logic that must be correct lives in a tested module, the route only wires.

import type { SubscriptionRecord } from './supabase';

// Idempotency decision. Before any state mutation the webhook tries to insert
// the event id into stripe_events with the service role key. The primary key
// makes the insert atomic, and the HTTP status tells us what happened:
//   201  first time we have seen this event   -> 'new'      (proceed)
//   409  primary key conflict, already seen    -> 'duplicate' (do nothing, 200)
//   anything else (network, misconfig, 5xx)    -> 'new'      (FAIL OPEN)
//
// Fail open is deliberate: a signature verified Stripe event is real money, and
// dropping one silently is worse than the small risk of reprocessing. The
// downstream handlers are themselves defensive (amount and currency are checked
// before booking an invoice as paid), so a rare reprocess does not double count.
export type ClaimResult = 'new' | 'duplicate';

export function claimResultFromStatus(status: number): ClaimResult {
  if (status === 201) return 'new';
  if (status === 409) return 'duplicate';
  return 'new'; // unexpected: fail open so a genuine event is never lost
}

// Turn a Stripe subscription object into the row we store. Pulls the live price
// and renewal date so the record is always current, however the event arrived
// (checkout.session.completed, or a later customer.subscription.* event). The
// amount prefers the authoritative price.unit_amount and only falls back to the
// metadata we set at checkout. Returns null when there is no subscription id to
// key on, so a malformed event can never write a keyless row.
export function subscriptionRowFrom(sub: Record<string, unknown>): SubscriptionRecord | null {
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
  if (metadata.phone) row.phone = metadata.phone; // the account key, carried from checkout
  return row;
}

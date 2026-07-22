// The CRM contact model, layered on marketing_leads. PURE helpers only (no network), so the lifecycle
// rules are unit tested. The DB writes live in supabase.ts and use these constants and guards.

export const CONTACT_STAGES = ['lead', 'warming', 'checkout', 'trial', 'paid', 'dormant'] as const;
export type ContactStage = (typeof CONTACT_STAGES)[number];

export const CHECKOUT_STAGES = ['viewed', 'details_in', 'payment_opened', 'abandoned', 'paid'] as const;
export type CheckoutStage = (typeof CHECKOUT_STAGES)[number];

export const EVENT_KINDS = [
  'tool_used', 'form_submitted', 'wa_sent', 'wa_replied', 'email_sent', 'email_opened',
  'checkout_opened', 'checkout_abandoned', 'paid', 'note',
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export function isContactStage(s: string): s is ContactStage { return (CONTACT_STAGES as readonly string[]).includes(s); }
export function isCheckoutStage(s: string): s is CheckoutStage { return (CHECKOUT_STAGES as readonly string[]).includes(s); }
export function isEventKind(k: string): k is EventKind { return (EVENT_KINDS as readonly string[]).includes(k); }

// A contact only ever moves FORWARD through the lifecycle, mirroring Hoka's forward-only content
// pipeline: no silent regressions. `paid` never regresses; `dormant` is a side state that can be set
// from anywhere (a lapse) and is left behind the moment they re-engage. Returns the stage to store.
const ORDER: Record<ContactStage, number> = { lead: 0, warming: 1, checkout: 2, trial: 3, paid: 4, dormant: 0 };
export function advanceStage(current: ContactStage, next: ContactStage): ContactStage {
  if (next === 'dormant') return 'dormant';                 // a lapse can be marked from any stage
  if (current === 'dormant') return next;                   // any real activity wakes a dormant contact
  if (current === 'paid') return 'paid';                    // paid is terminal, never walk it back
  return ORDER[next] >= ORDER[current] ? next : current;    // otherwise only ever forward
}

// Normalise a phone into a bare E.164-ish string for the whatsapp column: a leading + and 7 to 15
// digits. Returns null for anything that cannot be a real number, so we never store junk.
export function normaliseWhatsapp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return trimmed.startsWith('+') ? '+' + digits : digits;
}

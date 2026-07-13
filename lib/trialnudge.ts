// THE TRIAL IS ENDING. TELL HIM, ON WHATSAPP, BEFORE HE FINDS OUT BY BEING LOCKED OUT.
//
// ---------------------------------------------------------------------------------------------
// WHY THIS IS ALLOWED, AND WHY THE SAME WORDS WOULD GET US REJECTED INSIDE THE APP
//
// The app may not contain a price, a checkout, or any nudge towards paying us. That is App Store
// Review Guideline 3.1.3(f), and it is the rule that lets us keep 82% of the subscription instead
// of 70%:
//
//     "Free apps acting as a stand-alone companion to a paid web based tool (i.e. VoIP, Cloud
//      Storage, Email Services, Web Hosting) do not need to use in-app purchase, provided there is
//      no purchasing inside the app, or calls to action for purchase outside of the app."
//
// So a man's trial ends and the app cannot tell him where to go. That is a dead end, and it would
// lose us the customer at the exact moment he has decided we are worth paying for.
//
// But Apple draws the line at the app, not at the customer. Guideline 3.1.3, the preamble to that
// same section, in Apple's own words:
//
//     "Developers can send communications outside of the app to their user base about purchasing
//      methods other than in-app purchase."
//
// We are a WhatsApp product. He came to us on WhatsApp. Telling him there, plainly, is compliant,
// and it is also just the decent thing to do.
//
// ---------------------------------------------------------------------------------------------
// TWO MESSAGES. THAT IS THE WHOLE BUDGET.
//
// Day 11: three days left. Early enough to decide, late enough to have formed a habit.
// Day 14: it has ended. Where his books are, and that nothing has been deleted.
//
// Not day 7, not day 13, not a countdown. He is up a ladder. Doc 103's alignment test: a message
// that exists to serve our funnel rather than his day is a message that teaches him to mute us.
//
// ---------------------------------------------------------------------------------------------
// ONLY OUR OWN TRIALS. NEVER A STRIPE ONE.
//
// A trial with a stripe_subscription_id is a man who has already handed over a card. He will roll
// onto a paid plan by himself, and Stripe emails him about it. Telling him to "pick a plan" would
// be confusing and slightly insulting. This only ever speaks to the local, no card, 14 day grants
// that grantTrialIfNone() hands out.

export interface TrialRow {
  phone: string | null;
  status: string | null;
  current_period_end: string | null;
  stripe_subscription_id?: string | null;
  trial_warn_sent_at?: string | null;
  trial_end_sent_at?: string | null;
}

export type Nudge = 'warn' | 'ended' | null;

// Three days left, i.e. day 11 of 14.
export const WARN_DAYS_BEFORE = 3;

const DAY = 24 * 3600 * 1000;

export function daysLeft(end: string | null | undefined, now: Date = new Date()): number | null {
  if (!end) return null;
  const t = new Date(end).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - now.getTime()) / DAY);
}

export function decideTrialNudge(row: TrialRow, now: Date = new Date()): Nudge {
  if (!row.phone) return null;
  if ((row.status || '').toLowerCase() !== 'trialing') return null;

  // A card is on file. Stripe owns this conversation, not us.
  if (row.stripe_subscription_id) return null;

  const left = daysLeft(row.current_period_end, now);
  if (left === null) return null; // no end date: we do not know, so we say nothing

  // It has ended.
  if (left <= 0) {
    if (row.trial_end_sent_at) return null; // already told him. Once is enough.
    return 'ended';
  }

  // It is about to end.
  if (left <= WARN_DAYS_BEFORE) {
    if (row.trial_warn_sent_at) return null;
    return 'warn';
  }

  return null;
}

// The date he will read, in the form a man in Britain reads it. Never an ISO string.
export function humanDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Europe/London' });
}

// THE TEMPLATE PARAMETERS. The words themselves live in Meta's dashboard, because a template must
// be registered and approved before it can be sent outside the 24 hour window. The exact body text
// of both templates is written out in docs/39, so the thing we approve and the thing we mean stay
// the same thing.
//
// lekhio_trial_ending   {{1}} = the date it ends, e.g. "27 July"
// lekhio_trial_ended    no parameters
export const TEMPLATE_WARN = 'lekhio_trial_ending';
export const TEMPLATE_ENDED = 'lekhio_trial_ended';

export function templateFor(n: Exclude<Nudge, null>): string {
  return n === 'warn' ? TEMPLATE_WARN : TEMPLATE_ENDED;
}

export function paramsFor(n: Exclude<Nudge, null>, row: TrialRow): string[] {
  return n === 'warn' ? [humanDate(row.current_period_end)] : [];
}

// app/app/you/billing/words.ts. WHERE HE STANDS WITH US, IN FIXED SENTENCES.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ A SURFACE MODULE, NOT AN ENGINE, the same shape as app/app/you/identity.ts: no imports, no
// I/O, no clock beyond the date every caller passes in, so test/billingweb.test.mjs can stage it
// under bare node and attack every sentence directly.
//
// ⚠️ NOTHING HERE INVENTS A FIGURE. Every number and every date on the billing page comes off the
// subscription row, and a row that does not carry one gets a sentence with no number in it. A
// made up renewal date on a page about a man's money is the fastest way to teach him the page
// lies, and he only has to learn that once.
//
// ⚠️ AND THE LAPSED SENTENCES NEVER SUGGEST HIS BOOKS ARE GONE. lib/gate.ts is the law here:
// read only, never dark, and the copy says so in the same breath as the lapse.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export type BillingGate = 'open' | 'readonly';

// The shape lib/supabase.ts's SubscriptionStatus already has. Declared again rather than imported
// so this file stays import free and stageable; TypeScript checks the two structurally at every
// call site, so they cannot drift without the build going red.
export interface BillingRow {
  status: string | null;
  plan: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
}

export interface Standing {
  kind: 'trial' | 'paying' | 'lapsed' | 'ended' | 'none';
  lines: string[];
}

// "12 August 2026", or nothing at all. An unreadable date is never echoed and never guessed.
export function dateWords(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London',
  }).format(new Date(t));
}

// Whole days until the row's end date, rounded up so a trial with twelve hours left still says a
// day rather than none. Null when the row holds no readable date.
export function daysLeft(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - now.getTime()) / 86400000);
}

// The one honest paragraph at the top of the billing page.
//
// The GATE decides lapsed, not this file's own reading of the row: lib/gateserver.ts reads both
// keys and fails open, and a second opinion computed here is the two readers mistake this
// codebase keeps paying for. The row only chooses the WORDS once the gate has chosen the state.
export function standingFor(row: BillingRow | null, gate: BillingGate, now: Date): Standing {
  if (gate === 'readonly') {
    const first = (row?.status ?? '').toLowerCase() === 'canceled'
      ? 'Your subscription is cancelled, so Lekhio is reading only just now.'
      : 'Your trial has ended, so Lekhio is reading only just now.';
    return {
      kind: 'lapsed',
      lines: [first, 'Everything you have is still here and still yours to look at.'],
    };
  }

  const status = (row?.status ?? '').toLowerCase();
  if (!row || !status || status === 'none') {
    return {
      kind: 'none',
      lines: ['There is no subscription on this account yet, and nothing has been charged.'],
    };
  }

  if (status === 'trialing') {
    const left = daysLeft(row.current_period_end, now);
    const line = left === null || left <= 0
      ? 'You are on the free trial.'
      : left === 1
        ? 'You are on the free trial, with a day left.'
        : `You are on the free trial, with ${left} days left.`;
    return { kind: 'trial', lines: [line] };
  }

  if (status === 'active' || status === 'past_due') {
    const plan = (row.plan ?? '').toLowerCase();
    const lines: string[] = [
      plan === 'monthly'
        ? 'You are paying monthly.'
        : plan === 'annual' || plan === 'yearly'
          ? 'You are paying yearly.'
          : 'You are subscribed.',
    ];
    const when = dateWords(row.current_period_end);
    if (row.cancel_at_period_end) {
      lines.push(when
        ? `You have cancelled. It runs until ${when}, and nothing is charged after that.`
        : 'You have cancelled. It runs to the end of what you have paid for, and nothing is charged after that.');
    } else if (when) {
      lines.push(`The next renewal is ${when}.`);
    }
    if (status === 'past_due') {
      lines.push('Your last payment did not go through, so Stripe is retrying your card. Nothing is locked while it does.');
    }
    return { kind: 'paying', lines };
  }

  // A terminal status the gate still lets through: canceled, unpaid, incomplete. The gate fails
  // open on purpose, so this page says what the row says and claims nothing more.
  return { kind: 'ended', lines: ['Your subscription has ended, and nothing more is charged.'] };
}

// ---- the door to Stripe --------------------------------------------------------------------

export const PORTAL_BUTTON = 'Manage card, invoices and cancelling';

export const PORTAL_UNDER =
  'Opens Stripe, our payment provider, in this tab. Change your card, download invoices, or '
  + 'cancel there. Cancelling stops the next charge and your records stay yours to read.';

// The trial without a card, said plainly rather than dressed up as a problem.
export const NO_CARD_LINE = 'No card on file. Nothing is charged during your trial.';

// The same fact once the trial has run out, when "during your trial" would no longer be true.
export const NO_CARD_LOCKED_LINE = 'No card on file. Add one and Lekhio gets back to work.';

// What the page says when the portal route sent him back with a flag. Fixed sentences chosen by
// a token, the identity.ts discipline: the page can never be talked into printing something a
// request put in the query string. An unknown token says nothing at all.
export function portalNotice(code: string | null | undefined): string | null {
  switch (code) {
    case 'nosub':
      return 'We could not find a Stripe customer for this account, so there is no billing to open there. If you have paid us and are seeing this, message us and we will sort it.';
    case 'unavailable':
      return 'We could not open Stripe just now. Nothing has changed, so try again in a minute.';
    default:
      return null;
  }
}

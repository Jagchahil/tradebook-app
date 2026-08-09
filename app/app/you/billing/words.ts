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

// WHAT THE GATE IS DOING ABOUT A MAN WITH NO SUBSCRIPTION ROW AT ALL, handed in by the page.
//
// ⚠️ WORKED OUT IN lib/gate.ts, NEVER HERE. This file may not reach for the age of an account or
// the length of a trial: that is the paywall's own arithmetic, it lives beside the rule it is the
// threshold of, and a second copy of it on a screen is the one way a screen and a paywall can come
// to disagree. This module only chooses sentences for an answer it is given.
//
// ⚠️ DECLARED AGAIN RATHER THAN IMPORTED, the BillingRow discipline above: no imports, so
// test/billingweb.test.mjs and test/trialstanding.test.mjs can stage this file under bare node.
// TypeScript checks it structurally against lib/gate.ts's NoRowTrial at the call site.
//
//   'grace'    the gate is holding his door open on the age of his account, which IS the free
//              trial a web signup gets. endsIso is the moment that stops, or null when we could
//              not read how old his account is.
//   'unknown'  we could not read his subscription. Nothing is locked, and we may not say he has
//              none, because we do not know that.
//   'off'      he has a row, or the caller has nothing to tell us. The row does the talking.
export type TrialWindow =
  | { kind: 'grace'; endsIso: string | null }
  | { kind: 'unknown' }
  | { kind: 'off' };

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

// THE ONE SENTENCE A MAN ON A FREE TRIAL READS, wherever his end date was established.
//
// ⚠️ ONE BUILDER, TWO POPULATIONS, WHICH IS THE POINT OF IT. A man handed a trialing row and a man
// let through on the age of his account are on the same free trial, in the same position, and are
// told the same thing in the same words. Neither branch below may grow sentences of its own.
//
// left and end are always read off ONE instant at each call site, so they cannot disagree; the
// null guard is belt and braces, and it says plainly that there is no date rather than printing
// the word null at a man who came here to find out where he stands.
export function trialLine(left: number | null, end: string | null): string {
  if (left === null || end === null) return 'You are on the free trial. We cannot show the date it ends.';
  if (left <= 0) return `You are on the free trial. It ends ${end}.`;
  if (left === 1) return `You are on the free trial, with a day left. It ends ${end}.`;
  return `You are on the free trial, with ${left} days left. It ends ${end}.`;
}

// The one honest paragraph at the top of the billing page.
//
// The GATE decides lapsed, not this file's own reading of the row: lib/gateserver.ts reads both
// keys and fails open, and a second opinion computed here is the two readers mistake this
// codebase keeps paying for. The row only chooses the WORDS once the gate has chosen the state.
export function standingFor(
  row: BillingRow | null,
  gate: BillingGate,
  now: Date,
  trial: TrialWindow = { kind: 'off' },
): Standing {
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
    // ═════════════════════════════════════════════════════════════════════════════════════════
    // 🔴 NO ROW IS NOT NO TRIAL, AND UNTIL 8 AUGUST 2026 THIS BRANCH SAID IT WAS.
    //
    // A real web signup gets no subscription row at all: his trial is granted on the age of his
    // account by the gate itself. Every one of them landed here and read "There is no subscription
    // on this account yet", two days into a trial he had just started, on the one screen that
    // exists to tell him where he stands. Technically true. Practically it reads as a signup that
    // went wrong, and it never once said when his trial ends, because the row it would have read
    // that off does not exist for him.
    //
    // ⚠️ SO THE FIRST QUESTION IS NOT "IS THERE A ROW" BUT "IS HE ON A TRIAL", and the only honest
    // answer to that comes from the gate, which is what TrialWindow carries in. On 'grace' he is
    // on a trial by the paywall's own reckoning, so he is told so in the same words as a man with
    // a granted row, and the day he is given is the day the paywall will act on.
    // ═════════════════════════════════════════════════════════════════════════════════════════
    if (trial.kind === 'grace') {
      // The SAME two readers the trialing branch below uses, over one instant, so the count and
      // the date cannot disagree, and neither can be shown when the other cannot.
      return {
        kind: 'trial',
        lines: [trialLine(daysLeft(trial.endsIso, now), dateWords(trial.endsIso))],
      };
    }

    // 🔴 WE COULD NOT SEE, WHICH IS NOT THE SAME AS HIM HAVING NOTHING. The gate opened his door
    // on exactly this failure of ours, so nothing of his is locked, and saying "there is no
    // subscription" here would state as fact the one thing we just failed to establish.
    if (trial.kind === 'unknown') {
      return {
        kind: 'none',
        lines: ['We cannot show your subscription just now, and nothing is locked while we cannot.'],
      };
    }

    // What is left: no row, and no trial running on the age of his account either. Said plainly.
    return {
      kind: 'none',
      lines: ['There is no subscription on this account yet, and nothing has been charged.'],
    };
  }

  if (status === 'trialing') {
    // 🔴 THE DATE ITSELF, NOT JUST A COUNTDOWN. Found 7 August 2026: nowhere told a man, or Jag
    // debugging a support message, the actual day a trial ends, only how many days were left of
    // it. A count is enough for "how long have I got" but useless for settling a specific account
    // against Stripe's own record of it, which is exactly the barber5 case, a trial reading
    // trialing to 13 August with no screen able to say so.
    //
    // ⚠️ left AND end COME OFF THE SAME FIELD, row.current_period_end, so they cannot disagree:
    // daysLeft and dateWords both run Date.parse on the identical string, and one is null only
    // when the other is too. Nothing here is computed from anything but the row the gate itself
    // reads (see the header above and lib/gateserver.ts), so this screen cannot disagree with the
    // paywall.
    const left = daysLeft(row.current_period_end, now);
    const end = dateWords(row.current_period_end);
    // 🔴 HONESTY: a trial with no readable end date says so plainly rather than staying silent
    // about it or, worse, guessing one from anything else on hand. grantTrial always sets one and
    // Stripe always sends one (lib/entitlement.ts), so this should be unreachable, but an
    // unreachable case is exactly where a guess is most tempting and least excusable. trialLine
    // holds that refusal for this branch and for the no row trial above, in one place.
    return { kind: 'trial', lines: [trialLine(left, end)] };
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

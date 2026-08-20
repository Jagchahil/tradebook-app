// WHAT WE ARE WAITING ON, WHO HOLDS THE DECISION, AND THE DAY A HUMAN LAST LOOKED.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY THIS FILE EXISTS. THE SAME DEFECT HAPPENED FOUR TIMES IN FOUR DAYS.
//
// A belief about somebody else's decision gets written into copy. A test is written to hold that
// copy in place. The world moves. The copy is now false, and the TEST IS WHAT KEEPS IT THERE,
// because the next person who tries to tell the truth has to delete a passing assertion to do it,
// and deleting a passing assertion feels like vandalism, so they leave it.
//
// The four, all recorded in the suites that carried them:
//   17 Aug 2026  test/llmstxt.test.mjs demanded "bank feed is built but not yet switched on".
//                Both halves were false: ICO had cleared us on 15 July and TrueLayer had declined.
//   20 Aug 2026  test/mtdclaims.test.mjs section 3 demanded the page say "filing itself is built"
//                and that what was left was "permission ... rather than a build".
//   20 Aug 2026  test/frontdoor.test.mjs demanded filingMark stay 'soon', "because HMRC recognition
//                genuinely is in flight".
//   20 Aug 2026  test/sabotage-b1banktruth.mjs ARMED AGAINST filingMark becoming 'planned'.
//
// Every one was written in good faith, by somebody who had just checked. NOT ONE WAS WRONG ON THE
// DAY IT WAS WRITTEN. They went wrong by sitting still, which is the one thing a test is for.
//
// ⚠️ SO THE FIX IS NOT A BETTER PATTERN. IT IS A CLOCK.
//
// A fact that belongs to somebody else has a shelf life, and this file is where the expiry date is
// written down. test/externalstate.test.mjs fails the build when one goes stale, and names the page
// to go and look at. That failure is not a bug in the test. It is the test doing the only job it
// has: making a human look again before the copy that rests on it goes out to another stranger.
//
// 🔴 BUMPING checkedOn WITHOUT LOOKING IS THE ONE WAY TO BREAK THIS. There is no way to stop you.
// There is no way to stop anybody. The friction is the whole mechanism, exactly as it is for the
// allowlist in test/mtdclaims.test.mjs, and the honest thing when you have not looked is to leave
// the build red.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export type WaitingOn = {
  // The handle used by the annotation a test writes when it has to mention this state.
  id: string;
  // Whose decision it actually is. If the answer is "ours", say so, because that changes what we
  // are allowed to promise: we may put a date on our own work and never on anyone else's.
  whose: string;
  // The state today, in one sentence, phrased the way the copy is allowed to phrase it.
  weBelieve: string;
  // What a human ACTUALLY looked at. Not what we infer, not what we were told second hand.
  evidence: string;
  // Where to go and look again. This is what the failure message prints.
  lookHere: string;
  // The day a human last looked, YYYY-MM-DD. Not the day the copy was edited.
  checkedOn: string;
  // How long this may sit unlooked at. Short when something is in flight and an answer could
  // arrive any day. Long when there is no counterparty and nothing can change without us.
  recheckAfterDays: number;
  // The exported names whose OFF wording rests on this belief. If one of these is edited, this
  // entry is what the editor should have read first.
  gates: string[];
};

export const WAITING_ON: WaitingOn[] = [
  {
    id: 'hmrc-production',
    whose: 'HMRC',
    weBelieve:
      'Production access has been asked for and has not been granted. There is no date, and we may not name one.',
    evidence:
      'HMRC Developer Hub, 20 August 2026: Lekhio is listed under Sandbox applications only, last API call '
      + '6 August 2026, and the production application reads "Credentials requested". Corroborated by every '
      + 'client secret notification arriving from noreply@test.tax.service.gov.uk, and by lib/hmrc.ts, which '
      + 'points at test-api.service.hmrc.gov.uk. No credential or secret was read, and none may ever be. '
      + 'Support ref 2026-SMT071, submitted 6 August, chased 20 August. On 10 August HMRC announced the market '
      + 'window for new 2026-27 quarterly update products had closed to requests submitted after 7 August.',
    lookHere: 'HMRC Developer Hub, the applications list, and the mailbox for a reply on ref 2026-SMT071',
    checkedOn: '2026-08-20',
    // Short, because a request is genuinely pending and the answer could land on any weekday. This
    // is the one entry where a stale clock costs us something: the day they say yes, four surfaces
    // change wording, and we would rather find that out from a red build than from a customer.
    recheckAfterDays: 14,
    gates: ['hmrcFilingLive', 'filingBadge', 'filingChip', 'filingMark', 'filingFaqAnswer'],
  },
  {
    id: 'bank-provider',
    whose: 'an open banking provider, of which we have none',
    weBelieve:
      'No provider is engaged, so there is nothing in flight and no date exists to be given.',
    evidence:
      'TrueLayer declined production authorisation on 30 July 2026, on the ground that they are scaling and '
      + 'are not taking on small businesses. No other provider has been approached since. The two capture '
      + 'routes that work, a photo or a voice note, and a CSV statement import, are unaffected and are told '
      + 'beside it on /product.',
    lookHere: 'the mailbox for anything from TrueLayer, and whether any other AISP has been approached',
    checkedOn: '2026-08-17',
    // Long, because nobody is deciding anything. This cannot change without us moving first, so a
    // short clock here would be a nag rather than a check.
    recheckAfterDays: 60,
    gates: ['bankFeedLive', 'bankBadge', 'bankRouteLine', 'bankMark'],
  },
  {
    id: 'app-stores',
    whose: 'us, by choice, and then Apple and Google',
    weBelieve:
      'The apps are parked deliberately and have not been submitted, so no store has been asked for anything.',
    evidence:
      'Recorded at launch on 10 August 2026: the stores are parked by choice while the web product is proved. '
      + 'No submission has been made, so there is no review to be waiting on.',
    lookHere: 'App Store Connect and Google Play Console, and whether a submission has since been made',
    checkedOn: '2026-08-10',
    recheckAfterDays: 90,
    gates: ['appStoreLive', 'APP_STORE_URL', 'PLAY_STORE_URL'],
  },
  {
    id: 'reminders-channel',
    whose: 'us',
    weBelieve:
      'The reminder channel is not delivering, so nothing may be sold on the promise of one.',
    evidence:
      'remindersLive() is false, and lib/features.ts holds both wordings side by side so the day it delivers '
      + 'the copy upgrades itself. The consent line a stranger ticks is generated from that flag, so it can '
      + 'never promise a nudge we cannot send.',
    lookHere: 'whether the reminder dispatch is actually running, and /api/health for a due-and-unsent promise',
    checkedOn: '2026-08-11',
    // Ours, and the flag already forces the copy, so a long clock. It is in the register because a
    // test could just as easily be written to pin "reminders are coming", which is the same defect.
    recheckAfterDays: 90,
    gates: ['remindersLive', 'diaryRowLabel', 'leadConsentText', 'leadDoneLine'],
  },
];

export function waitingOn(id: string): WaitingOn | undefined {
  return WAITING_ON.find((w) => w.id === id);
}

// Whole days, so a check made this morning and a build run this evening agree.
export function daysSinceChecked(w: WaitingOn, today: Date = new Date()): number {
  const [y, m, d] = w.checkedOn.split('-').map(Number);
  const then = Date.UTC(y, m - 1, d);
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.floor((now - then) / 86400000);
}

export function isStale(w: WaitingOn, today: Date = new Date()): boolean {
  return daysSinceChecked(w, today) > w.recheckAfterDays;
}

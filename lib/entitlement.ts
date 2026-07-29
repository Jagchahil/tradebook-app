// THE ONE RULE THAT DECIDES WHETHER A MAN CAN OPEN HIS OWN BOOKS.
//
// It lives here, alone, on the server, and it is returned to every client as a single boolean.
// It is NOT re-implemented in the app. The last time a rule like this was written twice, the two
// copies disagreed and nobody noticed for a month.
//
// ---------------------------------------------------------------------------------------------
// WHAT WAS WRONG BEFORE THIS FILE EXISTED
//
// The mobile app decided entitlement itself, like this:
//
//     const ok = !b || b.status === 'active' || b.status === 'trialing';
//
// Read it again. It looks at the STATUS and never at the DATE. A trial with status 'trialing' and
// an end date two years in the past is, by that line, a valid trial. THE TRIAL COULD NEVER EXPIRE.
// Nothing caught it because nothing ever granted a trial, so the branch had never once run in
// anger. We were one feature away from giving the product away forever.
//
// ---------------------------------------------------------------------------------------------
// THE RULES, AND WHY EACH ONE LEANS THE WAY IT DOES
//
// The asymmetry that governs all of this: LOCKING A MAN OUT OF HIS OWN RECORDS IS WORSE THAN
// LETTING HIM HAVE ANOTHER FORTNIGHT FREE. One costs us £12.99. The other costs him his books on
// the morning his tax is due, and costs us him. So every ambiguous case fails OPEN, on purpose,
// and each one is written down here rather than left to be rediscovered.
//
//   active      in. Stripe moves a subscription off 'active' the moment it stops being true, so we
//               do not second-guess the date.
//
//   trialing    in, UNTIL THE END DATE PASSES. This is the line that did not exist.
//
//   past_due    IN. A card bounced. Stripe is still retrying it, and it will keep retrying for
//               about three weeks before it gives up and moves the row to 'canceled', at which
//               point this function locks him out on its own. Throwing a man out of his books the
//               same day his card expires is not a business decision, it is a tantrum. Our own
//               settings screen already tells him "message us and we will sort it" -- so the app
//               must not have already locked the door while saying it.
//
//   everything  out. none, canceled, unpaid, incomplete.
//   else
//
// A NULL SUBSCRIPTION IS NOT A DECISION. If we could not read the row, that is our failure, not
// his: the caller fails open. This function only ever answers about a row it can actually see.

export interface Entitlement {
  status: string | null;
  current_period_end?: string | null;
}

// 🔴 SEVEN DAYS, NOT FOURTEEN. Jag's call, 28 July 2026, and THE ONLY DEFINITION OF IT.
//
// lib/stripe.ts used to carry a second copy of this number for the card trial, so the no card
// grant and the Stripe trial were two 14s that nothing held together. It now imports this one.
// A number that means one thing belongs in one place: the last time this codebase kept two
// readers over one figure, the one that drifted was the one he believed.
//
// Seven changes what the product must do, not just what it says. A weekly summary that fires on a
// Sunday may never fire at all inside seven days, so during a trial it fires relative to signup.
// See lib/weeklyupdate.ts.
//
// ⚠️ The store listings and the website still say 14. They are corrected as part of launch two,
// before the app goes live. Nobody has yet downloaded an app promising a fortnight.
export const TRIAL_DAYS = 7;

// The statuses that mean "he has paid, or is inside a window where he does not have to yet".
// past_due is deliberate. See the note above.
const OPEN_ENDED = new Set(['active', 'past_due']);

export function isEntitled(sub: Entitlement | null | undefined, now: Date = new Date()): boolean {
  if (!sub || !sub.status) return false;
  const status = sub.status.toLowerCase();

  if (OPEN_ENDED.has(status)) return true;

  if (status === 'trialing') {
    // No end date on a trial should be impossible: grantTrial always sets one, and Stripe always
    // sends one. If it ever happens it is OUR data that is thin, not his entitlement that is
    // false, so he keeps his books and we find the bug. Fail open, and say so out loud.
    if (!sub.current_period_end) return true;
    const end = new Date(sub.current_period_end);
    if (Number.isNaN(end.getTime())) return true; // unreadable date: again, our problem, not his
    return end.getTime() > now.getTime();
  }

  return false;
}

// When a trial granted right now would end. Used at the single point of grant, so the length is
// defined once and cannot drift between the copy on the screen and the row in the database.
export function trialEndsAt(now: Date = new Date()): string {
  const end = new Date(now.getTime());
  end.setUTCDate(end.getUTCDate() + TRIAL_DAYS);
  return end.toISOString();
}

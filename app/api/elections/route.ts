import { NextRequest, NextResponse } from 'next/server';
import { userBurst } from '../../../lib/ratelimit';
import {
  readAllowanceElection, writeAllowanceElection, clearAllowanceElection, getBusinessProfile,
} from '../../../lib/supabase';
import { sessionUser } from '../../../lib/webauth';
import { quarterForDate } from '../../../lib/quarterpack';
import {
  bandForHours, bandOptions, bandLabel, isHoursBand,
  useOfHomeToDate, useOfHomeFullYear, electionConfirmation,
  electionRefusal, type Electing,
} from '../../../lib/elections';
import { gateForUser, refuseUnentitled } from '../../../lib/gateserver';

export const runtime = 'nodejs';

// SAYING YES TO A DEDUCTION. The mechanism lib/taxoptimiser.ts has been asking for since it was
// written: rule 4 emitted 'apply_allowance_election' and nothing implemented it, so a man could not
// claim use of home even if he wanted to, and the suggestion fired at him forever.
//
// ⚠️ THIS IS A TAX CHOICE, SO IT IS HIS, AND IT IS REVERSIBLE.
//
// Doc 103: the best button is no button, do the thing and tell him plainly what you did. But this is
// one of the few things we cannot do for him, because the answer depends on a fact only he knows:
// how many hours a month he actually works from home. That is a real question with three real
// answers, so asking is right. Everything after the answer is automatic.
//
// It is reversible in one call (DELETE), because an election made in error must come off without
// asking us. Compare the rules in CLAUDE.md: money, tax filing and anything sent to another human
// being always ask twice. An election is none of those. It changes a draft figure on his own screen,
// which he approves before anything is ever filed.

// The tax year an election belongs to. Derived, never taken from the request: a client that could
// post a year could quietly claim for a year he was not trading.
function currentStartYear(): number {
  return quarterForDate(new Date()).startYear;
}

// Months into the tax year, the same figure lib/ledger.ts and getOptimiserInput use, so the £ shown
// here can never disagree with the £ on his ledger.
function monthsElapsed(startYear: number): number {
  const start = new Date(Date.UTC(startYear, 3, 6));
  const months = Math.floor((Date.now() - start.getTime()) / (30.44 * 86_400_000));
  return Math.max(0, Math.min(12, months));
}

// WHO IS ELECTING, read ONCE and in one place, for lib/elections.ts to answer about. This route
// supplies the two facts and repeats the answer; it does not know the rule and must not learn it.
//
// 🔴 THE .catch(() => null) IS THE SAFETY RULE, NOT LAZINESS. A read that throws must never become
// "he is a company". That would refuse a sole trader the flat rate because a database was slow, and
// he would lose the deduction every month with nothing on any screen to tell him why. A failure is
// UNKNOWN, and lib/elections.ts only ever refuses a KNOWN limited company or a KNOWN landlord. The
// same shape every other surface uses, e.g. app/app/you/page.tsx.
async function electingAs(userId: string): Promise<Electing> {
  const biz = await getBusinessProfile(userId).catch(() => null);
  return { structure: biz?.businessType ?? null, income: biz?.incomeShape ?? null };
}

export async function GET(req: NextRequest) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const startYear = currentStartYear();
  const months = monthsElapsed(startYear);

  let election = null;
  try {
    election = await readAllowanceElection(user.id, 'use_of_home', startYear);
  } catch {
    // 🔴 "COULD NOT READ IT" IS NOT "HE HAS NOT ELECTED". A 503 rather than a cheerful null, because
    // a screen that shows "not claiming" over a failed read would invite him to elect a second time,
    // and he would reasonably believe the first one never saved.
    return NextResponse.json({ error: 'unreadable' }, { status: 503 });
  }

  // WHETHER THIS ELECTION IS EVEN HIS. The rule and the sentence both live in lib/elections.ts.
  const refusal = electionRefusal('use_of_home', await electingAs(user.id));

  return NextResponse.json({
    startYear,
    monthsElapsed: months,
    // The three real answers, with what each is worth, read from the engine at request time so a
    // Khoji approved rate change shows up here without a deploy.
    //
    // ⚠️ AND NOT OFFERED AT ALL WHEN IT IS NOT HIS. Three bands with a pound figure against each is
    // the product telling him to claim it, and a refusal that still prints the price is not a
    // refusal. A director and a landlord get an empty list and the sentence below.
    options: refusal ? [] : bandOptions().map((o) => ({
      ...o,
      fullYear: useOfHomeFullYear(o.band),
      toDate: useOfHomeToDate(o.band, months),
    })),
    // 🔴 AN ELECTION ALREADY ON HIS RECORD IS STILL SHOWN, REFUSED OR NOT. Rows written before this
    // door existed are still in the table, and DELETE is how they come off. Hiding one would leave a
    // claim standing that he can neither see nor ask us to drop.
    refused: refusal ? { reason: refusal.reason, message: refusal.message } : null,
    elected: election
      ? {
          hoursBand: election.hoursBand,
          label: bandLabel(election.hoursBand as 25 | 51 | 101),
          toDate: useOfHomeToDate(election.hoursBand as 25 | 51 | 101, months),
          fullYear: useOfHomeFullYear(election.hoursBand as 25 | 51 | 101),
          electedAt: election.electedAt,
        }
      : null,
  });
}

export async function POST(req: NextRequest) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (await userBurst('elections', user.id)) {
    return NextResponse.json({ error: 'slow down' }, { status: 429 });
  }

  // 🔴 THE WORK STOPS WHEN HE STOPS PAYING. lib/gate.ts row: this route is 'entitled'.
  //
  // His records stay readable everywhere; what a lapsed subscription buys is that we do nothing NEW
  // for him. gateForUser never returns readonly because something broke, so this can only fire on a
  // real answer about a real subscription.
  if ((await gateForUser(user.id)) === 'readonly') return refuseUnentitled(req, '/app');

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE DOOR. Until 31 July 2026 this wrote the election for ANYBODY who asked, with no profile
  // read at all, so a limited company director and a landlord with no trade could both claim a
  // relief that does not exist for them, and the figure landed in their books. See lib/elections.ts
  // for the sources: ITTOIA 2005 s94H and BIM75010 for the company, s94H being a TRADE deduction for
  // the property business.
  //
  // It is checked BEFORE the body is read, because the answer is a fact about the man and not about
  // his request. And it is asked of lib/elections.ts rather than answered here, so the WhatsApp path
  // and any surface built later get the same answer from the same place rather than a second copy
  // that drifts. An unknown structure or shape is never refused: see electingAs above.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const refusal = electionRefusal('use_of_home', await electingAs(user.id));
  if (refusal) {
    // ONE PLAIN SENTENCE, AND NO TAX ADVICE IN IT. It names the relief and says it is not his. It
    // does NOT describe what a company or a property business could do instead, because we have not
    // built either, and a man told about a door that does not open stops looking for one that does.
    return NextResponse.json({ error: 'not_eligible', message: refusal.message }, { status: 400 });
  }

  let body: { hoursBand?: unknown; hoursPerMonth?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  // Either the band directly (a picker), or the hours he actually works (a conversation). The band
  // is derived in ONE place, lib/elections.ts, so the two entry points cannot disagree about where
  // 50 hours lands.
  let band: number | null = null;
  if (isHoursBand(body.hoursBand)) band = body.hoursBand;
  else if (typeof body.hoursPerMonth === 'number') band = bandForHours(body.hoursPerMonth);

  if (band === null) {
    // UNDER THE THRESHOLD IS NOT AN ERROR, and saying so plainly beats a bare 400. A man who works
    // from home ten hours a month has not done anything wrong, HMRC's flat rate simply starts at 25.
    if (typeof body.hoursPerMonth === 'number' && body.hoursPerMonth >= 0) {
      return NextResponse.json({
        error: 'under_threshold',
        message: "HMRC's flat rate starts at 25 hours a month. Under that there is nothing to claim this way.",
      }, { status: 400 });
    }
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const startYear = currentStartYear();
  const done = await writeAllowanceElection(user.id, 'use_of_home', startYear, band);
  if (!done) return NextResponse.json({ error: 'write_failed' }, { status: 502 });

  const months = monthsElapsed(startYear);
  return NextResponse.json({
    ok: true,
    startYear,
    hoursBand: band,
    toDate: useOfHomeToDate(band as 25 | 51 | 101, months),
    fullYear: useOfHomeFullYear(band as 25 | 51 | 101),
    // The same sentence WhatsApp sends, from the same function, so he reads the same words wherever
    // he elects.
    message: electionConfirmation(band as 25 | 51 | 101, months),
  });
}

// TAKING IT BACK. One call, no confirmation, because it is his own draft figure and it is reversible.
//
// ⚠️ AND IT IS DELIBERATELY NOT REFUSED THE WAY POST IS. A director who elected before the door
// above existed has a row in the table, and this is the only way it comes off. Refusing to remove a
// claim on the grounds that he was never allowed to make it would leave it standing forever.
export async function DELETE(req: NextRequest) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const done = await clearAllowanceElection(user.id, 'use_of_home', currentStartYear());
  if (!done) return NextResponse.json({ error: 'write_failed' }, { status: 502 });
  return NextResponse.json({ ok: true, elected: null });
}

async function auth(req: NextRequest) {
  return sessionUser(req);
}

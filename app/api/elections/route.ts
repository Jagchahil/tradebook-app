import { NextRequest, NextResponse } from 'next/server';
import { userBurst } from '../../../lib/ratelimit';
import {
  readAllowanceElection, writeAllowanceElection, clearAllowanceElection, getBusinessProfile,
  readOptimiserOrNull, type AllowanceElectionKey,
} from '../../../lib/supabase';
import { sessionUser } from '../../../lib/webauth';
import { quarterForDate } from '../../../lib/quarterpack';
import {
  bandForHours, bandOptions, bandLabel, isHoursBand,
  useOfHomeToDate, useOfHomeFullYear, electionConfirmation,
  electionRefusal, tradingAllowanceChoice, tradingAllowanceConfirmation, type Electing,
} from '../../../lib/elections';
import { gateForUser, refuseUnentitled } from '../../../lib/gateserver';

export const runtime = 'nodejs';

// SAYING YES TO A DEDUCTION. The mechanism lib/taxoptimiser.ts has been asking for since it was
// written: rule 4 emitted 'apply_allowance_election' and nothing implemented it, so a man could not
// claim use of home even if he wanted to, and the suggestion fired at him forever.
//
// ⚠️ THIS IS A TAX CHOICE, SO IT IS HIS, AND IT IS REVERSIBLE.
//
// Doc 103: the best button is no button, do the thing and tell him plainly what you did. But these
// are the few things we cannot do for him, because the answer depends on a fact only he knows: how
// many hours a month he actually works from home, and whether he would rather deduct a flat
// allowance than the costs he has logged. Those are real questions with real answers, so asking is
// right. Everything after the answer is automatic.
//
// It is reversible in one call, because an election made in error must come off without asking us.
// Compare the rules in CLAUDE.md: money, tax filing and anything sent to another human being always
// ask twice. An election is none of those. It changes a draft figure on his own screen, which he
// approves before anything is ever filed.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 TWO ELECTIONS NOW, AND THE ROUTE MUST NOT LEARN THE DIFFERENCE BETWEEN THEM.
//
// Which structures and income shapes may take which relief is a property of the ELECTION and lives
// in lib/elections.ts. This file supplies the two facts about the man and repeats the answer. The
// day a third election arrives, this file should need no edit at all beyond its key list.
//
// ⚠️ AND THE DEFAULT KEY IS use_of_home ON PURPOSE. The phone app posts { hoursBand } with no key
// at all, and it is shipped and in customers' hands. A required key would have broken every
// existing caller silently, which is precisely the class of change this codebase keeps catching.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

// Where a browser form comes back to. Never taken from the request: a redirect target from a body
// is an open redirect, and the same rule /api/vat and /api/circumstances already follow.
const SCREEN = '/app/you/elections';

const KEYS: readonly AllowanceElectionKey[] = ['use_of_home', 'trading_allowance'];

function asKey(v: unknown): AllowanceElectionKey | null {
  const s = String(v ?? '').trim();
  if (!s) return 'use_of_home';
  return (KEYS as readonly string[]).includes(s) ? (s as AllowanceElectionKey) : null;
}

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
// UNKNOWN, and lib/elections.ts only ever refuses a KNOWN limited company or a KNOWN landlord.
async function electingAs(userId: string): Promise<Electing> {
  const biz = await getBusinessProfile(userId).catch(() => null);
  return { structure: biz?.businessType ?? null, income: biz?.incomeShape ?? null };
}

export async function GET(req: NextRequest) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const key = asKey(new URL(req.url).searchParams.get('key'));
  if (!key) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  const startYear = currentStartYear();
  const months = monthsElapsed(startYear);

  let election = null;
  try {
    election = await readAllowanceElection(user.id, key, startYear);
  } catch {
    // 🔴 "COULD NOT READ IT" IS NOT "HE HAS NOT ELECTED". A 503 rather than a cheerful null, because
    // a screen that shows "not claiming" over a failed read would invite him to elect a second time,
    // and he would reasonably believe the first one never saved.
    return NextResponse.json({ error: 'unreadable' }, { status: 503 });
  }

  // WHETHER THIS ELECTION IS EVEN HIS. The rule and the sentence both live in lib/elections.ts.
  const refusal = electionRefusal(key, await electingAs(user.id));

  // ⚠️ THE TRADING ALLOWANCE IS NEVER REPORTED WITHOUT BOTH TOTALS. Its whole shape is that it
  // REPLACES his costs rather than adding to them, so a caller handed only "you could claim
  // £1,000" would be able to build the screen that got us here. The comparison travels with it.
  // 🔴 B50, D3. RECORDS UNREADABLE EXEMPT: this route answers in JSON and has no customer sentence
  // on it, so a failed read gets the SAME explicit 503 this route already returns thirty lines up
  // for the election read itself. One error shape in one file, not two. The reason is the comment
  // above: without both totals this allowance must not be reported at all, and getOptimiserInput
  // hands back zeros rather than throwing when the rows do not read, so a caller was being given a
  // comparison worked out against a year of zeros he never lived.
  let choice = null;
  if (key === 'trading_allowance' && !refusal) {
    const oi = await readOptimiserOrNull(user.id);
    if (!oi) return NextResponse.json({ error: 'unreadable' }, { status: 503 });
    choice = tradingAllowanceChoice(oi.ytdTradeIncome, oi.ytdTradeExpenses, oi);
  }

  return NextResponse.json({
    key,
    startYear,
    monthsElapsed: months,
    // The three real answers, with what each is worth, read from the engine at request time so a
    // Khoji approved rate change shows up here without a deploy.
    //
    // ⚠️ AND NOT OFFERED AT ALL WHEN IT IS NOT HIS. Three bands with a pound figure against each is
    // the product telling him to claim it, and a refusal that still prints the price is not a
    // refusal. A director and a landlord get an empty list and the sentence below.
    options: (refusal || key !== 'use_of_home') ? [] : bandOptions().map((o) => ({
      ...o,
      fullYear: useOfHomeFullYear(o.band),
      toDate: useOfHomeToDate(o.band, months),
    })),
    choice,
    // 🔴 AN ELECTION ALREADY ON HIS RECORD IS STILL SHOWN, REFUSED OR NOT. Rows written before this
    // door existed are still in the table, and removing is how they come off. Hiding one would leave
    // a claim standing that he can neither see nor ask us to drop.
    refused: refusal ? { reason: refusal.reason, message: refusal.message } : null,
    elected: election
      ? {
          hoursBand: election.hoursBand,
          label: election.hoursBand === null ? null : bandLabel(election.hoursBand as 25 | 51 | 101),
          toDate: election.hoursBand === null ? null : useOfHomeToDate(election.hoursBand as 25 | 51 | 101, months),
          fullYear: election.hoursBand === null ? null : useOfHomeFullYear(election.hoursBand as 25 | 51 | 101),
          electedAt: election.electedAt,
        }
      : null,
  });
}

export async function POST(req: NextRequest) {
  // ⚠️ A BROWSER FORM CAN ONLY GET OR POST, and the web app ships no client script on purpose, so
  // removal arrives here as intent=remove rather than as a DELETE. One implementation, two doors,
  // exactly as /api/vat expresses erasure. See app/api/vat/route.ts for the same note.
  const isForm = (req.headers.get('content-type') || '').includes('application/x-www-form-urlencoded');
  const back = (q: string) => NextResponse.redirect(new URL(`${SCREEN}?${q}`, req.url), 303);

  const user = await auth(req);
  if (!user) {
    // A form caller with no session is a man whose page sat open until his session went. Send him to
    // the door he can act on, not to an error object he cannot read.
    return isForm
      ? NextResponse.redirect(new URL(`/in?next=${SCREEN}`, req.url), 303)
      : NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (await userBurst('elections', user.id)) {
    return isForm ? back('problem=slow') : NextResponse.json({ error: 'slow down' }, { status: 429 });
  }

  let body: Record<string, unknown> = {};
  if (isForm) {
    const f = await req.formData().catch(() => null);
    if (!f) return back('problem=bad');
    for (const name of ['key', 'intent', 'hoursBand', 'hoursPerMonth']) {
      if (f.has(name)) body[name] = String(f.get(name) ?? '');
    }
  } else {
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'bad_json' }, { status: 400 });
    }
  }

  const key = asKey(body.key);
  if (!key) {
    return isForm ? back('problem=bad') : NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const startYear = currentStartYear();

  // ── REMOVAL. Deliberately NOT refused the way electing is. ─────────────────────────────────
  //
  // A director who elected before the door existed has a row in the table, and this is the only way
  // it comes off. Refusing to remove a claim on the grounds that he was never allowed to make it
  // would leave it standing for ever. It is also not gated: he may always UNDO a claim on his own
  // record. See the lib/gate.ts row for this route.
  if (String(body.intent ?? '') === 'remove') {
    const gone = await clearAllowanceElection(user.id, key, startYear);
    if (!gone) {
      return isForm ? back('problem=unavailable') : NextResponse.json({ error: 'write_failed' }, { status: 502 });
    }
    return isForm ? back(`done=removed&key=${key}`) : NextResponse.json({ ok: true, elected: null });
  }

  // 🔴 THE WORK STOPS WHEN HE STOPS PAYING. lib/gate.ts row: this route is 'entitled'.
  //
  // His records stay readable everywhere; what a lapsed subscription buys is that we do nothing NEW
  // for him. gateForUser never returns readonly because something broke, so this can only fire on a
  // real answer about a real subscription. It sits BELOW removal on purpose: taking a claim back off
  // is never work we do for him.
  if ((await gateForUser(user.id)) === 'readonly') return refuseUnentitled(req, '/app');

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE DOOR. Until 31 July 2026 this wrote the election for ANYBODY who asked, with no profile
  // read at all, so a limited company director and a landlord with no trade could both claim a
  // relief that does not exist for them, and the figure landed in their books.
  //
  // It is checked BEFORE the body is used, because the answer is a fact about the man and not about
  // his request. And it is asked of lib/elections.ts rather than answered here, so the WhatsApp path
  // and any surface built later get the same answer from the same place rather than a second copy
  // that drifts. An unknown structure or shape is never refused: see electingAs above.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const refusal = electionRefusal(key, await electingAs(user.id));
  if (refusal) {
    // ONE PLAIN SENTENCE, AND NO TAX ADVICE IN IT. It names the relief and says it is not his. It
    // does NOT describe what a company or a property business could do instead, because we have not
    // built either, and a man told about a door that does not open stops looking for one that does.
    return isForm
      ? back(`problem=not_eligible&key=${key}`)
      : NextResponse.json({ error: 'not_eligible', message: refusal.message }, { status: 400 });
  }

  // ── THE TRADING ALLOWANCE. No band, no options: the row existing IS the election. ──────────
  if (key === 'trading_allowance') {
    const done = await writeAllowanceElection(user.id, key, startYear, null);
    if (!done) {
      return isForm ? back('problem=unavailable') : NextResponse.json({ error: 'write_failed' }, { status: 502 });
    }
    // ⚠️ THE CONFIRMATION IS BUILT FROM HIS REAL FIGURES, INCLUDING WHEN THEY SAY HE HAS JUST
    // CHOSEN THE WORSE OF THE TWO. tradingAllowanceConfirmation() says so plainly rather than
    // congratulating him, because it is still his choice and he can take it off in one press.
    // 🔴 B50, D3. RECORDS UNREADABLE EXEMPT: the election has ALREADY BEEN WRITTEN by the line
    // above, so this path cannot answer with an error and it cannot carry the signed chat line
    // either, because that line promises nothing has happened to his books and something just has.
    // What it does instead is withhold the COMPARISON and keep the two sentences that are true
    // whatever the read did. Before today a failed read produced a confident "there is not enough
    // of the tax year yet to say", which is a statement about HIS year built out of zeros.
    const oi = await readOptimiserOrNull(user.id);
    const choice = oi
      ? tradingAllowanceChoice(oi.ytdTradeIncome, oi.ytdTradeExpenses, oi)
      : null;
    return isForm
      ? back('done=elected&key=trading_allowance')
      : NextResponse.json({ ok: true, startYear, key, choice, message: tradingAllowanceConfirmation(choice) });
  }

  // ── USE OF HOME. Either the band directly (a picker), or the hours he actually works (a
  // conversation). The band is derived in ONE place, lib/elections.ts, so the two entry points
  // cannot disagree about where 50 hours lands.
  let band: number | null = null;
  const rawBand = typeof body.hoursBand === 'string' ? Number(body.hoursBand) : body.hoursBand;
  const rawHours = typeof body.hoursPerMonth === 'string' ? Number(body.hoursPerMonth) : body.hoursPerMonth;
  if (isHoursBand(rawBand)) band = rawBand;
  else if (typeof rawHours === 'number' && Number.isFinite(rawHours)) band = bandForHours(rawHours);

  if (band === null) {
    // UNDER THE THRESHOLD IS NOT AN ERROR, and saying so plainly beats a bare 400. A man who works
    // from home ten hours a month has not done anything wrong, HMRC's flat rate simply starts at 25.
    if (typeof rawHours === 'number' && Number.isFinite(rawHours) && rawHours >= 0) {
      return isForm ? back('problem=under_threshold') : NextResponse.json({
        error: 'under_threshold',
        message: "HMRC's flat rate starts at 25 hours a month. Under that there is nothing to claim this way.",
      }, { status: 400 });
    }
    return isForm ? back('problem=bad') : NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const done = await writeAllowanceElection(user.id, 'use_of_home', startYear, band);
  if (!done) {
    return isForm ? back('problem=unavailable') : NextResponse.json({ error: 'write_failed' }, { status: 502 });
  }

  const months = monthsElapsed(startYear);
  return isForm ? back('done=elected&key=use_of_home') : NextResponse.json({
    ok: true,
    startYear,
    key,
    hoursBand: band,
    toDate: useOfHomeToDate(band as 25 | 51 | 101, months),
    fullYear: useOfHomeFullYear(band as 25 | 51 | 101),
    // The same sentence WhatsApp sends, from the same function, so he reads the same words wherever
    // he elects.
    message: electionConfirmation(band as 25 | 51 | 101, months),
  });
}

// TAKING IT BACK, for the phone app, which can send a verb. The web sends intent=remove to POST.
// Both land on the same clearAllowanceElection, and neither is refused the way electing is: see the
// note above the removal branch in POST.
export async function DELETE(req: NextRequest) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const key = asKey(new URL(req.url).searchParams.get('key'));
  if (!key) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  const done = await clearAllowanceElection(user.id, key, currentStartYear());
  if (!done) return NextResponse.json({ error: 'write_failed' }, { status: 502 });
  return NextResponse.json({ ok: true, elected: null });
}

async function auth(req: NextRequest) {
  return sessionUser(req);
}

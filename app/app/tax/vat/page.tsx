import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../../lib/webauth';
import { SESSION_COOKIE } from '../../../../lib/websession';
import {
  accountHasRental, getConfirmedInputVat, getOutputVat, readVatProfile, taxableTurnoverFor,
  getConfirmedTransactionsForRange,
} from '../../../../lib/supabase';
// RUN 2: the figure comes from his rows now, not from an account age gate. See the block below.
import { vatStanding, CARD_FEE_NOTE, FLOOR_NOTE } from '../../../../lib/vatstanding';
import {
  VAT_REGISTRATION_THRESHOLD, RENT_NOT_COUNTED_NOTE, TURNOVER_BASIS_NOTE, formatVrn, inputVatNote,
  mustRegister, reg111Window, vatPosition,
} from '../../../../lib/vat';
import type { VatPositionInput } from '../../../../lib/vat';
import { asPercent } from '../../../../lib/taxengine';
import { gbp0, gbpAbs0 } from '../../lib/money';
import { A11Y_CSS, APP_CSS, FONT, RADIUS, SPACE, TYPE } from '../../../../lib/tokens';
import {
  GREEN_TINT, INK, LINE, MUTED, ON_GREEN_TINT, PAPER, SAFFRON_DEEP, SAFFRON_TINT, SURFACE, edge,
} from '../../../../lib/apptheme';
import { AppNav } from '../../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// VAT. Where he stands this quarter, prepared.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WE DO NOT FILE VAT RETURNS, AND THIS SCREEN SAYS SO IN ITS OWN WORDS, ONCE.
//
// lib/hmrc.ts asks for 'read:self-assessment write:self-assessment' and nothing else. There is not
// one occurrence of the word VAT in it. Making Tax Digital for VAT is ABSENT here, not half built
// and not waiting on a switch, so this screen may never carry the "the filing pipeline is built and
// waits on HMRC" sentence the quarterly summary carries, because that sentence is true of income
// tax and would be a straight lie about VAT.
//
// What this screen does is the thing we are actually for: it prepares the figure, from his own
// invoices and the costs he has confirmed, so that the number is already known to him when he makes
// his return himself, through whatever he uses for it today. That is said plainly at the foot of
// the page and it is not apologised for.
//
// ⚠️ EVERY FIGURE COMES FROM vatPosition() IN lib/vat.ts. Not one rate, threshold or subtraction is
// written here. The flat rate sum, the refund case, the proof share and the notes are all its
// answers, rendered. A second reader over a VAT figure is how a man ends up handing HMRC one number
// and his accountant another.
//
// ⚠️ THE REVERSE CHARGE IS THE REASON THIS PAGE EXISTS AT ALL.
//
// The most common invoice this audience sends carries NO VAT: the CIS domestic reverse charge, VATA
// 1994 s55A. So a subcontractor with a good quarter sees output tax far below what his turnover
// suggests, decides the app is broken, and stops trusting every other figure on it. Showing the
// reverse charge total beside the position, with one sentence saying whose VAT it is, is the
// difference between a screen that is right and a screen he believes.
//
// ⚠️ THE WINDOW IS SAID OUT LOUD, INCLUDING WHAT WE DO NOT KNOW. HMRC gives each business a stagger
// group, and we do not hold his. So this is the calendar quarter to date, the screen says exactly
// that, and a man whose quarters end in a different month can read it as three months of figures
// rather than as his own return period. The alternative was to print a window that might not be his
// and let him find out later, which is the failure this codebase keeps paying for.
//
// ⚠️ A NULL READ IS NEVER DRAWN AS A ZERO. readVatProfile, getOutputVat and getConfirmedInputVat
// all return null when the read FAILED, which lib/supabase.ts is explicit about, and "we could not
// read it" is a different answer from "there is nothing there". A zero he believes is worse than a
// blank he can retry, so on a failed read this screen shows him nothing and says why.
//
// ⚠️ AND THE PROOF SHARE TRAVELS WITH THE MONEY. The house position: nothing is ever refused for
// want of a receipt, but every figure knows whether it has one, and anything leaving the building
// says how much of it is documented. One quiet line under the reclaim. Not a warning, and never a
// reason to withhold a figure he is entitled to.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export default async function VatPage() {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  // Carries him back here after he signs in, the /app/you/billing pattern: safeNext() in
  // lib/websession.ts allowlists /app and below, so this cannot become an open redirect.
  if (!user) redirect('/in?next=%2Fapp%2Ftax%2Fvat');

  const now = new Date();
  const from = quarterStartISO(now);
  const to = isoDay(now);

  // NULL MEANS THE READ FAILED. It does not mean he is not registered. Everything below branches on
  // that difference before it branches on anything else.
  const profile = await readVatProfile(user.id);
  const isRegistered = profile !== null && profile.registered;

  // Only the branch that will be drawn is read for. A man who is not registered gets his rolling
  // twelve months instead, because the one thing worth telling him here is whether he has crossed
  // the line that makes registering compulsory.
  const quarter = isRegistered
    ? await Promise.all([
      getOutputVat(user.id, from, to),
      getConfirmedInputVat(user.id, from, to),
    ])
    : null;
  const out = quarter ? quarter[0] : null;
  const inp = quarter ? quarter[1] : null;

  // 🔴 THE THRESHOLD FIGURE IS HIS CONFIRMED TRADE INCOME, NOT HIS INVOICES. 9 August 2026.
  //
  // This used to be getOutputVat over twelve months, which sums the invoices raised HERE. A
  // tradesman who takes cash and does not invoice every job through Lekhio has a bigger turnover
  // than that, and the smaller figure is the one that tells him he is under a line he has already
  // crossed. lib/weeklyupdate.ts and lib/agent.ts have always counted confirmed trade income, so
  // this screen was the odd one out AND the quiet one, because until push 19 that same afternoon
  // nothing linked to it for a man who is not registered. The Tax hub draws a "VAT threshold" door
  // now, and the order mattered: the figure was made right FIRST and the door opened after, because
  // linking an undercounting number from the hub would have been worse than leaving it unreachable.
  //
  // taxableTurnoverFor asks the very RPC the weekly asks, so the two now agree to the penny by
  // construction. It answers THREE ways: a figure, "not twelve months of him yet", and "could not
  // read", and all three are said out loud below rather than collapsed into a blank.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE GATE WAS ON HOW OLD HIS ACCOUNT IS, NOT ON WHAT HIS BOOKS COVER. RUN 2, 12 Aug 2026.
  //
  // taxableTurnoverFor asks the weekly's RPC, and that RPC nulls the figure while users.created_at
  // is under three months old. So a florist who signed up this afternoon and imported a full year
  // of statements was told "We cannot show you where you stand against it yet. Your account is
  // under three months old", with twelve months of confirmed rows sitting underneath the sentence
  // and £6,438 of headroom against the line she was frightened of.
  //
  // 🔴 AND THIS CODEBASE HAD ALREADY WRITTEN THE ARGUMENT DOWN. getOptimiserInput in
  // lib/supabase.ts carries it in full: "THE FIX IS THE EARLIEST ROW HE HAS GIVEN US, NOT
  // users.created_at ... The account date is the obvious answer and it is wrong for the man who
  // joins in August and imports his statements back to April." It names this very screen as the
  // one still doing it, and calls the pair "Two definitions of enough history, one screen apart."
  // That comment was written on 9 August. This is the other half landing.
  //
  // ⚠️ SO THE FIGURE IS BUILT FROM HIS ROWS AND THE RPC IS THE FALLBACK, not the other way round.
  // lib/vatstanding.ts answers from the same confirmed trade income the weekly counts, sums only
  // the last twelve months, excludes rent by income_type, and says out loud whether his rows
  // actually SPAN a year: under that it hands back a FLOOR ("at least"), which can only ever
  // under-state and is strictly better than the silence this screen used to offer.
  // ⚠️ ONE READING OF THE CLOCK PER PAGE. `now` is taken once at the top and everything derives
  // from it, which is the rule the quarter bounds above already follow: two readings of "today" on
  // one page is how a boundary day comes to disagree with itself. It also keeps the purity lint
  // happy, which flags a second Date.now() in a render.
  const rowsFrom = new Date(now.getTime() - 400 * 86400_000).toISOString().slice(0, 10);
  const standing = profile !== null && !profile.registered
    ? await getConfirmedTransactionsForRange(user.id, rowsFrom, to)
      .then((rows) => vatStanding(rows, to, VAT_REGISTRATION_THRESHOLD, false))
      .catch(() => null)
    : null;

  const turnover = profile !== null && !profile.registered
    ? await taxableTurnoverFor(user.id)
    : null;
  // The rows are the primary answer; the RPC survives as a cross check and as the fallback for a
  // read that failed. Where both have a figure they agree by construction (same definition of
  // trade income), and where they disagree the ROWS win, because they are the evidence.
  const haveStanding = standing !== null && (standing.kind === 'known' || standing.kind === 'floor');
  const overThreshold = haveStanding
    ? (standing as { over: boolean }).over
    : turnover?.kind === 'known' && mustRegister(turnover.rolling12m);
  const yearTurnover = haveStanding
    ? (standing as { rolling12m: number }).rolling12m
    : turnover?.kind === 'known' ? turnover.rolling12m : 0;
  // A floor is a real number with a caveat, never a blank. The copy below says "at least".
  const isFloor = standing !== null && standing.kind === 'floor';
  const nearLine = haveStanding && (standing as { nearLine: boolean }).nearLine;

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 WE WERE TELLING A MAN WITH NO PROPERTY WHAT WE ARE NOT COUNTING OF HIS RENT. 11 AUGUST 2026.
  //
  // TURNOVER_BASIS_NOTE carried "and not your rent, which is exempt" inside it, and all three arms
  // below printed it to everybody: the over the line arm, the under the line arm, and the young
  // account arm in its own hand written words. Most of this product's customers are sole traders
  // with a van and no property at all, so the most common reader of the most important sentence on
  // this screen was being handed a fact about somebody else's money as though it were his.
  //
  // This is the bug /app/you/vat had until 9 August, in the same shape: Reg 111 promised to a man
  // who had never registered. That fix branched the sentence on the one fact that makes it true,
  // and so does this one. The clause has its own owner in lib/vat.ts now, so the three arms cannot
  // drift on it, and it is appended only for a customer who has a property stream.
  //
  // ⚠️ accountHasRental READS HIS OWN STATEMENTS ONLY: the rental circumstance he ticked at signup
  // or answered in setup, or rent he has confirmed himself. Nothing is inferred.
  //
  // ⚠️ AND A FAILED READ ANSWERS false, WHICH IS THE SAFE DIRECTION HERE AND IS WHY THIS IS NOT
  // DRAWN LIKE THE FIGURES ARE. A landlord who loses one clause still reads a sentence that is
  // true of him. A sole trader who gains it reads a sentence that is not, which is the defect.
  // Nothing on this screen depends on it: no figure moves, and the line he is measured against is
  // the same either way.
  //
  // ⚠️ ASKED ONLY ON THE ARM THAT SAYS IT. The registered arm never prints the basis sentence, so
  // it never pays for this read, exactly as it never pays for taxableTurnoverFor above.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const hasRental = profile !== null && !profile.registered
    ? await accountHasRental(user.id)
    : false;
  const rentClause = hasRental ? ` ${RENT_NOT_COUNTED_NOTE}` : '';

  // The whole position, asked for rather than worked out. Zeroes for a man who is not registered,
  // because vatPosition answers that case with a sentence and no table, which is the right answer
  // and is written once, in lib/vat.ts.
  //
  // ⚠️ blockedVat IS 0 AND THAT IS HONEST. We hold no per quarter figure for input tax that cannot
  // be reclaimed, and inventing one to fill a field would put a number on this screen that no row
  // in his books stands behind. The blocked rules live per cost, in inputVatNote, where he meets
  // them on the thing he actually bought.
  const positionInput: VatPositionInput | null = profile === null
    ? null
    : !profile.registered
      ? { profile, outputVat: 0, inputVat: 0, grossTurnover: 0, blockedVat: 0, inputVatWithProof: 0 }
      : out !== null && inp !== null
        ? {
          profile,
          outputVat: out.outputVat,
          inputVat: inp.total,
          grossTurnover: out.grossTurnover,
          blockedVat: 0,
          inputVatWithProof: inp.withProof,
        }
        : null;
  const pos = positionInput ? vatPosition(positionInput) : null;
  const notes = pos ? pos.notes : [];

  // A refund quarter is a real thing. It is not clamped, not hidden, and the label carries the
  // direction so the figure itself can be printed without a minus sign in front of a pound.
  const refund = pos !== null && pos.due < 0;
  const reverseCharge = out !== null ? out.reverseChargeVat : 0;
  const withProof = inp !== null ? inp.withProof : 0;

  // ⚠️ AND A QUARTER WITH NOTHING IN IT SAYS SO, rather than wearing a proud £0. "You owe nothing"
  // and "we have not been told anything yet" are different answers, and the hub and the Overview
  // already draw that line the same way. A man three days into a quarter reading a confident zero
  // is the one who stops checking.
  const nothingYet = pos !== null && out !== null
    && out.grossTurnover === 0 && pos.outputVat === 0 && pos.inputVat === 0 && reverseCharge === 0;

  // The promise lib/circumstances.ts has been making since 14 July, with his real dates in it at
  // last: the registration date used to be asked for and thrown away.
  const window111 = isRegistered && profile !== null ? reg111Window(profile.registeredOn) : null;
  // Printed the way HMRC prints it, and dressed up as nothing. The check digits in lib/vat.ts
  // prove the SHAPE of a VAT number, never the man: we do not ask HMRC whether this one is his, so
  // no word on this screen may suggest that anybody has confirmed it. That would be the same class
  // of claim as implying recognition.
  const vrn = profile !== null ? formatVrn(profile.vrn) : null;
  // The same rule coming the other way. Drawn only inside the reverse charge card, so a man who has
  // never raised one is never handed it.
  const subbie = inputVatNote('subcontractor');

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/tax" />

      {profile === null ? (
        /* ── THE READ FAILED. No figures, and the reason said plainly. ────────────────────── */
        <section className="lek-card">
          <h1 className="lek-h2">VAT</h1>
          <p style={S.empty}>We could not read your VAT details just now.</p>
          <p style={S.quiet}>
            Nothing is lost. Give it a moment and load the page again. You are seeing a blank rather
            than a zero on purpose, because a zero you believe is worse than a blank you can try
            again.
          </p>
        </section>
      ) : !profile.registered ? (
        /* ── NOT REGISTERED. He reaches this from the "VAT threshold" door on the Tax hub, which
              has existed since push 19 on 9 August. This comment used to say he had no row on the
              hub and must have typed the address, and it stayed that way for the rest of the day
              AFTER the door was built: the hub's own comment quotes this sentence as the reason it
              was building the door. A note that describes the world before the fix, sitting in the
              file the fix landed in, is how the next reader concludes the screen is dead and stops
              maintaining it. ──────────────────────────────────────────────────────────────────── */
        <section className="lek-card">
          <h1 className="lek-h2">VAT</h1>
          {notes.map((n) => <p key={n} style={S.body}>{n}</p>)}
          {/* 🔴 AND THE FAILED READ SAYS SO, WHICH ON THIS ARM IT DID NOT. 9 August 2026.
              getOutputVat returns null when the READ failed, and this branch only ever asked
              `overThreshold`, which is false for a null. So a man over the threshold whose read
              failed was shown NOTHING AT ALL and told nothing: no figure, and no reason there is
              no figure. The registered arm two branches down has said "We could not read your
              invoices just now" since it was written, and the block at the top of this file states
              the rule in the page's own words: on a failed read this screen shows him nothing AND
              SAYS WHY. This arm was the one place that did the first half only.

              It matters more here than anywhere else on the page: registering late is a penalty,
              and silence reads exactly like being safely under the line. */}
          {/* ═══════════════════════════════════════════════════════════════════════════════
              🔴 THE ROWS ANSWER FIRST NOW. RUN 2, 12 August 2026. See the block by the fetch.

              The three RPC arms below are unchanged and still carry their history, but they are
              reached only when the rows could not answer. A customer who has given us a year of
              statements gets his figure on the day he imports them, whatever his account's
              birthday says, and a customer who has given us four months gets a FLOOR rather than
              silence: "at least £X" can only under-state, and under-stating is the direction that
              never tells a man he is safely below a line he has crossed.
              ═══════════════════════════════════════════════════════════════════════════════ */}
          {haveStanding ? (
            <>
              <p style={S.figure}>
                {isFloor ? 'At least ' : ''}{gbp0(yearTurnover)}
              </p>
              <p style={S.body}>
                {overThreshold
                  ? `That is your taxable turnover over the last twelve months, and it is over the ${gbp0(VAT_REGISTRATION_THRESHOLD)} line. Registering is not optional now, and registering late is a penalty.`
                  : `That is your taxable turnover over the last twelve months, against a ${gbp0(VAT_REGISTRATION_THRESHOLD)} line. It is the rolling twelve months that counts rather than your tax year, so it can happen in any month.`}
              </p>
              {isFloor ? <p style={S.body}>{FLOOR_NOTE}</p> : null}
              {/* ⚠️ THE CARD FEE GAP, ONLY WHERE IT CAN CHANGE WHAT HE DOES. A provider pays out
                  NET of its fee and the VAT test runs on the GROSS takings, so the books under-read
                  for anybody taking cards. On the account that found this, that gap is £1,157
                  against £6,438 of headroom: a fifth of what is left, hidden in an arithmetic he
                  never sees. Said near the line and nowhere else, because over it he must register
                  regardless and far below it the sentence is noise. */}
              {nearLine ? <p style={S.body}>{CARD_FEE_NOTE}</p> : null}
              <p style={S.body}>{TURNOVER_BASIS_NOTE}{rentClause}</p>
            </>
          ) : turnover?.kind === 'unreadable' ? (
            <p style={S.empty}>
              We could not read your figures just now, so there is no turnover here rather than a
              turnover with a hole in it. Give it a moment and load the page again.
            </p>
          ) : turnover?.kind === 'tooNew' ? (
            /* ═══════════════════════════════════════════════════════════════════════════════
               🔴 THIS IS THE ARM EVERY ACCOUNT LANDS ON AT LAUNCH, AND IT ANSWERED NOTHING.
               9 August 2026, found in a walkthrough audit rather than by anybody using it.

               The RPC nulls the rolling figure while an account is under THREE months old
               (APPLY_2026-07-27_weekly_update_facts.sql), which on launch day is every customer we
               have. The door on the Tax hub promises "where your last twelve months put you against
               the line, and what happens if you cross it". What was here said NEITHER: no line, no
               consequence, just a wait he had not asked about. A door that opens onto nothing is
               the empty screen this codebase spent the whole day removing from everywhere else.

               ⚠️ AND IT SAID "TWELVE MONTHS", WHICH IS THE WRONG NUMBER. The gate is three. He was
               told to wait a year for something that arrives in a quarter, which is long enough to
               decide the screen is not worth coming back to. The comment three lines above it said
               three months, so the copy and its own note disagreed.

               🔴 THE FIX IS NOT TO INVENT A FIGURE. We genuinely cannot build a rolling twelve
               month turnover out of six weeks, and a made up one is the undercount this page was
               rewritten to stop. But THE LINE and THE CONSEQUENCE are facts about VAT that do not
               depend on his history at all, and they are exactly the two things the door promised.
               He gets those, plus the honest reason the figure is not here yet.
               ═══════════════════════════════════════════════════════════════════════════════ */
            <>
              <p style={S.body}>
                Registering for VAT becomes compulsory once your taxable turnover in any rolling
                twelve months goes over {gbp0(VAT_REGISTRATION_THRESHOLD)}. It is the rolling twelve
                months that counts rather than your tax year, so it can happen in any month, and
                registering late is a penalty.
              </p>
              {/* ⚠️ NOT TURNOVER_BASIS_NOTE HERE, THOUGH IT NEARLY WENT IN. That constant opens
                  "This counts the trade income you have confirmed", which describes A FIGURE, and
                  on this arm there is no figure to describe. A shared sentence that means one thing
                  on two screens and something slightly different on a third is the drift the shared
                  constant exists to prevent. So the forward looking version is written here, and it
                  keeps the half that actually matters most to a brand new account: money he takes
                  and does not log still counts. He is the likeliest of anyone to under log.
                  🔴 THE RENT CLAUSE IS THE EXCEPTION, AND IT WAS THE PROOF OF THE POINT. This
                  paragraph said "and not your rent, which is exempt" in its own words while the
                  constant said it in slightly different ones, so one claim was written twice and
                  the day it turned out to be wrong for most customers it had to be fixed twice.
                  The tense bound half stays here. The clause comes from RENT_NOT_COUNTED_NOTE, the
                  same owner the two figure arms use, and appears only for a customer who has
                  property. Owning the sentence was never the point; owning each CLAIM in it is. */}
              <p style={S.empty}>
                We cannot show you where you stand against it yet. Your account is under three
                months old, and a rolling twelve month figure built out of a few weeks would be a
                number you could act on and should not. Keep confirming what comes in and it fills
                itself in. It will count the trade income you confirm here, so anything you take
                and do not log still counts towards your own line.{rentClause}
              </p>
            </>
          ) : overThreshold ? (
            <p style={S.warn}>
              Your trade income over the last twelve months comes to {gbp0(yearTurnover)}, which is
              over the {gbp0(VAT_REGISTRATION_THRESHOLD)} line. Registering becomes compulsory once
              your taxable turnover in any rolling twelve months goes over it. {TURNOVER_BASIS_NOTE}{rentClause}
            </p>
          ) : turnover?.kind === 'known' ? (
            /* 🔴 AND THE UNDER THE LINE CASE IS SAID TOO, which it never was. A blank screen for a
               man on eighty nine thousand pounds is the same silence as a failed read, and he has
               more reason than anyone to want the number. */
            <p style={S.body}>
              Your trade income over the last twelve months comes to {gbp0(yearTurnover)}, which is
              under the {gbp0(VAT_REGISTRATION_THRESHOLD)} line, so registering is not compulsory
              yet. {TURNOVER_BASIS_NOTE}{rentClause}
            </p>
          ) : null}
        </section>
      ) : pos === null ? (
        /* ── REGISTERED, BUT ONE OF THE TWO READS FAILED. Same rule: no invented zero. ─────── */
        <section className="lek-card">
          <h1 className="lek-h2">VAT this quarter</h1>
          <p style={S.empty}>
            We could not read {out === null ? 'your invoices' : 'what you have confirmed'} just now.
          </p>
          <p style={S.quiet}>
            So there is no figure here, rather than a figure with a hole in it. Nothing is lost.
            Give it a moment and load the page again.
          </p>
        </section>
      ) : (
        <>
          {/* ── WHERE HE STANDS. One figure, and the working under it in a sentence. ───────── */}
          <section className="lek-card">
            <h1 className="lek-h2">VAT this quarter</h1>
            <p style={S.window}>
              Your figures from {pretty(from)} to today. That is the calendar quarter. HMRC gives
              some businesses quarters that end in a different month, so if yours do, read this as
              three months of figures rather than as your own return period.
            </p>

            {nothingYet ? (
              <p style={S.empty}>Nothing raised or confirmed since {pretty(from)}.</p>
            ) : (
              <div style={S.figRow}>
                <div>
                  <div className="lek-tile-label">
                    {refund ? 'HMRC owes you so far' : 'To pay so far'}
                  </div>
                  <div className="lek-big">{refund ? gbpAbs0(pos.due) : gbp0(pos.due)}</div>
                </div>
              </div>
            )}

            {nothingYet ? (
              <p style={S.quiet}>
                This screen keeps itself ready. Raise an invoice or confirm a cost and the figure
                builds itself, from the same entries as every other screen under Tax.
              </p>
            ) : pos.flatRateUsed !== null ? (
              <p style={S.body}>
                {asPercent(pos.flatRateUsed)}% of {gbp0(out !== null ? out.grossTurnover : 0)}, your
                VAT inclusive turnover since {pretty(from)}.
              </p>
            ) : (
              <p style={S.body}>
                {gbp0(pos.outputVat)} of VAT charged on the invoices you have raised since{' '}
                {pretty(from)}, less {gbp0(pos.inputVat)} on what you have bought and confirmed.
              </p>
            )}

            {refund ? (
              <p style={S.good}>
                More VAT came back on what you bought than you charged, so this quarter it is HMRC
                that owes you. That is a real position and not a mistake. A quiet quarter with a van
                in it does exactly this.
              </p>
            ) : null}

            {/* The control doctrine, in one quiet line. Never a reason to hold a figure back. */}
            {pos.inputVat > 0 ? (
              <p style={S.quiet}>
                {pos.proofShare >= 1
                  ? 'Every pound of that reclaim has a receipt behind it.'
                  : `${gbp0(withProof)} of that reclaim has a receipt behind it.`}
                {' '}Nothing here is ever refused for want of a receipt, and every figure that leaves
                this screen says how much of it is documented.
              </p>
            ) : null}

            {/* The scheme's own sentences, written by lib/vat.ts. The flat rate ones are the load
                bearing pair: a percentage of gross turnover, and no reclaim on what he buys. */}
            {notes.map((n) => <p key={n} style={S.quiet}>{n}</p>)}

            {vrn ? <p style={S.quiet}>Your VAT number is {vrn}.</p> : null}
          </section>

          {/* ── THE REVERSE CHARGE. Shown apart, and never added to what he owes. ──────────────
              Drawn only for a man who has raised one this quarter, doc 103's empty test. For him
              it is the difference between a figure that looks broken and a figure he trusts. */}
          {reverseCharge > 0 ? (
            <section className="lek-card">
              <h2 className="lek-h2">Why the VAT you charged looks low</h2>
              <div style={S.figRow}>
                <div>
                  <div className="lek-tile-label">Reverse charge on your invoices</div>
                  <div className="lek-big">{gbp0(reverseCharge)}</div>
                </div>
              </div>
              <p style={S.body}>
                On those invoices your customer accounts for the VAT, so it is not yours to pay and
                it is not in the figure above.
              </p>
              {subbie ? <p style={S.quiet}>{subbie.says}</p> : null}
            </section>
          ) : null}

          {/* ── REG 111. What he can still claim from before he registered, with his own dates. */}
          {window111 ? (
            <section className="lek-card">
              <h2 className="lek-h2">What you could reclaim from before you registered</h2>
              <p style={S.body}>
                You registered on {pretty(window111.registeredOn)}. The VAT on goods you still had
                on hand that day, bought back to {pretty(window111.goodsFrom)}, and on services
                bought back to {pretty(window111.servicesFrom)}, can be reclaimed. It belongs on
                your first return after registering.
              </p>
              <p style={S.quiet}>
                What it takes is the original VAT invoices, and that the goods were still on hand
                when you registered. Every receipt you put in your Lekhio is kept ready for exactly
                this. If it was missed at the time, it is worth raising with whoever does your VAT.
              </p>
            </section>
          ) : null}

          {/* The one honest sentence about filing, said once and without apology. There is no MTD
              for VAT in this codebase at all, so nothing here may hint at one arriving. */}
          <p style={S.foot}>
            Lekhio does not send VAT returns to HMRC. This is your position, prepared from your own
            invoices and the costs you have confirmed, so that you already know the figure before
            you file your own return, through whatever you use for it today.
          </p>
        </>
      )}
    </main>
  );
}

// ── Dates ──────────────────────────────────────────────────────────────────────────────────────
// Display and windows only. No rule of tax is decided here: the calendar quarter is a date, and
// which dates his own VAT quarters run between is HMRC's stagger, which we do not hold and the
// screen says so rather than guessing.

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function quarterStartISO(now: Date): string {
  const month = now.getUTCMonth();
  return isoDay(new Date(Date.UTC(now.getUTCFullYear(), month - (month % 3), 1)));
}

// "1 July 2026". The quarterly summary keeps its own copy of this for the same reason: it is
// display, not law, and a shared date formatter is not what this product is short of.
function pretty(iso: string): string {
  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// The column and the card come whole from APP_CSS. This screen owns only the figure row, exactly
// as the National Insurance screen does.
const CSS = [
  A11Y_CSS,
  APP_CSS,
  `.lek-big{font-size:${TYPE.stat}px;font-weight:800;letter-spacing:-0.02em;font-variant-numeric:tabular-nums}`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  window: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: `0 0 ${SPACE.md}px`, maxWidth: '62ch' },
  body: { fontSize: TYPE.body, lineHeight: 1.6, color: INK, margin: '10px 0 0', maxWidth: '62ch' },
  quiet: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '10px 0 0', maxWidth: '62ch' },
  empty: { fontSize: TYPE.strong, fontWeight: 700, margin: 0 },
  // His rolling twelve months, drawn as the fact it is. RUN 2: this screen used to have no figure
  // on this arm at all, so there was nothing for a number to be styled as.
  figure: { fontSize: TYPE.stat, fontWeight: 800, letterSpacing: '-0.02em', margin: '4px 0 0', color: INK },
  good: { fontSize: TYPE.body, lineHeight: 1.6, color: ON_GREEN_TINT, background: GREEN_TINT, borderRadius: RADIUS.md, padding: '12px 14px', margin: '12px 0 0', maxWidth: '62ch' },
  warn: { fontSize: TYPE.body, lineHeight: 1.55, color: INK, background: SAFFRON_TINT, border: `1px solid ${LINE}`, borderColor: edge(SAFFRON_DEEP, 27), borderRadius: RADIUS.lg, padding: '13px 15px', margin: '14px 0 0', maxWidth: '62ch' },

  figRow: { display: 'flex', gap: SPACE.lg, flexWrap: 'wrap', background: SURFACE, borderRadius: RADIUS.md, padding: '12px 14px', margin: '0 0 4px' },

  foot: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, textAlign: 'center', margin: '18px 4px 0' },
};

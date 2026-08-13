import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../../lib/webauth';
import { SESSION_COOKIE } from '../../../../lib/websession';
import { getBusinessProfile, getConfirmedTransactionsForRange, readCircumstances, capitalAllowanceForYear } from '../../../../lib/supabase';
import { buildQuarterPack, quarterBounds, quarterForDate, taxYearLabel } from '../../../../lib/quarterpack';
import { bankFeedOffered } from '../../../../lib/bankfeed';
import { wholeFirmCaption } from '../../../../lib/position';
import { mtdStatedFrom } from '../../../../lib/circumstances';
import { gbp0 } from '../../lib/money';
import { outstandingUpdate, overdueUpdate, updateDue, UPDATE_ORDINAL } from '../due';
import { A11Y_CSS, APP_CSS, FONT, RADIUS, SPACE, TYPE } from '../../../../lib/tokens';
import {
  INK, LINE, MUTED, ON_GREEN_TINT, PAPER, RIVER, SAFFRON_DEEP, SAFFRON_TINT, SURFACE, edge,
} from '../../../../lib/apptheme';
import { AppNav } from '../../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// THE QUARTERLY PICTURE. What a Making Tax Digital update would report today.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 AN UPDATE IS CUMULATIVE, AND THIS SCREEN EXISTS TO SAY SO BEFORE ANYONE FINDS OUT THE
// HARD WAY.
//
// From 2025/26 an MTD quarterly update restates the WHOLE tax year, 6 April to the quarter end,
// every time. It is not "these three months". lib/quarterpack.ts carries the argument in the
// header of its `submission` block, and lib/hmrc.ts's buildCumulativeUpdate refuses any window
// that does not start on 6 April. So the big figures here are the cumulative ones, because they
// are the ones an update actually reports, and the quarter on its own sits underneath as context.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ EVERY FIGURE COMES FROM buildQuarterPack(), the same composition /api/quarter-pack serves to
// the phone and the accountant document. This page sums nothing itself: a summary screen that
// added its own totals would be a second reader over the figures a man's accountant already holds.
//
// ⚠️ AND THE WORDS NEVER CLAIM WE CAN FILE. The filing pipeline is built and tested against
// HMRC's own test systems, and it waits on HMRC granting production access. Until that day this
// screen is a rehearsal of the real thing, it says so, and when filing does arrive it will still
// wait for his approval, because that is the product. test/mtdclaims.test.mjs polices the words.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 AND UNTIL 31 JULY 2026 IT ADDRESSED EVERY READER AS AN MTD FILER, INCLUDING A DIRECTOR.
//
// The whole page spoke to a man who makes quarterly updates: what one would report, which update
// this is, when it is due, and a promise that he would approve the figures before anything went.
// A limited company makes none of them. Making Tax Digital for Income Tax covers self employment
// and rent on a personal return, and a company's trade is neither: the company files its own
// return. That is the sentence /app/setup already gives on its MTD step, reused rather than
// reinvented, because one fact argued two ways is argued wrong once.
//
// ⚠️ WHICH FIGURES SURVIVE FOR A DIRECTOR, AND WHY THEY ARE HIS.
//
//   In, Out, Profit        His own confirmed entries added up. Arithmetic over his book, with no
//                          tax rule inside it, so it is true whatever return the money ends up on.
//   The property block     Same arithmetic on the rent rows, kept apart from the trade rows the
//                          way he entered them. The claim about how an UPDATE carries property is
//                          not made to him, because he does not make one.
//   The CIS line           Money a contractor really did deduct from real payments. A fact about
//                          what left, not a claim about which return settles it.
//   The three months       The same arithmetic over a narrower window, and it stops calling itself
//                          "not what an update reports", which for him would be arguing with a
//                          claim nobody made.
//
// What goes: the update framing, the calendar card with its due date, and the filing promise. A
// due date belongs to a return he does not file, and doc 103 would rather this page said nothing
// there than filled the hole with something invented. NOT ONE FIGURE MOVES either way.
//
// ⚠️ ONLY AN EXPLICIT COMPANY LOSES ANYTHING. getBusinessProfile defaults an unset column to sole
// trader and a failed read is null, so both keep today's page exactly.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export default async function TaxSummaryPage() {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  // Carries him back here after he signs in, the /app/you/billing pattern: safeNext() in
  // lib/websession.ts allowlists /app and below, so this cannot become an open redirect.
  if (!user) redirect('/in?next=%2Fapp%2Ftax%2Fsummary');

  const now = new Date();
  const { startYear, index } = quarterForDate(now);
  const taxYearStart = quarterBounds(startYear, 1).start;
  const bounds = quarterBounds(startYear, index);

  const [txns, biz, circ, capAllow] = await Promise.all([
    getConfirmedTransactionsForRange(user.id, taxYearStart, bounds.end).catch(() => []),
    // Who he is, from the same source every other structure aware screen reads. Null is unknown,
    // and unknown reads exactly as it did before wave nine.
    getBusinessProfile(user.id).catch(() => null),
    // 🔴 AND WHETHER HMRC'S LETTER ARRIVED, which is the only evidence of mandation that exists,
    // because HMRC reads a return already filed and this page holds only this year. A failed read
    // is unknown and never a no. See mtdPosition() in lib/taxengine.ts.
    readCircumstances(user.id).catch(() => null),
    // The car's writing down allowance for the year, so this page's tax estimate matches the
    // Overview and the lender documents. It comes off the ESTIMATE only, never the submission figure.
    capitalAllowanceForYear(user.id, startYear).catch(() => 0),
  ]);
  const pack = buildQuarterPack({
    transactions: txns, startYear, quarter: index, truncated: txns.length >= 20000,
    // 🔴 THIS WAS MISSING, so the pack could not exclude a partner's share (or a company's
    // turnover) from the mandation test. See the calendar card below and lib/quarterpack.ts.
    structure: biz?.businessType ?? null,
    mtdStated: mtdStatedFrom(Object.fromEntries((circ ?? []).map((a) => [a.key, a.answer]))),
    capitalAllowance: capAllow,
  });

  const isCompany = biz?.businessType === 'limited_company';
  const isPartnership = biz?.businessType === 'partnership';
  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 🔴 WHO THIS PAGE'S UPDATE FRAMING IS ACTUALLY ADDRESSED TO.
  //
  // The page was written for a man who makes quarterly updates, and in July it learned that a
  // DIRECTOR is not one. It did not learn that a PARTNER is not one either: Making Tax Digital has
  // not reached partnerships, so "what an update would report", "an update always restates the
  // whole year", "it is not what an update reports" and "you will approve before anything goes"
  // were all addressed to a man who will never make one.
  //
  // ⚠️ HE IS NOT A DIRECTOR THOUGH, and the director branches say things that are false of him
  // ("the company files its own return"). So this is a third audience, not a reuse of the second.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  const makesUpdates = !isCompany && !isPartnership;
  // The figures below are the FIRM'S whole books, not his slice. /app/money says so in these exact
  // words for the same shape of data, out of lib/position.ts, so the two screens cannot drift.
  const firmNote = biz ? wholeFirmCaption(biz.businessType) : null;
  const sub = pack.submission;
  const due = updateDue(startYear, index);
  const ordinal = UPDATE_ORDINAL[index];
  const hasFigures = sub.txCount > 0;
  const entryCount = sub.txCount === 1 ? 'the one entry' : `${sub.txCount} entries`;

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 🔴 MANDATION IS NOT A FIGURE THIS PAGE HOLDS. REWRITTEN 3 AUGUST 2026.
  //
  // `pack.ytd.mtdApplies && !isCompany` read "his gross this year is over the line" and called it
  // "he is mandated". GOV.UK decides it from a return already filed: "to check if you needed to
  // use Making Tax Digital for Income Tax from April 2026, we reviewed your 2024 to 2025 Self
  // Assessment tax return." So this page could put a deadline in front of a man who has none, and
  // withhold one from a man whose three updates had already gone.
  //
  // ⚠️ `mandated` NOW MEANS ONE THING AND ONLY ONE: he told us HMRC wrote to him. Everything that
  // drives a DATE hangs off it, because a date is a promise, and the cost of an invented deadline
  // is a man rearranging his week for an obligation he does not have. What the page can still say
  // to everyone else, honestly, is where his figures sit and what the real test is.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  const mtdPos = isCompany ? 'excluded' : pack.ytd.mtdPosition;
  const mandated = mtdPos === 'stated_in';
  // UTC, because quarterForDate() above reads the clock in UTC. Two readings of "today" on one
  // page is how a boundary day comes to disagree with itself.
  const outstanding = mandated ? outstandingUpdate(now.toISOString().slice(0, 10), startYear, index) : null;
  // 🔴 THE ONE THAT HAS ALREADY GONE. See overdueUpdate in ../due.ts for the five days this cost.
  const overdue = mandated ? overdueUpdate(now.toISOString().slice(0, 10), startYear, index) : null;

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/tax/summary" />

      {pack.truncated ? (
        <p style={S.warn}>
          You have an unusually large number of entries and not all of them could be counted here.
          Do not hand these figures to anyone until you have spoken to us.
        </p>
      ) : null}

      {/* ── WHAT AN UPDATE WOULD REPORT TODAY. The cumulative window, said out loud. ───────────
          For a director the same figures keep their place under an honest heading, because the
          money is his book either way and it is only the update framing that was never his. */}
      <section className="lek-card">
        <h1 className="lek-h2">
          {makesUpdates ? 'What a quarterly update would report today' : 'Your money since 6 April'}
        </h1>
        {isCompany ? (
          <p style={S.window}>
            Making Tax Digital for Income Tax covers self employment and rent on a personal return,
            and your company&apos;s trade is neither: the company files its own return. So this is
            not an update, it is your own figures for {pack.taxYear} added up. That window is the
            personal tax year rather than your company&apos;s accounting period, so read it as a
            running total and not as a set of accounts.
          </p>
        ) : isPartnership ? (
          <p style={S.window}>
            Tax year {pack.taxYear}, 6 April to today. Making Tax Digital has not reached
            partnerships, so this is not an update: it is the firm&apos;s money added up, and your
            share of the profit goes on your own Self Assessment return.
          </p>
        ) : (
          <p style={S.window}>
            Tax year {pack.taxYear}, 6 April to today. An update always restates the whole year so
            far and replaces the one before it, never just the latest three months.
          </p>
        )}

        {hasFigures ? (
          <>
            <div className="lek-grid">
              <div className="lek-tile">
                <div className="lek-tile-label">In</div>
                <div className="lek-tile-value" style={{ color: ON_GREEN_TINT }}>{gbp0(sub.trade.income)}</div>
              </div>
              <div className="lek-tile">
                <div className="lek-tile-label">Out</div>
                <div className="lek-tile-value" style={{ color: RIVER }}>{gbp0(sub.trade.expenses)}</div>
              </div>
              <div className="lek-tile">
                <div className="lek-tile-label">Profit</div>
                <div className="lek-tile-value">{gbp0(sub.trade.net)}</div>
              </div>
            </div>
            <p style={S.quiet}>
              {/* \u26a0\ufe0f "YOUR TRADE" IS THE FIRM'S TRADE FOR A PARTNER, and the number beside it is
                  the whole firm's, not his slice. /app/tax one click away says "These figures are
                  your 50% share"; without this line the two screens show two profits and neither
                  explains the other. The words are lib/position.ts's, the same ones /app/money
                  uses for the same shape of data, so no page writes its own. */}
              {firmNote ? (
                <>{firmNote}{' '}It covers {entryCount} you have confirmed since 6 April.</>
              ) : (
                <>Your trade, from {entryCount} you have confirmed since 6 April.</>
              )}
              {' '}Anything still waiting on you is not in these figures.
            </p>

            {/* ═══════════════════════════════════════════════════════════════════════════════
                🔴 £61,284 USED TO LEAVE THIS PAGE WITHOUT A WORD, AND IT LEFT IN THE WRONG
                DIRECTION.
                Until 4 August 2026 the tiles were his book: income minus everything that left.
                On the account that found this they read In £33,580, Out £72,088, Profit MINUS
                £38,508, because a £60,000 Audi and a £1,284 tester were in Out. One click away,
                /app/tax/what-if said "Your confirmed profit since 6 April is £22,776" and
                /app/tax quoted a bill of £16,626. Three screens, one account, one tax year.
                The engine was right and this page was wrong: GOV.UK, claim capital allowances,
                business cars, "Cars do not qualify for: annual investment allowance (AIA)", so a
                car is not a cost an update reports. lib/quarterpack.ts holds it out of expenses
                now, and the tiles above are what an update would actually report.
                ⚠️ WHICH MAKES NAMING IT COMPULSORY, NOT OPTIONAL. A page headed "what a quarterly
                update would report" that silently drops £61,284 of a man's own spending has only
                traded one wrong number for a second one he cannot check. The money is named, the
                reason is one sentence, and /app/money prices each one.
                ⚠️ AND THE FIGURE IS THE COST, NEVER THE ALLOWANCE. An allowance is a year end
                claim and this page holds one tax year of rows, so a car bought last year is
                invisible here and its allowance would be understated. Stating a number this page
                cannot see the whole of would be the same fault in a quieter voice.
                ═══════════════════════════════════════════════════════════════════════════════ */}
            {sub.trade.capitalCost > 0 ? (
              <p style={S.quiet}>
                {gbp0(sub.trade.capitalCost)} more went out on{' '}
                {sub.trade.capitalCount === 1 ? 'a car' : `${sub.trade.capitalCount} cars`}, and an
                update does not report{sub.trade.capitalCount === 1 ? ' it' : ' them'} as a cost. A
                car comes off over several years, never in one, so it is not in Out above. Your
                money log has {sub.trade.capitalCount === 1 ? 'the payment' : 'each payment'} in
                full and what it is worth this year.
              </p>
            ) : null}

            {/* Property is its own stream on a real update, so it is its own block here, and only
                for a man who has one. A permanent empty property row fails doc 103's empty test. */}
            {pack.hasProperty ? (
              <div style={S.propBlock}>
                <h2 className="lek-h2">Property, reported separately</h2>
                <p style={S.quiet}>
                  {gbp0(sub.property.income)} of rent in, {gbp0(sub.property.expenses)} out, so{' '}
                  {gbp0(sub.property.net)} of property profit so far.{' '}
                  {/* The figures are the same either way. Only the claim about what an update does
                      with them belongs to a man who makes one. */}
                  {makesUpdates
                    ? 'An update carries property as its own stream, never mixed into the trade.'
                    : 'Rent is kept as its own stream here, never mixed into the trade.'}
                </p>
                {/* 🔴 THE MORTGAGE INTEREST, NAMED, BECAUSE IT LEFT HIS ACCOUNT AND IS NOT IN THE
                    PROFIT ABOVE. R2-F25, 13 August 2026.

                    It used to be inside "out" and netted off the profit, which understated the
                    profit by the whole of the interest and described a submission nobody should
                    make: on an update, residential finance goes in its own field precisely because
                    it is not an allowable expense. Section 24, since 2020.

                    Silence was not an option either. The capital line above this block exists
                    because taking a car out of expenses and saying nothing once put "Out £72,088"
                    and "Profit £22,776" on two screens of one product with nothing joining them.
                    A landlord who paid £2,440 to his lender must be able to see where it went. */}
                {sub.property.financeCost > 0 ? (
                  <p style={S.quiet}>
                    A further <b>{gbp0(sub.property.financeCost)}</b> went out on mortgage interest,
                    and it is deliberately not in the profit above. Since Section 24 the interest on
                    a residential let is not deducted from your rental income: it comes back as a
                    20% credit against your tax instead, which is worked out for you on the Tax
                    page. {makesUpdates ? 'An update reports it in its own box for the same reason.' : ''}
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* ═════════════════════════════════════════════════════════════════════════════
                🔴 WHOSE PAY. THE ONE SENTENCE ON THIS PAGE THAT DID NOT SAY. Run 3, 13 Aug 2026.

                Every figure in the block above is the WHOLE FIRM'S and the page says so twice. This
                sentence sat three lines under a paragraph explaining that his SHARE goes on his own
                return, and called the firm's £5,600 "your pay". Home, correctly, calls his half of
                it £2,800. So the product showed a partner £9,207, £5,600 and £2,800 for his CIS on
                three screens in one evening, each of them in the first person about his money.

                The figure is right for this page and stays. What it is a figure OF is now said. */}
            {sub.cisSuffered > 0 ? (
              <p style={S.refund}>
                <b>{gbp0(sub.cisSuffered)}</b> of CIS has been deducted since 6 April
                {isPartnership ? ' from the firm\u2019s payments' : ' from your pay'}. That is tax
                already handed over on your behalf, and it is counted when the year is settled.
                {isPartnership ? ' Your own share of it is on your Overview, and that is the figure that reaches your return.' : ''}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <p style={S.empty}>Nothing confirmed since 6 April yet.</p>
            {/* The bank sentence returns with bankFeedOffered(). */}
            <p style={S.quiet}>
              {bankFeedOffered()
                ? 'Connect your bank and confirm what lands, and this page keeps itself ready. There is nothing else you need to do for it.'
                : 'Put your money in, by hand or by statement, and confirm what lands. This page keeps itself ready. There is nothing else you need to do for it.'}
            </p>
          </>
        )}
      </section>

      {/* ── THE CALENDAR. Which update this is and when it is due. ─────────────────────────────
          Withheld from a director whole. A due date is the date of a return he does not file, and
          there is nothing honest to put in its place without inventing a company deadline, so the
          card simply is not there.

          ═══════════════════════════════════════════════════════════════════════════════════
          🔴 AND IT WAS HANDING A GARDENER ON £8,400 A QUARTERLY DEADLINE.

          The gate was isCompany and nothing else, so EVERY sole trader read "The second update of
          2026/27 ... is due by 7 November 2026", whatever he earned. Making Tax Digital for Income
          Tax starts at £50,000 of gross qualifying income. buildQuarterPack() had already worked
          that test out and put the answer in pack.ytd.mtdApplies; app/app/tax/page.tsx already
          withholds its own MTD row on it, in these words; renderQuarterPackHtml() already branches
          its Making Tax Digital sentence on it. Only this card ignored it, so the SCREEN AND THE
          DOCUMENT HE PRINTS FROM THE SAME PACK said different things about the same fact, which is
          the one thing lib/quarterpack.ts's own header says must never happen.

          ⚠️ THE UNDER THE LINE BRANCH SAYS WHERE HE STANDS RATHER THAN NOTHING. A blank space
          where a deadline used to be reads as "we could not work it out". His gross and the
          threshold are both already in the pack, so the truth costs the same box.

          ⚠️ AND IT NAMES HMRC'S ACTUAL TEST, which is not the one this page can run. Mandation
          is decided on a return already filed (2026/27 is set by the 2024/25 figures), and the pack
          tests gross income in the year you are in because that is what Lekhio holds. Saying so is
          not a hedge: for a man under the line it is the only sentence that tells him where the
          answer really comes from. See docs and Jag's note on the wider sweep.
          ═══════════════════════════════════════════════════════════════════════════════════ */}
      {/* ═══════════════════════════════════════════════════════════════════════════════
          🔴 THE MISSED UPDATE, ABOVE THE CALENDAR, BECAUSE IT IS THE MORE URGENT FACT.

          Drawn only when there is one, so for everybody in good standing this box does not exist
          (doc 103's empty test). It never says "you have not sent it": Lekhio cannot file yet, so
          we have no record either way and she may well have sent it through other software or an
          agent. "I have no record of this going" is the sentence that stays true for her too.

          The easement and the return gate ship together, always. Penalty points are genuinely
          waived for 2026/27 and saying so alone would be an all clear, which this is not: every
          update has to be in before the year's return can be filed.
          ═══════════════════════════════════════════════════════════════════════════════ */}
      {isCompany ? null : overdue ? (
        <section className="lek-card" style={S.overdue}>
          <h2 className="lek-h2">Your {overdue.ordinal} update was due on {overdue.due}</h2>
          <p style={S.body}>
            It covers 6 April to {prettyEnd(overdue.end)}, and I have no record of it going. Lekhio
            cannot send an update to HMRC yet, so it has to go through other software that can file
            them, or whoever does your return. The figures on this page are the ones it asks for.
          </p>
          <p style={S.quiet}>
            There are no penalty points for a late quarterly update in 2026/27. That is not the same
            as it not mattering: every update for the year has to be in before the return for that
            year can be filed, so a missed one is put off rather than written off.
          </p>
        </section>
      ) : null}

      {isCompany ? null : mandated ? (
        <section className="lek-card">
          <h2 className="lek-h2">
            {outstanding
              ? `Your ${outstanding.ordinal} update is still open`
              : `The ${ordinal} update of ${pack.taxYear}`}
          </h2>
          {outstanding ? (
            <>
              <p style={S.body}>
                It covers 6 April to {prettyEnd(outstanding.end)} and is due by <b>{outstanding.due}</b>.
                Your figures are already kept in the shape an update reports, so the deadline is a
                date, not a job.
              </p>
              <p style={S.quiet}>
                The {ordinal} update, 6 April to {prettyEnd(bounds.end)}, follows it and is due by{' '}
                {due}. It restates the whole year again, everything above included.
              </p>
            </>
          ) : (
            <p style={S.body}>
              It covers 6 April to {prettyEnd(bounds.end)} and is due by <b>{due}</b>. Your figures are
              already kept in the shape an update reports, so the deadline is a date, not a job.
            </p>
          )}
        </section>
      ) : isPartnership ? (
        /* 🔴 A PARTNER IS OUT FOR A DIFFERENT REASON, AND THE THRESHOLD SENTENCE WOULD LIE TO HIM.
           He is not under the line, he is outside the regime: GOV.UK says partnerships will need
           Making Tax Digital "in the future" and that the timeline comes "at a later date". Handing
           him the threshold branch would also print his gross as £0, because lib/quarterpack.ts now
           correctly leaves partnership trade out of the test, and £0 on a page showing £53,400 of
           takings reads as a broken screen rather than an exclusion. */
        <section className="lek-card">
          <h2 className="lek-h2">No quarterly update is due from you</h2>
          <p style={S.body}>
            Making Tax Digital for Income Tax has not reached partnerships yet. HMRC has said it will,
            and that the timeline comes later, so there is no update for you to make and no date to
            keep. The figures above are yours to check.
          </p>
          <p style={S.quiet}>
            Your share of the profit goes on your own Self Assessment return the way it does today, and
            the partnership files its own alongside it. When a date is announced your Lekhio is already
            kept in the shape an update reports, so it will be a date rather than a job.
          </p>
        </section>
      ) : mtdPos === 'stated_out' ? (
        /* 🔴 HE TOLD US. THE ONLY BRANCH LEFT THAT IS ENTITLED TO ASSERT ANYTHING.
           HMRC writes to the people it has assessed, so a man saying no letter came is better
           evidence than any figure on this page, and it holds even if his year to date is well
           over the line. The second sentence is the way back: an answer given in error, or a
           letter that turns up in October, must not be a dead end. */
        <section className="lek-card">
          <h2 className="lek-h2">No quarterly update is due from you</h2>
          <p style={S.body}>
            You told us HMRC has not written to you about Making Tax Digital for Income Tax, so
            there is no update here for anyone to be waiting on. The figures above are yours to
            check, and your Lekhio keeps them in update shape anyway.
          </p>
          <p style={S.quiet}>
            HMRC decides who is in it from your {taxYearLabel(startYear - 2)} tax return rather than
            the year you are in, and writes to say so. If that letter turns up, tell us in{' '}
            <a href="/app/you/circumstances" style={S.link}>your answers</a> and this page changes
            the same day.
          </p>
        </section>
      ) : (
        /* ═══════════════════════════════════════════════════════════════════════════════════
           🔴 WE HAVE NOT ASKED HIM, SO THIS PAGE MAY NOT ANSWER. REWRITTEN 3 AUGUST 2026.

           This branch used to read "Making Tax Digital starts at £50,000 and yours since 6 April
           is £8,400, so there is no update here for anyone to be waiting on." Both halves of that
           are this year's figures, and this year is not the test. Two men land here:

             - The quiet year after a big one. His 2024/25 was £60,000, HMRC wrote to him in
               February, and his August, November and February updates are real. The old sentence
               told him nobody was waiting on anything. That is the silent failure, and it is the
               one that costs him.
             - The big year after a quiet one. He is over the line today and mandated by nothing,
               because HMRC read a smaller return.

           So the card states where his figures sit, names the test HMRC actually applies, and asks
           the one question that settles it. It does not guess, and it does not go blank: a blank
           where a deadline used to be reads as a page that could not work it out.

           ⚠️ IT DRAWS FOR BOTH UNSTATED POSITIONS, over the line and under it, and the only thing
           that changes between them is which way the figure sits. Drawing only for the man over
           the line would rebuild the exact hole this fixes.
           ═══════════════════════════════════════════════════════════════════════════════════ */
        <section className="lek-card">
          <h2 className="lek-h2">One question settles this</h2>
          {/* ═══════════════════════════════════════════════════════════════════════════════════
              🔴 A ZERO WE WERE NEVER GIVEN IS NOT "YOUR INCOME". 9 August 2026, empty state audit.

              On a new account this card sat directly beneath one that had just said "Nothing
              confirmed since 6 April yet", and then read: "Your income since 6 April is £0, which
              is under the £50,000 Making Tax Digital for Income Tax line." Two cards on one screen:
              the first admitting we know nothing about his money, the second treating that nothing
              as his income and reaching a conclusion about a legal obligation from it.

              The branch is right to draw for both unstated positions, and the note above says why.
              It was wrong to have only two. An account with no figures at all is a THIRD case, and
              stating a figure we were never given is how a man comes to believe we have checked
              something we have not.
              ═══════════════════════════════════════════════════════════════════════════════════ */}
          {pack.ytd.grossQualifyingIncome <= 0 ? (
            <p style={S.body}>
              You have not confirmed any income since 6 April, so we cannot say where you sit against
              the {gbp0(pack.ytd.mtdThreshold)} Making Tax Digital for Income Tax line for{' '}
              {pack.taxYear}. This year is not the test in any case: HMRC decides it from your{' '}
              {taxYearLabel(startYear - 2)} tax return, and writes to you to say so.
            </p>
          ) : (
            <p style={S.body}>
              Your income since 6 April is {gbp0(pack.ytd.grossQualifyingIncome)}, which is{' '}
              {mtdPos === 'unstated_over' ? 'over' : 'under'} the {gbp0(pack.ytd.mtdThreshold)} Making
              Tax Digital for Income Tax line for {pack.taxYear}. That is this year, and this year is
              not the test: HMRC decides it from your {taxYearLabel(startYear - 2)} tax return, and
              writes to you to say so.
            </p>
          )}
          <p style={S.quiet}>
            So the one thing we cannot work out from your figures is whether that letter arrived.{' '}
            <a href="/app/you/circumstances" style={S.link}>Tell us</a> and this page will say plainly
            whether an update is due and when. Your Lekhio is kept in update shape either way, so
            whichever the answer is there is nothing to catch up on.
          </p>
        </section>
      )}

      {/* ── THE QUARTER ON ITS OWN. Context, smaller, under the figures that matter. ─────────── */}
      {hasFigures ? (
        <section className="lek-card">
          <h2 className="lek-h2">These three months on their own</h2>
          <p style={S.quiet}>
            {pack.period.label}: {gbp0(pack.trade.income)} in, {gbp0(pack.trade.expenses)} out,{' '}
            {gbp0(pack.trade.net)} of trade profit. Useful for seeing what the quarter itself did.
            {/* The disclaimer answers the heading above it. For a director there is no update claim
                to correct, so the sentence would be arguing with nobody. */}
            {makesUpdates ? <>{' '}It is not what an update reports.</> : null}
          </p>
        </section>
      ) : null}

      {/* ── THE HONEST LINE ABOUT FILING. We prepare. He approves. The switch waits on HMRC. ──
          A director gets the first sentence and not the rest: the rest is a promise about an update
          he will never make, and a promise aimed at the wrong man is how a product loses him. */}
      {!makesUpdates ? (
        <p style={S.foot}>
          Nothing on this page has been sent anywhere. These are your own figures, prepared from
          what you have confirmed, for you to check and to hand to whoever prepares your returns.
        </p>
      ) : (
        <p style={S.foot}>
          Nothing on this page has been sent anywhere. Lekhio cannot send an update to HMRC yet: the
          filing pipeline is built and the switch waits on HMRC granting production access. When it
          arrives, you will see the figures first and approve them before anything goes.
        </p>
      )}
    </main>
  );
}

// "5 October 2026" from a pack date, for the calendar sentence. Display only: the date itself is
// lib/quarterpack.ts's, never derived here.
function prettyEnd(iso: string): string {
  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// The column, the card and the tiles come whole from APP_CSS. This screen owns nothing of its own.
const CSS = [A11Y_CSS, APP_CSS].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  warn: { fontSize: TYPE.body, lineHeight: 1.55, color: INK, background: SAFFRON_TINT, border: `1px solid ${LINE}`, borderColor: edge(SAFFRON_DEEP, 27), borderRadius: RADIUS.lg, padding: '13px 15px', margin: '0 0 14px' },

  // The missed update. The same saffron the warn banner uses, so "this one needs you" reads the
  // same wherever it appears, and never red: she is one press from fine and there are no penalty
  // points this year.
  overdue: { background: SAFFRON_TINT, borderColor: edge(SAFFRON_DEEP, 27) },

  window: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: `0 0 ${SPACE.md}px`, maxWidth: '62ch' },
  body: { fontSize: TYPE.body, lineHeight: 1.6, color: INK, margin: 0, maxWidth: '62ch' },
  quiet: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '10px 0 0' },
  empty: { fontSize: TYPE.strong, fontWeight: 700, margin: 0 },
  // The one inline link on this page. Same shape as labelLink in /app/money and /app/invoices,
  // so a link inside a sentence looks the same wherever he meets one.
  link: { color: INK, fontWeight: 700, textDecoration: 'underline', textDecorationColor: LINE, textUnderlineOffset: 3 },

  propBlock: { borderTop: `1px solid ${LINE}`, marginTop: SPACE.md, paddingTop: SPACE.md },
  refund: { fontSize: TYPE.body, lineHeight: 1.55, color: INK, background: SURFACE, borderRadius: RADIUS.md, padding: 14, margin: '14px 0 0' },

  foot: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, textAlign: 'center', margin: '18px 4px 0' },
};

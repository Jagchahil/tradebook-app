import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../lib/webauth';
import { SESSION_COOKIE } from '../../../lib/websession';
import {
  getOptimiserInput, getConfirmedTransactionsForRange, getBusinessProfile, readVatProfile,
} from '../../../lib/supabase';
import { taxPosition, setAsideBasisLine } from '../../../lib/taxoptimiser';
import { SCOTLAND_LINE } from '../../../lib/scotland';
import { shareCaption } from '../../../lib/position';
import { bankFeedOffered } from '../../../lib/bankfeed';
import { paymentsOnAccount, FACTS } from '../../../lib/taxengine';
import { buildQuarterPack, quarterBounds, quarterForDate } from '../../../lib/quarterpack';
import { mtdStatedFrom } from '../../../lib/circumstances';
import { gbp0 } from '../../../lib/money';
import { A11Y_CSS, APP_CSS, BREAK, FONT, RADIUS, SPACE, TYPE } from '../../../lib/tokens';
import {
  INK, LINE, MUTED, PANEL, PAPER, RIVER, RIVER_DEEP, RIVER_TINT, SURFACE, edge,
} from '../../../lib/apptheme';
import { AppNav } from '../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// THE TAX HUB. Where he stands, in plain words, and the doors down to the detail.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ NOT ONE FIGURE ON THIS SCREEN IS COMPUTED HERE, AND THIS SCREEN IS WHY THAT RULE EXISTS.
//
// The number at the top is taxPosition() on getOptimiserInput(), the SAME call the Overview makes,
// so the two screens cannot disagree about what he owes. The due dates come from
// paymentsOnAccount() in the engine. The MTD test comes from buildQuarterPack(), the same
// composition /api/quarter-pack serves. A tax hub that added anything up for itself would be a
// second reader over the one number a man checks against his bank account, and /api/ledger's
// header lists three separate times that ended badly.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ ONE CLEAR THING, THEN DOORS. Doc 103: he is up a ladder, he wants to know what he owes, and
// this page answers that in one number and one sentence. Everything else on it is a link DOWN to a
// screen that answers one further question well, never a copy of that screen's figures. A hub that
// repeats every number below it is a hub he has to read twice.
//
// ⚠️ AND THE ONCE TEST DECIDES WHAT GOES BEHIND TOOLS. National Insurance, his student loan and
// CIS are checked a few times a year at most. They are real screens, built and linked, one tap
// away behind a row that says Tools, which is what "away" is for. Putting them beside the January
// figure would hand him three more rows to read and reject every visit.

export default async function TaxHubPage() {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  // Carries him back here after he signs in, the /app/you/billing pattern: safeNext() in
  // lib/websession.ts allowlists /app and below, so this cannot become an open redirect.
  if (!user) redirect('/in?next=%2Fapp%2Ftax');

  const now = new Date();
  const { startYear, index } = quarterForDate(now);
  const taxYearStart = quarterBounds(startYear, 1).start;
  const quarterEnd = quarterBounds(startYear, index).end;

  const [optimiser, txns, biz, vat] = await Promise.all([
    getOptimiserInput(user.id),
    // The same window /api/quarter-pack reads, so the MTD line below is the pack's own answer.
    getConfirmedTransactionsForRange(user.id, taxYearStart, quarterEnd).catch(() => []),
    // For the partnership caption under the number. Same source /app/pay-yourself reads the share
    // from. A failed read draws no caption, which is safer than a wrong one.
    getBusinessProfile(user.id).catch(() => null),
    // Whether he is VAT registered at all, for the door below. Null is "we could not read it",
    // never "he is not registered", so an unknown draws nothing.
    readVatProfile(user.id).catch(() => null),
  ]);

  const tax = taxPosition(optimiser);
  const basis = setAsideBasisLine(optimiser, tax);
  // The set aside is worked out on getOptimiserInput's figures, which for a partner are already
  // his share of the firm's books. The caption from lib/position.ts says so, partnership only.
  const shareCap = biz ? shareCaption(biz.businessType, biz.partnershipShare) : null;

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 WHOSE OBLIGATIONS THESE ARE. Audited 31 July 2026, on a screen a director pays for.
  //
  // He was told "Making Tax Digital applies to you", and that January asks for payments on account.
  // Both are SELF ASSESSMENT mechanisms and neither is his. Making Tax Digital for Income Tax
  // covers self employment and rent on a personal return, and a company's trade is neither: the
  // company files its own return. That is the same reasoning /app/setup already gives on its MTD
  // step, in the same words, because a product that argues two ways about one fact argues wrong
  // once. Payments on account are TMA 1970 s59A, a Self Assessment mechanism, and they do not
  // exist for Corporation Tax.
  //
  // ⚠️ ONLY AN EXPLICIT COMPANY LOSES ANYTHING HERE. getBusinessProfile defaults an unset column to
  // sole trader and a failed read comes back null, so both fall through to exactly today's screen.
  // Hiding a real obligation from a sole trader because a read timed out is by far the worse
  // failure, and this branch is written so it cannot happen.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const isCompany = biz?.businessType === 'limited_company';

  // The MTD test, asked of the quarter pack rather than re-derived. The threshold, the gross
  // qualifying income and the by-year rule all live in lib/quarterpack.ts and lib/taxengine.ts.
  //
  // ⚠️ AND THE TEST BASE IS NOT A DIRECTOR'S. mtdApplies runs on gross trade plus gross property,
  // and for a company account the trade half is the COMPANY's turnover, which is not his qualifying
  // income at all. So the row is withheld rather than reworded: doc 103 would rather say nothing
  // than hand him a row explaining what does not apply. Rent is not buried with it, because rent on
  // a personal return does count towards the line: /app/tax/summary says so to a director in
  // exactly those words, which is where a man who lets property will read it.
  //
  // 🔴 AND IT WAS NOT PASSING `structure`, SO THE PACK COULD NOT APPLY EITHER EXCLUSION.
  // The company half was covered by `&& !isCompany` below. The PARTNERSHIP half was not covered by
  // anything, so on 3 August 2026 a 50% partner read "Making Tax Digital applies to you. Your income
  // this year, £53,400 before costs, is over the £50,000 line", where £53,400 was the FIRM'S turnover
  // and his own share was £26,700, for a regime that has not reached partnerships at all. The rule
  // lives in buildQuarterPack now, cited to GOV.UK, so this page asks rather than re-derives, and the
  // printed document at /api/quarter-pack (which always passed structure) cannot disagree with it.
  //
  // `&& !isCompany` STAYS. It is belt and braces on a row about a man's own money, and if the pack
  // ever forgets the exclusion the row still does not draw for him.
  //
  // 🔴 AND THE PACK CAN NO LONGER DECIDE MANDATION FROM THIS YEAR'S MONEY, BECAUSE HMRC DOES NOT.
  // getOptimiserInput already carries his circumstance answers, so the one fact only he holds,
  // whether HMRC's letter arrived, reaches the pack from the same read the rest of this page uses.
  // mtdStatedFrom() maps a skip, a missing key and a failed read all to null, which means "we have
  // not been told" and never "no". See mtdPosition() in lib/taxengine.ts.
  const pack = buildQuarterPack({
    transactions: txns, startYear, quarter: index, truncated: txns.length >= 20000,
    structure: biz?.businessType ?? null,
    mtdStated: mtdStatedFrom(optimiser.circumstances),
    // The car's allowance is already inside getOptimiserInput, so the tax hub reads it straight off
    // rather than fetching again, and its estimate matches the Overview and the lender documents.
    capitalAllowance: optimiser.ytdCapitalAllowances ?? 0,
  });
  // ⚠️ FOUR STATES, NOT A BOOLEAN, AND THE ROW BELOW SAYS SOMETHING DIFFERENT IN EACH. The old
  // `pack.ytd.mtdApplies && !isCompany` collapsed "his figures are over the line" into "the law
  // applies to him", which is the defect. `excluded` never draws the row at all.
  const mtdPos = isCompany ? 'excluded' : pack.ytd.mtdPosition;

  // ⚠️ THE EMPTY TEST. A proud £0 for a brand new account teaches him this screen says nothing.
  // The tax card is drawn once there is money behind it, and the empty state names the one thing
  // that fills it in, exactly as the Overview does.
  const moneyIn = Math.max(0, optimiser.ytdTradeIncome) + Math.max(0, optimiser.ytdPropertyIncome ?? 0);
  const showPosition = moneyIn > 0 || tax.setAside > 0;

  // What January asks for, from the engine. Payments on account run on the Self Assessment tax
  // WITHOUT the student loan, because HMRC's payments on account never include loan repayments,
  // and the year label is startYear + 1 so the engine prints the correct January.
  const poa = paymentsOnAccount(tax.selfAssessmentTax, startYear + 1);

  // THE RENTAL STREAM, NAMED. Step 4 of signup promises that each stream is taxed its own way and
  // kept separate the way HMRC keeps them; until 31 July 2026 this screen never said the word rent
  // to a landlord, which made that promise unverifiable on the one page it matters. One sentence,
  // drawn only when the account has the rental flag or confirmed rent (doc 103's empty test), and
  // it changes no figure: the property maths already lives in taxPosition via the same optimiser
  // input. "No National Insurance" is lib/propertyengine.ts's own verified fact, not this page's.
  const hasRentMoney = (optimiser.ytdPropertyIncome ?? 0) > 0;
  const rentalFlag = optimiser.circumstances?.rental === 'yes';
  const rentLine = hasRentMoney
    ? 'Your rent is taxed as its own stream, separate from your trade and with no National Insurance on it, and it is counted in the figure above. The property allowance working shows under Ways to save.'
    : rentalFlag
      ? 'You told us you have rental property. Rent is taxed as its own stream, separate from your trade, and once it is logged it is counted here and under Ways to save.'
      : null;

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // VAT. THE DOOR EXISTS ONLY FOR A MAN WHO IS REGISTERED.
  //
  // ⚠️ DOC 103'S STANDING QUESTION: what came out to make room for it? Nothing came out, and this
  // one earns its row anyway, because for most of this audience it is not a row at all. Most UK
  // trades are under the threshold and always will be, and a permanent VAT row telling them
  // "nothing to check" is the empty test failing in the one place it costs money: a row he learns
  // to skip is a row he skips the quarter it matters. For the man who IS registered, VAT is the
  // only thing on this screen with a quarterly clock on it and it is often larger than his income
  // tax bill, so it goes first among the doors rather than behind Tools. The once test sends a
  // thing behind Tools when he touches it less than monthly; a VAT position is checked whenever he
  // wonders what is going out this month.
  //
  // ⚠️ AND A FAILED READ DRAWS NOTHING. readVatProfile returns null when the read failed, never
  // "not registered", so an unknown keeps exactly today's screen. The cost of that is one missing
  // door for one page load. The cost of the other way round is a door to a screen that could only
  // tell him we could not read his profile.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const vatRegistered = vat !== null && vat.registered;
  // 🔴 AND THE DOOR FOR THE MAN WHO IS NOT REGISTERED, which did not exist. 9 August 2026.
  //
  // /app/tax/vat has always had an arm for him, and its own comment admitted nobody could get to
  // it: "He has no row on the Tax hub, so he typed the address to be here." So the one screen that
  // tells a sole trader where he stands against the ninety thousand pound line was unreachable, and
  // crossing that line late is a penalty.
  //
  // ⚠️ IT WAITED FOR THE FIGURE TO BE RIGHT. Until today that screen summed his INVOICES, which
  // undercounts anyone taking money he does not invoice here, and linking an undercounting figure
  // from the hub would have been worse than leaving it unreachable. It counts his confirmed trade
  // income now, the same money the weekly and the agent count, so the door can open.
  //
  // ⚠️ NOT ON A FAILED READ. `vat === null` means we could not read his profile, and drawing "check
  // where you stand on VAT" at a man who registered years ago is the same defect as the reclaim
  // promise this morning: a mechanism put in front of someone it does not apply to.
  //
  // ⚠️ AND NOT TO A DIRECTOR. His company registers, not him, and every sentence behind that door
  // says "your trade income". A director keeps exactly the hub he had.
  const vatThresholdDoor = vat !== null && !vat.registered && !isCompany;

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/tax" />

      {/* ── WHERE HE STANDS. One number, one sentence. ─────────────────────────────────────── */}
      {showPosition ? (
        <section className="lek-card lek-position">
          <h1 className="lek-eyebrow">Where you stand</h1>
          <div className="lek-hero">{gbp0(tax.setAside)}</div>
          <p className="lek-heronote">
            {tax.projected
              ? 'What the year is heading for, on everything you have confirmed so far.'
              : 'What the year so far has built up. Too early to call the whole year yet.'}
            {/* The January sentence is a Self Assessment sentence, so it is not said to a director.
                See the structure note above: his company is not in Self Assessment. */}
            {isCompany ? null : <>{' '}Self Assessment collects it in one bill, due by {poa.firstDue}.</>}
          </p>
          {/* And the absence is explained rather than left as a gap, because a man reading a large
              figure with no date on it will invent one. The claim is the narrow one setup already
              makes: the company files its own return, and his own position is a different question. */}
          {isCompany ? (
            <p style={S.heroBasis}>
              Your company files its own return, and your own tax position is a separate question.
              That is why there is no Self Assessment date on this figure.
            </p>
          ) : null}
          {/* What is inside the number, written by lib/taxoptimiser.ts so the claim about a man's
              tax stays in one place. Null for a pure sole trader, for whom it would add no fact. */}
          {basis ? <p style={S.heroBasis}>{basis}</p> : null}
          {/* Whose money it is worked out on. For a partner the figure runs on his share of the
              firm's books, and this is where that is said. */}
          {shareCap ? <p style={S.heroBasis}>{shareCap}</p> : null}
          {/* The rental stream, for a landlord only. See rentLine above for why it exists. */}
          {rentLine ? <p style={S.heroBasis}>{rentLine}</p> : null}
          {/* ⚠️ WHICH COUNTRY'S RATES. Same figure as the Overview, same sentence, and it is said
              here too because this screen is a nav destination in its own right: a man can arrive
              from the tab bar or a WhatsApp link and never load the Overview at all. Quieter than
              the lines above it, which describe HIS money. This one describes our working, and it
              is the only screen under Tax that carries it: the levers, the what if and the CIS
              refund are all one tap behind this figure. lib/scotland.ts owns the words. */}
          <p style={S.heroCaveat}>{SCOTLAND_LINE}</p>
        </section>
      ) : (
        <section className="lek-card">
          <h1 className="lek-eyebrow">Where you stand</h1>
          <p style={S.empty}>Nothing to work out yet.</p>
          {/* The bank sentence returns with bankFeedOffered(). */}
          <p style={S.quiet}>
            {bankFeedOffered()
              ? 'Connect your bank and your tax position builds itself from what you confirm. Every screen under Tax fills in from the same figures.'
              : 'Add what you earn and spend, by hand or by statement, and your tax position builds itself from what you confirm. Every screen under Tax fills in from the same figures.'}
          </p>
          {/* A landlord with the flag but no figures yet still deserves the promise kept: the
              stream is real, named, and waiting for his numbers. Only the flag line can appear
              here, because any confirmed rent makes the position card above draw instead. */}
          {rentLine ? <p style={S.quiet}>{rentLine}</p> : null}
        </section>
      )}

      {/* ── WHAT JANUARY ACTUALLY ASKS FOR. The part that catches people. ──────────────────────
          Drawn only when payments on account really apply, doc 103's empty test: a permanent row
          saying "no payments on account" is a row he learns to skip, and then the year he crosses
          the line he misses it.

          ⚠️ AND NEVER FOR A DIRECTOR. Payments on account are TMA 1970 s59A, a Self Assessment
          mechanism, and they have no counterpart in Corporation Tax. There is nothing true this
          page could put here in their place, so it puts nothing. */}
      {showPosition && !isCompany && poa.required ? (
        <section className="lek-card">
          <h2 className="lek-h2">January asks for more than the bill</h2>
          <p style={S.body}>
            Because the bill is over {gbp0(FACTS.poaThreshold)}, HMRC also asks for two payments on
            account towards the following year: about {gbp0(poa.eachPayment)} each, due{' '}
            {poa.firstDue} and {poa.secondDue}. The first one lands on the same day as the bill
            itself, which is the part that catches people. Your student loan, if one is being
            collected, is never part of payments on account.
          </p>
        </section>
      ) : null}

      {/* ── HIS MTD POSITION. ────────────────────────────────────────────────────────────────
          🔴 REWRITTEN 3 AUGUST 2026. THIS ROW USED TO STATE A LEGAL CONCLUSION FROM THE WRONG YEAR.

          It read "Making Tax Digital applies to you. Your income this year is over the line, so
          quarterly updates apply." HMRC does not decide from this year. GOV.UK: "to check if you
          needed to use Making Tax Digital for Income Tax from April 2026, we reviewed your 2024 to
          2025 Self Assessment tax return." So a man having a big year after a small one was told an
          obligation applied when it did not, and a man having a small year after a big one was told
          nothing at all while his August, November and February updates went past.

          Two of the five positions draw, and doc 103's empty test decides the other three:
            stated_in      he told us the letter came. The obligation is his, so say so.
            unstated_over  his figures are over the line and we have not asked him. Worth one row,
                           because there is a real question with two sensible answers behind it.
            stated_out     he told us it did not come. Nothing to check, so nothing drawn.
            unstated_under nothing drawn HERE, and that is not the same as nothing done: the
                           question is asked of EVERY sole trader through unansweredMtd(), whatever
                           his figures, which is the only channel that reaches the quiet year after
                           a big one. A permanent "we are not sure" row on the screen of every man
                           under the line is the row he learns to skip.
            excluded       a director or a partner, who is outside the regime, not under its line.
          ───────────────────────────────────────────────────────────────────────────────────── */}
      {mtdPos === 'stated_in' ? (
        <a href="/app/tax/summary" style={S.mtdRow} className="lek-hit">
          <span style={S.mtdTop}>Making Tax Digital applies to you</span>
          <span style={S.rowBody}>
            You told us HMRC has written to you, so quarterly updates apply for {pack.taxYear}. Your
            figures are already kept the way an update wants them. See where the quarter stands.
          </span>
        </a>
      ) : mtdPos === 'unstated_over' ? (
        <a href="/app/you/circumstances" style={S.mtdRow} className="lek-hit">
          <span style={S.mtdTop}>One question about Making Tax Digital</span>
          <span style={S.rowBody}>
            Your income this year, {gbp0(pack.ytd.grossQualifyingIncome)} before costs, is over the{' '}
            {gbp0(pack.ytd.mtdThreshold)} line for {pack.taxYear}. That is this year, and this year
            is not the test: HMRC decides it from your {pack.ytd.mtdTestBaseReturn} tax return and
            writes to you to confirm it. Tell us whether that letter came and we will know what to
            keep ready for you.
          </span>
        </a>
      ) : null}

      {/* ── THE DOORS DOWN. Each answers one question well. This page does not repeat them. ──── */}
      <section className="lek-card">
        <h2 className="lek-h2">Go deeper</h2>
        <div style={S.doors}>
          {/* See the VAT note above the return for why this is drawn for a registered customer
              only, and why it sits first when it is drawn at all. */}
          {vatRegistered ? (
            <a href="/app/tax/vat" style={S.door} className="lek-hit">
              <span style={S.doorLabel}>VAT this quarter</span>
              <span style={S.rowBody}>
                What you have charged, what you can reclaim, and where that leaves you.
              </span>
            </a>
          ) : vatThresholdDoor ? (
            /* See vatThresholdDoor above. Different words because it is a different question: he
               has no VAT to report, he has a line to watch. */
            <a href="/app/tax/vat" style={S.door} className="lek-hit">
              <span style={S.doorLabel}>VAT threshold</span>
              <span style={S.rowBody}>
                Where your last twelve months put you against the line, and what happens if you
                cross it.
              </span>
            </a>
          ) : null}
          <a href="/app/tax/summary" style={S.door} className="lek-hit">
            <span style={S.doorLabel}>Quarterly summary</span>
            {/* The door stays for a director, because the figures behind it are his own money added
                up. What goes is the promise of an update he does not have to make. */}
            {/* \u26a0\ufe0f AND THE DOOR MUST NOT PROMISE A DEADLINE EITHER. "When the next one is due"
                asserts there IS a next one, which for a man who is not mandated there is not.

                🔴 AND IT NOW READS THE POSITION, NOT A BOOLEAN. "When the next one is due" is only
                true of a man HMRC has actually written to. Promising a due date to a man whose only
                qualification is a good year to date is the same wrong statement as the row above,
                made quietly in a door label. Everything that is not stated_in gets the honest
                sentence, which is true of all four of the others. */}
            <span style={S.rowBody}>
              {isCompany
                ? 'Your figures since 6 April, and the quarter on its own.'
                : mtdPos === 'stated_in'
                  ? 'What an update would report today, and when the next one is due.'
                  : 'What an update would report today, and where you stand against the line.'}
            </span>
          </a>
          <a href="/app/tax/what-if" style={S.door} className="lek-hit">
            <span style={S.doorLabel}>What if</span>
            <span style={S.rowBody}>Try a bigger or smaller year, worked out on your real figures.</span>
          </a>
          <a href="/app/tax/ways-to-save" style={S.door} className="lek-hit">
            <span style={S.doorLabel}>Ways to save</span>
            <span style={S.rowBody}>Every legitimate lever we can find you, each with its working.</span>
          </a>
          <a href="/app/tax/can-i-claim" style={S.door} className="lek-hit">
            <span style={S.doorLabel}>Can I claim it</span>
            <span style={S.rowBody}>The expense rules in plain English, with HMRC&apos;s own pages behind them.</span>
          </a>
          {/* These two rode the old sidebar; the bottom bar carries no menus, so the hub is their
              door now. Vehicles keeps the argued exception to doc 103's once test recorded in
              AppNav: the whole value of the screen is being seen BEFORE he signs at the dealer. */}
          <a href="/app/tax/vehicle" style={S.door} className="lek-hit">
            <span style={S.doorLabel}>Vehicles</span>
            <span style={S.rowBody}>Van or car, and the cheapest way to buy one, seen before you sign.</span>
          </a>
          <a href="/app/pay-yourself" style={S.door} className="lek-hit">
            <span style={S.doorLabel}>Pay yourself</span>
            <span style={S.rowBody}>The most tax efficient way to take your money out.</span>
          </a>
        </div>
      </section>

      {/* ── THE TOOLS ROW. Doc 103's once test: checked a few times a year, so one tap away. A
          <details> opens with no script, the same trick the nav's own menus use. ─────────────── */}
      <details className="lek-tools">
        <summary className="lek-tools-summary">Tools</summary>
        <div style={S.doors}>
          <a href="/app/tax/ni" style={S.door} className="lek-hit">
            <span style={S.doorLabel}>National Insurance</span>
            <span style={S.rowBody}>Class 2, Class 4, and whether the year counts for your State Pension.</span>
          </a>
          <a href="/app/tax/student-loan" style={S.door} className="lek-hit">
            <span style={S.doorLabel}>Student loan</span>
            <span style={S.rowBody}>Your plan, and what January collects alongside the tax.</span>
          </a>
          <a href="/app/tax/cis" style={S.door} className="lek-hit">
            <span style={S.doorLabel}>CIS</span>
            <span style={S.rowBody}>What contractors have taken off your pay, and where the refund stands.</span>
          </a>
        </div>
      </details>

      {/* The standing line of the whole product, said once, at the bottom, where it settles the
          question every tax screen raises. Never a filing claim: we prepare, he approves. */}
      <p style={S.foot}>
        Lekhio prepares these figures from what you have confirmed. Nothing is ever sent to HMRC
        unless you have approved it first.
      </p>
    </main>
  );
}

// The column, the card, the tile and the desk composition come whole from APP_CSS in
// lib/tokens.ts. Declared here is only what this screen alone owns: the position card, and the
// Tools drawer.
const CSS = [
  A11Y_CSS,
  APP_CSS,
  `.lek-position{background:${RIVER_TINT};border-color:${LINE};border-color:${edge(RIVER, 20)}}`,
  `.lek-eyebrow{font-size:${TYPE.label}px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;color:${RIVER_DEEP};margin:0 0 ${SPACE.xs}px}`,
  // The one number he came for. Tabular figures, exactly as the Overview draws its own.
  `.lek-hero{font-size:${TYPE.hero}px;line-height:1.02;font-weight:800;letter-spacing:-0.035em;color:${RIVER_DEEP};font-variant-numeric:tabular-nums}`,
  `.lek-heronote{font-size:${TYPE.note}px;line-height:1.55;color:${INK};margin:${SPACE.sm}px 0 0;max-width:56ch}`,
  `.lek-tools{margin-bottom:${SPACE.sm}px}`,
  `.lek-tools-summary{cursor:pointer;list-style:none;font-size:${TYPE.body}px;font-weight:800;color:${MUTED};padding:${SPACE.sm}px ${SPACE.md}px;background:${PANEL};border:1px solid ${LINE};border-radius:${RADIUS.lg}px}`,
  `.lek-tools-summary::-webkit-details-marker{display:none}`,
  `.lek-tools-summary::after{content:'';display:inline-block;width:7px;height:7px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(45deg) translateY(-3px);margin-left:10px;opacity:.65}`,
  `.lek-tools[open] .lek-tools-summary{border-radius:${RADIUS.lg}px ${RADIUS.lg}px 0 0;border-bottom:none}`,
  `.lek-tools[open]>div{background:${PANEL};border:1px solid ${LINE};border-top:none;border-radius:0 0 ${RADIUS.lg}px ${RADIUS.lg}px;padding:${SPACE.sm}px}`,
  `@media(min-width:${BREAK.desk}px){
    .lek-position{padding:${SPACE.xxl}px}
    .lek-hero{font-size:${TYPE.display}px}
    .lek-heronote{font-size:${TYPE.body}px}
  }`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  heroBasis: { fontSize: TYPE.note, lineHeight: 1.55, color: RIVER_DEEP, margin: '8px 0 0' },
  // The Scotland line, the same shape it has on the Overview. A note about our working, so it is a
  // step quieter than the lines above it, which are statements about his money.
  heroCaveat: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '8px 0 0', maxWidth: '62ch' },

  body: { fontSize: TYPE.body, lineHeight: 1.6, color: INK, margin: 0, maxWidth: '62ch' },
  empty: { fontSize: TYPE.strong, fontWeight: 700, margin: 0 },
  quiet: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '10px 0 0' },

  mtdRow: { display: 'block', textDecoration: 'none', background: PANEL, border: `1px solid ${LINE}`, borderLeft: `3px solid ${RIVER}`, borderRadius: RADIUS.lg, padding: '15px 16px', marginBottom: 14 },
  mtdTop: { display: 'block', fontSize: TYPE.body, fontWeight: 800, color: INK, marginBottom: 4 },

  doors: { display: 'grid', gridTemplateColumns: '1fr', gap: SPACE.xs },
  door: { display: 'block', textDecoration: 'none', background: SURFACE, borderRadius: RADIUS.md, padding: '12px 14px' },
  doorLabel: { display: 'block', fontSize: TYPE.body, fontWeight: 800, color: RIVER_DEEP, marginBottom: 3 },
  rowBody: { display: 'block', fontSize: TYPE.note, lineHeight: 1.5, color: MUTED },

  foot: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, textAlign: 'center', margin: '18px 4px 0' },
};

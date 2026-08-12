import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../../lib/webauth';
import { SESSION_COOKIE } from '../../../../lib/websession';
import {
  cisRecordedForYear, getOptimiserInput, incomeRowsWithoutCis, readCircumstances,
} from '../../../../lib/supabase';
import { worksUnderCis } from '../../../../lib/circumstances';
import { cisProposal, CIS_RATES } from '../../../../lib/reviewpile';
import { quarterForDate } from '../../../../lib/quarterpack';
import { currentTaxYear, resolveProofYear } from '../../../../lib/proofyear';
import { ledgerFor } from '../../../../lib/ledger';
import { findOptimisations } from '../../../../lib/taxoptimiser';
import { FACTS, asPercent } from '../../../../lib/taxengine';
import { gbp0 } from '../../lib/money';
import { A11Y_CSS, APP_CSS, BREAK, FONT, SPACE, TYPE } from '../../../../lib/tokens';
import {
  INK, LINE, MUTED, PAPER, RIVER, RIVER_DEEP, RIVER_TINT, SURFACE, edge,
} from '../../../../lib/apptheme';
import { AppNav } from '../../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// CIS. A tools screen, reached from the Tax hub's Tools row under doc 103's once test.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ THE FIGURE HERE IS THE LEDGER'S refundDue, THE EXACT NUMBER THE OVERVIEW SHOWS, from the
// same ledgerFor() on the same getOptimiserInput(). Not a copy of the arithmetic, the same call.
// This product has already once quoted a man a CIS refund that did not exist, because two readers
// sat over one number. This screen is a second WINDOW, never a second reader.
//
// ⚠️ AND THE REFUND POSITION IS THE OPTIMISER'S OWN SENTENCE. Whether a refund is building, and
// how big, nets the student loan off and lives in lib/taxoptimiser.ts's cis_refund item. When the
// engine does not offer that item, this page says the position in words without a number, because
// a number the engine refused to stand behind is not one a page gets to invent.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export default async function CisPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const done = one(sp.done);
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  // Carries him back here after he signs in, the /app/you/billing pattern: safeNext() in
  // lib/websession.ts allowlists /app and below, so this cannot become an open redirect.
  if (!user) redirect('/in?next=%2Fapp%2Ftax%2Fcis');

  const optimiser = await getOptimiserInput(user.id);
  const l = ledgerFor(optimiser);
  const refundBuilding = findOptimisations(optimiser).find((o) => o.key === 'cis_refund') ?? null;

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // THE PAYMENTS NOBODY WILL EVER ASK HIM ABOUT AGAIN. See app/api/cis/route.ts for the argument.
  //
  // Only for a man who has said he works under CIS, and only over money he has already confirmed
  // that carries no deduction. For everybody else both reads are skipped and the section does not
  // exist, which is doc 103's empty test: a permanent row saying "nothing to record" is a row he
  // learns to skip, and then he misses the month it matters.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  const underCis = worksUnderCis(await readCircumstances(user.id).catch(() => null));

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 🔴 WHICH YEAR, AND WHY THIS SCREEN OF ALL SCREENS NEEDS THE CHOICE.
  //
  // Found 11 August 2026 by grossing up a real account and watching the RIGHT number appear while
  // the BIGGEST one stayed hidden. The capture shipped covering the current tax year only. Danny's
  // 2026/27 turnover went from £14,020 to £16,820 and his Overview went from "put by £3,337" to a
  // repayment, all correct. And his actual refund, about £4,400, is in 2025/26: the year he still
  // has to file, the one the January bill is for, and the one nothing on this screen could reach.
  //
  // ⚠️ FOR A SUBCONTRACTOR THE PRIOR YEAR IS THE POINT. The current year is a running estimate that
  // settles in eighteen months. The year just gone is a return due this January with real money
  // sitting behind it, and CIS is the reason there is money to come back at all. A screen about
  // deductions that can only see the year that has not finished is looking the wrong way.
  //
  // resolveProofYear is the same clamp /app/proof-of-income uses, so the two year choosers cannot
  // disagree about which years exist, and neither can be walked past its bounds with a query string.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  const now = new Date();
  const thisYear = currentTaxYear(now);
  const year = resolveProofYear(one(sp.y), now);
  const { startYear: liveYear } = quarterForDate(now);
  const missing = underCis
    ? await incomeRowsWithoutCis(user.id, `${year}-04-06`, `${year + 1}-04-05`).catch(() => [])
    : [];

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE HERO BELONGS TO THE YEAR ON SCREEN. Found 12 August by pressing the chooser that
  // shipped the day before. l.refundDue is the live year and only ever the live year, under a
  // heading that said "this year" whichever chip was lit, so 2025/26 drew a 2026/27 figure over
  // a list of 2025/26 payments. He answers one, lands back on the same year, and the number does
  // not move. The whole point of carrying y through the form was that it would.
  //
  // ⚠️ THE LIVE YEAR STILL COMES FROM THE LEDGER, UNTOUCHED, because the warning at the top of
  // this file is about exactly that number and it has not stopped being true. The prior year is a
  // window the ledger does not model at all, so reading it here is not a second opinion, it is
  // the only one.
  const priorYear = year !== liveYear;
  const shownCis = priorYear
    ? await cisRecordedForYear(user.id, `${year}-04-06`, `${year + 1}-04-05`).catch(() => 0)
    : l.refundDue;
  const yearLabel = `${year} to ${String((year + 1) % 100).padStart(2, '0')}`;

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/tax" />

      {shownCis > 0 ? (
        <>
          <section className="lek-card lek-cis">
            <h1 className="lek-eyebrow">
              CIS taken off your pay {priorYear ? `in ${yearLabel}` : 'this year'}
            </h1>
            <div className="lek-hero">{gbp0(shownCis)}</div>
            <p className="lek-heronote">
              That is your money, already handed to HMRC by your contractors. It is credited
              against your bill when your return is filed, and whatever is left over comes back to
              you. Keep every deduction statement.
            </p>
          </section>

          {/* ⚠️ THE REFUND POSITION IS A LIVE YEAR SENTENCE AND IT DOES NOT TRAVEL. The optimiser
              models the year in progress: its cis_refund item nets off a student loan on running
              totals that stop at today. Printing it over a finished year would be answering a
              question about January's return with an estimate of next January's. For a year that
              has ended the honest thing is the date the bill lands and nothing more, which the
              chooser below already says. */}
          {priorYear ? null : (
            <section className="lek-card">
              <h2 className="lek-h2">Where the refund stands</h2>
              {refundBuilding ? (
                // The engine's own sentence, with his figures in it and the student loan netted off.
                <p style={S.body}>{refundBuilding.detail}</p>
              ) : (
                <p style={S.body}>
                  So far the year&apos;s bill is bigger than what has been deducted, so the
                  deductions are paying your bill down rather than building a refund. If that flips
                  as the year goes on, the refund appears here with the figure.
                </p>
              )}
            </section>
          )}
        </>
      ) : (
        <section className="lek-card">
          <h1 className="lek-h2">CIS</h1>
          <p style={S.body}>
            No CIS deductions on your books {priorYear ? `for ${yearLabel}` : 'this year'}.
          </p>
          <p style={S.quiet}>
            When a contractor deducts CIS from a payment you confirm, it is counted here on its
            own, credited against your tax, and never mixed into what Lekhio saved you.
          </p>
        </section>
      )}

      {/* ── WHAT WAS TAKEN OFF THE PAYMENTS ALREADY IN HIS BOOKS ──────────────────────────
          The section that makes the figure above true for a man whose year came in off a bank
          statement. Every row is one payment and one box, because every deduction comes off its
          own statement. There is deliberately no "apply 20 percent to all of these": that would be
          us guessing at his materials, and materials are the one thing the rate is never charged
          on. The arithmetic is printed beside the box and never into it. */}
      {/* ⚠️ THE CHIPS ARE DRAWN FOR A CIS CUSTOMER WHATEVER THE LIST HOLDS, because "nothing left
          to record in 2026 to 27" is only readable if he can see which year he is looking at, and
          because the year he needs is usually the one he is NOT on. Two years, the same pair
          /app/proof-of-income offers, for the same reason: further back is a document question. */}
      {underCis ? (
        <section className="lek-card">
          <h2 className="lek-h2">Which year</h2>
          <div style={S.years}>
            {[thisYear, thisYear - 1].map((y) => (y === year ? (
              <span key={y} style={S.yearOn}>
                {y === liveYear ? 'This tax year' : `${y} to ${String((y + 1) % 100).padStart(2, '0')}`}
              </span>
            ) : (
              <a key={y} href={`/app/tax/cis?y=${y}`} style={S.year} className="lek-hit">
                {y === liveYear ? 'This tax year' : `${y} to ${String((y + 1) % 100).padStart(2, '0')}`}
              </a>
            )))}
          </div>
          {year !== liveYear ? (
            <p style={S.quiet}>
              This is the year your next Self Assessment return is for, due by 31 January{' '}
              {year + 2}. If your contractors took CIS off you during it, that money is already with
              HMRC and it comes off that bill. For most subcontractors it is where the refund is.
            </p>
          ) : null}
        </section>
      ) : null}

      {missing.length > 0 ? (
        <section className="lek-card">
          <h2 className="lek-h2">Was CIS taken off these?</h2>
          <p style={S.body}>
            These payments are in your books at the figure that reached your bank. If a contractor
            took CIS off before paying you, that money is tax you have already paid and it is not in
            the total above yet. Put in what the statement says was deducted and we will add it back
            to your turnover where it belongs.
          </p>
          <p style={S.quiet}>
            {CIS_RATES} Leave one blank if nothing was taken off it, or if the statement has not
            come yet. Nothing changes until you press Save on that row.
          </p>
          {done === 'saved' ? <p style={S.good}>Saved. Your figures above have moved.</p> : null}
          {done === 'bad' ? <p style={S.warn}>That figure did not look right, so nothing was changed. It cannot be more than {asPercent(FACTS.cisUnregisteredRate)}% of the payment.</p> : null}
          {done === 'gone' ? <p style={S.warn}>That payment has changed since this page loaded, so nothing was written. Reload and try again.</p> : null}
          <div style={S.rows}>
            {missing.map((r) => {
              const p = cisProposal(r.amount);
              return (
                <form key={r.id} method="post" action="/api/cis" style={S.row}>
                  <input type="hidden" name="id" value={r.id} />
                  {/* The window the row was READ from, so the route looks in the same year rather
                      than assuming the live one and refusing every prior year answer as not found. */}
                  <input type="hidden" name="y" value={year} />
                  <div style={S.rowHead}>
                    <span style={S.rowWho}>{r.vendor ?? 'A payment in'}</span>
                    <span style={S.rowSum}>{gbp0(r.amount)} banked on {r.transaction_date}</span>
                  </div>
                  {/* His own figure, printed, never prefilled. A prefilled 20 percent is a guess
                      agreed on a press he did not read, and on Danny's real year it was 17.3
                      percent because £3,400 of it was materials. */}
                  {p ? (
                    <span style={S.rowHint}>
                      If the whole job was labour, {asPercent(FACTS.cisRegisteredRate)}% would make
                      this {gbp0(p.deduction)} taken off a {gbp0(p.gross)} job. {p.assumes}
                    </span>
                  ) : null}
                  <div style={S.rowAct}>
                    <label htmlFor={`cis-${r.id}`} style={S.srOnly}>CIS taken off this payment</label>
                    <input
                      id={`cis-${r.id}`}
                      name="cis"
                      className="lek-field"
                      inputMode="decimal"
                      placeholder="0.00"
                      style={S.rowField}
                    />
                    <button type="submit" style={S.rowBtn} className="lek-hit">Save</button>
                  </div>
                </form>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* The scheme itself, in one card, every rate named from the engine. */}
      <section className="lek-card">
        <h2 className="lek-h2">How the scheme works</h2>
        <p style={S.quiet}>
          A contractor deducts {asPercent(FACTS.cisRegisteredRate)}% from the labour part of your
          pay when you are registered for CIS, and {asPercent(FACTS.cisUnregisteredRate)}% when you
          are not. Materials are never deducted from. Gross status means nothing is taken at all.
          The deductions are tax paid in advance, which is why subcontractors are so often owed a
          refund at filing time.
        </p>
      </section>
    </main>
  );
}

// The column and the card come whole from APP_CSS. This screen owns the one hero, drawn in the
// same shape as the Overview's tax card so the same number reads as the same number.
const CSS = [
  A11Y_CSS,
  APP_CSS,
  `.lek-cis{background:${RIVER_TINT};border-color:${LINE};border-color:${edge(RIVER, 20)}}`,
  `.lek-eyebrow{font-size:${TYPE.label}px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;color:${RIVER_DEEP};margin:0 0 ${SPACE.xs}px}`,
  `.lek-hero{font-size:${TYPE.hero}px;line-height:1.02;font-weight:800;letter-spacing:-0.035em;color:${RIVER_DEEP};font-variant-numeric:tabular-nums}`,
  `.lek-heronote{font-size:${TYPE.note}px;line-height:1.55;color:${INK};margin:${SPACE.sm}px 0 0;max-width:56ch}`,
  `@media(min-width:${BREAK.desk}px){.lek-hero{font-size:${TYPE.title}px}}`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  body: { fontSize: TYPE.body, lineHeight: 1.6, color: INK, margin: 0, maxWidth: '62ch' },
  quiet: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: `${SPACE.sm}px 0 0`, maxWidth: '62ch' },
  good: { fontSize: TYPE.note, lineHeight: 1.55, color: RIVER_DEEP, fontWeight: 700, margin: `${SPACE.sm}px 0 0` },
  warn: { fontSize: TYPE.note, lineHeight: 1.55, color: INK, fontWeight: 700, margin: `${SPACE.sm}px 0 0` },

  years: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: SPACE.sm },
  year: { display: 'inline-block', textDecoration: 'none', background: SURFACE, color: RIVER_DEEP, borderRadius: 999, padding: '8px 14px', fontSize: TYPE.note, fontWeight: 700 },
  yearOn: { display: 'inline-block', background: RIVER_DEEP, color: PAPER, borderRadius: 999, padding: '8px 14px', fontSize: TYPE.note, fontWeight: 800 },

  rows: { display: 'grid', gap: SPACE.sm, marginTop: SPACE.md },
  row: { display: 'block', background: RIVER_TINT, borderRadius: 12, padding: '12px 14px', border: `1px solid ${edge(RIVER, 20)}` },
  rowHead: { display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'baseline' },
  rowWho: { fontSize: TYPE.body, fontWeight: 800, color: RIVER_DEEP },
  rowSum: { fontSize: TYPE.note, color: MUTED, fontVariantNumeric: 'tabular-nums' },
  rowHint: { display: 'block', fontSize: TYPE.note, lineHeight: 1.5, color: MUTED, margin: '6px 0 0' },
  rowAct: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 },
  // 🔴 SIZED HERE, NOT LEFT TO THE SHARED CLASS. Anything under 16px makes iOS Safari zoom the
  // whole page the moment he taps it, and test/phonewidth.test.mjs caught this one on the way in.
  // 16 as a literal, not TYPE.body, which is 15: the reading scale and the no zoom floor are two
  // different jobs and this is the one place they disagree.
  rowField: { flex: '0 1 140px', minWidth: 0, fontSize: 16 },
  rowBtn: { flex: '0 0 auto', background: RIVER_DEEP, color: PAPER, border: 0, borderRadius: 10, padding: '10px 16px', fontSize: TYPE.note, fontWeight: 800, cursor: 'pointer' },
  srOnly: { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 },
};

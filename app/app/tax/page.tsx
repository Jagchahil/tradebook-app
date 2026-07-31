import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../lib/webauth';
import { SESSION_COOKIE } from '../../../lib/websession';
import { getOptimiserInput, getConfirmedTransactionsForRange } from '../../../lib/supabase';
import { taxPosition, setAsideBasisLine } from '../../../lib/taxoptimiser';
import { paymentsOnAccount, FACTS } from '../../../lib/taxengine';
import { buildQuarterPack, quarterBounds, quarterForDate } from '../../../lib/quarterpack';
import { gbp0 } from '../../../lib/money';
import {
  A11Y_CSS, APP_CSS, BREAK, FONT, INK, LINE, MUTED, PANEL, PAPER, RADIUS, RIVER, RIVER_DEEP,
  RIVER_TINT, SPACE, SURFACE, TYPE,
} from '../../../lib/tokens';
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
  if (!user) redirect('/in');

  const now = new Date();
  const { startYear, index } = quarterForDate(now);
  const taxYearStart = quarterBounds(startYear, 1).start;
  const quarterEnd = quarterBounds(startYear, index).end;

  const [optimiser, txns] = await Promise.all([
    getOptimiserInput(user.id),
    // The same window /api/quarter-pack reads, so the MTD line below is the pack's own answer.
    getConfirmedTransactionsForRange(user.id, taxYearStart, quarterEnd).catch(() => []),
  ]);

  const tax = taxPosition(optimiser);
  const basis = setAsideBasisLine(optimiser, tax);

  // The MTD test, asked of the quarter pack rather than re-derived. The threshold, the gross
  // qualifying income and the by-year rule all live in lib/quarterpack.ts and lib/taxengine.ts.
  const pack = buildQuarterPack({
    transactions: txns, startYear, quarter: index, truncated: txns.length >= 20000,
  });
  const mtd = pack.ytd.mtdApplies;

  // ⚠️ THE EMPTY TEST. A proud £0 for a brand new account teaches him this screen says nothing.
  // The tax card is drawn once there is money behind it, and the empty state names the one thing
  // that fills it in, exactly as the Overview does.
  const moneyIn = Math.max(0, optimiser.ytdTradeIncome) + Math.max(0, optimiser.ytdPropertyIncome ?? 0);
  const showPosition = moneyIn > 0 || tax.setAside > 0;

  // What January asks for, from the engine. Payments on account run on the Self Assessment tax
  // WITHOUT the student loan, because HMRC's payments on account never include loan repayments,
  // and the year label is startYear + 1 so the engine prints the correct January.
  const poa = paymentsOnAccount(tax.selfAssessmentTax, startYear + 1);

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
            {' '}Self Assessment collects it in one bill, due by {poa.firstDue}.
          </p>
          {/* What is inside the number, written by lib/taxoptimiser.ts so the claim about a man's
              tax stays in one place. Null for a pure sole trader, for whom it would add no fact. */}
          {basis ? <p style={S.heroBasis}>{basis}</p> : null}
        </section>
      ) : (
        <section className="lek-card">
          <h1 className="lek-eyebrow">Where you stand</h1>
          <p style={S.empty}>Nothing to work out yet.</p>
          <p style={S.quiet}>
            Connect your bank and your tax position builds itself from what you confirm. Every
            screen under Tax fills in from the same figures.
          </p>
        </section>
      )}

      {/* ── WHAT JANUARY ACTUALLY ASKS FOR. The part that catches people. ──────────────────────
          Drawn only when payments on account really apply, doc 103's empty test: a permanent row
          saying "no payments on account" is a row he learns to skip, and then the year he crosses
          the line he misses it. */}
      {showPosition && poa.required ? (
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

      {/* ── HIS MTD POSITION, ONLY IF MANDATED. The empty test again: a man under the threshold
          gets nothing here, and the whole picture waits behind the summary door below. ───────── */}
      {mtd ? (
        <a href="/app/tax/summary" style={S.mtdRow} className="lek-hit">
          <span style={S.mtdTop}>Making Tax Digital applies to you</span>
          <span style={S.rowBody}>
            Your income this year, {gbp0(pack.ytd.grossQualifyingIncome)} before costs, is over the{' '}
            {gbp0(pack.ytd.mtdThreshold)} line for {pack.taxYear}, so quarterly updates apply. Your
            figures are already kept the way an update wants them. See where the quarter stands.
          </span>
        </a>
      ) : null}

      {/* ── THE DOORS DOWN. Each answers one question well. This page does not repeat them. ──── */}
      <section className="lek-card">
        <h2 className="lek-h2">Go deeper</h2>
        <div style={S.doors}>
          <a href="/app/tax/summary" style={S.door} className="lek-hit">
            <span style={S.doorLabel}>Quarterly summary</span>
            <span style={S.rowBody}>What an update would report today, and when the next one is due.</span>
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
  `.lek-position{background:${RIVER_TINT};border-color:${RIVER}33}`,
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

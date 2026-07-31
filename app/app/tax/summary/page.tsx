import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../../lib/webauth';
import { SESSION_COOKIE } from '../../../../lib/websession';
import { getConfirmedTransactionsForRange } from '../../../../lib/supabase';
import { buildQuarterPack, quarterBounds, quarterForDate } from '../../../../lib/quarterpack';
import { bankFeedOffered } from '../../../../lib/bankfeed';
import { gbp0 } from '../../lib/money';
import { updateDue, UPDATE_ORDINAL } from '../due';
import { A11Y_CSS, APP_CSS, FONT, RADIUS, SPACE, TYPE } from '../../../../lib/tokens';
import {
  GREEN, INK, LINE, MUTED, ON_GREEN_TINT, PAPER, RIVER, SAFFRON_DEEP, SAFFRON_TINT, SURFACE, edge,
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

export default async function TaxSummaryPage() {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  if (!user) redirect('/in');

  const now = new Date();
  const { startYear, index } = quarterForDate(now);
  const taxYearStart = quarterBounds(startYear, 1).start;
  const bounds = quarterBounds(startYear, index);

  const txns = await getConfirmedTransactionsForRange(user.id, taxYearStart, bounds.end).catch(() => []);
  const pack = buildQuarterPack({
    transactions: txns, startYear, quarter: index, truncated: txns.length >= 20000,
  });

  const sub = pack.submission;
  const due = updateDue(startYear, index);
  const ordinal = UPDATE_ORDINAL[index];
  const hasFigures = sub.txCount > 0;

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

      {/* ── WHAT AN UPDATE WOULD REPORT TODAY. The cumulative window, said out loud. ─────────── */}
      <section className="lek-card">
        <h1 className="lek-h2">What a quarterly update would report today</h1>
        <p style={S.window}>
          Tax year {pack.taxYear}, 6 April to today. An update always restates the whole year so
          far and replaces the one before it, never just the latest three months.
        </p>

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
              Your trade, from {sub.txCount === 1 ? 'the one entry' : `${sub.txCount} entries`} you
              have confirmed since 6 April. Anything still waiting on you is not in these figures.
            </p>

            {/* Property is its own stream on a real update, so it is its own block here, and only
                for a man who has one. A permanent empty property row fails doc 103's empty test. */}
            {pack.hasProperty ? (
              <div style={S.propBlock}>
                <h2 className="lek-h2">Property, reported separately</h2>
                <p style={S.quiet}>
                  {gbp0(sub.property.income)} of rent in, {gbp0(sub.property.expenses)} out, so{' '}
                  {gbp0(sub.property.net)} of property profit so far. An update carries property as
                  its own stream, never mixed into the trade.
                </p>
              </div>
            ) : null}

            {sub.cisSuffered > 0 ? (
              <p style={S.refund}>
                <b>{gbp0(sub.cisSuffered)}</b> of CIS has been deducted from your pay since 6 April.
                That is tax already handed over on your behalf, and it is counted when the year is
                settled.
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

      {/* ── THE CALENDAR. Which update this is and when it is due. ───────────────────────────── */}
      <section className="lek-card">
        <h2 className="lek-h2">The {ordinal} update of {pack.taxYear}</h2>
        <p style={S.body}>
          It covers 6 April to {prettyEnd(bounds.end)} and is due by <b>{due}</b>. Your figures are
          already kept in the shape an update reports, so the deadline is a date, not a job.
        </p>
      </section>

      {/* ── THE QUARTER ON ITS OWN. Context, smaller, under the figures that matter. ─────────── */}
      {hasFigures ? (
        <section className="lek-card">
          <h2 className="lek-h2">These three months on their own</h2>
          <p style={S.quiet}>
            {pack.period.label}: {gbp0(pack.trade.income)} in, {gbp0(pack.trade.expenses)} out,{' '}
            {gbp0(pack.trade.net)} of trade profit. Useful for seeing what the quarter itself did.
            It is not what an update reports.
          </p>
        </section>
      ) : null}

      {/* ── THE HONEST LINE ABOUT FILING. We prepare. He approves. The switch waits on HMRC. ── */}
      <p style={S.foot}>
        Nothing on this page has been sent anywhere. Lekhio cannot send an update to HMRC yet: the
        filing pipeline is built and the switch waits on HMRC granting production access. When it
        arrives, you will see the figures first and approve them before anything goes.
      </p>
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

  window: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: `0 0 ${SPACE.md}px`, maxWidth: '62ch' },
  body: { fontSize: TYPE.body, lineHeight: 1.6, color: INK, margin: 0, maxWidth: '62ch' },
  quiet: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '10px 0 0' },
  empty: { fontSize: TYPE.strong, fontWeight: 700, margin: 0 },

  propBlock: { borderTop: `1px solid ${LINE}`, marginTop: SPACE.md, paddingTop: SPACE.md },
  refund: { fontSize: TYPE.body, lineHeight: 1.55, color: INK, background: SURFACE, borderRadius: RADIUS.md, padding: 14, margin: '14px 0 0' },

  foot: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, textAlign: 'center', margin: '18px 4px 0' },
};

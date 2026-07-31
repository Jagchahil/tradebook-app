import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../../lib/webauth';
import { SESSION_COOKIE } from '../../../../lib/websession';
import { getOptimiserInput } from '../../../../lib/supabase';
import { niPosition, NI_FACTS } from '../../../../lib/nistudentloan';
import { FACTS, asPercent } from '../../../../lib/taxengine';
import { gbp0, gbp2 } from '../../lib/money';
import { A11Y_CSS, APP_CSS, FONT, RADIUS, SPACE, TYPE } from '../../../../lib/tokens';
import { GREEN_TINT, INK, MUTED, ON_GREEN_TINT, PAPER } from '../../../../lib/apptheme';
import { AppNav } from '../../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// NATIONAL INSURANCE. A tools screen, checked a few times a year, reached from the Tax hub's
// Tools row under doc 103's once test.
//
// ⚠️ EVERY FIGURE COMES FROM lib/nistudentloan.ts's niPosition(), the same engine the public NI
// checker runs, and every threshold printed is FACTS or NI_FACTS by name. Not one rate is typed
// here: test/onlyoneengine.test.mjs fails the build if a page ever carries the law itself.
//
// ⚠️ THE WINDOW IS SAID ON EVERY NUMBER. Class 4 here is on his profit SO FAR this year, because
// this screen is a breakdown he checks occasionally, not the projection the Overview's set aside
// already carries. Two screens showing different numbers with the same label is the drift this
// codebase keeps paying for, so the label does the work: "so far", never "for the year".

export default async function NiPage() {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  if (!user) redirect('/in');

  const optimiser = await getOptimiserInput(user.id);
  const profit = Math.max(0, optimiser.ytdTradeIncome - optimiser.ytdTradeExpenses);
  const salary = Math.max(0, optimiser.employmentIncome);
  const ni = niPosition(salary, profit);

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/tax" />

      <section className="lek-card">
        <h1 className="lek-h2">National Insurance</h1>
        <p style={S.body}>
          Two classes matter to the self employed: Class 4, which is charged on profit and
          collected with your tax bill, and Class 2, which has been voluntary since April 2024 and
          only matters for your State Pension record.
        </p>
      </section>

      {/* ── CLASS 4. The one that costs money. ───────────────────────────────────────────────── */}
      <section className="lek-card">
        <div style={S.figRow}>
          <div>
            <div className="lek-tile-label">Class 4 so far this year</div>
            <div className="lek-big">{gbp0(ni.class4)}</div>
          </div>
        </div>
        <p style={S.quiet}>
          On your confirmed profit of {gbp0(profit)}. Nothing below {gbp0(FACTS.class4LowerLimit)},
          then {asPercent(FACTS.class4MainRate)}% up to {gbp0(FACTS.class4UpperLimit)}, then{' '}
          {asPercent(FACTS.class4UpperRate)}% above that. It is collected through Self Assessment
          with your tax, never as a separate bill, and it is already inside the set aside figure on
          your Overview.
        </p>
      </section>

      {/* ── CLASS 2. The £3.65 a week decision, and only when it is genuinely his to make. ───── */}
      <section className="lek-card">
        <h2 className="lek-h2">Class 2 and your State Pension</h2>
        {ni.qualifiesViaProfits ? (
          <p style={S.good}>
            Your profits are over {gbp0(FACTS.class2SmallProfitsThreshold)}, so this year counts
            towards your State Pension without you paying a penny of Class 2. Nothing to do.
          </p>
        ) : ni.qualifiesViaEmployment ? (
          <p style={S.good}>
            Your wages are over {gbp0(NI_FACTS.class1LowerEarningsLimit)}, so this year counts
            towards your State Pension through your job. Nothing to do.
          </p>
        ) : ni.voluntaryClass2Suggested ? (
          <p style={S.body}>
            This year is not on course to count towards your State Pension: profits under{' '}
            {gbp0(FACTS.class2SmallProfitsThreshold)} and no wages doing it for you. You can pay
            Class 2 voluntarily, {gbp2(ni.class2Voluntary.weeklyRate)} a week, about{' '}
            {gbp0(ni.class2Voluntary.annual)} a year, to keep the record whole. Your decision, and
            worth a look before the year is settled.
          </p>
        ) : (
          <p style={S.quiet}>
            Nothing to weigh up yet. Once there is money in the year, this tells you whether the
            year counts towards your State Pension and what Class 2 could do about it.
          </p>
        )}
      </section>

      {/* ── EMPLOYED TOO. Only drawn for a man with wages, doc 103's empty test. ─────────────── */}
      {salary > 0 ? (
        <section className="lek-card">
          <h2 className="lek-h2">Your job&apos;s National Insurance</h2>
          <p style={S.quiet}>
            About {gbp0(ni.class1)} of Class 1 comes off a {gbp0(salary)} salary across the year,
            taken by your employer on the payslip. Nothing for you to do with it here.
          </p>
          {ni.annualMaximaMayApply ? (
            <p style={S.quiet}>
              Paying both Class 1 and Class 4 at your level can go over HMRC&apos;s annual maximum,
              and the excess is refundable. Working the exact figure needs your full contribution
              record, which we do not hold, so we flag it rather than guess it. Worth raising when
              your return is prepared.
            </p>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

// The column and the card come whole from APP_CSS. This screen owns only the figure row.
const CSS = [
  A11Y_CSS,
  APP_CSS,
  `.lek-big{font-size:${TYPE.stat}px;font-weight:800;letter-spacing:-0.02em;font-variant-numeric:tabular-nums}`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  body: { fontSize: TYPE.body, lineHeight: 1.6, color: INK, margin: 0, maxWidth: '62ch' },
  quiet: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '10px 0 0', maxWidth: '62ch' },
  good: { fontSize: TYPE.body, lineHeight: 1.6, color: ON_GREEN_TINT, background: GREEN_TINT, borderRadius: RADIUS.md, padding: '12px 14px', margin: 0 },

  figRow: { display: 'flex', gap: SPACE.lg, flexWrap: 'wrap' },
};
